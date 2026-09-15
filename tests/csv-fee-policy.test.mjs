import test from 'node:test';
import assert from 'node:assert/strict';
import { csvFeeDecision } from '../lib/csv-fee-policy.ts';

await test('CSV seller fee is exactly USD 8.88 only from USD 30 verified net revenue', () => {
  assert.deepEqual(
    csvFeeDecision({
      monthJst: '2026-09',
      verifiedNetUsdMinor: 2999,
      providerEvidence: 'provider:event:1',
    }),
    {
      policyVersion: 'csv-seller-fee/1',
      monthJst: '2026-09',
      verifiedNetUsdMinor: 2999,
      feeDueUsdMinor: 0,
      status: 'waived',
      reason: 'below_threshold',
    },
  );
  assert.equal(
    csvFeeDecision({
      monthJst: '2026-09',
      verifiedNetUsdMinor: 3000,
      providerEvidence: 'provider:event:2',
    }).feeDueUsdMinor,
    888,
  );
  assert.equal(
    csvFeeDecision({
      monthJst: '2026-09',
      verifiedNetUsdMinor: 999999,
      providerEvidence: 'provider:event:3',
    }).feeDueUsdMinor,
    888,
  );
});

await test('CSV seller fee rejects hand-entered decisions without provider evidence', () => {
  assert.throws(
    () =>
      csvFeeDecision({
        monthJst: '2026-09',
        verifiedNetUsdMinor: 3000,
        providerEvidence: '',
      }),
    /PROVIDER_EVIDENCE/,
  );
  assert.throws(
    () =>
      csvFeeDecision({
        monthJst: '2026-9',
        verifiedNetUsdMinor: 3000,
        providerEvidence: 'x',
      }),
    /MONTH_JST/,
  );
});
