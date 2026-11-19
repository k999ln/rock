import test from 'node:test';
import assert from 'node:assert/strict';
import {eveAgentFixture} from './helpers/eve-agent-fixture.mjs';
import {eveAgentWorkStore} from '../lib/eve-agent-work.ts';
import {a2aDelegationStore} from '../lib/a2a-delegation-store.ts';
import {encryptA2AArtifact} from '../lib/a2a-input-crypto.ts';
import {resolveEveAgentResults} from '../lib/eve-agent-repair.ts';
import {workStore} from '../lib/work-store.ts';
import {requestEveAgentStop} from '../lib/workflow.ts';
const key='ab'.repeat(32),uid=()=>crypto.randomUUID();
async function setup(t, text='wrong') {
 const f=eveAgentFixture(t),eve=eveAgentWorkStore(f.db,'alice',f.keys,key),agents=a2aDelegationStore(f.db);
 let job=(await eve.create({create:true,jobId:uid(),threadId:uid(),title:'Repair fixture',acceptance:{schema:'eve.agent-criteria/1',minChars:1,maxChars:100,requiredText:['READY']}})).job;
 async function child(body, repair) {
  const id=repair?.successorDelegationId??uid(),task='task-'+id;
  const input={id,parentJobId:job.id,predecessorDelegationId:repair?.sourceDelegationId??null,idempotencyKey:repair?.idempotencyKey??uid(),messageId:repair?.messageId??uid(),targetOrigin:'https://fixture.example',targetAgentName:'fixture',targetAgentVersion:'1',protocolVersion:'1.0',inputSha256:repair?.messageSha256??'a'.repeat(64),authorizationSha256:'b'.repeat(64),budgetCurrency:'USD',budgetLimitMinor:0,parentBudgetLimitMinor:0,continueWhileDeviceOffline:true,deadlineAt:repair?.deadlineAt??Date.now()+60000};
  await agents.prepare('alice',input);await agents.approve('alice',id,input.authorizationSha256,{ciphertext:'fixture',nonce:'fixture',inputSha256:input.inputSha256,keyVersion:'aes-256-gcm-v1'});
  let row=await agents.claimDispatch('alice',id);row=await agents.beginRemoteSend('alice',id,row.revision);row=await agents.recordTaskReceipt('alice',id,row.revision,{id:task,state:'TASK_STATE_COMPLETED'});
  const document=JSON.stringify({schemaVersion:1,artifacts:[{textParts:[body]}],truncated:false,omittedNonTextParts:0});
  const encrypted=await encryptA2AArtifact(document,key,'alice',id,task);await agents.saveArtifact('alice',id,task,encrypted,new TextEncoder().encode(document).length);await agents.markArtifactsCaptured('alice',id,task,row.revision);
  // Synthetic receipt-store row: these tests cover repair state, not signature verification or money.
  f.sqlite.prepare('INSERT INTO a2a_usage_receipts(delegation_id,owner_user_id,parent_job_id,provider_id,provider_reference,receipt_json,currency,amount_minor,issued_at,received_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,'alice',job.id,'fixture',id,'{}','USD',0,Date.now(),Date.now());
  return id;
 }
 const source=await child(text);
 const prepare=async(extra={})=>{const r=await eve.command({jobId:job.id,revision:job.revision,action:'prepare-repair',commandId:uid(),sourceDelegationId:source,...extra});job=r.job;return r;};
 return {...f,eve,agents,source,child,prepare,job:()=>job};
}
void test('repair preparation saves one bounded binding, never a new delegation or grant; reopen reuses its IDs and preserves criteria',async t=>{
 const f=await setup(t),before=f.job(),commandId=uid(),a=await f.prepare({commandId});
 assert.equal(a.job.eveAgent.repairs.length,1);assert.equal((await f.agents.listForParent('alice',before.id)).length,1);assert.deepEqual(a.job.eveAgent.acceptance,before.eveAgent.acceptance);
 assert.ok(a.repairDraft.message.includes('untrusted data'));assert.ok(a.repairDraft.message.includes('wrong'));assert.ok(a.repairDraft.message.includes('READY'));
 const b=await f.prepare({commandId});assert.deepEqual(b.repairDraft,a.repairDraft);assert.equal(b.job.revision,a.job.revision);
 const c=await f.prepare();assert.deepEqual(c.repairDraft,a.repairDraft);assert.equal(c.job.revision,a.job.revision);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM agent_delegation_budget_reservations').get().n,1);
});
void test('only an explicit bound passed successor supersedes a failed deliverable; source artifacts and usage rows remain unchanged',async t=>{
 const f=await setup(t),before=await f.agents.listArtifacts('alice',f.source),receipt=await f.agents.getUsageReceipt('alice',f.source);
 const {repairDraft}=await f.prepare();const successor=await f.child('READY',repairDraft);
 const results=await resolveEveAgentResults(f.db,'alice',f.job(),key);
 assert.equal(results.find(x=>x.child.id===f.source).inspection.status,'failed');assert.equal(results.find(x=>x.child.id===f.source).supersededBy,successor);assert.equal(results.find(x=>x.child.id===successor).inspection.status,'passed');
 assert.deepEqual(await f.agents.listArtifacts('alice',f.source),before);assert.deepEqual(await f.agents.getUsageReceipt('alice',f.source),receipt);
 assert.equal((await resolveEveAgentResults(f.db,'alice',{...f.job(),plan:{...f.job().plan,objective:'changed goal'}},key)).find(x=>x.child.id===f.source).supersededBy,null);
 f.sqlite.prepare('UPDATE agent_delegations SET input_sha256=? WHERE id=?').run('c'.repeat(64),successor);
 assert.equal((await resolveEveAgentResults(f.db,'alice',f.job(),key)).find(x=>x.child.id===f.source).supersededBy,null);
});
void test('generic continuation without an explicit repair binding never hides an unmet source condition',async t=>{
 const f=await setup(t);await f.child('READY',{sourceDelegationId:f.source,successorDelegationId:uid(),messageId:uid(),idempotencyKey:uid(),messageSha256:'a'.repeat(64)});
 assert.equal((await resolveEveAgentResults(f.db,'alice',f.job(),key)).find(x=>x.child.id===f.source).supersededBy,null);
 await assert.rejects(f.prepare(),/既に次の委任/);
});
void test('failed repair stays unmet and cannot recurse or consume another repair slot',async t=>{
 const f=await setup(t),r=await f.prepare(),successor=await f.child('still wrong',r.repairDraft);
 assert.equal((await resolveEveAgentResults(f.db,'alice',f.job(),key)).find(x=>x.child.id===f.source).supersededBy,null);
 await assert.rejects(f.prepare({sourceDelegationId:successor}),/最初のAgent/);
 const other=await f.child('also wrong');await assert.rejects(f.prepare({sourceDelegationId:other}),/上限/);
 assert.equal((await workStore(f.db).get('alice',f.job().id)).eveAgent.repairs.length,1);
});
void test('stop, owner mismatch, missing receipt, passed output, source corruption and changed criteria cannot grant repair',async t=>{
 const f=await setup(t);await assert.rejects(eveAgentWorkStore(f.db,'bob',f.keys,key).command({jobId:f.job().id,action:'prepare-repair',sourceDelegationId:f.source,revision:f.job().revision,commandId:uid()}),e=>e.status===404);
 const r=await f.prepare();await f.child('READY',r.repairDraft);
 f.sqlite.prepare('UPDATE agent_delegation_artifacts SET payload_ciphertext=? WHERE delegation_id=?').run('broken',f.source);
 assert.equal((await resolveEveAgentResults(f.db,'alice',f.job(),key)).find(x=>x.child.id===f.source).supersededBy,null);
 await assert.rejects(f.prepare(),/完全な保存本文/);
 const stopped=await f.eve.command({jobId:f.job().id,action:'stop',revision:f.job().revision,commandId:uid()});assert.equal(stopped.job.status,'cancelled');await assert.rejects(f.prepare(),/作業中/);
 const passed=await setup(t,'READY');await assert.rejects(passed.prepare(),/未達/);
 const missing=await setup(t);missing.sqlite.exec("DROP TRIGGER a2a_usage_receipt_immutable_delete");missing.sqlite.prepare('DELETE FROM a2a_usage_receipts WHERE delegation_id=?').run(missing.source);await assert.rejects(missing.prepare(),/receipt/);
 const changed=await setup(t);await changed.prepare();const altered={...changed.job(),eveAgent:{...changed.job().eveAgent,acceptance:{...changed.job().eveAgent.acceptance,maxChars:101}}};changed.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(altered),altered.id);await assert.rejects(changed.prepare(),/固定条件/);
});
void test('stop committed after repair inspection wins the persistence CAS; preparation cannot revive it',async t=>{
 const f=await setup(t),prepare=f.db.prepare;let fired=false;
 f.db.prepare=query=>{const statement=prepare(query);if(!query.startsWith('UPDATE work_jobs'))return statement;return {...statement,bind(...args){const bound=statement.bind(...args);return {...bound,async run(){if(!fired){fired=true;const stopped=requestEveAgentStop(f.job(),uid(),f.job().revision);f.sqlite.prepare('UPDATE work_jobs SET payload=?,revision=? WHERE id=?').run(JSON.stringify(stopped),stopped.revision,stopped.id);}return bound.run();}};}};};
 await assert.rejects(f.prepare(),/変更されました/);const saved=await workStore(f.db).get('alice',f.job().id);assert.ok(saved.eveAgent.stopRequestedAt);assert.equal(saved.eveAgent.repairs,undefined);assert.equal((await f.agents.listForParent('alice',saved.id)).length,1);
});
