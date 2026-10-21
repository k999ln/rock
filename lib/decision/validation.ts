import { DecisionError } from './errors.ts';
import {
  canonicalize,
  containsSecret,
  digestCanonicalText,
  digestCanonical,
  digestQuestionSet,
} from './digest.ts';
import {
  DATA_CLASSES,
  EFFECT_CLASSES,
  PROVIDER_IDS,
  PURPOSES,
  type BooleanProbabilityQuestion,
  type ChoiceQuestion,
  type DataClass,
  type DecisionAnswer,
  type DecisionQuestion,
  type DecisionRequest,
  type DecisionResult,
  type ScoreQuestion,
} from './types.ts';

type RecordValue = Record<string, unknown>;

function record(value: unknown, name: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DecisionError('INVALID_REQUEST', `${name} must be an object`);
  return value as RecordValue;
}

function exact(value: RecordValue, keys: readonly string[], name: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new DecisionError('INVALID_REQUEST', `${name} has unknown fields`);
}

function text(value: unknown, name: string, max = 256): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max)
    throw new DecisionError('INVALID_REQUEST', `${name} is invalid`);
  return value;
}

function identifier(value: unknown, name: string, max = 128): string {
  const result = text(value, name, max);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/u.test(result))
    throw new DecisionError('INVALID_REQUEST', `${name} is invalid`);
  return result;
}

function questionIdentifier(value: unknown): string {
  const result = text(value, 'question.id', 64);
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(result))
    throw new DecisionError('INVALID_REQUEST', 'question.id is invalid');
  return result;
}

function boundedInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new DecisionError('INVALID_REQUEST', `${name} is invalid`);
  return value;
}

function boundedNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  )
    throw new DecisionError('INVALID_RESULT', `${name} is invalid`);
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  name: string,
): T {
  if (typeof value !== 'string' || !values.includes(value as T))
    throw new DecisionError('INVALID_REQUEST', `${name} is invalid`);
  return value as T;
}

function uniqueStrings(value: unknown, name: string, max: number): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > max)
    throw new DecisionError('INVALID_REQUEST', `${name} is invalid`);
  const values = value.map((item) => text(item, `${name} item`, 500));
  if (new Set(values).size !== values.length)
    throw new DecisionError('INVALID_REQUEST', `${name} must be unique`);
  return values;
}

function validateQuestion(value: unknown, seen: Set<string>): DecisionQuestion {
  const item = record(value, 'question');
  const kind = item.kind;
  const id = questionIdentifier(item.id);
  if (seen.has(id))
    throw new DecisionError('INVALID_REQUEST', 'duplicate question id');
  seen.add(id);
  const instructions = text(item.instructions, 'question.instructions', 1000);
  if (kind === 'choice') {
    exact(
      item,
      ['id', 'kind', 'instructions', 'options', 'unknownOptionRequired'],
      'choice question',
    );
    const options = record(item.options, 'question.options');
    const optionKeys = Object.keys(options);
    if (optionKeys.length < 2 || optionKeys.length > 32)
      throw new DecisionError('INVALID_REQUEST', 'question.options is invalid');
    const normalized: Record<string, string> = {};
    for (const key of optionKeys) {
      identifier(key, 'question option', 64);
      normalized[key] = text(options[key], 'question option description', 500);
    }
    if (typeof item.unknownOptionRequired !== 'boolean')
      throw new DecisionError(
        'INVALID_REQUEST',
        'unknownOptionRequired is invalid',
      );
    return {
      id,
      kind,
      instructions,
      options: normalized,
      unknownOptionRequired: item.unknownOptionRequired,
    } satisfies ChoiceQuestion;
  }
  if (kind === 'score') {
    exact(item, ['id', 'kind', 'instructions', 'levels'], 'score question');
    return {
      id,
      kind,
      instructions,
      levels: uniqueStrings(item.levels, 'question.levels', 16),
    } satisfies ScoreQuestion;
  }
  if (kind === 'boolean_probability') {
    exact(
      item,
      ['id', 'kind', 'instructions', 'yesMeans', 'noMeans'],
      'boolean question',
    );
    return {
      id,
      kind,
      instructions,
      yesMeans: text(item.yesMeans, 'question.yesMeans', 500),
      noMeans: text(item.noMeans, 'question.noMeans', 500),
    } satisfies BooleanProbabilityQuestion;
  }
  throw new DecisionError('INVALID_REQUEST', 'question kind is invalid');
}

