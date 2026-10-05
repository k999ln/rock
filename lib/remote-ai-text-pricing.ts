import type { TextGenerationResult } from './llm-providers.ts';
import { remoteAiTextRequestDigest } from './remote-ai-text-request.ts';
export { remoteAiTextRequestDigest } from './remote-ai-text-request.ts';
import {
  REMOTE_AI_TEXT_RATE_CARD_SCHEMA,
  estimateRemoteAiCostCeiling,
  textInputTokenUpperBound,
  type RemoteAiCostCeiling,
  type VerifiedRemoteAiRateCard,
} from './remote-ai-rate-card.ts';

const DENOMINATOR = BigInt(1_000_000_000_000);
const QUOTE_LIFETIME_MS = 5 * 60 * 1000;

export type RemoteAiTextIntent = {
  ownerId: string;
  requestId: string;
  model: string;
  prompt: string;
  system?: string;
  maxOutputTokens: number;
  maximumBudgetMinor: number;
};

export type RemoteAiTextQuote = {
  schema: 'rockstar-remote-ai-text-quote/1';
  ownerId: string;
  requestId: string;
  requestDigest: string;
  quoteDigest: string;
  createdAt: number;
  expiresAt: number;
  ceiling: RemoteAiCostCeiling;
  approvedCapMinor: number;
};

async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function quotePayload(quote: Omit<RemoteAiTextQuote, 'quoteDigest'> | RemoteAiTextQuote) {
  return {
    schema: quote.schema, ownerId: quote.ownerId, requestId: quote.requestId,
    requestDigest: quote.requestDigest, createdAt: quote.createdAt,
    expiresAt: quote.expiresAt, ceiling: quote.ceiling, approvedCapMinor: quote.approvedCapMinor,
  };
}

/** Preparation only. A persisted, single-use budget reservation is still required before sending. */
export async function prepareRemoteAiTextQuote(
  verified: VerifiedRemoteAiRateCard,
  intent: RemoteAiTextIntent,
  now = Date.now(),
): Promise<RemoteAiTextQuote | null> {
  const { card } = verified;
  if (card.schema !== REMOTE_AI_TEXT_RATE_CARD_SCHEMA || card.providerId !== 'openai' ||
    card.modelId !== intent.model.trim() || card.effectiveAt > now || card.expiresAt <= now ||
    !Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + QUOTE_LIFETIME_MS) ||
    typeof intent.ownerId !== 'string' || !intent.ownerId || intent.ownerId.length > 128 ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(intent.requestId) ||
    !intent.prompt.trim() || intent.prompt.length > 24_000 || (intent.system?.length ?? 0) > 8_000)
    return null;
  const bound = textInputTokenUpperBound(intent.prompt, intent.system);
  if (bound === null) return null;
  const ceiling = estimateRemoteAiCostCeiling(verified, bound, intent.maxOutputTokens, intent.maximumBudgetMinor, now);
  if (!ceiling) return null;
  const quote: Omit<RemoteAiTextQuote, 'quoteDigest'> = {
    schema: 'rockstar-remote-ai-text-quote/1',
    ownerId: intent.ownerId, requestId: intent.requestId,
    requestDigest: await remoteAiTextRequestDigest(intent),
    createdAt: now, expiresAt: Math.min(now + QUOTE_LIFETIME_MS, card.expiresAt),
    ceiling, approvedCapMinor: intent.maximumBudgetMinor,
  };
  return { ...quote, quoteDigest: await digest(quotePayload(quote)) };
}

