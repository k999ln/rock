import test from 'node:test';
import assert from 'node:assert/strict';
import { eveAgentFixture } from './helpers/eve-agent-fixture.mjs';
import { createWorkJob, requestEveAgentStop } from '../lib/workflow.ts';
import { workStore } from '../lib/work-store.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { eveAgentWorkStore, reconcileEveAgentStops } from '../lib/eve-agent-work.ts';
import { eveHistoryStore } from '../lib/eve-history.ts';
async function setup(t) {
  const f = eveAgentFixture(t), works = workStore(f.db), agents = a2aDelegationStore(f.db), eve = eveAgentWorkStore(f.db, 'alice', f.keys);
  let job = await works.create('alice', createWorkJob({ id: crypto.randomUUID(), title: 'Agentへ合成の調査を依頼', templateId: 'cloud-agent' }));
  const threadId = crypto.randomUUID(); job = (await eve.bind({ jobId: job.id, threadId, revision: job.revision })).job;
  const input = { id: crypto.randomUUID(), parentJobId: job.id, idempotencyKey: crypto.randomUUID(), messageId: crypto.randomUUID(), targetOrigin: 'https://agent.example.test', targetAgentName: '独立fixture Agent', targetAgentVersion: '1', protocolVersion: '1.0', inputSha256: 'a'.repeat(64), authorizationSha256: 'b'.repeat(64), budgetCurrency: 'USD', budgetLimitMinor: 10, parentBudgetLimitMinor: 20, continueWhileDeviceOffline: true, deadlineAt: Date.now() + 60000 };
  const approve = async (value = input) => { await agents.prepare('alice', value); return agents.approve('alice', value.id, value.authorizationSha256, { ciphertext: 'synthetic', nonce: 'synthetic', inputSha256: value.inputSha256, keyVersion: 'aes-256-gcm-v1' }); };
  return { ...f, works, agents, eve, job, threadId, input, approve };
}
void test('Eve creates one parent already bound to its conversation; replay never grants execution or revives a stopped job', async t => {
  const f = eveAgentFixture(t), eve = eveAgentWorkStore(f.db, 'alice', f.keys);
  f.sqlite.exec("CREATE TRIGGER require_initial_eve_binding BEFORE INSERT ON work_jobs WHEN json_extract(NEW.payload,'$.eveAgent.threadId') IS NULL BEGIN SELECT RAISE(ABORT,'unbound parent insertion'); END");
  const input = { create: true, jobId: crypto.randomUUID(), threadId: crypto.randomUUID(), title: '合成の調査を任せる' };
  const result = await eve.create(input);
  assert.equal(result.historySaved, true); assert.equal(result.job.eveAgent.threadId, input.threadId);
  assert.match(result.job.eveAgent.creationRequestSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.children.length, 0); assert.equal(result.job.events.length, 0);
  assert.deepEqual(result.job.plan, createWorkJob({ id: input.jobId, title: input.title, templateId: 'cloud-agent' }).plan);
  const stopped = await eve.command({ action: 'stop', jobId: input.jobId, revision: result.job.revision, commandId: crypto.randomUUID() });
  const replay = await eve.create(input);
  assert.equal(replay.job.status, 'cancelled'); assert.equal(replay.job.revision, stopped.job.revision);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 1);
  await assert.rejects(eve.create({ ...input, title: '変更した依頼' }), e => e.status === 409);
  await assert.rejects(eve.create({ ...input, threadId: crypto.randomUUID() }), e => e.status === 409);
});
void test('concurrent Eve parent creation shares the same durable identity and retry returns the saved binding', async t => {
  const f = eveAgentFixture(t), input = { create: true, jobId: crypto.randomUUID(), threadId: crypto.randomUUID(), title: '同時作成の合成依頼' };
  const run = () => eveAgentWorkStore(f.db, 'alice', f.keys).create(input);
  const outcomes = await Promise.allSettled([run(), run()]);
  assert.ok(outcomes.some(v => v.status === 'fulfilled'));
  for (const v of outcomes) if (v.status === 'rejected') assert.equal(v.reason.status, 409);
  const restored = await run();
  assert.equal(restored.job.id, input.jobId); assert.equal(restored.job.eveAgent.threadId, input.threadId);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 1);
  assert.equal((await a2aDelegationStore(f.db).listForParent('alice', input.jobId)).length, 0);
});
void test('new Eve Agent creation requires history keys, cannot reuse deleted conversations or another owner parent', async t => {
  const f = eveAgentFixture(t), eve = eveAgentWorkStore(f.db, 'alice', f.keys);
  const input = { create: true, jobId: crypto.randomUUID(), threadId: crypto.randomUUID(), title: '本人用の合成依頼' };
  await assert.rejects(eveAgentWorkStore(f.db, 'alice').create(input), e => e.status === 503);
  await eve.create(input);
  const history = eveHistoryStore(f.db, 'alice', f.keys, true), item = await history.get(input.threadId);
  await history.remove(input.threadId, item.revision);
  await assert.rejects(eve.create({ ...input, jobId: crypto.randomUUID() }), e => e.status === 410);
  await assert.rejects(eveAgentWorkStore(f.db, 'bob', f.keys).create({ ...input, threadId: crypto.randomUUID() }), e => e.status === 409);
  await assert.rejects(eveAgentWorkStore(f.db, 'bob', f.keys).read(input.jobId), e => e.status === 404);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM eve_messages WHERE owner_id=? AND thread_id=?').get('alice', input.threadId).n, 0);
});
void test('same owner cloud job binds to the same durable Eve thread; stop before send releases no invented usage', async t => {
  const f = await setup(t); await f.approve();
  assert.equal((await f.eve.list(f.threadId))[0].id, f.job.id);
  assert.equal((await f.eve.bind({ jobId: f.job.id, threadId: f.threadId, revision: 0 })).job.revision, f.job.revision);
  await assert.rejects(f.eve.bind({ jobId: f.job.id, threadId: crypto.randomUUID(), revision: f.job.revision }), /別のEve/);
  await assert.rejects(eveAgentWorkStore(f.db, 'bob', f.keys).read(f.job.id), /見つかりません/);
  const command = { action: 'stop', jobId: f.job.id, revision: f.job.revision, commandId: crypto.randomUUID() };
  const stopped = await f.eve.command(command);
  assert.equal(stopped.stop.confirmed, true); assert.equal(stopped.job.status, 'cancelled');
  assert.equal(stopped.children[0].state, 'cancelled_before_dispatch');
  assert.equal(stopped.children[0].usage, null);
  assert.equal((await f.eve.command(command)).job.revision, stopped.job.revision);
  const history = await eveHistoryStore(f.db, 'alice', f.keys, true).get(f.threadId);
  assert.match(history.session.messages.at(-1).text, /停止確認済み/);
});
void test('in-flight/unknown remote cancellation stays pending across reopen until existing receipt reconciliation confirms a terminal state', async t => {
  const f = await setup(t); const prepared = await f.approve();
  const claimed = await f.agents.claimDispatch('alice', prepared.id);
  const sending = await f.agents.beginRemoteSend('alice', claimed.id, claimed.revision);
  const working = await f.agents.recordTaskReceipt('alice', sending.id, sending.revision, { id: 'remote-task', state: 'TASK_STATE_WORKING' });
  let result = await f.eve.command({ action: 'stop', jobId: f.job.id, revision: f.job.revision, commandId: crypto.randomUUID() });
  assert.equal(result.stop.confirmed, false); assert.equal(result.job.status, 'active');
  assert.equal(result.children[0].state, 'cancel_requested');
  const existing = await f.agents.get('alice', working.id);
  const uncertain = await f.agents.confirmCancelResult('alice', existing.id, existing.revision, 'TASK_STATE_WORKING');
  result = await eveAgentWorkStore(f.db, 'alice', f.keys).command({ action: 'sync', jobId: f.job.id });
  assert.equal(result.stop.confirmed, false); assert.equal(result.children[0].state, 'cancel_unconfirmed');
  await f.agents.confirmCancelResult('alice', uncertain.id, uncertain.revision, 'TASK_STATE_CANCELED');
  result = await eveAgentWorkStore(f.db, 'alice', f.keys).command({ action: 'sync', jobId: f.job.id });
  assert.equal(result.stop.confirmed, true); assert.equal(result.job.status, 'cancelled');
});
void test('durable stop intent fences draft/approval/claim/send even if process stops before child cancellation', async t => {
  const f = await setup(t); const prepared = await f.approve();
  const claimed = await f.agents.claimDispatch('alice', prepared.id);
  const second = { ...f.input, id: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), messageId: crypto.randomUUID() };
  await f.agents.prepare('alice', second);
  const stoppedIntent = requestEveAgentStop(f.job, crypto.randomUUID(), f.job.revision);
  assert.equal(await f.works.update('alice', stoppedIntent, f.job.revision), true);
  await assert.rejects(f.agents.beginRemoteSend('alice', claimed.id, claimed.revision), /状態が他の操作/);
  await assert.rejects(f.agents.approve('alice', second.id, second.authorizationSha256, { ciphertext: 'synthetic', nonce: 'synthetic', inputSha256: second.inputSha256, keyVersion: 'aes-256-gcm-v1' }));
  assert.equal((await f.agents.prepare('alice', { ...second, id: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() })).delegation, null);
  const result = await eveAgentWorkStore(f.db, 'alice', f.keys).command({ action: 'sync', jobId: f.job.id });
  assert.equal(result.stop.confirmed, true); assert.equal(result.job.status, 'cancelled');
  assert.equal((await f.agents.get('alice', second.id)).state, 'cancelled_before_dispatch');
});

