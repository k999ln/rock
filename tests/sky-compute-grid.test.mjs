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
// The verifier takes the matcher's own offer record, never a provider value
// that arrives next to the receipt.
const evidenceFor = (input, lease) => ({
  matchedOffer: input.offers.find((offer) => offer.offerId === lease.offerId),
  referenceOutputs: input.verificationEvidence.referenceOutputs,
});

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

void test('orders fail closed for personal data, arbitrary SKU, and silent cloud fallback', () => {
  for (const mutate of [
    (order) => { order.containsPersonalData = true; },
    (order) => { order.skuId = 'arbitrary-container-v1'; },
    (order) => { order.cloudFallbackAuthorized = true; },
    (order) => { order.budgetMicros = -1; },
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
    const result = verifyComputeReceipt(input.order, lease, invalid, evidenceFor(input, lease));
    assert.equal(result.state, 'rejected');
    assert.equal(result.verifiedLots, 0);
    assert.equal(result.usageReceipt, null);
    assert.throws(() => createSettlementPreview(lease, result), /検証済みlot/);
  }
});

void test('duplicate verification needs a real sibling lease of the same lot held by another provider', () => {
  const input = clone(fixture);
  input.order.validation = { method: 'duplicate_quorum', quorum: 2 };
  const now = new Date(input.now);
  const other = clone(input.offers[0]);
  other.offerId = 'offer_pixel_night_010';
  other.providerRefHash = '9'.repeat(64);
  other.providerPseudonym = 'Night Pixel 21';
  const lease = matchComputeOrder(input.order, input.offers, now).leases[0];
  const sibling = matchComputeOrder(input.order, [other], now).leases[0];
  const receipt = { ...input.receipt, leaseId: lease.leaseId };
  const matchedOffer = input.offers[0];
  const verifyWith = (observation, order = input.order) => verifyComputeReceipt(order, lease, receipt, {
    matchedOffer,
    duplicateOutputs: Object.fromEntries(receipt.results.map((result) => [
      result.lotId,
      observation ? [{ outputSha256: result.outputSha256, ...observation }] : [],
    ])),
  });

  assert.equal(verifyWith(null).state, 'rejected');
  const verified = verifyWith({ lease: sibling, offer: other });
  assert.equal(verified.state, 'verified');
  assert.equal(verified.verifiedLots, 2);

  // A lease id nobody issued, even with matching output hashes.
  assert.equal(verifyWith({ lease: { ...sibling, leaseId: 'this_lease_does_not_exist' }, offer: other }).state, 'rejected');
  // A second lease that the same provider holds under another offer id.
  const sameProvider = { ...clone(other), providerRefHash: matchedOffer.providerRefHash };
  const sameProviderLease = matchComputeOrder(input.order, [sameProvider], now).leases[0];
  assert.equal(verifyWith({ lease: sameProviderLease, offer: sameProvider }).state, 'rejected');
  // A real lease of a different order.
  const otherOrder = { ...clone(input.order), orderId: 'order_demo_other_002' };
  const otherOrderLease = matchComputeOrder(otherOrder, [other], now).leases[0];
  assert.equal(verifyWith({ lease: otherOrderLease, offer: other }).state, 'rejected');
  // An offer record whose provider was swapped after the lease was issued.
  assert.equal(verifyWith({ lease: sibling, offer: { ...other, providerRefHash: '8'.repeat(64) } }).state, 'rejected');
  // A sibling that disagrees on the output.
  assert.equal(verifyWith({ lease: sibling, offer: other, outputSha256: 'e'.repeat(64) }).state, 'rejected');

  // The same independent provider listed twice is still one provider.
  const three = clone(input.order);
  three.validation = { method: 'duplicate_quorum', quorum: 3 };
  const leaseOfThree = matchComputeOrder(three, input.offers, now).leases[0];
  const siblingOfThree = matchComputeOrder(three, [other], now).leases[0];
  const twice = verifyComputeReceipt(three, leaseOfThree, { ...input.receipt, leaseId: leaseOfThree.leaseId }, {
    matchedOffer,
    duplicateOutputs: Object.fromEntries(receipt.results.map((result) => [result.lotId, [
      { lease: siblingOfThree, offer: other, outputSha256: result.outputSha256 },
      { lease: siblingOfThree, offer: other, outputSha256: result.outputSha256 },
    ]])),
  });
  assert.equal(twice.state, 'rejected');
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

void test('receipt cannot be transferred to another order or altered assignment and settlement stays bound to its lease', () => {
  const input = clone(fixture);
  const lease = matchComputeOrder(input.order, input.offers, new Date(input.now)).leases[0];
  const receipt = { ...input.receipt, leaseId: lease.leaseId };
  const otherOrder = { ...input.order, orderId: 'other_order_001' };
  const crossOrder = verifyComputeReceipt(otherOrder, lease, { ...receipt, orderId: otherOrder.orderId }, evidenceFor(input, lease));
  assert.equal(crossOrder.state, 'rejected');
  assert.ok(crossOrder.reasons.includes('lease_order_mismatch'));
  for (const mutate of [
    (value) => { value.priceMicrosPerLot = 999_999; },
    (value) => { value.lots[0].inputSha256 = 'f'.repeat(64); },
    (value) => { value.lots[0].inputBytes += 1; },
    (value) => { value.lots.push(clone(value.lots[0])); },
    (value) => { value.modelSha256 = 'e'.repeat(64); },
    (value) => { value.region = 'US'; },
    (value) => { value.executionPolicy.arbitraryCodeAllowed = true; },
    (value) => { value.expiresAt = '2027-01-01T00:00:00Z'; },
    (value) => { value.providerPseudonym = 'another-provider'; },
  ]) {
    const altered = clone(lease);
    mutate(altered);
    const verification = verifyComputeReceipt(input.order, altered, receipt, evidenceFor(input, lease));
    assert.equal(verification.state, 'rejected');
    assert.equal(verification.usageReceipt, null);
    assert.ok(verification.reasons.includes('lease_identity_invalid'));
  }
  const verified = verifyComputeReceipt(input.order, lease, receipt, evidenceFor(input, lease));
  assert.equal(verified.state, 'verified');
  assert.throws(() => createSettlementPreview({ ...lease, leaseId: 'other_lease_001' }, verified), { code: 'SETTLEMENT_BINDING' });
  const incorrectPrice = clone(verified);
  incorrectPrice.usageReceipt.totalMicros += 1;
  assert.throws(() => createSettlementPreview(lease, incorrectPrice), { code: 'SETTLEMENT_BINDING' });
});

void test('rematching binds time and terms while receipt retries share one settlement identity', () => {
  const input = clone(fixture);
  const lease = matchComputeOrder(input.order, input.offers, new Date(input.now)).leases[0];
  assert.equal(matchComputeOrder(input.order, input.offers, new Date(input.now)).leases[0].leaseId, lease.leaseId);
  const later = matchComputeOrder(input.order, input.offers, new Date(Date.parse(input.now) + 1_000)).leases[0];
  assert.notEqual(later.leaseId, lease.leaseId);
  const repriced = clone(input.offers);
  repriced[0].priceMicrosPerLot -= 1;
  assert.notEqual(matchComputeOrder(input.order, repriced, new Date(input.now)).leases[0].leaseId, lease.leaseId);
  const receipt = { ...input.receipt, leaseId: lease.leaseId };
  const replay = { ...receipt, receiptId: 'receipt_resend_002' };
  const first = createSettlementPreview(lease, verifyComputeReceipt(input.order, lease, receipt, evidenceFor(input, lease)));
  const second = createSettlementPreview(lease, verifyComputeReceipt(input.order, lease, replay, evidenceFor(input, lease)));
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(verifyComputeReceipt(input.order, later, receipt, evidenceFor(input, later)).state, 'rejected');
});

void test('duplicate offers cannot multiply capacity and prototype property names are not trust or thermal tiers', () => {
  const offer = clone(fixture.offers[0]);
  offer.maxLots = 1;
  assert.throws(() => matchComputeOrder(fixture.order, [offer, clone(offer)], new Date(fixture.now)), { code: 'OFFER_DUPLICATE' });
  for (const value of ['constructor', '__proto__', 'toString']) {
    assert.throws(() => validateCapacityOffer({ ...offer, trustTier: value }), { code: 'OFFER_TRUST' });
    assert.throws(() => validateCapacityOffer({ ...offer, currentConditions: { ...offer.currentConditions, thermalStatus: value } }), { code: 'OFFER_CONDITIONS' });
    assert.throws(() => validateComputeOrder({ ...fixture.order, minimumTrustTier: value }), { code: 'ORDER_TRUST' });
  }
});

void test('the provider of a receipt is fixed by the lease and cannot be replaced by the caller', () => {
  const input = clone(fixture);
  const lease = matchComputeOrder(input.order, input.offers, new Date(input.now)).leases[0];
  const matchedOffer = input.offers[0];
  const forgedProvider = 'f'.repeat(64);
  const receipt = { ...input.receipt, leaseId: lease.leaseId };
  const { referenceOutputs } = input.verificationEvidence;

  // A receipt that names another provider.
  const renamed = verifyComputeReceipt(input.order, lease, { ...receipt, providerRefHash: forgedProvider }, { matchedOffer, referenceOutputs });
  assert.equal(renamed.state, 'rejected');
  assert.ok(renamed.reasons.includes('provider_reference_invalid'));
  // The same forged value supplied on both sides, as the first prototype accepted.
  const bothForged = verifyComputeReceipt(input.order, lease, { ...receipt, providerRefHash: forgedProvider }, {
    matchedOffer: { ...matchedOffer, providerRefHash: forgedProvider }, referenceOutputs,
  });
  assert.equal(bothForged.state, 'rejected');
  assert.ok(bothForged.reasons.includes('lease_identity_invalid'));
  // No offer record at all.
  assert.equal(verifyComputeReceipt(input.order, lease, receipt, { referenceOutputs }).state, 'rejected');
  // The buyer-facing lease still does not reveal the provider reference.
  assert.equal(JSON.stringify(lease).includes(matchedOffer.providerRefHash), false);
  const verified = verifyComputeReceipt(input.order, lease, receipt, { matchedOffer, referenceOutputs });
  assert.equal(verified.usageReceipt.providerRefHash, matchedOffer.providerRefHash);
});

void test('only the reviewed artifact digests of a SKU can be ordered, offered, matched or verified', () => {
  const unreviewed = { runtimeArtifactSha256: 'e'.repeat(64), modelSha256: 'e'.repeat(64), tokenizerSha256: 'e'.repeat(64) };
  assert.throws(() => validateComputeOrder({ ...clone(fixture.order), ...unreviewed }), { code: 'ORDER_ARTIFACT_UNREVIEWED' });
  assert.throws(() => validateCapacityOffer({ ...clone(fixture.offers[0]), ...unreviewed }), { code: 'OFFER_ARTIFACT_UNREVIEWED' });
  // Digests that agree with each other everywhere are still refused.
  const offers = clone(fixture.offers).map((offer) => ({ ...offer, ...unreviewed }));
  assert.throws(() => matchComputeOrder({ ...clone(fixture.order), ...unreviewed }, offers, new Date(fixture.now)), ComputeGridError);
  // One reviewed digest mixed with two of another SKU is refused as well.
  assert.throws(() => validateComputeOrder({ ...clone(fixture.order), modelSha256: 'e'.repeat(64) }), { code: 'ORDER_ARTIFACT_UNREVIEWED' });
});

void test('a budget that covers part of the lots leases what it affords and never reserves more', () => {
  const order = clone(fixture.order);
  order.budgetMicros = 5_000;
  const partial = matchComputeOrder(order, fixture.offers, new Date(fixture.now));
  assert.equal(partial.state, 'partial');
  assert.deepEqual(partial.leases[0].lots.map((lot) => lot.lotId), ['lot_demo_001']);
  assert.deepEqual(partial.unmatchedLotIds, ['lot_demo_002']);
  assert.equal(partial.reservedMicros, 3_200);
  assert.ok(partial.reservedMicros <= order.budgetMicros);
  order.budgetMicros = 3_199;
  const none = matchComputeOrder(order, fixture.offers, new Date(fixture.now));
  assert.equal(none.state, 'unmatched');
  assert.equal(none.reservedMicros, 0);
});