function snapshotState(value: unknown): unknown {
  // Parse the canonical JSON once so providers cannot observe a later caller
  // mutation or a getter that changes the value after digest/privacy checks.
  return JSON.parse(canonicalize(value)) as unknown;
}

export function validateDecisionRequest(value: unknown): DecisionRequest {
  const item = record(value, 'request');
  exact(
    item,
    [
      'schemaVersion',
      'requestId',
      'ownerRef',
      'workId',
      'purpose',
      'state',
      'stateDigest',
      'questions',
      'dataClasses',
      'effect',
      'constraints',
      'policyVersion',
    ],
    'request',
  );
  if (item.schemaVersion !== 1)
    throw new DecisionError('INVALID_REQUEST', 'unsupported request schema');
  const requestId = identifier(item.requestId, 'requestId');
  const ownerRef = identifier(item.ownerRef, 'ownerRef');
  const workId = identifier(item.workId, 'workId');
  const purpose = oneOf(item.purpose, PURPOSES, 'purpose');
  const state = snapshotState(item.state);
  const stateDigest = text(item.stateDigest, 'stateDigest', 71);
  if (!/^sha256:[a-f0-9]{64}$/u.test(stateDigest))
    throw new DecisionError('INVALID_REQUEST', 'stateDigest is invalid');
  if (digestCanonicalText(canonicalize(state)) !== stateDigest)
    throw new DecisionError(
      'INVALID_REQUEST',
      'stateDigest does not match state',
    );
  if (containsSecret(state))
    throw new DecisionError(
      'SECRET_DATA_PROHIBITED',
      'secret data is not accepted',
    );
  if (
    !Array.isArray(item.questions) ||
    item.questions.length < 1 ||
    item.questions.length > 64
  )
    throw new DecisionError('INVALID_REQUEST', 'questions is invalid');
  const ids = new Set<string>();
  const questions = item.questions.map((question) =>
    validateQuestion(question, ids),
  );
  if (containsSecret(questions))
    throw new DecisionError(
      'SECRET_DATA_PROHIBITED',
      'secret data is not accepted',
    );
  if (!Array.isArray(item.dataClasses) || item.dataClasses.length < 1)
    throw new DecisionError('INVALID_REQUEST', 'dataClasses is invalid');
  const dataClasses = item.dataClasses.map((dataClass) =>
    oneOf(dataClass, DATA_CLASSES, 'dataClass'),
  ) as DataClass[];
  if (new Set(dataClasses).size !== dataClasses.length)
    throw new DecisionError('INVALID_REQUEST', 'dataClasses must be unique');
  const effect = oneOf(item.effect, EFFECT_CLASSES, 'effect');
  const constraints = record(item.constraints, 'constraints');
  exact(
    constraints,
    [
      'offlineRequired',
      'cloudAllowed',
      'maxLatencyMs',
      'maxCostMicros',
      'maxAttempts',
    ],
    'constraints',
  );
  if (
    typeof constraints.offlineRequired !== 'boolean' ||
    typeof constraints.cloudAllowed !== 'boolean'
  )
    throw new DecisionError(
      'INVALID_REQUEST',
      'connectivity constraints are invalid',
    );
  const normalizedConstraints = {
    offlineRequired: constraints.offlineRequired,
    cloudAllowed: constraints.cloudAllowed,
    maxLatencyMs: boundedInteger(
      constraints.maxLatencyMs,
      'maxLatencyMs',
      1,
      300_000,
    ),
    maxCostMicros: boundedInteger(
      constraints.maxCostMicros,
      'maxCostMicros',
      0,
      100_000_000,
    ),
    maxAttempts: boundedInteger(constraints.maxAttempts, 'maxAttempts', 1, 3),
  };
  const policyVersion = text(item.policyVersion, 'policyVersion', 64);
  return {
    schemaVersion: 1,
    requestId,
    ownerRef,
    workId,
    purpose,
    state,
    stateDigest,
    questions,
    dataClasses,
    effect,
    constraints: normalizedConstraints,
    policyVersion,
  };
}

export function makeDecisionRequest(
  value: Omit<DecisionRequest, 'schemaVersion' | 'stateDigest'> &
    Partial<Pick<DecisionRequest, 'stateDigest'>>,
): DecisionRequest {
  const request = {
    ...value,
    schemaVersion: 1,
    stateDigest: value.stateDigest ?? digestCanonical(value.state),
  };
  return validateDecisionRequest(request);
}

