import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import {
  createMercariRevenuePlan,
  transitionMercariRevenuePlan,
} from '../lib/mercari-revenue.ts';
import { mercariRevenueStore } from '../lib/mercari-revenue-store.ts';

function database(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const statement = sqlite.prepare(sql);
          return {
            async first() {
              return statement.get(...args) ?? null;
            },
            async all() {
              return { results: statement.all(...args) };
            },
          };
        },
      };
    },
  };
}

const input = (id) => ({
  id,
  channel: 'consumer_assisted',
  title: '自分の在庫',
  condition: '動作確認済み',
  facts: '傷の位置と付属品を確認済みです。',
  priceJPY: 3000,
  marketplaceFeeJPY: 300,
  shippingJPY: 750,
  itemCostJPY: 0,
  otherCostJPY: 0,
  ownsStock: true,
  accurate: true,
  prohibitedChecked: true,
});

void test('D1-compatible store isolates owners and rejects stale writes', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'),
    );
  const alice = mercariRevenueStore(database(sqlite), 'alice');
  const bob = mercariRevenueStore(database(sqlite), 'bob');
  const plan = createMercariRevenuePlan(
    input('123e4567-e89b-42d3-a456-426614174000'),
  );
  assert.deepEqual(await alice.create(plan), plan);
  assert.equal(await bob.get(plan.id), null);
  assert.deepEqual(await bob.list(), []);
  await assert.rejects(() => bob.create(plan), /操作IDの重複/);
  const approved = transitionMercariRevenuePlan(plan, {
    id: plan.id,
    action: 'approve',
    expectedRevision: 0,
  });
  assert.deepEqual(await alice.update(plan, approved), approved);
  await assert.rejects(() => alice.update(plan, approved), /別の画面/);
  assert.equal((await alice.list())[0].status, 'approved');
});
