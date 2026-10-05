import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DecisionError,
  DecisionHarness,
  MockDecisionProvider,
  TypeSafeJevProvider,
  InMemoryDecisionObserver,
  makeDecisionRequest,
  validateDecisionRequest,
} from '../lib/decision/index.ts';

const baseQuestion = {
  id: 'intent',
  kind: 'choice',
  instructions: 'Choose the intent.',
  options: {
    keep: 'Keep the current state.',
    change: 'Change the current state.',
  },
  unknownOptionRequired: true,
};

function request(overrides = {}) {
  const value = {
    requestId: 'request_fixture_1',
    ownerRef: 'owner_fixture',
    workId: 'work_fixture',
    purpose: 'classify',
    state: { topic: 'fixture', count: 1 },
    questions: [baseQuestion],
    dataClasses: ['public'],
    effect: 'none',
    constraints: {
      offlineRequired: false,
      cloudAllowed: false,
      maxLatencyMs: 500,
      maxCostMicros: 100,
      maxAttempts: 3,
    },
    policyVersion: 'decision-test-v1',
    ...overrides,
  };
  delete value.stateDigest;
  return makeDecisionRequest(value);
}

function aliasProvider(base, id) {
  const capabilities = base.describe();
  return {
    describe: () => ({
      ...capabilities,
      id,
      network: id === 'typesafe_jev' ? 'remote' : 'none',
      providerVersion: `${id}-fixture/1`,
    }),
    health: () => base.health(),
    decide: async (...args) => ({
      ...(await base.decide(...args)),
      provider: id,
      providerVersion: `${id}-fixture/1`,
    }),
  };
}

function typeSafeResponse() {
  return {
    model: 'jev-latest',
    answers: {
      intent: {
        type: 'choice',
        choice: 'keep',
        probabilities: { keep: 0.75, change: 0.25 },
        confidence: 0.8,
      },
    },
    usage: { input_tokens: 12, output_tokens: 7 },
  };
}

