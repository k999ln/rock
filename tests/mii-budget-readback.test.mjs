import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createMiiWorkAdapter } from '../lib/mii-work-adapter.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { createWorkJob } from '../lib/workflow.ts';

const makeFixture = async () => {
  const ownerScope = await ownerScopeFor('mii-budget-fixture-owner');
  const job = createWorkJob({ id: randomUUID(), title: 'fixture', templateId: 'cloud-agent' });
  const agentId = randomUUID();
  job.agentBinding = { schema: 'rockstaros.work-agent-binding/1', agentId, agentRevision: 1, requestDigest: 'a'.repeat(64) };
  let clock = 1000, mode = 'valid', pending = null; const calls = [];
  const pool = { ownerUserId: 'mii-budget-fixture-owner', parentJobId: job.id, currency: 'USD', budgetLimitMinor: 900, reservedMinor: 200, settledMinor: 300, revision: 4, updatedAt: 900 };
  const response = async (url, init) => {
    calls.push({ url, method: init.method });
    if (url === '/api/work-jobs') return Response.json({ jobs: [job], ownerScope });
    assert.equal(url, `/api/sky/a2a-delegations?parentJobId=${job.id}`); assert.equal(init.method, 'GET');
    if (mode === 'wait') return await new Promise(resolve => { pending = resolve; });
    if (mode === 'http-error') return Response.json({}, { status: 503 });
    const value = { ownerScope, parentJobId: job.id, budget: { ...pool } };
    if (mode === 'other-owner') value.ownerScope = await ownerScopeFor('other');
    if (mode === 'other-job') value.parentJobId = randomUUID();
    if (mode === 'pool-other-job') value.budget.parentJobId = randomUUID();
    if (mode === 'pool-other-owner') value.budget.ownerUserId = 'other';
    if (mode === 'missing-scope') delete value.ownerScope;
    if (mode === 'invalid') value.budget.reservedMinor = -1;
    if (mode === 'invariant') value.budget.reservedMinor = 901;
    if (mode === 'absent') value.budget = null;
    return Response.json(value);
  };
  const adapter = createMiiWorkAdapter({ fetchImpl: response, now: () => clock });
  adapter.observe({ bootId: 'boot', placeEpoch: 1, sequence: 1, sceneRevision: 2, observedAt: 1000, expiresAt: 2000, attached: true, tracking: 'tracked' });
  await adapter.readExisting({ jobId: job.id, ownerScope, revision: job.revision, sceneRevision: 2, agentId, agentRevision: 1 });
  return { adapter, job, ownerScope, calls, pool, mode: v => { mode = v; }, clock: v => { clock = v; }, release: value => pending(value) };
};

void test('mii reads a same-owner same-job A2A snapshot without authorizing work or equating it to an MCP charge', async () => {
  const f = await makeFixture(), result = await f.adapter.readBudget();
  assert.deepEqual(result, { jobId: f.job.id, jobRevision: f.job.revision, readAt: 1000,
    budget: { currency: 'USD', budgetLimitMinor: 900, reservedMinor: 200, settledMinor: 300, revision: 4, updatedAt: 900 } });
  assert.deepEqual(f.calls.map(c => c.method), ['GET', 'GET']);
  f.mode('absent'); assert.equal((await f.adapter.readBudget()).budget, null);
});

void test('mii rejects wrong-owner, wrong-job, malformed, old-server and unavailable budget responses', async () => {
  for (const mode of ['other-owner', 'other-job', 'pool-other-job', 'pool-other-owner', 'missing-scope', 'invalid', 'invariant', 'http-error']) {
    const f = await makeFixture(); f.mode(mode);
    await assert.rejects(f.adapter.readBudget(), /MII_(OWNER_OR_BUDGET_MISMATCH|BUDGET_INVALID|BUDGET_READ_REJECTED)/, mode);
    assert.equal(f.calls.filter(c => c.method !== 'GET').length, 0);
  }
});

