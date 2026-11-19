import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=new URL('../drizzle/',import.meta.url);
const split=name=>readFileSync(new URL(name,root),'utf8').split('--> statement-breakpoint').filter(s=>s.trim());
async function fixture(t){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-08-18',d1Databases:['DB'],host:'127.0.0.1',port:0}));t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 for(const file of readdirSync(root).filter(f=>/^\d{4}_.*\.sql$/.test(f)&&f<'0082').sort())for(const sql of split(file))await db.prepare(sql).run();
 for(const kind of ['workspace','listing','review'])await db.prepare('INSERT INTO sky_linux_service_documents VALUES (?,?,?,?,?,?)').bind(kind,'alice',kind,7,JSON.stringify({legacy:kind,unchanged:true}),17).run();
 return {db,before:(await db.prepare('SELECT * FROM sky_linux_service_documents ORDER BY id').all()).results};
}
void test('D1 monthly document migration preserves all old document bytes and their runtime operations',async t=>{
 const {db,before}=await fixture(t);await db.batch(split('0082_sky_agent_monthly_statements.sql').map(sql=>db.prepare(sql)));
 const rows=(await db.prepare('SELECT * FROM sky_linux_service_documents ORDER BY id').all()).results;
 for(let i=0;i<before.length;i++){for(const [key,value]of Object.entries(before[i]))assert.equal(rows[i][key],value);assert.equal(rows[i].period,null);assert.equal(rows[i].currency,null);}
 await db.prepare("UPDATE sky_linux_service_documents SET revision=revision+1 WHERE id='workspace'").run();await db.prepare("DELETE FROM sky_linux_service_documents WHERE id='review'").run();
 await assert.rejects(db.prepare("INSERT INTO sky_linux_service_documents(id,owner_user_id,kind,payload,updated_at) VALUES ('fake','alice','agent_monthly_statement','{}',1)").run());
 assert.equal((await db.prepare("SELECT count(*) n FROM sky_linux_service_documents WHERE kind='agent_monthly_statement'").first()).n,0);
});
void test('D1 interruption after document drop rolls back bytes and the original kind constraint',async t=>{
 const {db,before}=await fixture(t),sql=split('0082_sky_agent_monthly_statements.sql'),rename=sql.findIndex(s=>s.includes('RENAME TO sky_linux_service_documents'));assert.ok(rename>0);
 await assert.rejects(db.batch([...sql.slice(0,rename).map(s=>db.prepare(s)),db.prepare("SELECT json('invalid synthetic JSON')")]));
 assert.deepEqual((await db.prepare('SELECT * FROM sky_linux_service_documents ORDER BY id').all()).results,before);
 assert.equal((await db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='__new_sky_linux_service_documents'").first()).n,0);
 await assert.rejects(db.prepare("INSERT INTO sky_linux_service_documents VALUES ('fake','alice','agent_monthly_statement',0,'{}',1)").run());
});
