/**
 * 本番の実行役（task 130 段 2 の「小さく本番」。2026-11-25）。
 *
 * 試運転（lib/eve-combination-paper.ts）と同じ順（段）で工程を動かすが、見本ではなく本物の部品を呼び、結果を「回」の記録に残す。
 * - 本人の工程（human・tap・review）と、本人が自分でやる工程（keepForSelf）は、本人が中身を返すまで「本人の番」で止まる。
 *   本人が返した中身（eveSubmitOwner）を出力として、続きから動く。パスワード・鍵・口座の番号の項目は受け取らない（規則 9）。
 * - 外へ出す自動の工程（置き場・ブログに出す）は、部品が「出す一式」を作った後、本人が出して URL を返すまで止まる。Eve は出さない。
 * - 部品の版が、組み合わせに書いた版と違う時は呼ばない（確かめ直すまで送らない。規則 8）。1 回の上限（budget.perRunYen）を越える時も呼ばない。
 * - 失敗した工程は呼び直さない。その工程を待つ工程は止まる。
 * - 工程の合格は、作った者ではなく Jev の判定（eveCheckAccept）で見る。
 * 記録は JSON 1 つ（eve-run/1）。何度読み直しても、同じ記録からは同じ所で止まる。
 */

import { noahBlueprintLevels } from './noah-steps.ts';
import { NOAH_BUILTIN_CAPABILITIES } from './noah-business.ts';
import { eveCheckAccept, eveStepIsOutward, type EveCombination, type EveStep } from './eve-combination.ts';
import type { EveAgentCaller } from './eve-combination-paper.ts';
import { eveStableJson, runEveGlue } from './eve-glue.ts';
import { eveAffiliateUrl } from './eve-part-host.ts';

export type EveRunState = 'done' | 'owner' | 'waiting' | 'failed' | 'refused';
export type EveRunStep = {
  id: string;
  state: EveRunState;
  reason: string;
  at: string;
  part?: { ref: string; version: string };
  inputSha256?: string;
  outputSha256?: string;
  output?: unknown;
  /** 外へ出す工程で、部品が作った「出す一式」（本人が出して URL を返すまで、ここに置く）。 */
  prepared?: unknown;
  /** 本人の番の時、本人に頼む事。 */
  ask?: { label: string; reason: string; needs: readonly string[]; give: string };
  costYen: number;
  ms: number;
};
export type EveRun = {
  schema: 'eve-run/1';
  runId: string;
  combinationId: string;
  version: number;
  startedAt: string;
  updatedAt: string;
  /** 回の最初に渡した素材（テーマ・需要の台帳など）。 */
  inputs: Record<string, unknown>;
  steps: Record<string, EveRunStep>;
  /** 本人が返した中身の記録（工程・時刻・中身の hash）。中身そのものは工程の出力に入る。 */
  owner: { step: string; at: string; sha256: string }[];
  costYen: number;
};

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function eveNewRun(c: EveCombination, runId: string, inputs: Record<string, unknown>, now: number): EveRun {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(runId)) throw new Error('回の id は英小文字・数字・- の 3〜64 文字です。');
  const at = new Date(now).toISOString();
  return { schema: 'eve-run/1', runId, combinationId: c.id, version: c.version, startedAt: at, updatedAt: at, inputs, steps: {}, owner: [], costYen: 0 };
}

const OWNER_TEXT: Record<string, string> = {
  human: '本人にしかできない工程です（登録・ログイン・口座など）。済んだら、結果を Eve に返してください。',
  tap: '本人が中身を確かめて押す工程です。押したら、結果を Eve に返してください。',
  review: '本人が中身を確かめる工程です。確かめたら、結果を Eve に返してください。',
};

/** 本人が返す物の形（工程の出す素材で決める）。 */
function ownerGive(step: EveStep): string {
  const outs = step.flow?.outputs ?? [];
  if (outs.includes('提携承認または申請結果')) return '{"affiliateUrl":"https://…（ASP の画面の広告リンク）"}';
  if (outs.includes('成果の CSV')) return '{"csv":"…（ASP の画面から書き出した CSV の中身）"}';
  if (step.kind === 'auto' && eveStepIsOutward(step)) return '{"url":"https://…（出したページの URL）"}';
  return '{"note":"…（済んだ事を 1 行で。パスワードや口座の番号は書かない）"}';
}

const SECRET_KEY = /(pass|password|secret|token|api[_-]?key|口座|暗証|カード番号|card)/iu;

