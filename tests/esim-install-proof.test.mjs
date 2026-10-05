import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  ESIM_INSTALL_RECEIPT_SCHEMA,
  esimInstallReceiptSigningBytes,
  parseTrustedEsimInstallIssuerKeys,
  trustedEsimInstallIssuerKeyResolver,
  verifyEsimInstallReceipt,
} from '../lib/esim-install-proof.ts';

const now = 1_800_000_000_000;
const nonce = 'one-time-test-challenge-value-0123456789abcdef';
const nonceHash = createHash('sha256').update(nonce).digest('hex');
const keyPair = generateKeyPairSync('ed25519');
const publicKey = new Uint8Array(keyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
const publicKeyHex = Buffer.from(publicKey).toString('hex');
const context = {
  ownerUserId: 'owner-fixture',
  orderId: '11111111-1111-4111-8111-111111111111',
  profileDigest: 'a'.repeat(64),
  challengeId: 'challenge-fixture-1',
  challengeNonce: nonce,
  deviceRef: 'device-fixture-1',
};
const baseReceipt = {
  schema: ESIM_INSTALL_RECEIPT_SCHEMA,
  issuerId: 'fixture-carrier',
  keyId: 'receipt-key-1',
  ownerUserId: context.ownerUserId,
  orderId: context.orderId,
  profileDigest: context.profileDigest,
  challengeId: context.challengeId,
  challengeNonceSha256: nonceHash,
  deviceRef: context.deviceRef,
  installState: 'installed_enabled',
  evidenceSource: 'carrier_privileged',
  observedAt: now - 1000,
  expiresAt: now + 60_000,
};

function signedReceipt(changes = {}) {
  const receipt = { ...baseReceipt, ...changes, signature: '' };
  receipt.signature = sign(null, esimInstallReceiptSigningBytes(receipt), keyPair.privateKey).toString('base64url');
  return receipt;
}

const resolve = async ({ issuerId, keyId }) =>
  issuerId === 'fixture-carrier' && keyId === 'receipt-key-1' ? publicKey : null;

void test('accepts a current issuer-signed installed profile bound to exact owner, order, device and challenge', async () => {
  const receipt = signedReceipt();
  assert.deepEqual(await verifyEsimInstallReceipt(receipt, context, resolve, now), receipt);
});

void test('rejects identity mismatch, replay, stale or future receipts and invalid installation states', async () => {
  const valid = signedReceipt();
  for (const changedContext of [
    { ...context, ownerUserId: 'other-owner' },
    { ...context, orderId: '22222222-2222-4222-8222-222222222222' },
    { ...context, profileDigest: 'b'.repeat(64) },
    { ...context, challengeId: 'other-challenge' },
    { ...context, challengeNonce: 'replayed-challenge' },
    { ...context, deviceRef: 'other-device' },
  ]) assert.equal(await verifyEsimInstallReceipt(valid, changedContext, resolve, now), null);

  assert.equal(await verifyEsimInstallReceipt(signedReceipt({ expiresAt: now }), context, resolve, now), null);
  assert.equal(await verifyEsimInstallReceipt(signedReceipt({ observedAt: now + 31_000 }), context, resolve, now), null);
  assert.equal(await verifyEsimInstallReceipt(signedReceipt({ expiresAt: now + 6 * 60_000 }), context, resolve, now), null);
  assert.equal(await verifyEsimInstallReceipt(signedReceipt({ installState: 'downloaded' }), context, resolve, now), null);
  assert.equal(await verifyEsimInstallReceipt(signedReceipt({ evidenceSource: 'user_confirmed' }), context, resolve, now), null);
});

void test('rejects altered signatures, unknown fields and untrusted issuers', async () => {
  const receipt = signedReceipt();
  assert.equal(await verifyEsimInstallReceipt({ ...receipt, deviceRef: 'device-fixture-2' }, context, resolve, now), null);
  assert.equal(await verifyEsimInstallReceipt({ ...receipt, extra: true }, context, resolve, now), null);
  assert.equal(await verifyEsimInstallReceipt(receipt, context, async () => null, now), null);
  assert.equal(await verifyEsimInstallReceipt(receipt, context, async () => new Uint8Array(31), now), null);
  assert.equal(await verifyEsimInstallReceipt({ ...receipt, signature: 'not-a-signature' }, context, resolve, now), null);
});

void test('issuer trust configuration rejects duplicate, malformed and revoked keys', async () => {
  const inventory = JSON.stringify([{ issuerId: 'fixture-carrier', keyId: 'receipt-key-1', publicKeyHex, status: 'active' }]);
  const parsed = parseTrustedEsimInstallIssuerKeys(inventory);
  assert.ok(parsed);
  assert.equal((await trustedEsimInstallIssuerKeyResolver(inventory)({ issuerId: 'fixture-carrier', keyId: 'receipt-key-1' }))?.length, 32);
  assert.equal(await trustedEsimInstallIssuerKeyResolver(JSON.stringify([
    { issuerId: 'fixture-carrier', keyId: 'receipt-key-1', publicKeyHex, status: 'revoked' },
  ]))({ issuerId: 'fixture-carrier', keyId: 'receipt-key-1' }), null);
  assert.equal(parseTrustedEsimInstallIssuerKeys(JSON.stringify([
    { issuerId: 'fixture-carrier', keyId: 'receipt-key-1', publicKeyHex, status: 'active' },
    { issuerId: 'fixture-carrier', keyId: 'receipt-key-1', publicKeyHex, status: 'active' },
  ])), null);
  assert.equal(parseTrustedEsimInstallIssuerKeys('[{"issuerId":"fixture-carrier","keyId":"receipt-key-1","publicKeyHex":"bad","status":"active"}]'), null);
});
