import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from '../lib/owner-intent.ts';
import {
  readComputeBillingScope,
  sharedComputeEntitlement,
} from '../lib/noah-shared-compute-plan.ts';
import { readComputeOffer } from '../lib/noah-shared-compute-stripe.ts';
import { computeBillingFixture as setup } from './fixtures/noah/compute-billing.mjs';

const origin = 'https://noah.test';
void test('two checkout retries reserve once; signed reconciliation grants only a verified current payment to the purchaser, renewal and cancellation follow Stripe', async (t) => {
  const w = setup(t),
    who = 'payer';
  assert.equal((await w.get(who)).subscription.status, 'none');
  const start = await Promise.all([w.start(who), w.start(who)]);
  assert.deepEqual(
    start.map((r) => r.status),
    [200, 200],
  );
  assert.equal(w.count(), 1);
  assert.equal((await w.entitled(who)).entitled, false);
  w.complete();
  await w.event('checkout.session.completed', w.session());
  assert.equal((await w.entitled(who)).entitled, true);
  assert.equal((await w.entitled('other')).entitled, false);
  assert.equal((await w.start(who)).status, 409);
  w.invoice.status = 'open';
  await w.event('invoice.payment_failed', w.invoice);
  assert.equal((await w.entitled(who)).entitled, false);
  w.invoice.status = 'paid';
  w.line.period.end += 2000;
  w.item.current_period_end = w.line.period.end;
  await w.event('invoice.paid', w.invoice);
  await w.event('invoice.payment_failed', w.invoice);
  assert.equal((await w.entitled(who)).periodEnd, w.line.period.end * 1000);
  const cancelled = await w.api(who, { action: 'cancel' });
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).subscription.status, 'ending');
  w.advance(13000 * 1000);
  assert.equal((await w.entitled(who)).entitled, false);
  w.sub.status = 'canceled';
  await w.event('customer.subscription.deleted', w.sub);
  await w.event('checkout.session.completed', w.session());
  assert.equal((await w.entitled(who)).entitled, false);
  assert.equal(
    w.f.sql
      .prepare('SELECT COUNT(*) AS n FROM noah_compute_subscriptions')
      .get().n,
    1,
  );
});

void test('forged requests, changed terms, forged shortcuts, and mismatched prices cannot grant access or start billing', async (t) => {
  const w = setup(t);
  const { plan } = await w.get('alice');
  const data = { action: 'checkout', termsVersion: plan.termsVersion };
  assert.equal(
    (await w.api('alice', data, { origin: 'https://elsewhere.test' })).status,
    403,
  );
  assert.equal(
    (
      await w.api('bob', data, {
        [OWNER_SCOPE_HEADER]: await ownerScopeFor('alice'),
      })
    ).status,
    409,
  );
  assert.equal((await w.api('noah-browser:device', data)).status, 401);
  w.env.NOAH_COMPUTE_TEST_MONTHLY_JOBS = '5';
  assert.equal((await w.api('alice', data)).status, 409);
  w.price.unit_amount = 42;
  assert.equal((await w.start('alice')).status, 503);
  assert.equal(w.count(), 0);
  w.price.unit_amount = 27;
  assert.equal((await w.start('alice')).status, 200);
  assert.equal(
    (await w.webhook(new Request(origin, { method: 'POST', body: '{}' })))
      .status,
    400,
  );
  assert.equal(
    (
      await w.event('checkout.session.completed', w.session(), {
        livemode: true,
      })
    ).status,
    400,
  );
  await w.event('checkout.session.completed', w.session());
  assert.equal((await w.entitled('alice')).entitled, false);
  w.complete();
  w.invoice.amount_paid = 0;
  await w.event('checkout.session.completed', w.session());
  assert.equal((await w.entitled('alice')).entitled, false);
  w.invoice.amount_paid = 27;
  await w.event('invoice.paid', w.invoice);
  assert.equal((await w.entitled('alice')).entitled, true);
  w.charge.amount_refunded = 1;
  await w.event('charge.refunded', w.charge);
  assert.equal((await w.entitled('alice')).entitled, false);
  await w.event('invoice.paid', w.invoice);
  assert.equal((await w.entitled('alice')).entitled, false);
  w.charge.amount_refunded = 0;
  w.line.period = { ...w.line.period, start: 1 };
  await w.event('invoice.paid', w.invoice);
  assert.equal((await w.entitled('alice')).entitled, false);
});

void test('configured live terms and device acceptance are explicit, credentials and entitlements are separated by mode and account', async (t) => {
  const w = setup(t);
  await w.start('me');
  w.complete();
  await w.event('checkout.session.completed', w.session());
  const alice = await ownerScopeFor('me');
  for (const scope of [
    { mode: 'live', accountId: 'acct_fixture' },
    { mode: 'test', accountId: 'acct_different' },
    null,
  ]) {
    assert.equal(
      (await sharedComputeEntitlement(w.f.db, alice, scope)).entitled,
      false,
    );
  }
  w.env.NOAH_COMPUTE_BILLING_MODE = 'live';
  assert.equal(readComputeBillingScope(w.env), null);
  assert.equal((await w.get('me')).configured, false);
  for (const [k, v] of Object.entries(w.env))
    if (k.startsWith('NOAH_COMPUTE_TEST_'))
      w.env[k.replace('_TEST_', '_LIVE_')] = v;
  assert.equal(readComputeBillingScope(w.env), null);
  w.env.NOAH_COMPUTE_LIVE_STRIPE_KEY = ['rk', 'live', 'fixture'].join('_');
  const scope = readComputeBillingScope(w.env);
  assert.equal(await readComputeOffer(w.env, scope), null);
  w.env.NOAH_COMPUTE_LIVE_DEVICE_ACCEPTANCE = 'approved';
  assert.ok(await readComputeOffer(w.env, scope));
  assert.equal((await w.get('me')).subscription.entitled, false);
});

