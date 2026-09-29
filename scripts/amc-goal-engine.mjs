// Provider-neutral, browser-compatible planning/state logic. No network, file
// access, agent launch, identity verification or evidence-content verification.
const SCHEMA = 'amc-goal/1';
const TASK_STATES = [
  'pending',
  'running',
  'submitted',
  'done',
  'blocked',
  'failed',
];
const GOAL_STATES = ['draft', 'active', 'paused', 'accepted'];
const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const optionalString = (value) =>
  value === undefined || value === null || typeof value === 'string';
const unique = (values) => [...new Set(values)];
const refs = (value) =>
  Array.isArray(value) && value.length > 0 && value.every(text);
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

function digest(value) {
  let hash = 2166136261;
  for (const char of value)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function index(items, key, label) {
  ensure(Array.isArray(items), `${label} must be an array`);
  const map = new Map();
  for (const item of items) {
    ensure(item && text(item[key]), `${label} requires ${key}`);
    ensure(!map.has(item[key]), `Duplicate ${label}: ${item[key]}`);
    map.set(item[key], item);
  }
  return map;
}

function normalizedPath(path) {
  ensure(text(path), 'Output path required');
  const base = path.split('#')[0].replace(/\\/g, '/');
  ensure(
    text(base) &&
      !base.startsWith('/') &&
      !/^[a-z][a-z0-9+.-]*:/i.test(base) &&
      ![...base].some((char) => char.charCodeAt(0) < 32),
    'Output path must be safe repository-relative, not absolute or URL',
  );
  ensure(!base.split('/').includes('..'), 'Output path must not contain ..');
  const result = base
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
  ensure(text(result), 'Output path required');
  return result.toLowerCase();
}

function conflict(left, right) {
  return left.some((a) =>
    right.some(
      (b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`),
    ),
  );
}

function locks(task) {
  return unique(task.deliverables.map((item) => normalizedPath(item.path)));
}

function criteria(items, prefix) {
  return (items || []).map((item, i) => ({
    ...clone(item),
    id: item.id || `${prefix}-AC${i + 1}`,
    criterion: item.criterion,
    sourceStatus: item.status || 'not_verified',
    sourceEvidence: clone(item.evidence || []),
    status: 'not_verified',
    evidence: [],
  }));
}

function cycleErrors(tasks) {
  const map = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();
  const errors = [];
  function visit(id) {
    if (visiting.has(id)) {
      errors.push(`Dependency cycle: ${id}`);
      return;
    }
    if (visited.has(id) || !map.has(id)) return;
    visiting.add(id);
    for (const dependency of map.get(id).dependsOn || []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of tasks) visit(task.id);
  return errors;
}

/** Keyword suggestions only. [] means no recognized scope, not an NLP plan. */
export function recommendSquads(instruction, mission) {
  if (!text(instruction) || !Array.isArray(mission?.squads)) return [];
  const value = instruction.toLowerCase();
  const suggested = new Set();
  const addPrefix = (prefix) =>
    mission.squads
      .filter((s) => s.id.startsWith(prefix))
      .forEach((s) => suggested.add(s.id));
  if (/全製品|全部隊|all squads|all products/.test(value))
    mission.squads.forEach((s) => suggested.add(s.id));
  if (/avocado\s*mini|avokado\s*mini|\bmini\b|ミニ/.test(value)) addPrefix('M');
  if (/avokado\s*pro|avocado\s*pro|\bpro\b/.test(value)) addPrefix('P');
  if (/rocketstar|\brocket\b|ロケット/.test(value)) addPrefix('R');
  if (/rockstar\s*os|\bos\b|オーエス/.test(value)) addPrefix('O');
  for (const [id, pattern] of [
    ['H1', /\bamc\b|部隊|進捗|タスク|依存/],
    ['O1', /security|権限|セキュリティ/],
    ['O2', /work data|データ保存|仕事状態/],
    ['O3', /\bai\b|agent|llm|エージェント/],
    ['O4', /\bmcp\b|tool接続/],
    ['O5', /\bsky\b|\bzema\b|wallet|課金/],
    ['O6', /pixel|android|device adapter/],
    ['O7', /release|配布|リリース/],
  ])
    if (pattern.test(value)) suggested.add(id);
  for (const squad of mission.squads) {
    if (value.split(/[^a-z0-9]+/).includes(squad.id.toLowerCase()))
      suggested.add(squad.id);
  }
  return mission.squads
    .filter((squad) => suggested.has(squad.id))
    .map((squad) => squad.id);
}

/** Compile a candidate backlog. Explicit selection is required even if routing
 * suggested squads. The instruction is never claimed to have been decomposed. */
export function compileGoal({
  instruction,
  squadIds,
  mission,
  project,
  goalId,
  createdAt = /** @type {string | null} */ (null),
  maxParallel = 1,
  sourceFiles = [],
}) {
  ensure(text(instruction), 'Instruction required');
  ensure(
    Array.isArray(squadIds) && squadIds.length > 0,
    'Explicit squad selection required; unknown scope cannot be compiled',
  );
  ensure(
    Number.isSafeInteger(maxParallel) && maxParallel > 0,
    'maxParallel must be a positive configured integer',
  );
  const squadMap = index(mission.squads, 'id', 'squad');
  const taskMap = index(project.tasks, 'id', 'task');
  const planMap = index(mission.taskPlans || [], 'taskId', 'plan');
  const assignmentMap = index(
    mission.taskAssignments || [],
    'taskId',
    'assignment',
  );
  const selectedSquadIds = unique(squadIds);
  for (const id of selectedSquadIds)
    ensure(squadMap.has(id), `Unknown squad: ${id}`);
  const parentMap = new Map();
  const childrenMap = new Map();
  function link(parent, child) {
    ensure(
      taskMap.has(parent) && taskMap.has(child),
      `Unknown parent/child: ${parent}/${child}`,
    );
    ensure(parent !== child, `Parent cycle: ${parent}`);
    ensure(
      !parentMap.has(child) || parentMap.get(child) === parent,
      `Multiple parents: ${child}`,
    );
    parentMap.set(child, parent);
    childrenMap.set(
      parent,
      unique([...(childrenMap.get(parent) || []), child]),
    );
  }
  for (const task of taskMap.values()) {
    const plan = planMap.get(task.id);
    if (task.parentTaskId) link(task.parentTaskId, task.id);
    if (plan?.parentTaskId) link(plan.parentTaskId, task.id);
    for (const child of [
      ...(task.childTaskIds || []),
      ...(plan?.childTaskIds || []),
    ])
      link(task.id, child);
  }
  const roots = unique(
    selectedSquadIds.flatMap((id) => squadMap.get(id).nextTaskIds || []),
  );
  ensure(roots.length > 0, 'Selected squads have no next tasks');
  const included = new Set();
  function include(id) {
    ensure(taskMap.has(id), `Unknown task dependency: ${id}`);
    if (included.has(id)) return;
    included.add(id);
    for (const dependency of taskMap.get(id).dependsOn || [])
      include(dependency);
    if (parentMap.has(id)) include(parentMap.get(id));
    for (const child of childrenMap.get(id) || []) include(child);
  }
  roots.forEach(include);
  const holds = (mission.executionHolds || []).map((hold, i) => ({
    id: hold.id || `HOLD-${i + 1}`,
    ...clone(hold),
  }));
  const includedSquads = new Set(selectedSquadIds);
  const tasks = [...included].map((id) => {
    const source = taskMap.get(id);
    const plan = planMap.get(id);
    const assignment = assignmentMap.get(id);
    ensure(
      assignment && squadMap.has(assignment.primarySquad),
      `Task requires explicit primary squad: ${id}`,
    );
    includedSquads.add(assignment.primarySquad);
    const ancestors = [];
    let parent = parentMap.get(id);
    while (parent) {
      ensure(!ancestors.includes(parent), `Parent cycle: ${id}`);
      ancestors.push(parent);
      parent = parentMap.get(parent);
    }
    const childTaskIds = childrenMap.get(id) || [];
    const inheritedDependencies = ancestors.flatMap(
      (ancestor) => taskMap.get(ancestor).dependsOn || [],
    );
    const acceptanceCriteria = criteria(plan?.acceptanceCriteria, id);
    const deliverables = clone(plan?.deliverables || []);
    const taskHolds = holds.filter((hold) =>
      [id, ...ancestors].some((taskId) =>
        (hold.taskIds || []).includes(taskId),
      ),
    );
    const workloadClass =
      plan?.workloadClass || source.workloadClass || 'unclassified';
    const executionMode =
      source.status === 'done'
        ? 'review_existing_evidence'
        : childTaskIds.length
          ? 'parent_acceptance'
          : 'execute_candidate_plan';
    return {
      id,
      title: source.title,
      squadId: assignment.primarySquad,
      classification: assignment.classification,
      parentTaskId: parentMap.get(id) || null,
      childTaskIds,
      sourceStatus: source.status,
      sourceEvidence: clone(source.evidence || []),
      sourceDependencies: clone(source.dependsOn || []),
      status: source.status === 'blocked' ? 'blocked' : 'pending',
      executionMode,
      executionEligibility:
        executionMode !== 'execute_candidate_plan'
          ? 'review_only'
          : ['document', 'code_test'].includes(workloadClass)
            ? 'local_work'
            : 'authority_required',
      scope: plan?.scope || source.title,
      scopeReviewRequired: !acceptanceCriteria.length || !deliverables.length,
      dependsOn: unique([
        ...(source.dependsOn || []),
        ...inheritedDependencies,
        ...childTaskIds,
      ]),
      inputs: clone(plan?.inputs || []),
      steps: clone(plan?.steps || []),
      deliverables,
      acceptanceCriteria,
      workloadClass,
      executionBoundary:
        plan?.executionBoundary ||
        plan?.completionScope ||
        '既存taskの範囲・受入条件を確認してから実行する。',
      unresolvedDecision:
        plan?.unresolvedDecision || '入力・受入範囲の確認が必要。',
      rules: clone(squadMap.get(assignment.primarySquad).rules || []),
      holds: clone(taskHolds),
      evidence: [],
      startedBy: null,
      result: null,
      review: null,
      attempts: [],
      blockReason:
        source.status === 'blocked'
          ? '元taskがblocked。解除根拠の確認が必要。'
          : null,
    };
  });
  const goal = {
    schema: SCHEMA,
    id:
      goalId ||
      `amc-goal-${digest(stable({ instruction, selectedSquadIds, createdAt }))}`,
    createdAt,
    sourceFiles: clone(sourceFiles),
    instruction: instruction.trim(),
    state: 'draft',
    revision: 0,
    planningMethod: 'rule_based_candidate_backlog',
    reviewRequired: true,
    scopeWarning:
      '既存の次taskと前提から作った候補計画。任意の利用者指示を分解・網羅した保証はない。未対応要求をレビューし、全体合格条件を明示して承認する。',
    selectedSquadIds,
    rootTaskIds: roots,
    maxParallel,
    parallelismScope:
      '明示設定したこのGoalの実行枠。PC性能・Provider上限を検証した値ではない。',
    sourceSnapshot: {
      missionUpdatedAt: mission.updatedAt || null,
      projectUpdatedAt: project.updatedAt || null,
      audit: clone(mission.audit || null),
      taskSpecs: tasks.map((task) =>
        clone({
          id: task.id,
          squadId: task.squadId,
          parentTaskId: task.parentTaskId,
          childTaskIds: task.childTaskIds,
          sourceDependencies: task.sourceDependencies,
          sourceStatus: task.sourceStatus,
          sourceEvidence: task.sourceEvidence,
          acceptanceCriteria: task.acceptanceCriteria,
          deliverables: task.deliverables,
          workloadClass: task.workloadClass,
          executionBoundary: task.executionBoundary,
        }),
      ),
      holds: clone(
        holds.filter((hold) =>
          tasks.some((task) => task.holds.some((item) => item.id === hold.id)),
        ),
      ),
    },
    squads: [...includedSquads].map((id) => {
      const squad = squadMap.get(id);
      return {
        id,
        name: squad.name,
        goal: squad.goal,
        rules: clone(squad.rules || []),
        acceptanceGate: squad.acceptanceGate,
        selected: selectedSquadIds.includes(id),
      };
    }),
    rules: unique([
      ...(mission.globalRules || []),
      '未承認の支出・課金・外部送信・公開・契約・端末書込・飛行・資産移動を実行しない。',
      '結果の申告を合格にしない。実行者と異なるreviewerが証拠と全条件を確認する。',
      '同じ成果物pathの同時編集を禁止し、前提の検収後に後続へ渡す。',
      '元doneは証拠再利用レビューの候補。旧版・共通基盤を現在の実機合格へ転用しない。',
      '停止・失敗・結果不明を隠さず保存する。このengineは外部実行を開始も停止もしない。',
    ]),
    holds: holds.filter((hold) =>
      tasks.some((task) => task.holds.some((item) => item.id === hold.id)),
    ),
    tasks,
    approval: null,
    overallAcceptance: {
      criteria: [],
      accepted: false,
      evidence: [],
      reviewer: null,
    },
    eventLog: [],
  };
  const validation = validateGoal(goal);
  ensure(validation.ok, validation.errors.join('; '));
  return goal;
}

function validCriteria(items) {
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.every((item) => item && text(item.id) && text(item.criterion)) &&
    new Set(items.map((item) => item.id)).size === items.length
  );
}

function validDeliverables(items) {
  if (!Array.isArray(items) || !items.length) return false;
  try {
    return items.every(
      (item) =>
        item &&
        text(item.description) &&
        optionalString(item.section) &&
        text(normalizedPath(item.path)),
    );
  } catch {
    return false;
  }
}

/** Validate structural/state invariants, never evidence contents or identities. */
export function validateGoal(goal) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const strings = (items) => Array.isArray(items) && items.every(text);
  const object = (item) =>
    item && typeof item === 'object' && !Array.isArray(item);
  const same = (left, right) => stable(left) === stable(right);
  const criterionShape = (item) =>
    object(item) &&
    text(item.id) &&
    text(item.criterion) &&
    optionalString(item.verification) &&
    optionalString(item.sourceStatus) &&
    ['not_verified', 'passed', 'failed'].includes(item.status) &&
    strings(item.evidence) &&
    strings(item.sourceEvidence);
  const holdShape = (hold) =>
    object(hold) &&
    text(hold.id) &&
    strings(hold.taskIds) &&
    ['scope', 'reason', 'releaseCondition', 'decisionOwner'].every((key) =>
      text(hold[key]),
    );
  if (!goal || typeof goal !== 'object')
    return { ok: false, errors: ['Goal object required'] };
  check(goal.schema === SCHEMA, 'Unknown goal schema');
  check(
    text(goal.id) && text(goal.instruction),
    'Goal id/instruction required',
  );
  if (goal.requestBrief !== undefined) {
    const brief = goal.requestBrief;
    check(
      object(brief) &&
        brief.schema === 'amc-request-brief/1' &&
        brief.templateId === 'software-local-prototype-v1' &&
        ['request', 'goal', 'intent'].every((key) => text(brief[key])) &&
        brief.request.length <= 8000 &&
        brief.goal.length <= 8000 &&
        brief.intent.length <= 2000 &&
        brief.goal === goal.instruction,
      'Invalid request brief',
    );
  }
  check(GOAL_STATES.includes(goal.state), 'Unknown goal state');
  check(
    optionalString(goal.createdAt) && optionalString(goal.pauseReason),
    'Goal timestamps/reason must be primitive strings',
  );
  check(
    Number.isSafeInteger(goal.revision) && goal.revision >= 0,
    'Invalid revision',
  );
  check(
    Number.isSafeInteger(goal.maxParallel) && goal.maxParallel > 0,
    'Invalid maxParallel',
  );
  check(
    typeof goal.reviewRequired === 'boolean' &&
      text(goal.scopeWarning) &&
      text(goal.parallelismScope),
    'Review/plan boundary required',
  );
  check(
    strings(goal.selectedSquadIds) &&
      goal.selectedSquadIds.length > 0 &&
      strings(goal.rootTaskIds) &&
      goal.rootTaskIds.length > 0,
    'Selected squads and roots required',
  );
  check(strings(goal.rules), 'Rules array required');
  check(
    Array.isArray(goal.holds) && goal.holds.every(holdShape),
    'Holds array required',
  );
  check(
    object(goal.overallAcceptance) &&
      Array.isArray(goal.overallAcceptance.criteria) &&
      goal.overallAcceptance.criteria.every(criterionShape) &&
      typeof goal.overallAcceptance.accepted === 'boolean' &&
      optionalString(goal.overallAcceptance.reviewer) &&
      strings(goal.overallAcceptance.evidence),
    'Overall acceptance record required',
  );
  check(
    object(goal.sourceSnapshot) &&
      Array.isArray(goal.sourceSnapshot.taskSpecs) &&
      goal.sourceSnapshot.taskSpecs.every(object) &&
      optionalString(goal.sourceSnapshot.missionUpdatedAt) &&
      optionalString(goal.sourceSnapshot.projectUpdatedAt) &&
      Array.isArray(goal.sourceSnapshot.holds) &&
      goal.sourceSnapshot.holds.every(holdShape),
    'Source task/hold snapshot required',
  );
  check(
    Array.isArray(goal.tasks) &&
      goal.tasks.every(object) &&
      Array.isArray(goal.squads) &&
      goal.squads.every(object) &&
      Array.isArray(goal.eventLog) &&
      goal.eventLog.every(object),
    'Tasks, squads and eventLog records required',
  );
  if (errors.length) return { ok: false, errors };
  check(
    goal.sourceFiles === undefined ||
      (Array.isArray(goal.sourceFiles) &&
        goal.sourceFiles.every(
          (file) =>
            file &&
            text(file.path) &&
            typeof file.sha256 === 'string' &&
            /^[a-f0-9]{64}$/i.test(file.sha256),
        )),
    'Invalid sourceFiles provenance',
  );
  const ids = new Set(goal.tasks.map((task) => task.id));
  const squadIds = new Set(goal.squads.map((squad) => squad.id));
  check(
    ids.size === goal.tasks.length && ids.size > 0,
    'Duplicate or empty tasks',
  );
  check(squadIds.size === goal.squads.length, 'Duplicate squads');
  check(
    goal.squads.every(
      (squad) =>
        text(squad.id) &&
        text(squad.name) &&
        text(squad.goal) &&
        optionalString(squad.acceptanceGate) &&
        strings(squad.rules),
    ),
    'Squad goal/rules required',
  );
  check(
    goal.selectedSquadIds.every((id) => squadIds.has(id)) &&
      unique(goal.selectedSquadIds).length === goal.selectedSquadIds.length,
    'Invalid squad selection',
  );
  check(
    goal.rootTaskIds.every((id) => ids.has(id)),
    'Unknown root task',
  );
  check(
    same(goal.holds, goal.sourceSnapshot.holds),
    'Source holds were changed or removed',
  );
  const specs = new Map(
    goal.sourceSnapshot.taskSpecs.map((spec) => [spec.id, spec]),
  );
  check(
    goal.sourceSnapshot.taskSpecs.every(
      (spec) =>
        text(spec.id) &&
        Array.isArray(spec.acceptanceCriteria) &&
        spec.acceptanceCriteria.every(criterionShape) &&
        Array.isArray(spec.deliverables) &&
        (!spec.deliverables.length || validDeliverables(spec.deliverables)),
    ),
    'Invalid source scope snapshot',
  );
  check(
    specs.size === ids.size &&
      goal.sourceSnapshot.taskSpecs.length === ids.size &&
      [...ids].every((id) => specs.has(id)),
    'Source task set mismatch',
  );
  const taskMap = new Map(goal.tasks.map((task) => [task.id, task]));
  for (const task of goal.tasks) {
    if (!text(task.id)) {
      errors.push('Task id must be a nonempty primitive string');
      continue;
    }
    check(
      text(task.id) && text(task.title) && squadIds.has(task.squadId),
      `Invalid task identity: ${task.id}`,
    );
    check(TASK_STATES.includes(task.status), `Unknown task state: ${task.id}`);
    check(
      ['planned', 'in_progress', 'done', 'blocked'].includes(task.sourceStatus),
      `Unknown source status: ${task.id}`,
    );
    check(
      strings(task.dependsOn) &&
        task.dependsOn.every((id) => ids.has(id) && id !== task.id) &&
        unique(task.dependsOn).length === task.dependsOn.length,
      `Invalid dependencies: ${task.id}`,
    );
    check(
      strings(task.sourceDependencies) &&
        strings(task.sourceEvidence) &&
        strings(task.evidence) &&
        strings(task.rules),
      `Source/evidence/rules arrays required: ${task.id}`,
    );
    check(
      strings(task.childTaskIds) &&
        task.childTaskIds.every((id) => ids.has(id) && id !== task.id) &&
        unique(task.childTaskIds).length === task.childTaskIds.length,
      `Invalid children: ${task.id}`,
    );
    check(
      task.parentTaskId === null ||
        (text(task.parentTaskId) &&
          task.parentTaskId !== task.id &&
          ids.has(task.parentTaskId)),
      `Unknown/self parent: ${task.id}`,
    );
    check(
      Array.isArray(task.holds) &&
        task.holds.every(holdShape) &&
        Array.isArray(task.attempts),
      `Missing task tracking arrays: ${task.id}`,
    );
    check(
      Array.isArray(task.steps) &&
        task.steps.every(
          (step) => object(step) && text(step.id) && text(step.action),
        ),
      `Invalid steps: ${task.id}`,
    );
    check(
      Array.isArray(task.inputs) &&
        task.inputs.every(
          (item) =>
            object(item) &&
            text(item.path) &&
            optionalString(item.locator) &&
            optionalString(item.section),
        ),
      `Invalid inputs: ${task.id}`,
    );
    check(
      Array.isArray(task.deliverables) &&
        (!task.deliverables.length || validDeliverables(task.deliverables)),
      `Invalid output paths: ${task.id}`,
    );
    check(
      Array.isArray(task.acceptanceCriteria) &&
        task.acceptanceCriteria.every(criterionShape),
      `Invalid acceptance criteria: ${task.id}`,
    );
    check(
      typeof task.scopeReviewRequired === 'boolean' &&
        text(task.scope) &&
        text(task.executionBoundary) &&
        text(task.unresolvedDecision) &&
        text(task.workloadClass),
      `Task scope/boundaries required: ${task.id}`,
    );
    check(
      [
        'review_existing_evidence',
        'parent_acceptance',
        'execute_candidate_plan',
      ].includes(task.executionMode) &&
        ['review_only', 'local_work', 'authority_required'].includes(
          task.executionEligibility,
        ),
      `Execution mode required: ${task.id}`,
    );
    check(
      task.scopeReviewRequired ||
        (validCriteria(task.acceptanceCriteria) &&
          validDeliverables(task.deliverables)),
      `Unreviewed task scope: ${task.id}`,
    );
    check(
      optionalString(task.startedBy) && optionalString(task.blockReason),
      `Task actor/reason must be primitive strings: ${task.id}`,
    );
    check(
      task.result === null ||
        (object(task.result) &&
          ['succeeded', 'failed'].includes(task.result.outcome) &&
          text(task.result.submittedBy) &&
          task.result.submittedBy === task.startedBy &&
          text(task.result.summary) &&
          strings(task.result.deliverables) &&
          refs(task.result.evidence) &&
          optionalString(task.result.at)),
      `Invalid result identity/summary/evidence: ${task.id}`,
    );
    check(
      task.review === null ||
        (object(task.review) &&
          text(task.review.actor) &&
          task.review.role === 'reviewer' &&
          typeof task.review.accepted === 'boolean' &&
          refs(task.review.evidence) &&
          optionalString(task.review.at)),
      `Invalid review record: ${task.id}`,
    );
  }
  if (errors.length) return { ok: false, errors };
  for (const task of goal.tasks) {
    const spec = specs.get(task.id);
    for (const key of [
      'squadId',
      'parentTaskId',
      'childTaskIds',
      'sourceDependencies',
      'sourceStatus',
      'sourceEvidence',
      'workloadClass',
      'executionBoundary',
    ])
      check(same(task[key], spec[key]), `Source ${key} changed: ${task.id}`);
    check(
      Array.isArray(spec.acceptanceCriteria) &&
        Array.isArray(spec.deliverables),
      `Source scope missing: ${task.id}`,
    );
    if (
      Array.isArray(spec.acceptanceCriteria) &&
      spec.acceptanceCriteria.length
    ) {
      check(
        task.acceptanceCriteria.length === spec.acceptanceCriteria.length &&
          spec.acceptanceCriteria.every((source) =>
            task.acceptanceCriteria.some(
              (item) =>
                item.id === source.id &&
                item.criterion === source.criterion &&
                item.verification === source.verification &&
                same(item.sourceEvidence, source.sourceEvidence),
            ),
          ),
        `Source criteria changed: ${task.id}`,
      );
    }
    if (Array.isArray(spec.deliverables) && spec.deliverables.length)
      check(
        same(task.deliverables, spec.deliverables),
        `Source deliverables changed: ${task.id}`,
      );
    check(
      task.childTaskIds.every((id) => taskMap.get(id).parentTaskId === task.id),
      `Child/parent membership mismatch: ${task.id}`,
    );
    check(
      !task.parentTaskId ||
        taskMap.get(task.parentTaskId).childTaskIds.includes(task.id),
      `Parent/child membership mismatch: ${task.id}`,
    );
    const ancestors = [];
    let parent = task.parentTaskId;
    while (parent && !ancestors.includes(parent)) {
      ancestors.push(parent);
      parent = taskMap.get(parent)?.parentTaskId;
    }
    check(!parent, `Parent cycle: ${task.id}`);
    const expectedDependencies = unique([
      ...task.sourceDependencies,
      ...ancestors.flatMap((id) => taskMap.get(id).sourceDependencies),
      ...task.childTaskIds,
    ]);
    check(
      same(
        [...task.dependsOn].sort((a, b) => a.localeCompare(b)),
        expectedDependencies.sort((a, b) => a.localeCompare(b)),
      ),
      `Inherited dependencies changed: ${task.id}`,
    );
    const expectedHolds = goal.holds.filter((hold) =>
      [task.id, ...ancestors].some((id) => hold.taskIds.includes(id)),
    );
    check(
      same(task.holds, expectedHolds),
      `Inherited holds changed: ${task.id}`,
    );
    const mode =
      task.sourceStatus === 'done'
        ? 'review_existing_evidence'
        : task.childTaskIds.length
          ? 'parent_acceptance'
          : 'execute_candidate_plan';
    const eligibility =
      mode !== 'execute_candidate_plan'
        ? 'review_only'
        : ['document', 'code_test'].includes(task.workloadClass)
          ? 'local_work'
          : 'authority_required';
    check(
      task.executionMode === mode && task.executionEligibility === eligibility,
      `Execution permission changed: ${task.id}`,
    );
    if (['running', 'submitted', 'done'].includes(task.status)) {
      check(
        !task.scopeReviewRequired &&
          task.holds.length === 0 &&
          eligibility !== 'authority_required',
        `Task has unreviewed scope, authority or holds: ${task.id}`,
      );
      check(
        task.dependsOn.every((id) => taskMap.get(id).status === 'done'),
        `Unaccepted prerequisite: ${task.id}`,
      );
      check(text(task.startedBy), `Worker identity required: ${task.id}`);
    }
    if (['submitted', 'done'].includes(task.status))
      check(
        task.result?.outcome === 'succeeded' &&
          refs(task.result.evidence) &&
          refs(task.result.deliverables),
        `Missing result evidence: ${task.id}`,
      );
    if (task.result?.outcome === 'succeeded') {
      try {
        check(
          refs(task.result.deliverables) &&
            task.deliverables.every((item) =>
              task.result.deliverables.some(
                (ref) => normalizedPath(ref) === normalizedPath(item.path),
              ),
            ),
          `Successful result missing planned outputs: ${task.id}`,
        );
      } catch {
        errors.push(`Invalid successful result output reference: ${task.id}`);
      }
    }
    if (task.status === 'done')
      check(
        task.review?.accepted === true &&
          task.review.role === 'reviewer' &&
          text(task.review.actor) &&
          task.review.actor !== task.startedBy &&
          task.review.actor !== task.result?.submittedBy &&
          refs(task.review.evidence) &&
          task.acceptanceCriteria.every(
            (item) => item.status === 'passed' && refs(item.evidence),
          ),
        `Independent acceptance required: ${task.id}`,
      );
  }
  errors.push(...cycleErrors(goal.tasks));
  const running = goal.tasks.filter((task) => task.status === 'running');
  check(running.length <= goal.maxParallel, 'Parallel limit exceeded');
  const locked = goal.tasks.filter((task) =>
    ['running', 'submitted'].includes(task.status),
  );
  for (let i = 0; i < locked.length; i += 1)
    for (let j = i + 1; j < locked.length; j += 1) {
      try {
        check(
          !conflict(locks(locked[i]), locks(locked[j])),
          `Shared output lock conflict: ${locked[i].id}/${locked[j].id}`,
        );
      } catch {
        errors.push('Invalid output lock path');
      }
    }
  if (goal.state === 'draft')
    check(
      goal.reviewRequired === true &&
        goal.approval === null &&
        goal.tasks.every((task) =>
          ['pending', 'blocked'].includes(task.status),
        ),
      'Draft cannot have approved/running work',
    );
  if (goal.state !== 'draft')
    check(
      goal.reviewRequired === false &&
        goal.approval?.scopeConfirmed === true &&
        goal.approval.role === 'owner' &&
        text(goal.approval?.actor) &&
        text(goal.approval?.coverageStatement) &&
        optionalString(goal.approval.at) &&
        validCriteria(goal.overallAcceptance?.criteria) &&
        goal.tasks.every((task) => !task.scopeReviewRequired),
      'Approved instruction scope and criteria required',
    );
  if (goal.state === 'accepted')
    check(
      goal.tasks.every((task) => task.status === 'done') &&
        goal.overallAcceptance?.accepted === true &&
        refs(goal.overallAcceptance.evidence) &&
        goal.overallAcceptance.criteria.every(
          (item) => item.status === 'passed' && refs(item.evidence),
        ),
      'Overall explicit acceptance required',
    );
  check(
    new Set(goal.eventLog.map((event) => event.id)).size ===
      goal.eventLog.length,
    'Duplicate event IDs',
  );
  check(goal.eventLog.length === goal.revision, 'Revision/event log mismatch');
  check(
    goal.eventLog.every(
      (event, i) =>
        text(event.id) &&
        text(event.type) &&
        text(event.actor) &&
        optionalString(event.at) &&
        optionalString(event.outcome) &&
        optionalString(event.summary) &&
        (event.accepted === null || typeof event.accepted === 'boolean') &&
        (event.taskId === null || ids.has(event.taskId)) &&
        text(event.fingerprint) &&
        event.revision === i + 1,
    ),
    'Invalid event log sequence',
  );
  return { ok: errors.length === 0, errors };
}

/** readyTaskIds is an ordered, bounded, mutually non-conflicting suggestion. */
export function summarizeGoal(goal) {
  const counts = Object.fromEntries(TASK_STATES.map((state) => [state, 0]));
  const bySquad = {};
  const taskMap = new Map(goal.tasks.map((task) => [task.id, task]));
  for (const task of goal.tasks) {
    counts[task.status] += 1;
    bySquad[task.squadId] ||= {
      total: 0,
      leafTotal: 0,
      completed: 0,
      ...Object.fromEntries(TASK_STATES.map((state) => [state, 0])),
    };
    const group = bySquad[task.squadId];
    group.total += 1;
    group[task.status] += 1;
    if (!task.childTaskIds.length) group.leafTotal += 1;
    if (task.status === 'done') group.completed += 1;
  }
  const activeLocks = goal.tasks
    .filter((task) => ['running', 'submitted'].includes(task.status))
    .flatMap(locks);
  const readyTaskIds = [];
  const eligibleTaskIds = [];
  const availableSlots = Math.max(0, goal.maxParallel - counts.running);
  if (goal.state === 'active' && !goal.reviewRequired) {
    for (const task of goal.tasks) {
      if (
        task.status !== 'pending' ||
        task.scopeReviewRequired ||
        task.holds.length ||
        task.executionEligibility === 'authority_required' ||
        !task.dependsOn.every((id) => taskMap.get(id)?.status === 'done')
      )
        continue;
      const outputLocks = locks(task);
      if (conflict(outputLocks, activeLocks)) continue;
      eligibleTaskIds.push(task.id);
      if (readyTaskIds.length >= availableSlots) continue;
      readyTaskIds.push(task.id);
      activeLocks.push(...outputLocks);
    }
  }
  return {
    total: goal.tasks.length,
    leafTotal: goal.tasks.filter((task) => !task.childTaskIds.length).length,
    completed: counts.done,
    leafCompleted: goal.tasks.filter(
      (task) => !task.childTaskIds.length && task.status === 'done',
    ).length,
    counts,
    bySquad,
    availableSlots,
    eligibleTaskIds,
    readyTaskIds,
    heldTaskIds: goal.tasks
      .filter((task) => task.holds.length)
      .map((task) => task.id),
    authorityRequiredTaskIds: goal.tasks
      .filter((task) => task.executionEligibility === 'authority_required')
      .map((task) => task.id),
    reviewTaskIds: goal.tasks
      .filter((task) => task.scopeReviewRequired)
      .map((task) => task.id),
  };
}

function reviewCriteria(items, results, accepted) {
  ensure(Array.isArray(results), 'criterionResults required');
  const map = index(results, 'criterionId', 'criterion result');
  ensure(
    map.size === items.length && items.every((item) => map.has(item.id)),
    'Every criterion requires exactly one result',
  );
  return items.map((item) => {
    const result = map.get(item.id);
    ensure(
      typeof result.passed === 'boolean' && refs(result.evidence),
      `Criterion evidence required: ${item.id}`,
    );
    ensure(
      !accepted || result.passed,
      `Cannot accept failed criterion: ${item.id}`,
    );
    return {
      ...item,
      status: result.passed ? 'passed' : 'failed',
      evidence: clone(result.evidence),
    };
  });
}

/** Immutable event reducer. Actors/roles and references are claims to be checked
 * by the caller's real auth/evidence boundary, not authenticated by this engine. */
export function applyGoalEvent(goal, event) {
  const initial = validateGoal(goal);
  ensure(initial.ok, initial.errors.join('; '));
  ensure(
    event && text(event.id) && text(event.type) && text(event.actor),
    'Event id/type/actor required',
  );
  ensure(
    optionalString(event.at) && optionalString(event.taskId),
    'Event at/taskId must be primitive strings',
  );
  const fingerprint = stable(event);
  const previous = goal.eventLog.find((item) => item.id === event.id);
  if (previous) {
    ensure(
      previous.fingerprint === fingerprint,
      'Idempotency key reused with different event payload',
    );
    return clone(goal);
  }
  ensure(event.expectedRevision === goal.revision, 'Revision conflict');
  ensure(
    goal.state !== 'accepted',
    'Accepted goal is immutable; create a new goal for additional work',
  );
  const next = clone(goal);
  const task = event.taskId
    ? next.tasks.find((item) => item.id === event.taskId)
    : null;
  if (event.taskId) ensure(task, `Unknown task: ${event.taskId}`);
  const needTask = () => ensure(task, 'taskId required');
  if (event.type === 'approve_plan') {
    ensure(
      next.state === 'draft' && event.role === 'owner',
      'Owner approval of draft required',
    );
    ensure(
      event.scopeConfirmed === true && text(event.coverageStatement),
      'Instruction coverage review required',
    );
    ensure(
      validCriteria(event.acceptanceCriteria),
      'Explicit overall acceptanceCriteria required',
    );
    const reviews = index(
      event.taskPlanReviews || [],
      'taskId',
      'task plan review',
    );
    for (const [id] of reviews)
      ensure(
        next.tasks.some((item) => item.id === id),
        `Unknown task plan review: ${id}`,
      );
    for (const item of next.tasks) {
      const review = reviews.get(item.id);
      if (review) {
        ensure(
          item.scopeReviewRequired,
          `Existing acceptance criteria cannot be replaced: ${item.id}`,
        );
        if (!item.acceptanceCriteria.length)
          item.acceptanceCriteria = criteria(
            review.acceptanceCriteria,
            item.id,
          );
        if (!item.deliverables.length)
          item.deliverables = clone(review.deliverables || []);
        ensure(
          validCriteria(item.acceptanceCriteria) &&
            validDeliverables(item.deliverables),
          `Explicit task scope/outputs required: ${item.id}`,
        );
        item.scopeReviewRequired = false;
      }
      ensure(
        !item.scopeReviewRequired,
        `Task scope review required: ${item.id}`,
      );
    }
    next.approval = {
      actor: event.actor,
      role: event.role,
      scopeConfirmed: true,
      coverageStatement: event.coverageStatement,
      at: event.at || null,
    };
    next.overallAcceptance.criteria = criteria(
      event.acceptanceCriteria,
      next.id,
    );
    next.reviewRequired = false;
    next.state = 'active';
  } else if (event.type === 'start_task') {
    needTask();
    ensure(
      next.state === 'active' && !next.reviewRequired,
      'Approved active plan required',
    );
    ensure(
      summarizeGoal(next).readyTaskIds.includes(task.id),
      'Task not schedulable: prerequisites, hold, lock or parallel limit',
    );
    task.status = 'running';
    task.startedBy = event.actor;
    task.blockReason = null;
  } else if (event.type === 'submit_result') {
    needTask();
    ensure(
      ['active', 'paused'].includes(next.state) && task.status === 'running',
      'Running task required',
    );
    ensure(
      task.startedBy === event.actor,
      'Only the recorded worker can submit this result',
    );
    ensure(
      ['succeeded', 'failed'].includes(event.outcome),
      'Result outcome required',
    );
    ensure(
      Array.isArray(event.deliverables) &&
        event.deliverables.every(text) &&
        (event.outcome === 'failed' || event.deliverables.length > 0) &&
        refs(event.evidence) &&
        text(event.summary),
      'Deliverable references, evidence and summary required (failed result may have no deliverable)',
    );
    if (event.outcome === 'succeeded')
      ensure(
        task.deliverables.every((item) =>
          event.deliverables.some(
            (ref) => normalizedPath(ref) === normalizedPath(item.path),
          ),
        ),
        'All planned deliverables required',
      );
    task.result = {
      submittedBy: event.actor,
      outcome: event.outcome,
      deliverables: clone(event.deliverables),
      evidence: clone(event.evidence),
      summary: event.summary,
      at: event.at || null,
    };
    task.evidence = clone(event.evidence);
    task.status = event.outcome === 'succeeded' ? 'submitted' : 'failed';
  } else if (event.type === 'verify_task') {
    needTask();
    ensure(
      ['active', 'paused'].includes(next.state) && task.status === 'submitted',
      'Submitted successful result required',
    );
    ensure(
      event.role === 'reviewer' &&
        event.actor !== task.startedBy &&
        event.actor !== task.result.submittedBy,
      'Independent reviewer required',
    );
    ensure(
      typeof event.accepted === 'boolean' && refs(event.evidence),
      'Explicit review acceptance and evidence required',
    );
    task.acceptanceCriteria = reviewCriteria(
      task.acceptanceCriteria,
      event.criterionResults,
      event.accepted,
    );
    task.review = {
      actor: event.actor,
      role: event.role,
      accepted: event.accepted,
      evidence: clone(event.evidence),
      at: event.at || null,
    };
    task.status = event.accepted ? 'done' : 'failed';
  } else if (event.type === 'block_task') {
    needTask();
    ensure(
      ['active', 'paused'].includes(next.state) &&
        ['pending', 'failed'].includes(task.status),
      'Only pending/failed task may be blocked; pause goal to retain running/submitted locks',
    );
    ensure(text(event.reason), 'Block reason required');
    task.status = 'blocked';
    task.blockReason = event.reason;
  } else if (event.type === 'resume_task') {
    needTask();
    ensure(
      next.state === 'active' && ['blocked', 'failed'].includes(task.status),
      'Blocked/failed task in active goal required',
    );
    ensure(
      ['owner', 'reviewer'].includes(event.role) &&
        text(event.reason) &&
        refs(event.evidence),
      'Reviewed resume reason/evidence required',
    );
    ensure(
      task.holds.length === 0,
      'Execution hold cannot be cleared by resume; update authority and recompile',
    );
    task.attempts.push({
      startedBy: task.startedBy,
      result: task.result,
      review: task.review,
      blockReason: task.blockReason,
      resumeEvidence: clone(event.evidence),
    });
    task.status = 'pending';
    task.startedBy = null;
    task.result = null;
    task.review = null;
    task.evidence = [];
    task.blockReason = null;
    task.acceptanceCriteria = task.acceptanceCriteria.map((item) => ({
      ...item,
      status: 'not_verified',
      evidence: [],
    }));
  } else if (event.type === 'pause') {
    ensure(
      next.state === 'active' && text(event.reason),
      'Active goal and pause reason required',
    );
    next.state = 'paused';
    next.pauseReason = event.reason;
  } else if (event.type === 'resume') {
    ensure(next.state === 'paused', 'Paused goal required');
    next.state = 'active';
    next.pauseReason = null;
  } else if (event.type === 'accept_goal') {
    ensure(
      next.state === 'active' &&
        event.role === 'owner' &&
        event.accepted === true,
      'Explicit owner goal acceptance required',
    );
    ensure(
      next.tasks.every((item) => item.status === 'done'),
      'All tasks including parent acceptance must be independently accepted',
    );
    ensure(refs(event.evidence), 'Overall acceptance evidence required');
    next.overallAcceptance.criteria = reviewCriteria(
      next.overallAcceptance.criteria,
      event.criterionResults,
      true,
    );
    next.overallAcceptance.accepted = true;
    next.overallAcceptance.evidence = clone(event.evidence);
    next.overallAcceptance.reviewer = event.actor;
    next.state = 'accepted';
  } else throw new Error(`Unknown event type: ${event.type}`);
  next.revision += 1;
  next.eventLog.push({
    id: event.id,
    type: event.type,
    taskId: event.taskId || null,
    actor: event.actor,
    at: event.at || null,
    outcome: event.outcome || null,
    summary: event.summary || event.reason || null,
    accepted: event.accepted ?? null,
    revision: next.revision,
    fingerprint,
  });
  const validation = validateGoal(next);
  ensure(validation.ok, validation.errors.join('; '));
  return next;
}

/** Reviewable handoff text. It never sends a prompt or starts an executor. */
export function renderGoalPrompt(goal, { squadId } = {}) {
  if (squadId)
    ensure(
      goal.squads.some((squad) => squad.id === squadId),
      `Unknown squad: ${squadId}`,
    );
  const tasks = squadId
    ? goal.tasks.filter((task) => task.squadId === squadId)
    : goal.tasks;
  return [
    `# AMC Goal ${goal.id}${squadId ? ` / ${squadId}` : ''}`,
    `状態: ${goal.state} / revision: ${goal.revision} / 同時実行設定: ${goal.maxParallel}`,
    `利用者の全体指示: ${goal.instruction}`,
    ...(goal.requestBrief
      ? [
          `元の依頼（作業範囲の基準）: ${goal.requestBrief.request}`,
          `守る意図: ${goal.requestBrief.intent}`,
          '準備方式: ソフトウェアのローカル試作向け共通テンプレート。AIの意味分解・最終見積りではない。実装前に具体的な変更pathと試験条件を確認し、対象ファイルの排他管理を設定する。報告書pathのlockだけでコードの排他管理を代用しない。',
        ]
      : []),
    `計画境界: ${goal.scopeWarning}`,
    `計画承認: ${goal.reviewRequired ? '未承認。網羅性・不足要求・全体合格条件を確認し、ownerのapprove_plan前に実行しない。' : goal.approval.coverageStatement}`,
    `並列枠の意味: ${goal.parallelismScope}`,
    `ローカル正本snapshot: ${(goal.sourceFiles || []).map((file) => `${file.path} SHA-256=${file.sha256}`).join(' / ') || 'hash未添付。remote最新確認済みとは扱わない。'}`,
    '\n## 全体合格条件',
    ...(goal.overallAcceptance.criteria.length
      ? goal.overallAcceptance.criteria.map(
          (item) => `- ${item.id}: ${item.criterion} [${item.status}]`,
        )
      : ['- 未確定。既存backlogだけで任意の依頼を達成済みにしない。']),
    '\n## 部隊Goal',
    ...goal.squads.map(
      (squad) =>
        `- ${squad.id} ${squad.name}: ${squad.goal}\n  部隊の受入境界: ${squad.acceptanceGate || '未確定'}`,
    ),
    '\n## 共通ルール',
    ...goal.rules.map((rule) => `- ${rule}`),
    '\n## 実行保留',
    ...(goal.holds.length
      ? goal.holds.map(
          (hold) =>
            `- ${hold.id}: ${hold.scope} / ${hold.reason} / 解除条件: ${hold.releaseCondition} / 判断者: ${hold.decisionOwner}`,
        )
      : ['- 登録保留なし。外部作用への許可を意味しない。']),
    '\n## 担当候補タスク',
    ...tasks.map((task) =>
      [
        `### ${task.id}: ${task.title}`,
        `主担当 ${task.squadId} / 元状態 ${task.sourceStatus} / Goal実行状態 ${task.status} / ${task.executionMode}`,
        task.executionMode === 'review_existing_evidence'
          ? '既存成果の再実装ではなく、対象・版・条件の一致と証拠の再利用可否を独立reviewする。'
          : `作業範囲: ${task.scope}`,
        `親: ${task.parentTaskId || 'なし'} / 子: ${task.childTaskIds.join(', ') || 'なし'} / 前提検収: ${task.dependsOn.join(', ') || 'なし'}`,
        `実行境界: ${task.executionBoundary} / 実行区分: ${task.executionEligibility} / 未決: ${task.unresolvedDecision}`,
        `部隊ルール: ${task.rules.join(' / ')}`,
        `入力: ${task.inputs.map((item) => `${item.path} (${item.locator || ''})`).join(' / ') || '確認が必要'}`,
        `既存証拠（今回の合格ではない）: ${task.sourceEvidence.join(', ') || 'なし'}`,
        `手順:\n${task.steps.map((step) => `- ${step.id}: ${step.action}`).join('\n') || '- scope reviewが必要'}`,
        `成果物・排他編集path:\n${task.deliverables.map((item) => `- ${item.path}: ${item.description}`).join('\n') || '- 未確定。同時編集不可'}`,
        `合格条件:\n${task.acceptanceCriteria.map((item) => `- ${item.id}: ${item.criterion} / 検証: ${item.verification || '証拠内容をreview'} [${item.status}]`).join('\n') || '- 未確定。承認前に補完する'}`,
        `保留: ${task.holds.map((hold) => `${hold.id} ${hold.scope}`).join(' / ') || 'なし'}`,
      ].join('\n'),
    ),
    '\n## 保存・検収・再開',
    '- 外部の実行は別途明示承認されたexecutorだけが行う。この文書・engineはAPI送信や課金を開始しない。',
    '- goal JSONのrevisionを確認する。eventは一意id・expectedRevision・actorを持たせ、同一retryは同じidとpayloadを再使用する。',
    '- start_taskは検収済み前提、保留、同時実行数、他taskの成果物path lockを確認する。部隊全体の完了を前提に置換しない。',
    '- submit_resultに成果物path・証拠path・成功/失敗・要約を保存する。ファイル名の存在だけでは正しさを証明しない。',
    '- 実行者と異なるreviewerが対象版・条件・期待値・実測/結果を確認し、全合格条件の証拠をverify_taskに記録する。',
    '- 子taskだけで親や製品全体を完了にしない。親条件を独立受入し、全体指示の条件をownerが証拠付きaccept_goalで受け入れる。',
    '- 中断後は保存済みgoalをvalidateし、未検収結果を照合する。結果不明の外部操作を無条件で再送しない。pauseは外部processの停止保証ではない。',
  ].join('\n');
}
