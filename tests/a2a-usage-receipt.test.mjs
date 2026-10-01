import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  A2A_USAGE_RECEIPT_SCHEMA,
  a2aUsageReceiptSigningBytes,
  trustedA2AUsageKeyResolver,
  verifyA2AUsageReceipt,
} from '../lib/a2a-usage-receipt.ts';

const now = 1_800_000_000_000;
const intent = {
  ownerUserId: 'alice', parentJobId: 'parent-1', delegationId: 'delegate-1', taskId: 'task-1',
  agentOrigin: 'https://agent.example', agentName: 'Research Agent', agentVersion: '1.2.0',
  currency: 'USD', amountMinor: 47, issuedAt: now,
  delegationCreatedAt: now - 1000, delegationLimitMinor: 500,
};

function publicRaw(key) {
  return new Uint8Array(key.export({ type: 'spki', format: 'der' }).subarray(-32));
}

function signedReceipt(privateKey) {
  const receipt = {
    schema: A2A_USAGE_RECEIPT_SCHEMA, providerId: 'provider-x', keyId: 'usage-key-1', receiptId: 'receipt-1',
    ownerUserId: intent.ownerUserId, parentJobId: intent.parentJobId, delegationId: intent.delegationId,
    taskId: intent.taskId, agentOrigin: intent.agentOrigin, agentName: intent.agentName,
    agentVersion: intent.agentVersion, currency: intent.currency, amountMinor: intent.amountMinor,
    pricingVersion: '2026-09', issuedAt: intent.issuedAt,
    usage: [{ meter: 'model-output', quantity: 1200, unit: 'tokens', amountMinor: 35 }, { meter: 'compute', quantity: 8, unit: 'seconds', amountMinor: 12 }],
    signature: '',
  };
  receipt.signature = sign(null, a2aUsageReceiptSigningBytes(receipt), privateKey).toString('base64url');
  return receipt;
}

void test('provider usage receipt verifies owner, task, meter totals, cap and Ed25519 trust', async () => {
  const pair = generateKeyPairSync('ed25519');
  const receipt = signedReceipt(pair.privateKey);
  const resolver = async (identity) => {
    assert.deepEqual(identity, { providerId: 'provider-x', keyId: 'usage-key-1', agentOrigin: intent.agentOrigin });
    return publicRaw(pair.publicKey);
  };
  assert.equal(await verifyA2AUsageReceipt(receipt, intent, resolver, now), true);
  assert.equal(await verifyA2AUsageReceipt(receipt, intent, async () => null, now), false);
  assert.equal(await verifyA2AUsageReceipt(receipt, { ...intent, ownerUserId: 'bob' }, resolver, now), false);
  assert.equal(await verifyA2AUsageReceipt(receipt, { ...intent, delegationLimitMinor: 46 }, resolver, now), false);
  assert.equal(await verifyA2AUsageReceipt(receipt, intent, resolver, now - 60_000), false);
  assert.equal(await verifyA2AUsageReceipt({ ...receipt, amountMinor: 48 }, intent, resolver, now), false);
  assert.equal(await verifyA2AUsageReceipt({ ...receipt, taskId: 'task-other' }, intent, resolver, now), false);
  assert.equal(await verifyA2AUsageReceipt({ ...receipt, untrusted: true }, intent, resolver, now), false);
  assert.equal(await verifyA2AUsageReceipt({ ...receipt, usage: [{ ...receipt.usage[0], amountMinor: -1 }] }, intent, resolver, now), false);
});

void test('provider usage trust inventory rejects malformed, duplicate and revoked keys', async () => {
  const pair = generateKeyPairSync('ed25519');
  const publicKeyHex = Buffer.from(publicRaw(pair.publicKey)).toString('hex');
  const entry = { providerId: 'provider-x', keyId: 'usage-key-1', agentOrigin: intent.agentOrigin, publicKeyHex, status: 'active' };
  const identity = { providerId: 'provider-x', keyId: 'usage-key-1', agentOrigin: intent.agentOrigin };
  assert.deepEqual(await trustedA2AUsageKeyResolver(JSON.stringify([entry]))(identity), publicRaw(pair.publicKey));
  assert.equal(await trustedA2AUsageKeyResolver(JSON.stringify([{ ...entry, status: 'revoked' }]))(identity), null);
  assert.equal(await trustedA2AUsageKeyResolver(JSON.stringify([entry, entry]))(identity), null);
  assert.equal(await trustedA2AUsageKeyResolver('{') (identity), null);
});
