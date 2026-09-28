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

const common = {
  candidateRangesPct,
  trainBars: Number(process.env.WF_TRAIN_BARS || 48),
  testBars: Number(process.env.WF_TEST_BARS || 24),
  startingCapitalUsd: Number(process.env.PAPER_TICKET_USD || 1_000),
  feeBps: Number(process.env.POOL_FEE_BPS || metadata.feeBps),
  tvlUsd: Number(process.env.TVL_USD || metadata.tvlUsd),
  slippageBps: Number(process.env.REBALANCE_SLIPPAGE_BPS || 25),
  gasPerRebalanceUsd: Number(process.env.REBALANCE_GAS_USD || 0.35),
  chargeBoundaryReposition: true,
};

const alwaysEnter = walkForwardRangeStrategy(candles, {
  ...common,
  allowCash: false,
});

const gated = walkForwardRangeStrategy(candles, {
  ...common,
  allowCash: true,
  entryGate: {
    minTrainingReturnPct: Number(process.env.WF_MIN_TRAIN_RETURN_PCT || 0.5),
    maxTrainingDrawdownPct: Number(process.env.WF_MAX_TRAIN_DD_PCT || 30),
    maxTrainingRebalancesPerDay: Number(
      process.env.WF_MAX_REBALANCES_PER_DAY || 4,
    ),
    minVolumeTvlPerDay: Number(process.env.WF_MIN_VOLUME_TVL_PER_DAY || 0.05),
    maxVolToRangeRatio: Number(process.env.WF_MAX_VOL_RANGE_RATIO || 1.5),
    maxTrendToRangeRatio: Number(process.env.WF_MAX_TREND_RANGE_RATIO || 1.75),
  },
});

const slim = (result) => ({
  startingCapitalUsd: result.startingCapitalUsd,
  finalEquityUsd: result.finalEquityUsd,
  pnlUsd: result.pnlUsd,
  returnPct: result.returnPct,
  totalBoundaryCostsUsd: result.totalBoundaryCostsUsd,
  lpFolds: result.lpFolds,
  cashFolds: result.cashFolds,
});

console.log("\nAvocado Farm — REGIME-GATED WALK-FORWARD PAPER TEST\n");
console.log(
  JSON.stringify(
    {
      pool: metadata,
      candles: candles.length,
      dataStart: new Date(candles[0].timestamp * 1000).toISOString(),
      dataEnd: new Date(candles.at(-1).timestamp * 1000).toISOString(),
      methodology: {
        trainingBars: common.trainBars,
        nextBars: common.testBars,
        candidateRangesPct,
        rule:
          "Each fold uses only prior candles. The gated strategy can stay in CASH when the trailing training edge/risk/volume/volatility/trend tests fail. No future candle is used for that decision.",
      },
      caveat:
        "OHLCV/volume are historical market data. Fee capture is modeled with current TVL and does not reconstruct historical active-liquidity distribution.",
      comparison: {
        alwaysEnter: slim(alwaysEnter),
        regimeGated: slim(gated),
        bestFixedHindsight: {
          rangeHalfWidthPct:
            gated.bestFixedHindsightBenchmark.rangeHalfWidthPct,
          finalEquityUsd:
            gated.bestFixedHindsightBenchmark.finalEquityUsd,
          returnPct: gated.bestFixedHindsightBenchmark.returnPct,
        },
        fixed12Pct: gated.fixedDefault12Pct
          ? {
              finalEquityUsd: gated.fixedDefault12Pct.finalEquityUsd,
              returnPct: gated.fixedDefault12Pct.returnPct,
            }
          : null,
      },
    },
    null,
    2,
  ),
);

console.table(
  gated.folds.map((f) => ({
    fold: f.fold,
    action: f.action,
    candidate: "±" + f.candidateRangePct + "%",
    chosen: f.selectedRangePct ? "±" + f.selectedRangePct + "%" : "CASH",
    trainReturn: f.trainingReturnPct.toFixed(2) + "%",
    trainDD: f.trainingMaxDrawdownPct.toFixed(2) + "%",
    trend: f.regime.trendPct.toFixed(1) + "%",
    dailyVol: f.regime.realizedVolDailyPct.toFixed(1) + "%",
    volumeTVL: f.regime.volumeTvlPerDay.toFixed(2) + "x/day",
    testPnl: f.testPnlUsd.toFixed(2),
    ending: f.endingCapitalUsd.toFixed(2),
    reason: f.gateReasons.join(" | "),
  })),
);
