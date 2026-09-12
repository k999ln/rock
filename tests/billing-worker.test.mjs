import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createBillingToken } from '../lib/billing-token.ts';
import billingWorker from '../services/sky-billing/src/worker.ts';

class Statement {
  #database;
  #sql;
  #values = [];

  constructor(database, sql) {
    this.#database = database;
    this.#sql = sql;
  }

  bind(...values) {
    this.#values = values;
    return this;
  }

  run() {
    const result = this.#database.prepare(this.#sql).run(...this.#values);
    return Promise.resolve({
      success: true,
      meta: { changes: Number(result.changes) },
    });
  }

  first() {
    return Promise.resolve(
      this.#database.prepare(this.#sql).get(...this.#values) ?? null,
    );
  }

  all() {
    return Promise.resolve({
      success: true,
      results: this.#database.prepare(this.#sql).all(...this.#values),
    });
  }
}

class TestD1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(
      readFileSync(
        new URL(
          '../services/sky-billing/migrations/0001_billing.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  }

  prepare(sql) {
    return new Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

const origin = 'https://sky.example';
const sharedSecret = 'test-billing-shared-secret-that-is-long-enough';
const webhookSecret = 'whsec_test_secret_that_is_long_enough';
const priceId = 'price_sky888';

function stripeSignature(raw, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${raw}`)
    .digest('hex')}`;
}

void test('billing Worker completes the safe monthly lifecycle and blocks duplicates', async () => {
  const DB = new TestD1();
  const env = {
    DB,
    BILLING_SHARED_SECRET: sharedSecret,
    SKY_ORIGIN: origin,
    RETURN_ORIGIN: origin,
    STRIPE_PRICE_ID: priceId,
    STRIPE_SECRET_KEY: 'sk_test_worker_lifecycle',
    STRIPE_WEBHOOK_SECRET: webhookSecret,
  };
  const stripeCalls = [];
  let checkoutFailure = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    stripeCalls.push({ url, init });
    if (url.pathname === `/v1/prices/${priceId}`)
      return Response.json({
        id: priceId,
        active: true,
        currency: 'usd',
        unit_amount: 888,
        type: 'recurring',
        recurring: { interval: 'month', interval_count: 1 },
      });
    if (url.pathname === '/v1/checkout/sessions') {
      if (checkoutFailure) throw new Error('synthetic timeout');
      return Response.json({
        id: `cs_test_${randomUUID().replaceAll('-', '')}`,
        url: 'https://checkout.stripe.com/c/pay/cs_test_sky',
      });
    }
    if (url.pathname === '/v1/billing_portal/sessions')
      return Response.json({
        url: 'https://billing.stripe.com/p/session/test_sky',
      });
    return Response.json(
      { error: { code: 'unexpected_test_request' } },
      { status: 500 },
    );
  };

  const token = (user) => createBillingToken(user, sharedSecret);
  const request = async (path, options = {}) => {
    const response = await billingWorker.fetch(
      new Request(`https://billing.example${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(options.origin === false
            ? {}
            : { Origin: options.origin ?? origin }),
          ...(options.token
            ? { Authorization: `Bearer ${options.token}` }
            : {}),
          ...(options.signature
            ? { 'Stripe-Signature': options.signature }
            : {}),
        },
        body: options.body,
      }),
      env,
    );
    return { response, body: await response.json() };
  };
  const webhook = async (event) => {
    const raw = JSON.stringify(event);
    return request('/v1/webhooks/stripe', {
      method: 'POST',
      origin: false,
      body: raw,
      signature: stripeSignature(raw),
    });
  };

  try {
    const aliceToken = await token('alice');
    assert.equal(
      (await request('/health', { origin: false })).response.status,
      200,
    );
    assert.equal(
      (
        await request('/v1/status', {
          token: aliceToken,
          origin: 'https://evil.example',
        })
      ).response.status,
      403,
    );

    const checkout = await request('/v1/checkout', {
      method: 'POST',
      token: aliceToken,
    });
    assert.equal(checkout.response.status, 201);
    assert.equal(
      checkout.body.url,
      'https://checkout.stripe.com/c/pay/cs_test_sky',
    );
    const checkoutCall = stripeCalls.find(
      ({ url }) => url.pathname === '/v1/checkout/sessions',
    );
    const form = new URLSearchParams(checkoutCall.init.body);
    assert.equal(form.get('mode'), 'subscription');
    assert.equal(form.get('line_items[0][price]'), priceId);
    assert.equal(form.get('line_items[0][quantity]'), '1');
    assert.equal(form.get('client_reference_id'), 'alice');
    assert.equal(form.get('subscription_data[metadata][sky_user_id]'), 'alice');
    const expiresIn =
      Number(form.get('expires_at')) - Math.floor(Date.now() / 1000);
    assert.ok(expiresIn >= 1858 && expiresIn <= 1860);
    assert.match(
      checkoutCall.init.headers['Idempotency-Key'],
      /^sky-checkout-/u,
    );

    const duplicate = await request('/v1/checkout', {
      method: 'POST',
      token: await token('alice'),
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.code, 'CHECKOUT_IN_PROGRESS');

    const created = Math.floor(Date.now() / 1000);
    const checkoutEvent = {
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      created,
      data: {
        object: {
          customer: 'cus_alice',
          subscription: 'sub_alice',
          client_reference_id: 'alice',
        },
      },
    };
    assert.equal((await webhook(checkoutEvent)).response.status, 200);
    assert.equal((await webhook(checkoutEvent)).response.status, 200);
    assert.equal(
      DB.database
        .prepare(
          'SELECT COUNT(*) AS total FROM billing_events WHERE event_id = ?',
        )
        .get('evt_checkout').total,
      1,
    );

    assert.equal(
      (
        await webhook({
          id: 'evt_subscription',
          type: 'customer.subscription.created',
          created: created + 1,
          data: {
            object: {
              id: 'sub_alice',
              customer: 'cus_alice',
              status: 'active',
              metadata: { sky_user_id: 'alice' },
              items: {
                data: [
                  {
                    price: { id: priceId },
                    current_period_end: created + 2_592_000,
                  },
                ],
              },
            },
          },
        })
      ).response.status,
      200,
    );
    assert.equal(
      (
        await webhook({
          id: 'evt_invoice',
          type: 'invoice.paid',
          created: created + 2,
          data: {
            object: {
              id: 'in_alice',
              customer: 'cus_alice',
              currency: 'usd',
              amount_paid: 888,
              status_transitions: { paid_at: created + 2 },
              parent: {
                subscription_details: {
                  subscription: 'sub_alice',
                  metadata: { sky_user_id: 'alice' },
                },
              },
              lines: {
                data: [
                  {
                    pricing: { price_details: { price: priceId } },
                    period: { start: created, end: created + 2_592_000 },
                  },
                ],
              },
            },
          },
        })
      ).response.status,
      200,
    );

    const status = await request('/v1/status', {
      token: await token('alice'),
    });
    assert.equal(status.response.status, 200);
    assert.equal(status.body.subscription.status, 'active');
    assert.equal(status.body.invoice.status, 'paid');
    assert.equal(status.body.invoice.amountPaid, 888);
    assert.equal(
      (
        await request('/v1/checkout', {
          method: 'POST',
          token: await token('alice'),
        })
      ).response.status,
      409,
    );
    const portal = await request('/v1/portal', {
      method: 'POST',
      token: await token('alice'),
    });
    assert.equal(portal.response.status, 201);
    assert.equal(
      portal.body.url,
      'https://billing.stripe.com/p/session/test_sky',
    );

    const wrongPrice = await webhook({
      id: 'evt_wrong_price',
      type: 'customer.subscription.created',
      created: created + 3,
      data: {
        object: {
          id: 'sub_wrong',
          customer: 'cus_wrong',
          status: 'active',
          metadata: { sky_user_id: 'wrong-price-user' },
          items: { data: [{ price: { id: 'price_other' } }] },
        },
      },
    });
    assert.equal(wrongPrice.response.status, 502);
    assert.equal(
      DB.database
        .prepare(
          'SELECT COUNT(*) AS total FROM billing_subscriptions WHERE user_id = ?',
        )
        .get('wrong-price-user').total,
      0,
    );

    checkoutFailure = true;
    const uncertain = await request('/v1/checkout', {
      method: 'POST',
      token: await token('uncertain-user'),
    });
    assert.equal(uncertain.response.status, 502);
    assert.equal(
      DB.database
        .prepare('SELECT status FROM billing_checkout_locks WHERE user_id = ?')
        .get('uncertain-user').status,
      'unknown',
    );
    const uncertainRetry = await request('/v1/checkout', {
      method: 'POST',
      token: await token('uncertain-user'),
    });
    assert.equal(uncertainRetry.response.status, 409);

    const raw = JSON.stringify({
      id: 'evt_tampered',
      type: 'invoice.paid',
      created,
      data: { object: {} },
    });
    assert.equal(
      (
        await request('/v1/webhooks/stripe', {
          method: 'POST',
          origin: false,
          body: `${raw} `,
          signature: stripeSignature(raw),
        })
      ).response.status,
      400,
    );
  } finally {
    globalThis.fetch = originalFetch;
    DB.close();
  }
});
