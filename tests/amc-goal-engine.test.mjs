import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendSquads,
  compileGoal,
  validateGoal,
  summarizeGoal,
  applyGoalEvent,
  renderGoalPrompt,
} from '../scripts/amc-goal-engine.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
  const tasks = [
    {
      id: 'X',
      title: 'Parent acceptance',
      status: 'planned',
      dependsOn: ['PRE'],
      evidence: [],
    },
    {
      id: 'X-1',
      parentTaskId: 'X',
      title: 'First part',
      status: 'planned',
      dependsOn: ['PRE'],
      evidence: [],
    },
    {
      id: 'X-2',
      parentTaskId: 'X',
      title: 'Second part',
      status: 'planned',
      dependsOn: ['X-1'],
      evidence: [],
    },
    {
      id: 'PRE',
      title: 'Existing prerequisite',
      status: 'done',
      dependsOn: [],
      evidence: ['docs/existing.md'],
    },
    {
      id: 'Y',
      title: 'Separate output',
      status: 'planned',
      dependsOn: [],
      evidence: [],
    },
  ];
  const mission = {
    updatedAt: '2026-09-27',
    globalRules: ['No automatic external writes'],
    executionHolds: [],
    squads: [
      {
        id: 'H1',
        name: 'Integration',
        goal: 'Integrate reviewed work',
        rules: ['Keep original boundaries'],
        acceptanceGate: 'Review all conditions',
        nextTaskIds: ['X'],
      },
      {
        id: 'O2',
        name: 'Data',
        goal: 'Separate data',
        rules: ['Separate owners'],
        acceptanceGate: 'Data tests',
        nextTaskIds: ['Y'],
      },
    ],
    taskAssignments: tasks.map((task) => ({
      taskId: task.id,
      primarySquad: task.id.startsWith('X') ? 'H1' : 'O2',
      classification: task.id === 'PRE' ? 'historical' : 'coordination',
    })),
    taskPlans: tasks.map((task) => ({
      taskId: task.id,
      ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
      scope: task.title,
      workloadClass: 'document',
      executionBoundary: 'Documents only; no physical acceptance',
      inputs: [{ path: 'docs/source.md', locator: 'requirements' }],
      steps: [
        {
          id: `${task.id}-S1`,
          action: 'Review inputs and write expected result',
        },
      ],
      deliverables: [
        { path: `docs/${task.id}.md`, description: 'Reviewed output' },
      ],
      acceptanceCriteria: [
        {
          id: `${task.id}-AC1`,
          criterion: 'Source and expected result agree',
          verification: 'Independent comparison',
          status: task.id === 'PRE' ? 'passed' : 'not_verified',
          evidence: task.id === 'PRE' ? ['docs/old-review.md'] : [],
        },
      ],
    })),
  };
  return {
    instruction: 'Review integration requirements',
    squadIds: ['H1', 'O2'],
    mission,
    project: { updatedAt: '2026-09-27', tasks },
    goalId: 'test-goal',
    maxParallel: 2,
  };
}

function event(goal, type, payload = {}) {
  return {
    id: `${type}-${goal.revision}`,
    type,
    expectedRevision: goal.revision,
    actor: 'owner',
    ...payload,
  };
}
function apply(goal, type, payload = {}) {
  return applyGoalEvent(goal, event(goal, type, payload));
}
function approve(goal, extra = {}) {
  return apply(goal, 'approve_plan', {
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement:
      'The selected candidate backlog covers this explicitly reviewed document scope only.',
    acceptanceCriteria: [
      {
        id: 'GOAL-AC1',
        criterion:
          'All requested document requirements are independently accepted',
      },
    ],
    ...extra,
  });
}
function finish(goal, taskId, actor = 'worker') {
  let next = apply(goal, 'start_task', { actor, taskId });
  const task = next.tasks.find((item) => item.id === taskId);
  next = apply(next, 'submit_result', {
    actor,
    taskId,
    outcome: 'succeeded',
    deliverables: task.deliverables.map((item) => `${item.path}#review`),
    evidence: ['docs/run-evidence.md'],
    summary: 'Complete within approved scope',
  });
  return apply(next, 'verify_task', {
    actor: 'independent-reviewer',
    role: 'reviewer',
    taskId,
    accepted: true,
    evidence: ['docs/review.md'],
    criterionResults: task.acceptanceCriteria.map((item) => ({
      criterionId: item.id,
      passed: true,
      evidence: ['docs/review.md'],
    })),
  });
}

