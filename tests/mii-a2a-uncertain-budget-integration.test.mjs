import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, open, readFile, rm, unlink } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { a2aDelegationStore, A2ADelegationStoreError } from '../lib/a2a-delegation-store.ts';
import { createMiiWorkAdapter } from '../lib/mii-work-adapter.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import * as requestAuth from '../lib/request-auth.ts';
import { loadRouteFixture } from './route-fixture.mjs';

function database(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(x => x.endsWith('.sql') && !x.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  return { sqlite, prepare(sql) { return { bind(...values) { return {
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    runSync() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
    async run() { return this.runSync(); },
  }; } }; }, async batch(statements) { sqlite.exec('BEGIN IMMEDIATE'); try {
    const result = statements.map(s => s.runSync()); sqlite.exec('COMMIT'); return result;
  } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
}
async function journalFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'mii-a2a-journal-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = key => join(dir, createHash('sha256').update(key.ownerScope + '\0' + key.jobId).digest('hex'));
  const syncDir = async () => { const handle = await open(dir, 'r'); try { await handle.sync(); } finally { await handle.close(); } };
  const journal = {
    async read(key) { try { return JSON.parse(await readFile(filename(key), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
    async claim(record) { let handle; try { handle = await open(filename(record), 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') return 'occupied'; throw error; }
      try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); } finally { await handle.close(); } await syncDir(); return 'claimed'; },
    async settle(record) { if (JSON.stringify(await journal.read(record)) !== JSON.stringify(record)) return false;
      await unlink(filename(record)); await syncDir(); return true; },
  }; return journal;
}
async function setup(t) {
  const db = database(t), owner = 'alice', scope = await ownerScopeFor(owner), agentId = randomUUID(), jobId = randomUUID();
  const agent = await skyAgentLibraryStore(db, owner).save(agentId, 0, defaultSkyAgentSettings('自由な担当', '合成の目的'), true);
  const dependencies = new Map([
    ['cloudflare:workers', { env: { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' } }],
    ['@/lib/fund-store', { database: () => db, requestUser: requestAuth.requestUser }],
    ['@/lib/rockstar-device-link', { requestRockstarUser: async request => request.headers.get('oai-authenticated-user-id') }],
  ]);
  for (const name of ['bounded-stream', 'owner-intent', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library-store', 'a2a-parent-controller'])
    dependencies.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
  const delegationPath = new URL('../app/api/sky/a2a-delegations/route.ts', import.meta.url);
  const workPath = new URL('../app/api/work-jobs/route.ts', import.meta.url);
  for (const file of [delegationPath, workPath]) for (const match of readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g))
    if (!dependencies.has(match[1])) dependencies.set(match[1], {});
  const work = loadRouteFixture(workPath, dependencies), delegation = loadRouteFixture(delegationPath, dependencies);
  let activeOwner = owner;
  const request = (path, init = {}) => new Request('https://fixture.invalid' + path, { ...init,
    headers: { ...init.headers, origin: 'https://fixture.invalid', 'oai-authenticated-user-id': activeOwner } });
  const created = await work.POST(request('/api/work-jobs', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: jobId, title: '合成の同じ仕事', templateId: 'article', agentRef: { id: agent.id, revision: agent.revision } }) }));
  assert.equal(created.status, 201); const job = (await created.json()).job;
  let dropCancel = false, dropBeforeCancel = false, patchCount = 0;
  const fetchImpl = async (path, init) => {
    const target = path.startsWith('/api/work-jobs') ? work : delegation;
    if (path === '/api/work-jobs' && init.method === 'PATCH' && dropBeforeCancel) { patchCount++; dropBeforeCancel = false; throw new Error('synthetic lost request before commit'); }
    const response = await target[init.method](request(path, init));
    if (path === '/api/work-jobs' && init.method === 'PATCH') { patchCount++; if (dropCancel) { dropCancel = false; throw new Error('synthetic lost local cancel reply'); } }
    return response;
  };
  const journal = await journalFixture(t), now = () => 1_300;
  const observation = { bootId: 'synthetic', placeEpoch: 1, sequence: 1, sceneRevision: 1, observedAt: 1_000, expiresAt: 5_000, attached: true, tracking: 'tracked' };
  const adapter = createMiiWorkAdapter({ fetchImpl, journal, now }); adapter.observe(observation);
  const ref = { jobId, ownerScope: scope, revision: job.revision, sceneRevision: 1, agentId: agent.id, agentRevision: agent.revision };
  const store = a2aDelegationStore(db);
  const input = { id: randomUUID(), parentJobId: jobId, idempotencyKey: 'fixture:one', messageId: 'fixture-message',
    targetOrigin: 'https://agent.example.test', targetAgentName: 'Synthetic', targetAgentVersion: '1.0', protocolVersion: '1.0',
    inputSha256: 'a'.repeat(64), authorizationSha256: 'b'.repeat(64), budgetCurrency: 'USD', budgetLimitMinor: 300,
    parentBudgetLimitMinor: 900, continueWhileDeviceOffline: true, deadlineAt: 2_000 };
  await store.prepare(owner, input, 1_000);
  const approved = await store.approve(owner, input.id, input.authorizationSha256,
    { ciphertext: 'fixture-ciphertext', nonce: 'fixture-nonce', inputSha256: input.inputSha256, keyVersion: 'aes-256-gcm-v1' }, 1_050);
  return { db, owner, scope, jobId, agent, ref, adapter, observation, fetchImpl, journal, store, input, approved,
    dropNextCancel() { dropCancel = true; }, dropBeforeNextCancel() { dropBeforeCancel = true; },
    switchOwner(value) { activeOwner = value; }, patchCount: () => patchCount };
}

void test('same mii job reads held delegation budget across unknown send and lost local stop response', async t => {
  const f = await setup(t), { store, owner, input, jobId } = f;
  assert.equal(f.approved.state, 'prepared');
  const initial = await f.adapter.readExisting(f.ref); assert.equal(initial.agentBinding, 'verified'); assert.equal(initial.job.id, jobId);
  assert.equal((await store.getBudgetReservation(owner, input.id)).state, 'held');
  assert.equal((await f.adapter.readBudget()).budget.reservedMinor, 300);
  f.switchOwner('bob'); await assert.rejects(f.adapter.readExisting(f.ref), /MII_OWNER_OR_RESPONSE_MISMATCH/);
  await assert.rejects(f.adapter.readBudget(), /MII_BUDGET_READ_UNAVAILABLE/);
  f.switchOwner(owner); await f.adapter.readExisting(f.ref);
  const claimed = await store.claimDispatch(owner, input.id, 1_100);
  assert.equal(await store.claimDispatch(owner, input.id, 1_101), null);
  const sending = await store.beginRemoteSend(owner, input.id, claimed.revision, 1_102);
  const unknown = await store.markIndeterminate(owner, input.id, sending.revision, 1_103);
  assert.equal(unknown.state, 'indeterminate'); assert.equal(await store.claimDispatch(owner, input.id, 1_104), null);
  // The pre-send failure transition would release a reservation, but cannot
  // be applied once an external send might already have happened.
  await assert.rejects(store.markPreflightFailed(owner, input.id, unknown.revision, 1_104), error => error instanceof A2ADelegationStoreError);
  assert.equal((await store.getBudgetReservation(owner, input.id)).state, 'held');
  assert.equal((await f.adapter.readBudget()).budget.reservedMinor, 300);
  const working = await store.reconcileRemoteTask(owner, input.id, unknown.revision,
    { id: 'synthetic-remote-task', contextId: 'synthetic-context', state: 'TASK_STATE_WORKING' }, 1_105);
  const requested = await store.requestCancel(owner, input.id, 1_106);
  const canceling = await store.beginCancelAttempt(owner, input.id, requested.revision, 1_107);
  const cancelUnknown = await store.markCancelUnconfirmed(owner, input.id, canceling.revision, 1_108);
  assert.equal(working.state, 'working'); assert.equal(cancelUnknown.state, 'cancel_unconfirmed');
  await assert.rejects(store.beginCancelAttempt(owner, input.id, requested.revision, 1_109), error => error instanceof A2ADelegationStoreError);
  await assert.rejects(store.settleUsageReceipt(owner, input.id, { providerId: 'fake', receiptId: 'no-terminal', signature: 's'.repeat(86), currency: 'USD', amountMinor: 1, issuedAt: 1_110 }, 1_110));
  assert.equal((await store.getBudgetReservation(owner, input.id)).state, 'held');
  f.dropNextCancel(); const stop = await f.adapter.cancelPlan({ commandId: randomUUID(), jobId, revision: f.ref.revision, confirmed: true });
  assert.equal(stop.state, 'unknown'); assert.equal(f.patchCount(), 1);
  f.adapter.disconnect(); f.adapter.close();
  const resumed = createMiiWorkAdapter({ fetchImpl: f.fetchImpl, journal: f.journal, now: () => 1_300 });
  resumed.observe({ ...f.observation, placeEpoch: 2, sequence: 2 });
  const restored = await resumed.readExisting(f.ref); assert.equal(restored.job.id, jobId);
  assert.equal(restored.job.status, 'cancelled'); assert.equal(restored.cancelReconciliation, 'clear');
  assert.equal((await resumed.readBudget()).budget.reservedMinor, 300); assert.equal((await resumed.readBudget()).budget.settledMinor, 0);
  assert.equal((await store.get(owner, input.id)).state, 'cancel_unconfirmed');
  assert.equal((await store.getBudgetReservation(owner, input.id)).state, 'held'); assert.equal(f.patchCount(), 1);
  resumed.close();
});

void test('same mii job observes one internal settlement after a synthetic terminal receipt and replay', async t => {
  const f = await setup(t), { store, owner, input, jobId } = f;
  const readback = await f.adapter.readExisting(f.ref); assert.equal(readback.job.id, jobId);
  const claims = await Promise.allSettled([store.claimDispatch(owner, input.id, 1_100), store.claimDispatch(owner, input.id, 1_100)]);
  assert.equal(claims.filter(result => result.status === 'fulfilled' && result.value).length, 1);
  assert.ok(claims.some(result => result.status === 'rejected' && result.reason.code === 'delegation_revision_conflict'));
  const claimed = claims.find(result => result.status === 'fulfilled' && result.value).value;
  const sending = await store.beginRemoteSend(owner, input.id, claimed.revision, 1_101);
  const completed = await store.recordTaskReceipt(owner, input.id, sending.revision,
    { id: 'synthetic-completed-task', state: 'TASK_STATE_COMPLETED' }, 1_102);
  await store.markArtifactsCaptured(owner, input.id, completed.remoteTaskId, completed.revision, 1_103);
  // The store consumes an already-validated receipt. This fixture intentionally
  // exercises internal accounting only and does not validate a real signature.
  const receipt = { schema: 'rock-a2a-provider-usage-receipt/1', providerId: 'fixture-provider', keyId: 'fixture-key',
    receiptId: 'fixture-receipt', ownerUserId: owner, parentJobId: jobId, delegationId: input.id,
    taskId: 'synthetic-completed-task', agentOrigin: input.targetOrigin, agentName: input.targetAgentName,
    agentVersion: input.targetAgentVersion, currency: 'USD', amountMinor: 47, pricingVersion: 'fixture-1', issuedAt: 1_102,
    usage: [{ meter: 'synthetic', quantity: 1, unit: 'call', amountMinor: 47 }], signature: 's'.repeat(86) };
  const [first, replay] = await Promise.all([store.settleUsageReceipt(owner, input.id, receipt, 1_110),
    store.settleUsageReceipt(owner, input.id, receipt, 1_111)]);
  assert.equal(first.reservation.state, 'settled'); assert.equal(replay.reservation.settledMinor, 47);
  await assert.rejects(store.settleUsageReceipt(owner, input.id, { ...receipt, receiptId: 'different', amountMinor: 48 }, 1_112),
    error => error instanceof A2ADelegationStoreError && error.code === 'usage_receipt_conflict');
  const budget = await f.adapter.readBudget(); assert.equal(budget.jobId, jobId);
  assert.equal(budget.budget.reservedMinor, 0); assert.equal(budget.budget.settledMinor, 47);
  assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM a2a_usage_receipts WHERE delegation_id=?').get(input.id).n, 1);
  assert.equal(await store.getBudget('other-owner', jobId), null);
  f.adapter.close();
});

void test('lost local stop before commit remains pending and cannot be automatically resent', async t => {
  const f = await setup(t), { store, owner, input, jobId } = f;
  await f.adapter.readExisting(f.ref);
  const claimed = await store.claimDispatch(owner, input.id, 1_100);
  const sending = await store.beginRemoteSend(owner, input.id, claimed.revision, 1_101);
  await store.markIndeterminate(owner, input.id, sending.revision, 1_102);
  f.dropBeforeNextCancel();
  const stopped = await f.adapter.cancelPlan({ commandId: randomUUID(), jobId, revision: f.ref.revision, confirmed: true });
  assert.equal(stopped.state, 'unknown'); assert.equal(f.patchCount(), 1);
  f.adapter.disconnect(); f.adapter.close();
  const resumed = createMiiWorkAdapter({ fetchImpl: f.fetchImpl, journal: f.journal, now: () => 1_300 });
  resumed.observe({ ...f.observation, placeEpoch: 2, sequence: 2 });
  const readback = await resumed.readExisting(f.ref); assert.equal(readback.cancelReconciliation, 'pending');
  assert.equal(readback.job.status, 'active'); assert.equal((await resumed.readBudget()).budget.reservedMinor, 300);
  await assert.rejects(resumed.cancelPlan({ commandId: randomUUID(), jobId, revision: readback.job.revision, confirmed: true }), /MII_CANCEL_RECONCILIATION_REQUIRED/);
  assert.equal(f.patchCount(), 1); assert.equal((await store.getBudgetReservation(owner, input.id)).state, 'held');
  resumed.close();
});