/** 本人が返した中身を確かめて、記録に入れる（記録は書き換えず、新しい記録を返す）。 */
export async function eveSubmitOwner(c: EveCombination, run: EveRun, stepId: string, given: unknown, now: number): Promise<EveRun> {
  const step = c.steps.find((s) => s.id === stepId);
  const cur = run.steps[stepId];
  if (!step || !cur) throw new Error(`工程「${stepId}」は、この回にありません。`);
  if (cur.state !== 'owner') throw new Error(`工程「${stepId}」は、本人の番ではありません（${cur.state}）。`);
  if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Error('返す中身は JSON のオブジェクトです。');
  const value = given as Record<string, unknown>;
  const text = eveStableJson(value);
  if (text.length > 2_000_000) throw new Error('返す中身が大きすぎます（2 MB まで）。');
  const secret = Object.keys(value).find((k) => SECRET_KEY.test(k));
  if (secret) throw new Error(`「${secret}」は受け取りません。パスワード・鍵・口座の番号は Eve に渡さないでください。`);
  const outs = step.flow?.outputs ?? [];
  let output: unknown = value;
  if (outs.includes('提携承認または申請結果')) output = { status: 'approved', affiliateUrl: eveAffiliateUrl(value).href };
  else if (outs.includes('成果の CSV')) {
    if (typeof value.csv !== 'string' || !value.csv.trim()) throw new Error('CSV の中身（csv）がありません。');
    output = value.csv;
  } else if (step.kind === 'auto' && eveStepIsOutward(step)) {
    let url: URL;
    try {
      url = new URL(typeof value.url === 'string' ? value.url : '');
    } catch {
      throw new Error('出したページの URL（url）がありません。');
    }
    if (url.protocol !== 'https:') throw new Error('出したページの URL は https だけです。');
    output = { url: url.href, publishedBy: 'owner', prepared: cur.outputSha256 ?? null };
  } else if (Object.keys(value).length === 0) throw new Error('済んだ事（note など）を 1 つ以上返してください。');
  const at = new Date(now).toISOString();
  const outText = eveStableJson(output);
  return {
    ...run,
    updatedAt: at,
    owner: [...run.owner, { step: stepId, at, sha256: await sha256(text) }],
    steps: { ...run.steps, [stepId]: { ...cur, state: 'done', reason: '本人が返した中身で進みます。', at, output, outputSha256: await sha256(outText), ask: undefined } },
  };
}

