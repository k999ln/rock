import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../worker/index.js';

const origin = 'https://avocado-mini.example.test';
const migration = readFileSync(new URL('../drizzle/0000_same_layla_miller.sql', import.meta.url), 'utf8');

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  return {
    sqlite,
    prepare(sql) {
      return {
        bind(...values) {
          const statement = sqlite.prepare(sql);
          return {
            async run() { const result = statement.run(...values); return { meta: { changes: result.changes } }; },
            async first() { return statement.get(...values) || null; },
          };
        },
      };
    },
  };
}

function env(db, overrides = {}) {
  return {
    DB: db,
    PREORDER_SALES_ENABLED: 'true',
    PREORDER_TERMS_APPROVED: 'true',
    PREORDER_TOTAL_INCLUDES_SHIPPING: 'true',
    PREORDER_SELLER_NAME: 'Example seller',
    PREORDER_SELLER_ADDRESS: 'Example address',
    PREORDER_SELLER_PHONE: '000-0000-0000',
    PREORDER_SHIPPING_FEE: 'Included in the tax-inclusive total',
    PREORDER_SHIPPING_DATE: 'By the end of June 2027',
    PREORDER_CANCELLATION_TERMS: 'Full refund before shipment',
    PREORDER_TOWER_TOTAL_JPY: '170000',
    PREORDER_KIT_TOTAL_JPY: '450000',
    PREORDER_TOWER_CAPACITY: '1',
    PREORDER_KIT_CAPACITY: '1',
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_example',
    PREORDER_ABUSE_KEY: 'testing-rate-secret',
    ...overrides,
  };
}

function checkoutRequest(sku, requestOrigin = origin) {
  return new Request(`${origin}/api/preorders/checkout`, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.1' },
    body: JSON.stringify({ sku }),
  });
}

function webhookRequest(event) {
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', 'whsec_example').update(`${timestamp}.${raw}`).digest('hex');
  return new Request(`${origin}/api/preorders/webhook`, {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: raw,
  });
}

test('sales remain closed until all payment and seller terms exist', async () => {
  const db = database();
  const response = await worker.fetch(checkoutRequest('kit'), env(db, { PREORDER_SHIPPING_DATE: '' }));
  assert.equal(response.status, 503);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM preorders').get().count, 0);
});

test('checkout uses server price, reserves capacity once, and only webhook confirms payment', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  let stripeForm;
  globalThis.fetch = async (_url, options) => {
    stripeForm = new URLSearchParams(options.body);
    return Response.json({ id: 'cs_test_123456789012345', url: 'https://checkout.stripe.com/c/pay/example' });
  };
  try {
    assert.equal((await worker.fetch(checkoutRequest('kit', 'https://evil.example'), env(db))).status, 403);
    const checkout = await worker.fetch(checkoutRequest('kit'), env(db));
    assert.equal(checkout.status, 200);
    assert.equal(stripeForm.get('line_items[0][price_data][unit_amount]'), '450000');
    assert.equal(stripeForm.get('line_items[0][quantity]'), '1');
    assert.equal((await worker.fetch(checkoutRequest('kit'), env(db))).status, 409);
    const order = db.sqlite.prepare('SELECT * FROM preorders').get();
    assert.equal(order.status, 'pending_payment');
    assert.equal((await worker.fetch(new Request(`${origin}/api/preorders/status?session_id=cs_test_123456789012345`), env(db))).status, 200);
    const event = { id: 'evt_paid_1', type: 'checkout.session.completed', data: { object: {
      id: 'cs_test_123456789012345', client_reference_id: order.id, payment_status: 'paid',
      payment_intent: 'pi_123', amount_total: 450000,
    } } };
    const unsigned = new Request(`${origin}/api/preorders/webhook`, { method: 'POST', body: JSON.stringify(event) });
    assert.equal((await worker.fetch(unsigned, env(db))).status, 400);
    assert.equal((await worker.fetch(webhookRequest(event), env(db))).status, 200);
    assert.equal((await worker.fetch(webhookRequest(event), env(db))).status, 200);
    assert.equal(db.sqlite.prepare('SELECT status FROM preorders').get().status, 'paid');
    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM preorder_events').get().count, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('expired checkout releases its capacity for another order', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: 'cs_test_987654321012345', url: 'https://checkout.stripe.com/c/pay/example' });
  try {
    assert.equal((await worker.fetch(checkoutRequest('tower'), env(db))).status, 200);
    const order = db.sqlite.prepare('SELECT id FROM preorders').get();
    const event = { id: 'evt_expired_1', type: 'checkout.session.expired', data: { object: { id: 'cs_test_987654321012345', client_reference_id: order.id } } };
    assert.equal((await worker.fetch(webhookRequest(event), env(db))).status, 200);
    assert.equal(db.sqlite.prepare('SELECT reserved FROM preorder_stock WHERE sku = ?').get('tower').reserved, 0);
  } finally { globalThis.fetch = originalFetch; }
});
