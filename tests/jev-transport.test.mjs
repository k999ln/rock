import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateJev } from '../lib/jev-transport.ts';
import {
  JEV_MODEL,
  JEV_RUBRIC_ID,
  JEV_RUBRICS,
  JEV_ROUTING_RUBRIC,
} from '../lib/jev-evaluation.ts';
import {
  DecisionRouter,
  RuleDecisionProvider,
  TypeSafeJevProvider,
} from '../lib/decision-layer.ts';

void test('shared Jev transport keeps model, zero retries and retention request fixed for both rubrics', async () => {
  for (const questions of [JEV_RUBRICS[JEV_RUBRIC_ID], JEV_ROUTING_RUBRIC]) {
    const evaluated = { answers: { fixture: true }, usage: { totalTokens: 5 } };
    const result = await evaluateJev(
      { apiKey: 'fixture-key', state: 'public fixture', questions },
      async (options) => {
        assert.deepEqual(options, {
          model: JEV_MODEL,
          state: 'public fixture',
          questions,
          maxRetries: 0,
          headers: { Authorization: 'Bearer fixture-key' },
          providerOptions: { gateway: { zeroDataRetention: true } },
        });
        return evaluated;
      },
    );
    assert.equal(result, evaluated);
  }
});

void test('Jev transport rejects missing credentials before sending and preserves provider failures', async () => {
  assert.throws(
    () =>
      evaluateJev(
        { apiKey: '', state: 'fixture', questions: JEV_ROUTING_RUBRIC },
        () => assert.fail('must not send'),
      ),
    /TYPE_SAFE_JEV_UNAVAILABLE/,
  );
  const failure = new Error('fixture provider failure');
  let calls = 0;
  await assert.rejects(
    evaluateJev(
      { apiKey: 'fixture', state: 'fixture', questions: JEV_ROUTING_RUBRIC },
      async () => {
        calls += 1;
        throw failure;
      },
    ),
    (error) => error === failure,
  );
  assert.equal(calls, 1);
});

void test('routing uses the transport seam while retaining response validation and advisory authority', async () => {
  const request = {
    requestId: 'fixture',
    intent: 'route',
    state: 'public fixture',
    privacy: 'remote-allowed',
    complexity: 'complex',
    risk: 'low',
    action: 'none',
  };
  const provider = new TypeSafeJevProvider('fixture-key', async (options) => {
    assert.equal(options.state, JSON.stringify(request));
    assert.equal(options.questions, JEV_ROUTING_RUBRIC);
    return {
      answers: {
        destination: {
          type: 'choice',
          choice: 'ask-user',
          probabilities: { 'ask-user': 2 },
        },
      },
      usage: {},
    };
  });
  const result = await provider.decide(request);
  assert.equal(result.authority, 'advisory-only');
  assert.equal(result.confidence, 1);
  assert.equal(result.destination, 'ask-user');
  const invalid = new TypeSafeJevProvider('fixture-key', async () => ({
    answers: { destination: { type: 'choice', choice: 'execute-payment' } },
  }));
  await assert.rejects(
    invalid.decide(request),
    /TYPE_SAFE_JEV_INVALID_RESPONSE/,
  );
});

void test('private, deterministic and approval-required requests never enter Jev transport', async () => {
  const provider = new TypeSafeJevProvider('fixture-key', () =>
    assert.fail('must not send'),
  );
  const router = new DecisionRouter(new RuleDecisionProvider(), [provider]);
  const request = {
    requestId: 'fixture',
    intent: 'route',
    state: 'private fixture',
    privacy: 'remote-allowed',
    complexity: 'complex',
    risk: 'low',
    action: 'none',
  };
  for (const overrides of [
    { privacy: 'local-only' },
    { complexity: 'simple' },
    { risk: 'high' },
    { action: 'irreversible' },
  ]) {
    const result = await router.route({ ...request, ...overrides });
    assert.equal(result.providerId, 'rule');
  }
});
