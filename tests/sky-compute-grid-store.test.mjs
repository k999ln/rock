import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, beforeEach } from 'node:test';
import {
  b64,
  deviceBody,
  enrollDevice,
  gridHarness,
  lexicalOffer,
  openGridDatabase,
  orderInput,
  sha256,
  START,
} from './sky-compute-grid-live-fixture.mjs';
import { ComputeGridLiveError, parseComputeOrder } from '../lib/sky-compute-grid-live.ts';
import { skyComputeGridStore } from '../lib/sky-compute-grid-store.ts';
import {
  COMPUTE_SKUS,
  FIXTURE_EMBEDDING_SKU,
  lexicalEmbedding,
} from '../lib/sky-compute-grid-skus.ts';

const { db, reset, dispose } = await openGridDatabase();
beforeEach(reset);
after(dispose);

const MINUTE = 60_000;
const one = (sql, ...binds) => db.prepare(sql).bind(...binds).first();
const all = async (sql, ...binds) => (await db.prepare(sql).bind(...binds).all()).results;
const code = (expected) => (error) => error instanceof ComputeGridLiveError && error.code === expected;
const wrongOutput = (items) => new Uint8Array(items.length * 256).fill(7);

/** A public-pool grid with a funded buyer. */
async function publicGrid(budgetHolder = 'buyer', grantMicros = 1_000_000) {
  const grid = gridHarness(db, { mode: 'owner_and_public_pool' });
  await grid.store.grantCredits(budgetHolder, grantMicros, `pilot-${budgetHolder}`, START);
  return grid;
}
const publicOffer = { pools: ['owner', 'public'], priceMicrosPerLot: 1_000 };
const publicOrder = (overrides = {}) => ({
  pool: 'public',
  dataClass: 'public',
  maximumPriceMicrosPerLot: 1_500,
  budgetMicros: 10_000,
  validation: { method: 'independent_reference', quorum: 1 },
  ...overrides,
});

void test('an owner-private order is computed on the owner device, verified, returned, and never stored in clear', async () => {
  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  const offer = await grid.offer(phone);
  assert.equal(offer.trustTier, 'hardware_backed');
  assert.match(offer.providerPseudonym, /^Device [0-9A-F]{4}-[0-9A-F]{4}$/);

  const secret = '口座の暗証番号は書かないこと';
  const order = await grid.order('owner-a', {
    lots: [
      { lotId: 'lot-001', items: [secret, 'meeting notes for Tuesday'] },
      { lotId: 'lot-002', items: ['旅行の計画 京都 二泊三日'] },
    ],
  });
  assert.equal(order.state, 'open');
  assert.deepEqual(order.lots, { total: 2, verified: 0, failed: 0, pending: 2 });

  const { lease } = await grid.claim(phone);
  assert.equal(lease.pool, 'owner');
  assert.equal(lease.priceMicrosPerLot, 0);
  assert.equal(lease.expiresAt - lease.issuedAt, 10 * MINUTE);
  assert.deepEqual(lease.executionPolicy, {
    requiresCharging: true, requiresDeviceIdle: true, requiresUnmeteredNetwork: true,
    maximumThermalStatus: 'light', arbitraryCodeAllowed: false, stopOnOwnerUse: true,
  });
  assert.deepEqual(lease.lots.map((lot) => lot.lotId), ['lot-001', 'lot-002']);
  assert.equal(JSON.parse(Buffer.from(lease.lots[0].input, 'base64').toString('utf8')).items[0], secret);
  // The device learns the work, never whose order it is.
  assert.equal(JSON.stringify(lease).includes('owner-a'), false);

  const { outcome } = await grid.work(phone, lease, { now: START + 5_000 });
  assert.equal(outcome.state, 'accepted');
  assert.deepEqual(outcome.lots.map((lot) => [lot.lotId, lot.state, lot.check]), [
    ['lot-001', 'verified', 'stored'], ['lot-002', 'verified', 'stored'],
  ]);

  const done = await grid.store.getOrder('owner-a', order.orderId, START + 6_000);
  assert.equal(done.state, 'completed');
  assert.deepEqual(done.lots, { total: 2, verified: 2, failed: 0, pending: 0 });
  assert.equal(done.lotDetails[0].providerPseudonym, offer.providerPseudonym);

  const results = await grid.store.orderResults('owner-a', order.orderId, START + 6_000);
  assert.deepEqual(
    results.results.map((result) => Buffer.from(result.output, 'base64').equals(Buffer.from(
      lexicalEmbedding(result.lotId === 'lot-001' ? [secret, 'meeting notes for Tuesday'] : ['旅行の計画 京都 二泊三日'])))),
    [true, true],
  );
  assert.equal(results.results[0].outputBytes, 512);

  // Nothing readable is left in any table: inputs are gone, outputs are sealed.
  const lots = await all('SELECT input_ciphertext AS c FROM sky_compute_lots');
  assert.deepEqual(lots.map((lot) => lot.c), [null, null]);
  const dump = JSON.stringify(await Promise.all([
    'sky_compute_orders', 'sky_compute_lots', 'sky_compute_assignments', 'sky_compute_receipts', 'sky_compute_leases',
  ].map((table) => all(`SELECT * FROM ${table}`))));
  assert.equal(dump.includes(secret), false);
  assert.equal(dump.includes(b64(Buffer.from(secret, 'utf8'))), false);

  // Another account sees neither the order nor its results.
  assert.equal(await grid.store.getOrder('owner-b', order.orderId, START + 6_000), null);
  assert.equal(await grid.store.orderResults('owner-b', order.orderId, START + 6_000), null);
  // No credits move inside one account's own pool.
  assert.equal((await all('SELECT * FROM sky_compute_credit_entries')).length, 0);
});

void test('a device holds one lease at a time and never more lots than it offered', async () => {
  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  await grid.offer(phone, { maxLotsPerLease: 2 });
  const lots = Array.from({ length: 5 }, (_, index) => ({ lotId: `lot-00${index + 1}`, items: [`item ${index}`] }));
  const first = await grid.order('owner-a', { lots });
  const second = await grid.order('owner-a', { lots: [{ lotId: 'other-001', items: ['x y z'] }] });

  // Two claims sent at once by the same device end in exactly one lease.
  const [left, right] = await Promise.all([grid.claim(phone), grid.claim(phone)]);
  assert.equal(left.lease.leaseId, right.lease.leaseId);
  assert.deepEqual(left.lease.lots.map((lot) => lot.lotId), ['lot-001', 'lot-002']);
  assert.equal((await one(`SELECT count(*) AS n FROM sky_compute_leases WHERE state = 'active'`)).n, 1);
  // Asking again returns the same lease instead of a second allocation.
  assert.equal((await grid.claim(phone, { now: START + 1_000 })).lease.leaseId, left.lease.leaseId);
  assert.equal((await one('SELECT count(*) AS n FROM sky_compute_assignments')).n, 2);

  await grid.work(phone, left.lease, { now: START + 2_000 });
  const next = await grid.claim(phone, { now: START + 3_000 });
  assert.notEqual(next.lease.leaseId, left.lease.leaseId);
  assert.equal(next.lease.orderId, first.orderId);
  assert.deepEqual(next.lease.lots.map((lot) => lot.lotId), ['lot-003', 'lot-004']);
  assert.equal((await grid.store.getOrder('owner-a', second.orderId, START + 3_000)).lots.pending, 1);

  // The database itself refuses a second active lease for the device.
  await assert.rejects(db.prepare(`INSERT INTO sky_compute_leases
      (id, order_id, offer_id, order_owner_user_id, provider_owner_user_id, device_ref, key_id, pool,
       sku_id, price_micros_per_lot, lot_count, state, issued_at, expires_at, closed_at)
    SELECT ?, order_id, offer_id, order_owner_user_id, provider_owner_user_id, device_ref, key_id, pool,
       sku_id, 0, 0, 'active', issued_at, expires_at, NULL FROM sky_compute_leases WHERE id = ?`)
    .bind(randomUUID(), next.lease.leaseId).run(), /UNIQUE/);
});

