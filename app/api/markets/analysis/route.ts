import { NextRequest } from 'next/server';
import {
  MARKETS_ADAPTER_POLICY,
  readMarketAnalysis,
} from '@/lib/markets-adapter';

export async function GET(request: NextRequest) {
  const requested = Number(request.nextUrl.searchParams.get('limit') ?? 8);
  const limit = Number.isFinite(requested) ? requested : 8;
  try {
    const snapshot = await readMarketAnalysis(limit);
    return Response.json(
      { ok: true, ...snapshot },
      { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=20' } },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        code: 'live_market_data_unavailable',
        policy: MARKETS_ADAPTER_POLICY,
        markets: [],
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
