import assert from 'node:assert/strict';
import { createHash, createPrivateKey, sign, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  a2aWalletHandoffSigningBytes,
  createA2AWalletHandoffRequest,
  verifyA2AWalletHandoffRequest,
} from '../lib/a2a-wallet-handoff-auth.ts';

const now = 1_790_000_000_000;
const vector = JSON.parse(await readFile(fileURLToPath(new URL('../android/core/src/test/resources/a2a-wallet-handoff-request-v1.json', import.meta.url)), 'utf8'));
const identity = {
  authorityId: 'rock-authority',
  ownerUserId: 'owner-alice',
  deviceRef: 'device-pixel-10',
  delegationId: '123e4567-e89b-42d3-a456-426614174000',
  requestId: '123e4567-e89b-42d3-a456-426614174001',
  keyId: 'broker-key-1',
};
const keyPair = generateKeyPairSync('ed25519');
const publicDer = keyPair.publicKey.export({ type: 'spki', format: 'der' });
const publicKey = new Uint8Array(publicDer.subarray(-32));
const keyIdentity = {
  authorityId: identity.authorityId,
  ownerUserId: identity.ownerUserId,
  deviceRef: identity.deviceRef,
  keyId: identity.keyId,
};
const resolveTrustedKey = async (value) =>
  value.authorityId === keyIdentity.authorityId &&
  value.ownerUserId === keyIdentity.ownerUserId &&
  value.deviceRef === keyIdentity.deviceRef &&
  value.keyId === keyIdentity.keyId
    ? publicKey : null;

async function signedRequest(overrides = {}) {
  return createA2AWalletHandoffRequest(
    { ...identity, ...overrides },
    async (bytes) => new Uint8Array(sign(null, bytes, keyPair.privateKey)),
    now,
  );
}

void test('creates a domain-separated signed request for the exact owner/device/delegation', async () => {
  const request = await signedRequest();
  assert.equal(request.schema, 'rock-a2a-wallet-handoff-request/1');
  assert.equal(await verifyA2AWalletHandoffRequest(request, resolveTrustedKey, now), request);
  assert.equal(
    createHash('sha256').update(a2aWalletHandoffSigningBytes(request)).digest('hex').length,
    64,
  );
});

void test('verifies an Android-attestable P-256 Broker key for wallet handoff', async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  const ecIdentity = { ...identity, keyId: createHash('sha256').update(raw).digest('hex') };
  const request = await createA2AWalletHandoffRequest(ecIdentity, async (message) =>
    new Uint8Array(sign('sha256', message, { key: pair.privateKey, dsaEncoding: 'ieee-p1363' })), now);
  const resolver = async (value) => value.keyId === ecIdentity.keyId ? new Uint8Array(raw) : null;
  assert.equal(await verifyA2AWalletHandoffRequest(request, resolver, now), request);
  assert.equal(await verifyA2AWalletHandoffRequest(request, async () => new Uint8Array(32), now), null);
});

void test('shared Android Java vector matches the Cloud WebCrypto signed request', async () => {
  const seed = Buffer.from(vector.testPrivateKeySeedHex, 'hex');
  const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const privateKey = createPrivateKey({ key: Buffer.concat([prefix, seed]), format: 'der', type: 'pkcs8' });
  const expected = vector.request;
  const actual = await createA2AWalletHandoffRequest({
    authorityId: expected.authorityId, ownerUserId: expected.ownerUserId,
    deviceRef: expected.deviceRef, delegationId: expected.delegationId,
    requestId: expected.requestId, requestedAt: expected.requestedAt, keyId: expected.keyId,
  }, async (bytes) => new Uint8Array(sign(null, bytes, privateKey)), expected.requestedAt);
  assert.deepEqual(actual, expected);
  assert.equal(createHash('sha256').update(a2aWalletHandoffSigningBytes(actual)).digest('hex'), vector.signingBytesSha256);
  const fixturePublicKey = Buffer.from('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex');
  const fixtureResolver = async (value) =>
    value.authorityId === expected.authorityId && value.ownerUserId === expected.ownerUserId &&
    value.deviceRef === expected.deviceRef && value.keyId === expected.keyId
      ? fixturePublicKey : null;
  assert.equal(await verifyA2AWalletHandoffRequest(actual, fixtureResolver, expected.requestedAt), actual);
});

void test('rejects scope changes, unknown fields, untrusted or revoked keys, stale and future requests', async () => {
  const request = await signedRequest();
  assert.equal(await verifyA2AWalletHandoffRequest({ ...request, ownerUserId: 'owner-bob' }, resolveTrustedKey, now), null);
  assert.equal(await verifyA2AWalletHandoffRequest({ ...request, deviceRef: 'device-other' }, resolveTrustedKey, now), null);
  assert.equal(await verifyA2AWalletHandoffRequest({ ...request, extra: true }, resolveTrustedKey, now), null);
  assert.equal(await verifyA2AWalletHandoffRequest(request, async () => null, now), null);
  assert.equal(await verifyA2AWalletHandoffRequest(request, resolveTrustedKey, now + 5 * 60_000 + 1), null);
  const futureUnsigned = { ...request, requestedAt: now + 30_001, signature: '' };
  const future = {
    ...futureUnsigned,
    signature: sign(null, a2aWalletHandoffSigningBytes(futureUnsigned), keyPair.privateKey).toString('base64url'),
  };
  assert.equal(await verifyA2AWalletHandoffRequest(future, resolveTrustedKey, now), null);
});

void test('request construction refuses invalid identity, request id and signatures', async () => {
  await assert.rejects(() => signedRequest({ requestId: 'not-a-uuid' }), /invalid A2A/);
  await assert.rejects(() => createA2AWalletHandoffRequest(
    identity, async () => new Uint8Array(63), now,
  ), /64-byte Broker signature/);
  const request = await signedRequest();
  const corruptSignature = `${request.signature[0] === 'A' ? 'B' : 'A'}${request.signature.slice(1)}`;
  assert.equal(await verifyA2AWalletHandoffRequest({ ...request, signature: corruptSignature }, resolveTrustedKey, now), null);
});
