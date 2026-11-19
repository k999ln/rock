import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { operationFixture } from './helpers/noah-general-operations-fixture.mjs';
import { createGeneralOperations, generalOperationsMiddleware } from '../scripts/noah-general-operations.mjs';
import { parseOperationRequest, operationRunId } from '../lib/noah-operation-contract.mjs';
import { createNoahWork, executionInputDigest } from '../lib/noah-execution.ts';
import { applyWorkCommand } from '../lib/workflow.ts';
import { RECIPES } from '../lib/noah-execution-contract.mjs';
const until = async fn => { for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('not settled'); };

void test('explicit bounded repetition, exact lease, owner, immutable inputs and Work command boundary',async t=>{
  const f=operationFixture();t.after(()=>f.close());const input=f.config();
  for(const change of [{intervalSeconds:1},{maxRuns:101},{expiresAt:f.time.now+86400001},{confirmation:false},{timeZone:'invalid'}, {command:'open Safari'}]) assert.throws(()=>parseOperationRequest({...input,...change},f.time.now));
  await Promise.all(Array.from({length:10},()=>f.manager.start(f.scope,input,f.client)));
  assert.equal((await f.service.list(f.user)).length,1);assert.equal((await f.service.list('bob')).length,0);
  await assert.rejects(f.service.get('bob',input.id),{status:404});
  await assert.rejects(f.manager.start(f.scope,{...input,prompt:'changed'},f.client),{status:409});
  await assert.rejects(f.service.command(f.user,{id:input.id,action:'claim',revision:0,lease:'b'.repeat(64)}),{status:403});
  assert.throws(()=>applyWorkCommand(awaitJob(),{id:randomUUID(),action:'complete'},0));
  function awaitJob(){return {id:input.id,templateId:'noah-operation',revision:0};}
  await f.tick();assert.equal(f.runs.length,1);const job=await f.service.get(f.user,input.id);
  assert.equal(job.noahOperation.history[0].jobId,operationRunId(input.id,1));assert.equal(job.noahOperation.succeeded,1);
  assert.equal((await f.store.listNoah(f.user)).length,1);
});
void test('two different general recipes serialize fairly, skip missed intervals, stop one and exhaust the other',async t=>{
  const f=operationFixture();t.after(()=>f.close());const a=f.config({prompt:'first'}),b=f.config({agentId:Object.keys(RECIPES).find(id=>RECIPES[id].key==='gptme'),prompt:'second',maxRuns:2});
  await f.manager.start(f.scope,a,f.client);await f.manager.start(f.scope,b,f.client);
  await f.tick();await f.tick();assert.deepEqual(f.runs,['first','second']);
  await f.manager.stop(f.scope,a.id,f.client);f.time.now+=600000;
  await f.tick();await f.tick();assert.deepEqual(f.runs,['first','second','second']);
  assert.equal((await f.service.get(f.user,b.id)).noahOperation.state,'exhausted');
  const aJob=await f.service.get(f.user,a.id);assert.equal(aJob.noahOperation.state,'paused');
  await f.manager.resume(f.scope,a.id,f.client);await f.tick();assert.equal(f.runs.length,3);
  f.time.now+=60000;await f.tick();assert.equal(f.runs.length,4);
});
void test('atomic Work fences reject racing host claims and stop winning before job creation/start',async t=>{
  const f=operationFixture();t.after(()=>f.close());const input=f.config(),lease='c'.repeat(64),binding=await f.executions.binding(f.scope,input.agentId);
  await f.service.create(f.user,input,binding,lease);
  const results=await Promise.allSettled([1,2].map(()=>f.service.command(f.user,{id:input.id,action:'claim',revision:0,lease})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const parent=await f.service.get(f.user,input.id),active=parent.noahOperation.active;
  const candidate=await createNoahWork(active.jobId,{...binding,prompt:input.prompt,inputSha256:await executionInputDigest(input.agentId,input.prompt),claimSha256:'b'.repeat(64),operation:{id:input.id,sequence:1}});
  await f.service.command(f.user,{id:input.id,action:'pause',revision:parent.revision});
  assert.equal(await f.store.createNoahOperationRun(f.user,candidate,parent),null);
  await f.store.create(f.user,candidate);assert.equal(await f.store.startNoahOperationRun(f.user,{...candidate,revision:1},0,parent),false);
});
void test('stop while actual runtime promise is active confirms cancellation and prevents new occurrence',async t=>{
  const f=operationFixture({run:async(_prompt,signal)=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});})});t.after(()=>f.close());
  const input=f.config();await f.manager.start(f.scope,input,f.client);await f.manager.tick();await until(()=>f.runs.length===1);
  const stopping=f.manager.stop(f.scope,input.id,f.client);await stopping;
  const job=await f.service.get(f.user,input.id);assert.equal(job.noahOperation.state,'paused');assert.equal(job.noahOperation.history[0].state,'cancelled');
  f.time.now+=120000;await f.tick();assert.equal(f.runs.length,1);
});
void test('reconstructed host never repeats saved work, reports interruption and reconciles before resume',async t=>{
  const f=operationFixture();t.after(()=>f.close());const input=f.config();await f.manager.start(f.scope,input,f.client);await f.tick();
  const fresh=createGeneralOperations({executions:f.executions,now:()=>f.time.now,auto:false});t.after(()=>fresh.close());
  const replay=await fresh.start(f.scope,input,f.client);assert.equal(fresh.view(f.scope,replay.job).noahOperation.hostState,'interrupted');
  f.time.now+=60000;await fresh.tick();await fresh.drain();assert.equal(f.runs.length,1);
  await fresh.stop(f.scope,input.id,f.client);await fresh.resume(f.scope,input.id,f.client);
  f.time.now+=60000;await fresh.tick();await fresh.drain();assert.equal(f.runs.length,2);
});
void test('lost host with unconfirmed Work blocks resume without replaying the task',async t=>{
  const f=operationFixture();t.after(()=>f.close());const input=f.config(),lease='d'.repeat(64),binding=await f.executions.binding(f.scope,input.agentId);
  await f.service.create(f.user,input,binding,lease);const parent=await f.service.command(f.user,{id:input.id,action:'claim',revision:0,lease});
  const job=await createNoahWork(parent.noahOperation.active.jobId,{...binding,prompt:input.prompt,inputSha256:await executionInputDigest(input.agentId,input.prompt),claimSha256:'e'.repeat(64),operation:{id:input.id,sequence:1}});await f.store.create(f.user,job);
  await f.manager.stop(f.scope,input.id,f.client);const saved=await f.service.get(f.user,input.id);
  assert.equal(saved.noahOperation.state,'blocked');assert.equal(saved.noahOperation.history[0].state,'unknown');
  await f.manager.stop(f.scope,input.id,f.client);assert.equal((await f.service.get(f.user,input.id)).noahOperation.state,'blocked');
  await assert.rejects(f.manager.resume(f.scope,input.id,f.client),{status:409});assert.equal(f.runs.length,0);
});
void test('quota, expiration, fixed image changes and ownership revocation stop further processing',async t=>{
  const f=operationFixture();t.after(()=>f.close());const input=f.config();await f.manager.start(f.scope,input,f.client);f.runtime.execution.image='sha256:'+'b'.repeat(64);
  await f.tick();assert.equal(f.runs.length,0);assert.notEqual((await f.service.get(f.user,input.id)).noahOperation.state,'enabled');
  const next=f.config();await f.manager.start(f.scope,next,f.client);f.revoke();await f.tick();assert.equal(f.runs.length,0);
  const g=operationFixture();t.after(()=>g.close());const limited=g.config({expiresAt:g.time.now+500});await g.manager.start(g.scope,limited,g.client);g.time.now+=1000;await g.tick();assert.equal(g.runs.length,0);assert.equal((await g.service.get(g.user,limited.id)).noahOperation.state,'exhausted');
  const h=operationFixture();t.after(()=>h.close());for(let i=0;i<20;i++)await h.manager.start(h.scope,h.config(),h.client);await assert.rejects(h.manager.start(h.scope,h.config(),h.client),{status:429});
});
void test('Codex repeated execution requires the specific account send confirmation',async t=>{
  const f=operationFixture();t.after(()=>f.close());await assert.rejects(f.manager.start(f.scope,f.config({agentId:'anicca'}),f.client),{status:400});assert.equal(f.runs.length,0);
});
void test('operation bridge denies foreign Origin, owner mismatch, remote host and arbitrary mutation fields',async()=>{
  const scope='owner-v1:'+'a'.repeat(64);let calls=0;
  const middleware=generalOperationsMiddleware({manager:{async start(){calls++;}},port:3107,getOwner:async()=>({localHostOwner:true,ownerScope:scope}),workFor:()=>{},operationFor:()=>{}});
  async function request(headers={},body='{}') {const req=Readable.from([Buffer.from(body)]);Object.assign(req,{socket:{remoteAddress:'127.0.0.1'},url:'/__noah/operations',method:'POST',headers:{host:'127.0.0.1:3107',origin:'http://127.0.0.1:3107','content-type':'application/json','x-rock-owner-scope':scope,...headers}});let status;await middleware(req,{writeHead(s){status=s;},end(){}},()=>{});return status;}
  assert.equal(await request({origin:'https://evil.invalid'}),403);assert.equal(await request({'x-rock-owner-scope':'other'}),409);assert.equal(await request({host:'remote.invalid'}),403);assert.equal(await request({},'a'.repeat(16001)),413);assert.equal(calls,0);
});
