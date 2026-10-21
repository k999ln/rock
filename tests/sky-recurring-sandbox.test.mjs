import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {createHmac} from 'node:crypto';
import {openMonthlySandboxDatabase} from '../scripts/sky-monthly-sandbox-db.mjs';
import {seedMonthlyCloudFixture} from '../scripts/sky-cloud-monthly-fixture.mjs';
import {skyRecurringSandbox,RECURRING_TEST_CONSENT,nextRecurringMonth} from '../lib/sky-recurring-sandbox.ts';
const start=Date.UTC(2026,9,1),end=nextRecurringMonth(start);
const env={SKY_CLOUD_MONTHLY_MODE:'stripe-test',SKY_MONTHLY_STRIPE_KEY:'sk_test_fixture',SKY_MONTHLY_STRIPE_ACCOUNT:'acct_fixture',SKY_MONTHLY_STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
function provider(){const invoices=new Map(),items=new Map(),keys=new Map();let failRead=false;let count=0;const calls=[];
 const client={accounts:{retrieve:async()=>{if(failRead)throw Error('offline');return {id:'acct_fixture'};}},customers:{retrieve:async id=>({id,livemode:false})},paymentMethods:{retrieve:async id=>({id,livemode:false,customer:'cus_fixture'})},invoices:{
 create:async(body,o)=>{calls.push('create');if(keys.has(o.idempotencyKey))return invoices.get(keys.get(o.idempotencyKey));const id=`in_${++count}`;const i={id,...body,total:0,status:'draft',livemode:false,amount_paid:0,amount_remaining:0};invoices.set(id,i);keys.set(o.idempotencyKey,id);return i;},
 retrieve:async id=>({...invoices.get(id)}),finalizeInvoice:async id=>{const i=invoices.get(id);i.status='open';i.amount_remaining=i.total;return {...i};},
 pay:async(id,p)=>{calls.push('pay');if(p.payment_method==='pm_fail')throw new Stripe.errors.StripeCardError({type:'card_error',code:'card_declined',message:'fixture'});const i=invoices.get(id);i.status='paid';i.amount_paid=i.total;i.amount_remaining=0;return {...i};}},
 invoiceItems:{create:async(body,o)=>{if(items.has(o.idempotencyKey))return items.get(o.idempotencyKey);invoices.get(body.invoice).total+=body.amount;const item={id:`ii_${items.size}`,livemode:false};items.set(o.idempotencyKey,item);return item;}}};return {client,calls,invoices,setOffline(v){failRead=v;}};
}
async function setup(t,pm='pm_good'){const db=openMonthlySandboxDatabase();t.after(()=>db.close());const p=provider();const service=skyRecurringSandbox(db,env,p.client);const c=await service.enroll('owner','cus_fixture',pm,start,RECURRING_TEST_CONSENT);return {db,p,service,c};}
void test('no upfront payment; scheduler closes each elapsed month once at 140 without usage surcharge',async t=>{const {service,c,p}=await setup(t);await service.tick(end-1);assert.equal(p.invoices.size,0);await Promise.all([service.tick(end),service.tick(end)]);assert.equal(p.invoices.size,1);assert.equal([...p.invoices.values()][0].total,14000);assert.equal((await service.contract(c.id)).period_start,end);await service.tick(end+1000);assert.equal(p.calls.filter(c=>c==='pay').length,1);await service.tick(nextRecurringMonth(end));assert.equal(p.invoices.size,2);});
void test('real LLM reserve and final send are fenced on nonpayment, and restored after readback',async t=>{
 const {service,c,db,p}=await setup(t,'pm_fail');await service.tick(end-1000);
 const queued=await seedMonthlyCloudFixture(db,'owner',{now:end-1000,stage:'sending'});
 await service.tick(end);assert.equal((await service.contract(c.id)).status,'past_due');
 await assert.rejects(queued.store.claimProviderSend('owner',queued.id,end),/SKY_RECURRING_ACCESS_BLOCKED/);
 const draft=await seedMonthlyCloudFixture(db,'owner',{now:end,stage:'quoted'});await assert.rejects(draft.store.reserve('owner',draft.id,draft.approval,end));
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM remote_ai_text_send_claims').get().n,0);
 await service.tick(end+1);assert.equal(p.calls.filter(c=>c==='pay').length,1);
 await service.replacePaymentMethod('owner',c.id,'pm_good');await service.tick(end+2);
 assert.equal((await service.contract(c.id)).status,'active');assert.equal(await queued.store.claimProviderSend('owner',queued.id,end+3),true);
 assert.equal(await queued.store.claimProviderSend('owner',queued.id,end+3),false);
 await draft.store.reserve('owner',draft.id,draft.approval,end+3);
});
void test('provider outage, cancelled/disputed contract and stale verification cannot grant access',async t=>{
 const {service,c,p,db}=await setup(t);await service.tick(start+1);p.setOffline(true);await service.tick(start+2);const q=await seedMonthlyCloudFixture(db,'owner',{now:start+3,stage:'quoted'});await assert.rejects(q.store.reserve('owner',q.id,q.approval,start+3));p.setOffline(false);await service.tick(start+4);
 for(const state of ['cancelled','disputed']){db.sqlite.prepare('UPDATE sky_recurring_contracts SET status=? WHERE id=?').run(state,c.id);await service.tick(start+5);assert.equal((await service.contract(c.id)).status,state);await assert.rejects(q.store.reserve('owner',q.id,q.approval,start+5));}
 db.sqlite.prepare("UPDATE sky_recurring_contracts SET status='active',access_until=? WHERE id=?").run(start+2,c.id);await assert.rejects(q.store.reserve('owner',q.id,q.approval,start+5));
});
void test('owner isolation, explicit consent and test keys are required',async t=>{
 const {service,c}=await setup(t);await assert.rejects(service.enroll('other','cus_fixture','pm_good',start,'none'));await assert.rejects(service.replacePaymentMethod('other',c.id,'pm_good'));assert.throws(()=>skyRecurringSandbox({}, {...env,SKY_MONTHLY_STRIPE_KEY:'sk_live_forbidden'}));
});
void test('newer payment cannot cover earlier unpaid invoice and metadata mismatch fails closed',async t=>{
 const {service,c,p}=await setup(t);await service.tick(end);const first=[...p.invoices.values()][0];first.status='open';first.amount_paid=0;first.amount_remaining=14000;await service.tick(nextRecurringMonth(end));assert.equal((await service.contract(c.id)).status,'past_due');first.metadata.sky_contract='other';await service.tick(nextRecurringMonth(end));assert.equal((await service.contract(c.id)).status,'collecting');
});
void test('signed webhook rechecks persisted invoices and duplicate events do not repay',async t=>{
 const {service,c,p}=await setup(t);await service.tick(end);const id=[...p.invoices.keys()][0];const raw=JSON.stringify({id:'evt_test',type:'invoice.paid',livemode:false,data:{object:{id}}});const time=Math.floor(Date.now()/1000);const sig=`t=${time},v1=${createHmac('sha256','whsec_fixture').update(`${time}.${raw}`).digest('hex')}`;
 await assert.rejects(service.webhook(raw,'bad',end));await service.webhook(raw,sig,end);await service.webhook(raw,sig,end);assert.equal((await service.contract(c.id)).status,'active');assert.equal(p.calls.filter(c=>c==='pay').length,1);
});
void test('included quota accounts for actual settled usage and concurrent pending reservations',async t=>{
 const {service,db}=await setup(t);await service.tick(start+1000);
 for(let n=0;n<90;n++)await seedMonthlyCloudFixture(db,'owner',{now:start+1000});
 const quotes=[];for(let n=0;n<10;n++)quotes.push(await seedMonthlyCloudFixture(db,'owner',{now:start+1000,stage:'quoted'}));
 const results=await Promise.allSettled(quotes.map(q=>q.store.reserve('owner',q.id,q.approval,start+1000)));
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.ok(results.some(r=>r.status==='rejected'));
 const total=db.sqlite.prepare("SELECT SUM(CASE WHEN state='completed' THEN settled_minor WHEN state='reserved' THEN maximum_charge_minor ELSE 0 END) amount FROM remote_ai_text_executions").get().amount;
 assert.ok(total<=10000&&total>9000);

});
void test('A2A approval and final remote send use the same unpaid fence and recover',async t=>{
 const {service,c,db}=await setup(t,'pm_fail');await service.tick(end-1000);
 const {a2aDelegationStore}=await import('../lib/a2a-delegation-store.ts');const {workStore}=await import('../lib/work-store.ts');const {createWorkJob}=await import('../lib/workflow.ts');
 const parent=crypto.randomUUID();await workStore(db).create('owner',createWorkJob({id:parent,title:'Recurring A2A test',templateId:'article'},new Date(end-1000).toISOString()));
 const store=a2aDelegationStore(db);
 const input={id:crypto.randomUUID(),parentJobId:parent,idempotencyKey:'recurring:a2a:1',messageId:'msg1',targetOrigin:'https://agent.example.test',targetAgentName:'Fixture agent',targetAgentVersion:'2.1',protocolVersion:'1.0',inputSha256:'a'.repeat(64),authorizationSha256:'b'.repeat(64),budgetCurrency:'USD',budgetLimitMinor:500,parentBudgetLimitMinor:2000,continueWhileDeviceOffline:true,deadlineAt:end+10000};
 const encrypted={ciphertext:'fixture',nonce:'fixture',inputSha256:input.inputSha256,keyVersion:'aes-256-gcm-v1'};
 await store.prepare('owner',input,end-1000);await store.approve('owner',input.id,input.authorizationSha256,encrypted,end-900);
 const claimed=await store.claimDispatch('owner',input.id,end-800);
 await service.tick(end);await assert.rejects(store.beginRemoteSend('owner',claimed.id,claimed.revision,end));
 const second={...input,id:crypto.randomUUID(),idempotencyKey:'recurring:a2a:2',messageId:'msg2'};await store.prepare('owner',second,end);
 await assert.rejects(store.approve('owner',second.id,second.authorizationSha256,encrypted,end));
 await service.replacePaymentMethod('owner',c.id,'pm_good');await service.tick(end+1);
 const sent=await store.beginRemoteSend('owner',claimed.id,claimed.revision,end+2);assert.equal(sent.state,'dispatch_submitting');
 await store.approve('owner',second.id,second.authorizationSha256,encrypted,end+2);
});
void test('monthly contract gates free auto-selection, exact quota, payment and renewal without clearing history',async t=>{
 const {selectSkyModel}=await import('../lib/sky-model-selection.ts');
 const {runFreeCloudText}=await import('../lib/sky-free-cloud.ts');
 const {skyRecurringUsage}=await import('../lib/sky-recurring-plan.ts');
 const {service,c,db}=await setup(t,'pm_fail');let now=end-1000,calls=0;
 const runtime={SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:'owner'};
 const fetcher=async url=>{if(!url.startsWith('https://text.pollinations.ai/'))throw Error('local unavailable');calls++;if(url.endsWith('/models'))return Response.json([{name:'openai-fast',tier:'anonymous',input_modalities:['text'],output_modalities:['text']}]);return Response.json({id:'fixture-free',model:'fixture',user_tier:'anonymous',choices:[{finish_reason:'stop',message:{content:'7'}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});};
 const select=()=>selectSkyModel({db,owner:'owner',prompt:'Synthetic',allowCloud:true,runtime,fetcher,clock:()=>now});
 const run=()=>runFreeCloudText({db,owner:'owner',id:crypto.randomUUID(),prompt:'Synthetic',model:'openai-fast',consent:true,runtime,fetcher,clock:()=>now});
 await service.tick(now);assert.equal((await select()).selection.provider,'pollinations');assert.equal((await run()).freeCloud.chargeMinor,0);
 await seedMonthlyCloudFixture(db,'owner',{now,exactAmountMinor:10000});
 const blocked=async reason=>{const before=calls;assert.equal((await select()).cloudStatus,reason);await assert.rejects(run(),new RegExp(reason));assert.equal(calls,before);};
 await blocked('quota_exhausted');await service.tick(now);await blocked('quota_exhausted');
 now=end;await service.tick(now);await blocked('payment_or_contract_blocked');
 await service.replacePaymentMethod('owner',c.id,'pm_good');await service.tick(now);
 assert.equal((await skyRecurringUsage(db,'owner',now)).remainingMinor,10000);
 assert.equal((await select()).selection.provider,'pollinations');assert.equal((await run()).freeCloud.chargeMinor,0);
 assert.equal(db.sqlite.prepare("SELECT SUM(settled_minor) AS n FROM remote_ai_text_executions WHERE state='completed'").get().n,10000);
 assert.equal((await service.charges(c.id)).length,1);
 // Holds survive period renewal, so payment cannot release unresolved usage.
 const held=await seedMonthlyCloudFixture(db,'owner',{now,exactAmountMinor:10000,stage:'reserved'});
 now=nextRecurringMonth(end);await service.tick(now);await blocked('quota_exhausted');
 await held.store.cancelBeforeSend('owner',held.id,held.approval,now);
 assert.equal((await skyRecurringUsage(db,'owner',now)).remainingMinor,10000);
});
void test('hosted migration preserves original contract and gates synthetic cap through payment recovery',async t=>{
 const {hostedMonthlyService,HOSTED_MONTHLY_CONSENT}=await import('../lib/sky-hosted-monthly.ts');
 const {enrollFreeCloudSandbox}=await import('../lib/sky-free-cloud-sandbox.ts');
 const {skyRecurringUsage}=await import('../lib/sky-recurring-plan.ts');
 const db=openMonthlySandboxDatabase();t.after(()=>db.close());
 const runtime={...env,SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:'owner',SKY_FREE_CLOUD_SANDBOX_SETUP:'true',SKY_HOSTED_MONTHLY_SANDBOX:'true'};
 await enrollFreeCloudSandbox(db,'owner',runtime,'synthetic-free-only-v1');
 const before=db.sqlite.prepare('SELECT * FROM sky_recurring_contracts').get();
 const p=provider();p.client.customers.create=async()=>({id:'cus_fixture',livemode:false});p.client.paymentMethods.attach=async id=>({id:id==='pm_card_visa'?'pm_good':'pm_fail',livemode:false});
 const service=hostedMonthlyService(db,runtime,p.client);
 const {runFreeCloudText}=await import('../lib/sky-free-cloud.ts');
 let cloudCalls=0;const blockedCloud=async reason=>{const now=await service.refresh('owner');await assert.rejects(runFreeCloudText({db,owner:'owner',id:crypto.randomUUID(),prompt:'Synthetic blocked',model:'openai-fast',consent:true,runtime,clock:()=>now,fetcher:async()=>{cloudCalls++;throw Error('unexpected Cloud request');}}),new RegExp(reason));assert.equal(cloudCalls,0);};
 await assert.rejects(service.action('other','migrate',HOSTED_MONTHLY_CONSENT));await assert.rejects(service.action('owner','migrate','bad'));
 await service.action('owner','migrate',HOSTED_MONTHLY_CONSENT);
 assert.deepEqual(JSON.parse(db.sqlite.prepare('SELECT old_contract_json FROM sky_hosted_monthly_tests').get().old_contract_json),{...before});
 assert.equal((await skyRecurringUsage(db,'owner',await service.refresh('owner'))).reason,'available');
 await service.action('owner','cap',HOSTED_MONTHLY_CONSENT);await blockedCloud('quota_exhausted');
 assert.equal((await skyRecurringUsage(db,'owner',await service.refresh('owner'))).reason,'quota_exhausted');
 await service.action('owner','migrate',HOSTED_MONTHLY_CONSENT);assert.equal((await service.status('owner')).phase,'capped');
 await service.action('owner','close-month',HOSTED_MONTHLY_CONSENT);await blockedCloud('payment_or_contract_blocked');
 assert.equal((await skyRecurringUsage(db,'owner',await service.refresh('owner'))).reason,'payment_or_contract_blocked');
 await service.action('owner','pay',HOSTED_MONTHLY_CONSENT);
 assert.equal((await service.status('owner')).phase,'restored');assert.equal((await skyRecurringUsage(db,'owner',await service.refresh('owner'))).remainingMinor,10000);
 await service.action('owner','pay',HOSTED_MONTHLY_CONSENT);assert.equal(p.invoices.size,1);assert.equal(p.calls.filter(x=>x==='pay').length,2);
 assert.equal(db.sqlite.prepare('SELECT fixture_minor FROM sky_hosted_monthly_tests').get().fixture_minor,10000);
 assert.equal(db.sqlite.prepare('SELECT id FROM sky_recurring_contracts').get().id,before.id);
 await service.action('owner','cap',HOSTED_MONTHLY_CONSENT);await blockedCloud('quota_exhausted');assert.equal(p.invoices.size,1);
 assert.throws(()=>hostedMonthlyService(db,{...runtime,SKY_MONTHLY_STRIPE_KEY:'sk_live_forbidden'},p.client));
});

void test('persisted waiting job stops at cap and unpaid, resumes after paid renewal once, and preserves repeated-cycle invoices',async t=>{
 const {hostedMonthlyService,HOSTED_MONTHLY_CONSENT}=await import('../lib/sky-hosted-monthly.ts');
 const {runFreeCloudText}=await import('../lib/sky-free-cloud.ts');
 const {tickBackground,backgroundJobs}=await import('../lib/sky-free-cloud-background.ts');
 const {skyRecurringUsage}=await import('../lib/sky-recurring-plan.ts');
 const {db,p,service,c}=await setup(t,'pm_fail');
 const runtime={...env,SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:'owner',SKY_FREE_CLOUD_BACKGROUND_ENABLED:'true',SKY_HOSTED_MONTHLY_SANDBOX:'true'};
 db.sqlite.prepare("INSERT INTO sky_hosted_monthly_tests(owner_id,id,contract_id,old_contract_json,stripe_account_id,created_at,period_start,period_end,phase,customer_id,fail_method_id,good_method_id) VALUES('owner','trial',?,'{\"preserved\":true}','acct_fixture',?,?,?,'active','cus_fixture','pm_fail','pm_good')").run(c.id,Date.now(),start,end);
 const hosted=hostedMonthlyService(db,runtime,p.client);let sends=0;
 const fetcher=async url=>{if(url.endsWith('/models'))return Response.json([{name:'openai-fast',tier:'anonymous',input_modalities:['text'],output_modalities:['text']}]);sends++;return sends===1?Response.json({error:{code:'FREE_LIMIT'}},{status:402,headers:{'Retry-After':'1'}}):Response.json({id:'once-after-renewal',model:'fixture',user_tier:'anonymous',choices:[{finish_reason:'stop',message:{content:'Recovered'}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});};
 const clock=await hosted.refresh('owner');const id=crypto.randomUUID();const input={db,owner:'owner',id,prompt:'Synthetic plan-gate test',model:'openai-fast',consent:true,autoContinue:true,enqueue:true,runtime,fetcher,clock:()=>clock};
 await runFreeCloudText(input);await tickBackground(db,runtime,()=>hosted.refresh('owner'),fetcher);assert.equal(sends,1);
 db.sqlite.prepare("UPDATE work_jobs SET payload=json_set(payload,'$.freeCloud.retryAt',0) WHERE id=?").run(id);
 await hosted.action('owner','cap',HOSTED_MONTHLY_CONSENT);
 assert.equal((await skyRecurringUsage(db,'owner',await hosted.refresh('owner'))).reason,'quota_exhausted');
 await tickBackground(db,runtime,()=>hosted.refresh('owner'),fetcher);await tickBackground(db,runtime,()=>hosted.refresh('owner'),fetcher);assert.equal(sends,1);
 await hosted.action('owner','close-month',HOSTED_MONTHLY_CONSENT);
 assert.equal((await service.contract(c.id)).status,'past_due');
 await tickBackground(db,runtime,()=>hosted.refresh('owner'),fetcher);assert.equal(sends,1);assert.equal((await service.charges(c.id)).length,1);
 const invoice=(await service.charges(c.id))[0].invoice_id;
 await hosted.action('owner','pay',HOSTED_MONTHLY_CONSENT);await hosted.action('owner','pay',HOSTED_MONTHLY_CONSENT);
 assert.equal((await skyRecurringUsage(db,'owner',await hosted.refresh('owner'))).remainingMinor,10000);
 await Promise.all([tickBackground(db,runtime,()=>hosted.refresh('owner'),fetcher),tickBackground(db,runtime,()=>hosted.refresh('owner'),fetcher)]);
 await tickBackground(db,runtime,()=>hosted.refresh('owner'),fetcher);await runFreeCloudText(input);assert.equal(sends,2);
 assert.equal((await backgroundJobs(db,'owner'))[0].state,'completed');assert.equal((await service.charges(c.id))[0].invoice_id,invoice);
 // A restored trial can test the next month without deleting the prior paid invoice.
 await hosted.action('owner','cap',HOSTED_MONTHLY_CONSENT);await hosted.action('owner','cap',HOSTED_MONTHLY_CONSENT);
 assert.equal((await skyRecurringUsage(db,'owner',await hosted.refresh('owner'))).reason,'quota_exhausted');
 await hosted.action('owner','close-month',HOSTED_MONTHLY_CONSENT);assert.equal((await service.contract(c.id)).status,'past_due');
 await hosted.action('owner','pay',HOSTED_MONTHLY_CONSENT);await hosted.action('owner','pay',HOSTED_MONTHLY_CONSENT);
 const invoices=await service.charges(c.id);assert.equal(invoices.length,2);assert.equal(new Set(invoices.map(x=>x.invoice_id)).size,2);assert.ok(invoices.every(x=>x.status==='paid'));assert.equal(invoices[0].invoice_id,invoice);
 assert.equal((await skyRecurringUsage(db,'owner',await hosted.refresh('owner'))).reason,'available');assert.equal(sends,2);
 assert.equal(db.sqlite.prepare("SELECT old_contract_json FROM sky_hosted_monthly_tests WHERE owner_id='owner'").get().old_contract_json,'{"preserved":true}');
});
