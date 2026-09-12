import assert from 'node:assert/strict';
import test from 'node:test';

import { answerSubscriptionQuestion } from '../lib/subscription-advisor.ts';

const summary = {
  counts: { total: 4, live: 3, active: 2, action_required: 1 },
  monthly_totals: { JPY: 1200, USD: 9.99 },
  alerts: [
    {
      severity: 'critical',
      subscription: 'Example Pro',
      message: '支払い方法を確認してください',
    },
  ],
  offline: true,
};

const subscriptions = [
  {
    id: 1,
    name: 'Next Service',
    status: 'active',
    amount: 1200,
    currency: 'JPY',
    billing_cycle: 'monthly',
    renewal_date: '2026-09-20',
  },
  {
    id: 2,
    name: 'Past Service',
    status: 'expired',
    amount: 9.99,
    currency: 'USD',
    billing_cycle: 'monthly',
    renewal_date: '2026-08-20',
  },
];

void test('advisor answers monthly cost without combining currencies', () => {
  const answer = answerSubscriptionQuestion(
    '今月いくら？',
    summary,
    subscriptions,
  );
  assert.match(answer, /JPY: ￥1,200/);
  assert.match(answer, /USD: \$9\.99/);
  assert.match(answer, /為替換算せず/);
});

void test('advisor reports actionable alerts and refuses automatic payment', () => {
  const answer = answerSubscriptionQuestion(
    '要対応は？',
    summary,
    subscriptions,
  );
  assert.match(answer, /要対応は1件/);
  assert.match(answer, /Example Pro/);
  assert.match(answer, /支払い・解約は実行しません/);
});

void test('advisor orders future renewals from the local ledger', () => {
  const answer = answerSubscriptionQuestion(
    '次の更新は？',
    summary,
    subscriptions,
    new Date('2026-09-12T00:00:00Z'),
  );
  assert.match(answer, /Next Service/);
  assert.doesNotMatch(answer, /Past Service/);
});
