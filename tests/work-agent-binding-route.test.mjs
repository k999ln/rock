import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { loadRouteFixture } from './route-fixture.mjs';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import * as requestAuth from '../lib/request-auth.ts';

async function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const path of readdirSync(new URL('../drizzle/', import.meta.url)).filter(path => path.endsWith('.sql') && !path.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${path}`, import.meta.url), 'utf8'));
  const db = { beforeRun: null, prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { db.beforeRun?.(sql, args); return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
  }; } }; } };
  const dependencies = new Map([
    ['cloudflare:workers', { env: { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' } }],
    ['@/lib/fund-store', { database: () => db, requestUser: requestAuth.requestUser }],
  ]);
  for (const name of ['bounded-stream', 'owner-intent', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library-store'])
    dependencies.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
  const route = loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), dependencies);
  const call = async (method, input, owner = 'alice', scope) => {
    const response = await route[method](new Request('https://fixture.invalid/api/work-jobs', {
      method, headers: { Origin: 'https://fixture.invalid', 'Content-Type': 'application/json',
        ...(owner ? { 'oai-authenticated-user-id': owner } : {}), ...(scope === undefined ? {} : { 'X-Rock-Owner-Scope': scope }) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(input) }),
    }));
    return { status: response.status, body: await response.json() };
  };
  const agent = async (owner = 'alice', enabled = true) => skyAgentLibraryStore(db, owner).save(randomUUID(), 0,
    { ...defaultSkyAgentSettings('本人担当', '本人が定めた役割'), enabled }, true);
  return { sqlite, db, call, agent };
}
const input = (agent, change = {}) => ({ id: randomUUID(), title: '合成の本人仕事', templateId: 'article',
  agentRef: { id: agent.id, revision: agent.revision }, ...change });
const scopeFor = async (f, owner) => (await f.call('GET', undefined, owner)).body.ownerScope;

void test('authenticated owner binds the exact role, preserves it on job edit, and same-ID response recovery is read-only', async t => {
  const f = await fixture(t), agent = await f.agent(), request = input(agent);
  const created = await f.call('POST', request);
  assert.equal(created.status, 201);
  const binding = created.body.job.agentBinding;
  assert.equal(binding.schema, 'rockstaros.work-agent-binding/1');
  assert.equal(binding.agentId, agent.id); assert.equal(binding.agentRevision, agent.revision);
  assert.match(binding.requestDigest, /^[a-f0-9]{64}$/);
  const edited = await f.call('PATCH', { jobId: request.id, revision: 0,
    command: { id: randomUUID(), action: 'edit_plan', schemaVersion: 1, objective: '本人が編集した目的' } });
  assert.equal(edited.status, 200); assert.deepEqual(edited.body.job.agentBinding, binding);
  const rowsBefore = f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n;
  const replay = await f.call('POST', request);
  assert.equal(replay.status, 200); assert.equal(replay.body.created, false);
  assert.equal(replay.body.job.revision, 1); assert.deepEqual(replay.body.job.agentBinding, binding);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, rowsBefore);
  assert.equal((await f.call('POST', { ...request, title: '異なる内容' })).status, 409);
  assert.equal((await f.call('POST', { id: request.id, title: request.title, templateId: 'article' })).status, 409);
  const readback = await f.call('GET');
  assert.deepEqual(readback.body.jobs.find(job => job.id === request.id).agentBinding, binding);
  assert.equal((await f.call('GET', undefined, 'bob')).body.jobs.length, 0);
});

void test('other-owner, disabled, stale, malformed and forged owner references never create a job', async t => {
  const f = await fixture(t), agent = await f.agent(), disabled = await f.agent('alice', false);
  assert.equal((await f.call('POST', input(agent), 'bob')).status, 409);
  assert.equal((await f.call('POST', input(disabled))).status, 409);
  assert.equal((await f.call('POST', input(agent, { agentRef: { id: agent.id, revision: agent.revision + 1 } }))).status, 409);
  assert.equal((await f.call('POST', input(agent, { agentRef: { id: agent.id, revision: 1, owner: 'alice' } }))).status, 400);
  assert.equal((await f.call('POST', input(agent, { agentBinding: { agentId: agent.id } }))).status, 400);
  const aliceScope = await scopeFor(f, 'alice');
  assert.equal((await f.call('POST', input(agent), 'bob', aliceScope)).status, 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 0);
});

void test('atomic job insertion fails closed if the selected role is modified or disabled after verification', async t => {
  const f = await fixture(t), agent = await f.agent(), request = input(agent);
  f.db.beforeRun = (sql) => {
    if (!sql.includes('INSERT INTO work_jobs')) return;
    f.db.beforeRun = null;
    f.sqlite.prepare('UPDATE sky_agent_settings SET revision = revision + 1 WHERE owner_user_id = ? AND id = ?').run('alice', agent.id);
  };
  const result = await f.call('POST', request);
  assert.equal(result.status, 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 0);
});

void test('same-ID recovery remains possible after later role revision without authorizing a new execution', async t => {
  const f = await fixture(t), agent = await f.agent(), request = input(agent);
  assert.equal((await f.call('POST', request)).status, 201);
  await skyAgentLibraryStore(f.db, 'alice').save(agent.id, agent.revision,
    { ...defaultSkyAgentSettings('変更した担当', '後から編集した役割'), enabled: false });
  const recovered = await f.call('POST', request);
  assert.equal(recovered.status, 200); assert.equal(recovered.body.created, false);
  assert.equal(recovered.body.job.agentBinding.agentRevision, agent.revision);
  assert.equal((await f.call('POST', input(agent))).status, 409);
});