await test('keyword routing is only a suggestion; unknown scope is not silently assigned', () => {
  const input = fixture();
  assert.deepEqual(recommendSquads('unrelated sandwich', input.mission), []);
  assert.deepEqual(recommendSquads('AMC O2', input.mission), ['H1', 'O2']);
  assert.throws(
    () => compileGoal({ ...input, squadIds: [] }),
    /Explicit squad/,
  );
  assert.throws(
    () => compileGoal({ ...input, squadIds: ['UNKNOWN'] }),
    /Unknown squad/,
  );
});

await test('compile retains parent criteria, descendants and prerequisites without counting duplicate selections', () => {
  const input = fixture();
  const goal = compileGoal({ ...input, squadIds: ['H1', 'O2', 'H1'] });
  assert.equal(validateGoal(goal).ok, true);
  assert.equal(goal.reviewRequired, true);
  assert.equal(goal.state, 'draft');
  assert.equal(goal.tasks.length, 5);
  assert.deepEqual(goal.tasks.find((task) => task.id === 'X').dependsOn, [
    'PRE',
    'X-1',
    'X-2',
  ]);
  assert.ok(
    goal.tasks.find((task) => task.id === 'X-2').dependsOn.includes('PRE'),
  );
  const sourceDone = goal.tasks.find((task) => task.id === 'PRE');
  assert.equal(sourceDone.sourceStatus, 'done');
  assert.equal(sourceDone.status, 'pending');
  assert.equal(sourceDone.executionMode, 'review_existing_evidence');
  assert.equal(sourceDone.acceptanceCriteria[0].status, 'not_verified');
  assert.deepEqual(sourceDone.sourceEvidence, ['docs/existing.md']);
  assert.equal(summarizeGoal(goal).leafTotal, 4);
  assert.equal(summarizeGoal(goal).completed, 0);
  assert.deepEqual(summarizeGoal(goal).readyTaskIds, []);
});

await test('compile rejects dependency cycles, missing tasks, inconsistent parents and duplicate source assignment', () => {
  for (const mutate of [
    (input) => {
      input.project.tasks[3].dependsOn = ['X'];
    },
    (input) => {
      input.project.tasks[3].dependsOn = ['PRE'];
    },
    (input) => {
      input.project.tasks[0].dependsOn = ['missing'];
    },
    (input) => {
      input.mission.taskPlans[1].parentTaskId = 'Y';
    },
    (input) => {
      input.mission.taskAssignments.push(input.mission.taskAssignments[0]);
    },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => compileGoal(input));
  }
});

await test('arbitrary instruction remains unreviewed until explicit coverage and overall criteria approval', () => {
  const goal = compileGoal({
    ...fixture(),
    instruction: 'Make an unrelated physical product perfect',
  });
  assert.throws(
    () => apply(goal, 'start_task', { actor: 'worker', taskId: 'PRE' }),
    /Approved active/,
  );
  assert.throws(() => approve(goal, { coverageStatement: '' }), /coverage/);
  assert.throws(
    () => approve(goal, { acceptanceCriteria: [] }),
    /acceptanceCriteria/,
  );
  assert.throws(() => approve(goal, { role: 'worker' }), /Owner/);
  assert.equal(goal.state, 'draft');
});

await test('legacy tasks with unknown scope require an explicit plan review and never precomplete', () => {
  const input = fixture();
  input.mission.taskPlans = input.mission.taskPlans.filter(
    (plan) => plan.taskId !== 'PRE',
  );
  const goal = compileGoal(input);
  assert.throws(() => approve(goal), /Task scope review required: PRE/);
  const approved = approve(goal, {
    taskPlanReviews: [
      {
        taskId: 'PRE',
        acceptanceCriteria: [
          {
            id: 'PRE-REUSE',
            criterion:
              'Verify existing scope and evidence match the prerequisite',
          },
        ],
        deliverables: [
          {
            path: 'docs/prerequisite-review.md',
            description: 'Evidence reuse decision',
          },
        ],
      },
    ],
  });
  assert.equal(
    approved.tasks.find((task) => task.id === 'PRE').status,
    'pending',
  );
  assert.equal(
    approved.tasks.find((task) => task.id === 'PRE').executionEligibility,
    'review_only',
  );
});

