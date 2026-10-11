import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as amc from '../lib/amc-tool.ts';
import { prepareSkyGoal } from '../scripts/amc-sky-plan.mjs';
import { protectedSkyEvents } from '../scripts/amc-sky-authority.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const json = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const mission = json('../data/mission-control.json');
const project = json('../data/project-status.json');
const skyStarterGoal = amc.validateAmcGoal(
  prepareSkyGoal(
    json('../data/amc/sky/sky-amc-plan.json'),
    json('../data/amc/sky/sky-amc-goal.json'),
  ),
);
const compiled = ts.transpileModule(
  readFileSync(
    new URL('../components/amc-tool-runner.tsx', import.meta.url),
    'utf8',
  )
    .replace('function ManualRecord(', 'export function ManualRecord(')
    .replace('function MissionBoard(', 'export function MissionBoard('),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  },
).outputText;
const SkyLaunch = () => null;
const CommandCenter = () => null;
function nodes(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) nodes(child, out);
    return out;
  }
  out.push(node);
  nodes(node.props?.children, out);
  return out;
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return node && typeof node === 'object' ? text(node.props?.children) : '';
}
// Render the actual component functions with controlled hooks and HTTP completion.
// Child boundaries remain opaque so their hooks cannot share the runner's slots.
function harness(component = 'AmcToolRunner', props = {}) {
  const slots = [],
    effects = [],
    requests = [],
    windowEvents = new Map(),
    documentEvents = new Map();
  let cursor = 0,
    tree;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (value) => {
          slots[index] =
            typeof value === 'function' ? value(slots[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useId() {
      return `amc-${cursor++}`;
    },
    useMemo(fn) {
      cursor++;
      return fn();
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (
        !previous ||
        !deps ||
        deps.some((value, i) => !Object.is(value, previous.deps[i]))
      ) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  runInNewContext(compiled, {
    exports,
    AbortController,
    crypto,
    Blob,
    URL,
    window: {
      addEventListener: (event, fn) => windowEvents.set(event, fn),
      removeEventListener: (event) => windowEvents.delete(event),
      confirm: () => true,
    },
    document: {
      visibilityState: 'visible',
      addEventListener: (event, fn) => documentEvents.set(event, fn),
      removeEventListener: (event) => documentEvents.delete(event),
      getElementById: () => null,
    },
    requestAnimationFrame: (fn) => fn(),
    fetch: (url, options = {}) =>
      new Promise((resolve) =>
        requests.push({
          url,
          options,
          resolve: (status, body) =>
            resolve({
              ok: status >= 200 && status < 300,
              status,
              json: async () => body,
            }),
        }),
      ),
    require: (id) => {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === '@/data/mission-control.json') return mission;
      if (id === '@/data/project-status.json') return project;
      if (id === '@/lib/amc-tool') return amc;
      if (id === './amc-sky-launch')
        return { __esModule: true, default: SkyLaunch, skyStarterGoal };
      if (id === './amc-command-center')
        return { __esModule: true, default: CommandCenter };
      if (id.endsWith('.module.css')) return {};
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  function render() {
    cursor = 0;
    tree = exports[component](props);
    for (const effect of effects.splice(0)) effect();
    return tree;
  }
  function find(type, predicate = () => true) {
    return nodes(tree).find((node) => node.type === type && predicate(node));
  }
  function field(suffix) {
    const node = nodes(tree).find((node) => node.props?.id?.endsWith(suffix));
    assert.ok(node, `field ${suffix}`);
    return node;
  }
  function change(node, value) {
    node.props.onChange({ target: { value, checked: value } });
    render();
  }
  async function settle() {
    await new Promise((resolve) => setImmediate(resolve));
    render();
  }
  async function respond(index, status, body) {
    assert.ok(requests[index], `request ${index}`);
    requests[index].resolve(status, body);
    await settle();
  }
  function event(name) {
    assert.ok(windowEvents.has(name));
    windowEvents.get(name)();
    render();
  }
  render();
  return {
    render,
    find,
    field,
    change,
    requests,
    respond,
    settle,
    event,
    text: () => text(tree),
    all: () => nodes(tree),
  };
}
const copy = (value) => JSON.parse(JSON.stringify(value));
function savedJob() {
  return {
    id: 'owner-goal',
    title: 'private owner project',
    revision: 0,
    status: 'review',
    events: [],
    amcGoal: amc.createAmcGoal('owner-goal', {
      request: '管理アプリを作成して',
      goal: 'private owner goal',
      intent: 'Keep an owner scoped plan',
    }),
  };
}
async function openSaved(h, job) {
  await h.respond(0, 200, { jobs: [job] });
  h.change(h.field('-saved'), job.id);
  await h.respond(1, 200, { job });
  assert.match(h.text(), /private owner goal/);
}

void test('AMC restores Sky launch and command center, saves only the explicit unapproved starter', async () => {
  const h = harness();
  assert.ok(h.find(CommandCenter));
  assert.equal(h.find(SkyLaunch)?.props.disabled, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.method, undefined);
  await h.respond(0, 200, { jobs: [] });
  const launch = h.find(SkyLaunch);
  assert.ok(launch, 'Sky launch component must remain connected');
  assert.equal(launch.props.disabled, false);
  launch.props.onSave(skyStarterGoal);
  const request = h.requests[1];
  assert.equal(request.options.method, 'POST');
  assert.equal(request.url, '/api/amc');
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.importGoal, skyStarterGoal);
  assert.equal(body.importGoal.state, 'draft');
  assert.equal(body.importGoal.revision, 0);
  assert.ok(body.importGoal.tasks.every((task) => task.status === 'pending'));
  assert.equal(body.importGoal.eventLog.length, 0);
});

void test('AMC Sky plan approval requires confirmation and keeps the current revision and exact criteria', () => {
  const records = [];
  const goal = copy(skyStarterGoal);
  const h = harness('ManualRecord', {
    goal,
    taskId: goal.tasks[0].id,
    disabled: false,
    onRecord: (record) => records.push(record),
    onDirtyChange() {},
  });
  assert.equal(h.field('-action').props.value, 'approve_plan');
  h.change(h.field('-actor'), ' owner ');
  h.change(
    h.field('-note'),
    ' Checked launch scope and remaining acceptance conditions ',
  );
  h.find('form').props.onSubmit({ preventDefault() {} });
  assert.equal(records.length, 0);
  h.render();
  assert.match(h.text(), /計画の範囲と未検収の条件を確認/);
  h.change(
    h.find('input', (node) => node.props.type === 'checkbox'),
    true,
  );
  h.find('form').props.onSubmit({ preventDefault() {} });
  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'approve_plan');
  assert.equal(records[0].scopeConfirmed, true);
  assert.equal(records[0].expectedRevision, goal.revision);
  assert.equal(
    records[0].coverageStatement,
    'Checked launch scope and remaining acceptance conditions',
  );
  assert.deepEqual(
    records[0].acceptanceCriteria,
    goal.overallAcceptance.criteria,
  );
});

for (const status of ['pending', 'running', 'submitted', 'blocked', 'done']) {
  void test(`AMC Sky ${status} record hides operations requiring the unavailable trusted observer`, () => {
    const goal = copy(skyStarterGoal);
    goal.state = 'active';
    for (const task of goal.tasks) {
      task.status = status;
      task.holds = [];
    }
    const h = harness('ManualRecord', {
      goal,
      taskId: goal.tasks[0].id,
      disabled: false,
      onRecord() {},
      onDirtyChange() {},
    });
    const offered = h
      .all()
      .filter((node) => node.type === 'option')
      .map((node) => node.props.value);
    assert.ok(offered.includes('pause'));
    assert.ok(
      offered.every((action) => !protectedSkyEvents.has(action)),
      `protected operation offered: ${offered.join(', ')}`,
    );
  });
}

void test('AMC focus removes private saved state before auth recheck and does not revive it after 401', async () => {
  const h = harness(),
    job = savedJob();
  await openSaved(h, job);
  h.event('focus');
  assert.doesNotMatch(h.text(), /private owner (goal|project)/);
  assert.equal(h.find(SkyLaunch).props.savedGoal, undefined);
  assert.equal(h.find(CommandCenter).props.saved, false);
  await h.respond(2, 401, { error: 'Sign in required' });
  await h.respond(3, 200, { job });
  assert.doesNotMatch(h.text(), /private owner (goal|project)/);
  assert.match(h.text(), /本人用のGoal管理にサインイン/);
  assert.equal(h.find(SkyLaunch).props.savedGoal, undefined);
});

void test('AMC aborts detail before focus recheck and ignores its late result', async () => {
  const h = harness(),
    job = savedJob();
  await h.respond(0, 200, { jobs: [job] });
  h.change(h.field('-saved'), job.id);
  h.event('focus');
  assert.equal(h.requests[1].options.signal.aborted, true);
  await h.respond(2, 200, { jobs: [] });
  await h.respond(3, 404, { error: 'Goal no longer available' });
  await h.respond(1, 200, { job });
  assert.doesNotMatch(h.text(), /private owner (goal|project)/);
  assert.equal(h.find(SkyLaunch).props.savedGoal, undefined);
});

void test('AMC board filters actual canonical records without showing an excluded task', () => {
  const h = harness('MissionBoard');
  const owned = mission.squads.find((squad) => squad.id === 'O2').taskIds;
  const expected = project.tasks.filter(
    (task) => owned.includes(task.id) && task.status === 'done',
  );
  h.change(h.field('-status'), 'done');
  const select = h.find('select', (node) => !node.props.id.endsWith('-status'));
  const actualIds = nodes(select)
    .filter((node) => node.type === 'option')
    .map((node) => node.props.value);
  assert.deepEqual(
    actualIds.sort((a, b) => a.localeCompare(b)),
    expected.map((task) => task.id).sort((a, b) => a.localeCompare(b)),
  );
  assert.equal(select.props.disabled, expected.length === 0);
  assert.ok(!select.props.value || actualIds.includes(select.props.value));
  if (!expected.length) assert.match(h.text(), /該当するタスクがありません/);
});

void test('AMC command center follows the displayed Sky starter instead of an unrelated saved goal', async () => {
  const h = harness(),
    job = savedJob();
  await openSaved(h, job);
  h.find('button', (node) => text(node) === 'Skyローンチ').props.onClick();
  h.render();
  const command = h.find(CommandCenter);
  assert.equal(command.props.goal, skyStarterGoal);
  assert.equal(command.props.saved, false);
  command.props.onTask('S0-02');
  h.render();
  assert.equal(h.find(SkyLaunch).props.initialTaskId, 'S0-02');
  assert.equal(
    h.find('button', (node) => text(node) === 'Skyローンチ').props[
      'aria-pressed'
    ],
    true,
  );
});

void test('AMC unsaved request preview task does not open an unrelated Sky task', async () => {
  const h = harness('AmcToolRunner', { initialText: '管理アプリを作成して' });
  await h.respond(0, 200, { jobs: [] });
  h.change(h.field('-intent'), '自分の計画を管理する');
  const command = h.find(CommandCenter);
  assert.ok(command.props.goal.requestBrief);
  command.props.onTask(command.props.goal.tasks[0].id);
  h.render();
  assert.equal(
    h.find('button', (node) => text(node) === '依頼・Goal').props[
      'aria-pressed'
    ],
    true,
  );
  assert.equal(h.find(SkyLaunch).props.initialTaskId, 'S0-01');
});
