import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  createWorkJob,
  applyWorkCommand,
  parseWorkCommand,
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
test('workflows require ordered real runs, survive serialization, and need a final review', () => {
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
test('sample, failed and needs-review results never advance a step', () => {
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
test('replayed receipts are idempotent, conflicting payloads and stale updates fail', () => {
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
test('invalid inputs, unknown fields and mutation after cancellation are rejected', () => {
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
test('real SQLite persists jobs per user and prevents concurrent overwrites', async (t) => {
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
  assert.equal((await store.list('alice')).length, 1);
});