void test('two devices racing for the same lot get it once, and each lot is computed once', async () => {
  const grid = gridHarness(db);
  const phones = await Promise.all([1, 2, 3].map(() => enrollDevice(db, 'owner-a')));
  for (const phone of phones) await grid.offer(phone, { maxLotsPerLease: 8 });
  const order = await grid.order('owner-a', { lots: [{ lotId: 'only-001', items: ['a single lot'] }] });
  const claims = await Promise.all(phones.map((phone) => grid.claim(phone)));
  const winners = claims.filter((claim) => claim.lease);
  assert.equal(winners.length, 1);
  assert.deepEqual(claims.filter((claim) => !claim.lease).map((claim) => claim.reasons), [['no_matching_work'], ['no_matching_work']]);
  const lot = await one('SELECT open_slots AS open, required_results AS required FROM sky_compute_lots WHERE order_id = ?', order.orderId);
  assert.deepEqual(lot, { open: 0, required: 1 });
});

void test('a device is refused work while in use, unplugged, on metered data, hot, or outside its window', async () => {
  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  await grid.offer(phone, { availableUntil: START + 30 * MINUTE });
  await grid.order('owner-a');
  const good = { charging: true, deviceIdle: true, unmeteredNetwork: true, thermalStatus: 'light' };
  for (const [conditions, reason] of [
    [{ ...good, deviceIdle: false }, 'device_in_use'],
    [{ ...good, charging: false }, 'not_charging'],
    [{ ...good, unmeteredNetwork: false }, 'metered_network'],
    [{ ...good, thermalStatus: 'moderate' }, 'thermal_limit'],
  ]) {
    const claim = await grid.claim(phone, { conditions });
    assert.equal(claim.lease, null);
    assert.deepEqual(claim.reasons, [reason]);
  }
  // The last reported conditions are kept for the owner to see.
  assert.equal((await grid.store.listOffers('owner-a'))[0].lastConditions.thermalStatus, 'moderate');
  assert.deepEqual((await grid.claim(phone, { now: START + 30 * MINUTE })).reasons, ['outside_supply_window']);
  assert.equal((await one('SELECT count(*) AS n FROM sky_compute_leases')).n, 0);
  assert.equal((await grid.claim(phone, { conditions: good })).lease.lots.length, 2);
});

void test('only the device that holds a lease, signing with its enrolled key, can answer it', async () => {
  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  const sibling = await enrollDevice(db, 'owner-a');
  const stranger = await enrollDevice(db, 'owner-b');
  await grid.offer(phone);
  await grid.order('owner-a');
  const { lease } = await grid.claim(phone);
  // The honest receipt for this lease, addressed as coming from `device` and
  // signed by `signer` (the device itself unless stated otherwise).
  const receiptFields = (device, signer = device) => {
    const results = lease.lots.map((lot) => {
      const input = Buffer.from(lot.input, 'base64');
      const output = lexicalEmbedding(JSON.parse(input.toString('utf8')).items);
      return { lotId: lot.lotId, inputSha256: sha256(input), outputSha256: sha256(output), outputBytes: output.byteLength, output };
    });
    return deviceBody(device, 'receipt', {
      leaseId: lease.leaseId, startedAt: START, completedAt: START + 1_000,
      runtimeArtifactSha256: lease.runtimeArtifactSha256, modelSha256: lease.modelSha256,
      tokenizerSha256: lease.tokenizerSha256,
      deviceEvidence: { chargingThroughout: true, deviceIdleThroughout: true, unmeteredThroughout: true, maximumThermalStatus: 'none' },
      results: results.map((result) => ({
        lotId: result.lotId, inputSha256: result.inputSha256, outputSha256: result.outputSha256, outputBytes: result.outputBytes,
      })),
    }, { now: START + 1_000, signer, outputs: Object.fromEntries(results.map((result) => [result.lotId, b64(result.output)])) });
  };

  // Another account, and another device of the same account, cannot claim the lease as theirs.
  for (const impostor of [stranger, sibling]) {
    const body = receiptFields(impostor);
    await assert.rejects(async () => grid.store.submitReceipt(impostor.ownerUserId,
      await grid.verified(impostor, body, START + 1_000), START + 1_000), code('lease_not_found'));
  }
  // The right device reference and key id, signed with somebody else's key.
  for (const signer of [stranger, sibling])
    await assert.rejects(grid.verified(phone, receiptFields(phone, signer), START + 1_000), code('device_signature_invalid'));
  // A payload changed after signing.
  const tampered = receiptFields(phone);
  tampered.payload = tampered.payload.replace('"chargingThroughout":true', '"chargingThroughout":true ');
  await assert.rejects(grid.verified(phone, tampered, START + 1_000), code('device_signature_invalid'));
  // A device that names another account's key, an unknown key, or a revoked key.
  await assert.rejects(grid.verified({ ...phone, ownerUserId: 'owner-b' }, receiptFields(phone), START + 1_000), code('device_key_not_enrolled'));
  const revoked = await enrollDevice(db, 'owner-a', { status: 'revoked' });
  await assert.rejects(grid.verified(revoked, deviceBody(revoked, 'claim', {
    skuId: lease.skuId, conditions: { charging: true, deviceIdle: true, unmeteredNetwork: true, thermalStatus: 'none' },
  }, { now: START }), START), code('device_key_not_enrolled'));
  // A request signed long ago, replayed now.
  await assert.rejects(grid.verified(phone, receiptFields(phone), START + 7 * MINUTE), code('device_request_stale'));
  // Outputs that do not belong to the signed result list.
  const extra = receiptFields(phone);
  extra.outputs['lot-999'] = 'AAAA';
  await assert.rejects(grid.verified(phone, extra, START + 1_000), code('receipt_outputs_invalid'));

  assert.equal((await one('SELECT count(*) AS n FROM sky_compute_receipts')).n, 0);
  const honest = receiptFields(phone);
  const outcome = await grid.store.submitReceipt('owner-a', await grid.verified(phone, honest, START + 1_000), START + 1_000);
  assert.equal(outcome.state, 'accepted');
});

void test('offers and orders are admitted only with the reviewed digests of a dispatchable SKU', async () => {
  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  const offerWith = (overrides) => grid.verified(phone, deviceBody(phone, 'offer', { offer: lexicalOffer(overrides) }), START);
  await assert.rejects(offerWith({ modelSha256: 'e'.repeat(64) }), code('offer_artifact_unreviewed'));
  await assert.rejects(offerWith({
    runtimeArtifactSha256: 'e'.repeat(64), modelSha256: 'e'.repeat(64), tokenizerSha256: 'e'.repeat(64),
  }), code('offer_artifact_unreviewed'));
  // The synthetic fixture SKU has reviewed digests but no engine: it is not dispatched.
  const fixtureSku = COMPUTE_SKUS.get(FIXTURE_EMBEDDING_SKU);
  await assert.rejects(offerWith({ skuId: fixtureSku.skuId, ...fixtureSku.artifacts }), code('sku_not_dispatchable'));
  await assert.rejects(offerWith({ skuId: 'arbitrary-container-v1' }), code('sku_not_reviewed'));
  await assert.rejects(offerWith({ abi: 'x86_64' }), code('offer_platform_unsupported'));
  await assert.rejects(parseComputeOrder(orderInput({ skuId: fixtureSku.skuId }), 'owner_pool', START), code('sku_not_dispatchable'));
  await assert.rejects(parseComputeOrder(orderInput({ skuId: 'arbitrary-container-v1' }), 'owner_pool', START), code('sku_not_reviewed'));
  // A receipt that claims another runtime than the leased one is refused whole.
  await grid.offer(phone);
  await grid.order('owner-a');
  const { lease } = await grid.claim(phone);
  const { outcome } = await grid.work(phone, lease, { now: START + 1_000, artifacts: { modelSha256: 'e'.repeat(64) } });
  assert.equal(outcome.state, 'rejected');
  assert.deepEqual(outcome.reasons, ['artifact_digest_mismatch']);
  assert.deepEqual(outcome.lots.map((lot) => lot.state), ['rejected', 'rejected']);
});