/** 回を進める（止まっている所の先から、動かせる工程を全部動かす）。 */
export async function eveAdvanceRun(
  c: EveCombination,
  run: EveRun,
  deps: { call: EveAgentCaller; versionOf: (ref: string) => Promise<string>; now?: () => number },
): Promise<EveRun> {
  if (run.combinationId !== c.id || run.version !== c.version) throw new Error('回と組み合わせの版が違います。');
  const now = deps.now ?? (() => Date.now());
  const steps: Record<string, EveRunStep> = { ...run.steps };
  let costYen = run.costYen;
  const outputOf = (id: string) => steps[id]?.output;
  for (const level of noahBlueprintLevels(c.steps)) {
    for (const step of level) {
      const prev = steps[step.id];
      if (prev && ['done', 'failed', 'refused'].includes(prev.state)) continue;
      if (prev?.state === 'owner' && prev.prepared !== undefined) continue;
      const started = now();
      const set = (state: EveRunState, reason: string, extra: Partial<EveRunStep> = {}) => {
        steps[step.id] = { id: step.id, state, reason, at: new Date(now()).toISOString(), costYen: 0, ms: Math.max(0, now() - started), ...extra };
      };
      const after = step.after ?? [];
      const broken = after.find((id) => ['failed', 'refused'].includes(steps[id]?.state ?? ''));
      if (broken) { set('waiting', `待っている工程（${broken}）が止まったので、動かしません。`); continue; }
      const notYet = after.filter((id) => steps[id]?.state !== 'done');
      if (notYet.length) { set('waiting', `待っている工程: ${notYet.join('・')}`); continue; }
      const input: Record<string, unknown> = {};
      for (const name of step.flow?.inputs ?? []) if (Object.hasOwn(run.inputs, name)) input[name] = run.inputs[name];
      for (const { from, material } of step.flow?.dataFrom ?? []) input[material] = outputOf(from);
      const ask = (needs: readonly string[]) => ({ label: step.label, reason: step.reason ?? OWNER_TEXT[step.kind] ?? '', needs, give: ownerGive(step) });
      if (step.kind !== 'auto' || c.keepForSelf.includes(step.id)) {
        set('owner', step.kind === 'auto' ? '本人が自分でやりたい工程です。' : OWNER_TEXT[step.kind], { ask: ask(step.flow?.inputs ?? []), output: undefined, inputSha256: await sha256(eveStableJson(input)) });
        // 本人に渡す材料（前の工程の出力）は、本人の番の画面で見せる。
        steps[step.id].prepared = input;
        continue;
      }
      if (step.glue) {
        try {
          const out = runEveGlue(step.glue, input);
          set('done', 'つなぎ目の変換を動かしました。', { output: out, inputSha256: await sha256(eveStableJson(input)), outputSha256: await sha256(eveStableJson(out)) });
        } catch (e) {
          set('failed', `つなぎ目の変換が失敗しました: ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }
      if (step.capability && NOAH_BUILTIN_CAPABILITIES.includes(step.capability as never)) {
        const r = input['成果・売上の集計'] as { approved?: unknown; approvedYen?: unknown } | undefined;
        const approved = typeof r?.approved === 'number' ? r.approved : 0;
        const out = { 判断: approved > 0 ? '続ける' : '待つ', 理由: approved > 0 ? `承認が ${approved} 件あります。` : '承認の記録がまだありません（14 日・10 件の決まりに届くまで待つ）。' };
        set('done', 'Noah の中の決まった式で決めました。', { output: out, outputSha256: await sha256(eveStableJson(out)) });
        continue;
      }
      if (!step.agent) { set('refused', `「${step.capability ?? step.label}」をこなす部品が決まっていません。`); continue; }
      const live = await deps.versionOf(step.agent.ref).catch(() => null);
      if (live !== step.agent.version) {
        set('refused', `「${step.agent.ref}」の今の版（${live?.slice(0, 12) ?? '不明'}）が、組み合わせに書いた版（${step.agent.version.slice(0, 12)}）と違います。確かめ直すまで呼びません。`, { part: { ref: step.agent.ref, version: step.agent.version } });
        continue;
      }
      if (costYen + (step.costYen ?? 0) > c.budget.perRunYen) { set('refused', `1 回の上限 ${c.budget.perRunYen} 円を超えるので、呼びません。`); continue; }
      const args = Object.fromEntries(Object.entries(step.agent.args ?? {}).map(([k, v]) => [k, v.replace(/\{([^}]+)\}/gu, (_, key: string) => { const v = run.inputs[key]; return typeof v === 'string' || typeof v === 'number' ? String(v) : ''; })]));
      const callInput = { ...input, ...args };
      const inputSha256 = await sha256(eveStableJson(callInput));
      const part = { ref: step.agent.ref, version: step.agent.version };
      try {
        const res = await deps.call(step.agent, callInput);
        const spent = Number.isSafeInteger(res.costYen) && (res.costYen as number) >= 0 ? (res.costYen as number) : (step.costYen ?? 0);
        costYen += spent;
        const verdict = step.accept ? eveCheckAccept(step.accept, res.output) : { ok: true, reason: '合格条件の無い工程です。' };
        const outputSha256 = await sha256(eveStableJson(res.output));
        if (!verdict.ok) set('failed', `Jev の判定に通りません: ${verdict.reason}`, { part, inputSha256, outputSha256, output: res.output, costYen: spent });
        else if (eveStepIsOutward(step)) set('owner', '出す一式を作りました。出すのは本人です。出したら URL を返してください。', { part, inputSha256, outputSha256, prepared: res.output, costYen: spent, ask: ask(['出す一式']) });
        else set('done', verdict.reason, { part, inputSha256, outputSha256, output: res.output, costYen: spent });
      } catch (e) {
        set('failed', `部品が失敗しました: ${e instanceof Error ? e.message : String(e)}。呼び直しません。`, { part, inputSha256 });
      }
    }
  }
  return { ...run, steps, costYen, updatedAt: new Date(now()).toISOString() };
}

/** 回のまとめ（画面と CLI が出す）。 */
export function eveRunSummary(c: EveCombination, run: EveRun) {
  const list = c.steps.map((s) => run.steps[s.id] ?? { id: s.id, state: 'waiting' as const, reason: 'まだ動かしていません。' });
  const count = (state: EveRunState) => list.filter((s) => s.state === state).length;
  return {
    done: count('done'), owner: count('owner'), waiting: count('waiting'), failed: count('failed'), refused: count('refused'), total: list.length,
    ownerTurns: c.steps.filter((s) => run.steps[s.id]?.state === 'owner').map((s) => ({ id: s.id, label: s.label, kind: s.kind, ask: run.steps[s.id].ask })),
    finished: run.steps[c.exit.step]?.state === 'done',
  };
}
