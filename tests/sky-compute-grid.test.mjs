import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import fixture from '../contracts/sky-compute-grid-fixture.json' with { type: 'json' };
import {
  ComputeGridError,
  createSettlementPreview,
  matchComputeOrder,
  runComputeGridFixture,
  validateCapacityOffer,
  validateComputeOrder,
  verifyComputeReceipt,
} from '../lib/sky-compute-grid.ts';

const clone = (value) => structuredClone(value);

void test('fixed public-text lots match an idle charging Android offer without exposing owner identity', () => {
  const result = runComputeGridFixture(fixture);
  assert.equal(result.evidenceKind, 'synthetic_host_fixture');
  assert.equal(result.productionAccepted, false);
  assert.equal(result.androidRuntimeConnected, false);
  assert.equal(result.match.state, 'matched');
  assert.equal(result.match.leases.length, 1);
  assert.deepEqual(result.match.leases[0].lots.map((lot) => lot.lotId), [
    'lot_demo_001',
    'lot_demo_002',
  ]);
  assert.equal(result.match.reservedMicros, 6_400);
  assert.equal(result.verification.state, 'verified');
  assert.equal(result.settlement.amountMicros, 6_400);
  assert.equal(result.settlement.state, 'service_credit_hold');
  assert.equal(result.settlement.livePayoutAuthorized, false);
  assert.equal(result.settlement.walletMutationAllowed, false);
  assert.equal('providerRefHash' in result.match.leases[0], false);
});

void test('matcher rejects phones that are in use, outside the requested region, hot, metered, or above price cap', () => {
  const input = clone(fixture);
  const hot = clone(input.offers[0]);
  hot.offerId = 'offer_hot_004';
  hot.currentConditions.thermalStatus = 'severe';
  const metered = clone(input.offers[0]);
  metered.offerId = 'offer_metered_005';
  metered.currentConditions.unmeteredNetwork = false;
  const expensive = clone(input.offers[0]);
  expensive.offerId = 'offer_expensive_006';
  expensive.priceMicrosPerLot = 5_001;
  const result = matchComputeOrder(input.order, [input.offers[1], input.offers[2], hot, metered, expensive], new Date(input.now));
  assert.equal(result.state, 'unmatched');
  assert.deepEqual(
    Object.fromEntries(result.rejectedOffers.map((item) => [item.offerId, item.reasons])),
    {
      offer_phone_in_use_002: ['device_in_use'],
      offer_other_region_003: ['region_not_allowed'],
      offer_hot_004: ['thermal_limit'],
      offer_metered_005: ['metered_network'],
      offer_expensive_006: ['price_above_cap'],
    },
  );
});

void test('orders fail closed for personal data, arbitrary SKU, silent cloud fallback, and insufficient budget', () => {
  for (const mutate of [
    (order) => { order.containsPersonalData = true; },
    (order) => { order.skuId = 'arbitrary-container-v1'; },
    (order) => { order.cloudFallbackAuthorized = true; },
    (order) => { order.budgetMicros = 9_999; },
  ]) {
    const order = clone(fixture.order);
    mutate(order);
    assert.throws(() => validateComputeOrder(order), ComputeGridError);
  }
  const offer = clone(fixture.offers[0]);
  offer.workloadPolicy.permitsArbitraryCode = true;
  assert.throws(() => validateCapacityOffer(offer), /固定runtime/);
});

void test('receipt verification binds exact lease, artifacts, safety conditions and independently checked outputs', () => {
  const input = clone(fixture);
  const match = matchComputeOrder(input.order, input.offers, new Date(input.now));
  const lease = match.leases[0];
  const receipt = { ...input.receipt, leaseId: lease.leaseId };
  for (const mutate of [
    (value) => { value.modelSha256 = 'f'.repeat(64); },
    (value) => { value.deviceEvidence.chargingThroughout = false; },
    (value) => { value.results[0].outputSha256 = 'e'.repeat(64); },
    (value) => { value.results.pop(); },
  ]) {
    const invalid = clone(receipt);
    mutate(invalid);
    const result = verifyComputeReceipt(input.order, lease, invalid, input.verificationEvidence);
    assert.equal(result.state, 'rejected');
    assert.equal(result.verifiedLots, 0);
    assert.equal(result.usageReceipt, null);
    assert.throws(() => createSettlementPreview(lease, result), /検証済みlot/);
  }
});

void test('duplicate verification counts distinct leases only and requires the requested quorum', () => {
  const input = clone(fixture);
  input.order.validation = { method: 'duplicate_quorum', quorum: 2 };
  const match = matchComputeOrder(input.order, input.offers, new Date(input.now));
  const lease = match.leases[0];
  const receipt = { ...input.receipt, leaseId: lease.leaseId };
  const missing = verifyComputeReceipt(input.order, lease, receipt, {
    providerRefHash: input.verificationEvidence.providerRefHash,
    duplicateOutputs: {},
  });
  assert.equal(missing.state, 'rejected');
  const duplicateOutputs = Object.fromEntries(receipt.results.map((result, index) => [
    result.lotId,
    [
      { leaseId: `independent_lease_${index}`, outputSha256: result.outputSha256 },
      { leaseId: `independent_lease_${index}`, outputSha256: result.outputSha256 },
    ],
  ]));
  const verified = verifyComputeReceipt(input.order, lease, receipt, {
    providerRefHash: input.verificationEvidence.providerRefHash,
    duplicateOutputs,
  });
  assert.equal(verified.state, 'verified');
  assert.equal(verified.verifiedLots, 2);
});

void test('contract and fixture preserve the explicit privacy, code, fallback, and live-payment boundaries', () => {
  const contract = readFileSync(new URL('../contracts/sky-compute-grid.json', import.meta.url), 'utf8');
  for (const text of [
    '"arbitraryCodeAllowed": false',
    '"personalDataAllowed": false',
    '"cloudFallbackWithoutExplicitOrderAuthorization": false',
    '"liveSettlementEnabled": false',
    '"exactLocationExposedToBuyer": false',
    '"ownerIdentityExposedToBuyer": false',
  ]) assert.match(contract, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
