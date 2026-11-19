import test from 'node:test';
import assert from 'node:assert/strict';
import { eveAgentFixture } from './helpers/eve-agent-fixture.mjs';
import { eveAgentWorkStore } from '../lib/eve-agent-work.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { workStore } from '../lib/work-store.ts';
import { encryptA2AArtifact } from '../lib/a2a-input-crypto.ts';
import { parseEveAgentCriteria, inspectEveAgentResult } from '../lib/eve-agent-result-check.ts';
const key = 'ab'.repeat(32);
const criteria = { schema:'eve.agent-criteria/1',minChars:1,maxChars:100,requiredText:['READY'] };
async function setup(t, document = {schemaVersion:1,artifacts:[{textParts:['READY']}],truncated:false,omittedNonTextParts:0}) {
  const f=eveAgentFixture(t), eve=eveAgentWorkStore(f.db,'alice',f.keys,key), agents=a2aDelegationStore(f.db);
  const request={create:true,jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),title:'Bound result checks',acceptance:criteria};
  const {job}=await eve.create(request), id=crypto.randomUUID(), task='task-'+id;
  const input={id,parentJobId:job.id,idempotencyKey:crypto.randomUUID(),messageId:crypto.randomUUID(),targetOrigin:'https://fixture.example',targetAgentName:'fixture',targetAgentVersion:'1',protocolVersion:'1.0',inputSha256:'a'.repeat(64),authorizationSha256:'b'.repeat(64),budgetCurrency:'USD',budgetLimitMinor:0,parentBudgetLimitMinor:0,continueWhileDeviceOffline:true,deadlineAt:Date.now()+60000};
  await agents.prepare('alice',input); await agents.approve('alice',id,input.authorizationSha256,{ciphertext:'fixture',nonce:'fixture',inputSha256:input.inputSha256,keyVersion:'aes-256-gcm-v1'});
  let child=await agents.claimDispatch('alice',id);child=await agents.beginRemoteSend('alice',id,child.revision);child=await agents.recordTaskReceipt('alice',id,child.revision,{id:task,state:'TASK_STATE_COMPLETED'});
  async function save(doc) {const text=JSON.stringify(doc),encrypted=await encryptA2AArtifact(text,key,'alice',id,task);await agents.saveArtifact('alice',id,task,encrypted,new TextEncoder().encode(text).length);}
  await save(document);await agents.markArtifactsCaptured('alice',id,task,child.revision);
  const inspect=(owner='alice',parent=job.id,secret=key)=>inspectEveAgentResult(f.db,owner,parent,id,criteria,secret);
  return {...f,eve,agents,job,id,request,inspect,save};
}
void test('criteria are bounded, exact and fixed in initial owner job; changed replay never replaces them',async t=>{
  assert.throws(()=>parseEveAgentCriteria({...criteria,requiredText:['']}));
  assert.throws(()=>parseEveAgentCriteria({...criteria,maxChars:24001}));
  assert.throws(()=>parseEveAgentCriteria({...criteria,requiredText:Array(21).fill('x')}));
  assert.throws(()=>parseEveAgentCriteria({...criteria,execute:'shell'}));
  const f=await setup(t);assert.deepEqual(f.job.eveAgent.acceptance,criteria);
  await assert.rejects(f.eve.create({...f.request,acceptance:{...criteria,requiredText:[]}}),e=>e.status===409);
  assert.deepEqual((await f.eve.create(f.request)).job.eveAgent.acceptance,criteria);
});
void test('server checks decrypted owner/task/hash document and exact text; result claims do not grant quality or authority',async t=>{
  const f=await setup(t),r=await f.inspect();assert.equal(r.status,'passed');assert.equal(r.artifacts.length,1);
  assert.ok(r.checks.every(c=>c.passed));
  await assert.rejects(f.inspect('bob'),e=>e.status===404);
  await assert.rejects(f.inspect('alice',crypto.randomUUID()),e=>e.status===404);
  assert.equal((await f.inspect('alice',f.job.id,'cd'.repeat(32))).status,'failed');
  assert.equal((await inspectEveAgentResult(f.db,'alice',f.job.id,f.id,criteria)).status,'unavailable');
  const failed=await inspectEveAgentResult(f.db,'alice',f.job.id,f.id,{...criteria,requiredText:['missing']},key);
  assert.equal(failed.status,'failed');assert.deepEqual(failed.checks.at(-1),{name:'必須文言',passed:false,detail:'missing'});
  const summary=await f.eve.command({jobId:f.job.id,action:'sync'});assert.equal(summary.children[0].inspection.status,'passed');assert.equal(summary.job.status,'active');
});
for (const [name,doc] of [
  ['truncated',{schemaVersion:1,artifacts:[{textParts:['READY']}],truncated:true,omittedNonTextParts:0}],
  ['omitted files',{schemaVersion:1,artifacts:[{textParts:['READY']}],truncated:false,omittedNonTextParts:1}],
  ['malformed schema',{schemaVersion:1,artifacts:[{textParts:[{command:'run'}]}],truncated:false,omittedNonTextParts:0}],
  ['empty text',{schemaVersion:1,artifacts:[{textParts:[' ']}],truncated:false,omittedNonTextParts:0}],
]) void test((typeof name === 'string' ? name : 'invalid document')+' cannot pass independent result checks',async t=>{const f=await setup(t,doc);assert.equal((await f.inspect()).status,'failed');});
void test('artifact fingerprint fence rejects a new artifact arriving between verification and WorkJob CAS',async t=>{
  const f=await setup(t),works=workStore(f.db),r=await f.inspect(),fence=[{delegationId:f.id,artifacts:r.artifacts}];
  const job={...f.job,revision:f.job.revision+1};assert.equal(await works.update('alice',job,f.job.revision,fence),true);
  await f.save({schemaVersion:1,artifacts:[{textParts:['wrong replacement']}],truncated:false,omittedNonTextParts:0});
  assert.equal(await works.update('alice',{...job,revision:job.revision+1},job.revision,fence),false);
  assert.equal((await works.get('alice',job.id)).revision,job.revision);
});
