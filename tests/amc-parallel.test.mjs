import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compileGoal,
  applyGoalEvent,
  validateGoal,
} from '../scripts/amc-goal-engine.mjs';
import { runParallelGoal } from '../scripts/amc-parallel.mjs';

function fixture(t, { limit = 2, dependencies = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'amc-wave-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tasks = ['A', 'B'].map((id) => ({
    id,
    title: 'Work ' + id,
    status: 'planned',
    dependsOn: dependencies && id === 'B' ? ['A'] : [],
    evidence: [],
  }));
  const mission = {
    updatedAt: '2026-10-02',
    globalRules: ['Keep the approved direction'],
    executionHolds: [],
    squads: tasks.map((t) => ({
      id: t.id,
      name: t.id,
      goal: t.title,
      rules: ['No publication'],
      acceptanceGate: 'Independent evidence review',
      nextTaskIds: [t.id],
    })),
    taskAssignments: tasks.map((t) => ({
      taskId: t.id,
      primarySquad: t.id,
      classification: 'coordination',
    })),
    taskPlans: tasks.map((t) => ({
      taskId: t.id,
      scope: t.title,
      workloadClass: 'document',
      executionBoundary: 'Local documents only',
      inputs: [{ path: 'input.txt', locator: 'all' }],
      steps: [{ id: t.id + '-step', action: 'Read input and write result' }],
      deliverables: [{ path: t.id + '.txt', description: 'Result' }],
      acceptanceCriteria: [
        {
          id: t.id + '-ac',
          criterion: 'Matches approved goal',
          verification: 'Independent review',
          status: 'not_verified',
          evidence: [],
        },
      ],
    })),
  };
  let goal = compileGoal({
    instruction: 'Keep one Goal until accepted',
    squadIds: ['A', 'B'],
    mission,
    project: { updatedAt: '2026-10-02', tasks },
    goalId: 'wave-test',
    maxParallel: limit,
  });
  goal = applyGoalEvent(goal, {
    id: 'approval',
    type: 'approve_plan',
    expectedRevision: goal.revision,
    actor: 'owner',
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement: 'Two independent document outputs',
    acceptanceCriteria: [
      { id: 'goal-ac', criterion: 'Both outputs independently accepted' },
    ],
  });
  const goalPath = join(dir, 'goal.json');
  writeFileSync(goalPath, JSON.stringify(goal));
  for (const name of ['base', 'A', 'B']) {
    const path = join(dir, name);
    mkdirSync(path);
    execFileSync('git', ['init', '-q'], { cwd: path });
    writeFileSync(join(path, 'input.txt'), 'fixed source');
  }
  return {
    dir,
    goal,
    goalPath,
    repo: join(dir, 'base'),
    workspaces: { A: join(dir, 'A'), B: join(dir, 'B') },
    out: join(dir, 'wave'),
    allowCodexUpload: true,
    pollMs: 10,
  };
}
function report({ repo, runDir, taskId }) {
  writeFileSync(join(repo, taskId + '.txt'), 'verified local output');
  writeFileSync(
    join(runDir, 'codex-report.json'),
    JSON.stringify({
      status: 'completed',
      summary: 'Local document only',
      deliverables: [taskId + '.txt'],
      evidence: [taskId + '.txt'],
      question: '',
    }),
  );
  return { exitCode: 0 };
}

await test('two workers really overlap, share direction and keep both submissions in one revision history', async (t) => {
  const f = fixture(t),
    started = [];
  let release;
  const barrier = new Promise((r) => {
    release = r;
  });
  const result = await runParallelGoal({
    ...f,
    execute: async (options) => {
      assert.match(options.prompt, /Keep one Goal until accepted/);
      assert.match(options.prompt, /Keep the approved direction/);
      started.push(options.taskId);
      if (started.length === 2) release();
      await barrier;
      return report(options);
    },
  });
  assert.equal(result.state, 'submitted');
  assert.equal(started.length, 2);
  const next = JSON.parse(readFileSync(result.finalPath));
  assert.equal(validateGoal(next).ok, true);
  assert.deepEqual(
    next.tasks.map((t) => t.status),
    ['submitted', 'submitted'],
  );
  assert.equal(next.revision, f.goal.revision + 4);
  assert.equal(next.overallAcceptance.accepted, false);
  assert.deepEqual(JSON.parse(readFileSync(f.goalPath)), f.goal);
  await assert.rejects(
    runParallelGoal({
      ...f,
      out: join(f.dir, 'another'),
      execute: () => assert.fail('duplicate'),
    }),
    /並列実行記録/,
  );
});

await test('approved concurrency limit and dependencies constrain the wave', async (t) => {
  for (const options of [{ limit: 1 }, { dependencies: true }]) {
    const f = fixture(t, options),
      started = [];
    const result = await runParallelGoal({
      ...f,
      execute: async (o) => {
        started.push(o.taskId);
        return report(o);
      },
    });
    assert.deepEqual(started, ['A']);
    const next = JSON.parse(readFileSync(result.finalPath));
    assert.equal(next.tasks[1].status, 'pending');
  }
});

