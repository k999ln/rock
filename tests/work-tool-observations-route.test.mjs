import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadRouteFixture } from './route-fixture.mjs';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
import * as auth from '../lib/request-auth.ts';
import { createSkyToolPackageDraft, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { workToolExecutionReviewDigest, storedWorkToolExecutionReview } from '../lib/workflow.ts';
import { skyPackageSchemaSha256 } from '../lib/sky-package-runtime.ts';

async function setup(t, persistent = false, authorityAvailable = true, reviewExpiresAt = null) {
  const dir = persistent ? mkdtempSync(join(tmpdir(), 'work-attempt-test-')) : null;
  const dbPath = dir ? join(dir, 'fixture.sqlite') : ':memory:';
  const sqlite = new DatabaseSync(dbPath); t.after(() => { sqlite.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql') && !f.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { beforeRun: null, afterRun: null, sqlForTest: null, prepare(sql) {
    const statement = db.sqlForTest ? db.sqlForTest(sql) : sql;
    return { bind(...args) { return {
    async first() { return sqlite.prepare(statement).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(statement).all(...args) }; },
    async run() { db.beforeRun?.(sql, args); const changes = Number(sqlite.prepare(statement).run(...args).changes); db.afterRun?.(sql, args); return { meta: { changes } }; },
  }; } }; } };
  const ownerId = authorityAvailable === 'real' ? 'local-preview:fixture' : 'alice';
  const baseOrigin = authorityAvailable === 'real' ? 'http://localhost:3000' : 'https://fixture.invalid';
  const config = { ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID: ownerId, ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' };
  const realGate = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/authority.ts', import.meta.url), new Map([['cloudflare:workers', { env: config }], ['@/lib/request-auth', auth]]));
  const dependencies = new Map([
    ['@/app/api/work-jobs/tool-observations/authority', authorityAvailable === 'real' ? realGate : { dispatchAuthorityAvailable: () => authorityAvailable }],
    ['cloudflare:workers', { env: { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' } }],
    ['@/lib/fund-store', { database: () => db, requestUser: auth.requestUser }],
  ]);
  for (const name of ['bounded-stream', 'owner-intent', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library-store', 'sky-tool-package', 'sky-package-runtime'])
    dependencies.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
  const work = loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), dependencies);
  const observations = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/route.ts', import.meta.url), dependencies);
  const claims = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/claim/route.ts', import.meta.url), dependencies);
  async function call(route, method, payload, { owner = ownerId, scope, origin = baseOrigin } = {}) {
    const response = await route[method](new Request(`${baseOrigin}/api/work-jobs${route === observations ? '/tool-observations' : route === claims ? '/tool-observations/claim' : ''}`, {
      method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(owner ? { 'oai-authenticated-user-id': owner } : {}),
        ...(scope === undefined ? {} : { 'X-Rock-Owner-Scope': scope }) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(payload) }),
    }));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: await response.json() };
  }
  const role = await skyAgentLibraryStore(db, ownerId).save(randomUUID(), 0, { ...defaultSkyAgentSettings('独立fixture担当', '本人入力'), requirements: { inputFields: [], outputFields: [], packageKey: 'dev.fixture.counter@1.0.0', executionTarget: 'pc' } }, true);
  const created = await call(work, 'POST', { id: randomUUID(), title: '保存済みの同じ仕事', templateId: 'article',
    agentRef: { id: role.id, revision: role.revision } });
  assert.equal(created.status, 201);
  const scope = (await call(work, 'GET')).body.ownerScope;
  const manifest = createSkyToolPackageDraft({ sourceKind: 'github', sourceUrl: 'https://github.com/fixture/counter', developerName: 'Fixture', developerId: 'fixture', license: 'MIT', version: '1.0.0' });
  const manifestSha256 = await skyToolPackageSha256(manifest);
  const inputSchemaSha256 = await skyPackageSchemaSha256(manifest.io.inputSchema);
  const outputSchemaSha256 = await skyPackageSchemaSha256(manifest.io.outputSchema);
  // Test-only verified registry row and review; this is not a production trust assertion.
  sqlite.prepare(`INSERT INTO sky_tool_packages (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run('dev.fixture.counter@1.0.0', 'dev.fixture.counter', '1.0.0', 'fixture-author', JSON.stringify(manifest), manifestSha256, 'verified', Date.now(), Date.now(), Date.now());
  const review = typeof reviewExpiresAt === 'function' ? reviewExpiresAt(sqlite)
    : { reviewedAt: Date.now(), expiresAt: reviewExpiresAt };
  sqlite.prepare(`INSERT INTO sky_tool_package_reviews (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), 'dev.fixture.counter@1.0.0', manifestSha256, 'fixture-reviewer', 'verified', '{}', '{}', '', review.reviewedAt, review.expiresAt);
  const attempt = () => ({ id: randomUUID(), packageKey: 'dev.fixture.counter@1.0.0', manifestSha256,
    connectorId: 'fixture-connector', toolName: 'count', inputSha256: 'b'.repeat(64) });
  const result = () => ({ id: randomUUID(), text: '合成した結果: 3' });
  const begin = (jobId, revision, value, opts = {}) => call(observations, 'POST', { action: 'begin', jobId, revision, attempt: value }, { scope, ...opts });
  const observe = (jobId, revision, attemptId, value, opts = {}) => call(observations, 'POST',
    { action: 'observe', jobId, revision, attemptId, observation: value }, { scope, ...opts });
  const claim = (jobId, spec, capability, patch = {}) => call(claims, 'POST', {
    jobId, attemptId: spec.id, agentId: role.id, agentRevision: role.revision, ownerScope: scope,
    inputSha256: spec.inputSha256, connectorId: spec.connectorId, toolName: spec.toolName, token: capability.token, inputSchemaSha256, outputSchemaSha256, transport: 'stdio', ...patch,
  });
  return { sqlite, db, dbPath, call, work, observations, claims, role, job: created.body.job, scope, attempt, result, begin, observe, claim };
}

void test('claim is one-use before observer saves unverified text; previous artifacts survive', async t => {
  const f = await setup(t), spec = f.attempt(), value = f.result(), before = structuredClone(f.job);
  before.freeCloud = { requestDigest: 'f'.repeat(64), model: 'fixture', state: 'completed', source: 'fixture', text: '以前の合成成果', chargeMinor: 0 };
  f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(before), before.id);
  const started = await f.begin(before.id, 0, spec), capability = started.body.operationCapability;
  assert.equal(started.status, 200); assert.equal(started.body.saved, true);
  assert.equal(started.body.job.toolAttempts[0].state, 'pending'); assert.match(capability.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(typeof capability.expiresAt, 'number'); assert.ok(capability.expiresAt > Date.now());
  assert.ok(!JSON.stringify(started.body.job).includes(capability.token));
  assert.ok(!('input' in started.body.job.toolAttempts[0]));
  assert.equal((await f.observe(before.id, 1, spec.id, value)).status, 409);
  const claim = await f.claim(before.id, spec, capability);
  assert.equal(claim.status, 200); assert.equal(claim.body.claimed, true); assert.equal(claim.body.jobRevision, 2);
  assert.equal((await f.claim(before.id, spec, capability)).status, 403);
  const saved = await f.observe(before.id, 2, spec.id, value);
  assert.equal(saved.status, 200); assert.equal(saved.body.saved, true);
  const job = saved.body.job, observed = job.toolObservations[0];
  assert.equal(job.revision, 3); assert.equal(job.status, before.status);
  assert.deepEqual(job.agentBinding, before.agentBinding); assert.deepEqual(job.steps, before.steps);
  assert.deepEqual(job.events, before.events); assert.deepEqual(job.plan, before.plan); assert.deepEqual(job.freeCloud, before.freeCloud);
  assert.equal(job.toolAttempts[0].state, 'observed_unverified'); assert.equal(job.toolAttempts[0].observationId, value.id);
  assert.equal(observed.verification, 'client_observed_unverified'); assert.equal(observed.text, value.text);
  assert.equal(observed.packageKey, spec.packageKey); assert.equal(observed.manifestSha256, spec.manifestSha256);
  assert.ok(!('success' in observed) && !('receipt' in observed) && !('charge' in observed));
  const read = await f.call(f.work, 'GET');
  assert.equal(read.body.jobs[0].toolObservations[0].text, value.text);
  assert.ok(!JSON.stringify(read.body).includes(capability.token));
  assert.equal((await f.call(f.work, 'GET', undefined, { owner: 'bob' })).body.jobs.length, 0);
  assert.equal((await f.begin(before.id, 3, f.attempt())).status, 409);
});

void test('begin and observe replays match exact content and never reissue capability', async t => {
  const f = await setup(t), spec = f.attempt(), value = f.result();
  const first = await f.begin(f.job.id, 0, spec), capability = first.body.operationCapability;
  assert.equal(first.body.saved, true);
  const beginReplay = await f.begin(f.job.id, 0, spec);
  assert.equal(beginReplay.status, 200); assert.equal(beginReplay.body.saved, false); assert.equal(beginReplay.body.operationCapability, undefined);
  assert.equal((await f.begin(f.job.id, 0, { ...spec, inputSha256: 'c'.repeat(64) })).status, 409);
  assert.equal((await f.begin(f.job.id, 1, f.attempt())).status, 409);
  assert.equal((await f.claim(f.job.id, spec, capability)).status, 200);
  assert.equal((await f.observe(f.job.id, 2, spec.id, value)).body.saved, true);
  const replay = await f.observe(f.job.id, 2, spec.id, value);
  assert.equal(replay.status, 200); assert.equal(replay.body.saved, false);
  assert.equal(replay.body.job.toolObservations.length, 1); assert.equal(replay.body.job.revision, 3);
  assert.equal((await f.observe(f.job.id, 2, spec.id, { ...value, text: '別の成果' })).status, 409);
  assert.equal((await f.observe(f.job.id, 3, spec.id, f.result())).status, 409);
  assert.equal((await f.begin(f.job.id, 0, spec)).body.saved, false);
});

void test('claim validates owner, role, token, actual connector, Tool and input before consuming capability', async t => {
  const f = await setup(t), spec = f.attempt(), begin = await f.begin(f.job.id, 0, spec), cap = begin.body.operationCapability;
  for (const patch of [
    { token: 'z'.repeat(43) }, { ownerScope: 'owner-v1:' + '0'.repeat(64) }, { agentId: 'other-agent' },
    { agentRevision: f.role.revision + 1 }, { inputSha256: 'c'.repeat(64) },
    { connectorId: 'other-connector' }, { toolName: 'other-tool' }, { attemptId: randomUUID() }, { jobId: randomUUID() },
  ]) assert.equal((await f.claim(f.job.id, spec, cap, patch)).status, 403);
  const still = (await f.call(f.work, 'GET')).body.jobs[0]; assert.equal(still.toolAttempts[0].state, 'pending');
  assert.equal((await f.claim(f.job.id, spec, cap)).status, 200);
});

void test('owner authentication, intent, origin, job binding and revision fail closed', async t => {
  const f = await setup(t), spec = f.attempt();
  assert.equal((await f.begin(f.job.id, 0, spec, { owner: 'bob' })).status, 409);
  assert.equal((await f.begin(f.job.id, 0, spec, { owner: null })).status, 401);
  assert.equal((await f.begin(f.job.id, 0, spec, { origin: 'https://other.invalid' })).status, 403);
  assert.equal((await f.begin(f.job.id, 0, spec, { scope: undefined })).status, 409);
  assert.equal((await f.begin(randomUUID(), 0, spec)).status, 404);
  assert.equal((await f.begin(f.job.id, 1, spec)).status, 409);
  const old = await f.call(f.work, 'POST', { id: randomUUID(), title: '旧仕事', templateId: 'article' });
  assert.equal((await f.begin(old.body.job.id, 0, spec)).status, 409);
  assert.equal(JSON.parse(f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(f.job.id).payload).toolAttempts, undefined);
});

void test('invalid admission and observation leave pending fence without inventing success', async t => {
  const f = await setup(t), spec = f.attempt(), value = f.result();
  assert.equal((await f.begin(f.job.id, 0, { ...spec, inputSha256: 'G'.repeat(64) })).status, 400);
  assert.equal((await f.begin(f.job.id, 0, { ...spec, grant: true })).status, 400);
  assert.equal((await f.observe(f.job.id, 0, spec.id, value)).status, 409);
  const begin = await f.begin(f.job.id, 0, spec);
  assert.equal((await f.observe(f.job.id, 1, spec.id, { ...value, verification: 'verified' })).status, 400);
  assert.equal((await f.observe(f.job.id, 1, spec.id, { ...value, text: 'あ'.repeat(2731) })).status, 400);
  assert.equal((await f.observe(f.job.id, 1, spec.id, { ...value, text: 'x'.repeat(70_000) })).status, 413);
  assert.equal((await f.claim(f.job.id, spec, begin.body.operationCapability)).status, 200);
  assert.equal((await f.observe(f.job.id, 2, spec.id, { ...value, packageKey: 'dev.other.tool@1.0.0' })).status, 400);
  assert.equal((await f.begin(f.job.id, 2, f.attempt())).status, 409);
  const stored = JSON.parse(f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(f.job.id).payload);
  assert.equal(stored.toolAttempts[0].state, 'claimed'); assert.equal(stored.toolObservations, undefined);
});

void test('cancellation before claim revokes capability; claim before cancellation records stop requested, not remote stop', async t => {
  const a = await setup(t), specA = a.attempt(), startedA = await a.begin(a.job.id, 0, specA);
  const cancelledA = await a.call(a.work, 'PATCH', { jobId: a.job.id, revision: 1, command: { id: randomUUID(), action: 'cancel' } }, { scope: a.scope });
  assert.equal(cancelledA.status, 200); assert.equal(cancelledA.body.job.toolAttempts[0].state, 'cancelled_before_claim');
  assert.equal((await a.claim(a.job.id, specA, startedA.body.operationCapability)).status, 403);
  assert.equal((await a.observe(a.job.id, 2, specA.id, a.result())).status, 409);
  const b = await setup(t), specB = b.attempt(), valueB = b.result(), startedB = await b.begin(b.job.id, 0, specB);
  const claimedB = await b.claim(b.job.id, specB, startedB.body.operationCapability);
  assert.equal(claimedB.status, 200);
  const cancelledB = await b.call(b.work, 'PATCH', { jobId: b.job.id, revision: claimedB.body.jobRevision,
    command: { id: randomUUID(), action: 'cancel' } }, { scope: b.scope });
  assert.equal(cancelledB.status, 200); assert.equal(cancelledB.body.job.toolAttempts[0].state, 'stop_requested');
  // A result may arrive with the committed claim revision after the one
  // concurrent stop. Preserve it without resending the Tool.
  const observed = await b.observe(b.job.id, claimedB.body.jobRevision, specB.id, valueB);
  assert.equal(observed.status, 200); assert.equal(observed.body.job.status, 'cancelled');
  assert.equal(observed.body.job.revision, 4);
  assert.equal(observed.body.job.toolObservations[0].verification, 'client_observed_unverified');
});

void test('claim and cancellation on the same revision cannot both win', async t => {
  const f = await setup(t), spec = f.attempt(), started = await f.begin(f.job.id, 0, spec);
  const responses = await Promise.all([
    f.claim(f.job.id, spec, started.body.operationCapability),
    f.call(f.work, 'PATCH', { jobId: f.job.id, revision: 1, command: { id: randomUUID(), action: 'cancel' } }, { scope: f.scope }),
  ]);
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  const job = (await f.call(f.work, 'GET')).body.jobs[0];
  assert.equal(job.revision, 2);
  assert.ok(['claimed', 'cancelled_before_claim'].includes(job.toolAttempts[0].state));
  if (job.toolAttempts[0].state === 'claimed') {
    const cancelled = await f.call(f.work, 'PATCH', { jobId: job.id, revision: 2, command: { id: randomUUID(), action: 'cancel' } }, { scope: f.scope });
    assert.equal(cancelled.body.job.toolAttempts[0].state, 'stop_requested');
  } else assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability)).status, 403);
});

