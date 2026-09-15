import assert from 'node:assert/strict';
import test from 'node:test';
import {
  csvJstMonth,
  csvBuyerPaymentQuoteMismatch,
  csvMonthlyNetForMonth,
  csvPaymentEvent,
  csvPaymentProjection,
  csvPaymentWebhookSignature,
  verifyCsvPaymentWebhook,
} from '../lib/csv-money.ts';

const base = {
  provider: 'market-a',
  jobId: '11111111-1111-4111-8111-111111111111',
  currency: 'USD',
  occurredAt: Date.parse('2026-09-15T01:00:00.000Z'),
  evidenceDigest: 'a'.repeat(64),
  source: 'provider',
};
const event = (providerEventId, type, amountMinor, overrides = {}) => ({
  ...base,
  providerEventId,
  type,
  amountMinor,
  ...overrides,
});
const afterTestEvents = Date.parse('2026-10-03T00:00:00.000Z');

await test('payment projection deduplicates exact events and is arrival-order independent', () => {
  const paid = event('paid-1', 'buyer_paid', 3000);
  const payout = event('payout-1', 'paid_to_owner', 3000);
  const refund = event('refund-1', 'refund', 1000, {
    relatedProviderEventId: 'payout-1',
    relatedEventType: 'paid_to_owner',
    occurredAt: Date.parse('2026-10-02T01:00:00.000Z'),
  });
  const expected = {
    status: 'paid_to_owner',
    currency: 'USD',
    amountsByCurrency: {
      USD: {
        paidMinor: 3000,
        providerFeeMinor: 0,
        refundedMinor: 1000,
        ownerPayoutMinor: 3000,
        verifiedNetMinor: 2000,
        buyerRefundedMinor: 0,
        payoutAdjustedMinor: 1000,
      },
    },
  };
  assert.deepEqual(
    csvPaymentProjection([refund, payout, paid, paid], afterTestEvents),
    expected,
  );
  assert.deepEqual(
    csvPaymentProjection([paid, payout, refund], afterTestEvents),
    expected,
  );
});

await test('a refund delivered before its payout is held and reconciles after the payout arrives', () => {
  const refund = event('refund-late-delivery', 'refund', 3000, {
    relatedProviderEventId: 'payout-original',
    relatedEventType: 'paid_to_owner',
    occurredAt: Date.parse('2026-10-02T01:00:00.000Z'),
  });
  const payout = event('payout-original', 'paid_to_owner', 3000, {
    occurredAt: Date.parse('2026-09-15T01:00:00.000Z'),
  });
  assert.equal(
    csvPaymentProjection([refund], afterTestEvents).amountsByCurrency.USD
      .verifiedNetMinor,
    0,
  );
  assert.equal(csvPaymentProjection([refund, payout], afterTestEvents).status, 'paid_to_owner');
  assert.equal(
    csvPaymentProjection([payout, refund], afterTestEvents).amountsByCurrency.USD
      .verifiedNetMinor,
    0,
  );
  assert.equal(
    csvMonthlyNetForMonth([refund], '2026-09', afterTestEvents).verifiedNetUsdMinor,
    null,
  );
});

await test('manual verification is visible but never fee-eligible provider income', () => {
  const manual = event('manual-paid-1', 'paid_to_owner', 5000, {
    source: 'manual_verified',
  });
  assert.equal(csvPaymentProjection([manual]).status, 'manual_verified');
  assert.deepEqual(csvMonthlyNetForMonth([manual], '2026-09'), {
      monthJst: '2026-09',
      verifiedNetUsdMinor: null,
      evidenceIds: [],
      fxRequired: false,
      needsReview: false,
      noProviderEvidence: true,
  });
  const providerPayout = event('provider-payout', 'paid_to_owner', 4000);
  const manualRefund = event('manual-refund', 'refund', 1000, {
    source: 'manual_verified',
    relatedProviderEventId: 'provider-payout',
    relatedEventType: 'paid_to_owner',
    occurredAt: Date.parse('2026-10-02T01:00:00.000Z'),
  });
  assert.equal(
    csvMonthlyNetForMonth(
      [providerPayout, manualRefund],
      '2026-09',
      afterTestEvents,
    ).verifiedNetUsdMinor,
    3000,
  );
  assert.equal(
    csvPaymentProjection([providerPayout, manualRefund], afterTestEvents)
      .amountsByCurrency.USD.verifiedNetMinor,
    3000,
  );
});

