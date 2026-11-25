/**
 * Eve が作った部品: 需要と競合を調べる（能力 research.market）のうち、検索の言葉を集める所。task 130、2026-11-24。
 *
 * 2026-11-24 の確かめで、Noah の一覧にこの能力をこなせるエージェントが 0 件だった（data/eve-verifications/2026-11-24.json）。
 * 1. LLM に、そのテーマで日本の人が検索しそうな言葉の候補を 1 回だけ出してもらう（呼び直さない）。
 * 2. 候補ごとに、日本語版ウィキペディアの全文検索の件数を引き、1 件以上ある物だけを残す（LLM の思いつきだけで出さない）。
 *    件数は「話題の広さの目安」で、検索の回数（需要の量）ではない。需要の量と払う人は、需要の台帳（lib/eve-demand.ts）が持つ。
 * 3. テーマの芯の言葉（カタカナ・英数字のひと続き）のうち、候補に入っていない物と一緒に検索し、一緒に出てくる頁が 1 件以上ある物だけを残す。
 *    並びは「一緒に出てくる頁 ÷ 言葉だけの頁」の大きい順（テーマとの結び付きの強さ）。検索は語ごとに "" で囲み、字が同じ別の語に当てない。
 *    2026-11-25 の本番の回で、「クラウド」のテーマに「クラウドファンディング」が入ったため（言葉だけ 3,552 件・一緒に 6 件 → 0.002。クラウドサービスは 0.02）。
 *    5 個に足りなければ失敗を返す。
 * 外へは、ウィキペディアの検索 API だけを読む（書き込みはしない）。
 */

import { eveCleanLlmText, type EveLlm } from './eve-part-llm.ts';

export const EVE_PART_RESEARCH_REF = 'eve-part:keyword-research';
const UA = 'NoahBot/1 (eve-part; +https://avoado.si/noah/help#bot)';

export const EVE_PART_RESEARCH_SYSTEM = [
  'あなたは、日本の人がインターネットで検索する言葉を考える係です。',
  '与えられたテーマについて、日本の人が検索しそうな言葉を 12 個、JSON の文字列の配列だけで返します。',
  '例: ["言葉1", "言葉2"]',
  'テーマの言葉そのもの・記号だけの言葉・英語だけの言葉は入れません。1 つの言葉は 30 文字までです。',
].join('\n');

/** hits: 言葉だけの件数。together: テーマの芯の言葉と一緒に出てくる頁の件数（芯の言葉をすべて含む候補は hits と同じ）。 */
export type EveKeyword = { word: string; hits: number; together: number; source: string };
export type EveResearch = {
  topic: string;
  /** 検索の言葉（テーマとの結び付きの強い順）。次の工程（記事の指示のつなぎ目）はこの文字の一覧を読む。 */
  keywords: string[];
  /** 言葉ごとの裏付け（ウィキペディアの件数と、確かめた URL）。 */
  evidence: EveKeyword[];
  basis: string;
  model: string;
  checkedAt: string;
  dropped: string[];
};

