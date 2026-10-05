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

// This fixture checks DOM data flow and navigation, not browser event execution.
function visualization(mission, project) {
  const html = renderVisualization(mission, project);
  const elements = new Map();
  function node(tagName) {
    let text = '';
    let markup = '';
    return {
      tagName: tagName.toUpperCase(),
      attributes: {},
      dataset: {},
      children: [],
      parentElement: null,
      listeners: {},
      focused: false,
      get textContent() {
        return text + this.children.map(child => child.textContent).join('');
      },
      set textContent(value) {
        this.replaceChildren();
        text = String(value);
      },
      get innerHTML() {
        return markup;
      },
      set innerHTML(value) {
        assert.notEqual(this, elements.get('amc-divisions'),
          'Squad selection data must not reach the HTML parser');
        this.replaceChildren();
        markup = String(value);
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name.startsWith('data-')) this.dataset[name.slice(5)] = String(value);
      },
      appendChild(child) {
        if (child.parentElement) {
          const siblings = child.parentElement.children;
          siblings.splice(siblings.indexOf(child), 1);
        }
        child.parentElement = this;
        this.children.push(child);
        return child;
      },
      replaceChildren(...children) {
        for (const child of this.children) child.parentElement = null;
        this.children = [];
        text = '';
        markup = '';
        for (const child of children) this.appendChild(child);
      },
      closest(selector) {
        if (selector === '[data-squad]' && Object.hasOwn(this.dataset, 'squad')) return this;
        return this.parentElement?.closest(selector) ?? null;
      },
      focus() {
        this.focused = true;
      },
      addEventListener(type, fn) {
        this.listeners[type] = fn;
      },
    };
  }
  for (const match of html.matchAll(/id="([a-z-]+)"/g)) elements.set(match[1], node('div'));
  elements.get('amc-mission-data').textContent = JSON.stringify(mission);
  elements.get('amc-project-data').textContent = JSON.stringify(project);
  const dashboard = elements.get('amc-task-dashboard');
  dashboard.querySelector = selector => {
    assert.match(selector, /^#[a-z-]+$/, 'Only fixed element IDs may become selectors');
    return elements.get(selector.slice(1));
  };
  const saves = [];
  const events = {};
  const window = {
    openai: {
      widgetState: null,
      setWidgetState: async value => { saves.push(value); },
    },
    addEventListener: (name, fn) => { events[name] = fn; },
  };
  const document = {
    getElementById: id => elements.get(id),
    createElement: tag => node(tag),
  };
  // Extract the one exact runtime block from our generated fixture, not arbitrary HTML.
  const scriptStart = html.indexOf('<script>');
  const scriptEnd = html.indexOf('</script>', scriptStart);
  assert.ok(scriptStart >= 0 && scriptEnd > scriptStart);
  assert.equal(html.indexOf('<script>', scriptStart + '<script>'.length), -1);
  runInNewContext(html.slice(scriptStart + '<script>'.length, scriptEnd), { document, window });
  const descendants = element => element.children.flatMap(child => [child, ...descendants(child)]);
  const buttons = () => descendants(elements.get('amc-divisions')).filter(item => item.tagName === 'BUTTON');
  return { elements, dashboard, saves, events, descendants, buttons };
}

await test('AMC selection, prerequisite navigation and restored state render without runtime errors', () => {
  const [mission, project] = fixture();
  const { elements, dashboard, saves, events, buttons } = visualization(mission, project);
  assert.equal(buttons().length, 32);
  assert.match(elements.get('amc-task').innerHTML, /PRO04/);
  assert.match(elements.get('amc-task').innerHTML, /着手前提待ち/);
  assert.equal(saves.length, 0, 'initial load must not save state');
  for (const squad of mission.squads) {
    dashboard.listeners.click({ target: buttons().find(button => button.dataset.squad === squad.id) });
    assert.equal(buttons().find(button => button.dataset.squad === squad.id).focused, true);
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


await test('AMC squad IDs remain literal through selection, focus and repeated rendering', () => {
  const ids = [
    'unit" onpointerenter="globalThis.__amcSynthetic = true',
    'unit</button><img src="synthetic" onerror="globalThis.__amcSynthetic = true">',
    'unit&quot;&lt;svg/onload=synthetic&gt;',
    'unit\"]#.:\\[雪\nnext',
  ];
  for (const id of ids) {
    const [original, project, baseline] = fixture();
    const oldId = original.squads.find(squad => !['P1', 'P4', 'O2'].includes(squad.id)).id;
    // Keep every reference valid: this is hostile text, not malformed topology.
    const mission = JSON.parse(JSON.stringify(original), (_key, value) => value === oldId ? id : value);
    validateMissionControl(mission, project, baseline);
    const squad = mission.squads.find(unit => unit.id === id);
    const division = mission.divisions.find(item => item.id === squad.division);
    division.name = 'Division <img src="synthetic" onerror="synthetic"> & "name"';
    squad.name = 'Name <svg onload="synthetic"> & "label"';
    const view = visualization(mission, project);
    const verifyNodes = () => {
      const buttons = view.buttons();
      assert.equal(buttons.length, mission.squads.length);
      assert.equal(new Set(buttons.map(button => button.dataset.squad)).size, mission.squads.length);
      const button = buttons.find(item => item.dataset.squad === id);
      assert.ok(button);
      assert.equal(button.textContent, id);
      assert.equal(button.attributes['data-squad'], id);
      assert.equal(button.attributes.type, 'button');
      assert.equal(button.className, 'btn viz-tile');
      assert.equal(button.attributes['aria-label'], id + ' ' + squad.name + '、段階' + squad.currentStage + ' ' + mission.stagePolicy.stages[squad.currentStage].label);
      const nodes = view.descendants(view.elements.get('amc-divisions'));
      assert.ok(nodes.some(item => item.tagName === 'H3' && item.textContent === division.name));
      assert.ok(nodes.every(item => ['SECTION', 'H3', 'DIV', 'BUTTON'].includes(item.tagName)));
      assert.ok(nodes.every(item => Object.keys(item.attributes).every(name => !/^on/i.test(name))));
      return button;
    };
    let button = verifyNodes();
    assert.equal(button.attributes['aria-pressed'], 'false');
    for (let iteration = 0; iteration < 2; iteration++) {
      view.dashboard.listeners.click({ target: button });
      const next = verifyNodes();
      assert.notEqual(next, button, 'render replaces the nodes');
      assert.equal(next.focused, true, 'focus follows the newly rendered button');
      assert.equal(next.attributes['aria-pressed'], 'true');
      assert.equal(view.saves.at(-1).modelContent.selectedUnit, id);
      assert.equal(view.saves.at(-1).modelContent.selectedTask, squad.nextTaskIds[0]);
      assert.ok(view.elements.get('amc-selected-line').textContent.startsWith(id + ' '));
      assert.equal(view.buttons().filter(item => item.attributes['aria-pressed'] === 'true').length, 1);
      button = next;
    }
    const savedCount = view.saves.length;
    view.events['openai:set_globals']({ detail: { globals: { widgetState: { modelContent: {
      selectedUnit: id, selectedTask: squad.nextTaskIds[0],
    } } } } });
    assert.equal(verifyNodes().attributes['aria-pressed'], 'true');
    assert.equal(view.saves.length, savedCount, 'restore does not write selection');
  }
});
