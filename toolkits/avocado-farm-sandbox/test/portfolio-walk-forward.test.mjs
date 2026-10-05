import test from "node:test";
import assert from "node:assert/strict";

import { portfolioWalkForward } from "../src/portfolio-walk-forward-core.mjs";

function makePool({ id, start, count, priceFn, volumeUsd = 100_000 }) {
  return {
    id,
    name: id,
    tvlUsd: 1_000_000,
    feeBps: 30,
    candles: Array.from({ length: count }, (_, i) => {
      const close = priceFn(i);
      return {
        timestamp: start + i * 3600,
        open: close,
        high: close * 1.01,
        low: close * 0.99,
        close,
        volumeUsd,
      };
    }),
  };
}

test("portfolio selector can choose among pools using trailing history", () => {
  const start = 1_700_000_000;
  const stable = makePool({
    id: "stable",
    start,
    count: 120,
    priceFn: () => 100,
    volumeUsd: 500_000,
  });
  const falling = makePool({
    id: "falling",
    start,
    count: 120,
    priceFn: (i) => 100 * Math.pow(0.995, i),
    volumeUsd: 20_000,
  });

  const result = portfolioWalkForward([stable, falling], {
    candidateRangesPct: [12, 30],
    trainBars: 48,
    testBars: 24,
    startingCapitalUsd: 1_000,
    slippageBps: 25,
    gasPerRebalanceUsd: 0.35,
  });

  assert.ok(result.folds.length >= 2);
  assert.ok(
    result.folds.some(
      (fold) => fold.action === "LP" && fold.selectedPoolId === "stable",
    ),
  );
});

test("portfolio stays cash when no pool passes the entry gate", () => {
  const start = 1_700_000_000;
  const bad = makePool({
    id: "bad",
    start,
    count: 96,
    priceFn: (i) => 100 * Math.pow(0.98, i),
    volumeUsd: 100,
  });

  const result = portfolioWalkForward([bad], {
    candidateRangesPct: [12],
    trainBars: 48,
    testBars: 24,
    startingCapitalUsd: 1_000,
    entryGate: {
      minTrainingReturnPct: 1,
      minVolumeTvlPerDay: 0.5,
    },
  });

  assert.ok(result.cashFolds >= 1);
  assert.ok(result.folds.every((fold) => fold.action === "CASH"));
});

test("robust selector can stay cash when training halves disagree", () => {
  const start = 1_700_000_000;
  const whipsaw = makePool({
    id: "whipsaw",
    start,
    count: 120,
    priceFn: (i) => (i < 24 ? 100 + i : 124 - (i - 24) * 0.7),
    volumeUsd: 200_000,
  });

  const result = portfolioWalkForward([whipsaw], {
    candidateRangesPct: [8, 12, 30],
    trainBars: 48,
    testBars: 24,
    startingCapitalUsd: 1_000,
    selectionMode: "robust",
  });

  assert.ok(result.folds.length >= 1);
  assert.ok(result.cashFolds >= 1);
});
