import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  ANDROID_KEY_ATTESTATION_AUTHORITY,
  ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
  verifyAndroidKeyAttestation,
} from '../lib/android-key-attestation-client.ts';

const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = pair.publicKey.export({ format: 'jwk' });
const rawKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
const keyHash = createHash('sha256').update(rawKey).digest('hex');
const challengeBytes = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const challengeNonce = challengeBytes.toString('base64url');
const challengeId = '12345678-1234-1234-1234-123456789abc';
const token = Buffer.alloc(32, 9).toString('base64url');
const config = { endpoint: 'https://attestation.example/v1/android-key-attestation/verify', token };
const request = {
  challengeId, challengeNonce, packageName: 'dev.rock.automation',
  certificateChainDerBase64Url: ['AQ', 'Ag'],
};

function result(overrides = {}) {
  return {
    schema: 'rock-android-key-attestation-result/1',
    challengeId,
    challengeSha256: createHash('sha256').update(challengeBytes).digest('hex'),
    publicKeyRawP256Base64Url: rawKey.toString('base64url'),
    publicKeySha256: keyHash,
    securityLevel: 'TRUSTED_ENVIRONMENT',
    verifiedBootState: 'VERIFIED',
    deviceLocked: true,
    applicationPackage: request.packageName,
    minimumApplicationVersion: '1',
    signingCertificateSha256: 'a'.repeat(64),
    verifiedAt: Date.now(),
    verifierCommit: ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
    ...overrides,
  };
}

function mockFetch(value, status = 200, onRequest = () => {}) {
  return async (url, init) => {
    onRequest(url, init);
    return new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

void test('forwards only the pinned challenge and bounded chain to the authenticated verifier', async () => {
  let observed;
  const verified = await verifyAndroidKeyAttestation(config, request, mockFetch(result(), 200, (url, init) => {
    observed = { url: String(url), init };
  }));
  assert.equal(observed.url, config.endpoint);
  assert.equal(observed.init.method, 'POST');
  assert.equal(observed.init.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(observed.init.body), {
    schema: 'rock-android-key-attestation-request/1',
    challengeId,
    challenge: challengeNonce,
    packageName: request.packageName,
    certificateChainDerBase64Url: request.certificateChainDerBase64Url,
  });
  assert.equal(verified.authorityId, ANDROID_KEY_ATTESTATION_AUTHORITY);
  assert.equal(verified.keyId, keyHash);
  assert.equal(verified.publicKeySha256, keyHash);
  assert.equal(verified.publicKeyHex, rawKey.toString('hex'));
  assert.equal(verified.securityLevel, 'TRUSTED_ENVIRONMENT');
});

void test('rejects mismatched challenge, result digest, package, or verifier revision', async () => {
  for (const altered of [
    { challengeId: '87654321-4321-4321-4321-cba987654321' },
    { challengeSha256: 'b'.repeat(64) },
    { applicationPackage: 'dev.attacker.app' },
    { publicKeySha256: 'c'.repeat(64) },
    { verifierCommit: '0'.repeat(40) },
    { verifiedBootState: 'SELF_SIGNED' },
    { deviceLocked: false },
  ]) {
    await assert.rejects(
      verifyAndroidKeyAttestation(config, request, mockFetch(result(altered))),
      /ATTESTATION_RESULT_INVALID/,
    );
  }
});

void test('does not call an unencrypted or unpinned verifier', async () => {
  let called = false;
  const never = async () => { called = true; return new Response('{}'); };
  await assert.rejects(verifyAndroidKeyAttestation({ ...config, endpoint: 'http://attestation.example' }, request, never),
    /ATTESTATION_VERIFIER_NOT_CONFIGURED/);
  await assert.rejects(verifyAndroidKeyAttestation({ ...config, expectedCommit: 'f'.repeat(40) }, request, never),
    /ATTESTATION_VERIFIER_NOT_CONFIGURED/);
  await assert.rejects(verifyAndroidKeyAttestation(config, { ...request, challengeNonce: 'x'.repeat(43) }, never),
    /ATTESTATION_REQUEST_INVALID/);
  assert.equal(called, false);
});

void test('maps invalid attestation to rejection and verifier failures to unavailable', async () => {
  await assert.rejects(verifyAndroidKeyAttestation(config, request,
    mockFetch({ error: 'attestation_rejected' }, 422)), /ATTESTATION_REJECTED/);
  await assert.rejects(verifyAndroidKeyAttestation(config, request,
    mockFetch({ error: 'unavailable' }, 503)), /ATTESTATION_VERIFIER_UNAVAILABLE/);
  let redirectMode;
  await assert.rejects(verifyAndroidKeyAttestation(config, request, async (_url, init) => {
    redirectMode = init.redirect;
    return new Response(null, { status: 302, headers: { location: 'https://other.example/collect' } });
  }), /ATTESTATION_VERIFIER_PROTOCOL_ERROR/);
  assert.equal(redirectMode, 'manual');
});
