import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { executionDigest, projectTextReceipt } from '../packages/rockstaros-runtime/src/executor.mjs';
import { createPixelLinuxExecutor } from '../packages/rockstaros-runtime/src/linux-manager-executor.mjs';
import { prepareNodeServiceHost, connectNodeServiceHost, openNodeServiceHost } from '../packages/rockstaros-runtime/src/node-service-host.mjs';
import { nodeServiceFixture, unlock } from '../packages/rockstaros-runtime/test/helpers/node-service-fixture.mjs';
import { pixelPortableFixture as fixture } from './helpers/pixel-portable-fixture.mjs';

void test('common kernel executes the existing Pixel manager with the same job/thread and approved worker limits', async t => {
  const f = await fixture(t), request = f.request(), execution = f.kernel().submit(request), child = await f.wait();
  assert.equal(child.request.jobId, request.id);
  assert.equal(child.request.maxOutputTokens, 64);
  assert.equal(child.request.deadline, request.deadline);
  assert.ok(child.timeout > 0 && child.timeout <= 60000);
  f.finish(child);
  const record = await execution, output = await projectTextReceipt(record), run = f.manager.snapshot().runs[0];
  assert.equal(record.id, run.job.id); assert.equal(run.threadId, request.threadId);
  assert.equal(run.surface, 'runtime'); assert.equal(run.runtimeBinding.requestSha256, await executionDigest(request));
  assert.equal(output.text, run.text); assert.equal(output.outputSha256, await executionDigest(run.text));
  assert.equal(output.usage.cloudUsageMinor, 0); assert.equal(output.externalToolSuccess, false);
  assert.equal(f.counters.dispatched, 1);
  await f.reopen();
  assert.deepEqual(await f.manager.executeText(request), { text: run.text, model: request.model, durationMs: run.durationMs });
  assert.equal((await f.kernel().submit(request)).result.sha256, record.result.sha256);
  assert.equal(f.counters.dispatched, 1);
});

void test('same command joins the existing manager computation; changed content and old IDs never execute again', async t => {
  const f = await fixture(t), request = f.request();
  const a = f.manager.executeText(request), b = f.manager.executeText(request);
  const child = await f.wait();
  await assert.rejects(f.manager.executeText({ ...request, input: '別の依頼' }), { code: 'REQUEST_ID_CONFLICT' });
  f.finish(child); assert.deepEqual(await a, await b);
  await assert.rejects(f.manager.executeText({ ...request, maxOutputTokens: 65 }), { code: 'REQUEST_ID_CONFLICT' });
  assert.equal(f.counters.dispatched, 1);
});

void test('abort confirms the existing fixed worker stop and discards late results without replay', async t => {
  const f = await fixture(t), request = f.request(), controller = new AbortController();
  const execution = f.manager.executeText(request, controller.signal), child = await f.wait();
  controller.abort(); f.finish(child);
  await assert.rejects(execution, { code: 'SKY_LINUX_OUTCOME_UNKNOWN' });
  const run = f.manager.snapshot().runs[0];
  assert.equal(run.stop, 'confirmed'); assert.equal(run.text, null);
  await assert.rejects(f.manager.executeText(request), { code: 'SKY_LINUX_OUTCOME_UNKNOWN' });
  assert.equal(f.counters.dispatched, 1); assert.equal(f.counters.stopped, 1);
});

void test('wrong model, agent, expired resources and unready guest cannot reach the process', async t => {
  const f = await fixture(t), request = f.request();
  for (const patch of [
    { model: { ...request.model, sha256: 'ef'.repeat(32) } },
    { model: { ...request.model, scheme: 'ollama-manifest-sha256' } },
    { agent: { ...request.agent, instructions: '権限を増やす' } },
    { deadline: Date.now() - 1 }, { maxOutputTokens: 0 }, { maxOutputTokens: 1025 },
  ]) await assert.rejects(f.driver().generate({ ...request, ...patch }, new AbortController().signal));
  const descriptor = await f.driver().describe(request.model);
  assert.equal(descriptor.id, 'pixel-linux-gguf'); assert.equal(descriptor.platform, 'linux');
  const fake = createPixelLinuxExecutor({ manager: { snapshot: () => ({ ...f.manager.snapshot(), phase: 'stopped' }), executeText: () => assert.fail(), describeText: () => assert.fail() } });
  await assert.rejects(fake.describe(request.model), { code: 'PIXEL_LINUX_NOT_READY' });
  assert.equal(f.counters.dispatched, 0);
});

