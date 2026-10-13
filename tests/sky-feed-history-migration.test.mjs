import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

void test('Sky Phoenix migration adds owner-scoped consent and event history without changing prior data', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const directory = new URL('../drizzle/', import.meta.url);
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
    .sort();
  const migration = '0063_talented_ulik.sql';
  assert.ok(files.includes(migration));
  for (const name of files.filter((name) => name < migration))
    db.exec(readFileSync(new URL(name, directory), 'utf8'));
  db.prepare(
    'INSERT INTO sky_library_items(user_id,tool,saved_at) VALUES(?,?,?)',
  ).run('alice', 'mr-citations', 1);
  db.exec(readFileSync(new URL(migration, directory), 'utf8'));
  assert.equal(
    db
      .prepare('SELECT tool FROM sky_library_items WHERE user_id=?')
      .get('alice').tool,
    'mr-citations',
  );
  const consent = db.prepare(
    'INSERT INTO sky_feed_personalization_settings VALUES(?,?,?,?,?)',
  );
  consent.run('alice', 1, '2026-10-13', 'sky-phoenix-v1', 1);
  consent.run('bob', 1, '2026-10-13', 'sky-phoenix-v1', 1);
  const insert = db.prepare(
    'INSERT INTO sky_feed_history_events VALUES(?,?,?,?,?,?,?,?,?)',
  );
  const values = [
    'event',
    'alice',
    'session',
    'mr-citations',
    'detail',
    1,
    null,
    0,
    1,
  ];
  insert.run(...values);
  insert.run('event', 'bob', ...values.slice(2));
  assert.throws(() => insert.run(...values), /UNIQUE/);
  db.prepare('DELETE FROM sky_feed_history_events WHERE user_id=?').run(
    'alice',
  );
  assert.deepEqual(
    db
      .prepare('SELECT user_id FROM sky_feed_history_events')
      .all()
      .map((row) => row.user_id),
    ['bob'],
  );
});
