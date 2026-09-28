const API_BASE = "https://api.geckoterminal.com/api/v2";
export const ROBINHOOD_GECKO_NETWORK = "robinhood";

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function normalizeGeckoPool(row, { defaultFeeBps = 30 } = {}) {
  const a = row?.attributes ?? {};
  const r = row?.relationships ?? {};
  const h24 = a.transactions?.h24 ?? {};
  const createdMs = a.pool_created_at ? Date.parse(a.pool_created_at) : NaN;
  const ageMinutes = Number.isFinite(createdMs)
    ? Math.max(0, (Date.now() - createdMs) / 60_000)
    : Number.POSITIVE_INFINITY;
  const pair = String(a.name ?? row?.id ?? "UNKNOWN/UNKNOWN")
    .split("/")[0]
    .trim()
    .split(/\s+/)[0];
  const quote = String(a.name ?? "")
    .split("/")[1]
    ?.trim()
    .split(/\s+/)[0] ?? "UNKNOWN";

  return {
    id: row?.id ?? a.address ?? "unknown",
    address: a.address ?? String(row?.id ?? "").split("_").slice(1).join("_"),
    dexId: r.dex?.data?.id ?? null,
    token0: pair || "UNKNOWN",
    token1: quote || "UNKNOWN",
    spotPrice: number(a.base_token_price_usd),
    tvlUsd: number(a.reserve_in_usd),
    volume24hUsd: number(a.volume_usd?.h24),
    trades24h: number(h24.buys) + number(h24.sells),
    realizedVol24hPct: Math.abs(number(a.price_change_percentage?.h24)),
    ageMinutes,
    rewardAprPct: 0,
    feeBps: defaultFeeBps,
    feeSource: "assumption",
    slippageBps: 25,
    tokenRisk: 0.35,
    liquidityRisk: 0.25,
    estimatedRebalanceGasUsd: 0.35,
    source: "geckoterminal",
  };
}

async function getJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": "avocado-farm-sandbox/0.1",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`GeckoTerminal HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function discoverRobinhoodPools({
  fetchImpl = fetch,
  network = ROBINHOOD_GECKO_NETWORK,
  pages = 1,
  defaultFeeBps = 30,
} = {}) {
  const urls = [];
  for (let page = 1; page <= pages; page += 1) {
    urls.push(
      `${API_BASE}/networks/${network}/trending_pools?page=${page}`,
      `${API_BASE}/networks/${network}/new_pools?page=${page}`,
    );
  }

  const payloads = await Promise.all(urls.map((url) => getJson(url, fetchImpl)));
  const seen = new Set();
  const pools = [];

  for (const payload of payloads) {
    for (const row of payload?.data ?? []) {
      const normalized = normalizeGeckoPool(row, { defaultFeeBps });
      const key = normalized.address.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      pools.push(normalized);
    }
  }
  return pools;
}
