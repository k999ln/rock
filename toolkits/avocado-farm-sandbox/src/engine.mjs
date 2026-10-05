import { rankPools } from "./scoring.mjs";
import { chooseRange, rangeHealth } from "./range.mjs";
import { validateCandidate, validatePlan } from "./risk.mjs";

export class FarmEngine {
  constructor({ ledger, limits }) {
    this.ledger = ledger;
    this.limits = limits;
  }

  scan(pools, { capitalUsd = 1_000 } = {}) {
    const portfolio = this.ledger.snapshot();
    return rankPools(pools, { capitalUsd }).map((entry) => ({
      ...entry,
      risk: validateCandidate(entry.pool, entry.metrics, portfolio, this.limits),
    }));
  }

  proposeOpen(pool, metrics, { capitalUsd = 1_000 } = {}) {
    const portfolio = this.ledger.snapshot();
    const allocationPct =
      portfolio.totalUsd > 0 ? (capitalUsd / portfolio.totalUsd) * 100 : 100;

    const plan = {
      kind: "OPEN",
      poolId: pool.id,
      capitalUsd,
      allocationPct,
      slippageBps: pool.slippageBps ?? 0,
      range: chooseRange(pool, this.limits),
    };

    return {
      plan,
      risk: validatePlan(plan, portfolio, this.limits),
      metrics,
    };
  }

  executeOpen(pool, proposal) {
    if (!proposal.risk.ok) {
      throw new Error(`Plan denied: ${proposal.risk.reasons.join("; ")}`);
    }
    return this.ledger.open({
      pool,
      capitalUsd: proposal.plan.capitalUsd,
      allocationPct: proposal.plan.allocationPct,
      range: proposal.plan.range,
      metrics: proposal.metrics,
    });
  }

  inspectPositions(poolById) {
    return this.ledger.snapshot().positions.map((position) => {
      const pool = poolById.get(position.poolId);
      if (!pool) {
        return { position, health: { state: "UNKNOWN_POOL", edgeFraction: 1 } };
      }
      return {
        position,
        health: rangeHealth(
          position,
          pool.spotPrice,
          this.limits.rebalanceTriggerFraction,
        ),
      };
    });
  }

  rebalanceIfNeeded(position, pool) {
    const health = rangeHealth(
      position,
      pool.spotPrice,
      this.limits.rebalanceTriggerFraction,
    );
    if (health.state === "ACTIVE") return null;

    const newRange = chooseRange(pool, this.limits);
    const estimatedCostUsd =
      position.capitalUsd * ((pool.slippageBps ?? 0) / 10_000) +
      (pool.estimatedRebalanceGasUsd ?? 0);

    return this.ledger.rebalance(position.id, {
      newRange,
      estimatedCostUsd,
      spotPrice: pool.spotPrice,
    });
  }
}
