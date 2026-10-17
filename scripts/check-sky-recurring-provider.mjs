import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import Stripe from 'stripe';
import {openMonthlySandboxDatabase} from './sky-monthly-sandbox-db.mjs';
import {startRecurringSandbox} from './sky-recurring-sandbox-server.mjs';
import {seedMonthlyCloudFixture} from './sky-cloud-monthly-fixture.mjs';
import {RECURRING_TEST_CONSENT,nextRecurringMonth} from '../lib/sky-recurring-sandbox.ts';
import {readMonthlyStripeConfig} from '../lib/sky-cloud-monthly-stripe.ts';
if(process.env.SKY_RECURRING_SANDBOX!=='1')throw Error('Explicit sandbox acceptance required');
const env=JSON.parse(readFileSync(process.env.SKY_CLOUD_MONTHLY_CONFIG_FILE,'utf8'));
const config=readMonthlyStripeConfig(env),stripe=new Stripe(config.secretKey,{timeout:15000,maxNetworkRetries:0});
assert.equal((await stripe.accounts.retrieve(null)).id,config.accountId);
const dir=resolve(process.env.SKY_RECURRING_DIR||'work/sky-recurring-sandbox');mkdirSync(dir,{recursive:true,mode:0o700});
const stateFile=dir+'/acceptance.json';
const state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{run:randomUUID(),startedAt:Date.now(),account:config.accountId,checks:[],operations:{},status:'running',productionBillingEnabled:false,actualCloudExecution:false};
assert.equal(state.account,config.accountId);
function save(){writeFileSync(stateFile,JSON.stringify(state,null,2),{mode:0o600});}
async function step(name,fn){if(state.operations[name])return state.operations[name];assert.ok(Date.now()-state.startedAt<23*3600000,'reconcile expired run before retry');const out=await fn(`recurring-acceptance:${state.run}:${name}`);state.operations[name]=out;save();return out;}
const db=openMonthlySandboxDatabase(dir+'/state.sqlite');
const start=Date.UTC(2026,9,1),end=nextRecurringMonth(start);let now=state.clock??end-1000;
const clock=value=>{now=value;state.clock=value;save();};
const onEvent=e=>{state.events??=[];if(!state.events.some(v=>v.id===e.id))state.events.push(e);save();};
let app=await startRecurringSandbox({db,env,clock:()=>now,interval:state.status==='passed'?30000:1000,onEvent,eventHistory:state.events??=[],report:()=>({status:state.status,checks:state.checks})});
const check=name=>{if(!state.checks.includes(name))state.checks.push(name);save();console.log(name);};
async function until(fn){const stop=Date.now()+90000;while(Date.now()<stop){if(await fn())return;await new Promise(r=>setTimeout(r,300));}throw Error('Timed out waiting for scheduler');}
try{
 if(state.status!=='passed'){
  const customer=await step('customer',async key=>(await stripe.customers.create({name:'Sky recurring sandbox fixture',email:'sky-monthly-test@example.com',metadata:{test_run:state.run}},{idempotencyKey:key})).id);
  const fail=await step('fail-method',async key=>(await stripe.paymentMethods.attach('pm_card_chargeCustomerFail',{customer},{idempotencyKey:key})).id);
  const good=await step('good-method',async key=>(await stripe.paymentMethods.attach('pm_card_visa',{customer},{idempotencyKey:key})).id);
  const owner=`recurring-fixture-${state.run}`;
  const c=await app.service.enroll(owner,customer,fail,start,RECURRING_TEST_CONSENT);state.contract=c.id;save();
  // Interrupted tests retain their DB and Stripe IDs; each check resumes at its last completed stage.
  if(!state.checks.includes('未払いで実Agent予約・最終送信を停止')){
   clock(end-1000);await until(async()=>(await app.service.contract(c.id)).access_until>now);
   assert.equal((await app.service.charges(c.id)).length,0);check('前払いなし・月締め前の請求ゼロ');
   const queued=await seedMonthlyCloudFixture(db,owner,{now,stage:'sending'});state.queued=queued.id;save();
   clock(end);await until(async()=>(await app.service.contract(c.id)).status==='past_due');
   await assert.rejects(queued.store.claimProviderSend(owner,queued.id,now),/SKY_RECURRING_ACCESS_BLOCKED/);
   const draft=await seedMonthlyCloudFixture(db,owner,{now,stage:'quoted'});await assert.rejects(draft.store.reserve(owner,draft.id,draft.approval,now));
   assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM remote_ai_text_send_claims').get().n,0);
   check('未払いで実Agent予約・最終送信を停止');
  }
  if(!state.checks.includes('同じ請求の入金照合後にAgent送信を復旧')){
   await until(async()=>{try{await app.service.replacePaymentMethod(owner,c.id,good);return true;}catch{return false;}});
   await until(async()=>(await app.service.contract(c.id)).status==='active');
   const {RemoteAiTextStore}=await import('../lib/remote-ai-text-store.ts');const store=new RemoteAiTextStore(db);
   assert.equal(await store.claimProviderSend(owner,state.queued,now),true);assert.equal(await store.claimProviderSend(owner,state.queued,now),false);
   check('同じ請求の入金照合後にAgent送信を復旧');
  }
  clock(nextRecurringMonth(end));await until(async()=>{const rows=await app.service.charges(c.id);return rows.length===2&&rows.every(r=>r.status==='paid')&&(await app.service.contract(c.id)).status==='active';});
  const rows=await app.service.charges(c.id);state.invoices=[];
  for(const row of rows){const i=await stripe.invoices.retrieve(row.invoice_id);assert.equal(i.livemode,false);assert.equal(i.total,14000);assert.equal(i.amount_paid,14000);assert.equal(i.lines.data.length,1);state.invoices.push({id:i.id,total:i.total,paid:i.amount_paid,livemode:i.livemode});}
  check('独立した2か月をタイマーで自動決済・各140ドル・利用量二重請求なし');
  await until(async()=>state.events?.some(e=>e.type==='invoice.payment_failed'&&rows.some(r=>r.invoice_id===e.objectId))&&state.events?.some(e=>e.type==='invoice.paid'&&rows.some(r=>r.invoice_id===e.objectId)));
  check('実Stripeの支払失敗・入金通知を署名検証して再照合');
  await app.close();app=await startRecurringSandbox({db,env,clock:()=>now,interval:state.status==='passed'?30000:1000,onEvent,eventHistory:state.events??=[],report:()=>({status:state.status,checks:state.checks})});
  await app.cycle();assert.equal((await app.service.charges(c.id)).length,2);
  const actual=await stripe.invoices.list({customer,limit:100});assert.equal(actual.data.length,2);
  check('再起動後も契約・請求を保持し重複請求なし');state.status='passed';save();
 }
 console.log('Sandbox acceptance: '+state.status+' — http://127.0.0.1:5225/');
}catch(error){state.status='failed';state.error={type:error?.type??error?.name,code:error?.code??null,message:error?.type?'Provider error; inspect secure local dashboard':error?.message};save();console.error(JSON.stringify(state.error));process.exitCode=1;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void app.close().then(()=>{db.close();process.exit(process.exitCode||0);}));