void test('expired or detached observations cannot yield a budget after a delayed reply', async () => {
  for (const mode of ['expired', 'detached']) {
    const f = await makeFixture(); f.mode('wait'); const result = f.adapter.readBudget();
    if (mode === 'expired') f.clock(2000); else f.adapter.disconnect();
    f.release(Response.json({ ownerScope: f.ownerScope, parentJobId: f.job.id, budget: f.pool }));
    await assert.rejects(result, /MII_(OBSERVATION_UNAVAILABLE|CONTEXT_CHANGED)/);
  }
});

void test('a later budget read supersedes an earlier delayed response', async () => {
  const f = await makeFixture(); f.mode('wait'); const prior = f.adapter.readBudget();
  f.mode('valid'); const later = await f.adapter.readBudget(); assert.equal(later.budget.reservedMinor, 200);
  f.release(Response.json({ ownerScope: f.ownerScope, parentJobId: f.job.id, budget: f.pool }));
  await assert.rejects(prior, /MII_READ_SUPERSEDED/);
});

void test('actual delegation GET binds budget readback to authenticated owner and parent without breaking legacy fields', async () => {
  const { readFileSync } = await import('node:fs');
  const { loadRouteFixture } = await import('./route-fixture.mjs');
  const path = new URL('../app/api/sky/a2a-delegations/route.ts', import.meta.url);
  const source = readFileSync(path, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  const deps = new Map(imports.map(name => [name, {}]));
  const jobId = randomUUID(), pool = { parentJobId: jobId, currency: 'USD', budgetLimitMinor: 1000, reservedMinor: 200, settledMinor: 300, revision: 1, updatedAt: 900 };
  deps.set('cloudflare:workers', { env: {} });
  deps.set('@/lib/owner-intent', { ownerScopeFor });
  deps.set('@/lib/fund-store', { database: () => ({}) });
  deps.set('@/lib/rockstar-device-link', { requestRockstarUser: async request => {
    const user = request.headers.get('x-fixture-owner'); if (!user) throw new Error('UNAUTHORIZED'); return user;
  } });
  deps.set('@/lib/a2a-delegation-store', { A2ADelegationStoreError: class extends Error {}, a2aDelegationStore: () => ({
    listForParent: async () => [], listBudgetReservations: async () => [], getBudget: async (owner, parent) => owner === 'alice' && parent === jobId ? pool : null,
  }) });
  deps.set('@/lib/a2a-parent-controller', { buildA2AParentControllerSnapshot: () => ({}) });
  const route = loadRouteFixture(path, deps);
  const get = owner => route.GET(new Request(`http://local/api/sky/a2a-delegations?parentJobId=${jobId}`, { headers: owner ? { 'x-fixture-owner': owner } : {} }));
  const alice = await get('alice'), a = await alice.json();
  assert.equal(alice.status, 200); assert.equal(alice.headers.get('Cache-Control'), 'no-store');
  assert.equal(a.ownerScope, await ownerScopeFor('alice')); assert.equal(a.parentJobId, jobId); assert.equal(a.budget.reservedMinor, 200);
  assert.deepEqual(a.delegations, []); assert.deepEqual(a.reservations, []); assert.ok(a.controller);
  const bob = await get('bob'), b = await bob.json(); assert.equal(b.ownerScope, await ownerScopeFor('bob')); assert.equal(b.budget, null);
  assert.equal((await get(null)).status, 401);
});

void test('an owner-scope digest delayed across observation loss cannot return an old budget', async () => {
  const f = await makeFixture();
  const subtle = globalThis.crypto.subtle, original = subtle.digest.bind(subtle);
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  Object.defineProperty(subtle, 'digest', { configurable: true, value: async (...args) => { entered(); await gate; return original(...args); } });
  try {
    const reading = f.adapter.readBudget(); await started; f.adapter.disconnect(); release();
    await assert.rejects(reading, /MII_(OBSERVATION_UNAVAILABLE|CONTEXT_CHANGED)/);
  } finally { release(); delete subtle.digest; }
});
