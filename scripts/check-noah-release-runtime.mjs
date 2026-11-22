import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { releaseRuntimeFixture } from '../tests/helpers/noah-release-runtime-fixture.mjs';
import { createTerminalInstallations } from './noah-terminal-installations.mjs';
import { createExecutionManager } from './noah-executions.mjs';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { noahUsageReport } from '../lib/noah-usage.ts';
import { engineSocket } from './noah-isolated-runtime.mjs';

if (!process.argv.includes('--live')) throw new Error('Use --live for the dedicated local VM/model test. No payment or publication is performed.');
const rootArg=process.argv.indexOf('--runtime-root'), root=rootArg>=0?path.resolve(process.argv[rootArg+1]):process.cwd();
const outputArg=process.argv.indexOf('--output'), output=outputArg>=0?path.resolve(process.argv[outputArg+1]):path.resolve('work/verification/noah-release-runtime-20261117/live.json');
const report={at:new Date().toISOString(),scope:'Synthetic two-owner commerce database and bucket, real dedicated VM/source/model execution; no provider payment, market publication, cloud or Pixel acceptance',stages:[],engine:engineSocket(root)};
async function waitFor(fn,timeout=300000){const until=Date.now()+timeout;while(Date.now()<until){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,500));}throw new Error('Live test observation timeout; inspect the same run before retrying.');}
let f,terminals,manager;
try {
  f=await releaseRuntimeFixture();await f.review();f.purchase('pending');assert.equal((await f.describe()).status,403);f.setPayment('paid');assert.equal((await f.describe()).status,200);assert.equal((await f.describe('other-fixture')).status,403);
  report.stages.push({name:'synthetic-entitlements',pendingDenied:true,paidBuyerAllowed:true,otherBuyerDenied:true,packageKey:f.p.packageKey,manifestSha256:f.p.manifestSha256,sourceSha256:f.hash});
  await f.uploads.remove(f.id);f.blobs.delete('own-source');
  terminals=createTerminalInstallations({root});manager=createExecutionManager(terminals);
  const scope=await ownerScopeFor('buyer-fixture'),id='release-'+f.p.manifestSha256,load=await f.loader();
  await terminals.connect(scope,id,load);
  await waitFor(async()=>{const s=await terminals.get(scope,id);if(s.state==='failed')throw new Error(s.message);return s.state==='connected';});
  const request={id:randomUUID(),agentId:id,prompt:'日本語で短い挨拶を一文だけ書いてください。'};
  await manager.start(scope,request,f.work(),async()=>{});
  const job=await waitFor(async()=>{const j=await f.jobs.get('buyer-fixture',request.id);return j&&!['queued','running'].includes(j.noahExecution.state)?j:null;});
  assert.equal(job.noahExecution.state,'returned');assert.equal(job.noahExecution.result.exitCode,0);assert.equal(job.noahExecution.calls,1);assert.equal(job.noahExecution.release.sourceSha256,f.hash);assert.ok(job.noahExecution.result.files.some(file=>file.name==='result.txt'&&file.bytes>0));
  const replay=await manager.start(scope,request,f.work(),async()=>{});assert.equal(replay.job.revision,job.revision);assert.equal(await f.jobs.get('author-fixture',job.id),null);
  const usage=await noahUsageReport(f.db,'author-fixture',{scope:'publisher'});assert.equal(usage.sources.find(s=>s.source==='local_agent').metrics.runs,1);
  report.stages.push({name:'real-source-execution',job,privateOriginalDeleted:true,sameIdReplaySameRevision:true,authorCannotReadBuyerWork:true,publisherUsage:1});
  f.setPayment('refunded');await assert.rejects(manager.start(scope,{...request,id:randomUUID()},f.work(),async()=>{}),e=>e.status===403);f.setPayment('paid');f.revoke();await assert.rejects(terminals.execution(scope,id),e=>e.status===409);
  report.stages.push({name:'post-execution-revocation',refundBlocksNewRun:true,withdrawalBlocksExecution:true});report.passed=true;
}catch(e){report.passed=false;report.error=e instanceof Error?e.message:String(e);process.exitCode=1;}
finally{await manager?.close();await terminals?.close();f?.close();await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,stages:report.stages.length,output}));