void test('stop committed between dispatch read and send marker is fenced by SQL rather than a stale preflight check', async t => {
  const f = await setup(t), prepared = await f.approve(), claimed = await f.agents.claimDispatch('alice', prepared.id);
  const batch = f.db.batch.bind(f.db); let fired = false;
  f.db.batch = async statements => {
    if (!fired) {
      fired = true;
      const intent = requestEveAgentStop(f.job, crypto.randomUUID(), f.job.revision);
      f.sqlite.prepare('UPDATE work_jobs SET payload=?,revision=? WHERE id=?').run(JSON.stringify(intent), intent.revision, intent.id);
    }
    return batch(statements);
  };
  await assert.rejects(f.agents.beginRemoteSend('alice', claimed.id, claimed.revision), /状態が他の操作/);
  assert.equal((await f.agents.listEvents('alice', claimed.id)).filter(e => e.eventType === 'remote_send_claimed').length, 0);
  assert.equal((await f.agents.get('alice', claimed.id)).state, 'dispatching');
});

void test('the WorkStore completion CAS cannot race past an unresolved bound child', async t => {
  const f = await setup(t); await f.approve();
  // The persistence boundary rejects completion even if a stale controller
  // believed all child receipts were already present.
  const candidate = { ...f.job, revision: f.job.revision + 1, status: 'completed' };
  assert.equal(await f.works.update('alice', candidate, f.job.revision), false);
  assert.equal((await f.works.get('alice', f.job.id)).status, 'active');
});

