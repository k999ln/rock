/**
 * 組み合わせの地図と、お金になる組み合わせの発見。task 130 段 4。
 *
 * 地図: 素材の型を点、エージェント（とつなぎ目の変換）を「素材 A から素材 B を作る矢印」、
 * 需要を「この素材を、この値段で買う人がいる」という終点にする。組み合わせは、手元の素材から需要の終点までの道。
 *
 * 探し方は 2 つ（どちらも学習・乱数なし。同じ入力なら同じ結果）:
 * 1. 需要から逆算する（eveDiscoverFromDemand）: 終点を作れる矢印 → その入力を作れる矢印 → 手元の素材まで。
 *    道を探すのは、今ある工程の計画（lib/sky-recipe-planner.ts の planRecipes）。
 * 2. エージェントから順に広げる（eveDiscoverForward）: A の出力を入力にできる B → その先に需要の終点があるか。
 *    「A と B はつながる」という発見は、ここから出る。
 * 見つけた道が稼ぎ方の型（設計図）と同じなら template、型に無ければ discovered。
 * 並びは、見込みの利益（売れる見込み × 単価 × 工程が通る見込み − 実費 − 本人の手間の値段）。
 * 仕様: docs/services/eve-si.md
 */

import { RECIPE_TRIAL_INTERVAL, planRecipes, type RecipeCapability, type RecipeObservation } from './sky-recipe-planner.ts';
import { eveSaleRate, type EveDemand, type EveSaleRecord } from './eve-demand.ts';
import { EVE_COMBINATION_SCHEMA, defineCombination, type EveAuthor, type EveCombination, type EveStep } from './eve-combination.ts';

/** 地図の矢印（エージェント 1 つの道具、またはつなぎ目の変換）。 */
export type EveArrow = {
  /** エージェントの ref（Noah の id）。 */
  id: string;
  version: string;
  tool: string;
  /** 能力（lib/noah-business.ts の NOAH_CAPABILITIES の名前）。 */
  capability: string;
  consumes: readonly string[];
  produces: string;
  /** 能力をこなすと確かめたか（lib/eve-verify.ts）。確かめていない矢印は道に使わない。 */
  verified: boolean;
  costYen: number;
  /** 1 回あたり本人が使う分数（本人が押す・確かめる矢印だけ）。 */
  ownerMinutes: number;
  runs: number;
  accepted: number;
};

export type EveDiscovery = {
  key: string;
  origin: 'template' | 'discovered';
  /** 型と同じ道なら、その設計図の id。 */
  blueprint: string | null;
  demandId: string;
  arrows: readonly EveArrow[];
  costYen: number;
  ownerMinutes: number;
  /** 工程全体が 1 回で通る見込み（0〜1。実績が無い工程は 1/2 から始まる）。 */
  passRate: number;
  saleRate: number;
  saleBasis: 'record' | 'prior';
  /** 見込みの利益（1 回、円）。 */
  profitYen: number;
  reason: string;
};

/** 素材の型の書き方を、工程の計画が受け付ける形にそろえる（小文字・数字・-、英字で始まる、48 文字まで）。 */
export function eveMaterial(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '');
  return (/^[a-z]/u.test(s) ? s : `m-${s}`).slice(0, 48).replace(/-$/u, '') || 'm';
}

const toCapability = (a: EveArrow): RecipeCapability => ({
  id: a.id,
  name: `${a.capability}（${a.id}）`,
  kind: a.ownerMinutes > 0 ? 'owner' : 'tool',
  consumes: a.consumes.map(eveMaterial),
  produces: eveMaterial(a.produces),
  available: a.verified,
  costMinor: a.costYen,
  ownerMinutes: a.ownerMinutes,
  waitMinutes: 0,
  setupMinor: 0,
  setupOwnerMinutes: 0,
  installed: true,
});
const toObservation = (a: EveArrow): RecipeObservation => ({ capabilityId: a.id, runs: a.runs, accepted: a.accepted });

/** 型（設計図）の判定に使う、能力の名前の集合の印。 */
const signature = (caps: readonly string[]) => [...new Set(caps)].sort().join('|');
export type EveTemplateSignature = { blueprint: string; capabilities: readonly string[] };
const templateIndex = (templates: readonly EveTemplateSignature[] = []) => {
  const map = new Map<string, string>();
  for (const t of [...templates].sort((a, b) => a.blueprint.localeCompare(b.blueprint))) if (!map.has(signature(t.capabilities))) map.set(signature(t.capabilities), t.blueprint);
  return map;
};

