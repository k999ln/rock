/**
 * 能力を確かめる（task 130 段 3。spec-122 の 5 章「確かめる」）。
 *
 * 名前・説明の語で当たっただけの候補は、工程に当てない。候補に、能力ごとの見本の仕事を 1 回だけ頼み、
 * 返った物を Jev の判定（eveCheckAccept）で見る。通った物だけを data/noah-business-capabilities.json の verified に足す。
 * 記録には、入力と出力の hash・時刻・版を残す。呼び直さない。消さない（外すのは人の判断）。
 *
 * 相手のサーバーへ見本の入力を送るので、本番で回す前に本人に聞く（設計書 9 章「最初の 1 回だけ本人に聞く」）。
 */

import { eveCheckAccept, type EveAcceptRule, type EveAgentRef } from './eve-combination.ts';
import type { EveAgentCaller } from './eve-combination-paper.ts';
import { eveStableJson } from './eve-glue.ts';

export type EveVerifyTask = { capability: string; label: string; input: Readonly<Record<string, unknown>>; accept: EveAcceptRule };

/** 470 通りすべてを止めている 2 つの能力から、見本の仕事を置く（2026-11-24 に noahEveBacklog で数えた順）。 */
export const EVE_VERIFY_TASKS: readonly EveVerifyTask[] = [
  {
    capability: 'research.market',
    label: '需要と競合を調べる',
    input: { topic: '法人向け AI 研修', country: 'JP', language: 'ja' },
    accept: { type: 'json', required: ['topic', 'keywords'], minItems: 5 },
  },
  {
    capability: 'tracking.results',
    label: '成果・売上を読む',
    // ログインの要らない見本: ASP の成果の CSV（合成）を渡し、件数と金額を読めるかを見る。
    input: { csv: '日付,クリック,発生,承認,承認報酬\n2026-11-20,120,3,1,8000\n2026-11-21,80,1,0,0\n', currency: 'JPY' },
    accept: { type: 'json', required: ['clicks', 'approved', 'approvedYen'] },
  },
  {
    capability: 'content.script',
    label: '台本・文章を書く',
    input: { brief: '法人向け AI 研修を比べる 30 秒の縦動画の台本。最初に広告（PR）と言う。' },
    accept: { type: 'text', minLength: 120, mustInclude: ['PR'] },
  },
  {
    // 2026-11-24 に足した。最初の組み合わせで、LP を公開する前の門（disclose）に要る能力。
    capability: 'compliance.check',
    label: '広告の表示・表現を点検する',
    input: {
      制作物: 'PR\n法人向けの AI 研修を比べる時は、受講の形と講座の長さを見てください。申し込む前に、料金と解約の決まりを公式サイトで確かめましょう。',
      '紹介 LP': '<header><p>広告</p></header><h1>法人向け AI 研修の比べ方</h1><p>申し込む前に、料金と解約の決まりを、公式サイトで確かめましょう。</p>',
    },
    accept: { type: 'json', required: ['ok', 'problems'] },
  },
  {
    // 2026-11-24 に足した。470 通りすべての設計図が、登録の前にこの工程を持つ。見本は合成の規約（実在の ASP の文ではない）。
    capability: 'research.terms',
    label: '規約と登録の要件を確かめる',
    input: {
      account: 'asp-sample',
      terms: [
        '第3条（会員登録）1. 会員として登録できるのは、満18歳以上の個人、または日本国内に所在する法人とします。2. 登録の申込者は、当社所定の方法で本人確認書類を提出するものとします。3. 登録できる媒体は、申込者自身が運営し、公開されているウェブサイトに限ります。',
        '第7条（禁止事項）会員は、次の行為をしてはなりません。(1) 自己の媒体を通じて、自ら広告主の商品を申し込む行為。(2) 広告主の商標を含む語句で、検索連動型広告を出稿する行為。(3) 事実と異なる効果や、根拠のない順位を表示する行為。',
        '第10条（成果報酬の支払）1. 成果報酬は、広告主が成果を承認した月の翌々月末日に支払います。2. 支払額の合計が1,000円未満の場合は、翌月以降に繰り越します。',
      ].join('\n'),
    },
    accept: { type: 'json', required: ['requirements'], minItems: 3 },
  },
  // 2026-11-25: 最初の組み合わせの残りの自動工程（案件を比べる・記事・画像・LP・置き場・ブログに出す）。Noah の候補が無く、Eve が作る。
  {
    capability: 'research.offer',
    label: '案件を比べる',
    input: {
      asp: 'A8.net',
      offers: [
        { id: 'a8:ai-training', name: 'A 研修', condition: '無料相談の申込', rewardYen: 8_000, place: 'A8.net', sources: [{ url: 'https://example.com/a8/ai-training', checkedAt: '2026-11-25T00:00:00Z' }] },
        { id: 'a8:ai-writer', name: 'B ライティング', condition: '有料会員の登録', rewardYen: 4_000, place: 'A8.net', sources: [{ url: 'https://example.com/a8/ai-writer', checkedAt: '2026-11-25T00:00:00Z' }], record: { occurred: 20, approved: 18 } },
        { id: 'a8:card', name: 'C カード', condition: 'カードの発行', rewardYen: 12_000, place: 'A8.net', finance: true, sources: [{ url: 'https://example.com/a8/card', checkedAt: '2026-11-25T00:00:00Z' }] },
        { id: 'other:ai-tool', name: 'D ツール', condition: '購入', rewardYen: 3_000, place: '別の ASP', sources: [{ url: 'https://example.com/other/ai-tool', checkedAt: '2026-11-25T00:00:00Z' }] },
      ],
    },
    accept: { type: 'json', required: ['offers', 'chosen', 'dropped'], minItems: 1 },
  },
  {
    capability: 'content.article',
    label: '記事を書く',
    input: {
      記事の指示: {
        指示: '「法人向け AI 研修」を比べる記事を書く。最初に広告（PR）である事を書く。断定・誇大な表現をしない。',
        入れる語: ['比較', '料金', '助成金', '導入事例', '期間'],
        紹介する物: [{ 名前: 'A 研修', 成果の条件: '無料相談の申込', 報酬: 8_000 }],
      },
    },
    accept: { type: 'text', minLength: 1_500, mustInclude: ['PR', '{{AFFILIATE_URL}}'] },
  },
  {
    capability: 'content.image',
    label: '見出し画像を作る',
    input: { 記事: 'PR｜見本\n\n# 法人向け AI 研修の選び方｜比べる時に見る所と、申し込む前に確かめる事\n' },
    accept: { type: 'file', mime: ['image/png'], maxBytes: 5_000_000 },
  },
  {
    capability: 'site.build',
    label: '紹介の LP を作る',
    input: {
      '案件・条件': { offers: [{ id: 'a8:ai-training', name: 'A 研修', condition: '無料相談の申込', rewardYen: 8_000 }], chosen: 'a8:ai-training' },
      調査結果: { topic: '法人向け AI 研修', keywords: ['比較', '料金', '助成金', '導入事例', '期間'] },
    },
    accept: { type: 'text', minLength: 800, mustInclude: ['PR', '{{AFFILIATE_URL}}', 'sponsored'] },
  },
  {
    capability: 'site.host',
    label: 'LP を置く用意をする',
    input: {
      '紹介 LP': '<!doctype html><html lang="ja"><body><p>広告（PR）: このページにはアフィリエイトリンクを含みます。</p><a href="{{AFFILIATE_URL}}" rel="sponsored nofollow noopener">公式サイトで確かめる</a></body></html>',
      '広告表示・表現の確認結果': { ok: true, problems: [] },
      提携承認または申請結果: { affiliateUrl: 'https://px.a8.net/svt/ejp?a8mat=SAMPLE' },
    },
    accept: { type: 'json', required: ['files', 'bundleSha256', 'entry'], minItems: 1 },
  },
  {
    capability: 'publish.blog',
    label: 'ブログに出す用意をする',
    input: {
      記事: 'PR｜この記事には広告（アフィリエイトリンク）を含みます。リンク先で申し込むと、運営者に報酬が入ることがあります。\n\n# 法人向け AI 研修の選び方\n\n研修を選ぶ前に、使う目的を決めておきます。\n\n## 申し込む前に確かめること\n\n料金と解約の決まりを、公式サイトで確かめましょう。\n\n[A 研修の公式サイトを見る]({{AFFILIATE_URL}})\n',
      '広告表示・表現の確認結果': { ok: true, problems: [] },
      提携承認または申請結果: { affiliateUrl: 'https://px.a8.net/svt/ejp?a8mat=SAMPLE' },
    },
    accept: { type: 'json', required: ['title', 'html', 'wxr'] },
  },
];

