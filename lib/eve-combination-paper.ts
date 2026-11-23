/**
 * 試運転（外へ出さない）。task 130 段 2。
 *
 * 見本の入力で、組み合わせの全部の工程を、待つ順（段）どおりに動かす。
 * - 外へ出す工程（公開・送信・応募・提出）と、本人が押す・入れる・確かめる工程は、実行しない。
 *   「送る予定の中身」と「本人に頼む事」を見本として見せ、その見本を次の工程へ渡して先へ進む。
 * - auto の工程は、つなぎ目の変換なら解釈器で、エージェントなら呼び出し役（call）で動かす。
 *   呼び出し役は、外へ出す工程には決して渡されない（試験で確かめる）。
 * - 工程の合格条件は、作った者ではなく Jev の判定（eveCheckAccept）で見る。
 * 仕様: docs/services/eve-si.md
 */

import { noahBlueprintLevels } from './noah-steps.ts';
import { NOAH_BUILTIN_CAPABILITIES } from './noah-business.ts';
import { eveCheckAccept, eveStepIsOutward, type EveAgentRef, type EveCombination, type EveStep } from './eve-combination.ts';
import { runEveGlue } from './eve-glue.ts';

export type EveAgentCaller = (ref: EveAgentRef, input: Readonly<Record<string, unknown>>) => Promise<{ output: unknown; costYen?: number }>;

export type EvePaperStepStatus = 'ok' | 'failed' | 'held' | 'preview' | 'no-part' | 'skipped';
export type EvePaperStep = {
  id: string;
  label: string;
  kind: EveStep['kind'];
  status: EvePaperStepStatus;
  reason: string;
  /** 動かした工程の出力。見本だけの工程は、次へ渡した見本。 */
  output?: unknown;
  costYen: number;
  ms: number;
};
export type EvePaperResult = {
  combinationId: string;
  version: number;
  /** 全部の工程の見本が出たか（ok・held・preview だけなら passed）。 */
  status: 'passed' | 'failed';
  steps: EvePaperStep[];
  costYen: number;
  /** 外へ出す工程を実行した数。作りの上で 0（試験で確かめる）。 */
  outwardExecuted: 0;
};

const PERSON: Record<string, string> = {
  tap: '本人が中身を確かめて押す工程です。試運転では押しません。',
  human: '本人にしかできない工程です（パスワード・本人確認・口座など）。試運転では止めて、頼む事だけを見せます。',
  review: '本人が中身を確かめる工程です。試運転では、確かめてもらう見本を見せます。',
};

/** その工程が受け取る物を集める（前の工程の出力を、素材の名前で渡す。見本の入力は sample から）。 */
function gather(step: EveStep, outputs: ReadonlyMap<string, unknown>, sample: Readonly<Record<string, unknown>>) {
  const input: Record<string, unknown> = {};
  for (const name of step.flow?.inputs ?? []) if (Object.hasOwn(sample, name)) input[name] = sample[name];
  for (const { from, material } of step.flow?.dataFrom ?? []) input[material] = outputs.get(from);
  for (const id of step.after ?? []) if (!(step.flow?.dataFrom ?? []).some((d) => d.from === id) && outputs.has(id)) input[`工程:${id}`] = outputs.get(id);
  return input;
}

function fillArgs(args: Readonly<Record<string, string>> | undefined, sample: Readonly<Record<string, unknown>>) {
  if (!args) return undefined;
  return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v.replace(/\{([^}]+)\}/gu, (_, key: string) => String(sample[key] ?? ''))]));
}

