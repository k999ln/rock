import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_LIMITS } from "../src/config.mjs";
import { demoPools } from "../src/fixtures.mjs";
import { PaperLedger } from "../src/ledger.mjs";
import { FarmEngine } from "../src/engine.mjs";

test("dangerous microcap is rejected by the risk engine", () => {
  const ledger = new PaperLedger({ startingCashUsd: 10_000 });
  const engine = new FarmEngine({ ledger, limits: { ...DEFAULT_LIMITS } });
  const ranked = engine.scan(demoPools);
  const microcap = ranked.find((x) => x.pool.id === "MICROCAP-WETH-100");

  assert.equal(microcap.risk.ok, false);
  assert.ok(microcap.risk.reasons.some((r) => r.includes("TVL")));
  assert.ok(microcap.risk.reasons.some((r) => r.includes("Slippage")));
  assert.ok(microcap.risk.reasons.some((r) => r.includes("Token risk")));
});

test("paper position can open and rebalance without a wallet key", () => {
  const ledger = new PaperLedger({ startingCashUsd: 10_000 });
  const engine = new FarmEngine({ ledger, limits: { ...DEFAULT_LIMITS } });
  const ranked = engine.scan(demoPools);
  const candidate = ranked.find((x) => x.risk.ok);

  assert.ok(candidate);
  const proposal = engine.proposeOpen(candidate.pool, candidate.metrics, {
    capitalUsd: 1_000,
  });
  assert.equal(proposal.risk.ok, true);

  const position = engine.executeOpen(candidate.pool, proposal);
  assert.equal(ledger.snapshot().positions.length, 1);

  const movedPool = {
    ...candidate.pool,
    spotPrice: position.range.upperPrice * 1.01,
  };
  const receipt = engine.rebalanceIfNeeded(position, movedPool);

  assert.ok(receipt);
  assert.equal(receipt.type, "REBALANCE");
  assert.equal(ledger.snapshot().positions[0].rebalanceCount, 1);
});
