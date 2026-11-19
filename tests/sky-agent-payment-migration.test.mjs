import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const statements=name=>readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8').split('--> statement-breakpoint').filter(s=>s.trim());
async function legacy(t) {
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-08-18',d1Databases:['DB'],host:'127.0.0.1',port:0}));t.after(()=>worker.dispose());const db=await worker.getD1Database('DB');
 // Minimal referenced source fixture; payment table/guards and new migration are exact repository SQL.
 await db.prepare('CREATE TABLE remote_ai_text_executions(id text PRIMARY KEY,owner_user_id text,state text,settled_minor integer,currency text,approved_cap_minor integer,provider_response_id text)').run();
 await db.prepare('CREATE TABLE agent_delegations(id text PRIMARY KEY)').run();
 await db.prepare("INSERT INTO remote_ai_text_executions VALUES ('source','owner','completed',120,'USD',1000,'response')").run();
 for(const sql of statements('0060_sky_usage_payments.sql'))await db.prepare(sql).run();
 await db.prepare("INSERT INTO sky_usage_payments(id,owner_user_id,source_id,source_digest,amount_minor,currency,mode,created_at,updated_at) VALUES ('payment','owner','source',?,120,'usd','test',1,2)").bind('a'.repeat(64)).run();
 await db.prepare("UPDATE sky_usage_payments SET state='partially_refunded',session_id='cs_fixture',payment_intent_id='pi_fixture',refunded_minor=10").run();
 return {db,before:await db.prepare('SELECT * FROM sky_usage_payments').first()};
}
void test('D1 atomic migration batch retains the old payment and both source foreign keys',async t=>{
 const {db,before}=await legacy(t);await db.batch(statements('0081_sky_agent_invoice_preparation.sql').map(sql=>db.prepare(sql)));
 const after=await db.prepare('SELECT * FROM sky_usage_payments').first();for(const [key,value] of Object.entries(before))assert.equal(after[key],value);
 assert.equal(after.source_kind,'cloud_llm');assert.equal(after.agent_source_id,null);assert.equal(after.confirmation_id,null);
 assert.deepEqual(new Set((await db.prepare('PRAGMA foreign_key_list(sky_usage_payments)').all()).results.map(x=>x.table)),new Set(['remote_ai_text_executions','agent_delegations']));
 await assert.rejects(db.prepare('UPDATE sky_usage_payments SET amount_minor=121').run());await assert.rejects(db.prepare('DELETE FROM sky_usage_payments').run());
});
void test('D1 batch failure after rebuild steps leaves the original payment/table/guards intact',async t=>{
 const {db,before}=await legacy(t),sql=statements('0081_sky_agent_invoice_preparation.sql'),rename=sql.findIndex(s=>s.includes('RENAME TO sky_usage_payments'));
 assert.ok(rename>0);await assert.rejects(db.batch([...sql.slice(0,rename).map(s=>db.prepare(s)),db.prepare("SELECT json('synthetic invalid json')")]));
 assert.deepEqual(await db.prepare('SELECT * FROM sky_usage_payments').first(),before);
 assert.equal((await db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='__new_sky_usage_payments'").first()).n,0);
 await assert.rejects(db.prepare('DELETE FROM sky_usage_payments').run());
});