export type EveDiscoverInput = {
  /** 手元にある素材の型。 */
  have: readonly string[];
  demand: readonly EveDemand[];
  arrows: readonly EveArrow[];
  /** 稼ぎ方の型（設計図の id と、auto の工程の能力の集合）。この集合と同じ道は template。 */
  templates?: readonly EveTemplateSignature[];
  /** 本人の 1 分の値段（円）。決まるまでは 0（手間の分数は理由に出す）。 */
  ownerMinuteValueYen?: number;
  /** 1 回の実費の上限（円）。 */
  budgetYen?: number;
  /** 需要ごとの実績（外部の記録で確定した物）。 */
  records?: Readonly<Record<string, EveSaleRecord>>;
};

function score(demand: EveDemand, arrows: readonly EveArrow[], passRate: number, input: EveDiscoverInput, templates: Map<string, string>): EveDiscovery {
  const costYen = arrows.reduce((s, a) => s + a.costYen, 0);
  const ownerMinutes = arrows.reduce((s, a) => s + a.ownerMinutes, 0);
  const { rate, basis } = eveSaleRate(demand, input.records?.[demand.id]);
  const profitYen = Math.floor(rate * demand.priceYen * passRate - costYen - ownerMinutes * (input.ownerMinuteValueYen ?? 0));
  const blueprint = templates.get(signature(arrows.map((a) => a.capability))) ?? null;
  return {
    key: `${demand.id}<=${arrows.map((a) => a.id).join('>')}`,
    origin: blueprint ? 'template' : 'discovered',
    blueprint,
    demandId: demand.id,
    arrows,
    costYen,
    ownerMinutes,
    passRate: Math.round(passRate * 10_000) / 10_000,
    saleRate: Math.round(rate * 10_000) / 10_000,
    saleBasis: basis,
    profitYen,
    reason: `${arrows.length} 工程、実費 ${costYen} 円、本人の手間 ${ownerMinutes} 分、売れる見込み ${Math.round(rate * 100)}%（${basis === 'record' ? '実績' : '控えめな見積り'}）× 単価 ${demand.priceYen} 円 × 工程が通る見込み ${Math.round(passRate * 100)}%。`,
  };
}
const rank = (a: EveDiscovery, b: EveDiscovery) => b.profitYen - a.profitYen || a.arrows.length - b.arrows.length || a.key.localeCompare(b.key);

/**
 * 需要から逆算して、組み合わせの候補を探す。届かない需要は、足りない素材（Eve が作る・包む物）と一緒に返す。
 */
export function eveDiscoverFromDemand(input: EveDiscoverInput): { candidates: EveDiscovery[]; gaps: { demandId: string; missingMaterials: string[] }[] } {
  const templates = templateIndex(input.templates);
  const byId = new Map(input.arrows.map((a) => [a.id, a]));
  const caps = input.arrows.map(toCapability);
  const obs = input.arrows.map(toObservation);
  const have = [...new Set(input.have.map(eveMaterial))];
  const candidates: EveDiscovery[] = [];
  const gaps: { demandId: string; missingMaterials: string[] }[] = [];
  for (const d of input.demand) {
    const want = eveMaterial(d.outcome);
    if (have.includes(want)) continue;
    const plan = planRecipes({ have, want, budgetMinor: input.budgetYen ?? 100_000_000, ownerMinuteValueMinor: input.ownerMinuteValueYen ?? 0, expectedRepeats: 10, keepForSelf: [] }, caps, obs);
    if (!plan.candidates.length) {
      gaps.push({ demandId: d.id, missingMaterials: plan.gap?.missingMaterials ?? [want] });
      continue;
    }
    for (const c of plan.candidates) candidates.push(score(d, c.steps.map((s) => byId.get(s.capabilityId)!), c.acceptanceRate, input, templates));
  }
  return { candidates: candidates.sort(rank), gaps: gaps.sort((a, b) => a.demandId.localeCompare(b.demandId)) };
}

/** A の出力を、そのまま入力にできる矢印（「A と B はつながる」）。確かめた物だけ。 */
export function eveNeighbors(a: EveArrow, arrows: readonly EveArrow[], have: readonly string[] = []): EveArrow[] {
  const available = new Set([eveMaterial(a.produces), ...have.map(eveMaterial)]);
  return arrows
    .filter((b) => b.id !== a.id && b.verified && b.consumes.map(eveMaterial).includes(eveMaterial(a.produces)) && b.consumes.every((m) => available.has(eveMaterial(m))))
    .sort((x, y) => x.id.localeCompare(y.id));
}

/**
 * エージェント A から順に広げて、その先にある需要の終点を探す。A を先頭に置いた道だけを返す。
 */
export function eveDiscoverForward(start: EveArrow, input: EveDiscoverInput): EveDiscovery[] {
  if (!start.verified) return [];
  const startOut = eveMaterial(start.produces);
  const others = input.arrows.filter((a) => a.id !== start.id);
  const { candidates } = eveDiscoverFromDemand({ ...input, have: [...input.have, startOut], arrows: others });
  const templates = templateIndex(input.templates);
  const demandById = new Map(input.demand.map((d) => [d.id, d]));
  const startPass = (start.accepted + 1) / (start.runs + 2);
  return candidates
    .filter((c) => c.arrows.some((a) => a.consumes.map(eveMaterial).includes(startOut)))
    .map((c) => score(demandById.get(c.demandId)!, [start, ...c.arrows], c.passRate * startPass, input, templates))
    .sort(rank);
}