void test('two connectors cannot claim the same capability', async t => {
  const f = await setup(t), spec = f.attempt(), started = await f.begin(f.job.id, 0, spec);
  const responses = await Promise.all([f.claim(f.job.id, spec, started.body.operationCapability), f.claim(f.job.id, spec, started.body.operationCapability)]);
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.equal(responses.filter(response => response.status === 403).length, 1);
  assert.equal((await f.call(f.work, 'GET')).body.jobs[0].toolAttempts[0].state, 'claimed');
});

void test('changed Agent, expired token or changed job during claim cannot start execution', async t => {
  for (const condition of ['agent', 'expiry', 'job']) {
    const f = await setup(t), spec = f.attempt(), started = await f.begin(f.job.id, 0, spec);
    if (condition === 'agent') f.sqlite.prepare('UPDATE sky_agent_settings SET revision=revision+1 WHERE owner_user_id=? AND id=?').run('alice', f.role.id);
    if (condition === 'expiry') {
      const old = JSON.parse(f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(f.job.id).payload);
      old.toolAttempts[0].capabilityExpiresAt = Date.now() - 1;
      f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(old), f.job.id);
    }
    if (condition === 'job') f.db.beforeRun = sql => {
      if (!sql.includes('UPDATE work_jobs SET payload')) return;
      f.db.beforeRun = null;
      const old = JSON.parse(f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(f.job.id).payload);
      old.revision = 2; old.status = 'cancelled';
      f.sqlite.prepare('UPDATE work_jobs SET payload=?, revision=2 WHERE id=?').run(JSON.stringify(old), f.job.id);
    };
    assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability)).status, 403);
    assert.notEqual((await f.call(f.work, 'GET')).body.jobs[0].toolAttempts[0].state, 'claimed');
  }
});

