import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { operations, OperationError } from '../lib/operations.ts';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../drizzle', import.meta.url))
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'),
    );
  }
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return statement.get(...args) || null;
        },
        async all() {
          return { success: true, results: statement.all(...args) };
        },
      };
    },
  };
  const clock = () => Date.parse('2026-09-13T12:00:00Z');
  return {
    owner: operations(db, 'owner', clock),
    stranger: operations(db, 'stranger', clock),
  };
}

const entry = (changes = {}) => ({
  id: crypto.randomUUID(),
  kind: 'revenue',
  amount: 24000,
  source: 'coconala',
  occurredOn: '2026-09-13',
  ...changes,
});

await test('wallet stores income and expenses and returns the durable balance', async () => {
  const { owner } = fixture();
  await owner.book(entry());
  await owner.book(entry({ kind: 'expense', amount: 3500, source: 'api' }));

  const wallet = await owner.wallet();
  assert.equal(wallet.currency, 'JPY');
  assert.equal(wallet.revenue, 24000);
  assert.equal(wallet.expense, 3500);
  assert.equal(wallet.balance, 20500);
  assert.equal(wallet.records.length, 2);
  assert.equal(wallet.persistence, 'd1');
  assert.equal(wallet.transfers, 'not-connected');
});

await test('wallet entries are user-isolated, idempotent and reversible once', async () => {
  const { owner, stranger } = fixture();
  const original = entry();
  await owner.book(original);
  await owner.book(original);
  assert.equal((await stranger.wallet()).balance, 0);

  await assert.rejects(
    () => stranger.book({ id: crypto.randomUUID(), reversesId: original.id }),
    (error) => error instanceof OperationError && error.status === 404,
  );

  const reversal = { id: crypto.randomUUID(), reversesId: original.id };
  await owner.book(reversal);
  await owner.book(reversal);
  assert.equal((await owner.wallet()).balance, 0);
  await assert.rejects(
    () => owner.book({ id: crypto.randomUUID(), reversesId: original.id }),
    (error) => error instanceof OperationError && error.status === 409,
  );
});
