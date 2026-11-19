import test from 'node:test';
import assert from 'node:assert/strict';
import { eveAgentFixture } from './helpers/eve-agent-fixture.mjs';
import { eveAgentWorkStore } from '../lib/eve-agent-work.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { SkyPackageRuntimeBindingStore } from '../lib/sky-package-runtime-binding-store.ts';
import { skyPackageRuntimeBindingDigest } from '../lib/sky-package-runtime-binding.ts';
import { observeAgentUsageProvenance } from '../lib/sky-agent-usage-provenance.ts';
const uid=()=>crypto.randomUUID();
async function setup(t, withBinding=true) {
 const f=eveAgentFixture(t),owner='alice',job=(await eveAgentWorkStore(f.db,owner,f.keys).create({create:true,jobId:uid(),threadId:uid(),title:'Provenance'})).job,id=uid();
 const binding={schema:'rockstar-sky-package-runtime-binding/2',providerId:'provider',keyId:'key',bindingId:'binding',agentOrigin:'https://fixture.example',agentName:'agent',agentVersion:'1',agentCardSha256:'a'.repeat(64),packageKey:'fixture@1',manifestSha256:'b'.repeat(64),operationId:'run',runtime:'a2a-jsonrpc-1.0',runtimeExtensionUri:'https://fixture.example/extension',inputSchemaSha256:'c'.repeat(64),outputSchemaSha256:'d'.repeat(64),pricingVersion:'v1',requiredUsage:[{meter:'request',unit:'request'}],issuedAt:Date.now()-1000,expiresAt:Date.now()+60000,signature:'fixture'};
 // Synthetic already-verified-store inputs: this suite tests projection, not signature acceptance.
 if(withBinding) {
  await new SkyPackageRuntimeBindingStore(f.db).register(binding,'operator');
  f.sqlite.prepare('INSERT INTO sky_tool_packages(package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(binding.packageKey,'fixture','1','publisher','{}',binding.manifestSha256,'verified',1,1);
 }
 await a2aDelegationStore(f.db).prepare(owner,{id,parentJobId:job.id,idempotencyKey:uid(),messageId:uid(),targetOrigin:binding.agentOrigin,targetAgentName:binding.agentName,targetAgentVersion:'1',protocolVersion:'1.0',inputSha256:'a'.repeat(64),authorizationSha256:'b'.repeat(64),budgetCurrency:'USD',budgetLimitMinor:1,parentBudgetLimitMinor:2,continueWhileDeviceOffline:true,deadlineAt:Date.now()+60000,...(withBinding?{packageRuntimeBindingId:binding.bindingId,packageRuntimeBindingDigest:await skyPackageRuntimeBindingDigest(binding)}:{})});
 const receipt={ownerUserId:owner,parentJobId:job.id,delegationId:id,providerId:'provider',receiptId:'receipt-'+id,currency:'USD',amountMinor:1,pricingVersion:'v1',usage:[{meter:'request',unit:'request',quantity:1,amountMinor:1}]};
 f.sqlite.prepare('INSERT INTO a2a_usage_receipts(delegation_id,owner_user_id,parent_job_id,provider_id,provider_reference,receipt_json,currency,amount_minor,issued_at,received_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,owner,job.id,'provider',receipt.receiptId,JSON.stringify(receipt),'USD',1,Date.now(),Date.now());
 return {...f,owner,job,id,binding,read:()=>observeAgentUsageProvenance(f.db,owner,job.id,id)};
}
void test('same owner receipt traces to exact Package publisher and digest, without inventing remuneration or changing money',async t=>{
 const f=await setup(t),before=f.sqlite.prepare('SELECT * FROM a2a_usage_receipts').all(),budget=f.sqlite.prepare('SELECT * FROM agent_delegation_budget_pools').all();const a=await f.read(),b=await f.read();
 assert.deepEqual(a,b);assert.equal(a.status,'package_attributed');assert.equal(a.package.registeredPublisherId,'publisher');assert.equal(a.package.manifestSha256,f.binding.manifestSha256);assert.match(a.receiptSha256,/^[a-f0-9]{64}$/);assert.deepEqual(a.developerPayment,{status:'contract_not_bound',amountMinor:null});assert.deepEqual(f.sqlite.prepare('SELECT * FROM a2a_usage_receipts').all(),before);assert.deepEqual(f.sqlite.prepare('SELECT * FROM agent_delegation_budget_pools').all(),budget);
 assert.equal(await observeAgentUsageProvenance(f.db,'bob',f.job.id,f.id),null);assert.equal(await observeAgentUsageProvenance(f.db,f.owner,uid(),f.id),null);
});
void test('unbound Agent usage is visible, not assigned to a guessed author',async t=>{const f=await setup(t,false),x=await f.read();assert.equal(x.status,'agent_only');assert.equal(x.package,null);assert.equal(x.providerId,'provider');});
void test('changed Agent or binding digest and replaced Package cannot reattribute old usage',async t=>{
 const f=await setup(t);f.sqlite.prepare('UPDATE agent_delegations SET target_agent_name=? WHERE id=?').run('other',f.id);assert.equal((await f.read()).status,'package_unavailable');f.sqlite.prepare('UPDATE agent_delegations SET target_agent_name=? WHERE id=?').run('agent',f.id);
 f.sqlite.prepare('UPDATE sky_tool_packages SET manifest_sha256=?,user_id=? WHERE package_key=?').run('e'.repeat(64),'other-author',f.binding.packageKey);assert.equal((await f.read()).package,null);
 f.sqlite.prepare('UPDATE sky_tool_packages SET manifest_sha256=? WHERE package_key=?').run(f.binding.manifestSha256,f.binding.packageKey);
 f.sqlite.prepare('UPDATE agent_delegations SET package_runtime_binding_digest=? WHERE id=?').run('f'.repeat(64),f.id);assert.equal((await f.read()).status,'package_unavailable');
});
void test('revoked historical binding retains provenance and revocation state, never a payable amount',async t=>{
 const f=await setup(t);await new SkyPackageRuntimeBindingStore(f.db).revoke(f.binding.bindingId,'operator');const x=await f.read();assert.equal(x.status,'package_attributed');assert.equal(x.package.runtimeBindingStatus,'revoked');assert.equal(x.developerPayment.amountMinor,null);
});

void test('malformed historical binding keeps the receipt visible with attribution unavailable',async t=>{
 const f=await setup(t);const malformed={...f.binding};delete malformed.requiredUsage;f.sqlite.prepare('UPDATE sky_package_runtime_bindings SET binding_json=? WHERE binding_id=?').run(JSON.stringify(malformed),f.binding.bindingId);const x=await f.read();assert.equal(x.status,'package_unavailable');assert.equal(x.receiptReference,'receipt-'+f.id);assert.equal(x.developerPayment.amountMinor,null);
});

void test('sync captures the first source once; a later publisher change is a conflict and cannot reattribute the receipt',async t=>{
 const f=await setup(t),eve=eveAgentWorkStore(f.db,f.owner,f.keys);
 const a=await eve.command({jobId:f.job.id,action:'sync'}),b=await eve.command({jobId:f.job.id,action:'sync'});
 assert.equal(a.job.eveAgent.usageSources.length,1);assert.equal(a.job.revision,b.job.revision);assert.deepEqual(a.job.eveAgent.usageSources,b.job.eveAgent.usageSources);
 f.sqlite.prepare('UPDATE sky_tool_packages SET user_id=? WHERE package_key=?').run('replacement',f.binding.packageKey);
 const c=await eve.command({jobId:f.job.id,action:'sync'});assert.equal(c.children[0].usageSourceState,'source_conflict');assert.equal(c.children[0].usageProvenance.package.registeredPublisherId,'publisher');assert.deepEqual(c.job.eveAgent.usageSources,a.job.eveAgent.usageSources);assert.equal(c.job.revision,a.job.revision);
 assert.equal(c.children[0].usageProvenance.developerPayment.amountMinor,null);
});
void test('concurrent first capture uses the parent revision and permits one persistence only',async t=>{
 const f=await setup(t),eve=eveAgentWorkStore(f.db,f.owner,f.keys);
 const results=await Promise.allSettled([eve.command({jobId:f.job.id,action:'sync'}),eve.command({jobId:f.job.id,action:'sync'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failure=results.find(r=>r.status==='rejected');assert.equal(failure.reason.status,409);
 const saved=await eve.read(f.job.id);assert.equal(saved.job.eveAgent.usageSources.length,1);
});

void test('revocation after capture is shown without rewriting the captured source or granting money',async t=>{
 const f=await setup(t),eve=eveAgentWorkStore(f.db,f.owner,f.keys),a=await eve.command({jobId:f.job.id,action:'sync'});
 await new SkyPackageRuntimeBindingStore(f.db).revoke(f.binding.bindingId,'operator');const b=await eve.command({jobId:f.job.id,action:'sync'});
 assert.equal(b.children[0].usageBindingStatus,'revoked');assert.deepEqual(b.job.eveAgent.usageSources,a.job.eveAgent.usageSources);assert.equal(b.children[0].usageSourceState,'captured');
});
