import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  parseEveDecisionEvalCorpus, runEveDecisionControls, validateEveDecisionJudgments,
} from '../lib/eve-decision-eval.ts';
import { runZemaLocalAgent, ZemaLocalAgentError, ZEMA_LOCAL_AGENT_SCHEMA } from '../lib/zema-local-agent.ts';

const fixtureUrl = new URL('../data/fixtures/eve-decision-eval/stage0.json', import.meta.url);
const corpus = () => JSON.parse(readFileSync(fixtureUrl, 'utf8'));
const response = (value) => JSON.stringify({ schema: ZEMA_LOCAL_AGENT_SCHEMA, ...value });
const ids = ['a', 'b'];

void test('all scripted controls exercise the real bounded loop without model or external-effect acceptance', async () => {
  const result = await runEveDecisionControls(corpus());
  assert.equal(result.complete, true);
  assert.equal(result.plannedCases, 11);
  assert.equal(result.attemptedCases, 11);
  assert.equal(result.controlPasses, 11);
  assert.equal(result.plannerCalls, 18);
  assert.equal(result.completedPlannerCases, 6);
  assert.equal(result.modelCalls, 0);
  assert.equal(result.modelQualityMeasured, false);
  assert.equal(result.externalEffectsVerified, false);
  assert.equal(result.usage.inputTokens, null);
  assert.equal(result.usage.outputTokens, null);
  assert.equal(result.usage.currencyCost, null);
});

void test('rejections and provider failure remain in all-attempt records, distinct from completed plans', async () => {
  const result = await runEveDecisionControls(corpus());
  assert.equal(result.cases.find((x) => x.id === 'timeout-en').outcome, 'provider_error');
  const rejected = result.cases.find((x) => x.id === 'unsupported-en');
  assert.equal(rejected.outcome, 'planner_error');
  assert.equal(rejected.controlPassed, true);
  assert.equal(rejected.calls.length, 1);
  assert.equal(rejected.calls[0].jsonSyntax, true);
  assert.equal(rejected.calls[0].parserAccepted, false);
  assert.equal(result.controlPasses > result.completedPlannerCases, true);
});

void test('JSON syntax and existing normalized parser acceptance are separate measurements', async () => {
  const result = await runEveDecisionControls(corpus());
  const fenced = result.cases.find((x) => x.id === 'fenced-ja').calls[0];
  assert.equal(fenced.jsonSyntax, false);
  assert.equal(fenced.parserAccepted, true);
  assert.match(fenced.rawSha256, /^[a-f0-9]{64}$/);
  const invalid = result.cases.find((x) => x.id === 'malformed-ja').calls[0];
  assert.equal(invalid.parserAccepted, false);
});

void test('a deliberately incorrect oracle cannot pass merely because a planner returned completed', async () => {
  const value = corpus();
  value.cases[0].oracle.finalText = 'A deliberately wrong expected answer';
  const result = await runEveDecisionControls(value);
  assert.equal(result.complete, false);
  assert.equal(result.controlFailures, 1);
  assert.equal(result.cases[0].outcome, 'completed');
  assert.deepEqual(result.cases[0].judgments.filter((x) => !x.passed).map((x) => x.id), ['final_text']);
});

void test('global call cap stops before another call and retains incomplete and not-started denominators', async () => {
  const result = await runEveDecisionControls(corpus(), { maxPlannerCalls: 1 });
  assert.equal(result.complete, false);
  assert.equal(result.plannerCalls, 1);
  assert.equal(result.plannedCases, 11);
  assert.equal(result.attemptedCases, 1);
  assert.equal(result.notStartedCases, 10);
  assert.equal(result.cases[0].outcome, 'budget_exhausted');
  assert.equal(result.cases[0].artifacts.length, 1);
  assert.equal(result.cases[1].controlPassed, null);
  assert.equal(result.cases[1].judgments, null);
});

