import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createSkyToolPackageDraft } from '../lib/sky-tool-package.ts';
import { noahSha256 } from '../lib/noah-agent-upload.ts';
const localFetch=(url,options={})=>fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
const origin='http://127.0.0.1:3107', path='work/verification/noah-continuation-20261116/results/release-source-live.json';
const input=JSON.parse(await readFile('work/verification/noah-continuation-20261116/results/upload-processing-live.json','utf8')).rows[0];
const sourceResponse=await localFetch(origin+'/api/noah/agents/'+input.id), source=await sourceResponse.json();assert.equal(sourceResponse.status,200);
const manifest=createSkyToolPackageDraft({sourceKind:'inline_code',fileName:source.agent.source.name,name:'Noah private source fixture '+Date.now(),summary:'Local synthetic release snapshot check; no publication, review or payment.',developerId:'noah-local-test',developerName:'Noah local test',license:'Private test fixture'});
const headers={Origin:origin,'Content-Type':'application/json','X-Rock-Owner-Scope':source.ownerScope};
const body={manifest,confirmations:{rights:true,pricing:true,sideEffects:true,tests:true,distributeSource:true},upload:{id:input.id,manifestSha256:source.agent.manifestSha256,sourceSha256:source.agent.source.sha256}};
const response=await localFetch(origin+'/api/noah/publisher',{method:'POST',headers,body:JSON.stringify(body)}),value=await response.json();assert.equal(response.status,201,JSON.stringify(value));
const p=value.package, report={at:new Date().toISOString(),scope:'local author source snapshot, no public publication or payment',packageKey:p.packageKey,manifestSha256:p.manifestSha256,uploadId:input.id,sourceSha256:source.agent.source.sha256};
try {
  assert.equal(p.status,'submitted');assert.equal(p.installable,false);assert.equal(p.manifest.source.artifact.sha256,source.agent.source.sha256);
  const r=await localFetch(origin+`/api/noah/releases/${encodeURIComponent(p.packageKey)}/source?manifest=${p.manifestSha256}`);assert.equal(r.status,200);
  const bytes=new Uint8Array(await r.arrayBuffer());assert.equal(await noahSha256(bytes),source.agent.source.sha256);
  const retry=await localFetch(origin+'/api/noah/publisher',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(retry.status,200);
  Object.assign(report,{downloadMatched:true,idempotentRetry:true,bytes:bytes.length});
} finally {
  const r=await localFetch(origin+'/api/noah/publisher',{method:'PATCH',headers,body:JSON.stringify({action:'withdraw',packageKey:p.packageKey,manifestSha256:p.manifestSha256,status:'submitted'})}),v=await r.json();assert.equal(r.status,200,JSON.stringify(v));assert.equal(v.package.status,'revoked');report.finalState='revoked';
  await writeFile(path,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report));
