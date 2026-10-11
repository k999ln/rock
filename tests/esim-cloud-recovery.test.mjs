import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as cloudAccess from '../lib/esim-cloud-access.ts';
import * as cloudGrant from '../lib/esim-cloud-grant.ts';
import { requestUser } from '../lib/request-auth.ts';
import {
  createSkyToolPackageDraft,
  skyToolPackageKey,
  skyToolPackageSha256,
} from '../lib/sky-tool-package.ts';
import {
  createEsimPricingSnapshot,
  parseEsimServerPlanCatalog,
} from '../lib/esim-plan-catalog.ts';
import {
  esimCloudAccessStore,
  authenticateEsimCloudRequest,
} from '../lib/esim-cloud-access.ts';
import { skyToolPackageStore } from '../lib/sky-tool-package-store.ts';
import { rockstarServiceScopeAllowed } from '../lib/rockstar-service-access.ts';
import { missingRockstarServiceScope } from '../lib/rockstar-service-access.ts';
import { loadRouteFixture } from './route-fixture.mjs';
import * as workflow from '../lib/workflow.ts';
import { workStore } from '../lib/work-store.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const routeCode = ts.transpileModule(
  readFileSync(
    new URL(
      '../app/api/esim/orders/[orderId]/cloud-access/route.ts',
      import.meta.url,
    ),
    'utf8',
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function cloudRoute(f) {
  const exports = {};
  runInNewContext(routeCode, {
    exports,
    Request,
    Response,
    Error,
    URL,
    require(id) {
      if (id === 'cloudflare:workers') return { env: f.config };
      if (id === '@/lib/fund-store')
        return { database: () => f.db, requestUser };
      if (id === '@/lib/esim-cloud-access') return cloudAccess;
      if (id === '@/lib/esim-cloud-grant') return cloudGrant;
      throw new Error(`Unexpected dependency ${id}`);
    },
  });
  return async (orderId, body, owner = f.owner, headers = {}) => {
    const method = body ? 'POST' : 'GET';
    const request = new Request(
      `https://rock.test/api/esim/orders/${orderId}/cloud-access`,
      {
        method,
        headers: {
          origin: 'https://rock.test',
          'oai-authenticated-user-id': owner,
          'content-type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return exports[method](request, { params: Promise.resolve({ orderId }) });
  };
}

async function fixture(t, { reviewDurationMs = null } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'),
    );
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bind = (...values) => ({
        async first() {
          return statement.get(...values) ?? null;
        },
        async all() {
          return { results: statement.all(...values) };
        },
        run() {
          return {
            meta: { changes: Number(statement.run(...values).changes) },
          };
        },
      });
      return { bind, ...bind() };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const now = Date.now(),
    owner = 'cloud-recovery-owner';
  const manifest = createSkyToolPackageDraft({
    sourceKind: 'github',
    sourceUrl: 'https://github.com/example/offline-guide',
    developerName: 'Fixture',
    developerId: 'fixture',
    license: 'MIT',
    name: 'Offline Guide',
    summary: 'Synthetic local guide.',
    version: '1.0.0',
  });
  const packageKey = skyToolPackageKey(manifest),
    manifestSha256 = await skyToolPackageSha256(manifest);
  const catalog = parseEsimServerPlanCatalog(
    JSON.stringify({
      version: 'fixture',
      plans: [
        {
          packageKey: 'cloud-esim-fixture',
          manifestSha256: 'a'.repeat(64),
          providerBundleName: 'fixture_bundle',
          providerCurrency: 'USD',
          maximumWholesaleMinor: 1000,
          retailCurrency: 'jpy',
          retailAmountMinor: 2000,
          providerMinorToRetailNumerator: 1,
          providerMinorToRetailDenominator: 1,
          providerFeeReserveRetailMinor: 100,
          minimumGrossMarginRetailMinor: 500,
          starterAgentPack: {
            id: 'lifeline',
            version: '1.0.0',
            packages: [{ packageKey, manifestSha256 }],
          },
        },
      ],
    }),
  );
  const pricing = await createEsimPricingSnapshot(catalog, catalog.plans[0]);
  const gatewayKey = 'b'.repeat(64);
  const config = {
    ESIM_CLOUD_ACCESS_POLICIES_JSON: JSON.stringify([
      {
        packageKey: pricing.plan.packageKey,
        manifestSha256: pricing.plan.manifestSha256,
        accessDurationDays: 60,
        scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
      },
    ]),
    ESIMGO_PLAN_CATALOG_JSON: JSON.stringify(catalog),
    ESIM_INSTALL_RECEIPT_KEYS: JSON.stringify([
      {
        issuerId: 'fixture-carrier',
        keyId: 'fixture-install-key',
        publicKeyHex: 'c'.repeat(64),
        status: 'active',
      },
    ]),
    ESIM_DEVICE_GATEWAY_KEYS: JSON.stringify([
      {
        authorityId: 'fixture-gateway',
        ownerUserId: owner,
        deviceRef: 'fixture-device',
        keyId: 'fixture-gateway-key',
        algorithm: 'Ed25519',
        publicKeyHex: gatewayKey,
        status: 'active',
      },
    ]),
  };
  function reviewedPackage(key, digest, publishedAt) {
    sqlite
      .prepare(`INSERT INTO sky_tool_packages
      (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
      VALUES (?,?,?,?,?,?,'verified',?,?,?)`)
      .run(
        key,
        key,
        '1.0.0',
        owner,
        JSON.stringify(manifest),
        digest,
        now,
        now,
        publishedAt,
      );
    sqlite
      .prepare(`INSERT INTO sky_tool_package_reviews
      (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
      VALUES (?,?,?,'fixture-reviewer','verified','[]','[]','synthetic fixture',?,?)`)
      .run(
        randomUUID(),
        key,
        digest,
        now,
        reviewDurationMs === null ? null : now + reviewDurationMs,
      );
  }
  reviewedPackage(packageKey, manifestSha256, now - 1);
  function order() {
    const id = randomUUID(),
      profileDigest = hash(id),
      receiptSha256 = hash(`entitlement-${id}`),
      installHash = hash(`install-${id}`);
    sqlite
      .prepare(`INSERT INTO sky_commerce_orders
      (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,commission_minor,refunded_minor,
      currency,account_id,offer_revision,terms_url,refund_policy,status,active_key,created_at,updated_at)
      VALUES (?,?,'seller','live',?,?,'Fixture',2000,0,0,'jpy','account',1,'https://example.invalid/terms','fixture','paid',NULL,?,?)`)
      .run(
        id,
        owner,
        pricing.plan.packageKey,
        pricing.plan.manifestSha256,
        now,
        now,
      );
    sqlite
      .prepare(`INSERT INTO esim_provider_orders
      (sky_order_id,provider,owner_user_id,package_key,manifest_sha256,pricing_snapshot_json,pricing_snapshot_sha256,
      provider_bundle_name,quote_digest,quote_total,quote_currency,state,provider_order_reference,profile_digest,created_at,updated_at)
      VALUES (?,'esim-go-v3',?,?,?,?,?,? ,?,'9','USD','profile_bound',?,?,?,?)`)
      .run(
        id,
        owner,
        pricing.plan.packageKey,
        pricing.plan.manifestSha256,
        pricing.canonicalJson,
        pricing.sha256,
        pricing.plan.providerBundleName,
        'd'.repeat(64),
        `provider-${id}`,
        profileDigest,
        now,
        now,
      );
    sqlite
      .prepare(`INSERT INTO esim_provider_profile_bindings
      (profile_digest,provider,owner_user_id,sky_order_id,package_key,manifest_sha256,created_at)
      VALUES (?,'esim-go-v3',?,?,?,?,?)`)
      .run(
        profileDigest,
        owner,
        id,
        pricing.plan.packageKey,
        pricing.plan.manifestSha256,
        now,
      );
    sqlite
      .prepare(`INSERT INTO esim_device_install_receipts
      (challenge_id,sky_order_id,owner_user_id,profile_digest,device_ref,issuer_id,key_id,receipt_sha256,evidence_source,observed_at,verified_at)
      VALUES (?,?,?,?,'fixture-device','fixture-carrier','fixture-install-key',?,'carrier_privileged',?,?)`)
      .run(randomUUID(), id, owner, profileDigest, installHash, now, now);
    sqlite
      .prepare(`INSERT INTO esim_device_entitlements
      (challenge_id,sky_order_id,owner_user_id,profile_digest,device_ref,install_receipt_sha256,authority_id,key_id,signature_algorithm,
      device_public_key_sha256,starter_pack_id,starter_pack_version,starter_pack_manifest_sha256,receipt_sha256,observed_at,activated_at)
      VALUES (?,?,?,?,'fixture-device',?,'fixture-gateway','fixture-gateway-key','Ed25519',?,'lifeline','1.0.0',?,?,?,?)`)
      .run(
        randomUUID(),
        id,
        owner,
        profileDigest,
        installHash,
        hash(Buffer.from(gatewayKey, 'hex')),
        hash(JSON.stringify(pricing.plan.starterAgentPack)),
        receiptSha256,
        now,
        now,
      );
    return id;
  }
  return {
    sqlite,
    db,
    config,
    owner,
    now,
    packageKey,
    manifestSha256,
    reviewedPackage,
    order,
    store: esimCloudAccessStore(db, config),
  };
}

function workRoute(f) {
  const route = loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), new Map([
    ['cloudflare:workers', { env: { ...f.config, ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'true' } }],
    ['@/lib/a2a-delegation-store', { a2aDelegationStore }],
    ['@/lib/fund-store', { database: () => f.db, requestUser }],
    ['@/lib/work-store', { workStore }],
    ['@/lib/rockstar-service-access', { rockstarServiceScopeAllowed, missingRockstarServiceScope }],
    ['@/lib/workflow', workflow],
  ]));
  return (owner = f.owner) => route.POST(new Request('https://rock.test/api/work-jobs', {
    method: 'POST', headers: { Origin: 'https://rock.test', 'oai-authenticated-user-id': owner,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ id: randomUUID(), templateId: 'article', title: 'Synthetic eSIM scope test' }),
  }));
}

