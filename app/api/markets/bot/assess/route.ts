import { assessPolymarketBotBacktest } from '@/lib/polymarket-bot-adapter';

const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return Response.json(
        { ok: false, code: 'same_origin_required' },
        { status: 403, headers },
      );
    if (!request.headers.get('content-type')?.includes('application/json'))
      return Response.json(
        { ok: false, code: 'json_required' },
        { status: 415, headers },
      );
    const raw = await request.text();
    if (!raw || raw.length > 64_000) throw new Error('INVALID_REPORT_SIZE');
    return Response.json(assessPolymarketBotBacktest(JSON.parse(raw)), {
      headers,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_REPORT';
    return Response.json(
      { ok: false, code },
      { status: 400, headers },
    );
  }
}