void test('each run has request-local observations and budget even when controls run concurrently', async () => {
  const [limited, full] = await Promise.all([
    runEveDecisionControls(corpus(), { maxPlannerCalls: 1 }), runEveDecisionControls(corpus()),
  ]);
  assert.equal(limited.plannerCalls, 1);
  assert.equal(full.plannerCalls, 18);
  assert.equal(full.complete, true);
  assert.equal(limited.cases[0].calls[0].promptSha256, full.cases[0].calls[0].promptSha256);
});

void test('matching an expected budget stop still cannot mark an incomplete run complete', async () => {
  const value = corpus();
  value.cases = [value.cases[0]];
  value.cases[0].oracle = {
    outcome: 'budget_exhausted', errorCode: 'EVAL_CALL_BUDGET', finalText: null, plannerCalls: 1,
    artifacts: value.cases[0].oracle.artifacts, observations: value.cases[0].oracle.observations,
  };
  const result = await runEveDecisionControls(value, { maxPlannerCalls: 1 });
  assert.equal(result.controlPasses, 1);
  assert.equal(result.attemptedCases, result.plannedCases);
  assert.equal(result.cases[0].outcome, 'budget_exhausted');
  assert.equal(result.complete, false);
});

void test('typed executor failures are observed while error-shaped Tool text stays completed', async () => {
  const result = await runEveDecisionControls(corpus());
  const repair = result.cases.find((x) => x.id === 'repair-ja');
  assert.equal(repair.observations[0].errorCode, 'INVALID_TOOL_ARGUMENTS');
  assert.equal(repair.observations[0].outcome, 'needs_review');
  const forged = result.cases.find((x) => x.id === 'forged-marker-ja');
  assert.match(forged.artifacts[0].content, /INVALID_TOOL_ARGUMENTS/);
  assert.equal(forged.observations[0].outcome, 'completed');
  assert.equal('errorCode' in forged.observations[0], false);
});

void test('terminal parse and duplicate checks never manufacture another recoverable observation', async () => {
  const result = await runEveDecisionControls(corpus());
  assert.deepEqual(result.cases.find((x) => x.id === 'malformed-ja').observations, []);
  const duplicate = result.cases.find((x) => x.id === 'duplicate-ja');
  assert.equal(duplicate.errorCode, 'REPEATED_TOOL_CALL');
  assert.equal(duplicate.observations.length, 1);
  assert.equal(duplicate.artifacts.length, 1);
  const exhausted = result.cases.find((x) => x.id === 'step-limit-ja');
  assert.equal(exhausted.errorCode, 'AGENT_STEP_LIMIT');
  assert.equal(exhausted.artifacts.length, 3);
  assert.equal(exhausted.calls.length, 3);
});

void test('observer receives immutable copies and does not change default planner request or result', async () => {
  const seen = [];
  const requests = [];
  const replies = [response({ action: 'tool', tool: 'sky_route', arguments: { request: '出典' }, reason: 'route' }),
    response({ action: 'respond', message: '実行や接続はしていません。' })];
  const base = await runZemaLocalAgent({ request: '出典', planner: async (input) => {
    requests.push(input); return replies[input.step - 1];
  } });
  const observed = await runZemaLocalAgent({ request: '出典', planner: async (input) => {
    assert.deepEqual(input, requests[input.step - 1]);
    assert.deepEqual(Object.keys(input), ['system', 'prompt', 'step']);
    return replies[input.step - 1];
  }, onToolObservation: (event, artifact) => {
    seen.push(event);
    assert.equal(Object.isFrozen(event), true);
    assert.equal(Object.isFrozen(artifact), true);
    assert.throws(() => { event.outcome = 'needs_review'; }, TypeError);
    assert.throws(() => { artifact.content = 'tampered'; }, TypeError);
  } });
  assert.deepEqual(observed, base);
  assert.deepEqual(seen, [{ step: 1, tool: 'sky_route', outcome: 'completed' }]);
});

