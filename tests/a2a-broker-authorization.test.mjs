import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  a2aBrokerAuthorizationSigningBytes,
  A2A_BROKER_AUTHORIZATION_SCHEMA,
  verifyA2ABrokerAuthorization,
  verifyStoredA2ABrokerAuthorization,
} from '../lib/a2a-broker-authorization.ts';
import { createA2AIntentDigests } from '../lib/a2a-authorization.ts';
import {
  parseTrustedA2ABrokerKeys,
  trustedA2ABrokerKeyResolver,
} from '../lib/a2a-broker-trust.ts';

function rawPublicKey(key) {
  return new Uint8Array(key.export({ type: 'spki', format: 'der' }).subarray(-32));
}

function intent(now) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    ownerUserId: 'alice',
    deviceRef: 'device-a',
    parentJobId: 'parent-job-1',
    idempotencyKey: 'delegation-1',
    messageId: 'message-1',
    targetOrigin: 'https://agent.example',
    targetAgentName: 'Research Agent',
    targetAgentVersion: '2.1.0',
    protocolVersion: '1.0',
    inputSha256: '0'.repeat(64),
    authorizationSha256: '0'.repeat(64),
    budgetCurrency: 'USD',
    budgetLimitMinor: 500,
    parentBudgetLimitMinor: 900,
    deadlineAt: now + 10 * 60_000,
    message: 'Summarize public information.',
  };
}

async function signedProof(approvalIntent, privateKey, now) {
  const digests = await createA2AIntentDigests(approvalIntent);
  const proof = {
    schema: A2A_BROKER_AUTHORIZATION_SCHEMA,
    authorityId: 'fixture-rockstaros',
    ownerUserId: approvalIntent.ownerUserId,
    deviceRef: approvalIntent.deviceRef,
    delegationId: approvalIntent.id,
    parentJobId: approvalIntent.parentJobId,
    messageId: approvalIntent.messageId,
    targetOrigin: approvalIntent.targetOrigin,
    targetAgentName: approvalIntent.targetAgentName,
    targetAgentVersion: approvalIntent.targetAgentVersion,
    protocolVersion: approvalIntent.protocolVersion,
    inputSha256: digests.inputSha256,
    budgetCurrency: approvalIntent.budgetCurrency,
    budgetLimitMinor: approvalIntent.budgetLimitMinor,
    deadlineAt: approvalIntent.deadlineAt,
    authorizationSha256: digests.authorizationSha256,
    issuedAt: now,
    expiresAt: now + 5 * 60_000,
    keyId: 'fixture-device-key',
    signature: '',
  };
  proof.signature = sign(null, a2aBrokerAuthorizationSigningBytes(proof), privateKey).toString('base64url');
  return proof;
}

void test('native Broker authorization verifies only for the exact owner, device, agent, input and budget', async () => {
  const now = 1_000_000;
  const approvalIntent = intent(now);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicBytes = rawPublicKey(publicKey);
  const proof = await signedProof(approvalIntent, privateKey, now);
  const resolveTrustedKey = async (identity) => {
    assert.deepEqual(identity, {
      authorityId: 'fixture-rockstaros',
      ownerUserId: 'alice',
      deviceRef: 'device-a',
      keyId: 'fixture-device-key',
    });
    return publicBytes;
  };

  assert.equal(await verifyA2ABrokerAuthorization(proof, approvalIntent, resolveTrustedKey, now), true);
  const stored = {
    proofJson: JSON.stringify(proof),
    deviceRef: proof.deviceRef,
    authorityId: proof.authorityId,
    keyId: proof.keyId,
    expiresAt: proof.expiresAt,
  };
  assert.equal(await verifyStoredA2ABrokerAuthorization(
    stored,
    approvalIntent,
    resolveTrustedKey,
    now,
  ), true);
  assert.equal(await verifyStoredA2ABrokerAuthorization(
    { ...stored, deviceRef: 'device-b' },
    approvalIntent,
    resolveTrustedKey,
    now,
  ), false);
  assert.equal(await verifyStoredA2ABrokerAuthorization(
    null,
    approvalIntent,
    resolveTrustedKey,
    now,
  ), false);
  assert.equal(proof.authorizationSha256, '7f4e0473204b95832a667d3cca19b91a3664edc8c250045066cc97fb8027ed46');
  assert.equal(
    createHash('sha256').update(a2aBrokerAuthorizationSigningBytes(proof)).digest('hex'),
    'b4a9154f5fbc0db50cc73d9495e5a7d8e40317bca3c70d9e28183772a1018738',
  );
  assert.equal(await verifyA2ABrokerAuthorization(proof, approvalIntent, async () => null, now), false);
  assert.equal(await verifyA2ABrokerAuthorization(proof, approvalIntent, resolveTrustedKey, now + 6 * 60_000), false);

  const changedBudget = { ...approvalIntent, budgetLimitMinor: 501 };
  assert.equal(await verifyA2ABrokerAuthorization(proof, changedBudget, resolveTrustedKey, now), false);
  const changedParentBudget = { ...approvalIntent, parentBudgetLimitMinor: 901 };
  assert.equal(await verifyA2ABrokerAuthorization(proof, changedParentBudget, resolveTrustedKey, now), false);
  const changedOwner = { ...approvalIntent, ownerUserId: 'owner-bob' };
  assert.equal(await verifyA2ABrokerAuthorization(proof, changedOwner, resolveTrustedKey, now), false);
  const extended = { ...proof, budgetLimitMinor: 50_000 };
  assert.equal(await verifyA2ABrokerAuthorization(extended, approvalIntent, resolveTrustedKey, now), false);
  const extraField = { ...proof, approved: true };
  assert.equal(await verifyA2ABrokerAuthorization(extraField, approvalIntent, resolveTrustedKey, now), false);
});

