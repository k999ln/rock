/** Provider-signed model rate card and conservative text-token ceiling. */
export const REMOTE_AI_RATE_CARD_SCHEMA = 'rockstar-remote-ai-rate-card/1' as const;
export const REMOTE_AI_TEXT_RATE_CARD_SCHEMA = 'rockstar-remote-ai-rate-card/2' as const;
const DOMAIN = new TextEncoder().encode('rockstar-remote-ai-rate-card-signature/1\0');
const TEXT_DOMAIN = new TextEncoder().encode('rockstar-remote-ai-rate-card-signature/2\0');
const RATE_FIELDS = [
  'schema',
  'providerId',
  'keyId',
  'cardId',
  'modelId',
  'pricingVersion',
  'currency',
  'inputMinorMicrosPerMillionTokens',
  'outputMinorMicrosPerMillionTokens',
  'effectiveAt',
  'expiresAt',
  'sourceUrl',
] as const;
const TEXT_RATE_FIELDS = [
  ...RATE_FIELDS, 'cachedInputMinorMicrosPerMillionTokens',
  'cacheWriteMinorMicrosPerMillionTokens', 'executionScope', 'serviceTier',
] as const;
const MICRO_MINOR_PER_MINOR = BigInt(1_000_000);
const TOKENS_PER_MILLION = BigInt(1_000_000);
const RATE_DENOMINATOR = MICRO_MINOR_PER_MINOR * TOKENS_PER_MILLION;
const MAX_RATE_CARD_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_OUTPUT_TOKENS = 8_000;
const TEXT_PROTOCOL_OVERHEAD_TOKENS = 128;

type RateCardCommon = {
  providerId: string;
  keyId: string;
  cardId: string;
  modelId: string;
  pricingVersion: string;
  currency: string;
  /** Millionths of one ISO currency minor unit per million input tokens. */
  inputMinorMicrosPerMillionTokens: number;
  /** Millionths of one ISO currency minor unit per million output tokens. */
  outputMinorMicrosPerMillionTokens: number;
  effectiveAt: number;
  expiresAt: number;
  sourceUrl: string;
  signature: string;
};
export type RemoteAiRateCard = RateCardCommon & (
  { schema: typeof REMOTE_AI_RATE_CARD_SCHEMA } |
  {
    schema: typeof REMOTE_AI_TEXT_RATE_CARD_SCHEMA;
    cachedInputMinorMicrosPerMillionTokens: number;
    cacheWriteMinorMicrosPerMillionTokens: number;
    executionScope: 'text-only';
    serviceTier: 'default';
  }
);

export type RemoteAiRateCardIntent = {
  providerId: string;
  modelId: string;
  currency: string;
};

export type RemoteAiRateCardKeyResolver = (identity: {
  providerId: string;
  keyId: string;
}) => Promise<Uint8Array | null>;

export type VerifiedRemoteAiRateCard = {
  card: RemoteAiRateCard;
  digest: string;
};

