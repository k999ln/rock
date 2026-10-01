import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
void test('CSV payment upgrade adds only its payment table and preserves existing quotes',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const bootstrap=new URL('./fixtures/sky-service-test-schema.sql',import.meta.url);
  if(existsSync(bootstrap)) db.exec(readFileSync(bootstrap,'utf8'));
  const files=readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
  const migration=files.find(n=>n.endsWith('_csv_trial_payments.sql'));assert.ok(migration);
  for(const name of files.filter(n=>n!==migration)) db.exec(readFileSync(new URL(`../drizzle/${name}`,import.meta.url),'utf8'));
  db.prepare(`INSERT INTO csv_jobs (id,user_id,status,payment_status,input_name,input_key,input_bytes,input_sha256,input_encoding,specification_json,quote_minor,currency,expires_at,created_at,updated_at) VALUES ('old-job','alice','quoted','unpaid','old.csv','old-input',10,'hash','utf8','{}',300000,'JPY',9999999999999,1,1)`).run();
  const names=()=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name);
  const before=names();
  db.exec(readFileSync(new URL(`../drizzle/${migration}`,import.meta.url),'utf8'));
  assert.deepEqual(names().filter(n=>!before.includes(n)),['csv_trial_payments']);
  assert.equal(db.prepare("SELECT quote_minor FROM csv_jobs WHERE id='old-job'").get().quote_minor,300000);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_csv_trial_session'").get());
});