void test('pending survives fresh-process SQLite reopen but never reissues capability', async t => {
  const f = await setup(t, true), spec = f.attempt(), started = await f.begin(f.job.id, 0, spec);
  const script = `const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1]); const row = db.prepare('SELECT payload FROM work_jobs WHERE id=?').get(process.argv[2]); const job = JSON.parse(row.payload); process.stdout.write(JSON.stringify({state:job.toolAttempts[0].state,id:job.toolAttempts[0].id,revision:job.revision})); db.close();`;
  const child = spawnSync(process.execPath, ['--no-warnings', '-e', script, f.dbPath, f.job.id], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), { state: 'pending', id: spec.id, revision: 1 });
  assert.ok(!JSON.stringify((await f.call(f.work, 'GET')).body).includes(started.body.operationCapability.token));
  const retry = await f.begin(f.job.id, 0, spec);
  assert.equal(retry.body.saved, false); assert.equal(retry.body.operationCapability, undefined);
  assert.equal((await f.begin(f.job.id, 1, f.attempt())).status, 409);
});

void test('lost begin response after commit leaves fence and no token can be reissued', async t => {
  const f = await setup(t), spec = f.attempt();
  f.db.afterRun = sql => { if (sql.includes('UPDATE work_jobs SET payload')) { f.db.afterRun = null; throw new Error('synthetic lost acknowledgement'); } };
  assert.equal((await f.begin(f.job.id, 0, spec)).status, 503);
  assert.equal((await f.call(f.work, 'GET')).body.jobs[0].toolAttempts[0].state, 'pending');
  const replay = await f.begin(f.job.id, 0, spec); assert.equal(replay.body.saved, false); assert.equal(replay.body.operationCapability, undefined);
  assert.equal((await f.begin(f.job.id, 1, f.attempt())).status, 409);
});

