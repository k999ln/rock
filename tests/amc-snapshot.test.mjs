import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mission = JSON.parse(read('data/amc/mission-control.json'));
const project = JSON.parse(read('data/amc/project-status.json'));
const tasks = new Map(project.tasks.map((task) => [task.id, task]));
void test('AMC snapshot preserves the source hashes and remains separate from the current checkout status', () => {
  const provenance = JSON.parse(read('data/amc/provenance.json'));
  assert.equal(provenance.scope, 'read_only_snapshot_not_current_checkout_task_status');
  for (const file of provenance.files) assert.equal(createHash('sha256').update(read(file.snapshot)).digest('hex'), file.sha256);
  assert.equal(mission.squads.length, 32);
  assert.equal(tasks.size, 376);
  assert.equal(mission.taskPlans.length, 224);
  assert.notEqual(read('data/amc/project-status.json'), read('data/project-status.json'));
});
void test('every task has one owner; related tasks and parents do not double count execution units', () => {
  const owner = new Map();
  for (const assignment of mission.taskAssignments) {
    assert.ok(tasks.has(assignment.taskId));
    assert.equal(owner.has(assignment.taskId), false);
    owner.set(assignment.taskId, assignment.primarySquad);
  }
  assert.equal(owner.size, tasks.size);
  for (const squad of mission.squads) {
    for (const id of squad.taskIds) assert.equal(owner.get(id), squad.id);
    for (const item of squad.relatedTasks) assert.ok(tasks.has(item.taskId));
    assert.ok(squad.stageAssessment.scope);
    assert.ok(squad.stageAssessment.references.length);
  }
  const parents = new Set(project.tasks.flatMap((task) => task.parentTaskId ? [task.parentTaskId] : []));
  assert.equal(parents.size, 32);
  assert.equal(project.tasks.filter((task) => !parents.has(task.id)).length, 344);
  for (const task of project.tasks) {
    for (const dependency of task.dependsOn ?? []) assert.ok(tasks.has(dependency));
    if (task.parentTaskId) {
      assert.ok(tasks.has(task.parentTaskId));
      assert.equal(owner.get(task.id), owner.get(task.parentTaskId));
      assert.ok(!task.dependsOn?.includes(task.parentTaskId));
    }
  }
});
