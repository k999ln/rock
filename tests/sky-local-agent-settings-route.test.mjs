import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { loadRouteFixture } from './route-fixture.mjs';
import * as library from '../lib/sky-agent-library.ts';
import * as storeModule from '../lib/sky-agent-library-store.ts';
import * as providers from '../lib/llm-providers.ts';
import * as localAgent from '../lib/zema-local-agent.ts';
import { RemoteAiGuardError } from '../lib/remote-ai-guard.ts';

async function fixture(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  for (const f of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
    sql.exec(readFileSync(new URL(`../drizzle/${f}`, import.meta.url), 'utf8'));
  const db = { prepare(query) { return { bind(...args) { return {
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
  }; } }; } };
  const settings = library.defaultSkyAgentSettings('Fixture writer', 'Fixture role only');
  const store = storeModule.skyAgentLibraryStore(db, 'alice');
  const agent = await store.save('11111111-1111-4111-8111-111111111111', 0, settings, true);
  const counts = { binding: 0, runner: 0, model: 0 };
  let scopeAllowed = true;
  const refs = new Map([
    ['cloudflare:workers', { env: {} }], ['@/lib/fund-store', { database: () => db }],
    ['@/lib/sky-agent-library', library],
    ['@/lib/sky-agent-library-store', { async bindSkyAgentLlmInput(...args) { counts.binding++; return storeModule.bindSkyAgentLlmInput(...args); } }],
    ['@/lib/llm-providers', { ...providers, async generateText() { counts.model++; return { text: JSON.stringify({ schema: 'zema-local-agent/1', action: 'respond', message: 'Fixture answer' }) }; } }],
    ['@/lib/remote-ai-guard', { RemoteAiGuardError, async authorizeRemoteAiRequest(request) { const owner = request.headers.get('x-fixture-owner'); if (!owner) throw new RemoteAiGuardError('UNAUTHORIZED', 401); return owner; } }],
    ['@/lib/rockstar-service-access', { rockstarServiceScopeAllowed: async () => scopeAllowed, missingRockstarServiceScope: () => Response.json({ code: 'SERVICE_SCOPE_REQUIRED' }, { status: 403 }) }],
    ['@/lib/zema-local-agent', { ...localAgent, async runZemaLocalAgent(...args) { counts.runner++; return localAgent.runZemaLocalAgent(...args); } }],
  ]);
  const route = loadRouteFixture(new URL('../app/api/llm/local-agent/route.ts', import.meta.url), refs);
  const input = { agentId: agent.id, agentRevision: agent.revision, provider: agent.provider, model: agent.model, prompt: 'Fixture request' };
  async function call(value = input, owner = 'alice') {
    const response = await route.POST(new Request('https://fixture.invalid/api/llm/local-agent', { method: 'POST', headers: { 'content-type': 'application/json', ...(owner ? { 'x-fixture-owner': owner } : {}) }, body: JSON.stringify(value) }));
    return { response, body: await response.json() };
  }
  return { sql, store, agent, settings, counts, input, call, scope: value => { scopeAllowed = value; } };
}

for (const kind of ['stale', 'disabled', 'disconnected', 'other-owner', 'model-mismatch', 'malformed-reference']) {
  void test(`local Agent route preserves ${kind} settings rejection before runner/model dispatch`, async t => {
    const f = await fixture(t); let input = f.input, owner = 'alice', status = 409;
    if (kind === 'stale') await f.store.save(f.agent.id, 1, { ...f.settings, name: 'New revision' });
    if (kind === 'disabled') await f.store.save(f.agent.id, 1, { ...f.settings, enabled: false });
    if (kind === 'other-owner') { owner = 'bob'; status = 404; }
    if (kind === 'model-mismatch') input = { ...input, model: 'not-the-saved-model' };
    if (kind === 'malformed-reference') { input = { ...input, agentId: 'invalid?' }; status = 400; }
    if (kind === 'disconnected') {
      f.sql.prepare('INSERT INTO sky_connections(user_id,tool,scope,consent_version,connected_at) VALUES(?,?,?,?,?)').run('alice', 'mr-citations', 'fixture', 'fixture', 1000);
      const a = await f.store.get('tool:mr-citations');
      input = { ...input, agentId: a.id, agentRevision: a.revision, provider: a.provider, model: a.model };
      f.sql.prepare('DELETE FROM sky_connections WHERE user_id=?').run('alice'); status = 404;
    }
    const { response, body } = await f.call(input, owner);
    assert.equal(response.status, status);
    assert.equal(body.code, 'AGENT_SETTINGS_CHANGED');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(typeof body.error, 'string');
    assert.notEqual(body.error, 'ローカルAgentを実行できません。');
    assert.deepEqual(f.counts, { binding: 1, runner: 0, model: 0 });
  });
}

void test('valid saved Agent and ordinary local requests still reach only the fixture model', async t => {
  const f = await fixture(t);
  const a = await f.call(); assert.equal(a.response.status, 200);
  const b = await f.call({ provider: f.agent.provider, model: f.agent.model, prompt: 'Ordinary fixture request' });
  assert.equal(b.response.status, 200);
  assert.deepEqual(f.counts, { binding: 2, runner: 2, model: 2 });
});

void test('authentication and service-scope denial remain ahead of binding and dispatch', async t => {
  const f = await fixture(t);
  assert.equal((await f.call(f.input, null)).response.status, 401);
  f.scope(false);
  assert.equal((await f.call()).response.status, 403);
  assert.deepEqual(f.counts, { binding: 0, runner: 0, model: 0 });
});