void test('failed observe before or after commit never authorizes another execution', async t => {
  for (const timing of ['before', 'after']) {
    const f = await setup(t), spec = f.attempt(), value = f.result(), started = await f.begin(f.job.id, 0, spec);
    assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability)).status, 200);
    f.db[timing === 'before' ? 'beforeRun' : 'afterRun'] = sql => {
      if (sql.includes('UPDATE work_jobs SET payload')) { f.db.beforeRun = null; f.db.afterRun = null; throw new Error('synthetic failure'); }
    };
    assert.equal((await f.observe(f.job.id, 2, spec.id, value)).status, 503);
    const read = await f.call(f.work, 'GET'), job = read.body.jobs[0];
    assert.equal(job.toolAttempts[0].state, timing === 'before' ? 'claimed' : 'observed_unverified');
    assert.equal((await f.begin(f.job.id, job.revision, f.attempt())).status, 409);
    if (timing === 'after') assert.equal((await f.observe(f.job.id, 2, spec.id, value)).body.saved, false);
  }
});

void test('a single intervening claim rebases the original cancel once into stop-requested, never remote-stopped', async t => {
  const f = await setup(t), spec = f.attempt(), started = await f.begin(f.job.id, 0, spec), command = { id: randomUUID(), action: 'cancel' };
  const claimed = await f.claim(f.job.id, spec, started.body.operationCapability);
  assert.equal(claimed.status, 200); assert.equal(claimed.body.jobRevision, 2);
  const cancelled = await f.call(f.work, 'PATCH', { jobId: f.job.id, revision: 1, command }, { scope: f.scope });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.body.job.revision, 3);
  assert.equal(cancelled.body.job.toolAttempts[0].state, 'stop_requested');
  assert.equal(cancelled.body.job.toolAttempts[0].claimedRevision, 2);
  assert.equal(cancelled.body.job.events.filter(event => event.command.id === command.id).length, 1);
  const repeated = await f.call(f.work, 'PATCH', { jobId: f.job.id, revision: 1, command }, { scope: f.scope });
  assert.equal(repeated.status, 200); assert.equal(repeated.body.job.revision, 3);
  assert.equal(repeated.body.job.events.filter(event => event.command.id === command.id).length, 1);
});

