import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  BILLING_TOKEN_TTL_SECONDS,
  createBillingToken,
  verifyBillingToken,
} from '../lib/billing-token.ts';
import {
  allocateEarning,
  periodForUnix,
  validateEarningReceipt,
} from '../services/sky-billing/src/domain.ts';
import { verifyReceiptSignature } from '../services/sky-billing/src/receipt-signature.ts';

const sharedSecret = 'test-only-shared-secret-with-at-least-32-bytes';
const tokenId = '018f47a5-d4db-7c7b-a0db-0a0f00bada55';

void test('billing token binds user, audience, expiry and token id', async () => {
  const token = await createBillingToken(
    'user-123',
    sharedSecret,
    1000,
    tokenId,
  );
  const payload = await verifyBillingToken(token, sharedSecret, 1001);
  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.jti, tokenId);
  assert.equal(payload.exp - payload.iat, BILLING_TOKEN_TTL_SECONDS);
  await assert.rejects(() => verifyBillingToken(token, sharedSecret, 1300));
});

void test('earning receipt signature covers the exact raw body and expires', async () => {
  const raw = JSON.stringify({ receiptId: 'earn_1' });
  const timestamp = 2000;
  const secret = 'receipt-ingest-secret-with-at-least-32-bytes';
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${raw}`)
    .digest('hex');
  const header = `t=${timestamp},v1=bad,v1=${digest}`;
  await verifyReceiptSignature(raw, header, secret, timestamp);
  await assert.rejects(() =>
    verifyReceiptSignature(`${raw} `, header, secret, timestamp),
  );
  await assert.rejects(() =>
    verifyReceiptSignature(raw, header, secret, timestamp + 301),
  );
});

void test('settlement recovers costs first and only then up to USD 8.88', () => {
  assert.deepEqual(
    allocateEarning({
      grossAmountMinor: 500,
      operatingCostMinor: 100,
      previousSkyFeeMinor: 0,
      beneficiaryRole: 'toc',
    }),
    {
      grossAmountMinor: 500,
      operatingCostMinor: 100,
      skyFeeMinor: 400,
      distributableMinor: 0,
      remainingFeeCapMinor: 488,
    },
  );
  assert.equal(
    allocateEarning({
      grossAmountMinor: 1000,
      operatingCostMinor: 100,
      previousSkyFeeMinor: 400,
      beneficiaryRole: 'toc',
    }).skyFeeMinor,
    488,
  );
  const tob = allocateEarning({
    grossAmountMinor: 1000,
    operatingCostMinor: 100,
    previousSkyFeeMinor: 0,
    beneficiaryRole: 'tob',
  });
  assert.equal(tob.skyFeeMinor, 0);
  assert.equal(tob.distributableMinor, 900);
});

void test('earning receipt requires provider evidence and whole USD cents', () => {
  const receipt = {
    receiptId: 'earn_1',
    executionReceiptId: 'exec_1',
    userId: 'alice',
    beneficiaryRole: 'toc',
    sourceProvider: 'stripe-connect',
    providerReference: 'pi_1',
    payoutAccountId: 'acct_alice',
    evidenceSha256: 'a'.repeat(64),
    currency: 'usd',
    grossAmountMinor: 1000,
    operatingCostMinor: 50,
    occurredAt: 1_789_171_200,
  };
  assert.equal(validateEarningReceipt(receipt).receiptId, 'earn_1');
  assert.equal(periodForUnix(receipt.occurredAt), '2026-09');
  assert.throws(() => validateEarningReceipt({ ...receipt, currency: 'jpy' }));
  assert.throws(() =>
    validateEarningReceipt({ ...receipt, operatingCostMinor: 1001 }),
  );
  assert.throws(() =>
    validateEarningReceipt({ ...receipt, grossAmountMinor: 10.5 }),
  );
});
