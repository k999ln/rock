import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fixture } from './intake.mjs';
import {
  ownerScopeFor,
  OWNER_SCOPE_HEADER,
} from '../../../lib/owner-intent.ts';
import {
  createComputePlanApi,
  createComputeWebhook,
} from '../../../lib/noah-shared-compute-plan-api.ts';
import {
  readComputeBillingScope,
  sharedComputeEntitlement,
} from '../../../lib/noah-shared-compute-plan.ts';
import { computeStripeProvider } from '../../../lib/noah-shared-compute-stripe.ts';

const origin = 'https://noah.test';
function environment() {
  return {
    NOAH_COMPUTE_BILLING_MODE: 'test',
    NOAH_COMPUTE_TEST_STRIPE_ACCOUNT: 'acct_fixture',
    NOAH_COMPUTE_TEST_STRIPE_KEY: 'rk_test_' + 'fixture',
    NOAH_COMPUTE_TEST_WEBHOOK_SECRET: 'whsec_' + 'fixture',
    NOAH_COMPUTE_TEST_PRICE_ID: 'price_fixture',
    NOAH_COMPUTE_TEST_AMOUNT_MINOR: '27',
    NOAH_COMPUTE_TEST_CURRENCY: 'JPY',
    NOAH_COMPUTE_TEST_MERCHANT: 'Fixture merchant',
    NOAH_COMPUTE_TEST_MONTHLY_JOBS: '3',
    NOAH_COMPUTE_TEST_TERMS_VERSION: 'fixture',
  };
}
export function computeBillingFixture(t) {
  const f = fixture(t);
  const sql = readFileSync(
    new URL(
      '../../../drizzle/0063_noah_compute_subscriptions.sql',
      import.meta.url,
    ),
    'utf8',
  );
  assert.equal(
    sql,
    readFileSync(
      new URL(
        '../../../drizzle-main/0063_noah_compute_subscriptions.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  f.sql.exec(sql);
  f.sql.exec(sql);
  const env = environment();
  let now = Date.now(),
    session = null,
    checkoutCount = 0;
  const period = {
    start: Math.floor(now / 1000) - 1,
    end: Math.floor(now / 1000) + 10000,
  };
  const price = {
    id: 'price_fixture',
    active: true,
    unit_amount: 27,
    currency: 'jpy',
    livemode: false,
    billing_scheme: 'per_unit',
    tax_behavior: 'inclusive',
    type: 'recurring',
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
  };
  const charge = {
    id: 'ch_fixture',
    livemode: false,
    paid: true,
    captured: true,
    status: 'succeeded',
    currency: 'jpy',
    amount_captured: 27,
    amount_refunded: 0,
    disputed: false,
    refunded: false,
  };
  const line = { pricing: { price_details: { price: price.id } }, period };
  const invoice = {
    id: 'in_fixture',
    status: 'paid',
    livemode: false,
    total: 27,
    amount_paid: 27,
    currency: 'jpy',
    amount_remaining: 0,
    parent: { subscription_details: { subscription: 'sub_fixture' } },
    lines: { has_more: false, data: [line] },
  };
  const item = {
    price,
    quantity: 1,
    current_period_start: period.start,
    current_period_end: period.end,
  };
  const sub = {
    id: 'sub_fixture',
    livemode: false,
    status: 'active',
    cancel_at_period_end: false,
    customer: 'cus_fixture',
    metadata: {},
    latest_invoice: invoice,
    items: { has_more: false, data: [item] },
  };
  const payment = {
    invoice: invoice.id,
    livemode: false,
    currency: 'jpy',
    amount_paid: 27,
    payment: {
      type: 'payment_intent',
      payment_intent: { status: 'succeeded', latest_charge: charge },
    },
  };
  const stripe = {
    customers: {
      create: async (data, key) => {
        assert.equal(
          key.idempotencyKey,
          'noah-compute-customer:' + data.metadata.attempt,
        );
        return { id: 'cus_fixture', livemode: false };
      },
    },
    accounts: { retrieve: async () => ({ id: 'acct_fixture' }) },
    prices: { retrieve: async () => price },
    checkout: {
      sessions: {
        retrieve: async () => session,
        list: async (filter) => {
          assert.deepEqual(filter, { customer: 'cus_fixture', limit: 2 });
          return { has_more: false, data: session ? [session] : [] };
        },
        create: async (params, options) => {
          assert.equal(params.mode, 'subscription');
          assert.equal(params.customer, 'cus_fixture');
          assert.deepEqual(params.line_items, [
            { price: price.id, quantity: 1 },
          ]);
          assert.equal(params.subscription_data.trial_period_days, undefined);
          assert.ok(!params.payment_method_types);
          assert.equal(
            options.idempotencyKey,
            'noah-compute:' + params.client_reference_id,
          );
          if (!session) {
            checkoutCount++;
            sub.metadata = params.subscription_data.metadata;
            session = {
              id: 'cs_test_fixture',
              livemode: false,
              mode: 'subscription',
              status: 'open',
              amount_total: 27,
              currency: 'jpy',
              url: 'https://checkout.stripe.com/c/pay/fixture',
              client_reference_id: params.client_reference_id,
              metadata: params.metadata,
              subscription: null,
              customer: 'cus_fixture',
            };
          }
          return session;
        },
      },
    },
    subscriptions: {
      retrieve: async () => sub,
      update: async (id, args) => {
        assert.equal(id, sub.id);
        Object.assign(sub, args);
        return sub;
      },
    },
    invoicePayments: {
      list: async () => ({ has_more: false, data: [payment] }),
    },
    radar: { earlyFraudWarnings: { list: async () => ({ data: [] }) } },
  };
  const deps = {
    env,
    db: f.db,
    now: () => now,
    authenticate: async (req) =>
      req.headers.get('x-test-user') || Promise.reject(Error('UNAUTHORIZED')),
    provider: (env, scope, origin) =>
      computeStripeProvider(env, scope, origin, stripe),
  };
  const handler = createComputePlanApi(deps),
    webhook = createComputeWebhook(deps);
  async function api(user, body, headers = {}) {
    const req = new Request(origin + '/api/noah/shared-compute/plan', {
      headers: {
        'x-test-user': user,
        origin,
        [OWNER_SCOPE_HEADER]: await ownerScopeFor(user),
        'content-type': 'application/json',
        ...headers,
      },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    return handler(req);
  }
  async function event(type, obj, overrides = {}) {
    const raw = JSON.stringify({
      id: 'evt_fixture',
      type,
      livemode: false,
      data: { object: obj },
      ...overrides,
    });
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', env.NOAH_COMPUTE_TEST_WEBHOOK_SECRET)
      .update(ts + '.' + raw)
      .digest('hex');
    return webhook(
      new Request(origin + '/api/noah/shared-compute/plan/webhook', {
        method: 'POST',
        body: raw,
        headers: { 'stripe-signature': 't=' + ts + ',v1=' + sig },
      }),
    );
  }
  const entitled = async (user) =>
    sharedComputeEntitlement(
      f.db,
      await ownerScopeFor(user),
      readComputeBillingScope(env),
      now,
    );
  const get = async (user) => (await api(user)).json();
  async function start(user) {
    const { plan } = await get(user);
    return api(user, { action: 'checkout', termsVersion: plan.termsVersion });
  }
  return {
    f,
    env,
    now: () => now,
    get,
    start,
    api,
    event,
    webhook,
    stripe,
    charge,
    invoice,
    sub,
    item,
    price,
    line,
    entitled,
    advance: (ms) => {
      now += ms;
    },
    count: () => checkoutCount,
    session: () => session,
    complete: () =>
      Object.assign(session, { status: 'complete', subscription: sub.id }),
  };
}
