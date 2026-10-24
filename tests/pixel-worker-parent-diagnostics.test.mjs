import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

void test('Pixel parent keeps bounded private same-job close signals and separate abort/deadline requests', () => {
  const node = spawnSync(process.execPath, ['--input-type=module', '-e', `
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,open,rename,unlink,lstat,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir,userInfo} from 'node:os';import {createHash,randomUUID} from 'node:crypto';
const base=await mkdtemp(join(tmpdir(),'pixel-parent-diag-'));
const source=await readFile('toolkits/sky-linux-local/pixel-server.mjs','utf8');
// Execute the actual isolated launcher function; no full server or device is started.
const body=source.slice(source.indexOf('function execute('),source.indexOf('\\nconst manager ='));
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
