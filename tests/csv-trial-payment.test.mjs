import test from 'node:test';
import assert from 'node:assert/strict';
import { skyStripe, readSkyStripeConfig } from '../lib/sky-stripe.ts';
import { verifyCsvTrialPayment } from '../lib/csv-trial-payment-validation.ts';
const jobId = 'ab123456-1234-1234-1234-123456789012';
const expected = { jobId, sessionId: 'cs_trial', mode: 'live' };
function paid() {
  return {
    id: 'cs_trial',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    livemode: true,
    currency: 'jpy',
    amount_total: 50,
    client_reference_id: jobId,
    metadata: { csv_job_id: jobId, purpose: 'csv_trial_50' },
    payment_intent: {
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
        refunded: false,
        disputed: false,
        payment_intent: 'pi_trial',
      },
    },
  };
}
void test('JPY Checkout requests exactly 50 yen with no marketplace transfer or additional fee', async () => {
  let fields;
  const client = skyStripe(
    readSkyStripeConfig({
      SKY_PAYMENTS_MODE: 'live',
      SKY_STRIPE_SECRET_KEY: 'sk_live_fixture',
      SKY_STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
      SKY_PAYMENT_ORIGIN: 'https://sky.example',
    }),
    async (_url, init) => {
      fields = new URLSearchParams(init.body);
      assert.equal(init.headers['Idempotency-Key'], `csv-trial:live:${jobId}`);
      return Response.json({
        id: 'cs_trial',
        url: 'https://checkout.stripe.com/c/pay/cs_trial',
      });
    },
  );
  await client.createCsvTrialCheckout(jobId, `csv-trial:live:${jobId}`);
  assert.equal(fields.get('line_items[0][price_data][unit_amount]'), '50');
  assert.equal(fields.get('line_items[0][price_data][currency]'), 'jpy');
  assert.equal(fields.get('payment_method_types[0]'), 'card');
  assert.equal(fields.get('adaptive_pricing[enabled]'), 'false');
  assert.equal(fields.get('metadata[csv_job_id]'), jobId);
  assert.equal(fields.get('payment_intent_data[application_fee_amount]'), null);
  assert.equal(
    fields.get('payment_intent_data[transfer_data][destination]'),
    null,
  );
  assert.equal(
    fields.get('success_url'),
    `https://sky.example/csv?paymentJob=${jobId}`,
  );
  assert.equal(
    fields.get('cancel_url'),
    `https://sky.example/csv?paymentJob=${jobId}&canceled=1`,
  );
  await assert.rejects(client.createCsvTrialCheckout('evil\njob', 'key'), {
    status: 400,
  });
});
void test('only fully matched provider-paid live evidence is accepted', () =>
  verifyCsvTrialPayment(paid(), expected));
for (const [name, change] of Object.entries({
  'wrong owner job': (s) => {
    s.client_reference_id = 'another-job';
  },
  'wrong persisted session': (s) => {
    s.id = 'cs_other';
  },
  unpaid: (s) => {
    s.payment_status = 'unpaid';
  },
  'canceled or expired': (s) => {
    s.status = 'expired';
  },
  'wrong amount': (s) => {
    s.amount_total = 5000;
  },
  'wrong currency': (s) => {
    s.currency = 'usd';
  },
  'test event in live': (s) => {
    s.livemode = false;
  },
  'missing receipt expansion': (s) => {
    s.payment_intent = 'pi_trial';
  },
  'wrong intent amount': (s) => {
    s.payment_intent.amount_received = 49;
  },
  'wrong intent owner': (s) => {
    s.payment_intent.metadata.csv_job_id = 'other';
  },
  'wrong purpose': (s) => {
    s.metadata.purpose = 'different';
  },
  'unfinished intent': (s) => {
    s.payment_intent.status = 'processing';
  },
  refunded: (s) => {
    s.payment_intent.latest_charge.refunded = true;
  },
  'partially refunded': (s) => {
    s.payment_intent.latest_charge.amount_refunded = 1;
  },
  disputed: (s) => {
    s.payment_intent.latest_charge.disputed = true;
  },
  'wrong charge relation': (s) => {
    s.payment_intent.latest_charge.payment_intent = 'pi_other';
  },
  'wrong charge amount': (s) => {
    s.payment_intent.latest_charge.amount = 51;
  },
  'unexpected transfer': (s) => {
    s.payment_intent.transfer_data = { destination: 'acct_other' };
  },
  'unexpected extra fee': (s) => {
    s.payment_intent.application_fee_amount = 5;
  },
}))
  void test(`trial payment refuses ${name}`, () => {
    const session = paid();
    change(session);
    assert.throws(() => verifyCsvTrialPayment(session, expected), {
      status: 409,
    });
  });
