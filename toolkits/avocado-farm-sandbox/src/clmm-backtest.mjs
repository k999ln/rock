const sqrt = Math.sqrt;

function makePosition(capitalUsd, price, halfWidthPct) {
  const lower = price * (1 - halfWidthPct / 100);
  const upper = price * (1 + halfWidthPct / 100);
  const sa = sqrt(lower);
  const sb = sqrt(upper);
  const sp = sqrt(price);

  const amount0PerL = (sb - sp) / (sp * sb);
  const amount1PerL = sp - sa;
  const valuePerL = amount0PerL * price + amount1PerL;
  const liquidity = capitalUsd / valuePerL;

  return { lower, upper, liquidity, entryPrice: price };
}

function amountsAtPrice(position, price) {
  const sa = sqrt(position.lower);
  const sb = sqrt(position.upper);
  const sp = sqrt(Math.max(price, Number.MIN_VALUE));
  const L = position.liquidity;

  if (price <= position.lower) {
    return {
      amount0: L * (sb - sa) / (sa * sb),
      amount1: 0,
    };
  }
  if (price >= position.upper) {
    return {
      amount0: 0,
      amount1: L * (sb - sa),
    };
  }
  return {
    amount0: L * (sb - sp) / (sp * sb),
    amount1: L * (sp - sa),
  };
}

function positionValue(position, price) {
  const { amount0, amount1 } = amountsAtPrice(position, price);
  return amount0 * price + amount1;
}

export function backtestConcentratedLp(candles, {
  startingCapitalUsd = 1_000,
  rangeHalfWidthPct = 12,
  feeBps = 30,
  tvlUsd = 1_000_000,
  slippageBps = 25,
  gasPerRebalanceUsd = 0.35,
} = {}) {
  if (!candles?.length) throw new Error("No historical candles");
  const ordered = [...candles].sort((a,b)=>a.timestamp-b.timestamp);
  const first = ordered[0];
  if (!(first.open > 0)) throw new Error("Invalid first price");

  let capital = startingCapitalUsd;
  let position = makePosition(capital, first.open, rangeHalfWidthPct);
  let unclaimedFees = 0;
  let totalFees = 0;
  let totalCosts = 0;
  let rebalances = 0;
  let peak = startingCapitalUsd;
  let maxDrawdownPct = 0;
  let inRangeCandles = 0;

  const initialAmounts = amountsAtPrice(position, first.open);

  for (const candle of ordered) {
    const close = candle.close;
    const currentValue = positionValue(position, close);
    const closeInRange = close >= position.lower && close <= position.upper;
    if (closeInRange) {
      inRangeCandles += 1;
      const share = tvlUsd > 0 ? Math.min(1, currentValue / tvlUsd) : 0;
      const fees = candle.volumeUsd * (feeBps / 10_000) * share;
      unclaimedFees += fees;
      totalFees += fees;
    }

    let equity = currentValue + unclaimedFees;
    peak = Math.max(peak, equity);
    if (peak > 0) {
      maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - equity) / peak) * 100);
    }

    const breached = candle.low < position.lower || candle.high > position.upper;
    if (!breached) continue;

    const gross = currentValue + unclaimedFees;
    const cost = gross * (slippageBps / 10_000) + gasPerRebalanceUsd;
    capital = Math.max(0, gross - cost);
    totalCosts += cost;
    unclaimedFees = 0;
    position = makePosition(capital, close, rangeHalfWidthPct);
    rebalances += 1;
  }

  const last = ordered.at(-1);
  const finalLpValue = positionValue(position, last.close);
  const finalEquityUsd = finalLpValue + unclaimedFees;
  const pnlUsd = finalEquityUsd - startingCapitalUsd;
  const returnPct = (pnlUsd / startingCapitalUsd) * 100;
  const days = Math.max(1/24, (last.timestamp - first.timestamp) / 86_400);
  const simpleAnnualizedPct = returnPct * (365 / days);
  const hodlEquityUsd =
    initialAmounts.amount0 * last.close + initialAmounts.amount1;
  const holdReturnPct = ((hodlEquityUsd - startingCapitalUsd) / startingCapitalUsd) * 100;

  return {
    startingCapitalUsd,
    finalEquityUsd,
    pnlUsd,
    returnPct,
    simpleAnnualizedPct,
    hodlEquityUsd,
    holdReturnPct,
    excessVsInitialHoldUsd: finalEquityUsd - hodlEquityUsd,
    totalModeledFeesUsd: totalFees,
    totalRebalanceCostsUsd: totalCosts,
    rebalances,
    maxDrawdownPct,
    inRangePct: (inRangeCandles / ordered.length) * 100,
    candles: ordered.length,
    startTimestamp: first.timestamp,
    endTimestamp: last.timestamp,
    startPrice: first.open,
    endPrice: last.close,
    rangeHalfWidthPct,
    feeBps,
    tvlUsdAssumption: tvlUsd,
    slippageBps,
    gasPerRebalanceUsd,
  };
}
