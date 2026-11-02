import assert from 'node:assert/strict';
import test from 'node:test';
import { evePlannerPrompt, eveTextDigest, parseEvePlanCandidate } from '../lib/eve-plan-candidate.ts';
import { eveToolWorkStore } from '../lib/eve-tool-work.ts';
import { runtimeFixture } from './helpers/eve-tool-fixture.mjs';
const context = { jobId: '0a14d54d-daee-4c30-87a8-faea84641a40', objective: '引用の出典を整理', sourceSha256: 'a'.repeat(64) };
const candidate = (ctx = context) => JSON.parse(evePlannerPrompt(ctx).prompt.split('\n').at(-1));
void test('untrusted plan candidates are bound to goal/source and reject unknown fields, privileges and invalid graphs', () => {
  assert.equal(parseEvePlanCandidate(JSON.stringify(candidate()), context).nodes.length, 2);
  for (const patch of [{ schema: 'other' }, { objective: '別の目的' }, { sourceSha256: 'b'.repeat(64) }, { jobId: crypto.randomUUID() }, { approved: true }, { budgetMinor: 100 }, { scope: ['root'] }, { unknowns: ['外部公開の承認が必要'] }, { stopReason: '未対応' }]) {
    assert.throws(() => parseEvePlanCandidate(JSON.stringify({ ...candidate(), ...patch }), context));
  }
  assert.throws(() => parseEvePlanCandidate('```json\n' + JSON.stringify(candidate()) + '\n```', context));
  assert.throws(() => parseEvePlanCandidate('a'.repeat(16001), context));
  const cases = [
    [{ id: 's1', tool: 'shell', inputs: ['source'], config: {} }],
    [{ id: 's1', tool: 'mr-citations', inputs: ['s2'], config: {} }, { id: 's2', tool: 'compose-check', inputs: ['s1'], config: { minChars: 1, requiredText: [] } }],
    [{ id: 's1', tool: 'mr-citations', inputs: ['source'], config: { approved: true } }, { id: 's2', tool: 'compose-check', inputs: ['s1'], config: { minChars: 1, requiredText: [] } }],
    [{ id: 's1', tool: 'compose-check', inputs: ['source'], config: { minChars: 1, requiredText: [] } }],
    [...candidate().nodes, { id: 's3', tool: 'compose-check', inputs: ['source'], config: { minChars: 1, requiredText: [] } }],
    [{ id: 's1', tool: 'mr-citations', inputs: ['source'], config: {} }, { id: 's2', tool: 'compose-check', inputs: ['s1'], config: { minChars: 0, requiredText: [] } }],
  ];
  for (const nodes of cases) assert.throws(() => parseEvePlanCandidate(JSON.stringify({ ...candidate(), nodes }), context));
});
void test('LLM candidate uses actual existing Tool and validators; caller cannot certify output or change a saved plan', async t => {
  const f = runtimeFixture(t);
  // Source sandbox restore already includes work_jobs.
  const store = eveToolWorkStore(f.db, 'alice', f.keys);
  const source = '本文。（出典: [資料](https://example.com/plan)）';
  const ctx = { ...context, jobId: crypto.randomUUID(), sourceSha256: await eveTextDigest(source) };
  const c = candidate(ctx); c.nodes = [{ id: 's3', tool: 'mr-citations', inputs: ['source'], config: {} }, { id: 's5', tool: 'compose-check', inputs: ['s3'], config: { minChars: 1, requiredText: [] } }];
  const input = { ...ctx, threadId: crypto.randomUUID(), source, saveMaterial: true, plannerCandidate: JSON.stringify(c), plannerModel: 'qwen2.5:1.5b' };
  delete input.sourceSha256; input.jobId = ctx.jobId;
  let job = (await store.create(input)).job;
  assert.equal(job.eveTool.planner, 'validated-llm-candidate/1');
  assert.equal(job.eveTool.plannerCandidate.origin, 'untrusted-submitted-candidate');
  const command = action => ({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action });
  job = (await store.command(command('advance'))).job;
  assert.match(job.composition.artifacts.s3.text, /## 出典/);
  job = (await store.command(command('advance'))).job;
  assert.equal(job.eveTool.outputStepId, 's5');
  job = (await store.command(command('complete'))).job;
  assert.equal(job.status, 'completed');
  const second = { ...input, jobId: crypto.randomUUID() };
  const other = candidate({ ...ctx, jobId: second.jobId }); second.plannerCandidate = JSON.stringify(other);
  const saved = (await store.create(second)).job;
  saved.composition.plan.nodes[0].config = { injected: true };
  f.sql.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(saved), saved.id);
  await assert.rejects(store.command({ jobId: saved.id, revision: saved.revision, commandId: crypto.randomUUID(), action: 'advance' }), /素材が変更/);
});
