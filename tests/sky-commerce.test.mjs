import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleSkyCommerce } from '../lib/sky-commerce.ts';
import { createSkyToolPackageDraft } from '../lib/sky-tool-package.ts';
import { skyToolPackageStore } from '../lib/sky-tool-package-store.ts';

const origin = 'https://commerce.example.chatgpt.site';
const runtime = {
  SKY_PAYMENTS_MODE: 'test',
  SKY_STRIPE_SECRET_KEY: 'sk_test_CommerceFixtureOnly',
  SKY_STRIPE_WEBHOOK_SECRET: 'whsec_CommerceFixtureOnly',
  SKY_PAYMENT_ORIGIN: origin,
};
const migrations = readdirSync(new URL('../drizzle/', import.meta.url))
  .filter((name) => name.endsWith('.sql') && !name.startsWith('._')).sort()
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));

class Statement {
  constructor(sqlite, sql, values = []) { Object.assign(this, { sqlite, sql, values }); }
  bind(...values) { return new Statement(this.sqlite, this.sql, values); }
  first() { return this.sqlite.prepare(this.sql).get(...this.values) ?? null; }
  all() { return { success: true, results: this.sqlite.prepare(this.sql).all(...this.values) }; }
  run() {
    const result = this.sqlite.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const migration of migrations) sqlite.exec(migration);
  return {
    sqlite,
    prepare(sql) { return new Statement(sqlite, sql); },
    batch(statements) {
      // A D1 batch commits all statements together; avoid yielding inside the transaction.
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => statement.run());
        sqlite.exec('COMMIT');
        return Promise.resolve(results);
      } catch (error) {
        sqlite.exec('ROLLBACK');
        return Promise.reject(error);
      }
    },
  };
}

