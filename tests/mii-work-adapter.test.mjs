import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, open, readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createMiiWorkAdapter } from '../lib/mii-work-adapter.ts';
import { describeAdapter } from '../lib/rockstar-adapters.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { createWorkJob, applyWorkCommand } from '../lib/workflow.ts';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import * as requestAuth from '../lib/request-auth.ts';
import { loadRouteFixture } from './route-fixture.mjs';

const at = 1000;
const observation = (patch = {}) => ({ bootId: 'boot-1', placeEpoch: 1, sequence: 1,
  sceneRevision: 1, observedAt: at, expiresAt: at + 10000, attached: true, tracking: 'tracked', ...patch });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };

void test('supplied preview descriptors fence the real same-job reader without granting authority', async t => {
  const f = await fixture(t); let clock = at;
  const declared = () => ({
    host: describeAdapter('fixture-host','host','linux',{'work.owner-scoped-read':true},at),
    executor: describeAdapter('fixture-reader','executor','web',{'work.read':true},at),
    output: describeAdapter('fixture-output','output','web',{'output.text':true},at),
  });
  let descriptors = declared();
  descriptors.output.expiresAt = at + 1000;
  const adapter = createMiiWorkAdapter({ fetchImpl:f.fetchImpl, journal:f.journal, now:()=>clock, descriptors:()=>descriptors });
  adapter.observe(observation());
  const read = await adapter.readExisting(f.reference);
  assert.equal(read.job.id,f.job.id);assert.equal(read.executionAuthorized,false);assert.equal(read.hardwareAccepted,false);
  assert.equal(read.observationExpiresAt,at+1000);
  const legacy = await f.adapter.readExisting(f.reference);
  assert.equal(legacy.observationExpiresAt,at+10000);
  const guard = adapter.createInputGuard();assert.equal(guard(),true);
  clock = at + 1000;assert.equal(guard(),false);
  await assert.rejects(adapter.readExisting(f.reference),/MII_OBSERVATION_UNAVAILABLE/);
  clock = at;descriptors=declared();descriptors.output.capabilities['output.text']=null;
  assert.throws(()=>adapter.observe(observation({sequence:2})),/CAPABILITY_UNAVAILABLE/);
  await assert.rejects(adapter.readExisting(f.reference),/MII_OBSERVATION_UNAVAILABLE/);
  descriptors=declared();descriptors.executor.role='output';
  assert.throws(()=>adapter.observe(observation({sequence:3})),/ADAPTER_ROLE_MISMATCH/);
});

