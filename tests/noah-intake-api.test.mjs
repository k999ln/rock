import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntakeApi, createIntakeTick } from '../lib/noah-intake-api.ts';
import { parseNoahFlags, noahAllowed } from '../lib/noah-flags.ts';
import { noahWakeSignature } from '../lib/noah-intake-wake.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { fixture, entry, page, NOW, markListed } from './fixtures/noah/intake.mjs';
import { mcpServer } from './fixtures/noah/mcp-server.mjs';
const key = 'synthetic-wake-test-only-'.repeat(2);
const depsFor = (f, config = {}) => ({ ...f.deps, authenticate: async () => { throw Error('UNAUTHORIZED'); }, reviewers: ['reviewer'], flags: parseNoahFlags({}), wakeKey: key, ...config });
void test('closed flags fail closed, reviewers retain access, state is never public', async t => {
  const f = fixture(t); const anonymous = createIntakeApi(depsFor(f));
  assert.equal((await anonymous(new Request('https://noah.test/api/noah/intake'))).status, 404); assert.equal(f.queries.length, 0);
  const reviewer = createIntakeApi(depsFor(f, { authenticate: async () => 'reviewer' }));
  const response = await reviewer(new Request('https://noah.test/api/noah/intake?state=1')); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store, private');
  const publicApi = createIntakeApi(depsFor(f, { flags: parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true' }) }));
  assert.equal((await publicApi(new Request('https://noah.test/api/noah/intake?state=1'))).status, 404);
  assert.equal((await publicApi(new Request('https://noah.test/api/noah/intake?limit=0'))).status, 200);
});
void test('write guards enforce origin, account scope, strict JSON, reviewer and local-only sync', async t => {
  const f = fixture(t, async () => page([entry(1)])); await f.store.sync(); markListed(f, 1);
  const api = createIntakeApi(depsFor(f, { authenticate: async () => 'reviewer' })), scope = await ownerScopeFor('reviewer'), id = 'mcp-registry:test.provider/agent-1';
  const request = (origin, body, headers = {}) => new Request(origin + '/api/noah/intake', { method: 'POST', body, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': scope, ...headers } });
  assert.equal((await api(request('https://noah.test', '{}'))).status, 403);
  assert.equal((await api(request('http://localhost', '{}', { Origin: 'https://elsewhere.test' }))).status, 403);
  assert.equal((await api(request('http://localhost', '{}', { 'X-Rock-Owner-Scope': 'wrong' }))).status, 409);
  assert.equal((await api(request('http://localhost', '{}', { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await api(request('http://localhost', '{"url":"https://evil.test"}'))).status, 400);
  assert.equal((await (await api(request('http://localhost', '{}'))).json()).disabled, true);
  const revision = (await f.store.detail(id, null, false)).revision;
  assert.equal((await api(request('https://noah.test', JSON.stringify({ action: 'withdraw', id, revision })))).status, 200);
  assert.equal((await api(request('https://noah.test', JSON.stringify({ action: 'restore', id, revision })))).status, 409);
});
void test('wake verifies timestamp, exact body, path and Origin before flags or database; signed enabled wake fetches the registry, then only handshakes', async t => {
  let calls = 0; const agent = mcpServer();
  // L4: after the registry sweep the wake handshakes the due candidate (initialize and tools/list only). Tools are never called.
  const f = fixture(t, async (url, init) => { if (new URL(url).hostname === 'agent-1.example.com') return agent.fetch(url, init); calls++; assert.equal(new URL(url).hostname, 'registry.modelcontextprotocol.io'); return page([entry(1)]); });
  const signature = await noahWakeSignature(key, String(NOW));
  const request = (overrides = {}) => new Request('https://noah.test' + (overrides.path ?? '/api/noah/intake/tick'), { method: 'POST', body: overrides.body ?? '{}', headers: { 'x-noah-time': String(NOW), 'x-noah-signature': signature, ...overrides.headers } });
  const tick = createIntakeTick(depsFor(f));
  assert.equal((await tick(request({ headers: { Origin: '' } }))).status, 403);
  for (const overrides of [{ body: '{ }' }, { body: '{"url":"https://evil.test"}' }, { path: '/different' }, { headers: { 'x-noah-time': String(NOW - 120001) } }, { headers: { 'x-noah-signature': 'a'.repeat(64) } }]) assert.equal((await tick(request(overrides))).status, 401);
  assert.equal((await createIntakeTick(depsFor(f, { wakeKey: undefined }))(request())).status, 401);
  assert.deepEqual(await (await tick(request())).json(), { disabled: true }); assert.equal(f.queries.length, 0); assert.equal(calls, 0);
  const enabled = createIntakeTick(depsFor(f, { flags: parseNoahFlags({ NOAH_PATROL_ENABLED: 'true' }) }));
  const response = await enabled(request()); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { pages: 1, seen: 1, changed: 1, more: false, probe: { probes: 1, ok: 1, authRequired: 0, unreachable: 0, rateLimited: 0, skippedHost: 0, toolsChanged: 0 } }); assert.equal(calls, 1);
  assert.deepEqual(agent.log.map(r => r.rpc), ['initialize', 'notifications/initialized', 'tools/list']);
});
void test('flag parsing preserves safe defaults and flags malformed overrides for review', () => {
  const flags = parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'TRUE', NOAH_PATROL_ENABLED: '1', NOAH_PATROL_BUDGET: '{"pages":0,"unknown":2}', NOAH_ASK_LIMITS: 'null', NOAH_MODEL_RELAY: 'live' });
  assert.equal(flags.patrol, false); assert.equal(flags.intakePublic, false); assert.equal(flags.modelRelay, 'off'); assert.equal(flags.patrolBudget.pages, 10); assert.equal(flags.warnings.length, 6); assert.equal(noahAllowed(flags, 'list', false), false); assert.equal(noahAllowed(flags, 'list', true), true);
});
