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

const ranges = String(process.env.RANGE_SWEEP_PCT || "6,8,12,16,20,30,50")
  .split(",")
  .map(Number)
  .filter((x) => Number.isFinite(x) && x > 0 && x < 100);

const common = {
  startingCapitalUsd: Number(process.env.PAPER_TICKET_USD || 1_000),
  feeBps: Number(process.env.POOL_FEE_BPS || metadata.feeBps),
  tvlUsd: Number(process.env.TVL_USD || metadata.tvlUsd),
  slippageBps: Number(process.env.REBALANCE_SLIPPAGE_BPS || 25),
  gasPerRebalanceUsd: Number(process.env.REBALANCE_GAS_USD || 0.35),
};

const results = ranges
  .map((rangeHalfWidthPct) =>
    backtestConcentratedLp(candles, { ...common, rangeHalfWidthPct }),
  )
  .sort((a,b)=>b.finalEquityUsd-a.finalEquityUsd);

console.log("\nAvocado Farm — HISTORICAL RANGE SWEEP\n");
console.log(JSON.stringify({
  pool: metadata,
  candles: candles.length,
  start: new Date(candles[0].timestamp * 1000).toISOString(),
  end: new Date(candles.at(-1).timestamp * 1000).toISOString(),
  caveat:
    "OHLCV/volume are historical market data. Fee capture is modeled with current TVL and does not reconstruct historical active-liquidity distribution.",
}, null, 2));
console.table(results.map((r)=>({
  range: "±"+r.rangeHalfWidthPct+"%",
  finalUsd: r.finalEquityUsd.toFixed(2),
  pnlUsd: r.pnlUsd.toFixed(2),
  returnPct: r.returnPct.toFixed(2)+"%",
  fees: r.totalModeledFeesUsd.toFixed(2),
  costs: r.totalRebalanceCostsUsd.toFixed(2),
  rebalances: r.rebalances,
  maxDD: r.maxDrawdownPct.toFixed(2)+"%",
  inRange: r.inRangePct.toFixed(1)+"%",
  vsHoldUsd: r.excessVsInitialHoldUsd.toFixed(2),
})));
