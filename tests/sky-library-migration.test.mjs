import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

void test('library migration preserves canonical CSV/payment data and scopes bookmarks per owner', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const directory = new URL('../drizzle/', import.meta.url);
  const files = readdirSync(directory).filter(name => name.endsWith('.sql') && !name.startsWith('._')).sort();
  const migration = '0059_sky_library.sql';
  assert.ok(files.includes(migration));
  for (const name of files.filter(name => name < migration)) db.exec(readFileSync(new URL(name, directory), 'utf8'));
  db.prepare("INSERT INTO csv_jobs (id,user_id,status,payment_status,input_name,input_key,input_bytes,input_sha256,input_encoding,specification_json,quote_minor,currency,expires_at,created_at,updated_at) VALUES ('old-job','alice','quoted','unpaid','old.csv','old-input',10,'hash','utf8','{}',300000,'JPY',9999999999999,1,1)").run();
  db.prepare("INSERT INTO csv_trial_payments VALUES ('payment','old-job','test','synthetic-session',1)").run();
  const tables = () => db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.name);
  const before = tables();
  db.exec(readFileSync(new URL(migration, directory), 'utf8'));
  assert.deepEqual(tables().filter(name => !before.includes(name)), ['sky_library_items']);
  assert.equal(db.prepare("SELECT input_key FROM csv_jobs WHERE id='old-job'").get().input_key, 'old-input');
  assert.equal(db.prepare("SELECT session_id FROM csv_trial_payments WHERE id='payment'").get().session_id, 'synthetic-session');
  const save = db.prepare('INSERT INTO sky_library_items(user_id,tool,saved_at) VALUES(?,?,?)');
  save.run('alice', 'mr-citations', 1);
  save.run('bob', 'mr-citations', 2);
  assert.throws(() => save.run('alice', 'mr-citations', 3), /UNIQUE/);
  db.prepare('DELETE FROM sky_library_items WHERE user_id=? AND tool=?').run('alice', 'mr-citations');
  assert.deepEqual(db.prepare('SELECT user_id FROM sky_library_items').all().map(row => row.user_id), ['bob']);
});
