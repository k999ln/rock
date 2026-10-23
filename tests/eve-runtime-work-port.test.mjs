import {createRuntimeEveHistoryControl} from '../lib/eve-runtime-history-control.ts';
import {createRuntimeEveArchiveReader} from '../lib/eve-runtime-archive.ts';
import {linkedDigest} from '../lib/rockstar-linked-execution.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runtimeFixture} from './helpers/eve-runtime-fixture.mjs';
import {loadRouteFixture} from './helpers/load-route-fixture.mjs';
import {requestUser} from '../lib/request-auth.ts';
import {createRuntimeEveWorkPort,runtimeEvePendingKey,runtimeEveRestorableWork} from '../lib/eve-runtime-work-port.ts';
import {describeAdapter} from '../lib/rockstar-adapters.ts';
import {createEveInteractionSession} from '../lib/rockstar-eve-interaction.ts';
async function setup(t){
 const f=runtimeFixture(t),presence=await f.announce({executor:describeAdapter('test-executor','executor','macos',{'text.generate':true,'model.pin':true,'execution.stop':true})}),url=new URL('../app/api/eve/runtime/route.ts',import.meta.url),refs=new Map([['cloudflare:workers',{env:{EVE_HISTORY_KEYRING:JSON.stringify(f.keys)}}],['@/lib/fund-store',{database:()=>f.db,requestUser}]]);
 for(const match of readFileSync(url,'utf8').matchAll(/from ['"](@\/lib\/[^'"]+)['"]/g))if(!refs.has(match[1]))refs.set(match[1],await import(new URL('../lib/'+match[1].slice(6)+'.ts',import.meta.url)));
 const route=loadRouteFixture(url,refs),calls=[];let owner='alice',continuing=true;
 async function api(path,init={}){calls.push({path,init});const headers=new Headers(init.headers);headers.set('origin','http://localhost');headers.set('oai-authenticated-user-id',owner);const method=init.method??'GET',response=await route[method](new Request('http://localhost'+path,{...init,method,headers})),value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error),{status:response.status});return value;}
 const binding={owner:'alice',threadId:crypto.randomUUID(),deviceId:f.device,agentId:presence.agents[0].id,agentSha256:presence.agents[0].sha256,modelSha256:presence.models[0].sha256,modelScheme:presence.models[0].scheme};
 const port=createRuntimeEveWorkPort({...binding,api,continuing:()=>continuing}),reference={id:crypto.randomUUID(),agentId:binding.agentId,agentSha256:binding.agentSha256,modelSha256:binding.modelSha256,input:'[合成試験] 任意の目的で下書きする'};
 return {...f,binding,reference,port,calls,api,setOwner:value=>{owner=value;},retire:()=>{continuing=false;}};
}
void test('same common core uses actual runtime route, owner queue and same ID for typed wake/request/stop/standby',async t=>{const f=await setup(t),storage=new Map(),session=createEveInteractionSession({work:f.port,pendingKey:runtimeEvePendingKey(f.binding),storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},changed:()=>{}});session.arm();session.hearFinal('Hey Eve');session.hearFinal(f.reference.input);await session.confirm();assert.equal(session.state.phase,'running');const id=session.state.jobId;assert.equal((await f.store().inspectOwnerRequest(id)).pending.agentId,f.binding.agentId);await session.stop();assert.equal(session.state.phase,'standby');assert.equal((await f.store().inspectOwnerRequest(id)).pending.state,'cancelled-before-start');assert.equal(storage.size,0);assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);});
void test('exact read finds old pending ID outside the bounded owner list and verifies every binding',async t=>{const f=await setup(t);await f.port.start(f.reference);f.sql.prepare('UPDATE eve_device_commands SET created_at=0 WHERE id=?').run(f.reference.id);for(let i=0;i<51;i++)await f.enqueue({threadId:crypto.randomUUID()});assert.equal((await f.store().pendingOwner()).some(p=>p.id===f.reference.id),false);assert.ok((await f.store().pendingOwner(f.binding.threadId)).some(p=>p.id===f.reference.id));assert.deepEqual(await f.port.read(f.reference),{status:'running',text:null});assert.ok(f.calls.at(-1).path.includes('requestId='+f.reference.id));await assert.rejects(f.port.read({...f.reference,agentSha256:'ef'.repeat(32)}));});
void test('owner change missed by client is rejected by actual route before queue creation',async t=>{const f=await setup(t);await f.port.prepare(f.reference.input,()=>true);f.setOwner('bob');await assert.rejects(f.port.start(f.reference),e=>e.status===409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM eve_device_commands').get().n,0);});
void test('late prepare after context retirement cannot return an executable reference',async t=>{const f=await setup(t);f.retire();await assert.rejects(f.port.prepare(f.reference.input,()=>true));assert.equal(f.calls.length,0);const prepared=await (createRuntimeEveWorkPort({...f.binding,api:f.api,continuing:()=>true})).prepare(f.reference.input,()=>false);assert.equal(prepared,null);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM eve_device_commands').get().n,0);});
void test('stored review is read through the same job and does not become Tool success; foreign owner cannot read it',async t=>{const f=await setup(t);await f.port.start(f.reference);const entry=(await f.store().commands(f.device)).find(e=>e.command.request.id===f.reference.id),report=await f.report(entry);await f.store().publish(f.device,{report,revision:0});const read=await f.port.read(f.reference);assert.deepEqual(read,{status:'review',text:report.text});const exact=await f.store().inspectOwnerRequest(f.reference.id);assert.equal(exact.execution.externalToolSuccess,false);await assert.rejects(f.store('bob').inspectOwnerRequest(f.reference.id),e=>e.status===404);});
void test('missing job read stays unknown; explicit stop persists a fence and scoped keys differ',async t=>{const f=await setup(t);assert.equal(await f.port.read(f.reference),null);assert.deepEqual(await f.port.stop(f.reference),{status:'stopped',text:null});assert.equal(f.calls.some(c=>c.init.method==='PUT'),true);assert.deepEqual(await f.port.start(f.reference),{status:'stopped',text:null});assert.equal((await f.store().commands(f.device)).length,0);assert.notEqual(runtimeEvePendingKey(f.binding),runtimeEvePendingKey({...f.binding,owner:'bob'}));assert.notEqual(runtimeEvePendingKey(f.binding),runtimeEvePendingKey({...f.binding,deviceId:crypto.randomUUID()}));});

void test('running stop request remains unknown until same-ID host receipt confirms it',async t=>{const f=await setup(t);await f.port.start(f.reference);const entry=(await f.store().commands(f.device)).find(e=>e.command.request.id===f.reference.id),claimId=crypto.randomUUID();await f.store().claim(f.device,{id:f.reference.id,claimId,requestSha256:entry.command.requestSha256});assert.deepEqual(await f.port.stop(f.reference),{status:'unknown',text:null});await f.store().stopReceipt(f.device,{id:f.reference.id,claimId,requestSha256:entry.command.requestSha256,state:'confirmed'});assert.deepEqual(await f.port.read(f.reference),{status:'stopped',text:null});});
void test('exact owner read enforces device binding and adapter rejects misbound response before result display',async t=>{const f=await setup(t);await f.port.start(f.reference);await assert.rejects(f.store().inspectOwnerRequest(f.reference.id,f.addDevice()),e=>e.status===404);const wrong=createRuntimeEveWorkPort({...f.binding,continuing:()=>true,api:async(path,init)=>{const value=await f.api(path,init);if(path.includes('requestId='))value.pending.threadId=crypto.randomUUID();return value;}});await assert.rejects(wrong.read(f.reference),/一致しません/);});

void test('runtime normalizes surrounding whitespace while retaining exact pending identity',async t=>{const f=await setup(t),ref={...f.reference,input:"  下書きを作る\n"};await f.port.start(ref);assert.deepEqual(await f.port.read(ref),{status:"running",text:null});assert.deepEqual(await f.port.stop(ref),{status:"stopped",text:null});});

void test('missing-start fence survives fresh store and offline presence, rejects changed run and foreign owner',async t=>{
 const f=await setup(t);f.sql.prepare('DELETE FROM eve_runtime_presence').run();
 assert.deepEqual(await f.port.stop(f.reference),{status:'stopped',text:null});
 assert.equal((await f.store().inspectOwnerRequest(f.reference.id)).pending.state,'cancelled-before-start');
 assert.equal((await f.store().pendingOwner())[0].state,'cancelled-before-start');
 assert.equal((await f.store().list()).length,0);
 assert.equal((await f.history().get(f.binding.threadId).catch(()=>null)),null);
 assert.deepEqual(await f.port.start(f.reference),{status:'stopped',text:null});
 await assert.rejects(f.port.start({...f.reference,input:'別の依頼'}),e=>e.status===409);
 await assert.rejects(f.store('bob').inspectOwnerRequest(f.reference.id),e=>e.status===404);
 assert.equal((await f.store().commands(f.device)).length,0);
});
void test('concurrent delayed start and explicit missing-start stop never leaves executable pending work',async t=>{
 const f=await setup(t);
 for(let i=0;i<8;i++){
  const value={...f.reference,id:crypto.randomUUID()};
  const request={...f.binding,...value,maxOutputTokens:256,confirm:'run-owner-local-text'};delete request.owner;
  await Promise.all([f.store().enqueue(request),f.store().fenceStart(request)]);
  assert.equal((await f.store().inspectOwnerRequest(value.id)).pending.state,'cancelled-before-start');
  assert.equal((await f.store().commands(f.device)).length,0);
 }
});
void test('fence refuses deleted conversation and a device belonging to another owner',async t=>{
 const f=await setup(t),request={...f.binding,...f.reference,maxOutputTokens:256,confirm:'run-owner-local-text'};delete request.owner;
 await assert.rejects(f.store().fenceStart({...request,deviceId:f.addDevice('bob')}),e=>e.status===409);
 const saved=await f.history().save({session:{version:1,id:f.binding.threadId,toolId:'sky-auto',createdAt:1,messages:[],activeRequest:null,workflowStatus:'ready',outcome:null},revision:0,remember:true});
 await f.history().remove(f.binding.threadId,saved.revision);
 await assert.rejects(f.store().fenceStart(request),e=>e.status===410||e.status===404);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM eve_device_commands').get().n,0);
});
void test('fence against an already claimed run waits for actual device stop receipt',async t=>{
 const f=await setup(t);await f.port.start(f.reference);
 const entry=(await f.store().commands(f.device))[0],claimId=crypto.randomUUID();
 await f.store().claim(f.device,{id:f.reference.id,claimId,requestSha256:entry.command.requestSha256});
 const request={...f.binding,...f.reference,maxOutputTokens:256,confirm:'run-owner-local-text'};delete request.owner;
 const response=await f.store().fenceStart(request);assert.equal(response.stopConfirmed,false);
 assert.deepEqual(await f.port.read(f.reference),{status:'unknown',text:null});
 await f.store().stopReceipt(f.device,{id:f.reference.id,claimId,requestSha256:entry.command.requestSha256,state:'confirmed'});
 assert.deepEqual(await f.port.read(f.reference),{status:'stopped',text:null});
});

void test('common Core reconnects a saved missing request through the real same-ID fence before standby',async t=>{
 const f=await setup(t),key=runtimeEvePendingKey(f.binding),saved=new Map([[key,JSON.stringify(f.reference)]]);
 const session=createEveInteractionSession({work:f.port,pendingKey:key,storage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},changed(){}});
 session.arm();assert.equal(session.state.phase,'unknown');await session.stop();assert.equal(session.state.phase,'standby');assert.equal(saved.size,0);
 assert.equal((await f.store().inspectOwnerRequest(f.reference.id)).pending.state,'cancelled-before-start');assert.equal((await f.store().commands(f.device)).length,0);
 assert.equal(f.calls.filter(c=>c.init.method==='PUT'&&JSON.parse(c.init.body).action==='fence-start').length,1);
 assert.deepEqual(await f.port.start(f.reference),{status:'stopped',text:null});assert.equal((await f.store().commands(f.device)).length,0);
});
void test('missing-read stop racing a claimed delivery keeps Core unknown until the real host receipt',async t=>{
 const f=await setup(t),key=runtimeEvePendingKey(f.binding),saved=new Map([[key,JSON.stringify(f.reference)]]);let claimId,requestSha256,raced=false;
 const work=createRuntimeEveWorkPort({...f.binding,continuing:()=>true,api:async(path,init)=>{
  if(init?.method==='PUT'&&!raced){raced=true;await f.port.start(f.reference);const entry=(await f.store().commands(f.device))[0];claimId=crypto.randomUUID();requestSha256=entry.command.requestSha256;await f.store().claim(f.device,{id:f.reference.id,claimId,requestSha256});}
  return f.api(path,init);
 }});
 const session=createEveInteractionSession({work,pendingKey:key,storage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},changed(){}});
 session.arm();await session.stop();assert.equal(raced,true);assert.equal(session.state.phase,'unknown');assert.equal(saved.size,1);
 await f.store().stopReceipt(f.device,{id:f.reference.id,claimId,requestSha256,state:'confirmed'});await session.stop();assert.equal(session.state.phase,'standby');assert.equal(saved.size,0);
});

void test('a fresh client explicitly resumes the authenticated same-ID runtime job without another POST',async t=>{
 const f=await setup(t);await f.port.start(f.reference);f.calls.length=0;
 const data=new Map(),session=createEveInteractionSession({work:f.port,pendingKey:runtimeEvePendingKey(f.binding),storage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},changed(){}});
 await session.resume(f.reference);assert.equal(session.state.phase,'running');assert.equal(session.state.jobId,f.reference.id);assert.ok(f.calls.length>0);assert.ok(f.calls.every(c=>(c.init.method??'GET')==='GET'));await session.stop();assert.equal(session.state.phase,'standby');
});

void test('saved choices retain exact binding and exclude conflicting same-ID input',async t=>{
 const f=await setup(t);await f.port.start(f.reference);const pending=await f.store().pendingOwner(f.binding.threadId),snapshot={ownerUserId:'alice',pending,executions:[]};
 assert.deepEqual(runtimeEveRestorableWork(f.binding,snapshot),[f.reference]);
 assert.deepEqual(runtimeEveRestorableWork(f.binding,{...snapshot,ownerUserId:'bob'}),[]);
 assert.deepEqual(runtimeEveRestorableWork({...f.binding,modelSha256:'f'.repeat(64)},snapshot),[]);
 assert.deepEqual(runtimeEveRestorableWork(f.binding,{...snapshot,pending:[...pending,{...pending[0],input:'競合'}]}),[]);
});

void test('the browser thread query discovers an old job hidden by other conversations',async t=>{
 const f=await setup(t);await f.port.start(f.reference);f.sql.prepare('UPDATE eve_device_commands SET created_at=0 WHERE id=?').run(f.reference.id);
 for(let i=0;i<51;i++)await f.enqueue({threadId:crypto.randomUUID()});
 const global=await f.api('/api/eve/runtime');assert.equal(global.pending.some(p=>p.id===f.reference.id),false);
 const scoped=await f.api('/api/eve/runtime?threadId='+encodeURIComponent(f.binding.threadId));assert.deepEqual(scoped.pending.map(p=>p.id),[f.reference.id]);
 const source=readFileSync(new URL('../components/eve-sync-workspace.tsx',import.meta.url),'utf8');assert.match(source,/const runtimeThread = activeThread\.current/);assert.match(source,/encodeURIComponent\(runtimeThread\)/);assert.match(source,/if \(activeThread\.current === runtimeThread\)/);
});

void test('saved runtime pages cover equal-time IDs beyond50, include outcomes, and bind owner/thread cursor',async t=>{
 const f=await setup(t);await f.port.start(f.reference);
 const completed=await f.enqueue({threadId:f.binding.threadId});await f.store().publish(f.device,{report:await f.report(completed.entry),revision:0});
 for(let i=0;i<55;i++)await f.enqueue({threadId:f.binding.threadId});
 f.sql.prepare('UPDATE eve_device_commands SET created_at=100').run();
 await f.enqueue({threadId:crypto.randomUUID()});
 const prefix='/api/eve/runtime?savedJobs=1&threadId='+f.binding.threadId;
 const changes=f.sql.prepare('SELECT total_changes() AS count').get().count;
 const first=await f.api(prefix);assert.equal(first.pending.length,50);assert.ok(first.cursor);
 const second=await f.api(prefix+'&cursor='+encodeURIComponent(first.cursor));assert.equal(second.pending.length,7);assert.equal(second.cursor,null);assert.equal(f.sql.prepare('SELECT total_changes() AS count').get().count,changes);
 const ids=[...first.pending,...second.pending].map(p=>p.id);assert.equal(new Set(ids).size,57);assert.ok(ids.includes(f.reference.id));assert.ok([...first.executions,...second.executions].some(e=>e.id===completed.request.id));
 await assert.rejects(f.api('/api/eve/runtime?savedJobs=1&threadId='+crypto.randomUUID()+'&cursor='+encodeURIComponent(first.cursor)),e=>e.status===400);
 await assert.rejects(f.api(prefix+'&cursor='+encodeURIComponent('[]')),e=>e.status===400);
 await assert.rejects(f.api(prefix+'&requestId='+f.reference.id),e=>e.status===400);
 f.setOwner('bob');await assert.rejects(f.api(prefix+'&cursor='+encodeURIComponent(first.cursor)),e=>e.status===400);assert.deepEqual((await f.api(prefix)).pending,[]);
 f.setOwner('alice');const thread=await f.history().get(f.binding.threadId);await f.history().remove(thread.session.id,thread.revision);await assert.rejects(f.api(prefix),e=>e.status===410);
});

void test('historical drafts remain readable after role/model replacement and device revocation without execution',async t=>{
 const f=await setup(t),done=await f.enqueue({threadId:f.binding.threadId}),report=await f.report(done.entry);await f.store().publish(f.device,{report,revision:0});
 const recipe={name:'新版の担当',instructions:'新版の役割',modelId:'replacement-model'};await f.announce({agents:[{id:f.binding.agentId,...recipe,sha256:await linkedDigest(JSON.stringify(recipe))}],models:[{id:recipe.modelId,name:'新モデル',scheme:'ollama-manifest-sha256',sha256:'ef'.repeat(32)}],preparedModels:[recipe.modelId]});
 await assert.rejects(f.port.prepare('古い担当を再実行',()=>true));f.sql.prepare('UPDATE rockstar_device_sessions SET revoked_at=1').run();f.calls.length=0;
 let current=true;const reader=createRuntimeEveArchiveReader({owner:'alice',threadId:f.binding.threadId,api:f.api,current:()=>current}),changes=f.sql.prepare('SELECT total_changes() AS n').get().n;
 const page=await reader.page();assert.equal(page.items.length,1);const expected=page.items[0];assert.equal(expected.request.model.sha256,f.binding.modelSha256);assert.equal(expected.request.agent.sha256,f.binding.agentSha256);
 const file=await reader.draft(expected);assert.ok(file.text.includes(report.text));assert.ok(file.text.includes(expected.request.model.id));assert.ok(file.text.includes(f.binding.modelSha256));assert.ok(file.text.includes(f.binding.agentSha256));assert.ok(f.calls.every(c=>(c.init.method??'GET')==='GET'));assert.equal(f.sql.prepare('SELECT total_changes() AS n').get().n,changes);
 const altered=createRuntimeEveArchiveReader({owner:'alice',threadId:f.binding.threadId,current:()=>true,api:async(path,init)=>{const value=await f.api(path,init);value.execution.request.model.sha256='ff'.repeat(32);return value;}});await assert.rejects(altered.draft(expected));
 let release;const waiting=new Promise(r=>{release=r;});const delayed=createRuntimeEveArchiveReader({owner:'alice',threadId:f.binding.threadId,current:()=>current,api:async(path,init)=>{const value=await f.api(path,init);await waiting;return value;}});const pending=delayed.draft(expected);current=false;release();await assert.rejects(pending);current=true;
 f.setOwner('bob');await assert.rejects(reader.draft(expected),e=>e.status===409);f.setOwner('alice');
 const history=await f.history().get(f.binding.threadId);await f.history().remove(history.session.id,history.revision);await assert.rejects(reader.draft(expected),e=>e.status===404);await assert.rejects(reader.page(),e=>e.status===410);
});

void test('historical stop stays on its original role/model/job and waits for the original host receipt',async t=>{
 const f=await setup(t);await f.port.start(f.reference);const other=await f.enqueue({threadId:f.binding.threadId}),pending=(await f.store().inspectOwnerRequest(f.reference.id)).pending;
 const entry=(await f.store().commands(f.device)).find(e=>e.command.request.id===f.reference.id),claim={id:f.reference.id,claimId:crypto.randomUUID(),requestSha256:entry.command.requestSha256};await f.store().claim(f.device,claim);
 const recipe={name:'新担当',instructions:'新版',modelId:'new-model'};await f.announce({executor:describeAdapter('test-executor','executor','macos',{'text.generate':true,'model.pin':true,'execution.stop':true}),agents:[{id:f.binding.agentId,...recipe,sha256:await linkedDigest(JSON.stringify(recipe))}],models:[{id:recipe.modelId,name:'新モデル',scheme:'ollama-manifest-sha256',sha256:'ef'.repeat(32)}],preparedModels:[recipe.modelId]});f.calls.length=0;
 let current=true;const control=createRuntimeEveHistoryControl({owner:'alice',threadId:f.binding.threadId,api:f.api,current:()=>current});assert.deepEqual(Object.keys(control).sort(),['inspect','requestStop']);
 assert.equal((await control.inspect(pending)).status,'running');assert.equal((await control.requestStop(pending)).status,'unknown');assert.equal((await f.store().inspectOwnerRequest(other.request.id)).pending.state,'pending');
 const mutations=f.calls.filter(c=>(c.init.method??'GET')!=='GET');assert.equal(mutations.length,1);assert.equal(mutations[0].init.method,'PUT');assert.deepEqual(JSON.parse(mutations[0].init.body),{action:'stop',request:{id:f.reference.id,confirm:'stop-owner-local-text'}});
 await f.store().stopReceipt(f.device,{...claim,state:'confirmed'});assert.equal((await control.inspect(pending)).status,'stopped');
 const puts=f.calls.filter(c=>c.init.method==='PUT').length;await assert.rejects(control.requestStop({...pending,model:{...pending.model,sha256:'ff'.repeat(32)}}));assert.equal(f.calls.filter(c=>c.init.method==='PUT').length,puts);
 assert.throws(()=>control.inspect({...pending,threadId:crypto.randomUUID()}));current=false;assert.throws(()=>control.requestStop(pending));current=true;
 f.setOwner('bob');await assert.rejects(control.requestStop(pending),e=>e.status===409);
});
void test('revoked historical host cannot be presented as stopped, and retired context cannot issue a stop',async t=>{
 const f=await setup(t);await f.port.start(f.reference);const entry=(await f.store().commands(f.device))[0],claim={id:f.reference.id,claimId:crypto.randomUUID(),requestSha256:entry.command.requestSha256};await f.store().claim(f.device,claim);const pending=(await f.store().inspectOwnerRequest(f.reference.id)).pending;
 f.sql.prepare('UPDATE rockstar_device_sessions SET revoked_at=1').run();const control=createRuntimeEveHistoryControl({owner:'alice',threadId:f.binding.threadId,api:f.api,current:()=>true});await assert.rejects(control.requestStop(pending),e=>e.status===409);assert.equal((await control.inspect(pending)).status,'running');
 let current=true;f.calls.length=0;const retired=createRuntimeEveHistoryControl({owner:'alice',threadId:f.binding.threadId,current:()=>current,api:async(path,init)=>{const value=await f.api(path,init);current=false;return value;}});await assert.rejects(retired.requestStop(pending));assert.ok(f.calls.every(c=>(c.init.method??'GET')==='GET'));
});

void test('a lost historical server record never becomes an undelivered start fence or a stopped receipt',async t=>{
 const f=await setup(t);await f.port.start(f.reference);const entry=(await f.store().commands(f.device))[0];await f.store().claim(f.device,{id:f.reference.id,claimId:crypto.randomUUID(),requestSha256:entry.command.requestSha256});const pending=(await f.store().inspectOwnerRequest(f.reference.id)).pending;assert.equal(pending.state,'received');f.sql.prepare('DELETE FROM eve_device_commands WHERE id=?').run(f.reference.id);f.calls.length=0;
 const control=createRuntimeEveHistoryControl({owner:'alice',threadId:f.binding.threadId,api:f.api,current:()=>true});assert.equal(await control.inspect(pending),null);await assert.rejects(control.requestStop(pending));assert.ok(f.calls.every(c=>(c.init.method??'GET')==='GET'));assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM eve_device_commands WHERE id=?').get(f.reference.id).n,0);
});

void test('same Core keeps known provenance after server loss and client reload without any fence',async t=>{
 const f=await setup(t),saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},key=runtimeEvePendingKey(f.binding);
 const session=createEveInteractionSession({work:f.port,pendingKey:key,storage,changed(){}});session.arm();session.hearFinal('Hey Eve');session.hearFinal(f.reference.input);await session.confirm();const id=session.state.jobId;assert.equal(JSON.parse(saved.get(key)).knownExisting,true);
 f.sql.prepare('DELETE FROM eve_device_commands WHERE id=?').run(id);f.calls.length=0;await session.stop();assert.equal(session.state.phase,'unknown');assert.ok(saved.has(key));
 const restored=createEveInteractionSession({work:f.port,pendingKey:key,storage,changed(){}});restored.arm();await restored.stop();assert.equal(restored.state.phase,'unknown');assert.equal(restored.state.jobId,id);assert.ok(f.calls.every(c=>(c.init.method??'GET')==='GET'));assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM eve_device_commands WHERE id=?').get(id).n,0);
});
void test('record loss between Core read and stopExisting read never dispatches a first-delivery fence',async t=>{
 const f=await setup(t);await f.port.start(f.reference);let armed=false,reads=0;
 const port=createRuntimeEveWorkPort({...f.binding,continuing:()=>true,api:async(path,init)=>{if(armed&&path.includes('requestId=')&&++reads===2)f.sql.prepare('DELETE FROM eve_device_commands WHERE id=?').run(f.reference.id);return f.api(path,init);}});
 const saved=new Map(),session=createEveInteractionSession({work:port,pendingKey:runtimeEvePendingKey(f.binding),storage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},changed(){}});await session.resume(f.reference);f.calls.length=0;armed=true;await session.stop();assert.equal(session.state.phase,'unknown');assert.equal(reads,2);assert.ok(f.calls.every(c=>(c.init.method??'GET')==='GET'));assert.equal(saved.size,1);
});

void test('accepted start with a lost subsequent row is known-existing, not a first delivery',async t=>{
 const f=await setup(t);const port=createRuntimeEveWorkPort({...f.binding,continuing:()=>true,api:async(path,init)=>{const value=await f.api(path,init);if(init?.method==='POST')f.sql.prepare('DELETE FROM eve_device_commands WHERE id=?').run(value.id);return value;}});
 const saved=new Map(),key=runtimeEvePendingKey(f.binding),session=createEveInteractionSession({work:port,pendingKey:key,storage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},changed(){}});session.arm();session.hearFinal('Hey Eve');session.hearFinal(f.reference.input);await session.confirm();assert.equal(session.state.phase,'unknown');assert.equal(JSON.parse(saved.get(key)).knownExisting,true);f.calls.length=0;await session.stop();assert.equal(session.state.phase,'unknown');assert.ok(f.calls.every(c=>(c.init.method??'GET')==='GET'));assert.equal(saved.size,1);
});
