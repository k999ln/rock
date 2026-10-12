// Pure, browser-compatible bookkeeping for provisional human-effort ranges.
// No clock, filesystem, network, pricing, model throughput or hardware inference.
const EFFORT_STATES = new Set([
  'pending',
  'running',
  'submitted',
  'done',
  'blocked',
  'failed',
]);
const EFFORT_COEFFICIENTS = {
  document: [1, 3],
  code_test: [2, 6],
  review_existing_evidence: [0.5, 1.5],
  parent_acceptance: [0.5, 1],
};
const effortText = (value) =>
  typeof value === 'string' && value.trim().length > 0;
const effortOptionalText = (value) =>
  value === undefined || value === null || typeof value === 'string';
const effortStringArray = (value) =>
  Array.isArray(value) && value.every(effortText);
const effortRange = ([lowerHours, upperHours]) => ({ lowerHours, upperHours });

function validateEffortInput(goal) {
  if (!goal || typeof goal !== 'object' || !Array.isArray(goal.tasks)) {
    throw new TypeError('Goal tasks array required for effort estimate');
  }
  const ids = new Set();
  for (const task of goal.tasks) {
    if (
      !task ||
      typeof task !== 'object' ||
      !effortText(task.id) ||
      !effortText(task.squadId)
    ) {
      throw new TypeError('Every effort task needs a primitive id and squadId');
    }
    if (ids.has(task.id)) throw new Error(`Duplicate effort task: ${task.id}`);
    ids.add(task.id);
    if (!EFFORT_STATES.has(task.status))
      throw new TypeError(`Invalid task status: ${task.id}`);
    if (
      !effortOptionalText(task.workloadClass) ||
      !effortOptionalText(task.executionMode) ||
      typeof task.scopeReviewRequired !== 'boolean'
    ) {
      throw new TypeError(`Invalid workload/mode/scope flag: ${task.id}`);
    }
    if (
      !effortStringArray(task.childTaskIds) ||
      !effortStringArray(task.dependsOn)
    ) {
      throw new TypeError(
        `Task children/dependencies must be string arrays: ${task.id}`,
      );
    }
    if (
      new Set(task.childTaskIds).size !== task.childTaskIds.length ||
      new Set(task.dependsOn).size !== task.dependsOn.length
    ) {
      throw new Error(`Duplicate child/dependency reference: ${task.id}`);
    }
  }
  for (const task of goal.tasks) {
    if (
      [...task.childTaskIds, ...task.dependsOn].some(
        (id) => id === task.id || !ids.has(id),
      )
    ) {
      throw new Error(`Unknown/self task reference: ${task.id}`);
    }
  }
}

function provisionalEffort(task) {
  if (task.scopeReviewRequired) {
    return {
      estimateKind: 'unestimated',
      range: null,
      reason: '作業範囲・合格条件が未確認のため未算定。',
    };
  }
  if (task.executionMode === 'review_existing_evidence') {
    return {
      estimateKind: 'review_existing_evidence',
      range: EFFORT_COEFFICIENTS.review_existing_evidence,
      reason:
        '既存証拠の再利用レビューだけの仮係数。元実装や実機試験の工数ではない。',
    };
  }
  if (
    task.executionMode === 'parent_acceptance' &&
    task.childTaskIds.length > 0
  ) {
    return {
      estimateKind: 'parent_acceptance',
      range: EFFORT_COEFFICIENTS.parent_acceptance,
      reason:
        '子作業とは別の親条件の受入レビューだけを加算。親の実装工数を再加算しない。',
    };
  }
  if (
    task.childTaskIds.length ||
    task.executionMode !== 'execute_candidate_plan'
  ) {
    return {
      estimateKind: 'unestimated',
      range: null,
      reason: '親子の作業範囲または実行modeが未確定のため未算定。',
    };
  }
  if (task.workloadClass === 'document' || task.workloadClass === 'code_test') {
    return {
      estimateKind: task.workloadClass,
      range: EFFORT_COEFFICIENTS[task.workloadClass],
      reason:
        '1件の作業テンプレートに置いた仮係数。内容の難易度・実績から推定した値ではない。',
    };
  }
  return {
    estimateKind: 'unestimated',
    range: null,
    reason:
      '物理・外部・build・未分類など、対応する工数係数がない作業は未算定。',
  };
}

function sumEffortRange(tasks, key) {
  const result = { lowerHours: 0, upperHours: 0, unestimatedCount: 0 };
  for (const task of tasks) {
    const range = task[key];
    if (range === null) {
      result.unestimatedCount += 1;
      continue;
    }
    result.lowerHours += range.lowerHours;
    result.upperHours += range.upperHours;
  }
  return result;
}

/**
 * Fixed, uncalibrated human-hour coefficients; not a delivery-time estimator.
 * Every non-done task keeps 100% of its provisional range, regardless of running,
 * submitted, failed or blocked state. No fractional completion is inferred.
 * Unknown tasks are excluded from numeric sums AND counted explicitly; null is
 * never presented as zero effort. A done unknown task has zero remaining effort
 * but retains unknown original effort in totalOriginalRange.unestimatedCount.
 */
export function estimateGoalEffort(goal) {
  validateEffortInput(goal);
  const tasks = goal.tasks.map((task) => {
    const estimate = provisionalEffort(task);
    const originalRange =
      estimate.range === null ? null : effortRange(estimate.range);
    return {
      id: task.id,
      squadId: task.squadId,
      status: task.status,
      estimateKind: estimate.estimateKind,
      originalRange,
      remainingRange:
        task.status === 'done'
          ? { lowerHours: 0, upperHours: 0 }
          : originalRange === null
            ? null
            : { ...originalRange },
      reason: estimate.reason,
    };
  });
  const totalOriginalRange = sumEffortRange(tasks, 'originalRange');
  const remainingRange = sumEffortRange(tasks, 'remainingRange');
  const squadGroups = new Map();
  for (const task of tasks) {
    if (!squadGroups.has(task.squadId)) squadGroups.set(task.squadId, []);
    squadGroups.get(task.squadId).push(task);
  }
  const bySquad = [...squadGroups].map(([squadId, squadTasks]) => ({
    squadId,
    ...sumEffortRange(squadTasks, 'remainingRange'),
    total: squadTasks.length,
    done: squadTasks.filter((task) => task.status === 'done').length,
    totalOriginalRange: sumEffortRange(squadTasks, 'originalRange'),
  }));
  return {
    ...remainingRange,
    estimatedTaskCount: tasks.filter((task) => task.originalRange !== null)
      .length,
    doneCount: tasks.filter((task) => task.status === 'done').length,
    taskCount: tasks.length,
    totalOriginalRange,
    remainingRange,
    bySquad,
    tasks,
    unit: '人時',
    basis:
      '実測に基づかない固定の仮係数。document=1〜3人時、code_test=2〜6人時、既存証拠レビュー=0.5〜1.5人時、親受入レビュー=0.5〜1人時。未完了は1作業テンプレートの100%が残る仮定。親は子とは別の受入レビューのみで、子の実装工数を二重計上しない。',
    warning: `数値は算定可能な範囲だけの単純合計。残作業の未算定${remainingRange.unestimatedCount}件を除外しており、全体工数の上限ではない。元工数の未算定は${totalOriginalRange.unestimatedCount}件。AI稼働時間・経過時間・納期・価格ではなく、PC性能や並列数による短縮へ換算しない。`,
  };
}
