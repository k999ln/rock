const sqrt = Math.sqrt;

const quoteUsdAt = (candle, field = "close") => {
  const key =
    field === "open"
      ? "quoteUsdOpen"
      : field === "high"
        ? "quoteUsdHigh"
        : field === "low"
          ? "quoteUsdLow"
          : "quoteUsdClose";
  const value = Number(candle?.[key] ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
};

function makePosition(capitalUsd, pairPrice, quoteUsd, halfWidthPct) {
  const lower = pairPrice * (1 - halfWidthPct / 100);
  const upper = pairPrice * (1 + halfWidthPct / 100);
  const sa = sqrt(lower);
  const sb = sqrt(upper);
  const sp = sqrt(pairPrice);

  const amount0PerL = (sb - sp) / (sp * sb);
  const amount1PerL = sp - sa;
  const valuePerLQuote = amount0PerL * pairPrice + amount1PerL;
  const capitalQuote = capitalUsd / quoteUsd;
  const liquidity = capitalQuote / valuePerLQuote;

  return {
    lower,
    upper,
    liquidity,
    entryPrice: pairPrice,
    entryQuoteUsd: quoteUsd,
  };
}

function amountsAtPrice(position, pairPrice) {
  const sa = sqrt(position.lower);
  const sb = sqrt(position.upper);
  const sp = sqrt(Math.max(pairPrice, Number.MIN_VALUE));
  const L = position.liquidity;

  if (pairPrice <= position.lower) {
    return {
      amount0: (L * (sb - sa)) / (sa * sb),
      amount1: 0,
    };
  }
  if (pairPrice >= position.upper) {
    return {
      amount0: 0,
      amount1: L * (sb - sa),
    };
  }
  return {
    amount0: (L * (sb - sp)) / (sp * sb),
    amount1: L * (sp - sa),
  };
}

function positionValueQuote(position, pairPrice) {
  const { amount0, amount1 } = amountsAtPrice(position, pairPrice);
  return amount0 * pairPrice + amount1;
}

function positionValueUsd(position, pairPrice, quoteUsd) {
  return positionValueQuote(position, pairPrice) * quoteUsd;
}

export function backtestConcentratedLp(
  candles,
  {
    startingCapitalUsd = 1_000,
    rangeHalfWidthPct = 12,
    feeBps = 30,
    tvlUsd = 1_000_000,
    slippageBps = 25,
    gasPerRebalanceUsd = 0.35,
    stopLossPct = null,
  } = {},
) {
  if (!candles?.length) throw new Error("No historical candles");
  const ordered = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const first = ordered[0];
  if (!(first.open > 0)) throw new Error("Invalid first price");

  const firstQuoteUsd = quoteUsdAt(first, "open");
  let capital = startingCapitalUsd;
  let position = makePosition(
    capital,
    first.open,
    firstQuoteUsd,
    rangeHalfWidthPct,
  );
  let unclaimedFeesUsd = 0;
  let totalFeesUsd = 0;
  let totalCostsUsd = 0;
  let rebalances = 0;
  let peakUsd = startingCapitalUsd;
  let maxDrawdownPct = 0;
  let inRangeCandles = 0;
  let stoppedOut = false;
  let stoppedAt = null;
  const stopEquityUsd =
    Number.isFinite(stopLossPct) && stopLossPct > 0
      ? startingCapitalUsd * (1 - stopLossPct / 100)
      : null;

  const initialAmounts = amountsAtPrice(position, first.open);

  for (const candle of ordered) {
    const close = candle.close;
    const quoteUsdClose = quoteUsdAt(candle, "close");
    const currentValueUsd = positionValueUsd(
      position,
      close,
      quoteUsdClose,
    );
    const closeInRange =
      close >= position.lower && close <= position.upper;

    if (stopEquityUsd !== null) {
      const lowMarkUsd = positionValueUsd(
        position,
        candle.low,
        quoteUsdAt(candle, "low"),
      );
      const highMarkUsd = positionValueUsd(
        position,
        candle.high,
        quoteUsdAt(candle, "high"),
      );
      const worstMarkedEquityUsd =
        Math.min(currentValueUsd, lowMarkUsd, highMarkUsd) +
        unclaimedFeesUsd;

      if (worstMarkedEquityUsd <= stopEquityUsd) {
        const exitCostUsd =
          stopEquityUsd * (slippageBps / 10_000) +
          gasPerRebalanceUsd;
        capital = Math.max(0, stopEquityUsd - exitCostUsd);
        totalCostsUsd += exitCostUsd;
        unclaimedFeesUsd = 0;
        stoppedOut = true;
        stoppedAt = candle.timestamp;
        maxDrawdownPct = Math.max(
          maxDrawdownPct,
          ((startingCapitalUsd - capital) / startingCapitalUsd) * 100,
        );
        break;
      }
    }

    if (closeInRange) {
      inRangeCandles += 1;
      const share =
        tvlUsd > 0 ? Math.min(1, currentValueUsd / tvlUsd) : 0;
      const feesUsd =
        candle.volumeUsd * (feeBps / 10_000) * share;
      unclaimedFeesUsd += feesUsd;
      totalFeesUsd += feesUsd;
    }

    const equityUsd = currentValueUsd + unclaimedFeesUsd;
    peakUsd = Math.max(peakUsd, equityUsd);
    if (peakUsd > 0) {
      maxDrawdownPct = Math.max(
        maxDrawdownPct,
        ((peakUsd - equityUsd) / peakUsd) * 100,
      );
    }

    const breached =
      candle.low < position.lower || candle.high > position.upper;
    if (!breached) continue;

    const grossUsd = currentValueUsd + unclaimedFeesUsd;
    const costUsd =
      grossUsd * (slippageBps / 10_000) + gasPerRebalanceUsd;
    capital = Math.max(0, grossUsd - costUsd);
    totalCostsUsd += costUsd;
    unclaimedFeesUsd = 0;
    position = makePosition(
      capital,
      close,
      quoteUsdClose,
      rangeHalfWidthPct,
    );
    rebalances += 1;
  }

  const last = ordered.at(-1);
  const lastQuoteUsd = quoteUsdAt(last, "close");
  const finalLpValueUsd = stoppedOut
    ? capital
    : positionValueUsd(position, last.close, lastQuoteUsd);
  const finalEquityUsd = stoppedOut
    ? capital
    : finalLpValueUsd + unclaimedFeesUsd;
  const pnlUsd = finalEquityUsd - startingCapitalUsd;
  const returnPct = (pnlUsd / startingCapitalUsd) * 100;
  const days = Math.max(
    1 / 24,
    (last.timestamp - first.timestamp) / 86_400,
  );
  const simpleAnnualizedPct = returnPct * (365 / days);

  const finalBaseUsd = last.close * lastQuoteUsd;
  const hodlEquityUsd =
    initialAmounts.amount0 * finalBaseUsd +
    initialAmounts.amount1 * lastQuoteUsd;
  const holdReturnPct =
    ((hodlEquityUsd - startingCapitalUsd) / startingCapitalUsd) * 100;

  return {
    startingCapitalUsd,
    finalEquityUsd,
    pnlUsd,
    returnPct,
    simpleAnnualizedPct,
    hodlEquityUsd,
    holdReturnPct,
    excessVsInitialHoldUsd: finalEquityUsd - hodlEquityUsd,
    totalModeledFeesUsd: totalFeesUsd,
    totalRebalanceCostsUsd: totalCostsUsd,
    rebalances,
    maxDrawdownPct,
    inRangePct: (inRangeCandles / ordered.length) * 100,
    candles: ordered.length,
    startTimestamp: first.timestamp,
    endTimestamp: last.timestamp,
    startPrice: first.open,
    endPrice: last.close,
    startQuoteUsd: firstQuoteUsd,
    endQuoteUsd: lastQuoteUsd,
    rangeHalfWidthPct,
    feeBps,
    tvlUsdAssumption: tvlUsd,
    slippageBps,
    gasPerRebalanceUsd,
    stopLossPct,
    stoppedOut,
    stoppedAt,
  };
}