await test('per-job ledger keeps payment and payout totals separate across currencies', () => {
  const buyerPaidJpy = event('buyer-jpy', 'buyer_paid', 300_000, {
    currency: 'JPY',
  });
  const payoutUsd = event('payout-usd', 'paid_to_owner', 2500, {
    currency: 'USD',
  });
  const refundUsd = event('refund-usd', 'refund', 500, {
    currency: 'USD',
    relatedProviderEventId: 'payout-usd',
    relatedEventType: 'paid_to_owner',
    occurredAt: Date.parse('2026-10-02T01:00:00.000Z'),
  });
  const projection = csvPaymentProjection(
    [buyerPaidJpy, payoutUsd, refundUsd],
    afterTestEvents,
  );
  assert.equal(projection.status, 'paid_to_owner');
  assert.equal(projection.currency, null);
  assert.deepEqual(projection.amountsByCurrency, {
    JPY: {
      paidMinor: 300_000,
      providerFeeMinor: 0,
      refundedMinor: 0,
      ownerPayoutMinor: 0,
      verifiedNetMinor: 0,
      buyerRefundedMinor: 0,
      payoutAdjustedMinor: 0,
    },
    USD: {
      paidMinor: 0,
      providerFeeMinor: 0,
      refundedMinor: 500,
      ownerPayoutMinor: 2500,
      verifiedNetMinor: 2000,
      buyerRefundedMinor: 0,
      payoutAdjustedMinor: 500,
    },
  });
});

await test('monthly fee income aggregates multiple providers, applies later refunds to original JST month, and ignores duplicates', () => {
  const first = event('market-a-payout', 'paid_to_owner', 1800, {
    provider: 'market-a',
    occurredAt: Date.parse('2026-09-30T14:59:59.000Z'), // Sep 30 in Tokyo
  });
  const second = event('market-b-payout', 'paid_to_owner', 1300, {
    provider: 'market-b',
    occurredAt: Date.parse('2026-09-30T15:00:00.000Z'), // Oct 1 in Tokyo
  });
  const laterRefund = event('market-a-refund', 'refund', 200, {
    provider: 'market-a',
    relatedProviderEventId: 'market-a-payout',
    relatedEventType: 'paid_to_owner',
    occurredAt: Date.parse('2026-10-01T00:00:00.000Z'),
  });
  assert.deepEqual(
    csvMonthlyNetForMonth(
      [first, second, laterRefund, first],
      '2026-09',
      afterTestEvents,
    ),
    {
      monthJst: '2026-09',
      verifiedNetUsdMinor: 1600,
      evidenceIds: ['market-a:market-a-payout', 'market-a:market-a-refund'],
      fxRequired: false,
      needsReview: false,
      noProviderEvidence: false,
    },
  );
  assert.equal(
    csvMonthlyNetForMonth(
      [first, second, laterRefund],
      '2026-10',
      afterTestEvents,
    )
      .verifiedNetUsdMinor,
    1300,
  );
});

await test('foreign-currency payout and over-refund require review instead of guessing', () => {
  const jpyPayout = event('jpy', 'paid_to_owner', 300_000, {
    currency: 'JPY',
  });
  assert.equal(csvMonthlyNetForMonth([jpyPayout], '2026-09').fxRequired, true);
  assert.equal(csvMonthlyNetForMonth([jpyPayout], '2026-09').verifiedNetUsdMinor, null);
  const payout = event('payout', 'paid_to_owner', 1000);
  const tooMuch = event('refund', 'refund', 1001, {
    relatedProviderEventId: 'payout',
    relatedEventType: 'paid_to_owner',
  });
  assert.equal(csvMonthlyNetForMonth([payout, tooMuch], '2026-09').needsReview, true);
});

