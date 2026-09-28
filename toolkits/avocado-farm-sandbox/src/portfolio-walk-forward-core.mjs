import { backtestConcentratedLp } from "./clmm-backtest.mjs";
import { chooseRangeFromHistory } from "./walk-forward-core.mjs";
import { evaluateEntryGate, summarizeRegime } from "./regime.mjs";

const HOUR = 3600;

function inWindow(candles, startInclusive, endExclusive) {
  return candles.filter(
    (candle) =>
      candle.timestamp >= startInclusive && candle.timestamp < endExclusive,
  );
}

function riskAdjustedTrainingScore(selected, regime) {
  const result = selected.result;
  const days = Math.max(
    1 / 24,
    (result.endTimestamp - result.startTimestamp) / 86_400,
  );
  const rebalancesPerDay = result.rebalances / days;
  const volumeBonus = Math.min(3, regime.volumeTvlPerDay) * 0.25;

  return (
    result.returnPct -
    result.maxDrawdownPct * 0.35 -
    rebalancesPerDay * 0.5 +
    volumeBonus
  );
}

export function portfolioWalkForward(
  poolSeries,
  {
    candidateRangesPct = [8, 12, 20, 30, 50],
    trainBars = 48,
    testBars = 24,
    startingCapitalUsd = 1_000,
    slippageBps = 25,
    gasPerRebalanceUsd = 0.35,
    minTrainCoverage = 0.8,
    minTestCoverage = 0.75,
    entryGate = {},
  } = {},
) {
  const series = (poolSeries ?? [])
    .map((pool) => ({
      ...pool,
      candles: [...(pool.candles ?? [])].sort(
        (a, b) => a.timestamp - b.timestamp,
      ),
    }))
    .filter((pool) => pool.candles.length >= Math.ceil(trainBars * minTrainCoverage));

  if (!series.length) throw new Error("No eligible pool history");

  const minTimestamp = Math.min(
    ...series.map((pool) => pool.candles[0].timestamp),
  );
  const maxTimestamp = Math.max(
    ...series.map((pool) => pool.candles.at(-1).timestamp),
  );

  let decisionTime = minTimestamp + trainBars * HOUR;
  let capitalUsd = startingCapitalUsd;
  let totalBoundaryCostsUsd = 0;
  const folds = [];

  while (decisionTime < maxTimestamp - HOUR) {
    const testEnd = Math.min(maxTimestamp + HOUR, decisionTime + testBars * HOUR);
    const candidates = [];

    for (const pool of series) {
      const history = inWindow(
        pool.candles,
        decisionTime - trainBars * HOUR,
        decisionTime,
      );
      const evaluation = inWindow(pool.candles, decisionTime, testEnd);

      if (history.length < Math.ceil(trainBars * minTrainCoverage)) continue;
      const expectedTestBars = Math.max(
        2,
        Math.round((testEnd - decisionTime) / HOUR),
      );
      if (evaluation.length < Math.ceil(expectedTestBars * minTestCoverage)) {
        continue;
      }

      const model = {
        feeBps: pool.feeBps,
        tvlUsd: pool.tvlUsd,
        slippageBps,
        gasPerRebalanceUsd,
      };
      const training = chooseRangeFromHistory(history, {
        candidateRangesPct,
        model,
        trainingCapitalUsd: 1_000,
      });
      const regime = summarizeRegime(history, pool.tvlUsd);
      const gate = evaluateEntryGate({
        selected: training.selected,
        regime,
        ...entryGate,
      });

      if (!gate.enter) continue;

      candidates.push({
        pool,
        history,
        evaluation,
        training,
        regime,
        gate,
        score: riskAdjustedTrainingScore(training.selected, regime),
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates[0] ?? null;

    if (!chosen) {
      folds.push({
        fold: folds.length + 1,
        action: "CASH",
        decisionTime,
        testEnd: testEnd - HOUR,
        startingCapitalUsd: capitalUsd,
        endingCapitalUsd: capitalUsd,
        testPnlUsd: 0,
        selectedPoolId: null,
        selectedPoolName: null,
        selectedRangePct: null,
        candidateCount: 0,
        selectionScore: null,
        boundaryCostUsd: 0,
      });
      decisionTime += testBars * HOUR;
      continue;
    }

    const boundaryCostUsd =
      capitalUsd * (slippageBps / 10_000) + gasPerRebalanceUsd;
    capitalUsd = Math.max(0, capitalUsd - boundaryCostUsd);
    totalBoundaryCostsUsd += boundaryCostUsd;

    const rangeHalfWidthPct = chosen.training.selected.rangeHalfWidthPct;
    const result = backtestConcentratedLp(chosen.evaluation, {
      startingCapitalUsd: capitalUsd,
      rangeHalfWidthPct,
      feeBps: chosen.pool.feeBps,
      tvlUsd: chosen.pool.tvlUsd,
      slippageBps,
      gasPerRebalanceUsd,
    });

    folds.push({
      fold: folds.length + 1,
      action: "LP",
      decisionTime,
      testEnd: chosen.evaluation.at(-1).timestamp,
      startingCapitalUsd: capitalUsd,
      endingCapitalUsd: result.finalEquityUsd,
      testPnlUsd: result.pnlUsd,
      testReturnPct: result.returnPct,
      testFeesUsd: result.totalModeledFeesUsd,
      testRebalanceCostsUsd: result.totalRebalanceCostsUsd,
      testRebalances: result.rebalances,
      testMaxDrawdownPct: result.maxDrawdownPct,
      selectedPoolId: chosen.pool.id,
      selectedPoolName: chosen.pool.name,
      selectedRangePct: rangeHalfWidthPct,
      candidateCount: candidates.length,
      selectionScore: chosen.score,
      trainingReturnPct: chosen.training.selected.result.returnPct,
      trainingDrawdownPct: chosen.training.selected.result.maxDrawdownPct,
      trainingRebalances:
        chosen.training.selected.result.rebalances,
      regime: chosen.regime,
      boundaryCostUsd,
    });

    capitalUsd = result.finalEquityUsd;
    decisionTime += testBars * HOUR;
  }

  if (!folds.length) throw new Error("No portfolio folds produced");

  const pnlUsd = capitalUsd - startingCapitalUsd;
  return {
    startingCapitalUsd,
    finalEquityUsd: capitalUsd,
    pnlUsd,
    returnPct: (pnlUsd / startingCapitalUsd) * 100,
    totalBoundaryCostsUsd,
    lpFolds: folds.filter((fold) => fold.action === "LP").length,
    cashFolds: folds.filter((fold) => fold.action === "CASH").length,
    poolSelections: folds.reduce((counts, fold) => {
      const key = fold.selectedPoolName ?? "CASH";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
    folds,
  };
}
