import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  BILLING_TOKEN_TTL_SECONDS,
  createBillingToken,
  verifyBillingToken,
} from '../lib/billing-token.ts';
import {
  assertMonthlyPrice,
  currentPeriodEnd,
  invoicePeriod,
  stripeCustomerId,
  stripeSubscriptionId,
  stripeUserId,
  subscriptionPriceId,
} from '../services/sky-billing/src/domain.ts';
import { verifyStripeSignature } from '../services/sky-billing/src/stripe-signature.ts';

const sharedSecret = 'test-only-shared-secret-with-at-least-32-bytes';
const tokenId = '018f47a5-d4db-7c7b-a0db-0a0f00bada55';

void test('billing token binds user, audience, expiry and token id', async () => {
  const token = await createBillingToken(
    'user-123',
    sharedSecret,
    1000,
    tokenId,
  );
  const payload = await verifyBillingToken(token, sharedSecret, 1001);
  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.jti, tokenId);
  assert.equal(payload.exp - payload.iat, BILLING_TOKEN_TTL_SECONDS);
  await assert.rejects(() => verifyBillingToken(token, sharedSecret, 1300));
  const altered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  await assert.rejects(() => verifyBillingToken(altered, sharedSecret, 1001));
});

void test('Stripe signature accepts the raw matching payload once and rejects changes', async () => {
  const raw = JSON.stringify({ id: 'evt_test', type: 'invoice.paid' });
  const timestamp = 2000;
  const secret = 'whsec_test';
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${raw}`)
    .digest('hex');
  const header = `t=${timestamp},v1=bad,v1=${digest}`;
  await verifyStripeSignature(raw, header, secret, timestamp);
  await assert.rejects(() =>
    verifyStripeSignature(`${raw} `, header, secret, timestamp),
  );
  await assert.rejects(() =>
    verifyStripeSignature(raw, header, secret, timestamp + 301),
  );
});

void test('configured Stripe price must remain exactly USD 8.88 every month', () => {
  const price = {
    id: 'price_sky',
    active: true,
    currency: 'usd',
    unit_amount: 888,
    type: 'recurring',
    recurring: { interval: 'month', interval_count: 1 },
  };
  assert.equal(assertMonthlyPrice(price, 'price_sky'), price);
  for (const changed of [
    { ...price, unit_amount: 889 },
    { ...price, currency: 'jpy' },
    { ...price, active: false },
    { ...price, recurring: { interval: 'year', interval_count: 1 } },
  ])
    assert.throws(() => assertMonthlyPrice(changed, 'price_sky'));
});

void test('current and newer Stripe event shapes resolve the same billing identity', () => {
  const checkout = {
    customer: 'cus_one',
    subscription: 'sub_one',
    client_reference_id: 'sky-user',
  };
  assert.equal(stripeCustomerId(checkout), 'cus_one');
  assert.equal(stripeSubscriptionId(checkout), 'sub_one');
  assert.equal(stripeUserId(checkout), 'sky-user');
  const invoice = {
    customer: { id: 'cus_two' },
    parent: {
      subscription_details: {
        subscription: 'sub_two',
        metadata: { sky_user_id: 'new-user' },
      },
    },
    lines: {
      data: [{ price: { id: 'price_sky' }, period: { start: 10, end: 20 } }],
    },
  };
  assert.equal(stripeSubscriptionId(invoice), 'sub_two');
  assert.equal(stripeUserId(invoice), 'new-user');
  assert.equal(subscriptionPriceId(invoice), 'price_sky');
  assert.deepEqual(invoicePeriod(invoice), { start: 10, end: 20 });
  assert.equal(
    subscriptionPriceId({
      lines: {
        data: [
          {
            pricing: { price_details: { price: 'price_clover' } },
            period: { start: 21, end: 31 },
          },
        ],
      },
    }),
    'price_clover',
  );
  const subscription = {
    items: {
      data: [{ price: { id: 'price_sky' }, current_period_end: 30 }],
    },
  };
  assert.equal(subscriptionPriceId(subscription), 'price_sky');
  assert.equal(currentPeriodEnd(subscription), 30);
});
