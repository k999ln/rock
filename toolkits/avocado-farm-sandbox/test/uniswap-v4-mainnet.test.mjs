import test from "node:test";
import assert from "node:assert/strict";
import {
  ROBINHOOD_MAINNET,
  UNISWAP_V4_ROBINHOOD,
} from "../src/uniswap-v4-mainnet.mjs";

test("pins the official Robinhood Chain v4 deployment directory", () => {
  assert.equal(ROBINHOOD_MAINNET.chainId, 4663);
  for (const address of Object.values(UNISWAP_V4_ROBINHOOD)) {
    assert.match(address, /^0x[0-9a-f]{40}$/);
  }
});
