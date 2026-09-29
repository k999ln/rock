import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import {
  root,
  validateMissionControl,
} from '../scripts/check-mission-control.mjs';
import {
  renderVisualization,
  renderSquadTable,
} from '../scripts/sync-mission-control.mjs';

const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const fixture = () => [
  read('data/mission-control.json'),
  read('data/project-status.json'),
  read('data/product-baseline.json'),
];

await test('AMC has explicit single ownership and 32 scoped next-task plans', () => {
  const [mission, project, baseline] = fixture();
  assert.deepEqual(validateMissionControl(mission, project, baseline), {
    squads: 32,
    tasks: project.tasks.length,
    plans: mission.taskPlans.length,
  });
  assert.equal(
    mission.taskAssignments.find((a) => a.taskId === 'DX01').primarySquad,
    'O5',
  );
  assert.equal(
    mission.taskAssignments.find((a) => a.taskId === 'PRO02').primarySquad,
    'P2',
  );
  assert.ok(
    !project.tasks.find((t) => t.id === 'PRO03').dependsOn.includes('GX02'),
  );
});

await test('AMC rejects missing, duplicate and inconsistent primary assignments', () => {
  for (const mutate of [
    (m) => m.taskAssignments.pop(),
    (m) => m.taskAssignments.push(m.taskAssignments[0]),
    (m) => m.squads[0].taskIds.pop(),
  ]) {
    const args = fixture();
    mutate(args[0]);
    assert.throws(() => validateMissionControl(...args), /primary/);
  }
});

await test('AMC rejects shared ownership inflation and historical next tasks', () => {
  let args = fixture();
  args[0].squads.find((s) => s.id === 'P3').taskIds.push('DX01');
  assert.throws(() => validateMissionControl(...args), /primary/);
  args = fixture();
  for (const assignment of args[0].taskAssignments.filter((a) => a.taskId === 'PRO02' || a.taskId.startsWith('PRO02-'))) {
    assignment.classification = 'historical';
  }
  assert.throws(() => validateMissionControl(...args), /旧版/);
});

await test('AMC cannot mark an unverified plan done or pass criteria without evidence', () => {
  let args = fixture();
  args[1].tasks.find((t) => t.id === 'PRO02').status = 'done';
  assert.throws(() => validateMissionControl(...args), /全条件の合格/);
  args = fixture();
  args[0].taskPlans.find(
    (p) => p.taskId === 'PRO02',
  ).acceptanceCriteria[0].status = 'passed';
  assert.throws(() => validateMissionControl(...args), /passedには証拠/);
});

await test('AMC cannot promote design references to physical acceptance', () => {
  const args = fixture();
  args[0].squads.find((s) => s.id === 'P2').currentStage = 4;
  assert.throws(() => validateMissionControl(...args), /同一候補/);
});

await test('AMC detects task dependency cycles and missing input sources', () => {
  let args = fixture();
  args[1].tasks.find((t) => t.id === 'PRO01-01').dependsOn.push('PRO01-02');
  assert.throws(() => validateMissionControl(...args), /循環/);
  args = fixture();
  args[0].taskPlans[0].inputs[0].path = 'docs/missing-amc-input.md';
  assert.throws(() => validateMissionControl(...args), /参照file/);
});

await test('AMC child work preserves ownership, prerequisites and separate output sections', () => {
  const [mission, project, baseline] = fixture();
  const children = project.tasks.filter((task) => task.parentTaskId);
  assert.equal(children.length, 192);
  assert.equal(new Set(children.map((task) => task.parentTaskId)).size, 32);
  assert.equal(project.tasks.length, 376);
  assert.equal(project.tasks.length - new Set(children.map((task) => task.parentTaskId)).size, 344);
  for (const squad of mission.squads) {
    assert.equal(children.filter((task) => squad.nextTaskIds.includes(task.parentTaskId)).length, 6);
  }
  assert.equal(project.tasks.find((task) => task.id === 'AMC02').parentTaskId, undefined);
  assert.equal(mission.taskAssignments.find((a) => a.taskId === 'AMC02').primarySquad, 'H1');
  assert.deepEqual(mission.squads.find((s) => s.id === 'H1').nextTaskIds, ['AMC01']);
  validateMissionControl(mission, project, baseline);
  for (const mutate of [
    (m, p) => { p.tasks.find((task) => task.id === 'PRO04-01').parentTaskId = 'PRO99'; },
    (m, p) => { p.tasks.find((task) => task.id === 'PRO04-01').dependsOn = []; },
    (m) => { m.taskPlans.find((plan) => plan.taskId === 'PRO04-01').deliverables[0].section = ''; },
    (m) => { m.taskAssignments.find((a) => a.taskId === 'PRO04-01').classification = 'coordination'; },
    (m) => { m.taskPlans.find((plan) => plan.taskId === 'PRO04-01').deliverables[0].path = 'docs/outside-parent.md'; },
    (m, p) => { p.tasks.find((task) => task.id === 'PRO04-01').dependsOn.push('PRO04'); },
  ]) {
    const args = fixture();
    mutate(args[0], args[1]);
    assert.throws(() => validateMissionControl(...args), /親|section/);
  }
});

