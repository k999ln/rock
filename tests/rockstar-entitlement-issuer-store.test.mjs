import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync } from 'node:crypto';
import { issueRockstarEntitlementDeliveryOnce, acknowledgeRockstarEntitlementDelivery,
  deliverRockstarEntitlementOnce, RockstarEntitlementIssuerStoreError } from '../lib/rockstar-entitlement-issuer-store.ts';

const issuerId = 'seller-channel';
const issuerKeyId = 'seller-key-v1';
const purchaseReferenceSha256 = 'a'.repeat(64);
const idempotencyKey = 'order-line-claim-delivery-0001';
const encryptionKeyHex = 'b'.repeat(64);
const keyring = { currentKeyId: 'seller-code-key-v1', keys: { 'seller-code-key-v1': encryptionKeyHex } };
const claimExpiresAt = Date.now() + 60_000;
const pair = generateKeyPairSync('ed25519');
const privateKey = await crypto.subtle.importKey('pkcs8', pair.privateKey.export({ format: 'der', type: 'pkcs8' }),
  { name: 'Ed25519' }, false, ['sign']);

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return { bind(...values) {
        return {
          async first() { return sqlite.prepare(sql).get(...values) ?? null; },
          async run() {
            const result = sqlite.prepare(sql).run(...values);
            return { meta: { changes: Number(result.changes) } };
          },
        };
      } };
    },
  };
  return { db, sqlite };
}

function claimInput(overrides = {}) {
  return {
    issuerId, issuerKeyId, offerId: 'physical-sim-lifeline-v1', purchaseReferenceSha256,
    formFactor: 'physical_sim', scopes: ['agents', 'sky', 'rockstaros_access', 'zema'],
    expiresAt: claimExpiresAt, ...overrides,
  };
}

void test('seller order retries recover the same signed claim and encrypted code without plaintext D1 storage', async (t) => {
  const f = fixture(t);
  const first = await issueRockstarEntitlementDeliveryOnce(f.db, claimInput(), privateKey, keyring, idempotencyKey);
  const replay = await issueRockstarEntitlementDeliveryOnce(f.db, claimInput({ scopes: ['zema', 'rockstaros_access', 'sky', 'agents'] }),
    privateKey, keyring, idempotencyKey);
  assert.equal(first.state, 'prepared');
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.packageValue, first.packageValue);
  const row = f.sqlite.prepare('SELECT * FROM rockstar_entitlement_issuer_deliveries').get();
  assert.equal(row.state, 'prepared');
  assert.ok(row.claim_code_ciphertext);
  assert.ok(row.claim_code_nonce);
  assert.equal(row.code_encryption_key_id, keyring.currentKeyId);
  assert.equal(row.claim_json_sha256.length, 64);
  assert.equal(row.claim_json.includes(first.packageValue.claimCode), false);
  assert.notEqual(row.claim_code_ciphertext, first.packageValue.claimCode);
  assert.equal(row.idempotency_key_sha256.includes(idempotencyKey), false);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM rockstar_entitlement_issuer_deliveries').get().n, 1);
});

void test('concurrent seller retries create one delivery and all callers recover the winning package', async (t) => {
  const f = fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => issueRockstarEntitlementDeliveryOnce(
    f.db, claimInput(), privateKey, keyring, idempotencyKey)));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM rockstar_entitlement_issuer_deliveries').get().n, 1);
  assert.equal(new Set(results.map((result) => result.packageValue.claim.claimId)).size, 1);
  assert.equal(new Set(results.map((result) => result.packageValue.claimCode)).size, 1);
  assert.equal(results.filter((result) => !result.replayed).length, 1);
});

void test('an idempotency key cannot be reused for a changed order or with another seller encryption key', async (t) => {
  const f = fixture(t);
  await issueRockstarEntitlementDeliveryOnce(f.db, claimInput(), privateKey, keyring, idempotencyKey);
  await assert.rejects(issueRockstarEntitlementDeliveryOnce(f.db, claimInput({ offerId: 'esim-developer-v1' }),
    privateKey, keyring, idempotencyKey), (error) => error.code === 'IDEMPOTENCY_CONFLICT');
  await assert.rejects(issueRockstarEntitlementDeliveryOnce(f.db, claimInput(), privateKey,
    { currentKeyId: 'seller-code-key-v1', keys: { 'seller-code-key-v1': 'c'.repeat(64) } }, idempotencyKey),
    (error) => error.code === 'PERSISTENCE_UNCONFIRMED');
  await assert.rejects(issueRockstarEntitlementDeliveryOnce(f.db, claimInput(), privateKey,
    { currentKeyId: 'missing-key', keys: {} }, 'new-delivery'),
    (error) => error.code === 'KEY_NOT_CONFIGURED');
});

