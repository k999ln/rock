import { LlmProviderError } from './llm-providers.ts';
import { REMOTE_AI_TEXT_RATE_CARD_SCHEMA, rateCardDigest, verifyRemoteAiRateCard } from './remote-ai-rate-card.ts';
import { trustedRemoteAiRateCardKeyResolver } from './remote-ai-rate-card-registry.ts';
import { parseStoredRemoteAiRateCard, RemoteAiRateCardStore } from './remote-ai-rate-card-store.ts';

export async function loadVerifiedRemoteAiTextRate(
  db: Pick<D1Database, 'prepare'>,
  trustedKeys: unknown,
  model: string,
  currency?: string,
  now = Date.now(),
) {
  const rows = await new RemoteAiRateCardStore(db).listActive('openai', model, currency, now);
  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!latest.has(row.currency)) latest.set(row.currency, row);
  if (latest.size !== 1)
    throw new LlmProviderError(latest.size > 1 ? 'RATE_CARD_CURRENCY_REQUIRED' : 'REMOTE_AI_RATE_CARD_UNAVAILABLE',
      latest.size > 1 ? 409 : 503);
  const row = [...latest.values()][0];
  const card = parseStoredRemoteAiRateCard(row);
  if (!card || await rateCardDigest(card) !== row.digest)
    throw new LlmProviderError('REMOTE_AI_RATE_CARD_UNAVAILABLE', 503);
  const verified = await verifyRemoteAiRateCard(card, { providerId: 'openai', modelId: model, currency: card.currency },
    trustedRemoteAiRateCardKeyResolver(trustedKeys), now);
  if (!verified || verified.digest !== row.digest || card.effectiveAt > now)
    throw new LlmProviderError('REMOTE_AI_RATE_CARD_UNAVAILABLE', 503);
  if (card.schema !== REMOTE_AI_TEXT_RATE_CARD_SCHEMA)
    throw new LlmProviderError('REMOTE_AI_TEXT_RATE_COVERAGE_UNAVAILABLE', 503);
  return verified;
}
