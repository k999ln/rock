import test from "node:test";
import assert from "node:assert/strict";

import { backtestConcentratedLp } from "../src/clmm-backtest.mjs";
import {
  normalizeOhlcvList,
  parseFeeBpsFromPoolName,
} from "../src/historical.mjs";

test("parses fee tier from pool name", () => {
  assert.equal(parseFeeBpsFromPoolName("ORBIO / USDG 0.8%"), 80);
  assert.equal(parseFeeBpsFromPoolName("WETH / USDC 0.05%"), 5);
  assert.equal(parseFeeBpsFromPoolName("NO FEE LABEL", 30), 30);
});

test("normalizes Gecko OHLCV rows", () => {
  assert.deepEqual(normalizeOhlcvList([[1, 10, 12, 9, 11, 500]]), [
    { timestamp: 1, open: 10, high: 12, low: 9, close: 11, volumeUsd: 500 },
  ]);
});

test("flat price earns modeled fees without rebalance", () => {
  const candles = Array.from({ length: 24 }, (_, i) => ({
    timestamp: 1_700_000_000 + i * 3600,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volumeUsd: 100_000,
  }));
  const result = backtestConcentratedLp(candles, {
    startingCapitalUsd: 1_000,
    rangeHalfWidthPct: 12,
    feeBps: 30,
    tvlUsd: 1_000_000,
    slippageBps: 0,
    gasPerRebalanceUsd: 0,
  });
  assert.equal(result.rebalances, 0);
  assert.ok(result.totalModeledFeesUsd > 0);
  assert.ok(result.finalEquityUsd > 1_000);
});

test("range breach triggers rebalance cost", () => {
  const candles = [
    { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volumeUsd: 0 },
    { timestamp: 3601, open: 100, high: 125, low: 100, close: 120, volumeUsd: 0 },
  ];
  const result = backtestConcentratedLp(candles, {
    startingCapitalUsd: 1_000,
    rangeHalfWidthPct: 10,
    feeBps: 30,
    tvlUsd: 1_000_000,
    slippageBps: 25,
    gasPerRebalanceUsd: 0.35,
  });
  assert.equal(result.rebalances, 1);
  assert.ok(result.totalRebalanceCostsUsd > 0);
});
