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

void test('402 cooldown is distinguished from an upstream refusal without retry timing',async t=>{
 for (const retry of [null,'30','injected invalid value']) {
  const db=setup(t);let sends=0;
  const input=request(db,async url=>{if(url.endsWith('/models'))return catalog();sends++;return new Response(null,{status:402,headers:retry?{'Retry-After':retry}:{}});});
  await assert.rejects(runFreeCloudText(input),retry==='30'?/待機指定: 30秒/:/待機時間の指定がありません/);
  await runFreeCloudText(input);assert.equal(sends,1);
 }
});

void test('confirmed cooldown resumes one same-id generation after deadline under parallel calls, with no charges',async t=>{
 const db=setup(t);let wall=Date.now(),sends=0;
 const input={...request(db,async url=>{if(url.endsWith('/models'))return catalog();sends++;if(sends===1)return Response.json({error:{code:'FREE_LIMIT'}},{status:402,headers:{'Retry-After':'30'}});return Response.json({id:'one-response',model:'fixture',user_tier:'anonymous',choices:[{finish_reason:'stop',message:{content:'Done'}}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}});}),autoContinue:true,retryClock:()=>wall};
 const waiting=await runFreeCloudText(input);assert.equal(waiting.freeCloud.state,'waiting');assert.equal(waiting.freeCloud.retryAt,wall+30000);
 await Promise.all([runFreeCloudText(input),runFreeCloudText(input)]);assert.equal(sends,1);
 wall+=30000;
 await runFreeCloudText({...input,autoContinue:false});assert.equal(sends,1);
 await Promise.all([runFreeCloudText(input),runFreeCloudText(input)]);assert.equal(sends,2);
 const done=await runFreeCloudText(input);assert.equal(done.freeCloud.state,'completed');assert.equal(done.freeCloud.attempts,2);assert.equal(done.freeCloud.chargeMinor,0);assert.equal(sends,2);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM sky_recurring_charges').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n,1);
});
void test('cooldown does not bypass revoked consent, expired time, changed prompt, or unpaid plan',async t=>{
 const db=setup(t);let wall=Date.now(),sends=0;
 const input={...request(db,async url=>{if(url.endsWith('/models'))return catalog();sends++;return Response.json({error:{code:'FREE_LIMIT'}},{status:402,headers:{'Retry-After':'1'}});}),autoContinue:true,retryClock:()=>wall};
 await runFreeCloudText(input);wall+=1000;
 await assert.rejects(runFreeCloudText({...input,consent:false}));
 await assert.rejects(runFreeCloudText({...input,prompt:'changed'}));
 db.sqlite.prepare("UPDATE sky_recurring_contracts SET status='past_due'").run();await assert.rejects(runFreeCloudText(input));assert.equal(sends,1);
 db.sqlite.prepare("UPDATE sky_recurring_contracts SET status='active'").run();wall+=600000;await runFreeCloudText(input);assert.equal(sends,1);
});
void test('automatic continuation is bounded and never retries ambiguous or non-FREE_LIMIT errors',async t=>{
 for(const kind of ['unknown','timeout','limit']){
  const db=setup(t);let wall=Date.now(),sends=0;
  const input={...request(db,async url=>{if(url.endsWith('/models'))return catalog();sends++;if(kind==='timeout')throw Error('lost response');return Response.json({error:{code:kind==='limit'?'FREE_LIMIT':'OTHER'}},{status:402,headers:{'Retry-After':'1'}});}),autoContinue:true,retryClock:()=>wall};
  for(let i=0;i<8;i++){await runFreeCloudText(input).catch(()=>{});wall+=1000;}
  assert.equal(sends,kind==='limit'?5:1);assert.equal((await workStore(db).get('owner',input.id)).freeCloud.state,'unconfirmed');
 }
});
void test('HTTP exposes durable same-id countdown and early duplicate does not send again',async t=>{
 const {freeCloudTextHttp}=await import('../lib/sky-free-cloud-http.ts');const db=setup(t);let sends=0;
 const value={id:crypto.randomUUID(),prompt:'Countdown',model:'openai-fast',consent:true,autoContinue:true};
 const http=()=>freeCloudTextHttp(new Request('https://example.test/api/llm/free-cloud',{method:'POST',body:JSON.stringify(value)}),db,'owner',{SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:'owner'},async url=>{if(url.endsWith('/models'))return catalog();sends++;return Response.json({error:{code:'FREE_LIMIT'}},{status:402,headers:{'Retry-After':'30'}});});
 const first=await http();assert.equal(first.status,202);const a=await first.json();assert.equal(a.id,value.id);assert.equal(a.attempts,1);assert.ok(a.retryAt>Date.now());
 const second=await http();assert.equal(second.status,202);assert.deepEqual(await second.json(),a);assert.equal(sends,1);
});
void test('durable queue survives a new caller, overlapping wakes and history replay without new charges',async t=>{
 const {tickBackground,backgroundJobs}=await import('../lib/sky-free-cloud-background.ts');const db=setup(t);let sends=0;
 const env={SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:'owner',SKY_FREE_CLOUD_BACKGROUND_ENABLED:'true'};
 const fetcher=async url=>{if(url.endsWith('/models'))return catalog();sends++;if(sends===1)return Response.json({error:{code:'FREE_LIMIT'}},{status:402,headers:{'Retry-After':'1'}});return Response.json({id:'background-once',model:'fixture',user_tier:'anonymous',choices:[{finish_reason:'stop',message:{content:'Persisted'}}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}});};
 const input={...request(db,fetcher),enqueue:true,autoContinue:true,runtime:env};
 assert.equal((await runFreeCloudText(input)).freeCloud.state,'queued');assert.equal(sends,0);
 await Promise.all([tickBackground(db,env,async()=>Date.now(),fetcher),tickBackground(db,env,async()=>Date.now(),fetcher)]);assert.equal(sends,1);
 await tickBackground(db,env,async()=>Date.now(),fetcher);assert.equal(sends,1);
 db.sqlite.prepare("UPDATE work_jobs SET payload=json_set(payload,'$.freeCloud.retryAt',0)").run();
 await Promise.all([tickBackground(db,env,async()=>Date.now(),fetcher),tickBackground(db,env,async()=>Date.now(),fetcher)]);assert.equal(sends,2);
 await tickBackground(db,env,async()=>Date.now(),fetcher);await runFreeCloudText(input);assert.equal(sends,2);
 const history=await backgroundJobs(db,'owner');assert.equal(history.length,1);assert.equal(history[0].text,'Persisted');assert.equal(history[0].attempts,2);assert.equal((await backgroundJobs(db,'other')).length,0);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM sky_recurring_charges').get().n,0);
});
void test('background cancellation and expiry prevent subsequent sending',async t=>{
 const {tickBackground,cancelBackground}=await import('../lib/sky-free-cloud-background.ts');const db=setup(t);let sends=0;
 const env={SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:'owner',SKY_FREE_CLOUD_BACKGROUND_ENABLED:'true'};
 const fetcher=async url=>{if(url.endsWith('/models'))return catalog();sends++;throw Error('must not send');};
 const input={...request(db,fetcher),enqueue:true,autoContinue:true,runtime:env};await runFreeCloudText(input);
 await assert.rejects(cancelBackground(db,'other',input.id));await cancelBackground(db,'owner',input.id);await tickBackground(db,env,async()=>Date.now(),fetcher);assert.equal(sends,0);
 await runFreeCloudText({...input,id:crypto.randomUUID()});await tickBackground(db,env,async()=>Date.now(),fetcher,Date.now()+600001);assert.equal(sends,0);
});
void test('wake requires a fresh signature and fixed body',async()=>{
 const {verifyWake}=await import('../lib/sky-free-cloud-background.ts');const key='synthetic-only-not-a-secret-0123456789';const stamp=String(Date.now());
 const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(`${stamp}\nPOST\n/api/llm/free-cloud/tick\n{}`))),x=>x.toString(16).padStart(2,'0')).join('');
 const request=body=>new Request('https://example.test/api/llm/free-cloud/tick',{method:'POST',headers:{'x-sky-time':stamp,'x-sky-signature':sig},body});
 assert.equal(await verifyWake(request('{}'),key),true);assert.equal(await verifyWake(request('{"owner":"other"}'),key),false);assert.equal(await verifyWake(request('{}'),key,Number(stamp)+120001),false);assert.equal(await verifyWake(request('{}'),'wrong'),false);
});