void test('a receipt is recorded once per lease: resending is harmless and a different one is refused', async () => {
  const grid = await publicGrid();
  const seller = await enrollDevice(db, 'seller');
  await grid.offer(seller, publicOffer);
  const order = await grid.order('buyer', publicOrder());
  const { lease } = await grid.claim(seller);
  assert.equal(lease.priceMicrosPerLot, 1_000);
  const first = await grid.work(seller, lease, { now: START + 1_000 });
  assert.equal(first.outcome.state, 'accepted');

  // The same bytes again, twice at once: the recorded outcome, no new entries.
  const verified = await grid.verified(seller, first.body, START + 2_000);
  const replays = await Promise.all([1, 2, 3].map(() => grid.store.submitReceipt('seller', verified, START + 2_000)));
  for (const replay of replays) assert.deepEqual(replay, first.outcome);
  // A different receipt for the same lease (new id, same results) cannot settle again.
  const second = await assert.rejects(grid.work(seller, lease, { now: START + 3_000 }), code('receipt_conflict'));
  assert.equal(second, undefined);

  const entries = await all('SELECT kind, owner_user_id AS owner, balance_delta_micros AS delta FROM sky_compute_credit_entries ORDER BY kind, id');
  assert.deepEqual(entries.map((entry) => [entry.kind, entry.owner, entry.delta]), [
    ['earn', 'seller', 1_000], ['earn', 'seller', 1_000],
    ['grant', 'buyer', 1_000_000], ['hold', 'buyer', 0], ['hold_release', 'buyer', 0],
    ['spend', 'buyer', -1_000], ['spend', 'buyer', -1_000],
  ]);
  assert.equal((await one('SELECT count(*) AS n FROM sky_compute_receipts')).n, 1);
  const buyer = await grid.store.account('buyer');
  const sold = await grid.store.account('seller');
  assert.deepEqual([buyer.balanceMicros, buyer.heldMicros, buyer.availableMicros], [998_000, 0, 998_000]);
  assert.deepEqual([sold.balanceMicros, sold.heldMicros], [2_000, 0]);
  assert.equal(buyer.redeemable, false);
  const closed = await grid.store.getOrder('buyer', order.orderId, START + 4_000);
  assert.deepEqual([closed.state, closed.settledMicros, closed.reservedMicros, closed.skyFeeBps], ['completed', 2_000, 0, 0]);
});

void test('credit balances always equal their entries, and the ledger cannot be edited', async () => {
  const grid = await publicGrid('buyer', 50_000);
  const seller = await enrollDevice(db, 'seller');
  await grid.offer(seller, publicOffer);
  await grid.order('buyer', publicOrder());
  const { lease } = await grid.claim(seller);
  await grid.work(seller, lease, { now: START + 1_000 });
  for (const account of await all('SELECT owner_user_id AS owner, balance_micros AS balance, held_micros AS held FROM sky_compute_credit_accounts')) {
    const sum = await one(`SELECT sum(balance_delta_micros) AS balance, sum(held_delta_micros) AS held
      FROM sky_compute_credit_entries WHERE owner_user_id = ?`, account.owner);
    assert.deepEqual([account.balance, account.held], [sum.balance, sum.held]);
  }
  await assert.rejects(db.prepare('UPDATE sky_compute_credit_entries SET balance_delta_micros = 999999').run(), /SKY_COMPUTE_CREDIT_ENTRY_IMMUTABLE/);
  await assert.rejects(db.prepare('DELETE FROM sky_compute_credit_entries').run(), /SKY_COMPUTE_CREDIT_ENTRY_IMMUTABLE/);
  await assert.rejects(db.prepare('UPDATE sky_compute_receipts SET outcome = ?').bind('rejected').run(), /SKY_COMPUTE_RECEIPT_IMMUTABLE/);
  // A verified result cannot be un-verified, re-verified or re-priced.
  await assert.rejects(db.prepare(`UPDATE sky_compute_assignments SET state = 'submitted'`).run(), /SKY_COMPUTE_ASSIGNMENT_TRANSITION/);
  await assert.rejects(db.prepare('UPDATE sky_compute_assignments SET price_micros = 999999').run(), /SKY_COMPUTE_ASSIGNMENT_BINDING_FROZEN/);
  await assert.rejects(db.prepare(`UPDATE sky_compute_orders SET budget_micros = 1`).run(), /SKY_COMPUTE_ORDER_BINDING_FROZEN/);
  // The same grant id never credits twice; credits cannot be spent below zero.
  assert.deepEqual(await grid.store.grantCredits('buyer', 50_000, 'pilot-buyer', START), { granted: false });
  await assert.rejects(db.prepare(`INSERT INTO sky_compute_credit_entries
    (id, owner_user_id, kind, balance_delta_micros, held_delta_micros, idempotency_key, created_at)
    VALUES ('x', 'seller', 'spend', -999999, -999999, 'x', 1)`).run(), /CHECK constraint failed/);
});

void test('a public order holds its budget, never reserves past it, and gives the rest back', async () => {
  const grid = await publicGrid('buyer', 2_500);
  const seller = await enrollDevice(db, 'seller');
  await grid.offer(seller, { ...publicOffer, maxLotsPerLease: 8 });
  // More than the buyer has available: nothing is stored.
  await assert.rejects(grid.order('buyer', publicOrder({ budgetMicros: 2_501 })), code('insufficient_credits'));
  assert.equal((await one('SELECT count(*) AS n FROM sky_compute_orders')).n, 0);
  assert.equal((await one('SELECT count(*) AS n FROM sky_compute_lots')).n, 0);

  const lots = Array.from({ length: 4 }, (_, index) => ({ lotId: `lot-00${index + 1}`, items: [`public text ${index}`] }));
  const order = await grid.order('buyer', publicOrder({ budgetMicros: 2_500, lots }));
  assert.deepEqual([(await grid.store.account('buyer')).heldMicros, (await grid.store.account('buyer')).availableMicros], [2_500, 0]);
  // A second order cannot hold the same credits again.
  await assert.rejects(grid.order('buyer', publicOrder({ budgetMicros: 1 })), code('insufficient_credits'));

  // 2,500 affords two lots at 1,000 each, although the device could take eight.
  const { lease } = await grid.claim(seller);
  assert.deepEqual(lease.lots.map((lot) => lot.lotId), ['lot-001', 'lot-002']);
  assert.equal((await grid.store.getOrder('buyer', order.orderId, START)).reservedMicros, 2_000);
  // The database refuses a reservation past the budget even when asked directly.
  await assert.rejects(db.prepare(`UPDATE sky_compute_orders SET reserved_micros = reserved_micros + 501 WHERE id = ?`)
    .bind(order.orderId).run(), /CHECK constraint failed/);

  await grid.work(seller, lease, { now: START + 1_000 });
  assert.deepEqual((await grid.claim(seller, { now: START + 2_000 })).reasons, ['no_matching_work']);
  const afterDeadline = order.deadlineAt + MINUTE;
  const ended = await grid.store.getOrder('buyer', order.orderId, afterDeadline);
  assert.deepEqual([ended.state, ended.settledMicros, ended.reservedMicros], ['expired', 2_000, 0]);
  assert.deepEqual(ended.lots, { total: 4, verified: 2, failed: 2, pending: 0 });
  const buyer = await grid.store.account('buyer');
  assert.deepEqual([buyer.balanceMicros, buyer.heldMicros], [500, 0]);
  assert.equal((await grid.store.account('seller')).balanceMicros, 2_000);
});

