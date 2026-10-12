import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultEstimate, estimate } from '../lib/settlement.ts';
import { parseAccounts, walletError } from '../lib/wallet.ts';

void test('zero income never creates a Rock star debt, but real running costs remain', () => {
  const actual = estimate(defaultEstimate);
  assert.equal(actual.fee, 0);
  assert.equal(actual.electricity, 74);
  assert.equal(actual.unrecoveredCost, 74);
  assert.equal(actual.net, -74);
});
void test('legacy fixture fee cannot exceed low income and no remainder is carried', () => {
  const actual = estimate({ ...defaultEstimate, revenue: 500 }, true);
  assert.equal(actual.recoveredCost, 74);
  assert.equal(actual.fee, 426);
  assert.equal(actual.payout, 0);
  assert.equal(actual.net, 0);
});
void test('legacy fixture monthly fee capped at 8.88 USD', () => {
  const actual = estimate({
    ...defaultEstimate,
    revenue: 130000,
    dataGB: 10,
    dataRate: 20,
    apiCost: 500,
  }, true);
  assert.deepEqual(actual, {
    revenue: 130000,
    feeCap: 1332,
    fee: 1332,
    payout: 127894,
    electricity: 74,
    data: 200,
    api: 500,
    operatingCost: 774,
    recoveredCost: 774,
    unrecoveredCost: 0,
    totalCost: 2106,
    net: 127894,
  });
});
void test('legacy fixture rounds fractional FX in whole JPY', () => {
  const actual = estimate({
    ...defaultEstimate,
    revenue: 2000,
    fx: 155.55,
    watts: 0,
  }, true);
  assert.equal(actual.fee, 1381);
  assert.equal(actual.net, 619);
});
void test('current estimate excludes the held revenue fee', () => {
  const actual = estimate({ ...defaultEstimate, revenue: 130000 });
  assert.equal(actual.feeCap, 0);
  assert.equal(actual.fee, 0);
  assert.equal(actual.payout, 129926);
});
void test('invalid financial inputs fail instead of silently clamping', () => {
  for (const patch of [
    { revenue: -1 },
    { fx: 0 },
    { hours: 745 },
    { dataGB: NaN },
    { apiCost: Infinity },
    { watts: '60' },
    { dataRate: 100001 },
  ])
    assert.throws(() => estimate({ ...defaultEstimate, ...patch }));
});
void test('only valid EVM addresses can appear as connected', () => {
  const address = '0x' + 'ab'.repeat(20);
  assert.deepEqual(parseAccounts([address, '0xdead', null, 5]), [address]);
  assert.deepEqual(parseAccounts({ address }), []);
  assert.deepEqual(parseAccounts([]), []);
});
void test('wallet cancellation and pending requests are understandable', () => {
  assert.match(walletError({ code: 4001 }), /キャンセル/);
  assert.match(walletError({ code: -32002 }), /保留中/);
  assert.match(walletError(null), /接続できません/);
});
