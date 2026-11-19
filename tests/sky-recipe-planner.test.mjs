import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  RecipePlannerError,
  RECIPE_MAX_SEARCH_STATES,
  RECIPE_MAX_STEPS,
  acceptanceEstimate,
  chooseRecipe,
  ownerSteps,
  planRecipes,
} from '../lib/sky-recipe-planner.ts';

const capability = (id, consumes, produces, extra = {}) => ({
  id, name: id, kind: 'tool', consumes, produces, available: true,
  costMinor: 0, ownerMinutes: 0, waitMinutes: 1,
  setupMinor: 0, setupOwnerMinutes: 0, installed: true, ...extra,
});
const goal = (extra = {}) => ({
  have: ['request'], want: 'delivery', budgetMinor: 10_000,
  ownerMinuteValueMinor: 50, expectedRepeats: 1, keepForSelf: [], ...extra,
});
// 商品説明の更新: 下書き → 検査 → 納品。下書きは自動と手作業の2通り。
const shop = [
  capability('draft-ai', ['request'], 'draft', { costMinor: 30 }),
  capability('draft-by-hand', ['request'], 'draft', { kind: 'owner', ownerMinutes: 40 }),
  capability('check', ['draft'], 'checked', { costMinor: 5 }),
  capability('deliver', ['checked'], 'delivery'),
];

void test('a goal is planned as a whole pipeline, not as one tool', () => {
  const plan = planRecipes(goal(), shop);
  assert.equal(plan.gap, null);
  assert.deepEqual(plan.candidates[0].steps.map((step) => step.capabilityId), ['draft-ai', 'check', 'deliver']);
  assert.equal(plan.candidates.length, 2);
  // 手作業40分 × 50 = 2000 は、実費35より高い。
  assert.ok(plan.candidates[0].expectedMinor < plan.candidates[1].expectedMinor);
  assert.deepEqual(ownerSteps(plan.candidates[0]), []);
});

void test('a cheap step that fails acceptance loses to a dearer step that passes', () => {
  const tools = [
    capability('cheap', ['request'], 'delivery', { costMinor: 10 }),
    capability('solid', ['request'], 'delivery', { costMinor: 40 }),
  ];
  const plan = planRecipes(goal(), tools, [
    { capabilityId: 'cheap', runs: 20, accepted: 2 },
    { capabilityId: 'solid', runs: 20, accepted: 19 },
  ]);
  assert.equal(plan.candidates[0].key, 'solid');
  assert.equal(acceptanceEstimate(undefined).mean, 0.5);
  assert.throws(() => acceptanceEstimate({ capabilityId: 'x', runs: 1, accepted: 2 }), RecipePlannerError);
});

void test('automation is built only when the work repeats enough to repay its setup', () => {
  const tools = [
    capability('by-hand', ['request'], 'delivery', { kind: 'owner', ownerMinutes: 10 }),
    capability('new-automation', ['request'], 'delivery', { installed: false, setupMinor: 20_000 }),
  ];
  const seen = [
    { capabilityId: 'by-hand', runs: 50, accepted: 50 },
    { capabilityId: 'new-automation', runs: 50, accepted: 50 },
  ];
  assert.equal(planRecipes(goal({ expectedRepeats: 1 }), tools, seen).candidates[0].key, 'by-hand');
  assert.equal(planRecipes(goal({ expectedRepeats: 100 }), tools, seen).candidates[0].key, 'new-automation');
  // 準備済みになれば初回準備は数えない。
  const installed = tools.map((tool) => ({ ...tool, installed: true }));
  assert.equal(planRecipes(goal({ expectedRepeats: 1 }), installed, seen).candidates[0].key, 'new-automation');
});

void test('work the person wants to keep is never automated away and is not counted as a burden', () => {
  const plan = planRecipes(goal({ keepForSelf: ['draft'] }), shop);
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].steps[0].capabilityId, 'draft-by-hand');
  assert.equal(plan.candidates[0].unwantedOwnerMinutes, 0);
  assert.equal(plan.candidates[0].chosenOwnerMinutes, 40);
  assert.deepEqual(ownerSteps(plan.candidates[0]).map((step) => step.capabilityId), ['draft-by-hand']);
});

