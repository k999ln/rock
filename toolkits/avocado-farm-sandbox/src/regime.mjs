const mean = (xs) =>
  xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : 0;

function sampleStdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance =
    xs.reduce((sum, value) => sum + (value - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

export function summarizeRegime(candles, tvlUsd) {
  const ordered = [...(candles ?? [])].sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  if (ordered.length < 2) {
    return {
      trendPct: 0,
      realizedVolDailyPct: 0,
      avgIntrabarRangePct: 0,
      volumeTvlPerDay: 0,
      days: 0,
    };
  }

  const first = ordered[0];
  const last = ordered.at(-1);
  const hours = Math.max(
    1,
    (last.timestamp - first.timestamp) / 3600,
  );
  const days = hours / 24;
  const logReturns = [];
  const intrabarRanges = [];
  let volumeUsd = 0;

  for (let i = 0; i < ordered.length; i += 1) {
    const candle = ordered[i];
    volumeUsd += Math.max(0, candle.volumeUsd ?? 0);
    if (candle.open > 0) {
      intrabarRanges.push(
        ((Math.max(candle.high, candle.low) - Math.min(candle.high, candle.low)) /
          candle.open) *
          100,
      );
    }
    if (i > 0 && ordered[i - 1].close > 0 && candle.close > 0) {
      logReturns.push(Math.log(candle.close / ordered[i - 1].close));
    }
  }

  const hourlyVol = sampleStdev(logReturns);
  const realizedVolDailyPct = hourlyVol * Math.sqrt(24) * 100;
  const trendPct =
    first.open > 0 ? ((last.close / first.open) - 1) * 100 : 0;
  const volumeTvlPerDay =
    tvlUsd > 0 && days > 0 ? (volumeUsd / days) / tvlUsd : 0;

  return {
    trendPct,
    realizedVolDailyPct,
    avgIntrabarRangePct: mean(intrabarRanges),
    volumeTvlPerDay,
    days,
  };
}

export function evaluateEntryGate({
  selected,
  regime,
  minTrainingReturnPct = 0.5,
  maxTrainingDrawdownPct = 30,
  maxTrainingRebalancesPerDay = 4,
  minVolumeTvlPerDay = 0.05,
  maxVolToRangeRatio = 1.5,
  maxTrendToRangeRatio = 1.75,
} = {}) {
  if (!selected) {
    return { enter: false, reasons: ["No LP candidate"] };
  }

  const reasons = [];
  const range = selected.rangeHalfWidthPct;
  const result = selected.result;
  const trainingDays = Math.max(
    1 / 24,
    (result.endTimestamp - result.startTimestamp) / 86_400,
  );
  const rebalancesPerDay = result.rebalances / trainingDays;
  const volToRangeRatio =
    range > 0 ? regime.realizedVolDailyPct / range : Number.POSITIVE_INFINITY;
  const trendToRangeRatio =
    range > 0 ? Math.abs(regime.trendPct) / range : Number.POSITIVE_INFINITY;

  if (result.returnPct < minTrainingReturnPct) {
    reasons.push(
      `Training edge too small: ${result.returnPct.toFixed(2)}%`,
    );
  }
  if (result.maxDrawdownPct > maxTrainingDrawdownPct) {
    reasons.push(
      `Training drawdown too high: ${result.maxDrawdownPct.toFixed(2)}%`,
    );
  }
  if (rebalancesPerDay > maxTrainingRebalancesPerDay) {
    reasons.push(
      `Training rebalance rate too high: ${rebalancesPerDay.toFixed(2)}/day`,
    );
  }
  if (regime.volumeTvlPerDay < minVolumeTvlPerDay) {
    reasons.push(
      `Volume/TVL too low: ${regime.volumeTvlPerDay.toFixed(3)}/day`,
    );
  }
  if (volToRangeRatio > maxVolToRangeRatio) {
    reasons.push(
      `Volatility/range too high: ${volToRangeRatio.toFixed(2)}x`,
    );
  }
  if (trendToRangeRatio > maxTrendToRangeRatio) {
    reasons.push(
      `Trend/range too high: ${trendToRangeRatio.toFixed(2)}x`,
    );
  }

  return {
    enter: reasons.length === 0,
    reasons,
    metrics: {
      rebalancesPerDay,
      volToRangeRatio,
      trendToRangeRatio,
    },
  };
}
