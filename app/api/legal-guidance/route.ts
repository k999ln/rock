import { env } from 'cloudflare:workers';
import {
  buildLegalAiRequest,
  parseLegalAiResponse,
  validateLegalAiInput,
} from '@/lib/legal-ai';
import {
  authorizeRemoteAiRequest,
  RemoteAiGuardError,
} from '@/lib/remote-ai-guard';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    await authorizeRemoteAiRequest(request, 'legal-guidance');
    const raw = await request.text();
    if (raw.length > 4_000) throw new Error('INVALID_INPUT');
    const input = validateLegalAiInput(JSON.parse(raw));
    if (input.immediateDanger)
      return Response.json(
        {
          error: 'AI回答を待たず、安全な場所へ移動して911へ連絡してください。',
        },
        { status: 409, headers: noStoreHeaders },
      );

    const runtimeEnv = env as unknown as {
      OPENAI_API_KEY?: string;
      OPENAI_LEGAL_MODEL?: string;
      SKY_REMOTE_LLM_ENABLED?: string;
    };
    if (runtimeEnv.SKY_REMOTE_LLM_ENABLED !== 'true')
      return Response.json(
        {
          error:
            'オンライン検索は停止中です。標準の端末内ガイドを利用してください。',
          code: 'remote_disabled',
        },
        { status: 503, headers: noStoreHeaders },
      );
    if (!runtimeEnv.OPENAI_API_KEY)
      return Response.json(
        {
          error:
            '法令AIはまだ接続されていません。画面の公的案内と弁護士ルートは利用できます。',
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
        buildLegalAiRequest(
          input,
          searchedAt.slice(0, 10),
          runtimeEnv.OPENAI_LEGAL_MODEL,
        ),
      ),
    });
    const payload = (await upstream.json()) as unknown;
    if (!upstream.ok) {
      console.error('legal guidance upstream failed', upstream.status);
      return Response.json(
        { error: '法令AIを利用できません。公的案内から確認してください。' },
        { status: 502, headers: noStoreHeaders },
      );
    }
    return Response.json(parseLegalAiResponse(payload, searchedAt), {
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
      'legal guidance failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return Response.json(
      { error: '入力を確認して、もう一度お試しください。' },
      { status: 400, headers: noStoreHeaders },
    );
  }
}
