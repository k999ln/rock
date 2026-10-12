import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { loadRouteFixture } from './route-fixture.mjs';
import { requestUser } from '../lib/request-auth.ts';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createMaterialStudy, restoreMaterialStudy, readMaterialStudyInput, exportMaterialStudy } from '../lib/material-study.ts';
import { applyWorkCommand } from '../lib/workflow.ts';
import { workStore } from '../lib/work-store.ts';
const fixture = JSON.parse(readFileSync(new URL('../contracts/material-invention-fixture.json', import.meta.url), 'utf8'));
const input = (overrides = {}) => ({ id: randomUUID(), title: '合成経路検証', request: structuredClone(fixture), sample: false, ...overrides });

async function setup(t, required = 'false') {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { beforeRun: null, prepare(sql) { return { bind(...values) { return {
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async run() { db.beforeRun?.(sql, values); return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
  }; } }; } };
  const refs = new Map([
    ['cloudflare:workers', { env: { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: required } }],
    ['@/lib/fund-store', { database: () => db, requestUser }],
    ...await Promise.all(['bounded-stream', 'owner-intent', 'work-store', 'workflow', 'material-invention', 'material-study', 'rockstar-service-access', 'a2a-delegation-store']
      .map(async (name) => [`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url).href)])),
  ]);
  function load(name) {
    return loadRouteFixture(new URL(`../app/api/${name}/route.ts`, import.meta.url), refs);
  }
  const material = load('material-invention'), work = load('work-jobs');
  async function call(method, body, { owner = 'fixture-alice', id, generic = false, origin = 'https://local.test' } = {}) {
    const route = generic ? work : material;
    const response = await route[method](new Request(`https://local.test/api/${generic ? 'work-jobs' : 'material-invention'}${id ? `?id=${id}` : ''}`, {
      method, headers: { 'content-type': 'application/json', ...(owner ? { 'oai-authenticated-user-id': owner } : {}), ...(origin ? { origin } : {}) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    }));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, data: await response.json() };
  }
  return { sqlite, db, material, call, store: workStore(db) };
}

await test('study saves normalized input and review state, restores deterministic candidates and retains safety after acknowledgement', async () => {
  const payload = input(); payload.request.materials[0].sdsRef = null;
  const { job, graph } = await createMaterialStudy(payload);
  assert.equal(job.status, 'review');
  assert.equal(graph.candidates[0].safety.status, 'BLOCKED');
  const complete = applyWorkCommand(job, { id: randomUUID(), action: 'complete', note: '不足を確認' }, job.revision);
  const restored = await restoreMaterialStudy(JSON.parse(JSON.stringify(complete)));
  assert.deepEqual(restored, graph);
  assert.equal(restored.physicalExecutionAllowed, false);
  assert.equal(restored.candidates[0].evidenceState, 'HYPOTHESIS');
  const tampered = structuredClone(complete); tampered.materialStudy.request.materials[0].lot = 'changed';
  await assert.rejects(restoreMaterialStudy(tampered), { status: 409 });
  const unknown = structuredClone(complete); unknown.materialStudy.engine = 'future/2';
  await assert.rejects(restoreMaterialStudy(unknown), { status: 409 });
});

await test('sample provenance cannot become a real completed job through a forged generic record', async () => {
  const { job } = await createMaterialStudy(input({ sample: true }));
  assert.equal(job.status, 'active');
  assert.equal(job.steps[0].passed, false);
  assert.throws(() => applyWorkCommand(job, { id: randomUUID(), action: 'record', stepId: 'generate', tool: 'rockstar-material-invention', transport: 'browser', outcome: 'passed', sample: false, durationMs: 0 }, job.revision), { status: 409 });
  assert.throws(() => applyWorkCommand(job, { id: randomUUID(), action: 'complete', note: 'sample' }, job.revision));
  const stopped = applyWorkCommand(job, { id: randomUUID(), action: 'cancel' }, job.revision);
  assert.equal(stopped.status, 'cancelled');
});

await test('real routes and SQLite isolate owners, replay identical input, reject ID reuse and restore readback', async (t) => {
  const f = await setup(t), payload = input();
  const first = await f.call('POST', payload);
  assert.equal(first.status, 201);
  const retry = await f.call('POST', payload);
  assert.deepEqual(retry.data, first.data);
  const other = await f.call('POST', payload, { owner: 'fixture-bob' });
  assert.equal(other.status, 409);
  assert.equal((await f.call('GET', undefined, { id: payload.id, owner: 'fixture-bob' })).status, 404);
  assert.deepEqual((await f.call('GET', undefined, { owner: 'fixture-bob' })).data.jobs, []);
  const list = await f.call('GET');
  assert.equal(list.data.jobs.length, 1);
  assert.equal(list.data.jobs[0].materialStudy, undefined, 'list does not disclose formulation payload');
  assert.deepEqual((await f.call('GET', undefined, { id: payload.id })).data, first.data);
  const changed = structuredClone(payload); changed.request.materials[0].lot = 'new-lot';
  assert.equal((await f.call('POST', changed)).status, 409);
  assert.equal((await f.call('POST', { ...payload, sample: true })).status, 409);
  const forged = { id: randomUUID(), title: 'forged', templateId: 'material-invention' };
  assert.equal((await f.call('POST', forged, { generic: true })).status, 400);
});

await test('server recomputes safety, rejects supplied safety flags and bounded malformed requests', async (t) => {
  const f = await setup(t), payload = input();
  payload.request.materials[0].hazards = ['unknown'];
  const first = await f.call('POST', payload);
  assert.equal(first.status, 201);
  assert.equal(first.data.graph.candidates[0].safety.status, 'BLOCKED');
  assert.equal((await f.call('POST', { ...input(), graph: { physicalExecutionAllowed: true } })).status, 400);
  assert.equal((await f.call('POST', { ...input(), title: 'x'.repeat(50000) })).status, 413);
  const before = f.sqlite.prepare('SELECT count(*) AS n FROM work_jobs').get().n;
  const bad = input(); bad.request.materials[0].purityPercent = '95';
  assert.equal((await f.call('POST', bad)).status, 400);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM work_jobs').get().n, before);
});

await test('auth, same-origin and service entitlement are checked before saving a study', async (t) => {
  const f = await setup(t);
  assert.equal((await f.call('POST', input(), { owner: null })).status, 401);
  assert.equal((await f.call('GET', undefined, { owner: null })).status, 401);
  assert.equal((await f.call('POST', input(), { origin: 'https://elsewhere.test' })).status, 403);
  const gated = await setup(t, 'true');
  assert.equal((await gated.call('POST', input())).status, 403);
  assert.equal(gated.sqlite.prepare('SELECT count(*) AS n FROM work_jobs').get().n, 0);
});

await test('review and cancellation use revision CAS and idempotent commands without altering the stored input', async (t) => {
  const f = await setup(t), payload = input();
  const { data: { job } } = await f.call('POST', payload);
  const originalDigest = job.materialStudy.requestDigest;
  const command = { id: randomUUID(), action: 'complete', note: '不足条件を確認' };
  const patch = { jobId: job.id, revision: job.revision, command };
  assert.equal((await f.call('PATCH', patch, { owner: 'fixture-bob', generic: true })).status, 404);
  const complete = await f.call('PATCH', patch, { generic: true });
  assert.equal(complete.status, 200);
  assert.equal(complete.data.job.status, 'completed');
  assert.equal(complete.data.job.materialStudy.requestDigest, originalDigest);
  assert.deepEqual((await f.call('PATCH', patch, { generic: true })).data, complete.data);
  const stale = { ...patch, command: { id: randomUUID(), action: 'cancel' } };
  assert.equal((await f.call('PATCH', stale, { generic: true })).status, 409);
  const restored = await f.call('GET', undefined, { id: job.id });
  assert.equal(restored.data.job.status, 'completed');
  assert.equal(restored.data.graph.physicalExecutionAllowed, false);
});

await test('a real SQL compare-and-swap race refuses a stale material acknowledgement', async (t) => {
  const f = await setup(t);
  const { data: { job } } = await f.call('POST', input());
  f.db.beforeRun = (sql) => {
    if (!sql.startsWith('UPDATE work_jobs SET payload')) return;
    f.db.beforeRun = null;
    f.sqlite.prepare('UPDATE work_jobs SET revision = revision + 1 WHERE id = ?').run(job.id);
  };
  const response = await f.call('PATCH', { jobId: job.id, revision: job.revision, command: { id: randomUUID(), action: 'complete', note: '確認' } }, { generic: true });
  assert.equal(response.status, 409);
  const stored = await f.store.get('fixture-alice', job.id);
  assert.equal(stored.status, 'review');
});

await test('exported candidates reimport only their source and sample boundary, never saved approval or forged output', async () => {
  const { job, graph } = await createMaterialStudy(input({ sample: true }));
  const exported = exportMaterialStudy(job.materialStudy.request, graph, true, job);
  exported.graph.physicalExecutionAllowed = true;
  exported.graph.candidates[0].safetyStatus = 'APPROVED';
  exported.job.status = 'completed';
  const restored = readMaterialStudyInput(JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(restored, { request: job.materialStudy.request, sample: true });
  const recreated = await createMaterialStudy(input(restored));
  assert.equal(recreated.job.status, 'active');
  assert.equal(recreated.graph.physicalExecutionAllowed, false);
  assert.equal(recreated.graph.candidates[0].safety.status, 'SANDBOX_ONLY');
  assert.throws(() => readMaterialStudyInput({ ...exported, schema: 'future/2' }));
});
