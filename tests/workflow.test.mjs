import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  createWorkJob,
  applyWorkCommand,
  parseWorkCommand,
  normalizeWorkJob,
} from '../lib/workflow.ts';
import { workStore } from '../lib/work-store.ts';

const newJob = (templateId = 'article') =>
  createWorkJob({ id: randomUUID(), title: '確認用の仕事', templateId });
function run(job, extra = {}) {
  const step = job.steps.find((item) => !item.passed);
  return {
    id: randomUUID(),
    action: 'record',
    stepId: step.id,
    tool: step.tool,
    transport: step.tool === 'mr-delivery' ? 'local-mcp' : 'browser',
    outcome: 'passed',
    sample: false,
    durationMs: 12,
    ...extra,
  };
}
void test('workflows require ordered real runs, survive serialization, and need a final review', () => {
  for (const template of ['article', 'coconala']) {
    let job = newJob(template);
    assert.throws(() =>
      applyWorkCommand(
        job,
        { id: randomUUID(), action: 'complete', note: '確認済み' },
        0,
      ),
    );
    job = applyWorkCommand(job, run(job), 0);
    job = JSON.parse(JSON.stringify(job));
    assert.equal(job.status, 'active');
    job = applyWorkCommand(job, run(job), job.revision);
    assert.equal(job.status, 'review');
    assert.throws(() =>
      applyWorkCommand(
        job,
        { id: randomUUID(), action: 'complete', note: '' },
        job.revision,
      ),
    );
    job = applyWorkCommand(
      job,
      {
        id: randomUUID(),
        action: 'complete',
        note: '成果物と依頼条件を確認した。',
      },
      job.revision,
    );
    assert.equal(job.status, 'completed');
    assert.equal(job.events.length, 3);
    assert.throws(() =>
      applyWorkCommand(
        job,
        { id: randomUUID(), action: 'cancel' },
        job.revision,
      ),
    );
  }
});
void test('cloud Agent work keeps A2A quote and result review as explicit ordered steps', () => {
  const job = newJob('cloud-agent');
  assert.deepEqual(job.steps.map((step) => step.id), ['agent-brief', 'agent-result']);
  assert.equal(job.steps[0].passed, false);
  assert.equal(job.steps[1].passed, false);
  assert.throws(() => applyWorkCommand(job, {
    id: randomUUID(), action: 'record', stepId: 'agent-brief', tool: 'sky-a2a-brief',
    transport: 'browser', outcome: 'passed', sample: false, durationMs: 1,
  }, job.revision), { status: 409 });
  const first = applyWorkCommand(job, {
    id: randomUUID(), action: 'record', stepId: 'agent-brief', tool: 'sky-a2a-brief',
    transport: 'browser', outcome: 'passed', sample: false, durationMs: 1,
    delegationId: randomUUID(),
  }, job.revision);
  assert.equal(first.steps[0].passed, true);
  assert.match(first.events[0].command.delegationId, /^[0-9a-f-]{36}$/i);
  assert.throws(() => applyWorkCommand(job, {
    id: randomUUID(), action: 'record', stepId: 'agent-result', tool: 'sky-a2a-result',
    transport: 'browser', outcome: 'passed', sample: false, durationMs: 1,
  }, job.revision));
});
void test('versioned plan objective is editable only before work and gates cannot be relaxed', () => {
  const job = newJob('cloud-agent');
  assert.equal(job.plan.schemaVersion, 1);
  assert.deepEqual(job.plan.approvalGates, [
    { stepId: 'agent-brief', requirement: 'provider_quote_wallet_reservation_and_explicit_cloud_approval' },
    { stepId: 'agent-result', requirement: 'terminal_result_captured_with_usage_receipt' },
  ]);
  const update = {
    id: randomUUID(), action: 'edit_plan', schemaVersion: 1,
    objective: '圏外でも続くAgent作業の成果と実測使用量を確認する',
  };
  const edited = applyWorkCommand(job, update, job.revision);
  assert.equal(edited.plan.objective, update.objective);
  assert.deepEqual(edited.plan.approvalGates, job.plan.approvalGates);
  assert.equal(edited.events[0].command.action, 'edit_plan');
  assert.throws(() => parseWorkCommand({ ...update, schemaVersion: 2 }));
  assert.throws(() => parseWorkCommand({ ...update, approvalGates: [] }));
  const started = applyWorkCommand(edited, {
    ...run(edited), delegationId: randomUUID(),
  }, edited.revision);
  assert.throws(() => applyWorkCommand(started, {
    ...update, id: randomUUID(), objective: '変更後の目的',
  }, started.revision), { status: 409 });
});
void test('legacy persisted jobs hydrate the current plan schema and restore fixed gates', () => {
  const job = newJob('cloud-agent');
  const { plan: _oldPlan, ...legacy } = job;
  const upgraded = normalizeWorkJob(legacy);
  assert.equal(upgraded.plan.schemaVersion, 1);
  assert.equal(upgraded.plan.objective, legacy.title);
  const altered = normalizeWorkJob({
    ...job,
    plan: { ...job.plan, approvalGates: [{ stepId: 'agent-brief', requirement: 'none' }] },
  });
  assert.deepEqual(altered.plan.approvalGates, job.plan.approvalGates);
});
void test('sample, failed and needs-review results never advance a step', () => {
  let job = newJob('coconala');
  for (const extra of [
    { sample: true },
    { outcome: 'failed' },
    { outcome: 'needs_review' },
  ]) {
    job = applyWorkCommand(job, run(job, extra), job.revision);
    assert.equal(job.steps[0].passed, false);
  }
  job = applyWorkCommand(job, run(job), job.revision);
  assert.throws(() =>
    applyWorkCommand(job, run(job, { transport: 'browser' }), job.revision),
  );
  job = applyWorkCommand(
    job,
    run(job, { outcome: 'needs_review' }),
    job.revision,
  );
  assert.equal(job.steps[1].passed, false);
  assert.equal(job.events.length, 5);
});
void test('replayed receipts are idempotent, conflicting payloads and stale updates fail', () => {
  const before = newJob(),
    command = run(before),
    after = applyWorkCommand(before, command, 0);
  assert.equal(applyWorkCommand(after, command, 0), after);
  assert.throws(
    () => applyWorkCommand(after, { ...command, durationMs: 99 }, 0),
    { status: 409 },
  );
  assert.throws(() => applyWorkCommand(after, run(after), 0), { status: 409 });
  assert.throws(() =>
    applyWorkCommand(
      before,
      run(before, { stepId: 'free-article', tool: 'mr-free-article' }),
      0,
    ),
  );
});
void test('invalid inputs, unknown fields and mutation after cancellation are rejected', () => {
  for (const input of [
    null,
    [],
    {},
    { id: randomUUID(), title: '', templateId: 'article' },
    { id: randomUUID(), title: 'x', templateId: 'shell' },
  ])
    assert.throws(() => createWorkJob(input));
  const job = newJob();
  for (const extra of [
    { sample: 'false' },
    { durationMs: Infinity },
    { durationMs: -1 },
    { durationMs: 1.1 },
    { transport: 'shell' },
    { transport: ['browser'] },
    { outcome: 'success' },
    { outcome: ['passed'] },
    { secret: 'not accepted' },
  ])
    assert.throws(() => parseWorkCommand(run(job, extra)));
  const cancelled = applyWorkCommand(
    job,
    { id: randomUUID(), action: 'cancel' },
    0,
  );
  assert.equal(cancelled.status, 'cancelled');
  assert.throws(() => applyWorkCommand(cancelled, run(cancelled), 1));
});
void test('real SQLite persists jobs per user and prevents concurrent overwrites', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'),
    );
  const store = workStore({
    prepare(sql) {
      return {
        bind(...args) {
          const statement = sqlite.prepare(sql);
          return {
            async first() {
              return statement.get(...args) ?? null;
            },
            async all() {
              return { results: statement.all(...args) };
            },
            async run() {
              return {
                meta: { changes: Number(statement.run(...args).changes) },
              };
            },
          };
        },
      };
    },
  });
  const job = newJob();
  assert.deepEqual(await store.create('alice', job), job);
  assert.equal(await store.get('bob', job.id), null);
  assert.deepEqual(await store.list('bob'), []);
  assert.equal(await store.create('bob', job), null);
  const next = applyWorkCommand(job, run(job), 0);
  assert.equal(await store.update('bob', next, 0), false);
  assert.equal(await store.update('alice', next, 0), true);
  assert.equal(
    await store.update('alice', { ...next, title: 'stale write' }, 0),
    false,
  );
  assert.deepEqual(await store.get('alice', job.id), next);
  const legacy = { ...job, id: randomUUID() };
  delete legacy.plan;
  sqlite.prepare('INSERT INTO work_jobs (id, user_id, payload, revision, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(legacy.id, 'alice', JSON.stringify(legacy), legacy.revision, legacy.updatedAt);
  assert.equal((await store.get('alice', legacy.id)).plan.schemaVersion, 1);
  assert.equal((await store.list('alice')).length, 2);

  const alteredCloud = newJob('cloud-agent');
  const requiredGates = structuredClone(alteredCloud.plan.approvalGates);
  alteredCloud.plan.approvalGates = [];
  alteredCloud.plan.objective = '保存済みの目的を維持する';
  sqlite.prepare('INSERT INTO work_jobs (id, user_id, payload, revision, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(alteredCloud.id, 'alice', JSON.stringify(alteredCloud), 0, alteredCloud.updatedAt);
  for (const restored of [await store.get('alice', alteredCloud.id),
    (await store.list('alice')).find((item) => item.id === alteredCloud.id)]) {
    assert.deepEqual(restored.plan.approvalGates, requiredGates);
    assert.equal(restored.plan.objective, alteredCloud.plan.objective);
    assert.equal(restored.revision, 0);
    assert.equal(restored.steps.some((step) => step.passed), false);
  }
  assert.equal(await store.get('bob', alteredCloud.id), null);

  const amc = createWorkJob({ id: randomUUID(), templateId: 'amc', brief: {
    request: '計画一覧を確認するWebアプリを作る', goal: '本人だけに概要を表示する', intent: 'Goal本文は詳細画面で読む',
  } });
  await store.create('alice', amc);
  const summaries = await store.listAmc('alice');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, amc.id);
  assert.deepEqual(summaries[0].plan, {
    schemaVersion: 1, objective: amc.title, approvalGates: [],
  });
  assert.equal(Object.hasOwn(summaries[0], 'amcGoal'), false);
  assert.deepEqual(summaries[0].events, []);
  assert.deepEqual(await store.listAmc('bob'), []);
  assert.equal((await store.list('alice', true)).some((item) => item.id === amc.id), false);
});
