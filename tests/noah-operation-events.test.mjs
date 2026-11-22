import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { operationFixture } from './helpers/noah-general-operations-fixture.mjs';
import { createNoahWork, executionInputDigest, noahDigest, updateNoahWork } from '../lib/noah-execution.ts';
import { operationEvent, operationEventPrompt } from '../lib/noah-operation-events.ts';
import { validateOperationRun } from '../lib/noah-operations.ts';
import { parseOperationRequest } from '../lib/noah-operation-contract.mjs';
import { RECIPES } from '../lib/noah-execution-contract.mjs';
const sourceId = Object.keys(RECIPES).find(id=>RECIPES[id].key==='gptme');
async function source(f,{user=f.user,text='source result',state='returned',operation,at=f.time.now}={}) {
  const binding=await f.executions.binding(f.scope,sourceId),claim='c'.repeat(64);
  let job=await createNoahWork(randomUUID(),{...binding,prompt:'fixture',inputSha256:await executionInputDigest(sourceId,'fixture'),claimSha256:await noahDigest(claim)});
  job=await updateNoahWork(job,{action:'finish',state,claim,calls:0,...(state==='returned'?{result:{text,files:[],exitCode:0}}:{})});
  job.noahExecution.completedAt=at;if(operation)job.noahExecution.operation=operation;
  await f.store.create(user,job);return job;
}
async function change(f,id,action,extra={}) {const job=await f.service.get(f.user,id);return f.manager.change(f.scope,id,action,{revision:job.revision,...extra},f.client);}
void test('only new successful owner Work triggers one actual manager run per event; repeated polling does not duplicate',async t=>{
  const f=operationFixture();t.after(()=>f.close());await source(f);const config=f.config({trigger:{kind:'work.returned',agentId:sourceId}});
  await f.manager.start(f.scope,config,f.client);await f.tick();assert.equal(f.runs.length,0);
  f.time.now+=5001;await source(f,{user:'bob'});await source(f,{state:'failed'});const src=await source(f,{text:'untrusted data'});
  await f.tick();assert.equal(f.runs.length,1);assert.match(f.runs[0],/untrusted data/);
  const op=(await f.service.get(f.user,config.id)).noahOperation,run=await f.store.get(f.user,op.history[0].jobId);
  assert.equal(op.succeeded,1);assert.equal(run.noahExecution.operation.event.jobId,src.id);assert.equal(run.noahExecution.operation.configVersion,1);
  assert.equal(run.noahExecution.operation.event.resultSha256,await noahDigest(JSON.stringify({exitCode:0,files:[],text:'untrusted data'})));
  f.time.now+=60001;await f.tick();await f.tick();assert.equal(f.runs.length,1);
  assert.equal(op.history[0].prompt,undefined);
});
void test('event scan applies owner, success and cursor before limit and orders equal timestamps by ID',async t=>{
  const f=operationFixture();t.after(()=>f.close());const config=f.config({trigger:{kind:'work.returned',agentId:sourceId}});
  for(let i=0;i<30;i++)await source(f);await f.manager.start(f.scope,config,f.client);f.time.now+=1;
  const a=await source(f),b=await source(f);const rows=await f.store.listNoahEvents(f.user,sourceId,{at:f.time.now-1,id:'~'});
  assert.deepEqual(rows.map(r=>r.id),[a.id,b.id].sort());
  await f.tick();f.time.now+=60000;await f.tick();assert.equal(f.runs.length,2);
});
void test('cycles, depth and large source text are bounded; invalid event definitions are refused',async t=>{
  const f=operationFixture();t.after(()=>f.close());const config=f.config({trigger:{kind:'work.returned',agentId:sourceId}});await f.manager.start(f.scope,config,f.client);f.time.now+=1;
  await source(f,{operation:{id:config.id,sequence:1}});await f.tick();assert.equal(f.runs.length,0);
  const src=await source(f,{text:'😀\u0000'.repeat(2000),operation:{id:randomUUID(),sequence:1,event:{lineage:Array.from({length:8},()=>randomUUID())}}});
  assert.equal(await operationEvent(src,config.id,sourceId),null);
  const prompt=operationEventPrompt('あ'.repeat(2000),src);assert.ok(Buffer.byteLength(prompt)<12000);assert.match(prompt,/truncated/);
  assert.throws(()=>parseOperationRequest({...config,trigger:{kind:'work.returned',agentId:config.agentId}},f.time.now));
  assert.throws(()=>parseOperationRequest({...config,prompt:'a'.repeat(6001)},f.time.now));
});
void test('claim fixes source hash and atomic source revision fences prevent create and start after source changes',async t=>{
  const f=operationFixture();t.after(()=>f.close());const config=f.config({trigger:{kind:'work.returned',agentId:sourceId}}),binding=await f.executions.binding(f.scope,config.agentId),lease='b'.repeat(64);
  await f.service.create(f.user,config,binding,lease);f.time.now+=1;const src=await source(f);
  const parent=await f.service.command(f.user,{action:'claim',id:config.id,revision:0,lease}),active=parent.noahOperation.active;
  const job=await createNoahWork(active.jobId,{...binding,prompt:active.prompt,inputSha256:await executionInputDigest(config.agentId,active.prompt),claimSha256:'a'.repeat(64),operation:{id:config.id,sequence:1,configVersion:1,event:active.event}});
  await validateOperationRun(f.store,f.user,job);
  await f.store.update(f.user,{...src,revision:src.revision+1},src.revision);
  await assert.rejects(validateOperationRun(f.store,f.user,job),{status:409});
  assert.equal(await f.store.createNoahOperationRun(f.user,job,parent),null);
  await f.store.create(f.user,job);assert.equal(await f.store.startNoahOperationRun(f.user,{...job,revision:1},0,parent),false);
});
void test('pause, revise, explicit resume retain counters, old Work and config versions, skipping paused events',async t=>{
  const f=operationFixture();t.after(()=>f.close());const config=f.config({trigger:{kind:'work.returned',agentId:sourceId}});await f.manager.start(f.scope,config,f.client);f.time.now+=1;await source(f);await f.tick();
  const old=await f.store.listNoah(f.user,config.agentId);await f.manager.stop(f.scope,config.id,f.client);
  const saved=await change(f,config.id,'revise',{config:{...config,prompt:'revised instruction',expiresAt:f.time.now+3600000}});
  assert.equal(saved.job.noahOperation.state,'paused');assert.equal(saved.job.noahOperation.configVersion,2);assert.equal(saved.job.noahOperation.attempts,1);
  assert.deepEqual(await f.store.get(f.user,old[0].id),old[0]);
  await source(f,{text:'while paused'});await f.manager.resume(f.scope,config.id,f.client);f.time.now+=60000;await f.tick();assert.equal(f.runs.length,1);
  f.time.now+=5001;await source(f,{text:'after resume'});await f.tick();assert.equal(f.runs.length,2);assert.match(f.runs[1],/^revised instruction/);
  const op=(await f.service.get(f.user,config.id)).noahOperation;assert.equal(op.history[1].configVersion,2);assert.equal(op.configs[0].config.prompt,config.prompt);
});
void test('archive frees persisted quota, retains Work, restore is atomic and never starts a job',async t=>{
  const f=operationFixture();t.after(()=>f.close());const binding=await f.executions.binding(f.scope,f.config().agentId),lease='d'.repeat(64),configs=[];
  for(let i=0;i<20;i++){const c=f.config();configs.push(c);await f.service.create(f.user,c,binding,lease);}
  await f.manager.stop(f.scope,configs[0].id,f.client);await change(f,configs[0].id,'archive');
  assert.equal((await f.service.list(f.user)).length,19);assert.equal((await f.service.list(f.user,null,true)).length,1);
  await f.service.create(f.user,f.config(),binding,lease);await assert.rejects(change(f,configs[0].id,'restore'),{status:409});
  await f.manager.stop(f.scope,configs[1].id,f.client);await change(f,configs[1].id,'archive');
  const result=await change(f,configs[0].id,'restore');assert.equal(result.job.noahOperation.state,'paused');await f.tick();assert.equal(f.runs.length,0);
});
void test('editing uses observed revision, cannot retarget, lower used quota or hide an unknown result',async t=>{
  const f=operationFixture();t.after(()=>f.close());const config=f.config();await f.manager.start(f.scope,config,f.client);await f.tick();await f.manager.stop(f.scope,config.id,f.client);
  const stale=await f.service.get(f.user,config.id);
  await change(f,config.id,'revise',{config:{...config,prompt:'changed'}});
  await assert.rejects(f.manager.change(f.scope,config.id,'revise',{revision:stale.revision,config},f.client),{status:409});
  await assert.rejects(change(f,config.id,'revise',{config:{...config,agentId:sourceId}}),{status:400});
  const job=await f.service.get(f.user,config.id);job.noahOperation.history.at(-1).state='unknown';const rev=job.revision;job.revision++;await f.store.update(f.user,job,rev);
  await assert.rejects(change(f,config.id,'archive'),{status:409});await assert.rejects(change(f,config.id,'revise',{config}),{status:409});
});
void test('start replay returns current counts instead of cached creation snapshot',async t=>{
  const f=operationFixture();t.after(()=>f.close());const config=f.config();await f.manager.start(f.scope,config,f.client);await f.tick();
  const replay=await f.manager.start(f.scope,config,f.client);assert.equal(replay.job.noahOperation.attempts,1);
});
