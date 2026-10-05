export async function runCycle({
  engine,
  pools,
  capitalPerPositionUsd = 1_000,
}) {
  const ranked = engine.scan(pools, { capitalUsd: capitalPerPositionUsd });
  const portfolio = engine.ledger.snapshot();
  const opened = [];

  for (const candidate of ranked) {
    if (!candidate.risk.ok) continue;
    if (portfolio.allocatedPct >= engine.limits.maxPortfolioAllocationPct) break;

    const alreadyOpen = engine.ledger
      .snapshot()
      .positions.some((p) => p.poolId === candidate.pool.id);
    if (alreadyOpen) continue;

    const proposal = engine.proposeOpen(candidate.pool, candidate.metrics, {
      capitalUsd: capitalPerPositionUsd,
    });
    if (!proposal.risk.ok) continue;

    opened.push(engine.executeOpen(candidate.pool, proposal));
    if (opened.length >= 1) break;
  }

  const poolById = new Map(pools.map((p) => [p.id, p]));
  const rebalanced = [];
  for (const item of engine.inspectPositions(poolById)) {
    if (item.health.state === "ACTIVE") continue;
    const pool = poolById.get(item.position.poolId);
    if (!pool) continue;
    const receipt = engine.rebalanceIfNeeded(item.position, pool);
    if (receipt) rebalanced.push(receipt);
  }

  return {
    ranked,
    opened,
    rebalanced,
    portfolio: engine.ledger.snapshot(),
  };
}
