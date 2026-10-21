import assert from 'node:assert/strict';
import test from 'node:test';
import { linuxStripeBilling } from '../lib/sky-linux-billing.ts';
import { linuxPaymentHandler } from '../lib/sky-linux-payment-handler.ts';
const workspace = { id: 'workspace-fixture', contractDigest: 'a'.repeat(64) };
const bill = () => ({
  id: 'workspace-fixture:2026-10',
  period: '2026-10',
  amountMinor: 1701,
  baseMinor: 1600,
  computeMinor: 1,
  authorMinor: 100,
  state: 'open',
  collectionRequestedAt: Date.now(),
  providerInvoiceId: null,
  paymentSequence: 0,
  paymentRef: null,
  allocations: [
    {
      creatorId: 'creator',
      payableMinor: 90,
      transferRef: null,
      transferRequestedAt: Date.now(),
      recoveryRequired: false,
    },
  ],
});
function fixture() {
  const calls = [],
    invoice = {
      id: 'in_Fixture',
      metadata: {
        sky_linux_workspace: workspace.id,
        sky_linux_invoice: bill().id,
        contract_digest: workspace.contractDigest,
      },
      customer: 'cus_Fixture',
      currency: 'usd',
      livemode: false,
      status: 'draft',
      total: 0,
      amount_due: 0,
      amount_paid: 0,
      amount_remaining: 0,
      hosted_invoice_url: null,
      payments: { data: [], has_more: false },
    };
  const charge = {
    id: 'ch_Fixture',
    payment_intent: 'pi_Fixture',
    amount: 1701,
    paid: true,
    currency: 'usd',
    livemode: false,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
  };
  let capability = 'active';
  const transferred = [];
  const fetcher = async (input, init) => {
    const url = new URL(input),
      parameters = new URLSearchParams(init.body);
    calls.push({
      path: url.pathname,
      method: init.method,
      parameters,
      headers: new Headers(init.headers),
    });
    assert.equal(url.origin, 'https://api.stripe.com');
    assert.equal(
      new Headers(init.headers).get('authorization'),
      'Bearer rk_test_Fixture',
    );
    assert.ok(['manual', 'error'].includes(init.redirect));
    let result;
    if (url.pathname === '/v1/invoices' && init.method === 'POST') {
      assert.equal(parameters.get('auto_advance'), 'false');
      assert.equal(parameters.get('pending_invoice_items_behavior'), 'exclude');
      result = invoice;
    } else if (url.pathname === '/v1/invoiceitems') {
      assert.equal(parameters.get('invoice'), invoice.id);
      invoice.total += Number(parameters.get('amount'));
      invoice.amount_due = invoice.total;
      result = { id: 'ii_Fixture' };
    } else if (url.pathname === '/v1/invoices/in_Fixture/finalize') {
      invoice.status = 'open';
      invoice.hosted_invoice_url = 'https://invoice.stripe.com/i/fixture';
      result = invoice;
    } else if (url.pathname === '/v1/invoices/in_Fixture') result = invoice;
    else if (url.pathname === '/v1/payment_intents/pi_Fixture')
      result = {
        id: 'pi_Fixture',
        customer: 'cus_Fixture',
        status: 'succeeded',
        amount_received: 1701,
        currency: 'usd',
        livemode: false,
        latest_charge: charge,
      };
    else if (url.pathname === '/v1/charges/ch_Fixture') result = charge;
    else if (url.pathname === '/v2/core/accounts/acct_Fixture')
      result = {
        id: 'acct_Fixture',
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { status: capability } },
            },
          },
        },
      };
    else if (url.pathname === '/v1/transfers') {
      assert.equal(parameters.get('source_transaction'), 'ch_Fixture');
      assert.equal(parameters.has('application_fee_amount'), false);
      result = {
        id: 'tr_Fixture',
        amount: Number(parameters.get('amount')),
        currency: 'usd',
        destination: parameters.get('destination'),
        source_transaction: 'ch_Fixture',
        livemode: false,
      };
      transferred.push(result);
    } else if (url.pathname === '/v1/transfers/tr_Fixture/reversals')
      result = { amount: 90, currency: 'usd', transfer: 'tr_Fixture' };
    else throw new Error('Unexpected provider operation: ' + url.pathname);
    return Response.json(result);
  };
  return {
    calls,
    invoice,
    charge,
    transferred,
    setCapability(v) {
      capability = v;
    },
    pay() {
      Object.assign(invoice, {
        status: 'paid',
        amount_paid: 1701,
        amount_remaining: 0,
        payments: {
          data: [
            {
              status: 'paid',
              amount_paid: 1701,
              payment: { type: 'payment_intent', payment_intent: 'pi_Fixture' },
            },
          ],
          has_more: false,
        },
      });
    },
    adapter: linuxStripeBilling(
      { secretKey: 'rk_test_Fixture', mode: 'test', customerId: 'cus_Fixture' },
      fetcher,
    ),
  };
}
void test('monthly invoice uses exact persisted line items and a durable binding before automatic collection', async () => {
  const f = fixture(),
    i = bill();
  const prepared = await f.adapter.prepare(workspace, i);
  assert.equal(prepared.kind, 'collection');
  assert.equal(prepared.payload.amountMinor, 1701);
  assert.equal(
    f.calls.some((c) => c.path.includes('finalize')),
    false,
  );
  await assert.rejects(f.adapter.finalize(workspace, i));
  i.providerInvoiceId = prepared.payload.providerInvoiceId;
  const final = await f.adapter.finalize(workspace, i);
  assert.equal(
    final.payload.collectionUrl,
    'https://invoice.stripe.com/i/fixture',
  );
  assert.equal(f.calls.filter((c) => c.path === '/v1/invoiceitems').length, 3);
  assert.ok(
    f.calls
      .filter((c) => c.method === 'POST')
      .every((c) => c.headers.has('idempotency-key')),
  );
});
void test('invoice status alone cannot produce money; exact paid InvoicePayment and charge are required', async () => {
  const f = fixture(),
    i = bill();
  const p = await f.adapter.prepare(workspace, i);
  i.providerInvoiceId = p.payload.providerInvoiceId;
  assert.equal(await f.adapter.reconcile(workspace, i), null);
  f.pay();
  const paid = await f.adapter.reconcile(workspace, i);
  assert.equal(paid.payload.paymentRef, 'ch_Fixture');
  assert.equal(paid.payload.state, 'paid');
  f.invoice.payments.data[0].amount_paid = 100;
  await assert.rejects(f.adapter.reconcile(workspace, i));
  f.invoice.payments.data[0].amount_paid = 1701;
  f.invoice.metadata.contract_digest = 'b'.repeat(64);
  await assert.rejects(f.adapter.reconcile(workspace, i));
});
void test('a creator receives only their allocation after current charge and v2 recipient capability checks', async () => {
  const f = fixture(),
    i = { ...bill(), state: 'paid', paymentRef: 'ch_Fixture' };
  f.setCapability('inactive');
  await assert.rejects(
    f.adapter.transfer(workspace, i, 'creator', 'acct_Fixture'),
  );
  assert.equal(f.transferred.length, 0);
  f.setCapability('active');
  const transfer = await f.adapter.transfer(
    workspace,
    i,
    'creator',
    'acct_Fixture',
  );
  assert.equal(transfer.payload.amountMinor, 90);
  assert.equal(f.transferred[0].amount, 90);
  f.charge.disputed = true;
  await assert.rejects(
    f.adapter.transfer(workspace, i, 'creator', 'acct_Fixture'),
  );
});
void test('unknown old transfer attempts stop; refunds become reversal evidence, never another payout', async () => {
  const f = fixture(),
    i = { ...bill(), state: 'paid', paymentRef: 'ch_Fixture' };
  i.allocations[0].transferRequestedAt = Date.now() - 21 * 3600000;
  await assert.rejects(
    f.adapter.transfer(workspace, i, 'creator', 'acct_Fixture'),
  );
  assert.equal(f.calls.length, 0);
  i.state = 'reversed';
  i.allocations[0].transferRef = 'tr_Fixture';
  i.allocations[0].recoveryRequired = true;
  const event = await f.adapter.reverse(workspace, i, 'creator');
  assert.equal(event.payload.state, 'reversed');
  await assert.rejects(
    f.adapter.transfer(workspace, i, 'creator', 'acct_Fixture'),
  );
});
void test('unset production billing gate cannot collect or pay out even if API methods are called', () => {
  assert.throws(() => linuxPaymentHandler({}, {}), /準備中/);
});

void test('malformed customer configuration stops before any payment request',()=>{
  const runtime={SKY_LINUX_BILLING_ENABLED:'true',SKY_PAYMENTS_MODE:'test',SKY_STRIPE_SECRET_KEY:'rk_test_Fixture',SKY_STRIPE_WEBHOOK_SECRET:'whsec_Fixture',SKY_PAYMENT_ORIGIN:'http://127.0.0.1:5198'};
  let calls=0;const fetcher=async()=>{calls++;throw new Error('No provider request allowed');};
  for(const value of [{buyer:'cus_Fixture'},'[]','null','{"buyer":{}}','broken']){
    assert.throws(()=>linuxPaymentHandler({}, {...runtime,SKY_LINUX_CUSTOMERS_JSON:value},fetcher),error=>error.message==='支払い先の設定を確認できません。'&&error.status===503);
  }
  assert.equal(calls,0);
});
