// One open attempt per account. Keep the accepted terms even when the catalog changes.
export type BillingScope = { mode: 'test' | 'live'; accountId: string };
export type BillingEnv = Record<string, unknown>;

export function readComputeBillingScope(env: BillingEnv): BillingScope | null {
  const mode = env.NOAH_COMPUTE_BILLING_MODE;
  if (mode !== 'test' && mode !== 'live') return null;
  const prefix = mode === 'live' ? 'NOAH_COMPUTE_LIVE_' : 'NOAH_COMPUTE_TEST_';
  const accountId = env[prefix + 'STRIPE_ACCOUNT'];
  const key = env[prefix + 'STRIPE_KEY'];
  const secret = env[prefix + 'WEBHOOK_SECRET'];
  if (
    typeof accountId !== 'string' ||
    !/^acct_[A-Za-z0-9]+$/.test(accountId) ||
    typeof key !== 'string' ||
    !new RegExp('^(sk|rk)_' + mode + '_[A-Za-z0-9]+$').test(key) ||
    typeof secret !== 'string' ||
    !/^whsec_[A-Za-z0-9]+$/.test(secret)
  )
    return null;
  return { mode, accountId };
}
export type ComputePlan = {
  priceId: string;
  amountMinor: number;
  currency: string;
  merchant: string;
  monthlyJobs: number;
  termsVersion: string;
};
export type ComputeContract = {
  attempt: string;
  owner_scope: string;
  mode: BillingScope['mode'];
  stripe_account: string;
  created_at: number;
  price_id: string;
  amount_minor: number;
  currency: string;
  merchant: string;
  monthly_jobs: number;
  terms_version: string;
  stripe_customer_id: string | null;
  session_id: string | null;
  subscription_id: string | null;
  charge_id: string | null;
  status: 'pending' | 'active' | 'ending' | 'inactive';
  closed: number;
  period_start: number | null;
  period_end: number | null;
  revision: number;
  renewal_stopped: number;
  checked_at: number;
};
type Database = Pick<D1Database, 'prepare'>;
export type ContractSnapshot = {
  sessionId: string | null;
  subscriptionId: string | null;
  chargeId: string | null;
  status: ComputeContract['status'];
  closed: boolean;
  renewalStopped: boolean;
  periodStart: number | null;
  periodEnd: number | null;
};
export type ComputeBillingProvider = {
  validatePrice(plan: ComputePlan): Promise<void>;
  customer(row: ComputeContract): Promise<string>;
  checkout(
    row: ComputeContract,
  ): Promise<{ sessionId: string; url: string | null }>;
  inspect(row: ComputeContract): Promise<ContractSnapshot>;
  cancel(row: ComputeContract): Promise<void>;
};
export class PlanError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function contractFor(
  db: Database,
  ownerScope: string,
  scope: BillingScope,
) {
  return db
    .prepare(
      'SELECT * FROM noah_compute_subscriptions WHERE owner_scope=? AND mode=? AND stripe_account=? ORDER BY closed, created_at DESC LIMIT 1',
    )
    .bind(ownerScope, scope.mode, scope.accountId)
    .first<ComputeContract>();
}

export function planView(row: ComputeContract | null, now: number) {
  const entitled =
    !!row &&
    !row.closed &&
    (row.status === 'active' || row.status === 'ending') &&
    row.period_start !== null &&
    row.period_end !== null &&
    row.period_start <= now &&
    now < row.period_end;
  const status = !row
    ? 'none'
    : !entitled && (row.status === 'active' || row.status === 'ending')
      ? 'inactive'
      : row.status;
  return {
    status,
    entitled,
    attempt: row?.attempt ?? null,
    periodStart: row?.period_start ?? null,
    periodEnd: row?.period_end ?? null,
    monthlyJobs: row?.monthly_jobs ?? 0,
    renewalStopped: !!row?.renewal_stopped,
    canCancel: !!row?.subscription_id && !row.closed && !row.renewal_stopped,
  };
}
export async function sharedComputeEntitlement(
  db: Database,
  ownerScope: string,
  scope: BillingScope | null,
  now = Date.now(),
) {
  return planView(scope ? await contractFor(db, ownerScope, scope) : null, now);
}

