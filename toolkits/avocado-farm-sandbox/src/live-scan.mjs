import { discoverRobinhoodPools } from "./gecko.mjs";
import { DEFAULT_LIMITS } from "./config.mjs";
import { PaperLedger } from "./ledger.mjs";
import { FarmEngine } from "./engine.mjs";
import { verifyRobinhoodMainnetUniswapV4 } from "./uniswap-v4-mainnet.mjs";

const args = new Set(process.argv.slice(2));
const defaultFeeBps = Number(process.env.MODEL_FEE_BPS || 30);
const ledger = new PaperLedger({ startingCashUsd: Number(process.env.PAPER_CASH_USD || 10_000) });
const engine = new FarmEngine({ ledger, limits: { ...DEFAULT_LIMITS } });

if (args.has("--verify-uniswap")) {
  const verification = await verifyRobinhoodMainnetUniswapV4(
    process.env.RH_MAINNET_RPC_URL,
  );
  console.log(JSON.stringify(verification, null, 2));
}

const pools = await discoverRobinhoodPools({
  pages: Number(process.env.GECKO_PAGES || 1),
  defaultFeeBps,
});
const ranked = engine.scan(pools, {
  capitalUsd: Number(process.env.PAPER_TICKET_USD || 1_000),
});

console.log("\nAvocado Farm — live Robinhood Chain scan / PAPER model\n");
console.log(
  `Discovered ${pools.length} pools. Fee APR uses MODEL_FEE_BPS=${defaultFeeBps} unless a DEX adapter supplies exact fee data.`,
);
console.table(
  ranked.slice(0, 20).map(({ pool, metrics, risk }) => ({
    pool: pool.token0 + "/" + pool.token1,
    dex: pool.dexId,
    tvl: Math.round(pool.tvlUsd),
    vol24h: Math.round(pool.volume24hUsd),
    trades: pool.trades24h,
    move24h: pool.realizedVol24hPct.toFixed(1) + "%",
    modeledFeeApr: metrics.feeAprPct.toFixed(1) + "%",
    modeledNetApr: metrics.netAprPct.toFixed(1) + "%",
    allowed: risk.ok,
    reason: risk.reasons.join(" | "),
  })),
);

if (args.has("--paper-open")) {
  const best = ranked.find((item) => item.risk.ok);
  if (!best) {
    console.log("No pool passed the current risk limits.");
  } else {
    const ticket = Number(process.env.PAPER_TICKET_USD || 1_000);
    const proposal = engine.proposeOpen(best.pool, best.metrics, { capitalUsd: ticket });
    if (!proposal.risk.ok) {
      console.log("Best candidate failed plan risk:", proposal.risk.reasons);
    } else {
      const position = engine.executeOpen(best.pool, proposal);
      console.log("\nOpened PAPER position only:");
      console.log(JSON.stringify(position, null, 2));
    }
  }
}
