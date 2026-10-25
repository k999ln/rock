import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLinuxLocalManager} from '../scripts/sky-linux-local-runtime.mjs';
const {model}=JSON.parse(await readFile(new URL('../toolkits/sky-linux-local/runtime-lock.json',import.meta.url)));
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'pixel-cache-test-'));let calls=0,release,fail=false;
 const environment={id:'pixel-linux',bootId:'first',spawn(){assert.fail('no inference or shell');},async stop(){},
  async inspectCached(lock){if(fail)throw Error('missing');return {id:lock.model.id,sha256:lock.model.sha256,bytes:lock.model.bytes,state:'verified',cacheOnly:true,downloads:false};},
  async prepare(lock,worker,{signal,cacheOnly}){assert.equal(cacheOnly,true);calls++;await new Promise(resolve=>{release=resolve;signal.addEventListener('abort',resolve,{once:true});});return {ready:true,platform:'linux',architecture:'aarch64',modelSha256:lock.model.sha256,cacheOnly:true,downloads:false,workerProtocol:1};}};
 const manager=await createLinuxLocalManager({stateDir:dir,environment});await manager.action({action:'add-model',modelId:model.id,accepted:true});
 t.after(async()=>{release?.();await manager.close();await rm(dir,{recursive:true,force:true});});
 const command={action:'prepare-cached',cacheOnly:true,accepted:true,modelId:model.id,modelSha256:model.sha256,requestId:randomUUID(),scopeSha256:'a'.repeat(64)};
 return {manager,environment,command,dir,get calls(){return calls;},release(){release();},fail(){fail=true;}};
}
const settled=async manager=>{for(let i=0;i<200&&(manager.snapshot().phase==='preparing'||manager.snapshot().cachePreparation?.state==='preparing');i++)await new Promise(r=>setTimeout(r,2));assert.notEqual(manager.snapshot().phase,'preparing');};
void test('read-only cache inventory never prepares; unavailable stays unavailable without fallback',async t=>{
 const f=await fixture(t),before=await readFile(join(f.dir,'state.json'),'utf8');
 const result=await f.manager.action({action:'cache-inventory',cacheOnly:true});assert.equal(result.cacheOnlyProtocol,2);assert.equal(result.cacheInventory[0].sha256,model.sha256);assert.equal(f.calls,0);assert.equal(await readFile(join(f.dir,'state.json'),'utf8'),before);
 f.fail();assert.equal((await f.manager.action({action:'cache-inventory',cacheOnly:true})).cacheInventory[0].state,'unavailable');assert.equal(f.calls,0);
});
void test('dedicated pinned preparation is durable and replay never starts again',async t=>{
 const f=await fixture(t),before=f.manager.snapshot();const result=await f.manager.action(f.command);assert.equal(result.cachePreparation.state,'preparing');assert.equal(f.calls,1);
 assert.equal(JSON.parse(await readFile(join(f.dir,'state.json'),'utf8')).cachePreparation.requestId,f.command.requestId);
 await assert.rejects(f.manager.action({...f.command,requestId:randomUUID()}),/BUSY/);
 f.release();await settled(f.manager);const after=f.manager.snapshot();assert.equal(after.cachePreparation.state,'ready');assert.ok(after.preparedModels.includes(model.id));assert.deepEqual(after.agents,before.agents);assert.deepEqual(after.runs,before.runs);
 await f.manager.action(f.command);assert.equal(f.calls,1);
 await assert.rejects(f.manager.action({...f.command,scopeSha256:'b'.repeat(64)}),/BINDING/);
});
void test('changed pin, unknown fields or cache-only downgrade cannot prepare',async t=>{
 const f=await fixture(t);
 for(const patch of [{cacheOnly:false},{modelSha256:'b'.repeat(64)},{accepted:false},{shell:'no'},{requestId:'invalid'},{scopeSha256:'invalid'}]) await assert.rejects(f.manager.action({...f.command,...patch}));
 assert.equal(f.calls,0);assert.equal(f.manager.snapshot().phase,'added');
});
void test('cancellation binds the same session operation and does not stop jobs/environment',async t=>{
 const f=await fixture(t);await f.manager.action(f.command);const {accepted,...cancel}={...f.command,action:'cancel-cached-prepare'};void accepted;
 await assert.rejects(f.manager.action({...cancel,scopeSha256:'b'.repeat(64)}),/BINDING/);
 const result=await f.manager.action(cancel);assert.equal(result.cachePreparation.state,'stopped');assert.equal(result.phase,'stopped');assert.deepEqual(result.preparedModels,[]);assert.equal(f.calls,1);
 await f.manager.action(f.command);assert.equal(f.calls,1);
});
void test('old environment ABI cannot silently call the normal prepare contract',async t=>{
 const f=await fixture(t);delete f.environment.inspectCached;await assert.rejects(f.manager.action(f.command),/PROTOCOL/);assert.equal(f.calls,0);
});