/** モデルの返事から、言葉の配列を取り出す（最初の [ … ] を JSON として読む）。読めなければ投げる。 */
export function eveParseKeywordList(text: string, topic: string): string[] {
  const clean = eveCleanLlmText(text);
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('言葉の一覧（JSON の配列）が返っていません。');
  let list: unknown;
  try {
    list = JSON.parse(clean.slice(start, end + 1));
  } catch {
    throw new Error('言葉の一覧を JSON として読めません。');
  }
  if (!Array.isArray(list)) throw new Error('言葉の一覧が配列ではありません。');
  const norm = (s: string) => s.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const self = norm(topic);
  const out: string[] = [];
  for (const v of list) {
    if (typeof v !== 'string') continue;
    const w = norm(v);
    if (w.length < 2 || w.length > 30 || w === self || !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out.slice(0, 12);
}

/** テーマの芯の言葉: カタカナ・英数字の 2 文字以上のひと続き（「AIエージェントを動かすクラウド」→ AIエージェント・クラウド）。無ければテーマそのもの。 */
export function eveTopicCores(topic: string): string[] {
  const runs = [...new Set(topic.match(/[A-Za-z0-9ァ-ヶー]{2,}/gu) ?? [])];
  return runs.length ? runs.slice(0, 3) : [topic];
}

/** 日本語版ウィキペディアの全文検索の件数。 */
export async function eveWikipediaHits(word: string, fetcher: typeof fetch = fetch): Promise<{ hits: number; source: string }> {
  const api = new URL('https://ja.wikipedia.org/w/api.php');
  // 語ごとに "" で囲む（字が同じ別の語に当てない。2026-11-25）。
  const exact = word.split(/\s+/u).filter(Boolean).map((t) => `"${t.replaceAll('"', '')}"`).join(' ');
  api.search = new URLSearchParams({ action: 'query', list: 'search', srsearch: exact, srlimit: '1', srinfo: 'totalhits', srprop: '', format: 'json', utf8: '1' }).toString();
  const ask = () => fetcher(api, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000), redirect: 'error' });
  let response = await ask();
  // 混んでいる時（429）は、相手の言う秒数（10 秒まで）だけ待って、1 回だけ聞き直す（Wikimedia の API の決まり。2026-11-25）。
  const wait = Number(response.headers.get('retry-after'));
  if (response.status === 429 && Number.isFinite(wait) && wait >= 0 && wait <= 10) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, wait) * 1_000));
    response = await ask();
  }
  if (!response.ok) throw new Error(`ウィキペディアの検索が ${response.status} を返しました。`);
  const data = (await response.json()) as { query?: { searchinfo?: { totalhits?: unknown } } };
  const hits = data.query?.searchinfo?.totalhits;
  if (!Number.isSafeInteger(hits) || (hits as number) < 0) throw new Error('ウィキペディアの件数が読めません。');
  const page = new URL('https://ja.wikipedia.org/w/index.php');
  page.search = new URLSearchParams({ search: exact, fulltext: '1' }).toString();
  return { hits: hits as number, source: page.href };
}

export async function eveResearchKeywords(
  input: { topic?: unknown; country?: unknown; language?: unknown },
  deps: { llm: EveLlm; fetch?: typeof fetch; now?: () => number },
): Promise<EveResearch> {
  if (typeof input.topic !== 'string' || !input.topic.trim() || input.topic.length > 100) throw new Error('テーマ（topic）が要ります（100 文字まで）。');
  if ((input.country ?? 'JP') !== 'JP' || (input.language ?? 'ja') !== 'ja') throw new Error('日本（JP）と日本語（ja）だけを調べます。');
  const topic = input.topic.trim();
  const { text, model } = await deps.llm({ messages: [{ role: 'system', content: EVE_PART_RESEARCH_SYSTEM }, { role: 'user', content: `テーマ: ${topic}` }], maxTokens: 500, temperature: 0 });
  const candidates = eveParseKeywordList(text, topic);
  const evidence: EveKeyword[] = [];
  const dropped: string[] = [];
  const cores = eveTopicCores(topic);
  for (const word of candidates) {
    const { hits, source } = await eveWikipediaHits(word, deps.fetch);
    if (hits < 1) { dropped.push(word); continue; }
    const others = cores.filter((c) => !word.includes(c));
    const together = others.length ? (await eveWikipediaHits(`${word} ${others.join(' ')}`, deps.fetch)).hits : hits;
    if (together < 1) { dropped.push(word); continue; }
    evidence.push({ word, hits, together, source });
  }
  // テーマとの結び付きの強い順（一緒に出てくる頁 ÷ 言葉だけの頁。同じならモデルが挙げた順）。
  const order = new Map(candidates.map((w, i) => [w, i]));
  evidence.sort((a, b) => b.together / b.hits - a.together / a.hits || (order.get(a.word) ?? 0) - (order.get(b.word) ?? 0));
  if (evidence.length < 5) throw new Error(`裏付けのある言葉が 5 個に足りません（${evidence.length} 個）。`);
  return {
    topic,
    keywords: evidence.map((k) => k.word),
    evidence,
    basis: 'LLM の候補を、日本語版ウィキペディアの全文検索で裏付けた。テーマの芯の言葉と一緒に出てくる頁がある物だけを、一緒に出てくる頁 ÷ 言葉だけの頁の大きい順に並べた（話題の近さの目安。検索の回数ではない）。',
    model,
    checkedAt: new Date((deps.now ?? Date.now)()).toISOString(),
    dropped,
  };
}
