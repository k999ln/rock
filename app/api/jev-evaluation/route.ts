import { experimental_evaluate as evaluate } from 'ai';
import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import {
  JEV_MODEL,
  JEV_RUBRICS,
  makeJevReceipt,
  validateJevEvaluationInput,
} from '@/lib/jev-evaluation';
import {
  authorizeRemoteAiRequest,
  RemoteAiGuardError,
} from '@/lib/remote-ai-guard';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    await authorizeRemoteAiRequest(request, 'jev-evaluation', database());
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
    const result = await evaluate({
      model: JEV_MODEL,
      state: input.state,
      questions: JEV_RUBRICS[input.rubricId],
      maxRetries: 0,
      headers: { Authorization: `Bearer ${runtimeEnv.AI_GATEWAY_API_KEY}` },
      providerOptions: { gateway: { zeroDataRetention: true } },
    });
    const receipt = await makeJevReceipt(requestId, input, result);
    return Response.json(receipt, { headers: noStoreHeaders });
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
    console.error(
      'jev evaluation failed',
      error instanceof Error ? error.message : 'unknown',
    );
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