void test('a lease that runs out is reclaimed, its late receipt is refused, and the lots go to the next device', async () => {
  const grid = gridHarness(db);
  const slow = await enrollDevice(db, 'owner-a');
  const fast = await enrollDevice(db, 'owner-a');
  await grid.offer(slow);
  await grid.offer(fast);
  const order = await grid.order('owner-a');
  const { lease } = await grid.claim(slow);
  // During the lease nobody else gets the lots.
  assert.deepEqual((await grid.claim(fast, { now: START + 5 * MINUTE })).reasons, ['no_matching_work']);
  // Just past the end the receipt may still be on the wire: no reassignment yet.
  assert.deepEqual((await grid.claim(fast, { now: lease.expiresAt + 10_000 })).reasons, ['no_matching_work']);
  assert.deepEqual((await grid.claim(slow, { now: lease.expiresAt + 10_000 })).reasons, ['previous_lease_in_grace']);

  const later = lease.expiresAt + 31_000;
  const retaken = await grid.claim(fast, { now: later });
  assert.deepEqual(retaken.lease.lots.map((lot) => lot.lotId), ['lot-001', 'lot-002']);
  assert.deepEqual(await one('SELECT state FROM sky_compute_leases WHERE id = ?', lease.leaseId), { state: 'expired' });
  assert.deepEqual((await all('SELECT attempts FROM sky_compute_lots ORDER BY lot_id')).map((lot) => lot.attempts), [1, 1]);
  assert.equal((await grid.store.listOffers('owner-a')).find((offer) => offer.deviceRef === slow.deviceRef).history.expiredLeases, 1);

  await assert.rejects(grid.work(slow, lease, { now: later + 1_000 }), code('lease_not_active'));
  const { outcome } = await grid.work(fast, retaken.lease, { now: later + 2_000 });
  assert.deepEqual(outcome.lots.map((lot) => lot.state), ['verified', 'verified']);
  assert.equal((await grid.store.getOrder('owner-a', order.orderId, later + 3_000)).state, 'completed');
});

void test('a lot that keeps timing out is given up and the order closes with the failure visible', async () => {
  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  await grid.offer(phone, { availableUntil: START + 6 * 24 * 60 * MINUTE });
  const order = await grid.order('owner-a', {
    deadlineAt: START + 6 * 24 * 60 * MINUTE,
    lots: [{ lotId: 'stuck-001', items: ['never finishes'] }],
  });
  let now = START;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { lease } = await grid.claim(phone, { now });
    assert.equal(lease.lots.length, 1, `attempt ${attempt}`);
    now = lease.expiresAt + 31_000;
  }
  assert.deepEqual((await grid.claim(phone, { now })).reasons, ['no_matching_work']);
  const closed = await grid.store.getOrder('owner-a', order.orderId, now);
  assert.equal(closed.state, 'completed_with_failures');
  assert.deepEqual(closed.lots, { total: 1, verified: 0, failed: 1, pending: 0 });
  assert.deepEqual([closed.lotDetails[0].state, closed.lotDetails[0].attempts], ['failed', 6]);
});

void test('a device that hands work back because its owner picked it up is not penalised', async () => {
  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  await grid.offer(phone);
  await grid.order('owner-a');
  const { lease } = await grid.claim(phone);
  assert.deepEqual(await grid.release(phone, lease.leaseId, { now: START + 2_000 }),
    { leaseId: lease.leaseId, state: 'released', released: true });
  // Doing it twice changes nothing.
  assert.equal((await grid.release(phone, lease.leaseId, { now: START + 3_000 })).released, false);
  assert.deepEqual((await all('SELECT attempts, open_slots AS open FROM sky_compute_lots')).map((lot) => [lot.attempts, lot.open]), [[0, 1], [0, 1]]);
  const offer = (await grid.store.listOffers('owner-a'))[0];
  assert.deepEqual([offer.history.releasedLeases, offer.history.rejectedLots], [1, 0]);
  // The same device may take the lots again later.
  assert.equal((await grid.claim(phone, { now: START + 4_000 })).lease.lots.length, 2);
  await assert.rejects(grid.release(await enrollDevice(db, 'owner-b'), lease.leaseId), code('lease_not_found'));
});

void test('a receipt may cover part of a lease: reported lots are settled and the rest are queued again', async () => {
  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  await grid.offer(phone);
  const order = await grid.order('owner-a');
  const { lease } = await grid.claim(phone);
  const { outcome } = await grid.work(phone, lease, {
    now: START + 1_000,
    compute: (items, lot) => (lot.lotId === 'lot-001' ? lexicalEmbedding(items) : null),
  });
  assert.deepEqual(outcome.lots.map((lot) => [lot.lotId, lot.state, lot.check]), [
    ['lot-001', 'verified', 'stored'], ['lot-002', 'released', 'not_reported'],
  ]);
  assert.deepEqual((await grid.store.getOrder('owner-a', order.orderId, START + 2_000)).lots, { total: 2, verified: 1, failed: 0, pending: 1 });
  const again = await grid.claim(phone, { now: START + 3_000 });
  assert.deepEqual(again.lease.lots.map((lot) => lot.lotId), ['lot-002']);
});

void test('reference verification refuses a wrong result, pays nothing for it, and sends the lot elsewhere', async () => {
  const grid = await publicGrid();
  const cheat = await enrollDevice(db, 'cheat');
  const honest = await enrollDevice(db, 'honest');
  await grid.offer(cheat, publicOffer);
  const order = await grid.order('buyer', publicOrder({ lots: [{ lotId: 'lot-001', items: ['public catalogue text'] }] }));
  const first = await grid.claim(cheat);
  const bad = await grid.work(cheat, first.lease, { now: START + 1_000, compute: wrongOutput });
  assert.equal(bad.outcome.state, 'accepted');
  assert.deepEqual(bad.outcome.lots.map((lot) => lot.state), ['rejected']);
  assert.equal((await grid.store.account('cheat')).balanceMicros, 0);
  const pending = await grid.store.getOrder('buyer', order.orderId, START + 2_000);
  assert.deepEqual([pending.state, pending.reservedMicros, pending.settledMicros], ['open', 0, 0]);
  assert.equal((await grid.store.listOffers('cheat'))[0].history.rejectedLots, 1);
  assert.equal((await grid.store.listOffers('cheat'))[0].history.reliabilityBps, 0);
  // The refused device does not get the same lot again.
  assert.deepEqual((await grid.claim(cheat, { now: START + 3_000 })).reasons, ['no_matching_work']);

  await grid.offer(honest, publicOffer, START + 3_000);
  const second = await grid.claim(honest, { now: START + 4_000 });
  const good = await grid.work(honest, second.lease, { now: START + 5_000 });
  assert.deepEqual(good.outcome.lots.map((lot) => lot.state), ['verified']);
  assert.equal((await grid.store.account('honest')).balanceMicros, 1_000);
  assert.equal((await grid.store.getOrder('buyer', order.orderId, START + 6_000)).state, 'completed');
  assert.equal((await grid.store.listOffers('honest'))[0].history.reliabilityBps, 10_000);
});

