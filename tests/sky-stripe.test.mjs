import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readSkyStripeConfig,
  skyStripe,
  SkyPaymentError,
  SKY_STRIPE_API_VERSION,
} from '../lib/sky-stripe.ts';

const env = {
  SKY_PAYMENTS_MODE: 'test',
  SKY_STRIPE_SECRET_KEY: 'sk_test_fixture',
  SKY_STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
  SKY_PAYMENT_ORIGIN: 'http://localhost:3107',
};
const order = {
  id: 'order-123',
  packageKey: 'tool@1',
  name: '記事作成Tool',
  amountMinor: 10_000,
  commissionMinor: 1_000,
  currency: 'jpy',
  accountId: 'acct_seller',
};

function mockedStripe(responses) {
  const calls = [];
  const client = skyStripe(readSkyStripeConfig(env), async (url, init) => {
    calls.push({ url: new URL(url), ...init, fields: new URLSearchParams(init.body) });
    const next = responses.shift();
    assert.ok(next, 'unexpected extra payment request');
    return Response.json(next);
  });
  return { client, calls };
}

void test('payment configuration requires an explicit matching mode, secrets and trusted return origin', () => {
  assert.equal(readSkyStripeConfig(env).origin, env.SKY_PAYMENT_ORIGIN);
  assert.equal(readSkyStripeConfig({ ...env, SKY_PAYMENT_ORIGIN: 'http://127.0.0.1:3000/' }).origin, 'http://127.0.0.1:3000');
  assert.equal(readSkyStripeConfig({ ...env, SKY_PAYMENTS_MODE: 'live', SKY_STRIPE_SECRET_KEY: 'rk_live_fixture', SKY_PAYMENT_ORIGIN: 'https://market.example' }).mode, 'live');
  for (const changes of [
    { SKY_PAYMENTS_MODE: undefined }, { SKY_PAYMENTS_MODE: 'sandbox' },
    { SKY_STRIPE_SECRET_KEY: undefined }, { SKY_STRIPE_SECRET_KEY: 'sk_live_fixture' },
    { SKY_STRIPE_SECRET_KEY: 'sk_test_key\nHeader: injected' },
    { SKY_STRIPE_WEBHOOK_SECRET: undefined }, { SKY_STRIPE_WEBHOOK_SECRET: 'not-a-secret' },
    { SKY_PAYMENT_ORIGIN: undefined }, { SKY_PAYMENT_ORIGIN: 'https://user:pass@market.example' },
    { SKY_PAYMENT_ORIGIN: 'http://market.example' }, { SKY_PAYMENT_ORIGIN: 'http://localhost.evil.example' },
    { SKY_PAYMENT_ORIGIN: 'https://market.example/path' }, { SKY_PAYMENT_ORIGIN: 'https://market.example?to=evil' },
    { SKY_PAYMENT_ORIGIN: 'https://market.example#fragment' }, { SKY_PAYMENT_ORIGIN: 'javascript:alert(1)' },
    { SKY_PAYMENTS_MODE: 'live', SKY_STRIPE_SECRET_KEY: 'sk_live_fixture' },
  ]) {
    assert.throws(() => readSkyStripeConfig({ ...env, ...changes }), (error) => error instanceof SkyPaymentError && error.status === 503 && !error.message.includes('fixture'));
  }
});

