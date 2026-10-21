import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import Stripe from 'stripe';
import {openMonthlySandboxDatabase} from './sky-monthly-sandbox-db.mjs';
import {startRecurringSandbox} from './sky-recurring-sandbox-server.mjs';
import {seedMonthlyCloudFixture} from './sky-cloud-monthly-fixture.mjs';
import {RECURRING_TEST_CONSENT} from '../lib/sky-recurring-sandbox.ts';
import {readMonthlyStripeConfig} from '../lib/sky-cloud-monthly-stripe.ts';
import {selectSkyModel} from '../lib/sky-model-selection.ts';
import {runFreeCloudText} from '../lib/sky-free-cloud.ts';
import {skyRecurringUsage} from '../lib/sky-recurring-plan.ts';
if(process.env.SKY_MONTHLY_FREE_CLOUD!=='1')throw Error('Explicit monthly sandbox and free-only Cloud opt-in required');
const env=JSON.parse(readFileSync(process.env.SKY_CLOUD_MONTHLY_CONFIG_FILE,'utf8'));
const config=readMonthlyStripeConfig(env),stripe=new Stripe(config.secretKey,{timeout:15000,maxNetworkRetries:0});
assert.equal((await stripe.accounts.retrieve(null)).id,config.accountId);
const dir=resolve(process.env.SKY_MONTHLY_FREE_DIR||'work/sky-monthly-free-cloud');mkdirSync(dir,{recursive:true,mode:0o700});
const file=dir+'/acceptance.json',wall=new Date(),end=Date.UTC(wall.getUTCFullYear(),wall.getUTCMonth(),1),start=Date.UTC(wall.getUTCFullYear(),wall.getUTCMonth()-1,1);
const state=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{run:randomUUID(),startedAt:Date.now(),account:config.accountId,start,end,clock:end-1000,checks:[],operations:{},events:[],network:{catalogGets:0,cloudPosts:0},status:'running',productionBilling:false};
assert.equal(state.account,config.accountId);const save=()=>writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600});
const db=openMonthlySandboxDatabase(dir+'/state.sqlite'),owner='monthly-free-'+state.run;
const runtime={SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:owner};
const fetcher=async(url,init)=>{if(!String(url).startsWith('https://text.pollinations.ai/'))throw Error('No local model in this free-cloud acceptance');if(init?.method==='POST')state.network.cloudPosts++;else state.network.catalogGets++;save();return fetch(url,init);};
const clock=()=>state.status==='passed'?Date.now():state.clock;
const onEvent=e=>{if(!state.events.some(v=>v.id===e.id))state.events.push(e);save();};
const app=await startRecurringSandbox({db,env,clock,port:5228,interval:30000,eventHistory:state.events,onEvent,report:()=>state,freeCloud:{owner,runtime,fetcher}});
const service=app.service;
async function step(name,fn){if(state.operations[name])return state.operations[name];assert.ok(Date.now()-state.startedAt<23*3600000,'reconcile expired run before retry');const value=await fn(`monthly-free:${state.run}:${name}`);state.operations[name]=value;save();return value;}
const check=name=>{if(!state.checks.includes(name))state.checks.push(name);save();console.log(name);};
const select=()=>selectSkyModel({db,owner,prompt:'合成検証です。3 + 4 の答えを日本語で一文だけ返してください。',allowCloud:true,runtime,fetcher,clock});
async function realReply(stage){
 if(state[stage])return;
 const selection=(await select()).selection;assert.equal(selection?.provider,'pollinations');
 state.requestIds??={};state.requestIds[stage]??=randomUUID();save();
 const input={db,owner,id:state.requestIds[stage],prompt:'合成検証です。3 + 4 の答えを日本語で一文だけ返してください。',model:selection.model,consent:true,runtime,fetcher,clock};
 const job=await runFreeCloudText(input);assert.equal(job.freeCloud.state,'completed');assert.equal(job.freeCloud.chargeMinor,0);
 const posts=state.network.cloudPosts;await runFreeCloudText(input);assert.equal(state.network.cloudPosts,posts);
 state[stage]={...job.freeCloud,jobId:job.id,selection};save();
}
async function blocked(reason){const before={...state.network};assert.equal((await select()).cloudStatus,reason);await assert.rejects(runFreeCloudText({db,owner,id:randomUUID(),prompt:'Synthetic blocked request',model:'openai-fast',consent:true,runtime,fetcher,clock}),new RegExp(reason));assert.deepEqual(state.network,before);}
try{
 if(state.status!=='passed'){
  const customer=await step('customer',async key=>(await stripe.customers.create({name:'Sky monthly free Cloud SANDBOX',metadata:{test_run:state.run}},{idempotencyKey:key})).id);
  const fail=await step('fail',async key=>(await stripe.paymentMethods.attach('pm_card_chargeCustomerFail',{customer},{idempotencyKey:key})).id);
  const good=await step('good',async key=>(await stripe.paymentMethods.attach('pm_card_visa',{customer},{idempotencyKey:key})).id);
  const c=await service.enroll(owner,customer,fail,state.start,RECURRING_TEST_CONSENT);state.contract=c.id;save();
  if(!state.checks.includes('100ドル到達後は無料Cloudの選択・送信とも外部通信ゼロで停止')){
   await app.cycle();await realReply('beforeCap');check('月次Sandbox契約で自動選択・無料Cloud実応答・再送なし');
   if(!state.quota){const existing=db.sqlite.prepare("SELECT id FROM remote_ai_text_executions WHERE owner_user_id=? AND state='completed' AND settled_minor=10000").get(owner);state.quota=existing??await seedMonthlyCloudFixture(db,owner,{now:clock(),exactAmountMinor:10000});save();}
   await blocked('quota_exhausted');await app.cycle();await blocked('quota_exhausted');
   check('100ドル到達後は無料Cloudの選択・送信とも外部通信ゼロで停止');
  }
  if(!state.checks.includes('月締め140ドルのテスト支払失敗で未払い停止')){
   state.clock=state.end;save();await app.cycle();assert.equal((await service.contract(c.id)).status,'past_due');await blocked('payment_or_contract_blocked');check('月締め140ドルのテスト支払失敗で未払い停止');
  }
  if(!state.checks.includes('同じ請求の入金照合・次月更新で100ドル枠と無料Cloud実応答を復旧')){
   await service.replacePaymentMethod(owner,c.id,good);await app.cycle();assert.equal((await service.contract(c.id)).status,'active');
   const plan=await skyRecurringUsage(db,owner,clock());assert.equal(plan.remainingMinor,10000);assert.equal(plan.periodStart,state.end);
   const old=db.sqlite.prepare("SELECT SUM(settled_minor) AS amount FROM remote_ai_text_executions WHERE owner_user_id=? AND state='completed'").get(owner);assert.equal(old.amount,10000);
   await realReply('afterPayment');check('同じ請求の入金照合・次月更新で100ドル枠と無料Cloud実応答を復旧');
  }
  const rows=await service.charges(c.id);assert.equal(rows.length,1);const invoice=await stripe.invoices.retrieve(rows[0].invoice_id);assert.equal(invoice.livemode,false);assert.equal(invoice.total,14000);assert.equal(invoice.amount_paid,14000);assert.equal(invoice.lines.data.length,1);state.invoice={id:invoice.id,total:invoice.total,paid:invoice.amount_paid,livemode:invoice.livemode};save();
  const until=Date.now()+90000;while(Date.now()<until&&(!state.events.some(e=>e.type==='invoice.paid'&&e.objectId===invoice.id)||!state.events.some(e=>e.type==='invoice.payment_failed'&&e.objectId===invoice.id)))await new Promise(r=>setTimeout(r,500));
  assert.ok(state.events.some(e=>e.type==='invoice.paid'&&e.objectId===invoice.id));assert.ok(state.events.some(e=>e.type==='invoice.payment_failed'&&e.objectId===invoice.id));check('実Stripe署名通知の失敗・入金を照合、請求は140ドルの1件だけ');
  state.clock=Date.now();await app.cycle();assert.equal((await skyRecurringUsage(db,owner,state.clock)).reason,'available');state.status='passed';save();
 }
 console.log('Monthly free Cloud sandbox: http://127.0.0.1:5228/');
}catch(error){state.status='failed';state.error=error?.type?'Stripe sandbox operation failed':error.message;save();console.error(state.error);process.exitCode=1;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void app.close().then(()=>{db.close();process.exit(process.exitCode||0);}));
