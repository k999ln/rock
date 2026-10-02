import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { migrationSourceDirectory, webSchemaStatus } from '../scripts/check-web-schema.mjs';

const schema = JSON.parse(readFileSync(new URL('../sky-schema-bootstrap.json', import.meta.url), 'utf8'));
function bootstrap(db) { for (const sql of schema) db.exec(sql); }
function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  return db;
}

void test('hosting bootstrap contains every canonical table, column and guard', (t) => {
  const source = fixture(t), hosted = fixture(t);
  const folder = new URL(`../${migrationSourceDirectory}/`, import.meta.url);
  for (const name of readdirSync(folder).filter(name => name.endsWith('.sql')).sort())
    source.exec(readFileSync(new URL(name, folder), 'utf8'));
  bootstrap(hosted);
  for (const table of webSchemaStatus.tables) {
    assert.deepEqual(hosted.prepare(`PRAGMA table_info("${table}")`).all(), source.prepare(`PRAGMA table_info("${table}")`).all(), table);
    assert.deepEqual(hosted.prepare(`PRAGMA foreign_key_list("${table}")`).all(), source.prepare(`PRAGMA foreign_key_list("${table}")`).all(), table);
  }
  for (const { name, sql } of source.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all()) {
    const actual = hosted.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name);
    assert.ok(actual, name);
    const normalize = value => value.replace(/IF NOT EXISTS\s+/gi, '').replace(/\s+/g, ' ').trim().replace(/;$/, '');
    assert.equal(normalize(actual.sql), normalize(sql), name);
  }
});

void test('reapplying hosting schema preserves recorded trial sessions and their unique constraint', (t) => {
  const db = fixture(t); bootstrap(db);
  db.prepare("INSERT INTO csv_trial_payments VALUES ('synthetic-old','synthetic-job','test','synthetic-session',1)").run();
  bootstrap(db);
  assert.deepEqual(db.prepare('SELECT * FROM csv_trial_payments').all().map(row => ({ ...row })), [{ id:'synthetic-old', job_id:'synthetic-job', mode:'test', session_id:'synthetic-session', created_at:1 }]);
  assert.throws(() => db.prepare("INSERT INTO csv_trial_payments VALUES ('synthetic-replay','synthetic-job','test','synthetic-session',2)").run(), /UNIQUE constraint failed/);
});
