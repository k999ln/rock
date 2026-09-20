import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DecisionHarness,
  MockDecisionProvider,
  TypeSafeJevProvider,
  makeDecisionRequest,
} from '../lib/decision/index.ts';

function request(overrides = {}) {
  return makeDecisionRequest({
    requestId: 'decision-test-1',
    ownerRef: 'owner-1',
    workId: 'work-1',
    purpose: 'route',
    state: { text: 'ordinary fixture input' },
    questions: [{
      id: 'route',
      kind: 'choice',
      instructions: 'Choose one route for this fixture.',
      options: { local: 'Keep on device', unknown: 'No confident route' },
      unknownOptionRequired: true,
    }],
    dataClasses: ['public'],
    effect: 'none',
    constraints: {
      offlineRequired: false,
      cloudAllowed: false,
      maxLatencyMs: 1000,
      maxCostMicros: 0,
      maxAttempts: 2,
    },
    policyVersion: 'fixture-1',
    ...overrides,
  });
}

void test('deterministic fast path and external write gate do not invoke a provider', async () => {
  const provider = new MockDecisionProvider();
  provider.decide = () => { throw new Error('provider must not be called'); };
  const harness = new DecisionHarness({ providers: { mock: provider }, allowMock: true });

  const code = await harness.decide(request(), undefined, { codeCanHandle: true });
  assert.equal(code.route, 'CODE');
  assert.equal(code.result, undefined);
  assert.equal(code.receipt.attempt, 0);

  const write = await harness.decide(request({ effect: 'external-write' }));
  assert.equal(write.route, 'ASK_USER');
  assert.equal(write.receipt.attempt, 0);
});

void test('Mock provider is opt in and receipts contain no raw state', async () => {
  const provider = new MockDecisionProvider();
  const fixture = request();
  const defaultOutcome = await new DecisionHarness({ providers: { mock: provider } }).decide(fixture);
  assert.equal(defaultOutcome.route, 'ASK_USER');

  const outcome = await new DecisionHarness({ providers: { mock: provider }, allowMock: true }).decide(fixture);
  assert.equal(outcome.route, 'JEV');
  assert.equal(outcome.status, 'answered');
  assert.equal(outcome.result?.provider, 'mock');
  assert.equal(outcome.receipt.attempt, 1);
  assert.equal(JSON.stringify(outcome.receipt).includes('ordinary fixture input'), false);
});

void test('TypeSafe direct calls reject private and unconsented input before fetch', async () => {
  let calls = 0;
  const provider = new TypeSafeJevProvider({
    apiKey: 'fixture-only-key',
    fetchImpl: async () => { calls += 1; throw new Error('unexpected network call'); },
  });
  await assert.rejects(provider.decide(request({ dataClasses: ['owner_private'], constraints: {
    offlineRequired: false, cloudAllowed: true, maxLatencyMs: 1000, maxCostMicros: 0, maxAttempts: 1,
  } })));
  await assert.rejects(provider.decide(request()));
  assert.equal(calls, 0);
});
