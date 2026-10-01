import { env } from 'cloudflare:workers';
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

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    await authorizeRemoteAiRequest(request, 'patent-research', database());
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
            '特許調査AIはまだ接続されていません。検索式、データベース入口、書類ドラフトは利用できます。',
        },
        { status: 503, headers: noStoreHeaders },
      );

    const searchedAt = new Date().toISOString();
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${runtimeEnv.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildPatentAiRequest(
          input,
          searchedAt.slice(0, 10),
          runtimeEnv.OPENAI_PATENT_MODEL,
        ),
      ),
    });
    const payload = (await upstream.json()) as unknown;
    if (!upstream.ok) {
      console.error('patent research upstream failed', upstream.status);
      return Response.json(
        {
          error:
            '特許調査AIを利用できません。検索式を使って公式データベースを確認してください。',
        },
        { status: 502, headers: noStoreHeaders },
      );
    }
    return Response.json(parsePatentAiResponse(payload, searchedAt), {
      headers: noStoreHeaders,
    });
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
      'patent research failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return Response.json(
      { error: '入力を確認して、もう一度お試しください。' },
      { status: 400, headers: noStoreHeaders },
    );
  }
}
