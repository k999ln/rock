import { DecisionError } from '../errors.ts';
import { digestQuestionSet } from '../digest.ts';
import {
  ensureNoSecretForCloud,
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

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type TypeSafeJevProviderOptions = {
  /** Explicit injection is intended for server-side tests only. */
  apiKey?: string;
  /** Test-only endpoint override. A fetchImpl must also be injected. */
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  /**
   * Caller supplied conservative estimate for one request. TypeSafe's API
   * reports tokens, not billing, so this is used only for send admission and
   * is never copied into the result as measured cost.
   */
  estimatedCostMicros?: number;
  fetchImpl?: FetchLike;
  now?: () => Date;
};

type JsonRecord = Record<string, unknown>;

function object(value: unknown, name: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DecisionError(
      'PROVIDER_MALFORMED_RESPONSE',
      `${name} is invalid`,
    );
  return value as JsonRecord;
}

function exact(value: JsonRecord, keys: readonly string[], name: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new DecisionError(
      'PROVIDER_MALFORMED_RESPONSE',
      `${name} contains unknown fields`,
    );
}

function text(value: unknown, name: string, max = 256): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max)
    throw new DecisionError(
      'PROVIDER_MALFORMED_RESPONSE',
      `${name} is invalid`,
    );
  return value;
}

function finite(
  value: unknown,
  name: string,
  minimum = 0,
  maximum = 1,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  )
    throw new DecisionError(
      'PROVIDER_MALFORMED_RESPONSE',
      `${name} is invalid`,
    );
  return value;
}

function integer(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new DecisionError(
      'PROVIDER_MALFORMED_RESPONSE',
      `${name} is invalid`,
    );
  return value;
}

function mapProbabilities(
  value: unknown,
  expectedKeys: readonly string[],
  name: string,
): Record<string, number> {
  const item = object(value, name);
  exact(item, expectedKeys, name);
  let sum = 0;
  const output: Record<string, number> = {};
  for (const key of expectedKeys) {
    const probability = finite(item[key], `${name}.${key}`);
    output[key] = probability;
    sum += probability;
  }
  if (Math.abs(sum - 1) > 0.00001)
    throw new DecisionError(
      'PROVIDER_MALFORMED_RESPONSE',
      `${name} does not sum to one`,
    );
  return output;
}

function toTypeSafeQuestion(question: DecisionQuestion): JsonRecord {
  if (question.kind === 'choice') {
    return {
      type: 'choice',
      instructions: question.instructions,
      criteria: Object.fromEntries(
        Object.entries(question.options).map(([key, value]) => [key, value]),
      ),
    };
  }
  if (question.kind === 'score') {
    return {
      type: 'score',
      instructions: question.instructions,
      criteria: [...question.levels],
    };
  }
  return {
    type: 'noul',
    instructions: question.instructions,
    criteria: { true: question.yesMeans, false: question.noMeans },
  };
}

function parseAnswer(
  value: unknown,
  question: DecisionQuestion,
): DecisionAnswer {
  const item = object(value, 'answer');
  if (question.kind === 'choice') {
    exact(
      item,
      ['type', 'choice', 'probabilities', 'confidence'],
      'choice answer',
    );
    if (
      item.type !== 'choice' ||
      typeof item.choice !== 'string' ||
      !(item.choice in question.options)
    )
      throw new DecisionError(
        'PROVIDER_MALFORMED_RESPONSE',
        'choice answer is invalid',
      );
    const probabilityMap = mapProbabilities(
      item.probabilities,
      Object.keys(question.options),
      'choice probabilities',
    );
    const confidence = finite(item.confidence, 'choice confidence');
    return {
      kind: 'choice',
      value: item.choice,
      probabilities: probabilityMap,
      confidence,
    };
  }
  if (question.kind === 'score') {
    const indices = question.levels.map((_, index) => String(index));
    exact(
      item,
      ['type', 'score', 'legend', 'probabilities', 'confidence'],
      'score answer',
    );
    if (item.type !== 'score')
      throw new DecisionError(
        'PROVIDER_MALFORMED_RESPONSE',
        'score answer type is invalid',
      );
    const legend = object(item.legend, 'score legend');
    exact(legend, indices, 'score legend');
    for (const [index, level] of question.levels.entries()) {
      if (legend[String(index)] !== level)
        throw new DecisionError(
          'PROVIDER_MALFORMED_RESPONSE',
          'score legend does not match question',
        );
    }
    const probabilitiesByIndex = mapProbabilities(
      item.probabilities,
      indices,
      'score probabilities',
    );
    const probabilities = Object.fromEntries(
      question.levels.map((level, index) => [
        level,
        probabilitiesByIndex[String(index)],
      ]),
    );
    const score = finite(
      item.score,
      'score value',
      0,
      question.levels.length - 1,
    );
    const confidence = finite(item.confidence, 'score confidence');
    return { kind: 'score', value: score, probabilities, confidence };
  }
  exact(item, ['type', 'noul'], 'noul answer');
  if (item.type !== 'noul')
    throw new DecisionError(
      'PROVIDER_MALFORMED_RESPONSE',
      'noul answer type is invalid',
    );
  const valueNumber = finite(item.noul, 'noul value');
  return {
    kind: 'boolean_probability',
    value: valueNumber,
    probabilities: { false: 1 - valueNumber, true: valueNumber },
  };
}