export async function eveDryRun(
  c: EveCombination,
  opts: { sample: Readonly<Record<string, unknown>>; call?: EveAgentCaller; now?: () => number },
): Promise<EvePaperResult> {
  const now = opts.now ?? (() => Date.now());
  const outputs = new Map<string, unknown>();
  const results = new Map<string, EvePaperStep>();
  let costYen = 0;
  /** 上限の確かめに使う額。工程の見積りと、相手が返した実費の大きい方を押さえる（少なく返されても上限を越えない）。 */
  let reservedYen = 0;
  const base = (s: EveStep) => ({ id: s.id, label: s.label, kind: s.kind });

  for (const level of noahBlueprintLevels(c.steps)) {
    for (const step of level) {
      const started = now();
      const blocked = (step.after ?? []).find((id) => ['failed', 'no-part', 'skipped'].includes(results.get(id)?.status ?? ''));
      const finish = (status: EvePaperStepStatus, reason: string, extra: { output?: unknown; costYen?: number } = {}) => {
        if (extra.output !== undefined) outputs.set(step.id, extra.output);
        results.set(step.id, { ...base(step), status, reason, ...(extra.output !== undefined ? { output: extra.output } : {}), costYen: extra.costYen ?? 0, ms: Math.max(0, now() - started) });
      };
      if (blocked) {
        finish('skipped', `待っている工程（${blocked}）が通らなかったので、動かしていません。`);
        continue;
      }
      const input = gather(step, outputs, opts.sample);
      if (eveStepIsOutward(step)) {
        const preview = { 見本: true, 工程: step.label, 送る予定の中身: input, 出す物: step.flow?.outputs ?? [] };
        if (step.kind !== 'auto') finish(step.kind === 'human' ? 'held' : 'preview', PERSON[step.kind], { output: preview });
        else finish('preview', '外へ出す工程です。試運転では出さず、送る予定の中身を見せます。', { output: preview });
        continue;
      }
      if (c.keepForSelf.includes(step.id)) {
        finish('held', '本人が自分でやりたい工程です。自動に置き換えません。', { output: { 見本: true, 工程: step.label, 本人の番: true } });
        continue;
      }
      if (step.glue) {
        try {
          finish('ok', 'つなぎ目の変換を動かしました。', { output: runEveGlue(step.glue, input) });
        } catch (e) {
          finish('failed', `つなぎ目の変換が失敗しました: ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }
      if (step.capability && NOAH_BUILTIN_CAPABILITIES.includes(step.capability as never)) {
        finish('ok', 'Noah の中の決まった式で動く工程です（続ける・増やす・止めるの判断）。', { output: { 見本: true, 判断: '待つ（実績がまだ無い）' } });
        continue;
      }
      if (!step.agent || !opts.call) {
        finish('no-part', step.agent ? '呼び出し役が渡されていないので、動かしていません。' : `「${step.capability ?? step.label}」をこなすエージェントが決まっていません。`);
        continue;
      }
      if (reservedYen + (step.costYen ?? 0) > c.budget.perRunYen) {
        finish('skipped', `1 回の上限 ${c.budget.perRunYen} 円を超えるので、動かしていません。`);
        continue;
      }
      try {
        const res = await opts.call(step.agent, { ...input, ...(fillArgs(step.agent.args, opts.sample) ?? {}) });
        const spent = Number.isSafeInteger(res.costYen) && (res.costYen as number) >= 0 ? (res.costYen as number) : (step.costYen ?? 0);
        costYen += spent;
        reservedYen += Math.max(spent, step.costYen ?? 0);
        const verdict = step.accept ? eveCheckAccept(step.accept, res.output) : { ok: true, reason: '合格条件の無い工程です。' };
        finish(verdict.ok ? 'ok' : 'failed', verdict.reason, { output: res.output, costYen: spent });
      } catch (e) {
        finish('failed', `エージェントの呼び出しが失敗しました: ${e instanceof Error ? e.message : String(e)}。呼び直しません。`);
      }
    }
  }
  const steps = c.steps.map((s) => results.get(s.id)!);
  return {
    combinationId: c.id,
    version: c.version,
    status: steps.every((s) => ['ok', 'held', 'preview'].includes(s.status)) ? 'passed' : 'failed',
    steps,
    costYen,
    outwardExecuted: 0,
  };
}
