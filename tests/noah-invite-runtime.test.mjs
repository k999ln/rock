import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { inviteRuntimeFixture } from './helpers/noah-invite-runtime-fixture.mjs';
import { resolveNoahInviteExecution } from '../lib/noah-invite-execution.ts';
import { validateNoahExecutionSource } from '../lib/noah-execution-source.ts';
import { createNoahWork, executionInputDigest } from '../lib/noah-execution.ts';
import { createNoahInstanceService } from '../lib/noah-instances.ts';
import { createTerminalInstallations } from '../scripts/noah-terminal-installations.mjs';
import { createExecutionManager } from '../scripts/noah-executions.mjs';
import { runWithInviteGrant } from '../scripts/noah-invite-loader.mjs';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { noahUsageReport } from '../lib/noah-usage.ts';
const settle=async fn=>{for(let n=0;n<400;n++){if(await fn())return;await delay(10);}assert.fail('did not settle');};

void test('source retrieval never grants execution implicitly; grants require a terminal definition and source scope',async t=>{
 const f=await inviteRuntimeFixture();t.after(f.close);
 const v=await f.issue({executionAllowed:false});assert.equal((await f.claim(v)).status,200);
 assert.equal((await f.api.download(await f.request('buyer-fixture'),v.id)).status,200);
 await assert.rejects(resolveNoahInviteExecution(f.db,'buyer-fixture',v.id),e=>e.status===403);
 await assert.rejects((await f.loader(v))(true),e=>e.status===403);
 for(const patch of [{access:'view',executionAllowed:true},{executionAllowed:'true'}]) {
  const r=await f.api.create(await f.request('author-fixture','POST',{...v,agentId:f.id,id:randomUUID(),...patch}));assert.equal(r.status,400);
 }
 const manifest=structuredClone(f.template.manifest);delete manifest.runtime;
 f.sqlite.prepare('UPDATE noah_agent_uploads SET manifest=? WHERE id=?').run(JSON.stringify(manifest),f.id);
 await assert.rejects(f.issue(),/実行定義/);
 assert.throws(()=>f.sqlite.prepare("UPDATE noah_agent_invites SET access_scope='view',execution_allowed=1").run(),/CHECK/);
});
void test('claim, designated recipient, source hash, revision, expiry and revocation gate the exact runnable grant',async t=>{
 const f=await inviteRuntimeFixture();t.after(f.close);const v=await f.issue();
 await assert.rejects(resolveNoahInviteExecution(f.db,'buyer-fixture',v.id),e=>e.status===403);
 assert.equal((await f.claim(v,'outsider')).status,404);assert.equal((await f.claim(v)).status,200);
 const agent=await resolveNoahInviteExecution(f.db,'buyer-fixture',v.id);assert.equal(agent.invite.sourceSha256,f.hash);
 assert.equal((await(await f.loader(v))(true)).bytes.length,f.template.bytes.length);
 await assert.rejects(resolveNoahInviteExecution(f.db,'buyer-fixture',v.id,()=>v.expiresAt),e=>e.status===403);
 f.sqlite.prepare('UPDATE noah_agent_invites SET recipient_id=? WHERE id=?').run('other',v.id);
 assert.equal((await f.api.get(await f.request('buyer-fixture'),v.id)).status,404);
 await assert.rejects(resolveNoahInviteExecution(f.db,'buyer-fixture',v.id),e=>e.status===403);
 f.sqlite.prepare('UPDATE noah_agent_invites SET recipient_id=? WHERE id=?').run('buyer-fixture',v.id);
 f.onRead(()=>f.revoke(v));await assert.rejects((await f.loader(v))(true));
});
void test('Work records one fixed invite binding, rejects privilege substitution and leaves author unable to read results',async t=>{
 const f=await inviteRuntimeFixture();t.after(f.close);const v=await f.issue();await f.claim(v);let runs=0;
 const terminals=createTerminalInstallations({root:'/unused',prepare:async()=>({execution:{image:'sha256:'+'a'.repeat(64)},run:async(_p,_s,onModel)=>{runs++;await onModel(1);return {text:'private result',files:[],exitCode:0};},stop:async()=>{}})});
 const manager=createExecutionManager(terminals);t.after(async()=>{await manager.close();await terminals.close();});
 const scope=await ownerScopeFor('buyer-fixture');await terminals.connect(scope,v.agentId,await f.loader(v));await settle(async()=>(await terminals.get(scope,v.agentId)).state==='connected');
 const input={id:randomUUID(),agentId:v.agentId,prompt:'Private synthetic task'};
 await Promise.all(Array.from({length:5},()=>manager.start(scope,input,f.work(),async()=>{})));
 const {job}=await manager.wait(scope,input.id,f.work());assert.equal(job.noahExecution.state,'returned');assert.equal(runs,1);
 const binding=await manager.binding(scope,v.agentId);assert.equal(binding.invite.inviteId,v.id);assert.equal(binding.source,undefined);assert.equal(binding.release,undefined);
 const request={...binding,prompt:input.prompt,inputSha256:await executionInputDigest(v.agentId,input.prompt),claimSha256:'a'.repeat(64)};
 for(const patch of [{source:{uploadId:f.id}},{release:{}},{provider:{}},{invite:{...binding.invite,revision:0}}]) await assert.rejects(createNoahWork(randomUUID(),{...request,...patch}));
 await assert.rejects(validateNoahExecutionSource(f.deps,'outsider',job.noahExecution),e=>e.status===403);
 await assert.rejects(validateNoahExecutionSource(f.deps,'buyer-fixture',{...job.noahExecution,invite:{...binding.invite,revision:2}}),e=>e.status===409);
 assert.equal(await f.jobs.get('author-fixture',input.id),null);
 await f.revoke(v);
 await assert.rejects(manager.start(scope,{...input,id:randomUUID()},f.work(),async()=>{}));
 const usage=await noahUsageReport(f.db,'author-fixture',{scope:'publisher'}),local=usage.sources.find(s=>s.source==='local_agent');
 assert.equal(local.metrics.runs,1);assert.equal(local.metrics.knownCostRuns,0);assert.equal(local.agents[0].agentRef,'noah-upload:'+f.id);
 assert.ok(!JSON.stringify(usage).includes('private result'));assert.ok(!JSON.stringify(usage).includes('Private synthetic task'));
});
void test('background grant monitor aborts and awaits process teardown without a visible page; user stop stays distinct',async()=>{
 let valid=true,active=0,peak=0,closed=false,checks=0;
 const revalidate=async()=>{active++;peak=Math.max(peak,active);checks++;await delay(5);active--;if(!valid)throw new Error('revoked');};
 const run=async({signal})=>{try{await delay(3000,null,{signal});}finally{await delay(5);closed=true;}};
 const task=runWithInviteGrant({run,revalidate,expiresAt:Date.now()+5000,input:{},intervalMs:10});
 setTimeout(()=>{valid=false;},25);await assert.rejects(task,/revoked/);assert.equal(peak,1);assert.equal(active,0);assert.equal(closed,true);
 const stopped=checks;await delay(30);assert.equal(checks,stopped);
 const c=new AbortController();const user=runWithInviteGrant({run,revalidate:async()=>{},expiresAt:Date.now()+5000,input:{signal:c.signal},intervalMs:10});setTimeout(()=>c.abort(),15);await assert.rejects(user,e=>e.name==='AbortError');
});
void test('deadline abort works even while a slow authority read is pending and expired grants never start',async()=>{
 let reads=0,closed=false;
 const expiresAt=Date.now()+50;
 const task=runWithInviteGrant({expiresAt,input:{},intervalMs:5,revalidate:async()=>{if(++reads>1)await delay(100);},run:async({signal})=>{try{await delay(2000,null,{signal});}finally{closed=true;}}});
 await assert.rejects(task,/有効期限/);assert.equal(closed,true);
 let runs=0;await assert.rejects(runWithInviteGrant({expiresAt:Date.now()-1,input:{},revalidate:async()=>{},run:async()=>{runs++;}}),/有効期限/);assert.equal(runs,0);
});
void test('live invite revocation fails the active Work and stops its runner with no browser polling',async t=>{
 const f=await inviteRuntimeFixture();t.after(f.close);const v=await f.issue();await f.claim(v);let started=false,closed=false;
 const terminals=createTerminalInstallations({root:'/unused',prepare:async()=>({execution:{image:'sha256:'+'a'.repeat(64)},run:async(_p,signal)=>{started=true;try{await delay(10000,null,{signal});}finally{closed=true;}},stop:async()=>{}})});
 const manager=createExecutionManager(terminals);t.after(async()=>{await manager.close();await terminals.close();});
 const scope=await ownerScopeFor('buyer-fixture');await terminals.connect(scope,v.agentId,await f.loader(v));await settle(async()=>(await terminals.get(scope,v.agentId)).state==='connected');
 const input={id:randomUUID(),agentId:v.agentId,prompt:'wait in background'};await manager.start(scope,input,f.work(),async()=>{});await settle(()=>started);await f.revoke(v);
 const {job}=await manager.wait(scope,input.id,f.work());assert.equal(job.noahExecution.state,'failed');assert.equal(closed,true);assert.notEqual(job.noahExecution.state,'cancelled');
});
void test('library pin includes live invitation authority; revoked rollback and source replacement cannot be selected',async t=>{
 const f=await inviteRuntimeFixture();t.after(f.close);f.sqlite.exec(readFileSync(new URL('../drizzle/0038_noah_instances.sql',import.meta.url),'utf8'));
 const v=await f.issue();await f.claim(v);const service=createNoahInstanceService(f.deps),owner='buyer-fixture';
 const {pins}=await service.candidates(owner,v.agentId);assert.equal(pins.length,1);const pin=pins[0];assert.equal(pin.kind,'invite');assert.equal(pin.invite.expiresAt,v.expiresAt);
 const prepared=await service.prepare(owner,{id:randomUUID(),revision:0,commandId:randomUUID(),agentId:v.agentId,digest:pin.digest,claimSha256:'a'.repeat(64),replacePending:false});assert.equal(prepared.pending.pin.digest,pin.digest);
 f.sqlite.prepare('UPDATE noah_agent_uploads SET source_sha256=? WHERE id=?').run('c'.repeat(64),f.id);await assert.rejects(service.candidates(owner,v.agentId));
 f.sqlite.prepare('UPDATE noah_agent_uploads SET source_sha256=? WHERE id=?').run(f.hash,f.id);await f.revoke(v);await assert.rejects(service.prepare(owner,{id:prepared.id,revision:prepared.revision,commandId:randomUUID(),agentId:v.agentId,digest:pin.digest,claimSha256:'a'.repeat(64),replacePending:true}));
});
