import { LlmProviderError, textModelProviderDefinition } from './llm-providers.ts';
import { RemoteAiGuardError } from './remote-ai-guard.ts';
import { RemoteAiTextStoreError, type RemoteAiTextRecord } from './remote-ai-text-store.ts';
import { REMOTE_AI_TEXT_RATE_CARD_SCHEMA } from './remote-ai-rate-card.ts';

export const remoteAiTextJson = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export function remoteAiTextPublicRecord(record: RemoteAiTextRecord) {
  const { verifiedRate, ownerUserId: _owner, ...rest } = record;
  const card = verifiedRate.card;
  const rateCard = {
    providerId: card.providerId,
    modelId: card.modelId,
    cardId: card.cardId,
    pricingVersion: card.pricingVersion,
    currency: card.currency,
    inputMinorMicrosPerMillionTokens: card.inputMinorMicrosPerMillionTokens,
    outputMinorMicrosPerMillionTokens: card.outputMinorMicrosPerMillionTokens,
    ...(card.schema === REMOTE_AI_TEXT_RATE_CARD_SCHEMA ? {
      cachedInputMinorMicrosPerMillionTokens: card.cachedInputMinorMicrosPerMillionTokens,
      cacheWriteMinorMicrosPerMillionTokens: card.cacheWriteMinorMicrosPerMillionTokens,
    } : {}),
    effectiveAt: card.effectiveAt,
    expiresAt: card.expiresAt,
    sourceUrl: card.sourceUrl,
    unit: 'millionths_of_currency_minor_unit_per_million_tokens',
  };
  const held = ['reserved', 'sending', 'unreconciled'].includes(record.state);
  const priced = record.state === 'completed' && record.price?.status === 'priced';
  const liveMeter = record.observation?.liveMeter && typeof record.observation.liveMeter === 'object'
    ? record.observation.liveMeter as Record<string, unknown> : null;
  return {
    ...rest,
    rateCard,
    spending: {
      status: priced ? 'itemized_usage_priced' : held ? 'usage_not_yet_final' : 'not_running',
      currency: record.quote.ceiling.currency,
      currentChargeMinor: priced ? record.settledMinor : null,
      currentEstimateMinor: !priced && held && liveMeter && Number.isSafeInteger(liveMeter.estimatedChargeMinor)
        ? liveMeter.estimatedChargeMinor : null,
      estimateUpdatedAt: liveMeter && Number.isSafeInteger(liveMeter.observedAt) ? liveMeter.observedAt : null,
      estimateBasis: liveMeter?.basis ?? null,
      reservedMaximumMinor: held ? record.quote.ceiling.maximumChargeMinor : 0,
      providerMeter: priced ? 'final_response_usage' : liveMeter ? 'stream_estimate' : 'not_reported',
      invoiceVerified: false,
    },
    invoiceVerified: false,
    budgetIsFundedWalletBalance: false,
  };
}
export function remoteAiTextQueueState(record: RemoteAiTextRecord, inputAccepted: boolean) {
  if (record.state === 'quoted') return 'awaiting_approval';
  if (record.state === 'reserved') return inputAccepted ? 'queued' : 'approved_waiting_for_submission';
  if (record.state === 'sending') return 'running_or_reconciling';
  if (record.state === 'completed') return 'completed';
  if (record.state === 'unreconciled') return 'usage_or_result_reconciliation_required';
  return record.state;
}
export function remoteAiTextHttpError(error: unknown) {
  if (error instanceof RemoteAiGuardError || error instanceof LlmProviderError)
    return remoteAiTextJson({ code: error.code }, error.status);
  if (error instanceof RemoteAiTextStoreError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'STORE_UNAVAILABLE' ? 503 : 409;
    return remoteAiTextJson({ code: error.code }, status);
  }
  if (error instanceof SyntaxError) return remoteAiTextJson({ code: 'INVALID_INPUT' }, 400);
  return remoteAiTextJson({ code: 'REMOTE_AI_TEXT_UNAVAILABLE' }, 503);
}
export async function readRemoteAiTextInput(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 28_000) throw new LlmProviderError('BODY_TOO_LARGE', 413);
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LlmProviderError('INVALID_INPUT', 400);
  return value as Record<string, unknown>;
}
export function parseRemoteAiTextQuoteInput(input: Record<string, unknown>) {
  const allowed = new Set(['requestId', 'parentJobId', 'parentBudgetLimitMinor', 'model', 'system', 'prompt',
    'maxOutputTokens', 'currency', 'maximumBudgetMinor', 'saveResult']);
  const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
  if (Object.keys(input).some(key => !allowed.has(key)) || !id(input.requestId) || !id(input.parentJobId) ||
    !integer(input.maximumBudgetMinor) || !integer(input.parentBudgetLimitMinor) ||
    input.parentBudgetLimitMinor < input.maximumBudgetMinor ||
    typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 24_000 ||
    (input.system !== undefined && (typeof input.system !== 'string' || input.system.length > 8_000)) ||
    (input.model !== undefined && (typeof input.model !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(input.model))) ||
    (input.currency !== undefined && (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency))) ||
    (input.saveResult !== undefined && typeof input.saveResult !== 'boolean'))
    throw new LlmProviderError('INVALID_INPUT', 400);
  const maxOutputTokens = input.maxOutputTokens ?? 1_200;
  if (!integer(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 8_000)
    throw new LlmProviderError('INVALID_OUTPUT_LIMIT', 400);
  return {
    requestId: input.requestId, parentJobId: input.parentJobId,
    parentBudgetLimitMinor: input.parentBudgetLimitMinor, maximumBudgetMinor: input.maximumBudgetMinor,
    prompt: input.prompt, system: input.system as string | undefined,
    model: (input.model as string | undefined) ?? textModelProviderDefinition('openai').defaultModel,
    currency: input.currency as string | undefined,
    maxOutputTokens, saveResult: input.saveResult === true,
  };
}
