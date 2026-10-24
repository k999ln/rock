import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { evaluateWalletDepositProvenance as evaluate } from '../lib/wallet-deposit-provenance.ts';
import { createReceiptSignature } from '../lib/receipt-signature.ts';
import { ROCK_SETTLEMENT_PROVIDER } from '../lib/financial-provider.ts';

// Local synthetic credentials, no account, network, database or actual balance.
const now = 1_792_800_000;
const sha = (body) => createHash('sha256').update(body).digest('hex');
const key = (id, secret) => ({ id, secret: secret.repeat(40), validFrom: now - 1000, expiresAt: now + 1000, revoked: false });
function authority(patch = {}) {
  return {
    manifest: { ...ROCK_SETTLEMENT_PROVIDER, providerId: 'fixture.rail', ownership: 'third_party',
      capabilities: ['receive', 'payout', 'reporting'] },
    railPolicy: { schema: 'wallet-rail-policy/1', operations: ['deposit', 'sales', 'payout'] },
    expected: { ownerId: 'owner:1', chain: 'fixture-chain', account: 'account:1', asset: 'fixture-usdc', currency: 'usd' },
    eventKey: key('fixture-event', 'a'), readbackKey: key('fixture-query', 'b'),
    trustRevision: 2, nowSeconds: now, checkpoint: null, eventClaim: null, ...patch,
  };
}
const bindingKeys = ['providerId', 'ownerId', 'operation', 'chain', 'account', 'asset',
  'currency', 'amountMinor', 'transactionId', 'transferId'];
async function packet(a, eventPatch = {}, queryPatch = {}) {
  const event = { schema: 'wallet-rail-event/1', keyId: a.eventKey.id,
    providerId: a.manifest.providerId, ...a.expected, operation: 'deposit', amountMinor: 50000,
    transactionId: 'tx:1', transferId: 'transfer:0', eventId: 'event:1', effect: 'observation',
    originalEventId: null, businessReference: 'source:1', occurredAt: now - 10, ...eventPatch };
  const eventBody = JSON.stringify(event);
  const readback = { schema: 'wallet-rail-readback/1', keyId: a.readbackKey.id,
    eventSha256: sha(eventBody), binding: Object.fromEntries(bindingKeys.map((k) => [k, event[k]])),
    observedAt: now, sequence: 1, status: 'finalized', reversibleUntil: 0, ...queryPatch };
  const readbackBody = JSON.stringify(readback);
  return { eventBody, readbackBody,
    eventSignature: await createReceiptSignature(eventBody, a.eventKey.secret, now),
    readbackSignature: await createReceiptSignature(readbackBody, a.readbackKey.secret, now) };
}
function noCash(result) {
  assert.equal(result.liveEnabled, false);
  assert.equal(result.creditAllowed, false);
  assert.equal(result.amountToCreditMinor, 0);
  assert.equal(result.evidenceClass, 'signed_fixture_candidate');
  assert.equal(Object.hasOwn(result, 'available'), false);
}
const reload = (value) => JSON.parse(JSON.stringify(value));

void test('signed independent readback is only a proposal; deposit is not capped at 888 cents', async () => {
  const a = authority();
  const before = reload(a);
  const result = await evaluate(await packet(a), a);
  assert.equal(result.stage, 'confirmed_candidate');
  assert.equal(result.amountMinor, 50000);
  assert.equal(result.journalRequirement.expectedRevision, 0);
  assert.equal(result.journalRequirement.action, 'observe_only');
  assert.deepEqual(a, before);
  noCash(result);
});

void test('pending, cancellation window and finality advance across serialized checkpoint reloads', async () => {
  const a = authority();
  const pending = await evaluate(await packet(a, {}, { status: 'pending' }), a);
  assert.equal(pending.stage, 'pending_candidate');
  const restarted = authority({ checkpoint: reload(pending.checkpoint) });
  const held = await evaluate(await packet(restarted, {}, { sequence: 2, reversibleUntil: now + 100 }), restarted);
  assert.equal(held.stage, 'held_candidate');
  const later = authority({ checkpoint: reload(held.checkpoint), nowSeconds: now + 101 });
  const fresh = await packet(later, {}, { sequence: 3, reversibleUntil: now + 100, observedAt: now + 101 });
  const confirmed = await evaluate(fresh, later);
  assert.equal(confirmed.stage, 'confirmed_candidate');
  assert.equal(confirmed.checkpoint.revision, 3);
  for (const result of [pending, held, confirmed]) noCash(result);
});

void test('same evidence re-read after restart is a no-op; stale/retrograde observations cannot replay', async () => {
  const a = authority(), p = await packet(a);
  const result = await evaluate(p, a);
  const restarted = authority({ checkpoint: reload(result.checkpoint) });
  const replay = await evaluate(p, restarted);
  assert.equal(replay.stage, 'replay_noop');
  assert.equal(replay.journalRequirement.action, 'none');
  assert.equal(replay.checkpoint.revision, 1);
  noCash(replay);
  await assert.rejects(evaluate(await packet(restarted, {}, { status: 'pending', sequence: 2 }), restarted), /REGRESSION/);
  await assert.rejects(evaluate(await packet(restarted, {}, { sequence: 1, reversibleUntil: now + 1 }), restarted), /REPLAY_OR_TERMINAL/);
  await assert.rejects(evaluate(p, authority({ checkpoint: result.checkpoint, nowSeconds: now + 301 })), /STALE_READBACK/);
});

