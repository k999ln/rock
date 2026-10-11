import { SensitiveDataBlockedError } from '@/toolkits/spider-guard/detector.mjs';
import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import {
  JEV_RUBRICS,
  makeJevReceipt,
  validateJevEvaluationInput,
} from '@/lib/jev-evaluation';
import { evaluateJev } from '@/lib/jev-transport';
import {
  authorizeRemoteAiRequest,
  RemoteAiGuardError,
} from '@/lib/remote-ai-guard';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { remoteAiPricingGateAccepted, remoteAiPricingUnavailable } from '@/lib/remote-ai-pricing-gate';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'jev-evaluation', db);
    if (!(await rockstarServiceScopeAllowed(
      db,
      owner,
      'sky',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
      env, request,
    ))) return missingRockstarServiceScope('Sky');
    if (!remoteAiPricingGateAccepted()) return remoteAiPricingUnavailable();
    const raw = await request.text();
    if (raw.length > 8_000) throw new Error('INVALID_INPUT');
    const input = validateJevEvaluationInput(JSON.parse(raw));
    const runtimeEnv = env as unknown as {
      AI_GATEWAY_API_KEY?: string;
      SKY_REMOTE_LLM_ENABLED?: string;
    };
    if (runtimeEnv.SKY_REMOTE_LLM_ENABLED !== 'true')
      return Response.json(
        {
          error:
            'Jevは現在オフラインモードです。評価対象を外部へ送信せず、本人が確認してください。',
          code: 'remote_disabled',
        },
        { status: 503, headers: noStoreHeaders },
      );
    if (!runtimeEnv.AI_GATEWAY_API_KEY)
      return Response.json(
        {
          error:
            'Jev評価はまだ接続されていません。入力は送信せず、内容を本人が確認してください.',
          code: 'unavailable',
        },
        { status: 503, headers: noStoreHeaders },
      );

    const requestId = crypto.randomUUID();
    const result = await evaluateJev({
      apiKey: runtimeEnv.AI_GATEWAY_API_KEY,
      state: input.state,
      questions: JEV_RUBRICS[input.rubricId],
    });
    const receipt = await makeJevReceipt(requestId, input, result);
    return Response.json(receipt, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof SensitiveDataBlockedError)
      return Response.json(
        {
          error:
            'Spider Guardが機密情報の外部送信を止めました。内容を取り除いて再試行してください。',
          code: error.code,
          count: error.count,
          kinds: error.kinds,
        },
        { status: error.status, headers: noStoreHeaders },
      );
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
    console.error('jev evaluation failed', 'UPSTREAM_OR_INPUT_ERROR');
    return Response.json(
      {
        error:
          'Jev評価を利用できません。入力を送信せず、内容を本人が確認してください。',
        code: 'unavailable',
      },
      { status: 502, headers: noStoreHeaders },
    );
  }
}