await test('schedule requires dependencies, complete parent acceptance and explicit overall acceptance', () => {
  let goal = approve(compileGoal(fixture()));
  assert.deepEqual(summarizeGoal(goal).readyTaskIds, ['PRE', 'Y']);
  assert.throws(
    () => apply(goal, 'start_task', { actor: 'worker', taskId: 'X' }),
    /not schedulable/,
  );
  goal = finish(goal, 'PRE');
  goal = finish(goal, 'X-1');
  goal = finish(goal, 'X-2');
  assert.equal(goal.tasks.find((task) => task.id === 'X').status, 'pending');
  goal = finish(goal, 'X');
  goal = finish(goal, 'Y');
  assert.equal(summarizeGoal(goal).completed, 5);
  assert.equal(goal.state, 'active');
  assert.throws(
    () =>
      apply(goal, 'accept_goal', {
        role: 'owner',
        accepted: true,
        evidence: [],
      }),
    /evidence/,
  );
  goal = apply(goal, 'accept_goal', {
    role: 'owner',
    accepted: true,
    evidence: ['docs/whole-goal-review.md'],
    criterionResults: [
      {
        criterionId: 'GOAL-AC1',
        passed: true,
        evidence: ['docs/whole-goal-review.md'],
      },
    ],
  });
  assert.equal(goal.state, 'accepted');
  assert.equal(validateGoal(goal).ok, true);
  assert.throws(
    () => apply(goal, 'pause', { reason: 'extra task' }),
    /immutable/,
  );
});

await test('successful result needs planned outputs and evidence; worker cannot self-accept', () => {
  let goal = apply(approve(compileGoal(fixture())), 'start_task', {
    actor: 'worker',
    taskId: 'PRE',
  });
  const result = {
    actor: 'worker',
    taskId: 'PRE',
    outcome: 'succeeded',
    deliverables: ['docs/PRE.md'],
    evidence: ['docs/run.md'],
    summary: 'Reviewed existing evidence',
  };
  assert.throws(
    () => apply(goal, 'submit_result', { ...result, evidence: [] }),
    /evidence/,
  );
  assert.throws(
    () =>
      apply(goal, 'submit_result', {
        ...result,
        deliverables: ['docs/wrong.md'],
      }),
    /planned deliverables/,
  );
  assert.throws(
    () => apply(goal, 'submit_result', { ...result, actor: 'other-worker' }),
    /recorded worker/,
  );
  goal = apply(goal, 'submit_result', result);
  const review = {
    actor: 'reviewer',
    role: 'reviewer',
    taskId: 'PRE',
    accepted: true,
    evidence: ['docs/check.md'],
    criterionResults: [
      { criterionId: 'PRE-AC1', passed: true, evidence: ['docs/check.md'] },
    ],
  };
  assert.throws(
    () => apply(goal, 'verify_task', { ...review, actor: 'worker' }),
    /Independent/,
  );
  assert.throws(
    () => apply(goal, 'verify_task', { ...review, criterionResults: [] }),
    /Every criterion/,
  );
  assert.throws(
    () =>
      apply(goal, 'verify_task', {
        ...review,
        criterionResults: [
          {
            criterionId: 'PRE-AC1',
            passed: false,
            evidence: ['docs/check.md'],
          },
        ],
      }),
    /failed criterion/,
  );
  assert.equal(
    goal.tasks.find((task) => task.id === 'PRE').status,
    'submitted',
  );
});

await test('event retries are idempotent, conflicting IDs/stale revisions fail and inputs remain unchanged', () => {
  const goal = compileGoal(fixture());
  const original = clone(goal);
  const approval = event(goal, 'approve_plan', {
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement: 'Reviewed the scope',
    acceptanceCriteria: [{ id: 'G1', criterion: 'All work meets user scope' }],
  });
  const next = applyGoalEvent(goal, approval);
  assert.deepEqual(goal, original);
  assert.deepEqual(applyGoalEvent(next, approval), next);
  assert.throws(
    () => applyGoalEvent(next, { ...approval, coverageStatement: 'different' }),
    /Idempotency/,
  );
  assert.throws(
    () =>
      applyGoalEvent(next, {
        ...event(next, 'start_task', { actor: 'worker', taskId: 'PRE' }),
        expectedRevision: 0,
      }),
    /Revision conflict/,
  );
});