void test('account scope finds the original eSIM key behind 100 newer keys for another scope', async t => {
  const f = await fixture(t);
  const policies = JSON.parse(f.config.ESIM_CLOUD_ACCESS_POLICIES_JSON);
  const scopes = values => { f.config.ESIM_CLOUD_ACCESS_POLICIES_JSON = JSON.stringify([{ ...policies[0], scopes: ['rockstaros_access', ...values] }]); };
  scopes(['zema']);
  const originalOrder = f.order(), original = await f.store.issue(f.owner, originalOrder, null, f.now);
  assert.equal((await workRoute(f)()).status, 201);
  scopes(['sky']);
  let latest;
  for (let index = 1; index <= 100; index++) latest = await f.store.issue(f.owner, f.order(), null, f.now + index);
  scopes(['sky', 'zema']);
  assert.equal(f.sqlite.prepare('SELECT COUNT(DISTINCT sky_order_id) AS n FROM esim_cloud_access_keys').get().n, 101);
  assert.equal(await f.store.authenticate(original.token, 'zema'), f.owner);
  await assert.rejects(f.store.authenticate(latest.token, 'zema'), /UNAUTHORIZED/);
  let checked = 0;
  const prepare = f.db.prepare.bind(f.db);
  t.mock.method(f.db, 'prepare', sql => { if (sql.includes('FROM sky_commerce_orders o')) checked++; return prepare(sql); });
  assert.equal(await f.store.hasScope(f.owner, 'zema'), true);
  assert.equal(checked, 1, 'unrelated scopes never consume the grant-validation budget');
  assert.equal((await workRoute(f)()).status, 201);
  assert.equal((await workRoute(f)('another-owner')).status, 403);
  assert.equal(await rockstarServiceScopeAllowed(f.db, f.owner, 'zema', 'true', f.config,
    new Request('https://rock.test/api/work-jobs', { headers: { authorization: `Bearer ${latest.token}` } })), false);
  assert.equal(await f.store.hasScope(f.owner, 'zema', original.expiresAt), false);

  scopes(['sky']);
  assert.equal(await f.store.hasScope(f.owner, 'zema'), false, 'current policy still restricts older credentials');
  scopes(['sky', 'zema']);
  f.sqlite.prepare('UPDATE sky_commerce_orders SET refunded_minor=1 WHERE id=?').run(originalOrder);
  assert.equal(await f.store.hasScope(f.owner, 'zema'), false, 'a partial refund removes service eligibility');
  f.sqlite.prepare('UPDATE sky_commerce_orders SET refunded_minor=0 WHERE id=?').run(originalOrder);
  assert.equal(await f.store.hasScope(f.owner, 'zema'), true);
  f.sqlite.prepare('UPDATE esim_device_entitlements SET device_ref=? WHERE sky_order_id=?').run('another-device', originalOrder);
  assert.equal(await f.store.hasScope(f.owner, 'zema'), false, 'install proof and key must bind the same device');
  f.sqlite.prepare('UPDATE esim_device_entitlements SET device_ref=? WHERE sky_order_id=?').run('fixture-device', originalOrder);
  await f.store.revoke(f.owner, originalOrder, original.id);
  assert.equal(await f.store.hasScope(f.owner, 'zema'), false);
});

