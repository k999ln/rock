import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { workStore } from '../lib/work-store.ts';
import { coconalaTeamStore } from '../lib/coconala-team-store.ts';
import { ownerRevisionJsonStore } from '../lib/owner-revision-json-store.ts';

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => name.endsWith('.sql') && !name.startsWith('._')).sort()) {
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  }
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...args) { return {
        async first() { return statement.get(...args) ?? null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; },
      }; } };
    },
  };
}

for (const [name, factory] of Object.entries({ work: workStore, coconala: coconalaTeamStore })) {
  void test(`${name}: conflicting creates never transfer ownership or overwrite payload, and stale writes fail`, async (t) => {
    const store = factory(database(t));
    const original = { id: 'shared-id', revision: 0, updatedAt: '2026-10-01', note: 'original' };
    assert.deepEqual(await store.create('alice', original), original);
    assert.deepEqual(await store.create('alice', { ...original, note: 'replacement' }), original);
    assert.equal(await store.create('bob', original), null);
    const next = { ...original, revision: 1, note: 'winner' };
    assert.equal(await store.update('bob', next, 0), false);
    assert.equal(await store.update('alice', next, 0), true);
    assert.equal(await store.update('alice', { ...next, note: 'stale' }, 0), false);
    assert.deepEqual(await store.get('alice', original.id), next);
    assert.deepEqual(await store.list('bob'), []);
  });
  void test(`${name}: newest 100 are owner scoped with deterministic id ordering`, async (t) => {
    const store = factory(database(t));
    for (let i = 0; i < 102; i++) {
      await store.create('alice', { id: String(i).padStart(3, '0'), revision: 0, updatedAt: '2026-10-01' });
    }
    await store.create('bob', { id: 'zzz', revision: 0, updatedAt: '2099-01-01' });
    let rows = await store.list('alice');
    assert.equal(rows.length, 100);
    assert.equal(rows[0].id, '101');
    assert.equal(rows.at(-1).id, '002');
    await store.update('alice', { id: '000', revision: 1, updatedAt: '2026-10-02' }, 0);
    rows = await store.list('alice');
    assert.equal(rows[0].id, '000');
    assert.equal(rows.length, 100);
  });
}

void test('table names cannot select an unrelated store or inject SQL', () => {
  const db = { prepare() { assert.fail('invalid identifiers must fail before preparing SQL'); } };
  for (const table of ['users', 'work_jobs; DROP TABLE users', 'mercari_revenue_cases']) {
    assert.throws(() => ownerRevisionJsonStore(db, table), /Unsupported/);
  }
});