await test('shared file locks survive submitted results and pause; running tasks cannot be hidden as blocked', () => {
  const input = fixture();
  input.mission.taskPlans.find(
    (plan) => plan.taskId === 'Y',
  ).deliverables[0].path = 'docs/./PRE.md#another-section';
  let goal = approve(compileGoal(input));
  assert.deepEqual(summarizeGoal(goal).readyTaskIds, ['PRE']);
  goal = apply(goal, 'start_task', { actor: 'worker', taskId: 'PRE' });
  assert.throws(
    () => apply(goal, 'block_task', { taskId: 'PRE', reason: 'wait' }),
    /retain/,
  );
  goal = apply(goal, 'pause', { reason: 'Wait for running result' });
  assert.equal(goal.tasks.find((task) => task.id === 'PRE').status, 'running');
  assert.deepEqual(summarizeGoal(goal).readyTaskIds, []);
  goal = apply(goal, 'submit_result', {
    actor: 'worker',
    taskId: 'PRE',
    outcome: 'succeeded',
    deliverables: ['docs/PRE.md#evidence'],
    evidence: ['docs/result.md'],
    summary: 'Finished before pause',
  });
  goal = apply(goal, 'resume');
  assert.throws(
    () => apply(goal, 'start_task', { actor: 'other', taskId: 'Y' }),
    /not schedulable/,
  );
});

await test('parallel schedule never exceeds explicitly configured worker limit', () => {
  let goal = approve(compileGoal({ ...fixture(), maxParallel: 1 }));
  assert.equal(summarizeGoal(goal).readyTaskIds.length, 1);
  goal = apply(goal, 'start_task', { actor: 'worker', taskId: 'PRE' });
  assert.equal(summarizeGoal(goal).availableSlots, 0);
  assert.throws(
    () => apply(goal, 'start_task', { actor: 'worker2', taskId: 'Y' }),
    /not schedulable/,
  );
});

await test('holds inherit to children and cannot be removed through resume or plan approval', () => {
  const input = fixture();
  input.mission.executionHolds = [
    {
      id: 'fee-hold',
      taskIds: ['X'],
      scope: 'Fee execution',
      reason: 'Owner decision pending',
      releaseCondition: 'New contract and acceptance',
      decisionOwner: 'OWNER',
      source: 'docs/product-baseline.md',
    },
  ];
  let goal = approve(compileGoal(input));
  assert.equal(
    goal.tasks.find((task) => task.id === 'X-1').holds[0].id,
    'fee-hold',
  );
  goal = finish(goal, 'PRE');
  assert.throws(
    () => apply(goal, 'start_task', { actor: 'worker', taskId: 'X-1' }),
    /not schedulable/,
  );
  goal = apply(goal, 'block_task', { taskId: 'X-1', reason: 'Held' });
  assert.throws(
    () =>
      apply(goal, 'resume_task', {
        taskId: 'X-1',
        role: 'owner',
        reason: 'Resume',
        evidence: ['docs/decision.md'],
      }),
    /hold cannot be cleared/,
  );
});

await test('physical/external/build/unclassified leaf execution stays authority-gated in v1', () => {
  for (const workloadClass of [
    'physical',
    'external',
    'build',
    'unclassified',
  ]) {
    const input = fixture();
    input.mission.taskPlans.find((plan) => plan.taskId === 'Y').workloadClass =
      workloadClass;
    const goal = approve(compileGoal(input));
    assert.ok(summarizeGoal(goal).authorityRequiredTaskIds.includes('Y'));
    assert.throws(
      () => apply(goal, 'start_task', { actor: 'worker', taskId: 'Y' }),
      /not schedulable/,
    );
  }
});