export type EveVerification = {
  capability: string;
  ref: string;
  version: string;
  ok: boolean;
  reason: string;
  inputHash: string;
  outputHash: string | null;
  at: string;
};

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 候補に見本の仕事を 1 回ずつ頼み、Jev の判定で見る。失敗は記録して、呼び直さない。 */
export async function eveVerifyCapability(
  task: EveVerifyTask,
  candidates: readonly EveAgentRef[],
  call: EveAgentCaller,
  now: () => number = () => Date.now(),
): Promise<EveVerification[]> {
  const inputHash = await sha256(eveStableJson(task.input));
  const out: EveVerification[] = [];
  for (const ref of candidates) {
    const at = new Date(now()).toISOString();
    try {
      const res = await call(ref, task.input);
      const verdict = eveCheckAccept(task.accept, res.output);
      out.push({ capability: task.capability, ref: ref.ref, version: ref.version, ok: verdict.ok, reason: verdict.reason, inputHash, outputHash: await sha256(eveStableJson(res.output)), at });
    } catch (e) {
      out.push({ capability: task.capability, ref: ref.ref, version: ref.version, ok: false, reason: `呼び出しが失敗しました: ${e instanceof Error ? e.message : String(e)}`, inputHash, outputHash: null, at });
    }
  }
  return out;
}

