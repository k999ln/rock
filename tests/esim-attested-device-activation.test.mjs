import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
} from '../lib/android-key-attestation-client.ts';
import { activateAttestedEsimDevice } from '../lib/esim-attested-device-activation.ts';
import {
  ESIM_DEVICE_ENTITLEMENT_SCHEMA,
  esimDeviceEntitlementSigningBytes,
} from '../lib/esim-device-entitlement.ts';
import { esimDeviceEntitlementStore } from '../lib/esim-device-entitlement-store.ts';

const now = Date.now();
const ownerUserId = 'activation-test-owner';
const deviceRef = 'activation-test-device';
const profileDigest = 'a'.repeat(64);
const installReceiptSha256 = 'b'.repeat(64);
const starterPackManifestSha256 = 'c'.repeat(64);
const applicationPackage = 'dev.rock.automation';
const signingCertificateSha256 = 'f'.repeat(64);
const token = Buffer.alloc(32, 19).toString('base64url');
const verifierEndpoint = 'https://attestation.example/v1/android-key-attestation/verify';

const worker = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  script: 'export default {fetch(){return new Response("attested activation fixture")}}',
  compatibilityDate: '2026-08-18',
  d1Databases: ['DB'],
  host: '127.0.0.1',
  port: 0,
}));
const db = await worker.getD1Database('DB');
const store = esimDeviceEntitlementStore(db);

async function applyMigration(name) {
  const sql = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8');
  for (const statement of sql.split('--> statement-breakpoint').filter((part) => part.trim()))
    await db.prepare(statement).run();
}

for (const migration of [
  '0018_sky_commerce.sql',
  '0030_esim_provider_order_once.sql',
  '0034_esim_install_receipts.sql',
  '0035_esim_device_gateway_entitlements.sql',
  '0036_nostalgic_miek.sql',
  '0038_android_attested_gateway_keys.sql',
]) await applyMigration(migration);

async function seedChallenge() {
  const orderId = randomUUID();
  const challengeId = randomUUID();
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const challengeNonce = Buffer.from(nonceBytes).toString('base64url');
  const nonceSha256 = createHash('sha256').update(challengeNonce).digest('hex');
  const challenge = {
    id: challengeId,
    skyOrderId: orderId,
    ownerUserId,
    profileDigest,
    deviceRef,
    installReceiptSha256,
    starterPackId: 'lifeline',
    starterPackVersion: '1.0.0',
    starterPackManifestSha256,
    nonceSha256,
    createdAt: now,
    expiresAt: now + 60_000,
    consumedAt: null,
  };
  await db.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    orderId, ownerUserId, 'activation-test-seller', 'live', 'activation-test-esim', '1'.repeat(64),
    'eSIM activation test', 1500, 150, 0, 'jpy', 'activation-test-account', 1,
    'https://example.invalid/terms', 'fixture only', 'paid', null, now, now,
  ).run();
  await db.prepare(`INSERT INTO esim_provider_orders
    (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,provider_bundle_name,
     quote_digest,quote_total,quote_currency,state,provider_order_reference,profile_digest,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    orderId, 'esim-go-v3', ownerUserId, 'activation-test-esim', '1'.repeat(64), 'activation-test-bundle',
    '2'.repeat(64), '10.00', 'USD', 'profile_bound', `provider-${orderId}`, profileDigest, now, now,
  ).run();
  await db.prepare(`INSERT INTO esim_device_install_receipts
    (challenge_id,sky_order_id,owner_user_id,profile_digest,device_ref,issuer_id,key_id,
     receipt_sha256,evidence_source,observed_at,verified_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
    `install-${challengeId}`, orderId, ownerUserId, profileDigest, deviceRef,
    'activation-test-carrier', 'activation-test-install-key', installReceiptSha256,
    'carrier_privileged', now, now,
  ).run();
  await store.createChallenge(challenge);
  return { orderId, challenge, challengeNonce };
}

