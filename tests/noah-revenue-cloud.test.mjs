import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {RevenueOperation} from '../services/noah-revenue-runtime/src/operation.mjs';
import worker,{NoahRevenueOperation} from '../services/noah-revenue-runtime/src/worker.mjs';
function setup(t,fetcher){
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());const map=new Map();let alarm=null,now=Date.now(),queue=Promise.resolve();
  const storage={sql:{exec(query,...args){const q=sqlite.prepare(query);if(q.columns().length){const rows=q.all(...args);return{toArray:()=>rows,rowsWritten:0};}const r=q.run(...args);return{toArray:()=>[],rowsWritten:Number(r.changes)};}},async get(k){return structuredClone(map.get(k));},async put(k,v){map.set(k,structuredClone(v));},async getAlarm(){return alarm;},async setAlarm(v){alarm=v;},async deleteAlarm(){alarm=null;},transaction(fn){const p=queue.then(()=>fn(storage));queue=p.catch(()=>{});return p;}};
  const ctx={storage};let operation=new RevenueOperation(ctx,{fetcher,now:()=>now});
  return {storage,map,get op(){return operation;},restart(){operation=new RevenueOperation(ctx,{fetcher,now:()=>now});},tick:async()=>{now=Math.max(now,alarm||now);await operation.alarm();},get alarm(){return alarm;},async auth(){await operation.command('pair',{hash:'pair'});await operation.command('exchange',{hash:'pair',sessionHash:'session'});},call:(action,input={})=>operation.command(action,input,'session'),ctx};
}
const run=(id='a',generation=0)=>({id,brief:'架空店舗の確認済み素材だけで下書きを作る',consent:'anonymous-free-direct-v1',generation});
const models=()=>Response.json([{name:'openai-fast',tier:'anonymous',input_modalities:['text'],output_modalities:['text']}]);
const result=()=>Response.json({id:'fixture',model:'fixture',user_tier:'anonymous',choices:[{finish_reason:'stop',message:{content:'架空サンプル・確認待ち'}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});
void test('cloud persists between alarms, resumes after eviction, completed replay never generates again',async t=>{
  let sends=0;const s=setup(t,async url=>url.endsWith('/models')?models():(sends++,result()));await s.auth();await s.call('run',run());
  for(let n=0;n<3;n++){await s.tick();s.restart();}assert.equal(sends,3);assert.equal((await s.call('status')).operation.state,'completed');assert.equal(s.alarm,null);
  await s.call('run',run());await s.tick();assert.equal(sends,3);assert.equal((await s.call('status')).jobs.length,3);const saved=JSON.parse(s.storage.sql.exec('SELECT payload FROM work_jobs LIMIT 1').toArray()[0].payload);assert.equal(saved.noahRevenuePack.execution,'cloud-alarm');assert.equal(saved.events.at(-1).command.transport,'browser');
  await assert.rejects(s.call('run',{...run(),brief:'changed'}),/同じ依頼ID/);
});
void test('stop fences delayed start and in-flight completion never schedules next stage',async t=>{
  let complete,started;const began=new Promise(r=>{started=r;});let sends=0;const s=setup(t,async url=>{if(url.endsWith('/models'))return models();sends++;started();return new Promise(r=>{complete=r;});});await s.auth();await s.call('run',run());const tick=s.tick();await began;await s.call('stop');
  await assert.rejects(s.call('run',run('b',0)),/停止後/);await assert.rejects(s.call('run',run('b',1)),/応答待ち/);complete(result());await tick;assert.equal(s.alarm,null);await s.tick();assert.equal(sends,1);assert.equal((await s.call('status')).operation.state,'stopped');
  await s.call('run',run('b',1));assert.equal((await s.call('status')).active,true);
});
void test('free refusal schedules bounded retry, network uncertainty remains stopped on alarm replay',async t=>{
  let sends=0;const s=setup(t,async url=>{if(url.endsWith('/models'))return models();sends++;if(sends===1)return Response.json({error:{code:'FREE_LIMIT'}},{status:402,headers:{'Retry-After':'45'}});throw Error('network');});await s.auth();await s.call('run',run());await s.tick();assert.equal((await s.call('status')).jobs[0].state,'waiting');s.restart();await s.tick();assert.equal((await s.call('status')).operation.state,'needs-review');s.restart();await s.tick();assert.equal(sends,2);
});
void test('persisted sending work is never replayed after a crash and free batch cap rejects fifth start',async t=>{
  let sends=0;const s=setup(t,async url=>url.endsWith('/models')?models():(sends++,result()));await s.auth();await s.call('run',run());await s.tick();
  const row=s.storage.sql.exec('SELECT * FROM work_jobs').toArray()[0],j=JSON.parse(row.payload);j.freeCloud.state='sending';s.storage.sql.exec('UPDATE work_jobs SET payload=? WHERE id=?',JSON.stringify(j),j.id);const state=await s.storage.get('state');state.operation.stage=0;state.operation.previous='';await s.storage.put('state',state);s.restart();await s.tick();assert.equal(sends,1);assert.equal((await s.call('status')).operation.state,'needs-review');
  for(let i=0;i<3;i++){await s.call('stop');await s.call('run',run('new'+i,i+1));}await s.call('stop');await assert.rejects(s.call('run',run('fifth',4)),/12担当/);
});
void test('HTTPS boundary denies anonymous access, cross-origin mutation, reused pairing, unauthorized admin',async t=>{
  const s=setup(t),obj=new NoahRevenueOperation(s.ctx),env={NOAH_REVENUE_ADMIN:'admin',REVENUE:{idFromName:x=>x,get:()=>obj}};
  const call=(path,body,session,origin='https://owner.example',authorization)=>worker.fetch(new Request('https://owner.example'+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json',origin}:{}),...(session?{cookie:session}:{}),...(authorization?{authorization}:{})},body:body?JSON.stringify(body):undefined}),env);
  assert.equal((await call('/api/status')).status,401);assert.equal((await call('/admin/pair',{})).status,401);
  const link=await(await call('/admin/pair',{},null,undefined,'Bearer admin')).json(),code=new URLSearchParams(new URL(link.pairUrl).hash.slice(1)).get('pair');const paired=await call('/api/pair',{token:code});assert.equal(paired.status,200);const cookie=paired.headers.get('set-cookie');assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await call('/api/pair',{token:code})).status,401);assert.equal((await call('/api/stop',{},cookie,'https://evil.example')).status,403);assert.equal((await call('/api/status',undefined,cookie)).status,200);
  assert.equal((await call('/api/run',{...run(),extra:'no'},cookie)).status,400);assert.equal((await call('/api/logout',{},cookie)).status,200);assert.equal((await call('/api/status',undefined,cookie)).status,401);
});
void test('workerd SQLite alarm executes without a client and receipts survive runtime recreation',async t=>{
  const {Miniflare,convertV4MiniflareOptions}=await import('miniflare'),{build}=await import('esbuild');
  const root=await mkdtemp(join(tmpdir(),'noah-cloud-'));let sends=0,mf;
  const bundle=await build({entryPoints:['services/noah-revenue-runtime/src/worker.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
  const options={modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',durableObjects:{REVENUE:{className:'NoahRevenueOperation',useSQLite:true}},durableObjectsPersist:root,bindings:{NOAH_REVENUE_ADMIN:'fixture-admin'},outboundService:async req=>req.url.endsWith('/models')?models():(sends++,result())};
  t.after(async()=>{await mf?.dispose();await rm(root,{recursive:true,force:true});});mf=new Miniflare({...convertV4MiniflareOptions(options),resourcePersistencePath:root,isolatedResourcePersistencePath:root});
  const call=(path,body,cookie,admin)=>mf.dispatchFetch('https://owner.example'+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json',origin:'https://owner.example'}:{}),...(cookie?{cookie}:{}),...(admin?{authorization:'Bearer fixture-admin'}:{})},body:body?JSON.stringify(body):undefined});
  const link=await(await call('/admin/pair',{},null,true)).json(),code=new URLSearchParams(new URL(link.pairUrl).hash.slice(1)).get('pair');const pair=await call('/api/pair',{token:code}),cookie=pair.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/run',run('workerd'),cookie)).status,200);
  let status;for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,100));status=await(await call('/api/status',null,cookie)).json();if(status.jobs[0]?.state==='completed')break;}
  assert.equal(sends,1);assert.equal(status.jobs[0]?.state,'completed');assert.equal(status.operation.stage,1);
  assert.equal((await call('/api/stop',{},cookie)).status,200);await mf.dispose();mf=new Miniflare({...convertV4MiniflareOptions(options),resourcePersistencePath:root,isolatedResourcePersistencePath:root});
  status=await(await call('/api/status',null,cookie)).json();assert.equal(status.stopped,true);assert.equal(status.jobs[0].providerResponseId,'fixture');assert.equal(sends,1);
});
