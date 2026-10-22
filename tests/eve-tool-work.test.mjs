import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeFixture } from './helpers/eve-tool-fixture.mjs';
import { eveToolWorkStore, verifyEveCitationOutput } from '../lib/eve-tool-work.ts';
const request = () => ({ jobId: crypto.randomUUID(), threadId: crypto.randomUUID(), objective: '出典を整理して保存する', source: '本文。（出典: [一次資料](https://example.com/evidence)）', saveMaterial: true });
function fixture(t) {
  const f = runtimeFixture(t);
  // Source sandbox restore already includes work_jobs.
  return { ...f, tools: (owner = 'alice') => eveToolWorkStore(f.db, owner, f.keys) };
}
const command = (job, action, commandId = crypto.randomUUID()) => ({ jobId: job.id, revision: job.revision, commandId, action });
void test('Eve invokes the existing Tool, independently checks URLs, saves the same work/thread and resumes after reopening', async t => {
  const f = fixture(t), input = request();
  let result = await f.tools().create(input), job = result.job;
  assert.equal(result.historySaved, true);
  assert.equal(job.status, 'active');
  assert.equal(job.composition.plan.budgetMinor, 0);
  const run = command(job, 'advance');
  result = await f.tools().command(run); job = result.job;
  assert.match(job.composition.artifacts.s1.text, /## 出典/);
  assert.ok(job.eveTool.verification.checks.every(c => c.passed));
  assert.equal(job.status, 'active');
  assert.equal((await f.tools().command(run)).job.revision, job.revision);
  await assert.rejects(f.tools().command({ ...run, action: 'cancel' }), /異なります/);
  // A new service instance reads durable SQL state, not a JS cache.
  job = await f.tools().get(job.id);
  job = (await f.tools().command(command(job, 'advance'))).job;
  assert.equal(job.status, 'review');
  job = (await f.tools().command(command(job, 'complete'))).job;
  assert.equal(job.status, 'completed');
  const thread = await f.history().get(input.threadId);
  assert.equal(thread.remember, false);
  assert.equal(thread.session.messages.length, 2);
  assert.match(thread.session.messages[1].text, /検査済み・完了/);
  assert.match(thread.session.messages[1].text, new RegExp(job.id));
  assert.match(thread.session.messages[1].text, /https:\/\/example.com\/evidence/);
  const raw = f.sql.prepare('SELECT envelope FROM eve_messages').all();
  assert.ok(raw.every(r => !r.envelope.includes('一次資料')));
  assert.equal(result.usage.paidProviderCalled, false);
  assert.equal((await f.tools('bob').list()).length, 0);
  await assert.rejects(f.tools('bob').get(job.id), /見つかりません/);
  await assert.rejects(f.tools('bob').command(command(job, 'advance')), /見つかりません/);
});
void test('URL verification rejects missing/added links independently of formatting', () => {
  const source = '[A](https://example.com/a) [A](https://example.com/a)';
  assert.equal(verifyEveCitationOutput(source, '[A](https://example.com/a)').every(c => c.passed), true);
  assert.equal(verifyEveCitationOutput(source, 'リンクなし').every(c => c.passed), false);
  assert.equal(verifyEveCitationOutput(source, '[A](https://example.com/a) [B](https://evil.invalid)').every(c => c.passed), false);
});
void test('creation consent, collisions, revision races, cancellation and source hash bind execution', async t => {
  const f = fixture(t), store = f.tools(), input = request();
  await assert.rejects(store.create({ ...input, saveMaterial: false }), /同意/);
  let job = (await store.create(input)).job;
  assert.equal((await store.create(input)).job.revision, 0);
  await assert.rejects(store.create({ ...input, source: '変更した素材' }), /異なります/);
  await assert.rejects(store.command(command(job, 'complete')), /独立検査/);
  const competing = await Promise.allSettled([store.command(command(job, 'advance')), store.command(command(job, 'cancel'))]);
  assert.equal(competing.filter(r => r.status === 'fulfilled').length, 1);
  job = await store.get(job.id);
  if (job.status !== 'cancelled') job = (await store.command(command(job, 'cancel'))).job;
  await assert.rejects(store.command(command(job, 'advance')), /実行できる/);
  const next = request(); const altered = (await store.create(next)).job;
  altered.composition.source = '差替え';
  f.sql.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(altered), altered.id);
  await assert.rejects(store.command(command(altered, 'advance')), /素材が変更/);
});
void test('a missing history projection is repairable without rerunning a Tool, and deleted threads cannot restart', async t => {
  const f = fixture(t), store = f.tools(), input = request();
  let job = (await store.create(input)).job;
  job = (await store.command(command(job, 'advance'))).job;
  const before = job.revision, artifact = job.composition.artifacts.s1.text;
  const repaired = await store.command(command(job, 'sync'));
  assert.equal(repaired.job.revision, before);
  assert.equal(repaired.job.composition.artifacts.s1.text, artifact);
  const thread = await f.history().get(input.threadId);
  await f.history().remove(input.threadId, thread.revision);
  await assert.rejects(store.command(command(job, 'advance')), /会話が見つかりません/);
  const stopped = await store.command(command(job, 'cancel'));
  assert.equal(stopped.job.status, 'cancelled');
  assert.equal(stopped.historySaved, false);
  await assert.rejects(store.create({ ...request(), threadId: input.threadId }), /削除済み/);
});

void test('conversation deletion between history synchronization and job insert leaves no orphan Tool job', async t => {
  const f=fixture(t), input=request(), prepare=f.db.prepare; let raced=false;
  f.db.prepare=(query,...args)=>{
    if (!raced && /INSERT INTO work_jobs/.test(query)) {
      raced=true; f.sql.prepare('UPDATE eve_conversations SET deleted_at=? WHERE owner_id=? AND id=?').run(Date.now(),'alice',input.threadId);
    }
    return prepare(query,...args);
  };
  await assert.rejects(f.tools().create(input));
  assert.equal(raced,true);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM work_jobs WHERE id=?').get(input.jobId).n,0);
  await assert.rejects(f.history().get(input.threadId));
});

void test('Tool work and thread selection are scoped before the 100-job limit', async t => {
  const f=fixture(t), input=request(); const job=(await f.tools().create(input)).job;
  f.sql.prepare('UPDATE work_jobs SET updated_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',job.id);
  const insert=f.sql.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)');
  for(let n=0;n<101;n++){const id=crypto.randomUUID();const noise={...job,id,eveTool:undefined};insert.run(id,'alice',JSON.stringify(noise),0,'2099-01-01T00:00:00.000Z');}
  assert.deepEqual((await f.tools().list()).map(j=>j.id),[job.id]);
  assert.deepEqual((await f.tools().list(input.threadId)).map(j=>j.id),[job.id]);
  assert.equal((await f.tools('bob').list(input.threadId)).length,0);
  assert.equal((await f.tools().list(crypto.randomUUID())).length,0);
});
