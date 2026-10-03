import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import {
  buildLegalAiRequest,
  parseLegalAiResponse,
  validateLegalAiInput,
} from '@/lib/legal-ai';
import { authorizeRemoteAiRequest } from '@/lib/remote-ai-guard';
import {
  requestResearchAi,
  researchAiErrorResponse,
  researchAiNoStoreHeaders as noStoreHeaders,
} from '@/lib/research-ai';

export async function POST(request: Request) {
  try {
    await authorizeRemoteAiRequest(request, 'legal-guidance', database());
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
    const payload = await requestResearchAi(
      buildLegalAiRequest(
        input,
        searchedAt.slice(0, 10),
        runtimeEnv.OPENAI_LEGAL_MODEL,
      ),
      runtimeEnv.OPENAI_API_KEY,
    );
    return Response.json(parseLegalAiResponse(payload, searchedAt), {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return researchAiErrorResponse(error, {
      logLabel: 'legal guidance',
      upstream: '法令AIを利用できません。公的案内から確認してください。',
    });
  }
}