void test('lost checkout response recovers by signed session ID and risk holds clear only after rechecking the charge', async (t) => {
  const w = setup(t);
  const realCreate = w.stripe.checkout.sessions.create;
  w.stripe.checkout.sessions.create = async (...args) => {
    await realCreate(...args);
    throw Error('synthetic response lost after Stripe accepted');
  };
  assert.equal((await w.start('paying-account')).status, 503);
  assert.equal(
    w.f.sql.prepare('SELECT session_id FROM noah_compute_subscriptions').get()
      .session_id,
    null,
  );
  w.complete();
  assert.equal(
    (await w.event('checkout.session.completed', w.session())).status,
    200,
  );
  assert.equal((await w.entitled('paying-account')).entitled, true);
  w.charge.disputed = true;
  let disputeStatus = 'under_review';
  w.stripe.disputes = {
    list: async () => ({ has_more: false, data: [{ status: disputeStatus }] }),
  };
  await w.event('charge.dispute.created', {
    id: 'dp_fixture',
    charge: w.charge.id,
  });
  assert.equal((await w.entitled('paying-account')).entitled, false);
  disputeStatus = 'won';
  await w.event('charge.dispute.closed', {
    id: 'dp_fixture',
    charge: w.charge.id,
  });
  assert.equal((await w.entitled('paying-account')).entitled, true);
  w.env.NOAH_COMPUTE_TEST_AMOUNT_MINOR = '31';
  const changed = await w.get('paying-account');
  assert.equal(changed.contract.amountMinor, 27);
  assert.equal(changed.plan.amountMinor, 31);
  delete w.env.NOAH_COMPUTE_TEST_PRICE_ID;
  assert.equal((await w.get('paying-account')).configured, false);
  assert.equal(
    (await w.api('paying-account', { action: 'cancel' })).status,
    200,
  );
  assert.equal((await w.entitled('paying-account')).status, 'ending');
});

void test('a pending checkout resumes at its original terms after the public offer changes', async (t) => {
  const w = setup(t);
  assert.equal((await w.start('payer')).status, 200);
  w.env.NOAH_COMPUTE_TEST_MONTHLY_JOBS = '8';
  const { contract, plan } = await w.get('payer');
  assert.equal(contract.monthlyJobs, 3);
  assert.notEqual(contract.termsVersion, plan.termsVersion);
  assert.equal(
    (
      await w.api('payer', {
        action: 'checkout',
        termsVersion: plan.termsVersion,
      })
    ).status,
    409,
  );
  w.stripe.prices.retrieve = async () => {
    throw Error('old price is no longer offered for new subscriptions');
  };
  assert.equal(
    (
      await w.api('payer', {
        action: 'checkout',
        termsVersion: contract.termsVersion,
      })
    ).status,
    200,
  );
  assert.equal(w.count(), 1);
  w.complete();
  await w.event('checkout.session.completed', w.session());
  assert.equal((await w.entitled('payer')).monthlyJobs, 3);
});

void test('a missed renewal is reconciled on read, and stopping renewal also works when access is suspended', async (t) => {
  const w = setup(t);
  await w.start('payer');
  w.complete();
  await w.event('checkout.session.completed', w.session());
  const previous = await w.entitled('payer');
  w.advance(previous.periodEnd - w.now() + 1234);
  w.line.period.start = w.line.period.end;
  w.line.period.end += 4000;
  w.item.current_period_start = w.line.period.start;
  w.item.current_period_end = w.line.period.end;
  assert.equal((await w.entitled('payer')).entitled, false);
  assert.equal(
    (await w.get('payer')).subscription.periodEnd,
    w.line.period.end * 1000,
  );
  w.charge.refunded = true;
  await w.event('charge.refunded', w.charge);
  const stopped = await (await w.api('payer', { action: 'cancel' })).json();
  assert.equal(stopped.subscription.entitled, false);
  assert.equal(stopped.subscription.renewalStopped, true);
  assert.equal(stopped.subscription.canCancel, false);
  w.sub.status = 'canceled';
  w.advance(61_000);
  assert.equal((await w.get('payer')).contract, null);
});

void test('after the idempotency window, a paid checkout is recovered with one customer-scoped lookup', async (t) => {
  const w = setup(t);
  const original = w.stripe.checkout.sessions.create;
  w.stripe.checkout.sessions.create = async (...args) => {
    await original(...args);
    throw Error('connection ended before the session ID was recorded');
  };
  assert.equal((await w.start('payer')).status, 503);
  w.f.sql
    .prepare('UPDATE noah_compute_subscriptions SET created_at=?')
    .run(Date.now() - 26 * 3600_000);
  w.complete();
  const saved = await w.get('payer');
  const recovered = await w.api('payer', {
    action: 'checkout',
    termsVersion: saved.contract.termsVersion,
  });
  assert.equal(recovered.status, 409);
  assert.equal((await w.get('payer')).subscription.entitled, true);
  assert.equal(w.count(), 1);
});