void test('claim commits while cancellation CAS waits: the original cancellation is applied once after claim', async t => {
  const f = await setup(t), spec = f.attempt(), command = { id: randomUUID(), action: 'cancel' };
  await f.begin(f.job.id, 0, spec);
  f.db.beforeRun = sql => {
    if (!sql.startsWith('UPDATE work_jobs SET payload')) return;
    f.db.beforeRun = null;
    const old = JSON.parse(f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(f.job.id).payload);
    old.revision = 2; old.toolAttempts[0].state = 'claimed'; old.toolAttempts[0].claimedRevision = 2; old.toolAttempts[0].claimedAt = new Date().toISOString();
    f.sqlite.prepare('UPDATE work_jobs SET payload=?, revision=2 WHERE id=? AND revision=1').run(JSON.stringify(old), f.job.id);
  };
  const cancelled = await f.call(f.work, 'PATCH', { jobId: f.job.id, revision: 1, command }, { scope: f.scope });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.body.job.revision, 3);
  assert.equal(cancelled.body.job.toolAttempts[0].state, 'stop_requested');
  assert.equal(cancelled.body.job.events.filter(event => event.command.id === command.id).length, 1);
});

void test('a later independent edit or multiple attempts prevent stale cancellation rebase', async t => {
  const f = await setup(t), spec = f.attempt(), started = await f.begin(f.job.id, 0, spec);
  assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability)).status, 200);
  const old = JSON.parse(f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(f.job.id).payload);
  old.revision = 3; old.title = '別画面の編集';
  f.sqlite.prepare('UPDATE work_jobs SET payload=?, revision=3 WHERE id=?').run(JSON.stringify(old), f.job.id);
  assert.equal((await f.call(f.work, 'PATCH', { jobId: f.job.id, revision: 1,
    command: { id: randomUUID(), action: 'cancel' } }, { scope: f.scope })).status, 409);
  const many = await setup(t), first = many.attempt(), start = await many.begin(many.job.id, 0, first);
  assert.equal((await many.claim(many.job.id, first, start.body.operationCapability)).status, 200);
  const corrupt = JSON.parse(many.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(many.job.id).payload);
  corrupt.toolAttempts.push({ ...corrupt.toolAttempts[0], id: randomUUID() });
  many.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(corrupt), many.job.id);
  assert.equal((await many.call(many.work, 'PATCH', { jobId: many.job.id, revision: 1,
    command: { id: randomUUID(), action: 'cancel' } }, { scope: many.scope })).status, 409);
});

void test('unavailable authority gate rejects begin and claim without persisting a pending attempt', async t => {
  const f = await setup(t, false, false), spec = f.attempt();
  assert.equal((await f.begin(f.job.id, 0, spec)).status, 503);
  const job = (await f.call(f.work, 'GET')).body.jobs[0];
  assert.equal(job.revision, 0); assert.equal(job.toolAttempts, undefined);
  assert.equal((await f.claim(f.job.id, spec, { token: 'a'.repeat(43) })).status, 403);
});

void test('begin atomically requires the selected Agent package and pc execution target', async t => {
  for (const requirements of [
    { inputFields: [], outputFields: [], packageKey: 'dev.fixture.other@1.0.0', executionTarget: 'pc' },
    { inputFields: [], outputFields: [], packageKey: 'dev.fixture.counter@1.0.0', executionTarget: 'cloud' },
  ]) {
    const f = await setup(t); const spec = f.attempt();
    f.db.beforeRun = sql => {
      if (!sql.includes('UPDATE work_jobs SET payload')) return;
      f.db.beforeRun = null;
      f.sqlite.prepare("UPDATE sky_agent_settings SET settings = json_set(settings, '$.requirements', json(?)) WHERE owner_user_id = ? AND id = ?")
        .run(JSON.stringify(requirements), 'alice', f.role.id);
    };
    assert.equal((await f.begin(f.job.id, 0, spec)).status, 409);
    assert.equal((await f.call(f.work, 'GET')).body.jobs[0].revision, 0);
  }
});

/** Freeze only this SQLite connection's SQL clock, after setup imports/migrations.
 * The function is intentionally NOT deterministic: each statement must observe
 * an explicit advance. No runtime source, global Date or immutable row changes. */
