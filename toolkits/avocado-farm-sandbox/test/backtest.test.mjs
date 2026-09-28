import test from "node:test";
import assert from "node:assert/strict";

import { backtestConcentratedLp } from "../src/clmm-backtest.mjs";
import {
  derivePairOhlcv,
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

test("derives base/quote candles from synchronized USD candles", () => {
  const pair = derivePairOhlcv(
    [
      { timestamp: 1, open: 200, high: 220, low: 180, close: 210, volumeUsd: 500 },
    ],
    [
      { timestamp: 1, open: 2, high: 2.2, low: 1.8, close: 2.1, volumeUsd: 500 },
    ],
  );
  assert.equal(pair.length, 1);
  assert.equal(pair[0].open, 100);
  assert.equal(pair[0].close, 100);
  assert.equal(pair[0].quoteUsdClose, 2.1);
  assert.ok(pair[0].high > pair[0].open);
  assert.ok(pair[0].low < pair[0].open);
});

test("LP USD value follows quote-token USD value when pair price is flat", () => {
  const candles = [
    {
      timestamp: 1,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volumeUsd: 0,
      quoteUsdOpen: 1,
      quoteUsdHigh: 1,
      quoteUsdLow: 1,
      quoteUsdClose: 1,
    },
    {
      timestamp: 3601,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volumeUsd: 0,
      quoteUsdOpen: 2,
      quoteUsdHigh: 2,
      quoteUsdLow: 2,
      quoteUsdClose: 2,
    },
  ];
  const result = backtestConcentratedLp(candles, {
    startingCapitalUsd: 1_000,
    rangeHalfWidthPct: 50,
    feeBps: 0,
    slippageBps: 0,
    gasPerRebalanceUsd: 0,
  });
  assert.ok(result.finalEquityUsd > 1_900);
});