void test('an unreachable goal reports the missing material instead of guessing a tool', () => {
  const noCheck = shop.filter((tool) => tool.id !== 'check');
  const offline = capability('check-offline', ['draft'], 'checked', { available: false });
  assert.deepEqual(planRecipes(goal(), [...noCheck, offline]).gap, {
    reason: 'inputs_unreachable', missingMaterials: ['checked'], unavailableCapabilityIds: ['check-offline'],
  });
  assert.deepEqual(planRecipes(goal({ want: 'video' }), shop).gap, {
    reason: 'no_capability_produces_goal', missingMaterials: ['video'], unavailableCapabilityIds: [],
  });
  assert.equal(planRecipes(goal({ budgetMinor: 1, keepForSelf: [] }), shop.filter((tool) => tool.kind === 'tool')).gap.reason, 'over_budget_or_deadline');
  assert.equal(planRecipes(goal({ deadlineMinutes: 2 }), shop).gap.reason, 'over_budget_or_deadline');
});

void test('steps that do not feed the goal are dropped and reordered duplicates collapse', () => {
  const tools = [...shop, capability('side-note', ['request'], 'note')];
  const plan = planRecipes(goal(), tools);
  assert.equal(plan.candidates.length, 2);
  assert.ok(plan.candidates.every((candidate) => candidate.steps.every((step) => step.capabilityId !== 'side-note')));
});

void test('a proven recipe is reused, a failure reopens it, and every fifth run tries an unproven one', () => {
  const tools = [
    capability('proven', ['request'], 'delivery', { costMinor: 40 }),
    capability('untested', ['request'], 'delivery', { costMinor: 30 }),
  ];
  const plan = planRecipes(goal(), tools, [{ capabilityId: 'proven', runs: 30, accepted: 29 }]);
  assert.equal(plan.candidates[0].key, 'proven');
  const passed = [{ key: 'proven', outcomes: [true, true, true, true, true] }];
  assert.equal(chooseRecipe(plan, passed, 4).mode, 'frozen');
  assert.equal(chooseRecipe(plan, [], 0).mode, 'best');
  const trial = chooseRecipe(plan, [{ key: 'proven', outcomes: [true, true, false] }], 4);
  assert.deepEqual([trial.mode, trial.candidate.key], ['trial', 'untested']);
  assert.equal(chooseRecipe(plan, [], 3).candidate.key, 'proven');
  assert.equal(chooseRecipe({ candidates: [], gap: null }), null);
});

void test('a frozen recipe is replaced only by one that is at least a fifth better', () => {
  const tools = [
    capability('old', ['request'], 'delivery', { costMinor: 100 }),
    capability('slightly', ['request'], 'delivery', { costMinor: 90 }),
  ];
  const seen = [
    { capabilityId: 'old', runs: 98, accepted: 98 },
    { capabilityId: 'slightly', runs: 98, accepted: 98 },
  ];
  const frozen = [{ key: 'old', outcomes: Array(5).fill(true) }];
  assert.equal(chooseRecipe(planRecipes(goal(), tools, seen), frozen).candidate.key, 'old');
  const better = tools.map((tool) => (tool.id === 'slightly' ? { ...tool, costMinor: 50 } : tool));
  const switched = chooseRecipe(planRecipes(goal(), better, seen), frozen);
  assert.deepEqual([switched.mode, switched.candidate.key], ['best', 'slightly']);
});

void test('malformed capabilities and goals are rejected', () => {
  assert.throws(() => planRecipes(goal({ want: 'request' }), shop), RecipePlannerError);
  assert.throws(() => planRecipes(goal(), [...shop, shop[0]]), RecipePlannerError);
  assert.throws(() => planRecipes(goal(), [capability('loop', ['draft'], 'draft')]), RecipePlannerError);
  assert.throws(() => planRecipes(goal({ expectedRepeats: 0 }), shop), RecipePlannerError);
  assert.throws(() => planRecipes(goal(), [capability('bad', ['request'], 'delivery', { costMinor: -1 })]), RecipePlannerError);
});

