import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeFixture } from './helpers/eve-tool-fixture.mjs';
import { eveHistoryStore } from '../lib/eve-history.ts';
import { eveToolWorkStore } from '../lib/eve-tool-work.ts';
import { eveTextDigest, eveCitationRepairPlan } from '../lib/eve-plan-candidate.ts';
async function fixture(t, strict = false, short = false) {
  const f = runtimeFixture(t); // Source restore includes work_jobs.
  const store = eveToolWorkStore(f.db, 'alice', f.keys), source = '合成資料。'.repeat(short ? 1 : 1400) + '（出典: [資料](https://example.com/repair)）', id = crypto.randomUUID();
  const candidate = { schema: 'eve.plan-candidate/1', jobId: id, objective: '引用整形しリンク先を保持', sourceSha256: await eveTextDigest(source), unknowns: [], stopReason: null, nodes: [
    { id: 's1', tool: 'mr-citations', inputs: ['source'], config: {} },
    { id: 's2', tool: 'mr-citations', inputs: ['source'], config: {} },
    { id: 's3', tool: 'compose-join', inputs: ['s1','s2'], config: {} },
    { id: 's4', tool: 'compose-check', inputs: ['s3'], config: { minChars: 1, requiredText: strict ? ['素材にない本人の必要条件'] : [] } },
  ] };
  let job = (await store.create({ jobId: id, threadId: crypto.randomUUID(), objective: candidate.objective, source, saveMaterial: true, plannerCandidate: JSON.stringify(candidate) })).job;
  const advance = async () => { job = (await store.command({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action: 'advance' })).job; return job; };
  return { f, store, advance, job: () => job };
}
void test('real oversized duplicate merge records failure, preserves criteria and passed Tool output, repairs then completes', async t => {
  const f = await fixture(t); await f.advance(); await f.advance();
  let job = await f.advance();
  // Fixture deliberately exceeds the real adapter output limit; no injected result.
  assert.equal(job.eveTool.pendingFailure?.code, 'output_limit');
  assert.equal(job.eveTool.pendingFailure.repairable, true);
  const passed = job.composition.artifacts.s1.text, acceptance = job.composition.plan.acceptance;
  const reopened = await f.store.get(job.id); assert.equal(reopened.eveTool.failures.length, 1);
  job = await f.advance();
  assert.equal(job.eveTool.repairCount, 1); assert.equal(job.eveTool.pendingFailure, undefined);
  assert.equal(job.composition.artifacts.s1.text, passed);
  assert.equal(job.composition.plan.acceptance, acceptance);
  assert.equal(job.composition.plan.budgetMinor, 0);
  job = await f.advance(); assert.equal(job.status, 'review');
  job = (await f.store.command({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action: 'complete' })).job;
  assert.equal(job.status, 'completed'); assert.equal(job.eveTool.failures.length, 1);
  assert.equal(job.composition.operations.filter(o => o.id === job.eveTool.failures[0].commandId).length, 1);
});
void test('repair refuses to weaken an approved requirement, and cap/changed input stop retry loops', async t => {
  const strict = await fixture(t, true); await strict.advance(); await strict.advance();
  const job = await strict.advance(); assert.equal(job.eveTool.pendingFailure?.repairable, false);
  await assert.rejects(strict.advance(), /自動修正はできません/);
  const stop = await strict.store.command({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action: 'cancel' });
  assert.equal(stop.job.status, 'cancelled');
  const other = await fixture(t); await other.advance(); await other.advance(); const failed = await other.advance();
  failed.eveTool.repairCount = 2;
  assert.equal(eveCitationRepairPlan(failed, 's3', 'output_limit'), null);
  other.f.sql.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(failed), failed.id);
  await assert.rejects(other.advance(), /自動修正はできません/);
});

void test('failed required phrase remains explicit in encrypted conversation after reopen; inspection cannot weaken or complete it', async t => {
  const f = await fixture(t, true, true);
  await f.advance(); await f.advance(); await f.advance();
  const job = await f.advance();
  assert.equal(job.eveTool.pendingFailure.code, 'verification_failed');
  assert.equal(job.eveTool.pendingFailure.repairable, false);
  const phrase = job.composition.plan.nodes.at(-1).config.requiredText[0];
  assert.equal(job.composition.artifacts.s4.checks.find(c => c.name === '必須文言').passed, false);
  const history = eveHistoryStore(f.f.db, 'alice', f.f.keys, true);
  const saved = await history.get(job.eveTool.threadId);
  assert.match(saved.session.messages.at(-1).text, /未達の完成条件: 必須文言/);
  assert.ok(saved.session.messages.at(-1).text.includes(phrase));
  await assert.rejects(f.advance(), /自動修正はできません/);
  await assert.rejects(f.store.command({ jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action:'complete' }), /独立検査/);
  const reopened = await f.store.get(job.id);
  assert.deepEqual(reopened.composition.plan, job.composition.plan);
  assert.equal(reopened.status, 'active');
  assert.equal(reopened.eveTool.repairCount ?? 0, 0);
});
