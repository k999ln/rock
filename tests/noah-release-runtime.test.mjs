import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { releaseRuntimeFixture } from './helpers/noah-release-runtime-fixture.mjs';
import { createTerminalInstallations } from '../scripts/noah-terminal-installations.mjs';
import { createExecutionManager } from '../scripts/noah-executions.mjs';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { skyToolPackageStore } from '../lib/sky-tool-package-store.ts';
import { parseSkyToolPackage } from '../lib/sky-tool-package.ts';
import { noahUsageReport } from '../lib/noah-usage.ts';
const settle=async fn=>{for(let n=0;n<200;n++){if(await fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('did not settle');};

void test('release pins the original runtime; forged runtime, network and inconsistent contract cannot be published',async t=>{
  const f=await releaseRuntimeFixture();t.after(f.close);
  assert.deepEqual(f.p.manifest.source.artifact.runtime,f.template.manifest.runtime);
  const altered=structuredClone(f.p.manifest);altered.id='dev.fixture.changed';altered.source.artifact.runtime.entrypoint='different.mjs';
  assert.equal(await skyToolPackageStore(f.db).create('author-fixture',altered),null);
  for(const change of [p=>{p.adapter.connectionType='mcp_stdio';},p=>{p.capabilities.permissions.push('network');},p=>{p.execution.timeoutSeconds=241;},p=>{p.source.artifact.runtime.command='open Safari';}]){const p=structuredClone(f.p.manifest);change(p);assert.throws(()=>parseSkyToolPackage(p));}
});
void test('release execution requires current review and exact paid entitlement, including for the author',async t=>{
  const f=await releaseRuntimeFixture();t.after(f.close);
  assert.equal((await f.describe('author-fixture')).status,409);await f.review();assert.equal((await f.describe()).status,403);
  f.purchase('pending');assert.equal((await f.describe()).status,403);f.setPayment('paid');assert.equal((await f.describe()).status,200);
  assert.equal((await f.describe('other-fixture')).status,403);assert.equal((await f.describe('author-fixture')).status,200);
  await f.uploads.remove(f.id);f.blobs.delete('own-source');assert.ok((await(await f.loader())(true)).bytes.length);
  f.setPayment('refunded');assert.equal((await f.describe()).status,403);f.setPayment('paid');f.revoke();assert.equal((await f.describe('author-fixture')).status,409);
});
void test('revocation during source loading is rejected before runtime preparation',async t=>{
  const f=await releaseRuntimeFixture();t.after(f.close);await f.review();f.purchase();f.onRead(()=>f.revoke());
  await assert.rejects((await f.loader())(true),e=>e.status===409);
});
void test('buyer executes exact release in Work, replays once, author usage sees buyer only, refund blocks a new run',async t=>{
  const f=await releaseRuntimeFixture();t.after(f.close);await f.review();f.purchase();let runs=0,prepared;
  const terminals=createTerminalInstallations({root:'/unused',prepare:async options=>{prepared=options;return {execution:{image:'sha256:'+'a'.repeat(64)},run:async(_prompt,_signal,onModel)=>{runs++;await onModel(1);return {text:'fixture result',files:[],exitCode:0};},stop:async()=>{}};}});
  const manager=createExecutionManager(terminals);t.after(async()=>{await manager.close();await terminals.close();});
  const scope=await ownerScopeFor('buyer-fixture'),id='release-'+f.p.manifestSha256;
  await terminals.connect(scope,id,await f.loader());await settle(async()=>(await terminals.get(scope,id)).state==='connected');
  assert.equal(prepared.expectedSha,f.hash);assert.equal(prepared.seconds,240);
  const request={id:randomUUID(),agentId:id,prompt:'Synthetic test request'};
  await Promise.all(Array.from({length:8},()=>manager.start(scope,request,f.work(),async()=>{})));
  await settle(async()=>(await f.jobs.get('buyer-fixture',request.id))?.noahExecution.state==='returned');
  assert.equal(runs,1);const job=await f.jobs.get('buyer-fixture',request.id);assert.equal(job.noahExecution.release.sourceSha256,f.hash);assert.equal(job.noahExecution.source,undefined);
  assert.equal((await manager.start(scope,request,f.work(),async()=>{})).job.revision,job.revision);assert.equal(await f.jobs.get('author-fixture',request.id),null);
  const usage=await noahUsageReport(f.db,'author-fixture',{scope:'publisher'});const local=usage.sources.find(s=>s.source==='local_agent');assert.equal(local.metrics.runs,1);assert.equal(local.agents[0].agentRef,f.p.packageKey);assert.equal(local.metrics.knownCostRuns,0);
  f.setPayment('refunded');await assert.rejects(manager.start(scope,{...request,id:randomUUID()},f.work(),async()=>{}),e=>e.status===403);assert.equal(runs,1);
});
