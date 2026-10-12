import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildRequestPlan } from '../scripts/amc-request-plan.mjs';
import {
  applyGoalEvent,
  compileGoal,
  summarizeGoal,
  validateGoal,
} from '../scripts/amc-goal-engine.mjs';
import { createAutonomyState, runAutonomy } from '../scripts/amc-autonomy.mjs';
import {
  createAutonomyRun,
  readAutonomyRun,
  writeAutonomyRun,
  withAutonomyLock,
  readAutonomyControl,
  requestAutonomyControl,
  resumeAutonomyRun,
  recoverAutonomyLock,
} from '../scripts/amc-autonomy-store.mjs';

const clone = (value) => structuredClone(value);

function fixtureGoal({ approved = true, changeDefinition } = {}) {
  const definition = buildRequestPlan({
    request: 'Build a local notes app',
    goal: 'Record and read a local note',
    intent: 'Keep a small record without external access',
    planId: 'autonomy-test',
    createdAt: '2026-10-02T00:00:00Z',
  });
  changeDefinition?.(definition);
  const goal = compileGoal({
    ...definition,
    instruction: definition.brief.goal,
    squadIds: definition.mission.squads.map((squad) => squad.id),
    goalId: 'autonomy-test',
    createdAt: '2026-10-02T00:00:00Z',
  });
  goal.requestBrief = definition.brief;
  if (!approved) return goal;
  return applyGoalEvent(goal, {
    id: 'fixture-owner-approval',
    type: 'approve_plan',
    expectedRevision: goal.revision,
    actor: 'fixture-owner',
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement: definition.coverage,
    acceptanceCriteria: definition.acceptanceCriteria,
  });
}