export async function syncContract(
  db: Database,
  provider: ComputeBillingProvider,
  attempt: string,
  now = Date.now(),
) {
  // A later event may arrive before an older event or during the provider read.
  // Read the provider's CURRENT state again when a competing writer wins.
  for (let retry = 0; retry < 4; retry++) {
    const row = await db
      .prepare('SELECT * FROM noah_compute_subscriptions WHERE attempt=?')
      .bind(attempt)
      .first<ComputeContract>();
    if (!row || row.closed || !row.session_id) return row;
    const snap = await provider.inspect(row);
    const updated = await db
      .prepare(`UPDATE noah_compute_subscriptions SET subscription_id=?,charge_id=?,status=?,closed=?,
      period_start=?,period_end=?,renewal_stopped=?,checked_at=?,revision=revision+1 WHERE attempt=? AND revision=?`)
      .bind(
        snap.subscriptionId,
        snap.chargeId,
        snap.status,
        Number(snap.closed),
        snap.periodStart,
        snap.periodEnd,
        Number(snap.renewalStopped),
        now,
        attempt,
        row.revision,
      )
      .run();
    if (updated.meta.changes === 1)
      return {
        ...row,
        subscription_id: snap.subscriptionId,
        charge_id: snap.chargeId,
        status: snap.status,
        closed: Number(snap.closed),
        period_start: snap.periodStart,
        period_end: snap.periodEnd,
        renewal_stopped: Number(snap.renewalStopped),
        checked_at: now,
        revision: row.revision + 1,
      };
  }
  throw new PlanError('契約状況を更新中です。もう一度お試しください。', 503);
}

export async function beginCheckout(
  db: Database,
  provider: ComputeBillingProvider,
  owner: string,
  scope: BillingScope,
  plan: ComputePlan,
  now: number,
  pending?: ComputeContract,
) {
  if (
    !pending ||
    (!pending.session_id && now - pending.created_at < 23 * 3600_000)
  )
    await provider.validatePrice(plan);
  if (!pending)
    await db
      .prepare(`INSERT INTO noah_compute_subscriptions
    (attempt,owner_scope,mode,stripe_account,created_at,price_id,terms_version,merchant,amount_minor,currency,monthly_jobs) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT DO NOTHING`)
      .bind(
        crypto.randomUUID(),
        owner,
        scope.mode,
        scope.accountId,
        now,
        plan.priceId,
        plan.termsVersion,
        plan.merchant,
        plan.amountMinor,
        plan.currency,
        plan.monthlyJobs,
      )
      .run();
  let row = await contractFor(db, owner, scope);
  if (
    !row ||
    row.closed ||
    row.status !== 'pending' ||
    (pending && row.attempt !== pending.attempt)
  )
    throw new PlanError('現在の月額契約をご確認ください。', 409);
  if (row.terms_version !== plan.termsVersion)
    throw new PlanError('表示中の契約条件を確認してください。', 409);
  let result;
  try {
    if (!row.stripe_customer_id) {
      if (now - row.created_at >= 25 * 3600_000)
        throw new PlanError(
          '前回のお申込みは期限切れです。もう一度お試しください。',
          410,
        );
      const customerId = await provider.customer(row);
      const bound = await db
        .prepare(`UPDATE noah_compute_subscriptions SET stripe_customer_id=?,revision=revision+1
        WHERE attempt=? AND closed=0 AND status='pending' AND (stripe_customer_id IS NULL OR stripe_customer_id=?) RETURNING *`)
        .bind(customerId, row.attempt, customerId)
        .first<ComputeContract>();
      if (!bound)
        throw new PlanError(
          'お申込みの状態が変わりました。画面を更新してください。',
          409,
        );
      row = bound;
    }
    result = await provider.checkout(row);
  } catch (error) {
    if (error instanceof PlanError && error.status === 410) {
      await db
        .prepare(
          "UPDATE noah_compute_subscriptions SET status='inactive',closed=1,revision=revision+1 WHERE attempt=? AND session_id IS NULL AND revision=?",
        )
        .bind(row.attempt, row.revision)
        .run();
    }
    throw error;
  }
  await db
    .prepare(
      'UPDATE noah_compute_subscriptions SET session_id=?,revision=revision+1 WHERE attempt=? AND session_id IS NULL AND closed=0',
    )
    .bind(result.sessionId, row.attempt)
    .run();
  if (!result.url) {
    await syncContract(db, provider, row.attempt);
    throw new PlanError(
      'お申込みの状態が変わりました。契約状況を確認してください。',
      409,
    );
  }
  return result.url;
}