await test('conflicting duplicates, unrelated refunds, and invalid fields fail closed', () => {
  assert.throws(
    () =>
      csvPaymentProjection([
        event('same', 'buyer_paid', 3000),
        event('same', 'buyer_paid', 1),
      ]),
    /PAYMENT_EVENT_CONFLICT/,
  );
  assert.throws(
    () =>
      csvPaymentProjection([
        event('payout', 'paid_to_owner', 3000),
        event('refund', 'refund', 100, {
          relatedProviderEventId: 'payout',
          relatedEventType: 'paid_to_owner',
          jobId: '22222222-2222-4222-8222-222222222222',
        }),
      ]),
    /PAYMENT_REFUND_MISMATCH/,
  );
  assert.throws(
    () => csvPaymentEvent({ ...event('future', 'buyer_paid', 1), extra: 1 }),
    /PAYMENT_EVENT_FIELDS/,
  );
  assert.throws(
    () => csvPaymentEvent(event('refund-without-link', 'refund', 1)),
    /PAYMENT_EVENT_REQUIRES_ORIGINAL/,
  );
});

await test('buyer refunds and disputes block orders even before payout events', () => {
  const buyer = event('buyer-charge', 'buyer_paid', 3000, { currency: 'JPY' });
  const refund = event('buyer-refund', 'refund', 500, {
    relatedProviderEventId: buyer.providerEventId,
    relatedEventType: 'buyer_paid',
    currency: 'JPY',
  });
  const dispute = event('buyer-dispute', 'disputed', 0, {
    relatedProviderEventId: buyer.providerEventId,
    relatedEventType: 'buyer_paid',
    currency: 'JPY',
  });
  assert.equal(csvPaymentProjection([buyer, refund]).status, 'partially_refunded');
  assert.equal(csvPaymentProjection([refund]).status, 'payment_review');
  assert.equal(csvPaymentProjection([buyer, dispute]).status, 'disputed');
});

await test('buyer quote reconciliation uses the exact JPY minor unit amount', () => {
  const exact = event('buyer-jpy-exact', 'buyer_paid', 3000, { currency: 'JPY' });
  assert.equal(csvBuyerPaymentQuoteMismatch([exact], 3000, 'JPY'), null);
  assert.equal(csvBuyerPaymentQuoteMismatch([event('small', 'buyer_paid', 2999, { currency: 'JPY' })], 3000, 'JPY'), 'buyer_payment_amount');
  assert.equal(csvBuyerPaymentQuoteMismatch([event('wrong-currency', 'buyer_paid', 3000)], 3000, 'JPY'), 'buyer_payment_currency');
});

await test('JST month boundaries are explicit and stable', () => {
  assert.equal(csvJstMonth(Date.parse('2026-09-30T14:59:59.000Z')), '2026-09');
  assert.equal(csvJstMonth(Date.parse('2026-09-30T15:00:00.000Z')), '2026-10');
});

await test('payment webhook requires a fresh HMAC signature over the exact body', async () => {
  const secret = 'test-only-secret';
  const now = Date.parse('2026-09-15T12:00:00.000Z');
  const body = JSON.stringify({ event: 'paid', amount: 3000 });
  const signature = await csvPaymentWebhookSignature(secret, now / 1000, body);
  assert.equal(await verifyCsvPaymentWebhook(secret, signature, body, now), true);
  assert.equal(await verifyCsvPaymentWebhook(secret, signature, `${body} `, now), false);
  assert.equal(await verifyCsvPaymentWebhook(secret, signature, body, now + 301_000), false);
  assert.equal(await verifyCsvPaymentWebhook('', signature, body, now), false);
});
