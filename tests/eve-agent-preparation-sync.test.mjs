import {readFileSync} from 'node:fs';
import {loadRouteFixture} from './helpers/load-route-fixture.mjs';
import {requestUser} from '../lib/request-auth.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeFixture} from './helpers/eve-runtime-fixture.mjs';
import {describeAdapter} from '../lib/rockstar-adapters.ts';
import {linkedDigest} from '../lib/rockstar-linked-execution.ts';
import {eveAgentPreparationQueue} from '../lib/eve-agent-preparation-sync.ts';
async function setup(t){
 const f=runtimeFixture(t),presence=await f.announce({models:[{id:'test-model',name:'合成GGUF',scheme:'gguf-sha256',sha256:'cd'.repeat(32)}],host:describeAdapter('test-host','host','macos',{'identity.owner-local':true,'store.cas':true,'agent.prepare':true})}),recipe={name:'新しい担当',instructions:'目的と完成条件に沿って下書きする。',modelId:presence.models[0].id};
 const request={id:crypto.randomUUID(),threadId:crypto.randomUUID(),deviceId:f.device,agent:{id:crypto.randomUUID(),...recipe,sha256:await linkedDigest(JSON.stringify(recipe))},model:{id:presence.models[0].id,scheme:presence.models[0].scheme,sha256:presence.models[0].sha256},confirm:'prepare-owner-local-agent'};
 const queue=f.store().preparations;
 async function claim(){const command=(await queue.commands(f.device))[0].command,claimId=crypto.randomUUID();await queue.claim(f.device,{id:request.id,claimId,requestSha256:command.requestSha256});return {command,claimId,receipt:{id:request.id,claimId,requestSha256:command.requestSha256,agent:request.agent,model:request.model}};}
 return {...f,presence,request,queue,claim,announceAgent:()=>f.announce({...presence,agents:[...presence.agents,request.agent]})};
}
void test('existing encrypted queue registers only after exact presence readback; replay keeps one ID and old consumers see no new command',async t=>{
 const f=await setup(t);await f.queue.enqueue(f.request);await f.queue.enqueue(f.request);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM eve_device_commands').get().n,1);
 assert.equal((await f.store().commands(f.device)).length,0);assert.equal((await f.legacy().pending(f.device)).length,0);
 const {command,claimId,receipt}=await f.claim(),grant=await f.queue.authorize(f.device,f.request.id,claimId);
 assert.equal(grant.permission,'agent.prepare');assert.equal(grant.preparationId,f.request.id);assert.equal(grant.requestSha256,command.requestSha256);assert.equal(grant.maximumCostMinor,0);
 await assert.rejects(f.queue.acknowledge(f.device,receipt),{message:'AGENT_PREPARATION_READBACK_REQUIRED'});
 await f.announceAgent();assert.deepEqual(await f.queue.acknowledge(f.device,receipt),{id:f.request.id,registered:true});
 assert.deepEqual(await f.queue.acknowledge(f.device,receipt),{id:f.request.id,registered:true});
 const reread=await f.store().preparations.read(f.request.id);assert.equal(reread.registered,true);assert.equal(reread.command.request.agent.id,f.request.agent.id);
 assert.equal((await f.queue.commands(f.device)).length,0);
});
void test('owner/device separation, changed content, forged pins and missing capabilities cannot enter preparation',async t=>{
 const f=await setup(t);await f.queue.enqueue(f.request);
 await assert.rejects(f.store('bob').preparations.read(f.request.id),e=>e.status===404);
 await assert.rejects(f.queue.read(f.request.id,f.addDevice()),e=>e.status===404);
 await assert.rejects(f.queue.enqueue({...f.request,agent:{...f.request.agent,name:'別担当'}}));
 const g=await setup(t);await g.announce({...g.presence,host:describeAdapter('test-host','host','macos',{'identity.owner-local':true,'store.cas':true})});
 await assert.rejects(g.queue.enqueue(g.request),{message:'AGENT_PREPARATION_UNSUPPORTED'});
 assert.equal(g.sql.prepare('SELECT COUNT(*) n FROM eve_device_commands').get().n,0);
});
void test('cancel fences later grant/receipt and never implies local recipe removal or inference success',async t=>{
 const f=await setup(t);await f.queue.enqueue(f.request);const {claimId,receipt}=await f.claim();
 assert.deepEqual(await f.queue.cancel(f.request.id),{id:f.request.id,registered:null,cancelled:true});
 await assert.rejects(f.queue.authorize(f.device,f.request.id,claimId));await f.announceAgent();await assert.rejects(f.queue.acknowledge(f.device,receipt));
 assert.equal((await f.queue.read(f.request.id)).registered,null);assert.equal((await f.queue.commands(f.device)).length,0);
});
void test('concurrent claims have one winner; deleted conversations and expired/revoked sessions prevent grants',async t=>{
 const f=await setup(t);await f.queue.enqueue(f.request);const c=(await f.queue.commands(f.device))[0].command,ids=[crypto.randomUUID(),crypto.randomUUID()];
 const results=await Promise.allSettled(ids.map(claimId=>f.queue.claim(f.device,{id:f.request.id,claimId,requestSha256:c.requestSha256})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const winner=ids[results.findIndex(r=>r.status==='fulfilled')];
 f.sql.prepare('UPDATE eve_device_commands SET expires_at=0 WHERE id=?').run(f.request.id);await assert.rejects(f.queue.authorize(f.device,f.request.id,winner));
 const g=await setup(t);await g.queue.enqueue(g.request);const {claimId}=await g.claim();g.sql.prepare('UPDATE rockstar_device_sessions SET revoked_at=1 WHERE id=?').run(g.device);await assert.rejects(g.queue.authorize(g.device,g.request.id,claimId));
 const h=await setup(t);await h.queue.enqueue(h.request);const hc=await h.claim();h.sql.prepare("INSERT INTO eve_conversations VALUES(?,?,0,0,'{}',0,'',1)").run('alice',h.request.threadId);await assert.rejects(h.queue.authorize(h.device,h.request.id,hc.claimId));assert.equal((await h.queue.commands(h.device)).length,0);
});
void test('revocation during an asynchronous readiness check is rechecked before issuing authorization',async t=>{
 const f=await setup(t);await f.queue.enqueue(f.request);const {claimId}=await f.claim();
 const queue=eveAgentPreparationQueue({db:f.db,owner:'alice',history:f.history(),active:async()=>{},find:async id=>f.sql.prepare('SELECT * FROM eve_device_commands WHERE owner_id=? AND id=?').get('alice',id)??null,available:async()=>{f.sql.prepare('UPDATE rockstar_device_sessions SET revoked_at=1 WHERE id=?').run(f.device);return {presence:f.presence};}});
 await assert.rejects(queue.authorize(f.device,f.request.id,claimId),{message:'AGENT_PREPARATION_AUTHORIZATION_EXPIRED'});
});
void test('queue admission is bounded and an exact replay works at the limit',async t=>{
 const f=await setup(t),ids=Array.from({length:8},()=>crypto.randomUUID());for(const id of ids)await f.queue.enqueue({...f.request,id});
 await f.queue.enqueue({...f.request,id:ids[0]});
 await assert.rejects(f.queue.enqueue(f.request),{message:'AGENT_PREPARATION_CONFLICT_OR_LIMIT'});
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM eve_device_commands').get().n,8);assert.equal((await f.queue.commands(f.device)).length,4);
});

void test('actual route requires authenticated browser intent and preserves owner/device boundaries for preparation',async t=>{
 const f=await setup(t),url=new URL('../app/api/eve/runtime/route.ts',import.meta.url),refs=new Map([['cloudflare:workers',{env:{EVE_HISTORY_KEYRING:JSON.stringify(f.keys)}}],['@/lib/fund-store',{database:()=>f.db,requestUser:async request=>request.headers.get('authorization')==='Bearer rock_session_fixture'?'alice':requestUser(request)}],['@/lib/rockstar-device-link',{rockstarDeviceLinkStore:()=>({identity:async()=>({id:f.device,userId:'alice'})})}]]);
 for(const match of readFileSync(url,'utf8').matchAll(/from ['"](@\/lib\/[^'"]+)['"]/g))if(!refs.has(match[1]))refs.set(match[1],await import(new URL('../lib/'+match[1].slice(6)+'.ts',import.meta.url)));
 const route=loadRouteFixture(url,refs);
 async function call({action='prepare-agent',request=f.request,owner='alice',expectedOwner='alice',origin='http://fixture.test',device=false,query='',method='PUT'}={}){
  const headers={'content-type':'application/json','origin':origin,'x-sky-owner':expectedOwner};if(owner)headers['oai-authenticated-user-id']=owner;if(device)headers.authorization='Bearer rock_session_fixture';
  return route[method](new Request('http://fixture.test/api/eve/runtime'+query,{method,headers,...(method==='GET'?{}:{body:JSON.stringify({action,request})})}));
 }
 assert.equal((await call({owner:''})).status,401);
 assert.equal((await call({origin:'https://foreign.example'})).status,403);
 assert.equal((await call({owner:'bob'})).status,409);
 assert.equal((await call({device:true})).status,403);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM eve_device_commands').get().n,0);
 assert.equal((await call()).status,200);
 const view=await (await call({method:'GET',query:'?preparationId='+f.request.id})).json();assert.equal(view.ownerUserId,'alice');assert.equal(view.registered,false);
 assert.equal((await call({method:'GET',query:'?agentPreparations=1'})).status,403);
 const recovered=await (await call({method:'GET',query:'?preparationThreadId='+f.request.threadId})).json();assert.equal(recovered.preparations[0].command.request.id,f.request.id);
 assert.equal((await call({method:'GET',device:true,query:'?preparationThreadId='+f.request.threadId})).status,403);
 const polled=await (await call({method:'GET',query:'?agentPreparations=1',device:true})).json();assert.equal(polled.preparations[0].command.request.id,f.request.id);
 assert.equal((await call({method:'GET',owner:'bob',expectedOwner:'bob',query:'?preparationId='+f.request.id})).status,404);
});

void test('owner thread recovery retains expired/cancelled preparations, isolates owners and reports truncation',async t=>{
 const f=await setup(t);await f.queue.enqueue(f.request);await f.queue.cancel(f.request.id);
 const read=await f.queue.listOwner(f.request.threadId);assert.equal(read.hasMore,false);assert.equal(read.preparations[0].command.request.id,f.request.id);assert.equal(read.preparations[0].registered,null);
 assert.equal((await f.store('bob').preparations.listOwner(f.request.threadId)).preparations.length,0);
 assert.equal((await f.queue.listOwner(crypto.randomUUID())).preparations.length,0);
 for(let i=0;i<33;i++){const id=crypto.randomUUID();await f.queue.enqueue({...f.request,id});await f.queue.cancel(id);}
 const capped=await f.queue.listOwner(f.request.threadId);assert.equal(capped.preparations.length,32);assert.equal(capped.hasMore,true);
 f.sql.prepare("INSERT INTO eve_conversations VALUES(?,?,0,0,'{}',0,'',1)").run('alice',f.request.threadId);await assert.rejects(f.queue.listOwner(f.request.threadId));
});

void test('expired claimed registration is discoverable for readback, never gets another grant, and can remain explicitly unknown',async t=>{
 const f=await setup(t);await f.queue.enqueue(f.request);const {claimId,receipt}=await f.claim();
 const late=eveAgentPreparationQueue({db:f.db,owner:'alice',history:f.history(),active:async device=>{assert.equal(device,f.device);},find:async id=>f.sql.prepare('SELECT * FROM eve_device_commands WHERE owner_id=? AND id=?').get('alice',id)??null,available:async()=>({presence:(await f.store().devices())[0]}),clock:()=>Date.now()+121000});
 assert.equal((await late.commands(f.device))[0].command.request.id,f.request.id);
 await assert.rejects(late.authorize(f.device,f.request.id,claimId),{message:'AGENT_PREPARATION_AUTHORIZATION_EXPIRED'});
 const unknown={id:f.request.id,claimId,requestSha256:receipt.requestSha256};await assert.rejects(f.queue.unknown(f.device,unknown),{message:'AGENT_PREPARATION_STATE_CONFLICT'});
 await assert.rejects(late.unknown(f.device,{...unknown,claimId:crypto.randomUUID()}));
 assert.deepEqual(await late.unknown(f.device,unknown),{id:f.request.id,registered:null,state:'unknown'});assert.deepEqual(await late.unknown(f.device,unknown),{id:f.request.id,registered:null,state:'unknown'});
 assert.equal((await late.commands(f.device)).length,0);assert.equal((await late.read(f.request.id)).registered,null);
});
void test('a registered role is acknowledged after expiry only through exact current presence',async t=>{
 const f=await setup(t);await f.queue.enqueue(f.request);const {receipt}=await f.claim();
 const late=eveAgentPreparationQueue({db:f.db,owner:'alice',history:f.history(),active:async()=>{},find:async id=>f.sql.prepare('SELECT * FROM eve_device_commands WHERE owner_id=? AND id=?').get('alice',id)??null,available:async()=>({presence:(await f.store().devices())[0]}),clock:()=>Date.now()+121000});
 await assert.rejects(late.acknowledge(f.device,receipt),{message:'AGENT_PREPARATION_READBACK_REQUIRED'});await f.announceAgent();assert.deepEqual(await late.acknowledge(f.device,receipt),{id:f.request.id,registered:true});assert.equal((await late.commands(f.device)).length,0);
});
