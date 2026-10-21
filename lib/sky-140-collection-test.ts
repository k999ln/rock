import type Stripe from 'stripe';
import { WorkError } from './workflow.ts';
import { sky140Plan } from './sky-plan-estimate.ts';

/** Sandbox acceptance policy only. Not a paid Agent authorization or production contract. */
export const SKY140_TEST_VERSION = 'sky140-postpaid-sandbox-v1';
export const SKY140_MONTHLY_MINOR = sky140Plan.monthlyUsd * 100;
export const SKY140_USAGE_MINOR = sky140Plan.proposedUsageUsd * 100;
export type PlanTestContract = {
  id: string; owner: string; account: string; customer: string;
  consentVersion: string | null; creditMinor: number;
  state: 'active' | 'cancelled' | 'disputed';
  invoices: Array<{ id: string; period: string }>;
};
export type PlanTestBudget = { settledMinor: number; reservedMinor: number };
type InvoiceReadback = Pick<Stripe.Invoice, 'id' | 'livemode' | 'customer' | 'currency' | 'total' | 'amount_paid' | 'amount_remaining' | 'status' | 'metadata'>;
function nonnegative(value: number) { return Number.isSafeInteger(value) && value >= 0; }

/** Closing a complete UTC service month bills the flat fee, never fee + included usage. */
export function sky140TestMonthCharge(period: string, now: number, usage: PlanTestBudget) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !Number.isFinite(now))
    throw new WorkError('テスト請求期間が不正です。', 409);
  const end = Date.parse(`${period}-01T00:00:00.000Z`);
  const next = new Date(end); next.setUTCMonth(next.getUTCMonth() + 1);
  if (now < next.getTime()) throw new WorkError('後払い期間がまだ終了していません。', 409);
  if (!nonnegative(usage.settledMinor) || !nonnegative(usage.reservedMinor) ||
      usage.reservedMinor !== 0 || usage.settledMinor > SKY140_USAGE_MINOR)
    throw new WorkError('未確定予約または利用枠超過を照合してください。', 409);
  return { fixedMinor: SKY140_MONTHLY_MINOR, includedUsageMinor: usage.settledMinor, extraUsageChargeMinor: 0 };
}

/** Input readbacks must come from Stripe, never webhook payload/browser status alone. */
export function sky140TestAccess(contract: PlanTestContract, owner: string, account: string,
  readbacks: InvoiceReadback[], budget: PlanTestBudget, requestedMinor: number) {
  const blocked = (reason: string) => ({ allowed: false, reason, exportAllowed: true, paymentAllowed: true, productionAuthorized: false });
  if (contract.owner !== owner || contract.account !== account) return blocked('identity_mismatch');
  if (contract.consentVersion !== SKY140_TEST_VERSION) return blocked('consent_required');
  if (contract.state !== 'active') return blocked(contract.state);
  if (!nonnegative(contract.creditMinor) || contract.creditMinor !== SKY140_MONTHLY_MINOR) return blocked('finite_test_credit_required');
  if (!nonnegative(budget.settledMinor) || !nonnegative(budget.reservedMinor) || !nonnegative(requestedMinor)) return blocked('invalid_budget');
  if (budget.settledMinor + budget.reservedMinor + requestedMinor > SKY140_USAGE_MINOR) return blocked('quota_exceeded');
  if (new Set(contract.invoices.map(i => i.id)).size !== contract.invoices.length ||
      new Set(contract.invoices.map(i => i.period)).size !== contract.invoices.length ||
      new Set(readbacks.map(i => i.id)).size !== readbacks.length || readbacks.length !== contract.invoices.length)
    return blocked('invoice_set_mismatch');
  for (const expected of contract.invoices) {
    const remote = readbacks.find(i => i.id === expected.id);
    if (!remote || remote.livemode !== false || remote.customer !== contract.customer || remote.currency !== 'usd' ||
        remote.total !== SKY140_MONTHLY_MINOR || remote.metadata?.sky140_contract !== contract.id ||
        remote.metadata?.sky140_period !== expected.period || remote.metadata?.sky140_version !== SKY140_TEST_VERSION)
      return blocked('invoice_mismatch');
    if (remote.status !== 'paid' || remote.amount_paid !== SKY140_MONTHLY_MINOR || remote.amount_remaining !== 0)
      return blocked('unpaid_or_unknown');
  }
  return { allowed: true, reason: 'sandbox_only', exportAllowed: true, paymentAllowed: true, productionAuthorized: false };
}

export async function readSky140TestAccess(stripe: Stripe, contract: PlanTestContract, owner: string,
  budget: PlanTestBudget, requestedMinor: number) {
  const account = await stripe.accounts.retrieve(null);
  if (account.id !== contract.account) throw new WorkError('Sandboxが一致しません。', 409);
  // A failed read throws: callers must not keep an older allowed result.
  const invoices = await Promise.all(contract.invoices.map(i => stripe.invoices.retrieve(i.id)));
  return sky140TestAccess(contract, owner, account.id, invoices, budget, requestedMinor);
}
