import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkJob, applyWorkCommand, workflowTemplates } from '../lib/workflow.ts';
import { readWorkJob, readWorkJobs, readWorkJobResponse, workJobConfirmsCommand } from '../lib/work-job-view.ts';
const id = '11111111-1111-4111-8111-111111111111';
const commandId = '22222222-2222-4222-8222-222222222222';
const ownerScope = `owner-v1:${'a'.repeat(64)}`;
const job = () => createWorkJob({ id, title: 'Synthetic validated workflow', templateId: 'article' });

void test('work read model accepts existing templates and legacy ownerless reads without granting owner identity', () => {
  for (const template of workflowTemplates) {
    const source = createWorkJob({ id, title: 'Synthetic template', templateId: template.id });
    assert.equal(readWorkJob(source), source);
    assert.equal(readWorkJobResponse({ job: source }), source);
  }
  assert.equal(readWorkJobs({ jobs: [job()] }).ownerScope, null);
  assert.equal(readWorkJobs({ jobs: [job()], ownerScope }).ownerScope, ownerScope);
});

void test('work projections reject malformed rendered fields and never infer plan approvals', () => {
  const mutations = [
    (v) => { v.steps = null; }, (v) => { v.events = {}; },
    (v) => { v.steps[0].passed = 'false'; }, (v) => { v.steps[0].title = {}; },
    (v) => { v.revision = -1; }, (v) => { v.updatedAt = 'not a date'; },
    (v) => { v.status = 'executing'; }, (v) => { v.id = 'not-a-job-id'; },
    (v) => { v.plan = {}; }, (v) => { v.plan.approvalGates[0].requirement = 'approved'; },
    (v) => { v.events = [{ at: v.updatedAt, command: { id: commandId, action: 'complete', note: {} } }]; },
  ];
  for (const change of mutations) { const bad = job(); change(bad); assert.throws(() => readWorkJob(bad)); }
  for (const value of [{ jobs: {} }, { jobs: [job()], ownerScope: null }, { jobs: [job()], ownerScope: 'bad' }, {}])
    assert.throws(() => readWorkJobs(value));
});

void test('only the same durable command at a later revision confirms an uncertain record', () => {
  const before = job();
  const command = { id: commandId, action: 'record', stepId: before.steps[0].id, tool: before.steps[0].tool,
    transport: 'browser', outcome: 'passed', sample: false, durationMs: 10 };
  const pending = { jobId: id, revision: before.revision, command };
  const after = applyWorkCommand(before, command, before.revision);
  assert.equal(workJobConfirmsCommand(readWorkJob(after), pending), true);
  assert.equal(workJobConfirmsCommand(before, pending), false);
  assert.equal(workJobConfirmsCommand({ ...after, id: commandId }, pending), false);
  assert.equal(workJobConfirmsCommand({ ...after, revision: before.revision }, pending), false);
  assert.equal(workJobConfirmsCommand(after, { ...pending, command: { ...command, sample: true } }), false);
});
