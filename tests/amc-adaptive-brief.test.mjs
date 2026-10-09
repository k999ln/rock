import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyGoalEvent,
  compileGoal,
  renderGoalPrompt,
  validateGoal,
} from '../scripts/amc-goal-engine.mjs';

function fixture() {
  const goal = compileGoal({
    instruction: '既存コードを読み、Skyの接続表示を改善する',
    goalId: 'adaptive-fixture',
    squadIds: ['O4'],
    mission: {
      squads: [
        {
          id: 'O4',
          name: 'Sky',
          goal: '接続の改善',
          rules: [],
          acceptanceGate: '実物を照合',
          nextTaskIds: ['PLAN-1'],
        },
      ],
      globalRules: ['既存の実行保留を維持する'],
      taskAssignments: [{ taskId: 'PLAN-1', primarySquad: 'O4' }],
      taskPlans: [
        {
          taskId: 'PLAN-1',
          scope: '接続表示の改善',
          workloadClass: 'code_test',
          inputs: [],
          steps: [{ id: 'STEP-1', action: '接続状態と画面を照合する' }],
          deliverables: [
            { path: 'components/sky-example.tsx', description: '表示と試験' },
          ],
          acceptanceCriteria: [
            {
              id: 'AC-1',
              criterion: '実際の状態を表示する',
              verification: '試験結果を照合する',
            },
          ],
        },
      ],
      executionHolds: [],
    },
    project: {
      tasks: [
        {
          id: 'PLAN-1',
          title: '接続表示',
          status: 'planned',
          dependsOn: [],
          evidence: [],
        },
      ],
    },
  });
  goal.adaptiveBrief = {
    schema: 'amc-adaptive-brief/1',
    request: goal.instruction,
    intent: '接続に失敗した理由を把握できる',
    feedback: '表示変更に絞る',
    planningMethod: 'codex_read_only',
    proposalSummary: '既存の接続契約を再利用し表示と試験を変更する',
    questions: [],
    assumptions: ['今回の提案は開発用'],
    botId: 'sky',
    context: {
      mainSha: 'a'.repeat(40),
      localHead: 'b'.repeat(40),
      collectedAt: '2026-10-09T00:00:00Z',
    },
    previousGoal: { id: 'previous-plan', revision: 1 },
    taskSources: [{ taskId: 'PLAN-1', sourceTaskIds: ['SKY07-01'] }],
  };
  return goal;
}

await test('adaptive planning brief preserves intent and source references without granting approval', () => {
  const goal = fixture();
  assert.deepEqual(validateGoal(goal), { ok: true, errors: [] });
  assert.equal(goal.state, 'draft');
  assert.equal(goal.approval, null);
  assert.deepEqual(goal.eventLog, []);
  const prompt = renderGoalPrompt(goal);
  for (const text of [
    goal.adaptiveBrief.intent,
    goal.adaptiveBrief.proposalSummary,
    'previous-plan',
    'SKY07-01',
    'main ' + 'a'.repeat(40),
  ])
    assert.ok(prompt.includes(text));
  assert.throws(
    () =>
      applyGoalEvent(goal, {
        id: 'not-approved',
        type: 'start_task',
        taskId: 'PLAN-1',
        actor: 'worker',
        expectedRevision: 0,
      }),
    /Approved active plan/,
  );
});

await test('malformed or authority-bearing adaptive metadata cannot be imported as a valid Goal', () => {
  for (const mutate of [
    (g) => {
      g.adaptiveBrief = null;
    },
    (g) => {
      g.adaptiveBrief.approved = true;
    },
    (g) => {
      g.adaptiveBrief.request = '別の指示';
    },
    (g) => {
      g.adaptiveBrief.planningMethod = 'execution_completed';
    },
    (g) => {
      g.adaptiveBrief.intent = 'x'.repeat(2001);
    },
    (g) => {
      g.adaptiveBrief.feedback = 'x'.repeat(8001);
    },
    (g) => {
      g.adaptiveBrief.questions = [null];
    },
    (g) => {
      g.adaptiveBrief.assumptions = Array(25).fill('too many');
    },
    (g) => {
      g.adaptiveBrief.context.mainSha = 'unverified';
    },
    (g) => {
      g.adaptiveBrief.context.accepted = true;
    },
    (g) => {
      g.adaptiveBrief.previousGoal.id = g.id;
    },
    (g) => {
      g.adaptiveBrief.previousGoal.revision = -1;
    },
    (g) => {
      g.adaptiveBrief.taskSources = [];
    },
    (g) => {
      g.adaptiveBrief.taskSources[0].taskId = 'UNKNOWN';
    },
    (g) => {
      g.adaptiveBrief.taskSources[0].sourceTaskIds.push('SKY07-01');
    },
    (g) => {
      g.requestBrief = {
        schema: 'amc-request-brief/1',
        templateId: 'software-local-prototype-v1',
        request: g.instruction,
        goal: g.instruction,
        intent: '別の入口',
      };
    },
  ]) {
    const goal = fixture();
    mutate(goal);
    const checked = validateGoal(goal);
    assert.equal(checked.ok, false);
    assert.ok(checked.errors.includes('Invalid adaptive planning brief'));
  }
});

await test('normal owner plan approval preserves adaptive provenance and does not accept any task', () => {
  const goal = fixture();
  const next = applyGoalEvent(goal, {
    id: 'approve-fixture',
    type: 'approve_plan',
    expectedRevision: 0,
    actor: 'fixture-owner',
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement: 'この表示改善の提案を確認した',
    acceptanceCriteria: [
      { id: 'GOAL-AC', criterion: '表示と実状態が一致する' },
    ],
  });
  assert.deepEqual(next.adaptiveBrief, goal.adaptiveBrief);
  assert.equal(next.state, 'active');
  assert.ok(next.tasks.every((task) => task.status === 'pending'));
  assert.equal(goal.state, 'draft');
  assert.deepEqual(validateGoal(next), { ok: true, errors: [] });
});
