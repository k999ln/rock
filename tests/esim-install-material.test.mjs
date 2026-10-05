import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  acknowledgeEsimInstallMaterial,
  encryptEsimInstallMaterial,
  EsimInstallMaterialError,
  fetchEsimInstallMaterial,
  storeEsimInstallMaterial,
} from '../lib/esim-install-material.ts';

const key = 'f'.repeat(64);
const owner = 'alice';
const orderId = '55555555-5555-4555-8555-555555555555';
const profile = {
  iccid: '89445385320081602222',
  matchingId: 'MATCHING-SECRET',
  smdpAddress: 'smdp.secret.example',
  profileStatus: 'Released',
};

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter((value) => value.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  sqlite.prepare(`INSERT INTO esim_provider_orders
    (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,pricing_snapshot_json,pricing_snapshot_sha256,provider_bundle_name,
     quote_digest,quote_total,quote_currency,state,provider_order_reference,profile_digest,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    orderId, 'esim-go-v3', owner, 'plan-lifeline', 'a'.repeat(64), '{"catalogVersion":"fixture"}', 'b'.repeat(64), 'lifeline_jp_1gb',
    'b'.repeat(64), '9.99', 'USD', 'profile_bound', 'provider-order-1', 'c'.repeat(64), 1, 1,
  );
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            async run() {
              const result = statement.run(...values);
              return { meta: { changes: Number(result.changes) } };
            },
            async first() { return statement.get(...values) ?? null; },
          };
        },
      };
    },
  };
}

void test('install material is AES-GCM encrypted, owner/order bound and only retrievable through one idempotent delivery key', async (t) => {
  const db = database(t);
  await storeEsimInstallMaterial(db, profile, key, owner, orderId, 10);
  const stored = db.sqlite.prepare('SELECT * FROM esim_provider_orders WHERE sky_order_id = ?').get(orderId);
  const storedText = JSON.stringify(stored);
  assert.equal(storedText.includes(profile.iccid), false);
  assert.equal(storedText.includes(profile.matchingId), false);
  assert.equal(storedText.includes(profile.smdpAddress), false);
  assert.equal(stored.install_material_ciphertext.length > 0, true);
  assert.deepEqual(await fetchEsimInstallMaterial(db, key, owner, orderId,
    '66666666-6666-4666-8666-666666666666'), {
    iccid: profile.iccid, matchingId: profile.matchingId, smdpAddress: profile.smdpAddress,
  });
  assert.deepEqual(await fetchEsimInstallMaterial(db, key, owner, orderId,
    '66666666-6666-4666-8666-666666666666'), {
    iccid: profile.iccid, matchingId: profile.matchingId, smdpAddress: profile.smdpAddress,
  });
  await assert.rejects(fetchEsimInstallMaterial(db, key, 'mallory', orderId,
    '66666666-6666-4666-8666-666666666666'), EsimInstallMaterialError);
  await assert.rejects(fetchEsimInstallMaterial(db, key, owner, orderId,
    '77777777-7777-4777-8777-777777777777'), (error) => error.code === 'DELIVERY_KEY_CONFLICT');
  assert.equal(await acknowledgeEsimInstallMaterial(db, owner, orderId,
    '66666666-6666-4666-8666-666666666666', 20), 'acknowledged');
  assert.equal(await acknowledgeEsimInstallMaterial(db, owner, orderId,
    '66666666-6666-4666-8666-666666666666', 21), 'already_acknowledged');
  const afterAck = db.sqlite.prepare('SELECT install_material_ciphertext, install_material_nonce FROM esim_provider_orders WHERE sky_order_id = ?').get(orderId);
  assert.equal(afterAck.install_material_ciphertext, null);
  assert.equal(afterAck.install_material_nonce, null);
  await assert.rejects(fetchEsimInstallMaterial(db, key, owner, orderId,
    '66666666-6666-4666-8666-666666666666'), (error) => error.code === 'ALREADY_ACKNOWLEDGED');
});

void test('install material rejects weak keys, invalid profile data and ciphertext tampering', async (t) => {
  const db = database(t);
  await assert.rejects(encryptEsimInstallMaterial(profile, 'weak', owner, orderId),
    (error) => error.code === 'KEY_NOT_CONFIGURED');
  await assert.rejects(encryptEsimInstallMaterial({ ...profile, iccid: 'bad' }, key, owner, orderId),
    (error) => error.code === 'INVALID_MATERIAL');
  await assert.rejects(encryptEsimInstallMaterial({ ...profile,
    androidInstallUrl: 'https://attacker.example/steal?carddata=LPA%3A1%24smdp%24secret',
  }, key, owner, orderId), (error) => error.code === 'INVALID_MATERIAL');
  await storeEsimInstallMaterial(db, profile, key, owner, orderId, 10);
  db.sqlite.prepare(`UPDATE esim_provider_orders SET install_material_ciphertext = ? WHERE sky_order_id = ?`)
    .run('tampered', orderId);
  await assert.rejects(fetchEsimInstallMaterial(db, key, owner, orderId,
    '88888888-8888-4888-8888-888888888888'));
});

void test('platform quick-install links stay encrypted and are returned only as provider-approved deep links', async (t) => {
  const db = database(t);
  const withLinks = {
    ...profile,
    appleInstallUrl: 'https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24APPLE-SECRET',
    androidInstallUrl: 'https://esimsetup.android.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24ANDROID-SECRET',
  };
  await storeEsimInstallMaterial(db, withLinks, key, owner, orderId, 10);
  const stored = JSON.stringify(db.sqlite.prepare('SELECT * FROM esim_provider_orders WHERE sky_order_id = ?').get(orderId));
  assert.equal(stored.includes('APPLE-SECRET'), false);
  assert.equal(stored.includes('ANDROID-SECRET'), false);
  const deliveryId = '99999999-9999-4999-8999-999999999999';
  assert.deepEqual(await fetchEsimInstallMaterial(db, key, owner, orderId, deliveryId), {
    iccid: profile.iccid,
    matchingId: profile.matchingId,
    smdpAddress: profile.smdpAddress,
    appleInstallUrl: withLinks.appleInstallUrl,
    androidInstallUrl: withLinks.androidInstallUrl,
  });
});