void test('malformed outputs are refused per lot without touching the well-formed ones', async () => {
  const grid = await publicGrid();
  const seller = await enrollDevice(db, 'seller');
  await grid.offer(seller, publicOffer);
  await grid.order('buyer', publicOrder());
  const { lease } = await grid.claim(seller);
  const { outcome } = await grid.work(seller, lease, {
    now: START + 1_000,
    compute: (items, lot) => (lot.lotId === 'lot-001' ? new Uint8Array(100) : lexicalEmbedding(items)),
  });
  assert.deepEqual(outcome.lots.map((lot) => [lot.lotId, lot.state, lot.check]), [
    ['lot-001', 'rejected', 'output_length_mismatch'], ['lot-002', 'verified', 'stored'],
  ]);
  assert.equal((await grid.store.account('seller')).balanceMicros, 1_000);
});

void test('a receipt that admits the phone was used, unplugged or hot is refused whole', async () => {
  const grid = await publicGrid();
  const seller = await enrollDevice(db, 'seller');
  await grid.offer(seller, publicOffer);
  const order = await grid.order('buyer', publicOrder());
  const { lease } = await grid.claim(seller);
  const { outcome } = await grid.work(seller, lease, {
    now: START + 1_000,
    evidence: { chargingThroughout: true, deviceIdleThroughout: false, unmeteredThroughout: true, maximumThermalStatus: 'severe' },
  });
  assert.equal(outcome.state, 'rejected');
  assert.deepEqual(outcome.reasons, ['device_used_during_lease', 'thermal_limit_exceeded']);
  assert.deepEqual(outcome.lots.map((lot) => lot.state), ['rejected', 'rejected']);
  assert.equal((await grid.store.account('seller')).balanceMicros, 0);
  assert.deepEqual(await one('SELECT state FROM sky_compute_leases WHERE id = ?', lease.leaseId), { state: 'rejected' });
  const waiting = await grid.store.getOrder('buyer', order.orderId, START + 2_000);
  assert.deepEqual([waiting.lots.pending, waiting.reservedMicros], [2, 0]);
});

void test('a quorum needs different accounts to agree; a disagreement brings in one more device', async () => {
  const grid = await publicGrid();
  const [first, sameAccount, second, third] = [
    await enrollDevice(db, 'provider-1'), await enrollDevice(db, 'provider-1'),
    await enrollDevice(db, 'provider-2'), await enrollDevice(db, 'provider-3'),
  ];
  for (const device of [first, sameAccount, second, third]) await grid.offer(device, publicOffer);
  const order = await grid.order('buyer', publicOrder({
    validation: { method: 'duplicate_quorum', quorum: 2 },
    lots: [{ lotId: 'lot-001', items: ['open data set, row 1'] }],
  }));
  const a = await grid.claim(first);
  assert.equal(a.lease.lots.length, 1);
  // A second phone of the same account is not an independent opinion.
  assert.deepEqual((await grid.claim(sameAccount)).reasons, ['no_matching_work']);
  const b = await grid.claim(second);
  assert.equal(b.lease.lots.length, 1);
  // Both slots are taken: a third account waits.
  assert.deepEqual((await grid.claim(third)).reasons, ['no_matching_work']);

  const wrong = await grid.work(first, a.lease, { now: START + 1_000, compute: wrongOutput });
  // One result alone decides nothing.
  assert.deepEqual(wrong.outcome.lots.map((lot) => lot.state), ['submitted']);
  const right = await grid.work(second, b.lease, { now: START + 2_000 });
  assert.deepEqual(right.outcome.lots.map((lot) => lot.state), ['submitted']);
  assert.deepEqual(await one('SELECT required_results AS required, open_slots AS open, state FROM sky_compute_lots'),
    { required: 3, open: 1, state: 'queued' });
  assert.equal((await grid.store.getOrder('buyer', order.orderId, START + 3_000)).reservedMicros, 2_000);

  const c = await grid.claim(third, { now: START + 3_000 });
  const tie = await grid.work(third, c.lease, { now: START + 4_000 });
  assert.deepEqual(tie.outcome.lots.map((lot) => lot.state), ['verified']);
  const states = await all(`SELECT provider_owner_user_id AS owner, state FROM sky_compute_assignments ORDER BY owner`);
  assert.deepEqual(states.map((row) => [row.owner, row.state]), [
    ['provider-1', 'rejected'], ['provider-2', 'verified'], ['provider-3', 'verified'],
  ]);
  assert.deepEqual(await Promise.all(['provider-1', 'provider-2', 'provider-3'].map(async (owner) =>
    (await grid.store.account(owner)).balanceMicros)), [0, 1_000, 1_000]);
  const closed = await grid.store.getOrder('buyer', order.orderId, START + 5_000);
  assert.deepEqual([closed.state, closed.settledMicros, closed.reservedMicros], ['completed', 2_000, 0]);
  assert.deepEqual([(await grid.store.account('buyer')).balanceMicros, (await grid.store.account('buyer')).heldMicros], [998_000, 0]);
  const results = await grid.store.orderResults('buyer', order.orderId, START + 5_000);
  assert.equal(Buffer.from(results.results[0].output, 'base64').equals(Buffer.from(lexicalEmbedding(['open data set, row 1']))), true);
});

void test('a quorum that never agrees ends unverified and nobody is paid', async () => {
  const grid = await publicGrid();
  const devices = [];
  for (let index = 0; index < 4; index += 1) {
    devices.push(await enrollDevice(db, `provider-${index}`));
    await grid.offer(devices[index], publicOffer);
  }
  const order = await grid.order('buyer', publicOrder({
    validation: { method: 'duplicate_quorum', quorum: 2 },
    lots: [{ lotId: 'lot-001', items: ['contested text'] }],
  }));
  let now = START;
  for (const [index, device] of devices.entries()) {
    now += 1_000;
    const { lease } = await grid.claim(device, { now });
    assert.equal(lease?.lots.length, 1, `device ${index}`);
    // Every device returns a different answer.
    await grid.work(device, lease, { now: now + 500, compute: (items) => new Uint8Array(items.length * 256).fill(index + 1) });
  }
  const closed = await grid.store.getOrder('buyer', order.orderId, now + 2_000);
  assert.deepEqual([closed.state, closed.settledMicros, closed.reservedMicros], ['completed_with_failures', 0, 0]);
  assert.deepEqual((await all('SELECT state FROM sky_compute_assignments')).map((row) => row.state), Array(4).fill('unverified'));
  assert.equal((await one(`SELECT count(*) AS n FROM sky_compute_credit_entries WHERE kind IN ('spend', 'earn')`)).n, 0);
  assert.deepEqual([(await grid.store.account('buyer')).balanceMicros, (await grid.store.account('buyer')).heldMicros], [1_000_000, 0]);
});

void test('within one account, two of its own devices can cross-check each other', async () => {
  const grid = gridHarness(db);
  const [left, right] = [await enrollDevice(db, 'owner-a'), await enrollDevice(db, 'owner-a')];
  await grid.offer(left);
  await grid.offer(right);
  const order = await grid.order('owner-a', {
    validation: { method: 'duplicate_quorum', quorum: 2 },
    lots: [{ lotId: 'lot-001', items: ['家計簿 十月'] }],
  });
  const a = await grid.claim(left);
  const b = await grid.claim(right);
  assert.deepEqual([a.lease.lots.length, b.lease.lots.length], [1, 1]);
  await grid.work(left, a.lease, { now: START + 1_000 });
  const { outcome } = await grid.work(right, b.lease, { now: START + 2_000 });
  assert.deepEqual(outcome.lots.map((lot) => lot.state), ['verified']);
  assert.equal((await grid.store.getOrder('owner-a', order.orderId, START + 3_000)).state, 'completed');
});