function responseToResult(
  raw: unknown,
  request: DecisionRequest,
  startedAt: Date,
  completedAt: Date,
): DecisionResult {
  const item = object(raw, 'TypeSafe response');
  exact(item, ['model', 'answers', 'usage'], 'TypeSafe response');
  const model = text(item.model, 'response.model', 128);
  const rawAnswers = object(item.answers, 'response.answers');
  const expectedIds = request.questions.map((question) => question.id).sort();
  const actualIds = Object.keys(rawAnswers).sort();
  if (
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id, index) => id !== actualIds[index])
  )
    throw new DecisionError(
      'PROVIDER_MALFORMED_RESPONSE',
      'response answers do not match request',
    );
  const answers: Record<string, DecisionAnswer> = {};
  for (const question of request.questions)
    answers[question.id] = parseAnswer(rawAnswers[question.id], question);
  const usage = object(item.usage, 'response.usage');
  exact(
    usage,
    Object.keys(usage).filter(
      (key) => key === 'input_tokens' || key === 'output_tokens',
    ),
    'response.usage',
  );
  if (!('input_tokens' in usage) || !('output_tokens' in usage))
    throw new DecisionError(
      'PROVIDER_MALFORMED_RESPONSE',
      'response.usage is incomplete',
    );
  const normalizedUsage: DecisionResult['usage'] = {};
  if (usage.input_tokens !== undefined)
    normalizedUsage.inputTokens = integer(usage.input_tokens, 'input_tokens');
  if (usage.output_tokens !== undefined)
    normalizedUsage.outputTokens = integer(
      usage.output_tokens,
      'output_tokens',
    );
  const candidate = {
    schemaVersion: 1 as const,
    requestId: request.requestId,
    provider: 'typesafe_jev' as const,
    providerVersion: 'typesafe-systemone-http/v1',
    modelId: model,
    modelRevision: model,
    answers,
    status: 'answered' as const,
    reasonCodes: ['TYPESAFE_SYSTEMONE'],
    stateDigest: request.stateDigest,
    questionSetDigest: digestQuestionSet(request.questions),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    usage: normalizedUsage,
  };
  return validateDecisionResult(candidate, request);
}

function errorForResponse(status: number): DecisionError {
  if (status === 401 || status === 403)
    return new DecisionError(
      'PROVIDER_UNAVAILABLE',
      'TypeSafe credentials unavailable',
    );
  if (status === 408 || status === 504)
    return new DecisionError('PROVIDER_TIMEOUT', 'TypeSafe request timed out', {
      retryable: true,
    });
  if (status === 429)
    return new DecisionError('PROVIDER_RATE_LIMITED', 'TypeSafe rate limited', {
      retryable: true,
    });
  if (status === 529)
    return new DecisionError('PROVIDER_OVERLOADED', 'TypeSafe overloaded', {
      retryable: true,
    });
  return new DecisionError('PROVIDER_HTTP_ERROR', 'TypeSafe request failed', {
    retryable: status >= 500,
  });
}

export class TypeSafeJevProvider implements DecisionProvider {
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly estimatedCostMicros: number | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;