export type EveVerifiedFile = { schema: 'noah-business-capabilities/1'; note: string; verified: Record<string, string[]> };

/** 通った物だけを足す（消さない。重ならない。並びは決まった順）。元の物は書き換えず、新しい物を返す。 */
export function eveMergeVerified(file: EveVerifiedFile, results: readonly EveVerification[]): EveVerifiedFile {
  const verified: Record<string, string[]> = Object.fromEntries(Object.entries(file.verified).map(([k, v]) => [k, [...v]]));
  for (const r of results) if (r.ok) verified[r.capability] = [...new Set([...(verified[r.capability] ?? []), r.ref])].sort();
  return { ...file, verified: Object.fromEntries(Object.keys(verified).sort().map((k) => [k, verified[k]])) };
}

// ---------------------------------------------------------------------------
// 本物の候補へ送る時の、道具の選び方と入力の作り方（2026-11-24 13:54 の本人回答「全部送ってよい」）。
// 送ってよいのは、読むだけの道具だけ。送信・購入・電話・申込・登録・投稿などの道具は、候補にどれだけ合っていても呼ばない。
// ---------------------------------------------------------------------------

/** MCP の道具の定義（tools/list の 1 件）。 */
export type EveMcpTool = {
  name: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, { type?: string | string[]; enum?: readonly unknown[] }>; required?: readonly string[] };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

/** 外に影響が出る道具の名前（送る・買う・電話する・申し込む・登録する・書き換える など）。これに当たる道具は呼ばない。 */
export const EVE_VERIFY_SIDE_EFFECT =
  /(send|call|dial|sms|whatsapp|email|mail|post|publish|create|add|update|edit|delete|remove|buy|purchase|order|checkout|cart|pay|book|reserve|hire|apply|submit|register|sign_?up|subscribe|transfer|deploy|upload|save|store|launch|place|cancel|approve|vote|feedback|waitlist|invite|connect|login|auth|start|claim|mint|trade|swap|bid|quote|contact|message|notify|schedule|set_|start)/iu;
const READS = /(search|get|list|lookup|look_up|find|fetch|read|query|check|scan|report|estimate|analy|stat|value|compare|describe|info|research|summar|answer|explain|resolve)/iu;
const WRITES_TEXT = /(write|draft|script|compose|generate|suggest|idea)/iu;

