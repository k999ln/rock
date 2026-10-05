import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  applyGoalEvent,
  summarizeGoal,
  validateGoal,
} from './amc-goal-engine.mjs';
import {
  withAutonomyLock,
  readAutonomyRun,
  writeAutonomyRun,
  readAutonomyControl,
} from './amc-autonomy-store.mjs';

// This supervisor accepts trusted, in-process test fixtures only. `kind` is a
// routing guard, not a sandbox: connecting an executor requires a separate,
// authenticated authority/side-effect/cancellation design.
const SCHEMA = 'amc-autonomy/1';
const DEFAULT_POLICY = {
  maxAttemptsPerTask: 2,
  maxTotalAttempts: 20,
  stepTimeoutMs: 1000,
};
const POLICY_CAPS = {
  maxAttemptsPerTask: 5,
  maxTotalAttempts: 100,
  stepTimeoutMs: 30_000,
};
const PHASES = new Set([
  'ready',
  'executing',
  'reviewing',
  'result_ready',
  'retry_pending',
  'paused',
  'cancelled',
  'handoff',
  'awaiting_approval',
  'awaiting_owner_acceptance',
]);
const TERMINAL = new Set(['cancelled', 'handoff', 'awaiting_owner_acceptance']);
const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const stable = (value) =>
  JSON.stringify(value, (_, item) =>
    object(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const hash = (value) =>
  createHash('sha256').update(stable(value)).digest('hex');
const omit = (value, keys) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
const criterionContract = (item) => omit(item, ['status', 'evidence']);

function goalContract(goal) {
  return {
    ...omit(goal, [
      'state',
      'revision',
      'pauseReason',
      'eventLog',
      'tasks',
      'overallAcceptance',
    ]),
    overallCriteria: goal.overallAcceptance.criteria.map(criterionContract),
    tasks: goal.tasks.map((task) => ({
      ...omit(task, [
        'status',
        'startedBy',
        'result',
        'review',
        'attempts',
        'blockReason',
        'evidence',
        'acceptanceCriteria',
      ]),
      acceptanceCriteria: task.acceptanceCriteria.map(criterionContract),
    })),
  };
}

function checkedPolicy(policy = {}) {
  ensure(object(policy), 'Fixture policy object required');
  ensure(
    Object.keys(policy).every((key) => Object.hasOwn(DEFAULT_POLICY, key)),
    'Unknown fixture policy option',
  );
  const result = { ...DEFAULT_POLICY, ...policy };
  for (const [key, cap] of Object.entries(POLICY_CAPS))
    ensure(
      Number.isSafeInteger(result[key]) &&
        result[key] > 0 &&
        result[key] <= cap,
      `${key} must be an integer from 1 to ${cap}`,
    );
  return result;
}

function checkedGoal(goal) {
  ensure(
    goal?.skyBrief === undefined,
    'Sky goals require observer authority; fixture autonomy does not support Sky',
  );
  const validation = validateGoal(goal);
  ensure(validation.ok, validation.errors.join('; '));
  ensure(
    goal.state !== 'accepted' && !goal.overallAcceptance.accepted,
    'Accepted goals cannot enter fixture autonomy',
  );
}

/** Pure initialization; it neither approves a plan nor writes/starts anything. */
export function createAutonomyState({ goal, policy = {} }) {
  checkedGoal(goal);
  const fixedPolicy = checkedPolicy(policy);
  const ownedGoal = clone(goal);
  return {
    schema: SCHEMA,
    mode: 'fixture',
    revision: 0,
    goal: ownedGoal,
    contractHash: hash(goalContract(ownedGoal)),
    policy: fixedPolicy,
    policyHash: hash(fixedPolicy),
    attempts: Object.fromEntries(ownedGoal.tasks.map((task) => [task.id, 0])),
    totalAttempts: 0,
    phase:
      ownedGoal.state === 'active' && !ownedGoal.reviewRequired
        ? 'ready'
        : 'awaiting_approval',
    currentOperation: null,
    adapterIds: null,
    history: [],
    reason: null,
  };
}

function checkedState(state) {
  ensure(
    object(state) && state.schema === SCHEMA && state.mode === 'fixture',
    'Unknown autonomy state/mode',
  );
  checkedGoal(state.goal);
  ensure(
    hash(goalContract(state.goal)) === state.contractHash,
    'Immutable Goal contract drift',
  );
  checkedPolicy(state.policy);
  ensure(
    hash(state.policy) === state.policyHash,
    'Immutable fixture policy drift',
  );
  ensure(
    Number.isSafeInteger(state.revision) &&
      state.revision >= 0 &&
      PHASES.has(state.phase),
    'Invalid autonomy revision/phase',
  );
  ensure(
    object(state.attempts) &&
      Object.keys(state.attempts).length === state.goal.tasks.length &&
      state.goal.tasks.every(
        (task) =>
          Number.isSafeInteger(state.attempts[task.id]) &&
          state.attempts[task.id] >= 0 &&
          state.attempts[task.id] <= state.policy.maxAttemptsPerTask,
      ),
    'Invalid attempt counters',
  );
  ensure(
    Number.isSafeInteger(state.totalAttempts) &&
      state.totalAttempts >= 0 &&
      state.totalAttempts <= state.policy.maxTotalAttempts &&
      state.totalAttempts ===
        Object.values(state.attempts).reduce((sum, count) => sum + count, 0),
    'Invalid total attempt counter',
  );
  ensure(
    Array.isArray(state.history) &&
      (state.reason === null || text(state.reason)),
    'Invalid autonomy history/reason',
  );
  ensure(
    state.adapterIds === null ||
      (object(state.adapterIds) &&
        text(state.adapterIds.worker) &&
        text(state.adapterIds.reviewer) &&
        state.adapterIds.worker !== state.adapterIds.reviewer),
    'Invalid adapter identities',
  );
  if (state.currentOperation !== null) {
    const operation = state.currentOperation;
    ensure(
      object(operation) &&
        text(operation.key) &&
        ['worker', 'reviewer'].includes(operation.kind) &&
        text(operation.adapterId) &&
        ['intent', 'result'].includes(operation.status) &&
        state.goal.tasks.some((task) => task.id === operation.taskId),
      'Invalid operation journal',
    );
    const task = state.goal.tasks.find((item) => item.id === operation.taskId);
    ensure(
      operation.kind === 'worker'
        ? operation.status === 'intent'
          ? task.status === 'running'
          : ['running', 'submitted', 'failed'].includes(task.status)
        : task.status === 'submitted',
      'Operation journal/task mismatch',
    );
  }
}

function fixtureAdapter(adapter, method) {
  ensure(
    object(adapter) &&
      adapter.kind === 'fixture' &&
      text(adapter.id) &&
      typeof adapter[method] === 'function',
    `Trusted fixture ${method} adapter required; real executors are unsupported`,
  );
  return { id: adapter.id, callback: adapter[method].bind(adapter) };
}

function workerResult(result) {
  ensure(
    object(result) &&
      Object.keys(result).every((key) =>
        [
          'outcome',
          'summary',
          'deliverables',
          'evidence',
          'retryable',
          'safeToRetry',
          'question',
        ].includes(key),
      ),
    'Invalid fixture worker result fields',
  );
  ensure(
    ['succeeded', 'failed', 'needs_user'].includes(result.outcome) &&
      text(result.summary) &&
      Array.isArray(result.deliverables) &&
      result.deliverables.every(text) &&
      Array.isArray(result.evidence) &&
      result.evidence.length > 0 &&
      result.evidence.every(text),
    'Worker result requires outcome, summary, deliverables and evidence',
  );
  for (const key of ['retryable', 'safeToRetry'])
    ensure(
      result[key] === undefined || typeof result[key] === 'boolean',
      `Invalid ${key}`,
    );
  ensure(
    result.question === undefined || typeof result.question === 'string',
    'Invalid worker question',
  );
  return clone(result);
}

function reviewerResult(result) {
  ensure(
    object(result) &&
      Object.keys(result).every((key) =>
        ['accepted', 'evidence', 'criterionResults'].includes(key),
      ),
    'Invalid fixture reviewer result fields',
  );
  ensure(
    typeof result.accepted === 'boolean' &&
      Array.isArray(result.evidence) &&
      result.evidence.length > 0 &&
      result.evidence.every(text) &&
      Array.isArray(result.criterionResults),
    'Reviewer result requires explicit acceptance and criterion evidence',
  );
  return clone(result);
}

// A callback that ignores abort may continue running. Its input is detached,
// its late result is ignored, and its intent/task lock remains for handoff.
async function invokeFixture({
  directory,
  callback,
  goal,
  task,
  operationKey,
  signal,
  timeoutMs,
}) {
  const controller = new AbortController();
  const deadline = performance.now() + timeoutMs;
  const input = {
    goal: clone(goal),
    task: clone(task),
    operationKey,
    signal: controller.signal,
  };
  const before = stable({
    goal: input.goal,
    task: input.task,
    operationKey: input.operationKey,
  });
  let pollTimer;
  let finished = false;
  let notifyInterrupt;
  const interrupted = new Promise((resolve) => {
    notifyInterrupt = resolve;
  });
  const stop = (control) => notifyInterrupt({ kind: 'interrupted', control });
  const onAbort = () => stop('stop');
  signal?.addEventListener('abort', onAbort, { once: true });
  const poll = () => {
    if (finished) return;
    try {
      const control = readAutonomyControl(directory);
      if (finished) return;
      if (control) return stop(control);
      pollTimer = setTimeout(poll, 25);
    } catch (error) {
      if (!finished)
        notifyInterrupt({
          kind: 'error',
          reason: `Control read failed: ${error.message}`,
        });
    }
  };
  const timer = setTimeout(
    () => notifyInterrupt({ kind: 'timeout' }),
    timeoutMs,
  );
  pollTimer = setTimeout(poll, 25);
  if (signal?.aborted) onAbort();
  const execution = Promise.resolve().then(async () => {
    if (signal?.aborted) return { kind: 'interrupted', control: 'stop' };
    try {
      const value = await callback(input);
      ensure(
        stable({
          goal: input.goal,
          task: input.task,
          operationKey: input.operationKey,
        }) === before,
        'Fixture mutated immutable callback input',
      );
      return { kind: 'result', value: clone(value) };
    } catch (error) {
      return { kind: 'error', reason: String(error?.message || error) };
    }
  });
  try {
    let outcome = await Promise.race([execution, interrupted]);
    // A fast fixture can write a stop flag immediately before returning. Check
    // it while this controller is still alive, before treating that result as
    // observable; polling alone would miss its cooperative abort notification.
    if (outcome.kind === 'result') {
      try {
        const control = readAutonomyControl(directory);
        if (control || signal?.aborted)
          outcome = { kind: 'interrupted', control: control || 'stop' };
        else if (performance.now() >= deadline) outcome = { kind: 'timeout' };
      } catch (error) {
        outcome = {
          kind: 'error',
          reason: `Control read failed: ${error.message}`,
        };
      }
    }
    if (outcome.kind !== 'result') controller.abort();
    return outcome;
  } finally {
    finished = true;
    clearTimeout(timer);
    clearTimeout(pollTimer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Run one finite fixture simulation under the store's exclusive process lock. */
export async function runAutonomy({ directory, worker, reviewer, signal }) {
  const executor = fixtureAdapter(worker, 'run');
  const verifier = fixtureAdapter(reviewer, 'review');
  ensure(executor.id !== verifier.id, 'Independent fixture reviewer required');
  return withAutonomyLock(directory, async () => {
    let state = readAutonomyRun(directory);
    checkedState(state);
    const save = async (patch, reason = null) => {
      const next = {
        ...state,
        ...patch,
        reason,
        revision: state.revision + 1,
        history: [
          ...state.history,
          {
            revision: state.revision + 1,
            phase: patch.phase || state.phase,
            reason,
            operationKey:
              (patch.currentOperation === undefined
                ? state.currentOperation
                : patch.currentOperation
              )?.key || null,
          },
        ],
      };
      checkedState(next);
      state = writeAutonomyRun(directory, next, state.revision);
      return state;
    };
    const handoff = (reason) => save({ phase: 'handoff' }, reason);
    const control = () =>
      signal?.aborted ? 'stop' : readAutonomyControl(directory);
    const interrupted = async (requested, inFlight = false) =>
      save(
        {
          phase:
            requested === 'cancel'
              ? 'cancelled'
              : inFlight
                ? 'handoff'
                : 'paused',
        },
        inFlight
          ? `${requested}: fixture outcome unknown; reconcile manually; automatic replay disabled`
          : `${requested} requested`,
      );
    const event = (type, taskId, actor, key, extra = {}) =>
      applyGoalEvent(state.goal, {
        id: `${key}:${type}`,
        type,
        taskId,
        actor,
        expectedRevision: state.goal.revision,
        ...extra,
      });
    const operationKey = (kind, taskId, attempt) =>
      `amc-fixture:${hash({
        contractHash: state.contractHash,
        taskId,
        attempt,
        kind,
      })}`;

    if (TERMINAL.has(state.phase)) return state;
    if (state.adapterIds) {
      ensure(
        state.adapterIds.worker === executor.id &&
          state.adapterIds.reviewer === verifier.id,
        'Fixture adapter identities changed; create a separately reviewed run',
      );
    } else
      await save({
        adapterIds: { worker: executor.id, reviewer: verifier.id },
      });
    const requested = control();
    if (requested)
      return interrupted(
        requested,
        state.currentOperation?.status === 'intent',
      );
    if (state.currentOperation?.status === 'intent')
      return handoff(
        'Unfinished fixture operation has unknown outcome; automatic replay disabled',
      );
    if (state.goal.tasks.some((task) => task.status === 'running'))
      return handoff(
        'Running task has no recoverable completed result; reconcile manually',
      );

    // Every iteration either returns, consumes an attempt, verifies a submitted
    // task, or performs one persisted safe-retry transition. No unbounded retry.
    while (true) {
      checkedState(state);
      const requested = control();
      if (requested) return interrupted(requested);
      if (state.goal.state !== 'active' || state.goal.reviewRequired)
        return save(
          { phase: 'awaiting_approval' },
          'Owner-approved active Goal required; supervisor cannot grant approval',
        );
      if (state.goal.tasks.every((task) => task.status === 'done'))
        return save(
          { phase: 'awaiting_owner_acceptance', currentOperation: null },
          'All tasks reviewed; explicit owner Goal acceptance remains required',
        );

      const failedOperation = state.currentOperation;
      if (
        failedOperation?.kind === 'worker' &&
        failedOperation.status === 'result' &&
        failedOperation.result?.outcome === 'failed'
      ) {
        const failure = workerResult(failedOperation.result);
        const taskId = failedOperation.taskId;
        if (!failure.retryable || !failure.safeToRetry)
          return handoff(
            'Worker reported failure without explicit safe retry; owner handoff required',
          );
        if (
          state.attempts[taskId] >= state.policy.maxAttemptsPerTask ||
          state.totalAttempts >= state.policy.maxTotalAttempts
        )
          return handoff('Fixture retry budget exhausted');
        const goal = event(
          'resume_task',
          taskId,
          'amc-fixture-supervisor',
          failedOperation.key,
          {
            role: 'reviewer',
            reason:
              'Apply the fixed fixture retry policy to an explicitly safe, retryable failure',
            evidence: failure.evidence,
          },
        );
        await save(
          { goal, phase: 'ready', currentOperation: null },
          'Explicit safe fixture retry scheduled',
        );
        continue;
      }

      const submitted = state.goal.tasks.find(
        (task) => task.status === 'submitted',
      );
      let operation;
      let callback;
      if (submitted) {
        ensure(
          verifier.id !== submitted.startedBy &&
            verifier.id !== submitted.result.submittedBy,
          'Independent fixture reviewer required for persisted result',
        );
        operation = {
          key: operationKey(
            'reviewer',
            submitted.id,
            state.attempts[submitted.id],
          ),
          kind: 'reviewer',
          taskId: submitted.id,
          adapterId: verifier.id,
          status: 'intent',
        };
        await save({ phase: 'reviewing', currentOperation: operation });
        callback = verifier.callback;
      } else {
        if (
          state.goal.tasks.some((task) =>
            ['failed', 'blocked'].includes(task.status),
          )
        )
          return handoff(
            'Failed or blocked task requires reviewed owner handoff',
          );
        const taskId = summarizeGoal(state.goal).readyTaskIds[0];
        if (!taskId)
          return save(
            { phase: 'awaiting_approval' },
            'No schedulable task: scope, authority, hold or dependency requires owner review',
          );
        if (
          state.attempts[taskId] >= state.policy.maxAttemptsPerTask ||
          state.totalAttempts >= state.policy.maxTotalAttempts
        )
          return handoff('Fixture attempt budget exhausted');
        const attempt = state.attempts[taskId] + 1;
        operation = {
          key: operationKey('worker', taskId, attempt),
          kind: 'worker',
          taskId,
          adapterId: executor.id,
          status: 'intent',
        };
        await save({
          goal: event('start_task', taskId, executor.id, operation.key),
          attempts: { ...state.attempts, [taskId]: attempt },
          totalAttempts: state.totalAttempts + 1,
          phase: 'executing',
          currentOperation: operation,
        });
        callback = executor.callback;
      }
      // Controls are checked again after the durable intent and before calling
      // a fixture. An interrupted intent is never guessed safe to replay.
      const beforeCall = control();
      if (beforeCall) return interrupted(beforeCall, true);
      const task = state.goal.tasks.find(
        (item) => item.id === operation.taskId,
      );
      const outcome = await invokeFixture({
        directory,
        callback,
        goal: state.goal,
        task,
        operationKey: operation.key,
        signal,
        timeoutMs: state.policy.stepTimeoutMs,
      });
      const afterCall = control();
      if (afterCall) return interrupted(afterCall, true);
      if (outcome.kind === 'interrupted')
        return interrupted(outcome.control, true);
      if (outcome.kind === 'timeout')
        return handoff(
          'Fixture timed out; outcome unknown; automatic replay disabled',
        );
      if (outcome.kind === 'error')
        return handoff(
          `Fixture error; outcome unknown; automatic replay disabled: ${outcome.reason}`,
        );
      try {
        if (operation.kind === 'worker') {
          const result = workerResult(outcome.value);
          if (result.outcome === 'needs_user')
            return save(
              {
                phase: 'handoff',
                currentOperation: { ...operation, status: 'result', result },
              },
              `Worker needs owner input: ${result.question || result.summary}`,
            );
          const goal = event(
            'submit_result',
            task.id,
            executor.id,
            operation.key,
            result,
          );
          await save({
            goal,
            phase:
              result.outcome === 'failed' ? 'retry_pending' : 'result_ready',
            currentOperation: { ...operation, status: 'result', result },
          });
        } else {
          const result = reviewerResult(outcome.value);
          const goal = event(
            'verify_task',
            task.id,
            verifier.id,
            operation.key,
            { role: 'reviewer', ...result },
          );
          await save(
            {
              goal,
              phase: result.accepted ? 'ready' : 'handoff',
              currentOperation: null,
            },
            result.accepted
              ? null
              : 'Independent fixture review rejected the result; owner handoff required',
          );
          if (!result.accepted) return state;
        }
      } catch (error) {
        return handoff(
          `Invalid fixture result or checkpoint; automatic replay disabled: ${error.message}`,
        );
      }
    }
  });
}
