import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { esimInstallQr, esimIosInstallCard, supportsIosEsimLink } from '../lib/esim-ios-install.ts';
import { resolveEsimCloudGrant } from '../lib/esim-cloud-grant.ts';
import { readIosEveEntitlement } from '../lib/esim-install-proof.ts';
import { bindEsimGoIssuedProfile, esimGoProfileDigest } from '../lib/esimgo-webhook.ts';
import { sourceSandboxRestoreStatements } from '../scripts/sky-monthly-sandbox-db.mjs';

void test('Apple direct install is limited to iOS 17.4+ and the QR uses the same LPA data', () => {
  const iphone = (os) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148`;
  assert.equal(supportsIosEsimLink(iphone('17_3_1')), false);
  assert.equal(supportsIosEsimLink(iphone('17_4')), true);
  assert.equal(supportsIosEsimLink(iphone('18_0')), true);
  assert.equal(supportsIosEsimLink('Mozilla/5.0 (iPad; CPU OS 17_4_1 like Mac OS X)'), true);
  assert.equal(supportsIosEsimLink('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), false);
  assert.equal(supportsIosEsimLink('Mozilla/5.0 (Linux; Android 17)'), false);
  const material = { smdpAddress: 'rsp.example.test', matchingId: 'synthetic-id+/=&?#' };
  const card = esimIosInstallCard(material);
  assert.equal(card.cardData, 'LPA:1$rsp.example.test$synthetic-id+/=&?#');
  const link = new URL(card.url);
  assert.equal(link.origin + link.pathname, 'https://esimsetup.apple.com/esim_qrcode_provisioning');
  assert.deepEqual([...link.searchParams], [['carddata', card.cardData]]);
  assert.equal(link.hash, '');
  const qr = esimInstallQr(card.cardData);
  assert.match(qr, /^data:image\/gif;base64,R0lGOD/);
  assert.notEqual(qr, esimInstallQr(card.cardData + 'x'));
  assert.equal(esimIosInstallCard({ ...material, smdpAddress: 'https://fake.test' }), null);
  assert.equal(esimIosInstallCard({ ...material, matchingId: 'first$second' }), null);
});

void test('iOS declaration and signed lifecycle callbacks authorize only the bound account and profile', async (t) => {
  const apiKey = randomBytes(32).toString('hex');
  const dedupeSecret = randomBytes(32).toString('hex');
  const profileHashSecret = randomBytes(32).toString('hex');
  const { outputFiles: [bundle] } = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
      contents: `
        import { POST as declare } from './app/api/esim/orders/[orderId]/install-proof/ios/route.ts';
        import { POST as webhook } from './app/api/esim/webhooks/esim-go/route.ts';
        export default { fetch(request) {
          const path = new URL(request.url).pathname;
          if (path === '/api/esim/webhooks/esim-go') return webhook(request);
          return declare(request, { params: Promise.resolve({ orderId: path.split('/')[4] }) });
        } };
      `,
    },
    bundle: true, write: false, platform: 'neutral', format: 'esm', mainFields: ['module', 'main'],
    external: ['cloudflare:workers', 'node:*'],
  });
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: bundle.text,
    compatibilityDate: '2026-08-18',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'],
    host: '127.0.0.1',
    port: 0,
    bindings: {
      ESIMGO_API_KEY: apiKey,
      ESIMGO_CALLBACK_DEDUPE_SECRET: dedupeSecret,
      ESIMGO_PROFILE_HASH_SECRET: profileHashSecret,
    },
  }));
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  await db.batch(sourceSandboxRestoreStatements().map((statement) => db.prepare(statement)));

  const owner = 'fixture-ios-owner';
  const other = 'fixture-other-owner';
  const order = randomUUID();
  const secondOrder = randomUUID();
  const iccid = '89445385320081602222';
  const secondIccid = '89445385320081602223';
  const packageKey = 'esim-ios-test';
  const manifestSha256 = 'a'.repeat(64);
  const now = Date.now() - 60_000;
  const origin = 'http://127.0.0.1';

  async function seed(id, buyer, profile) {
    const digest = await esimGoProfileDigest(profile, profileHashSecret);
    await db.batch([
      db.prepare(`INSERT INTO sky_commerce_orders
        (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
         commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,status,created_at,updated_at)
        VALUES (?,?,'seller','live',?,?,'Synthetic eSIM',2000,100,0,'jpy','fixture',1,'https://example.test/terms','fixture','paid',?,?)`)
        .bind(id, buyer, packageKey, manifestSha256, now, now),
      db.prepare(`INSERT INTO esim_provider_orders
        (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,provider_bundle_name,quote_digest,
         quote_total,quote_currency,state,profile_digest,created_at,updated_at,pricing_snapshot_json,pricing_snapshot_sha256)
        VALUES (?,'esim-go-v3',?,?,?,'fixture',?,'2.00','USD','profile_bound',?,?,?,'{}',?)`)
        .bind(id, buyer, packageKey, manifestSha256, 'b'.repeat(64), digest, now, now, 'c'.repeat(64)),
    ]);
  }
  async function bind(id, buyer, profile) {
    await bindEsimGoIssuedProfile(db, {
      skyOrderId: id, ownerUserId: buyer, packageKey, manifestSha256, iccid: profile,
      profileHashSecret, createdAt: now,
    });
  }
  function declare(id, buyer = owner, headers = {}, body) {
    return worker.dispatchFetch(`${origin}/api/esim/orders/${id}/install-proof/ios`, {
      method: 'POST', headers: { origin, 'oai-authenticated-user-id': buyer, ...headers }, body,
    });
  }
  function callback(payload, validSignature = true) {
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', validSignature ? apiKey : 'wrong-fixture-key').update(body).digest('base64');
    return worker.dispatchFetch(`${origin}/api/esim/webhooks/esim-go`, {
      method: 'POST', body, headers: { 'x-signature-sha256': signature },
    });
  }
  function lifecycle(profile, profileStatus, offset, extra = {}) {
    return {
      alertType: 'ProfileStatusChange', iccid: profile, profileStatus,
      eventTime: new Date(now + offset).toISOString(), ...extra,
    };
  }

  await seed(order, owner, iccid);
  await seed(secondOrder, other, secondIccid);
  assert.equal((await declare(order)).status, 404);
  await bind(order, owner, iccid);
  assert.equal((await declare(order, other)).status, 404);
  assert.equal((await declare(order, '', {})).status, 401);
  assert.equal((await declare(order, owner, { origin: 'https://different.test' })).status, 403);
  assert.equal((await declare(order, owner, {}, '{"iccid":"client-input"}')).status, 400);
  assert.equal(await readIosEveEntitlement(db, owner, order), 'not_declared');

  const claims = await Promise.all([declare(order), declare(order)]);
  for (const claim of claims) {
    assert.equal(claim.status, 200);
    assert.equal(claim.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await claim.json(), { iosEveEntitlementState: 'awaiting_provider' });
  }
  assert.equal(await db.prepare('SELECT count(*) AS count FROM esim_ios_install_declarations').first('count'), 1);

  assert.equal((await callback(lifecycle(iccid, 'Downloaded', 1000), false)).status, 401);
  assert.equal((await callback(lifecycle(iccid, 'Downloaded', 1000, { eventTime: 'invalid' }))).status, 200);
  assert.equal((await callback(lifecycle(iccid, 'downloaded', 1000))).status, 200);
  assert.equal((await callback(lifecycle(iccid, 'Downloaded', 1000, { alertType: 'usage' }))).status, 200);
  assert.equal((await callback(lifecycle(secondIccid, 'Downloaded', 1000))).status, 200);
  assert.equal(await readIosEveEntitlement(db, owner, order), 'awaiting_provider');
  await bind(secondOrder, other, secondIccid);
  assert.equal(await readIosEveEntitlement(db, other, secondOrder), 'not_declared');
  assert.deepEqual(await (await declare(secondOrder, other)).json(), { iosEveEntitlementState: 'active' });

  const downloaded = lifecycle(iccid, 'Downloaded', 2000, { device: { eid: 'synthetic-private-device-field' } });
  assert.deepEqual(await (await callback(downloaded)).json(), { received: true, duplicate: false });
  assert.deepEqual(await (await callback(downloaded)).json(), { received: true, duplicate: true });
  assert.equal(await readIosEveEntitlement(db, owner, order), 'active');
  assert.equal(await db.prepare('SELECT count(*) AS count FROM esim_go_profile_status_events').first('count'), 2);
  assert.equal(await db.prepare('SELECT count(*) AS count FROM esim_device_install_receipts').first('count'), 0);
  assert.equal(await db.prepare('SELECT count(*) AS count FROM esim_device_entitlements').first('count'), 0);
  assert.equal(await resolveEsimCloudGrant(db, { ESIM_CLOUD_ACCESS_POLICIES_JSON: JSON.stringify([{
    packageKey, manifestSha256, accessDurationDays: 30, scopes: ['rockstaros_access'],
  }]) }, owner, order), null);

  await callback(lifecycle(iccid, 'Released', 4000));
  await callback(lifecycle(iccid, 'Installed', 3000));
  await callback(lifecycle(iccid, 'Installed', 4000));
  await callback(lifecycle(iccid, 'Downloaded', 3600_000));
  assert.equal(await readIosEveEntitlement(db, owner, order), 'provider_released');
  await callback(lifecycle(iccid, 'Installed', 5000));
  assert.equal(await readIosEveEntitlement(db, owner, order), 'active');

  await db.prepare("UPDATE sky_commerce_orders SET status = 'refunded', refunded_minor = amount_minor WHERE id = ?").bind(order).run();
  assert.equal(await readIosEveEntitlement(db, owner, order), null);
  assert.equal((await declare(order)).status, 404);
});
