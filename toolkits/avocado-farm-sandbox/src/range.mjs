const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function chooseRange(pool, limits) {
  const spot = pool.spotPrice;
  if (!(spot > 0)) throw new Error(`Invalid spot price for ${pool.id}`);

  const halfWidthPct = clamp(
    (pool.realizedVol24hPct ?? 1) * 1.75,
    limits.minRangeHalfWidthPct,
    limits.maxRangeHalfWidthPct,
  );

  return {
    centerPrice: spot,
    halfWidthPct,
    lowerPrice: spot * (1 - halfWidthPct / 100),
    upperPrice: spot * (1 + halfWidthPct / 100),
  };
}

export function rangeHealth(position, spotPrice, triggerFraction = 0.82) {
  const { lowerPrice, upperPrice } = position.range;
  if (spotPrice < lowerPrice || spotPrice > upperPrice) {
    return { state: "OUT_OF_RANGE", edgeFraction: 1 };
  }

  const half = (upperPrice - lowerPrice) / 2;
  const center = (upperPrice + lowerPrice) / 2;
  const edgeFraction = half > 0 ? Math.abs(spotPrice - center) / half : 1;

  return {
    state: edgeFraction >= triggerFraction ? "NEAR_EDGE" : "ACTIVE",
    edgeFraction,
  };
}
