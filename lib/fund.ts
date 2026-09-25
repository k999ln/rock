export const fundTools = [
  'coconala',
  'mr-free-article',
  'mr-citations',
  'mr-delivery',
] as const;
export type FundPlan = {
  joined: boolean;
  weights: number[];
  revenue: number;
  commonCost: number;
  fx: number;
  members: number;
  myBoost: number;
  otherBoost: number;
  basePercent: number;
  boostPercent: number;
};
export const defaultFund: FundPlan = {
  joined: false,
  weights: [40, 25, 20, 15],
  revenue: 0,
  commonCost: 0,
  fx: 150,
  members: 1,
  myBoost: 0,
  otherBoost: 0,
  basePercent: 80,
  boostPercent: 10,
};
export function validateFund(value: unknown): FundPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('設定を確認してください。');
  const p = value as FundPlan;
  if (
    Object.keys(p).some((k) => !(k in defaultFund)) ||
    typeof p.joined !== 'boolean'
  )
    throw new Error('設定の形式が不正です。');
  for (const key of [
    'revenue',
    'commonCost',
    'fx',
    'members',
    'myBoost',
    'otherBoost',
    'basePercent',
    'boostPercent',
  ] as const) {
    if (!Number.isFinite(p[key]) || p[key] < 0 || p[key] > 100_000_000)
      throw new Error('数値は0以上で入力してください。');
  }
  if (
    p.fx <= 0 ||
    p.fx > 10000 ||
    !Number.isInteger(p.members) ||
    p.members < 1 ||
    p.members > 100000 ||
    p.basePercent + p.boostPercent > 100
  )
    throw new Error('参加人数・為替・分配率を確認してください。');
  if (
    !Array.isArray(p.weights) ||
    p.weights.length !== 4 ||
    p.weights.some((n) => !Number.isInteger(n) || n < 0 || n > 100) ||
    p.weights.reduce((a, b) => a + b, 0) !== 100
  )
    throw new Error('自動化への配分は、合計100%にしてください。');
  if (p.members === 1 && p.otherBoost > 0)
    throw new Error(
      '他の参加者の支援を試算する場合、参加人数を2人以上にしてください。',
    );
  return { ...p, weights: [...p.weights] };
}
export function distributeFund(value: FundPlan, legacyFixture = false) {
  const p = validateFund(value),
    revenue = Math.round(p.revenue),
    costs = Math.round(p.commonCost);
  const recovered = Math.min(revenue, costs),
    fee = legacyFixture
      ? Math.min(revenue - recovered, Math.round(8.88 * p.fx))
      : 0;
  const distributable = revenue - recovered - fee,
    base = Math.floor((distributable * p.basePercent) / 100),
    boost = Math.floor((distributable * p.boostPercent) / 100);
  const mineBase = Math.floor(base / p.members),
    otherBase = mineBase * (p.members - 1),
    support = p.myBoost + p.otherBoost;
  const mineBoost = support > 0 ? Math.floor((boost * p.myBoost) / support) : 0,
    othersBoost =
      support > 0 ? Math.floor((boost * p.otherBoost) / support) : 0;
  const mine = mineBase + mineBoost,
    others = otherBase + othersBoost,
    reserve = distributable - mine - others;
  return {
    revenue,
    recovered,
    fee,
    distributable,
    mine,
    others,
    reserve,
    mineBase,
    mineBoost,
    support,
    unrecovered: costs - recovered,
    share: distributable ? (mine / distributable) * 100 : 0,
  };
}
export type RunRecord = {
  id: string;
  tool: string;
  transport: 'browser' | 'local-mcp';
  status: 'completed' | 'failed';
  sample: boolean;
  durationMs: number;
  createdAt: string;
};
export type FundSnapshot = {
  plan: FundPlan;
  runs: RunRecord[];
  totalRuns: number;
  updatedAt: string | null;
};
