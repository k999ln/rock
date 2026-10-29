import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { loadRouteFixture } from './route-fixture.mjs';
import * as library from '../lib/sky-agent-library.ts';
import * as agentStore from '../lib/sky-agent-library-store.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import { createEveAgent, prepareEveAgentPending, readEveAgentPending, reserveEveAgentPending, reconcileEveAgentCreation } from '../lib/eve-agent-creation.ts';

const id = '11111111-1111-4111-8111-111111111111';
const settings = library.defaultSkyAgentSettings('文章担当', '目的・役割: 要約\n受け取るもの: 文章\n期待する成果: 要点');
const scopeA = await ownerIntent.ownerScopeFor('owner-a');
const scopeB = await ownerIntent.ownerScopeFor('owner-b');
const request = { ownerScope: scopeA, id, settings };
const pending = await prepareEveAgentPending(request);
function storage() { const rows = new Map(); return { rows, getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) }; }
const saved = { id, ...settings, source: 'personal', sourceTool: null, revision: 1, updatedAt: 1 };
const json = (value, status = 200) => Response.json(value, { status });

void test('creates exactly once, with owner precondition and saved role only', async () => {
  const calls = [], store = storage();
  const result = await createEveAgent(async (url, init) => {
    calls.push([url, init]); assert.deepEqual(readEveAgentPending(store, scopeA), pending);
    assert.ok(!JSON.stringify([...store.rows]).includes(settings.instructions));
    return json({ agent: saved });
  }, request, pending, store);
  assert.equal(result.state, 'saved'); assert.equal(calls.length, 1);
  assert.equal(calls[0][1].headers['X-Rock-Owner-Scope'], scopeA);
  assert.deepEqual(JSON.parse(calls[0][1].body), { id, revision: 0, settings, create: true });
});
void test('explicit 4xx is never changed into a successful reconciliation', async () => {
  let calls = 0; const store = storage();
  const result = await createEveAgent(async () => { calls++; return json({ error: 'changed' }, 400); }, request, pending, store);
  assert.equal(readEveAgentPending(store, scopeA), null);
  assert.deepEqual(result, { state: 'rejected', error: 'changed' }); assert.equal(calls, 1);
});
void test('lost response is reconciled only with same owner, id, revision and role', async () => {
  for (const [owner, agent, expected] of [
    [scopeA, saved, 'saved'], [scopeB, saved, 'unknown'],
    [scopeA, { ...saved, instructions: 'other role' }, 'unknown'],
    [scopeA, { ...saved, revision: 2 }, 'unknown'],
    [scopeA, { ...saved, sourceTool: 'tool' }, 'unknown'],
  ]) {
    let calls = 0; const store = storage();
    const result = await createEveAgent(async () => { calls++; if (calls === 1) throw new Error('lost'); return json({ ownerScope: owner, agent }); }, request, pending, store);
    assert.equal(result.state, expected); assert.equal(calls, 2);
  }
});
void test('failed or missing read remains unknown without another write', async () => {
  let calls = 0; const store = storage(); reserveEveAgentPending(store, pending);
  const result = await reconcileEveAgentCreation(async () => { calls++; return json({ error: 'not found' }, 404); }, pending, store);
  assert.equal(result.state, 'unknown'); assert.equal(calls, 1);
});
void test('unconfirmed create survives reload and cannot be replaced before same-id readback', async () => {
  const store = storage(); let writes = 0;
  let result = await createEveAgent(async (_url, init) => { if (init?.method === 'PUT') { writes++; throw new Error('lost'); } return json({}, 404); }, request, pending, store);
  assert.equal(result.state, 'unknown');
  const restored = readEveAgentPending(store, scopeA); assert.deepEqual(restored, pending);
  assert.equal(readEveAgentPending(store, scopeB), null);
  const other = await prepareEveAgentPending({ ...request, id: '22222222-2222-4222-8222-222222222222' });
  await assert.rejects(createEveAgent(async () => { writes++; return json({}); }, { ...request, id: other.id }, other, store));
  assert.equal(writes, 1);
  result = await reconcileEveAgentCreation(async () => json({ ownerScope: scopeB, agent: saved }), restored, store);
  assert.equal(result.state, 'unknown'); assert.deepEqual(readEveAgentPending(store, scopeA), pending);
  result = await reconcileEveAgentCreation(async () => json({ ownerScope: scopeA, agent: saved }), restored, store);
  assert.equal(result.state, 'saved'); assert.equal(readEveAgentPending(store, scopeA), null);
});
void test('storage write/readback failure blocks dispatch before PUT', async () => {
  for (const mode of ['set', 'readback']) {
    const store = storage(); const originalGet = store.getItem; let writes = 0, reads = 0;
    if (mode === 'set') store.setItem = () => { throw new Error('blocked'); };
    if (mode === 'readback') store.getItem = key => { if (++reads > 1) throw new Error('blocked'); return originalGet(key); };
    await assert.rejects(createEveAgent(async () => { writes++; return json({ agent: saved }); }, request, pending, store));
    assert.equal(writes, 0);
  }
});
void test('corrupt or another-owner pending cannot be overwritten', () => {
  const store = storage(); reserveEveAgentPending(store, pending);
  const key = [...store.rows.keys()][0];
  store.rows.set(key, JSON.stringify({ ...pending, ownerScope: scopeB }));
  assert.throws(() => readEveAgentPending(store, scopeA));
  assert.throws(() => reserveEveAgentPending(store, pending));
});
void test('agent API binds authenticated owner and retains previous client/CAS behavior', async t => {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  for (const f of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(`../drizzle/${f}`, import.meta.url), 'utf8'));
  const db = { prepare(query) { return { bind(...args) { return {
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
  }; } }; } };
  class OperationError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const route = loadRouteFixture(new URL('../app/api/sky/agents/route.ts', import.meta.url), new Map([
    ['@/lib/fund-store', { database: () => db, requestUser: async request => request.headers.get('x-test-owner') }],
    ['@/lib/operations', { OperationError }], ['@/lib/owner-intent', ownerIntent], ['@/lib/sky-agent-library-store', agentStore], ['@/lib/sky-agent-library', library],
  ]));
  const request = (method, owner, body, expected) => new Request('https://fixture.invalid/api/sky/agents', {
    method, headers: { origin: 'https://fixture.invalid', 'x-test-owner': owner, ...(expected ? { 'x-rock-owner-scope': expected } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let response = await route.GET(request('GET', 'owner-a')); assert.equal((await response.json()).ownerScope, scopeA);
  const body = { id, revision: 0, settings, create: true };
  response = await route.PUT(request('PUT', 'owner-b', body, scopeA)); assert.equal(response.status, 409);
  assert.equal((await agentStore.skyAgentLibraryStore(db, 'owner-b').list()).length, 0);
  response = await route.PUT(request('PUT', 'owner-a', body, scopeA)); assert.equal(response.status, 200);
  response = await route.PUT(request('PUT', 'owner-a', body, scopeA)); assert.equal(response.status, 409);
  response = await route.PUT(request('PUT', 'owner-a', { id, revision: 1, settings: { ...settings, name: 'updated' } }));
  assert.equal(response.status, 200); assert.equal((await response.json()).agent.revision, 2);
  response = await route.PUT(request('PUT', 'owner-a', { id, revision: 1, settings })); assert.equal(response.status, 409);
  assert.equal((await agentStore.skyAgentLibraryStore(db, 'owner-a').get(id)).name, 'updated');
  const otherId = '22222222-2222-4222-8222-222222222222';
  const other = { ...settings, name: '確認担当', instructions: '目的・役割: 差分確認\n受け取るもの: 仕様\n期待する成果: 変更点' };
  response = await route.PUT(request('PUT', 'owner-a', { id: otherId, revision: 0, settings: other, create: true }, scopeA));
  assert.equal(response.status, 200);
  assert.equal((await agentStore.skyAgentLibraryStore(db, 'owner-a').get(otherId)).instructions, other.instructions);
  assert.equal((await agentStore.skyAgentLibraryStore(db, 'owner-a').get(id)).name, 'updated');
});

void test('HTTP 408 retains uncertainty until exact same-owner readback', async () => {
  const store = storage(); let putCalls = 0, getCalls = 0;
  const result = await createEveAgent(async (_url, init) => {
    if (init?.method === 'PUT') { putCalls++; return json({ error: 'timeout' }, 408); }
    getCalls++; return json({}, 404);
  }, request, pending, store);
  assert.equal(result.state, 'unknown');
  assert.equal(putCalls, 1); assert.equal(getCalls, 1);
  assert.deepEqual(readEveAgentPending(store, scopeA), pending);
  const different = await prepareEveAgentPending({ ...request, id: '22222222-2222-4222-8222-222222222222' });
  await assert.rejects(createEveAgent(async () => { throw Error('must not send'); }, { ...request, id: different.id }, different, store));
});

void test('HTTP 408 accepts only same-owner same-id confirmed readback', async () => {
  for (const [owner, expected] of [[scopeA, 'saved'], [scopeB, 'unknown']]) {
    const store = storage(); let puts = 0, reads = 0;
    const result = await createEveAgent(async (_url, init) => {
      if (init?.method === 'PUT') { puts++; return json({ error: 'timeout' }, 408); }
      reads++; return json({ ownerScope: owner, agent: saved });
    }, request, pending, store);
    assert.equal(result.state, expected); assert.equal(puts, 1); assert.equal(reads, 1);
    assert.equal(readEveAgentPending(store, scopeA) === null, expected === 'saved');
  }
});

void test('HTTP 409 after transport replay reconciles only the original owner and exact saved role', async () => {
  for (const [owner, agent, status, expected] of [[scopeA, saved, 200, 'saved'], [scopeB, saved, 200, 'unknown'], [scopeA, { ...saved, instructions: 'different' }, 200, 'unknown'], [scopeA, null, 404, 'unknown']]) {
    const store = storage(); let puts = 0, reads = 0;
    const result = await createEveAgent(async (_url, init) => {
      if (init?.method === 'PUT') { puts++; return json({ error: 'conflict' }, 409); }
      reads++; return json({ ownerScope: owner, agent }, status);
    }, request, pending, store);
    assert.equal(result.state, expected); assert.equal(puts, 1); assert.equal(reads, 1);
    assert.equal(readEveAgentPending(store, scopeA) === null, expected === 'saved');
  }
});

void test('Agent route preserves an older attachment and requirements when old settings editor saves only five fields', async t => {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  for (const f of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
    sql.exec(readFileSync(new URL(`../drizzle/${f}`, import.meta.url), 'utf8'));
  const db = { prepare(query) { return { bind(...args) { return {
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
  }; } }; } };
  class OperationError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const route = loadRouteFixture(new URL('../app/api/sky/agents/route.ts', import.meta.url), new Map([
    ['@/lib/fund-store', { database: () => db, requestUser: async request => request.headers.get('x-test-owner') }],
    ['@/lib/operations', { OperationError }], ['@/lib/owner-intent', ownerIntent], ['@/lib/sky-agent-library-store', agentStore], ['@/lib/sky-agent-library', library],
  ]));
  const attachment = { schema: 'sky.object-attachment/1', objectName: '合成対象', input: 'sensor', output: 'signal' };
  const requirements = { inputFields: ['value'], outputFields: ['summary'], packageKey: 'dev.fixture.tool@1.0.0', executionTarget: 'pc' };
  const original = { ...settings, provider: 'openai', model: 'fixture-model-v2', attachment, requirements };
  sql.prepare('INSERT INTO sky_agent_settings(owner_user_id,id,source_tool,settings,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('owner-a', id, null, JSON.stringify(original), 1, 1, 1);
  const request = (method, owner, payload, exact = false) => new Request(`https://fixture.invalid/api/sky/agents${exact ? `?id=${id}` : ''}`, {
    method, headers: { origin: 'https://fixture.invalid', 'x-test-owner': owner, 'content-type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const edit = { id, revision: 1, settings: { name: '編集', instructions: '新しい指示', enabled: true, provider: 'openai', model: 'fixture-model-v2' } };
  assert.equal((await route.PUT(request('PUT', 'owner-b', edit))).status, 404);
  assert.equal((await route.PUT(request('PUT', 'owner-a', edit))).status, 200);
  assert.equal((await route.PUT(request('PUT', 'owner-a', edit))).status, 409);
  const response = await route.GET(request('GET', 'owner-a', null, true)), result = await response.json();
  assert.equal(result.ownerScope, scopeA); assert.equal(result.agent.id, id); assert.equal(result.agent.revision, 2);
  assert.equal(result.agent.provider, 'openai'); assert.equal(result.agent.model, 'fixture-model-v2');
  assert.deepEqual(result.agent.attachment, attachment); assert.deepEqual(result.agent.requirements, requirements);
  assert.equal((await route.GET(request('GET', 'owner-b', null, true))).status, 404);
});

void test('pending includes optional declarations and reconciles a lost real-route response only on exact readback', async t => {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
    sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { prepare(query) { return { bind(...args) { return {
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
  }; } }; } };
  class OperationError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const route = loadRouteFixture(new URL('../app/api/sky/agents/route.ts', import.meta.url), new Map([
    ['@/lib/fund-store', { database: () => db, requestUser: async request => request.headers.get('x-test-owner') }],
    ['@/lib/operations', { OperationError }], ['@/lib/owner-intent', ownerIntent], ['@/lib/sky-agent-library-store', agentStore], ['@/lib/sky-agent-library', library],
  ]));
  const attachment = { schema: 'sky.object-attachment/1', objectName: '合成対象', input: 'sensor', output: 'signal' };
  const requirements = { inputFields: ['value'], outputFields: ['summary'], packageKey: 'dev.fixture.tool@1.0.0', executionTarget: 'pc' };
  const full = { ...settings, attachment, requirements }, input = { ownerScope: scopeA, id, settings: full };
  const prepared = await prepareEveAgentPending(input), journal = storage();
  assert.notEqual(prepared.settingsSha256, pending.settingsSha256);
  const transport = async (url, init = {}) => {
    const response = await route[init.method ?? 'GET'](new Request(`https://fixture.invalid${url}`, {
      ...init, headers: { ...init.headers, origin: 'https://fixture.invalid', 'x-test-owner': 'owner-a' },
    }));
    if (init.method === 'PUT') { assert.equal(response.status, 200); throw new Error('lost committed response'); }
    return response;
  };
  const result = await createEveAgent(transport, input, prepared, journal);
  assert.equal(result.state, 'saved'); assert.deepEqual(result.agent.attachment, attachment); assert.deepEqual(result.agent.requirements, requirements);
  const exact = result.agent;
  for (const changed of [
    { ...exact, attachment: { ...attachment, objectName: '差替' } },
    { ...exact, requirements: { ...requirements, packageKey: 'dev.other.tool@1.0.0' } },
    (({ attachment: _ignored, ...rest }) => rest)(exact),
    (({ requirements: _ignored, ...rest }) => rest)(exact),
  ]) {
    const pendingStorage = storage(); reserveEveAgentPending(pendingStorage, prepared);
    const actual = await reconcileEveAgentCreation(async (url, init) => {
      const response = await transport(url, init); const body = await response.json();
      return json({ ...body, agent: changed }); // Corrupt only the real route's readback.
    }, prepared, pendingStorage);
    assert.equal(actual.state, 'unknown'); assert.deepEqual(readEveAgentPending(pendingStorage, scopeA), prepared);
  }
  // Old schema-1 records use the original five-field bytes and still recover.
  const bytes = new TextEncoder().encode(JSON.stringify(settings));
  const oldSha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  assert.equal(pending.settingsSha256, oldSha);
  const oldStorage = storage(); reserveEveAgentPending(oldStorage, pending);
  assert.equal((await reconcileEveAgentCreation(async () => json({ ownerScope: scopeA, agent: saved }), pending, oldStorage)).state, 'saved');
  const mismatchStorage = storage(); reserveEveAgentPending(mismatchStorage, pending);
  assert.equal((await reconcileEveAgentCreation(async () => json({ ownerScope: scopeA, agent: exact }), pending, mismatchStorage)).state, 'unknown');
});
