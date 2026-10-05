import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify as verifySignature } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  A2A_USAGE_RECEIPT_SCHEMA,
  a2aUsageReceiptSigningBytes,
  hasActiveA2AUsageKeyForOrigin,
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

void test('quote acquisition can preflight an active trusted Provider key for the exact Agent origin', () => {
  const trust = JSON.stringify([{
    providerId: 'provider-x', keyId: 'usage-key-1', agentOrigin: intent.agentOrigin,
    publicKeyHex: 'a'.repeat(64), status: 'active',
  }]);
  assert.equal(hasActiveA2AUsageKeyForOrigin(trust, intent.agentOrigin), true);
  assert.equal(hasActiveA2AUsageKeyForOrigin(trust, 'https://other-agent.example'), false);
  assert.equal(hasActiveA2AUsageKeyForOrigin(trust.replace('active', 'revoked'), intent.agentOrigin), false);
  assert.equal(hasActiveA2AUsageKeyForOrigin('{', intent.agentOrigin), false);
});

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

void test('native Wallet RFC8032 receipt vector shares exact signing bytes with Cloud', async () => {
  const fixture = JSON.parse(readFileSync(
    new URL('../systems/rock-star-os/tests/fixtures/a2a-usage-receipt-v1.json', import.meta.url), 'utf8',
  ));
  const { fixturePublicKeyHex, signingBytesSha256, notice, ...receipt } = fixture;
  void notice;
  const publicRaw = Buffer.from(fixturePublicKeyHex, 'hex');
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), publicRaw]),
    format: 'der',
    type: 'spki',
  });
  const bytes = a2aUsageReceiptSigningBytes(receipt);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), signingBytesSha256);
  assert.equal(verifySignature(null, bytes, publicKey, Buffer.from(receipt.signature, 'base64url')), true);
  const resolver = trustedA2AUsageKeyResolver(JSON.stringify([{
    providerId: receipt.providerId,
    keyId: receipt.keyId,
    agentOrigin: receipt.agentOrigin,
    publicKeyHex: fixturePublicKeyHex,
    status: 'active',
  }]));
  assert.equal(await verifyA2AUsageReceipt(receipt, {
    ownerUserId: receipt.ownerUserId,
    parentJobId: receipt.parentJobId,
    delegationId: receipt.delegationId,
    taskId: receipt.taskId,
    agentOrigin: receipt.agentOrigin,
    agentName: receipt.agentName,
    agentVersion: receipt.agentVersion,
    currency: receipt.currency,
    amountMinor: receipt.amountMinor,
    issuedAt: receipt.issuedAt,
    delegationCreatedAt: receipt.issuedAt - 1,
    delegationLimitMinor: receipt.amountMinor,
  }, resolver, receipt.issuedAt), true);
});
