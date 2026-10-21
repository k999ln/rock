import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRequestPlan,
  requestPlanSupport,
} from '../scripts/amc-request-plan.mjs';
import {
  compileGoal,
  applyGoalEvent,
  validateGoal,
  summarizeGoal,
  renderGoalPrompt,
} from '../scripts/amc-goal-engine.mjs';
import { estimateGoalEffort } from '../scripts/amc-effort.mjs';

const input = {
  request: 'AMCを指示だけで部隊が動くツールにしたい',
  goal: 'AMCを迷わず使えるツールにする',
  intent: '意図しない課題を増やさず、初めてでも使えるようにしたい',
  planId: 'request-test',
  createdAt: '2026-09-27T00:00:00Z',
};
function compile() {
  const definition = buildRequestPlan(input);
  const goal = compileGoal({
    ...definition,
    instruction: definition.brief.goal,
    squadIds: definition.mission.squads.map((squad) => squad.id),
    goalId: input.planId,
    createdAt: input.createdAt,
  });
  goal.requestBrief = definition.brief;
  return { definition, goal };
}

await test('software request template keeps original intent and creates scoped roles without canonical task imports', () => {
  const before = JSON.stringify(input);
  const { definition, goal } = compile();
  assert.equal(JSON.stringify(input), before);
  assert.equal(goal.tasks.length, 7);
  assert.equal(goal.squads.length, 4);
  assert.equal(goal.state, 'draft');
  assert.equal(goal.requestBrief.request, input.request);
  assert.equal(goal.requestBrief.goal, input.goal);
  assert.equal(goal.requestBrief.intent, input.intent);
  assert.equal(goal.sourceFiles.length, 0);
  assert.equal(
    goal.tasks.some((task) => task.id === 'AMC01'),
    false,
  );
  assert.ok(
    goal.tasks.every(
      (task) => task.status === 'pending' && !task.scopeReviewRequired,
    ),
  );
  assert.ok(goal.tasks.every((task) => task.scope.includes(input.intent)));
  assert.ok(
    goal.tasks.every((task) =>
      task.deliverables.every((out) =>
        out.path.startsWith('amc-work/request-test/'),
      ),
    ),
  );
  assert.match(definition.coverage, /公開・外部送信・課金/);
  assert.match(definition.coverage, /重要な不足は本人へ確認/);
  assert.ok(validateGoal(goal).ok);
});

await test('template confirmation authorizes preparation only and never records work as started', () => {
  const { definition, goal } = compile();
  const approved = applyGoalEvent(goal, {
    id: 'approve',
    type: 'approve_plan',
    expectedRevision: 0,
    actor: 'local-owner',
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement: definition.coverage,
    acceptanceCriteria: definition.acceptanceCriteria,
  });
  const summary = summarizeGoal(approved);
  assert.equal(approved.state, 'active');
  assert.equal(approved.eventLog.length, 1);
  assert.ok(approved.tasks.every((task) => task.status === 'pending'));
  assert.equal(summary.leafCompleted, 0);
  assert.deepEqual(summary.readyTaskIds, ['REQ-01']);
  assert.equal(approved.maxParallel, 1);
  const prompt = renderGoalPrompt(approved);
  assert.match(prompt, /元の依頼（作業範囲の基準）/);
  assert.ok(prompt.includes(input.request) && prompt.includes(input.intent));
  assert.match(prompt, /報告書pathのlockだけでコードの排他管理を代用しない/);
});

await test('initial effort is the same provisional coefficients, not an invented scale-sensitive estimate', () => {
  const { goal } = compile();
  const effort = estimateGoalEffort(goal);
  assert.equal(effort.lowerHours, 9);
  assert.equal(effort.upperHours, 27);
  assert.equal(effort.unestimatedCount, 0);
  const huge = buildRequestPlan({ ...input, goal: '巨大なAMCアプリを作る' });
  const other = compileGoal({
    ...huge,
    instruction: huge.brief.goal,
    squadIds: huge.mission.squads.map((squad) => squad.id),
  });
  assert.equal(estimateGoalEffort(other).upperHours, 27);
  assert.match(effort.warning, /仮|実測|納期/);
});

await test('unsupported, empty, excessive and unsafe inputs fail before plan creation', () => {
  for (const value of [
    '',
    null,
    {},
    'ロケットを製造したい',
    'パンを焼きたい',
    'アプリ' + 'a'.repeat(8000),
  ])
    assert.ok(requestPlanSupport(value));
  for (const value of [
    'AMCを作りたい',
    'メモアプリを作りたい',
    'Webサイトを作る',
  ])
    assert.equal(requestPlanSupport(value), null);
  for (const patch of [
    { intent: '' },
    { intent: {} },
    { intent: 'a'.repeat(2001) },
    { planId: '../escape' },
    { planId: '/tmp/escape' },
    { goal: '' },
    { goal: {} },
  ])
    assert.throws(() => buildRequestPlan({ ...input, ...patch }));
  assert.equal(
    buildRequestPlan({ ...input, goal: '指示すると担当と次の行動がわかる' })
      .brief.goal,
    '指示すると担当と次の行動がわかる',
  );
});

await test('request brief round trips in the existing schema and malformed metadata is rejected', () => {
  const { goal } = compile();
  assert.ok(validateGoal(JSON.parse(JSON.stringify(goal))).ok);
  for (const patch of [
    null,
    {},
    { ...goal.requestBrief, intent: {} },
    { ...goal.requestBrief, goal: 'another app' },
    { ...goal.requestBrief, request: 'a'.repeat(8001) },
    { ...goal.requestBrief, intent: 'a'.repeat(2001) },
  ])
    assert.equal(validateGoal({ ...goal, requestBrief: patch }).ok, false);
  const legacy = structuredClone(goal);
  delete legacy.requestBrief;
  assert.ok(validateGoal(legacy).ok);
});

await test('bot requests accept everyday spelling without changing the original request or execution authority', () => {
  for (const request of [
    'jevで仮想通貨のbot作成して',
    'Jevで仮想通貨のBOT作成して',
    'ｊｅｖで仮想通貨のｂｏｔ作成して',
    '仮想通貨のボットを作りたい',
    '通知するﾎﾞｯﾄを作りたい',
    'Build a chatbot',
    'Pythonプログラムを作って',
    'レポートを自動化したい',
  ]) {
    assert.equal(requestPlanSupport(request), null, request);
    const definition = buildRequestPlan({ ...input, request, goal: request });
    assert.equal(definition.brief.request, request);
    assert.equal(definition.brief.goal, request);
    assert.match(definition.coverage, /実売買・送金を含む/);
    const goal = compileGoal({
      ...definition,
      instruction: request,
      squadIds: definition.mission.squads.map((squad) => squad.id),
    });
    assert.equal(goal.state, 'draft');
    assert.ok(goal.tasks.every((task) => task.status === 'pending'));
    assert.equal(goal.eventLog.length, 0);
  }
  for (const request of [
    '買い物かごのbottleを製造する',
    'robotの筐体を製造する',
    'ロボットを製造したい',
    'ﾛﾎﾞｯﾄを製造したい',
  ])
    assert.ok(requestPlanSupport(request), request);
});
