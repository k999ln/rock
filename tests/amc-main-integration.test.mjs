import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWorkJob, normalizeWorkJob, applyWorkCommand } from '../lib/workflow.ts';
await test('AMC persists through main WorkPlan normalization without accepting generic edits', () => {
  const job = createWorkJob({ id: randomUUID(), templateId: 'amc', brief: { request: '進捗を管理するWebアプリを作る', goal: '統合手順を完成する', intent: '既存変更を保持する' } });
  assert.equal(job.plan.schemaVersion, 1);
  assert.deepEqual(normalizeWorkJob(job), job);
  const { plan, ...legacy } = job;
  assert.deepEqual(normalizeWorkJob(legacy).plan, plan);
  assert.throws(() => applyWorkCommand(job, { id: randomUUID(), action: 'edit_plan', schemaVersion: 1, objective: '別のGoal' }, 0), /AMC/);
  assert.equal(job.amcGoal.state, 'active');
});
