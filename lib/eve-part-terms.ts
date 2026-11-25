/**
 * Eve が作った部品: 規約と登録の要件を確かめる（能力 research.terms）。task 130、2026-11-24。
 *
 * 470 通りの設計図すべてが、登録の前にこの工程を持つ（2026-11-24 に research.market から分けた）。
 * 1. 提供元の規約の文（本文の文字、または https の URL から読んだ文）を受け取る。
 * 2. LLM に、登録の条件・禁止事項・報酬や支払いの条件を、それぞれ「規約の文をそのまま写した引用」付きで 1 回だけ出してもらう（呼び直さない）。
 * 3. 引用が規約の文に文字どおり入っている項目だけを残す（LLM の要約や思いつきは出さない）。3 項目に足りなければ失敗を返す。
 * 法律の判断はしない。読めた事だけを、引用付きで並べる。登録・申込はしない（本人の工程）。
 */

import { eveCleanLlmText, type EveLlm } from './eve-part-llm.ts';
import { eveHtmlText } from './eve-part-adcheck.ts';

export const EVE_PART_TERMS_REF = 'eve-part:terms-reader';
const UA = 'NoahBot/1 (eve-part; +https://avoado.si/noah/help#bot)';
const MAX_TERMS = 60_000;
/** 1 回に読ませる大きさ（文字）。手元のモデルの文脈（4,096 トークン）に、指示と返事と一緒に収まる大きさ。 */
const CHUNK = 2_000;
/** 長い規約から選ぶ行の語（登録・禁止・支払いに関わる行）。 */
const PICK = /(登録|会員|資格|審査|媒体|サイト|禁止|してはならない|行ってはならない|停止|解除|取消|報酬|支払|振込|最低|繰越|手数料|成果)/u;
/** かたまりの数の上限（時間の上限。1 かたまりで 1〜2 分）。 */
const MAX_CHUNKS = 4;

/**
 * 長い規約を、決まった語のある行だけにして、CHUNK 文字までのかたまりに分ける。
 * 読める量（CHUNK × MAX_CHUNKS）を越える時は、決まった語の多い行から選ぶ（同じ数なら前の行）。選んだ行は、元の順に並べ直す。
 * 2026-11-25 の本番の回で、A8.net の規約の前の方（全員に共通の規約・代理店の解除）だけで読める量が尽きたため。
 */
export function eveTermsChunks(text: string): string[] {
  const all = text.split(/\n+/u).map((l) => l.trim()).filter((l) => l.length >= 12 && PICK.test(l)).map((l, i) => ({ l: l.length > CHUNK ? l.slice(0, CHUNK) : l, i, score: l.match(new RegExp(PICK.source, 'gu'))?.length ?? 0 }));
  const budget = CHUNK * MAX_CHUNKS;
  let used = 0;
  const picked = new Set<number>();
  for (const x of [...all].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (used + x.l.length + 1 > budget) continue;
    picked.add(x.i);
    used += x.l.length + 1;
  }
  const lines = all.filter((x) => picked.has(x.i)).map((x) => x.l);
  const chunks: string[] = [];
  let cur = '';
  for (const piece of lines) {
    if (cur && cur.length + piece.length + 1 > CHUNK) {
      chunks.push(cur);
      if (chunks.length >= MAX_CHUNKS) return chunks;
      cur = '';
    }
    cur = cur ? `${cur}\n${piece}` : piece;
  }
  if (cur && chunks.length < MAX_CHUNKS) chunks.push(cur);
  return chunks;
}

export const EVE_PART_TERMS_SYSTEM = [
  'あなたは、サービスの規約から、登録する人が守る事を抜き出す係です。',
  '規約の文から、登録の条件・禁止されている事・報酬や支払いの条件を、最大 10 個、JSON の配列だけで返します。',
  '1 つの項目は {"kind":"登録の条件" か "禁止" か "支払い","item":"短い言い換え","quote":"規約の文をそのまま写した部分（20〜80 文字）"} です。',
  'quote は、規約の文の中の言葉を、1 文字も変えずに写します。規約に書いていない事は書きません。',
].join('\n');

export type EveTermsItem = { kind: '登録の条件' | '禁止' | '支払い'; item: string; quote: string };
export type EveTerms = { account: string | null; requirements: EveTermsItem[]; source: string; dropped: number; model: string; checkedAt: string };

const KINDS = new Set(['登録の条件', '禁止', '支払い']);
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/gu, '');