void test('account scope reports an incomplete bounded check instead of denying an unseen valid key', async t => {
  const f = await fixture(t), original = await f.store.issue(f.owner, f.order(), null, f.now);
  const newer = [];
  for (let index = 1; index <= 100; index++) {
    const order = f.order(), key = await f.store.issue(f.owner, order, null, f.now + index);
    newer.push({ order, key });
    f.sqlite.prepare('UPDATE sky_commerce_orders SET refunded_minor=1 WHERE id=?').run(order);
  }
  assert.equal(await f.store.authenticate(original.token, 'zema'), f.owner);
  let checked = 0;
  const prepare = f.db.prepare.bind(f.db);
  t.mock.method(f.db, 'prepare', sql => { if (sql.includes('FROM sky_commerce_orders o')) checked++; return prepare(sql); });
  await assert.rejects(f.store.hasScope(f.owner, 'zema'), /CLOUD_ACCESS_SCOPE_CHECK_INCOMPLETE/);
  assert.equal(checked, 100);
  checked = 0;
  const response = await workRoute(f)();
  assert.equal(response.status, 503);
  assert.notEqual((await response.json()).code, 'SERVICE_ENTITLEMENT_REQUIRED');
  assert.equal(checked, 100);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 0);
  const last = newer.at(-1);
  await f.store.revoke(f.owner, last.order, last.key.id);
  checked = 0;
  assert.equal(await f.store.hasScope(f.owner, 'zema'), true);
  assert.equal(checked, 100, 'after explicit cleanup the last allowed candidate is validated');
  assert.equal((await workRoute(f)()).status, 201);
});

