import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { noahRevenueConfig } from '../../../lib/noah-revenue-operation.ts';
import { createNoahWorkRevenueApi } from '../../../lib/noah-work-revenue-api.ts';
import { createReceiptSignature } from '../../../lib/receipt-signature.ts';

const combinationId = 'affiliate:ai-tools:blog';
const operator = 'operator-at-issuer';

export function revenueConfigFor(familyKey, endpoint, tool) {
  return noahRevenueConfig({
    NOAH_REVENUE_PROVIDER_ID: 'test-revenue-source',
    NOAH_REVENUE_PROVIDER_SECRET: 'local-fixture-receipt-key'.repeat(2),
    NOAH_REVENUE_PROVIDER_TARGET: JSON.stringify({ familyKey, endpoint, tool, combinationId }),
    NOAH_REVENUE_OPERATOR_ACCOUNTS: JSON.stringify({ 'owner-a': operator }),
    NOAH_REVENUE_AUTHOR_OWNERS: JSON.stringify({ noellesugar99: 'separate-author' }),
  });
}

// Use what the external Tool actually received, then read the original saved result as the operator.
export async function checkRevenueDispatch({ deps, meta, job, privateDetail }) {
  assert.equal(meta.workId, job.id);
  assert.equal(meta.version, 1);
  assert.equal(meta.combinationId, combinationId);
  assert.match(meta.dispatchProof, /^[a-f0-9]{64}$/);
  assert.equal(job.noahRemote.revenueDispatchSha256, createHash('sha256').update(meta.dispatchProof).digest('hex'));
  assert.ok(!JSON.stringify(job).includes(meta.dispatchProof));
  const receipts = createNoahWorkRevenueApi(deps);
  async function deliver(stage, source, amountYen, operatorRef, expectedStatus) {
    const body = JSON.stringify({
      schema: 'noah-revenue-receipt/1', ...meta, providerId: deps.revenueConfig.providerId,
      stage, source, amountYen, operatorRef, currency: 'JPY', reference: 'reference/' + stage,
      observedAt: deps.now(), evidenceSha256: createHash('sha256').update('voucher/' + stage).digest('hex'),
    });
    const signature = await createReceiptSignature(body, deps.revenueConfig.secret, Math.floor(deps.now()/1000));
    const response = await receipts.receipt(new Request('https://noah.test/api/noah/revenue/receipts', { method: 'POST',
      headers: { 'content-type': 'application/json', 'avocado-provider-signature': signature }, body }));
    assert.equal(response.status, expectedStatus, await response.text());
  }
  const before = await privateDetail();
  assert.equal(before.workId, job.id);
  assert.equal(before.revenueReceipt.evidenceConnection, 'connected');
  assert.equal(before.revenueReceipt.approvedYen, null);
  await deliver('approved', 'asp-approval', 5500, 'different-operator', 404);
  assert.equal((await privateDetail()).revenueReceipt.approvedYen, null);
  await deliver('approved', 'asp-approval', 5500, operator, 201);
  const approved = await privateDetail();
  assert.deepEqual([approved.revenueReceipt.approvedYen, approved.revenueReceipt.paidYen,
    approved.revenueReceipt.authorShareStatus], [5500, null, 'pending-payment']);
  await deliver('paid', 'bank-deposit', 5000, operator, 201);
  assert.equal((await privateDetail()).revenueReceipt.authorShareStatus, 'pending-cost');
  await deliver('cost', 'final-work-cost', 1250, operator, 201);
  const after = await privateDetail();
  assert.deepEqual(after.revenueReceipt, { approvedYen: 5500, paidYen: 5000, costYen: 1250, shareBps: 2000,
    authorShareYen: 750, authorShareStatus: 'confirmed', evidenceConnection: 'connected' });
  assert.deepEqual(after.result, before.result);
  assert.ok(!JSON.stringify(after).includes(meta.dispatchProof));
}
