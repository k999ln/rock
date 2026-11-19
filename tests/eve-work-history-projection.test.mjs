import test from 'node:test';
import assert from 'node:assert/strict';
import { eveAgentFixture } from './helpers/eve-agent-fixture.mjs';
import { eveToolWorkStore } from '../lib/eve-tool-work.ts';
import { eveHistoryStore } from '../lib/eve-history.ts';
import { workStore } from '../lib/work-store.ts';
import { applyWorkCommand } from '../lib/workflow.ts';
import { runEvePlannerInference } from '../lib/eve-planner-inference.ts';
import { evePlannerPrompt } from '../lib/eve-plan-candidate.ts';
import { observeLlmUsage } from '../lib/sky-usage-observation.ts';
async function setup(t) {
  const f = eveAgentFixture(t), tools = () => eveToolWorkStore(f.db, 'alice', f.keys), history = () => eveHistoryStore(f.db, 'alice', f.keys, true);
  let job = (await tools().create({ jobId: crypto.randomUUID(), threadId: crypto.randomUUID(), objective: '合成出典を整理', source: '本文 [資料](https://example.com/projection)', saveMaterial: true, plannerRequest: { modelLabel: 'fixture-model', modelDigest: 'a'.repeat(64) } })).job;
  job = (await tools().plannerCommand({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action: 'planner-claim' })).job;
  let calls = 0;
  const run = (during = async () => {}) => runEvePlannerInference(f.db, 'alice', f.keys, { jobId: job.id, attemptId: job.eveTool.planning.attempts[0].id }, 'fixture-model', {}, async () => {
    calls++; await during();
    return { provider: 'ollama', model: 'fixture-model', text: evePlannerPrompt({ jobId: job.id, objective: job.plan.objective, sourceSha256: job.eveTool.sourceSha256 }).prompt.split('\n').slice(1).join('\n'),
      metering: observeLlmUsage('ollama', { model: 'fixture-model', prompt_eval_count: 31, eval_count: 47 }), durationMs: 1 };
  }, async () => 'a'.repeat(64));
  return { ...f, tools, history, job, run, calls: () => calls };
}
void test('work projection fence rejects stale job revisions and wrong owner/thread without changing ciphertext or creating a thread', async t => {
  const f = await setup(t), before = await f.history().get(f.job.eveTool.threadId);
  const input = { session: { ...before.session, messages: [{ ...before.session.messages[1], text: 'stale view must not overwrite' }] }, revision: before.revision, remember: false };
  await assert.rejects(f.history().save(input, { jobId: f.job.id, revision: f.job.revision - 1 }), e => e.status === 409);
  assert.equal((await f.history().get(before.session.id)).revision, before.revision);
  const wrongId = crypto.randomUUID();
  await assert.rejects(f.history().save({ ...input, session: { ...input.session, id: wrongId }, revision: 0 }, { jobId: f.job.id, revision: f.job.revision }), e => e.status === 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM eve_conversations WHERE id=?').get(wrongId).n, 0);
  const other = eveHistoryStore(f.db, 'bob', f.keys, true);
  await assert.rejects(other.save({ ...input, revision: 0 }, { jobId: f.job.id, revision: f.job.revision }), e => e.status === 409);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM eve_conversations WHERE owner_id='bob'").get().n, 0);
});
void test('job revision changing after encryption preparation cannot project stale running state; bounded retry reads the stopped job', async t => {
  const f = await setup(t); await f.run(); let raced = false;
  const db = { ...f.db, async batch(statements) {
    if (!raced) {
      raced = true; const old = await f.tools().get(f.job.id);
      const stopped = applyWorkCommand(old, { id: crypto.randomUUID(), action: 'cancel' }, old.revision);
      assert.equal(await workStore(f.db).update('alice', stopped, old.revision), true);
      // Deliberately no history write: the history revision alone cannot catch this race.
    }
    return f.db.batch(statements);
  } };
  const result = await eveToolWorkStore(db, 'alice', f.keys).projectHistory(f.job.id);
  assert.equal(result.historySaved, true); assert.equal(result.job.status, 'cancelled');
  const text = (await f.history().get(f.job.eveTool.threadId)).session.messages[1].text;
  assert.match(text, /状態: 停止済み/); assert.match(text, /出力: 47 tokens/); assert.equal(f.calls(), 1);
});
void test('history key failure after inference preserves candidate/usage and repair never reruns the model or Tool', async t => {
  const f = await setup(t), key = f.keys.keys.fixture;
  const r = await f.run(async () => { f.keys.keys.fixture = '34'.repeat(32); });
  assert.equal(r.historySaved, false); assert.equal(r.eveWork.eveTool.planning.status, 'proposed');
  assert.equal(r.eveWork.eveTool.planning.attempts[0].inference.usage.metrics[1].quantity, 47);
  f.keys.keys.fixture = key;
  const repaired = await f.tools().projectHistory(f.job.id);
  assert.equal(repaired.historySaved, true); assert.equal(repaired.job.revision, r.eveWork.revision);
  assert.match((await f.history().get(f.job.eveTool.threadId)).session.messages[1].text, /出力: 47 tokens/);
  assert.equal(f.calls(), 1); assert.equal(repaired.job.composition.operations.length, 0);
  assert.ok(f.sqlite.prepare('SELECT envelope FROM eve_messages').all().every(row => !row.envelope.includes('47 tokens')));
});
void test('conversation deletion during inference keeps observations but never resurrects the deleted conversation', async t => {
  const f = await setup(t);
  const r = await f.run(async () => { const item = await f.history().get(f.job.eveTool.threadId); await f.history().remove(item.session.id, item.revision); });
  assert.equal(r.historySaved, false); assert.equal(r.eveWork.eveTool.planning.attempts[0].inference.state, 'reported');
  await assert.rejects(f.history().get(f.job.eveTool.threadId), e => e.status === 404);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM eve_messages').get().n, 0); assert.equal(f.calls(), 1);
});
void test('absent history keys never block owner stop/read, and restored keys repair without inference or plaintext fallback', async t => {
  const f = await setup(t); await f.run(); const unavailable = eveToolWorkStore(f.db, 'alice');
  const job = await unavailable.get(f.job.id);
  await assert.rejects(unavailable.plannerCommand({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action: 'planner-adopt' }), e => e.status === 503);
  const stopped = await unavailable.command({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action: 'cancel' });
  assert.equal(stopped.job.status, 'cancelled'); assert.equal(stopped.historySaved, false);
  await assert.rejects(eveToolWorkStore(f.db, 'bob').get(job.id), e => e.status === 404);
  assert.equal((await f.tools().projectHistory(job.id)).historySaved, true);
  assert.match((await f.history().get(job.eveTool.threadId)).session.messages[1].text, /状態: 停止済み/);
  assert.equal(f.calls(), 1);
});
