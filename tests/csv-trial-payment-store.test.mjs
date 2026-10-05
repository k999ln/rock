import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { csvTrialPayments } from '../lib/csv-trial-payment.ts';
const jobId = 'ab123456-1234-1234-1234-123456789012';
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'),
    );
  sqlite
    .prepare(
      `INSERT INTO csv_jobs (id,user_id,status,payment_status,input_name,input_key,input_bytes,input_sha256,input_encoding,specification_json,quote_minor,currency,expires_at,created_at,updated_at) VALUES (?, 'alice', 'quoted', 'unpaid', 'trial.csv', 'fixture-input', 10, 'hash', 'utf8', '{}', 5000, 'JPY', ?, ?, ?)`,
    )
    .run(jobId, Date.now() + 86400000, Date.now(), Date.now());
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        first() {
          return sqlite.prepare(sql).get(...values) ?? null;
        },
        run() {
          return {
            meta: {
              changes: Number(sqlite.prepare(sql).run(...values).changes),
            },
          };
        },
      };
    },
  };
  const state = {
    calls: [],
    fulfills: [],
    paid: false,
    mismatch: false,
    fail: false,
  };
  const session = () => ({
    id: 'cs_trial',
    url: state.paid ? null : 'https://checkout.stripe.com/c/pay/cs_trial',
    mode: 'payment',
    status: state.paid ? 'complete' : 'open',
    payment_status: state.paid ? 'paid' : 'unpaid',
    livemode: true,
    currency: 'jpy',
    amount_total: state.mismatch ? 5000 : 50,
    client_reference_id: jobId,
    metadata: { csv_job_id: jobId, purpose: 'csv_trial_50' },
    payment_intent: state.paid
      ? {
          id: 'pi_trial',
          status: 'succeeded',
          amount: 50,
          amount_received: 50,
          currency: 'jpy',
          livemode: true,
          metadata: { csv_job_id: jobId, purpose: 'csv_trial_50' },
          latest_charge: {
            id: 'ch_trial',
            paid: true,
            currency: 'jpy',
            amount: 50,
            livemode: true,
            amount_refunded: 0,
            payment_intent: 'pi_trial',
          },
        }
      : null,
  });
  const runtime = {
    DB: db,
    SKY_PAYMENTS_MODE: 'live',
    SKY_STRIPE_SECRET_KEY: 'sk_live_fixture',
    SKY_CSV_STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
    SKY_PAYMENT_ORIGIN: 'https://sky.example',
  };
  const fetcher = async (url, init) => {
    state.calls.push({ url, init });
    if (state.fail) throw new Error('provider secret error');
    return Response.json(session());
  };
  const fulfill = async (user, id, input) => {
    state.fulfills.push({ user, id, input });
    sqlite
      .prepare(
        "UPDATE csv_jobs SET status = 'completed' WHERE id = ? AND user_id = ?",
      )
      .run(id, user);
    return { id, status: 'completed' };
  };
  return {
    sqlite,
    state,
    runtime,
    payments: csvTrialPayments(runtime, fulfill, fetcher),
  };
}
void test('owner checkout persists one session and unpaid confirmation cannot fulfill', async (t) => {
  const { payments, state, sqlite } = fixture(t);
  assert.equal((await payments.start('alice', jobId)).amountYen, 50);
  assert.equal(
    sqlite.prepare('SELECT session_id FROM csv_trial_payments').get()
      .session_id,
    'cs_trial',
  );
  await payments.start('alice', jobId);
  assert.equal(state.calls.filter((c) => c.init.method === 'POST').length, 1);
  await assert.rejects(payments.confirm('alice', jobId), { status: 409 });
  assert.equal(state.fulfills.length, 0);
  state.paid = true;
  assert.deepEqual(await payments.confirm('alice', jobId), {
    id: jobId,
    status: 'completed',
  });
  assert.equal(
    sqlite.prepare('SELECT payment_status FROM csv_jobs').get().payment_status,
    'stripe_verified',
  );
});
void test('another owner cannot create or consume a payment and never reaches Stripe', async (t) => {
  const { payments, state } = fixture(t);
  await assert.rejects(payments.start('bob', jobId), { status: 404 });
  await assert.rejects(payments.confirm('bob', jobId), { status: 404 });
  assert.equal(state.calls.length, 0);
  assert.equal(state.fulfills.length, 0);
});
void test('normal price, free samples and expired quotes are not payable as 50 yen', async (t) => {
  const { payments, state, sqlite } = fixture(t);
  sqlite.prepare('UPDATE csv_jobs SET quote_minor=300000').run();
  await assert.rejects(payments.start('alice', jobId), { status: 409 });
  sqlite
    .prepare("UPDATE csv_jobs SET quote_minor=5000,payment_status='sample'")
    .run();
  await assert.rejects(payments.start('alice', jobId), { status: 409 });
  sqlite
    .prepare("UPDATE csv_jobs SET payment_status='unpaid',expires_at=0")
    .run();
  await assert.rejects(payments.start('alice', jobId), { status: 410 });
  assert.equal(state.calls.length, 0);
});
void test('mismatched paid provider amount cannot update job or start fulfillment', async (t) => {
  const { payments, state, sqlite } = fixture(t);
  await payments.start('alice', jobId);
  state.paid = true;
  state.mismatch = true;
  await assert.rejects(payments.confirm('alice', jobId), { status: 409 });
  assert.equal(
    sqlite.prepare('SELECT payment_status FROM csv_jobs').get().payment_status,
    'unpaid',
  );
  assert.equal(state.fulfills.length, 0);
});
void test('uncertain session creation cannot be replayed past 20 hours or disclose provider details', async (t) => {
  const { payments, state, sqlite } = fixture(t);
  state.fail = true;
  await assert.rejects(
    payments.start('alice', jobId),
    (error) => error.status === 502 && !error.message.includes('secret'),
  );
  const calls = state.calls.length;
  sqlite
    .prepare('UPDATE csv_trial_payments SET created_at=?')
    .run(Date.now() - 21 * 3600000);
  await assert.rejects(payments.start('alice', jobId), { status: 409 });
  assert.equal(state.calls.length, calls);
});
void test('missing live payment settings fail closed', async (t) => {
  const { runtime } = fixture(t);
  delete runtime.SKY_STRIPE_SECRET_KEY;
  const payments = csvTrialPayments(runtime, async () =>
    assert.fail('must not fulfill'),
  );
  assert.equal(payments.availability().available, false);
  await assert.rejects(payments.start('alice', jobId), { status: 503 });
});

