const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function reviewStrategyWindow(observations) {
  if (!observations.length) {
    return {
      sampleSize: 0,
      realizedNetAprPct: 0,
      outOfRangeRate: 0,
      avgRebalanceCostPct: 0,
    };
  }

  const sums = observations.reduce(
    (acc, item) => {
      acc.realizedNetAprPct += item.realizedNetAprPct ?? 0;
      acc.outOfRange += item.outOfRange ? 1 : 0;
      acc.rebalanceCostPct += item.rebalanceCostPct ?? 0;
      return acc;
    },
    { realizedNetAprPct: 0, outOfRange: 0, rebalanceCostPct: 0 },
  );

  return {
    sampleSize: observations.length,
    realizedNetAprPct: sums.realizedNetAprPct / observations.length,
    outOfRangeRate: sums.outOfRange / observations.length,
    avgRebalanceCostPct: sums.rebalanceCostPct / observations.length,
  };
}

export function proposeBoundedTuning(summary, current = {}) {
  const currentRangeMultiplier = current.rangeMultiplier ?? 1;
  const currentAllocationMultiplier = current.allocationMultiplier ?? 1;

  let rangeMultiplier = currentRangeMultiplier;
  let allocationMultiplier = currentAllocationMultiplier;
  const reasons = [];

  if (summary.outOfRangeRate > 0.35) {
    rangeMultiplier += 0.15;
    reasons.push("Widen range: out-of-range rate is high");
  } else if (
    summary.outOfRangeRate < 0.1 &&
    summary.avgRebalanceCostPct < 0.05
  ) {
    rangeMultiplier -= 0.05;
    reasons.push("Narrow range slightly: range utilization is low");
  }

  if (summary.realizedNetAprPct < 0) {
    allocationMultiplier -= 0.2;
    reasons.push("Reduce allocation: realized net APR is negative");
  } else if (
    summary.realizedNetAprPct > 12 &&
    summary.outOfRangeRate < 0.25
  ) {
    allocationMultiplier += 0.05;
    reasons.push("Increase allocation slightly: positive realized window");
  }

  return {
    rangeMultiplier: clamp(rangeMultiplier, 0.7, 1.6),
    allocationMultiplier: clamp(allocationMultiplier, 0.5, 1.15),
    reasons,
  };
}
