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
