export const ROCKSTAR_MARKETS_ORIGIN =
  'https://rockstaros-markets.higgsfield.app';

export const MARKETS_ADAPTER_POLICY = {
  mode: 'analysis_only',
  executionEnabled: false,
  countsAsFundRevenue: false,
  revenueRecognition: 'provider_confirmed_realized_pnl_only',
} as const;

export type MarketAnalysis = {
  id: string;
  question: string;
  slug: string;
  probability: number;
  volume: number;
  liquidity: number;
  source: 'live';
};

type Fetcher = typeof fetch;

function finite(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return number;
}

export function normalizeMarketAnalysis(value: unknown): MarketAnalysis | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  const question = typeof item.question === 'string' ? item.question.trim() : '';
  const probability = finite(item.probability);
  if (!id || !question || probability > 1 || item.source !== 'live') return null;
  return {
    id,
    question,
    slug: typeof item.slug === 'string' ? item.slug : '',
    probability,
    volume: finite(item.volume),
    liquidity: finite(item.liquidity),
    source: 'live',
  };
}

export async function readMarketAnalysis(
  limit: number,
  fetcher: Fetcher = fetch,
) {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(12, Math.max(1, Math.trunc(limit)))
    : 8;
  const response = await fetcher(
    `${ROCKSTAR_MARKETS_ORIGIN}/api/markets?limit=${safeLimit}`,
    {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (!response.ok) throw new Error('MARKETS_ADAPTER_UPSTREAM_UNAVAILABLE');
  const payload = (await response.json()) as {
    source?: unknown;
    markets?: unknown;
    fetchedAt?: unknown;
  };
  if (payload.source !== 'live' || !Array.isArray(payload.markets))
    throw new Error('MARKETS_ADAPTER_LIVE_DATA_REQUIRED');
  const markets = payload.markets
    .map(normalizeMarketAnalysis)
    .filter((market): market is MarketAnalysis => market !== null)
    .slice(0, safeLimit);
  if (!markets.length) throw new Error('MARKETS_ADAPTER_EMPTY');
  return {
    schema: 'rockstaros-market-analysis/1' as const,
    policy: MARKETS_ADAPTER_POLICY,
    source: 'polymarket-live' as const,
    fetchedAt:
      typeof payload.fetchedAt === 'string' &&
      !Number.isNaN(Date.parse(payload.fetchedAt))
        ? payload.fetchedAt
        : new Date().toISOString(),
    markets,
  };
}