await test('AMC planning leaves stay unexecuted and preserve parent output and execution boundaries', () => {
  const [mission, project] = fixture();
  const hardwarePlans = mission.taskPlans.filter((plan) => plan.parentTaskId && /^(MINI|PRO|RKT)/.test(plan.parentTaskId));
  assert.equal(hardwarePlans.length, 144);
  for (const plan of hardwarePlans) {
    assert.equal(plan.workloadClass, 'document');
    assert.match(plan.executionBoundary, /実行しない/);
    assert.equal(project.tasks.find((task) => task.id === plan.taskId).status, 'planned');
    assert.deepEqual(project.tasks.find((task) => task.id === plan.taskId).evidence, []);
    assert.ok(plan.acceptanceCriteria.every((criterion) => criterion.status === 'not_verified' && criterion.evidence.length === 0));
  }
  assert.match(mission.taskPlans.find((plan) => plan.taskId === 'SYS13-05').executionBoundary, /OWNER/);
  assert.match(mission.taskPlans.find((plan) => plan.taskId === 'SKY19-05').executionBoundary, /本人|OWNER/);
});

await test('AMC generated guide and snapshot use the same canonical tasks', () => {
  const [mission, project] = fixture();
  const html = renderVisualization(mission, project);
  assert.ok(Buffer.byteLength(html) < 1024 * 1024);
  assert.ok(!html.includes('__AMC_'));
  assert.ok(
    readFileSync(resolve(root, 'docs/mission-control.md'), 'utf8').includes(
      renderSquadTable(mission, project),
    ),
  );
  for (const id of ['mission', 'project']) {
    const embedded = JSON.parse(
      html.match(
        new RegExp(
          '<script id="amc-' +
            id +
            '-data" type="application/json">([\\s\\S]*?)</script>',
        ),
      )[1],
    );
    assert.deepEqual(
      embedded,
      id === 'mission'
        ? mission
        : { updatedAt: project.updatedAt, tasks: project.tasks },
    );
  }
  mission.taskPlans[0].scope = '</script><script>bad()</script>';
  assert.ok(!renderVisualization(mission, project).includes('<script>bad()'));
});

await test('AMC selection, prerequisite navigation and restored state render without runtime errors', () => {
  const [mission, project] = fixture();
  const html = renderVisualization(mission, project);
  const elements = new Map();
  for (const match of html.matchAll(/id="([a-z-]+)"/g)) {
    elements.set(match[1], {
      innerHTML: '',
      textContent: '',
      listeners: {},
      addEventListener(type, fn) {
        this.listeners[type] = fn;
      },
    });
  }
  elements.get('amc-mission-data').textContent = JSON.stringify(mission);
  elements.get('amc-project-data').textContent = JSON.stringify(project);
  const dashboard = elements.get('amc-task-dashboard');
  dashboard.querySelector = (selector) => elements.get(selector.slice(1));
  const saves = [];
  const events = {};
  const window = {
    openai: {
      widgetState: null,
      setWidgetState: async (value) => {
        saves.push(value);
      },
    },
    addEventListener: (name, fn) => {
      events[name] = fn;
    },
  };
  const document = { getElementById: (id) => elements.get(id) };
  runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], {
    document,
    window,
  });
  assert.match(elements.get('amc-task').innerHTML, /PRO04/);
  assert.match(elements.get('amc-task').innerHTML, /着手前提待ち/);
  assert.equal(saves.length, 0, 'initial load must not save state');
  for (const squad of mission.squads) {
    dashboard.listeners.click({
      target: {
        closest: (selector) =>
          selector === '[data-squad]' ? { dataset: { squad: squad.id } } : null,
      },
    });
    assert.match(
      elements.get('amc-selected-line').textContent,
      new RegExp('^' + squad.id + ' '),
    );
    assert.ok(
      elements.get('amc-task').innerHTML.includes(squad.nextTaskIds[0]),
    );
  }
  dashboard.listeners.click({
    target: {
      closest: (selector) =>
        selector === '[data-task]' ? { dataset: { task: 'PRO01' } } : null,
    },
  });
  assert.match(elements.get('amc-selected-line').textContent, /^P1 /);
  assert.match(elements.get('amc-task').innerHTML, /PRO02/);
  elements
    .get('amc-task-select')
    .listeners.change({ target: { value: 'DX01' } });
  assert.match(elements.get('amc-selected-line').textContent, /^O5 /);
  assert.match(elements.get('amc-task').innerHTML, /既存の進捗記録を保持/);
  const savedCount = saves.length;
  events['openai:set_globals']({
    detail: {
      globals: {
        widgetState: {
          modelContent: { selectedUnit: 'P2', selectedTask: 'PRO02' },
        },
      },
    },
  });
  assert.match(elements.get('amc-selected-line').textContent, /^P2 /);
  assert.equal(
    saves.length,
    savedCount,
    'state restoration must not save state',
  );
});
