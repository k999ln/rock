import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createNoahOutboxService } from '../lib/noah-outbox.ts';
import { createNoahOutboxApi } from '../lib/noah-outbox-api.ts';
import { noahAgentTemplate } from '../lib/noah-agent-upload.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { applyWorkCommand } from '../lib/workflow.ts';

function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const file of ['0033_noah_agent_uploads.sql','0034_noah_upload_refactor.sql','0037_noah_agent_invites.sql','0039_noah_invite_execution.sql'])sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  sql.exec('CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL)');
  const hooks={},db={prepare(query){return {bind(...args){return {async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){await hooks.beforeRun?.(query,args);return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}};}};
  const agentId=randomUUID(),manifest={...noahAgentTemplate,adapter:'source',endpointUrl:null,name:'Private fixture',sourceUrl:'https://example.test/private-source'};
  sql.prepare("INSERT INTO noah_agent_uploads(id,owner_id,manifest,manifest_sha256,upload_state,created_at) VALUES(?,?,?,?,'ready',?)").run(agentId,'alice',JSON.stringify(manifest),'a'.repeat(64),Date.now());
  const time={now:Date.now()},targets=[{id:'inbox',label:'Private inbox',endpoint:'https://inbox.example.test',revision:'1',pricing:'free',test:false,token:'only-server-credential'}],calls=[],receipts=new Map();
  const fetcher=async(url,init)=>{calls.push({url,method:init.method,body:init.body});if(hooks.fetch)return hooks.fetch(url,init);const id=url.split('/').at(-1);if(init.method==='POST'){const v=JSON.parse(init.body);receipts.set(id,{schema:'noah-delivery-receipt/1',id,payloadSha256:v.payloadSha256,status:'accepted',receiptId:'receipt:'+id,receivedAt:time.now});}return receipts.has(id)?Response.json(receipts.get(id)):Response.json({error:'not_found'},{status:404});};
  const service=createNoahOutboxService({db,targets:owner=>owner==='alice'?targets:[],fetcher,now:()=>time.now});
  const input=(overrides={})=>({id:randomUUID(),agentId,targetId:'inbox',recipient:'recipient-a',fields:['summary'],body:'Synthetic private message',...overrides});
  const command=(job,action,overrides={})=>({action,revision:job.revision,commandId:randomUUID(),snapshotSha256:job.noahOutbox.snapshotSha256,...(action==='approve'?{confirmation:'noah-external-send/1'}:{}),...overrides});
  const approve=async(job)=> (await service.command('alice',job.id,command(job,'approve'))).job;
  const claim=async(job)=>service.command('alice',job.id,command(job,'send'));
  function invite({recipient=null,expiresAt=time.now+3600000}={}){const id=randomUUID();sql.prepare("INSERT INTO noah_agent_invites(id,owner_id,upload_id,manifest_sha256,token_sha256,input_sha256,recipient_id,access_scope,expires_at,max_uses,created_at) VALUES(?,'alice',?,?,?, ?,?,'view',?,1,?)").run(id,agentId,'a'.repeat(64),randomUUID().replaceAll('-','').repeat(2),'c'.repeat(64),recipient,expiresAt,time.now);return id;}
  return {sql,db,hooks,service,time,targets,calls,receipts,agentId,input,command,approve,claim,invite,fetcher};
}
void test('private draft is immutable, owner isolated, allowlisted and never authorizes transport',async t=>{
 const f=fixture(t),input=f.input(),j=await f.service.create('alice',input);assert.equal(j.noahOutbox.state,'draft');assert.equal(f.calls.length,0);
 assert.deepEqual(Object.keys(j.noahOutbox.payload.agent),['name','version','summary']);assert.equal(JSON.stringify(j).includes('only-server-credential'),false);assert.equal(JSON.stringify(j.noahOutbox.payload).includes('private-source'),false);
 assert.equal((await f.service.create('alice',input)).id,j.id);await assert.rejects(f.service.create('alice',{...input,body:'changed'}),e=>e.status===409);
 await assert.rejects(f.service.get('bob',j.id),e=>e.status===404);await assert.rejects(f.service.create('bob',f.input()),e=>e.status===404);
 await assert.rejects(f.claim(j),e=>e.status===409);assert.equal(f.calls.length,0);assert.throws(()=>applyWorkCommand(j,{id:randomUUID(),action:'cancel'},j.revision),/専用実行画面/);
});
void test('approval binds preview and expiry; one concurrent claim produces one send and replay does not resend',async t=>{
 const f=fixture(t),j=await f.service.create('alice',f.input());await assert.rejects(f.service.command('alice',j.id,f.command(j,'approve',{snapshotSha256:'b'.repeat(64)})));
 await assert.rejects(f.service.command('alice',j.id,f.command(j,'approve',{confirmation:undefined})));
 const approval=f.command(j,'approve'),approved=(await f.service.command('alice',j.id,approval)).job;assert.equal((await f.service.command('alice',j.id,approval)).job.revision,approved.revision);
 const cmd=f.command(approved,'send'),commands=[cmd,{...cmd,commandId:randomUUID()}],results=await Promise.allSettled(commands.map(command=>f.service.command('alice',j.id,command)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 // Digest calculation is asynchronous; either competing request may win the CAS.
 const winner=results.findIndex(r=>r.status==='fulfilled'),claimed=results[winner].value;await f.service.dispatch('alice',j.id,claimed.dispatch);const done=await f.service.get('alice',j.id);assert.equal(done.noahOutbox.state,'accepted');assert.equal(f.calls.length,1);
 assert.equal((await f.service.command('alice',j.id,commands[winner])).dispatch,null);
 await assert.rejects(f.service.command('alice',j.id,commands[1-winner]),e=>e.status===409);assert.equal(f.calls.length,1);
});
void test('expired approval and changed target fail before transport, while credential rotation alone remains allowed',async t=>{
 const f=fixture(t);let j=await f.approve(await f.service.create('alice',f.input()));f.time.now+=600001;await assert.rejects(f.claim(j));assert.equal(f.calls.length,0);
 j=await f.approve(j);f.targets[0].endpoint='https://changed.example.test';await assert.rejects(f.claim(j));f.targets[0].endpoint='https://inbox.example.test';f.targets[0].token='rotated-secret-credential';const c=await f.claim(j);await f.service.dispatch('alice',j.id,c.dispatch);assert.equal(f.calls.length,1);
});
void test('invite recipient, expiry, revocation and revision are checked for create, approve and dispatch',async t=>{
 const f=fixture(t),inviteId=f.invite({recipient:'recipient-a'});
 await assert.rejects(f.service.create('alice',f.input({inviteId,recipient:'recipient-b'})),e=>e.status===403);
 const j=await f.service.create('alice',f.input({inviteId}));f.sql.prepare('UPDATE noah_agent_invites SET revision=2 WHERE id=?').run(inviteId);await assert.rejects(f.approve(j),e=>e.status===403);
 f.sql.prepare('UPDATE noah_agent_invites SET revision=1 WHERE id=?').run(inviteId);const approved=await f.approve(j),c=await f.claim(approved);
 f.sql.prepare('UPDATE noah_agent_invites SET revoked_at=? WHERE id=?').run(f.time.now,inviteId);await f.service.dispatch('alice',j.id,c.dispatch);assert.equal(f.calls.length,0);assert.equal((await f.service.get('alice',j.id)).noahOutbox.attempts[0].outcome,'not_sent');
 await assert.rejects(f.service.create('alice',f.input({inviteId:f.invite({expiresAt:f.time.now-1})})),e=>e.status===403);
});
void test('source deletion at the atomic send claim and approval expiry before dispatch prevent any send',async t=>{
 const f=fixture(t),j=await f.approve(await f.service.create('alice',f.input()));f.hooks.beforeRun=(query)=>{if(query.startsWith('UPDATE work_jobs'))f.sql.prepare('UPDATE noah_agent_uploads SET deleted_at=1 WHERE id=?').run(f.agentId);};
 await assert.rejects(f.claim(j),e=>e.status===409);assert.equal(f.calls.length,0);delete f.hooks.beforeRun;
 f.sql.prepare('UPDATE noah_agent_uploads SET deleted_at=NULL WHERE id=?').run(f.agentId);const c=await f.claim(j);f.time.now+=600001;await f.service.dispatch('alice',j.id,c.dispatch);assert.equal(f.calls.length,0);
});
void test('lost acknowledgement is unknown; exact receipt readback survives revoked source without sending its body again',async t=>{
 const f=fixture(t),j=await f.approve(await f.service.create('alice',f.input())),c=await f.claim(j);
 f.hooks.fetch=async(_url,init)=>{const v=JSON.parse(init.body);f.receipts.set(v.id,{schema:'noah-delivery-receipt/1',id:v.id,payloadSha256:v.payloadSha256,status:'accepted',receiptId:'receipt:'+v.id,receivedAt:f.time.now});throw Error('lost response');};
 await f.service.dispatch('alice',j.id,c.dispatch);const unknown=await f.service.get('alice',j.id);assert.equal(unknown.noahOutbox.state,'unknown');await assert.rejects(f.claim(unknown));await assert.rejects(f.approve(unknown));
 delete f.hooks.fetch;f.sql.prepare('UPDATE noah_agent_uploads SET deleted_at=1 WHERE id=?').run(f.agentId);
 const recovered=(await f.service.command('alice',j.id,f.command(unknown,'reconcile'))).job;assert.equal(recovered.noahOutbox.state,'accepted');assert.deepEqual(f.calls.map(v=>v.method),['POST','GET']);assert.equal(f.calls[1].body,undefined);
});
void test('not-found and mismatched receipts never prove non-delivery or permit another POST',async t=>{
 const f=fixture(t),j=await f.approve(await f.service.create('alice',f.input())),c=await f.claim(j);f.time.now+=31000;
 let old=await f.service.get('alice',j.id);const absent=(await f.service.command('alice',j.id,f.command(old,'reconcile'))).job;assert.equal(absent.noahOutbox.state,'unknown');await assert.rejects(f.claim(absent));
 // A process restart has only a durable claim, never permission to run POST again.
 await f.service.dispatch('alice',j.id,c.dispatch);assert.equal(f.calls.length,1);
 f.receipts.set(c.dispatch,{schema:'noah-delivery-receipt/1',id:c.dispatch,payloadSha256:'wrong',status:'accepted',receiptId:'wrong',receivedAt:f.time.now});old=await f.service.get('alice',j.id);
 assert.equal((await f.service.command('alice',j.id,f.command(old,'reconcile'))).job.noahOutbox.state,'unknown');
 f.receipts.set(c.dispatch,{schema:'noah-delivery-receipt/1',id:c.dispatch,payloadSha256:old.noahOutbox.attempts[0].payloadSha256,status:'accepted',receiptId:'correct',receivedAt:f.time.now});
 assert.equal((await f.service.command('alice',j.id,f.command(await f.service.get('alice',j.id),'reconcile'))).job.noahOutbox.state,'accepted');assert.ok(f.calls.every(c=>c.method==='GET'));
});
void test('known rejection requires new approval and attempt ID, and sending cannot be cancelled as though undone',async t=>{
 const f=fixture(t),j=await f.approve(await f.service.create('alice',f.input())),c=await f.claim(j);await assert.rejects(f.service.command('alice',j.id,f.command(c.job,'cancel')));
 f.hooks.fetch=async(_url,init)=>{const v=JSON.parse(init.body);return Response.json({schema:'noah-delivery-receipt/1',id:v.id,payloadSha256:v.payloadSha256,status:'rejected',receiptId:'reject:'+v.id,receivedAt:f.time.now});};
 await f.service.dispatch('alice',j.id,c.dispatch);const rejected=await f.service.get('alice',j.id);assert.equal(rejected.noahOutbox.state,'rejected');await assert.rejects(f.claim(rejected));
 const retry=await f.claim(await f.approve(rejected));assert.notEqual(retry.dispatch,c.dispatch);assert.equal(retry.job.noahOutbox.attempts.length,2);
});
void test('cancel and approved replay stay cancelled, and history pagination remains owner scoped',async t=>{
 const f=fixture(t),j=await f.service.create('alice',f.input()),cmd=f.command(j,'approve'),a=(await f.service.command('alice',j.id,cmd)).job;
 await f.service.command('alice',j.id,f.command(a,'cancel'));assert.equal((await f.service.command('alice',j.id,cmd)).job.noahOutbox.state,'cancelled');assert.equal(f.calls.length,0);
 for(let n=0;n<22;n++){f.time.now++;await f.service.create('alice',f.input());}
 const first=await f.service.list('alice'),second=await f.service.list('alice',null,first.next);assert.equal(first.jobs.length,20);assert.equal(second.jobs.length,3);assert.equal(new Set([...first.jobs,...second.jobs].map(j=>j.id)).size,23);assert.equal((await f.service.list('bob')).jobs.length,0);
});
void test('API authenticates before storage, uses same-origin scope and defers only a claimed send',async t=>{
 const f=fixture(t),deferred=[],bindings={NOAH_DELIVERY_TARGETS:JSON.stringify([{id:'inbox',label:'Private inbox',endpoint:'https://inbox.example.test',revision:'1',pricing:'free',credentialEnv:'NOAH_INBOX_KEY',owners:['alice']}]),NOAH_INBOX_KEY:'only-server-credential'};
 const api=createNoahOutboxApi({db:f.db,bindings,authenticate:async r=>{const user=r.headers.get('test-owner');if(!user)throw Error('UNAUTHORIZED');return user;},defer:p=>deferred.push(p),fetcher:f.fetcher,now:()=>f.time.now});
 const request=async(data,owner='alice',headers={})=>new Request('https://noah.test/api/noah/outbox',{method:data?'POST':'GET',headers:{'test-owner':owner,origin:'https://noah.test','Content-Type':'application/json','X-Rock-Owner-Scope':await ownerScopeFor(owner),...headers},...(data?{body:JSON.stringify(data)}:{})});
 assert.equal((await api(await request(f.input(),''))).status,401);assert.equal((await api(await request(f.input(),'alice',{origin:'https://evil.test'}))).status,403);assert.equal((await api(await request(f.input(),'alice',{'X-Rock-Owner-Scope':await ownerScopeFor('bob')}))).status,409);
 const input=f.input(),j=(await(await api(await request(input))).json()).job;assert.equal(deferred.length,0);const approved=(await(await api(await request(f.command(j,'approve')),j.id)).json()).job;assert.equal(deferred.length,0);
 const r=await api(await request(f.command(approved,'send')),j.id);assert.equal(r.status,202);assert.equal(deferred.length,1);await Promise.all(deferred);assert.equal((await f.service.get('alice',j.id)).noahOutbox.state,'accepted');
 const listing=await(await api(await request())).json();assert.equal(JSON.stringify(listing).includes('only-server-credential'),false);assert.equal((await api(await request(undefined,'bob'),j.id)).status,404);
});

void test('delayed negative receipt readback cannot overwrite a concurrently accepted send',async t=>{
 const f=fixture(t),j=await f.approve(await f.service.create('alice',f.input())),c=await f.claim(j);
 let release,started;const arrived=new Promise(r=>{started=r;});
 f.hooks.fetch=async(_url,init)=>{if(init.method==='GET'){started();return new Promise(r=>{release=r;});}const v=JSON.parse(init.body);return Response.json({schema:'noah-delivery-receipt/1',id:v.id,payloadSha256:v.payloadSha256,status:'accepted',receiptId:'accepted',receivedAt:f.time.now});};
 const readback=f.service.command('alice',j.id,f.command(c.job,'reconcile'));await arrived;
 await f.service.dispatch('alice',j.id,c.dispatch);f.time.now+=31000;release(Response.json({error:'not_found'},{status:404}));
 assert.equal((await readback).job.noahOutbox.state,'accepted');assert.equal((await f.service.get('alice',j.id)).noahOutbox.state,'accepted');assert.deepEqual(f.calls.map(c=>c.method),['GET','POST']);
});
void test('exhausted command limit still permits cancellation and never grants transport',async t=>{
 const f=fixture(t);let j=await f.service.create('alice',f.input());for(let i=0;i<32;i++)j=await f.approve(j);
 await assert.rejects(f.claim(j),e=>e.status===429);j=(await f.service.command('alice',j.id,f.command(j,'cancel'))).job;assert.equal(j.noahOutbox.state,'cancelled');assert.equal(f.calls.length,0);
});