void test('mock decisions are bounded, typed, and recorded without request content', async () => {
  const observer = new InMemoryDecisionObserver();
  const harness = new DecisionHarness({
    providers: { mock: new MockDecisionProvider() },
    observer: observer.observe,
    allowMock: true,
  });
  const outcome = await harness.decide(request());
  assert.equal(outcome.status, 'answered');
  assert.equal(outcome.result?.provider, 'mock');
  assert.equal(outcome.receipt.route, 'JEV');
  assert.match(outcome.receipt.inputDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal('state' in outcome.receipt, false);
  assert.equal('topic' in outcome.receipt, false);
  const events = observer.snapshot();
  assert.ok(events.some((event) => event.phase === 'completed'));
  assert.equal(JSON.stringify(events).includes('topic'), false);
  assert.equal(JSON.stringify(events).includes('count'), false);
});

void test('mock provider is disabled unless fixture mode is explicit', async () => {
  const calls = [];
  const mock = new MockDecisionProvider({
    answerFor: () => {
      calls.push('called');
      return { kind: 'choice', value: 'keep' };
    },
  });
  const outcome = await new DecisionHarness({ providers: { mock } }).decide(
    request(),
  );
  assert.equal(outcome.route, 'ASK_USER');
  assert.equal(outcome.status, 'awaiting_user');
  assert.deepEqual(calls, []);
});

void test('invalid question IDs fail closed at the contract boundary', () => {
  assert.throws(
    () =>
      validateDecisionRequest({
        ...request(),
        questions: [{ ...baseQuestion, id: 'Bad-ID' }],
      }),
    (error) =>
      error instanceof DecisionError && error.code === 'INVALID_REQUEST',
  );
});

void test('question instructions and options are secret scanned before direct or harness sends', async () => {
  let calls = 0;
  const provider = new TypeSafeJevProvider({
    apiKey: 'fixture-key',
    estimatedCostMicros: 1,
    fetchImpl: async () => {
      calls++;
      return Response.json(typeSafeResponse());
    },
  });
  const compromised = {
    ...request({
      constraints: {
        offlineRequired: false,
        cloudAllowed: true,
        maxLatencyMs: 500,
        maxCostMicros: 100,
        maxAttempts: 1,
      },
    }),
    questions: [
      {
        ...baseQuestion,
        instructions: 'Use API key: fixture-key-12345678',
      },
    ],
  };
  await assert.rejects(
    () => provider.decide(compromised),
    (error) =>
      error instanceof DecisionError && error.code === 'SECRET_DATA_PROHIBITED',
  );
  await assert.rejects(
    () =>
      new DecisionHarness({ providers: { typesafe_jev: provider } }).decide(
        compromised,
      ),
    (error) =>
      error instanceof DecisionError && error.code === 'SECRET_DATA_PROHIBITED',
  );
  assert.equal(calls, 0);
});

void test('validated state is a snapshot and cannot be changed before provider send', () => {
  const source = { value: 'safe fixture state' };
  const validated = request({ state: source });
  source.value = 'Bearer fixture-secret-token';
  assert.deepEqual(validated.state, { value: 'safe fixture state' });
});

void test('secret data blocks before any provider call and external writes ask the owner', async () => {
  assert.throws(
    () => request({ state: { recoveryPhrase: 'fixture-secret' } }),
    (error) =>
      error instanceof DecisionError && error.code === 'SECRET_DATA_PROHIBITED',
  );
  let calls = 0;
  const mock = new MockDecisionProvider({
    answerFor: () => {
      calls++;
      return { kind: 'choice', value: 'keep' };
    },
  });
  const harness = new DecisionHarness({ providers: { mock }, allowMock: true });
  const secret = await harness.decide(
    request({
      dataClasses: ['secret'],
      constraints: {
        offlineRequired: false,
        cloudAllowed: true,
        maxLatencyMs: 500,
        maxCostMicros: 100,
        maxAttempts: 3,
      },
    }),
  );
  assert.equal(secret.route, 'BLOCK');
  assert.equal(secret.status, 'blocked');
  assert.deepEqual(calls, 0);
  const write = await harness.decide(request({ effect: 'external-write' }));
  assert.equal(write.route, 'ASK_USER');
  assert.equal(write.status, 'awaiting_user');
});

void test('Jev fallback is limited to a low risk request and records the source provider', async () => {
  const failingJev = aliasProvider(
    new MockDecisionProvider({
      failWith: new DecisionError('PROVIDER_TIMEOUT', 'fixture timeout', {
        retryable: true,
      }),
    }),
    'typesafe_jev',
  );
  const local = aliasProvider(new MockDecisionProvider(), 'local_qwen');
  const outcome = await new DecisionHarness({
    providers: { typesafe_jev: failingJev, local_qwen: local },
  }).decide(
    request({
      constraints: {
        offlineRequired: false,
        cloudAllowed: true,
        maxLatencyMs: 500,
        maxCostMicros: 100,
        maxAttempts: 3,
      },
    }),
  );
  assert.equal(outcome.status, 'answered');
  assert.equal(outcome.result?.provider, 'local_qwen');
  assert.equal(outcome.receipt.fallbackFrom, 'typesafe_jev');
  assert.equal(outcome.receipt.attempt, 2);

  const privateRequest = request({
    dataClasses: ['owner_private'],
    constraints: {
      offlineRequired: false,
      cloudAllowed: true,
      maxLatencyMs: 500,
      maxCostMicros: 100,
      maxAttempts: 3,
    },
  });
  const privateOutcome = await new DecisionHarness({
    providers: { typesafe_jev: failingJev, local_qwen: local },
  }).decide(privateRequest);
  assert.equal(privateOutcome.result?.provider, 'local_qwen');
  assert.equal(privateOutcome.receipt.attempt, 1);
});

void test('harness enforces total latency and provider cost budgets', async () => {
  const slow = new MockDecisionProvider({ latencyMs: 40 });
  const slowOutcome = await new DecisionHarness({
    providers: { mock: slow },
    allowMock: true,
  }).decide(
    request({
      constraints: {
        offlineRequired: false,
        cloudAllowed: false,
        maxLatencyMs: 5,
        maxCostMicros: 100,
        maxAttempts: 1,
      },
    }),
  );
  assert.equal(slowOutcome.status, 'failed');
  assert.ok(slowOutcome.receipt.reasonCodes.includes('MAX_LATENCY_EXCEEDED'));

  const costlyBase = new MockDecisionProvider();
  const costly = {
    ...aliasProvider(costlyBase, 'local_qwen'),
    decide: async (...args) => ({
      ...(await aliasProvider(costlyBase, 'local_qwen').decide(...args)),
      usage: { costMicros: 101 },
    }),
  };
  const costlyOutcome = await new DecisionHarness({
    providers: { local_qwen: costly },
  }).decide(
    request({
      constraints: {
        offlineRequired: false,
        cloudAllowed: false,
        maxLatencyMs: 500,
        maxCostMicros: 100,
        maxAttempts: 1,
      },
    }),
  );
  assert.equal(costlyOutcome.status, 'failed');
  assert.ok(costlyOutcome.receipt.reasonCodes.includes('MAX_COST_EXCEEDED'));
});

void test('TypeSafe adapter sends the documented atomic request and normalizes answers', async () => {
  let seenUrl;
  let seenInit;
  const provider = new TypeSafeJevProvider({
    apiKey: 'fixture-key',
    estimatedCostMicros: 1,
    fetchImpl: async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return Response.json(typeSafeResponse());
    },
  });
  const result = await provider.decide(
    request({
      constraints: {
        offlineRequired: false,
        cloudAllowed: true,
        maxLatencyMs: 500,
        maxCostMicros: 100,
        maxAttempts: 1,
      },
    }),
  );
  assert.equal(seenUrl, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(seenInit.method, 'POST');
  assert.equal(seenInit.headers.Authorization, 'Bearer fixture-key');
  const body = JSON.parse(seenInit.body);
  assert.deepEqual(Object.keys(body).sort(), ['model', 'questions', 'state']);
  assert.equal(body.model, 'jev-latest');
  assert.deepEqual(body.questions.intent, {
    type: 'choice',
    instructions: 'Choose the intent.',
    criteria: {
      keep: 'Keep the current state.',
      change: 'Change the current state.',
    },
  });
  assert.equal(result.answers.intent.value, 'keep');
  assert.equal(result.usage.inputTokens, 12);
  assert.equal(result.usage.outputTokens, 7);
});

void test('TypeSafe adapter rejects unset credentials, consent/privacy violations, and arbitrary endpoint overrides', async () => {
  const oldKey = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    let calls = 0;
    const unavailable = new TypeSafeJevProvider({
      fetchImpl: async () => {
        calls++;
        return Response.json(typeSafeResponse());
      },
    });
    assert.deepEqual(await unavailable.health(), {
      status: 'unavailable',
      reasonCode: 'TYPESAFE_API_KEY_UNSET',
    });
    await assert.rejects(
      () => unavailable.decide(request()),
      (error) =>
        error instanceof DecisionError && error.code === 'PROVIDER_UNAVAILABLE',
    );
    assert.equal(calls, 0);

    const fetchNever = async () => {
      calls++;
      return Response.json(typeSafeResponse());
    };
    const configured = new TypeSafeJevProvider({
      apiKey: 'fixture-key',
      fetchImpl: fetchNever,
    });
    await assert.rejects(
      () =>
        configured.decide(
          request({
            dataClasses: ['owner_private'],
            constraints: {
              offlineRequired: false,
              cloudAllowed: true,
              maxLatencyMs: 500,
              maxCostMicros: 100,
              maxAttempts: 1,
            },
          }),
        ),
      (error) =>
        error instanceof DecisionError &&
        error.code === 'DATA_CLASS_UNSUPPORTED',
    );
    await assert.rejects(
      () =>
        configured.decide(
          request({
            constraints: {
              offlineRequired: false,
              cloudAllowed: false,
              maxLatencyMs: 500,
              maxCostMicros: 100,
              maxAttempts: 1,
            },
          }),
        ),
      (error) =>
        error instanceof DecisionError &&
        error.code === 'CLOUD_CONSENT_REQUIRED',
    );
    await assert.rejects(
      () =>
        configured.decide(
          request({
            effect: 'external-write',
            constraints: {
              offlineRequired: false,
              cloudAllowed: true,
              maxLatencyMs: 500,
              maxCostMicros: 100,
              maxAttempts: 1,
            },
          }),
        ),
      (error) =>
        error instanceof DecisionError && error.code === 'POLICY_BLOCKED',
    );
    assert.equal(calls, 0);
    assert.throws(
      () =>
        new TypeSafeJevProvider({
          apiKey: 'fixture-key',
          endpoint: 'https://evil.example/v1/systemone',
        }),
      (error) =>
        error instanceof DecisionError && error.code === 'PROVIDER_UNAVAILABLE',
    );
  } finally {
    if (oldKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = oldKey;
  }
});

void test('TypeSafe adapter rejects zero or unestimated remote cost before fetch', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return Response.json(typeSafeResponse());
  };
  const noEstimate = new TypeSafeJevProvider({
    apiKey: 'fixture-key',
    fetchImpl,
  });
  const zeroBudget = request({
    constraints: {
      offlineRequired: false,
      cloudAllowed: true,
      maxLatencyMs: 500,
      maxCostMicros: 0,
      maxAttempts: 1,
    },
  });
  await assert.rejects(
    () => noEstimate.decide(zeroBudget),
    (error) =>
      error instanceof DecisionError && error.code === 'MAX_COST_EXCEEDED',
  );
  await assert.rejects(
    () =>
      noEstimate.decide(
        request({
          constraints: {
            offlineRequired: false,
            cloudAllowed: true,
            maxLatencyMs: 500,
            maxCostMicros: 100,
            maxAttempts: 1,
          },
        }),
      ),
    (error) =>
      error instanceof DecisionError && error.code === 'MAX_COST_EXCEEDED',
  );
  const overBudget = new TypeSafeJevProvider({
    apiKey: 'fixture-key',
    estimatedCostMicros: 101,
    fetchImpl,
  });
  await assert.rejects(
    () =>
      overBudget.decide(
        request({
          constraints: {
            offlineRequired: false,
            cloudAllowed: true,
            maxLatencyMs: 500,
            maxCostMicros: 100,
            maxAttempts: 1,
          },
        }),
      ),
    (error) =>
      error instanceof DecisionError && error.code === 'MAX_COST_EXCEEDED',
  );
  assert.equal(calls, 0);
});