/** 能力ごとに、見本の中身を入れてよい項目の名前と、入れる見本の値。 */
const VERIFY_FIELDS: Readonly<Record<string, { fields: readonly string[]; from: string; prefer: RegExp }>> = {
  'research.market': { fields: ['query', 'q', 'keyword', 'keywords', 'topic', 'search', 'term', 'text', 'prompt', 'question'], from: 'topic', prefer: /(research|search|keyword|trend|market)/iu },
  'tracking.results': { fields: ['csv', 'data', 'text', 'content', 'input', 'report'], from: 'csv', prefer: /(report|analy|stat|parse|read)/iu },
  'content.script': { fields: ['brief', 'prompt', 'text', 'topic', 'query', 'instructions', 'description'], from: 'brief', prefer: /(script|write|draft|compose|generate)/iu },
};

const isString = (p?: { type?: string | string[] }) => !p?.type || p.type === 'string' || (Array.isArray(p.type) && p.type.includes('string'));

/**
 * 見本の仕事を頼む道具を 1 つ選び、入力を作る。選べない時は理由を返す（呼ばない）。
 * 1. 外に影響が出る名前の道具・destructiveHint の道具は除く。
 * 2. readOnlyHint が付いた道具か、読むだけの名前の道具だけを使う（台本・文章を書く能力だけは、書くだけの名前も使う）。
 * 3. 必ず要る項目がすべて見本で埋まる道具だけを使う（埋まらない項目があれば呼ばない）。見本を入れる項目が 1 つも無い道具も使わない。
 * 4. 能力に合う名前の道具を先に、同じなら名前の順。
 */
export function eveVerifyToolChoice(task: EveVerifyTask, tools: readonly EveMcpTool[]): { tool: EveMcpTool; args: Record<string, string> } | { tool: null; reason: string } {
  const spec = VERIFY_FIELDS[task.capability];
  if (!spec) return { tool: null, reason: `「${task.capability}」の見本の入れ方が決まっていません。` };
  const value = task.input[spec.from];
  if (typeof value !== 'string' || !value) return { tool: null, reason: '見本の値がありません。' };
  const usable: { tool: EveMcpTool; args: Record<string, string> }[] = [];
  for (const tool of tools) {
    if (typeof tool?.name !== 'string' || EVE_VERIFY_SIDE_EFFECT.test(tool.name) || tool.annotations?.destructiveHint === true) continue;
    const readOnly = tool.annotations?.readOnlyHint === true || READS.test(tool.name) || (task.capability === 'content.script' && WRITES_TEXT.test(tool.name));
    if (!readOnly) continue;
    const props = tool.inputSchema?.properties ?? {};
    const required = tool.inputSchema?.required ?? [];
    const fits = (key: string) => spec.fields.includes(key.toLowerCase()) && isString(props[key]) && !props[key]?.enum;
    if (!required.every(fits)) continue;
    const key = required.find(fits) ?? Object.keys(props).sort().find(fits);
    if (!key) continue;
    usable.push({ tool, args: Object.fromEntries([...new Set([...required, key])].map((k) => [k, value])) });
  }
  if (!usable.length) return { tool: null, reason: '読むだけで、見本を入れられる道具がありません（外に影響が出る道具は呼びません）。' };
  usable.sort((a, b) => Number(spec.prefer.test(b.tool.name)) - Number(spec.prefer.test(a.tool.name)) || a.tool.name.localeCompare(b.tool.name));
  return usable[0];
}

/** MCP の道具の返事を、Jev が判定する形にする。構造化された返事があればそれ、無ければ文章（JSON として読めれば JSON）。 */
export function eveMcpOutput(result: { structuredContent?: unknown; content?: readonly { type?: string; text?: string }[]; isError?: boolean }): unknown {
  const text = (result.content ?? []).filter((c) => c?.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n');
  if (result.isError) throw new Error(`道具が失敗を返しました: ${text.slice(0, 200)}`);
  if (result.structuredContent !== undefined && result.structuredContent !== null) return result.structuredContent;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // 文章のまま判定する
  }
  return text;
}