async function makeAttestationAndReceipt({ orderId, challenge, challengeNonce }) {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const rawPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const publicKeySha256 = createHash('sha256').update(rawPublicKey).digest('hex');
  const challengeBytes = Buffer.from(challengeNonce, 'base64url');
  const verifierResult = {
    schema: 'rock-android-key-attestation-result/1',
    challengeId: challenge.id,
    challengeSha256: createHash('sha256').update(challengeBytes).digest('hex'),
    publicKeyRawP256Base64Url: Buffer.from(rawPublicKey).toString('base64url'),
    publicKeySha256,
    securityLevel: 'TRUSTED_ENVIRONMENT',
    verifiedBootState: 'VERIFIED',
    deviceLocked: true,
    applicationPackage,
    minimumApplicationVersion: '42',
    signingCertificateSha256,
    verifiedAt: now,
    verifierCommit: ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
  };
  const receipt = {
    schema: ESIM_DEVICE_ENTITLEMENT_SCHEMA,
    signatureAlgorithm: 'ES256',
    authorityId: 'android-key-attestation-google',
    keyId: publicKeySha256,
    ownerUserId,
    orderId,
    profileDigest,
    challengeId: challenge.id,
    challengeNonceSha256: createHash('sha256').update(challengeNonce).digest('hex'),
    deviceRef,
    installReceiptSha256,
    starterPackId: 'lifeline',
    starterPackVersion: '1.0.0',
    starterPackManifestSha256,
    activationState: 'installed_enabled',
    observedAt: now,
    expiresAt: now + 30_000,
    signature: '',
  };
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, esimDeviceEntitlementSigningBytes(receipt),
  );
  receipt.signature = Buffer.from(signature).toString('base64url');
  return {
    receipt,
    fetcher: async (url, init) => {
      assert.equal(String(url), verifierEndpoint);
      assert.equal(init.headers.Authorization, `Bearer ${token}`);
      const body = JSON.parse(init.body);
      assert.equal(body.challengeId, challenge.id);
      assert.equal(body.challenge, challengeNonce);
      return new Response(JSON.stringify(verifierResult), {
        headers: { 'content-type': 'application/json' },
      });
    },
    publicKeySha256,
  };
}

void test('runs verified attestation through signed receipt validation and atomic D1 enrollment', async () => {
  const { orderId, challenge, challengeNonce } = await seedChallenge();
  const { receipt, fetcher, publicKeySha256 } = await makeAttestationAndReceipt({
    orderId, challenge, challengeNonce,
  });
  assert.equal(await activateAttestedEsimDevice({
    verifier: { endpoint: verifierEndpoint, token, fetcher },
    certificateChainDerBase64Url: ['AQ', 'Ag'],
    receiptValue: receipt,
    challenge,
    challengeNonce,
    ownerUserId,
    orderId,
    profileDigest,
    deviceRef,
    installReceiptSha256,
    starterPackId: 'lifeline',
    starterPackVersion: '1.0.0',
    starterPackManifestSha256,
    store,
    now: () => now,
  }), 'activated');
  assert.equal((await store.attestedGatewayKey({
    authorityId: 'android-key-attestation-google', ownerUserId, deviceRef, keyId: publicKeySha256,
  })).publicKeySha256, publicKeySha256);
  const saved = await store.entitlementByOrder(ownerUserId, orderId);
  assert.equal(saved.keyId, publicKeySha256);
  assert.equal(saved.signatureAlgorithm, 'ES256');
  assert.equal((await store.challenge(ownerUserId, orderId, challenge.id)).consumedAt, now);
});

void test('does not persist a verifier key when the device receipt is signed by another key', async () => {
  const { orderId, challenge, challengeNonce } = await seedChallenge();
  const { receipt, fetcher, publicKeySha256 } = await makeAttestationAndReceipt({
    orderId, challenge, challengeNonce,
  });
  const otherPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  receipt.signature = Buffer.from(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, otherPair.privateKey, esimDeviceEntitlementSigningBytes(receipt),
  )).toString('base64url');
  await assert.rejects(activateAttestedEsimDevice({
    verifier: { endpoint: verifierEndpoint, token, fetcher },
    certificateChainDerBase64Url: ['AQ', 'Ag'],
    receiptValue: receipt,
    challenge,
    challengeNonce,
    ownerUserId,
    orderId,
    profileDigest,
    deviceRef,
    installReceiptSha256,
    starterPackId: 'lifeline',
    starterPackVersion: '1.0.0',
    starterPackManifestSha256,
    store,
    now: () => now,
  }), /DEVICE_ENTITLEMENT_RECEIPT_INVALID/);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM esim_device_gateway_keys WHERE key_id = ?')
    .bind(publicKeySha256).first()).count, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM esim_device_entitlements WHERE sky_order_id = ?')
    .bind(orderId).first()).count, 0);
  assert.equal((await store.challenge(ownerUserId, orderId, challenge.id)).consumedAt, null);
});

test.after(async () => worker.dispose());