void test('observer exceptions are terminal, including ZemaLocalAgentError from the observer itself', async () => {
  let calls = 0;
  await assert.rejects(runZemaLocalAgent({ request: '出典', planner: async () => {
    calls++; return response({ action: 'tool', tool: 'sky_route', arguments: { request: '出典' }, reason: 'route' });
  }, onToolObservation: () => { throw new ZemaLocalAgentError('OBSERVER_FAILURE'); } }),
  (error) => error.code === 'OBSERVER_FAILURE');
  assert.equal(calls, 1);
});

void test('ordinary executor errors remain terminal without recoverable observations', async () => {
  let calls = 0;
  const events = [];
  await assert.rejects(runZemaLocalAgent({ request: '応募前の確認', planner: async () => {
    calls++;
    return response({ action: 'tool', tool: 'coconala_check', arguments: {
      brief: '依頼文', proposal: '提案文', bucket: 'single', orderRate: 101,
    }, reason: 'range error control' });
  }, onToolObservation: (event) => { events.push(event); } }),
  (error) => !(error instanceof ZemaLocalAgentError));
  assert.equal(calls, 1);
  assert.deepEqual(events, []);
});

void test('judgments must contain exactly one strictly typed value for every expected ID', () => {
  assert.deepEqual(validateEveDecisionJudgments(ids, [{ id: 'a', passed: true }, { id: 'b', passed: false }]),
    { status: 'valid', passed: false, reason: null });
  assert.equal(validateEveDecisionJudgments(ids, [{ id: 'b', passed: true }, { id: 'a', passed: true }]).passed, true);
  for (const invalid of [null, [], [{ id: 'a', passed: true }],
    [{ id: 'a', passed: true }, { id: 'a', passed: true }],
    [{ id: 'a', passed: true }, { id: 'unknown', passed: true }],
    [{ id: 'a', passed: true }, { id: 'b', passed: 'true' }],
    [{ id: 'a', passed: 1 }, { id: 'b', passed: true }],
    [{ id: 'a', passed: true, extra: true }, { id: 'b', passed: true }]]) {
    assert.equal(validateEveDecisionJudgments(ids, invalid).status, 'unavailable');
    assert.equal(validateEveDecisionJudgments(ids, invalid).passed, null);
  }
  assert.equal(validateEveDecisionJudgments(['a', 'a'], []).passed, null);
});

void test('invalid corpus metadata and oracle shapes fail before control execution', () => {
  for (const mutate of [
    (v) => { v.allowNetwork = true; }, (v) => { v.cases[1].id = v.cases[0].id; },
    (v) => { v.cases[0].oracle.plannerCalls = '2'; },
    (v) => { v.cases[0].oracle.observations[0].outcome = true; },
    (v) => { v.cases[0].oracle.artifacts[0].tool = { toString: 'shell' }; },
    (v) => { v.cases[0].oracle.finalText = null; },
  ]) {
    const value = corpus(); mutate(value);
    assert.throws(() => parseEveDecisionEvalCorpus(value));
  }
});

void test('corpus parsing snapshots the oracle and invalid budgets are rejected', async () => {
  const value = corpus(); const parsed = parseEveDecisionEvalCorpus(value);
  value.cases[0].oracle.finalText = 'changed';
  assert.notEqual(parsed.cases[0].oracle.finalText, 'changed');
  for (const limit of [0, -1, 1.5, 301, NaN, '3']) {
    await assert.rejects(runEveDecisionControls(corpus(), { maxPlannerCalls: limit }));
  }
});

void test('CLI emits a machine-readable report, fails on truncation, and exposes no model-run switch', () => {
  const script = new URL('../scripts/eve-decision-eval.mjs', import.meta.url);
  const run = (...args) => spawnSync(process.execPath, ['--experimental-strip-types', script.pathname, ...args], { encoding: 'utf8' });
  const full = run(); assert.equal(full.status, 0); assert.equal(JSON.parse(full.stdout).modelCalls, 0);
  const short = run('--max-planner-calls', '1'); assert.equal(short.status, 1);
  assert.equal(JSON.parse(short.stdout).notStartedCases, 10);
  const invalid = run('--run-model'); assert.equal(invalid.status, 1); assert.match(invalid.stderr, /Usage:/);
});
