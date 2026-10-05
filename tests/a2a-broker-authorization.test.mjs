import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

void test('accepts the shared Java-native signed Broker proof with the exact quote-bound terms', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../android/core/src/test/resources/a2a-broker-authorization-v2.json', import.meta.url), 'utf8'));
  const publicKey = Buffer.from('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex');
  assert.equal(await verifyA2ABrokerAuthorization(
    fixture.proof, fixture.intent, async () => Uint8Array.from(publicKey), fixture.proof.issuedAt,
  ), true);
  assert.equal(createHash('sha256').update(a2aBrokerAuthorizationSigningBytes(fixture.proof)).digest('hex'),
    '4367aaa4121c8cbbdfad6bce5e425fccd792f748f56d2cc808e18cad376ddb0b');
  assert.equal(await verifyA2ABrokerAuthorization(
    fixture.proof, { ...fixture.intent, priceQuoteDigest: 'd'.repeat(64) },
    async () => Uint8Array.from(publicKey), fixture.proof.issuedAt,
  ), false);
});

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
    continueWhileDeviceOffline: true,
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
    continueWhileDeviceOffline: approvalIntent.continueWhileDeviceOffline,
    deadlineAt: approvalIntent.deadlineAt,
    authorizationSha256: digests.authorizationSha256,
    issuedAt: now,
    expiresAt: now + 5 * 60_000,
    keyId: 'fixture-device-key',
    signature: '',
  };
  proof.signature = privateKey.asymmetricKeyType === 'ec'
    ? sign('sha256', a2aBrokerAuthorizationSigningBytes(proof), {
        key: privateKey, dsaEncoding: 'ieee-p1363',
      }).toString('base64url')
    : sign(null, a2aBrokerAuthorizationSigningBytes(proof), privateKey).toString('base64url');
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
  assert.equal(proof.authorizationSha256, 'f129e9e5d58f2bcd2ef78ba49a84de6625165670e88c4e1d3e57af424312a57c');
  assert.equal(
    createHash('sha256').update(a2aBrokerAuthorizationSigningBytes(proof)).digest('hex'),
    '6f9b4c2aac8ffdfba80ed7c5f05ded620134892f65bdd9e1bab08ff7fe17160e',
  );
  assert.equal(await verifyA2ABrokerAuthorization(proof, approvalIntent, async () => null, now), false);
  assert.equal(await verifyA2ABrokerAuthorization(proof, approvalIntent, resolveTrustedKey, now + 6 * 60_000), false);

  const changedBudget = { ...approvalIntent, budgetLimitMinor: 501 };
  assert.equal(await verifyA2ABrokerAuthorization(proof, changedBudget, resolveTrustedKey, now), false);
  const changedParentBudget = { ...approvalIntent, parentBudgetLimitMinor: 901 };
  assert.equal(await verifyA2ABrokerAuthorization(proof, changedParentBudget, resolveTrustedKey, now), false);
  const disabledOfflineContinuation = { ...approvalIntent, continueWhileDeviceOffline: false };
  assert.equal(await verifyA2ABrokerAuthorization(proof, disabledOfflineContinuation, resolveTrustedKey, now), false);
  const changedOwner = { ...approvalIntent, ownerUserId: 'owner-bob' };
  assert.equal(await verifyA2ABrokerAuthorization(proof, changedOwner, resolveTrustedKey, now), false);
  const extended = { ...proof, budgetLimitMinor: 50_000 };
  assert.equal(await verifyA2ABrokerAuthorization(extended, approvalIntent, resolveTrustedKey, now), false);
  const extraField = { ...proof, approved: true };
  assert.equal(await verifyA2ABrokerAuthorization(extraField, approvalIntent, resolveTrustedKey, now), false);
});

void test('hardware-attestable P-256 Broker signatures verify alongside legacy Ed25519 keys', async () => {
  const now = 1_000_000;
  const approvalIntent = intent(now);
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const publicBytes = Buffer.concat([
    Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url'),
  ]);
  const proof = await signedProof(approvalIntent, pair.privateKey, now);
  assert.equal(Buffer.from(proof.signature, 'base64url').length, 64);
  assert.equal(await verifyA2ABrokerAuthorization(
    proof, approvalIntent, async () => new Uint8Array(publicBytes), now,
  ), true);
  assert.equal(await verifyA2ABrokerAuthorization(
    proof, approvalIntent, async () => new Uint8Array(32), now,
  ), false);
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

  const ecPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ecJwk = ecPair.publicKey.export({ format: 'jwk' });
  const ecRaw = Buffer.concat([Buffer.from([4]), Buffer.from(ecJwk.x, 'base64url'), Buffer.from(ecJwk.y, 'base64url')]);
  const ecInventory = JSON.stringify([{
    authorityId: 'fixture-rockstaros', ownerUserId: 'alice', deviceRef: 'pixel-10',
    keyId: createHash('sha256').update(ecRaw).digest('hex'), publicKeyHex: ecRaw.toString('hex'), status: 'active',
  }]);
  const ecResolver = trustedA2ABrokerKeyResolver(ecInventory);
  assert.deepEqual(await ecResolver({
    authorityId: 'fixture-rockstaros', ownerUserId: 'alice', deviceRef: 'pixel-10',
    keyId: createHash('sha256').update(ecRaw).digest('hex'),
  }), new Uint8Array(ecRaw));
});
