import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createEsimPricingSnapshot, parseEsimServerPlanCatalog } from '../lib/esim-plan-catalog.ts';
import { reconcileKnownEsimProviderOrders } from '../lib/esim-reconciliation-worker.ts';

const profileHashSecret = 'profile-reference-hash-secret-fixture-distinct';
const installMaterialKey = 'f'.repeat(64);
const apiKey = 'provider-api-key-fixture';

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter((entry) => entry.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            async run() { const result = statement.run(...values); return { meta: { changes: Number(result.changes) } }; },
            async first() { return statement.get(...values) ?? null; },
            async all() { const result = statement.all(...values); return { results: result }; },
          };
        },
        async all() { return { results: statement.all() }; },
      };
    },
  };
}

void test('scheduled reconciler bounds read-only provider polls and skips unknown transaction outcomes', async (t) => {
  const db = database(t);
  const now = 9000;
  const hash = 'c'.repeat(64);
  const bundle = 'lifeline_jp_1gb';
  const reference = 'provider-order-known';
  const orderId = '66666666-6666-4666-8666-666666666666';
  const unknownOrderId = '77777777-7777-4777-8777-777777777777';
  const catalog = parseEsimServerPlanCatalog(JSON.stringify({ version: 'fixture-v1', plans: [{
    packageKey: 'plan-lifeline', manifestSha256: hash, providerBundleName: bundle,
    providerCurrency: 'USD', maximumWholesaleMinor: 1000, retailCurrency: 'jpy', retailAmountMinor: 2000,
    providerMinorToRetailNumerator: 1, providerMinorToRetailDenominator: 1,
    providerFeeReserveRetailMinor: 100, minimumGrossMarginRetailMinor: 500,
    starterAgentPack: { id: 'lifeline', version: '1.0.0', packages: [{
      packageKey: 'dev.rockstar.offline-guide@1.0.0', manifestSha256: 'b'.repeat(64),
    }] },
  }] }));
  const pricing = await createEsimPricingSnapshot(catalog, catalog.plans[0]);
  db.sqlite.prepare(`INSERT INTO sky_tool_packages
    (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run('plan-lifeline', 'plan-lifeline', '1.0.0', 'seller', '{}', hash, 'verified', now, now, now);
  db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews
    (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run('review-scan', 'plan-lifeline', hash, 'reviewer', 'verified', '[]', '[]', 'fixture', now);
  for (const [id, state, ref, iccid] of [
    [orderId, 'provider_completed', reference, '89445385320081602226'],
    [unknownOrderId, 'reconciliation_required', null, '89445385320081602227'],
  ]) {
    db.sqlite.prepare(`INSERT INTO sky_commerce_orders
      (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
       commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
       status,active_key,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, 'alice', 'seller', 'live', 'plan-lifeline', hash, 'Lifeline', 2000, 200, 0, 'jpy',
        'acct_fixture', 1, 'https://example.test/terms', 'none', 'paid', null, now, now,
      );
    db.sqlite.prepare(`INSERT INTO esim_provider_orders
      (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,pricing_snapshot_json,pricing_snapshot_sha256,
       provider_bundle_name,quote_digest,quote_total,quote_currency,state,provider_order_reference,profile_digest,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, 'esim-go-v3', 'alice', 'plan-lifeline', hash, pricing.canonicalJson, pricing.sha256, bundle,
        'e'.repeat(64), '9.99', 'USD', state, ref,
        iccid === '89445385320081602226' ? await import('../lib/esimgo-webhook.ts').then(({ esimGoProfileDigest }) => esimGoProfileDigest(iccid, profileHashSecret)) : null,
      now, now,
    );
  }
  const knownProfileDigest = db.sqlite.prepare(
    'SELECT profile_digest AS digest FROM esim_provider_orders WHERE sky_order_id = ?',
  ).get(orderId).digest;
  db.sqlite.prepare(`INSERT INTO esim_provider_webhook_inbox
    (callback_digest,provider,event_type,received_at,state,profile_digest,owner_user_id,sky_order_id)
    VALUES (?,?,?,?,?,?,NULL,NULL)`).run('a'.repeat(64), 'esim-go-v3', 'profile-ready', now,
    'received', knownProfileDigest);
  db.sqlite.prepare(`INSERT INTO esim_provider_webhook_inbox
    (callback_digest,provider,event_type,received_at,state,profile_digest,owner_user_id,sky_order_id)
    VALUES (?,?,?,?,?,?,NULL,NULL)`).run('b'.repeat(64), 'esim-go-v3', 'profile-ready', now,
    'received', 'd'.repeat(64));
  const requests = [];
  async function fakeProviderFetch(url, init) {
    assert.equal(init.method, undefined);
    requests.push(String(url));
    if (url === `https://api.esim-go.com/v2.5/orders/${reference}`) return Response.json({
      order: [{ type: 'bundle', item: bundle, quantity: 1, esims: [{
        iccid: '89445385320081602226', matchingId: 'MATCH-SECRET', smdpAddress: 'smdp.example.test',
      }] }], total: 9.99, currency: 'USD', status: 'completed', orderReference: reference,
    });
    if (url === `https://api.esim-go.com/v2.5/esims/assignments?reference=${reference}&additionalFields=installUrl`) return Response.json({
      iccid: '89445385320081602226', matchingId: 'MATCH-SECRET', smdpAddress: 'smdp.example.test', profileStatus: 'Released',
      androidInstallUrl: 'https://esimsetup.android.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.test%24ANDROID-RECOVERY',
    });
    assert.fail('Unexpected provider request');
  }

  // Install the fixture before constructing the provider adapter; this test
  // must never contact the real provider.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeProviderFetch;
  try {
    const result = await reconcileKnownEsimProviderOrders(db, {
      apiKey,
      profileHashSecret,
      installMaterialEncryptionKey: installMaterialKey,
    }, now + 1);
    assert.deepEqual(result, { scanned: 1, bound: 1, pending: 0, callbacksLinked: 1 });
    assert.equal(db.sqlite.prepare('SELECT state FROM esim_provider_orders WHERE sky_order_id = ?').get(orderId).state, 'profile_bound');
    assert.equal(db.sqlite.prepare('SELECT state FROM esim_provider_orders WHERE sky_order_id = ?').get(unknownOrderId).state, 'reconciliation_required');
    const matched = db.sqlite.prepare('SELECT state, owner_user_id AS ownerUserId, sky_order_id AS skyOrderId FROM esim_provider_webhook_inbox WHERE callback_digest = ?').get('a'.repeat(64));
    assert.deepEqual({ ...matched }, { state: 'reconciliation_required', ownerUserId: 'alice', skyOrderId: orderId });
    const unmatched = db.sqlite.prepare('SELECT state, owner_user_id AS ownerUserId, sky_order_id AS skyOrderId FROM esim_provider_webhook_inbox WHERE callback_digest = ?').get('b'.repeat(64));
    assert.deepEqual({ ...unmatched }, { state: 'received', ownerUserId: null, skyOrderId: null });

    // A second invocation sees the terminal binding and never repeats provider I/O.
    const after = await reconcileKnownEsimProviderOrders(db, {
      apiKey,
      profileHashSecret,
      installMaterialEncryptionKey: installMaterialKey,
    }, now + 2);
    assert.deepEqual(after, { scanned: 0, bound: 0, pending: 0, callbacksLinked: 0 });
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

void test('scheduled eSIM reconciliation is disabled without separate provider secrets', async (t) => {
  const db = database(t);
  assert.deepEqual(await reconcileKnownEsimProviderOrders(db, {
    apiKey,
    profileHashSecret: apiKey,
    installMaterialEncryptionKey: 'f'.repeat(64),
  }, Date.now()), { scanned: 0, bound: 0, pending: 0, callbacksLinked: 0 });
});
