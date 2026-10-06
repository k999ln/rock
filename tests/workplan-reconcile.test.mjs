import test from 'node:test';
import * as amcSkyWeb from '../lib/amc-sky-web.ts';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as workflow from '../lib/workflow.ts';
import { workStore } from '../lib/work-store.ts';
import { requestUser } from '../lib/request-auth.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { rockstarServiceScopeAllowed, missingRockstarServiceScope } from '../lib/rockstar-service-access.ts';

// Real route exports, authentication, reducers, stores and service access.
// Cloudflare bindings use an in-memory SQLite D1 adapter and a synthetic preview
// entitlement setting. No success mocks.
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const queries = [];
  const db = { prepare(sql) {
    queries.push(sql);
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
    };
  } };
  function route(name) {
    const source = readFileSync(new URL(`../app/api/${String(name)}/route.ts`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {}, modules = {
      '@/lib/fund-store': { database: () => db, requestUser },
      '@/lib/amc-sky-web': amcSkyWeb,
      '@/lib/work-store': { workStore }, '@/lib/workflow': workflow,
      '@/lib/a2a-delegation-store': { a2aDelegationStore },
      '@/lib/rockstar-service-access': { rockstarServiceScopeAllowed, missingRockstarServiceScope },
      'cloudflare:workers': { env: { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' } },
    };
    runInNewContext(code, { exports, Response, Error, SyntaxError, TextEncoder, TextDecoder, crypto: webcrypto,
      require: (id) => { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; },
    });
    return exports;
  }
  const routes = { work: route('work-jobs'), amc: route('amc') };
  async function call(kind, method, body, { user = 'alice', status = method === 'POST' ? 201 : 200, origin = 'https://local.test' } = {}) {
    const request = new Request(`https://local.test/api/${kind === 'amc' ? 'amc' : 'work-jobs'}`, {
      method, headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), origin, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const response = await routes[kind][method](request), data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  const snapshot = () => Object.fromEntries(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'work_jobs'").all()
    .map(({ name }) => [name, JSON.stringify(sqlite.prepare(`SELECT * FROM "${String(name)}"`).all())]));
  return { sqlite, store: workStore(db), queries, call, snapshot };
}
const input = (templateId = 'article') => ({ id: randomUUID(), templateId, title: '合成の計画' });
const edit = (objective = '更新後の目的') => ({ id: randomUUID(), action: 'edit_plan', schemaVersion: 1, objective });
const amcInput = () => ({ id: randomUUID(), templateId: 'amc', brief: { request: '仕事の進捗を管理するWebアプリを作る', goal: '変更を保存して読み直せる', intent: '既存の記録を維持する' } });
const pause = (job) => ({ id: randomUUID(), action: 'amc_event', event: { type: 'pause', expectedRevision: job.amcGoal.revision, actor: 'alice', role: 'owner', reason: '合成試験で一時停止' } });

await test('WorkPlan API creation/edit/replay rejects stale or foreign writes without data loss or grants', async (t) => {
  const f = fixture(t), before = f.snapshot();
  await f.call('work', 'GET', undefined, { user: null, status: 401 });
  await f.call('work', 'POST', input(), { origin: 'https://wrong.test', status: 403 });
  for (const plan of [{ schemaVersion: 2, objective: 'x' }, { schemaVersion: 1, objective: '' }, { schemaVersion: 1, objective: 'x', approvalGates: [] }])
    await f.call('work', 'POST', { ...input(), plan }, { status: 400 });
  const { job } = await f.call('work', 'POST', { ...input(), plan: { schemaVersion: 1, objective: '依頼時の目的' } });
  assert.equal(job.plan.objective, '依頼時の目的');
  const command = edit(), body = { jobId: job.id, revision: 0, command };
  const { job: changed } = await f.call('work', 'PATCH', body);
  assert.equal(changed.plan.objective, command.objective);
  assert.equal(changed.revision, 1);
  assert.deepEqual(changed.plan.approvalGates, job.plan.approvalGates);
  assert.deepEqual((await f.call('work', 'PATCH', body)).job, changed);
  await f.call('work', 'PATCH', { ...body, command: edit('古い画面の変更') }, { status: 409 });
  await f.call('work', 'PATCH', { ...body, revision: 1, command: edit() }, { user: 'bob', status: 404 });
  await f.call('work', 'PATCH', { ...body, revision: 1, command: { ...edit(), approvalGates: [] } }, { status: 400 });
  assert.deepEqual(await f.store.get('alice', job.id), changed);
  assert.deepEqual((await f.call('work', 'GET')).jobs, [changed]);
  assert.deepEqual((await f.call('work', 'GET', undefined, { user: 'bob' })).jobs, []);
  assert.deepEqual(f.snapshot(), before);
});

await test('legacy stored plans normalize without rewriting payload, then preserve the first compare-and-swap edit', async (t) => {
  const f = fixture(t), legacy = workflow.createWorkJob(input('cloud-agent'));
  delete legacy.plan;
  const raw = JSON.stringify(legacy);
  f.sqlite.prepare('INSERT INTO work_jobs VALUES(?,?,?,?,?)').run(legacy.id, 'alice', raw, 0, legacy.updatedAt);
  const loaded = await f.store.get('alice', legacy.id);
  assert.equal(loaded.plan.schemaVersion, 1);
  assert.equal(loaded.plan.objective, legacy.title);
  assert.equal(loaded.plan.approvalGates[0].requirement, 'provider_quote_wallet_reservation_and_explicit_cloud_approval');
  assert.equal(f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(legacy.id).payload, raw);
  const winner = workflow.applyWorkCommand(loaded, edit('先に保存した目的'), 0);
  const loser = workflow.applyWorkCommand(loaded, edit('後から到着した目的'), 0);
  assert.deepEqual(await Promise.all([f.store.update('alice', winner, 0), f.store.update('alice', loser, 0)]), [true, false]);
  assert.deepEqual(await f.store.get('alice', legacy.id), winner);
  assert.deepEqual(winner.plan.approvalGates, loaded.plan.approvalGates);
});

await test('AMC and ordinary jobs retain separate events and both Goal/WorkJob revision boundaries', async (t) => {
  const f = fixture(t), before = f.snapshot();
  const { templateId: _templateId, ...request } = amcInput();
  const { job: amc } = await f.call('amc', 'POST', request);
  const { job: normal } = await f.call('work', 'POST', input());
  await f.call('work', 'PATCH', { jobId: normal.id, revision: 0, command: pause(amc) }, { status: 400 });
  await f.call('work', 'PATCH', { jobId: amc.id, revision: 0, command: edit() }, { status: 400 });
  await f.call('amc', 'PATCH', { jobId: amc.id, revision: 0, command: edit() }, { status: 400 });
  await f.call('amc', 'PATCH', { jobId: amc.id, revision: 0, command: pause(amc) }, { user: 'bob', status: 404 });
  const body = { jobId: amc.id, revision: 0, command: pause(amc) };
  const { job: paused } = await f.call('amc', 'PATCH', body);
  assert.equal(paused.amcGoal.state, 'paused');
  assert.equal(paused.revision, 1);
  assert.equal(paused.amcGoal.revision, amc.amcGoal.revision + 1);
  assert.deepEqual(paused.plan, amc.plan);
  assert.deepEqual((await f.call('amc', 'PATCH', body)).job, paused);
  await f.call('amc', 'PATCH', { ...body, revision: 1, command: pause(amc) }, { status: 409 });
  assert.deepEqual(await f.store.get('alice', normal.id), normal);
  assert.deepEqual(await f.store.get('alice', amc.id), paused);
  assert.deepEqual(f.snapshot(), before);
});

await test('AMC list stays scoped and lightweight with one query and at most 100 summaries', async (t) => {
  const f = fixture(t), job = workflow.createWorkJob(amcInput());
  for (let i = 0; i < 101; i++) await f.store.create('alice', { ...job, id: randomUUID() });
  await f.store.create('bob', { ...job, id: randomUUID() });
  await f.store.create('alice', workflow.createWorkJob(input()));
  f.queries.length = 0;
  const list = await f.store.listAmc('alice');
  assert.equal(list.length, 100);
  assert.equal(f.queries.length, 1);
  assert.doesNotMatch(f.queries[0], /SELECT payload/);
  for (const row of list) {
    assert.equal(row.amcGoal, undefined);
    assert.deepEqual(row.steps, []);
    assert.deepEqual(row.events, []);
    assert.deepEqual(row.plan, { schemaVersion: 1, objective: job.title, approvalGates: [] });
  }
  assert.equal((await f.store.listAmc('bob')).length, 1);
  assert.deepEqual(await f.store.listAmc('charlie'), []);
});

await test('cloud plan rejects unverified delegation records without creating connections, reservations or grants', async (t) => {
  const f = fixture(t), before = f.snapshot();
  const { job } = await f.call('work', 'POST', input('cloud-agent'));
  const command = { id: randomUUID(), action: 'record', stepId: 'agent-brief', tool: 'sky-a2a-brief', transport: 'browser', outcome: 'passed', sample: false, durationMs: 1 };
  await f.call('work', 'PATCH', { jobId: job.id, revision: 0, command }, { status: 409 });
  await f.call('work', 'PATCH', { jobId: job.id, revision: 0, command: { ...command, delegationId: randomUUID() } }, { status: 409 });
  await f.call('work', 'PATCH', { jobId: job.id, revision: 0, command: { ...command, delegationId: 'not-an-id' } }, { status: 400 });
  assert.deepEqual(await f.store.get('alice', job.id), job);
  assert.deepEqual(f.snapshot(), before);
});

await test('cloud review binds stored evidence to the same owner and parent and requires terminal artifacts and receipt', async (t) => {
  const f = fixture(t);
  const { job } = await f.call('work', 'POST', input('cloud-agent'));
  function delegation(owner, parent) {
    const id = randomUUID();
    f.sqlite.prepare(`INSERT INTO agent_delegations
      (id,owner_user_id,parent_job_id,idempotency_key,message_id,target_origin,target_agent_name,target_agent_version,protocol_version,input_sha256,authorization_sha256,budget_currency,budget_limit_minor,deadline_at,state,created_at,updated_at)
      VALUES(?,?,?,?,?,'https://synthetic.invalid','fixture','1','1',?,?,'JPY',0,1,'awaiting_approval',1,1)`)
      .run(id, owner, parent, id, id, 'a'.repeat(64), 'b'.repeat(64));
    return id;
  }
  const foreign = delegation('bob', job.id), otherParent = delegation('alice', randomUUID()), own = delegation('alice', job.id);
  const brief = (id) => ({ id: randomUUID(), action: 'record', stepId: 'agent-brief', tool: 'sky-a2a-brief', transport: 'browser', outcome: 'passed', sample: false, durationMs: 1, delegationId: id });
  let before = f.snapshot();
  for (const id of [foreign, otherParent, own])
    await f.call('work', 'PATCH', { jobId: job.id, revision: 0, command: brief(id) }, { status: 409 });
  assert.deepEqual(f.snapshot(), before);
  // Synthetic stored quote metadata only; no provider verification or consent
  // grant is asserted by this WorkPlan contract test.
  f.sqlite.prepare('UPDATE agent_delegations SET price_quote_digest=?,price_quote_json=? WHERE id=?').run('c'.repeat(64), JSON.stringify({ synthetic: true }), own);
  before = f.snapshot();
  const { job: started } = await f.call('work', 'PATCH', { jobId: job.id, revision: 0, command: brief(own) });
  assert.equal(started.steps[0].passed, true);
  assert.deepEqual(started.plan, job.plan);
  const result = { ...brief(own), stepId: 'agent-result', tool: 'sky-a2a-result' };
  await f.call('work', 'PATCH', { jobId: job.id, revision: 1, command: result }, { status: 409 });
  assert.deepEqual(f.snapshot(), before);
  f.sqlite.prepare("UPDATE agent_delegations SET state='remote_completed',artifacts_captured=1 WHERE id=?").run(own);
  before = f.snapshot();
  await f.call('work', 'PATCH', { jobId: job.id, revision: 1, command: result }, { status: 409 });
  assert.deepEqual(await f.store.get('alice', job.id), started);
  assert.deepEqual(f.snapshot(), before);
});