/**
 * 今回試す候補を 1 つ選ぶ。5 回に 1 回は、実績の一番少ない道を試す（新しい組み合わせが、ずっと試されないままにならないように）。
 */
export function eveChooseCandidate(candidates: readonly EveDiscovery[], completedRuns: number): { candidate: EveDiscovery; mode: 'best' | 'trial' } | null {
  if (!candidates.length) return null;
  const best = candidates[0];
  if (completedRuns % RECIPE_TRIAL_INTERVAL === RECIPE_TRIAL_INTERVAL - 1) {
    const evidence = (c: EveDiscovery) => Math.min(...c.arrows.map((a) => a.runs));
    const trial = [...candidates].sort((a, b) => evidence(a) - evidence(b) || rank(a, b))[0];
    if (trial.key !== best.key) return { candidate: trial, mode: 'trial' };
  }
  return { candidate: best, mode: 'best' };
}

/**
 * 見つけた道を、組み合わせファイルにする。道の最後に、お金の出口までの工程（本人が確かめて出す → 成果・売上を読む → 入金を確かめる）を足す。
 * 「成果・売上を読む」の部品は、確かめた物が決まるまで空（paper）。
 */
export function eveCombinationFromDiscovery(d: EveDiscovery, demand: EveDemand, author: EveAuthor, budgetYen = 3_000): EveCombination {
  const steps: EveStep[] = [];
  const producer = new Map<string, string>();
  d.arrows.forEach((a, i) => {
    const id = `s${i + 1}`;
    const inputs = a.consumes.map(eveMaterial);
    const dataFrom = inputs.filter((m) => producer.has(m)).map((m) => ({ from: producer.get(m)!, material: m }));
    steps.push({
      id, label: `${a.capability} を ${a.id} でこなす`, kind: 'auto', capability: a.capability,
      after: [...new Set(dataFrom.map((x) => x.from))],
      agent: { ref: a.id, version: a.version, tool: a.tool },
      ...(a.costYen ? { costYen: a.costYen } : {}),
      flow: { inputs, outputs: [eveMaterial(a.produces)], ...(dataFrom.length ? { dataFrom } : {}) },
    });
    producer.set(eveMaterial(a.produces), id);
  });
  const outcome = eveMaterial(demand.outcome);
  const last = producer.get(outcome) ?? steps[steps.length - 1].id;
  if (demand.finance)
    steps.push({ id: 'finance-review', label: '金融の表現を確かめる', kind: 'review', reason: '金融商品の広告の決まり（本人が自分で確かめる）', after: [last], flow: { inputs: [outcome], outputs: ['金融表現の承認'], dataFrom: [{ from: last, material: outcome }], gate: true } });
  steps.push(
    { id: 'deliver', label: `${demand.place} へ出す・届ける`, kind: 'tap', reason: '外へ出す前に、本人が中身を確かめて押す', after: demand.finance ? [last, 'finance-review'] : [last], flow: { inputs: [outcome], outputs: ['外へ出した成果'], dataFrom: [{ from: last, material: outcome }] } },
    { id: 'track', label: '成果・売上を読む', kind: 'auto', capability: 'tracking.results', after: ['deliver'], flow: { inputs: ['外へ出した成果'], outputs: ['成果・売上の集計'], dataFrom: [{ from: 'deliver', material: '外へ出した成果' }] } },
    { id: 'payout', label: '入金を確かめる', kind: 'human', reason: '銀行の明細は本人の口座', after: ['track'], flow: { inputs: ['成果・売上の集計', '支払明細・銀行明細'], outputs: ['入金確認'], dataFrom: [{ from: 'track', material: '成果・売上の集計' }] } },
  );
  return defineCombination({
    schema: EVE_COMBINATION_SCHEMA,
    id: `${d.origin}:${demand.id}:${d.arrows.map((a) => a.id).join('-')}`.toLowerCase().replace(/[^a-z0-9:._-]/gu, '-').slice(0, 96),
    version: 1,
    title: `${demand.label} を、${d.arrows.length} つのエージェントをつないで作る`.slice(0, 120),
    blueprint: d.blueprint,
    origin: d.origin,
    demand: { id: demand.id, expectedPriceYen: demand.priceYen },
    author,
    finance: demand.finance,
    keepForSelf: [],
    budget: { perRunYen: Math.max(budgetYen, d.costYen), trialYen: Math.max(budgetYen, d.costYen) },
    steps,
    exit: { step: 'payout', material: '入金確認', source: `${demand.place} の明細と、銀行の入金`, counts: 'approved-or-paid' },
  });
}
