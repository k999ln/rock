/**
 * 作り直し（Eve）。task 130 段 5。
 *
 * 1. 候補にするのは、採点で一番数が落ちた段の前の工程と、試運転で落ちた工程だけ（eveRebuildTargets）。
 * 2. 5 回続けて Jev に通っている工程は固定して、差し替えない（RECIPE_FREEZE_STREAK）。
 * 3. 差し替えの候補の順は、fallback（確かめた物だけ）→ 他の確かめたエージェント（良い順）→ Eve が部品を作る。
 *    確かめていない部品は使わない。
 * 4. 新しい版を作って試運転し、見込みの利益が 20% 以上良い時だけ提案する（RECIPE_SWITCH_MARGIN）。
 *    1 つの候補は 1 回だけ試す（呼び直さない）。試す予算（budget.trialYen）を超えたら止める。
 * 5. 採用は本人が押す（eveAdoptRebuild）。元の版は書き換えない。
 * 決まった式だけ（学習・乱数なし）。
 */

import { RECIPE_FREEZE_STREAK, RECIPE_SWITCH_MARGIN } from './sky-recipe-planner.ts';
import { NOAH_BUILTIN_CAPABILITIES } from './noah-business.ts';
import { defineCombination, type EveAgentRef, type EveAuthor, type EveCombination, type EveStep } from './eve-combination.ts';
import { eveDryRun, type EveAgentCaller, type EvePaperResult } from './eve-combination-paper.ts';
import { eveCombinationExpectedProfit, eveCompareAgents, type EveAgentRecord } from './eve-combination-search.ts';
import type { EveDemand, EveSaleRecord } from './eve-demand.ts';
import type { EveScorecard } from './eve-combination-score.ts';

/** 工程ごとの直近の Jev の判定（新しい物が末尾）。 */
export type EveStepHistory = Readonly<Record<string, readonly boolean[]>>;

const streak = (outcomes: readonly boolean[] = []) => {
  let n = 0;
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i]; i -= 1) n += 1;
  return n;
};

export type EveRebuildTarget = { step: string; capability: string; why: 'funnel' | 'dry-run' };

/** 作り直す工程を決める。採点の責め（一番数が落ちた段の前の工程）と、試運転で落ちた・部品の無い工程。並びは組み合わせの順。 */
export function eveRebuildTargets(c: EveCombination, score?: EveScorecard | null, dryRun?: EvePaperResult | null): EveRebuildTarget[] {
  const why = new Map<string, EveRebuildTarget['why']>();
  for (const b of score?.blame ?? []) why.set(b.step, 'funnel');
  for (const s of dryRun?.steps ?? []) if ((s.status === 'failed' || s.status === 'no-part') && !why.has(s.id)) why.set(s.id, 'dry-run');
  return c.steps
    .filter((s) => why.has(s.id) && s.kind === 'auto' && !s.glue && s.capability && !NOAH_BUILTIN_CAPABILITIES.includes(s.capability as never) && !c.keepForSelf.includes(s.id))
    .map((s) => ({ step: s.id, capability: s.capability!, why: why.get(s.id)! }));
}

export type EveRebuildCandidate = {
  step: string;
  capability: string;
  source: 'fallback' | 'verified' | 'eve-build';
  to: EveAgentRef | null;
};

/** 1 つの工程の差し替えの候補。fallback（確かめた物だけ）→ 他の確かめたエージェント → Eve が作る。今の部品は入れない。 */
export function eveRebuildCandidates(
  c: EveCombination,
  target: EveRebuildTarget,
  agents: readonly EveAgentRecord[],
  verified: Readonly<Partial<Record<string, readonly string[]>>>,
): EveRebuildCandidate[] {
  const step = c.steps.find((s) => s.id === target.step);
  if (!step) return [];
  const ok = new Set(verified[target.capability] ?? []);
  const used = new Set<string>(step.agent ? [step.agent.ref] : []);
  const out: EveRebuildCandidate[] = [];
  for (const f of step.fallback ?? []) {
    if (!ok.has(f.ref) || used.has(f.ref)) continue;
    used.add(f.ref);
    out.push({ step: step.id, capability: target.capability, source: 'fallback', to: f });
  }
  for (const a of agents.filter((x) => x.capability === target.capability && ok.has(x.ref) && !used.has(x.ref)).sort(eveCompareAgents)) {
    used.add(a.ref);
    out.push({ step: step.id, capability: target.capability, source: 'verified', to: { ref: a.ref, version: a.version, tool: a.tool } });
  }
  out.push({ step: step.id, capability: target.capability, source: 'eve-build', to: null });
  return out;
}

