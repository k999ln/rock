import assert from 'node:assert/strict';
import test from 'node:test';
import { isWalletSnapshot } from '../lib/wallet-snapshot.ts';
const snapshot = () => ({
  ownerScope: `owner-v1:${'a'.repeat(64)}`, currency: 'JPY', balance: 800, revenue: 1000, expense: 200,
  records: [{ id: 'entry', kind: 'revenue', amount: 1000, source: 'coconala', occurredOn: '2026-10-10', reversesId: null, createdAt: 1, reversed: 0 }],
  persistence: 'd1', transfers: 'not-connected',
  fund: { joined: false, status: 'simulation', commonRevenue: 0, distributable: 0, projectedShare: 0, updatedAt: null },
});
void test('Wallet read model accepts complete current, reversal and legacy ownerless snapshots', () => {
  const current = snapshot(); assert.equal(isWalletSnapshot(current), true);
  current.records.push({ ...current.records[0], id: 'reversal', kind: 'expense', reversesId: 'entry', reversed: 0 });
  current.records[0].reversed = 1; assert.equal(isWalletSnapshot(current), true);
  delete current.ownerScope; assert.equal(isWalletSnapshot(current), true);
});
void test('Wallet missing top-level, record or fund fields are never accepted as success', () => {
  for (const key of Object.keys(snapshot()).filter(key => key !== 'ownerScope')) {
    const value = snapshot(); delete value[key]; assert.equal(isWalletSnapshot(value), false, key);
  }
  for (const key of Object.keys(snapshot().records[0])) {
    const value = snapshot(); delete value.records[0][key]; assert.equal(isWalletSnapshot(value), false, `record.${JSON.stringify(key)}`);
  }
  for (const key of Object.keys(snapshot().fund)) {
    const value = snapshot(); delete value.fund[key]; assert.equal(isWalletSnapshot(value), false, `fund.${JSON.stringify(key)}`);
  }
});
void test('Wallet rejects malformed containers, owner scopes and value types', () => {
  for (const value of [null, undefined, [], '', 1, { ownerScope: snapshot().ownerScope }]) assert.equal(isWalletSnapshot(value), false);
  for (const [key, invalid] of [['ownerScope', 'alice'], ['currency', 'USD'], ['records', {}], ['records', [null]], ['fund', []], ['balance', '800'], ['expense', NaN], ['revenue', Infinity], ['persistence', 'memory'], ['transfers', 'connected']]) {
    assert.equal(isWalletSnapshot({ ...snapshot(), [key]: invalid }), false, key);
  }
  for (const [key, invalid] of [['id', null], ['kind', 'transfer'], ['amount', '1000'], ['source', {}], ['occurredOn', 'yesterday'], ['reversesId', {}], ['createdAt', NaN], ['reversed', true]]) {
    const value = snapshot(); value.records[0][key] = invalid; assert.equal(isWalletSnapshot(value), false, `record.${JSON.stringify(key)}`);
  }
  for (const [key, invalid] of [['joined', 'false'], ['status', 'live'], ['commonRevenue', Infinity], ['distributable', null], ['projectedShare', '0'], ['updatedAt', 123]]) {
    const value = snapshot(); value.fund[key] = invalid; assert.equal(isWalletSnapshot(value), false, `fund.${JSON.stringify(key)}`);
  }
});
