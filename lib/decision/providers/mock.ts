import { DecisionError } from '../errors.ts';
import { digestQuestionSet } from '../digest.ts';
import {
  validateDecisionRequest,
  validateDecisionResult,
} from '../validation.ts';
import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionQuestion,
  DecisionRequest,
  DecisionResult,
  ProviderCapabilities,
  ProviderHealth,
} from '../types.ts';

export type MockAnswerResolver = (
  question: DecisionQuestion,
  request: DecisionRequest,
) => DecisionAnswer;

export type MockDecisionProviderOptions = {
  modelId?: string;
  modelRevision?: string;
  providerVersion?: string;
  answers?: Record<string, DecisionAnswer>;
  answerFor?: MockAnswerResolver;
  latencyMs?: number;
  failWith?: DecisionError;
  now?: () => Date;
};

function defaultAnswer(question: DecisionQuestion): DecisionAnswer {
  if (question.kind === 'choice') {
    const keys = Object.keys(question.options);
    return {
      kind: 'choice',
      value: keys[0],
      probabilities: Object.fromEntries(
        keys.map((key, index) => [key, index === 0 ? 1 : 0]),
      ),
      confidence: 1,
    };
  }
  if (question.kind === 'score') {
    const probabilities = Object.fromEntries(
      question.levels.map((level, index) => [level, index === 0 ? 1 : 0]),
    );
    return {
      kind: 'score',
      value: 0,
      probabilities,
      confidence: 1,
    };
  }
  return {
    kind: 'boolean_probability',
    value: 0.5,
    probabilities: { false: 0.5, true: 0.5 },
    confidence: 0.5,
  };
}

function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DecisionError('PROVIDER_ABORTED', 'provider call aborted'));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export class MockDecisionProvider implements DecisionProvider {
  private readonly options: Required<
    Pick<
      MockDecisionProviderOptions,
      'modelId' | 'modelRevision' | 'providerVersion' | 'latencyMs'
    >
  > &
    MockDecisionProviderOptions;

  constructor(options: MockDecisionProviderOptions = {}) {
    if (
      options.latencyMs !== undefined &&
      (!Number.isSafeInteger(options.latencyMs) ||
        options.latencyMs < 0 ||
        options.latencyMs > 300_000)
    )
      throw new DecisionError('INVALID_REQUEST', 'mock latency is invalid');
    this.options = {
      modelId: 'mock-decision-model',
      modelRevision: 'fixture-1',
      providerVersion: 'mock-provider/1',
      latencyMs: 0,
      ...options,
    };
  }

  describe(): ProviderCapabilities {
    return {
      id: 'mock',
      providerVersion: this.options.providerVersion,
      modelId: this.options.modelId,
      modelRevision: this.options.modelRevision,
      network: 'none',
      execution: 'read-only',
      productionAllowed: false,
      supportsPurposes: [
        'route',
        'classify',
        'score',
        'detect',
        'retrieve',
        'verify',
        'plan',
        'generate',
      ],
      supportsDataClasses: ['public', 'owner_private', 'confidential'],
      supportsEffects: ['none', 'local-pure', 'remote-read'],
    };
  }

  async health(): Promise<ProviderHealth> {
    return { status: 'available', reasonCode: 'MOCK_READY' };
  }

  async decide(
    requestValue: DecisionRequest,
    signal?: AbortSignal,
  ): Promise<DecisionResult> {
    const request = validateDecisionRequest(requestValue);
    if (this.options.failWith) throw this.options.failWith;
    await waitFor(this.options.latencyMs, signal);
    const startedAt = this.options.now?.() ?? new Date();
    const answers: Record<string, DecisionAnswer> = {};
    for (const question of request.questions) {
      const answer =
        this.options.answerFor?.(question, request) ??
        this.options.answers?.[question.id] ??
        defaultAnswer(question);
      answers[question.id] = answer;
    }
    const result = validateDecisionResult(
      {
        schemaVersion: 1,
        requestId: request.requestId,
        provider: 'mock',
        providerVersion: this.options.providerVersion,
        modelId: this.options.modelId,
        modelRevision: this.options.modelRevision,
        answers,
        status: 'answered',
        reasonCodes: ['MOCK_FIXTURE'],
        stateDigest: request.stateDigest,
        questionSetDigest: digestQuestionSet(request.questions),
        startedAt: startedAt.toISOString(),
        completedAt: (this.options.now?.() ?? new Date()).toISOString(),
        usage: {},
      },
      request,
    );
    return result;
  }
}
