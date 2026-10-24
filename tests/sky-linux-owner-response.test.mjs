import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { loadRouteFixture } from './route-fixture.mjs';
import { linuxServiceStore } from '../lib/sky-linux-service-store.ts';
import * as linux from '../lib/sky-linux-service.ts';
import { sha256Hex } from '../lib/rockstar-entitlement-claim.ts';
import { createServiceSetup, acceptServiceSetup } from '../lib/rockstar-service-setup.ts';

const sha = 'a'.repeat(64);
const terms = { schema: 'sky.linux-terms/1', version: 'response-fixture', currency: 'USD',
  baseMinor: 1600, cpuUnitMs: 1000, cpuUnitMinor: 1, includedCpuMs: 1000,
  monthlyCapMinor: 2000, graceDays: 3, leaseSeconds: 30, retentionDays: 90,
  termsUrl: 'https://example.test/fixture-terms' };
const model = { schema: 'sky.local-model/1', id: 'fixture.model', name: 'Fixture',
  repository: 'fixture/model', revision: 'b'.repeat(40), file: 'model.gguf', sha256: sha,
  bytes: 1024, license: 'MIT', promptFormat: 'chatml', memoryMiB: 2048 };

// SQL is executed by SQLite, including final predicates and actual committing batches.
// Hooks schedule server-side races; they are not request authority or SQL mocks.
function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql') && !n.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
  const db = { sqlite, beforeRead: null, afterCommit: null, afterRun: null, batches: 0, writes: 0 };
  class Statement {
    constructor(sql, values = []) { this.sql = sql; this.values = values; }
    bind(...values) { return new Statement(this.sql, values); }
    async first() { await db.beforeRead?.(this); return sqlite.prepare(this.sql).get(...this.values) ?? null; }
    async all() { await db.beforeRead?.(this); return { results: sqlite.prepare(this.sql).all(...this.values) }; }
    async run() {
      const statement = sqlite.prepare(this.sql);
      if (statement.columns().length) return { results: statement.all(...this.values), meta: { changes: 0 } };
      const result = statement.run(...this.values); db.writes++;
      await db.afterRun?.(this);
      return { meta: { changes: Number(result.changes) } };
    }
  }
  db.prepare = sql => new Statement(sql);
  db.batch = async statements => {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec('COMMIT'); db.batches++; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    const hook = db.afterCommit; db.afterCommit = null; await hook?.();
    return [];
  };
  return db;
}
function request(body, { owner = 'buyer', origin = 'https://fixture.invalid' } = {}) {
  return new Request('https://fixture.invalid/api/sky/linux', { method: body ? 'POST' : 'GET',
    headers: { ...(owner ? { authorization: owner } : {}), origin }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function routeFor(f, store = f.store) {
  return loadRouteFixture(new URL('../app/api/sky/linux/route.ts', import.meta.url), new Map([
    ['cloudflare:workers', { env: f.config }],
    ['@/lib/fund-store', { database: () => f.db, requestUser: async req => {
      const owner = req.headers.get('authorization'); if (!owner) throw Error('UNAUTHORIZED');
      if (req.headers.get('origin') !== new URL(req.url).origin) throw Error('ORIGIN');
      return owner;
    } }],
    ['@/lib/sky-developer-auth', { requestDeveloperUser: async () => 'buyer' }],
    ['@/lib/sky-linux-service-store', { linuxServiceStore: () => store }],
    ['@/lib/sky-linux-service', linux],
    ['@/lib/rockstar-entitlement-claim', { sha256Hex }],
  ]));
}
async function fixture(t) {
  const db = database(t), stamp = Date.now();
  const w = await linux.createLinuxWorkspace('buyer', 'device', 'order', terms, 'live', stamp);
  w.serviceStartAt = stamp; w.issuer = { sequence: 1, state: 'active', validUntil: stamp + 60_000 };
  const listing = await linux.makeLinuxListing({ id: 'fixture.agent', packageKey: 'fixture@1',
    packageSha256: sha, creatorId: 'creator', model,
    agent: { name: 'Fixture', instructions: 'Make a plan', modelId: model.id }, authorFeeMinor: 100 });
  w.attachments.push(listing.id);
  const key = 'workspace:' + await sha256Hex('buyer');
  const insert = (id, owner, kind, payload) => db.sqlite.prepare('INSERT INTO sky_linux_service_documents VALUES(?,?,?,0,?,?)')
    .run(id, owner, kind, JSON.stringify(payload), stamp);
  insert(key, 'buyer', 'workspace', w);
  insert('listing:' + listing.id, 'creator', 'listing', listing);
  insert('review:' + listing.id, 'reviewer', 'review', { listingId: listing.id, digest: listing.digest,
    decision: 'approved', expiresAt: stamp + 60_000, reviewerId: 'reviewer', reviewedAt: stamp });
  db.sqlite.prepare(`INSERT INTO sky_tool_packages(package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES(?,'fixture','1','creator','{}',?,'verified',?,?,?)`).run(listing.packageKey, sha, stamp, stamp, stamp);
  db.sqlite.prepare(`INSERT INTO sky_tool_package_reviews(id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES('fixture-review',?,?,'reviewer','verified','{}','{}','fixture',?,?)`).run(listing.packageKey, sha, stamp, stamp + 60_000);
  let setup = await createServiceSetup('buyer', 'order', 'device', terms, stamp);
  setup = await acceptServiceSetup(setup, setup.quoteDigest, true, true, stamp);
  setup.workspaceId = w.id; setup.billing.verifiedAt = stamp;
  setup.runtime.verifiedAt = stamp; setup.runtime.receiptDigest = sha;
  db.sqlite.prepare('INSERT INTO rockstar_service_setups VALUES(?,?,0,?,?)').run('setup', 'buyer', JSON.stringify(setup), stamp);
  const config = { SKY_LINUX_SERVICE_ENABLED: 'true', SKY_LINUX_SERVICE_TERMS_JSON: JSON.stringify(terms),
    ROCKSTAR_SERVICE_SETUP_ENABLED: 'true', ROCKSTAR_OS_SERVICE_ACCEPTANCE_JSON: JSON.stringify({
      schema: 'rockstar.os-service-acceptance/1', model: 'Pixel 10', sku: 'GL066', codename: 'frankel',
      status: 'accepted', buildId: 'fixture', evidenceSha256: sha,
      capabilities: ['owner_auth', 'entitlement', 'permissions_budget', 'private_storage_recovery', 'sky_eve_entry'] }) };
  const store = linuxServiceStore(db, config, { grant: async (_db, _config, owner, order, at) => ({
    ownerUserId: owner, orderId: order, deviceRef: 'device', receiptSha256: sha,
    expiresAt: at + 60_000, scopes: ['agents'], starterAgentPack: { packages: [] } }) });
  const raw = () => db.sqlite.prepare('SELECT * FROM sky_linux_service_documents WHERE id=?').get(key);
  const edit = mutate => { const payload = JSON.parse(raw().payload); mutate(payload);
    db.sqlite.prepare('UPDATE sky_linux_service_documents SET payload=? WHERE id=?').run(JSON.stringify(payload), key); };
  const command = { action: 'run', listingId: listing.id, requestId: randomUUID(), input: 'private fixture input',
    maximumMinor: 120, cpuLimitMs: 1000, accepted: true, revision: 0 };
  const snapshot = () => ['sky_linux_service_documents', 'work_jobs', 'sky_linux_service_receipts']
    .map(table => db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
  return { db, store, stamp, w, listing, key, config, command, raw, edit, snapshot };
}
function noBody(body) {
  assert.equal(body.workspace, null);
  assert.equal(body.currentMonthMaximumMinor ?? null, null);
  assert.notEqual(body.access?.canRead, true);
  assert.ok(!JSON.stringify(body).includes('private fixture input'));
}
const attacks = {
  rebind: f => f.db.sqlite.prepare("UPDATE sky_linux_service_documents SET owner_user_id='foreign' WHERE id=?").run(f.key),
  delete: f => f.db.sqlite.prepare('DELETE FROM sky_linux_service_documents WHERE id=?').run(f.key),
  'payload-owner': f => f.edit(w => { w.ownerId = 'foreign'; }),
  revision: f => f.db.sqlite.prepare('UPDATE sky_linux_service_documents SET revision=revision+1 WHERE id=?').run(f.key),
  'payload-without-revision': f => f.edit(w => { w.proofSalt += '-replaced'; }),
  'exact-bytes': f => f.db.sqlite.prepare("UPDATE sky_linux_service_documents SET payload=' '||payload WHERE id=?").run(f.key),
};

void test('owner response: actual GET fences owner deletion/rebind and exact saved version races without writes', async t => {
  for (const [name, attack] of Object.entries(attacks)) await t.test(name, async child => {
    const f = await fixture(child); let reads = 0, attacked;
    f.db.beforeRead = statement => {
      if (statement.sql.startsWith('SELECT') && statement.values[0] === f.key && ++reads === 2) {
        attack(f); attacked = f.snapshot();
      }
    };
    const response = await routeFor(f).GET(request());
    assert.equal(response.status, 200); noBody(await response.json());
    assert.equal(reads, 2); assert.deepEqual(f.snapshot(), attacked);
    assert.equal(f.db.writes, 0); assert.equal(f.db.batches, 0);
  });
});

void test('owner response: positive retained owner bytes survive execution restrictions; foreign/auth/origin stay denied', async t => {
  const cases = {
    active: () => {},
    suspended: f => f.edit(w => { w.issuer.state = 'suspended'; }),
    expired: f => f.edit(w => { w.issuer.validUntil = 0; }),
    'broken-setup': f => f.db.sqlite.prepare("UPDATE rockstar_service_setups SET payload='{}'").run(),
    'unknown-dispatch': f => f.edit(w => { w.schema = 'unknown/9'; }),
    'broken-billing': f => f.edit(w => { delete w.invoices; }),
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, async child => {
    const f = await fixture(child); mutate(f); const before = f.snapshot(), expected = f.raw().payload;
    const response = await routeFor(f).GET(request()), body = await response.json();
    assert.equal(response.status, 200); assert.equal(JSON.stringify(body.workspace.payload), expected);
    assert.equal(body.access.canRead, true); assert.equal(body.access.canExport, true);
    assert.equal(body.access.canExecute, name === 'active');
    assert.deepEqual(f.snapshot(), before); assert.equal(f.db.writes, 0);
  });
  const f = await fixture(t), before = f.snapshot(), route = routeFor(f);
  for (const [options, status] of [[{ owner: null }, 401], [{ origin: 'https://foreign.invalid' }, 403]]) {
    const response = await route.GET(request(null, options)); assert.equal(response.status, status);
    assert.equal((await response.json()).workspace, undefined);
  }
  const foreign = await route.GET(request(null, { owner: 'foreign' })); noBody(await foreign.json());
  assert.deepEqual(f.snapshot(), before);
});

void test('owner response: successful run followed by owner rebind returns acceptance only, recovers without another reservation', async t => {
  const f = await fixture(t), route = routeFor(f); let committed;
  f.db.afterCommit = () => { committed = f.raw(); attacks.rebind(f); };
  const response = await route.POST(request(f.command)), body = await response.json();
  assert.equal(response.status, 200); noBody(body);
  assert.equal(body.accepted, true); assert.equal(body.revision, 1); assert.equal(body.reconciliation, 'refresh_required');
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n, 1);
  assert.equal(JSON.parse(f.raw().payload).jobs[0].reservedMinor, 120);
  assert.equal(f.raw().payload, committed.payload);
  f.db.sqlite.prepare("UPDATE sky_linux_service_documents SET owner_user_id='buyer' WHERE id=?").run(f.key);
  const snapshot = f.snapshot(), recovered = await (await route.GET(request())).json();
  assert.equal(recovered.workspace.revision, 1);
  const retry = await (await route.POST(request({ ...f.command, revision: 1 }))).json();
  assert.equal(retry.workspace.revision, 1); assert.equal(retry.workspace.payload.jobs.length, 1);
  assert.deepEqual(f.snapshot(), snapshot);
});

void test('owner response: every public workspace mutation withholds stale after-commit bodies without replaying the mutation', async t => {
  for (const action of ['accept', 'add', 'cancel', 'confirm']) await t.test(action, async child => {
    const f = await fixture(child); let command;
    if (action === 'accept') {
      f.db.sqlite.prepare('DELETE FROM sky_linux_service_documents WHERE id=?').run(f.key);
      command = { action, orderId: 'order', deviceRef: 'device', accepted: true,
        termsDigest: await sha256Hex(JSON.stringify(terms)) };
      f.db.afterRun = statement => {
        if (statement.sql.includes("'workspace',0") && statement.sql.startsWith('INSERT')) {
          f.db.afterRun = null; attacks.rebind(f);
        }
      };
    } else if (action === 'add') {
      f.edit(w => { w.attachments = []; }); command = { action, listingId: f.listing.id, revision: 0 };
    } else {
      let saved = await f.store.command('buyer', 0, f.command, f.stamp);
      if (action === 'confirm') {
        saved = await f.store.command('buyer', saved.revision,
          { action: 'claim', jobId: f.command.requestId, claimId: 'fixture-claim' }, f.stamp, true);
        const job = saved.payload.jobs[0];
        saved = await f.store.event({ schema: 'sky.linux-event/1', id: randomUUID(),
          workspaceId: saved.payload.id, issuedAt: f.stamp, kind: 'result', payload: {
            jobId: job.id, claimId: job.claimId, contractDigest: saved.payload.contractDigest,
            listingDigest: job.listing.digest, inputSha256: job.inputSha256, outcome: 'succeeded',
            meter: 'linux-wait4-child-cpu/1', cpuMs: 1000, durationMs: 1000, text: 'private fixture input result' } }, f.stamp);
      }
      command = { action, revision: saved.revision, jobId: f.command.requestId };
    }
    if (action !== 'accept') f.db.afterCommit = () => attacks['payload-without-revision'](f);
    const batches = f.db.batches, response = await routeFor(f).POST(request(command)), body = await response.json();
    assert.equal(response.status, action === 'accept' ? 201 : 200); noBody(body);
    assert.equal(body.accepted, true); assert.equal(body.reconciliation, 'refresh_required');
    assert.equal(f.db.batches - batches, action === 'accept' ? 0 : 1);
    const stored = JSON.parse(f.raw().payload);
    assert.equal(stored.jobs.length, ['cancel', 'confirm'].includes(action) ? 1 : 0);
    if (action === 'cancel') assert.equal(stored.jobs[0].state, 'cancelled');
    if (action === 'confirm') assert.equal(stored.jobs[0].state, 'completed');
    if (action === 'add') assert.deepEqual(stored.attachments, [f.listing.id]);
    const before = f.snapshot();
    if (action === 'accept') f.db.sqlite.prepare("UPDATE sky_linux_service_documents SET owner_user_id='buyer' WHERE id=?").run(f.key);
    const recovered = await (await routeFor(f).GET(request())).json();
    assert.equal(JSON.stringify(recovered.workspace.payload), f.raw().payload);
    if (action !== 'accept') assert.deepEqual(f.snapshot(), before);
  });
});

void test('owner response: unknown/null/denied/throwing projection never serializes a fallback body or private totals', async t => {
  const f = await fixture(t), before = f.snapshot();
  // These are route defensive controls, separate from the real DB races above.
  for (const value of [null, {}, { workspace: await f.store.get('buyer'), access: null },
    { workspace: await f.store.get('buyer'), access: { canRead: false } },
    { workspace: await f.store.get('buyer'), access: { canRead: 'true' } }]) {
    const route = routeFor(f, { ...f.store, ownerResponse: async () => value });
    noBody(await (await route.GET(request())).json());
  }
  const throwing = routeFor(f, { ...f.store, ownerResponse: async () => { throw Error('unknown private state'); } });
  noBody(await (await throwing.GET(request())).json());
  const body = await (await throwing.POST(request(f.command))).json();
  noBody(body); assert.equal(body.accepted, true); assert.equal(body.revision, 1);
  assert.equal(body.reconciliation, 'refresh_required');
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n, 1);
  assert.notDeepEqual(f.snapshot(), before);
});

void test('owner response: final saved-version query failure denies HTTP body; restored owner read writes nothing', async t => {
  const f = await fixture(t), before = f.snapshot(); let reads = 0;
  f.db.beforeRead = statement => {
    if (statement.values[0] === f.key && ++reads === 2) throw Error('current read unavailable');
  };
  noBody(await (await routeFor(f).GET(request())).json());
  f.db.beforeRead = null;
  const restored = await (await routeFor(f).GET(request())).json();
  assert.equal(JSON.stringify(restored.workspace.payload), f.raw().payload);
  assert.deepEqual(f.snapshot(), before); assert.equal(f.db.writes, 0);
});

void test('owner response: actual local D1 owner/version/byte predicates withhold races and preserve stored data',
  { skip: process.env.ESIM_OWNER_RESPONSE_D1 !== '1' }, async () => {
    const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
    const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, host: '127.0.0.1', port: 0,
      script: 'export default {fetch(){return new Response("local owner response fixture")}}',
      compatibilityDate: '2026-08-18', d1Databases: ['DB'] }));
    try {
      const db = await mf.getD1Database('DB');
      for (const sql of readFileSync(new URL('../drizzle/0030_sky_linux_service.sql', import.meta.url), 'utf8').split('--> statement-breakpoint'))
        await db.prepare(sql.trim()).run();
      const now = Date.now(), key = 'workspace:' + await sha256Hex('buyer');
      const w = await linux.createLinuxWorkspace('buyer', 'device', 'order', terms, 'live', now);
      w.proofSalt += ' 日本語 😀\u2028 literal quote "';
      const raw = JSON.stringify(w);
      const reset = async () => {
        await db.prepare('DELETE FROM sky_linux_service_documents').run();
        await db.prepare("INSERT INTO sky_linux_service_documents VALUES(?,'buyer','workspace',0,?,?)").bind(key, raw, now).run();
      };
      await reset();
      const store = linuxServiceStore(db, {}), positive = await store.ownerResponse('buyer');
      assert.equal(JSON.stringify(positive.workspace.payload), raw);
      assert.equal(positive.access.canRead, true); assert.equal(positive.access.canExecute, false);
      assert.equal((await store.ownerResponse('foreign')).workspace, null);
      const mutations = [
        "UPDATE sky_linux_service_documents SET owner_user_id='foreign'",
        'DELETE FROM sky_linux_service_documents',
        'UPDATE sky_linux_service_documents SET revision=revision+1',
        "UPDATE sky_linux_service_documents SET payload=json_set(payload,'$.proofSalt','replacement')",
        "UPDATE sky_linux_service_documents SET payload=' '||payload",
      ];
      for (const sql of mutations) {
        await reset(); let witness = false;
        const adapter = { batch: db.batch.bind(db), prepare(query) {
          const wrap = statement => ({ bind: (...values) => wrap(statement.bind(...values)),
            first: async () => {
              if (query.includes('payload COLLATE BINARY')) { await db.prepare(sql).run(); witness = true; }
              return statement.first();
            } });
          return wrap(db.prepare(query));
        } };
        const denied = await linuxServiceStore(adapter, {}).ownerResponse('buyer');
        assert.equal(witness, true); assert.deepEqual(denied, { workspace: null, access: null });
        assert.equal((await db.prepare('SELECT count(*) n FROM sky_linux_service_receipts').first()).n, 0);
        // Only the deliberately scheduled authority mutation occurred; projection is read-only.
        const row = await db.prepare('SELECT * FROM sky_linux_service_documents').first();
        assert.equal(row?.payload ?? null, sql.includes('DELETE') ? null : sql.includes('json_set')
          ? JSON.stringify({ ...w, proofSalt: 'replacement' }) : sql.includes("' '||payload") ? ' ' + raw : raw);
      }
      await reset();
      assert.equal(JSON.stringify((await store.ownerResponse('buyer')).workspace.payload), raw);
    } finally { await mf.dispose(); }
  });