void test('interrupted preparation remains unknown after manager restart and cannot auto-reprepare',async t=>{
 const f=await fixture(t);await f.manager.close();
 const path=join(f.dir,'state.json'),state=JSON.parse(await readFile(path,'utf8'));
 state.phase='preparing';state.cachePreparation={...f.command,state:'preparing'};await writeFile(path,JSON.stringify(state));
 const reopened=await createLinuxLocalManager({stateDir:f.dir,environment:f.environment});
 try{assert.equal(reopened.snapshot().cachePreparation.state,'unknown');assert.equal(reopened.snapshot().phase,'failed');
  await assert.rejects(reopened.action({...f.command,requestId:randomUUID()}),/UNKNOWN/);assert.equal(f.calls,0);
 }finally{await reopened.close();}
});

void test('A/B/A and changed displaced bindings never erase durable replay protection, including restart',async t=>{
 const f=await fixture(t),a=f.command,b={...a,requestId:randomUUID()};
 for(const command of [a,b]){await f.manager.action(command);f.release();await settled(f.manager);}
 const result=await f.manager.action(a);assert.equal(result.cachePreparation.requestId,a.requestId);assert.equal(result.cachePreparation.state,'ready');assert.equal(result.cachePreparation.result.modelSha256,model.sha256);assert.equal(f.calls,2);
 const originalResult=structuredClone(result.cachePreparation.result);result.cachePreparation.result.state='tampered-copy';
 assert.deepEqual((await f.manager.action(a)).cachePreparation.result,originalResult);
 for(const patch of [{scopeSha256:'c'.repeat(64)},{modelSha256:'d'.repeat(64)},{modelId:'changed'}])await assert.rejects(f.manager.action({...a,...patch}),/BINDING/);
 await f.manager.close();const reopened=await createLinuxLocalManager({stateDir:f.dir,environment:f.environment});
 try{for(const command of [a,b]){const restored=(await reopened.action(command)).cachePreparation;assert.equal(restored.state,'ready');assert.deepEqual(restored.result,originalResult);}
  assert.equal((await reopened.action({...a,action:'cache-status',accepted:undefined}).catch(()=>null)),null); // Exact field schema, no undefined bypass.
  const {accepted,...read}={...a,action:'cache-status'};void accepted;
  assert.equal((await reopened.action(read)).cachePreparation.requestId,a.requestId);assert.equal(f.calls,2);
 }finally{await reopened.close();}
});
void test('simultaneous same-ID attempts allocate one preparation and retain the original outcome',async t=>{
 const f=await fixture(t),results=await Promise.allSettled([f.manager.action(f.command),f.manager.action(f.command)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.calls,1);f.release();await settled(f.manager);
 await f.manager.action(f.command);assert.equal(f.calls,1);
});
void test('bounded history is never evicted; full history rejects new IDs and keeps old readback',async t=>{
 const f=await fixture(t);await f.manager.close();const path=join(f.dir,'state.json'),state=JSON.parse(await readFile(path,'utf8'));
 const entry={requestId:f.command.requestId,scopeSha256:f.command.scopeSha256,modelId:model.id,modelSha256:model.sha256,state:'failed',cacheOnly:true};
 state.cachePreparations.entries=Object.fromEntries(Array.from({length:256},(_,i)=>{const id=i===0?entry.requestId:randomUUID();return [id,{...entry,requestId:id}];}));
 await writeFile(path,JSON.stringify(state));const reopened=await createLinuxLocalManager({stateDir:f.dir,environment:f.environment});
 try{await assert.rejects(reopened.action({...f.command,requestId:randomUUID()}),/HISTORY_FULL/);
  assert.equal((await reopened.action(f.command)).cachePreparation.state,'failed');assert.equal(f.calls,0);
 }finally{await reopened.close();}
});
void test('legacy single-entry state is explicitly incomplete and cannot silently replay displaced IDs',async t=>{
 const f=await fixture(t);await f.manager.close();const path=join(f.dir,'state.json'),state=JSON.parse(await readFile(path,'utf8'));
 delete state.cachePreparations;state.cachePreparation={requestId:f.command.requestId,scopeSha256:f.command.scopeSha256,modelId:model.id,modelSha256:model.sha256,state:'ready',cacheOnly:true};
 await writeFile(path,JSON.stringify(state));const reopened=await createLinuxLocalManager({stateDir:f.dir,environment:f.environment});
 try{assert.equal((await reopened.action(f.command)).cachePreparation.state,'ready');
  await assert.rejects(reopened.action({...f.command,requestId:randomUUID()}),/HISTORY_RECONCILIATION/);assert.equal(f.calls,0);
 }finally{await reopened.close();}
});
void test('a displaced operation cancel cannot stop the current different operation or rewrite its terminal outcome',async t=>{
 const f=await fixture(t),a=f.command,b={...a,requestId:randomUUID()};await f.manager.action(a);f.release();await settled(f.manager);await f.manager.action(b);
 const {accepted,...cancelA}={...a,action:'cancel-cached-prepare'};void accepted;
 const old=await f.manager.action(cancelA);assert.equal(old.cachePreparation.requestId,a.requestId);assert.equal(old.cachePreparation.state,'ready');assert.equal(f.manager.snapshot().cachePreparation.requestId,b.requestId);assert.equal(f.manager.snapshot().phase,'preparing');
 const {accepted:ignored,...cancelB}={...b,action:'cancel-cached-prepare'};void ignored;
 assert.equal((await f.manager.action(cancelB)).cachePreparation.state,'stopped');assert.equal((await f.manager.action(a)).cachePreparation.state,'ready');assert.equal(f.calls,2);
});

// Fault injection changes only built-in fs bindings during this serial test file.
// No production testing hook, network, service process or model is introduced.
const fs = (await import('node:fs/promises')).default;
const {syncBuiltinESMExports} = await import('node:module');
const {beginLinuxRun} = await import('../lib/sky-linux-local.ts');
const {pixelUpdateGuard} = await import('../toolkits/sky-linux-local/pixel-update-guard.mjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function pendingUpdate(f,state='staged'){
 const id='c'.repeat(64)+'-'+'d'.repeat(32),dir=join(f.dir,'updates',id);
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 await writeFile(join(dir,'receipt.json'),JSON.stringify({schema:'sky.pixel-guest-update/1',id,state}),{mode:0o600});
 await writeFile(join(f.dir,'update-transaction.json'),JSON.stringify({id}),{mode:0o600});
}
function interceptSync(file,mode='wait'){
 const original=fs.open,entered=deferred(),release=deferred();let used=false;
 fs.open=async(...args)=>{const handle=await original(...args);
  if(String(args[0])===file&&args[1]==='r'&&!used){used=true;const sync=handle.sync.bind(handle);handle.sync=async()=>{entered.resolve();if(mode==='fail')throw Error('synthetic fsync failure');await release.promise;return sync();};}
  return handle;};syncBuiltinESMExports();
 return {entered:entered.promise,release:release.resolve,restore(){fs.open=original;syncBuiltinESMExports();}};
}
void test('pending update fences legacy/cache effects but retains status and emergency stop',async t=>{
 const f=await fixture(t);f.environment.assertExecutionAllowed=pixelUpdateGuard(f.dir);await pendingUpdate(f);
 for(const command of [f.command,{action:'prepare',modelId:model.id,accepted:true},{action:'cache-inventory',cacheOnly:true}])
  await assert.rejects(f.manager.action(command),{code:'PIXEL_UPDATE_PENDING'});
 assert.equal((await f.manager.action({action:'status'})).models.length,1);
 await f.manager.action({action:'stop-environment'});assert.equal(f.manager.snapshot().phase,'stopped');assert.equal(f.calls,0);
});
void test('update published while request fsync waits emits zero cache effects',async t=>{
 const f=await fixture(t);f.environment.assertExecutionAllowed=pixelUpdateGuard(f.dir);
 const io=interceptSync(join(f.dir,'state.json'));
 try{const attempt=f.manager.action(f.command);await io.entered;assert.equal(f.calls,0);
  assert.equal(f.manager.snapshot().phase,'preparing');await pendingUpdate(f);io.release();
  await assert.rejects(attempt,{code:'PIXEL_UPDATE_PENDING'});assert.equal(f.calls,0);
  assert.equal(f.manager.snapshot().cachePreparation.state,'unknown');
 }finally{io.release();io.restore();}
});
void test('terminal fsync remains nonterminal; a newly published update cannot yield ready',async t=>{
 const f=await fixture(t);f.environment.assertExecutionAllowed=pixelUpdateGuard(f.dir);await f.manager.action(f.command);
 const io=interceptSync(join(f.dir,'state.json'));
 try{f.release();await io.entered;assert.equal(f.manager.snapshot().cachePreparation.state,'preparing');
  assert.notEqual(f.manager.snapshot().phase,'stopped');await pendingUpdate(f);io.release();await settled(f.manager);
  assert.equal(f.manager.snapshot().cachePreparation.state,'unknown');assert.equal(f.calls,1);
 }finally{io.release();io.restore();}
});
void test('request and terminal fsync failures never expose successful replay',async t=>{
 const f=await fixture(t);let io=interceptSync(join(f.dir,'state.json'),'fail');
 try{await assert.rejects(f.manager.action(f.command),/CACHE_REQUEST_SAVE_UNCONFIRMED/);assert.equal(f.calls,0);
  assert.equal(f.manager.snapshot().cachePreparation.state,'unknown');
  assert.equal(JSON.parse(await readFile(join(f.dir,'state.json'))).cachePreparation.state,'unknown');
 }finally{io.restore();}
 const g=await fixture(t);await g.manager.action(g.command);io=interceptSync(join(g.dir,'state.json'),'fail');
 try{g.release();await settled(g.manager);assert.equal(g.manager.snapshot().cachePreparation.state,'unknown');
  assert.equal(JSON.parse(await readFile(join(g.dir,'state.json'))).cachePreparation.state,'unknown');
  await assert.rejects(g.manager.action({...g.command,requestId:randomUUID()}),/BUSY/);
 }finally{io.restore();}
});
void test('close during asynchronous initial or post-fsync guard dispatches no late preparation',async t=>{
 for(const stopAt of [1,2]){const f=await fixture(t),entered=deferred(),release=deferred();let checks=0;
  f.environment.assertExecutionAllowed=async()=>{if(++checks===stopAt){entered.resolve();await release.promise;}};
  const attempt=f.manager.action(f.command),rejected=assert.rejects(attempt,/CLOSED|開き直/);
  await entered.promise;const closing=f.manager.close();release.resolve();await closing;
  await rejected;assert.equal(f.calls,0);
 }
});
void test('legacy preparing and pending or unconfirmed jobs refuse new cache effects',async t=>{
 const f=await fixture(t),release=deferred();
 f.environment.prepare=async()=>{await release.promise;return {ready:false};};
 await f.manager.action({action:'prepare',modelId:model.id,accepted:true});
 await assert.rejects(f.manager.action(f.command),/BUSY/);release.resolve();await settled(f.manager);assert.equal(f.calls,0);
 for(const stop of ['none','requested','unconfirmed']){const g=await fixture(t);await g.manager.close();
  const path=join(g.dir,'state.json'),s=JSON.parse(await readFile(path));
  const run=beginLinuxRun({id:randomUUID(),name:'fixture',instructions:'draft',modelId:model.id,sha256:'a'.repeat(64)},'synthetic',randomUUID(),model.sha256);
  run.stop=stop;s.runs=[run];await writeFile(path,JSON.stringify(s));
  g.environment.spawn=()=>{throw Error('synthetic stop unavailable');};
  const reopened=await createLinuxLocalManager({stateDir:g.dir,environment:g.environment});
  try{await assert.rejects(reopened.action(g.command),/BUSY/);assert.equal(g.calls,0);}finally{await reopened.close();}
 }
});
