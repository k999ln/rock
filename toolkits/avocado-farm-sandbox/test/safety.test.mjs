import test from "node:test";
import assert from "node:assert/strict";

import { createCallIntent, validateIntentBatch } from "../src/intent.mjs";
import { simulateIntentBatch } from "../src/simulator.mjs";
import {
  proposeBoundedTuning,
  reviewStrategyWindow,
} from "../src/optimizer.mjs";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

test("call intent policy blocks non-allowlisted targets", () => {
  const intent = createCallIntent({ label: "quote", to: B });
  const result = validateIntentBatch([intent], {
    allowedContracts: [A],
    maxCallsPerBatch: 4,
    maxNativeValueWei: 0n,
  });

  assert.equal(result.ok, false);
  assert.ok(result.reasons[0].includes("allowlisted"));
});

test("simulator never broadcasts and reports eth_call failures", async () => {
  const calls = [];
  const fakeRpc = async (_url, method) => {
    calls.push(method);
    throw new Error("revert: test");
  };

  const intent = createCallIntent({ label: "dry-run", to: A });
  const result = await simulateIntentBatch({
    rpcUrl: "https://example.invalid",
    from: A,
    intents: [intent],
    rpc: fakeRpc,
  });

  assert.deepEqual(calls, ["eth_call"]);
  assert.equal(result.ok, false);
});

test("strategy tuning is bounded", () => {
  const summary = reviewStrategyWindow([
    { realizedNetAprPct: -5, outOfRange: true, rebalanceCostPct: 0.2 },
    { realizedNetAprPct: -2, outOfRange: true, rebalanceCostPct: 0.1 },
  ]);
  const tuning = proposeBoundedTuning(summary, {
    rangeMultiplier: 1.55,
    allocationMultiplier: 0.55,
  });

  assert.equal(tuning.rangeMultiplier, 1.6);
  assert.equal(tuning.allocationMultiplier, 0.5);
});
