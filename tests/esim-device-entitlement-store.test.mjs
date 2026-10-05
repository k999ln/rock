import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { esimDeviceEntitlementStore } from '../lib/esim-device-entitlement-store.ts';

const now = Date.now();
const ownerUserId = 'store-test-owner';
const deviceRef = 'store-test-device';
const profileDigest = 'a'.repeat(64);
const installReceiptSha256 = 'b'.repeat(64);
const starterPackManifestSha256 = 'c'.repeat(64);
const nonceSha256 = 'd'.repeat(64);
const receiptSha256 = 'e'.repeat(64);
const applicationPackage = 'dev.rock.automation';
const signingCertificateSha256 = 'f'.repeat(64);

const worker = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  script: 'export default {fetch(){return new Response("eSIM entitlement D1 fixture")}}',
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

async function seedEligibleOrder({ refundedMinor = 0, challengeId = randomUUID(), expiresAt = now + 60_000 } = {}) {
  const orderId = randomUUID();
  await db.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    orderId, ownerUserId, 'store-test-seller', 'live', 'store-test-esim', '1'.repeat(64),
    'eSIM test order', 1500, 150, refundedMinor, 'jpy', 'store-test-account', 1,
    'https://example.invalid/terms', 'fixture only', 'paid', null, now, now,
  ).run();
  await db.prepare(`INSERT INTO esim_provider_orders
    (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,provider_bundle_name,
     quote_digest,quote_total,quote_currency,state,provider_order_reference,profile_digest,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    orderId, 'esim-go-v3', ownerUserId, 'store-test-esim', '1'.repeat(64), 'store-test-bundle',
    '2'.repeat(64), '10.00', 'USD', 'profile_bound', `provider-${orderId}`, profileDigest, now, now,
  ).run();
  await db.prepare(`INSERT INTO esim_device_install_receipts
    (challenge_id,sky_order_id,owner_user_id,profile_digest,device_ref,issuer_id,key_id,
     receipt_sha256,evidence_source,observed_at,verified_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
    `install-${challengeId}`, orderId, ownerUserId, profileDigest, deviceRef,
    'store-test-carrier', 'store-test-install-key', installReceiptSha256,
    'carrier_privileged', now, now,
  ).run();
  await db.prepare(`INSERT INTO esim_device_gateway_challenges
    (id,sky_order_id,owner_user_id,profile_digest,device_ref,install_receipt_sha256,
     starter_pack_id,starter_pack_version,starter_pack_manifest_sha256,nonce_sha256,
     created_at,expires_at,consumed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).bind(
    challengeId, orderId, ownerUserId, profileDigest, deviceRef, installReceiptSha256,
    'lifeline', '1.0.0', starterPackManifestSha256, nonceSha256,
    Math.min(now, expiresAt - 1), expiresAt,
  ).run();
  return { orderId, challengeId };
}

function attestedRecord({ orderId, challengeId }) {
  const keyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = keyPair.publicKey.export({ format: 'jwk' });
  const rawPublicKey = Buffer.concat([
    Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url'),
  ]);
  const keyId = createHash('sha256').update(rawPublicKey).digest('hex');
  return {
    keyId,
    entitlement: {
      challengeId,
      skyOrderId: orderId,
      ownerUserId,
      profileDigest,
      deviceRef,
      installReceiptSha256,
      authorityId: 'android-key-attestation-google',
      keyId,
      signatureAlgorithm: 'ES256',
      devicePublicKeySha256: keyId,
      starterPackId: 'lifeline',
      starterPackVersion: '1.0.0',
      starterPackManifestSha256,
      receiptSha256,
      observedAt: now,
      activatedAt: now,
      nonceSha256,
    },
    key: {
      authorityId: 'android-key-attestation-google',
      ownerUserId,
      deviceRef,
      keyId,
      algorithm: 'ES256',
      publicKeyHex: rawPublicKey.toString('hex'),
      publicKeySha256: keyId,
      applicationPackage,
      minimumApplicationVersion: '12',
      signingCertificateSha256,
      securityLevel: 'TRUSTED_ENVIRONMENT',
      verifiedBootState: 'VERIFIED',
      attestedAt: now,
    },
  };
}

void test('persists attested gateway key and paid-order entitlement atomically, binds the key fingerprint and consumes its challenge', async () => {
  const ids = await seedEligibleOrder();
  const { entitlement, key, keyId: attestedKeyId } = attestedRecord(ids);

  assert.equal(await store.saveEntitlement(entitlement, now, key), 'activated');
  assert.deepEqual(await store.attestedGatewayKey({
    authorityId: key.authorityId, ownerUserId, deviceRef, keyId: attestedKeyId,
  }), {
    algorithm: 'ES256', publicKey: new Uint8Array(Buffer.from(key.publicKeyHex, 'hex')),
    publicKeySha256: attestedKeyId,
  });
  assert.equal((await store.entitlementByOrder(ownerUserId, ids.orderId)).keyId, attestedKeyId);
  assert.equal((await db.prepare('SELECT consumed_at AS consumedAt FROM esim_device_gateway_challenges WHERE id = ?')
    .bind(ids.challengeId).first()).consumedAt, now);
  assert.equal(await store.saveEntitlement(entitlement, now, key), 'already_active');
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM esim_device_gateway_keys WHERE key_id = ?')
    .bind(attestedKeyId).first()).count, 1);
});

void test('concurrent identical entitlement submissions have one creator and one idempotent replay', async () => {
  const ids = await seedEligibleOrder();
  const { entitlement, key } = attestedRecord(ids);

  assert.deepEqual(
    (await Promise.all([
      store.saveEntitlement(entitlement, now, key),
      store.saveEntitlement(entitlement, now, key),
    ])).sort(),
    ['activated', 'already_active'],
  );
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM esim_device_gateway_keys WHERE key_id = ?')
    .bind(key.keyId).first()).count, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM esim_device_entitlements WHERE sky_order_id = ?')
    .bind(ids.orderId).first()).count, 1);
});

void test('refunded order or expired challenge inserts neither the attested key nor entitlement', async (t) => {
  await t.test('refunded order', async () => {
    const ids = await seedEligibleOrder({ refundedMinor: 1 });
    const { entitlement, key, keyId: attestedKeyId } = attestedRecord(ids);
    assert.equal(await store.saveEntitlement(entitlement, now, key), 'challenge_unavailable');
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM esim_device_gateway_keys WHERE key_id = ?')
      .bind(attestedKeyId).first()).count, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM esim_device_entitlements WHERE sky_order_id = ?')
      .bind(ids.orderId).first()).count, 0);
    assert.equal((await db.prepare('SELECT consumed_at AS consumedAt FROM esim_device_gateway_challenges WHERE id = ?')
      .bind(ids.challengeId).first()).consumedAt, null);
  });
  await t.test('expired challenge', async () => {
    const ids = await seedEligibleOrder({ expiresAt: now - 1 });
    const { entitlement, key, keyId: attestedKeyId } = attestedRecord(ids);
    assert.equal(await store.saveEntitlement(entitlement, now, key), 'challenge_unavailable');
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM esim_device_gateway_keys WHERE key_id = ?')
      .bind(attestedKeyId).first()).count, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM esim_device_entitlements WHERE sky_order_id = ?')
      .bind(ids.orderId).first()).count, 0);
  });
});

test.after(async () => worker.dispose());