await test('failed results may have no artifact, but need evidence; retry retains the failed attempt', () => {
  let goal = apply(approve(compileGoal(fixture())), 'start_task', {
    actor: 'worker',
    taskId: 'PRE',
  });
  goal = apply(goal, 'submit_result', {
    actor: 'worker',
    taskId: 'PRE',
    outcome: 'failed',
    deliverables: [],
    evidence: ['docs/error.md'],
    summary: 'Existing source did not match',
  });
  assert.equal(goal.tasks.find((task) => task.id === 'PRE').status, 'failed');
  assert.equal(goal.eventLog.at(-1).taskId, 'PRE');
  assert.equal(goal.eventLog.at(-1).outcome, 'failed');
  assert.throws(
    () =>
      apply(goal, 'resume_task', {
        taskId: 'PRE',
        role: 'owner',
        reason: 'retry',
        evidence: [],
      }),
    /evidence/,
  );
  goal = apply(goal, 'resume_task', {
    taskId: 'PRE',
    role: 'owner',
    reason: 'Inputs corrected',
    evidence: ['docs/correction.md'],
  });
  assert.equal(
    goal.tasks.find((task) => task.id === 'PRE').attempts[0].result.outcome,
    'failed',
  );
  assert.equal(goal.tasks.find((task) => task.id === 'PRE').status, 'pending');
  assert.equal(
    goal.tasks.find((task) => task.id === 'PRE').acceptanceCriteria[0].status,
    'not_verified',
  );
});

await test('rejected independent review is a failure, not completion', () => {
  let goal = apply(approve(compileGoal(fixture())), 'start_task', {
    actor: 'worker',
    taskId: 'PRE',
  });
  goal = apply(goal, 'submit_result', {
    actor: 'worker',
    taskId: 'PRE',
    outcome: 'succeeded',
    deliverables: ['docs/PRE.md'],
    evidence: ['docs/result.md'],
    summary: 'Candidate evidence',
  });
  goal = apply(goal, 'verify_task', {
    actor: 'reviewer',
    role: 'reviewer',
    taskId: 'PRE',
    accepted: false,
    evidence: ['docs/rejected.md'],
    criterionResults: [
      { criterionId: 'PRE-AC1', passed: false, evidence: ['docs/rejected.md'] },
    ],
  });
  assert.equal(goal.tasks.find((task) => task.id === 'PRE').status, 'failed');
  assert.equal(summarizeGoal(goal).completed, 0);
});

await test('malformed imports return validation errors before render/scheduler can be called', () => {
  const goal = compileGoal(fixture());
  for (const mutate of [
    (g) => {
      delete g.tasks[0].childTaskIds;
    },
    (g) => {
      delete g.holds;
    },
    (g) => {
      delete g.overallAcceptance;
    },
    (g) => {
      delete g.tasks[0].sourceEvidence;
    },
    (g) => {
      g.tasks[0] = null;
    },
    (g) => {
      g.tasks[0].parentTaskId = g.tasks[0].id;
    },
    (g) => {
      g.tasks[0].dependsOn = {};
    },
    (g) => {
      g.tasks[0].acceptanceCriteria = null;
    },
    (g) => {
      delete g.sourceSnapshot.taskSpecs;
    },
    (g) => {
      g.sourceSnapshot.taskSpecs[0].acceptanceCriteria[0] = null;
    },
    (g) => {
      g.squads[0].rules = null;
    },
  ]) {
    const bad = clone(goal);
    mutate(bad);
    assert.doesNotThrow(() => validateGoal(bad));
    assert.equal(validateGoal(bad).ok, false);
  }
});

await test('import cannot bypass inherited dependencies, source evidence, parent criteria or holds', () => {
  const input = fixture();
  input.mission.executionHolds = [
    {
      id: 'hold',
      taskIds: ['X'],
      scope: 'External action',
      reason: 'Pending decision',
      releaseCondition: 'Owner decision',
      decisionOwner: 'OWNER',
    },
  ];
  const goal = compileGoal(input);
  for (const mutate of [
    (g) => {
      g.tasks.find((task) => task.id === 'X').childTaskIds = [];
    },
    (g) => {
      g.tasks.find((task) => task.id === 'X-2').dependsOn = ['X-1'];
    },
    (g) => {
      g.tasks.find((task) => task.id === 'X-1').parentTaskId = null;
    },
    (g) => {
      g.tasks.find((task) => task.id === 'PRE').sourceEvidence = [];
    },
    (g) => {
      g.tasks.find((task) => task.id === 'X').acceptanceCriteria[0].criterion =
        'Just say done';
    },
    (g) => {
      g.holds = [];
    },
    (g) => {
      g.tasks.find((task) => task.id === 'X-1').holds = [];
    },
    (g) => {
      g.tasks.find((task) => task.id === 'Y').executionEligibility =
        'review_only';
    },
  ]) {
    const bad = clone(goal);
    mutate(bad);
    assert.equal(validateGoal(bad).ok, false);
  }
});