  constructor(options: TypeSafeJevProviderOptions = {}) {
    if (typeof window !== 'undefined' && options.apiKey)
      throw new DecisionError(
        'PROVIDER_UNAVAILABLE',
        'TypeSafe credentials are server-only',
      );
    this.apiKey =
      options.apiKey ??
      (typeof process !== 'undefined'
        ? process.env.TYPESAFE_API_KEY
        : undefined);
    const officialEndpoint = 'https://api.typesafe.ai/v1/systemone';
    if (options.endpoint && !options.fetchImpl)
      throw new DecisionError(
        'PROVIDER_UNAVAILABLE',
        'TypeSafe endpoint override requires injected fetch',
      );
    this.endpoint = options.endpoint ?? officialEndpoint;
    this.model = options.model ?? 'jev-latest';
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 300_000
    )
      throw new DecisionError('INVALID_REQUEST', 'TypeSafe timeout is invalid');
    if (
      options.estimatedCostMicros !== undefined &&
      (!Number.isSafeInteger(options.estimatedCostMicros) ||
        options.estimatedCostMicros < 1 ||
        options.estimatedCostMicros > 100_000_000)
    )
      throw new DecisionError(
        'INVALID_REQUEST',
        'TypeSafe cost estimate is invalid',
      );
    this.estimatedCostMicros = options.estimatedCostMicros;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  describe(): ProviderCapabilities {
    return {
      id: 'typesafe_jev',
      providerVersion: 'typesafe-systemone-http/v1',
      modelId: this.model,
      modelRevision: this.model,
      network: 'remote',
      execution: 'read-only',
      productionAllowed: false,
      supportsPurposes: [
        'route',
        'classify',
        'score',
        'detect',
        'retrieve',
        'verify',
      ],
      supportsDataClasses: ['public'],
      supportsEffects: ['none', 'local-pure', 'remote-read'],
    };
  }

  async health(): Promise<ProviderHealth> {
    return this.apiKey
      ? { status: 'available', reasonCode: 'CONFIGURED_NO_NETWORK_PROBE' }
      : { status: 'unavailable', reasonCode: 'TYPESAFE_API_KEY_UNSET' };
  }

  async decide(
    requestValue: DecisionRequest,
    signal?: AbortSignal,
  ): Promise<DecisionResult> {
    const request = validateDecisionRequest(requestValue);
    if (!this.apiKey)
      throw new DecisionError('PROVIDER_UNAVAILABLE', 'TYPESAFE_API_KEY_UNSET');
    ensureNoSecretForCloud(request);
    if (request.constraints.maxCostMicros < 1)
      throw new DecisionError(
        'MAX_COST_EXCEEDED',
        'remote request requires a positive cost budget',
      );
    if (this.estimatedCostMicros === undefined)
      throw new DecisionError(
        'MAX_COST_EXCEEDED',
        'TypeSafe cost estimate is required before remote send',
      );
    if (this.estimatedCostMicros > request.constraints.maxCostMicros)
      throw new DecisionError(
        'MAX_COST_EXCEEDED',
        'TypeSafe cost estimate exceeds request budget',
      );
    const startedAt = this.now();
    const payload = {
      state: request.state,
      model: this.model,
      questions: Object.fromEntries(
        request.questions.map((question) => [
          question.id,
          toTypeSafeQuestion(question),
        ]),
      ),
    };
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let forwardAbort: (() => void) | undefined;
    try {
      const operation = (async (): Promise<DecisionResult> => {
        let response: Response;
        try {
          response = await this.fetchImpl(this.endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
        } catch {
          if (timedOut)
            throw new DecisionError(
              'PROVIDER_TIMEOUT',
              'TypeSafe request timed out',
              { retryable: true },
            );
          if (signal?.aborted)
            throw new DecisionError(
              'PROVIDER_ABORTED',
              'TypeSafe request aborted',
            );
          throw new DecisionError(
            'PROVIDER_UNAVAILABLE',
            'TypeSafe network unavailable',
            { retryable: true },
          );
        }
        if (!response.ok) throw errorForResponse(response.status);
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new DecisionError(
            'PROVIDER_MALFORMED_RESPONSE',
            'TypeSafe response is not JSON',
          );
        }
        return responseToResult(body, request, startedAt, this.now());
      })();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            timedOut = true;
            controller.abort();
            reject(
              new DecisionError(
                'PROVIDER_TIMEOUT',
                'TypeSafe request timed out',
                { retryable: true },
              ),
            );
          },
          Math.min(this.timeoutMs, request.constraints.maxLatencyMs),
        );
      });
      const aborted = new Promise<never>((_, reject) => {
        forwardAbort = () => {
          controller.abort();
          reject(
            new DecisionError('PROVIDER_ABORTED', 'TypeSafe request aborted'),
          );
        };
        if (signal?.aborted) forwardAbort();
        else signal?.addEventListener('abort', forwardAbort, { once: true });
      });
      return await Promise.race([operation, timeout, aborted]);
    } catch (error) {
      if (error instanceof DecisionError) throw error;
      if (timedOut)
        throw new DecisionError(
          'PROVIDER_TIMEOUT',
          'TypeSafe request timed out',
          { retryable: true },
        );
      if (signal?.aborted)
        throw new DecisionError('PROVIDER_ABORTED', 'TypeSafe request aborted');
      throw new DecisionError(
        'PROVIDER_MALFORMED_RESPONSE',
        'TypeSafe response is invalid',
      );
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && forwardAbort)
        signal.removeEventListener('abort', forwardAbort);
      controller.abort();
    }
  }
}
