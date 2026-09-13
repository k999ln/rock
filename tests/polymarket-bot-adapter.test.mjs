import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessPolymarketBotBacktest,
  POLYMARKET_BOT_SOURCE,
} from '../lib/polymarket-bot-adapter.ts';

function report(overrides = {}) {
  return {
    schema: 'rockstaros-polymarket-bot-backtest/1',
    mode: 'backtest',
    source: {
      repository: POLYMARKET_BOT_SOURCE.repository,
      commit: POLYMARKET_BOT_SOURCE.reviewedCommit,
      cleanTree: true,
    },
    policy: { countsAsFundRevenue: false, liveExecutionEnabled: false },
    metrics: {
      snapshots: 1_000,
      trades: 40,
      wins: 25,
      losses: 15,
      winRate: 0.625,
      totalPnl: 12.34,
      profitFactor: 1.4,
      maxDrawdown: 8.5,
    },
    ...overrides,
  };
}

void test('pinned clean backtests remain simulation and never become revenue', () => {
  const result = assessPolymarketBotBacktest(report());
  assert.equal(result.assessment, 'simulation_only');
  assert.equal(result.eligibleForFundRevenue, false);
  assert.equal(result.policy.acceptsPrivateKey, false);
});

void test('small samples are labeled insufficient', () => {
  const value = report();
  value.metrics.trades = 2;
  value.metrics.wins = 1;
  value.metrics.losses = 1;
  value.metrics.winRate = 0.5;
  assert.equal(
    assessPolymarketBotBacktest(value).assessment,
    'insufficient_sample',
  );
});

void test('live mode, unreviewed code, inconsistent PnL and secrets fail closed', () => {
  const live = report();
  live.policy.liveExecutionEnabled = true;
  assert.throws(() => assessPolymarketBotBacktest(live), /UNTRUSTED/u);

  const changed = report();
  changed.source.cleanTree = false;
  assert.throws(() => assessPolymarketBotBacktest(changed), /UNTRUSTED/u);

  const inconsistent = report();
  inconsistent.metrics.winRate = 0.99;
  assert.throws(() => assessPolymarketBotBacktest(inconsistent), /INCONSISTENT/u);

  assert.throws(
    () => assessPolymarketBotBacktest({ ...report(), privateKey: 'never' }),
    /SECRET_FIELD/u,
  );
});