void test('valid cloud access survives unrelated newer registry publications while revoked pinned packages stop access', async (t) => {
  const f = await fixture(t),
    orderId = f.order();
  const issued = await f.store.issue(f.owner, orderId, null);
  const request = new Request('https://rock.test/api/work-jobs', {
    headers: { authorization: `Bearer ${issued.token}` },
  });
  assert.equal(
    await authenticateEsimCloudRequest(request, f.db, f.config),
    f.owner,
  );
  for (let i = 0; i < 200; i++)
    f.reviewedPackage(`newer-${i}`, hash(String(i)), f.now + i);
  assert.equal(
    (await skyToolPackageStore(f.db).listRegistry()).some(
      (item) => item.packageKey === f.packageKey,
    ),
    false,
  );
  assert.ok(
    await skyToolPackageStore(f.db).verifiedRegistryPackage(
      f.packageKey,
      f.manifestSha256,
    ),
  );
  assert.equal(
    await authenticateEsimCloudRequest(request, f.db, f.config),
    f.owner,
  );
  assert.equal(
    await rockstarServiceScopeAllowed(
      f.db,
      f.owner,
      'zema',
      'true',
      f.config,
      request,
    ),
    true,
  );
  assert.equal((await f.store.status(f.owner, orderId)).state, 'active');
  const replacement = await f.store.issue(f.owner, orderId, issued.id);
  await assert.rejects(
    f.store.authenticate(issued.token, 'zema'),
    /UNAUTHORIZED/,
  );
  assert.equal(await f.store.authenticate(replacement.token, 'zema'), f.owner);
  f.sqlite
    .prepare(
      "UPDATE sky_tool_packages SET status='revoked' WHERE package_key=?",
    )
    .run(f.packageKey);
  await assert.rejects(
    f.store.authenticate(replacement.token, 'zema'),
    /UNAUTHORIZED/,
  );
  assert.equal((await f.store.status(f.owner, orderId)).state, 'suspended');
});

