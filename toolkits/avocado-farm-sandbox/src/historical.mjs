const API_BASE = "https://api.geckoterminal.com/api/v2";

let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttle() {
  const minIntervalMs = Number(process.env.GECKO_MIN_INTERVAL_MS || 0);
  if (!(minIntervalMs > 0)) return;
  const waitMs = Math.max(0, lastRequestAt + minIntervalMs - Date.now());
  if (waitMs > 0) await sleep(waitMs);
  lastRequestAt = Date.now();
}

async function getJson(url, fetchImpl = fetch) {
  const maxAttempts = Number(process.env.GECKO_MAX_ATTEMPTS || 6);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await throttle();
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "user-agent": "avocado-farm-sandbox/0.1",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (response.ok) return response.json();

    const body = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`GeckoTerminal HTTP ${response.status}: ${body}`);
    }

    const retryAfter = Number(response.headers?.get?.("retry-after"));
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(30_000, 2_000 * 2 ** (attempt - 1));
    await sleep(backoffMs);
  }

  throw new Error("GeckoTerminal request exhausted retries");
}

export function parseFeeBpsFromPoolName(name, fallbackBps = 30) {
  const matches = [...String(name ?? "").matchAll(/(\d+(?:\.\d+)?)%/g)];
  if (!matches.length) return fallbackBps;
  const pct = Number(matches.at(-1)[1]);
  return Number.isFinite(pct) ? pct * 100 : fallbackBps;
}

export async function fetchPoolMetadata({
  network = "robinhood",
  poolAddress,
  fetchImpl = fetch,
} = {}) {
  const url = `${API_BASE}/networks/${network}/pools/${poolAddress}`;
  const payload = await getJson(url, fetchImpl);
  const attributes = payload?.data?.attributes ?? {};
  return {
    address: attributes.address ?? poolAddress,
    name: attributes.name ?? "UNKNOWN",
    tvlUsd: Number(attributes.reserve_in_usd ?? 0),
    spotPriceUsd: Number(attributes.base_token_price_usd ?? 0),
    volume24hUsd: Number(attributes.volume_usd?.h24 ?? 0),
    poolCreatedAt: attributes.pool_created_at ?? null,
    feeBps: parseFeeBpsFromPoolName(attributes.name, 30),
  };
}

export function normalizeOhlcvList(list) {
  const out = [];
  for (const row of list ?? []) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [timestamp, open, high, low, close, volume] = row.map(Number);
    if (
      !Number.isFinite(timestamp) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume)
    ) continue;
    out.push({ timestamp, open, high, low, close, volumeUsd: volume });
  }
  return out;
}

export async function fetchPoolOhlcv({
  network = "robinhood",
  poolAddress,
  timeframe = "hour",
  aggregate = 1,
  maxCandles = 720,
  beforeTimestamp = Math.floor(Date.now() / 1000),
  token = "base",
  fetchImpl = fetch,
} = {}) {
  const byTimestamp = new Map();
  let cursor = beforeTimestamp;

  while (byTimestamp.size < maxCandles) {
    const remaining = maxCandles - byTimestamp.size;
    const limit = Math.min(100, remaining);
    const params = new URLSearchParams({
      aggregate: String(aggregate),
      before_timestamp: String(cursor),
      limit: String(limit),
      currency: "usd",
      token,
      include_empty_intervals: "false",
    });
    const url =
      `${API_BASE}/networks/${network}/pools/${poolAddress}/ohlcv/${timeframe}?${params}`;
    const payload = await getJson(url, fetchImpl);
    const batch = normalizeOhlcvList(payload?.data?.attributes?.ohlcv_list);
    if (!batch.length) break;

    for (const candle of batch) byTimestamp.set(candle.timestamp, candle);

    const oldest = Math.min(...batch.map((x) => x.timestamp));
    if (!Number.isFinite(oldest) || oldest >= cursor) break;
    cursor = oldest - 1;

    if (batch.length < limit) break;
  }

  return [...byTimestamp.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-maxCandles);
}


export function derivePairOhlcv(baseUsdCandles, quoteUsdCandles) {
  const quoteByTimestamp = new Map(
    (quoteUsdCandles ?? []).map((candle) => [candle.timestamp, candle]),
  );
  const out = [];

  for (const base of baseUsdCandles ?? []) {
    const quote = quoteByTimestamp.get(base.timestamp);
    if (!quote) continue;
    if (
      !(quote.open > 0) ||
      !(quote.high > 0) ||
      !(quote.low > 0) ||
      !(quote.close > 0)
    ) {
      continue;
    }

    out.push({
      timestamp: base.timestamp,
      open: base.open / quote.open,
      high: base.high / quote.low,
      low: base.low / quote.high,
      close: base.close / quote.close,
      volumeUsd: base.volumeUsd,
      quoteUsdOpen: quote.open,
      quoteUsdHigh: quote.high,
      quoteUsdLow: quote.low,
      quoteUsdClose: quote.close,
      baseUsdOpen: base.open,
      baseUsdHigh: base.high,
      baseUsdLow: base.low,
      baseUsdClose: base.close,
    });
  }

  return out.sort((a, b) => a.timestamp - b.timestamp);
}

export function withStableUsdQuote(candles) {
  return (candles ?? []).map((candle) => ({
    ...candle,
    quoteUsdOpen: 1,
    quoteUsdHigh: 1,
    quoteUsdLow: 1,
    quoteUsdClose: 1,
    baseUsdOpen: candle.open,
    baseUsdHigh: candle.high,
    baseUsdLow: candle.low,
    baseUsdClose: candle.close,
  }));
}

export async function fetchPoolPairOhlcv({
  network = "robinhood",
  poolAddress,
  timeframe = "hour",
  aggregate = 1,
  maxCandles = 720,
  beforeTimestamp = Math.floor(Date.now() / 1000),
  quoteIsUsdStable = false,
  fetchImpl = fetch,
} = {}) {
  const baseUsd = await fetchPoolOhlcv({
    network,
    poolAddress,
    timeframe,
    aggregate,
    maxCandles,
    beforeTimestamp,
    token: "base",
    fetchImpl,
  });

  if (quoteIsUsdStable) return withStableUsdQuote(baseUsd);

  const quoteUsd = await fetchPoolOhlcv({
    network,
    poolAddress,
    timeframe,
    aggregate,
    maxCandles,
    beforeTimestamp,
    token: "quote",
    fetchImpl,
  });

  return derivePairOhlcv(baseUsd, quoteUsd);
}

export function inferQuoteSymbol(poolName) {
  const raw = String(poolName ?? "").split("/")[1]?.trim() ?? "";
  return raw.replace(/\s+\d+(?:\.\d+)?%\s*$/, "").trim().toUpperCase();
}

export function isUsdStableSymbol(symbol) {
  return new Set([
    "USDG",
    "USDC",
    "USDT",
    "DAI",
    "USDS",
    "USD1",
    "USDE",
    "PYUSD",
    "FRAX",
  ]).has(String(symbol ?? "").toUpperCase());
}