export type RemoteAiCostCeiling = {
  providerId: string;
  modelId: string;
  pricingVersion: string;
  currency: string;
  inputTokenUpperBound: number;
  outputTokenLimit: number;
  maximumChargeMinor: number;
  rateCardDigest: string;
  expiresAt: number;
  pricingCoverage: 'legacy-input-output-only' | 'text-token-categories';
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function officialOrHttpsSource(value: unknown, providerId: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    const domains: Record<string, string[]> = {
      openai: ['openai.com'],
      anthropic: ['anthropic.com'],
      google: ['google.com'],
    };
    const allowed = domains[providerId];
    return !allowed || allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function validSignature(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{86}$/.test(value);
}

export function remoteAiRateCardSigningBytes(card: RemoteAiRateCard) {
  const v2 = card.schema === REMOTE_AI_TEXT_RATE_CARD_SCHEMA;
  const fields = v2 ? TEXT_RATE_FIELDS : RATE_FIELDS;
  const domain = v2 ? TEXT_DOMAIN : DOMAIN;
  const payload = new TextEncoder().encode(JSON.stringify(
    Object.fromEntries(fields.map((field) => [field, (card as unknown as Record<string, unknown>)[field]])),
  ));
  const bytes = new Uint8Array(domain.length + payload.length);
  bytes.set(domain);
  bytes.set(payload, domain.length);
  return bytes;
}

export async function rateCardDigest(card: RemoteAiRateCard) {
  const digest = await crypto.subtle.digest('SHA-256', remoteAiRateCardSigningBytes(card));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyRemoteAiRateCard(
  value: unknown,
  intent: RemoteAiRateCardIntent,
  resolveKey: RemoteAiRateCardKeyResolver,
  now = Date.now(),
): Promise<VerifiedRemoteAiRateCard | null> {
  if (!record(value)) return null;
  const v2 = value.schema === REMOTE_AI_TEXT_RATE_CARD_SCHEMA;
  const expected = [...(v2 ? TEXT_RATE_FIELDS : RATE_FIELDS), 'signature'].sort();
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null;

  const card = value as unknown as RemoteAiRateCard;
  if ((card.schema !== REMOTE_AI_RATE_CARD_SCHEMA && card.schema !== REMOTE_AI_TEXT_RATE_CARD_SCHEMA) ||
    !safeId(card.providerId) || !safeId(card.keyId) || !safeId(card.cardId) ||
    !safeId(card.modelId) || !safeId(card.pricingVersion) ||
    !/^[A-Z]{3}$/.test(card.currency) ||
    !Number.isSafeInteger(card.inputMinorMicrosPerMillionTokens) || card.inputMinorMicrosPerMillionTokens < 0 ||
    !Number.isSafeInteger(card.outputMinorMicrosPerMillionTokens) || card.outputMinorMicrosPerMillionTokens < 0 ||
    !Number.isSafeInteger(card.effectiveAt) || card.effectiveAt > now + 30_000 ||
    !Number.isSafeInteger(card.expiresAt) || card.expiresAt <= now ||
    card.expiresAt <= card.effectiveAt || card.expiresAt - card.effectiveAt > MAX_RATE_CARD_AGE_MS ||
    !officialOrHttpsSource(card.sourceUrl, card.providerId) || !validSignature(card.signature) ||
    card.providerId !== intent.providerId || card.modelId !== intent.modelId || card.currency !== intent.currency) return null;
  if (card.schema === REMOTE_AI_TEXT_RATE_CARD_SCHEMA &&
    (card.providerId !== 'openai' || card.executionScope !== 'text-only' || card.serviceTier !== 'default' ||
      !Number.isSafeInteger(card.cachedInputMinorMicrosPerMillionTokens) || card.cachedInputMinorMicrosPerMillionTokens < 0 ||
      !Number.isSafeInteger(card.cacheWriteMinorMicrosPerMillionTokens) || card.cacheWriteMinorMicrosPerMillionTokens < 0))
    return null;

  let publicKey: Uint8Array | null;
  try {
    publicKey = await resolveKey({ providerId: card.providerId, keyId: card.keyId });
  } catch {
    return null;
  }
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw', Uint8Array.from(publicKey).buffer as ArrayBuffer, { name: 'Ed25519' }, false, ['verify'],
    );
    const signature = Uint8Array.from(
      atob(card.signature.replaceAll('-', '+').replaceAll('_', '/') + '=='),
      (character) => character.charCodeAt(0),
    );
    if (signature.length !== 64 ||
      btoa(String.fromCharCode(...signature)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== card.signature ||
      !await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, remoteAiRateCardSigningBytes(card))) return null;
    return { card, digest: await rateCardDigest(card) };
  } catch {
    return null;
  }
}

/**
 * Text-only upper bound for the exact system/prompt text passed to a model.
 * Production acceptance must confirm the framing overhead for each provider;
 * this estimate is not permission to execute a paid request.
 */
export function textInputTokenUpperBound(prompt: string, system = '') {
  if (typeof prompt !== 'string' || typeof system !== 'string') return null;
  const promptBytes = new TextEncoder().encode(prompt.trim()).length;
  const systemBytes = new TextEncoder().encode(system.trim()).length;
  const bound = promptBytes + systemBytes + TEXT_PROTOCOL_OVERHEAD_TOKENS;
  return Number.isSafeInteger(bound) ? bound : null;
}

export function estimateRemoteAiCostCeiling(
  verified: VerifiedRemoteAiRateCard,
  inputTokenUpperBound: number,
  outputTokenLimit: number,
  maximumBudgetMinor: number,
  now = Date.now(),
): RemoteAiCostCeiling | null {
  const { card } = verified;
  if (!Number.isSafeInteger(inputTokenUpperBound) || inputTokenUpperBound < 0 ||
    !Number.isSafeInteger(outputTokenLimit) || outputTokenLimit < 1 || outputTokenLimit > MAX_OUTPUT_TOKENS ||
    !Number.isSafeInteger(maximumBudgetMinor) || maximumBudgetMinor < 0 || card.expiresAt <= now) return null;

  // Before execution the cache partition is unknown. Reserve at the highest
  // signed input-category rate, rather than assuming a cache discount.
  const inputRate = card.schema === REMOTE_AI_TEXT_RATE_CARD_SCHEMA
    ? Math.max(card.inputMinorMicrosPerMillionTokens, card.cachedInputMinorMicrosPerMillionTokens,
      card.cacheWriteMinorMicrosPerMillionTokens)
    : card.inputMinorMicrosPerMillionTokens;
  const inputCost = BigInt(inputTokenUpperBound) * BigInt(inputRate);
  const outputCost = BigInt(outputTokenLimit) * BigInt(card.outputMinorMicrosPerMillionTokens);
  const numerator = inputCost + outputCost;
  const maximumCharge = Number((numerator + RATE_DENOMINATOR - BigInt(1)) / RATE_DENOMINATOR);
  if (!Number.isSafeInteger(maximumCharge) || maximumCharge > maximumBudgetMinor) return null;

  return {
    providerId: card.providerId,
    modelId: card.modelId,
    pricingVersion: card.pricingVersion,
    currency: card.currency,
    inputTokenUpperBound,
    outputTokenLimit,
    maximumChargeMinor: maximumCharge,
    rateCardDigest: verified.digest,
    expiresAt: card.expiresAt,
    pricingCoverage: card.schema === REMOTE_AI_TEXT_RATE_CARD_SCHEMA
      ? 'text-token-categories' : 'legacy-input-output-only',
  };
}