void test('floating-point results from different chips agree by similarity, not by identical bytes', async () => {
  const floatSku = {
    skuId: 'test-float-embedding-v1',
    title: 'test float embedding',
    status: 'dispatchable',
    artifacts: { runtimeArtifactSha256: 'a1'.repeat(32), modelSha256: 'b2'.repeat(32), tokenizerSha256: 'c3'.repeat(32) },
    input: { maxItemsPerLot: 16, maxInputBytesPerLot: 8_192 },
    output: { encoding: 'f32le-vectors/1', dimensions: 8 },
    comparison: { kind: 'cosine', minimumCosineBps: 9_990 },
    reference: null,
  };
  const skus = new Map([...COMPUTE_SKUS, [floatSku.skuId, floatSku]]);
  const grid = gridHarness(db, { skus });
  // The "model": a fixed vector per item, plus the low-order noise of one chip.
  const model = (noise) => (items) => {
    const bytes = Buffer.alloc(items.length * 8 * 4);
    items.forEach((item, itemIndex) => {
      for (let index = 0; index < 8; index += 1)
        bytes.writeFloatLE(Math.sin(item.length * (index + 1)) + noise * (index % 2 === 0 ? 1 : -1), (itemIndex * 8 + index) * 4);
    });
    return new Uint8Array(bytes);
  };
  const devices = [await enrollDevice(db, 'owner-a'), await enrollDevice(db, 'owner-a'), await enrollDevice(db, 'owner-a')];
  const terms = { skuId: floatSku.skuId, ...floatSku.artifacts, maxInputBytesPerLot: 8_192 };
  for (const device of devices) await grid.offer(device, terms);
  // Without a reference computation the SKU cannot be ordered with reference checking.
  await assert.rejects(grid.order('owner-a', { skuId: floatSku.skuId, validation: { method: 'independent_reference', quorum: 1 } }),
    code('sku_has_no_reference_computation'));
  const order = await grid.order('owner-a', {
    skuId: floatSku.skuId,
    validation: { method: 'duplicate_quorum', quorum: 2 },
    lots: [{ lotId: 'lot-001', items: ['alpha', 'beta gamma', 'delta'] }],
  });
  const claims = [];
  for (const device of devices.slice(0, 2)) claims.push(await grid.claim(device, { skuId: floatSku.skuId }));
  const outputs = [model(0)(['alpha', 'beta gamma', 'delta']), model(2e-4)(['alpha', 'beta gamma', 'delta'])];
  assert.notEqual(sha256(outputs[0]), sha256(outputs[1]));
  await grid.work(devices[0], claims[0].lease, { now: START + 1_000, compute: model(0) });
  const { outcome } = await grid.work(devices[1], claims[1].lease, { now: START + 2_000, compute: model(2e-4) });
  assert.deepEqual(outcome.lots.map((lot) => lot.state), ['verified']);
  assert.equal((await grid.store.getOrder('owner-a', order.orderId, START + 3_000)).state, 'completed');

  // A result that is not the model's output does not pass as "close enough",
  // and non-finite numbers are refused before any comparison.
  const second = await grid.order('owner-a', {
    skuId: floatSku.skuId,
    validation: { method: 'duplicate_quorum', quorum: 2 },
    lots: [{ lotId: 'lot-001', items: ['alpha', 'beta gamma', 'delta'] }],
  }, START + 4_000);
  const again = [];
  for (const device of devices) again.push(await grid.claim(device, { skuId: floatSku.skuId, now: START + 5_000 }));
  assert.deepEqual(again.map((claim) => claim.lease?.lots.length ?? 0), [1, 1, 0]);
  await grid.work(devices[0], again[0].lease, { now: START + 6_000, compute: model(0) });
  const garbage = await grid.work(devices[1], again[1].lease, {
    now: START + 7_000,
    compute: (items) => new Uint8Array(Buffer.concat(items.map((_, index) => {
      const vector = Buffer.alloc(32);
      for (let slot = 0; slot < 8; slot += 1) vector.writeFloatLE(slot === index ? 1 : 0, slot * 4);
      return vector;
    }))),
  });
  assert.deepEqual(garbage.outcome.lots.map((lot) => lot.state), ['submitted']);
  const third = await grid.claim(devices[2], { skuId: floatSku.skuId, now: START + 8_000 });
  const nan = await grid.work(devices[2], third.lease, {
    now: START + 9_000,
    compute: (items) => { const bytes = model(1e-4)(items); Buffer.from(bytes.buffer).writeFloatLE(Number.NaN, 0); return bytes; },
  });
  assert.deepEqual(nan.outcome.lots.map((lot) => [lot.state, lot.check]), [['rejected', 'output_not_finite']]);
  assert.equal((await grid.store.getOrder('owner-a', second.orderId, START + 10_000)).lots.pending, 1);
});

void test('cancelling an order recalls its work, returns the held credits, and purging deletes the payloads', async () => {
  const grid = await publicGrid();
  const seller = await enrollDevice(db, 'seller');
  await grid.offer(seller, { ...publicOffer, maxLotsPerLease: 1 });
  const order = await grid.order('buyer', publicOrder());
  const done = await grid.claim(seller);
  await grid.work(seller, done.lease, { now: START + 1_000 });
  const running = await grid.claim(seller, { now: START + 2_000 });
  assert.equal(running.lease.lots.length, 1);
  await assert.rejects(grid.store.purgeOrder('buyer', order.orderId, START + 3_000), code('order_still_open'));
  assert.equal(await grid.store.cancelOrder('other', order.orderId, START + 3_000), null);

  const cancelled = await grid.store.cancelOrder('buyer', order.orderId, START + 3_000);
  assert.deepEqual([cancelled.state, cancelled.settledMicros, cancelled.reservedMicros], ['cancelled', 1_000, 0]);
  assert.deepEqual(cancelled.lots, { total: 2, verified: 1, failed: 1, pending: 0 });
  assert.deepEqual([(await grid.store.account('buyer')).balanceMicros, (await grid.store.account('buyer')).heldMicros], [999_000, 0]);
  // The recalled lease can no longer be answered or paid.
  await assert.rejects(grid.work(seller, running.lease, { now: START + 4_000 }), code('lease_not_active'));
  assert.equal((await grid.store.account('seller')).balanceMicros, 1_000);
  // Cancelling twice is the same as once.
  assert.equal((await grid.store.cancelOrder('buyer', order.orderId, START + 5_000)).state, 'cancelled');

  const before = await grid.store.orderResults('buyer', order.orderId, START + 5_000);
  assert.equal(typeof before.results[0].output, 'string');
  const purged = await grid.store.purgeOrder('buyer', order.orderId, START + 6_000);
  assert.equal(purged.purgedAt, START + 6_000);
  const after = await grid.store.orderResults('buyer', order.orderId, START + 7_000);
  assert.deepEqual([after.purged, after.results[0].output, after.results[0].outputSha256], [true, null, before.results[0].outputSha256]);
  assert.equal((await one('SELECT count(*) AS n FROM sky_compute_assignments WHERE output_ciphertext IS NOT NULL')).n, 0);
  assert.equal((await one('SELECT count(*) AS n FROM sky_compute_lots WHERE input_ciphertext IS NOT NULL')).n, 0);
});

void test('stored outputs are purged automatically seven days after an order closes', async () => {
  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  await grid.offer(phone);
  const order = await grid.order('owner-a');
  const { lease } = await grid.claim(phone);
  await grid.work(phone, lease, { now: START + 1_000 });
  const week = 7 * 24 * 60 * MINUTE;
  assert.equal((await grid.store.orderResults('owner-a', order.orderId, START + week)).purged, false);
  const late = await grid.store.orderResults('owner-a', order.orderId, START + week + 2_000);
  assert.deepEqual([late.purged, late.results.map((result) => result.output)], [true, [null, null]]);
});