void test('owner response: denied public disclosure does not block signed executor status or late CPU-once receipts', async t => {
  const f = await fixture(t);
  let saved = await f.store.command('buyer', 0, f.command, f.stamp);
  saved = await f.store.command('buyer', saved.revision,
    { action: 'claim', jobId: f.command.requestId, claimId: 'signed-claim' }, f.stamp, true);
  saved = await f.store.event({ schema: 'sky.linux-event/1', id: randomUUID(), workspaceId: saved.payload.id,
    issuedAt: f.stamp, kind: 'issuer', payload: { sequence: 2, orderId: 'order', deviceRef: 'device',
      state: 'suspended', validUntil: f.stamp } }, f.stamp);
  saved = await f.store.command('buyer', saved.revision, { action: 'cancel', jobId: f.command.requestId }, f.stamp);
  f.db.beforeRead = statement => { if (statement.sql.includes('payload COLLATE BINARY')) throw Error('read unavailable'); };
  noBody(await (await routeFor(f).GET(request())).json());
  const pair = generateKeyPairSync('ed25519'), key = { id: 'fixture-meter', role: 'worker', mode: 'live',
    workspaceId: saved.payload.id, ownerId: 'buyer',
    publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url') };
  f.config.SKY_LINUX_EVENT_KEYS_JSON = JSON.stringify([key]);
  f.config.ROCKSTAR_SERVICE_SETUP_ENABLED = 'false';
  const internal = loadRouteFixture(new URL('../app/api/internal/sky/linux/route.ts', import.meta.url), new Map([
    ['cloudflare:workers', { env: f.config }], ['@/lib/fund-store', { database: () => f.db }],
    ['@/lib/sky-linux-service-store', { linuxServiceStore: () => f.store }],
    ['@/lib/sky-linux-service', linux],
    ['@/lib/rockstar-service-setup-store', { serviceSetupStore: () => { throw Error('unexpected setup path'); } }],
  ]));
  const post = value => internal.POST(new Request('https://fixture.invalid/api/internal/sky/linux', {
    method: 'POST', body: JSON.stringify(value) }));
  const worker = { schema: 'sky.linux-worker-request/1', workspaceId: saved.payload.id,
    issuedAt: Date.now(), action: 'status' };
  const workerEnvelope = { keyId: key.id, request: worker, signature: sign(null,
    Buffer.from('sky.linux-worker-request/1:live:' + JSON.stringify(worker)), pair.privateKey).toString('base64url') };
  const status = await post(workerEnvelope);
  assert.equal(status.status, 200); assert.equal((await status.json()).workspace.revision, saved.revision);
  const job = saved.payload.jobs[0], result = { schema: 'sky.linux-event/1', id: randomUUID(),
    workspaceId: saved.payload.id, issuedAt: Date.now(), kind: 'result', payload: {
      jobId: job.id, claimId: job.claimId, contractDigest: saved.payload.contractDigest,
      listingDigest: job.listing.digest, inputSha256: job.inputSha256, outcome: 'succeeded',
      meter: 'linux-wait4-child-cpu/1', cpuMs: 1000, durationMs: 1000, text: 'late private output' } };
  const envelope = { keyId: key.id, event: result, signature: sign(null,
    Buffer.from('sky.linux-event-signature/1:live:' + JSON.stringify(result)), pair.privateKey).toString('base64url') };
  const before = f.db.sqlite.prepare('SELECT count(*) n FROM sky_linux_service_receipts').get().n;
  for (let retry = 0; retry < 2; retry++) {
    const response = await post(envelope); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accepted: true });
  }
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM sky_linux_service_receipts').get().n, before + 1);
  const settled = (await f.store.get('buyer')).payload.jobs[0];
  assert.equal(settled.cpuMs, 1000); assert.equal(settled.authorMinor, 0); assert.equal(settled.state, 'cancelled');
  const snapshot = f.snapshot();
  assert.equal((await post({ ...envelope, event: { ...result, payload: { ...result.payload, cpuMs: 999 } } })).status, 409);
  assert.deepEqual(f.snapshot(), snapshot);
});