/** Revalidate the saved quote against current trusted pricing and exact approved input. */
export async function remoteAiTextQuoteMatches(
  quote: RemoteAiTextQuote,
  verified: VerifiedRemoteAiRateCard,
  intent: RemoteAiTextIntent,
  now = Date.now(),
  reservedExecution = false,
) {
  if (quote.schema !== 'rockstar-remote-ai-text-quote/1' || quote.createdAt > now ||
    (!reservedExecution && quote.expiresAt <= now) || quote.expiresAt > verified.card.expiresAt ||
    quote.ownerId !== intent.ownerId || quote.requestId !== intent.requestId ||
    quote.approvedCapMinor !== intent.maximumBudgetMinor ||
    quote.requestDigest !== await remoteAiTextRequestDigest(intent) ||
    quote.quoteDigest !== await digest(quotePayload(quote))) return false;
  const expected = await prepareRemoteAiTextQuote(verified, intent, quote.createdAt);
  return expected !== null && expected.quoteDigest === quote.quoteDigest;
}

export type RemoteAiTextPriceResult =
  | { status: 'unreconciled'; reason: 'RATE_COVERAGE' | 'MODEL_OR_TIER' | 'TOOL_USAGE' | 'MISSING_USAGE' | 'USAGE_LIMIT' | 'QUOTE_MISMATCH' | 'RESPONSE_IDENTITY' }
  | {
    status: 'priced';
    currency: string;
    pricingVersion: string;
    rateCardDigest: string;
    providerResponseId: string;
    chargeMinor: number;
    /** Exact millionths-of-minor-unit numerator / token denominator; round once at the total. */
    numerator: string;
    denominator: string;
    items: Array<{ category: 'ordinary-input' | 'cached-input' | 'cache-write' | 'output'; tokens: number; rateMinorMicrosPerMillionTokens: number; numerator: string }>;
  };

export type RemoteAiTextLiveEstimate = {
  currency: string;
  estimatedChargeMinor: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  observedOutputBytes: number;
  observedAt: number;
  basis: 'quoted_input_upper_bound_plus_output_utf8_bytes_divided_by_3';
  finalProviderUsage: false;
};

/**
 * A live display estimate while OpenAI streams visible text. Input stays at the
 * quote's conservative upper bound; output UTF-8 bytes / 3 is a rough token
 * proxy. This is never used to settle or release a reservation.
 */
export function estimateRemoteAiTextLiveSpend(
  verified: VerifiedRemoteAiRateCard,
  ceiling: RemoteAiCostCeiling,
  outputBytes: number,
  observedAt = Date.now(),
): RemoteAiTextLiveEstimate | null {
  if (!Number.isSafeInteger(outputBytes) || outputBytes < 0 || outputBytes > 1_500_000 ||
      !Number.isSafeInteger(observedAt) || observedAt < 0 ||
      verified.digest !== ceiling.rateCardDigest || verified.card.currency !== ceiling.currency ||
      verified.card.modelId !== ceiling.modelId) return null;
  const card = verified.card;
  const inputRate = card.schema === REMOTE_AI_TEXT_RATE_CARD_SCHEMA
    ? Math.max(card.inputMinorMicrosPerMillionTokens, card.cachedInputMinorMicrosPerMillionTokens,
      card.cacheWriteMinorMicrosPerMillionTokens)
    : card.inputMinorMicrosPerMillionTokens;
  const estimatedOutputTokens = Math.min(ceiling.outputTokenLimit, Math.ceil(outputBytes / 3));
  const numerator = BigInt(ceiling.inputTokenUpperBound) * BigInt(inputRate) +
    BigInt(estimatedOutputTokens) * BigInt(card.outputMinorMicrosPerMillionTokens);
  const estimatedChargeMinor = Number((numerator + DENOMINATOR - BigInt(1)) / DENOMINATOR);
  if (!Number.isSafeInteger(estimatedChargeMinor) || estimatedChargeMinor > ceiling.maximumChargeMinor)
    return null;
  return {
    currency: ceiling.currency,
    estimatedChargeMinor,
    estimatedInputTokens: ceiling.inputTokenUpperBound,
    estimatedOutputTokens,
    observedOutputBytes: outputBytes,
    observedAt,
    basis: 'quoted_input_upper_bound_plus_output_utf8_bytes_divided_by_3',
    finalProviderUsage: false,
  };
}