function stripeFixture() {
  const calls = [];
  const accounts = new Map();
  const sessions = new Map();
  const intents = new Map();
  const charges = new Map();
  const idempotent = new Map();
  const behavior = { refundFailure: false };
  function pay(sessionId) {
    const session = sessions.get(sessionId);
    assert.ok(session);
    const intentId = `pi_${intents.size + 1}`;
    const charge = {
      id: `ch_${charges.size + 1}`, amount: session.amount_total, amount_refunded: 0,
      refunded: false, disputed: false, paid: true, currency: session.currency,
      livemode: false, payment_intent: intentId,
      receipt_url: `https://pay.stripe.com/receipts/${session.id}`,
    };
    const creation = calls.find((call) => call.path === '/v1/checkout/sessions' &&
      call.parameters.get('client_reference_id') === session.client_reference_id);
    const intent = {
      id: intentId, amount: session.amount_total, amount_received: session.amount_total,
      currency: session.currency, status: 'succeeded', livemode: false,
      application_fee_amount: Number(creation.parameters.get('payment_intent_data[application_fee_amount]')),
      transfer_data: { destination: creation.parameters.get('payment_intent_data[transfer_data][destination]') },
      metadata: { order_id: session.client_reference_id }, latest_charge: charge,
    };
    Object.assign(session, { payment_intent: intentId, payment_status: 'paid', status: 'complete', url: null });
    charges.set(charge.id, charge);
    intents.set(intentId, intent);
    return { session, intent, charge };
  }
  const fetcher = async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://api.stripe.com');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('authorization'), `Bearer ${runtime.SKY_STRIPE_SECRET_KEY}`);
    assert.equal(init.redirect, 'error');
    const parameters = new URLSearchParams(init.body);
    const call = { path: url.pathname, method: init.method, parameters, headers, search: url.searchParams };
    calls.push(call);
    let result;
    const key = headers.get('idempotency-key');
    if (init.method === 'POST' && url.pathname === '/v1/accounts') {
      if (!idempotent.has(key)) {
        const account = { id: `acct_${accounts.size + 1}`, charges_enabled: true,
          payouts_enabled: true, details_submitted: true, capabilities: { transfers: 'active' } };
        accounts.set(account.id, account);
        idempotent.set(key, account);
      }
      result = idempotent.get(key);
    } else if (init.method === 'GET' && /^\/v1\/accounts\/acct_[A-Za-z0-9_]+$/.test(url.pathname)) {
      result = accounts.get(url.pathname.split('/').at(-1));
    } else if (init.method === 'POST' && url.pathname === '/v1/account_links') {
      assert.ok(accounts.has(parameters.get('account')));
      result = { url: 'https://connect.stripe.com/setup/fixture' };
    } else if (init.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      assert.ok(key?.startsWith('sky-checkout:'));
      if (!idempotent.has(key)) {
        const id = `cs_${sessions.size + 1}`;
        const session = { id, url: `https://checkout.stripe.com/c/pay/${id}`, mode: 'payment',
          livemode: false, status: 'open', payment_status: 'unpaid',
          amount_total: Number(parameters.get('line_items[0][price_data][unit_amount]')),
          currency: parameters.get('line_items[0][price_data][currency]'),
          client_reference_id: parameters.get('client_reference_id'),
          metadata: { order_id: parameters.get('metadata[order_id]') }, payment_intent: null };
        sessions.set(id, session);
        idempotent.set(key, session);
      }
      result = idempotent.get(key);
    } else if (init.method === 'GET' && /^\/v1\/checkout\/sessions\/cs_[A-Za-z0-9_]+$/.test(url.pathname)) {
      assert.equal(url.searchParams.get('expand[0]'), 'payment_intent.latest_charge');
      result = sessions.get(url.pathname.split('/').at(-1));
    } else if (init.method === 'GET' && /^\/v1\/payment_intents\/pi_[A-Za-z0-9_]+$/.test(url.pathname)) {
      assert.equal(url.searchParams.get('expand[0]'), 'latest_charge');
      result = intents.get(url.pathname.split('/').at(-1));
    } else if (init.method === 'GET' && /^\/v1\/charges\/ch_[A-Za-z0-9_]+$/.test(url.pathname)) {
      result = charges.get(url.pathname.split('/').at(-1));
    } else if (init.method === 'POST' && url.pathname === '/v1/refunds') {
      assert.equal(parameters.get('reverse_transfer'), 'true');
      assert.equal(parameters.get('refund_application_fee'), 'true');
      assert.ok(key?.startsWith('sky-refund:'));
      if (behavior.refundFailure) return Response.json({ error: 'fixture provider unavailable' }, { status: 502 });
      const intent = intents.get(parameters.get('payment_intent'));
      assert.ok(intent);
      Object.assign(intent.latest_charge, { refunded: true, amount_refunded: intent.amount });
      result = { id: 're_fixture', status: 'succeeded', payment_intent: intent.id,
        charge: intent.latest_charge.id, amount: intent.amount, currency: intent.currency };
    } else throw new Error(`Unexpected Stripe request: ${init.method} ${url.pathname}`);
    assert.ok(result, `Missing Stripe fixture: ${url.pathname}`);
    return Response.json(result);
  };
  return { calls, accounts, sessions, intents, charges, behavior, pay, fetcher };
}