void test('Broker proof rejects signatures from untrusted keys and unsafe origins', async () => {
  const now = 1_000_000;
  const approvalIntent = intent(now);
  const keyPair = generateKeyPairSync('ed25519');
  const wrongKeyPair = generateKeyPairSync('ed25519');
  const proof = await signedProof(approvalIntent, keyPair.privateKey, now);
  assert.equal(
    await verifyA2ABrokerAuthorization(proof, approvalIntent, async () => rawPublicKey(wrongKeyPair.publicKey), now),
    false,
  );
  const unsafeOrigin = { ...approvalIntent, targetOrigin: 'https://agent.example:443' };
  assert.equal(
    await verifyA2ABrokerAuthorization(proof, unsafeOrigin, async () => rawPublicKey(keyPair.publicKey), now),
    false,
  );
  const privateOrigin = { ...approvalIntent, targetOrigin: 'https://127.0.0.1' };
  assert.equal(
    await verifyA2ABrokerAuthorization(proof, privateOrigin, async () => rawPublicKey(keyPair.publicKey), now),
    false,
  );
  const expiredProof = await signedProof(approvalIntent, keyPair.privateKey, now - 300_001);
  assert.equal(
    await verifyA2ABrokerAuthorization(expiredProof, approvalIntent, async () => rawPublicKey(keyPair.publicKey), now),
    false,
  );
});

void test('deployment trust inventory binds active keys to one authority, owner and device', async () => {
  const keyPair = generateKeyPairSync('ed25519');
  const publicKeyHex = Buffer.from(rawPublicKey(keyPair.publicKey)).toString('hex');
  const inventory = JSON.stringify([{
    authorityId: 'fixture-rockstaros',
    ownerUserId: 'alice',
    deviceRef: 'device-a',
    keyId: 'fixture-device-key',
    publicKeyHex,
    status: 'active',
  }]);
  const resolver = trustedA2ABrokerKeyResolver(inventory);
  assert.deepEqual(
    await resolver({
      authorityId: 'fixture-rockstaros',
      ownerUserId: 'alice',
      deviceRef: 'device-a',
      keyId: 'fixture-device-key',
    }),
    rawPublicKey(keyPair.publicKey),
  );
  assert.equal(await resolver({
    authorityId: 'fixture-rockstaros', ownerUserId: 'bob',
    deviceRef: 'device-a', keyId: 'fixture-device-key',
  }), null);
  assert.equal(parseTrustedA2ABrokerKeys(JSON.stringify([
    ...JSON.parse(inventory), ...JSON.parse(inventory),
  ])), null);
  assert.equal(parseTrustedA2ABrokerKeys(JSON.stringify([
    { ...JSON.parse(inventory)[0], status: 'revoked' },
  ])).size, 1);
  assert.equal(await trustedA2ABrokerKeyResolver(JSON.stringify([
    { ...JSON.parse(inventory)[0], status: 'revoked' },
  ]))({
    authorityId: 'fixture-rockstaros', ownerUserId: 'alice',
    deviceRef: 'device-a', keyId: 'fixture-device-key',
  }), null);
  assert.equal(parseTrustedA2ABrokerKeys('{malformed'), null);
});
