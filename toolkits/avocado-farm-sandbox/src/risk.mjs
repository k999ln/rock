export function validateCandidate(pool, metrics, portfolio, limits) {
  const reasons = [];

  if (pool.tvlUsd < limits.minTvlUsd) {
    reasons.push(`TVL below minimum: $${pool.tvlUsd}`);
  }
  if ((pool.slippageBps ?? 0) > limits.maxSlippageBps) {
    reasons.push(`Slippage above limit: ${pool.slippageBps} bps`);
  }
  if ((pool.tokenRisk ?? 0) > limits.maxTokenRisk) {
    reasons.push(`Token risk above limit: ${pool.tokenRisk}`);
  }
  if (metrics.netAprPct < limits.minNetAprPct) {
    reasons.push(`Estimated net APR below minimum: ${metrics.netAprPct.toFixed(2)}%`);
  }
  if (portfolio.realizedPnlTodayUsd <= -Math.abs(limits.maxDailyLossUsd)) {
    reasons.push("Daily loss circuit breaker is active");
  }
  if (portfolio.turnoverTodayUsd >= limits.maxDailyTurnoverUsd) {
    reasons.push("Daily turnover circuit breaker is active");
  }

  return { ok: reasons.length === 0, reasons };
}

export function validatePlan(plan, portfolio, limits) {
  const reasons = [];

  if (limits.mode !== "paper") reasons.push("Only paper mode is enabled");
  if (plan.allocationPct > limits.maxPoolAllocationPct) {
    reasons.push("Per-pool allocation limit exceeded");
  }
  if (portfolio.allocatedPct + plan.allocationPct > limits.maxPortfolioAllocationPct) {
    reasons.push("Portfolio allocation limit exceeded");
  }
  if (plan.slippageBps > limits.maxSlippageBps) {
    reasons.push("Plan slippage limit exceeded");
  }

  return { ok: reasons.length === 0, reasons };
}