void test('TypeSafe adapter fails closed on malformed responses and bounded timeouts', async () => {
  const malformed = new TypeSafeJevProvider({
    apiKey: 'fixture-key',
    estimatedCostMicros: 1,
    fetchImpl: async () =>
      Response.json({
        model: 'jev-latest',
        answers: {},
        usage: {},
        extra: true,
      }),
  });
  await assert.rejects(
    () =>
      malformed.decide(
        request({
          constraints: {
            offlineRequired: false,
            cloudAllowed: true,
            maxLatencyMs: 500,
            maxCostMicros: 100,
            maxAttempts: 1,
          },
        }),
      ),
    (error) =>
      error instanceof DecisionError &&
      error.code === 'PROVIDER_MALFORMED_RESPONSE',
  );

  const timeout = new TypeSafeJevProvider({
    apiKey: 'fixture-key',
    timeoutMs: 5,
    estimatedCostMicros: 1,
    fetchImpl: async (_url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(new Error('fixture abort')),
          { once: true },
        );
      }),
  });
  await assert.rejects(
    () =>
      timeout.decide(
        request({
          constraints: {
            offlineRequired: false,
            cloudAllowed: true,
            maxLatencyMs: 500,
            maxCostMicros: 100,
            maxAttempts: 1,
          },
        }),
      ),
    (error) =>
      error instanceof DecisionError && error.code === 'PROVIDER_TIMEOUT',
  );
});

