import { randomUUID } from "node:crypto";

export class PaperLedger {
  constructor({ startingCashUsd = 10_000 } = {}) {
    this.cashUsd = startingCashUsd;
    this.positions = new Map();
    this.receipts = [];
    this.realizedPnlTodayUsd = 0;
    this.turnoverTodayUsd = 0;
  }

  snapshot() {
    const deployedUsd = [...this.positions.values()].reduce(
      (sum, p) => sum + p.capitalUsd,
      0,
    );
    const totalUsd = this.cashUsd + deployedUsd;
    return {
      cashUsd: this.cashUsd,
      deployedUsd,
      totalUsd,
      allocatedPct: totalUsd > 0 ? (deployedUsd / totalUsd) * 100 : 0,
      realizedPnlTodayUsd: this.realizedPnlTodayUsd,
      turnoverTodayUsd: this.turnoverTodayUsd,
      positions: [...this.positions.values()],
    };
  }

  record(type, details) {
    const receipt = {
      id: randomUUID(),
      type,
      at: new Date().toISOString(),
      mode: "paper",
      ...details,
    };
    this.receipts.push(receipt);
    return receipt;
  }

  open({ pool, capitalUsd, allocationPct, range, metrics }) {
    if (capitalUsd > this.cashUsd) throw new Error("Insufficient paper cash");
    this.cashUsd -= capitalUsd;
    this.turnoverTodayUsd += capitalUsd;

    const position = {
      id: randomUUID(),
      poolId: pool.id,
      pair: `${pool.token0}/${pool.token1}`,
      capitalUsd,
      allocationPct,
      entryPrice: pool.spotPrice,
      lastPrice: pool.spotPrice,
      range,
      metricsAtEntry: metrics,
      openedAt: new Date().toISOString(),
      rebalanceCount: 0,
    };
    this.positions.set(position.id, position);
    this.record("OPEN", { positionId: position.id, poolId: pool.id, capitalUsd, range });
    return position;
  }

  rebalance(positionId, { newRange, estimatedCostUsd = 0, spotPrice }) {
    const position = this.positions.get(positionId);
    if (!position) throw new Error("Position not found");

    this.cashUsd -= estimatedCostUsd;
    this.realizedPnlTodayUsd -= estimatedCostUsd;
    this.turnoverTodayUsd += position.capitalUsd;
    position.range = newRange;
    position.lastPrice = spotPrice;
    position.rebalanceCount += 1;

    return this.record("REBALANCE", {
      positionId,
      poolId: position.poolId,
      estimatedCostUsd,
      newRange,
    });
  }
}