/** 1 つの工程の部品を差し替えた新しい版。元は書き換えない。前の部品は fallback の先頭に残す（戻せるように）。 */
export function eveWithAgent(c: EveCombination, stepId: string, to: EveAgentRef, costYen?: number): EveCombination {
  if (!c.steps.some((s) => s.id === stepId)) throw new Error(`rebuild_step_missing:${stepId}`);
  const steps = c.steps.map((s): EveStep => {
    if (s.id !== stepId) return s;
    const fallback = [...(s.agent ? [s.agent] : []), ...(s.fallback ?? [])].filter((f) => f.ref !== to.ref).slice(0, 3);
    const { fallback: _f, costYen: _c, ...rest } = s;
    return { ...rest, agent: { ...to }, ...(fallback.length ? { fallback } : {}), ...(costYen !== undefined ? { costYen } : s.costYen !== undefined ? { costYen: s.costYen } : {}) };
  });
  return defineCombination({ ...c, version: c.version + 1, steps });
}

export type EveDiffLine = { step: string; field: 'agent' | 'fallback' | 'costYen'; before: unknown; after: unknown };

/** 版の差分（工程ごとの部品・控え・実費）。 */
export function eveCombinationDiff(a: EveCombination, b: EveCombination): EveDiffLine[] {
  const out: EveDiffLine[] = [];
  const before = new Map(a.steps.map((s) => [s.id, s]));
  for (const s of b.steps) {
    const o = before.get(s.id);
    for (const field of ['agent', 'fallback', 'costYen'] as const) {
      const x = o?.[field] ?? null;
      const y = s[field] ?? null;
      if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ step: s.id, field, before: x, after: y });
    }
  }
  return out;
}

export type EveRebuildProposal = {
  combinationId: string;
  fromVersion: number;
  toVersion: number;
  step: string;
  why: EveRebuildTarget['why'];
  source: 'fallback' | 'verified';
  from: EveAgentRef | null;
  to: EveAgentRef;
  beforeYen: number;
  afterYen: number;
  dryRun: { status: EvePaperResult['status']; costYen: number };
  diff: EveDiffLine[];
  combination: EveCombination;
};

export type EveRebuildResult = {
  proposals: EveRebuildProposal[];
  /** 確かめたエージェントが無いか、どれも良くならなかった工程。Eve が部品を作る（作った物は試験に通るまで使わない）。 */
  builds: { step: string; capability: string; reason: string }[];
  /** 固定して差し替えなかった工程。 */
  kept: { step: string; reason: string }[];
  /** 試して提案にならなかった物（1 回だけ試す。呼び直さない）。 */
  tried: { step: string; ref: string; reason: string }[];
  spentYen: number;
  notes: string[];
};

/** 改善が 20% 以上か。見込みが負の時も同じ幅で比べる（|前| の 2 割。|前| が 1 円未満なら 1 円の 2 割）。 */
export const eveRebuildImproves = (beforeYen: number, afterYen: number) => afterYen - beforeYen >= RECIPE_SWITCH_MARGIN * Math.max(Math.abs(beforeYen), 1);

/**
 * 作り直しの提案を作る。提案は本人が押すまで採用しない。
 * demand が無い組み合わせ（台帳に需要が無い）は、見込みの利益を比べられないので提案しない。
 */