void test('CODE fast path and offline routing skip provider health probes', async () => {
  let codeHealthCalls = 0;
  let offlineRemoteHealthCalls = 0;
  const remote = new TypeSafeJevProvider({
    apiKey: 'fixture-key',
    estimatedCostMicros: 1,
    fetchImpl: async () => Response.json(typeSafeResponse()),
  });
  remote.health = async () => {
    codeHealthCalls++;
    throw new Error('health probe must be skipped');
  };
  const codeOutcome = await new DecisionHarness({
    providers: { typesafe_jev: remote },
  }).decide(request(), undefined, { codeCanHandle: true });
  assert.equal(codeOutcome.route, 'CODE');
  assert.equal(codeHealthCalls, 0);

  const offlineRemote = new TypeSafeJevProvider({
    apiKey: 'fixture-key',
    estimatedCostMicros: 1,
    fetchImpl: async () => Response.json(typeSafeResponse()),
  });
  offlineRemote.health = async () => {
    offlineRemoteHealthCalls++;
    throw new Error('offline must not probe remote health');
  };
  const offlineOutcome = await new DecisionHarness({
    providers: { typesafe_jev: offlineRemote },
  }).decide(
    request({
      constraints: {
        offlineRequired: true,
        cloudAllowed: true,
        maxLatencyMs: 500,
        maxCostMicros: 100,
        maxAttempts: 1,
      },
    }),
  );
  assert.equal(offlineOutcome.route, 'ASK_USER');
  assert.equal(offlineRemoteHealthCalls, 0);
});
