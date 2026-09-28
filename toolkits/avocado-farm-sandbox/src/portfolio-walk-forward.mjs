import { discoverRobinhoodPools } from "./gecko.mjs";
import {
  fetchPoolOhlcv,
  parseFeeBpsFromPoolName,
} from "./historical.mjs";
import { portfolioWalkForward } from "./portfolio-walk-forward-core.mjs";

const days = Number(process.env.BACKTEST_DAYS || 30);
const trainBars = Number(process.env.WF_TRAIN_BARS || 48);
const testBars = Number(process.env.WF_TEST_BARS || 24);
const maxCandles = Math.max(
  trainBars + testBars * 2,
  Math.min(24 * days, 24 * 180),
);
const targetPoolCount = Number(process.env.PORTFOLIO_POOL_LIMIT || 6);
const discoveryScanLimit = Number(
  process.env.PORTFOLIO_DISCOVERY_SCAN_LIMIT || 20,
);
const minTvlUsd = Number(process.env.PORTFOLIO_MIN_TVL_USD || 250_000);
const candidateRangesPct = String(
  process.env.RANGE_SWEEP_PCT || "8,12,20,30,50",
)
  .split(",")
  .map(Number)
  .filter((value) => Number.isFinite(value) && value > 0 && value < 100);

const discovered = await discoverRobinhoodPools({
  pages: Number(process.env.GECKO_PAGES || 1),
});

const universe = discovered
  .filter((pool) => pool.tvlUsd >= minTvlUsd && pool.spotPrice > 0)
  .sort((a, b) => {
    const aQuality = Math.log10(Math.max(1, a.tvlUsd)) +
      Math.log10(Math.max(1, a.volume24hUsd));
    const bQuality = Math.log10(Math.max(1, b.tvlUsd)) +
      Math.log10(Math.max(1, b.volume24hUsd));
    return bQuality - aQuality;
  })
  .slice(0, discoveryScanLimit);

const series = [];
const skipped = [];

for (const pool of universe) {
  if (series.length >= targetPoolCount) break;

  const name = pool.token0 + " / " + pool.token1;
  try {
    const candles = await fetchPoolOhlcv({
      poolAddress: pool.address,
      timeframe: "hour",
      aggregate: 1,
      maxCandles,
    });

    if (candles.length < Math.ceil(trainBars * 0.8) + 2) {
      skipped.push({
        pool: name,
        reason: `only ${candles.length} candles`,
      });
      continue;
    }

    const feeBps = parseFeeBpsFromPoolName(name, 30);
    series.push({
      id: pool.id,
      address: pool.address,
      name,
      dexId: pool.dexId,
      tvlUsd: pool.tvlUsd,
      feeBps,
      feeSource: /\d+(?:\.\d+)?%/.test(name)
        ? "pool-name"
        : "30bps-fallback",
      candles,
    });
  } catch (error) {
    skipped.push({
      pool: name,
      reason: String(error?.message ?? error),
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 125));
}

if (!series.length) {
  console.log(
    JSON.stringify(
      {
        discoveredPools: discovered.length,
        scannedPools: universe.length,
        skipped,
      },
      null,
      2,
    ),
  );
  throw new Error("No pool had enough historical candles");
}

const result = portfolioWalkForward(series, {
  candidateRangesPct,
  trainBars,
  testBars,
  startingCapitalUsd: Number(process.env.PAPER_TICKET_USD || 1_000),
  slippageBps: Number(process.env.REBALANCE_SLIPPAGE_BPS || 25),
  gasPerRebalanceUsd: Number(process.env.REBALANCE_GAS_USD || 0.35),
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

console.log("\nAvocado Farm — MULTI-POOL WALK-FORWARD PAPER TEST\n");
console.log(
  JSON.stringify(
    {
      discoveredPools: discovered.length,
      scannedUniverse: universe.length,
      targetPoolCount,
      testedPools: series.map((pool) => ({
        name: pool.name,
        dex: pool.dexId,
        tvlUsd: pool.tvlUsd,
        feeBps: pool.feeBps,
        feeSource: pool.feeSource,
        candles: pool.candles.length,
        start: new Date(pool.candles[0].timestamp * 1000).toISOString(),
        end: new Date(pool.candles.at(-1).timestamp * 1000).toISOString(),
      })),
      skipped,
      methodology: {
        trainBars,
        testBars,
        candidateRangesPct,
        rule:
          "At each decision timestamp, rank only pools with sufficient prior history. Pool and LP range are selected from past candles only. If no candidate passes the gate, stay in CASH for the next window.",
      },
      caveats: [
        "Historical OHLCV/volume are market data, but fee capture uses current TVL because historical active-liquidity distribution is not reconstructed.",
        "The pool universe is discovered from pools that exist now, so this test still has survivorship/universe-selection bias and can miss pools that disappeared before the run.",
        "Pools without an explicit fee tier in the current display name use a 30 bps fallback fee assumption.",
      ],
      summary: {
        startingCapitalUsd: result.startingCapitalUsd,
        finalEquityUsd: result.finalEquityUsd,
        pnlUsd: result.pnlUsd,
        returnPct: result.returnPct,
        totalBoundaryCostsUsd: result.totalBoundaryCostsUsd,
        lpFolds: result.lpFolds,
        cashFolds: result.cashFolds,
        poolSelections: result.poolSelections,
      },
    },
    null,
    2,
  ),
);

console.table(
  result.folds.map((fold) => ({
    fold: fold.fold,
    decision: new Date(fold.decisionTime * 1000).toISOString().slice(5, 13),
    action: fold.action,
    pool: fold.selectedPoolName ?? "CASH",
    range: fold.selectedRangePct ? "±" + fold.selectedRangePct + "%" : "-",
    candidates: fold.candidateCount,
    trainReturn:
      fold.trainingReturnPct === undefined
        ? "-"
        : fold.trainingReturnPct.toFixed(2) + "%",
    testPnl: fold.testPnlUsd.toFixed(2),
    ending: fold.endingCapitalUsd.toFixed(2),
  })),
);