async function setup(t) {
  const db = database(t);
  const stripe = stripeFixture();
  const draft = createSkyToolPackageDraft({ sourceKind: 'github', sourceUrl: 'https://github.com/example/paid-tool',
    developerName: 'Test Seller', developerId: 'test-seller', name: 'Reviewed MCP Tool', license: 'MIT' });
  draft.pricing.model = 'external_contract';
  draft.adapter.endpointUrl = 'https://tool.example/mcp';
  const saved = await skyToolPackageStore(db).create('seller', draft);
  db.prepare("UPDATE sky_tool_packages SET status = 'verified', published_at = ? WHERE package_key = ?")
    .bind(Date.now(), saved.packageKey).run();
  const reviewExpiresAt = Date.now() + 60_000;
  db.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind('review-fixture', saved.packageKey, saved.manifestSha256,
    'reviewer', 'verified', '{}', '[]', 'Fixture review', Date.now(), reviewExpiresAt).run();

  async function call(action, input = {}, options = {}) {
    const method = options.method ?? 'POST';
    const user = options.user === undefined ? 'buyer' : options.user;
    const request = new Request(`${options.requestOrigin ?? origin}/api/sky/commerce/${action}`, {
      method,
      headers: {
        ...(user ? { 'oai-authenticated-user-id': user } : {}),
        ...(method !== 'GET' ? { origin, 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
      ...(method !== 'GET' ? { body: JSON.stringify(input) } : {}),
    });
    const response = await handleSkyCommerce(request, action, db, options.runtime ?? runtime, stripe.fetcher);
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  const offerInput = { packageKey: saved.packageKey, amountMinor: 10_000, currency: 'jpy', active: true,
    termsUrl: 'https://seller.example/terms', refundPolicy: '購入後7日以内は提供者へ返金を依頼できます。' };
  async function sell() {
    const onboard = await call('seller', { action: 'onboard' }, { user: 'seller' });
    assert.equal(onboard.status, 200, JSON.stringify(onboard.data));
    const offer = await call('offers', offerInput, { user: 'seller' });
    assert.equal(offer.status, 200, JSON.stringify(offer.data));
    return offer.data.offer;
  }
  async function checkout(extra = {}, options = {}) {
    const offer = db.prepare('SELECT revision FROM sky_commerce_offers WHERE package_key = ?').bind(saved.packageKey).first();
    return call('checkout', { packageKey: saved.packageKey, offerRevision: offer.revision, ...extra }, options);
  }
  async function webhook(type, object, options = {}) {
    const event = { id: options.id ?? `evt_${crypto.randomUUID()}`, type, livemode: false, data: { object } };
    const raw = JSON.stringify(event);
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
    const signature = `t=${timestamp},v1=${createHmac('sha256', options.secret ?? runtime.SKY_STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${raw}`).digest('hex')}`;
    const response = await handleSkyCommerce(new Request(`${origin}/api/sky/commerce/webhook`, {
      method: 'POST', headers: { 'stripe-signature': signature }, body: raw,
    }), 'webhook', db, runtime, stripe.fetcher);
    return { status: response.status, data: await response.json() };
  }
  function order(id) { return db.prepare('SELECT * FROM sky_commerce_orders WHERE id = ?').bind(id).first(); }
  return { db, stripe, saved, reviewExpiresAt, call, sell, checkout, webhook, order, offerInput };
}

void test('seller onboarding, reviewed offer, checkout and signed payment grant buyer access with server-owned 10% terms', async (t) => {
  const f = await setup(t);
  await f.sell();
  const seller = await f.call('seller', {}, { user: 'seller', method: 'GET' });
  assert.equal(seller.data.seller.ready, true);
  assert.equal(seller.data.packages[0].installable, true);
  const publicOffers = await f.call('offers', {}, { user: null, method: 'GET' });
  assert.equal(publicOffers.data.offers.length, 1);
  assert.equal(publicOffers.data.offers[0].amountMinor, 10_000);
  const checkout = await f.checkout({ amountMinor: 1, commissionMinor: 0, currency: 'usd', accountId: 'acct_attacker', buyerUserId: 'attacker' });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.data));
  assert.match(checkout.data.url, /^https:\/\/checkout\.stripe\.com\//);
  const order = f.order(checkout.data.orderId);
  assert.equal(order.buyer_user_id, 'buyer');
  assert.equal(order.amount_minor, 10_000);
  assert.equal(order.commission_minor, 1_000);
  assert.equal(order.currency, 'jpy');
  assert.equal(order.account_id, 'acct_1');
  const creation = f.stripe.calls.find((call) => call.path === '/v1/checkout/sessions');
  assert.equal(creation.parameters.get('line_items[0][price_data][unit_amount]'), '10000');
  assert.equal(creation.parameters.get('payment_intent_data[application_fee_amount]'), '1000');
  assert.equal(creation.parameters.get('payment_intent_data[transfer_data][destination]'), 'acct_1');
  assert.equal((await f.call('purchases', {}, { method: 'GET' })).data.purchases[0].access, false);
  f.stripe.pay(order.session_id);
  const paid = await f.webhook('checkout.session.completed', { id: order.session_id }, { id: 'evt_paid_once' });
  assert.equal(paid.status, 200, JSON.stringify(paid.data));
  assert.equal((await f.webhook('checkout.session.completed', { id: order.session_id }, { id: 'evt_paid_once' })).status, 200);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM sky_commerce_events WHERE id = 'evt_paid_once'").first().count, 1);
  const purchases = await f.call('purchases', {}, { method: 'GET' });
  assert.equal(purchases.data.purchases.length, 1);
  assert.equal(purchases.data.purchases[0].status, 'paid');
  assert.equal(purchases.data.purchases[0].access, true);
  assert.equal(purchases.data.purchases[0].endpointUrl, 'https://tool.example/mcp');
  assert.match(purchases.data.purchases[0].receiptUrl, /^https:\/\/pay\.stripe\.com\//);
  assert.equal(purchases.headers.get('cache-control'), 'no-store');
  assert.equal((await f.checkout()).data.owned, true);
  await f.call('offers', { ...f.offerInput, amountMinor: 20_000 }, { user: 'seller' });
  assert.equal(f.order(order.id).amount_minor, 10_000, 'later offer edits cannot alter purchased terms');
  assert.equal(f.order(order.id).commission_minor, 1_000);
  assert.doesNotMatch(JSON.stringify(purchases.data), /sk_test_|whsec_|acct_1/);
});

void test('return reconciliation grants access only after fresh paid Stripe state and keeps buyer and seller isolated', async (t) => {
  const f = await setup(t);
  await f.sell();
  assert.equal((await f.call('offers', f.offerInput, { user: 'stranger' })).status, 403);
  assert.equal((await f.checkout({}, { user: 'seller' })).status, 409);
  assert.equal((await f.checkout({ offerRevision: 0 })).status, 409);
  const checkout = await f.checkout();
  const order = f.order(checkout.data.orderId);
  assert.equal((await f.call('reconcile', { orderId: order.id }, { user: 'stranger' })).status, 404);
  assert.equal((await f.call('refund', { orderId: order.id }, { user: 'buyer' })).status, 404);
  assert.equal((await f.call('purchases', {}, { user: 'stranger', method: 'GET' })).data.purchases.length, 0);
  const pending = await f.call('reconcile', { orderId: order.id });
  assert.equal(pending.data.purchase.access, false);
  f.stripe.pay(order.session_id);
  const paid = await f.call('reconcile', { orderId: order.id });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.purchase.access, true);
  assert.ok(f.stripe.calls.some((call) => call.path.startsWith('/v1/payment_intents/')));
  const sales = await f.call('seller', {}, { user: 'seller', method: 'GET' });
  assert.equal(sales.data.sales.length, 1);
  assert.equal(sales.data.sales[0].access, false);
  assert.equal(sales.data.sales[0].endpointUrl, null);
});

void test('concurrent and repeated checkout share one active order and one Stripe idempotency key', async (t) => {
  const f = await setup(t);
  await f.sell();
  const attempts = await Promise.all(Array.from({ length: 6 }, () => f.checkout()));
  for (const attempt of attempts) assert.equal(attempt.status, 200, JSON.stringify(attempt.data));
  assert.equal(new Set(attempts.map((attempt) => attempt.data.orderId)).size, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM sky_commerce_orders').first().count, 1);
  assert.equal(f.stripe.sessions.size, 1);
  const keys = f.stripe.calls.filter((call) => call.path === '/v1/checkout/sessions')
    .map((call) => call.headers.get('idempotency-key'));
  assert.equal(new Set(keys).size, 1);
  assert.equal((await f.checkout()).data.orderId, attempts[0].data.orderId);
});

void test('forged or stale webhook signatures cannot change orders or trigger Stripe lookups', async (t) => {
  const f = await setup(t);
  await f.sell();
  const result = await f.checkout();
  const order = f.order(result.data.orderId);
  f.stripe.pay(order.session_id);
  const count = f.stripe.calls.length;
  assert.equal((await f.webhook('checkout.session.completed', { id: order.session_id }, { secret: 'whsec_Forged' })).status, 400);
  assert.equal((await f.webhook('checkout.session.completed', { id: order.session_id }, { timestamp: Math.floor(Date.now() / 1000) - 301 })).status, 400);
  assert.equal(f.stripe.calls.length, count);
  assert.equal(f.order(order.id).status, 'pending');
  assert.equal((await f.call('purchases', {}, { method: 'GET' })).data.purchases[0].access, false);
});

void test('refund reverses seller transfer and platform fee; late completion cannot restore access', async (t) => {
  const f = await setup(t);
  await f.sell();
  const result = await f.checkout();
  const order = f.order(result.data.orderId);
  const { charge } = f.stripe.pay(order.session_id);
  await f.call('reconcile', { orderId: order.id });
  const refunded = await f.call('refund', { orderId: order.id }, { user: 'seller' });
  assert.equal(refunded.status, 200, JSON.stringify(refunded.data));
  assert.equal(refunded.data.purchase.status, 'refunded');
  assert.equal(f.order(order.id).active_key, null);
  assert.equal((await f.call('purchases', {}, { method: 'GET' })).data.purchases[0].access, false);
  assert.ok(f.stripe.calls.some((call) => call.path === '/v1/refunds'));
  Object.assign(charge, { refunded: false, amount_refunded: 0 });
  assert.equal((await f.webhook('checkout.session.completed', { id: order.session_id })).status, 200);
  assert.equal(f.order(order.id).status, 'refunded', 'late paid state must never undo a recorded refund');
  const next = await f.checkout();
  assert.equal(next.status, 200);
  assert.notEqual(next.data.orderId, order.id);
});

void test('refund or dispute webhooks block access even when they arrive before payment completion', async (t) => {
  for (const type of ['charge.refunded', 'charge.dispute.created']) {
    await t.test(type, async (child) => {
      const f = await setup(child);
      await f.sell();
      const result = await f.checkout();
      const order = f.order(result.data.orderId);
      const { charge } = f.stripe.pay(order.session_id);
      const refunded = type === 'charge.refunded';
      Object.assign(charge, refunded ? { refunded: true, amount_refunded: charge.amount } : { disputed: true });
      const session = f.stripe.sessions.get(order.session_id);
      f.stripe.sessions.delete(order.session_id);
      const previousCalls = f.stripe.calls.length;
      const outcome = await f.webhook(type, refunded ? { id: charge.id } : { id: 'dp_fixture', charge: charge.id });
      assert.equal(outcome.status, 200, JSON.stringify(outcome.data));
      assert.equal(f.stripe.calls.slice(previousCalls).some((call) => call.path.startsWith('/v1/checkout/sessions/')), false,
        'charge revocations must work even when checkout session lookup is unavailable');
      assert.equal(f.order(order.id).status, refunded ? 'refunded' : 'disputed');
      f.stripe.sessions.set(order.session_id, session);
      Object.assign(charge, { refunded: false, amount_refunded: 0, disputed: false });
      await f.webhook('checkout.session.completed', { id: order.session_id });
      assert.equal((await f.call('purchases', {}, { method: 'GET' })).data.purchases[0].access, false);
      assert.equal(f.order(order.id).status, refunded ? 'refunded' : 'disputed');
    });
  }
});

void test('partial refund records its amount and blocks repurchase until the remaining amount is refunded', async (t) => {
  const f = await setup(t);
  await f.sell();
  const result = await f.checkout();
  const order = f.order(result.data.orderId);
  const { charge } = f.stripe.pay(order.session_id);
  await f.call('reconcile', { orderId: order.id });
  charge.amount_refunded = 2_000;
  assert.equal((await f.webhook('charge.refunded', { id: charge.id })).status, 200);
  let stored = f.order(order.id);
  assert.equal(stored.status, 'partially_refunded');
  assert.equal(stored.refunded_minor, 2_000);
  assert.ok(stored.active_key);
  const purchase = (await f.call('purchases', {}, { method: 'GET' })).data.purchases[0];
  assert.equal(purchase.access, false);
  assert.equal(purchase.refundedMinor, 2_000);
  charge.amount_refunded = 0;
  await f.webhook('checkout.session.completed', { id: order.session_id });
  stored = f.order(order.id);
  assert.equal(stored.status, 'partially_refunded');
  assert.equal(stored.refunded_minor, 2_000, 'stale Stripe state cannot reduce the known refund');
  assert.equal((await f.checkout()).status, 409);
  assert.equal(f.stripe.sessions.size, 1);
  charge.amount_refunded = 2_000;
  const refunded = await f.call('refund', { orderId: order.id }, { user: 'seller' });
  assert.equal(refunded.status, 200, JSON.stringify(refunded.data));
  assert.equal(refunded.data.purchase.status, 'refunded');
  assert.equal(refunded.data.purchase.refundedMinor, 10_000);
  assert.equal(f.order(order.id).active_key, null);
});

void test('reconciliation cannot refresh an unknown refund past its original idempotency retry window', async (t) => {
  const f = await setup(t);
  await f.sell();
  const result = await f.checkout();
  const order = f.order(result.data.orderId);
  f.stripe.pay(order.session_id);
  await f.call('reconcile', { orderId: order.id });
  f.stripe.behavior.refundFailure = true;
  const firstRequest = Date.now();
  assert.equal((await f.call('refund', { orderId: order.id }, { user: 'seller' })).status, 502);
  assert.equal(f.order(order.id).status, 'refund_pending');
  const refundCalls = () => f.stripe.calls.filter((call) => call.path === '/v1/refunds').length;
  assert.equal(refundCalls(), 1);
  t.mock.method(Date, 'now', () => firstRequest + 21 * 60 * 60 * 1000);
  await f.call('reconcile', { orderId: order.id });
  const retry = await f.call('refund', { orderId: order.id }, { user: 'seller' });
  assert.equal(retry.status, 409, JSON.stringify(retry.data));
  assert.equal(refundCalls(), 1, 'an unknown refund must not be recreated after its idempotency retry window');
  assert.equal(f.order(order.id).status, 'refund_pending');
});

void test('seller account creation does not retry an unresolved reservation after 20 hours', async (t) => {
  const f = await setup(t);
  f.db.prepare('INSERT INTO sky_commerce_sellers (id,user_id,mode,account_id,created_at) VALUES (?,?,?,?,?)')
    .bind('seller-reservation', 'seller', 'test', null, Date.now() - 21 * 60 * 60 * 1000).run();
  const response = await f.call('seller', { action: 'onboard' }, { user: 'seller' });
  assert.equal(response.status, 409, JSON.stringify(response.data));
  assert.equal(f.stripe.calls.length, 0);
});

void test('revoked package, changed manifest and expired review block purchased access and further sales', async (t) => {
  for (const reason of ['revoked', 'changed-manifest', 'expired-review']) {
    await t.test(reason, async (child) => {
      const f = await setup(child);
      await f.sell();
      const result = await f.checkout();
      const order = f.order(result.data.orderId);
      f.stripe.pay(order.session_id);
      assert.equal((await f.call('reconcile', { orderId: order.id })).data.purchase.access, true);
      if (reason === 'revoked') f.db.prepare("UPDATE sky_tool_packages SET status = 'revoked' WHERE package_key = ?").bind(f.saved.packageKey).run();
      if (reason === 'changed-manifest') f.db.prepare('UPDATE sky_tool_packages SET manifest_sha256 = ? WHERE package_key = ?').bind('f'.repeat(64), f.saved.packageKey).run();
      if (reason === 'expired-review') child.mock.method(Date, 'now', () => f.reviewExpiresAt + 1);
      const purchases = await f.call('purchases', {}, { method: 'GET' });
      assert.equal(purchases.data.purchases[0].access, false);
      assert.equal(purchases.data.purchases[0].endpointUrl, null);
      assert.equal((await f.call('offers', {}, { user: null, method: 'GET' })).data.offers.length, 0);
      assert.equal((await f.checkout({}, { user: 'other-buyer' })).status, 409);
    });
  }
});

void test('Stripe amount, currency, mode, destination, fee and identity mismatches never grant access', async (t) => {
  const mutations = {
    'session amount': ({ session }) => { session.amount_total = 1; },
    'session currency': ({ session }) => { session.currency = 'usd'; },
    'session mode': ({ session }) => { session.livemode = true; },
    'session owner': ({ session }) => { session.client_reference_id = 'other-order'; },
    'intent amount': ({ intent }) => { intent.amount = 1; },
    'intent currency': ({ intent }) => { intent.currency = 'usd'; },
    'intent mode': ({ intent }) => { intent.livemode = true; },
    'intent destination': ({ intent }) => { intent.transfer_data.destination = 'acct_attacker'; },
    'intent reduced seller transfer': ({ intent }) => { intent.transfer_data.amount = 1; },
    'intent fee': ({ intent }) => { intent.application_fee_amount = 0; },
    'intent owner': ({ intent }) => { intent.metadata.order_id = 'other-order'; },
    'charge amount': ({ charge }) => { charge.amount = 1; },
    'charge currency': ({ charge }) => { charge.currency = 'usd'; },
    'charge mode': ({ charge }) => { charge.livemode = true; },
    'charge intent': ({ charge }) => { charge.payment_intent = 'pi_other'; },
    'negative refund': ({ charge }) => { charge.amount_refunded = -1; },
    'fractional refund': ({ charge }) => { charge.amount_refunded = 0.5; },
    'excess refund': ({ charge }) => { charge.amount_refunded = 10_001; },
    'missing refund amount': ({ charge }) => { delete charge.amount_refunded; },
  };
  for (const [name, change] of Object.entries(mutations)) {
    await t.test(name, async (child) => {
      const f = await setup(child);
      await f.sell();
      const result = await f.checkout();
      const order = f.order(result.data.orderId);
      change(f.stripe.pay(order.session_id));
      const reconciliation = await f.call('reconcile', { orderId: order.id });
      assert.equal(reconciliation.status, 409, JSON.stringify(reconciliation.data));
      assert.equal(f.order(order.id).status, 'pending');
      assert.equal((await f.call('purchases', {}, { method: 'GET' })).data.purchases[0].access, false);
    });
  }
});

void test('unconfigured reads show setup state and writes cannot create charges', async (t) => {
  const f = await setup(t);
  for (const action of ['offers', 'seller', 'purchases']) {
    const response = await f.call(action, {}, { user: null, method: 'GET', runtime: {} });
    assert.equal(response.status, 200);
    assert.equal(response.data.configured, false);
  }
  for (const action of ['seller', 'offers', 'checkout', 'refund', 'reconcile'])
    assert.equal((await f.call(action, {}, { runtime: {} })).status, 503);
  assert.equal(f.stripe.calls.length, 0);
});

void test('authentication, same-origin and live gateway checks reject untrusted requests', async (t) => {
  const f = await setup(t);
  assert.equal((await f.call('seller', {}, { method: 'GET', user: null })).status, 401);
  assert.equal((await f.call('seller', { action: 'onboard' }, { user: null })).status, 401);
  assert.equal((await f.call('seller', { action: 'onboard' }, { headers: { origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await f.call('seller', {}, { method: 'GET', requestOrigin: 'https://attacker.example' })).status, 403);
  const live = { ...runtime, SKY_PAYMENTS_MODE: 'live', SKY_STRIPE_SECRET_KEY: 'sk_live_CommerceFixtureOnly' };
  assert.equal((await f.call('seller', {}, { method: 'GET', runtime: live })).status, 401);
  assert.equal(f.stripe.calls.length, 0);
});
