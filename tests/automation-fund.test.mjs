import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_FUND_TOOL_COUNT,
  formAutomationFund,
  validateAutomationFundPlan,
} from '../lib/automation-fund.ts';

const candidates = Array.from({ length: 24 }, (_, index) => ({
  toolId: `tool-${index + 1}`,
  role: `role-${index % 7}`,
  strategyAffinity: [
    index % 2 ? 'balanced' : 'creator-services',
    'commerce',
  ],
  ready: true,
  verifiedGrossMinor: index > 10 ? index * 100 : 0,
  operatingCostMinor: index > 10 ? index * 10 : 0,
  completedReceipts: index > 10 ? index : 0,
  failedRuns: index % 3,
}));

void test('forms a default five-tool fund without fixing the number of funds', () => {
  const plan = formAutomationFund({
    id: 'fund-one',
    name: '自動化ファンド 1',
    strategy: 'balanced',
    candidates,
    now: '2026-09-12T00:00:00.000Z',
  });
  assert.equal(plan.targetToolCount, DEFAULT_FUND_TOOL_COUNT);
  assert.equal(plan.tools.length, 5);
  assert.equal(
    plan.tools.reduce((sum, tool) => sum + tool.allocationBps, 0),
    10_000,
  );
  assert.equal(plan.formationBasis, 'verified_net_revenue');
  assert.deepEqual(validateAutomationFundPlan(plan), plan);
});

void test('tool count is configurable and formation prefers role coverage', () => {
  const plan = formAutomationFund({
    id: 'fund-variable',
    name: '可変ツールファンド',
    strategy: 'creator-services',
    targetToolCount: 7,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      verifiedGrossMinor: 0,
      operatingCostMinor: 0,
      completedReceipts: 0,
    })),
    now: '2026-09-12T00:00:00.000Z',
  });
  assert.equal(plan.tools.length, 7);
  assert.equal(new Set(plan.tools.map((tool) => tool.role)).size, 7);
  assert.equal(plan.formationBasis, 'capability_coverage');
});

void test('unready, duplicate and insufficient candidates fail safely', () => {
  assert.throws(() =>
    formAutomationFund({
      id: 'fund-short',
      name: '不足',
      strategy: 'balanced',
      targetToolCount: 3,
      candidates: candidates.slice(0, 2),
    }),
  );
  assert.throws(() =>
    formAutomationFund({
      id: 'fund-duplicate',
      name: '重複',
      strategy: 'balanced',
      targetToolCount: 2,
      candidates: [candidates[0], { ...candidates[0] }],
    }),
  );
});
