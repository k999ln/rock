# Avocado Farm Sandbox

A working **mechanism-first, paper-only** concentrated-liquidity farming engine for Robinhood Chain.

It now has two input modes:

- deterministic fixtures for tests and offline development;
- live Robinhood Chain pool discovery through GeckoTerminal's `robinhood` API network.

The execution side stays deliberately separated from discovery. The current release can rank, risk-check, choose ranges, paper-open and paper-rebalance positions, verify the Robinhood Chain Uniswap v4 deployment, and verify whether an Alchemy Agent Wallet CLI session exists. It does **not** broadcast mainnet swaps, approvals, LP mints, burns or withdrawals.

## What is implemented

1. pool ranking using modeled fees, optional rewards, volatility, liquidity, slippage and gas heuristics;
2. explicit risk gates and portfolio circuit breakers;
3. volatility-aware LP ranges with ACTIVE / NEAR_EDGE / OUT_OF_RANGE states;
4. paper ledger, turnover accounting and rebalance receipts;
5. live Robinhood Chain pool discovery;
6. read-only verification of the official Uniswap v4 Robinhood Chain mainnet contracts;
7. Alchemy Agent Wallet session verification without reading a private key.

## Networks

Robinhood Chain mainnet is chain `4663`. Robinhood Chain Testnet is chain `46630`.

The testnet executor is not enabled yet because a DEX-specific adapter must first pin and validate the exact contracts used for liquidity management. This prevents a guessed address or configuration typo from becoming a transaction.

## Run

```bash
npm --prefix toolkits/avocado-farm-sandbox test
npm --prefix toolkits/avocado-farm-sandbox start
npm --prefix toolkits/avocado-farm-sandbox run rpc:check
npm --prefix toolkits/avocado-farm-sandbox run scan:live
npm --prefix toolkits/avocado-farm-sandbox run scan:paper
npm --prefix toolkits/avocado-farm-sandbox run uniswap:verify
```

Optional model settings:

```bash
MODEL_FEE_BPS=30
PAPER_CASH_USD=10000
PAPER_TICKET_USD=1000
GECKO_PAGES=1
RH_MAINNET_RPC_URL=https://rpc.mainnet.chain.robinhood.com
```

The live scanner labels `MODEL_FEE_BPS` as an assumption. A pool's exact fee tier and concentrated-liquidity utilization must come from the DEX adapter before real execution; a displayed APR is never treated as guaranteed return.

## What is implemented now

- **Pool ranking:** fee APR + reward APR - IL heuristic - slippage - gas - liquidity risk.
- **Risk gate:** minimum TVL, token-risk ceiling, slippage ceiling, per-pool allocation, portfolio allocation, daily loss and turnover circuit breakers.
- **Range planner:** volatility-aware concentrated-liquidity bands plus ACTIVE / NEAR_EDGE / OUT_OF_RANGE health.
- **Paper ledger:** OPEN and REBALANCE receipts, deployed cash, turnover, and realized cost tracking.
- **Transaction intents:** target allowlist, native-value cap, and maximum calls per batch.
- **Preflight simulator:** only uses `eth_call`; it never broadcasts a transaction.
- **Strategy feedback:** bounded tuning can widen/narrow ranges and reduce/increase allocation from observed results without bypassing hard risk limits.
- **Alchemy session check:** verifies an approved Agent Wallet CLI session if one is present, without handling the wallet private key.

## Architecture

```text
Live pools / on-chain reads
          |
          v
Scanner -> Normalizer
          |
          v
Scorer -> Risk engine ----------> DENY
          |
          v
Range planner
          |
          v
Paper executor
          |
          v
Receipt + ledger

Alchemy Agent Wallet
          |
          +---- session verification now
          |
          +---- transaction simulation / execution only after DEX adapter gate
```

## Next executor boundary

The next module is a Uniswap-v4-specific adapter with this contract:

```text
readPoolState()
readPosition()
quoteSwap()
buildRemoveLiquidityCalls()
buildSwapCalls()
buildAddLiquidityCalls()
simulateCalls()
```

Only after every address and call is verified and simulation passes should a separately approved testnet executor submit calls. Mainnet execution remains a distinct approval boundary.
