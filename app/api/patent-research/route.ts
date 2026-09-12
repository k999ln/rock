import { env } from 'cloudflare:workers';
import {
  buildPatentAiRequest,
  parsePatentAiResponse,
  validatePatentAiInput,
} from '@/lib/patent-ai';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return Response.json(
        { error: 'このサイトから操作してください。' },
        { status: 403, headers: noStoreHeaders },
      );
    const raw = await request.text();
    if (raw.length > 12_000) throw new Error('INVALID_INPUT');
    const input = validatePatentAiInput(JSON.parse(raw));
    const runtimeEnv = env as unknown as {
      OPENAI_API_KEY?: string;
      OPENAI_PATENT_MODEL?: string;
    };
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