void test('bad signatures, modified event and unsigned readback never become credit', async () => {
  const a = authority(), p = await packet(a);
  await assert.rejects(evaluate({ ...p, eventSignature: 't=0,v1=00' }, a), /SIGNATURE/);
  await assert.rejects(evaluate({ ...p, eventBody: p.eventBody.replace('50000', '60000') }, a), /READBACK_MISMATCH/);
  await assert.rejects(evaluate({ ...p, readbackSignature: '' }, a), /SIGNATURE/);
  const wrong = await createReceiptSignature(p.readbackBody, a.eventKey.secret, now);
  await assert.rejects(evaluate({ ...p, readbackSignature: wrong }, a), /SIGNATURE/);
  await assert.rejects(evaluate(await packet(a, {}, { eventSha256: 'a'.repeat(64) }), a), /EVENT_HASH/);
});

void test('signed wrong owner/chain/account/asset/currency and noninteger amounts are rejected', async () => {
  const a = authority();
  for (const patch of [{ ownerId: 'other' }, { chain: 'wrong' }, { account: 'other' },
    { asset: 'wrong' }, { currency: 'eur' }])
    await assert.rejects(evaluate(await packet(a, patch), a), /OWNER_OR_RAIL|CAPABILITY/);
  for (const amountMinor of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '50000'])
    await assert.rejects(evaluate(await packet(a, { amountMinor }), a), /INTEGER/);
  const p = await packet(a);
  const query = JSON.parse(p.readbackBody); query.binding.account = 'wrong';
  await assert.rejects(evaluate(await packet(a, {}, { binding: query.binding }), a), /READBACK_MISMATCH/);
});

void test('client booleans, LLM/work-success and Earning Receipt declarations are not evidence', async () => {
  const a = authority();
  for (const patch of [{ verified: true }, { settled: true }, { source: 'llm' },
    { jobStatus: 'completed' }, { earningReceipt: { sample: false, amountMinor: 50000 } }])
    await assert.rejects(evaluate(await packet(a, patch), a), /FIELDS/);
  const missing = await packet(a); delete missing.readbackBody;
  await assert.rejects(evaluate(missing, a), /FIELDS/);
  const sales = await evaluate(await packet(a, { operation: 'sales' }), a);
  assert.equal(sales.stage, 'earning_reconciliation_required'); noCash(sales);
});

void test('duplicate transfer alias, duplicate external event and cross-owner checkpoint fail closed', async () => {
  const a = authority(), p = await packet(a);
  const first = await evaluate(p, a);
  const restarted = authority({ checkpoint: reload(first.checkpoint) });
  await assert.rejects(evaluate(await packet(restarted, { eventId: 'alias:receipt' }, { sequence: 2 }), restarted), /DUPLICATE_TRANSFER/);
  const otherOwner = authority({ expected: { ...a.expected, ownerId: 'other' }, checkpoint: first.checkpoint });
  await assert.rejects(evaluate(await packet(otherOwner), otherOwner), /TRANSFER_CONFLICT/);
  const claimed = authority({ eventClaim: { eventKey: first.journalRequirement.externalEventKey,
    transferKey: first.journalRequirement.transferKey, eventSha256: sha(p.eventBody) } });
  await assert.rejects(evaluate(await packet(claimed, { transactionId: 'tx:second' }), claimed), /EVENT_CONFLICT/);
  await assert.rejects(evaluate(await packet(claimed, { amountMinor: 42 }), claimed), /EVENT_CONFLICT/);
  assert.equal((await evaluate(p, claimed)).stage, 'confirmed_candidate');
});

void test('refund/reorg propose linked reversal; exact replay is noop and replacement event cannot reverse twice', async () => {
  for (const [effect, status] of [['refund', 'refunded'], ['reorg', 'reorged']]) {
    const a = authority(), first = await evaluate(await packet(a), a);
    const resumed = authority({ checkpoint: reload(first.checkpoint) });
    const patch = { effect, originalEventId: 'event:1', eventId: `${effect}:1` };
    const p = await packet(resumed, patch, { status, sequence: 2 });
    const reverse = await evaluate(p, resumed);
    assert.equal(reverse.stage, 'reversal_candidate');
    assert.equal(reverse.journalRequirement.action, 'linked_reversal_only');
    assert.equal(reverse.journalRequirement.originalEventId, 'event:1'); noCash(reverse);
    const afterRestart = authority({ checkpoint: reload(reverse.checkpoint) });
    assert.equal((await evaluate(p, afterRestart)).stage, 'replay_noop');
    await assert.rejects(evaluate(await packet(afterRestart, { ...patch, eventId: `${effect}:2` }, { status, sequence: 3 }), afterRestart), /REPLAY_OR_TERMINAL/);
    await assert.rejects(evaluate(await packet(afterRestart, {}, { sequence: 3 }), afterRestart), /REPLAY_OR_TERMINAL/);
    await assert.rejects(evaluate(await packet(a, patch, { status }), a), /ORIGINAL_REQUIRED/);
    await assert.rejects(evaluate(await packet(resumed, { ...patch, originalEventId: 'other' }, { status, sequence: 2 }), resumed), /DUPLICATE_TRANSFER/);
    await assert.rejects(evaluate(await packet(resumed, { ...patch, eventId: 'event:1' }, { status, sequence: 2 }), resumed), /REVERSAL_EVENT_ID/);
  }
});

