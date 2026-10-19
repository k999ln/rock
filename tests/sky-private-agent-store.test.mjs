import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { skyPrivateAgentStore } from '../lib/sky-private-agent-store.ts';
import { workStore } from '../lib/work-store.ts';
import { createSkyAppJob, executeSkyAppJob, confirmSkyAppJob, stopSkyAppJob } from '../lib/sky-app-foundation.ts';

const owner = 'owner-A', other = 'owner-B';
const fit = { surface: 'browser.preview', inputSource: 'manual.text', returnSlot: 'embedded.private' };
const recipe = { schema: 'sky.private-zoom-recipe/1', name: '会議メモ', purpose: '本人だけの会議を整理する',
  outputs: ['summary', 'decisions', 'owners'], summaryLines: 2, decisionLabel: '決定', ownerLabel: '担当' };
const spec = { schema: 'sky.private-agent/1', recipe, fits: [fit], execution: 'bounded-text-adapter',
  declaredChargeMinor: 0, externalSend: false };
const dbFixture = (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../services/sky-web/migrations/0002_work_jobs.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../services/sky-web/migrations/0019_sky_private_agents.sql', import.meta.url), 'utf8'));
  return { sqlite, db: { prepare(sql) { return { bind(...values) { return {
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
  }; } }; } } };
};

void test('private Agent/Add are owner scoped, retry safe, and edits invalidate previous Add', async (t) => {
  const { db } = dbFixture(t), store = skyPrivateAgentStore(db);
  const agentId = crypto.randomUUID(), addId = crypto.randomUUID();
  const agent = await store.createAgent(owner, agentId, spec);
  assert.equal((await store.createAgent(owner, agentId, spec)).digest, agent.digest);
  assert.equal(await store.getAgent(other, agentId), null);
  const add = await store.addAgent(owner, addId, agentId, fit);
  assert.equal((await store.addAgent(owner, addId, agentId, fit)).id, addId);
  assert.equal((await store.validateAdd(owner, addId, fit)).decision, 'candidate-only');
  assert.equal((await store.validateAdd(other, addId, fit)).decision, 'agent-unavailable');
  assert.equal(await store.reviseAgent(other, agentId, 1, spec), null);
  assert.equal(await store.reviseAgent(owner, agentId, 0, spec), null);
  const revised = await store.reviseAgent(owner, agentId, 1, { ...spec, recipe: { ...recipe, summaryLines: 3 } });
  assert.equal(revised.revision, 2);
  assert.equal((await store.validateAdd(owner, addId, fit)).decision, 'agent-version-changed');
  assert.equal(await store.addAgent(owner, crypto.randomUUID(), agentId, fit) !== null, true);
  assert.equal(await store.removeAdd(owner, addId), true);
  assert.equal((await store.validateAdd(owner, addId, fit)).decision, 'add-removed');
  assert.equal(await store.revokeAgent(owner, agentId, 1), false);
  assert.equal(await store.revokeAgent(owner, agentId, 2), true);
  assert.equal((await store.validateAdd(owner, addId, fit)).decision, 'agent-unavailable');
  assert.equal(add.agentDigest, agent.digest);
});

void test('result CAS rejects Add revocation and competing stop; owner B cannot read result', async (t) => {
  const { db, sqlite } = dbFixture(t), agents = skyPrivateAgentStore(db), works = workStore(db);
  const agentId = crypto.randomUUID(), addId = crypto.randomUUID(), jobId = crypto.randomUUID();
  const agent = await agents.createAgent(owner, agentId, spec);
  const add = await agents.addAgent(owner, addId, agentId, fit);
  const request = { schema: 'sky.app-request/1', appId: 'zoom', sourceId: jobId, sourceRevision: '1',
    title: recipe.name, objective: recipe.purpose, input: '会議: 本人だけ\n決定: 月曜に確認\n担当: Kai', recipe };
  const job = createSkyAppJob(request, jobId);
  const binding = { id: add.id, agentId: agent.id, agentRevision: agent.revision, agentDigest: agent.digest, fit };
  job.skyApp = { ...job.skyApp, privateAgent: binding };
  await works.create(owner, job);
  assert.equal(await works.get(other, jobId), null);
  const result = await executeSkyAppJob(job, { signal: new AbortController().signal, yieldStep: async () => {} });
  assert.equal(result.skyApp.result.notes.decisions[0], '月曜に確認');
  assert.equal(await agents.removeAdd(owner, addId), true);
  assert.equal(await works.updateSkyAppBound(owner, result, job.revision, binding), false);
  assert.equal((await works.get(owner, jobId)).skyApp.result, null);
  const stopped = stopSkyAppJob(job);
  assert.equal(await works.update(owner, stopped, 0), true);
  assert.equal(await works.updateSkyAppBound(owner, result, 0, binding), false);
  assert.equal(sqlite.prepare('SELECT revision FROM work_jobs WHERE id = ?').get(jobId).revision, 1);
});

void test('unknown response can be resolved by same-ID readback and command retry without a second result', async (t) => {
  const { db } = dbFixture(t), agents = skyPrivateAgentStore(db), works = workStore(db);
  const agentId = crypto.randomUUID(), addId = crypto.randomUUID(), jobId = crypto.randomUUID();
  const agent = await agents.createAgent(owner, agentId, { ...spec, appId: 'notes' });
  const add = await agents.addAgent(owner, addId, agentId, fit);
  const request = { schema: 'sky.app-request/1', appId: 'notes', sourceId: 'manual-note', sourceRevision: '1',
    title: 'メモの整理', objective: '保存と復旧を確認', input: 'メモ: 本人用\n決定: 状態を読戻す', recipe };
  const candidate = createSkyAppJob(request, jobId);
  const binding = { id: add.id, agentId: agent.id, agentRevision: agent.revision, agentDigest: agent.digest, fit };
  candidate.skyApp = { ...candidate.skyApp, privateAgent: binding };
  const created = await works.create(owner, candidate);
  assert.deepEqual(await works.create(owner, candidate), created);
  const runId = crypto.randomUUID();
  const completedRun = await executeSkyAppJob(created, { signal: new AbortController().signal, commandId: runId });
  assert.equal(await works.updateSkyAppBound(owner, completedRun, 0, binding), true);
  const recovered = await works.get(owner, jobId);
  assert.equal(recovered.skyApp.result.body, completedRun.skyApp.result.body);
  assert.equal(recovered.events.filter((event) => event.command.id === runId).length, 1);
  const confirmId = crypto.randomUUID();
  const confirmed = confirmSkyAppJob(recovered, confirmId, recovered.revision);
  assert.equal(await works.update(owner, confirmed, recovered.revision), true);
  assert.deepEqual(confirmSkyAppJob(await works.get(owner, jobId), confirmId, recovered.revision), confirmed);
  assert.equal((await works.get(owner, jobId)).revision, 3);
  assert.equal(await works.get(other, jobId), null);
});