void test('loss of history encryption access does not block owner stopping; no plaintext fallback is saved', async t => {
  const f = await setup(t); await f.approve();
  const withoutHistory = eveAgentWorkStore(f.db, 'alice');
  const result = await withoutHistory.command({ action: 'stop', jobId: f.job.id, revision: f.job.revision, commandId: crypto.randomUUID() });
  assert.equal(result.stop.confirmed, true); assert.equal(result.historySaved, false);
  await assert.rejects(withoutHistory.bind({ jobId: f.job.id, threadId: f.threadId, revision: result.job.revision }), /暗号化保管/);
  const raw = f.sqlite.prepare('SELECT envelope FROM eve_messages').all();
  assert.ok(raw.every(r => !r.envelope.includes('独立fixture')));
});

void test('the periodic-worker scan can recover saved stop intent without history access or new execution permission', async t => {
  const f = await setup(t); await f.approve();
  const intent = requestEveAgentStop(f.job, crypto.randomUUID(), f.job.revision);
  await f.works.update('alice', intent, f.job.revision);
  const parents = await f.agents.listEveStoppingParents();
  assert.deepEqual(parents, [{ id: f.job.id, ownerUserId: 'alice' }]);
  assert.equal(await f.agents.parentStopRequested('alice', f.input.id), true);
  assert.equal(await f.agents.parentStopRequested('bob', f.input.id), false);
  assert.deepEqual(await reconcileEveAgentStops(f.db), { scanned: 1, failed: 0 });
  assert.equal((await f.works.get('alice', f.job.id)).status, 'cancelled');
  assert.deepEqual(await f.agents.listEveStoppingParents(), []);
});

void test('an unconfirmed external cancellation does not monopolize the bounded periodic recovery scan', async t => {
  const f = await setup(t); const approved = await f.approve();
  const claimed = await f.agents.claimDispatch('alice', approved.id);
  const sending = await f.agents.beginRemoteSend('alice', claimed.id, claimed.revision);
  await f.agents.recordTaskReceipt('alice', sending.id, sending.revision, { id: 'pending-task', state: 'TASK_STATE_WORKING' });
  const second = createWorkJob({ id: crypto.randomUUID(), templateId: 'cloud-agent', title: 'Other pending stop' });
  await f.works.create('alice', second);
  const secondBound = (await f.eve.bind({ jobId: second.id, threadId: crypto.randomUUID(), revision: second.revision })).job;
  await f.works.update('alice', requestEveAgentStop(f.job, crypto.randomUUID(), f.job.revision), f.job.revision);
  await f.works.update('alice', requestEveAgentStop(secondBound, crypto.randomUUID(), secondBound.revision), secondBound.revision);
  await f.db.prepare('UPDATE work_jobs SET updated_at=? WHERE id=?').bind('2026-01-01T00:00:00.000Z', f.job.id).run();
  await f.db.prepare('UPDATE work_jobs SET updated_at=? WHERE id=?').bind('2026-01-02T00:00:00.000Z', second.id).run();
  assert.equal((await f.agents.listEveStoppingParents(1))[0].id, f.job.id);
  assert.deepEqual(await reconcileEveAgentStops(f.db, 1), { scanned: 1, failed: 0 });
  const stillPending = await f.eve.read(f.job.id);
  assert.equal(stillPending.stop.confirmed, false);
  assert.equal((await f.agents.listEveStoppingParents(1))[0].id, second.id);
});
