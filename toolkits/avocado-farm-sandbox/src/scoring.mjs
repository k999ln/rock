const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function estimateFeeAprPct(pool) {
  if (!pool.tvlUsd || pool.tvlUsd <= 0) return 0;
  const dailyFeesUsd = pool.volume24hUsd * (pool.feeBps / 10_000);
  return (dailyFeesUsd / pool.tvlUsd) * 365 * 100;
}

export function estimateIlPenaltyAprPct(pool) {
  const vol = Math.max(0, pool.realizedVol24hPct ?? 0);
  const tokenRisk = clamp(pool.tokenRisk ?? 0, 0, 1);
  // Conservative heuristic for PAPER ranking, not a forecast.
  return vol * 2.4 + tokenRisk * 18;
}

export function scorePool(pool, options = {}) {
  const rebalancesPerYear = options.rebalancesPerYear ?? 120;
  const capitalUsd = options.capitalUsd ?? 1_000;
  const feeAprPct = estimateFeeAprPct(pool);
  const rewardAprPct = Math.max(0, pool.rewardAprPct ?? 0);
  const ilPenaltyAprPct = estimateIlPenaltyAprPct(pool);
  const slippageAprPct =
    ((pool.slippageBps ?? 0) / 10_000) * rebalancesPerYear * 100;
  const gasAprPct =
    capitalUsd > 0
      ? (((pool.estimatedRebalanceGasUsd ?? 0) * rebalancesPerYear) / capitalUsd) * 100
      : 0;
  const liquidityPenaltyPct = clamp(pool.liquidityRisk ?? 0, 0, 1) * 15;

  const netAprPct =
    feeAprPct +
    rewardAprPct -
    ilPenaltyAprPct -
    slippageAprPct -
    gasAprPct -
    liquidityPenaltyPct;

  return {
    poolId: pool.id,
    feeAprPct,
    rewardAprPct,
    ilPenaltyAprPct,
    slippageAprPct,
    gasAprPct,
    liquidityPenaltyPct,
    netAprPct,
    score: netAprPct,
  };
}

export function rankPools(pools, options = {}) {
  return pools
    .map((pool) => ({ pool, metrics: scorePool(pool, options) }))
    .sort((a, b) => b.metrics.score - a.metrics.score);
}
