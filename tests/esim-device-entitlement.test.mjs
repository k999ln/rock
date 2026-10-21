import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ESIM_DEVICE_ENTITLEMENT_SCHEMA,
  esimDeviceEntitlementSigningBytes,
  hasTrustedEsimDeviceGatewayKey,
  parseTrustedEsimDeviceGatewayKeys,
  trustedEsimDeviceGatewayKeyResolver,
  trustedEsimDeviceGatewayKeyFingerprint,
  verifyEsimDeviceEntitlementReceipt,
} from '../lib/esim-device-entitlement.ts';

const keys = generateKeyPairSync('ed25519');
const publicKey = new Uint8Array(keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
const p256Keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const p256Jwk = p256Keys.publicKey.export({ format: 'jwk' });
const p256PublicKey = Buffer.concat([
  Buffer.from([4]), Buffer.from(p256Jwk.x, 'base64url'), Buffer.from(p256Jwk.y, 'base64url'),
]);
const now = 1_800_000_000_000;
const context = {
  ownerUserId: 'owner-1', orderId: 'order-1', profileDigest: 'a'.repeat(64),
  challengeId: 'challenge-1', challengeNonce: 'n'.repeat(43), deviceRef: 'pixel-10-device',
  installReceiptSha256: 'b'.repeat(64), starterPackId: 'lifeline', starterPackVersion: '1.0.0',
  starterPackManifestSha256: 'c'.repeat(64),
};
const configuration = JSON.stringify([{
  authorityId: 'oem-fixture', ownerUserId: context.ownerUserId,
  deviceRef: context.deviceRef, keyId: 'key-1', algorithm: 'Ed25519',
  publicKeyHex: Buffer.from(publicKey).toString('hex'), status: 'active',
}]);

function signedReceipt(overrides = {}) {
  const receipt = {
    schema: ESIM_DEVICE_ENTITLEMENT_SCHEMA,
    signatureAlgorithm: 'Ed25519',
    authorityId: 'oem-fixture', keyId: 'key-1',
    ownerUserId: context.ownerUserId, orderId: context.orderId,
    profileDigest: context.profileDigest, challengeId: context.challengeId,
    challengeNonceSha256: createHash('sha256').update(context.challengeNonce).digest('hex'),
    deviceRef: context.deviceRef, installReceiptSha256: context.installReceiptSha256,
    starterPackId: context.starterPackId, starterPackVersion: context.starterPackVersion,
    starterPackManifestSha256: context.starterPackManifestSha256,
    activationState: 'installed_enabled', observedAt: now, expiresAt: now + 60_000,
    signature: '', ...overrides,
  };
  receipt.signature = sign(null, esimDeviceEntitlementSigningBytes(receipt), keys.privateKey).toString('base64url');
  return receipt;
}

void test('accepts an exact one-time device entitlement receipt signed by its provisioned owner/device key', async () => {
  const receipt = signedReceipt();
  assert.deepEqual(await verifyEsimDeviceEntitlementReceipt(
    receipt, context, trustedEsimDeviceGatewayKeyResolver(configuration), now,
  ), receipt);
});

void test('accepts Android-compatible hardware-key ES256 P-256 receipts', async () => {
  const receipt = signedReceipt({ signatureAlgorithm: 'ES256', keyId: 'p256-key-1' });
  receipt.signature = sign('sha256', esimDeviceEntitlementSigningBytes(receipt), {
    key: p256Keys.privateKey, dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  const p256Trust = JSON.stringify([{
    authorityId: 'oem-fixture', ownerUserId: context.ownerUserId,
    deviceRef: context.deviceRef, keyId: 'p256-key-1', algorithm: 'ES256',
    publicKeyHex: p256PublicKey.toString('hex'), status: 'active',
  }]);
  assert.deepEqual(await verifyEsimDeviceEntitlementReceipt(
    receipt, context, trustedEsimDeviceGatewayKeyResolver(p256Trust), now,
  ), receipt);
});

void test('TypeScript signer matches the shared Android Java canonical P-256 vector', () => {
  const vector = JSON.parse(readFileSync(new URL(
    '../android/core/src/test/resources/esim-device-entitlement-p256-vector.json', import.meta.url,
  ), 'utf8'));
  const receipt = JSON.parse(vector.expectedCanonicalPayload);
  const expected = Buffer.concat([
    Buffer.from('rock-esim-device-entitlement-signature/1\0', 'utf8'),
    Buffer.from(vector.expectedCanonicalPayload, 'utf8'),
  ]);
  assert.deepEqual(Buffer.from(esimDeviceEntitlementSigningBytes(receipt)), expected);
});

void test('rejects a receipt transplanted across owner, order, profile, challenge, device, install proof or starter pack', async () => {
  const receipt = signedReceipt();
  for (const [field, value] of [
    ['ownerUserId', 'owner-2'], ['orderId', 'order-2'], ['profileDigest', 'd'.repeat(64)],
    ['challengeId', 'challenge-2'], ['deviceRef', 'other-device'],
    ['installReceiptSha256', 'e'.repeat(64)], ['starterPackId', 'developer'],
    ['starterPackVersion', '1.0.1'], ['starterPackManifestSha256', 'f'.repeat(64)],
    ['challengeNonce', 'm'.repeat(43)],
  ]) {
    const changedContext = { ...context, [field]: value };
    assert.equal(await verifyEsimDeviceEntitlementReceipt(
      receipt, changedContext, trustedEsimDeviceGatewayKeyResolver(configuration), now,
    ), null, field);
  }
});

void test('rejects unknown or altered receipt fields, wrong keys, expired and overlong receipts', async () => {
  const receipt = signedReceipt();
  assert.equal(await verifyEsimDeviceEntitlementReceipt(
    { ...receipt, debug: true }, context, trustedEsimDeviceGatewayKeyResolver(configuration), now,
  ), null);
  assert.equal(await verifyEsimDeviceEntitlementReceipt(
    { ...receipt, starterPackManifestSha256: 'd'.repeat(64) },
    context, trustedEsimDeviceGatewayKeyResolver(configuration), now,
  ), null);
  assert.equal(await verifyEsimDeviceEntitlementReceipt(
    receipt, context, async () => null, now,
  ), null);
  assert.equal(await verifyEsimDeviceEntitlementReceipt(
    signedReceipt({ expiresAt: now - 1 }), context, trustedEsimDeviceGatewayKeyResolver(configuration), now,
  ), null);
  assert.equal(await verifyEsimDeviceEntitlementReceipt(
    signedReceipt({ expiresAt: now + 10 * 60_000 }), context,
    trustedEsimDeviceGatewayKeyResolver(configuration), now,
  ), null);
});

void test('trust configuration is exact, unique, owner/device-bound and revocable', () => {
  assert.equal(parseTrustedEsimDeviceGatewayKeys(configuration).size, 1);
  assert.equal(hasTrustedEsimDeviceGatewayKey(configuration, context.ownerUserId, context.deviceRef), true);
  assert.equal(hasTrustedEsimDeviceGatewayKey(configuration, 'another-owner', context.deviceRef), false);
  const revoked = JSON.stringify([{
    authorityId: 'oem-fixture', ownerUserId: context.ownerUserId,
    deviceRef: context.deviceRef, keyId: 'key-1', algorithm: 'Ed25519',
    publicKeyHex: Buffer.from(publicKey).toString('hex'), status: 'revoked',
  }]);
  assert.equal(hasTrustedEsimDeviceGatewayKey(revoked, context.ownerUserId, context.deviceRef), false);
  assert.equal(parseTrustedEsimDeviceGatewayKeys(`${configuration.slice(0, -1)},${configuration.slice(1, -1)}]`), null);
  assert.equal(parseTrustedEsimDeviceGatewayKeys(JSON.stringify([{ ...JSON.parse(configuration)[0], unsafe: true }])), null);
});

void test('trusted key fingerprint changes when key material rotates under the same key identity', async () => {
  const identity = {
    authorityId: 'oem-fixture', ownerUserId: context.ownerUserId,
    deviceRef: context.deviceRef, keyId: 'key-1',
  };
  const original = await trustedEsimDeviceGatewayKeyFingerprint(configuration, identity);
  const otherKeys = generateKeyPairSync('ed25519');
  const rotated = JSON.stringify([{
    ...JSON.parse(configuration)[0],
    publicKeyHex: otherKeys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'),
  }]);
  const replacement = await trustedEsimDeviceGatewayKeyFingerprint(rotated, identity);
  assert.equal(original.algorithm, 'Ed25519');
  assert.notEqual(original.publicKeySha256, replacement.publicKeySha256);
  assert.equal(await trustedEsimDeviceGatewayKeyFingerprint(JSON.stringify([{
    ...JSON.parse(configuration)[0], status: 'revoked',
  }]), identity), null);
});