await test('output paths reject absolute/URL/traversal/control paths and permit section references', () => {
  for (const path of [
    '/tmp/out.md',
    'https://example.com/out',
    'C:\\out.md',
    '../out.md',
    'docs/../out.md',
    'docs/\0bad.md',
    '#section',
  ]) {
    const input = fixture();
    input.mission.taskPlans[0].deliverables[0].path = path;
    assert.throws(() => compileGoal(input), /path|scope/i);
  }
});

await test('prompt includes boundaries, evidence reuse, criteria, locks, hashes and resume rules', () => {
  const goal = compileGoal({
    ...fixture(),
    sourceFiles: [
      { path: 'data/mission-control.json', sha256: 'a'.repeat(64) },
    ],
  });
  const prompt = renderGoalPrompt(goal, { squadId: 'O2' });
  for (const expected of [
    '再実装ではなく',
    'PRE-AC1',
    '排他編集path',
    'SHA-256=',
    'expectedRevision',
    '未承認',
    'accept_goal',
  ])
    assert.ok(prompt.includes(expected), expected);
  assert.ok(!prompt.includes('### X-1:'));
  assert.throws(
    () => renderGoalPrompt(goal, { squadId: 'unknown' }),
    /Unknown squad/,
  );
});

await test('import rejects nonprimitive optional prompt fields and timestamps without renderer crashes', () => {
  const goal = approve(compileGoal(fixture()));
  for (const mutate of [
    (g) => {
      g.squads[0].acceptanceGate = { toString: null };
    },
    (g) => {
      g.tasks[0].inputs[0].locator = { toString: null };
    },
    (g) => {
      g.tasks[0].inputs[0].section = {};
    },
    (g) => {
      g.tasks[0].deliverables[0].section = {};
    },
    (g) => {
      g.tasks[0].acceptanceCriteria[0].verification = { toString: null };
    },
    (g) => {
      g.createdAt = {};
    },
    (g) => {
      g.approval.at = {};
    },
    (g) => {
      g.eventLog[0].at = {};
    },
    (g) => {
      g.tasks[0].id = { toString: null };
    },
  ]) {
    const bad = clone(goal);
    mutate(bad);
    assert.doesNotThrow(() => validateGoal(bad));
    assert.equal(validateGoal(bad).ok, false);
  }
  assert.throws(
    () => apply(goal, 'pause', { reason: 'Wait', at: {} }),
    /primitive/,
  );
});

await test('imported successful results retain the worker identity, summary and every planned output', () => {
  let goal = apply(approve(compileGoal(fixture())), 'start_task', {
    actor: 'worker',
    taskId: 'PRE',
  });
  goal = apply(goal, 'submit_result', {
    actor: 'worker',
    taskId: 'PRE',
    outcome: 'succeeded',
    deliverables: ['docs/PRE.md#accepted-section'],
    evidence: ['docs/result.md'],
    summary: 'Scope evidence reviewed',
  });
  assert.equal(validateGoal(goal).ok, true);
  for (const mutate of [
    (result) => {
      result.deliverables = ['docs/anotherpath.md'];
    },
    (result) => {
      result.deliverables = ['https://example.com/out.md'];
    },
    (result) => {
      result.submittedBy = 'different-worker';
    },
    (result) => {
      result.summary = '';
    },
    (result) => {
      result.summary = { toString: null };
    },
    (result) => {
      result.at = {};
    },
  ]) {
    const bad = clone(goal);
    mutate(bad.tasks.find((task) => task.id === 'PRE').result);
    assert.doesNotThrow(() => validateGoal(bad));
    assert.equal(validateGoal(bad).ok, false);
  }
});
