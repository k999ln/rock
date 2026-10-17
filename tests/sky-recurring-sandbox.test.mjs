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
