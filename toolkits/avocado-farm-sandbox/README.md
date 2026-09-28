# Avocado Farm Sandbox

A working, **paper-only** concentrated-liquidity farming engine scaffold for Robinhood Chain Testnet.

This is the mechanism layer, not a dashboard. It does four things now:

1. ranks candidate pools using fees, rewards, volatility, liquidity, slippage and gas heuristics;
2. blocks candidates that violate explicit risk limits;
3. chooses a volatility-aware LP range and detects near-edge / out-of-range positions;
4. opens and rebalances positions in a local paper ledger with receipts.

It deliberately does **not** broadcast swaps, approvals, LP mints, burns or withdrawals.

## Robinhood Chain Testnet

- Chain ID: `46630`
- Public RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`

Use an Alchemy endpoint by setting `RH_RPC_URL`.

## Run

```bash
npm --prefix toolkits/avocado-farm-sandbox test
npm --prefix toolkits/avocado-farm-sandbox start
npm --prefix toolkits/avocado-farm-sandbox run rpc:check
```

## Architecture

```text
Pool data
   |
   v
Scanner / scorer
   |
   v
Risk engine ---------> DENY
   |
   v
Range planner
   |
   v
Paper executor
   |
   v
Receipt + ledger
```

The Alchemy Agent Wallet helper only verifies whether an approved CLI session exists. It never reads a private key, and the current executor is hard-locked to `paper`.

## Next implementation step

Add a DEX adapter behind a strict interface:

```text
readPoolState()
quoteSwap()
buildRemoveLiquidityCalls()
buildSwapCalls()
buildAddLiquidityCalls()
simulateCalls()
```

The adapter should target a specific audited DEX deployment on Robinhood Chain Testnet. After simulation and tests are stable, a separate testnet executor can submit pre-approved calls through an Alchemy Agent Wallet session. Keep mainnet as a separate gated mode rather than a config typo away from the sandbox.
