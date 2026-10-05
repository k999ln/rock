import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  limitCsvRequest,
  CsvRequestLimitError,
} from '../lib/csv-request-limit.ts';
function database(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(
    'CREATE TABLE sky_remote_ai_rate_limits(user_id TEXT, route TEXT, window_started_at INTEGER, request_count INTEGER, PRIMARY KEY(user_id,route))',
  );
  return {
    prepare(query) {
      return {
        bind(...values) {
          return {
            async first() {
              return sql.prepare(query).get(...values);
            },
          };
        },
      };
    },
  };
}
void test('CSV limits persist per owner and action, and reset at the next minute', async (t) => {
  const db = database(t);
  for (let i = 0; i < 10; i++)
    await limitCsvRequest(db, 'alice', 'quote', 60001);
  await assert.rejects(
    limitCsvRequest(db, 'alice', 'quote', 60001),
    (e) => e instanceof CsvRequestLimitError && e.retryAfter === 60,
  );
  await limitCsvRequest(db, 'bob', 'quote', 60001);
  await limitCsvRequest(db, 'alice', 'payment', 60001);
  await limitCsvRequest(db, 'alice', 'quote', 120000);
});
void test('parallel payment requests admit exactly 20 increments', async (t) => {
  const db = database(t);
  const outcomes = await Promise.allSettled(
    Array.from({ length: 25 }, () =>
      limitCsvRequest(db, 'alice', 'payment', 119999),
    ),
  );
  assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 20);
  for (const outcome of outcomes.filter((x) => x.status === 'rejected'))
    assert.equal(outcome.reason.retryAfter, 1);
});
void test('missing counter result fails closed', async () => {
  const db = {
    prepare() {
      return {
        bind() {
          return { first: async () => null };
        },
      };
    },
  };
  await assert.rejects(
    limitCsvRequest(db, 'alice', 'quote', 1),
    CsvRequestLimitError,
  );
});
