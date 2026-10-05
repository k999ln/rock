import { backtestConcentratedLp } from "./clmm-backtest.mjs";
import { evaluateEntryGate, summarizeRegime } from "./regime.mjs";

const byTime = (a, b) => a.timestamp - b.timestamp;

function validateNumber(name, value, minExclusive = 0) {
  if (!Number.isFinite(value) || value <= minExclusive) {
    throw new Error(`${name} must be > ${minExclusive}`);
  }
}

function transitionCost(capitalUsd, slippageBps, gasUsd) {
  return capitalUsd * (slippageBps / 10_000) + gasUsd;
}

export function chooseRangeFromHistory(
  history,
  {
    candidateRangesPct,
    model,
    trainingCapitalUsd = 1_000,
  } = {},
) {
  if (!history?.length) throw new Error("No training history");
  if (!candidateRangesPct?.length) throw new Error("No candidate ranges");

  const ranked = candidateRangesPct
    .map((rangeHalfWidthPct) => {
      const result = backtestConcentratedLp(history, {
        ...model,
        startingCapitalUsd: trainingCapitalUsd,
        rangeHalfWidthPct,
      });
      return { rangeHalfWidthPct, result };
    })
    .sort((a, b) => b.result.finalEquityUsd - a.result.finalEquityUsd);

  return { selected: ranked[0], ranked };
}

export function walkForwardRangeStrategy(
  candles,
  {
    candidateRangesPct = [6, 8, 12, 16, 20, 30, 50],
    trainBars = 48,
    testBars = 24,
    startingCapitalUsd = 1_000,
    feeBps = 30,
    tvlUsd = 1_000_000,
    slippageBps = 25,
    gasPerRebalanceUsd = 0.35,
    chargeBoundaryReposition = true,
    allowCash = false,
    entryGate = {},
  } = {},
) {
  const ordered = [...(candles ?? [])].sort(byTime);
  validateNumber("startingCapitalUsd", startingCapitalUsd);
  validateNumber("trainBars", trainBars);
  validateNumber("testBars", testBars);
  if (ordered.length < trainBars + 2) {
    throw new Error("Not enough candles for walk-forward");
  }

  const model = {
    feeBps,
    tvlUsd,
    slippageBps,
    gasPerRebalanceUsd,
  };

  let capitalUsd = startingCapitalUsd;
  let totalBoundaryCostsUsd = 0;
  let previousAction = "CASH";
  const folds = [];
  let cursor = trainBars;

  while (cursor < ordered.length - 1) {
    const history = ordered.slice(Math.max(0, cursor - trainBars), cursor);
    const evaluation = ordered.slice(
      cursor,
      Math.min(cursor + testBars, ordered.length),
    );
    if (evaluation.length < 2) break;

    const training = chooseRangeFromHistory(history, {
      candidateRangesPct,
      model,
      trainingCapitalUsd: 1_000,
    });
    const selectedRangePct = training.selected.rangeHalfWidthPct;
    const regime = summarizeRegime(history, tvlUsd);
    const gate = allowCash
      ? evaluateEntryGate({
          selected: training.selected,
          regime,
          ...entryGate,
        })
      : { enter: true, reasons: [], metrics: {} };
    const action = gate.enter ? "LP" : "CASH";

    let boundaryCostUsd = 0;
    if (chargeBoundaryReposition) {
      const needsTransaction =
        action === "LP" || (action === "CASH" && previousAction === "LP");
      if (needsTransaction) {
        boundaryCostUsd = transitionCost(
          capitalUsd,
          slippageBps,
          gasPerRebalanceUsd,
        );
        capitalUsd = Math.max(0, capitalUsd - boundaryCostUsd);
        totalBoundaryCostsUsd += boundaryCostUsd;
      }
    }

    let result;
    if (action === "LP") {
      result = backtestConcentratedLp(evaluation, {
        ...model,
        startingCapitalUsd: capitalUsd,
        rangeHalfWidthPct: selectedRangePct,
      });
    } else {
      const first = evaluation[0];
      const last = evaluation.at(-1);
      result = {
        startingCapitalUsd: capitalUsd,
        finalEquityUsd: capitalUsd,
        pnlUsd: 0,
        returnPct: 0,
        totalModeledFeesUsd: 0,
        totalRebalanceCostsUsd: 0,
        rebalances: 0,
        maxDrawdownPct: 0,
        startTimestamp: first.timestamp,
        endTimestamp: last.timestamp,
        rangeHalfWidthPct: null,
      };
    }

    folds.push({
      fold: folds.length + 1,
      trainStart: history[0].timestamp,
      trainEnd: history.at(-1).timestamp,
      testStart: evaluation[0].timestamp,
      testEnd: evaluation.at(-1).timestamp,
      action,
      selectedRangePct: action === "LP" ? selectedRangePct : null,
      candidateRangePct: selectedRangePct,
      gateReasons: gate.reasons,
      regime,
      gateMetrics: gate.metrics ?? {},
      trainingReturnPct: training.selected.result.returnPct,
      trainingMaxDrawdownPct: training.selected.result.maxDrawdownPct,
      boundaryCostUsd,
      startingCapitalUsd: capitalUsd,
      endingCapitalUsd: result.finalEquityUsd,
      testReturnPct: result.returnPct,
      testPnlUsd: result.pnlUsd,
      testFeesUsd: result.totalModeledFeesUsd,
      testRebalanceCostsUsd: result.totalRebalanceCostsUsd,
      testRebalances: result.rebalances,
      testMaxDrawdownPct: result.maxDrawdownPct,
    });

    capitalUsd = result.finalEquityUsd;
    previousAction = action;
    cursor += testBars;
  }

  if (!folds.length) throw new Error("No walk-forward folds produced");

  const firstTestIndex = trainBars;
  const oosCandles = ordered.slice(firstTestIndex);
  const fixedBenchmarks = candidateRangesPct
    .map((rangeHalfWidthPct) =>
      backtestConcentratedLp(oosCandles, {
        ...model,
        startingCapitalUsd,
        rangeHalfWidthPct,
      }),
    )
    .sort((a, b) => b.finalEquityUsd - a.finalEquityUsd);

  const pnlUsd = capitalUsd - startingCapitalUsd;
  return {
    startingCapitalUsd,
    finalEquityUsd: capitalUsd,
    pnlUsd,
    returnPct: (pnlUsd / startingCapitalUsd) * 100,
    totalBoundaryCostsUsd,
    cashFolds: folds.filter((fold) => fold.action === "CASH").length,
    lpFolds: folds.filter((fold) => fold.action === "LP").length,
    folds,
    outOfSampleStart: oosCandles[0].timestamp,
    outOfSampleEnd: oosCandles.at(-1).timestamp,
    outOfSampleCandles: oosCandles.length,
    bestFixedHindsightBenchmark: fixedBenchmarks[0],
    fixedDefault12Pct:
      fixedBenchmarks.find((x) => x.rangeHalfWidthPct === 12) ?? null,
    fixedBenchmarks,
  };
}
