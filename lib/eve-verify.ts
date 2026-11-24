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
