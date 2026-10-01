import test from 'node:test';
import assert from 'node:assert/strict';
import { csvFeeDecision } from '../lib/csv-fee-policy.ts';

await test('CSV seller fee stays at zero while the revenue flow is pending', () => {
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
      status: 'on_hold',
      reason: 'revenue_flow_pending',
    },
  );
  assert.equal(
    csvFeeDecision({
      monthJst: '2026-09',
      verifiedNetUsdMinor: 3000,
      providerEvidence: 'provider:event:2',
    }).feeDueUsdMinor,
    0,
  );
  assert.equal(
    csvFeeDecision({
      monthJst: '2026-09',
      verifiedNetUsdMinor: 999999,
      providerEvidence: 'provider:event:3',
    }).feeDueUsdMinor,
    0,
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
