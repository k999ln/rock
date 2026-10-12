import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '@/lib/remote-ai-guard';
import { isTextModelProvider, textModelProviderDefinition } from '@/lib/llm-providers';
import { rockstarServiceScopeAllowed, missingRockstarServiceScope } from '@/lib/rockstar-service-access';
import {
  estimateRemoteAiCostCeiling,
  textInputTokenUpperBound,
  rateCardDigest,
  verifyRemoteAiRateCard,
  type RemoteAiRateCard,
} from '@/lib/remote-ai-rate-card';
import { trustedRemoteAiRateCardKeyResolver } from '@/lib/remote-ai-rate-card-registry';
import { parseStoredRemoteAiRateCard, RemoteAiRateCardStore } from '@/lib/remote-ai-rate-card-store';

const noStoreHeaders = { 'Cache-Control': 'no-store' };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: noStoreHeaders });

export async function POST(request: Request) {
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'llm-estimate', db);
    const runtime = env as unknown as {
      ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string;
      REMOTE_AI_TRUSTED_RATE_KEYS?: string;
    };
    if (!(await rockstarServiceScopeAllowed(db, owner, 'rockstaros_access', runtime.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED, env, request)))
      return missingRockstarServiceScope('RockstarOS');

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 28_000) return json({ code: 'BODY_TOO_LARGE' }, 413);
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ code: 'INVALID_INPUT' }, 400);
    const value = input as Record<string, unknown>;
    const allowed = new Set(['provider', 'model', 'system', 'prompt', 'maxOutputTokens', 'currency', 'maximumBudgetMinor']);
    if (Object.keys(value).some((key) => !allowed.has(key)) ||
      !isTextModelProvider(value.provider) || typeof value.prompt !== 'string' || !value.prompt.trim() ||
      (value.system !== undefined && typeof value.system !== 'string') ||
      (value.model !== undefined && (typeof value.model !== 'string' || value.model.length > 120)) ||
      (value.currency !== undefined && (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency))) ||
      (value.maximumBudgetMinor !== undefined && (!Number.isSafeInteger(value.maximumBudgetMinor) || (value.maximumBudgetMinor as number) < 0)))
      return json({ code: 'INVALID_INPUT' }, 400);
    const provider = value.provider;
    if (textModelProviderDefinition(provider).locality !== 'remote') return json({ code: 'REMOTE_PROVIDER_REQUIRED' }, 400);
    const modelId = typeof value.model === 'string' && value.model.trim()
      ? value.model.trim()
      : textModelProviderDefinition(provider).defaultModel;
    if ((value.system as string | undefined)?.length && (value.system as string).length > 8_000)
      return json({ code: 'INVALID_SYSTEM_PROMPT' }, 400);
    const outputLimit = value.maxOutputTokens === undefined ? 1_200 : value.maxOutputTokens;
    if (!Number.isSafeInteger(outputLimit) || (outputLimit as number) < 1 || (outputLimit as number) > 8_000)
      return json({ code: 'INVALID_OUTPUT_LIMIT' }, 400);

    const resolveKey = trustedRemoteAiRateCardKeyResolver(runtime.REMOTE_AI_TRUSTED_RATE_KEYS);
    const cards = await new RemoteAiRateCardStore(db).listActive(
      provider,
      modelId,
      typeof value.currency === 'string' ? value.currency : undefined,
    );
    if (cards.length === 0) return json({ code: 'REMOTE_AI_RATE_CARD_UNAVAILABLE' }, 503);
    const latestByCurrency = new Map<string, typeof cards[number]>();
    for (const row of cards) if (!latestByCurrency.has(row.currency)) latestByCurrency.set(row.currency, row);
    const candidates: Array<{ card: RemoteAiRateCard; digest: string }> = [];
    for (const row of latestByCurrency.values()) {
      const card = parseStoredRemoteAiRateCard(row);
      if (!card || await rateCardDigest(card) !== row.digest) return json({ code: 'REMOTE_AI_RATE_CARD_UNAVAILABLE' }, 503);
      const verified = await verifyRemoteAiRateCard(card, {
        providerId: provider,
        modelId,
        currency: card.currency,
      }, resolveKey);
      if (!verified || verified.digest !== row.digest) return json({ code: 'REMOTE_AI_RATE_CARD_UNAVAILABLE' }, 503);
      candidates.push(verified);
    }
    if (candidates.length === 0) return json({ code: 'REMOTE_AI_RATE_CARD_UNAVAILABLE' }, 503);
    const currencies = [...new Set(candidates.map(({ card }) => card.currency))];
    if (currencies.length > 1) return json({ code: 'RATE_CARD_CURRENCY_REQUIRED', currencies }, 409);
    const verified = candidates.sort((a, b) => b.card.effectiveAt - a.card.effectiveAt)[0];
    const inputUpperBound = textInputTokenUpperBound(value.prompt, (value.system as string | undefined) ?? '');
    if (inputUpperBound === null) return json({ code: 'INVALID_INPUT' }, 400);
    const userCap = typeof value.maximumBudgetMinor === 'number' ? value.maximumBudgetMinor : Number.MAX_SAFE_INTEGER;
    const withinCap = estimateRemoteAiCostCeiling(verified, inputUpperBound, outputLimit as number, userCap);
    const estimate = withinCap ?? estimateRemoteAiCostCeiling(
      verified, inputUpperBound, outputLimit as number, Number.MAX_SAFE_INTEGER,
    );
    if (!estimate) return json({ code: 'ESTIMATE_OVERFLOW' }, 422);
    return json({
      estimate,
      unitRates: [
        { category: 'ordinary-input', rateMinorMicrosPerMillionTokens: verified.card.inputMinorMicrosPerMillionTokens },
        ...(verified.card.schema === 'rockstar-remote-ai-rate-card/2' ? [
          { category: 'cached-input', rateMinorMicrosPerMillionTokens: verified.card.cachedInputMinorMicrosPerMillionTokens },
          { category: 'cache-write', rateMinorMicrosPerMillionTokens: verified.card.cacheWriteMinorMicrosPerMillionTokens },
        ] : []),
        { category: 'output', rateMinorMicrosPerMillionTokens: verified.card.outputMinorMicrosPerMillionTokens },
      ],
      estimateOnly: true,
      userCapMinor: typeof value.maximumBudgetMinor === 'number' ? value.maximumBudgetMinor : null,
      withinUserCap: withinCap !== null,
      providerSubmission: 'not_performed',
      executionAuthorized: false,
      rateSource: verified.card.sourceUrl,
      cardId: verified.card.cardId,
      effectiveAt: verified.card.effectiveAt,
    });
  } catch (error) {
    if (error instanceof RemoteAiGuardError) return json({ code: error.code }, error.status);
    if (error instanceof SyntaxError) return json({ code: 'INVALID_INPUT' }, 400);
    console.error('remote ai estimate failed', error instanceof Error ? error.message : 'unknown');
    return json({ code: 'REMOTE_AI_RATE_CARD_UNAVAILABLE' }, 503);
  }
}
