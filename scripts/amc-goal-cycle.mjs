// Finite local supervisor. This is a local process lock, not a Broker, identity
// provider, monetary meter, production Jev, or an external-action executor.
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import {
  withAutonomyLock,
  readAutonomyControl,
  recoverLocalSupervisorLock,
} from './amc-autonomy-store.mjs';
import {
  validateGoal,
  applyGoalEvent,
  summarizeGoal,
} from './amc-goal-engine.mjs';
import {
  validateBackwardPlan,
  compileBackwardPlan,
  approveBackwardGoal,
  backwardSchedule,
  safeOutput,
} from './amc-backward-plan.mjs';

const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const stable = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
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
const goalContract = (goal) => ({
  ...omit(goal, [
    'state',
    'revision',
    'pauseReason',
    'eventLog',
    'tasks',
    'overallAcceptance',
  ]),
  criteria: goal.overallAcceptance.criteria.map(criterionContract),
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
});
const MAX_BYTES = 5_000_000;
const PHASES = [
  'draft',
  'ready',
  'executing',
  'reviewing',
  'retry_pending',
  'paused',
  'handoff',
  'awaiting_owner_acceptance',
  'accepted',
];

// Bounded FD reads reject symlinks, devices and FIFOs without blocking.
function readBytes(file, limit = MAX_BYTES) {
  ensure(
    constants.O_NOFOLLOW && constants.O_NONBLOCK,
    'Secure local file reads unsupported',
  );
  const fd = openSync(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    ensure(fstatSync(fd).isFile(), 'Regular file required');
    const chunks = [],
      buffer = Buffer.alloc(65536);
    let size = 0;
    while (size <= limit) {
      const count = readSync(
        fd,
        buffer,
        0,
        Math.min(buffer.length, limit + 1 - size),
        size,
      );
      if (!count) break;
      size += count;
      ensure(size <= limit, 'File size limit');
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    return Buffer.concat(chunks, size);
  } finally {
    closeSync(fd);
  }
}
export const readCycleJson = (file) =>
  JSON.parse(readBytes(file).toString('utf8'));
export function writeCycleJson(file, value) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  ensure(Buffer.byteLength(payload) <= MAX_BYTES, 'State size limit');
  const fd = openSync(file, 'wx', 0o600);
  try {
    writeFileSync(fd, payload);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function syncDirectory(dir) {
  const fd = openSync(dir, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function checkedState(state) {
  ensure(
    state?.schema === 'amc-goal-cycle/1' && PHASES.includes(state.phase),
    'Invalid Goal cycle',
  );
  ensure(
    !state.goal.skyBrief,
    'Sky authority cannot be imported into a local cycle',
  );
  validateBackwardPlan(state.plan, state.catalog);
  ensure(
    ['codex', 'local-demo'].includes(state.mode) &&
      state.contractHash ===
        hash({
          plan: state.plan,
          catalog: state.catalog,
          repo: state.repo,
          mode: state.mode,
        }),
    'Plan contract drift',
  );
  ensure(
    validateGoal(state.goal).ok &&
      state.goalHash === hash(goalContract(state.goal)),
    'Goal contract drift',
  );
  ensure(
    Number.isSafeInteger(state.revision) &&
      state.revision >= 0 &&
      state.history.length === state.revision,
    'Invalid cycle revision',
  );
  ensure(
    Number.isSafeInteger(state.invocations) &&
      state.invocations >= 0 &&
      state.invocations <= state.plan.policy.maxInvocations,
    'Invocation limit exceeded',
  );
  ensure(
    Number.isSafeInteger(state.totalAttempts) &&
      state.totalAttempts >= 0 &&
      state.totalAttempts <= state.plan.policy.maxTotalAttempts,
    'Attempt limit exceeded',
  );
  ensure(
    Object.keys(state.attempts).every(
      (key) =>
        state.plan.tasks.some((task) => task.id === key) &&
        Number.isInteger(state.attempts[key]) &&
        state.attempts[key] >= 0 &&
        state.attempts[key] <= state.plan.policy.maxAttemptsPerTask,
    ),
    'Invalid task attempts',
  );
  return state;
}
export const readGoalCycle = (directory) =>
  checkedState(readCycleJson(join(realpathSync(directory), 'state.json')));

export const recoverGoalCycleLock = (directory) =>
  recoverLocalSupervisorLock(directory, readGoalCycle);

async function mutate(directory, callback) {
  return withAutonomyLock(directory, async () => {
    let state = readGoalCycle(directory);
    const save = (patch, reason) => {
      const previous = readGoalCycle(directory);
      ensure(previous.revision === state.revision, 'Cycle revision conflict');
      const next = checkedState({
        ...state,
        ...patch,
        revision: state.revision + 1,
        history: [
          ...state.history,
          {
            revision: state.revision + 1,
            at: new Date().toISOString(),
            phase: patch.phase || state.phase,
            reason,
          },
        ],
      });
      const temporary = join(directory, `.state-${randomUUID()}.tmp`);
      try {
        writeCycleJson(temporary, next);
        renameSync(temporary, join(directory, 'state.json'));
        syncDirectory(directory);
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
      }
      state = readGoalCycle(directory);
      return state;
    };
    return callback(() => state, save);
  });
}

export async function createGoalCycle({
  directory,
  repo,
  plan,
  catalog,
  mode = 'codex',
  now,
}) {
  ensure(
    ['codex', 'local-demo'].includes(mode),
    'Explicit executor mode required',
  );
  const repoPath = realpathSync(resolve(repo));
  const goal = compileBackwardPlan(plan, catalog, { createdAt: now });
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return withAutonomyLock(directory, () => {
    const state = checkedState({
      schema: 'amc-goal-cycle/1',
      revision: 0,
      phase: 'draft',
      mode,
      repo: repoPath,
      plan: structuredClone(plan),
      catalog: structuredClone(catalog),
      goal,
      contractHash: hash({ plan, catalog, repo: repoPath, mode }),
      goalHash: hash(goalContract(goal)),
      attempts: {},
      totalAttempts: 0,
      invocations: 0,
      operation: null,
      adapterIds: null,
      history: [],
      reason: null,
    });
    writeCycleJson(join(directory, 'state.json'), state);
    syncDirectory(directory);
    return readGoalCycle(directory);
  });
}

export async function approveGoalCycle({ directory, owner, expectedRevision }) {
  return mutate(directory, (get, save) => {
    const state = get();
    ensure(
      state.revision === expectedRevision && state.phase === 'draft',
      'Stale or already approved plan',
    );
    const goal = approveBackwardGoal(state.goal, state.plan, owner);
    return save(
      { goal, goalHash: hash(goalContract(goal)), phase: 'ready' },
      `Owner ${owner} approved this exact plan and bounded local rework policy`,
    );
  });
}

export function stopGoalCycle(directory) {
  readGoalCycle(directory);
  const file = join(directory, 'stop.json');
  try {
    writeCycleJson(file, {
      command: 'stop',
      requestedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  syncDirectory(directory);
}
export async function resumeGoalCycle({ directory, expectedRevision }) {
  return mutate(directory, (get, save) => {
    const state = get();
    ensure(
      state.revision === expectedRevision &&
        state.phase === 'paused' &&
        !state.operation,
      'Only a clean boundary stop can resume; unknown effects require reconciliation',
    );
    // Publish ready before removing control: a crash leaves stop in place.
    const next = save(
      { phase: 'ready' },
      'Explicit local resume at a clean operation boundary',
    );
    if (existsSync(join(directory, 'stop.json')))
      unlinkSync(join(directory, 'stop.json'));
    syncDirectory(directory);
    return next;
  });
}

export async function acceptGoalCycle({
  directory,
  owner,
  expectedRevision,
  criteria,
}) {
  return mutate(directory, (get, save) => {
    const state = get();
    ensure(
      state.revision === expectedRevision &&
        state.phase === 'awaiting_owner_acceptance' &&
        !state.operation,
      'Current reviewed Goal required for owner acceptance',
    );
    ensure(
      typeof owner === 'string' && owner.trim(),
      'Owner identity required',
    );
    ensure(
      Array.isArray(criteria) &&
        criteria.every(
          (item) =>
            item.passed === true &&
            typeof item.detail === 'string' &&
            item.detail.trim(),
        ),
      'Explicit owner criterion checks required',
    );
    const latestProducer = new Map();
    for (const key of validateBackwardPlan(state.plan, state.catalog))
      for (const item of state.plan.tasks.find((task) => task.id === key)
        .deliverables)
        latestProducer.set(item.path, key);
    const artifacts = state.goal.tasks.flatMap((task) => {
      // An explicitly ordered successor may revise the same file. Earlier
      // accepted versions remain in receipts; compare the final producer's bytes.
      const outputs = task.deliverables.filter(
        (item) => latestProducer.get(item.path) === task.id,
      );
      const manifest = artifactManifest(state.repo, { deliverables: outputs });
      const reviewReceipt = readCycleJson(
        join(directory, task.review.evidence[0]),
      );
      ensure(
        stable(manifest) ===
          stable(
            reviewReceipt.artifacts.filter(
              (item) => latestProducer.get(item.path) === task.id,
            ),
          ),
        'Artifacts changed after task review; final acceptance refused',
      );
      return manifest;
    });
    const receipt = `operations/owner-${randomUUID()}.json`;
    const criterionResults = criteria.map((item) => ({
      criterionId: item.criterionId,
      passed: item.passed,
      evidence: [`${receipt}#${item.criterionId}`],
    }));
    const goal = applyGoalEvent(state.goal, {
      id: randomUUID(),
      type: 'accept_goal',
      expectedRevision: state.goal.revision,
      actor: owner,
      role: 'owner',
      accepted: true,
      evidence: [receipt],
      criterionResults,
    });
    writeCycleJson(join(directory, receipt), {
      owner,
      criteria,
      artifacts,
      at: new Date().toISOString(),
    });
    syncDirectory(join(directory, 'operations'));
    return save(
      { goal, phase: 'accepted' },
      `Owner ${owner} explicitly accepted the Goal with criterion evidence`,
    );
  });
}

function artifactManifest(repo, task) {
  return task.deliverables.map(({ path }) => {
    safeOutput(path);
    const file = resolve(repo, path);
    const actual = realpathSync(file);
    const rel = relative(repo, actual);
    ensure(
      rel &&
        !isAbsolute(rel) &&
        rel !== '..' &&
        !rel.startsWith('../') &&
        !rel.startsWith('.git/'),
      'Artifact escaped repository',
    );
    const bytes = readBytes(file, 20_000_000);
    return {
      path,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });
}

async function invoke({
  adapter,
  method,
  context,
  directory,
  timeoutMs,
  signal,
}) {
  if (signal?.aborted || readAutonomyControl(directory))
    return {
      kind: 'unknown',
      reason:
        'Stopped before adapter invocation; intent retained for reconciliation',
    };
  const controller = new AbortController();
  let timer, poll;
  const interrupted = new Promise((resolveInterrupt) => {
    timer = setTimeout(
      () =>
        resolveInterrupt({
          kind: 'unknown',
          reason: 'Timeout: reconcile effects before another attempt',
        }),
      timeoutMs,
    );
    poll = setInterval(() => {
      try {
        if (signal?.aborted || readAutonomyControl(directory))
          resolveInterrupt({
            kind: 'unknown',
            reason:
              'Stopped during operation: outcome unknown; automatic replay disabled',
          });
      } catch (error) {
        resolveInterrupt({ kind: 'unknown', reason: error.message });
      }
    }, 25);
  });
  try {
    const running = Promise.resolve()
      .then(() => adapter[method]({ ...context, signal: controller.signal }))
      .then(
        (value) => ({ kind: 'result', value }),
        (error) => ({
          kind: 'unknown',
          reason: String(error.message || error),
        }),
      );
    const outcome = await Promise.race([running, interrupted]);
    if (outcome.kind !== 'result') controller.abort();
    if (signal?.aborted || readAutonomyControl(directory))
      return {
        kind: 'unknown',
        reason:
          'Stopped during operation: outcome unknown; automatic replay disabled',
      };
    return outcome;
  } finally {
    clearTimeout(timer);
    clearInterval(poll);
  }
}

export async function runGoalCycle({ directory, worker, reviewer, signal }) {
  ensure(
    worker?.id &&
      reviewer?.id &&
      worker.id !== reviewer.id &&
      typeof worker.run === 'function' &&
      typeof reviewer.review === 'function',
    'Independent worker and reviewer adapters required',
  );
  return mutate(directory, async (get, save) => {
    let state = get();
    ensure(
      worker.kind === state.mode && reviewer.kind === state.mode,
      'Executor mode mismatch',
    );
    if (
      [
        'draft',
        'handoff',
        'awaiting_owner_acceptance',
        'accepted',
        'paused',
      ].includes(state.phase)
    )
      return state;
    const adapterIds = { worker: worker.id, reviewer: reviewer.id };
    ensure(
      !state.adapterIds || stable(state.adapterIds) === stable(adapterIds),
      'Executor identity changed',
    );
    const handoff = (reason) => save({ phase: 'handoff', reason }, reason);
    if (state.operation?.status === 'intent')
      return handoff(
        'Unfinished operation has unknown effects; automatic replay disabled',
      );
    if (!state.adapterIds) {
      save({ adapterIds }, 'Bound executor identities');
      state = get();
    }
    const event = (type, taskId, actor, extra = {}) =>
      applyGoalEvent(get().goal, {
        id: randomUUID(),
        type,
        taskId,
        actor,
        expectedRevision: get().goal.revision,
        ...extra,
      });
    while (true) {
      state = get();
      if (signal?.aborted || readAutonomyControl(directory))
        return save({ phase: 'paused' }, 'Stopped between operations');
      if (state.plan.deadline && Date.now() >= Date.parse(state.plan.deadline))
        return handoff(
          'Deadline elapsed; revise scope, deadline or resources explicitly',
        );
      if (state.goal.tasks.every((task) => task.status === 'done'))
        return save(
          { phase: 'awaiting_owner_acceptance' },
          'All task reviews passed; final Goal acceptance remains with owner',
        );
      const failed = state.goal.tasks.find((task) => task.status === 'failed');
      if (failed) {
        const last = state.operation;
        if (
          last?.kind !== 'reviewer' ||
          last.taskId !== failed.id ||
          last.result?.safeForLocalRework !== true
        )
          return handoff(
            'Failure needs owner input; no verified safe rework decision',
          );
        if (
          (state.attempts[failed.id] || 0) >=
            state.plan.policy.maxAttemptsPerTask ||
          state.totalAttempts >= state.plan.policy.maxTotalAttempts
        )
          return handoff(
            'Retry bound reached; prepare a new draft without weakening acceptance or carrying approval',
          );
        save(
          {
            goal: event(
              'resume_task',
              failed.id,
              `${last.reviewerRoleId}:${reviewer.id}`,
              {
                role: 'reviewer',
                reason: last.result.summary,
                evidence: [last.receipt],
              },
            ),
            phase: 'ready',
            operation: null,
          },
          `Replan ${failed.id}: repair against unchanged criteria; downstream tasks remain blocked by dependency`,
        );
        continue;
      }
      const submitted = state.goal.tasks.find(
        (task) => task.status === 'submitted',
      );
      const task =
        submitted ||
        state.goal.tasks.find((item) =>
          summarizeGoal(state.goal).readyTaskIds.includes(item.id),
        );
      if (!task)
        return handoff(
          'No eligible task; unresolved dependency, owner action or scope decision',
        );
      if (state.invocations >= state.plan.policy.maxInvocations)
        return handoff(
          'Invocation budget reached; actual model charges require separate metering',
        );
      const spec = state.plan.tasks.find((item) => item.id === task.id);
      const kind = submitted ? 'reviewer' : 'worker';
      if (
        kind === 'worker' &&
        ((state.attempts[task.id] || 0) >=
          state.plan.policy.maxAttemptsPerTask ||
          state.totalAttempts >= state.plan.policy.maxTotalAttempts)
      )
        return handoff('Attempt budget reached');
      const operation = {
        id: randomUUID(),
        status: 'intent',
        kind,
        taskId: task.id,
        roleId: spec.roleId,
        reviewerRoleId: spec.reviewerRoleId,
        actor: `${kind === 'worker' ? spec.roleId : spec.reviewerRoleId}:${kind === 'worker' ? worker.id : reviewer.id}`,
      };
      let before = null;
      if (submitted) {
        try {
          before = artifactManifest(state.repo, spec);
          ensure(
            state.operation?.kind === 'worker' &&
              state.operation.taskId === task.id &&
              state.operation.status === 'result',
            'Submitted task requires its worker receipt',
          );
          ensure(
            stable(before) ===
              stable(
                readCycleJson(join(directory, state.operation.receipt))
                  .artifacts,
              ),
            'Artifacts changed after submission',
          );
        } catch (error) {
          return handoff(
            `Submitted evidence requires reconciliation: ${error.message}`,
          );
        }
      }
      // Intent is durable before any adapter call, including budget reservation.
      save(
        {
          goal: submitted
            ? state.goal
            : event('start_task', task.id, operation.actor),
          phase: submitted ? 'reviewing' : 'executing',
          operation,
          invocations: state.invocations + 1,
          attempts: submitted
            ? state.attempts
            : {
                ...state.attempts,
                [task.id]: (state.attempts[task.id] || 0) + 1,
              },
          totalAttempts: state.totalAttempts + (submitted ? 0 : 1),
        },
        `${kind} intent for ${task.id}`,
      );
      const priorReceipt = task.attempts.at(-1)?.resumeEvidence?.[0];
      const feedback = priorReceipt
        ? readCycleJson(join(directory, priorReceipt)).result
        : null;
      const context = structuredClone({
        repo: state.repo,
        goal: get().goal,
        task: get().goal.tasks.find((item) => item.id === task.id),
        spec,
        role: state.catalog.roles.find(
          (role) => role.id === (submitted ? spec.reviewerRoleId : spec.roleId),
        ),
        attempt: get().attempts[task.id],
        operationId: operation.id,
        feedback,
        runDirectory: directory,
      });
      const outcome = await invoke({
        adapter: submitted ? reviewer : worker,
        method: submitted ? 'review' : 'run',
        context,
        directory,
        timeoutMs: state.plan.policy.stepTimeoutMs,
        signal,
      });
      if (outcome.kind !== 'result') return handoff(outcome.reason);
      const result = outcome.value;
      try {
        ensure(
          result && typeof result.summary === 'string' && result.summary.trim(),
          'Structured result with summary required',
        );
        const artifacts =
          kind === 'reviewer' || result.status === 'completed'
            ? artifactManifest(state.repo, spec)
            : [];
        if (submitted)
          ensure(
            stable(before) === stable(artifacts),
            'Artifacts changed during independent review',
          );
        const receipt = `operations/${operation.id}.json`;
        mkdirSync(join(directory, 'operations'), {
          recursive: true,
          mode: 0o700,
        });
        writeCycleJson(join(directory, receipt), {
          operation,
          result,
          artifacts,
          at: new Date().toISOString(),
        });
        syncDirectory(join(directory, 'operations'));
        if (kind === 'worker') {
          if (result.status !== 'completed')
            return save(
              {
                phase: 'handoff',
                operation: { ...operation, status: 'result', result, receipt },
              },
              'Worker failure or question; reconcile before retry',
            );
          save(
            {
              goal: event('submit_result', task.id, operation.actor, {
                outcome: 'succeeded',
                summary: result.summary,
                deliverables: artifacts.map((item) => item.path),
                evidence: [receipt],
              }),
              phase: 'ready',
              operation: { ...operation, status: 'result', result, receipt },
            },
            `Submitted ${task.id}; independent review pending`,
          );
        } else {
          ensure(
            typeof result.accepted === 'boolean' &&
              typeof result.safeForLocalRework === 'boolean' &&
              Array.isArray(result.criteria),
            'Structured review required',
          );
          const checks = result.criteria.map((item) => {
            ensure(
              typeof item.passed === 'boolean' &&
                typeof item.detail === 'string' &&
                item.detail.trim(),
              'Criterion evidence explanation required',
            );
            return {
              criterionId: item.criterionId,
              passed: item.passed,
              evidence: [`${receipt}#${item.criterionId}`],
            };
          });
          const goal = event('verify_task', task.id, operation.actor, {
            role: 'reviewer',
            accepted: result.accepted,
            evidence: [receipt],
            criterionResults: checks,
          });
          save(
            {
              goal,
              phase: result.accepted ? 'ready' : 'retry_pending',
              operation: result.accepted
                ? null
                : { ...operation, status: 'result', result, receipt },
            },
            result.summary,
          );
        }
      } catch (error) {
        return handoff(
          `Invalid result or evidence; automatic replay disabled: ${error.message}`,
        );
      }
    }
  });
}

export function goalCycleStatus(state) {
  return {
    id: state.goal.id,
    phase: state.phase,
    revision: state.revision,
    goalState: state.goal.state,
    invocations: `${state.invocations}/${state.plan.policy.maxInvocations}`,
    reason: state.reason,
    tasks: state.goal.tasks.map((task) => ({
      id: task.id,
      role: task.squadId,
      reviewer: state.plan.tasks.find((item) => item.id === task.id)
        .reviewerRoleId,
      status: task.status,
      attempts: state.attempts[task.id] || 0,
      dependsOn: task.dependsOn,
    })),
    schedule: backwardSchedule(state.plan, state.catalog),
    history: state.history.slice(-8),
  };
}
