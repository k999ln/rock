import test from 'node:test';
import assert from 'node:assert/strict';
import {openMonthlySandboxDatabase} from '../scripts/sky-monthly-sandbox-db.mjs';
import {runFreeCloudText} from '../lib/sky-free-cloud.ts';
import {workStore} from '../lib/work-store.ts';
function setup(t){const db=openMonthlySandboxDatabase();t.after(()=>db.close());const now=Date.now();db.sqlite.prepare(`INSERT INTO sky_recurring_contracts(id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,period_start,period_end,status,access_until,created_at,updated_at) VALUES('fixture','owner','acct_fixture','cus_fixture','pm_fixture','synthetic',14000,?,?,'active',?,?,?)`).run(now-1000,now+3600000,now+300000,now,now);return db;}
function request(db,fetcher){return {db,owner:'owner',id:crypto.randomUUID(),prompt:'Synthetic test',model:'openai-fast',consent:true,runtime:{SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:'owner'},fetcher};}
const catalog=()=>Response.json([{name:'openai-fast',tier:'anonymous',input_modalities:['text'],output_modalities:['text']}]);
void test('confirmed free result records zero usage cost and does not resend a replay',async t=>{
 const db=setup(t);let sends=0;
 const input=request(db,async(url,init)=>{if(url.endsWith('/models'))return catalog();sends++;assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,undefined);return Response.json({id:'synthetic',model:'fixture',user_tier:'anonymous',choices:[{finish_reason:'stop',message:{content:'Test',tool_calls:[]}}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}});});
 const result=await runFreeCloudText(input);assert.equal(result.status,'review');assert.equal(result.freeCloud.chargeMinor,0);assert.equal(result.freeCloud.outputTokens,3);
 await runFreeCloudText(input);assert.equal(sends,1);
});
void test('missing usage and 402 remain unconfirmed with no payment or automatic retry',async t=>{
 for(const status of [200,402]) {const db=setup(t);let sends=0;const input=request(db,async url=>{if(url.endsWith('/models'))return catalog();sends++;return Response.json({choices:[{message:{content:'unverified'}}]}, {status});});
 await assert.rejects(runFreeCloudText(input));assert.equal((await workStore(db).get('owner',input.id)).freeCloud.state,'unconfirmed');await runFreeCloudText(input);assert.equal(sends,1);}
});
void test('unpaid and disabled owners cannot reach external provider',async t=>{
 const db=setup(t);let calls=0;const input=request(db,async()=>{calls++;return catalog();});
 await assert.rejects(runFreeCloudText({...input,consent:false}));
 db.sqlite.prepare("UPDATE sky_recurring_contracts SET status='past_due'").run();await assert.rejects(runFreeCloudText(input));assert.equal(calls,0);
});
void test('parallel callers get one send claim and malformed tool/tier responses fail closed',async t=>{
 const db=setup(t);let sends=0;const input=request(db,async url=>{if(url.endsWith('/models'))return catalog();sends++;return Response.json({id:'fixture',model:'fixture',user_tier:'paid',choices:[{finish_reason:'stop',message:{content:'bad',tool_calls:[{id:'tool'}]}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});});
 await Promise.allSettled([runFreeCloudText(input),runFreeCloudText(input)]);assert.equal(sends,1);assert.equal((await workStore(db).get('owner',input.id)).freeCloud.state,'unconfirmed');
});
void test('the shared 100 USD held allowance stops free Cloud before any network',async t=>{
 const db=setup(t),now=Date.now();
 const {createWorkJob}=await import('../lib/workflow.ts');const {a2aDelegationStore}=await import('../lib/a2a-delegation-store.ts');
 const parent=createWorkJob({id:crypto.randomUUID(),title:'Synthetic cap',templateId:'article'});await workStore(db).create('owner',parent);
 const store=a2aDelegationStore(db),delegation={id:crypto.randomUUID(),parentJobId:parent.id,idempotencyKey:'free-cap',messageId:'free-cap',targetOrigin:'https://agent.example.test',targetAgentName:'Synthetic agent',targetAgentVersion:'1',protocolVersion:'1.0',inputSha256:'a'.repeat(64),authorizationSha256:'b'.repeat(64),budgetCurrency:'USD',budgetLimitMinor:10000,parentBudgetLimitMinor:10000,continueWhileDeviceOffline:true,deadlineAt:now+60000};
 await store.prepare('owner',delegation,now);await store.approve('owner',delegation.id,delegation.authorizationSha256,{ciphertext:'fixture',nonce:'fixture',inputSha256:delegation.inputSha256,keyVersion:'aes-256-gcm-v1'},now);
 let calls=0;await assert.rejects(runFreeCloudText(request(db,async()=>{calls++;return catalog();})),/quota_exhausted/);assert.equal(calls,0);
});
void test('automatic selection includes Cloud only with consent, matching owner and active plan',async t=>{
 const {selectSkyModel}=await import('../lib/sky-model-selection.ts');const db=setup(t);let cloudGets=0;
 const fetcher=async url=>{if(url.startsWith('https://text.pollinations.ai/')){cloudGets++;return catalog();}throw Error('local unavailable');};
 const input={db,owner:'owner',prompt:'文章を作成',allowCloud:true,runtime:{SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:'owner'},fetcher};
 assert.equal((await selectSkyModel({...input,allowCloud:false})).selection,null);assert.equal(cloudGets,0);
 assert.equal((await selectSkyModel(input)).selection.provider,'pollinations');assert.equal(cloudGets,1);
 assert.equal((await selectSkyModel({...input,owner:'other'})).selection,null);assert.equal(cloudGets,1);
 db.sqlite.prepare("UPDATE sky_recurring_contracts SET status='past_due'").run();assert.equal((await selectSkyModel(input)).selection,null);assert.equal(cloudGets,1);
});
void test('free-only sandbox enrollment requires owner and consent, expires and never replaces a contract',async t=>{
 const {enrollFreeCloudSandbox}=await import('../lib/sky-free-cloud-sandbox.ts');
 const db=openMonthlySandboxDatabase();t.after(()=>db.close());const now=Date.now();
 const env={SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:'owner',SKY_FREE_CLOUD_SANDBOX_SETUP:'true'};
 await assert.rejects(enrollFreeCloudSandbox(db,'other',env,'synthetic-free-only-v1',now));
 await assert.rejects(enrollFreeCloudSandbox(db,'owner',{...env,SKY_FREE_CLOUD_SANDBOX_SETUP:'false'},'synthetic-free-only-v1',now));
 await assert.rejects(enrollFreeCloudSandbox(db,'owner',env,null,now));
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM sky_recurring_contracts').get().n,0);
 await enrollFreeCloudSandbox(db,'owner',env,'synthetic-free-only-v1',now);
 const before=db.sqlite.prepare('SELECT * FROM sky_recurring_contracts').get();assert.equal(before.access_until,now+3600000);assert.equal(before.stripe_account_id,'acct_fixture_free_only');
 await enrollFreeCloudSandbox(db,'owner',env,'synthetic-free-only-v1',now+1000);assert.deepEqual(db.sqlite.prepare('SELECT * FROM sky_recurring_contracts').get(),before);
 const {skyRecurringUsage}=await import('../lib/sky-recurring-plan.ts');assert.equal((await skyRecurringUsage(db,'owner',now+3600001)).reason,'verification_expired');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM sky_recurring_charges').get().n,0);
});
void test('edge-compatible manual redirect mode never follows redirected discovery or generation',async t=>{
 const {discoverFreeCloudModels}=await import('../lib/sky-free-cloud.ts');let count=0;
 await assert.rejects(discoverFreeCloudModels(async(_url,init)=>{count++;assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://other.invalid'}});}));assert.equal(count,1);
 const db=setup(t);let sends=0;await assert.rejects(runFreeCloudText(request(db,async(url,init)=>{assert.equal(init.redirect,'manual');if(url.endsWith('/models'))return catalog();sends++;return new Response(null,{status:307,headers:{Location:'https://other.invalid'}});})));assert.equal(sends,1);
});