void test('delivery timeout retains ciphertext and retry sends the identical package before deleting the secret', async (t) => {
  const f = fixture(t);
  const issued = await issueRockstarEntitlementDeliveryOnce(f.db, claimInput(), privateKey, keyring, idempotencyKey);
  let sends = 0;
  const snapshots = [];
  const deliver = async (packageValue, key) => {
    sends++;
    snapshots.push({ packageValue, key });
    if (sends === 1) throw new Error('synthetic delivery response lost');
  };
  await assert.rejects(deliverRockstarEntitlementOnce(f.db, issued.packageValue, keyring, idempotencyKey, deliver),
    /synthetic delivery response lost/);
  assert.equal(f.sqlite.prepare('SELECT state FROM rockstar_entitlement_issuer_deliveries').get().state, 'prepared');
  assert.ok(f.sqlite.prepare('SELECT claim_code_ciphertext FROM rockstar_entitlement_issuer_deliveries').get().claim_code_ciphertext);
  const result = await deliverRockstarEntitlementOnce(f.db, issued.packageValue, keyring, idempotencyKey, deliver);
  assert.equal(result.state, 'delivered');
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.equal(snapshots[0].key, idempotencyKey);
  const row = f.sqlite.prepare('SELECT state,claim_code_ciphertext,claim_code_nonce,delivered_at FROM rockstar_entitlement_issuer_deliveries').get();
  assert.equal(row.state, 'delivered');
  assert.equal(row.claim_code_ciphertext, null);
  assert.equal(row.claim_code_nonce, null);
  assert.ok(row.delivered_at);
  const alreadyDelivered = await issueRockstarEntitlementDeliveryOnce(f.db, claimInput(), privateKey, keyring, idempotencyKey);
  assert.equal(alreadyDelivered.state, 'delivered');
  assert.equal(alreadyDelivered.packageValue, null);
  assert.equal(await acknowledgeRockstarEntitlementDelivery(f.db, issuerId, idempotencyKey,
    issued.packageValue.claim.claimId), 'already_acknowledged');
});

void test('delivery acknowledgement is exact-claim scoped and rejects unknown delivery keys', async (t) => {
  const f = fixture(t);
  const issued = await issueRockstarEntitlementDeliveryOnce(f.db, claimInput(), privateKey, keyring, idempotencyKey);
  await assert.rejects(acknowledgeRockstarEntitlementDelivery(f.db, issuerId, idempotencyKey, 'another-claim'),
    (error) => error instanceof RockstarEntitlementIssuerStoreError && error.code === 'DELIVERY_NOT_PENDING');
  await assert.rejects(acknowledgeRockstarEntitlementDelivery(f.db, issuerId, 'unknown-key', issued.packageValue.claim.claimId),
    (error) => error.code === 'DELIVERY_NOT_PENDING');
});

void test('encryption key rotation preserves recovery when the previous key remains in the keyring', async (t) => {
  const f = fixture(t);
  const issued = await issueRockstarEntitlementDeliveryOnce(f.db, claimInput(), privateKey, keyring, idempotencyKey);
  const rotated = { currentKeyId: 'seller-code-key-v2', keys: {
    'seller-code-key-v1': encryptionKeyHex, 'seller-code-key-v2': 'd'.repeat(64),
  } };
  const replay = await issueRockstarEntitlementDeliveryOnce(f.db, claimInput(), privateKey, rotated, idempotencyKey);
  assert.deepEqual(replay.packageValue, issued.packageValue);
  assert.equal(replay.state, 'prepared');
  assert.equal(f.sqlite.prepare('SELECT code_encryption_key_id FROM rockstar_entitlement_issuer_deliveries').get().code_encryption_key_id,
    'seller-code-key-v1');
});