void test('signed webhook retrieves provider evidence and starts only its persisted owner job', async (t) => {
  const { createHmac } = await import('node:crypto');
  const { payments, state } = fixture(t);
  await payments.start('alice', jobId);
  state.paid = true;
  const raw = JSON.stringify({
    id: 'evt_trial',
    type: 'checkout.session.completed',
    livemode: true,
    data: {
      object: {
        id: 'cs_trial',
        metadata: { purpose: 'csv_trial_50', csv_job_id: jobId },
      },
    },
  });
  const time = Math.floor(Date.now() / 1000);
  const signature = `t=${time},v1=${createHmac('sha256', 'whsec_fixture').update(`${time}.${raw}`).digest('hex')}`;
  assert.deepEqual(await payments.webhook(raw, signature), { received: true });
  assert.equal(state.fulfills[0].user, 'alice');
  await assert.rejects(payments.webhook(raw, 't=1,v1=bad'), {
    message: 'STRIPE_SIGNATURE_INVALID',
  });
});
void test('signed wrong mode or mismatched session/job never fulfills', async (t) => {
  const { createHmac } = await import('node:crypto');
  const { payments, state } = fixture(t);
  await payments.start('alice', jobId);
  state.paid = true;
  for (const event of [
    {
      id: 'evt_test',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: {} },
    },
    {
      id: 'evt_wrong',
      type: 'checkout.session.completed',
      livemode: true,
      data: {
        object: {
          id: 'cs_trial',
          metadata: { purpose: 'csv_trial_50', csv_job_id: 'other' },
        },
      },
    },
  ]) {
    const raw = JSON.stringify(event),
      time = Math.floor(Date.now() / 1000);
    const signature = `t=${time},v1=${createHmac('sha256', 'whsec_fixture').update(`${time}.${raw}`).digest('hex')}`;
    await assert.rejects(payments.webhook(raw, signature));
  }
  assert.equal(state.fulfills.length, 0);
});
