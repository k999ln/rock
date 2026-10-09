import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  renderWorkspaces,
  taskBrief,
  workspaceModel,
} from '../scripts/workspaces.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const inputs = () => [
  read('data/mission-control.json'),
  read('data/project-status.json'),
  read('data/workspaces.json'),
];

void test('each existing task appears in exactly its assigned workspace, including historical tasks', () => {
  const model = workspaceModel(...inputs());
  const pages = renderWorkspaces(model);
  for (const task of model.tasks.values()) {
    const containing = [...pages].filter(([, text]) =>
      text
        .split('\n')
        .some(
          (line) =>
            line.startsWith(`| ${task.id} |`) ||
            line.startsWith(`| ${task.id}（`),
        ),
    );
    assert.equal(containing.length, 1, task.id);
    assert.equal(
      containing[0][0],
      `workspaces/${model.assignments.get(task.id).primarySquad}/README.md`,
    );
  }
});

void test('missing, duplicate and unknown primary assignments fail instead of guessing from prefixes', () => {
  for (const change of [
    (m) => m.taskAssignments.pop(),
    (m) => m.taskAssignments.push(m.taskAssignments[0]),
    (m) => {
      m.taskAssignments[0].primarySquad = 'UNKNOWN';
    },
  ]) {
    const data = inputs();
    change(data[0]);
    assert.throws(() => workspaceModel(...data), /担当/);
  }
  const data = inputs();
  data[2].pop();
  assert.throws(() => workspaceModel(...data), /全分野/);
});

void test('parent execution holds remain visible for children even when a task is marked done', () => {
  const data = inputs();
  data[1].tasks.find((task) => task.id === 'SKY19-01').status = 'done';
  const model = workspaceModel(...data);
  assert.equal(model.holdsFor('SKY19-01').length, 1);
  const brief = taskBrief(model, 'SKY19-01');
  assert.match(brief, /実行保留: ToC収益料金/);
  assert.match(brief, /解除条件:/);
  assert.match(brief, /完了記録あり/);
  assert.match(
    renderWorkspaces(model).get('workspaces/O5/README.md'),
    /実行保留: ToC収益料金/,
  );
});

void test('briefs preserve actual prerequisites, steps, acceptance criteria and unassigned owners', () => {
  const model = workspaceModel(...inputs());
  const before = JSON.stringify(model.project);
  for (const plan of model.plans.values()) {
    const text = taskBrief(model, plan.taskId);
    for (const step of plan.steps) assert.ok(text.includes(step.action));
    for (const check of plan.acceptanceCriteria)
      assert.ok(text.includes(check.criterion));
    for (const id of model.pendingFor(model.tasks.get(plan.taskId)))
      assert.ok(text.includes(id));
    if (plan.assignee === null) assert.ok(text.includes('担当者: 未割当'));
    assert.ok(!text.includes('undefined'), plan.taskId);
  }
  assert.equal(JSON.stringify(model.project), before);
  assert.match(taskBrief(model, 'ORG04'), /詳細手順は未登録/);
  assert.throws(() => taskBrief(model, 'MISSING'), /taskがありません/);
});

void test('all generated local links resolve, including links between workspace pages', () => {
  const pages = renderWorkspaces(workspaceModel(...inputs()));
  for (const [path, text] of pages) {
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const destination = resolve(root, dirname(path), match[1]);
      assert.ok(existsSync(destination), `${path}: ${match[1]}`);
    }
  }
});

void test('CLI searches without writes and rejects an unknown task', () => {
  const before = [
    'data/project-status.json',
    'data/mission-control.json',
    'workspaces/IDEAS.md',
  ].map((p) => readFileSync(resolve(root, p), 'utf8'));
  const run = (...args) =>
    execFileSync(process.execPath, ['scripts/workspaces.mjs', ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  assert.match(run('--find', 'MCP'), /SKY07 \[O4\]/);
  assert.match(run('SKY19-01'), /実行保留/);
  assert.doesNotMatch(run('--find', 'eSIM'), /該当なし/);
  const failure = spawnSync(
    process.execPath,
    ['scripts/workspaces.mjs', 'not-a-task'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /使い方/);
  const after = [
    'data/project-status.json',
    'data/mission-control.json',
    'workspaces/IDEAS.md',
  ].map((p) => readFileSync(resolve(root, p), 'utf8'));
  assert.deepEqual(after, before);
});