void test('Checkout sends the stored amount, exact ten percent, seller destination and stable idempotency key', async () => {
  const { client, calls } = mockedStripe([{ id: 'cs_test_order', url: 'https://checkout.stripe.com/c/pay/cs_test_order' }]);
  const result = await client.createCheckout(order, 'sky:checkout:order-123');
  assert.equal(result.url, 'https://checkout.stripe.com/c/pay/cs_test_order');
  const [call] = calls;
  assert.equal(call.url.href, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers['Stripe-Version'], SKY_STRIPE_API_VERSION);
  assert.equal(call.headers['Idempotency-Key'], 'sky:checkout:order-123');
  assert.equal(call.headers.Authorization, 'Bearer sk_test_fixture');
  assert.equal(call.redirect, 'error');
  assert.ok(call.signal instanceof AbortSignal);
  const expected = {
    mode: 'payment', 'payment_method_types[0]': 'card',
    'line_items[0][price_data][unit_amount]': '10000',
    'line_items[0][price_data][currency]': 'jpy',
    'line_items[0][price_data][product_data][name]': order.name,
    'line_items[0][quantity]': '1',
    'payment_intent_data[application_fee_amount]': '1000',
    'payment_intent_data[transfer_data][destination]': 'acct_seller',
    'payment_intent_data[metadata][order_id]': order.id,
    'metadata[order_id]': order.id,
    'metadata[package_key]': order.packageKey,
    client_reference_id: order.id,
    success_url: 'http://localhost:3107/sky/purchases?order=order-123',
    cancel_url: 'http://localhost:3107/sky/purchases?order=order-123&canceled=1',
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(call.fields.get(key), value, key);
});

void test('invalid amounts, commission, IDs and idempotency keys cannot reach Stripe', async () => {
  const { client, calls } = mockedStripe([]);
  for (const changes of [
    { amountMinor: 0 }, { amountMinor: -10 }, { amountMinor: 1.2 },
    { amountMinor: Number.MAX_SAFE_INTEGER }, { commissionMinor: 0 },
    { commissionMinor: 2_000 }, { currency: 'JPY' },
    { accountId: 'acct_seller/../../refunds' }, { name: '' }, { id: 'line\nbreak' },
  ]) {
    await assert.rejects(client.createCheckout({ ...order, ...changes }, 'checkout:123'), (error) => error instanceof SkyPaymentError && error.status === 400);
  }
  await assert.rejects(client.createCheckout(order, 'key\r\nInjected: yes'), { status: 400 });
  await assert.rejects(client.retrieveAccount('https://evil.example'), { status: 400 });
  await assert.rejects(client.retrieveCheckout('cs_test_fake?expand=secret'), { status: 400 });
  assert.equal(calls.length, 0);
});

void test('Express onboarding lets the seller select country and returns only a Stripe-hosted URL', async () => {
  const { client, calls } = mockedStripe([
    { id: 'acct_seller', charges_enabled: false, payouts_enabled: false, details_submitted: false, capabilities: {} },
    { url: 'https://connect.stripe.com/setup/s/test' },
    { id: 'acct_seller', charges_enabled: true, payouts_enabled: true, details_submitted: true, capabilities: { transfers: 'active' } },
  ]);
  assert.equal((await client.createAccount('sky:seller:user')).id, 'acct_seller');
  const fields = calls[0].fields;
  assert.equal(fields.get('controller[stripe_dashboard][type]'), 'express');
  assert.equal(fields.get('controller[fees][payer]'), 'application');
  assert.equal(fields.get('controller[losses][payments]'), 'application');
  assert.equal(fields.has('country'), false);
  assert.equal([...fields.keys()].some((key) => key.startsWith('capabilities')), false);
  assert.equal((await client.createAccountLink('acct_seller')).url, 'https://connect.stripe.com/setup/s/test');
  assert.equal(calls[1].fields.get('return_url'), 'http://localhost:3107/sky/sell');
  assert.equal(calls[1].fields.get('refresh_url'), 'http://localhost:3107/sky/sell?onboarding=refresh');
  assert.equal(calls[1].fields.get('account'), 'acct_seller');
  assert.equal((await client.retrieveAccount('acct_seller')).capabilities.transfers, 'active');
  assert.equal(calls[2].url.pathname, '/v1/accounts/acct_seller');
});

void test('server reconciliation retrieves expanded payment and refund/dispute evidence', async () => {
  const charge = { id: 'ch_paid', paid: true, amount: 10000, amount_refunded: 0, disputed: false };
  const payment = { id: 'pi_paid', latest_charge: charge, amount_received: 10000, application_fee_amount: 1000, metadata: { order_id: order.id } };
  const { client, calls } = mockedStripe([
    { id: 'cs_test_order', url: null, payment_intent: payment }, payment, charge,
  ]);
  assert.equal((await client.retrieveCheckout('cs_test_order')).payment_intent.latest_charge.paid, true);
  assert.equal(calls[0].url.searchParams.get('expand[0]'), 'payment_intent.latest_charge');
  assert.equal((await client.retrievePaymentIntent('pi_paid')).latest_charge.disputed, false);
  assert.equal(calls[1].url.searchParams.get('expand[0]'), 'latest_charge');
  assert.equal((await client.retrieveCharge('ch_paid')).amount_refunded, 0);
  assert.equal(calls[2].url.pathname, '/v1/charges/ch_paid');
  assert.ok(calls.every((call) => call.method === 'GET' && call.body === undefined));
});

void test('full refunds reverse the seller transfer and the platform commission with idempotency', async () => {
  const { client, calls } = mockedStripe([{ id: 're_full', status: 'succeeded', amount: 10000, currency: 'jpy' }]);
  assert.equal((await client.refund('pi_paid', 'refund:order-123')).status, 'succeeded');
  assert.equal(calls[0].url.pathname, '/v1/refunds');
  assert.equal(calls[0].headers['Idempotency-Key'], 'refund:order-123');
  assert.deepEqual(Object.fromEntries(calls[0].fields), {
    payment_intent: 'pi_paid', reverse_transfer: 'true', refund_application_fee: 'true',
  });
});

void test('Checkout and Connect reject offsite, credential-bearing and non-HTTPS redirects', async () => {
  for (const url of [
    'https://evil.example/pay', 'http://checkout.stripe.com/pay',
    'https://checkout.stripe.com.evil.example/pay',
    'https://checkout.stripe.com@evil.example/pay',
    'https://user:pass@checkout.stripe.com/pay',
    'https://checkout.stripe.com:8443/pay', 'javascript:alert(1)', null,
  ]) {
    const { client } = mockedStripe([{ id: 'cs_test_order', url }]);
    await assert.rejects(client.createCheckout(order, 'checkout:123'), { status: 502 });
  }
  const { client } = mockedStripe([{ url: 'https://checkout.stripe.com/pay' }]);
  await assert.rejects(client.createAccountLink('acct_seller'), { status: 502 });
});

void test('network, provider, invalid JSON and malformed result errors never expose upstream details', async () => {
  const responses = [
    async () => Response.json({ error: { message: 'sk_test_sensitive customer@example.com' } }, { status: 400 }),
    async () => { throw new Error('sk_test_sensitive socket failed'); },
    async () => { throw new DOMException('sensitive timeout', 'TimeoutError'); },
    async () => new Response('sk_test_sensitive invalid JSON', { status: 200 }),
    async () => Response.json(null),
    async () => Response.json([]),
    async () => Response.json({ id: 'wrong_prefix', secret: 'sensitive' }),
  ];
  for (const fetcher of responses) {
    await assert.rejects(skyStripe(readSkyStripeConfig(env), fetcher).retrieveAccount('acct_seller'), (error) => {
      assert.ok(error instanceof SkyPaymentError);
      assert.equal(error.status, 502);
      assert.match(error.message, /決済サービスとの通信/);
      assert.doesNotMatch(error.message, /sensitive|sk_test|customer@example/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});
