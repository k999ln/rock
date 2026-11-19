// Explicit local acceptance: a known synthetic wait fixture, no real recipient or external send.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const base='http://127.0.0.1:3107', uploadId='635a92b3-dfd8-44a8-908f-0691db4a8535';
const directory=new URL('../work/verification/noah-invite-runtime-20261117/',import.meta.url);
await mkdir(directory,{recursive:true});
async function api(path,body,method=body?'POST':'GET') {
 const r=await fetch(base+path,{method,headers:body?{origin:base,'content-type':'application/json','x-rock-owner-scope':scope}:{},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});
 const d=await r.json();if(!r.ok)throw new Error(`${r.status}: ${d.error}`);return d;
}
const local=await api('/api/noah/agents/'+uploadId), scope=local.ownerScope;
assert.equal(local.agent.source.sha256,'69346c31276445a27f48d1920ae97d795d95b3de4fe1889b26fb295d62fcae63');
assert.equal(local.agent.manifest.runtime.model,'none');
const inviteId=randomUUID(), agentId='invite-'+inviteId, id=randomUUID(), expiresAt=Date.now()+15000;
await api('/api/noah/invites',{id:inviteId,agentId:uploadId,token:randomBytes(32).toString('hex'),recipient:'noah-invite-local-test-only',access:'source',executionAllowed:true,expiresAt,maxUses:1});
const evidence={accountScope:'local author self-test; distinct recipients tested in SQLite integration',inviteId,agentId,id,expiresAt};
try {
 await api(`/__noah/installations/${agentId}/connect`,{});
 for(let n=0;;n++) {
  const {installation}=await api(`/__noah/installations/${agentId}`);
  if(installation.state==='connected')break;
  if(installation.state==='failed'||n>30)throw new Error('Preparation failed or timed out');
  await delay(200);
 }
 await api('/__noah/executions',{id,agentId,prompt:'招待期限の自動停止を確認する合成試験。'});
 const docker=['--host','unix:///Volumes/avokado/work/runtime-state/noah-engine/colima/noah-exec/docker.sock','ps','--format','{{.Names}}'];
 for(let n=0;n<120;n++) {
  const {job}=await api('/__noah/executions/'+id);
  if(job.noahExecution.state==='running'&&!evidence.running) {
   const containers=execFileSync('docker',docker,{encoding:'utf8'}).trim().split('\n').filter(Boolean);
   if(containers.length)evidence.running={at:Date.now(),containers};
  }
  if(!['queued','running'].includes(job.noahExecution.state)) {
   evidence.job=job;evidence.finishedAt=Date.now();break;
  }
  await delay(250);
 }
 evidence.containersAfter=execFileSync('docker',docker,{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 assert.ok(evidence.running,'Did not observe the active isolated process');
 assert.equal(evidence.job?.noahExecution.state,'failed');
 assert.match(evidence.job.noahExecution.error,/期限/);
 assert.equal(evidence.containersAfter.length,0);
 assert.ok(evidence.finishedAt>=expiresAt);
 evidence.accepted=true;
 console.log(JSON.stringify({id,inviteId,state:evidence.job.noahExecution.state,expiryToRecordedStopMs:evidence.finishedAt-expiresAt,containersAfter:0}));
} finally {
 await api(`/__noah/installations/${agentId}/disconnect`,{}).catch(()=>{});
 await writeFile(new URL('live-expiry.json',directory),JSON.stringify(evidence,null,2)+'\n');
}
