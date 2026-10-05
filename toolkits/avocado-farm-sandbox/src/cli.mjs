import { loadConfig } from "./config.mjs";
import { inspectRobinhoodRpc } from "./rpc.mjs";
import { demoPools } from "./fixtures.mjs";
import { PaperLedger } from "./ledger.mjs";
import { FarmEngine } from "./engine.mjs";
import { verifyAlchemyAgentWalletSession } from "./alchemy-session.mjs";

const config = loadConfig();

if (process.argv.includes("--rpc-check")) {
  const result = await inspectRobinhoodRpc(
    config.rpcUrl,
    config.network.chainId,
  );
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const ledger = new PaperLedger({ startingCashUsd: 10_000 });
const engine = new FarmEngine({ ledger, limits: config.limits });

console.log("\nAvocado Farm Sandbox — PAPER ONLY\n");

const ranked = engine.scan(demoPools, { capitalUsd: 1_000 });
console.table(
  ranked.map(({ pool, metrics, risk }) => ({
    pool: pool.id,
    feeApr: metrics.feeAprPct.toFixed(1) + "%",
    rewards: metrics.rewardAprPct.toFixed(1) + "%",
    estNetApr: metrics.netAprPct.toFixed(1) + "%",
    allowed: risk.ok,
    reason: risk.reasons.join(" | "),
  })),
);

const best = ranked.find((item) => item.risk.ok);
if (!best) {
  console.log("No pool passed the risk engine.");
  process.exit(0);
}

const proposal = engine.proposeOpen(best.pool, best.metrics, { capitalUsd: 1_000 });
const position = engine.executeOpen(best.pool, proposal);

console.log("\nOpened paper position:");
console.log(JSON.stringify(position, null, 2));

const alchemy = await verifyAlchemyAgentWalletSession();
console.log("\nAlchemy Agent Wallet session:");
console.log(JSON.stringify({ ok: alchemy.ok, reason: alchemy.reason }, null, 2));

console.log("\nLedger:");
console.log(JSON.stringify(ledger.snapshot(), null, 2));