void test('revocation, expiry, trust rollback, suspension and stale readbacks are rechecked after reload', async () => {
  const a = authority(), p = await packet(a), first = await evaluate(p, a);
  for (const property of ['eventKey', 'readbackKey']) {
    await assert.rejects(evaluate(p, authority({ [property]: { ...a[property], revoked: true } })), /KEY/);
    await assert.rejects(evaluate(p, authority({ [property]: { ...a[property], expiresAt: now } })), /KEY/);
  }
  await assert.rejects(evaluate(p, authority({ checkpoint: first.checkpoint, trustRevision: 1 })), /TRUST_ROLLBACK/);
  await assert.rejects(evaluate(p, authority({ readbackKey: a.eventKey })), /INDEPENDENT_KEY/);
  await assert.rejects(evaluate(p, authority({ manifest: { ...a.manifest, status: 'revoked' } })), /CAPABILITY/);
  await assert.rejects(evaluate(await packet(a, {}, { observedAt: now - 301 }), a), /STALE_READBACK/);
  await assert.rejects(evaluate(await packet(a, {}, { observedAt: now + 1 }), a), /STALE_READBACK/);
});

void test('manifest capability and operation extension isolate deposit/sales/payout/fee; LIVE is refused', async () => {
  const a = authority(), p = await packet(a);
  await assert.rejects(evaluate(p, authority({ railPolicy: { schema: 'wallet-rail-policy/1', operations: ['sales'] } })), /OPERATION/);
  await assert.rejects(evaluate(p, authority({ manifest: { ...a.manifest, capabilities: ['payout'] } })), /CAPABILITY/);
  await assert.rejects(evaluate(p, authority({ manifest: { ...a.manifest, mode: 'LIVE', liveEnabled: true } })), /LIVE_DISABLED/);
  const accepted = await evaluate(await packet(a, { operation: 'payout' }), a);
  assert.equal(accepted.stage, 'arrival_readback_required'); noCash(accepted);
  const arrived = await evaluate(await packet(a, { operation: 'payout' }, { status: 'arrived' }), a);
  assert.equal(arrived.stage, 'arrival_candidate'); noCash(arrived);
  await assert.rejects(evaluate(await packet(a, {}, { status: 'arrived' }), a), /ARRIVAL/);
});

void test('fee collection delegates unchanged 888c policy; deposit/sales never reuse monthly billing', async () => {
  const a = authority({ manifest: ROCK_SETTLEMENT_PROVIDER,
    railPolicy: { schema: 'wallet-rail-policy/1', operations: ['fee_collection'] },
    feeAllocation: { receiptId: 'source:1', userId: 'owner:1', period: '2026-10', currency: 'usd',
      allocatedSkyFeeMinor: 488, previouslyCollectedMinor: 400, mode: 'SANDBOX' } });
  const p = await packet(a, { operation: 'fee_collection', amountMinor: 488 });
  noCash(await evaluate(p, a));
  await assert.rejects(evaluate(await packet(a, { operation: 'fee_collection', amountMinor: 1600 }), a), /FEE_POLICY/);
  await assert.rejects(evaluate(p, { ...a, feeAllocation: { ...a.feeAllocation, allocatedSkyFeeMinor: 489 } }), /CAP_EXCEEDED/);
  await assert.rejects(evaluate(p, { ...a, feeAllocation: undefined }), /FEE_POLICY_REQUIRED/);
  await assert.rejects(evaluate(await packet(a), a), /CAPABILITY/);
});

void test('a CAS proposal is deterministic, serializable and carries both hashes plus global uniqueness keys', async () => {
  const a = authority(), p = await packet(a);
  const left = await evaluate(p, a), right = await evaluate(reload(p), reload(a));
  assert.deepEqual(left, right);
  assert.equal(left.journalRequirement.eventSha256, sha(p.eventBody));
  assert.equal(left.journalRequirement.readbackSha256, sha(p.readbackBody));
  assert.ok(left.integrationRequired.includes('existing_journal_global_uniqueness_and_CAS'));
  const invalid = authority({ checkpoint: { ...left.checkpoint, revision: 0 } });
  await assert.rejects(evaluate(p, invalid), /INTEGER/);
  // Two proposals at revision 0 are intentionally not proof of a successful
  // commit: the existing journal writer must atomically admit at most one.
  assert.equal(right.journalRequirement.expectedRevision, 0); noCash(right);
});
