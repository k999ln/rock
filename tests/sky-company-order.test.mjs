import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompanyOrderError,
  basicIncomeCoverage,
  checkOrderQuote,
  decideExecutionPlacement,
  settleCompanyOrder,
} from '../lib/sky-company-order.ts';

const open = { aiUse: 'allowed', dataMayLeaveCompany: true, containsPersonalOrSecretData: false, humanReviewRequired: false };
const order = (extra = {}) => ({
  orderId: 'order_001', cashReceivedMinor: 100_000, refundsMinor: 0, platformFeeMinor: 22_000,
  directCostsMinor: 8_000, reserveBps: 1_000, dividendBps: 5_000,
  contributions: [
    { id: 'c_001', participantRef: 'p_aya', kind: 'compute', acceptedUnits: 2_000, unitRateMinor: 1 },
    { id: 'c_002', participantRef: 'p_ben', kind: 'judgment', acceptedUnits: 40, unitRateMinor: 200 },
    { id: 'c_003', participantRef: 'p_aya', kind: 'referral', acceptedUnits: 1, unitRateMinor: 5_000 },
  ],
  dividendParticipants: ['p_aya', 'p_ben', 'p_cho'],
  ...extra,
});

void test('work leaves the company only when the customer allowed AI and outside handling', () => {
  assert.equal(decideExecutionPlacement(open).placement, 'grid_allowed');
  assert.equal(decideExecutionPlacement({ ...open, aiUse: 'unconfirmed' }).placement, 'blocked');
  assert.equal(decideExecutionPlacement({ ...open, aiUse: 'not_allowed' }).placement, 'blocked');
  assert.equal(decideExecutionPlacement({ ...open, dataMayLeaveCompany: false }).placement, 'company_only');
  const secret = decideExecutionPlacement({ ...open, containsPersonalOrSecretData: true, humanReviewRequired: true });
  assert.deepEqual([secret.placement, secret.humanReviewRequired], ['company_only', true]);
});

void test('received cash is split into fees, reserve, equal dividend and company share without a remainder', () => {
  const result = settleCompanyOrder(order());
  assert.equal(result.feesMinor, 15_000);
  assert.equal(result.reserveMinor, 10_000);
  assert.equal(result.surplusMinor, 45_000);
  assert.equal(result.dividendPoolMinor, 22_500);
  assert.equal(result.companyMinor, 22_500);
  assert.deepEqual(result.lines, [
    { participantRef: 'p_aya', feeMinor: 7_000, dividendMinor: 7_500, totalMinor: 14_500 },
    { participantRef: 'p_ben', feeMinor: 8_000, dividendMinor: 7_500, totalMinor: 15_500 },
    { participantRef: 'p_cho', feeMinor: 0, dividendMinor: 7_500, totalMinor: 7_500 },
  ]);
  const paid = result.lines.reduce((sum, line) => sum + line.totalMinor, 0);
  assert.equal(paid + 22_000 + 8_000 + result.reserveMinor + result.companyMinor, 100_000);
  assert.deepEqual([result.recordingAllowed, result.payoutAllowed], [false, false]);
});

void test('dividend rounding hands out single units by participant order, not input order', () => {
  const a = settleCompanyOrder(order({ contributions: [], platformFeeMinor: 0, directCostsMinor: 0, reserveBps: 0, dividendBps: 10_000, cashReceivedMinor: 100 }));
  const b = settleCompanyOrder(order({ contributions: [], platformFeeMinor: 0, directCostsMinor: 0, reserveBps: 0, dividendBps: 10_000, cashReceivedMinor: 100, dividendParticipants: ['p_cho', 'p_ben', 'p_aya'] }));
  assert.deepEqual(a.lines.map((line) => line.dividendMinor), [34, 33, 33]);
  assert.deepEqual(a.lines, b.lines);
});

void test('unpaid or refunded orders pay earned fees but never a dividend', () => {
  const result = settleCompanyOrder(order({ cashReceivedMinor: 30_000 }));
  assert.equal(result.dividendPoolMinor, 0);
  assert.equal(result.lines.find((line) => line.participantRef === 'p_cho').totalMinor, 0);
  assert.equal(result.lines.find((line) => line.participantRef === 'p_ben').feeMinor, 8_000);
  assert.equal(result.companyShortfallMinor, 18_000);
  assert.equal(result.companyMinor, -18_000);
  assert.throws(() => settleCompanyOrder(order({ refundsMinor: 100_001 })), CompanyOrderError);
});

void test('the same contribution cannot be counted twice', () => {
  const contributions = [...order().contributions, order().contributions[0]];
  assert.throws(() => settleCompanyOrder(order({ contributions })), (error) => error.code === 'CONTRIBUTION_ID');
  assert.throws(() => settleCompanyOrder(order({ dividendParticipants: ['p_aya', 'p_aya'] })), CompanyOrderError);
});

void test('a quote that cannot cover full fees is not acceptable', () => {
  const base = { grossMinor: 100_000, platformFeeMinor: 22_000, directCostsMinor: 8_000, reserveBps: 1_000 };
  assert.deepEqual(checkOrderQuote({ ...base, maximumFeesMinor: 60_000 }), { acceptable: true, reserveMinor: 10_000, remainingMinor: 0 });
  assert.equal(checkOrderQuote({ ...base, maximumFeesMinor: 60_001 }).acceptable, false);
});

void test('a monthly amount may be promised only up to what the worst real month covered', () => {
  // 3万人へ月8万円 = 月24億円の配当原資が要る。
  const target = basicIncomeCoverage({ monthlyDividendPoolsMinor: [3_000_000, 1_200_000, 2_400_000], participants: 30_000, targetPerPersonMinor: 80_000 });
  assert.equal(target.requiredMonthlyPoolMinor, 2_400_000_000);
  assert.equal(target.sustainablePerPersonMinor, 40);
  assert.equal(target.coverageBps, 5);
  assert.equal(target.promiseAllowed, false);
  const small = basicIncomeCoverage({ monthlyDividendPoolsMinor: [900_000, 800_000], participants: 10, targetPerPersonMinor: 80_000 });
  assert.deepEqual([small.promiseAllowed, small.monthlyGapMinor], [true, 0]);
});
