import { fetchPoolMetadata, fetchPoolOhlcv } from "./historical.mjs";
import { backtestConcentratedLp } from "./clmm-backtest.mjs";

const DEFAULT_ORBIO_USDG =
  "0xea9f200e13055b82f175f44f592c4c13dd8c9d9320a66487d3c5cd90d68550ef";

const poolAddress = process.env.POOL_ADDRESS || DEFAULT_ORBIO_USDG;
const days = Number(process.env.BACKTEST_DAYS || 30);
const maxCandles = Math.max(24, Math.min(24 * days, 24 * 180));
const metadata = await fetchPoolMetadata({ poolAddress });
const candles = await fetchPoolOhlcv({
  poolAddress,
  timeframe: "hour",
  aggregate: 1,
  maxCandles,
});

const result = backtestConcentratedLp(candles, {
  startingCapitalUsd: Number(process.env.PAPER_TICKET_USD || 1_000),
  rangeHalfWidthPct: Number(process.env.RANGE_HALF_WIDTH_PCT || 12),
  feeBps: Number(process.env.POOL_FEE_BPS || metadata.feeBps),
  tvlUsd: Number(process.env.TVL_USD || metadata.tvlUsd),
  slippageBps: Number(process.env.REBALANCE_SLIPPAGE_BPS || 25),
  gasPerRebalanceUsd: Number(process.env.REBALANCE_GAS_USD || 0.35),
});

console.log("\nAvocado Farm — HISTORICAL PAPER BACKTEST\n");
console.log(JSON.stringify({
  pool: metadata,
  requestedDays: days,
  caveat:
    "Historical OHLCV and volume are real market data; LP fee share is modeled using current TVL because historical active-liquidity distribution is unavailable from this feed.",
  result: {
    ...result,
    start: new Date(result.startTimestamp * 1000).toISOString(),
    end: new Date(result.endTimestamp * 1000).toISOString(),
  },
}, null, 2));
