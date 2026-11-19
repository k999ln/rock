// Backward planning and role assignment; execution uses the existing Goal reducer.
import { compileGoal, applyGoalEvent } from './amc-goal-engine.mjs';

export const PLAN_SCHEMA = 'amc-backward-plan/1';
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const id = (value) =>
  text(value) && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value);
const list = (value) => Array.isArray(value) && value.length > 0;
const copy = (value) => structuredClone(value);

export function safeOutput(path) {
  ensure(
    text(path) &&
      !/[\\:#]/.test(path) &&
      ![...path].some((character) => character.charCodeAt(0) < 32) &&
      !path.startsWith('/') &&
      path.split('/').every((part) => part && part !== '.' && part !== '..'),
    'Unsafe output path',
  );
  ensure(
    !['.git', '.agents', '.codex', '.cursor'].includes(path.split('/')[0]),
    'Protected output path',
  );
  return path;
}

export function validateBackwardPlan(plan, catalog) {
  ensure(
    plan?.schema === PLAN_SCHEMA &&
      id(plan.id) &&
      text(plan.instruction) &&
      text(plan.intent),
    'Goal, intent and plan ID required',
  );
  ensure(
    list(catalog?.roles) &&
      new Set(catalog.roles.map((role) => role.id)).size ===
        catalog.roles.length,
    'Unique role catalog required',
  );
  const roles = new Set(catalog.roles.map((role) => role.id));
  ensure(
    list(plan.tasks) && plan.tasks.length <= 48,
    'Plan requires 1–48 tasks',
  );
  ensure(list(plan.successCriteria), 'Goal success criteria required');
  ensure(
    new Set(plan.tasks.map((task) => task.id)).size === plan.tasks.length,
    'Duplicate task ID',
  );
  ensure(
    new Set(plan.successCriteria.map((item) => item.id)).size ===
      plan.successCriteria.length,
    'Duplicate Goal criterion ID',
  );
  const tasks = new Map(plan.tasks.map((task) => [task.id, task]));
  for (const task of plan.tasks) {
    ensure(
      id(task.id) && text(task.title) && text(task.scope),
      'Task ID, title and scope required',
    );
    ensure(
      roles.has(task.roleId) && roles.has(task.reviewerRoleId),
      'Unknown role',
    );
    ensure(
      task.roleId !== task.reviewerRoleId,
      'Independent reviewer role required',
    );
    ensure(
      ['local', 'owner'].includes(task.execution),
      'Explicit execution boundary required',
    );
    ensure(
      Array.isArray(task.dependsOn) &&
        new Set(task.dependsOn).size === task.dependsOn.length &&
        task.dependsOn.every((key) => tasks.has(key)),
      'Unknown or duplicate dependency',
    );
    ensure(
      list(task.steps) && task.steps.every(text),
      'Concrete task steps required',
    );
    ensure(
      list(task.deliverables) &&
        task.deliverables.every(
          (item) => text(item.description) && safeOutput(item.path),
        ),
      'Deliverables required',
    );
    ensure(
      list(task.acceptanceCriteria) &&
        task.acceptanceCriteria.every(
          (item) =>
            id(item.id) && text(item.criterion) && text(item.verification),
        ) &&
        new Set(task.acceptanceCriteria.map((item) => item.id)).size ===
          task.acceptanceCriteria.length,
      'Verifiable task criteria required',
    );
    ensure(
      task.durationMinutes === null ||
        (Number.isFinite(task.durationMinutes) &&
          task.durationMinutes > 0 &&
          task.durationMinutes <= 525600),
      'Duration must be positive or explicitly unknown',
    );
  }
  const visited = new Set();
  const active = new Set();
  const order = [];
  const visit = (key) => {
    ensure(!active.has(key), 'Dependency cycle');
    if (visited.has(key)) return;
    active.add(key);
    tasks.get(key).dependsOn.forEach(visit);
    active.delete(key);
    visited.add(key);
    order.push(key);
  };
  for (const criterion of plan.successCriteria) {
    ensure(
      id(criterion.id) &&
        text(criterion.criterion) &&
        text(criterion.verification) &&
        list(criterion.taskIds) &&
        criterion.taskIds.every((key) => tasks.has(key)),
      'Each Goal criterion must link to concrete outcomes',
    );
    criterion.taskIds.forEach(visit);
  }
  ensure(
    visited.size === tasks.size,
    'Unrelated task outside backward Goal closure',
  );
  // Overlapping producers must be ordered. The Goal engine also locks active paths.
  const ancestors = (key, seen = new Set()) => {
    for (const parent of tasks.get(key).dependsOn)
      if (!seen.has(parent)) {
        seen.add(parent);
        ancestors(parent, seen);
      }
    return seen;
  };
  const overlap = (a, b) =>
    a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  for (let a = 0; a < plan.tasks.length; a++)
    for (let b = a + 1; b < plan.tasks.length; b++) {
      const left = plan.tasks[a],
        right = plan.tasks[b];
      ensure(
        !left.deliverables.some((x) =>
          right.deliverables.some(
            (y) => x.path !== y.path && overlap(x.path, y.path),
          ),
        ),
        'File/directory output conflict',
      );
      if (
        left.deliverables.some((x) =>
          right.deliverables.some((y) => overlap(x.path, y.path)),
        )
      )
        ensure(
          ancestors(left.id).has(right.id) || ancestors(right.id).has(left.id),
          'Unordered output ownership conflict',
        );
    }
  ensure(
    plan.deadline === null ||
      (text(plan.deadline) &&
        /(?:Z|[+-]\d\d:\d\d)$/.test(plan.deadline) &&
        Number.isFinite(Date.parse(plan.deadline))),
    'Deadline must include timezone or be null',
  );
  const policy = plan.policy;
  ensure(
    policy &&
      Number.isInteger(policy.maxAttemptsPerTask) &&
      policy.maxAttemptsPerTask >= 1 &&
      policy.maxAttemptsPerTask <= 5 &&
      Number.isInteger(policy.maxTotalAttempts) &&
      policy.maxTotalAttempts >= 1 &&
      policy.maxTotalAttempts <= 100 &&
      Number.isInteger(policy.maxInvocations) &&
      policy.maxInvocations >= 1 &&
      policy.maxInvocations <= 200 &&
      Number.isInteger(policy.stepTimeoutMs) &&
      policy.stepTimeoutMs >= 50 &&
      policy.stepTimeoutMs <= 1800000,
    'Bounded retry, invocation and timeout policy required',
  );
  return order;
}

export function backwardSchedule(
  plan,
  catalog,
  now = new Date().toISOString(),
) {
  const order = validateBackwardPlan(plan, catalog);
  const tasks = new Map(plan.tasks.map((task) => [task.id, task]));
  const finish = {},
    start = {};
  const known = plan.tasks.every((task) => task.durationMinutes !== null);
  for (const key of order) {
    const task = tasks.get(key);
    finish[key] =
      task.durationMinutes === null ||
      task.dependsOn.some((dep) => finish[dep] === null)
        ? null
        : Math.max(0, ...task.dependsOn.map((dep) => finish[dep])) +
          task.durationMinutes;
  }
  const criticalMinutes = known ? Math.max(...Object.values(finish)) : null;
  const serialMinutes = known
    ? plan.tasks.reduce((sum, task) => sum + task.durationMinutes, 0)
    : null;
  const remaining = plan.deadline
    ? (Date.parse(plan.deadline) - Date.parse(now)) / 60000
    : null;
  let serialEnd = remaining;
  for (const key of [...order].reverse()) {
    start[key] =
      serialEnd === null || tasks.get(key).durationMinutes === null
        ? null
        : serialEnd - tasks.get(key).durationMinutes;
    serialEnd = start[key];
  }
  return {
    order,
    criticalMinutes,
    serialMinutes,
    latestStartMinutesFromNow: start,
    deadlineFeasibleWithOneWorker:
      remaining === null || serialMinutes === null
        ? null
        : serialMinutes <= remaining,
    basis:
      'Estimates only; serial execution. Invocation limit is not a monetary cost estimate.',
  };
}

export function compileBackwardPlan(
  plan,
  catalog,
  { createdAt = new Date().toISOString() } = {},
) {
  validateBackwardPlan(plan, catalog);
  const roles = [...new Set(plan.tasks.map((task) => task.roleId))];
  const mission = {
    squads: roles.map((key) => ({
      id: key,
      name: catalog.roles.find((role) => role.id === key).label,
      goal: plan.instruction,
      rules: [
        'Only the approved task scope; no external action or publication.',
      ],
      acceptanceGate:
        'Independent reviewer checks each criterion against actual artifacts.',
      nextTaskIds: plan.tasks
        .filter((task) => task.roleId === key)
        .map((task) => task.id),
    })),
    globalRules: ['Goal completion requires explicit owner acceptance.'],
    taskAssignments: plan.tasks.map((task) => ({
      taskId: task.id,
      primarySquad: task.roleId,
      classification: 'backward_goal',
    })),
    taskPlans: plan.tasks.map((task) => ({
      taskId: task.id,
      scope: task.scope,
      workloadClass: task.execution === 'local' ? 'code_test' : 'unclassified',
      executionBoundary:
        task.execution === 'local'
          ? 'Authorized local repository work only.'
          : 'Owner decision required; automatic execution forbidden.',
      unresolvedDecision:
        task.execution === 'local'
          ? 'None within approved local scope.'
          : 'Specific external permission and executor required.',
      inputs: task.dependsOn.flatMap((key) =>
        plan.tasks
          .find((item) => item.id === key)
          .deliverables.map((item) => ({
            path: item.path,
            description: item.description,
          })),
      ),
      steps: task.steps.map((action, i) => ({
        id: `${task.id}-step-${i + 1}`,
        action,
      })),
      deliverables: copy(task.deliverables),
      acceptanceCriteria: copy(task.acceptanceCriteria),
    })),
    executionHolds: plan.tasks
      .filter((task) => task.execution === 'owner')
      .map((task) => ({
        id: `owner-${task.id}`,
        taskIds: [task.id],
        scope: task.scope,
        reason:
          'External or owner-only action is outside the local execution authority.',
        releaseCondition: 'Separate owner-approved execution path.',
        decisionOwner: 'OWNER',
      })),
  };
  return compileGoal({
    instruction: plan.instruction,
    squadIds: roles,
    mission,
    project: {
      tasks: plan.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: 'planned',
        dependsOn: copy(task.dependsOn),
        evidence: [],
      })),
    },
    goalId: plan.id,
    createdAt,
    maxParallel: 1,
  });
}

export function approveBackwardGoal(goal, plan, actor) {
  ensure(text(actor), 'Owner identity required');
  return applyGoalEvent(goal, {
    id: `${plan.id}-owner-approval`,
    type: 'approve_plan',
    expectedRevision: goal.revision,
    actor,
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement: plan.intent,
    acceptanceCriteria: plan.successCriteria.map(
      ({ id: key, criterion, verification }) => ({
        id: key,
        criterion,
        verification,
      }),
    ),
  });
}