await test('Goal revision drift stops both workers and never submits stale work', async (t) => {
  const f = fixture(t);
  let started = 0,
    aborted = 0;
  const result = await runParallelGoal({
    ...f,
    execute: async (o) => {
      started++;
      if (started === 2)
        writeFileSync(
          f.goalPath,
          JSON.stringify({ ...f.goal, instruction: 'changed direction' }),
        );
      await new Promise((r) =>
        o.signal.addEventListener(
          'abort',
          () => {
            aborted++;
            r();
          },
          { once: true },
        ),
      );
      return report(o);
    },
  });
  assert.equal(aborted, 2);
  assert.equal(result.state, 'paused');
  assert.match(result.reason, /Goal/);
  const next = JSON.parse(readFileSync(result.finalPath));
  assert.equal(next.state, 'paused');
  assert.equal(next.tasks.filter((t) => t.status === 'submitted').length, 0);
});

await test('base source drift aborts running workers', async (t) => {
  const f = fixture(t);
  let started = 0;
  const result = await runParallelGoal({
    ...f,
    execute: async (o) => {
      if (++started === 2) writeFileSync(join(f.repo, 'input.txt'), 'changed');
      await new Promise((r) =>
        o.signal.addEventListener('abort', r, { once: true }),
      );
      return report(o);
    },
  });
  assert.equal(result.state, 'paused');
  assert.match(result.reason, /原本/);
});

await test('outside-scope edits pause all work without erasing the offending artifact', async (t) => {
  const f = fixture(t);
  const result = await runParallelGoal({
    ...f,
    execute: async (o) => {
      if (o.taskId === 'A') {
        writeFileSync(join(o.repo, 'input.txt'), 'unapproved change');
        return report(o);
      }
      await new Promise((r) =>
        o.signal.addEventListener('abort', r, { once: true }),
      );
      return report(o);
    },
  });
  assert.equal(result.state, 'paused');
  assert.match(result.reason, /指示範囲外/);
  assert.equal(
    readFileSync(join(f.workspaces.A, 'input.txt'), 'utf8'),
    'unapproved change',
  );
});

await test('shared workspace, mismatched source, active Goal and missing authority cannot spawn', async (t) => {
  for (const kind of ['shared', 'different', 'active', 'authority']) {
    const f = fixture(t);
    if (kind === 'shared') f.workspaces.B = f.workspaces.A;
    if (kind === 'different')
      writeFileSync(join(f.workspaces.B, 'input.txt'), 'wrong');
    if (kind === 'authority') f.allowCodexUpload = false;
    if (kind === 'active') {
      const g = applyGoalEvent(f.goal, {
        id: 'start',
        type: 'start_task',
        taskId: 'A',
        expectedRevision: f.goal.revision,
        actor: 'worker',
        role: 'worker',
      });
      writeFileSync(f.goalPath, JSON.stringify(g));
    }
    await assert.rejects(
      runParallelGoal({ ...f, execute: () => assert.fail('must not spawn') }),
      /重複|異なり|既存の実行|明示承認/,
    );
  }
});

function skyFixture(t, { conflict = false } = {}) {
  const f = fixture(t);
  f.goal.skyBrief = {
    schema: 'amc-sky-brief/1',
    templateId: 'sky-specific-launch-v1',
    request: 'Fixture parallel Sky work',
    goal: f.goal.instruction,
    intent: 'Keep the same direction',
  };
  writeFileSync(f.goalPath, JSON.stringify(f.goal));
  const specs = {
    tasks: Object.fromEntries(
      ['A', 'B'].map((id) => [
        id,
        {
          revision: 1,
          readPaths: ['input.txt'],
          writePaths: [id + '.txt', ...(conflict ? ['shared.txt'] : [])],
        },
      ]),
    ),
  };
  for (const directory of [f.repo, ...Object.values(f.workspaces)]) {
    mkdirSync(join(directory, 'data/amc'), { recursive: true });
    writeFileSync(
      join(directory, 'data/amc/sky-directives-v2.json'),
      JSON.stringify(specs),
    );
    writeFileSync(
      join(directory, 'data/amc/sky-contracts-v1.json'),
      JSON.stringify({ contracts: [] }),
    );
  }
  return f;
}

await test('Sky parallel submission keeps each worker bound to its own trusted directive', async (t) => {
  const f = skyFixture(t);
  let count = 0,
    release;
  const barrier = new Promise((r) => {
    release = r;
  });
  const result = await runParallelGoal({
    ...f,
    execute: async (o) => {
      if (++count === 2) release();
      await barrier;
      return report(o);
    },
  });
  assert.equal(result.state, 'submitted', result.reason);
  const goal = JSON.parse(readFileSync(result.finalPath));
  assert.equal(goal.skyDirectives.length, 2);
  for (const task of goal.tasks) {
    const d = goal.skyDirectives.find((d) => d.taskId === task.id);
    assert.equal(d.status, 'submitted');
    assert.equal(d.assignee, task.startedBy);
    assert.notEqual(d.assignee, d.owner);
  }
  assert.equal(goal.overallAcceptance.accepted, false);
  assert.equal(validateGoal(goal).ok, true);
});

await test('Sky shared source write scopes defer a task even with distinct report outputs', async (t) => {
  const f = skyFixture(t, { conflict: true });
  const started = [];
  const result = await runParallelGoal({
    ...f,
    execute: async (o) => {
      started.push(o.taskId);
      return report(o);
    },
  });
  assert.equal(result.state, 'submitted', result.reason);
  assert.deepEqual(started, ['A']);
  assert.deepEqual(result.deferred, [
    { taskId: 'B', reason: 'shared_source_scope' },
  ]);
});