void test('cloud management API preserves exact pins after registry growth and isolates owner readback', async (t) => {
  const f = await fixture(t),
    orderId = f.order(),
    call = cloudRoute(f);
  for (let i = 0; i < 201; i++)
    f.reviewedPackage(`newer-${i}`, hash(String(i)), f.now + i);
  const denied = await call(orderId, undefined, 'other-owner');
  assert.equal(denied.status, 404);
  const issued = await call(orderId, { action: 'issue' });
  assert.equal(issued.status, 201);
  const metadata = await issued.json(),
    cookie = issued.headers.get('set-cookie');
  assert.equal(metadata.state, 'active');
  assert.ok(cookie.includes('HttpOnly; SameSite=Strict'));
  assert.equal(JSON.stringify(metadata).includes('rock_esim_'), false);
  const serviceRequest = new Request('https://rock.test/api/work-jobs', {
    headers: { cookie: cookie.split(';')[0] },
  });
  assert.equal(
    await authenticateEsimCloudRequest(serviceRequest, f.db, f.config),
    f.owner,
  );
  assert.equal((await (await call(orderId)).json()).state, 'active');
  const revoked = await call(orderId, {
    action: 'revoke',
    expectedKeyId: metadata.key.id,
  });
  assert.equal(revoked.status, 200);
  await assert.rejects(
    authenticateEsimCloudRequest(serviceRequest, f.db, f.config),
    /UNAUTHORIZED/,
  );
});

