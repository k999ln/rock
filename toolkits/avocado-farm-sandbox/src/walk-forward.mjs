import { fetchPoolMetadata, fetchPoolOhlcv } from "./historical.mjs";
import { walkForwardRangeStrategy } from "./walk-forward-core.mjs";

const DEFAULT_ORBIO_USDG =
  "0xea9f200e13055b82f175f44f592c4c13dd8c9d9320a66487d3c5cd90d68550ef";

const poolAddress = process.env.POOL_ADDRESS || DEFAULT_ORBIO_USDG;
const days = Number(process.env.BACKTEST_DAYS || 30);
const maxCandles = Math.max(72, Math.min(24 * days, 24 * 180));
const metadata = await fetchPoolMetadata({ poolAddress });
const candles = await fetchPoolOhlcv({
  poolAddress,
  timeframe: "hour",
  aggregate: 1,
  maxCandles,
});

const candidateRangesPct = String(
  process.env.RANGE_SWEEP_PCT || "6,8,12,16,20,30,50",
)
  .split(",")
  .map(Number)
  .filter((x) => Number.isFinite(x) && x > 0 && x < 100);

const result = walkForwardRangeStrategy(candles, {
  candidateRangesPct,
  trainBars: Number(process.env.WF_TRAIN_BARS || 48),
  testBars: Number(process.env.WF_TEST_BARS || 24),
  startingCapitalUsd: Number(process.env.PAPER_TICKET_USD || 1_000),
  feeBps: Number(process.env.POOL_FEE_BPS || metadata.feeBps),
  tvlUsd: Number(process.env.TVL_USD || metadata.tvlUsd),
  slippageBps: Number(process.env.REBALANCE_SLIPPAGE_BPS || 25),
  gasPerRebalanceUsd: Number(process.env.REBALANCE_GAS_USD || 0.35),
  chargeBoundaryReposition: true,
});

console.log("\nAvocado Farm — WALK-FORWARD PAPER TEST\n");
console.log(JSON.stringify({
  pool: metadata,
  candles: candles.length,
  dataStart: new Date(candles[0].timestamp * 1000).toISOString(),
  dataEnd: new Date(candles.at(-1).timestamp * 1000).toISOString(),
  methodology: {
    trainingBars: Number(process.env.WF_TRAIN_BARS || 48),
    nextBars: Number(process.env.WF_TEST_BARS || 24),
    candidateRangesPct,
    rule:
      "At each fold, choose the range using only the immediately preceding training window, then trade only the following unseen window. Re-centering between folds is charged slippage + gas.",
  },
  caveat:
    "OHLCV/volume are historical market data. Fee capture is modeled with current TVL and does not reconstruct historical active-liquidity distribution.",
  summary: {
    startingCapitalUsd: result.startingCapitalUsd,
    finalEquityUsd: result.finalEquityUsd,
    pnlUsd: result.pnlUsd,
    returnPct: result.returnPct,
    totalBoundaryCostsUsd: result.totalBoundaryCostsUsd,
    outOfSampleCandles: result.outOfSampleCandles,
    outOfSampleStart: new Date(result.outOfSampleStart * 1000).toISOString(),
    outOfSampleEnd: new Date(result.outOfSampleEnd * 1000).toISOString(),
    bestFixedHindsight: {
      rangeHalfWidthPct: result.bestFixedHindsightBenchmark.rangeHalfWidthPct,
      finalEquityUsd: result.bestFixedHindsightBenchmark.finalEquityUsd,
      pnlUsd: result.bestFixedHindsightBenchmark.pnlUsd,
      returnPct: result.bestFixedHindsightBenchmark.returnPct,
    },
    fixed12Pct: result.fixedDefault12Pct
      ? {
          finalEquityUsd: result.fixedDefault12Pct.finalEquityUsd,
          pnlUsd: result.fixedDefault12Pct.pnlUsd,
          returnPct: result.fixedDefault12Pct.returnPct,
        }
      : null,
  },
}, null, 2));

console.table(
  result.folds.map((f) => ({
    fold: f.fold,
    train:
      new Date(f.trainStart * 1000).toISOString().slice(5, 13) +
      "→" +
      new Date(f.trainEnd * 1000).toISOString().slice(5, 13),
    test:
      new Date(f.testStart * 1000).toISOString().slice(5, 13) +
      "→" +
      new Date(f.testEnd * 1000).toISOString().slice(5, 13),
    chosen: "±" + f.selectedRangePct + "%",
    trainReturn: f.trainingReturnPct.toFixed(2) + "%",
    testPnl: f.testPnlUsd.toFixed(2),
    testReturn: f.testReturnPct.toFixed(2) + "%",
    ending: f.endingCapitalUsd.toFixed(2),
    rebalances: f.testRebalances,
    maxDD: f.testMaxDrawdownPct.toFixed(2) + "%",
  })),
);
