import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseRangeFromHistory,
  walkForwardRangeStrategy,
} from "../src/walk-forward-core.mjs";
import { summarizeRegime } from "../src/regime.mjs";

function makeCandles(count, priceFn, volumeUsd = 100_000) {
  return Array.from({ length: count }, (_, i) => {
    const close = priceFn(i);
    return {
      timestamp: 1_700_000_000 + i * 3600,
      open: close,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volumeUsd,
    };
  });
}

test("range choice uses only supplied history", () => {
  const history = makeCandles(48, () => 100);
  const decision = chooseRangeFromHistory(history, {
    candidateRangesPct: [6, 12, 50],
    model: {
      feeBps: 30,
      tvlUsd: 1_000_000,
      slippageBps: 25,
      gasPerRebalanceUsd: 0.35,
    },
  });
  assert.ok([6, 12, 50].includes(decision.selected.rangeHalfWidthPct));
  assert.equal(decision.ranked.length, 3);
});

test("walk-forward produces strictly later test windows", () => {
  const candles = makeCandles(120, (i) => 100 + i * 0.1);
  const result = walkForwardRangeStrategy(candles, {
    candidateRangesPct: [8, 12, 30],
    trainBars: 48,
    testBars: 24,
    startingCapitalUsd: 1_000,
    feeBps: 30,
    tvlUsd: 1_000_000,
    slippageBps: 25,
    gasPerRebalanceUsd: 0.35,
  });

  assert.ok(result.folds.length >= 2);
  for (const fold of result.folds) {
    assert.ok(fold.trainEnd < fold.testStart);
  }
  assert.ok(Number.isFinite(result.finalEquityUsd));
});

test("regime summary uses only trailing candles", () => {
  const history = makeCandles(48, (i) => 100 + i * 0.2, 200_000);
  const regime = summarizeRegime(history, 1_000_000);
  assert.ok(regime.trendPct > 0);
  assert.ok(regime.volumeTvlPerDay > 0);
  assert.ok(regime.days > 0);
});

test("cash gate can refuse a negative training regime", () => {
  const falling = makeCandles(
    96,
    (i) => 100 * Math.pow(0.985, i),
    10_000,
  );
  const result = walkForwardRangeStrategy(falling, {
    candidateRangesPct: [6, 12, 30],
    trainBars: 48,
    testBars: 24,
    startingCapitalUsd: 1_000,
    feeBps: 0,
    tvlUsd: 1_000_000,
    slippageBps: 25,
    gasPerRebalanceUsd: 0.35,
    allowCash: true,
  });
  assert.ok(result.cashFolds >= 1);
  assert.ok(result.folds.some((fold) => fold.action === "CASH"));
});

test("cash-to-cash folds do not pay repeated transition costs", () => {
  const falling = makeCandles(
    120,
    (i) => 100 * Math.pow(0.99, i),
    1_000,
  );
  const result = walkForwardRangeStrategy(falling, {
    candidateRangesPct: [12],
    trainBars: 48,
    testBars: 24,
    startingCapitalUsd: 1_000,
    feeBps: 0,
    tvlUsd: 1_000_000,
    slippageBps: 25,
    gasPerRebalanceUsd: 0.35,
    allowCash: true,
  });
  const cashFolds = result.folds.filter((fold) => fold.action === "CASH");
  assert.ok(cashFolds.length >= 2);
  assert.ok(cashFolds.every((fold) => fold.boundaryCostUsd === 0));
});
