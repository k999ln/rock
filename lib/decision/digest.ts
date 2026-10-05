import { createHash } from 'node:crypto';
import { DecisionError } from './errors.ts';
import type {
  DecisionQuestion,
  DecisionRequest,
  DecisionResult,
} from './types.ts';

export const MAX_STATE_BYTES = 262_144;
export const MAX_OBJECT_DEPTH = 32;

type PlainRecord = Record<string, unknown>;

function quote(value: string): string {
  return JSON.stringify(value);
}

function canonical(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): string {
  if (depth > MAX_OBJECT_DEPTH)
    throw new DecisionError('INVALID_REQUEST', 'state depth exceeds bound');
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return quote(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value))
        throw new DecisionError('INVALID_REQUEST', 'non-finite state number');
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new DecisionError('INVALID_REQUEST', 'unsupported state value');
  }

  if (seen.has(value))
    throw new DecisionError('INVALID_REQUEST', 'cyclic state is not allowed');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 1024)
        throw new DecisionError('INVALID_REQUEST', 'state array exceeds bound');
      return `[${value.map((item) => canonical(item, seen, depth + 1)).join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new DecisionError(
        'INVALID_REQUEST',
        'state must contain plain objects',
      );
    const record = value as PlainRecord;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${quote(key)}:${canonical(record[key], seen, depth + 1)}`);
    if (entries.length > 256)
      throw new DecisionError('INVALID_REQUEST', 'state object exceeds bound');
    return `{${entries.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalize(value: unknown): string {
  const text = canonical(value, new WeakSet<object>(), 0);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_STATE_BYTES)
    throw new DecisionError('INVALID_REQUEST', 'state exceeds size bound');
  return text;
}

export function digestCanonical(value: unknown): string {
  return digestCanonicalText(canonicalize(value));
}

export function digestCanonicalText(canonicalText: string): string {
  return `sha256:${createHash('sha256').update(canonicalText).digest('hex')}`;
}

export function digestQuestionSet(questions: DecisionQuestion[]): string {
  return digestCanonical(questions);
}

export function digestResult(result: DecisionResult): string {
  return digestCanonical(result);
}

const SECRET_KEY_NAMES = [
  'password',
  'passcode',
  'privatekey',
  'recovery',
  'recoveryphrase',
  'mnemonic',
  'seed',
  'seedphrase',
  'sessioncookie',
  'accesstoken',
  'refreshtoken',
  'apitoken',
  'apikey',
  'authorization',
  'credential',
  'cookie',
  'otp',
  'secret',
] as const;
const SECRET_VALUE =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\b(?:sk|ghp|github_pat|xox[baprs])-[-_A-Za-z0-9]{8,}|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|\b(?:api[ _-]?key|access[ _-]?token|refresh[ _-]?token|authorization|secret|password|private[ _-]?key|recovery(?:[ _-]?phrase)?|mnemonic|seed(?:[ _-]?phrase)?|otp)\s*[:=]\s*(?:Bearer\s+)?[A-Za-z0-9._~+/=-]{8,}/iu;

function hasSecretValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): boolean {
  if (depth > MAX_OBJECT_DEPTH || value === null) return false;
  if (typeof value === 'string') return SECRET_VALUE.test(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  try {
    if (Array.isArray(value))
      return value.some((item) => hasSecretValue(item, seen, depth + 1));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return true;
    return Object.entries(value).some(([key, item]) => {
      if (SECRET_VALUE.test(key)) return true;
      const normalizedKey = key.replace(/[_-]/g, '').toLowerCase();
      if (
        SECRET_KEY_NAMES.some(
          (name) =>
            normalizedKey === name ||
            normalizedKey.startsWith(name) ||
            normalizedKey.endsWith(name),
        )
      )
        return true;
      return hasSecretValue(item, seen, depth + 1);
    });
  } finally {
    seen.delete(value);
  }
}

export function containsSecret(value: unknown): boolean {
  return hasSecretValue(value, new WeakSet<object>(), 0);
}

export function requestInputDigest(request: DecisionRequest): string {
  return digestCanonical({
    requestId: request.requestId,
    stateDigest: request.stateDigest,
    questionSetDigest: digestQuestionSet(request.questions),
    purpose: request.purpose,
    effect: request.effect,
  });
}
