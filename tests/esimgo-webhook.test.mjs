import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { bindEsimGoIssuedProfile, esimGoProfileDigest, persistEsimGoWebhook, readEsimGoV3Request, verifyEsimGoV3Body } from '../lib/esimgo-webhook.ts';
import { createEsimGoV25Client, EsimGoProviderError, issuePaidSkyEsimGoProfile, reconcilePaidSkyEsimGoProfile } from '../lib/esimgo-provider.ts';
import { createEsimPricingSnapshot, parseEsimServerPlanCatalog } from '../lib/esim-plan-catalog.ts';
import { fetchEsimInstallMaterial } from '../lib/esim-install-material.ts';

const apiKey = 'provider-signing-key-fixture';
const dedupeSecret = 'rockstar-private-dedupe-secret-fixture-rotate-independent';
const profileHashSecret = 'profile-reference-hash-secret-fixture-distinct';
const body = Buffer.from('{"alertType":"usage","iccid":"89445385320081602222","remainingQuantity":500}');
const signature = createHmac('sha256', apiKey).update(body).digest('base64');

async function testPricingSnapshot(manifestSha256, version = 'fixture-v1') {
  const catalog = parseEsimServerPlanCatalog(JSON.stringify({ version, plans: [{
    packageKey: 'plan-lifeline', manifestSha256, providerBundleName: 'lifeline_jp_1gb',
    providerCurrency: 'USD', maximumWholesaleMinor: 1000, retailCurrency: 'jpy',
    retailAmountMinor: 2000, providerMinorToRetailNumerator: 1,
    providerMinorToRetailDenominator: 1, providerFeeReserveRetailMinor: 100,
    minimumGrossMarginRetailMinor: 500,
    starterAgentPack: { id: 'lifeline', version: '1.0.0', packages: [{
      packageKey: 'dev.rockstar.offline-guide@1.0.0', manifestSha256: 'b'.repeat(64),
    }] },
  }] }));
  return createEsimPricingSnapshot(catalog, catalog.plans[0]);
}

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter((n) => n.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
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

void test('eSIM Go callback verifies raw bytes and hashes string or numeric ICCID lexemes without precision loss', async () => {
  const verified = await verifyEsimGoV3Body(body, signature, apiKey, dedupeSecret, profileHashSecret);
  assert.equal(verified.eventType, 'usage');
  assert.match(verified.callbackDigest, /^[a-f0-9]{64}$/);
  assert.match(verified.profileDigest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(verified).includes('89445385320081602222'), false);

  const reorderedWhitespace = Buffer.from('{ "alertType" : "usage", "iccid" : "89445385320081602222", "remainingQuantity":500 }');
  const secondSignature = createHmac('sha256', apiKey).update(reorderedWhitespace).digest('base64');
  const second = await verifyEsimGoV3Body(reorderedWhitespace, secondSignature, apiKey, dedupeSecret, profileHashSecret);
  assert.notEqual(verified.callbackDigest, second.callbackDigest);
  assert.equal(verified.profileDigest, second.profileDigest);

  const numericIccid = Buffer.from('{"nested":{"iccid":"11111111111111111111"},"alertType":"usage","iccid":89445385320081602222}');
  const numericSignature = createHmac('sha256', apiKey).update(numericIccid).digest('base64');
  const numeric = await verifyEsimGoV3Body(numericIccid, numericSignature, apiKey, dedupeSecret, profileHashSecret);
  assert.equal(numeric.profileDigest, verified.profileDigest);
});

void test('callback request is bounded, HMAC protected, and rejected before payload parsing', async () => {
  const parsed = await readEsimGoV3Request(new Request('https://example.test/callback', {
    method: 'POST', headers: { 'x-signature-sha256': signature }, body,
  }), apiKey, dedupeSecret, profileHashSecret);
  assert.equal(parsed.eventType, 'usage');
  await assert.rejects(readEsimGoV3Request(new Request('https://example.test/callback', {
    method: 'POST', headers: { 'x-signature-sha256': `${signature.slice(0, -2)}AA` }, body,
  }), apiKey, dedupeSecret, profileHashSecret), /INVALID_SIGNATURE/);
  await assert.rejects(verifyEsimGoV3Body(body, `${signature.slice(0, -2)}AA`, apiKey, dedupeSecret, profileHashSecret), /INVALID_SIGNATURE/);
  await assert.rejects(verifyEsimGoV3Body(Buffer.alloc(64 * 1024 + 1), signature, apiKey, dedupeSecret, profileHashSecret), /BODY_SIZE/);
  const malformed = Buffer.from('{');
  await assert.rejects(verifyEsimGoV3Body(malformed,
    createHmac('sha256', apiKey).update(malformed).digest('base64'), apiKey, dedupeSecret, profileHashSecret), /INVALID_BODY/);
  const duplicateIccid = Buffer.from('{"alertType":"usage","iccid":"89445385320081602222","iccid":"89445385320081602223"}');
  await assert.rejects(verifyEsimGoV3Body(duplicateIccid,
    createHmac('sha256', apiKey).update(duplicateIccid).digest('base64'), apiKey, dedupeSecret, profileHashSecret), /INVALID_BODY/);
});

void test('only a paid live owner-matched Sky order can bind a provider profile; callbacks resolve the order without storing ICCID', async (t) => {
  const db = database(t);
  const now = 1234;
  const addOrder = (id, status) => db.sqlite.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, 'alice', 'seller', 'live', 'esim-lifeline', 'a'.repeat(64), 'Lifeline',
      1000, 100, 0, 'jpy', 'acct_fixture', 1, 'https://example.test/terms', 'none', status, null, now, now,
    );
  addOrder('order-1', 'paid');
  addOrder('order-late', 'paid');
  addOrder('order-pending', 'pending');
  const binding = {
    iccid: '89445385320081602222', profileHashSecret, ownerUserId: 'alice', skyOrderId: 'order-1',
    packageKey: 'esim-lifeline', manifestSha256: 'a'.repeat(64), createdAt: now,
  };
  assert.equal(await bindEsimGoIssuedProfile(db, binding), 'bound');
  assert.equal(await bindEsimGoIssuedProfile(db, binding), 'already_bound');
  await assert.rejects(bindEsimGoIssuedProfile(db, { ...binding, skyOrderId: 'order-pending', iccid: '89445385320081602223' }), /PAID_ORDER_NOT_ELIGIBLE/);
  await assert.rejects(bindEsimGoIssuedProfile(db, { ...binding, ownerUserId: 'mallory' }), /PROFILE_BINDING_CONFLICT/);

  const event = await verifyEsimGoV3Body(body, signature, apiKey, dedupeSecret, profileHashSecret);
  assert.equal(await persistEsimGoWebhook(db, event, now), 'accepted');
  assert.equal(await persistEsimGoWebhook(db, event, now + 1), 'duplicate');
  const rows = db.sqlite.prepare('SELECT * FROM esim_provider_webhook_inbox').all();
  assert.equal(rows.length, 1);
  const stored = JSON.stringify(rows);
  assert.equal(stored.includes('89445385320081602222'), false);
  assert.equal(stored.includes(body.toString()), false);
  assert.equal(rows[0].state, 'reconciliation_required');
  assert.equal(rows[0].owner_user_id, 'alice');
  assert.equal(rows[0].sky_order_id, 'order-1');

  const lateBody = Buffer.from('{"alertType":"firstAttachment","iccid":"89445385320081602223"}');
  const lateSignature = createHmac('sha256', apiKey).update(lateBody).digest('base64');
  const lateEvent = await verifyEsimGoV3Body(lateBody, lateSignature, apiKey, dedupeSecret, profileHashSecret);
  assert.equal(await persistEsimGoWebhook(db, lateEvent, now + 2), 'accepted');
  let lateRow = db.sqlite.prepare('SELECT * FROM esim_provider_webhook_inbox WHERE callback_digest = ?').get(lateEvent.callbackDigest);
  assert.equal(lateRow.state, 'received');
  assert.equal(lateRow.sky_order_id, null);
  assert.equal(await bindEsimGoIssuedProfile(db, {
    ...binding, iccid: '89445385320081602223', skyOrderId: 'order-late', createdAt: now + 2,
  }), 'bound');
  lateRow = db.sqlite.prepare('SELECT * FROM esim_provider_webhook_inbox WHERE callback_digest = ?').get(lateEvent.callbackDigest);
  assert.equal(lateRow.state, 'reconciliation_required');
  assert.equal(lateRow.sky_order_id, 'order-late');
});