void test('creating an order is idempotent, and the same id with other content is a conflict', async () => {
  const grid = gridHarness(db);
  const input = orderInput();
  const first = await grid.store.createOrder('owner-a', await parseComputeOrder(input, 'owner_pool', START), START);
  const again = await grid.store.createOrder('owner-a', await parseComputeOrder(input, 'owner_pool', START), START + 1_000);
  assert.deepEqual([first.created, again.created, again.order.orderId], [true, false, first.order.orderId]);
  assert.equal((await one('SELECT count(*) AS n FROM sky_compute_lots')).n, 2);
  const changed = { ...input, lots: [{ lotId: 'lot-001', items: ['different'] }] };
  await assert.rejects(async () => grid.store.createOrder('owner-a', await parseComputeOrder(changed, 'owner_pool', START), START), code('order_id_conflict'));
  await assert.rejects(async () => grid.store.createOrder('owner-b', await parseComputeOrder(input, 'owner_pool', START), START), code('order_id_conflict'));
});

void test('order rules: private text stays in the owner pool, lone surrogates and oversized lots are refused', async () => {
  const parse = (overrides, mode = 'owner_and_public_pool') => parseComputeOrder(orderInput(overrides), mode, START);
  await assert.rejects(parse({ pool: 'public', dataClass: 'owner_private', validation: { method: 'independent_reference', quorum: 1 } }), code('owner_private_requires_owner_pool'));
  await assert.rejects(parse({ pool: 'public', dataClass: 'public' }), code('order_validation_invalid'));
  await assert.rejects(parse({ budgetMicros: 5 }), code('owner_pool_is_not_charged'));
  await assert.rejects(parse({ validation: { method: 'duplicate_quorum', quorum: 1 } }), code('order_validation_invalid'));
  await assert.rejects(parse({ validation: { method: 'duplicate_quorum', quorum: 4 } }), code('order_validation_invalid'));
  await assert.rejects(parse({ deadlineAt: START + 1_000 }), code('order_deadline_invalid'));
  await assert.rejects(parse({ deadlineAt: START + 8 * 24 * 60 * MINUTE }), code('order_deadline_invalid'));
  await assert.rejects(parse({ lots: [{ lotId: 'lot-001', items: ['broken \ud800 text'] }] }), code('order_lot_items_invalid'));
  await assert.rejects(parse({ lots: [{ lotId: 'lot-001', items: ['x'.repeat(70_000)] }] }), code('order_lot_too_large'));
  await assert.rejects(parse({ lots: [{ lotId: 'lot-001', items: ['a'] }, { lotId: 'lot-001', items: ['b'] }] }), code('order_lot_invalid'));
  await assert.rejects(parse({ lots: [] }), code('order_lots_invalid'));
  await assert.rejects(parse({ extra: true }), code('order_invalid'));
  await assert.rejects(parse({ regions: ['Tokyo'] }), code('order_regions_invalid'));
  // The public pool is a separate switch.
  await assert.rejects(parse({ pool: 'public', dataClass: 'public', validation: { method: 'independent_reference', quorum: 1 } }, 'owner_pool'), code('public_pool_not_enabled'));
  await assert.rejects(parse({}, 'disabled'), code('compute_grid_disabled'));
  const parsed = await parse({ regions: ['US-WEST', 'JP-KANTO'] });
  assert.deepEqual(parsed.regions, ['JP-KANTO', 'US-WEST']);
});

void test('an order restricted to a region, memory size or data class only reaches matching devices', async () => {
  const grid = gridHarness(db);
  const small = await enrollDevice(db, 'owner-a');
  const abroad = await enrollDevice(db, 'owner-a');
  const publicOnly = await enrollDevice(db, 'owner-a');
  const fits = await enrollDevice(db, 'owner-a');
  await grid.offer(small, { memoryMiB: 2_048 });
  await grid.offer(abroad, { region: 'US-WEST' });
  await grid.offer(publicOnly, { dataClasses: ['public', 'synthetic'] });
  await grid.offer(fits, { maxInputBytesPerLot: 4_096 });
  await grid.order('owner-a', {
    regions: ['JP-KANTO'], minimumMemoryMiB: 4_096,
    lots: [{ lotId: 'big-001', items: ['y'.repeat(6_000)] }, { lotId: 'small-001', items: ['short'] }],
  });
  for (const device of [small, abroad, publicOnly])
    assert.deepEqual((await grid.claim(device)).reasons, ['no_matching_work']);
  // The device that fits takes only the lot within its input limit.
  assert.deepEqual((await grid.claim(fits)).lease.lots.map((lot) => lot.lotId), ['small-001']);
});

void test('the grid is off unless the deployment enables it, and public offers need the public switch', async () => {
  const off = skyComputeGridStore(db, { mode: 'disabled', dataKey: 'ab'.repeat(32) });
  assert.deepEqual(await off.status('owner-a'), { mode: 'disabled', offers: [], orders: [], account: null });
  await assert.rejects(off.listOrders('owner-a'), code('compute_grid_disabled'));
  await assert.rejects(off.cancelOrder('owner-a', randomUUID()), code('compute_grid_disabled'));

  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  await assert.rejects(grid.offer(phone, { pools: ['owner', 'public'] }), code('public_pool_not_enabled'));
  await assert.rejects(grid.claim(phone), code('offer_not_registered'));

  // Without the storage key nothing is accepted for storage.
  const keyless = gridHarness(db, { dataKey: '' });
  await assert.rejects(keyless.order('owner-a'), code('compute_grid_data_key_unavailable'));
  assert.equal((await one('SELECT count(*) AS n FROM sky_compute_orders')).n, 0);
});

void test('an older signed offer cannot replace a newer one, and a withdrawn device gets no work', async () => {
  const grid = gridHarness(db);
  const phone = await enrollDevice(db, 'owner-a');
  await grid.offer(phone, { maxLotsPerLease: 4 }, START + 10_000);
  await assert.rejects(grid.offer(phone, { maxLotsPerLease: 8 }, START), code('offer_superseded'));
  assert.equal((await grid.store.listOffers('owner-a'))[0].maxLotsPerLease, 4);
  await grid.order('owner-a');
  const { request } = await grid.verified(phone, deviceBody(phone, 'withdraw', { skuId: 'text-lexical-embedding-v1' }, { now: START + 20_000 }), START + 20_000);
  assert.deepEqual(await grid.store.withdrawOffer('owner-a', request, START + 20_000),
    { withdrawn: true, deviceRef: phone.deviceRef, skuId: 'text-lexical-embedding-v1' });
  await assert.rejects(grid.claim(phone, { now: START + 21_000 }), code('offer_not_registered'));
  // Registering again with a newer signature brings the device back.
  await grid.offer(phone, {}, START + 30_000);
  assert.equal((await grid.claim(phone, { now: START + 31_000 })).lease.lots.length, 2);
});

