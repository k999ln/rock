import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseRangeFromHistory,
  walkForwardRangeStrategy,
} from "../src/walk-forward-core.mjs";

function makeCandles(count, priceFn) {
  return Array.from({ length: count }, (_, i) => {
    const close = priceFn(i);
    return {
      timestamp: 1_700_000_000 + i * 3600,
      open: close,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volumeUsd: 100_000,
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

test("boundary reposition costs are charged after first fold", () => {
  const candles = makeCandles(120, () => 100);
  const result = walkForwardRangeStrategy(candles, {
    candidateRangesPct: [12],
    trainBars: 48,
    testBars: 24,
    startingCapitalUsd: 1_000,
    feeBps: 0,
    tvlUsd: 1_000_000,
    slippageBps: 25,
    gasPerRebalanceUsd: 0.35,
  });
  assert.equal(result.folds[0].boundaryCostUsd, 0);
  assert.ok(result.folds.slice(1).every((f) => f.boundaryCostUsd > 0));
  assert.ok(result.totalBoundaryCostsUsd > 0);
});
