/**
 * 型への当てはめ（稼ぎ方の設計図 470 通り × 需要の台帳 × 確かめたエージェント）。task 130 段 4。
 *
 * 1. 設計図ごとに、狙える需要を台帳から探す（eveTemplateDemand）。
 * 2. 設計図の auto の工程に、確かめたエージェントを当てる（eveFitTemplate）。良い順は、実績の合格率 → 実費 → ref の順。
 *    次点の 2 つは fallback（作り直しの時に先に試す）。当てられない工程は gaps（Eve が作る・包む物）。
 * 3. 見込みの利益で並べる（eveRankTemplates）。学習・乱数なし。
 * 仕様: docs/services/eve-si.md
 */

import { acceptanceEstimate } from './sky-recipe-planner.ts';
import { NOAH_BUILTIN_CAPABILITIES, noahBlueprints, type NoahBlueprint } from './noah-business.ts';
import { EVE_OUTWARD_CAPABILITIES, defineCombination, eveCombinationFromBlueprint, eveCombinationProblems, eveCombinationStatus, type EveAuthor, type EveCombination, type EveCombinationStatus, type EveStep } from './eve-combination.ts';
import { eveSaleRate, type EveDemand, type EveSaleRecord } from './eve-demand.ts';
import type { EveTemplateSignature } from './eve-discover.ts';

/** Noah のエージェント 1 つの道具と、その実績（Jev が検収に通した数）。 */
export type EveAgentRecord = { ref: string; version: string; tool: string; capability: string; runs: number; accepted: number; costYen?: number };

/** 受注の技能（設計図）→ 売れる型（lib/sky-gig-offers.ts）。需要の台帳の gig の需要と結ぶ。 */
export const EVE_GIG_SKILL_OFFERS: Readonly<Record<string, readonly string[]>> = {
  writing: ['column-writing', 'listing-copy', 'manual-doc'],
  translation: ['short-translation'],
  'data-entry': ['data-table', 'csv-cleanup', 'transcript-notes'],
  web: ['small-webapp'],
  app: ['small-webapp'],
  'ai-setup': ['inquiry-bot', 'workflow-automation', 'sheet-automation'],
  research: ['research-report', 'survey-analysis'],
  'video-edit': ['video-script'],
};

/** 設計図の「作る」部分の能力の集合（規約の確認・外へ出す・成果を読む・続けるかの判断を除く）。発見した道との比較に使う。 */
export function eveTemplateSignatures(blueprints: readonly NoahBlueprint[] = noahBlueprints()): EveTemplateSignature[] {
  return blueprints.map((b) => ({
    blueprint: b.id,
    capabilities: [...new Set(b.steps.filter((s) => s.kind === 'auto' && s.capability && !s.id.startsWith('rules:') && !EVE_OUTWARD_CAPABILITIES.includes(s.capability) && s.capability !== 'tracking.results' && !NOAH_BUILTIN_CAPABILITIES.includes(s.capability as never)).map((s) => s.capability!))].sort(),
  }));
}

/** 設計図が狙える需要（台帳から）。見つからなければ空。 */
export function eveTemplateDemand(b: NoahBlueprint, ledger: readonly EveDemand[]): EveDemand[] {
  const [model, a, c] = b.id.split(':');
  const hit = (d: EveDemand) => {
    if (model === 'affiliate') return d.origin === 'affiliate' && d.outcome.startsWith(`conversion:${a}:`);
    if (model === 'gig') return d.origin === 'gig' && d.place === c && (EVE_GIG_SKILL_OFFERS[a] ?? []).some((o) => d.outcome === `delivery:${o}`);
    if (model === 'digital' || model === 'commerce') return d.origin === 'market' && d.place.toLowerCase() === c && d.outcome.startsWith(`${model}:`);
    return false;
  };
  return ledger.filter(hit).sort((x, y) => y.priceYen - x.priceYen || x.id.localeCompare(y.id));
}

/** エージェントの良い順（Jev の合格率の見積り → 実費 → ref）。 */
export const eveCompareAgents = (x: EveAgentRecord, y: EveAgentRecord) =>
  acceptanceEstimate({ capabilityId: y.ref, runs: y.runs, accepted: y.accepted }).mean - acceptanceEstimate({ capabilityId: x.ref, runs: x.runs, accepted: x.accepted }).mean
  || (x.costYen ?? 0) - (y.costYen ?? 0) || x.ref.localeCompare(y.ref);