void test('a receipt cannot report lots it was not leased, another input, or bytes that do not match its digests', async () => {
  const grid = await publicGrid();
  const seller = await enrollDevice(db, 'seller');
  await grid.offer(seller, { ...publicOffer, maxLotsPerLease: 1 });
  const order = await grid.order('buyer', publicOrder());
  const send = async (lease, mutate, now) => {
    const lot = lease.lots[0];
    const input = Buffer.from(lot.input, 'base64');
    const output = Buffer.from(lexicalEmbedding(JSON.parse(input.toString('utf8')).items));
    const result = { lotId: lot.lotId, inputSha256: sha256(input), outputSha256: sha256(output), outputBytes: output.byteLength };
    const outputs = { [lot.lotId]: b64(output) };
    mutate(result, outputs);
    const body = deviceBody(seller, 'receipt', {
      leaseId: lease.leaseId, startedAt: now - 500, completedAt: now,
      runtimeArtifactSha256: lease.runtimeArtifactSha256, modelSha256: lease.modelSha256,
      tokenizerSha256: lease.tokenizerSha256,
      deviceEvidence: { chargingThroughout: true, deviceIdleThroughout: true, unmeteredThroughout: true, maximumThermalStatus: 'none' },
      results: [result],
    }, { now, outputs });
    return grid.store.submitReceipt('seller', await grid.verified(seller, body, now), now);
  };

  // A lot of the same order that this lease does not hold.
  const first = await grid.claim(seller);
  assert.deepEqual(first.lease.lots.map((lot) => lot.lotId), ['lot-001']);
  const foreign = await send(first.lease, (result, outputs) => {
    outputs['lot-002'] = outputs['lot-001'];
    delete outputs['lot-001'];
    result.lotId = 'lot-002';
  }, START + 1_000);
  assert.deepEqual([foreign.state, foreign.reasons], ['rejected', ['result_lot_not_leased']]);
  assert.equal((await grid.store.account('seller')).balanceMicros, 0);

  // The refused device does not get lot-001 again; it is offered lot-002.
  const second = await grid.claim(seller, { now: START + 2_000 });
  assert.deepEqual(second.lease.lots.map((lot) => lot.lotId), ['lot-002']);
  const otherInput = await send(second.lease, (result) => { result.inputSha256 = 'd'.repeat(64); }, START + 3_000);
  assert.deepEqual(otherInput.lots.map((lot) => [lot.lotId, lot.state, lot.check]), [['lot-002', 'rejected', 'input_digest_mismatch']]);

  // Honest digest of dishonest bytes, and a length that is not the bytes' length.
  const helper = await enrollDevice(db, 'helper');
  await grid.offer(helper, { ...publicOffer, maxLotsPerLease: 1 });
  const third = await grid.claim(helper, { now: START + 4_000 });
  const sendAs = async (device, lease, mutate, now) => {
    const lot = lease.lots[0];
    const input = Buffer.from(lot.input, 'base64');
    const output = Buffer.from(lexicalEmbedding(JSON.parse(input.toString('utf8')).items));
    const result = { lotId: lot.lotId, inputSha256: sha256(input), outputSha256: sha256(output), outputBytes: output.byteLength };
    const outputs = { [lot.lotId]: b64(output) };
    mutate(result, outputs, output);
    const body = deviceBody(device, 'receipt', {
      leaseId: lease.leaseId, startedAt: now - 500, completedAt: now,
      runtimeArtifactSha256: lease.runtimeArtifactSha256, modelSha256: lease.modelSha256,
      tokenizerSha256: lease.tokenizerSha256,
      deviceEvidence: { chargingThroughout: true, deviceIdleThroughout: true, unmeteredThroughout: true, maximumThermalStatus: 'none' },
      results: [result],
    }, { now, outputs });
    return grid.store.submitReceipt(device.ownerUserId, await grid.verified(device, body, now), now);
  };
  const swapped = await sendAs(helper, third.lease, (result, outputs, output) => {
    const other = Buffer.from(output);
    other[0] ^= 0xff;
    outputs[result.lotId] = b64(other);
  }, START + 5_000);
  assert.deepEqual(swapped.lots.map((lot) => [lot.state, lot.check]), [['rejected', 'output_digest_mismatch']]);
  const fourth = await grid.claim(helper, { now: START + 6_000 });
  const shortened = await sendAs(helper, fourth.lease, (result) => { result.outputBytes -= 1; }, START + 7_000);
  assert.deepEqual(shortened.lots.map((lot) => [lot.state, lot.check]), [['rejected', 'output_length_mismatch']]);

  assert.equal((await one(`SELECT count(*) AS n FROM sky_compute_credit_entries WHERE kind IN ('spend', 'earn')`)).n, 0);
  const waiting = await grid.store.getOrder('buyer', order.orderId, START + 8_000);
  assert.deepEqual([waiting.state, waiting.lots.pending, waiting.reservedMicros, waiting.settledMicros], ['open', 2, 0, 0]);
});

void test('receipts of the same lot arriving at the same moment still settle it exactly once', async () => {
  for (let round = 0; round < 5; round += 1) {
    await reset();
    const grid = await publicGrid();
    const devices = [];
    for (let index = 0; index < 3; index += 1) {
      devices.push(await enrollDevice(db, `provider-${index}`));
      await grid.offer(devices[index], publicOffer);
    }
    const order = await grid.order('buyer', publicOrder({
      validation: { method: 'duplicate_quorum', quorum: 3 },
      lots: [{ lotId: 'lot-001', items: ['row a'] }, { lotId: 'lot-002', items: ['row b'] }],
    }));
    const leases = [];
    for (const device of devices) leases.push((await grid.claim(device)).lease);
    assert.deepEqual(leases.map((lease) => lease.lots.length), [2, 2, 2]);
    await Promise.all(devices.map((device, index) => grid.work(device, leases[index], { now: START + 1_000 })));
    const closed = await grid.store.getOrder('buyer', order.orderId, START + 2_000);
    assert.deepEqual([closed.state, closed.settledMicros, closed.reservedMicros], ['completed', 6_000, 0], `round ${round}`);
    assert.deepEqual((await all('SELECT state FROM sky_compute_assignments')).map((row) => row.state), Array(6).fill('verified'));
    assert.equal((await one(`SELECT count(*) AS n FROM sky_compute_credit_entries WHERE kind = 'earn'`)).n, 6);
    assert.deepEqual(await Promise.all(devices.map(async (device) => (await grid.store.account(device.ownerUserId)).balanceMicros)), [2_000, 2_000, 2_000]);
    assert.deepEqual([(await grid.store.account('buyer')).balanceMicros, (await grid.store.account('buyer')).heldMicros], [994_000, 0]);
  }
});

void test('the database refuses assignments the store would never make', async () => {
  const grid = gridHarness(db);
  const [phone, other] = [await enrollDevice(db, 'owner-a'), await enrollDevice(db, 'owner-a')];
  await grid.offer(phone);
  await grid.offer(other);
  await grid.order('owner-a', { lots: [{ lotId: 'lot-001', items: ['one'] }] });
  const { lease } = await grid.claim(phone);
  const insert = (leaseId, deviceRef, state = 'leased') => db.prepare(`INSERT INTO sky_compute_assignments
      (id, lease_id, order_id, lot_id, order_owner_user_id, provider_owner_user_id, device_ref,
       price_micros, state, created_at, updated_at)
    VALUES (?, ?, ?, 'lot-001', 'owner-a', 'owner-a', ?, 0, ?, ?, ?)`)
    .bind(randomUUID(), leaseId, lease.orderId, deviceRef, state, START, START).run();
  // A lot whose only slot is taken, a lease that does not exist, and a row born as verified.
  await assert.rejects(insert(lease.leaseId, phone.deviceRef), /UNIQUE|SKY_COMPUTE_LOT_NOT_ASSIGNABLE/);
  await assert.rejects(insert(randomUUID(), other.deviceRef), /SKY_COMPUTE_ASSIGNMENT_LEASE/);
  await assert.rejects(insert(lease.leaseId, other.deviceRef, 'verified'), /SKY_COMPUTE_ASSIGNMENT_STATE/);
  await assert.rejects(db.prepare('DELETE FROM sky_compute_assignments').run(), /SKY_COMPUTE_ASSIGNMENT_NO_DELETE/);
  // A result cannot be marked verified without stored output.
  await assert.rejects(db.prepare(`UPDATE sky_compute_assignments SET state = 'verified'`).run(), /SKY_COMPUTE_ASSIGNMENT_OUTPUT_REQUIRED/);
  // A closed lease cannot be reopened, and an order cannot close while it still reserves credits.
  await grid.release(phone, lease.leaseId, { now: START + 1_000 });
  await assert.rejects(db.prepare(`UPDATE sky_compute_leases SET state = 'active', closed_at = NULL`).run(), /SKY_COMPUTE_LEASE_TRANSITION/);
  await assert.rejects(db.prepare(`UPDATE sky_compute_lots SET input_sha256 = ?`).bind('e'.repeat(64)).run(), /SKY_COMPUTE_LOT_BINDING_FROZEN/);
});
