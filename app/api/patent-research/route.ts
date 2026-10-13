import { env } from 'cloudflare:workers';
import { createOpenAiResponse, LlmProviderError } from '@/lib/llm-providers';
import { database } from '@/lib/fund-store';
import {
  buildPatentAiRequest,
  parsePatentAiResponse,
  validatePatentAiInput,
} from '@/lib/patent-ai';
import {
  authorizeRemoteAiRequest,
  RemoteAiGuardError,
} from '@/lib/remote-ai-guard';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { remoteAiPricingGateAccepted, remoteAiPricingUnavailable } from '@/lib/remote-ai-pricing-gate';
import { isColumbiaCardEntry } from '@/lib/sky-campus';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

function cardEntryResponse() {
  return Response.json(
    { error: 'Online research is not available from this card entry.', code: 'card_entry_restricted' },
    { status: 403, headers: noStoreHeaders },
  );
}

export async function POST(request: Request) {
  try {
    // The entry marker is part of the card's API URL contract. Reject it
    // before reading a body or initializing auth, pricing, or the provider so
    // an unauthenticated request cannot make this guard buffer request data.
    const requestUrl = new URL(request.url);
    const language = requestUrl.searchParams.get('lang') === 'en' ? 'en' : 'ja';
    if (requestUrl.searchParams.getAll('entry').some(isColumbiaCardEntry))
      return cardEntryResponse();
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'patent-research', db);
    if (!(await rockstarServiceScopeAllowed(
      db,
      owner,
      'sky',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
      env, request,
    ))) return missingRockstarServiceScope('Sky');
    if (!remoteAiPricingGateAccepted()) return remoteAiPricingUnavailable();
    const raw = await request.text();
    if (raw.length > 12_000) throw new Error('INVALID_INPUT');
    const input = validatePatentAiInput(JSON.parse(raw));
    const runtimeEnv = env as unknown as {
      OPENAI_API_KEY?: string;
      OPENAI_PATENT_MODEL?: string;
      SKY_REMOTE_LLM_ENABLED?: string;
    };
    if (runtimeEnv.SKY_REMOTE_LLM_ENABLED !== 'true')
      return Response.json(
        {
          error:
            'オンライン調査は停止中です。標準の端末内ドラフトを利用してください。',
          code: 'remote_disabled',
        },
        { status: 503, headers: noStoreHeaders },
      );
    if (!runtimeEnv.OPENAI_API_KEY)
      return Response.json(
        {
          error:
            '特許調査siはまだ接続されていません。検索式、データベース入口、書類ドラフトは利用できます。',
        },
        { status: 503, headers: noStoreHeaders },
      );

    const searchedAt = new Date().toISOString();
    const result = await createOpenAiResponse(
      buildPatentAiRequest(input, searchedAt.slice(0, 10), runtimeEnv.OPENAI_PATENT_MODEL, language),
      runtimeEnv,
    );
    let guidance;
    try { guidance = parsePatentAiResponse(result.payload, searchedAt); }
    catch { throw new LlmProviderError('UPSTREAM_UNCITED_RESPONSE', 502); }
    return Response.json({
      ...guidance,
      execution: {
        provider: 'openai', model: result.model, durationMs: result.durationMs,
        usage: result.usage, webSearchCalls: result.webSearchCalls,
      },
    }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof RemoteAiGuardError)
      return Response.json(
        {
          error:
            error.code === 'RATE_LIMITED'
              ? '利用上限に達しました。1分後に再試行してください。'
              : error.code === 'ORIGIN'
                ? 'このサイトから操作してください。'
                : 'サインインしてください。',
          code: error.code,
        },
        { status: error.status, headers: noStoreHeaders },
      );
    if (error instanceof LlmProviderError)
      return Response.json(
        {
          error: error.code === 'UPSTREAM_TIMEOUT'
            ? 'オンライン処理が時間内に完了しませんでした。結果と使用額が未確認のため自動再送していません。端末内の結果はそのまま利用できます。'
            : 'オンライン処理の結果を確認できません。端末内の結果と公式の情報源を利用してください。',
          code: error.code,
        },
        { status: error.status, headers: noStoreHeaders },
      );
    console.error(
      'patent research failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return Response.json(
      { error: '入力を確認して、もう一度お試しください。' },
      { status: 400, headers: noStoreHeaders },
    );
  }
}
