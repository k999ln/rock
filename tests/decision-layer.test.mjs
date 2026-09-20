import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DecisionRouter,
  LocalQwenDecisionProvider,
  MockDecisionProvider,
  RuleDecisionProvider,
  TypeSafeJevProvider,
} from '../lib/decision-layer.ts';

const request = (overrides = {}) => ({
  requestId: 'decision-test',
  intent: 'route',
  state: 'test request',
  privacy: 'remote-allowed',
  complexity: 'complex',
  risk: 'low',
  action: 'none',
  ...overrides,
});

void test('rules keep deterministic and irreversible paths out of LLMs', async () => {
  const provider = new RuleDecisionProvider();
  assert.equal(
    (await provider.decide(request({ complexity: 'simple' }))).destination,
    'code',
  );
  assert.equal(
    (await provider.decide(request({ action: 'irreversible' }))).destination,
    'ask-user',
  );
});

void test('router uses Local Action Assistant only for local-only requests', async () => {
  const provider = new LocalQwenDecisionProvider(async () => ({
    destination: 'local-qwen',
    confidence: 0.91,
    reasonCode: 'local_transport_decision',
  }));
  const router = new DecisionRouter(new RuleDecisionProvider(), [provider]);
  const routed = await router.route(
    request({ privacy: 'local-only', complexity: 'complex' }),
  );
  assert.equal(routed.providerId, 'local-qwen');
  assert.equal(routed.destination, 'local-qwen');
});

void test('router does not silently fall back from missing local runtime to cloud', async () => {
  const router = new DecisionRouter(new RuleDecisionProvider(), [
    new LocalQwenDecisionProvider(),
  ]);
  const routed = await router.route(
    request({ privacy: 'local-only', complexity: 'complex' }),
  );
  assert.equal(routed.destination, 'ask-user');
  assert.equal(routed.reasonCode, 'local_qwen_provider_unavailable');
});

void test('mock and TypeSafe adapters share the same decision contract', async () => {
  const mock = new MockDecisionProvider({
    destination: 'cloud-llm',
    confidence: 0.8,
  });
  assert.equal((await mock.decide(request())).destination, 'cloud-llm');

  const jev = new TypeSafeJevProvider('test-key', async () => ({
    answers: {
      destination: {
        type: 'choice',
        choice: 'ask-user',
        probabilities: { 'ask-user': 0.88 },
      },
    },
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  }));
  const decision = await jev.decide(request());
  assert.equal(decision.providerId, 'typesafe-jev');
  assert.equal(decision.destination, 'ask-user');
  assert.equal(decision.confidence, 0.88);
});
