import test from 'node:test';
import assert from 'node:assert/strict';
import { operationFixture } from './helpers/noah-general-operations-fixture.mjs';
import { parseOperationRequest } from '../lib/noah-operation-contract.mjs';

void test('local model reservations stop before exceeding the cumulative bound and persist across conditions',async t=>{
  let dispatched=0;
  const f=operationFixture({run:async(prompt,signal,onModel)=>{for(let n=1;n<=2;n++){await onModel(n);dispatched++;}return {text:'done',files:[],exitCode:0};}});t.after(()=>f.close());
  const input=f.config({maxRuns:5,maxModelCalls:3});await f.manager.start(f.scope,input,f.client);
  await f.tick();assert.equal(dispatched,2);f.time.now+=60001;await f.tick();
  let job=await f.service.get(f.user,input.id);
  assert.equal(dispatched,3);assert.equal(job.noahOperation.reservedModelCalls,3);assert.equal(job.noahOperation.modelBudgetSinceSequence,1);
  assert.equal(job.noahOperation.state,'exhausted');assert.equal(job.noahOperation.attempts,2);
  assert.equal((await f.store.get(f.user,job.noahOperation.history.at(-1).jobId)).noahExecution.calls,1);
  f.time.now+=60001;await f.tick();assert.equal(dispatched,3);
  await assert.rejects(f.manager.resume(f.scope,input.id,f.client),{status:409});
  await f.manager.change(f.scope,input.id,'revise',{revision:job.revision,config:{...input,maxModelCalls:5}},f.client);
  await f.manager.resume(f.scope,input.id,f.client);f.time.now+=60001;await f.tick();
  job=await f.service.get(f.user,input.id);assert.equal(dispatched,5);assert.equal(job.noahOperation.reservedModelCalls,5);assert.equal(job.noahOperation.state,'exhausted');
});
void test('reservation replay is idempotent, CAS prevents racing increments, and owner/lease/run/sequence are checked',async t=>{
  const f=operationFixture();t.after(()=>f.close());const input=f.config({maxModelCalls:2}),lease='c'.repeat(64),binding=await f.executions.binding(f.scope,input.agentId);
  await f.service.create(f.user,input,binding,lease);const claimed=await f.service.command(f.user,{id:input.id,action:'claim',revision:0,lease});
  const request={id:input.id,action:'reserveModel',revision:claimed.revision,lease,occurrenceId:claimed.noahOperation.active.jobId,modelCall:1};
  for(const change of [{lease:'d'.repeat(64)},{occurrenceId:input.id}])await assert.rejects(f.service.command(f.user,{...request,...change}),{status:403});
  await assert.rejects(f.service.command('bob',request),{status:404});
  await assert.rejects(f.service.command(f.user,{...request,modelCall:2}),{status:400});
  const race=await Promise.allSettled([f.service.command(f.user,request),f.service.command(f.user,request)]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
  let job=await f.service.get(f.user,input.id);
  const replay=await f.service.command(f.user,{...request,revision:job.revision});assert.equal(replay.noahOperation.reservedModelCalls,1);assert.equal(replay.revision,job.revision);
  await f.service.command(f.user,{...request,revision:job.revision,modelCall:2});job=await f.service.get(f.user,input.id);
  await assert.rejects(f.service.command(f.user,{...request,revision:job.revision,modelCall:3}),{status:429});
  await f.manager.stop(f.scope,input.id,f.client);assert.equal((await f.service.get(f.user,input.id)).noahOperation.reservedModelCalls,2);
});
void test('lost reservation acknowledgement never dispatches or refunds the uncertain call',async t=>{
  let dispatched=0;const f=operationFixture({run:async(p,s,onModel)=>{await onModel(1);dispatched++;return {text:'ok',files:[],exitCode:0};}});t.after(()=>f.close());
  const api=f.client.api.bind(f.client);f.client.api=async(action,input)=>{const result=await api(action,input);if(action==='reserveModel')throw Error('lost acknowledgement');return result;};
  const input=f.config({maxModelCalls:1});await f.manager.start(f.scope,input,f.client);await f.tick();
  const job=await f.service.get(f.user,input.id);assert.equal(dispatched,0);assert.equal(job.noahOperation.reservedModelCalls,1);
  assert.equal(job.noahOperation.state,'exhausted');assert.equal(job.noahOperation.succeeded,0);
});
void test('unknown historical model usage cannot be promoted to a lifetime limit',async t=>{
  const f=operationFixture({run:async(p,s,onModel)=>{await onModel(1);return {text:'ok',files:[],exitCode:0};}});t.after(()=>f.close());
  const input=f.config();await f.manager.start(f.scope,input,f.client);await f.tick();await f.manager.stop(f.scope,input.id,f.client);
  let job=await f.service.get(f.user,input.id);delete job.noahOperation.reservedModelCalls;delete job.noahOperation.modelBudgetSinceSequence;
  await f.store.update(f.user,{...job,revision:job.revision+1},job.revision);
  await f.manager.resume(f.scope,input.id,f.client);f.time.now+=60001;await f.tick();await f.manager.stop(f.scope,input.id,f.client);
  job=await f.service.get(f.user,input.id);assert.equal(job.noahOperation.modelBudgetSinceSequence,2);
  await assert.rejects(f.manager.change(f.scope,input.id,'revise',{revision:job.revision,config:{...input,maxModelCalls:3}},f.client),{status:400});
});
void test('bounds reject fractional, zero, huge and Codex-derived model counts',async t=>{
  const f=operationFixture();t.after(()=>f.close());const input=f.config();
  for(const maxModelCalls of [0,-1,0.5,1201,'3',null])assert.throws(()=>parseOperationRequest({...input,maxModelCalls},f.time.now));
  assert.equal(parseOperationRequest({...input,maxModelCalls:1},f.time.now).maxModelCalls,1);
  const binding={agentId:'research-adc2fb98c295eaf3fc52',recipe:'codex',version:'noah-codex/1',image:'sha256:'+'d'.repeat(64),model:'codex-account',provider:{name:'openai-codex',model:'test-model',version:'codex-cli 0.1.0',sha256:'e'.repeat(64),consent:'codex-account/1',metric:'provider_turns'}};
  const config={...input,agentId:binding.agentId,providerConsent:'codex-account/1'};
  await f.service.create(f.user,config,binding,'a'.repeat(64));
  const limited={...config,id:crypto.randomUUID(),maxModelCalls:1};
  await assert.rejects(f.service.create(f.user,limited,binding,'a'.repeat(64)),e=>e.status===400 && e.message.includes('Codex内部'));
});