function probabilities(
  value: unknown,
  name: string,
  expectedKeys?: readonly string[],
): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  const item = record(value, name);
  const keys = Object.keys(item);
  if (keys.length < 2 || keys.length > 64)
    throw new DecisionError('INVALID_RESULT', `${name} is invalid`);
  if (expectedKeys) {
    const expected = [...expectedKeys].sort();
    const actual = [...keys].sort();
    if (
      expected.length !== actual.length ||
      expected.some((key, index) => key !== actual[index])
    )
      throw new DecisionError('INVALID_RESULT', `${name} keys are invalid`);
  }
  const normalized: Record<string, number> = {};
  let sum = 0;
  for (const key of keys) {
    const probability = boundedNumber(item[key], `${name}.${key}`, 0, 1);
    normalized[key] = probability;
    sum += probability;
  }
  if (Math.abs(sum - 1) > 0.00001)
    throw new DecisionError('INVALID_RESULT', `${name} must sum to one`);
  return normalized;
}

function validateAnswer(
  value: unknown,
  question: DecisionQuestion,
): DecisionAnswer {
  const item = record(value, 'answer');
  const keys = ['kind', 'value'];
  if ('probabilities' in item) keys.push('probabilities');
  if ('confidence' in item) keys.push('confidence');
  exact(item, keys, 'answer');
  if (item.kind !== question.kind)
    throw new DecisionError(
      'INVALID_RESULT',
      'answer kind does not match question',
    );
  const confidence =
    item.confidence === undefined
      ? undefined
      : boundedNumber(item.confidence, 'answer.confidence', 0, 1);
  if (question.kind === 'choice') {
    if (typeof item.value !== 'string' || !(item.value in question.options))
      throw new DecisionError('INVALID_RESULT', 'choice answer is invalid');
    const probabilityMap = probabilities(
      item.probabilities,
      'answer.probabilities',
      Object.keys(question.options),
    );
    return {
      kind: 'choice',
      value: item.value,
      ...(probabilityMap ? { probabilities: probabilityMap } : {}),
      ...(confidence === undefined ? {} : { confidence }),
    };
  }
  if (question.kind === 'score') {
    const score = boundedNumber(
      item.value,
      'score answer',
      0,
      question.levels.length - 1,
    );
    const probabilityMap = probabilities(
      item.probabilities,
      'answer.probabilities',
      question.levels,
    );
    return {
      kind: 'score',
      value: score,
      ...(probabilityMap ? { probabilities: probabilityMap } : {}),
      ...(confidence === undefined ? {} : { confidence }),
    };
  }
  const valueNumber = boundedNumber(
    item.value,
    'boolean probability answer',
    0,
    1,
  );
  const probabilityMap = probabilities(
    item.probabilities,
    'answer.probabilities',
    ['false', 'true'],
  );
  return {
    kind: 'boolean_probability',
    value: valueNumber,
    ...(probabilityMap ? { probabilities: probabilityMap } : {}),
    ...(confidence === undefined ? {} : { confidence }),
  };
}