export async function eveProposeRebuild(
  c: EveCombination,
  input: {
    score?: EveScorecard | null;
    dryRun?: EvePaperResult | null;
    agents: readonly EveAgentRecord[];
    verified: Readonly<Partial<Record<string, readonly string[]>>>;
    history?: EveStepHistory;
    demand: EveDemand | null;
    record?: EveSaleRecord;
    ownerMinuteValueYen?: number;
    sample: Readonly<Record<string, unknown>>;
    call: EveAgentCaller;
    versions?: Readonly<Record<string, string>>;
    now?: () => number;
  },
): Promise<EveRebuildResult> {
  const result: EveRebuildResult = { proposals: [], builds: [], kept: [], tried: [], spentYen: 0, notes: [] };
  const targets = eveRebuildTargets(c, input.score, input.dryRun);
  if (!targets.length) {
    if (input.score?.drop && !input.score.blame.length) result.notes.push(`「${input.score.drop.stage}」の段の前に、Eve が差し替えられる工程がありません（本人の工程か、相手の支払い待ち）。`);
    return result;
  }
  if (!input.demand) {
    result.notes.push('需要の台帳に需要が無いので、見込みの利益を比べられません。先に需要を足してください。');
    return result;
  }
  const opts = { record: input.record, ownerMinuteValueYen: input.ownerMinuteValueYen };
  const beforeYen = eveCombinationExpectedProfit(c, input.demand, input.agents, opts).profitYen;
  const costOf = new Map(input.agents.map((a) => [a.ref, a.costYen]));
  for (const target of targets) {
    if (streak(input.history?.[target.step]) >= RECIPE_FREEZE_STREAK) {
      result.kept.push({ step: target.step, reason: `${RECIPE_FREEZE_STREAK} 回続けて Jev に通っているので固定します。落ちている原因は、需要か出す場所の方にあります。` });
      continue;
    }
    const step = c.steps.find((s) => s.id === target.step)!;
    const stepProposals: EveRebuildProposal[] = [];
    for (const cand of eveRebuildCandidates(c, target, input.agents, input.verified)) {
      if (!cand.to) {
        if (!stepProposals.length) result.builds.push({ step: target.step, capability: target.capability, reason: '確かめたエージェントで良くならないので、Eve が部品を作ります（試験に通るまで使いません）。' });
        continue;
      }
      const next = eveWithAgent(c, target.step, cand.to, costOf.get(cand.to.ref));
      const need = next.steps.reduce((sum, s) => sum + (s.costYen ?? 0), 0);
      if (result.spentYen + need > c.budget.trialYen) {
        result.tried.push({ step: target.step, ref: cand.to.ref, reason: `試す予算 ${c.budget.trialYen} 円を超えるので、試していません。` });
        continue;
      }
      const run = await eveDryRun(next, { sample: input.sample, call: input.call, now: input.now, versions: input.versions });
      result.spentYen += Math.max(run.costYen, 0);
      // 見るのは差し替えた工程の結果（他の工程の部品がまだ無くても、この工程の良し悪しは分かる）。
      const mine = run.steps.find((s) => s.id === target.step);
      if (mine?.status !== 'ok') {
        result.tried.push({ step: target.step, ref: cand.to.ref, reason: `試運転で通りませんでした（${mine?.status ?? '?'}: ${mine?.reason ?? ''}）。` });
        continue;
      }
      const afterYen = eveCombinationExpectedProfit(next, input.demand, input.agents, opts).profitYen;
      if (!eveRebuildImproves(beforeYen, afterYen)) {
        result.tried.push({ step: target.step, ref: cand.to.ref, reason: `見込みの利益が ${beforeYen} 円 → ${afterYen} 円で、2 割以上は良くなりません。` });
        continue;
      }
      stepProposals.push({
        combinationId: c.id,
        fromVersion: c.version,
        toVersion: next.version,
        step: target.step,
        why: target.why,
        source: cand.source as 'fallback' | 'verified',
        from: step.agent ?? null,
        to: cand.to,
        beforeYen,
        afterYen,
        dryRun: { status: run.status, costYen: run.costYen },
        diff: eveCombinationDiff(c, next),
        combination: next,
      });
    }
    result.proposals.push(...stepProposals);
  }
  result.proposals.sort((a, b) => b.afterYen - a.afterYen || a.step.localeCompare(b.step) || a.to.ref.localeCompare(b.to.ref));
  return result;
}

export type EveAdoption = { combination: EveCombination; adoptedBy: string; at: string; fromVersion: number; step: string };

/** 提案を採用する。押すのは本人だけ（Eve は自分の作り直しを合格にしない）。新しい版を返す。元の版は残る。 */
export function eveAdoptRebuild(p: EveRebuildProposal, by: EveAuthor, at: string): EveAdoption {
  if (by.kind !== 'person') throw new Error('rebuild_adopt_owner_only');
  if (!Number.isFinite(Date.parse(at))) throw new Error('rebuild_adopt_time_invalid');
  return { combination: p.combination, adoptedBy: by.id, at: new Date(Date.parse(at)).toISOString(), fromVersion: p.fromVersion, step: p.step };
}

/** 組み合わせに書いた版と、相手の今の版が違う工程。違う相手へは、確かめ直すまで送らない（試運転は no-part で止まる）。 */
export function eveVersionDrift(c: EveCombination, live: Readonly<Record<string, string>>) {
  return c.steps
    .filter((s) => s.agent && Object.hasOwn(live, s.agent.ref) && live[s.agent.ref] !== s.agent.version)
    .map((s) => ({ step: s.id, ref: s.agent!.ref, pinned: s.agent!.version, live: live[s.agent!.ref] }));
}
