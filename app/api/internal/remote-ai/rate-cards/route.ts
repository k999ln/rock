import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { verifyRemoteAiRateCard, type RemoteAiRateCard } from '@/lib/remote-ai-rate-card';
import { trustedRemoteAiRateCardKeyResolver } from '@/lib/remote-ai-rate-card-registry';
import { authorizeRemoteAiRateCardOperator } from '@/lib/remote-ai-rate-card-operator';
import { RemoteAiRateCardStore, RemoteAiRateCardStoreError } from '@/lib/remote-ai-rate-card-store';
import { isTextModelProvider, textModelProviderDefinition } from '@/lib/llm-providers';

const noStoreHeaders = { 'Cache-Control': 'no-store' };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: noStoreHeaders });

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 16_384) throw new Error('BODY_TOO_LARGE');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_BODY_SHAPE');
  return value as Record<string, unknown>;
}

function storeError(error: unknown) {
  if (error instanceof RemoteAiRateCardStoreError) {
    const status = error.code === 'RATE_CARD_NOT_FOUND' ? 404
      : error.code === 'RATE_CARD_STORE_UNAVAILABLE' ? 503 : 409;
    return json({ code: error.code }, status);
  }
  if (error instanceof SyntaxError)
    return json({ code: 'INVALID_INPUT' }, 400);
  if (error instanceof Error && error.message === 'INVALID_BODY_SHAPE')
    return json({ code: 'INVALID_BODY_SHAPE' }, 400);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE') return json({ code: 'BODY_TOO_LARGE' }, 413);
  console.error('remote ai rate card registry failed', error instanceof Error ? error.message : 'unknown');
  return json({ code: 'RATE_CARD_STORE_UNAVAILABLE' }, 503);
}

async function authorize(request: Request) {
  const runtime = env as unknown as {
    REMOTE_AI_RATE_CARD_INGEST_TOKEN?: string;
    REMOTE_AI_RATE_CARD_OPERATOR_ID?: string;
  };
  return authorizeRemoteAiRateCardOperator(
    request,
    runtime.REMOTE_AI_RATE_CARD_INGEST_TOKEN,
    runtime.REMOTE_AI_RATE_CARD_OPERATOR_ID,
  );
}

export async function POST(request: Request) {
  const access = await authorize(request);
  if (!access.ok) return json({ code: access.code }, access.status);
  try {
    const input = await readBody(request);
    if (Object.keys(input).length !== 1 || !('card' in input)) return json({ code: 'INVALID_INPUT' }, 400);
    const value = input.card as Partial<RemoteAiRateCard> | null;
    if (!value || typeof value.providerId !== 'string' || typeof value.modelId !== 'string' ||
      typeof value.currency !== 'string' || !isTextModelProvider(value.providerId) ||
      textModelProviderDefinition(value.providerId).locality !== 'remote')
      return json({ code: 'INVALID_RATE_CARD' }, 400);
    const verified = await verifyRemoteAiRateCard(input.card, {
      providerId: value.providerId,
      modelId: value.modelId,
      currency: value.currency,
    }, trustedRemoteAiRateCardKeyResolver(
      (env as unknown as { REMOTE_AI_TRUSTED_RATE_KEYS?: string }).REMOTE_AI_TRUSTED_RATE_KEYS,
    ));
    if (!verified) return json({ code: 'INVALID_RATE_CARD_SIGNATURE_OR_TERMS' }, 400);
    const result = await new RemoteAiRateCardStore(database()).register(verified, access.operatorId);
    return json({ cardId: verified.card.cardId, digest: verified.digest, ...result }, result.inserted ? 201 : 200);
  } catch (error) {
    return storeError(error);
  }
}

export async function PATCH(request: Request) {
  const access = await authorize(request);
  if (!access.ok) return json({ code: access.code }, access.status);
  try {
    const input = await readBody(request);
    if (input.action !== 'revoke' ||
      typeof input.providerId !== 'string' || !isTextModelProvider(input.providerId) ||
      typeof input.cardId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.cardId) ||
      Object.keys(input).some((key) => !['action', 'providerId', 'cardId'].includes(key)))
      return json({ code: 'INVALID_REVOCATION_REQUEST' }, 400);
    const result = await new RemoteAiRateCardStore(database()).revoke(
      input.providerId, input.cardId, access.operatorId,
    );
    return json({ providerId: input.providerId, cardId: input.cardId, ...result });
  } catch (error) {
    return storeError(error);
  }
}