function temporaryRun(t) {
  const directory = mkdtempSync(join(tmpdir(), 'amc-autonomy-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function successfulResult(task) {
  return {
    outcome: 'succeeded',
    summary: `Fixture result for ${task.id}; no real execution`,
    deliverables: task.deliverables.map((item) => item.path),
    evidence: [`fixture/${task.id}-run.md`],
  };
}

function acceptedReview(task) {
  return {
    accepted: true,
    evidence: [`fixture/${task.id}-review.md`],
    criterionResults: task.acceptanceCriteria.map((criterion) => ({
      criterionId: criterion.id,
      passed: true,
      evidence: [`fixture/${task.id}-${criterion.id}.md`],
    })),
  };
}

function adapters({ execute, review } = {}) {
  const calls = [];
  const worker = {
    id: 'fixture-worker',
    kind: 'fixture',
    run: async (context) => {
      calls.push({
        phase: 'work',
        taskId: context.task.id,
        operationKey: context.operationKey,
      });
      return execute ? execute(context) : successfulResult(context.task);
    },
  };
  const reviewer = {
    id: 'fixture-reviewer',
    kind: 'fixture',
    review: async (context) => {
      calls.push({
        phase: 'review',
        taskId: context.task.id,
        operationKey: context.operationKey,
      });
      return review ? review(context) : acceptedReview(context.task);
    },
  };
  return { worker, reviewer, calls };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function initialize(t, { goal = fixtureGoal(), policy = {} } = {}) {
  const directory = temporaryRun(t);
  const state = createAutonomyState({ goal, policy });
  await createAutonomyRun(directory, state);
  return { directory, state };
}

await test('approved fixture tasks execute, persist, and unlock only after independent verification', async (t) => {
  const goal = fixtureGoal();
  const before = clone(goal);
  const { directory } = await initialize(t, { goal });
  const { worker, reviewer, calls } = adapters({
    execute: async ({ goal: liveGoal, task, operationKey }) => {
      assert.ok(
        task.dependsOn.every(
          (id) =>
            liveGoal.tasks.find((item) => item.id === id).status === 'done',
        ),
      );
      const saved = readAutonomyRun(directory);
      assert.equal(saved.currentOperation.key, operationKey);
      assert.equal(saved.currentOperation.status, 'intent');
      assert.equal(
        saved.goal.tasks.find((item) => item.id === task.id).status,
        'running',
      );
      assert.deepEqual(summarizeGoal(saved.goal).readyTaskIds, []);
      return successfulResult(task);
    },
    review: async ({ task, operationKey }) => {
      const saved = readAutonomyRun(directory);
      assert.equal(saved.currentOperation.key, operationKey);
      assert.equal(saved.currentOperation.status, 'intent');
      assert.equal(
        saved.goal.tasks.find((item) => item.id === task.id).status,
        'submitted',
      );
      assert.deepEqual(summarizeGoal(saved.goal).readyTaskIds, []);
      return acceptedReview(task);
    },
  });
  const completed = await runAutonomy({ directory, worker, reviewer });
  assert.equal(completed.phase, 'awaiting_owner_acceptance');
  assert.equal(completed.goal.state, 'active');
  assert.equal(completed.goal.overallAcceptance.accepted, false);
  assert.ok(completed.goal.tasks.every((task) => task.status === 'done'));
  assert.equal(validateGoal(completed.goal).ok, true);
  assert.deepEqual(
    calls.map(({ phase, taskId }) => `${phase}:${taskId}`),
    goal.tasks.flatMap((task) => [`work:${task.id}`, `review:${task.id}`]),
  );
  assert.equal(
    new Set(calls.map((call) => call.operationKey)).size,
    calls.length,
  );
  assert.deepEqual(goal, before);
  assert.deepEqual(readAutonomyRun(directory), completed);
  assert.deepEqual(
    await runAutonomy({ directory, worker, reviewer }),
    completed,
  );
  assert.equal(calls.length, goal.tasks.length * 2);
  assert.equal(
    completed.goal.eventLog.filter((event) => event.type === 'accept_goal')
      .length,
    0,
  );
});

await test('a simultaneous runner cannot dispatch the same operation twice', async (t) => {
  const { directory } = await initialize(t);
  const entered = deferred();
  const release = deferred();
  const { worker, reviewer, calls } = adapters({
    execute: async ({ task }) => {
      if (task.id === 'REQ-01') {
        entered.resolve();
        await release.promise;
      }
      return successfulResult(task);
    },
  });
  const first = runAutonomy({ directory, worker, reviewer });
  await entered.promise;
  try {
    await assert.rejects(
      runAutonomy({ directory, worker, reviewer }),
      /lock|already|running/i,
    );
    assert.equal(calls.filter((call) => call.phase === 'work').length, 1);
  } finally {
    release.resolve();
  }
  assert.equal((await first).phase, 'awaiting_owner_acceptance');
});

await test('only explicitly safe retryable failures are retried and each attempt has a distinct key', async (t) => {
  const { directory } = await initialize(t, {
    policy: { maxAttemptsPerTask: 2 },
  });
  let firstAttempts = 0;
  const { worker, reviewer, calls } = adapters({
    execute: async ({ task }) => {
      if (task.id === 'REQ-01' && ++firstAttempts === 1)
        return {
          outcome: 'failed',
          summary: 'Fixture transient failure, no effect',
          deliverables: [],
          evidence: ['fixture/failed.md'],
          retryable: true,
          safeToRetry: true,
        };
      return successfulResult(task);
    },
  });
  const completed = await runAutonomy({ directory, worker, reviewer });
  assert.equal(completed.phase, 'awaiting_owner_acceptance');
  assert.equal(completed.attempts['REQ-01'], 2);
  assert.equal(completed.totalAttempts, 8);
  assert.equal(completed.goal.tasks[0].attempts.length, 1);
  const firstCalls = calls.filter(
    (call) => call.phase === 'work' && call.taskId === 'REQ-01',
  );
  assert.equal(firstCalls.length, 2);
  assert.notEqual(firstCalls[0].operationKey, firstCalls[1].operationKey);
});

await test('per-task retry exhaustion hands off without launching the next child', async (t) => {
  const { directory } = await initialize(t, {
    policy: { maxAttemptsPerTask: 2 },
  });
  const { worker, reviewer, calls } = adapters({
    execute: async () => ({
      outcome: 'failed',
      summary: 'Still failing',
      deliverables: [],
      evidence: ['fixture/failure.md'],
      retryable: true,
      safeToRetry: true,
    }),
  });
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.equal(ended.phase, 'handoff');
  assert.equal(ended.totalAttempts, 2);
  assert.equal(ended.goal.tasks[0].status, 'failed');
  assert.equal(ended.goal.tasks[1].status, 'pending');
  assert.deepEqual(
    calls.map((call) => call.taskId),
    ['REQ-01', 'REQ-01'],
  );
  await runAutonomy({ directory, worker, reviewer });
  assert.equal(calls.length, 2);
});

await test('global attempt budget bounds even successful execution', async (t) => {
  const { directory } = await initialize(t, {
    policy: { maxTotalAttempts: 2 },
  });
  const { worker, reviewer, calls } = adapters();
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.equal(ended.phase, 'handoff');
  assert.equal(ended.totalAttempts, 2);
  assert.deepEqual(
    ended.goal.tasks.map((task) => task.status),
    ['done', 'done', 'pending', 'pending', 'pending', 'pending', 'pending'],
  );
  assert.equal(calls.filter((call) => call.phase === 'work').length, 2);
});

await test('retry requires both explicit retryability and proof that replay is safe', async (t) => {
  for (const flags of [
    {},
    { retryable: true },
    { safeToRetry: true },
    { retryable: true, safeToRetry: false },
  ]) {
    const { directory } = await initialize(t);
    const { worker, reviewer, calls } = adapters({
      execute: async () => ({
        outcome: 'failed',
        summary: 'Failure needing a decision',
        deliverables: [],
        evidence: ['fixture/failure.md'],
        ...flags,
      }),
    });
    const ended = await runAutonomy({ directory, worker, reviewer });
    assert.equal(ended.phase, 'handoff');
    assert.equal(calls.length, 1);
    assert.equal(ended.goal.tasks[1].status, 'pending');
  }
});

await test('uncertain worker errors retain the running lock and never replay', async (t) => {
  const { directory } = await initialize(t);
  const { worker, reviewer, calls } = adapters({
    execute: async () => {
      throw new Error('Unknown effect after dispatch');
    },
  });
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.equal(ended.phase, 'handoff');
  assert.equal(ended.goal.tasks[0].status, 'running');
  assert.equal(ended.currentOperation.status, 'intent');
  await runAutonomy({ directory, worker, reviewer });
  assert.equal(calls.length, 1);
});

await test('uncertain reviewer errors retain submitted evidence without accepting or replaying it', async (t) => {
  const { directory } = await initialize(t);
  const { worker, reviewer, calls } = adapters({
    review: async () => {
      throw new Error('Review interrupted');
    },
  });
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.equal(ended.phase, 'handoff');
  assert.equal(ended.goal.tasks[0].status, 'submitted');
  assert.equal(ended.currentOperation.kind, 'reviewer');
  assert.equal(ended.currentOperation.status, 'intent');
  await runAutonomy({ directory, worker, reviewer });
  assert.equal(calls.length, 2);
});

await test('worker questions wait for a human and do not pass an incomplete child', async (t) => {
  const { directory } = await initialize(t);
  const { worker, reviewer, calls } = adapters({
    execute: async () => ({
      outcome: 'needs_user',
      summary: 'A scope decision is missing',
      question: 'Which local file format is approved?',
      deliverables: [],
      evidence: ['fixture/question.md'],
    }),
  });
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.ok(['handoff', 'awaiting_approval'].includes(ended.phase));
  assert.equal(ended.goal.tasks[1].status, 'pending');
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(ended), /Which local file format is approved/);
});

await test('failed verification never unlocks a dependent child or retries the worker automatically', async (t) => {
  const { directory } = await initialize(t);
  const { worker, reviewer, calls } = adapters({
    review: async ({ task }) => ({
      accepted: false,
      evidence: ['fixture/rejected.md'],
      criterionResults: task.acceptanceCriteria.map((criterion) => ({
        criterionId: criterion.id,
        passed: false,
        evidence: ['fixture/rejected.md'],
      })),
    }),
  });
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.equal(ended.phase, 'handoff');
  assert.equal(ended.goal.tasks[0].status, 'failed');
  assert.equal(ended.goal.tasks[1].status, 'pending');
  assert.equal(calls.length, 2);
});

await test('incomplete criterion evidence and malformed success cannot become accepted work', async (t) => {
  for (const overrides of [
    {
      execute: async ({ task }) => ({
        ...successfulResult(task),
        deliverables: [],
      }),
    },
    {
      execute: async ({ task }) => ({
        ...successfulResult(task),
        evidence: [],
      }),
    },
    {
      review: async ({ task }) => ({
        ...acceptedReview(task),
        criterionResults: [],
      }),
    },
    { review: async ({ task }) => ({ ...acceptedReview(task), evidence: [] }) },
  ]) {
    const { directory } = await initialize(t);
    const { worker, reviewer, calls } = adapters(overrides);
    const ended = await runAutonomy({ directory, worker, reviewer });
    assert.equal(ended.phase, 'handoff');
    assert.notEqual(ended.goal.tasks[0].status, 'done');
    assert.equal(ended.goal.tasks[1].status, 'pending');
    assert.ok(calls.length <= 2);
  }
});

await test('a stop before dispatch is persistent and resumes only after the explicit control is cleared', async (t) => {
  const { directory } = await initialize(t);
  const { worker, reviewer, calls } = adapters();
  requestAutonomyControl(directory, 'stop');
  const stopped = await runAutonomy({ directory, worker, reviewer });
  assert.equal(stopped.phase, 'paused');
  assert.equal(calls.length, 0);
  assert.equal(readAutonomyControl(directory), 'stop');
  await runAutonomy({ directory, worker, reviewer });
  assert.equal(calls.length, 0);
  await resumeAutonomyRun(directory);
  assert.equal(readAutonomyControl(directory), null);
  assert.equal(
    (await runAutonomy({ directory, worker, reviewer })).phase,
    'awaiting_owner_acceptance',
  );
});

await test('stop or cancel during a worker does not accept its late result or launch more work', async (t) => {
  for (const command of ['stop', 'cancel']) {
    const { directory } = await initialize(t);
    const { worker, reviewer, calls } = adapters({
      execute: async ({ task }) => {
        requestAutonomyControl(directory, command);
        return successfulResult(task);
      },
    });
    const ended = await runAutonomy({ directory, worker, reviewer });
    assert.equal(ended.phase, command === 'cancel' ? 'cancelled' : 'handoff');
    assert.equal(ended.goal.tasks[0].status, 'running');
    assert.equal(ended.goal.tasks[1].status, 'pending');
    assert.equal(ended.currentOperation.status, 'intent');
    await runAutonomy({ directory, worker, reviewer });
    assert.equal(calls.length, 1);
    await assert.rejects(
      resumeAutonomyRun(directory),
      /cancel|unknown|reconcil/i,
    );
  }
});

await test('control polling aborts pending callbacks even when they ignore cancellation', async (t) => {
  for (const command of ['stop', 'cancel']) {
    const { directory } = await initialize(t);
    const lateResult = deferred();
    let pendingTask;
    let pendingSignal;
    const { worker, reviewer, calls } = adapters({
      execute: async ({ task, signal }) => {
        pendingTask = task;
        pendingSignal = signal;
        requestAutonomyControl(directory, command);
        return lateResult.promise;
      },
    });
    const ended = await runAutonomy({ directory, worker, reviewer });
    assert.equal(ended.phase, command === 'cancel' ? 'cancelled' : 'handoff');
    assert.equal(pendingSignal.aborted, true);
    assert.equal(ended.goal.tasks[0].status, 'running');
    lateResult.resolve(successfulResult(pendingTask));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(readAutonomyRun(directory), ended);
    assert.equal(calls.length, 1);
  }
});

await test('cancel during review preserves the submitted result and does not verify it', async (t) => {
  const { directory } = await initialize(t);
  const { worker, reviewer, calls } = adapters({
    review: async ({ task }) => {
      requestAutonomyControl(directory, 'cancel');
      return acceptedReview(task);
    },
  });
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.equal(ended.phase, 'cancelled');
  assert.equal(ended.goal.tasks[0].status, 'submitted');
  assert.equal(ended.goal.tasks[1].status, 'pending');
  assert.equal(calls.length, 2);
  assert.equal(ended.currentOperation.kind, 'reviewer');
});

await test('AbortSignal interrupts a callback and preserves unknown execution for reconciliation', async (t) => {
  const { directory } = await initialize(t);
  const controller = new AbortController();
  const { worker, reviewer, calls } = adapters({
    execute: async ({ task }) => {
      controller.abort('User requested stop');
      return successfulResult(task);
    },
  });
  const ended = await runAutonomy({
    directory,
    worker,
    reviewer,
    signal: controller.signal,
  });
  assert.equal(ended.phase, 'handoff');
  assert.equal(ended.goal.tasks[0].status, 'running');
  await runAutonomy({ directory, worker, reviewer });
  assert.equal(calls.length, 1);
});

await test('bounded timeout aborts a noncooperative adapter and ignores eventual success', async (t) => {
  const { directory } = await initialize(t, { policy: { stepTimeoutMs: 20 } });
  const lateResult = deferred();
  let workerSignal;
  let firstTask;
  const { worker, reviewer, calls } = adapters({
    execute: ({ task, signal }) => {
      firstTask = task;
      workerSignal = signal;
      return lateResult.promise;
    },
  });
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.equal(ended.phase, 'handoff');
  assert.equal(workerSignal.aborted, true);
  assert.equal(ended.goal.tasks[0].status, 'running');
  lateResult.resolve(successfulResult(firstTask));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(readAutonomyRun(directory), ended);
  await runAutonomy({ directory, worker, reviewer });
  assert.equal(calls.length, 1);
});

await test('synchronous callbacks cannot bypass the elapsed-time limit by blocking the timer', async (t) => {
  const blockTimer = () => {
    const until = performance.now() + 50;
    while (performance.now() < until) {
      /* Deliberately block this fixture event loop. */
    }
  };
  for (const side of ['execute', 'review']) {
    const { directory } = await initialize(t, { policy: { stepTimeoutMs: 5 } });
    let callbackSignal;
    const configured = adapters({
      [side]: ({ task, signal }) => {
        callbackSignal = signal;
        blockTimer();
        return side === 'execute'
          ? successfulResult(task)
          : acceptedReview(task);
      },
    });
    const ended = await runAutonomy({
      directory,
      worker: configured.worker,
      reviewer: configured.reviewer,
    });
    assert.equal(ended.phase, 'handoff');
    assert.match(ended.reason, /timed out/i);
    assert.equal(callbackSignal.aborted, true);
    assert.equal(
      ended.goal.tasks[0].status,
      side === 'execute' ? 'running' : 'submitted',
    );
    assert.equal(ended.goal.tasks[1].status, 'pending');
    assert.equal(configured.calls.length, side === 'execute' ? 1 : 2);
  }
});

await test('persisted unknown dispatch is handed off without invoking the adapter again', async (t) => {
  const { directory, state } = await initialize(t);
  const running = applyGoalEvent(state.goal, {
    id: 'fixture-crashed-worker-start',
    type: 'start_task',
    expectedRevision: state.goal.revision,
    actor: 'fixture-worker',
    taskId: 'REQ-01',
  });
  const crashed = {
    ...state,
    revision: state.revision + 1,
    phase: 'executing',
    goal: running,
    adapterIds: { worker: 'fixture-worker', reviewer: 'fixture-reviewer' },
    attempts: { ...state.attempts, 'REQ-01': 1 },
    totalAttempts: 1,
    currentOperation: {
      key: 'fixture-crash-intent',
      kind: 'worker',
      taskId: 'REQ-01',
      adapterId: 'fixture-worker',
      status: 'intent',
    },
  };
  await withAutonomyLock(directory, () =>
    writeAutonomyRun(directory, crashed, state.revision),
  );
  const { worker, reviewer, calls } = adapters();
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.equal(ended.phase, 'handoff');
  assert.equal(ended.goal.tasks[0].status, 'running');
  assert.equal(ended.currentOperation.key, 'fixture-crash-intent');
  assert.equal(calls.length, 0);
});

await test('a stopped durable successful result resumes at verification without repeating the worker', async (t) => {
  const { directory, state } = await initialize(t);
  const task = state.goal.tasks[0];
  const result = successfulResult(task);
  let submitted = applyGoalEvent(state.goal, {
    id: 'checkpoint-start',
    type: 'start_task',
    expectedRevision: state.goal.revision,
    actor: 'fixture-worker',
    taskId: task.id,
  });
  submitted = applyGoalEvent(submitted, {
    id: 'checkpoint-submit',
    type: 'submit_result',
    expectedRevision: submitted.revision,
    actor: 'fixture-worker',
    taskId: task.id,
    ...result,
  });
  const checkpoint = {
    ...state,
    revision: state.revision + 1,
    phase: 'result_ready',
    goal: submitted,
    attempts: { ...state.attempts, [task.id]: 1 },
    totalAttempts: 1,
    adapterIds: { worker: 'fixture-worker', reviewer: 'fixture-reviewer' },
    currentOperation: {
      key: 'durable-result',
      kind: 'worker',
      taskId: task.id,
      adapterId: 'fixture-worker',
      status: 'result',
      result,
    },
  };
  await withAutonomyLock(directory, () =>
    writeAutonomyRun(directory, checkpoint, state.revision),
  );
  const { worker, reviewer, calls } = adapters();
  requestAutonomyControl(directory, 'stop');
  const paused = await runAutonomy({ directory, worker, reviewer });
  assert.equal(paused.phase, 'paused');
  assert.equal(paused.currentOperation.status, 'result');
  assert.equal(paused.goal.tasks[0].status, 'submitted');
  assert.equal(calls.length, 0);
  await resumeAutonomyRun(directory);
  assert.equal(readAutonomyControl(directory), null);
  const completed = await runAutonomy({ directory, worker, reviewer });
  assert.equal(completed.phase, 'awaiting_owner_acceptance');
  assert.equal(calls[0].phase, 'review');
  assert.equal(calls[0].taskId, task.id);
  assert.equal(
    calls.some((call) => call.phase === 'work' && call.taskId === task.id),
    false,
  );
  assert.equal(completed.attempts[task.id], 1);
  assert.equal(completed.totalAttempts, 7);
});

await test('a durable safe failure resumes within its remaining retry budget', async (t) => {
  const { directory, state } = await initialize(t, {
    policy: { maxAttemptsPerTask: 2 },
  });
  const task = state.goal.tasks[0];
  const result = {
    outcome: 'failed',
    summary: 'Fixture transient failure without effects',
    deliverables: [],
    evidence: ['fixture/safe-failure.md'],
    retryable: true,
    safeToRetry: true,
  };
  let failed = applyGoalEvent(state.goal, {
    id: 'retry-checkpoint-start',
    type: 'start_task',
    expectedRevision: state.goal.revision,
    actor: 'fixture-worker',
    taskId: task.id,
  });
  failed = applyGoalEvent(failed, {
    id: 'retry-checkpoint-submit',
    type: 'submit_result',
    expectedRevision: failed.revision,
    actor: 'fixture-worker',
    taskId: task.id,
    ...result,
  });
  const checkpoint = {
    ...state,
    revision: state.revision + 1,
    phase: 'retry_pending',
    goal: failed,
    attempts: { ...state.attempts, [task.id]: 1 },
    totalAttempts: 1,
    adapterIds: { worker: 'fixture-worker', reviewer: 'fixture-reviewer' },
    currentOperation: {
      key: 'durable-failure',
      kind: 'worker',
      taskId: task.id,
      adapterId: 'fixture-worker',
      status: 'result',
      result,
    },
  };
  await withAutonomyLock(directory, () =>
    writeAutonomyRun(directory, checkpoint, state.revision),
  );
  const { worker, reviewer, calls } = adapters();
  const completed = await runAutonomy({ directory, worker, reviewer });
  assert.equal(completed.phase, 'awaiting_owner_acceptance');
  assert.equal(
    calls.filter((call) => call.phase === 'work' && call.taskId === task.id)
      .length,
    1,
  );
  assert.equal(completed.attempts[task.id], 2);
  assert.equal(completed.totalAttempts, 8);
});

await test('a worker cannot mutate the approved Goal or task boundaries by reference', async (t) => {
  for (const change of [
    ({ goal }) => {
      goal.instruction = 'Publish and charge users';
    },
    ({ task }) => {
      task.executionBoundary = 'Unrestricted external access';
    },
    ({ goal }) => {
      goal.rules = [];
    },
  ]) {
    const { directory, state } = await initialize(t);
    const { worker, reviewer, calls } = adapters({
      execute: async (context) => {
        change(context);
        return successfulResult(context.task);
      },
    });
    const ended = await runAutonomy({ directory, worker, reviewer });
    assert.equal(ended.phase, 'handoff');
    assert.equal(ended.goal.instruction, state.goal.instruction);
    assert.deepEqual(ended.goal.rules, state.goal.rules);
    assert.equal(
      ended.goal.tasks[0].executionBoundary,
      state.goal.tasks[0].executionBoundary,
    );
    assert.notEqual(ended.goal.tasks[0].status, 'done');
    assert.equal(calls.length, 1);
  }
});

await test('a reviewer cannot alter acceptance criteria to turn its own result into acceptance', async (t) => {
  const { directory, state } = await initialize(t);
  const { worker, reviewer, calls } = adapters({
    review: async ({ task }) => {
      task.acceptanceCriteria[0].criterion = 'Accept without evidence';
      return acceptedReview(task);
    },
  });
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.equal(ended.phase, 'handoff');
  assert.equal(ended.goal.tasks[0].status, 'submitted');
  assert.deepEqual(
    ended.goal.tasks[0].acceptanceCriteria,
    state.goal.tasks[0].acceptanceCriteria,
  );
  assert.equal(calls.length, 2);
});

await test('persisted changes to the approved contract or attempt policy prevent dispatch', async (t) => {
  for (const change of [
    (state) => {
      state.goal.instruction = 'Publish the notes app';
      state.goal.requestBrief.goal = state.goal.instruction;
    },
    (state) => {
      state.policy.maxTotalAttempts += 1;
    },
  ]) {
    const { directory, state } = await initialize(t);
    const altered = clone(state);
    change(altered);
    altered.revision++;
    await withAutonomyLock(directory, () =>
      writeAutonomyRun(directory, altered, state.revision),
    );
    const { worker, reviewer, calls } = adapters();
    await assert.rejects(
      runAutonomy({ directory, worker, reviewer }),
      /contract drift|policy drift/i,
    );
    assert.equal(calls.length, 0);
  }
});

await test('draft plans, held tasks, and authority-required work cannot execute automatically', async (t) => {
  const goals = [
    fixtureGoal({ approved: false }),
    fixtureGoal({
      changeDefinition: (definition) => {
        definition.mission.executionHolds = [
          {
            id: 'owner-hold',
            taskIds: ['REQ-01'],
            scope: 'Local fixture work',
            reason: 'Owner decision pending',
            releaseCondition: 'Owner confirms the scope',
            decisionOwner: 'OWNER',
            source: 'fixture/approval.md',
          },
        ];
      },
    }),
    fixtureGoal({
      changeDefinition: (definition) => {
        definition.mission.taskPlans[0].workloadClass = 'external';
      },
    }),
  ];
  for (const goal of goals) {
    const { directory } = await initialize(t, { goal });
    const { worker, reviewer, calls } = adapters();
    const ended = await runAutonomy({ directory, worker, reviewer });
    assert.equal(ended.phase, 'awaiting_approval');
    assert.equal(calls.length, 0);
    assert.ok(ended.goal.tasks.every((task) => task.status === 'pending'));
    assert.deepEqual(ended.goal.holds, goal.holds);
  }
});

await test('worker and reviewer identities must be distinct and the same fixture adapters persist across runs', async (t) => {
  const { directory } = await initialize(t);
  const { worker, reviewer, calls } = adapters();
  await assert.rejects(
    runAutonomy({
      directory,
      worker,
      reviewer: { ...reviewer, id: worker.id },
    }),
    /independent|distinct|different/i,
  );
  assert.equal(calls.length, 0);
  requestAutonomyControl(directory, 'stop');
  await runAutonomy({ directory, worker, reviewer });
  await resumeAutonomyRun(directory);
  await assert.rejects(
    runAutonomy({
      directory,
      worker: { ...worker, id: 'another-worker' },
      reviewer,
    }),
    /adapter|identity|different|changed/i,
  );
  assert.equal(calls.length, 0);
});

await test('real adapters and protected Sky goals are outside fixture authority', async (t) => {
  for (const side of ['worker', 'reviewer']) {
    const { directory } = await initialize(t);
    const configured = adapters();
    configured[side] = { ...configured[side], kind: 'codex' };
    await assert.rejects(
      runAutonomy({
        directory,
        worker: configured.worker,
        reviewer: configured.reviewer,
      }),
      /fixture/i,
    );
    assert.equal(configured.calls.length, 0);
  }
  const goal = fixtureGoal();
  goal.skyBrief = {
    ...goal.requestBrief,
    schema: 'amc-sky-brief/1',
    templateId: 'sky-specific-launch-v1',
  };
  delete goal.requestBrief;
  assert.equal(validateGoal(goal).ok, true);
  assert.throws(() => createAutonomyState({ goal }), /Sky|sky/);
});

await test('attempt and timeout policy values must be positive finite bounded integers', () => {
  for (const key of [
    'maxAttemptsPerTask',
    'maxTotalAttempts',
    'stepTimeoutMs',
  ]) {
    for (const value of [
      0,
      -1,
      1.5,
      Infinity,
      NaN,
      '2',
      Number.MAX_SAFE_INTEGER,
      null,
    ]) {
      assert.throws(
        () =>
          createAutonomyState({
            goal: fixtureGoal(),
            policy: { [key]: value },
          }),
        undefined,
        `${key}=${value}`,
      );
    }
  }
  for (const policy of [null, [], { unknownPolicy: 1 }])
    assert.throws(() => createAutonomyState({ goal: fixtureGoal(), policy }));
});

await test('storage requires exclusive ownership and compare-and-swap before replacing a saved revision', async (t) => {
  const { directory, state } = await initialize(t);
  const next = {
    ...state,
    revision: state.revision + 1,
    reason: 'Fixture metadata update',
  };
  assert.throws(
    () => writeAutonomyRun(directory, next, state.revision),
    /lock/i,
  );
  await withAutonomyLock(directory, async () => {
    writeAutonomyRun(directory, next, state.revision);
    assert.throws(
      () =>
        writeAutonomyRun(
          directory,
          { ...next, revision: next.revision + 1 },
          state.revision,
        ),
      /revision|conflict/i,
    );
    assert.throws(
      () =>
        writeAutonomyRun(
          directory,
          { ...next, revision: next.revision + 2 },
          next.revision,
        ),
      /revision|conflict/i,
    );
  });
  assert.deepEqual(readAutonomyRun(directory), next);
  await assert.rejects(createAutonomyRun(directory, state), /exist/i);
  assert.deepEqual(readAutonomyRun(directory), next);
});

await test('control requests are idempotent, cancel dominates stop, and neither can clear a live lock', async (t) => {
  const { directory, state } = await initialize(t);
  assert.equal(readAutonomyControl(directory), null);
  await withAutonomyLock(directory, async () => {
    assert.equal(requestAutonomyControl(directory, 'stop'), 'stop');
    assert.equal(requestAutonomyControl(directory, 'stop'), 'stop');
    assert.equal(requestAutonomyControl(directory, 'cancel'), 'cancel');
    assert.equal(requestAutonomyControl(directory, 'stop'), 'cancel');
    await assert.rejects(resumeAutonomyRun(directory), /lock/i);
  });
  assert.equal(readAutonomyControl(directory), 'cancel');
  await assert.rejects(resumeAutonomyRun(directory), /cancel/i);
  assert.deepEqual(readAutonomyRun(directory), state);
  assert.throws(
    () => requestAutonomyControl(directory, 'resume'),
    /stop|cancel/i,
  );
});

await test('lock release also happens when its callback fails', async (t) => {
  const { directory } = await initialize(t);
  await assert.rejects(
    withAutonomyLock(directory, async () => {
      throw new Error('fixture callback failure');
    }),
    /fixture callback failure/,
  );
  let reached = false;
  await withAutonomyLock(directory, async () => {
    reached = true;
  });
  assert.equal(reached, true);
});

await test('lock recovery refuses a live local supervisor', async (t) => {
  const { directory, state } = await initialize(t);
  await withAutonomyLock(directory, async () => {
    assert.throws(() => recoverAutonomyLock(directory), /alive/i);
    assert.equal(
      existsSync(join(directory, '.supervisor-lock', 'owner.json')),
      true,
    );
    assert.deepEqual(readAutonomyRun(directory), state);
  });
});

await test('dead local lock recovery preserves the unknown operation for human reconciliation', async (t) => {
  const { directory, state } = await initialize(t);
  const running = applyGoalEvent(state.goal, {
    id: 'dead-process-start',
    type: 'start_task',
    expectedRevision: state.goal.revision,
    actor: 'fixture-worker',
    taskId: 'REQ-01',
  });
  const checkpoint = {
    ...state,
    revision: state.revision + 1,
    phase: 'executing',
    goal: running,
    attempts: { ...state.attempts, 'REQ-01': 1 },
    totalAttempts: 1,
    adapterIds: { worker: 'fixture-worker', reviewer: 'fixture-reviewer' },
    currentOperation: {
      key: 'dead-process-intent',
      kind: 'worker',
      taskId: 'REQ-01',
      adapterId: 'fixture-worker',
      status: 'intent',
    },
  };
  await withAutonomyLock(directory, () =>
    writeAutonomyRun(directory, checkpoint, state.revision),
  );
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)'], {
    timeout: 1000,
  });
  assert.equal(child.status, 0);
  assert.ok(Number.isSafeInteger(child.pid) && child.pid > 0);
  const lock = join(directory, '.supervisor-lock');
  mkdirSync(lock);
  writeFileSync(
    join(lock, 'owner.json'),
    JSON.stringify({
      pid: child.pid,
      hostname: hostname(),
      uid: process.getuid?.() ?? null,
    }),
  );
  assert.deepEqual(recoverAutonomyLock(directory), checkpoint);
  assert.equal(existsSync(lock), false);
  const { worker, reviewer, calls } = adapters();
  const ended = await runAutonomy({ directory, worker, reviewer });
  assert.equal(ended.phase, 'handoff');
  assert.equal(ended.currentOperation.key, 'dead-process-intent');
  assert.equal(ended.goal.tasks[0].status, 'running');
  assert.equal(calls.length, 0);
});
