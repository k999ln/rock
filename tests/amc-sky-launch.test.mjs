import integration from '../data/amc/integration-input-status.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { prepareSkyGoal, validateSkyPlan } from '../scripts/amc-sky-plan.mjs';
import { validateGoal, applyGoalEvent, renderGoalPrompt } from '../scripts/amc-goal-engine.mjs';
import { createWorkJob, applyWorkCommand } from '../lib/workflow.ts';

const read = (name) => JSON.parse(readFileSync(new URL(`../data/amc/sky/${name}`, import.meta.url)));
const plan = read('sky-amc-plan.json'), original = read('sky-amc-goal.json');
const starter = () => prepareSkyGoal(plan, original);

await test('Sky source artifacts remain byte-identical and cover 12 squads, 36 readiness tasks and one separate follow-up', () => {
  for (const file of read('provenance.json').files)
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../data/amc/sky/${file.path}`, import.meta.url))).digest('hex'), file.sha256);
  assert.equal(plan.squads.length, 12);
  assert.equal(plan.tasks.length, 37);
  const goal = starter();
  assert.equal(goal.tasks.length, 36);
  assert.ok(!goal.tasks.some((task) => task.id === 'S11-04'));
  assert.equal(validateGoal(goal).ok, true);
  assert.equal(goal.state, 'draft');
  assert.equal(goal.revision, 0);
  assert.ok(goal.tasks.every((task) => task.status === 'pending' && !task.result));
  assert.ok(goal.overallAcceptance.criteria.every((c) => c.status === 'not_verified'));
  assert.equal(goal.requestBrief, undefined);
  assert.equal(goal.skyBrief.templateId, 'sky-specific-launch-v1');
});

await test('Sky intake rejects changed requirements, omitted tasks, dependency drift, unknown references and changed acceptance', () => {
  for (const change of [
    (p) => { p.tasks[0].requirementIds = []; },
    (p) => { p.tasks = p.tasks.slice(1); },
    (p) => { p.tasks[0].dependsOn = ['S11-03']; },
    (p) => { p.openDecisions[0].blocks.push('unknown'); },
    (p) => { p.tasks[0].acceptanceCriteria[0].criterion = 'silently weakened'; },
  ]) {
    const changed = structuredClone(plan); change(changed);
    assert.equal(validateSkyPlan(changed, original).ok, false);
    assert.throws(() => prepareSkyGoal(changed, original));
  }
});

await test('Sky starter resolves source inputs or declares not-integrated inputs without losing original artifacts or converting local configuration to production evidence', () => {
  const goal = starter();
  for (const task of goal.tasks) {
    assert.ok(task.requirementIds.includes('SKY-GOAL'));
    for (const input of task.inputs) assert.ok(existsSync(new URL(`../${input.path}`, import.meta.url)) || integration.missingInputs.includes(input.path), input.path);
  }
  assert.ok(plan.tasks.find((task) => task.id === 'S7-01').sourceEvidence.some((input) => input.path === 'lib/db.ts'));
  const config = goal.tasks.find((task) => task.id === 'S9-01').inputs.find((input) => input.path === 'wrangler.local.jsonc');
  assert.match(config.locator, /本番証拠ではない/);
});

await test('Sky-specific brief and instruction are validated, and instructions retain the real goal and manual alignment boundary', () => {
  const goal = starter();
  for (const brief of [{ ...goal.skyBrief, goal: 'unrelated' }, { ...goal.skyBrief, templateId: 'software-local-prototype-v1' }, null]) {
    assert.equal(validateGoal({ ...goal, skyBrief: brief }).ok, false);
  }
  const prompt = renderGoalPrompt(goal);
  assert.match(prompt, /Sky専用計画/);
  assert.match(prompt, /対応要求: SKY-GOAL/);
  assert.match(prompt, /自動同期・自動失効は未接続/);
  assert.doesNotMatch(prompt, /準備方式: ソフトウェアのローカル試作向け共通テンプレート/);
});

await test('Sky Goal saves as draft, cannot start before review, and preserves all launch gates on explicit approval', () => {
  let job = createWorkJob({ id: randomUUID(), templateId: 'amc', importGoal: starter() });
  assert.equal(job.amcGoal.state, 'draft');
  const approval = {
    id: randomUUID(), type: 'approve_plan', role: 'owner', actor: 'fixture-owner', expectedRevision: 0,
    scopeConfirmed: true, coverageStatement: 'Fixture review of scope, unresolved decisions and all gates.',
    acceptanceCriteria: job.amcGoal.overallAcceptance.criteria,
  };
  assert.throws(() => applyGoalEvent(job.amcGoal, { ...approval, type: 'start_task', taskId: 'S0-01', role: 'worker' }), /最新観測/);
  assert.throws(() => applyGoalEvent(job.amcGoal, { ...approval, acceptanceCriteria: approval.acceptanceCriteria.slice(0, 1) }), /cannot be removed/);
  job = applyWorkCommand(job, { id: approval.id, action: 'amc_event', event: approval }, job.revision);
  assert.equal(job.amcGoal.state, 'active');
  assert.ok(job.amcGoal.tasks.every((task) => task.status === 'pending'));
  assert.equal(job.amcGoal.overallAcceptance.accepted, false);
});