async function durableJournal(t) {
  const dir = await mkdtemp(join(tmpdir(), 'mii-journal-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = key => join(dir, createHash('sha256').update(key.ownerScope + '\0' + key.jobId).digest('hex'));
  const syncDir = async () => { const dirHandle = await open(dir, 'r'); try { await dirHandle.sync(); } finally { await dirHandle.close(); } };
  const journal = {
    async read(key) { try { return JSON.parse(await readFile(path(key), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    async claim(record) {
      let handle;
      try { handle = await open(path(record), 'wx', 0o600); }
      catch (e) { if (e.code === 'EEXIST') return 'occupied'; throw e; }
      try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); } finally { await handle.close(); }
      await syncDir(); return 'claimed';
    },
    async settle(record) {
      if (JSON.stringify(await journal.read(record)) !== JSON.stringify(record)) return false;
      await unlink(path(record)); await syncDir(); return true;
    },
  };
  return journal;
}

async function fixture(t) {
  const ownerScope = await ownerScopeFor('fixture-owner');
  let job = createWorkJob({ id: randomUUID(), title: '合成の仕事', templateId: 'article' });
  let mode = 'normal'; const calls = [];
  const reference = { ownerScope, jobId: job.id, revision: job.revision, sceneRevision: 1,
    agentId: 'agent-fixture', agentRevision: 3, executorDeviceId: 'original-executor' };
  job.agentBinding = { schema: 'rockstaros.work-agent-binding/1', agentId: reference.agentId,
    agentRevision: reference.agentRevision, requestDigest: 'a'.repeat(64) };
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    assert.equal(url, '/api/work-jobs');
    if (options.method === 'GET') return Response.json({ jobs: [job], ownerScope: mode === 'other-owner' ? await ownerScopeFor('other') : ownerScope });
    assert.equal(options.headers['X-Rock-Owner-Scope'], ownerScope);
    if (mode === 'network-loss') throw new Error('fixture lost acknowledgement');
    if (mode === 'reject') return Response.json({ error: 'fixture rejection' }, { status: 409 });
    const body = JSON.parse(options.body);
    if (mode.startsWith('claim-race')) {
      const claimedAt = '2026-10-28T10:00:00.000Z', cancelledAt = '2026-10-28T10:00:01.000Z';
      const claimed = { ...job, revision: job.revision + 1, updatedAt: claimedAt,
        toolAttempts: [{ ...job.toolAttempts[0], state: 'claimed', claimedAt, claimedRevision: job.revision + 1 }] };
      job = applyWorkCommand(claimed, body.command, claimed.revision, cancelledAt);
      const reply = structuredClone(job);
      if (mode === 'claim-race-role') reply.agentBinding.agentRevision++;
      if (mode === 'claim-race-plan') reply.plan.objective = '無関係な編集';
      if (mode === 'claim-race-attempt') reply.toolAttempts[0].id = randomUUID();
      if (mode === 'claim-race-input') reply.toolAttempts[0].inputSha256 = 'b'.repeat(64);
      if (mode === 'claim-race-revision') reply.toolAttempts[0].claimedRevision++;
      if (mode === 'claim-race-status') reply.toolAttempts[0].state = 'observed_unverified';
      if (mode === 'claim-race-event') reply.events.push({ at: cancelledAt, command: { id: randomUUID(), action: 'cancel' } });
      if (mode === 'claim-race-output') reply.standaloneAgent = { text: '差し替えられた成果' };
      return Response.json({ job: reply });
    }
    job = applyWorkCommand(job, body.command, body.revision);
    if (mode === 'apply-then-loss') throw new Error('fixture lost acknowledgement after commit');
    if (mode === 'ordinary-tamper') return Response.json({ job: { ...job, title: '別の仕事' } });
    return Response.json({ job });
  };
  const journal = await durableJournal(t);
  const adapter = createMiiWorkAdapter({ fetchImpl, now: () => at, journal });
  adapter.observe(observation());
  return { adapter, journal, fetchImpl, reference, get job() { return job; }, get calls() { return calls; }, setMode(v) { mode = v; }, setJob(v) { job = v; } };
}

void test('even a normal one-revision cancellation cannot replace another field', async t => {
  const f = await fixture(t); await f.adapter.readExisting(f.reference); f.setMode('ordinary-tamper');
  const result = await f.adapter.cancelPlan({ commandId: randomUUID(), jobId: f.job.id, revision: 0, confirmed: true });
  assert.equal(result.state, 'unknown'); assert.notEqual(await f.journal.read(f.reference), null);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
});

void test('a two-revision result without one previously pending attempt is not accepted', async t => {
  const f = await fixture(t), attempt = { ...pendingAttempt(), state: 'claimed', claimedAt: '2026-10-28T09:30:00.000Z', claimedRevision: 1 };
  f.setJob({ ...f.job, revision: 1, toolAttempts: [attempt] });
  const ref = { ...f.reference, revision: 1 }; await f.adapter.readExisting(ref); f.setMode('claim-race');
  const result = await f.adapter.cancelPlan({ commandId: randomUUID(), jobId: f.job.id, revision: 1, confirmed: true });
  assert.equal(result.state, 'unknown'); assert.notEqual(await f.journal.read(ref), null);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
});

function pendingAttempt() {
  return { schema: 'rockstaros.work-tool-attempt/1', id: randomUUID(), packageKey: 'example@1',
    manifestSha256: 'a'.repeat(64), connectorId: 'fixture', toolName: 'tool', inputSha256: 'c'.repeat(64),
    state: 'pending', startedAt: '2026-10-28T09:00:00.000Z', capabilityHash: 'd'.repeat(64), capabilityExpiresAt: 200000 };
}

void test('an intervening single claim and the same cancellation are accepted without claiming remote stop', async t => {
  const f = await fixture(t), attempt = pendingAttempt();
  f.setJob({ ...f.job, revision: 1, toolAttempts: [attempt] });
  const ref = { ...f.reference, revision: 1 }, commandId = randomUUID();
  await f.adapter.readExisting(ref); f.setMode('claim-race');
  const result = await f.adapter.cancelPlan({ commandId, jobId: f.job.id, revision: 1, confirmed: true });
  assert.deepEqual(result, { state: 'plan_cancelled', remoteStop: 'unconfirmed', physicalStop: 'unconfirmed' });
  assert.equal(f.job.revision, 3); assert.equal(f.job.toolAttempts[0].id, attempt.id);
  assert.equal(f.job.toolAttempts[0].state, 'stop_requested');
  assert.equal(f.job.toolAttempts[0].claimedRevision, 2);
  assert.notEqual(await f.journal.read(ref), null);
  f.setMode('normal');
  const read = await f.adapter.readExisting(ref);
  assert.equal(read.job.id, ref.jobId); assert.equal(read.cancelReconciliation, 'clear');
  assert.equal(read.job.toolAttempts[0].state, 'stop_requested');
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
});

for (const variant of ['role', 'plan', 'attempt', 'input', 'revision', 'status', 'event', 'output']) {
  void test(`claim race with modified ${variant} stays unknown and is never resent`, async t => {
    const f = await fixture(t); f.setJob({ ...f.job, revision: 1, toolAttempts: [pendingAttempt()] });
    const ref = { ...f.reference, revision: 1 }, commandId = randomUUID();
    await f.adapter.readExisting(ref); f.setMode(`claim-race-${variant}`);
    const result = await f.adapter.cancelPlan({ commandId, jobId: f.job.id, revision: 1, confirmed: true });
    assert.deepEqual(result, { state: 'unknown', remoteStop: 'unconfirmed', physicalStop: 'unconfirmed' });
    assert.notEqual(await f.journal.read(ref), null);
    f.setMode('normal'); const read = await f.adapter.readExisting(ref);
    assert.equal(read.cancelReconciliation, 'clear');
    assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
  });
}

void test('same authenticated owner reads and verifies the server-bound Agent without claiming device or hardware authorization', async t => {
  const f = await fixture(t), result = await f.adapter.readExisting(f.reference);
  assert.equal(result.job.id, f.reference.jobId);
  assert.equal(result.job.revision, f.reference.revision);
  assert.equal(result.agentBinding, 'verified'); assert.equal(result.executorBinding, 'unverified');
  assert.equal(result.hardwareAccepted, false); assert.equal(result.executionAuthorized, false);
  assert.deepEqual(f.calls.map(c => c.method), ['GET']);
  assert.equal(f.calls[0].credentials, 'same-origin');
});

void test('Agent binding mismatch or missing server binding is rejected; legacy reads without Agent reference remain available', async t => {
  const f = await fixture(t);
  await assert.rejects(f.adapter.readExisting({ ...f.reference, agentId: 'other-agent' }), /MII_AGENT_BINDING_MISMATCH/);
  await assert.rejects(f.adapter.readExisting({ ...f.reference, agentRevision: 4 }), /MII_AGENT_BINDING_MISMATCH/);
  await assert.rejects(f.adapter.readExisting({ ...f.reference, agentRevision: undefined }), /MII_REFERENCE_INVALID/);
  const { agentBinding: _agentBinding, ...legacy } = f.job; f.setJob(legacy);
  await assert.rejects(f.adapter.readExisting(f.reference), /MII_AGENT_BINDING_MISMATCH/);
  const { agentId: _agentId, agentRevision: _agentRevision, ...legacyRef } = f.reference;
  const read = await f.adapter.readExisting(legacyRef);
  assert.equal(read.agentBinding, 'unverified'); assert.equal(read.job.id, legacy.id);
  assert.equal(read.executorBinding, 'unverified');
});

void test('a failed Agent lookup invalidates any previously selected job before cancellation', async t => {
  const f = await fixture(t);
  await f.adapter.readExisting(f.reference);
  await assert.rejects(f.adapter.readExisting({ ...f.reference, agentId: 'other-agent' }), /MII_AGENT_BINDING_MISMATCH/);
  await assert.rejects(f.adapter.cancelPlan({ commandId: randomUUID(), jobId: f.job.id, revision: 0, confirmed: true }), /MII_READBACK_REQUIRED/);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 0);
});

void test('owner change, stale revision and an absent job never become a valid readback', async t => {
  const f = await fixture(t); f.setMode('other-owner');
  await assert.rejects(f.adapter.readExisting(f.reference), /MII_OWNER_OR_RESPONSE_MISMATCH/);
  f.setMode('normal');
  await assert.rejects(f.adapter.readExisting({ ...f.reference, revision: 2 }), /MII_JOB_NOT_FOUND_OR_STALE/);
  await assert.rejects(f.adapter.readExisting({ ...f.reference, jobId: randomUUID() }), /MII_JOB_NOT_FOUND_OR_STALE/);
  await assert.rejects(f.adapter.readExisting({ ...f.reference, sceneRevision: 0 }), /MII_SCENE_REVISION_MISMATCH/);
});

void test('detach requires a new place epoch and delayed old readback is rejected without a new job', async t => {
  const f = await fixture(t), gate = deferred();
  const adapter = createMiiWorkAdapter({ now: () => at, fetchImpl: async () => gate.promise });
  adapter.observe(observation());
  const pending = adapter.readExisting(f.reference);
  adapter.observe(observation({ sequence: 2, attached: false }));
  assert.throws(() => adapter.observe(observation({ sequence: 3 })), /MII_DETACHED_EPOCH/);
  gate.resolve(Response.json({ jobs: [f.job], ownerScope: f.reference.ownerScope }));
  await assert.rejects(pending, /MII_OBSERVATION_UNAVAILABLE/);
  adapter.observe(observation({ sequence: 4, placeEpoch: 2 }));
  const restored = await adapter.readExisting(f.reference);
  assert.equal(restored.job.id, f.reference.jobId);
});

void test('loss, expired observations, old sequence and replayed boot invalidate access', async t => {
  const f = await fixture(t);
  f.adapter.observe(observation({ sequence: 2, tracking: 'lost' }));
  await assert.rejects(f.adapter.readExisting(f.reference), /MII_OBSERVATION_UNAVAILABLE/);
  assert.throws(() => f.adapter.observe(observation({ sequence: 1 })), /MII_OBSERVATION_STALE/);
  assert.throws(() => f.adapter.observe(observation({ sequence: 3, expiresAt: at })), /MII_OBSERVATION_INVALID/);
  f.adapter.observe(observation({ sequence: 3, bootId: 'boot-2' }));
  assert.throws(() => f.adapter.observe(observation({ sequence: 4, bootId: 'boot-1' })), /MII_BOOT_REPLAY/);
});

void test('explicit same-owner revision-bound plan cancellation uses existing PATCH and does not claim remote stop', async t => {
  const f = await fixture(t); await f.adapter.readExisting(f.reference);
  const commandId = randomUUID();
  const result = await f.adapter.cancelPlan({ commandId, jobId: f.job.id, revision: f.job.revision, confirmed: true });
  assert.deepEqual(result, { state: 'plan_cancelled', remoteStop: 'unconfirmed', physicalStop: 'unconfirmed' });
  assert.equal(f.job.status, 'cancelled'); assert.equal(f.job.revision, 1);
  assert.deepEqual(f.calls.map(c => c.method), ['GET', 'PATCH']);
  assert.equal(JSON.parse(f.calls[1].body).command.id, commandId);
});

void test('missing confirmation, stale observation and mismatched revision cannot submit cancellation', async t => {
  const f = await fixture(t); await f.adapter.readExisting(f.reference);
  const c = { commandId: randomUUID(), jobId: f.job.id, revision: 0, confirmed: false };
  await assert.rejects(f.adapter.cancelPlan(c), /MII_CONFIRMATION_REQUIRED/);
  await assert.rejects(f.adapter.cancelPlan({ ...c, confirmed: true, revision: 1 }), /MII_READBACK_REQUIRED/);
  f.adapter.disconnect();
  await assert.rejects(f.adapter.cancelPlan({ ...c, confirmed: true }), /MII_OBSERVATION_UNAVAILABLE/);
  assert.deepEqual(f.calls.map(v => v.method), ['GET']);
});

void test('lost cancellation response is unknown and cannot be resent after an inconclusive read', async t => {
  const f = await fixture(t); await f.adapter.readExisting(f.reference); f.setMode('network-loss');
  const commandId = randomUUID();
  const c = { commandId, jobId: f.job.id, revision: 0, confirmed: true };
  assert.equal((await f.adapter.cancelPlan(c)).state, 'unknown');
  f.setMode('normal'); await f.adapter.readExisting(f.reference);
  await assert.rejects(f.adapter.cancelPlan({ ...c, commandId: randomUUID() }), /MII_CANCEL_RECONCILIATION_REQUIRED/);
  assert.deepEqual(f.calls.map(v => v.method), ['GET', 'PATCH', 'GET']);
});

void test('lost response after commit reconciles only via the same command event, without another PATCH', async t => {
  const f = await fixture(t); await f.adapter.readExisting(f.reference); f.setMode('apply-then-loss');
  const c = { commandId: randomUUID(), jobId: f.job.id, revision: 0, confirmed: true };
  assert.equal((await f.adapter.cancelPlan(c)).state, 'unknown');
  f.setMode('normal');
  const read = await f.adapter.readExisting(f.reference);
  assert.equal(read.job.status, 'cancelled'); assert.equal(read.revisionChanged, true);
  assert.equal(read.job.events.at(-1).command.id, c.commandId);
  await assert.rejects(f.adapter.cancelPlan({ ...c, commandId: randomUUID(), revision: 1 }), /MII_READBACK_REQUIRED/);
  assert.deepEqual(f.calls.map(v => v.method), ['GET', 'PATCH', 'GET']);
});

void test('local workflow cancellation cannot erase an existing Sky app result', async t => {
  const f = await fixture(t);
  f.setJob({ ...f.job, skyApp: { request: {}, result: { body: '保存済み合成成果' } } });
  await f.adapter.readExisting(f.reference);
  await assert.rejects(f.adapter.cancelPlan({ commandId: randomUUID(), jobId: f.job.id, revision: 0, confirmed: true }), /MII_RESULT_PRESERVATION_REQUIRED/);
  assert.equal(f.job.skyApp.result.body, '保存済み合成成果');
  assert.deepEqual(f.calls.map(v => v.method), ['GET']);
});

void test('a delayed earlier read cannot overwrite a newer job readback', async t => {
  const f = await fixture(t), slow = deferred(); let count = 0;
  const adapter = createMiiWorkAdapter({ now: () => at, fetchImpl: async () => {
    if (++count === 1) return slow.promise;
    return Response.json({ jobs: [f.job], ownerScope: f.reference.ownerScope });
  } });
  adapter.observe(observation());
  const first = adapter.readExisting(f.reference);
  const second = await adapter.readExisting(f.reference);
  assert.equal(second.job.id, f.reference.jobId);
  slow.resolve(Response.json({ jobs: [f.job], ownerScope: f.reference.ownerScope }));
  await assert.rejects(first, /MII_READ_SUPERSEDED/);
});

void test('a missing journal or failed durable claim causes zero cancellation sends', async t => {
  const f = await fixture(t);
  const without = createMiiWorkAdapter({ fetchImpl: f.fetchImpl, now: () => at });
  without.observe(observation()); await without.readExisting(f.reference);
  await assert.rejects(without.cancelPlan({ commandId: randomUUID(), jobId: f.job.id, revision: 0, confirmed: true }), /MII_JOURNAL_REQUIRED/);
  const broken = { ...f.journal, async claim() { throw Object.assign(new Error('fixture fsync failure'), { code: 'EIO' }); } };
  const failed = createMiiWorkAdapter({ fetchImpl: f.fetchImpl, now: () => at, journal: broken });
  failed.observe(observation()); await failed.readExisting(f.reference);
  assert.equal((await failed.cancelPlan({ commandId: randomUUID(), jobId: f.job.id, revision: 0, confirmed: true })).state, 'unknown');
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 0);
  const read = await failed.readExisting(f.reference);
  assert.equal(read.cancelReconciliation, 'pending');
});

void test('durable pending survives adapter recreation and inconclusive GET cannot permit another send', async t => {
  const f = await fixture(t); await f.adapter.readExisting(f.reference); f.setMode('network-loss');
  const c = { commandId: randomUUID(), jobId: f.job.id, revision: 0, confirmed: true };
  assert.equal((await f.adapter.cancelPlan(c)).state, 'unknown');
  assert.deepEqual(await f.journal.read(f.reference), { schema: 'rockstaros.mii-plan-cancel/1',
    ownerScope: f.reference.ownerScope, jobId: f.job.id, revision: 0, commandId: c.commandId });
  f.adapter.close(); f.setMode('normal');
  const restored = createMiiWorkAdapter({ fetchImpl: f.fetchImpl, now: () => at, journal: f.journal });
  restored.observe(observation());
  assert.equal((await restored.readExisting(f.reference)).cancelReconciliation, 'pending');
  await assert.rejects(restored.cancelPlan({ ...c, commandId: randomUUID() }), /MII_CANCEL_RECONCILIATION_REQUIRED/);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
  assert.equal(await f.journal.read({ ...f.reference, ownerScope: await ownerScopeFor('other-owner') }), null);
});

void test('a committed matching event resolves the durable journal after recreation, never via resend', async t => {
  const f = await fixture(t); await f.adapter.readExisting(f.reference); f.setMode('apply-then-loss');
  const c = { commandId: randomUUID(), jobId: f.job.id, revision: 0, confirmed: true };
  assert.equal((await f.adapter.cancelPlan(c)).state, 'unknown'); f.adapter.close(); f.setMode('normal');
  const restored = createMiiWorkAdapter({ fetchImpl: f.fetchImpl, now: () => at, journal: f.journal });
  restored.observe(observation());
  const read = await restored.readExisting(f.reference);
  assert.equal(read.cancelReconciliation, 'clear'); assert.equal(read.job.status, 'cancelled');
  assert.equal(await f.journal.read(f.reference), null);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
});

void test('atomic journal claim prevents two adapters from dispatching two cancellations', async t => {
  const f = await fixture(t);
  const other = createMiiWorkAdapter({ fetchImpl: f.fetchImpl, now: () => at, journal: f.journal });
  other.observe(observation());
  await Promise.all([f.adapter.readExisting(f.reference), other.readExisting(f.reference)]);
  const c = { jobId: f.job.id, revision: 0, confirmed: true };
  const outcomes = await Promise.all([
    f.adapter.cancelPlan({ ...c, commandId: randomUUID() }),
    other.cancelPlan({ ...c, commandId: randomUUID() }),
  ]);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
  assert.equal(outcomes.filter(value => value.state === 'plan_cancelled').length, 1);
  assert.equal((await f.journal.read(f.reference)).jobId, f.job.id);
});

void test('mii adapter reads and cancels the same owner-bound Agent job through the actual work API handler', async t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const path of readdirSync(new URL('../drizzle/', import.meta.url)).filter(x => x.endsWith('.sql') && !x.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${path}`, import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
  }; } }; } };
  const dependencies = new Map([
    ['cloudflare:workers', { env: { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' } }],
    ['@/lib/fund-store', { database: () => db, requestUser: requestAuth.requestUser }],
  ]);
  for (const name of ['bounded-stream', 'owner-intent', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library-store'])
    dependencies.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
  const route = loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), dependencies);
  const agent = await skyAgentLibraryStore(db, 'alice').save(randomUUID(), 0,
    defaultSkyAgentSettings('本人担当', '本人が選んだ用途'), true);
  const jobId = randomUUID();
  const created = await route.POST(new Request('https://fixture.invalid/api/work-jobs', {
    method: 'POST', headers: { origin: 'https://fixture.invalid', 'content-type': 'application/json', 'oai-authenticated-user-id': 'alice' },
    body: JSON.stringify({ id: jobId, title: '合成仕事', templateId: 'article', agentRef: { id: agent.id, revision: agent.revision } }),
  }));
  assert.equal(created.status, 201);
  const calls = [];
  let owner = 'alice', claimBeforeCancel = false;
  const fetchImpl = async (path, init) => {
    calls.push(init.method);
    assert.equal(path, '/api/work-jobs');
    if (init.method === 'PATCH' && claimBeforeCancel) {
      claimBeforeCancel = false;
      const id = JSON.parse(init.body).jobId;
      const saved = JSON.parse(sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(id).payload);
      const now = '2026-10-28T10:00:00.000Z';
      saved.revision++; saved.updatedAt = now;
      saved.toolAttempts[0] = { ...saved.toolAttempts[0], state: 'claimed', claimedAt: now, claimedRevision: saved.revision };
      sqlite.prepare('UPDATE work_jobs SET payload=?, revision=?, updated_at=? WHERE id=?')
        .run(JSON.stringify(saved), saved.revision, now, id);
    }
    const request = new Request('https://fixture.invalid' + path, { ...init,
      headers: { ...init.headers, origin: 'https://fixture.invalid', 'oai-authenticated-user-id': owner } });
    return route[init.method](request);
  };
  const journal = await durableJournal(t);
  const adapter = createMiiWorkAdapter({ fetchImpl, now: () => at, journal }); adapter.observe(observation());
  const ref = { ownerScope: await ownerScopeFor('alice'), jobId, revision: 0, sceneRevision: 1,
    agentId: agent.id, agentRevision: agent.revision, executorDeviceId: 'original-device' };
  const first = await adapter.readExisting(ref);
  assert.equal(first.job.id, jobId); assert.equal(first.agentBinding, 'verified');
  assert.equal(first.executorBinding, 'unverified');
  owner = 'bob';
  await assert.rejects(adapter.readExisting(ref), /MII_OWNER_OR_RESPONSE_MISMATCH/);
  owner = 'alice'; await adapter.readExisting(ref);
  assert.equal((await adapter.cancelPlan({ commandId: randomUUID(), jobId, revision: 0, confirmed: true })).state, 'plan_cancelled');
  const recovered = await adapter.readExisting(ref);
  assert.equal(recovered.job.status, 'cancelled'); assert.equal(recovered.cancelReconciliation, 'clear');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 1);
  assert.deepEqual(calls, ['GET', 'GET', 'GET', 'PATCH', 'GET']);

  const secondId = randomUUID();
  const secondResponse = await route.POST(new Request('https://fixture.invalid/api/work-jobs', {
    method: 'POST', headers: { origin: 'https://fixture.invalid', 'content-type': 'application/json', 'oai-authenticated-user-id': 'alice' },
    body: JSON.stringify({ id: secondId, title: '別の合成仕事', templateId: 'article', agentRef: { id: agent.id, revision: agent.revision } }),
  }));
  assert.equal(secondResponse.status, 201);
  const secondJob = (await secondResponse.json()).job;
  secondJob.revision = 1; secondJob.toolAttempts = [pendingAttempt()];
  sqlite.prepare('UPDATE work_jobs SET payload=?, revision=1 WHERE id=?').run(JSON.stringify(secondJob), secondId);
  const secondRef = { ...ref, jobId: secondId, revision: 1 };
  const second = await adapter.readExisting(secondRef);
  assert.equal(second.agentBinding, 'verified');
  claimBeforeCancel = true;
  const raceResult = await adapter.cancelPlan({ commandId: randomUUID(), jobId: secondId, revision: 1, confirmed: true });
  assert.deepEqual(raceResult, { state: 'plan_cancelled', remoteStop: 'unconfirmed', physicalStop: 'unconfirmed' });
  const raceRead = await adapter.readExisting(secondRef);
  assert.equal(raceRead.job.revision, 3); assert.equal(raceRead.cancelReconciliation, 'clear');
  assert.equal(raceRead.job.toolAttempts[0].state, 'stop_requested');
});

void test('input fence is invalidated by scene/place/boot changes, lost tracking, detach and reconnect', async t => {
  for (const patch of [{ sceneRevision: 2 }, { placeEpoch: 2 }, { bootId: 'boot-2' }, { tracking: 'lost' }, { attached: false }]) {
    const f = await fixture(t); await f.adapter.readExisting(f.reference);
    const guard = f.adapter.createInputGuard(); assert.equal(guard(), true);
    f.adapter.observe(observation({ sequence: 2, ...patch })); assert.equal(guard(), false);
    f.adapter.disconnect(); assert.equal(guard(), false);
    assert.equal(f.calls.filter(call => call.method !== 'GET').length, 0);
  }
});

void test('input fence expires, rejects a regressed clock and cannot be renewed by rereading', async t => {
  const f = await fixture(t); let time = at;
  const a = createMiiWorkAdapter({ fetchImpl: f.fetchImpl, now: () => time, journal: f.journal });
  a.observe(observation()); await a.readExisting(f.reference); const guard = a.createInputGuard();
  assert.equal(guard(), true); time = at - 1; assert.equal(guard(), false);
  time = at; assert.equal(guard(), false);
  a.observe(observation({ sequence: 2 })); await a.readExisting(f.reference); const freshGuard = a.createInputGuard();
  time = at + 10000; assert.equal(freshGuard(), false); time = at + 5000; assert.equal(freshGuard(), false);
  time = at + 10000; assert.equal(guard(), false); assert.throws(() => a.createInputGuard());
  a.observe(observation({ sequence: 3, observedAt: time, expiresAt: time + 10000 }));
  await a.readExisting(f.reference); const validAgain = a.createInputGuard(); assert.equal(validAgain(), true); assert.equal(guard(), false);
  time = NaN; assert.equal(validAgain(), false); time = at + 10000; assert.equal(validAgain(), false);
});

void test('input requires same bound agent, active clean job and reconciled cancellation', async t => {
  for (const patch of [{ status: 'cancelled' }, { toolAttempts: [{ id: randomUUID(), state: 'pending' }] }]) {
    const f = await fixture(t); f.setJob({ ...f.job, ...patch }); await f.adapter.readExisting(f.reference);
    assert.throws(() => f.adapter.createInputGuard(), /MII_INPUT_UNAVAILABLE/);
  }
  const f = await fixture(t); await f.adapter.readExisting(f.reference); const guard = f.adapter.createInputGuard();
  f.setJob({ ...f.job, agentBinding: { ...f.job.agentBinding, agentId: 'other-agent' } });
  await assert.rejects(f.adapter.readExisting(f.reference)); assert.equal(guard(), false);
  f.setJob({ ...f.job, agentBinding: { ...f.job.agentBinding, agentId: f.reference.agentId } });
  await f.adapter.readExisting(f.reference); f.setMode('network-loss');
  assert.equal((await f.adapter.cancelPlan({ commandId: randomUUID(), jobId: f.job.id, revision: f.job.revision, confirmed: true })).state, 'unknown');
  await f.adapter.readExisting(f.reference); assert.throws(() => f.adapter.createInputGuard(), /MII_INPUT_UNAVAILABLE/);
});

void test('input fence rejects a backwards clock even within the original valid observation window', async t => {
  const f = await fixture(t); let time = at;
  const adapter = createMiiWorkAdapter({ fetchImpl: f.fetchImpl, now: () => time, journal: f.journal });
  adapter.observe(observation()); await adapter.readExisting(f.reference);
  const guard = adapter.createInputGuard();
  time = at + 5000; assert.equal(guard(), true);
  time = at + 4000; assert.equal(guard(), false);
  time = at + 6000; assert.equal(guard(), false, 'clock recovery cannot revive the old input');
  adapter.observe(observation({ sequence: 2, observedAt: time, expiresAt: time + 10000 }));
  await adapter.readExisting(f.reference); assert.equal(adapter.createInputGuard()(), true);
  assert.equal(guard(), false);
});