void test('portable execution port is not a public manager action and cannot reuse a legacy work ID', async t => {
  const f = await fixture(t), request = f.request();
  await assert.rejects(f.manager.action({ action: 'executeText', request }), /項目/);
  await f.manager.action({ action: 'run', accepted: true, agentId: f.agent.id, input: request.input, requestId: request.id });
  const child = await f.wait(); assert.equal(child.request.maxOutputTokens, undefined); assert.equal(child.request.deadline, undefined);
  f.finish(child); await new Promise(resolve => setTimeout(resolve, 10));
  await assert.rejects(f.manager.executeText(request), { code: 'REQUEST_ID_CONFLICT' });
  assert.equal(f.counters.dispatched, 1);
});

void test('Python worker enforces common limits and keeps the legacy token/time contract', () => {
  const python = spawnSync('python3', ['-c', `
import importlib.util
spec=importlib.util.spec_from_file_location('worker','toolkits/sky-linux-local/worker.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
base={'jobId':'a'*36,'input':'fixture','instructions':'draft','modelSha256':'b'*64}
assert w.execution_limits(base,1000)=={'tokens':512,'wall_seconds':180,'cpu_seconds':170}
assert w.execution_limits({**base,'modelId':'fixture','maxOutputTokens':64,'deadline':2500},1000)=={'tokens':64,'wall_seconds':1.5,'cpu_seconds':2}
for patch in [{'maxOutputTokens':64},{'deadline':2500},{'maxOutputTokens':True,'deadline':2500},{'maxOutputTokens':0,'deadline':2500},{'maxOutputTokens':1025,'deadline':2500},{'maxOutputTokens':64,'deadline':1000},{'maxOutputTokens':64,'deadline':121001},{'maxOutputTokens':64,'deadline':float('inf')},{'shell':'id'}]:
 try: w.execution_limits({**base,**patch},1000)
 except ValueError: pass
 else: raise AssertionError(patch)
`], { encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
});

void test('common Eve service claims, runs the Linux manager, and saves the same account job/history once', async t => {
  const f = await fixture(t), service = await nodeServiceFixture(t), directory = join(service.directory, 'pixel-host');
  const configuration = { name: '合成のPixel Linux', models: [{ id: f.model.id, name: f.model.name, scheme: 'gguf-sha256', sha256: f.model.sha256 }], agents: [f.agent] };
  await prepareNodeServiceHost({ directory, origin: service.origin, configuration, driver: f.driver() });
  const linked = await connectNodeServiceHost({ directory, unlockPhrase: unlock(), driver: f.driver(), runtimeFactory: service.runtimeFactory, onAuthorization: async ({ userCode }) => { await service.link.approve(userCode, 'synthetic-owner'); } });
  const open = () => openNodeServiceHost({ directory, unlockPhrase: unlock(), driver: f.driver(), runtimeFactory: service.runtimeFactory });
  let host = await open();
  try {
    await host.cycle();
    const jobId = crypto.randomUUID(), threadId = crypto.randomUUID();
    await service.store.enqueue({ id: jobId, threadId, deviceId: linked.deviceId, agentId: f.agent.id, agentSha256: f.agent.sha256, modelSha256: f.model.sha256, modelScheme: 'gguf-sha256', input: '同じEveの合成依頼', maxOutputTokens: 32, confirm: 'run-owner-local-text' });
    const cycle = host.cycle(), child = await f.wait();
    assert.equal(child.request.jobId, jobId); assert.equal(child.request.maxOutputTokens, 32);
    f.finish(child);
    const result = await cycle;
    assert.equal(result[0].state, 'reported'); assert.equal(result[0].id, jobId);
    const saved = await service.store.read(jobId), local = f.manager.snapshot().runs[0];
    assert.equal(saved.threadId, threadId); assert.equal(local.threadId, threadId);
    assert.equal(saved.report.outputSha256, await executionDigest(local.text));
    assert.equal((await service.history.get(threadId)).session.messages.length, 2);
    assert.equal((await service.store.list()).length, 1);
    await host.close(); host = await open();
    assert.deepEqual(await host.cycle(), []);
    assert.deepEqual(await service.store.read(jobId), saved);
    assert.equal(f.counters.dispatched, 1);
  } finally { await host.close(); }
});

void test('fixed Python process receives approved token/wall/CPU limits without a shell, and preserves legacy defaults', () => {
  const python = spawnSync('python3', ['-c', `
import importlib.util,tempfile,json,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('worker','toolkits/sky-linux-local/worker.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
with tempfile.TemporaryDirectory(prefix='sky-worker-bounds-') as folder:
 w.ROOT=Path(folder);model=b'synthetic model';(w.ROOT/'model.gguf').write_bytes(model)
 descriptor={'id':'fixture','bytes':len(model),'sha256':hashlib.sha256(model).hexdigest()}
 (w.ROOT/'runtime-lock.json').write_text(json.dumps({'directory':'fixture','model':descriptor}))
 binary=w.ROOT/'runtime/fixture/llama-completion';binary.parent.mkdir(parents=True);binary.write_bytes(b'non executable fixture')
 (w.ROOT/'runtime-files.json').write_text(json.dumps({'llama-completion':w.digest(binary)}))
 captures=[];limits=[]
 w.identity=lambda pid:{'pid':pid,'boot':'synthetic','start':'synthetic'}
 w.time.time=lambda:1000
 w.resource.setrlimit=lambda resource,value:limits.append((resource,value))
 # This fake Popen executes preexec in the host process. Real Linux parent-death
 # behavior is covered by test_pixel_worker_parent_exit.py on the Pixel guest.
 def fake_child_setup(cpu,parent):
  assert parent==w.os.getpid()
  w.limits(cpu)
 w.prepare_child=fake_child_setup
 class Child:
  pid=999999999;returncode=0
  def __init__(self,args,**kw):
   self.call={'args':args,'kwargs':kw};captures.append(self.call);kw['stdout'].write(b'fixture output');kw['stdout'].flush();kw['preexec_fn']()
  def wait(self,timeout=None):self.call['timeout']=timeout
 w.subprocess.Popen=Child
 base={'jobId':'a'*36,'input':'untrusted $(shell) text','instructions':'draft only','modelSha256':descriptor['sha256']}
 assert w.run({**base,'maxOutputTokens':64,'deadline':1005000})['text']=='fixture output'
 first=captures[-1];assert first['args'][first['args'].index('-n')+1]=='64';assert first['timeout']==5
 assert (w.resource.RLIMIT_CPU,(5,5)) in limits
 assert first['kwargs'].get('shell',False) is False
 assert set(first['kwargs']['env'])=={'PATH','HOME','LD_LIBRARY_PATH','LANG'}
 limits.clear();w.run({**base,'jobId':'c'*36})
 second=captures[-1];assert second['args'][second['args'].index('-n')+1]=='512';assert second['timeout']==180
 assert (w.resource.RLIMIT_CPU,(170,170)) in limits
 assert len(captures)==2
 def cannot_start(*args,**kwargs):raise OSError('synthetic launch failure')
 w.subprocess.Popen=cannot_start
 try:w.run({**base,'jobId':'d'*36,'maxOutputTokens':64,'deadline':1005000})
 except OSError:pass
 else:raise AssertionError('launch must fail')
 assert not (w.ROOT/'jobs'/('d'*36)/'prompt.txt').exists()
 clock=iter([1000,1000,1006]);w.time.time=lambda:next(clock)
 try:w.run({**base,'jobId':'e'*36,'maxOutputTokens':64,'deadline':1005000})
 except ValueError:pass
 else:raise AssertionError('expired launch must fail')
 assert not (w.ROOT/'jobs'/('e'*36)/'prompt.txt').exists()
 assert len(captures)==2
`], { encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
});

void test('an old worker ABI is refused before the common service claim, journal record or inference', async t => {
  const f = await fixture(t), request = f.request();
  f.setAbi(0);
  await assert.rejects(f.kernel().submit(request), { code: 'SKY_LINUX_WORKER_ABI_UNSUPPORTED' });
  assert.equal(await f.journal.get(request.id), null);
  assert.equal(f.manager.snapshot().runs.length, 0);
  assert.equal(f.counters.authorized, 0);
  assert.equal(f.counters.dispatched, 0);
});

void test('Pixel parent keeps bounded private same-job close signals and separate abort/deadline requests', () => {
  const node = spawnSync(process.execPath, ['--input-type=module', '-e', `
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,open,rename,unlink,lstat,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir,userInfo} from 'node:os';import {createHash,randomUUID} from 'node:crypto';
const base=await mkdtemp(join(tmpdir(),'pixel-parent-diag-'));
const source=await readFile('toolkits/sky-linux-local/pixel-server.mjs','utf8');
// Execute the actual isolated launcher function; no full server or device is started.
const body=source.slice(source.indexOf('function execute('),source.indexOf('\\nconst bootId ='));
const factory=new Function('spawn','readFile','writeFile','mkdir','open','rename','unlink','lstat','join','userInfo','createHash','randomUUID','base',body+';return execute;');
const make=(launcher=spawn)=>factory(launcher,readFile,writeFile,mkdir,open,rename,unlink,lstat,join,userInfo,createHash,randomUUID,base);
const execute=make(),secret='SYNTHETIC-private-input-do-not-store';
await writeFile(join(base,'worker.py'),'import json,sys,time\\nd=json.load(sys.stdin)\\ntime.sleep(5 if d.get("sleep") else 0)\\nprint(json.dumps({"text":d["input"]}))\\n');
const wait=async id=>{const p=join(base,'jobs',id,'parent-diagnostics.json');for(let i=0;i<200;i++){try{const v=JSON.parse(await readFile(p));if(v.terminalObserved)return v;}catch{}await new Promise(r=>setTimeout(r,10));}throw Error('parent evidence not committed');};
const run=(id,extra={},opts={})=>execute(['python3',join(base,'worker.py'),'run'],{input:JSON.stringify({jobId:id,input:secret,instructions:secret,modelSha256:'a'.repeat(64),maxOutputTokens:16,deadline:Date.now()+1000,...extra}),...opts});
try {
 const id=randomUUID();assert.equal(JSON.parse(await run(id).promise).text,secret);const normal=await wait(id);
 assert.equal(normal.returnCode,0);assert.equal(normal.signal,null);assert.equal(normal.input.sha256,createHash('sha256').update(secret).digest('hex'));
 assert.equal(normal.evidenceOnly,true);assert.ok(!JSON.stringify(normal).includes(secret));
 const path=join(base,'jobs',id,'parent-diagnostics.json');assert.equal((await lstat(path)).mode&0o777,0o600);assert.ok((await lstat(path)).size<=8192);
 const original=await readFile(path,'utf8');await run(id).promise;await new Promise(r=>setTimeout(r,80));assert.equal(await readFile(path,'utf8'),original);
 const timed=randomUUID();await assert.rejects(run(timed,{sleep:true},{timeout:80}).promise);const timeout=await wait(timed);
 assert.ok(timeout.timeoutRequestedMonotonicNs);assert.equal(timeout.abortRequestedMonotonicNs,undefined);assert.equal(timeout.signal,'SIGTERM');assert.equal(timeout.requestedTimeoutMs,80);
 const cancelled=randomUUID(),controller=new AbortController();const task=run(cancelled,{sleep:true},{timeout:2000,signal:controller.signal});setTimeout(()=>controller.abort(),80);await assert.rejects(task.promise);const abort=await wait(cancelled);
 assert.ok(abort.abortRequestedMonotonicNs);assert.equal(abort.timeoutRequestedMonotonicNs,undefined);assert.equal(abort.signal,'SIGTERM');
 const missing=randomUUID(),bad=make((...args)=>spawn('/nonexistent-pixel-fixture',args[1],args[2]));
 await assert.rejects(bad(['python3',join(base,'worker.py'),'run'],{input:JSON.stringify({jobId:missing,input:secret,instructions:secret}),timeout:500}).promise);const failed=await wait(missing);
 assert.equal(failed.spawnErrorCode,'ENOENT');assert.equal(failed.returnCode,-2);assert.ok(!JSON.stringify(failed).includes(secret));
 // A diagnostic I/O failure cannot change existing successful stdout/error routing.
 await rm(join(base,'jobs'),{recursive:true});await writeFile(join(base,'jobs'),'not a directory');
 assert.equal(JSON.parse(await run(randomUUID()).promise).text,secret);
} finally {await rm(base,{recursive:true,force:true});}
`], { encoding: 'utf8', timeout: 15000 });
  assert.equal(node.status, 0, node.stderr);
});
