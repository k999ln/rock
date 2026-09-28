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

export function chooseRobustRangeFromHistory(
  history,
  {
    candidateRangesPct,
    model,
    trainingCapitalUsd = 1_000,
  } = {},
) {
  if (!history?.length) throw new Error("No training history");
  if (!candidateRangesPct?.length) throw new Error("No candidate ranges");

  const split = Math.floor(history.length / 2);
  const older = history.slice(0, split);
  const recent = history.slice(split);
  if (older.length < 2 || recent.length < 2) {
    throw new Error("Training history is too short for robust selection");
  }

  const ranked = candidateRangesPct
    .map((rangeHalfWidthPct) => {
      const common = {
        ...model,
        startingCapitalUsd: trainingCapitalUsd,
        rangeHalfWidthPct,
      };
      const result = backtestConcentratedLp(history, common);
      const olderResult = backtestConcentratedLp(older, common);
      const recentResult = backtestConcentratedLp(recent, common);
      const days = Math.max(
        1 / 24,
        (result.endTimestamp - result.startTimestamp) / 86_400,
      );
      const rebalancesPerDay = result.rebalances / days;
      const minSegmentReturnPct = Math.min(
        olderResult.returnPct,
        recentResult.returnPct,
      );
      const avgSegmentReturnPct =
        (olderResult.returnPct + recentResult.returnPct) / 2;
      const robustScore =
        minSegmentReturnPct +
        avgSegmentReturnPct * 0.35 -
        result.maxDrawdownPct * 0.25 -
        rebalancesPerDay * 0.5;

      return {
        rangeHalfWidthPct,
        result,
        olderResult,
        recentResult,
        minSegmentReturnPct,
        avgSegmentReturnPct,
        robustScore,
      };
    })
    .sort((a, b) => b.robustScore - a.robustScore);

  return {
    selected: ranked[0],
    ranked,
    positiveRangeFraction:
      ranked.filter((item) => item.result.returnPct > 0).length / ranked.length,
  };
}

function robustGate(training) {
  const reasons = [];
  if (training.selected.olderResult.returnPct < 0) {
    reasons.push(
      `Older half negative: ${training.selected.olderResult.returnPct.toFixed(2)}%`,
    );
  }
  if (training.selected.recentResult.returnPct < 0) {
    reasons.push(
      `Recent half negative: ${training.selected.recentResult.returnPct.toFixed(2)}%`,
    );
  }
  if (training.positiveRangeFraction < 0.6) {
    reasons.push(
      `Range robustness too low: ${(training.positiveRangeFraction * 100).toFixed(0)}%`,
    );
  }
  return { ok: reasons.length === 0, reasons };
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
    selectionMode = "best",
  } = {},
) {
  const orderedModes = new Set(["best", "robust"]);
  if (!orderedModes.has(selectionMode)) {
    throw new Error(`Unknown selectionMode: ${selectionMode}`);
  }

  const series = (poolSeries ?? [])
    .map((pool) => ({
      ...pool,
      candles: [...(pool.candles ?? [])].sort(
        (a, b) => a.timestamp - b.timestamp,
      ),
    }))
    .filter(
      (pool) =>
        pool.candles.length >= Math.ceil(trainBars * minTrainCoverage),
    );

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
    const testEnd = Math.min(
      maxTimestamp + HOUR,
      decisionTime + testBars * HOUR,
    );
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
      if (
        evaluation.length <
        Math.ceil(expectedTestBars * minTestCoverage)
      ) {
        continue;
      }

      const model = {
        feeBps: pool.feeBps,
        tvlUsd: pool.tvlUsd,
        slippageBps,
        gasPerRebalanceUsd,
      };
      const training =
        selectionMode === "robust"
          ? chooseRobustRangeFromHistory(history, {
              candidateRangesPct,
              model,
              trainingCapitalUsd: 1_000,
            })
          : chooseRangeFromHistory(history, {
              candidateRangesPct,
              model,
              trainingCapitalUsd: 1_000,
            });
      const regime = summarizeRegime(history, pool.tvlUsd);
      const baseGate = evaluateEntryGate({
        selected: training.selected,
        regime,
        ...entryGate,
      });
      const stability =
        selectionMode === "robust"
          ? robustGate(training)
          : { ok: true, reasons: [] };

      if (!baseGate.enter || !stability.ok) continue;

      const score =
        selectionMode === "robust"
          ? training.selected.robustScore +
            Math.min(3, regime.volumeTvlPerDay) * 0.25
          : riskAdjustedTrainingScore(training.selected, regime);

      candidates.push({
        pool,
        history,
        evaluation,
        training,
        regime,
        gate: {
          enter: true,
          reasons: [...baseGate.reasons, ...stability.reasons],
          metrics: baseGate.metrics,
        },
        score,
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
      trainingOlderReturnPct:
        chosen.training.selected.olderResult?.returnPct ?? null,
      trainingRecentReturnPct:
        chosen.training.selected.recentResult?.returnPct ?? null,
      positiveRangeFraction:
        chosen.training.positiveRangeFraction ?? null,
      trainingRebalances: chosen.training.selected.result.rebalances,
      regime: chosen.regime,
      boundaryCostUsd,
    });

    capitalUsd = result.finalEquityUsd;
    decisionTime += testBars * HOUR;
  }

  if (!folds.length) throw new Error("No portfolio folds produced");

  const pnlUsd = capitalUsd - startingCapitalUsd;
  return {
    selectionMode,
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
