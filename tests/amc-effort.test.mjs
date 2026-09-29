import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateGoalEffort } from '../scripts/amc-effort.mjs';

const task = (id, extra = {}) => ({
  id,
  squadId: 'H1',
  title: 'A task',
  status: 'pending',
  workloadClass: 'document',
  executionMode: 'execute_candidate_plan',
  scopeReviewRequired: false,
  childTaskIds: [],
  dependsOn: [],
  ...extra,
});

await test('fixed coefficients sum known work and preserve original versus remaining effort', () => {
  const result = estimateGoalEffort({
    tasks: [
      task('DOC'),
      task('CODE', {
        squadId: 'O2',
        workloadClass: 'code_test',
        status: 'done',
      }),
      task('REUSE', {
        workloadClass: 'unclassified',
        executionMode: 'review_existing_evidence',
      }),
    ],
  });
  assert.deepEqual(result.totalOriginalRange, {
    lowerHours: 3.5,
    upperHours: 10.5,
    unestimatedCount: 0,
  });
  assert.deepEqual(result.remainingRange, {
    lowerHours: 1.5,
    upperHours: 4.5,
    unestimatedCount: 0,
  });
  assert.equal(result.lowerHours, 1.5);
  assert.equal(result.upperHours, 4.5);
  assert.equal(result.doneCount, 1);
  assert.equal(result.estimatedTaskCount, 3);
  assert.equal(result.taskCount, 3);
  assert.deepEqual(
    result.bySquad.find((entry) => entry.squadId === 'O2'),
    {
      squadId: 'O2',
      lowerHours: 0,
      upperHours: 0,
      unestimatedCount: 0,
      total: 1,
      done: 1,
      totalOriginalRange: { lowerHours: 2, upperHours: 6, unestimatedCount: 0 },
    },
  );
});

await test('parent adds only an independent acceptance review, not another leaf-sized implementation', () => {
  const result = estimateGoalEffort({
    tasks: [
      task('PARENT', {
        workloadClass: 'unclassified',
        executionMode: 'parent_acceptance',
        childTaskIds: ['CHILD'],
        dependsOn: ['CHILD'],
      }),
      task('CHILD', { workloadClass: 'code_test' }),
    ],
  });
  assert.deepEqual(result.tasks[0].originalRange, {
    lowerHours: 0.5,
    upperHours: 1,
  });
  assert.deepEqual(result.totalOriginalRange, {
    lowerHours: 2.5,
    upperHours: 7,
    unestimatedCount: 0,
  });
  assert.match(result.basis, /二重計上しない/);
  assert.equal(result.tasks[0].estimateKind, 'parent_acceptance');
});

await test('unknown, physical, external and build leaves stay null and visible as unestimated', () => {
  const result = estimateGoalEffort({
    tasks: [
      'unclassified',
      'physical',
      'external',
      'build',
      'future-class',
    ].map((workloadClass, i) => task(`U${i}`, { workloadClass })),
  });
  assert.equal(result.estimatedTaskCount, 0);
  assert.equal(result.unestimatedCount, 5);
  assert.equal(result.lowerHours, 0);
  assert.equal(result.upperHours, 0);
  assert.ok(
    result.tasks.every(
      (entry) => entry.originalRange === null && entry.remainingRange === null,
    ),
  );
  assert.match(result.warning, /未算定5件/);
  assert.match(result.warning, /全体工数の上限ではない/);
});

await test('unknown completed work has zero remaining but keeps original effort unestimated', () => {
  const result = estimateGoalEffort({
    tasks: [task('DONE', { workloadClass: 'physical', status: 'done' })],
  });
  assert.equal(result.unestimatedCount, 0);
  assert.equal(result.totalOriginalRange.unestimatedCount, 1);
  assert.equal(result.tasks[0].originalRange, null);
  assert.deepEqual(result.tasks[0].remainingRange, {
    lowerHours: 0,
    upperHours: 0,
  });
  assert.equal(result.doneCount, 1);
});

await test('unreviewed scope and ambiguous parent/mode never receive a numeric estimate', () => {
  const result = estimateGoalEffort({
    tasks: [
      task('REVIEW', {
        scopeReviewRequired: true,
        executionMode: 'review_existing_evidence',
      }),
      task('PARENT', { childTaskIds: ['CHILD'] }),
      task('CHILD'),
      task('BADMODE', { executionMode: 'unknown' }),
      task('EMPTY-PARENT', { executionMode: 'parent_acceptance' }),
    ],
  });
  assert.equal(result.unestimatedCount, 4);
  assert.equal(result.estimatedTaskCount, 1);
});

await test('running, submitted, failed and blocked retain 100 percent of provisional remaining range', () => {
  const result = estimateGoalEffort({
    tasks: ['pending', 'running', 'submitted', 'failed', 'blocked'].map(
      (status) => task(status, { status }),
    ),
  });
  assert.equal(result.lowerHours, 5);
  assert.equal(result.upperHours, 15);
  assert.ok(
    result.tasks.every(
      (entry) =>
        entry.remainingRange.lowerHours === 1 &&
        entry.remainingRange.upperHours === 3,
    ),
  );
});

await test('titles, dependency chains, parallel count and PC memory do not alter serial human effort', () => {
  const tasks = [
    task('A', { title: 'Rocket launch physical test' }),
    task('B', { title: 'Simple writing', dependsOn: ['A'] }),
  ];
  const result = estimateGoalEffort({ tasks, maxParallel: 32, ramGiB: 1024 });
  assert.deepEqual(result.remainingRange, {
    lowerHours: 2,
    upperHours: 6,
    unestimatedCount: 0,
  });
  assert.deepEqual(
    result.remainingRange,
    estimateGoalEffort({ tasks, maxParallel: 1, ramGiB: 8 }).remainingRange,
  );
  assert.equal(result.unit, '人時');
  assert.match(result.warning, /AI稼働時間・経過時間・納期・価格ではなく/);
});

await test('input rejects unsafe shapes, duplicate counting and unknown references', () => {
  for (const goal of [
    null,
    {},
    { tasks: null },
    { tasks: [null] },
    { tasks: [task('A'), task('A')] },
    { tasks: [task('A', { workloadClass: NaN })] },
    { tasks: [task('A', { status: 'complete' })] },
    { tasks: [task('A', { scopeReviewRequired: 'false' })] },
    { tasks: [task('A', { dependsOn: ['missing'] })] },
    { tasks: [task('A', { childTaskIds: ['A'] })] },
    { tasks: [task('A', { dependsOn: null })] },
    { tasks: [task('A', { squadId: { toString: null } })] },
  ])
    assert.throws(() => estimateGoalEffort(goal));
});

await test('empty input has finite zero counts and computation does not mutate goal', () => {
  const empty = estimateGoalEffort({ tasks: [] });
  assert.deepEqual(empty.remainingRange, {
    lowerHours: 0,
    upperHours: 0,
    unestimatedCount: 0,
  });
  assert.deepEqual(empty.bySquad, []);
  assert.equal(empty.taskCount, 0);
  const goal = { tasks: [task('A')] };
  const original = JSON.stringify(goal);
  const result = estimateGoalEffort(goal);
  result.tasks[0].remainingRange.lowerHours = 100;
  assert.equal(JSON.stringify(goal), original);
  assert.equal(result.tasks[0].originalRange.lowerHours, 1);
});