/** Cost calculation only, not a payment or invoice assertion. Unknown charges keep the reservation held. */
export function priceRemoteAiTextUsage(
  verified: VerifiedRemoteAiRateCard,
  ceiling: RemoteAiCostCeiling,
  result: Pick<TextGenerationResult, 'provider' | 'model' | 'usage' | 'serviceTier' | 'webSearchCalls' | 'textOnlyOutput' | 'reportedModel' | 'responseStatus' | 'providerResponseId'>,
): RemoteAiTextPriceResult {
  const { card } = verified;
  const unresolved = (reason: Extract<RemoteAiTextPriceResult, { status: 'unreconciled' }>['reason']): RemoteAiTextPriceResult =>
    ({ status: 'unreconciled', reason });
  if (card.schema !== REMOTE_AI_TEXT_RATE_CARD_SCHEMA || card.providerId !== 'openai')
    return unresolved('RATE_COVERAGE');
  const expected = estimateRemoteAiCostCeiling(verified, ceiling.inputTokenUpperBound,
    ceiling.outputTokenLimit, ceiling.maximumChargeMinor, card.effectiveAt);
  if (!expected || JSON.stringify(expected) !== JSON.stringify(ceiling)) return unresolved('QUOTE_MISMATCH');
  if (result.responseStatus !== 'completed' || typeof result.providerResponseId !== 'string' ||
    !/^resp_[A-Za-z0-9_-]{1,200}$/.test(result.providerResponseId)) return unresolved('RESPONSE_IDENTITY');
  if (result.provider !== card.providerId || result.model !== card.modelId ||
    result.reportedModel !== card.modelId || result.serviceTier !== card.serviceTier)
    return unresolved('MODEL_OR_TIER');
  if (result.webSearchCalls !== 0 || result.textOnlyOutput !== true) return unresolved('TOOL_USAGE');
  const usage = result.usage;
  const valid = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (!usage || !valid(usage.inputTokens) || !valid(usage.outputTokens) ||
    !valid(usage.totalTokens) || !valid(usage.cachedInputTokens) || !valid(usage.cacheWriteInputTokens) ||
    !Number.isSafeInteger(usage.inputTokens + usage.outputTokens) ||
    usage.totalTokens !== usage.inputTokens + usage.outputTokens ||
    usage.cachedInputTokens + usage.cacheWriteInputTokens > usage.inputTokens)
    return unresolved('MISSING_USAGE');
  if (usage.inputTokens > ceiling.inputTokenUpperBound || usage.outputTokens > ceiling.outputTokenLimit)
    return unresolved('USAGE_LIMIT');
  const counts = [
    ['ordinary-input', usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteInputTokens, card.inputMinorMicrosPerMillionTokens],
    ['cached-input', usage.cachedInputTokens, card.cachedInputMinorMicrosPerMillionTokens],
    ['cache-write', usage.cacheWriteInputTokens, card.cacheWriteMinorMicrosPerMillionTokens],
    ['output', usage.outputTokens, card.outputMinorMicrosPerMillionTokens],
  ] as const;
  const items = counts.map(([category, tokens, rate]) => ({
    category, tokens, rateMinorMicrosPerMillionTokens: rate, numerator: (BigInt(tokens) * BigInt(rate)).toString(),
  }));
  const numerator = items.reduce((sum, item) => sum + BigInt(item.numerator), BigInt(0));
  const chargeMinor = Number((numerator + DENOMINATOR - BigInt(1)) / DENOMINATOR);
  if (!Number.isSafeInteger(chargeMinor) || chargeMinor > ceiling.maximumChargeMinor)
    return unresolved('USAGE_LIMIT');
  return {
    status: 'priced', currency: card.currency, pricingVersion: card.pricingVersion,
    rateCardDigest: verified.digest, chargeMinor, numerator: numerator.toString(),
    providerResponseId: result.providerResponseId,
    denominator: DENOMINATOR.toString(), items,
  };
}
