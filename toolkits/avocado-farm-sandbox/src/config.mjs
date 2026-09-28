export const ROBINHOOD_TESTNET = Object.freeze({
  name: "Robinhood Chain Testnet",
  chainId: 46630,
  publicRpcUrl: "https://rpc.testnet.chain.robinhood.com",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com",
});

export const DEFAULT_LIMITS = Object.freeze({
  mode: "paper",
  minTvlUsd: 250_000,
  maxPoolAllocationPct: 20,
  maxPortfolioAllocationPct: 75,
  maxSlippageBps: 75,
  maxTokenRisk: 0.65,
  maxDailyLossUsd: 250,
  maxDailyTurnoverUsd: 5_000,
  rebalanceTriggerFraction: 0.82,
  minRangeHalfWidthPct: 0.75,
  maxRangeHalfWidthPct: 12,
  minNetAprPct: 3,
});

export function loadConfig(env = process.env) {
  return {
    network: ROBINHOOD_TESTNET,
    rpcUrl: env.RH_RPC_URL || ROBINHOOD_TESTNET.publicRpcUrl,
    alchemyApiKeyPresent: Boolean(env.ALCHEMY_API_KEY),
    limits: { ...DEFAULT_LIMITS },
  };
}
