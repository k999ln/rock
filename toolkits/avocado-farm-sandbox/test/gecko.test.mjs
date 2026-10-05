import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGeckoPool } from "../src/gecko.mjs";

test("normalizes GeckoTerminal Robinhood pool data", () => {
  const p = normalizeGeckoPool({
    id: "robinhood_0xabc",
    attributes: {
      address: "0xabc",
      name: "WETH / USDG",
      reserve_in_usd: "1000000",
      volume_usd: { h24: "500000" },
      base_token_price_usd: "2500",
      price_change_percentage: { h24: "4.2" },
      transactions: { h24: { buys: 40, sells: 60 } },
      pool_created_at: "2026-01-01T00:00:00Z",
    },
    relationships: { dex: { data: { id: "uniswap-v4-robinhood" } } },
  });

  assert.equal(p.address, "0xabc");
  assert.equal(p.token0, "WETH");
  assert.equal(p.token1, "USDG");
  assert.equal(p.tvlUsd, 1_000_000);
  assert.equal(p.volume24hUsd, 500_000);
  assert.equal(p.trades24h, 100);
  assert.equal(p.realizedVol24hPct, 4.2);
  assert.equal(p.feeSource, "assumption");
});
