import assert from 'node:assert/strict';
import test from 'node:test';
import { StripePaymentProvider } from '../src/providers/payment.mjs';
import { sha256 } from '../src/util.mjs';

const config = { stripeSecretKey: 'sk_test_fixture', stripeSuccessUrl: 'https://fashion.example/success', stripeCancelUrl: 'https://fashion.example/cancel' };
const payload = { order_id: 'order_fixture', brand_id: 'brand_fixture', customer_id: 'customer_fixture', customer_name: 'Fixture Buyer', customer_email: 'fixture@example.test', currency: 'JPY', quantity: 2, unit_price_minor: 1500, product_name: '日本語 & shirt', days_until_due: 14 };

test('Stripe invoice preserves four merchant-specific steps, stable derived keys and readback digest', async () => {
  const requests = [];
  const responses = [{ id: 'cus_fixture' }, { id: 'ii_fixture' }, { id: 'in_fixture' }, { id: 'in_fixture', status: 'open', hosted_invoice_url: 'https://invoice.stripe.com/i/fixture' }];
  const provider = new StripePaymentProvider(config, { fetchImpl: async (url, options) => {
    requests.push({ url, options, form: new URLSearchParams(options.body) });
    return Response.json(responses[requests.length - 1]);
  } });
  const receipt = await provider.execute('payment.send_invoice', payload, { idempotencyKey: 'order:invoice1' });
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), ['/v1/customers', '/v1/invoiceitems', '/v1/invoices', '/v1/invoices/in_fixture/send']);
  assert.deepEqual(requests.map(({ options }) => options.headers['Idempotency-Key']), ['customer', 'item', 'invoice', 'send'].map((suffix) => `order:invoice1:${suffix}`));
  for (const { options, form } of requests) {
    assert.equal(options.headers.Authorization, 'Bearer sk_test_fixture');
    assert.equal(options.headers['Stripe-Version'], undefined);
    assert.equal(options.redirect, 'error');
    assert.equal(form.has('payment_intent_data[application_fee_amount]'), false);
    assert.equal(form.has('payment_intent_data[transfer_data][destination]'), false);
  }
  assert.equal(requests[0].form.get('email'), payload.customer_email);
  assert.equal(requests[1].form.get('customer'), 'cus_fixture');
  assert.equal(requests[1].form.get('unit_amount'), '3000');
  assert.equal(requests[2].form.get('collection_method'), 'send_invoice');
  assert.equal(requests[2].form.get('days_until_due'), '14');
  assert.equal(requests[3].form.size, 0);
  assert.equal(receipt.external_ref, 'in_fixture');
  assert.equal(receipt.checkout_url, responses[3].hosted_invoice_url);
  assert.equal(receipt.provider_readback_sha256, sha256(responses[3]));
});

test('Stripe checkout encodes nested items while refund keeps Fashion merchant behavior', async () => {
  const requests = [];
  const provider = new StripePaymentProvider(config, { fetchImpl: async (url, options) => {
    requests.push({ url, form: new URLSearchParams(options.body) });
    return Response.json({ id: requests.length === 1 ? 'cs_fixture' : 're_fixture' });
  } });
  await provider.execute('payment.create_link', payload, { idempotencyKey: 'order:checkout1' });
  assert.equal(requests[0].form.get('line_items[0][price_data][unit_amount]'), '1500');
  assert.equal(requests[0].form.get('line_items[0][quantity]'), '2');
  assert.equal(requests[0].form.get('line_items[0][price_data][product_data][name]'), payload.product_name);
  assert.equal(requests[0].form.get('success_url'), config.stripeSuccessUrl);
  await provider.execute('payment.refund', { order_id: payload.order_id, payment_intent: 'pi_fixture', amount_minor: 1500 }, { idempotencyKey: 'order:refund1' });
  assert.equal(requests[1].form.get('amount'), '1500');
  assert.equal(requests[1].form.has('reverse_transfer'), false);
  assert.equal(requests[1].form.has('refund_application_fee'), false);
});

test('invoice validates every idempotency key before creating customer, and stops on a missing provider id', async () => {
  const forbidden = new StripePaymentProvider(config, { fetchImpl() { assert.fail('invalid key must not call Stripe'); } });
  for (const key of [undefined, '', 'bad\nkey', 'x'.repeat(250)]) {
    await assert.rejects(forbidden.execute('payment.send_invoice', payload, { idempotencyKey: key }), /STRIPE_IDEMPOTENCY_KEY_INVALID/);
  }
  let calls = 0;
  const malformed = new StripePaymentProvider(config, { fetchImpl: async () => { calls++; return Response.json({}); } });
  await assert.rejects(malformed.execute('payment.send_invoice', payload, { idempotencyKey: 'order:malformed' }), /stripe_response_id_missing/);
  assert.equal(calls, 1);
});