export function validateDecisionResult(
  value: unknown,
  request?: DecisionRequest,
): DecisionResult {
  const item = record(value, 'result');
  exact(
    item,
    [
      'schemaVersion',
      'requestId',
      'provider',
      'providerVersion',
      'modelId',
      'modelRevision',
      'answers',
      'status',
      'reasonCodes',
      'stateDigest',
      'questionSetDigest',
      'startedAt',
      'completedAt',
      'usage',
    ],
    'result',
  );
  if (item.schemaVersion !== 1)
    throw new DecisionError('INVALID_RESULT', 'unsupported result schema');
  const requestId = text(item.requestId, 'result.requestId', 128);
  const provider = oneOf(item.provider, PROVIDER_IDS, 'result.provider');
  const providerVersion = text(
    item.providerVersion,
    'result.providerVersion',
    64,
  );
  const modelId = text(item.modelId, 'result.modelId', 128);
  const modelRevision = text(item.modelRevision, 'result.modelRevision', 128);
  const status = oneOf(
    item.status,
    ['answered', 'abstained', 'blocked', 'failed'] as const,
    'result.status',
  );
  const reasonCodes = Array.isArray(item.reasonCodes)
    ? item.reasonCodes.map((reason) => identifier(reason, 'reasonCode', 64))
    : (() => {
        throw new DecisionError('INVALID_RESULT', 'reasonCodes is invalid');
      })();
  if (
    reasonCodes.length > 32 ||
    new Set(reasonCodes).size !== reasonCodes.length
  )
    throw new DecisionError('INVALID_RESULT', 'reasonCodes are invalid');
  const stateDigest = text(item.stateDigest, 'result.stateDigest', 71);
  const questionSetDigest = text(
    item.questionSetDigest,
    'result.questionSetDigest',
    71,
  );
  if (
    !/^sha256:[a-f0-9]{64}$/u.test(stateDigest) ||
    !/^sha256:[a-f0-9]{64}$/u.test(questionSetDigest)
  )
    throw new DecisionError('INVALID_RESULT', 'result digest is invalid');
  const startedAt = text(item.startedAt, 'result.startedAt', 64);
  const completedAt = text(item.completedAt, 'result.completedAt', 64);
  if (
    Number.isNaN(Date.parse(startedAt)) ||
    Number.isNaN(Date.parse(completedAt))
  )
    throw new DecisionError('INVALID_RESULT', 'result timestamp is invalid');
  const usage = record(item.usage, 'result.usage');
  exact(
    usage,
    Object.keys(usage).filter((key) =>
      ['inputTokens', 'outputTokens', 'costMicros'].includes(key),
    ),
    'result.usage',
  );
  const normalizedUsage: DecisionResult['usage'] = {};
  for (const key of ['inputTokens', 'outputTokens', 'costMicros'] as const) {
    if (usage[key] !== undefined)
      normalizedUsage[key] = boundedInteger(
        usage[key],
        `usage.${key}`,
        0,
        100_000_000,
      );
  }
  const answersValue = record(item.answers, 'result.answers');
  const questions = request?.questions;
  if (request) {
    if (requestId !== request.requestId || stateDigest !== request.stateDigest)
      throw new DecisionError(
        'INVALID_RESULT',
        'result does not match request',
      );
    if (questionSetDigest !== digestQuestionSet(request.questions))
      throw new DecisionError(
        'INVALID_RESULT',
        'question set digest does not match request',
      );
    const expectedIds = request.questions.map((question) => question.id).sort();
    const actualIds = Object.keys(answersValue).sort();
    if (
      expectedIds.length !== actualIds.length ||
      expectedIds.some((id, index) => id !== actualIds[index])
    )
      throw new DecisionError(
        'INVALID_RESULT',
        'result answers are incomplete',
      );
  }
  const answers: Record<string, DecisionAnswer> = {};
  for (const [id, answer] of Object.entries(answersValue)) {
    const question = questions?.find((candidate) => candidate.id === id);
    if (!question) {
      if (questions)
        throw new DecisionError(
          'INVALID_RESULT',
          'result answer id is unknown',
        );
      throw new DecisionError(
        'INVALID_RESULT',
        'request is required to validate answers',
      );
    }
    answers[id] = validateAnswer(answer, question);
  }
  return {
    schemaVersion: 1,
    requestId,
    provider,
    providerVersion,
    modelId,
    modelRevision,
    answers,
    status,
    reasonCodes,
    stateDigest,
    questionSetDigest,
    startedAt,
    completedAt,
    usage: normalizedUsage,
  };
}

export function ensureRequestForProvider(
  request: DecisionRequest,
): DecisionRequest {
  try {
    return validateDecisionRequest(request);
  } catch (error) {
    if (error instanceof DecisionError) throw error;
    throw new DecisionError('INVALID_REQUEST');
  }
}

export function ensureNoSecretForCloud(request: DecisionRequest): void {
  if (
    request.dataClasses.includes('secret') ||
    containsSecret(request.state) ||
    containsSecret(request.questions)
  )
    throw new DecisionError(
      'SECRET_DATA_PROHIBITED',
      'secret data is not accepted',
    );
  if (!request.dataClasses.every((dataClass) => dataClass === 'public'))
    throw new DecisionError(
      'DATA_CLASS_UNSUPPORTED',
      'TypeSafe accepts public data only',
    );
  if (request.effect === 'external-write')
    throw new DecisionError(
      'POLICY_BLOCKED',
      'external writes require approval',
    );
  if (!request.constraints.cloudAllowed)
    throw new DecisionError(
      'CLOUD_CONSENT_REQUIRED',
      'cloud consent is required',
    );
  if (request.constraints.offlineRequired)
    throw new DecisionError(
      'OFFLINE_REQUIRED',
      'offline execution is required',
    );
}

export function questionSetDigestFor(request: DecisionRequest): string {
  return digestQuestionSet(request.questions);
}

export function answerSetDigest(result: DecisionResult): string {
  return digestCanonical(result.answers);
}