/** 設計図の auto の工程に、確かめたエージェントを当てる。元の組み合わせは書き換えず、新しい物を返す。 */
export function eveFitTemplate(
  base: EveCombination,
  agents: readonly EveAgentRecord[],
  verified: Readonly<Partial<Record<string, readonly string[]>>>,
): { combination: EveCombination; filled: { step: string; ref: string }[]; gaps: { step: string; capability: string }[] } {
  const filled: { step: string; ref: string }[] = [];
  const gaps: { step: string; capability: string }[] = [];
  const steps = base.steps.map((s): EveStep => {
    if (s.kind !== 'auto' || s.glue || s.agent || !s.capability || NOAH_BUILTIN_CAPABILITIES.includes(s.capability as never) || base.keepForSelf.includes(s.id)) return s;
    const ok = new Set(verified[s.capability] ?? []);
    const ranked = agents.filter((x) => x.capability === s.capability && ok.has(x.ref)).sort(eveCompareAgents);
    if (!ranked.length) {
      gaps.push({ step: s.id, capability: s.capability });
      return s;
    }
    filled.push({ step: s.id, ref: ranked[0].ref });
    const ref = (x: EveAgentRecord) => ({ ref: x.ref, version: x.version, tool: x.tool });
    return { ...s, agent: ref(ranked[0]), ...(ranked.length > 1 ? { fallback: ranked.slice(1, 3).map(ref) } : {}), ...(ranked[0].costYen ? { costYen: ranked[0].costYen } : {}) };
  });
  return { combination: defineCombination({ ...base, steps }), filled, gaps };
}

/** 1 回あたり本人が使う分数の見積り（候補の数）。登録・規約の確認は最初の 1 回だけなので、ここには数えない。 */
export const EVE_OWNER_MINUTES = { tap: 2, review: 10, human: 5 } as const;
export function eveOwnerMinutesPerRun(c: EveCombination) {
  return c.steps.reduce((sum, s) => (s.kind === 'auto' || s.id.startsWith('signup:') || c.keepForSelf.includes(s.id) ? sum : sum + EVE_OWNER_MINUTES[s.kind]), 0);
}

/**
 * 組み合わせ 1 回の見込みの利益 ＝ 売れる見込み × 単価 × 工程が通る見込み − 実費 − 本人の分数 × 1 分の値段。
 * 工程が通る見込みは、auto の工程ごとの Jev の合格率の見積り（実績が無い部品は 1/2）の積。つなぎ目と決まった式は 1。
 */
export function eveCombinationExpectedProfit(
  c: EveCombination,
  demand: EveDemand,
  agents: readonly EveAgentRecord[],
  opts: { record?: EveSaleRecord; ownerMinuteValueYen?: number } = {},
) {
  const byRef = new Map(agents.map((a) => [a.ref, a]));
  const passRate = c.steps.reduce((p, s) => {
    if (s.kind !== 'auto' || s.glue || !s.capability || NOAH_BUILTIN_CAPABILITIES.includes(s.capability as never)) return p;
    const rec = s.agent ? byRef.get(s.agent.ref) : undefined;
    return p * acceptanceEstimate(rec ? { capabilityId: rec.ref, runs: rec.runs, accepted: rec.accepted } : undefined).mean;
  }, 1);
  const { rate, basis } = eveSaleRate(demand, opts.record);
  const costYen = c.steps.reduce((sum, s) => sum + (s.costYen ?? 0), 0);
  const ownerMinutes = eveOwnerMinutesPerRun(c);
  const profitYen = Math.floor(rate * demand.priceYen * passRate - costYen - ownerMinutes * (opts.ownerMinuteValueYen ?? 0));
  return { profitYen, passRate: Math.round(passRate * 1e6) / 1e6, saleRate: rate, saleBasis: basis, costYen, ownerMinutes };
}

export type EveTemplateRank = {
  blueprint: string;
  demandId: string;
  combination: EveCombination;
  status: EveCombinationStatus;
  gaps: { step: string; capability: string }[];
  passRate: number;
  saleRate: number;
  profitYen: number;
};

/** 型への当てはめを、見込みの利益の順に並べる。需要の無い設計図は並べない（狙う需要が無い型は、お金にならない）。 */
export function eveRankTemplates(input: {
  ledger: readonly EveDemand[];
  agents: readonly EveAgentRecord[];
  verified: Readonly<Partial<Record<string, readonly string[]>>>;
  author?: EveAuthor;
  ownerMinuteValueYen?: number;
  records?: Readonly<Record<string, EveSaleRecord>>;
  blueprints?: readonly NoahBlueprint[];
}): EveTemplateRank[] {
  const out: EveTemplateRank[] = [];
  for (const b of input.blueprints ?? noahBlueprints()) {
    if (b.hold) continue;
    for (const d of eveTemplateDemand(b, input.ledger)) {
      const skeleton = eveCombinationFromBlueprint(b, { author: input.author ?? { kind: 'eve' }, demand: { id: d.id, expectedPriceYen: d.priceYen } }).combination;
      const { combination, gaps } = eveFitTemplate({ ...skeleton, id: `${skeleton.id}:${d.id}`.slice(0, 96) }, input.agents, input.verified);
      const { profitYen, passRate, saleRate } = eveCombinationExpectedProfit(combination, d, input.agents, { record: input.records?.[d.id], ownerMinuteValueYen: input.ownerMinuteValueYen });
      const status = eveCombinationStatus(eveCombinationProblems(combination, { verified: input.verified, demand: input.ledger }));
      out.push({ blueprint: b.id, demandId: d.id, combination, status, gaps, passRate, saleRate, profitYen });
    }
  }
  return out.sort((x, y) => y.profitYen - x.profitYen || x.gaps.length - y.gaps.length || x.blueprint.localeCompare(y.blueprint) || x.demandId.localeCompare(y.demandId));
}