async function expiringReviewFixture(t) {
  const clock = { now: 0, expiry: 0, reads: 0 };
  const f = await setup(t, false, true, sqlite => {
    clock.now = Date.now(); clock.expiry = clock.now + 1000;
    sqlite.function('julianday', value => {
      assert.equal(value, 'now'); clock.reads++;
      return clock.now / 86400000 + 2440587.5;
    });
    return { reviewedAt: clock.now, expiresAt: clock.expiry };
  });
  const reviewActive = () => Number(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM sky_tool_package_reviews
    WHERE decision = 'verified' AND expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)`).get().n);
  assert.equal(reviewActive(), 1, 'Review must start valid, independently of setup duration');
  const expire = () => { clock.now = clock.expiry + 1000; assert.equal(reviewActive(), 0); };
  return { ...f, clock, reviewActive, expire };
}
function assertExpiryRefused(phase, response, job) {
  assert.equal(response.status, phase === 'begin' ? 409 : 403, `${phase}: expired review must deny at commit`);
  assert.equal(job.revision, phase === 'begin' ? 0 : 1);
  if (phase === 'claim') assert.equal(job.toolAttempts[0].state, 'pending');
  else assert.equal(job.toolAttempts?.length ?? 0, 0);
}

void test('package or review revocation during begin or claim blocks atomic commit', async t => {
  for (const phase of ['begin', 'claim']) for (const revoked of ['package', 'review', 'agentTarget']) {
    const f = revoked === 'review' ? await expiringReviewFixture(t) : await setup(t), spec = f.attempt();
    const started = phase === 'claim' ? await f.begin(f.job.id, 0, spec) : null;
    if (started) {
      assert.equal(started.status, 200, `${phase}: admission must succeed before revocation`);
      assert.ok(started.body.operationCapability?.token, 'Established admission must return its capability');
    }
    let atCommit = false;
    f.db.beforeRun = sql => {
      if (!sql.includes('UPDATE work_jobs SET payload')) return;
      f.db.beforeRun = null; atCommit = true;
      if (revoked === 'package') f.sqlite.prepare("UPDATE sky_tool_packages SET status = 'revoked' WHERE package_key = ?").run(spec.packageKey);
      if (revoked === 'review') {
        assert.equal(f.reviewActive(), 1, 'Still valid immediately before UPDATE');
        f.expire();
        if (started) assert.ok(f.clock.now < started.body.operationCapability.expiresAt,
          'Only the review expires; do not confuse capability expiry with this regression');
      }
      if (revoked === 'agentTarget') f.sqlite.prepare("UPDATE sky_agent_settings SET settings = json_set(settings, '$.requirements.executionTarget', 'cloud') WHERE owner_user_id = ? AND id = ?").run('alice', f.role.id);
    };
    const response = phase === 'begin' ? await f.begin(f.job.id, 0, spec) : await f.claim(f.job.id, spec, started.body.operationCapability);
    assert.equal(atCommit, true, `${phase}: ${revoked} must reach the UPDATE boundary`);
    const job = (await f.call(f.work, 'GET')).body.jobs[0];
    assertExpiryRefused(phase, response, job);
  }
});

void test('frozen review clock permits admission and claim before explicit expiry', async t => {
  const f = await expiringReviewFixture(t), spec = f.attempt();
  const started = await f.begin(f.job.id, 0, spec);
  assert.equal(started.status, 200); assert.equal(started.body.saved, true);
  assert.ok(started.body.operationCapability?.token);
  assert.equal(f.reviewActive(), 1);
  const claimed = await f.claim(f.job.id, spec, started.body.operationCapability);
  assert.equal(claimed.status, 200); assert.equal(claimed.body.claimed, true);
  const job = (await f.call(f.work, 'GET')).body.jobs[0];
  assert.equal(job.revision, 2); assert.equal(job.toolAttempts[0].state, 'claimed');
  assert.equal(f.reviewActive(), 1); assert.ok(f.clock.reads > 0);
});

void test('negative fixture without commit-time review expiry is detected by the same rejection oracle', async t => {
  for (const phase of ['begin', 'claim']) {
    const f = await expiringReviewFixture(t), spec = f.attempt();
    const started = phase === 'claim' ? await f.begin(f.job.id, 0, spec) : null;
    if (started) { assert.equal(started.status, 200); assert.ok(started.body.operationCapability?.token); }
    let transformed = 0, atCommit = false;
    f.db.sqlForTest = sql => {
      if (!sql.includes('UPDATE work_jobs SET payload')) return sql;
      const expiry = "AND (r.expires_at IS NULL OR r.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))";
      assert.equal(sql.split(expiry).length, 2, 'Mutate exactly one review-expiry clause; keep every other gate');
      transformed++;
      return sql.replace(expiry, '');
    };
    f.db.beforeRun = sql => {
      if (!sql.includes('UPDATE work_jobs SET payload')) return;
      f.db.beforeRun = null; atCommit = true;
      assert.equal(f.reviewActive(), 1); f.expire();
      if (started) assert.ok(f.clock.now < started.body.operationCapability.expiresAt);
    };
    const response = phase === 'begin' ? await f.begin(f.job.id, 0, spec) : await f.claim(f.job.id, spec, started.body.operationCapability);
    assert.equal(atCommit, true); assert.equal(transformed, 1); assert.equal(f.reviewActive(), 0);
    assert.equal(response.status, 200, 'Missing only the SQL expiry clause wrongly permits commit');
    const job = (await f.call(f.work, 'GET')).body.jobs[0];
    assert.equal(job.revision, phase === 'begin' ? 1 : 2);
    assert.throws(() => assertExpiryRefused(phase, response, job), assert.AssertionError,
      'The unchanged security oracle must fail for the old SQL condition');
    t.diagnostic(`${phase}: old SQL commits after review expiry; rejection oracle detects the mutation`);
  }
});

void test('lost claim response cannot be replayed; cancellation remains stop requested', async t => {
  const f = await setup(t), spec = f.attempt(), started = await f.begin(f.job.id, 0, spec);
  f.db.afterRun = sql => { if (sql.includes('UPDATE work_jobs SET payload')) { f.db.afterRun = null; throw new Error('lost response'); } };
  assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability)).status, 403);
  assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability)).status, 403);
  const cancelled = await f.call(f.work, 'PATCH', { jobId: f.job.id, revision: 1,
    command: { id: randomUUID(), action: 'cancel' } }, { scope: f.scope });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.body.job.toolAttempts[0].state, 'stop_requested');
});

void test('claim checks actual runtime schema digests and matching local transport', async t => {
  const f = await setup(t), spec = f.attempt(), started = await f.begin(f.job.id, 0, spec);
  for (const patch of [{ inputSchemaSha256: '0'.repeat(64) }, { outputSchemaSha256: '0'.repeat(64) },
    { transport: 'local_http' }, { transport: 'https' }]) {
    assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability, patch)).status, 403);
  }
  assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability)).status, 200);
});

void test('manifest mutation after validation cannot win claim SQL', async t => {
  const f = await setup(t), spec = f.attempt(), started = await f.begin(f.job.id, 0, spec);
  f.db.beforeRun = sql => {
    if (!sql.includes('UPDATE work_jobs SET payload')) return;
    f.db.beforeRun = null;
    f.sqlite.prepare("UPDATE sky_tool_packages SET manifest = manifest || ' ' WHERE package_key = ?").run(spec.packageKey);
  };
  assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability)).status, 403);
  assert.equal((await f.call(f.work, 'GET')).body.jobs[0].toolAttempts[0].state, 'pending');
});

void test('real authority gate confines preview to configured loopback identity without credentials', async () => {
  const config = { ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID: 'local-preview:fixture', ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' };
  const gate = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/authority.ts', import.meta.url), new Map([
    ['cloudflare:workers', { env: config }], ['@/lib/request-auth', auth],
  ])).dispatchAuthorityAvailable;
  const request = (url, headers = {}) => new Request(url, { method: 'POST', headers });
  const valid = request('http://localhost:3000/api/work-jobs', { Origin: 'http://localhost:3000' });
  assert.equal(gate(valid, 'local-preview:fixture', true), true);
  assert.equal(gate(valid, 'local-preview:other', true), false);
  assert.equal(gate(request('http://localhost:3000/a'), 'local-preview:fixture', true), false);
  assert.equal(gate(request('http://localhost:3000/a'), 'local-preview:fixture', false), true);
  assert.equal(gate(request('http://localhost:3000/a', { Authorization: 'Bearer rock_esim_dummy' }), 'local-preview:fixture', false), false);
  assert.equal(gate(request('http://localhost:3000/a', { Cookie: 'jennifer_access=fixture' }), 'local-preview:fixture', false), false);
  assert.equal(gate(request('http://localhost:3000/a', { 'oai-authenticated-user-id': 'real-user' }), 'local-preview:fixture', false), false);
  assert.equal(gate(request('https://fixture.invalid/a'), 'local-preview:fixture', false), false);
  config.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED = 'true';
  assert.equal(gate(valid, 'local-preview:fixture', true), false);
  delete config.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED;
  assert.equal(gate(valid, 'local-preview:fixture', true), false);
});

void test('real preview gate permits isolated free local host dispatch end to end', async t => {
  const f = await setup(t, false, 'real'), spec = f.attempt();
  const started = await f.begin(f.job.id, 0, spec);
  assert.equal(started.status, 200); assert.equal(started.body.saved, true);
  const claimed = await f.claim(f.job.id, spec, started.body.operationCapability);
  assert.equal(claimed.status, 200); assert.equal(claimed.body.jobRevision, 2);
  assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability)).status, 403);
});

function reviewed(f, patch = {}) {
  const spec = f.attempt();
  spec.executionReview = {
    schema: 'rockstaros.work-tool-execution-review/1', ownerScope: f.scope, jobId: f.job.id,
    jobRevision: f.job.revision, agentId: f.role.id, agentRevision: f.role.revision,
    packageKey: spec.packageKey, manifestSha256: spec.manifestSha256,
    packagePricing: { model: 'free', note: '料金と外部実費は開発者が公開前に確認してください。', declaration: 'provider_unverified' },
    approvalContext: { schema: 'rockstaros.mcp-approval-context/1', connectorId: spec.connectorId, toolName: spec.toolName,
      transport: 'stdio', toolDigest: 'd'.repeat(64), inputSha256: spec.inputSha256, payloadDigest: 'e'.repeat(64),
      expiresAt: Date.now() + 240_000, pricing: { model: 'free', note: 'provider fixture', declaration: 'provider_unverified' } },
    ...patch,
  };
  return spec;
}
const reviewClaim = async spec => ({ executionReviewDigest: await workToolExecutionReviewDigest(spec.executionReview),
  executionContext: spec.executionReview.approvalContext });

void test('explicit execution review binds one-use begin and claim; legacy absence stays missing', async t => {
  const f = await setup(t), spec = reviewed(f), origin = structuredClone(f.job.agentBinding);
  const begin = await f.begin(f.job.id, 0, spec);
  assert.equal(begin.status, 200, JSON.stringify(begin.body));
  const attempt = begin.body.job.toolAttempts[0];
  assert.deepEqual(begin.body.job.agentBinding, origin);
  assert.deepEqual(attempt.executionReview, spec.executionReview);
  assert.equal(attempt.executionReviewDigest, await workToolExecutionReviewDigest(spec.executionReview));
  assert.equal(attempt.creationRelation.state, 'not_recorded');
  assert.deepEqual(await storedWorkToolExecutionReview(begin.body.job, attempt), spec.executionReview);
  const replay = await f.begin(f.job.id, 0, spec);
  assert.equal(replay.status, 200); assert.equal(replay.body.saved, false); assert.equal(replay.body.operationCapability, undefined);
  assert.equal((await f.begin(f.job.id, 0, { ...spec, executionReview: undefined })).status, 409);
  const cap = begin.body.operationCapability, extra = await reviewClaim(spec);
  assert.equal((await f.claim(f.job.id, spec, cap)).status, 403); // no silent downgrade
  for (const key of ['toolDigest', 'payloadDigest', 'inputSha256', 'toolName', 'connectorId', 'expiresAt', 'pricing']) {
    const context = { ...extra.executionContext, [key]: key === 'expiresAt' ? Date.now() + 10_000 : key === 'pricing'
      ? { ...extra.executionContext.pricing, note: 'changed' } : 'f'.repeat(64) };
    assert.equal((await f.claim(f.job.id, spec, cap, { ...extra, executionContext: context })).status, 403, key);
  }
  assert.equal((await f.claim(f.job.id, spec, cap, { ...extra, executionReviewDigest: 'a'.repeat(64) })).status, 403);
  const claim = await f.claim(f.job.id, spec, cap, extra);
  assert.equal(claim.status, 200); assert.equal(claim.body.executionReviewDigest, extra.executionReviewDigest);
  assert.equal((await f.claim(f.job.id, spec, cap, extra)).status, 403);
  const saved = await f.observe(f.job.id, 2, spec.id, f.result());
  assert.deepEqual(saved.body.job.toolAttempts[0].executionReview, spec.executionReview);
  assert.deepEqual(saved.body.job.agentBinding, origin);
  assert.ok(!JSON.stringify(saved.body.job).includes(cap.token));
});

void test('unknown, stale or mismatched reviews never strand a pending attempt', async t => {
  const f = await setup(t), good = reviewed(f);
  const cases = [
    { ...good.executionReview, extra: true }, { ...good.executionReview, schema: 'future/2' },
    { ...good.executionReview, ownerScope: 'owner-v1:' + 'f'.repeat(64) },
    { ...good.executionReview, jobId: randomUUID() }, { ...good.executionReview, jobRevision: 1 },
    { ...good.executionReview, agentId: randomUUID() }, { ...good.executionReview, agentRevision: 2 },
    { ...good.executionReview, manifestSha256: 'f'.repeat(64) },
    { ...good.executionReview, packagePricing: { ...good.executionReview.packagePricing, note: 'changed' } },
    ...[{ expiresAt: Date.now() - 1 }, { expiresAt: Date.now() + 600_000 }, { transport: 'remote_http' },
      { inputSha256: 'c'.repeat(64) }, { toolName: 'different' }, { toolDigest: 'not-a-hash' },
      { pricing: { model: 'paid', note: '', declaration: 'provider_unverified' } }].map(c => ({
        ...good.executionReview, approvalContext: { ...good.executionReview.approvalContext, ...c } })),
  ];
  for (const review of cases) {
    const r = await f.begin(f.job.id, 0, { ...good, executionReview: review });
    assert.ok([400,409].includes(r.status), JSON.stringify({ review, r }));
  }
  assert.equal((await f.call(f.work, 'GET')).body.jobs[0].toolAttempts?.length ?? 0, 0);
  assert.equal((await f.begin(f.job.id, 0, good)).status, 200);
});

void test('stored review mutation before claim and within commit is rejected', async t => {
  for (const timing of ['before', 'commit']) {
    const f = await setup(t), spec = reviewed(f), started = await f.begin(f.job.id, 0, spec);
    assert.equal(started.status, 200);
    const mutate = () => {
      const row = f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(f.job.id);
      const payload = JSON.parse(row.payload);
      payload.toolAttempts[0].executionReview.approvalContext.pricing.note = 'mutated stored declaration';
      f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(payload), f.job.id);
    };
    if (timing === 'before') mutate(); else f.db.beforeRun = sql => { if (sql.startsWith('UPDATE work_jobs')) { f.db.beforeRun = null; mutate(); } };
    assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability, await reviewClaim(spec))).status, 403, timing);
    const job = (await f.call(f.work, 'GET')).body.jobs[0];
    assert.equal(job.toolAttempts[0].state, 'pending');
    await assert.rejects(storedWorkToolExecutionReview(job, job.toolAttempts[0]));
  }
});

void test('explicit review claim concurrency grants once; cancellation preserves immutable review', async t => {
  const f = await setup(t), spec = reviewed(f), started = await f.begin(f.job.id, 0, spec), extra = await reviewClaim(spec);
  const results = await Promise.all([f.claim(f.job.id, spec, started.body.operationCapability, extra), f.claim(f.job.id, spec, started.body.operationCapability, extra)]);
  assert.deepEqual(results.map(r => r.status).sort((a,b) => a-b), [200,403]);
  const cancelled = await f.call(f.work, 'PATCH', { jobId:f.job.id, revision:2, command:{id:randomUUID(),action:'cancel'} }, {scope:f.scope});
  assert.equal(cancelled.status, 200); assert.equal(cancelled.body.job.toolAttempts[0].state, 'stop_requested');
  assert.deepEqual(cancelled.body.job.toolAttempts[0].executionReview, spec.executionReview);
  assert.equal((await f.claim(f.job.id, spec, started.body.operationCapability, extra)).status, 403);
});
