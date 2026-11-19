import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pixelPortableFixture } from './helpers/pixel-portable-fixture.mjs';
import { startPixelRuntimeBridge, pixelRuntimeSocketPath } from '../scripts/sky-linux-runtime-bridge.mjs';
import { executionDigest, ExecutorError } from '../packages/rockstaros-runtime/src/executor.mjs';
const schema='rockstaros.pixel-runtime-bridge/1';
void test('kernel-scoped listener bypasses a stale endpoint while keeping durable fences and same-boot exclusion',async t=>{
 const s=await setup(t),frame=await s.frame(),intent={...s.read(frame),action:'runtime-stop-intent'};
 await s.call(intent);
 const stale=pixelRuntimeSocketPath(s.dir,'11111111-2222-4333-8444-555555555555');
 await rename(s.path,stale);const prior=await stat(stale);
 const path=pixelRuntimeSocketPath(s.dir,'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
 await s.reopen(path);
 assert.equal((await call(path,frame)).error,'RUNTIME_EXECUTION_FENCED');
 assert.equal((await stat(stale)).ino,prior.ino);assert.equal((await stat(stale)).isSocket(),true);
 const current=await stat(path);
 await assert.rejects(startPixelRuntimeBridge({manager:s.f.manager,socketPath:path}),{code:'RUNTIME_SOCKET_ALREADY_PRESENT'});
 assert.equal((await stat(path)).ino,current.ino);assert.equal(s.f.counters.dispatched,0);
 for(const invalid of ['', '../runtime.sock','A'.repeat(36),'11111111-2222-4333-8444-555555555555/../runtime.sock'])
  assert.throws(()=>pixelRuntimeSocketPath(s.dir,invalid),{code:'INVALID_RUNTIME_BOOT_ID'});
});
void test('durable exact stop intent rejects a delayed start across bridge and manager restart',async t=>{
 const s=await setup(t),frame=await s.frame(),intent={...s.read(frame),action:'runtime-stop-intent'};
 assert.deepEqual(await s.call({schema,action:'runtime-stop-capabilities'}),{schema:'rockstaros.pixel-runtime-response/1',state:'stop_capabilities',protocol:1,durableExactBinding:true,contentFreeStatus:true});
 const fenced=await s.call(intent);assert.equal(fenced.fenceDurable,true);assert.equal(fenced.stopConfirmed,false);
 assert.equal((await s.call(frame)).error,'RUNTIME_EXECUTION_FENCED');
 await s.reopen();assert.equal((await s.call(frame)).error,'RUNTIME_EXECUTION_FENCED');
 assert.equal((await s.call(intent)).fenceDurable,true);
 assert.equal(s.f.counters.dispatched,0);assert.equal(s.f.manager.snapshot().runs.length,0);
});
void test('a foreign stop tuple cannot stop or reserve the identifier of an authorized job',async t=>{
 const s=await setup(t),frame=await s.frame();
 for(const patch of [{scopeSha256:'b'.repeat(64)},{claimId:crypto.randomUUID()},{requestSha256:'c'.repeat(64)}])
  assert.equal((await s.call({...s.read(frame),...patch,action:'runtime-stop-intent'})).fenceDurable,true);
 assert.equal((await s.call(frame)).state,'starting');const child=await s.f.wait();
 for(const patch of [{scopeSha256:'b'.repeat(64)},{claimId:crypto.randomUUID()},{requestSha256:'c'.repeat(64)}])
  assert.equal((await s.call({...s.read(frame),...patch,action:'runtime-stop-intent'})).fenceDurable,true);
 assert.equal(s.f.counters.stopped,0);s.f.finish(child);await waitFor(()=>s.f.manager.snapshot().runs[0].job.status==='review');
 assert.equal((await s.call(s.read(frame))).state,'review');assert.equal(s.f.counters.dispatched,1);
});
void test('stop capacity is reserved before dispatch and remains available at the journal limit',async t=>{
 const s=await setup(t),frame=await s.frame();assert.equal((await s.call(frame)).state,'starting');const child=await s.f.wait();
 for(let offset=0;offset<255;offset+=8){
  const replies=await Promise.all(Array.from({length:Math.min(8,255-offset)},()=>s.call({...s.read(frame),id:crypto.randomUUID(),action:'runtime-stop-intent'})));
  for(const value of replies)assert.equal(value.fenceDurable,true);
 }
 const second=await s.frame();assert.equal((await s.call(second)).error,'RUNTIME_STOP_JOURNAL_LIMIT');
 assert.equal(s.f.counters.dispatched,1);assert.equal((await s.call(s.read(second))).state,'not_found');
 assert.equal((await s.call({...s.read(frame),action:'runtime-stop-intent'})).fenceDurable,true);
 await waitFor(()=>s.f.counters.stopped===1);s.f.finish(child);await waitFor(()=>s.f.manager.snapshot().runs[0].stop==='confirmed');
 await s.reopen();assert.equal((await s.call(frame)).error,'RUNTIME_EXECUTION_FENCED');
 assert.equal((await s.call(second)).error,'RUNTIME_STOP_JOURNAL_LIMIT');assert.equal(s.f.counters.dispatched,1);
});
void test('a stop received during the start guard blocks dispatch, including after a lost start response',async t=>{
 const s=await setup(t),frame=await s.frame();let entered,release;
 const began=new Promise(done=>{entered=done;}),gate=new Promise(done=>{release=done;});
 s.f.setExecutionGuard(async()=>{entered();await gate;});
 const starting=s.call(frame);await began;
 assert.equal((await s.call({...s.read(frame),action:'runtime-stop-intent'})).fenceDurable,true);
 release();assert.equal((await starting).error,'RUNTIME_EXECUTION_FENCED');
 assert.equal(s.f.counters.dispatched,0);assert.equal(s.f.manager.snapshot().runs.length,0);
});
void test('a stop after task allocation but before manager authorization releases no worker',async t=>{
 const s=await setup(t),frame=await s.frame();let entered,release,calls=0;
 const began=new Promise(done=>{entered=done;}),gate=new Promise(done=>{release=done;});
 s.f.setExecutionGuard(async()=>{if(++calls===2){entered();await gate;}});
 assert.equal((await s.call(frame)).state,'starting');await began;
 assert.equal((await s.call({...s.read(frame),action:'runtime-stop-intent'})).stopConfirmed,false);
 release();await waitFor(()=>calls===2);await new Promise(done=>setTimeout(done,10));
 assert.equal(s.f.counters.dispatched,0);assert.equal((await s.call(frame)).error,'RUNTIME_EXECUTION_FENCED');
});
void test('fencing an active execution keeps stop requested until the actual worker receipt and rejects late text',async t=>{
 const s=await setup(t),frame=await s.frame();await s.call(frame);const child=await s.f.wait();
 const intent={...s.read(frame),action:'runtime-stop-intent'},first=await s.call(intent);
 assert.equal(first.fenceDurable,true);assert.equal(first.stopConfirmed,false);
 assert.deepEqual(await s.call(intent),first);await waitFor(()=>s.f.counters.stopped===1);
 s.f.finish(child);await waitFor(()=>s.f.manager.snapshot().runs[0].stop==='confirmed');
 const result=await s.call(s.read(frame));assert.equal(result.state,'unknown');assert.equal(result.stopConfirmed,true);assert.equal(result.text,null);
 await s.reopen();assert.equal((await s.call(frame)).error,'RUNTIME_EXECUTION_FENCED');
 assert.equal((await s.call(s.read(frame))).text,null);assert.equal(s.f.counters.dispatched,1);
});
void test('stop status exposes no model, prompt or result, before and after execution',async t=>{
 const s=await setup(t),frame=await s.frame(),status={...s.read(frame),action:'runtime-stop-status'};
 const absent=await s.call(status);assert.equal(absent.state,'stop_absent');assert.equal(absent.fenceDurable,false);
 assert.equal((await s.call(frame)).state,'starting');const child=await s.f.wait();s.f.finish(child);await waitFor(()=>s.f.manager.snapshot().runs[0].job.status==='review');
 const finished=await s.call(status);assert.equal(finished.state,'stop_finished');
 assert.deepEqual(Object.keys(finished).sort(),['schema','state','id','claimId','requestSha256','fenceDurable','stopConfirmed'].sort());
 assert.doesNotMatch(JSON.stringify(finished),/合成のPixel成果|model|text|input|owner/);
 assert.equal((await s.call({...status,action:'runtime-stop-intent'})).fenceDurable,true);
 assert.equal((await s.call(status)).fenceDurable,true);assert.equal(s.f.counters.dispatched,1);
});
void test('maintenance rejects start before allocating a task or worker; scoped reads remain available',async t=>{
 const s=await setup(t),frame=await s.frame();
 s.f.setExecutionGuard(()=>{throw new ExecutorError('PIXEL_UPDATE_PENDING');});
 assert.equal((await s.call(frame)).error,'PIXEL_UPDATE_PENDING');
 assert.equal((await s.call(s.read(frame))).state,'not_found');
 assert.equal(s.f.counters.dispatched,0);assert.equal(s.f.manager.snapshot().runs.length,0);
 s.f.setExecutionGuard(null);
 assert.equal((await s.call(frame)).state,'starting');const child=await s.f.wait();s.f.finish(child);
 await waitFor(()=>s.f.manager.snapshot().runs[0].job.status==='review');assert.equal(s.f.counters.dispatched,1);
});
async function rawCall(path,bytes) {
  return new Promise((done,fail)=>{
    const socket=connect(path);let body='';socket.setTimeout(15000,()=>socket.destroy(Error('fixture timeout')));
    socket.once('connect',()=>socket.write(bytes));socket.on('data',chunk=>{body+=chunk;if(body.length>120000)socket.destroy(Error('fixture overflow'));});
    socket.once('error',fail);socket.once('end',()=>{try{done(JSON.parse(body));}catch(error){fail(error);}});
  });
}
const call=(path,value)=>rawCall(path,JSON.stringify(value)+'\n');
const waitFor=async f=>{for(let i=0;i<200&&!f();i++)await new Promise(done=>setTimeout(done,2));assert.ok(f());};
async function setup(t) {
 const f=await pixelPortableFixture(t),dir=await mkdtemp('/private/tmp/pbr-'),path=join(dir,'runtime.sock');
 let bridge=await startPixelRuntimeBridge({manager:f.manager,socketPath:path});
 t.after(async()=>{await bridge.close();await rm(dir,{recursive:true,force:true});});
 const frame=async(request=f.request())=>{
  const requestSha256=await executionDigest(request),scopeSha256='a'.repeat(64),claimId=crypto.randomUUID();
  return {schema,action:'runtime-start',request,requestSha256,scopeSha256,claimId,authorization:{scopeSha256,jobId:request.id,requestSha256,executorId:'pixel-linux-gguf',permission:'text.generate',maximumCostMinor:0,expiresAt:request.deadline}};
 };
 const read=c=>({schema,action:'runtime-read',id:c.request.id,scopeSha256:c.scopeSha256,claimId:c.claimId,requestSha256:c.requestSha256});
 return {...f, f, dir,path,frame,read,call:value=>call(path,value),async reopen(nextPath=path){await bridge.close();await f.reopen();bridge=await startPixelRuntimeBridge({manager:f.manager,socketPath:nextPath});}};
}
void test('private runtime socket has owner-only mode, performs one existing manager job and retains scoped result across restart',async t=>{
 const s=await setup(t),frame=await s.frame();
 assert.equal((await stat(s.dir)).mode&0o777,0o700);assert.equal((await stat(s.path)).mode&0o777,0o600);
 const caps=await s.call({schema,action:'runtime-capabilities'});assert.equal(caps.scopedExecution,true);assert.equal(caps.worker.protocol,1);
 assert.equal((await s.call(frame)).state,'starting');const child=await s.f.wait();
 assert.equal((await s.call(frame)).state,'running');s.f.finish(child);await waitFor(()=>s.f.manager.snapshot().runs[0].job.status==='review');
 const result=await s.call(s.read(frame));assert.equal(result.state,'review');assert.equal(result.outputSha256,await executionDigest(result.text));assert.equal(result.claimId,frame.claimId);
 assert.equal(s.f.counters.dispatched,1);await s.reopen();assert.deepEqual(await s.call(s.read(frame)),result);
 assert.equal(s.f.counters.dispatched,1);
});
void test('different owner scope or claim cannot read, stop, join or overwrite a persisted common job',async t=>{
 const s=await setup(t),frame=await s.frame();await s.call(frame);const child=await s.f.wait();s.f.finish(child);await waitFor(()=>s.f.manager.snapshot().runs[0].job.status==='review');
 for(const patch of [{scopeSha256:'b'.repeat(64)},{claimId:crypto.randomUUID()},{requestSha256:'c'.repeat(64)}]){
  assert.deepEqual(await s.call({...s.read(frame),...patch}),{schema:'rockstaros.pixel-runtime-response/1',state:'not_found'});
  assert.equal((await s.call({...s.read(frame),...patch,action:'runtime-cancel'})).state,'not_found');
 }
 const other={...frame,scopeSha256:'b'.repeat(64),authorization:{...frame.authorization,scopeSha256:'b'.repeat(64)}};
 assert.equal((await s.call(other)).error,'REQUEST_ID_CONFLICT');
 await assert.rejects(s.f.manager.executeText(frame.request,undefined,{scopeSha256:'b'.repeat(64),claimId:frame.claimId}),{code:'REQUEST_ID_CONFLICT'});
 assert.equal(s.f.counters.dispatched,1);assert.equal(s.f.counters.stopped,0);
});
void test('private relay rejects broad permissions, nonzero cost, changed digest and credentials before dispatch',async t=>{
 const s=await setup(t),frame=await s.frame();
 for(const bad of [
  {...frame,accessToken:'NEVER_FORWARD_TOKEN'},
  {...frame,authorization:{...frame.authorization,permission:'shell'}},
  {...frame,authorization:{...frame.authorization,maximumCostMinor:1}},
  {...frame,authorization:{...frame.authorization,expiresAt:frame.request.deadline+1}},
  {...frame,request:{...frame.request,input:'changed'}},
 ]){const result=await s.call(bad);assert.ok(result.error);assert.doesNotMatch(JSON.stringify(result),/NEVER_FORWARD_TOKEN|changed/);}
 assert.equal(s.f.counters.dispatched,0);
 assert.equal((await rawCall(s.path,'x'.repeat(24001))).error,'RUNTIME_BRIDGE_FRAME_TOO_LARGE');
 await assert.rejects(startPixelRuntimeBridge({manager:s.f.manager,socketPath:s.path}),{code:'RUNTIME_SOCKET_ALREADY_PRESENT'});
});
void test('cancel is a request until the existing worker stop is confirmed; late text is never returned',async t=>{
 const s=await setup(t),frame=await s.frame();await s.call(frame);const child=await s.f.wait();
 const cancelled=await s.call({...s.read(frame),action:'runtime-cancel'});assert.equal(cancelled.state,'cancel_requested');assert.equal(cancelled.stopConfirmed,false);
 await waitFor(()=>s.f.counters.stopped===1);s.f.finish(child);await waitFor(()=>s.f.manager.snapshot().runs[0].stop==='confirmed');
 const result=await s.call(s.read(frame));assert.equal(result.state,'unknown');assert.equal(result.stopConfirmed,true);assert.equal(result.text,null);
 assert.equal(s.f.counters.dispatched,1);
});
void test('Python mTLS client routes runtime commands through the private socket without posting them to HTTP',async t=>{
 const s=await setup(t),frame=await s.frame();
 const code=`import importlib.util,json,sys\nfrom pathlib import Path\ns=importlib.util.spec_from_file_location('bridge','toolkits/sky-linux-local/android-bridge.py')\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nm.ROOT=Path(sys.argv[1])\nm.runtime_socket_path=lambda:m.ROOT/'runtime.sock'\nm.urllib.request.Request=lambda *a,**k:(_ for _ in ()).throw(AssertionError('HTTP forbidden'))\nprint(json.dumps(m.request(json.load(sys.stdin))))`;
 const child=spawn('python3',['-c',code,s.dir],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 child.stdin.end(JSON.stringify(frame));const exit=await new Promise(done=>child.on('exit',done));assert.equal(exit,0,stderr);assert.equal(JSON.parse(stdout).state,'starting');
 const pending=await s.f.wait();s.f.finish(pending);await waitFor(()=>s.f.manager.snapshot().runs[0].job.status==='review');assert.equal((await s.call(s.read(frame))).state,'review');
});

void test('private agent preparation keeps exact ID/digest across restart without execution or download', async t => {
 const s=await setup(t),recipe={name:'新しい目的の担当',instructions:'本人の目的に合わせて下書きを作る。',modelId:s.f.model.id};
 const request={id:crypto.randomUUID(),threadId:crypto.randomUUID(),agent:{id:crypto.randomUUID(),...recipe,sha256:await executionDigest(JSON.stringify(recipe))},model:{id:s.f.model.id,scheme:'gguf-sha256',sha256:s.f.model.sha256},deadline:Date.now()+60000};
 const scopeSha256='ab'.repeat(32),requestSha256=await executionDigest(request),frame={schema,action:'runtime-agent-prepare',request,scopeSha256,claimId:crypto.randomUUID(),requestSha256,authorization:{scopeSha256,preparationId:request.id,requestSha256,permission:'agent.prepare',maximumCostMinor:0,expiresAt:request.deadline}};
 assert.deepEqual(await s.call({schema,action:'runtime-agent-capabilities'}),{schema:'rockstaros.pixel-runtime-response/1',state:'agent_capabilities',protocol:1,pinnedAgentPreparation:true,downloads:false});
 for(const patch of [{permission:'text.generate'},{scopeSha256:'ef'.repeat(32)},{maximumCostMinor:1},{preparationId:crypto.randomUUID()},{expiresAt:request.deadline+1}])assert.equal((await s.call({...frame,authorization:{...frame.authorization,...patch}})).error,'RUNTIME_AUTHORIZATION_BINDING_MISMATCH');
 assert.equal(s.f.manager.snapshot().agents.length,1);
 const result=await s.call(frame);assert.equal(result.state,'agent_prepared');assert.deepEqual(result.agent,request.agent);assert.equal(result.requestSha256,requestSha256);
 await s.reopen();assert.deepEqual(await s.call(frame),result);
 assert.equal(s.f.manager.snapshot().agents.length,2);assert.equal(s.f.manager.snapshot().runs.length,0);assert.equal(s.f.counters.dispatched,0);
 assert.equal((await s.call({...frame,request:{...request,threadId:crypto.randomUUID()}})).error,'COMMAND_DIGEST_MISMATCH');
});

void test('same fenced cancelled run can retry an unconfirmed physical stop without another execution',async t=>{
 const s=await setup(t),frame=await s.frame();s.f.setStopConfirmed(false);await s.call(frame);const child=await s.f.wait();
 const intent={...s.read(frame),action:'runtime-stop-intent'};await s.call(intent);s.f.finish(child);
 await waitFor(()=>s.f.manager.snapshot().runs[0].stop==='unconfirmed');
 const stopped=s.f.counters.stopped;s.f.setStopConfirmed(true);await s.call(intent);
 const status=await s.call({...intent,action:'runtime-stop-status'});assert.equal(status.state,'stop_confirmed');assert.equal(s.f.counters.stopped,stopped+1);assert.equal(s.f.counters.dispatched,1);
});