void test('unreachable goals with unrelated Tools are rejected before any sequence search', () => {
  // A child deadline detects a synchronous factorial search regression without hanging the suite.
  const script = `
    import { planRecipes } from './lib/sky-recipe-planner.ts';
    const capability = ${capability.toString()};
    const goal = ${goal.toString()};
    const tools = Array.from({ length: 20 }, (_, i) => capability('side-' + i, ['request'], 'unused-' + i));
    console.log(JSON.stringify([
      planRecipes(goal(), tools),
      planRecipes(goal(), [...tools, capability('delivery', ['missing'], 'delivery')]),
    ]));
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 3_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const [noProducer, noInput] = JSON.parse(result.stdout);
  assert.equal(noProducer.gap.reason, 'no_capability_produces_goal');
  assert.equal(noInput.gap.reason, 'inputs_unreachable');
  assert.deepEqual(noInput.gap.missingMaterials, ['missing']);
  for (const plan of [noProducer, noInput]) {
    assert.equal(plan.search.complete, true);
    assert.equal(plan.search.visitedStates, 0);
  }
});

void test('backward dependency pruning keeps a reachable pipeline small among unrelated Tools', () => {
  const unrelated = Array.from({ length: 20 }, (_, i) => capability(`side-${i}`, ['request'], `unused-${i}`));
  const plan = planRecipes(goal(), [...unrelated, ...shop]);
  assert.equal(plan.gap, null);
  assert.equal(plan.candidates.length, 2);
  assert.equal(plan.search.complete, true);
  assert.ok(plan.search.visitedStates < 20);
});

void test('total search budget exhaustion does not claim that a reachable affordable recipe is impossible', () => {
  const expensive = Array.from({ length: RECIPE_MAX_SEARCH_STATES }, (_, i) =>
    capability(`expensive-${i}`, ['request'], 'delivery', { costMinor: 1 }));
  const affordable = capability('last-affordable', ['request'], 'delivery');
  const plan = planRecipes(goal({ budgetMinor: 0 }), [...expensive, affordable]);
  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.gap.reason, 'search_limit_reached');
  assert.deepEqual(plan.gap.missingMaterials, []);
  assert.equal(plan.search.complete, false);
  assert.equal(plan.search.visitedStates, RECIPE_MAX_SEARCH_STATES);
  assert.deepEqual(plan.search.limits, ['states']);
  assert.equal(planRecipes(goal({ budgetMinor: 0 }), [affordable]).candidates[0].key, affordable.id);
});

void test('bounded partial candidates explicitly report that the comparison is incomplete', () => {
  const tools = Array.from({ length: RECIPE_MAX_SEARCH_STATES }, (_, i) =>
    capability(`choice-${i}`, ['request'], 'delivery'));
  const plan = planRecipes(goal(), tools);
  assert.ok(plan.candidates.length > 0);
  assert.equal(plan.gap, null);
  assert.equal(plan.search.complete, false);
  assert.deepEqual(plan.search.limits, ['states']);
});

void test('the step limit is distinct from missing capabilities or over-budget recipes', () => {
  const tools = Array.from({ length: RECIPE_MAX_STEPS + 1 }, (_, i) =>
    capability(`step-${i}`, [i ? `material-${i - 1}` : 'request'], i === RECIPE_MAX_STEPS ? 'delivery' : `material-${i}`));
  const plan = planRecipes(goal(), tools);
  assert.equal(plan.gap.reason, 'search_limit_reached');
  assert.equal(plan.search.complete, false);
  assert.deepEqual(plan.search.limits, ['steps']);
});

void test('independent prerequisite orderings collapse while preserving the whole pipeline', () => {
  const tools = [
    capability('prepare-left', ['request'], 'left'),
    capability('prepare-right', ['request'], 'right'),
    capability('deliver', ['left', 'right'], 'delivery'),
  ];
  const plan = planRecipes(goal(), tools);
  assert.equal(plan.search.complete, true);
  assert.equal(plan.candidates.length, 1);
  assert.deepEqual(plan.candidates[0].steps.map((step) => step.capabilityId), ['prepare-left', 'prepare-right', 'deliver']);
});