void test('cloud rotation has one winner, never extends service expiry, and keeps revoked predecessors recoverable', async (t) => {
  const f = await fixture(t),
    orderId = f.order();
  const original = await f.store.issue(f.owner, orderId, null, f.now);
  const expiry = (await f.store.status(f.owner, orderId, f.now))
    .accessExpiresAt;
  const outcomes = await Promise.allSettled([
    f.store.issue(f.owner, orderId, original.id, f.now + 1),
    f.store.issue(f.owner, orderId, original.id, f.now + 1),
  ]);
  assert.equal(
    outcomes.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const winner = outcomes.find((result) => result.status === 'fulfilled').value;
  assert.match(
    outcomes.find((result) => result.status === 'rejected').reason.message,
    /CLOUD_ACCESS_CONFLICT/,
  );
  await assert.rejects(
    f.store.authenticate(original.token, 'zema', f.now + 2),
    /UNAUTHORIZED/,
  );
  assert.equal(
    await f.store.authenticate(winner.token, 'zema', f.now + 2),
    f.owner,
  );
  assert.equal(
    (await f.store.status(f.owner, orderId, f.now + 2)).accessExpiresAt,
    expiry,
  );
  await f.store.revoke(f.owner, orderId, winner.id, f.now + 3);
  await f.store.revoke(f.owner, orderId, winner.id, f.now + 4);
  await assert.rejects(
    f.store.authenticate(winner.token, 'zema', f.now + 5),
    /UNAUTHORIZED/,
  );
  assert.equal(
    (await f.store.status(f.owner, orderId, f.now + 5)).key.id,
    winner.id,
  );
  const recovered = await f.store.issue(
    f.owner,
    orderId,
    winner.id,
    expiry - 1000,
  );
  assert.equal(recovered.expiresAt, expiry);
  assert.equal(
    await f.store.authenticate(recovered.token, 'zema', expiry - 1),
    f.owner,
  );
  await assert.rejects(
    f.store.authenticate(recovered.token, 'zema', expiry),
    /UNAUTHORIZED/,
  );
  await assert.rejects(
    f.store.issue(f.owner, orderId, recovered.id, expiry),
    /CLOUD_ACCESS_NOT_ELIGIBLE/,
  );
});

void test('pinned package lookup rejects wrong hashes and altered manifests', async (t) => {
  const f = await fixture(t),
    orderId = f.order();
  const issued = await f.store.issue(f.owner, orderId, null);
  const original = f.sqlite
    .prepare('SELECT manifest FROM sky_tool_packages WHERE package_key=?')
    .get(f.packageKey).manifest;
  for (const mutation of ['hash', 'manifest']) {
    if (mutation === 'hash')
      f.sqlite
        .prepare(
          'UPDATE sky_tool_packages SET manifest_sha256=? WHERE package_key=?',
        )
        .run('f'.repeat(64), f.packageKey);
    if (mutation === 'manifest')
      f.sqlite
        .prepare('UPDATE sky_tool_packages SET manifest=? WHERE package_key=?')
        .run(
          JSON.stringify({
            ...JSON.parse(original),
            name: 'Unreviewed change',
          }),
          f.packageKey,
        );
    await assert.rejects(
      f.store.authenticate(issued.token, 'zema'),
      /UNAUTHORIZED/,
    );
    f.sqlite
      .prepare(
        'UPDATE sky_tool_packages SET manifest_sha256=?,manifest=? WHERE package_key=?',
      )
      .run(f.manifestSha256, original, f.packageKey);
    assert.equal(await f.store.authenticate(issued.token, 'zema'), f.owner);
  }
});

void test('pinned package lookup rechecks review expiry on every cloud use', async (t) => {
  const f = await fixture(t, { reviewDurationMs: 60_000 }),
    orderId = f.order();
  const issued = await f.store.issue(f.owner, orderId, null);
  assert.equal(await f.store.authenticate(issued.token, 'zema'), f.owner);
  t.mock.method(Date, 'now', () => f.now + 60_001);
  await assert.rejects(
    f.store.authenticate(issued.token, 'zema'),
    /UNAUTHORIZED/,
  );
  assert.equal((await f.store.status(f.owner, orderId)).state, 'suspended');
});

void test('exact package lookup deduplicates catalogue pins and bounds D1 parameters', async (t) => {
  const f = await fixture(t),
    pins = [];
  for (let index = 0; index < 85; index++) {
    const pin = {
      packageKey: `catalogue-${index}`,
      manifestSha256: hash(String(index)),
    };
    f.reviewedPackage(pin.packageKey, pin.manifestSha256, f.now + index);
    pins.push(pin);
  }
  const counts = [];
  const boundedDb = {
    prepare(sql) {
      const prepared = f.db.prepare(sql);
      return {
        bind(...values) {
          counts.push(values.length);
          assert.ok(values.length <= 100, 'D1 SQL variable limit');
          return prepared.bind(...values);
        },
      };
    },
  };
  const packages = await skyToolPackageStore(
    boundedDb,
  ).verifiedRegistryPackages([...pins, ...pins]);
  assert.equal(packages.length, pins.length);
  assert.equal(
    new Set(packages.map((item) => item.packageKey)).size,
    pins.length,
  );
  assert.deepEqual(counts, [81, 81, 11]);
  assert.equal(
    packages.some((item) => item.packageKey === f.packageKey),
    false,
  );
});

void test('revoking another eSIM order does not erase this browser active cloud credential', async (t) => {
  const f = await fixture(t),
    orderA = f.order(),
    orderB = f.order(),
    call = cloudRoute(f);
  const a = await f.store.issue(f.owner, orderA, null);
  const b = await f.store.issue(f.owner, orderB, null);
  const cookieB = `rock_esim_access=${b.token}`;
  const response = await call(
    orderA,
    { action: 'revoke', expectedKeyId: a.id },
    f.owner,
    { cookie: cookieB },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  await assert.rejects(f.store.authenticate(a.token, 'zema'), /UNAUTHORIZED/);
  assert.equal(
    await authenticateEsimCloudRequest(
      new Request('https://rock.test/api/work-jobs', {
        headers: { cookie: cookieB },
      }),
      f.db,
      f.config,
    ),
    f.owner,
  );
  const own = await call(
    orderB,
    { action: 'revoke', expectedKeyId: b.id },
    f.owner,
    { cookie: cookieB },
  );
  assert.equal(own.status, 200);
  assert.match(own.headers.get('set-cookie'), /Max-Age=0/);
});

void test('issuance response never couples a replaced cookie to newer key metadata', async (t) => {
  const f = await fixture(t),
    orderId = f.order();
  let replacement;
  const racedDb = {
    prepare: (sql) => f.db.prepare(sql),
    async batch(statements) {
      const result = await f.db.batch(statements);
      if (!replacement) {
        const current = await f.store.status(f.owner, orderId);
        replacement = await f.store.issue(f.owner, orderId, current.key.id);
      }
      return result;
    },
  };
  const response = await cloudRoute({ ...f, db: racedDb })(orderId, {
    action: 'issue',
  });
  assert.equal(response.status, 409);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await response.json()).error, 'CLOUD_ACCESS_CONFLICT');
  assert.equal(await f.store.authenticate(replacement.token, 'zema'), f.owner);
});
