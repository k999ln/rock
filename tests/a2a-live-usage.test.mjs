import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  A2A_LIVE_USAGE_SCHEMA,
  a2aLiveUsageSigningBytes,
  verifyA2ALiveUsageSnapshot,
} from '../lib/a2a-live-usage.ts';

const now = 1_800_000_000_000;
const intent = {
  ownerUserId: 'alice', parentJobId: 'parent-1', delegationId: 'delegate-1', taskId: 'task-1',
  agentOrigin: 'https://agent.example', agentName: 'Research Agent', agentVersion: '1.2.0',
  currency: 'USD', delegationCreatedAt: now - 10_000, delegationLimitMinor: 500,
  previousSequence: 1, previousAmountMinor: 10, previousIssuedAt: now - 1000,
};
const pair = generateKeyPairSync('ed25519');
const publicRaw = new Uint8Array(pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
const resolver = async () => publicRaw;

function snapshot() {
  const value = {
    schema: A2A_LIVE_USAGE_SCHEMA, providerId: 'provider-x', keyId: 'usage-key-1', eventId: 'event-2',
    sequence: 2, ownerUserId: intent.ownerUserId, parentJobId: intent.parentJobId,
    delegationId: intent.delegationId, taskId: intent.taskId, agentOrigin: intent.agentOrigin,
    agentName: intent.agentName, agentVersion: intent.agentVersion, currency: intent.currency,
    cumulativeAmountMinor: 37, pricingVersion: 'price-v1', issuedAt: now,
    usage: [{ meter: 'model', quantity: 100, unit: 'tokens', amountMinor: 27 }, { meter: 'compute', quantity: 2, unit: 'seconds', amountMinor: 10 }],
    signature: '',
  };
  value.signature = sign(null, a2aLiveUsageSigningBytes(value), pair.privateKey).toString('base64url');
  return value;
}

void test('live provider meter verifies signature, binding, monotonic sequence and authorized cap', async () => {
  const value = snapshot();
  assert.equal(await verifyA2ALiveUsageSnapshot(value, intent, resolver, now), true);
  assert.equal(await verifyA2ALiveUsageSnapshot(value, intent, async () => null, now), false);
  assert.equal(await verifyA2ALiveUsageSnapshot({ ...value, sequence: 3 }, intent, resolver, now), false);
  assert.equal(await verifyA2ALiveUsageSnapshot({ ...value, cumulativeAmountMinor: 501 }, intent, resolver, now), false);
  assert.equal(await verifyA2ALiveUsageSnapshot({ ...value, cumulativeAmountMinor: 9 }, intent, resolver, now), false);
  assert.equal(await verifyA2ALiveUsageSnapshot({ ...value, issuedAt: intent.previousIssuedAt }, intent, resolver, now), false);
  assert.equal(await verifyA2ALiveUsageSnapshot({ ...value, ownerUserId: 'bob' }, intent, resolver, now), false);
  assert.equal(await verifyA2ALiveUsageSnapshot({ ...value, usage: [{ ...value.usage[0], amountMinor: 26 }, value.usage[1]] }, intent, resolver, now), false);
  assert.equal(await verifyA2ALiveUsageSnapshot({ ...value, signature: `${value.signature[0] === 'A' ? 'B' : 'A'}${value.signature.slice(1)}` }, intent, resolver, now), false);
});
