import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { stripeForm, stripeRequest, verifyStripeSignature } from '../shared/stripe.mjs';

void test('Stripe form preserves flat Connect fields and nested standalone invoice/line item fields', () => {
  const form = stripeForm({
    'payment_intent_data[transfer_data][destination]': 'acct_fixture',
    'payment_intent_data[application_fee_amount]': '100',
    line_items: [{ price_data: { unit_amount: 1000, currency: 'jpy', product_data: { name: 'A & B 日本語' } }, quantity: 1 }],
    metadata: { empty: '', omitted: null, flag: false },
  });
  const roundtrip = new URLSearchParams(form.toString());
  assert.equal(roundtrip.get('payment_intent_data[transfer_data][destination]'), 'acct_fixture');
  assert.equal(roundtrip.get('payment_intent_data[application_fee_amount]'), '100');
  assert.equal(roundtrip.get('line_items[0][price_data][product_data][name]'), 'A & B 日本語');
  assert.equal(roundtrip.get('line_items[0][quantity]'), '1');
  assert.equal(roundtrip.get('metadata[empty]'), '');
  assert.equal(roundtrip.get('metadata[flag]'), 'false');
  assert.equal(roundtrip.has('metadata[omitted]'), false);
});

void test('shared Stripe transport is fixed-origin, bounded, redacts failures and never retries', async () => {
  for (const path of ['https://attacker.test/v1/refunds', '//attacker.test/v1/refunds', '/v1/../secret', '/v1/invoices/%2f/send']) {
    await assert.rejects(stripeRequest({ path, secretKey: 'sk_fixture', fetchImpl() { assert.fail('must not send credentials'); } }), /STRIPE_REQUEST_INVALID/);
  }
  await assert.rejects(stripeRequest({ path: '/v1/refunds', secretKey: 'sk_fixture', idempotencyKey: 'x\r\nsecret', fetchImpl() { assert.fail('invalid key must not send'); } }), /STRIPE_IDEMPOTENCY_KEY_INVALID/);
  for (const response of [new Response('customer@example.test sk_fixture', { status: 400 }), new Response('not-json-secret'), Response.json(null), Response.json([])]) {
    let calls = 0;
    await assert.rejects(stripeRequest({ path: '/v1/refunds', secretKey: 'sk_fixture', idempotencyKey: 'refund:fixture', fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.headers['Idempotency-Key'], 'refund:fixture');
      return response;
    } }), (error) => {
      assert.match(error.message, /^STRIPE_/);
      assert.doesNotMatch(JSON.stringify(error) + error.message, /sk_fixture|customer@example|not-json-secret/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

void test('Stripe signatures bind raw Unicode bytes, expire and allow either rotated v1 key', async () => {
  const raw = '{"item":"日本語", "amount":1000}';
  const now = 1_800_000_000;
  const secret = 'whsec_fixture';
  const digest = createHmac('sha256', secret).update(`${now}.${raw}`).digest('hex');
  const signature = `t=${now},v1=${'0'.repeat(64)},v1=${digest}`;
  await verifyStripeSignature(raw, signature, secret, now);
  await verifyStripeSignature(raw, signature, secret, now + 300);
  for (const [body, header, key, clock] of [
    [raw + ' ', signature, secret, now], [raw, signature, 'other', now],
    [raw, signature, secret, now + 301], [raw, signature, secret, now - 301],
    [raw, `t=${now},t=${now},v1=${digest}`, secret, now],
    [raw, `t=${now},v1=not-hex`, secret, now], [raw, null, secret, now],
  ]) await assert.rejects(verifyStripeSignature(body, header, key, clock), /STRIPE_SIGNATURE_INVALID/);
});

void test('standalone Stripe assets stay identical and consumers import outside the monorepo', async (t) => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/sync-shared-stripe.mjs', import.meta.url)), '--check']);
  const directory = await mkdtemp(join(tmpdir(), 'rock-stripe-standalone-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(new URL('../sites/avocado-mini/worker/', import.meta.url), join(directory, 'worker'), { recursive: true });
  await cp(new URL('../toolkits/fashion-brand-ops/src/', import.meta.url), join(directory, 'fashion'), { recursive: true });
  const { default: worker } = await import(pathToFileURL(join(directory, 'worker/index.js')));
  const response = await worker.fetch(new Request('https://fixture.test/api/preorders/checkout', { method: 'POST', headers: { origin: 'https://fixture.test', 'content-type': 'application/json' }, body: '{}' }), {});
  assert.equal(response.status, 503);
  const { StripePaymentProvider } = await import(pathToFileURL(join(directory, 'fashion/providers/payment.mjs')));
  const provider = new StripePaymentProvider({ stripeSecretKey: 'sk_fixture' }, { fetchImpl: async () => Response.json({ id: 're_fixture', status: 'succeeded' }) });
  const receipt = await provider.execute('payment.refund', { payment_intent: 'pi_fixture', amount_minor: 100, order_id: 'order1' }, { idempotencyKey: 'refund:fixture' });
  assert.equal(receipt.external_ref, 're_fixture');
  assert.match(receipt.provider_readback_sha256, /^[a-f0-9]{64}$/);
});