/** 規約の文を得る（文字か、https の URL を 1 回だけ読む）。 */
async function termsText(input: { terms?: unknown; url?: unknown; '提供元の規約・登録要件'?: unknown }, fetcher: typeof fetch): Promise<{ text: string; source: string }> {
  // 組み合わせの中では、素材の名前「提供元の規約・登録要件」で届く。
  const terms = input.terms ?? input['提供元の規約・登録要件'];
  if (typeof terms === 'string' && terms.trim()) return { text: terms, source: 'input' };
  if (typeof input.url === 'string') {
    const url = new URL(input.url);
    if (url.protocol !== 'https:') throw new Error('規約の URL は https だけを読みます。');
    const response = await fetcher(url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain' }, signal: AbortSignal.timeout(20_000), redirect: 'follow' });
    if (!response.ok) throw new Error(`規約の頁が ${response.status} を返しました。`);
    const body = await response.text();
    return { text: /<[a-z][\s\S]*>/iu.test(body) ? eveHtmlText(body) : body, source: url.href };
  }
  throw new Error('規約の文（terms）か、https の URL（url）が要ります。');
}

/** モデルの返事から項目を取り出し、引用が規約に入っている物だけを残す。 */
export function eveGroundTerms(reply: string, terms: string): { kept: EveTermsItem[]; dropped: number } {
  const clean = eveCleanLlmText(reply);
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('項目の一覧（JSON の配列）が返っていません。');
  let list: unknown;
  try {
    list = JSON.parse(clean.slice(start, end + 1));
  } catch {
    throw new Error('項目の一覧を JSON として読めません。');
  }
  if (!Array.isArray(list)) throw new Error('項目の一覧が配列ではありません。');
  const haystack = norm(terms);
  const kept: EveTermsItem[] = [];
  let dropped = 0;
  for (const v of list.slice(0, 10)) {
    const o = v as Partial<EveTermsItem> | null;
    const ok = o && typeof o.kind === 'string' && KINDS.has(o.kind) && typeof o.item === 'string' && o.item.trim() && typeof o.quote === 'string' && norm(o.quote).length >= 8 && haystack.includes(norm(o.quote));
    if (!ok) { dropped++; continue; }
    if (kept.some((k) => norm(k.quote) === norm(o.quote!))) { dropped++; continue; }
    kept.push({ kind: o.kind as EveTermsItem['kind'], item: o.item!.trim().slice(0, 120), quote: o.quote!.trim() });
  }
  return { kept, dropped };
}

export async function eveReadTerms(
  input: { account?: unknown; terms?: unknown; url?: unknown; '提供元の規約・登録要件'?: unknown },
  deps: { llm: EveLlm; fetch?: typeof fetch; now?: () => number },
): Promise<EveTerms> {
  const { text, source } = await termsText(input, deps.fetch ?? fetch);
  if (text.length > MAX_TERMS) throw new Error(`規約の文が長すぎます（${MAX_TERMS} 文字まで。章ごとに分けて渡してください）。`);
  const kept: EveTermsItem[] = [];
  let dropped = 0, model = '';
  // 短い規約は 1 回で読む。長い規約は、決まった語のある行だけを選び、手元のモデルに収まる大きさに分けて、かたまりごとに 1 回ずつ読む（2026-11-25）。
  for (const chunk of text.length <= CHUNK ? [text] : eveTermsChunks(text)) {
    const res = await deps.llm({ messages: [{ role: 'system', content: EVE_PART_TERMS_SYSTEM }, { role: 'user', content: `規約の文:\n${chunk}` }], maxTokens: text.length <= CHUNK ? 1_200 : 900, temperature: 0 });
    model = res.model;
    let got: { kept: EveTermsItem[]; dropped: number };
    try {
      got = eveGroundTerms(res.text, text);
    } catch (e) {
      // 1 つのかたまりの返事が読めなくても、他のかたまりは使う（短い規約は 1 回だけなので、そのまま失敗を返す）。
      if (text.length <= CHUNK) throw e;
      dropped++;
      continue;
    }
    dropped += got.dropped;
    for (const item of got.kept) if (kept.length < 10 && !kept.some((k) => norm(k.quote) === norm(item.quote))) kept.push(item);
  }
  if (kept.length < 3) throw new Error(`規約の文で裏付けられた項目が 3 個に足りません（${kept.length} 個。引用が合わなかった物 ${dropped} 個）。`);
  return { account: typeof input.account === 'string' ? input.account : null, requirements: kept, source, dropped, model, checkedAt: new Date((deps.now ?? Date.now)()).toISOString() };
}
