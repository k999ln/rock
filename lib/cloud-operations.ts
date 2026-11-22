import { utcMonth } from './cloud-cost.ts';

export const CLOUD_PROBE_INTERVAL_MS = 5 * 60 * 1000;
export const CLOUD_FIRST_RESULT_SLO_MS = 30_000;

const incidentRoutes = {
  data_loss: 'wake_now',
  money: 'wake_now',
  safety: 'wake_now',
  other: 'morning_digest',
} as const;

export function routeCloudIncident(kind: keyof typeof incidentRoutes) {
  return incidentRoutes[kind];
}

export type CloudBudgetEnv = {
  CLOUD_MONTHLY_CAP_USD?: string;
  CLOUD_USER_MONTHLY_CAP_USD?: string;
};

export type CloudBudget = { totalUsd: number; userUsd: number };
type BudgetDb = Pick<D1Database, 'prepare'>;
type Spend = { totalUsd: number; userUsd: number; unpriced: number };

export const CLOUD_BUDGET_MESSAGES = {
  CLOUD_MONTHLY_CAP_REACHED: 'クラウド全体の月間費用が上限に達したため、新しい実行を受付できません。',
  CLOUD_USER_MONTHLY_CAP_REACHED: 'あなたのクラウド月間費用が上限に達したため、新しい実行を受付できません。',
  CLOUD_CAP_UNAVAILABLE: 'クラウドの費用上限を確認できないため、新しい実行を受付できません。',
} as const;

export class CloudBudgetError extends Error {
  readonly code: keyof typeof CLOUD_BUDGET_MESSAGES;

  constructor(code: CloudBudgetError['code']) {
    super(CLOUD_BUDGET_MESSAGES[code]);
    this.code = code;
  }
}

function cap(value: string): number {
  if (!/^\d+(\.\d{1,6})?$/u.test(value) || !Number.isFinite(Number(value))) {
    throw new CloudBudgetError('CLOUD_CAP_UNAVAILABLE');
  }
  return Number(value);
}

export function cloudBudget(env: CloudBudgetEnv): CloudBudget {
  const totalUsd = cap(env.CLOUD_MONTHLY_CAP_USD ?? '30');
  return {
    totalUsd,
    userUsd: env.CLOUD_USER_MONTHLY_CAP_USD === undefined ? totalUsd : cap(env.CLOUD_USER_MONTHLY_CAP_USD),
  };
}

const spendSql = `SELECT
  ROUND(COALESCE(SUM(cost_usd), 0), 6) AS totalUsd,
  ROUND(COALESCE(SUM(CASE WHEN user_id = ? THEN cost_usd END), 0), 6) AS userUsd,
  COUNT(*) - COUNT(cost_usd) AS unpriced
  FROM cloud_usage_records WHERE observed_at >= ? AND observed_at <= ?`;

function spendBindings(owner: string, now: number) {
  return [owner, Date.parse(`${utcMonth(now)}-01T00:00:00Z`), now];
}

// Bind this predicate to the same statement that admits a new execution.
export function cloudAdmissionGuard(owner: string, now: number, budget?: CloudBudget) {
  if (!budget) return { sql: '', bindings: [] };
  return {
    sql: `AND EXISTS (SELECT 1 FROM (${spendSql}) WHERE totalUsd < ? AND userUsd < ? AND unpriced = 0)`,
    bindings: [...spendBindings(owner, now), budget.totalUsd, budget.userUsd],
  };
}

export async function readCloudSpend(db: BudgetDb, owner: string, now: number) {
  const spend = await db.prepare(spendSql).bind(...spendBindings(owner, now)).first<Spend>();
  if (!spend) throw new CloudBudgetError('CLOUD_CAP_UNAVAILABLE');
  return spend;
}

export async function assertCloudBudget(db: BudgetDb, owner: string, now: number, budget?: CloudBudget) {
  if (!budget) return;
  const spend = await readCloudSpend(db, owner, now).catch(() => {
    throw new CloudBudgetError('CLOUD_CAP_UNAVAILABLE');
  });
  if (spend.totalUsd >= budget.totalUsd) throw new CloudBudgetError('CLOUD_MONTHLY_CAP_REACHED');
  if (spend.userUsd >= budget.userUsd) {
    throw new CloudBudgetError('CLOUD_USER_MONTHLY_CAP_REACHED');
  }
  if (spend.unpriced > 0) throw new CloudBudgetError('CLOUD_CAP_UNAVAILABLE');
}

export function cloudBudgetResponse(error: CloudBudgetError, details?: { preSend: true }) {
  return Response.json({ ...details, code: error.code, error: error.message }, {
    status: error.code === 'CLOUD_CAP_UNAVAILABLE' ? 503 : 429,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
