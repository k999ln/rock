export const POLYMARKET_BOT_SOURCE = {
  repository: 'https://github.com/MrFadiAi/Polymarket-bot',
  reviewedCommit: '3a04fc842bc3112a11b872263bb55e6712096f9a',
  license: 'MIT',
} as const;

export const POLYMARKET_BOT_POLICY = {
  mode: 'backtest_only',
  acceptsPrivateKey: false,
  liveExecutionEnabled: false,
  countsAsFundRevenue: false,
  revenueRecognition: 'provider_confirmed_realized_pnl_only',
} as const;

type BacktestMetrics = {
  snapshots: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_BACKTEST_REPORT');
  return value as Record<string, unknown>;
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  )
    throw new Error('INVALID_BACKTEST_METRICS');
  return value;
}

function rejectSecretFields(value: unknown) {
  const pending: unknown[] = [value];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (/private.?key|mnemonic|seed.?phrase|secret|api.?key|bearer|password/iu.test(key))
        throw new Error('SECRET_FIELD_REJECTED');
      pending.push(child);
    }
  }
}

export function assessPolymarketBotBacktest(value: unknown) {
  rejectSecretFields(value);
  const report = record(value);
  const source = record(report.source);
  const policy = record(report.policy);
  const raw = record(report.metrics);

  if (
    report.schema !== 'rockstaros-polymarket-bot-backtest/1' ||
    report.mode !== 'backtest' ||
    source.repository !== POLYMARKET_BOT_SOURCE.repository ||
    source.commit !== POLYMARKET_BOT_SOURCE.reviewedCommit ||
    source.cleanTree !== true ||
    policy.countsAsFundRevenue !== false ||
    policy.liveExecutionEnabled !== false
  )
    throw new Error('UNTRUSTED_BACKTEST_PROVENANCE');

  const metrics: BacktestMetrics = {
    snapshots: boundedNumber(raw.snapshots, 1, 10_000_000, true),
    trades: boundedNumber(raw.trades, 0, 10_000_000, true),
    wins: boundedNumber(raw.wins, 0, 10_000_000, true),
    losses: boundedNumber(raw.losses, 0, 10_000_000, true),
    winRate: boundedNumber(raw.winRate, 0, 1),
    totalPnl: boundedNumber(raw.totalPnl, -1_000_000_000, 1_000_000_000),
    profitFactor:
      raw.profitFactor === null
        ? null
        : boundedNumber(raw.profitFactor, 0, 1_000_000),
    maxDrawdown: boundedNumber(raw.maxDrawdown, 0, 1_000_000_000),
  };
  if (
    metrics.wins + metrics.losses > metrics.trades ||
    (metrics.trades > 0 &&
      Math.abs(metrics.winRate - metrics.wins / metrics.trades) > 0.001)
  )
    throw new Error('INCONSISTENT_BACKTEST_METRICS');

  const sampleAdequate = metrics.snapshots >= 100 && metrics.trades >= 30;
  return {
    ok: true as const,
    source: POLYMARKET_BOT_SOURCE,
    policy: POLYMARKET_BOT_POLICY,
    metrics,
    assessment: sampleAdequate ? 'simulation_only' : 'insufficient_sample',
    eligibleForFundRevenue: false,
    message: sampleAdequate
      ? 'バックテスト結果です。実収益・将来利回り・注文推奨ではありません。'
      : '標本が少ないため比較材料としても不足しています。実収益には計上しません。',
  };
}