void test('eSIM Go v2.5 uses validate-before-transaction, persists a one-shot claim and never returns install secrets', async (t) => {
  const db = database(t);
  const now = 5000;
  const hash = 'b'.repeat(64);
  const orderId = '11111111-1111-4111-8111-111111111111';
  const pricing = await testPricingSnapshot(hash);
  db.sqlite.prepare(`INSERT INTO sky_tool_packages
    (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run('plan-lifeline', 'plan-lifeline', '1.0.0', 'seller', '{}', hash, 'verified', now, now, now);
  db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run('review-1', 'plan-lifeline', hash, 'reviewer', 'verified', '[]', '[]', 'fixture', now);
  db.sqlite.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      orderId, 'alice', 'seller', 'live', 'plan-lifeline', hash, 'Lifeline',
      2000, 200, 0, 'jpy', 'acct_fixture', 1, 'https://example.test/terms', 'none', 'paid', null, now, now,
    );
  const requests = [];
  const fetcher = async (url, init) => {
    assert.equal(new Headers(init.headers).get('x-api-key'), 'esim-go-api-fixture-key');
    if (url === 'https://api.esim-go.com/v2.5/esims/assignments?reference=provider-order-ref-1&additionalFields=installUrl') {
      requests.push('install-assignments');
      return Response.json({
        iccid: '89445385320081602222', matchingId: 'MATCH-SECRET',
        smdpAddress: 'smdp.example.test', profileStatus: 'Released',
        appleInstallUrl: 'https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24APPLE-CODE',
        androidInstallUrl: 'https://esimsetup.android.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24ANDROID-CODE',
      });
    }
    assert.equal(url, 'https://api.esim-go.com/v2.5/orders');
    const body = JSON.parse(init.body);
    requests.push(body.type);
    if (body.type === 'validate') return Response.json({
      order: [{ type: 'bundle', item: 'lifeline_jp_1gb', quantity: 1 }], total: 9.99, currency: 'USD', valid: true,
    });
    return Response.json({
      order: [{ type: 'bundle', item: 'lifeline_jp_1gb', quantity: 1, esims: [{
        iccid: '89445385320081602222', matchingId: 'MATCH-SECRET', smdpAddress: 'smdp.example.test',
      }] }],
      total: 9.99, currency: 'USD', status: 'completed', orderReference: 'provider-order-ref-1',
    });
  };
  const client = createEsimGoV25Client('esim-go-api-fixture-key', fetcher);
  const input = {
    skyOrderId: orderId, ownerUserId: 'alice', packageKey: 'plan-lifeline',
    manifestSha256: hash, providerBundleName: 'lifeline_jp_1gb', expectedCurrency: 'USD',
    maximumWholesaleMinor: 1000, profileHashSecret, installMaterialEncryptionKey: 'f'.repeat(64),
    retailAmountMinor: 2000, retailCurrency: 'jpy',
    pricingSnapshotJson: pricing.canonicalJson, pricingSnapshotSha256: pricing.sha256,
    providerDebitEnabled: true, now,
  };
  const issued = await issuePaidSkyEsimGoProfile(db, client, input);
  assert.deepEqual(issued, { state: 'profile_bound', providerOrderReference: 'provider-order-ref-1' });
  assert.deepEqual(requests, ['validate', 'transaction', 'install-assignments']);
  assert.equal(JSON.stringify(issued).includes('89445385320081602222'), false);
  assert.equal(JSON.stringify(issued).includes('MATCH-SECRET'), false);
  assert.equal(JSON.stringify(issued).includes('smdp.example.test'), false);
  const providerOrder = db.sqlite.prepare('SELECT * FROM esim_provider_orders WHERE sky_order_id = ?').get(orderId);
  assert.equal(providerOrder.state, 'profile_bound');
  assert.equal(providerOrder.pricing_snapshot_json, pricing.canonicalJson);
  assert.equal(providerOrder.pricing_snapshot_sha256, pricing.sha256);
  const storedProviderOrder = JSON.stringify(providerOrder);
  assert.equal(storedProviderOrder.includes('89445385320081602222'), false);
  assert.equal(storedProviderOrder.includes('MATCH-SECRET'), false);
  assert.equal(storedProviderOrder.includes('smdp.example.test'), false);
  assert.equal(storedProviderOrder.includes('APPLE-CODE'), false);
  assert.equal(storedProviderOrder.includes('ANDROID-CODE'), false);
  assert.deepEqual(await fetchEsimInstallMaterial(db, 'f'.repeat(64), 'alice', orderId,
    '66666666-6666-4666-8666-666666666666'), {
    iccid: '89445385320081602222', matchingId: 'MATCH-SECRET', smdpAddress: 'smdp.example.test',
    appleInstallUrl: 'https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24APPLE-CODE',
    androidInstallUrl: 'https://esimsetup.android.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24ANDROID-CODE',
  });

  const retry = await issuePaidSkyEsimGoProfile(db, client, { ...input, now: now + 1 });
  assert.deepEqual(retry, { state: 'profile_bound', providerOrderReference: 'provider-order-ref-1' });
  assert.equal(requests.filter((type) => type === 'transaction').length, 1);
  const changedPricing = await testPricingSnapshot(hash, 'fixture-v2');
  await assert.rejects(issuePaidSkyEsimGoProfile(db, client, {
    ...input, pricingSnapshotJson: changedPricing.canonicalJson, pricingSnapshotSha256: changedPricing.sha256,
  }), (error) => error instanceof EsimGoProviderError && error.code === 'ORDER_ALREADY_CLAIMED');
});

void test('provider quote above the approved wholesale cap is rejected before creating an order claim or debit', async (t) => {
  const db = database(t);
  const now = 5500;
  const hash = 'd'.repeat(64);
  const orderId = '22222222-2222-4222-8222-222222222222';
  const pricing = await testPricingSnapshot(hash);
  db.sqlite.prepare(`INSERT INTO sky_tool_packages
    (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run('plan-lifeline', 'plan-lifeline', '1.0.0', 'seller', '{}', hash, 'verified', now, now, now);
  db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run('review-cap', 'plan-lifeline', hash, 'reviewer', 'verified', '[]', '[]', 'fixture', now);
  db.sqlite.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      orderId, 'alice', 'seller', 'live', 'plan-lifeline', hash, 'Lifeline',
      2000, 200, 0, 'jpy', 'acct_fixture', 1, 'https://example.test/terms', 'none', 'paid', null, now, now,
    );
  const requests = [];
  const client = createEsimGoV25Client('esim-go-api-fixture-key', async (_url, init) => {
    const type = JSON.parse(init.body).type;
    requests.push(type);
    return Response.json({
      order: [{ type: 'bundle', item: 'lifeline_jp_1gb', quantity: 1 }], total: 10.01, currency: 'USD', valid: true,
    });
  });
  await assert.rejects(issuePaidSkyEsimGoProfile(db, client, {
    skyOrderId: orderId, ownerUserId: 'alice', packageKey: 'plan-lifeline', manifestSha256: hash,
    providerBundleName: 'lifeline_jp_1gb', expectedCurrency: 'USD', maximumWholesaleMinor: 1000,
    retailAmountMinor: 2000, retailCurrency: 'jpy',
    pricingSnapshotJson: pricing.canonicalJson, pricingSnapshotSha256: pricing.sha256,
    profileHashSecret, installMaterialEncryptionKey: 'f'.repeat(64), providerDebitEnabled: true, now,
  }), (error) => error instanceof EsimGoProviderError && error.code === 'QUOTE_CHANGED');
  assert.deepEqual(requests, ['validate']);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM esim_provider_orders').get().count, 0);
});

void test('disabled provider debit and transaction timeouts do not send a second transaction', async (t) => {
  const db = database(t);
  const now = 6000;
  const hash = 'c'.repeat(64);
  const orderId = '33333333-3333-4333-8333-333333333333';
  const pricing = await testPricingSnapshot(hash);
  db.sqlite.prepare(`INSERT INTO sky_tool_packages
    (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run('plan-lifeline', 'plan-lifeline', '1.0.0', 'seller', '{}', hash, 'verified', now, now, now);
  db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run('review-2', 'plan-lifeline', hash, 'reviewer', 'verified', '[]', '[]', 'fixture', now);
  db.sqlite.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      orderId, 'alice', 'seller', 'live', 'plan-lifeline', hash, 'Lifeline',
      2000, 200, 0, 'jpy', 'acct_fixture', 1, 'https://example.test/terms', 'none', 'paid', null, now, now,
    );
  const client = createEsimGoV25Client('esim-go-api-fixture-key', async () => Response.json({
    order: [{ type: 'bundle', item: 'lifeline_jp_1gb', quantity: 1 }], total: 9.99, currency: 'USD', valid: true,
  }));
  const input = {
    skyOrderId: orderId, ownerUserId: 'alice', packageKey: 'plan-lifeline', manifestSha256: hash,
    providerBundleName: 'lifeline_jp_1gb', expectedCurrency: 'USD', maximumWholesaleMinor: 1000,
    retailAmountMinor: 2000, retailCurrency: 'jpy',
    pricingSnapshotJson: pricing.canonicalJson, pricingSnapshotSha256: pricing.sha256,
    profileHashSecret, installMaterialEncryptionKey: 'f'.repeat(64), providerDebitEnabled: false, now,
  };
  await assert.rejects(issuePaidSkyEsimGoProfile(db, client, input), (error) =>
    error instanceof EsimGoProviderError && error.code === 'PROVIDER_DEBIT_DISABLED');

  let transactions = 0;
  const timeoutClient = createEsimGoV25Client('esim-go-api-fixture-key', async (_url, init) => {
    if (JSON.parse(init.body).type === 'validate') return Response.json({
      order: [{ type: 'bundle', item: 'lifeline_jp_1gb', quantity: 1 }], total: 9.99, currency: 'USD', valid: true,
    });
    transactions++;
    throw new TypeError('network failure');
  });
  const first = await issuePaidSkyEsimGoProfile(db, timeoutClient, { ...input, providerDebitEnabled: true });
  assert.deepEqual(first, { state: 'reconciliation_required' });
  assert.equal(transactions, 1);
  const retry = await issuePaidSkyEsimGoProfile(db, timeoutClient, { ...input, providerDebitEnabled: true, now: now + 1 });
  assert.deepEqual(retry, { state: 'already_claimed' });
  assert.equal(transactions, 1);
  assert.equal(db.sqlite.prepare('SELECT state FROM esim_provider_orders WHERE sky_order_id = ?').get(orderId).state, 'reconciliation_required');
});

void test('provider_completed resumes by read-only assignment lookup and binds without another debit', async (t) => {
  const db = database(t);
  const now = 7000;
  const hash = 'd'.repeat(64);
  const iccid = '89445385320081602224';
  const orderId = '44444444-4444-4444-8444-444444444444';
  const pricing = await testPricingSnapshot(hash);
  db.sqlite.prepare(`INSERT INTO sky_tool_packages
    (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run('plan-lifeline', 'plan-lifeline', '1.0.0', 'seller', '{}', hash, 'verified', now, now, now);
  db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run('review-3', 'plan-lifeline', hash, 'reviewer', 'verified', '[]', '[]', 'fixture', now);
  db.sqlite.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      orderId, 'alice', 'seller', 'live', 'plan-lifeline', hash, 'Lifeline',
      2000, 200, 0, 'jpy', 'acct_fixture', 1, 'https://example.test/terms', 'none', 'paid', null, now, now,
    );
  const profileDigest = await esimGoProfileDigest(iccid, profileHashSecret);
  db.sqlite.prepare(`INSERT INTO esim_provider_orders
    (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,pricing_snapshot_json,pricing_snapshot_sha256,provider_bundle_name,
     quote_digest,quote_total,quote_currency,state,provider_order_reference,profile_digest,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    orderId, 'esim-go-v3', 'alice', 'plan-lifeline', hash, pricing.canonicalJson, pricing.sha256, 'lifeline_jp_1gb',
      'e'.repeat(64), '9.99', 'USD', 'provider_completed', 'provider-order-ref-resume', profileDigest, now, now,
    );
  const calls = [];
  const client = createEsimGoV25Client('esim-go-api-fixture-key', async (url, init) => {
    calls.push({ url, method: init.method });
    assert.equal(init.method, undefined);
    assert.equal(url, 'https://api.esim-go.com/v2.5/esims/assignments?reference=provider-order-ref-resume&additionalFields=installUrl');
    return Response.json({ iccid, matchingId: 'MATCH-SECRET', smdpAddress: 'smdp.example.test', profileStatus: 'Released' });
  });
  const result = await issuePaidSkyEsimGoProfile(db, client, {
    skyOrderId: orderId, ownerUserId: 'alice', packageKey: 'plan-lifeline', manifestSha256: hash,
    providerBundleName: 'lifeline_jp_1gb', expectedCurrency: 'USD', maximumWholesaleMinor: 1000,
    retailAmountMinor: 2000, retailCurrency: 'jpy',
    pricingSnapshotJson: pricing.canonicalJson, pricingSnapshotSha256: pricing.sha256,
    profileHashSecret, installMaterialEncryptionKey: 'f'.repeat(64), providerDebitEnabled: true, now: now + 1,
  });
  assert.deepEqual(result, { state: 'profile_bound', providerOrderReference: 'provider-order-ref-resume' });
  assert.equal(calls.length, 1);
  assert.equal(db.sqlite.prepare('SELECT state FROM esim_provider_orders WHERE sky_order_id = ?').get(orderId).state, 'profile_bound');
  assert.equal(db.sqlite.prepare('SELECT sky_order_id FROM esim_provider_profile_bindings WHERE profile_digest = ?').get(profileDigest).sky_order_id, orderId);
});

void test('explicit reconciliation verifies provider order and assignment by GET without creating another order', async (t) => {
  const db = database(t);
  const now = 8000;
  const hash = 'c'.repeat(64);
  const iccid = '89445385320081602225';
  const orderId = '55555555-5555-4555-8555-555555555555';
  const providerRef = 'provider-order-ref-reconcile';
  const pricing = await testPricingSnapshot(hash);
  db.sqlite.prepare(`INSERT INTO sky_tool_packages
    (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run('plan-lifeline', 'plan-lifeline', '1.0.0', 'seller', '{}', hash, 'verified', now, now, now);
  db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run('review-reconcile', 'plan-lifeline', hash, 'reviewer', 'verified', '[]', '[]', 'fixture', now);
  db.sqlite.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      orderId, 'alice', 'seller', 'live', 'plan-lifeline', hash, 'Lifeline',
      2000, 200, 0, 'jpy', 'acct_fixture', 1, 'https://example.test/terms', 'none', 'paid', null, now, now,
    );
  const profileDigest = await esimGoProfileDigest(iccid, profileHashSecret);
  db.sqlite.prepare(`INSERT INTO esim_provider_orders
    (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,pricing_snapshot_json,pricing_snapshot_sha256,provider_bundle_name,
     quote_digest,quote_total,quote_currency,state,provider_order_reference,profile_digest,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    orderId, 'esim-go-v3', 'alice', 'plan-lifeline', hash, pricing.canonicalJson, pricing.sha256, 'lifeline_jp_1gb',
    'e'.repeat(64), '9.99', 'USD', 'provider_completed', providerRef, profileDigest, now, now,
  );
  const calls = [];
  const client = createEsimGoV25Client('esim-go-api-fixture-key', async (url, init) => {
    calls.push({ url, method: init.method });
    assert.equal(init.method, undefined);
    if (url === `https://api.esim-go.com/v2.5/orders/${providerRef}`) return Response.json({
      order: [{ type: 'bundle', item: 'lifeline_jp_1gb', quantity: 1, esims: [{
        iccid, matchingId: 'MATCH-SECRET', smdpAddress: 'smdp.example.test',
      }] }],
      total: 9.99, currency: 'USD', status: 'completed', orderReference: providerRef,
    });
    if (url === `https://api.esim-go.com/v2.5/esims/assignments?reference=${providerRef}&additionalFields=installUrl`) return Response.json({
      iccid, matchingId: 'MATCH-SECRET', smdpAddress: 'smdp.example.test', profileStatus: 'Released',
    });
    assert.fail('Unexpected provider request');
  });
  const result = await reconcilePaidSkyEsimGoProfile(db, client, {
    skyOrderId: orderId, ownerUserId: 'alice', packageKey: 'plan-lifeline', manifestSha256: hash,
    providerBundleName: 'lifeline_jp_1gb', expectedCurrency: 'USD', maximumWholesaleMinor: 1000,
    retailAmountMinor: 2000, retailCurrency: 'jpy',
    pricingSnapshotJson: pricing.canonicalJson, pricingSnapshotSha256: pricing.sha256,
    profileHashSecret, installMaterialEncryptionKey: 'f'.repeat(64), now: now + 1,
  });
  assert.deepEqual(result, { state: 'profile_bound' });
  assert.deepEqual(calls.map(({ url }) => url), [
    `https://api.esim-go.com/v2.5/orders/${providerRef}`,
    `https://api.esim-go.com/v2.5/esims/assignments?reference=${providerRef}&additionalFields=installUrl`,
  ]);
  assert.equal(db.sqlite.prepare('SELECT state FROM esim_provider_orders WHERE sky_order_id = ?').get(orderId).state, 'profile_bound');
  assert.equal(db.sqlite.prepare('SELECT sky_order_id FROM esim_provider_profile_bindings WHERE profile_digest = ?').get(profileDigest).sky_order_id, orderId);
  const material = db.sqlite.prepare('SELECT install_material_ciphertext, install_material_nonce FROM esim_provider_orders WHERE sky_order_id = ?').get(orderId);
  assert.ok(material.install_material_ciphertext);
  assert.ok(material.install_material_nonce);
});
