// Explicit provider acceptance harness. No live keys, real Agent calls, or production scheduler.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import Stripe from 'stripe';
import {monthlyStripeTest,readMonthlyStripeConfig} from '../lib/sky-cloud-monthly-stripe.ts';
import {SKY140_TEST_VERSION,sky140TestMonthCharge,readSky140TestAccess} from '../lib/sky-140-collection-test.ts';

if(process.env.SKY140_SANDBOX_ACCEPTANCE!=='1')throw Error('Set SKY140_SANDBOX_ACCEPTANCE=1 for explicit test-only acceptance');
const config=readMonthlyStripeConfig(JSON.parse(readFileSync(process.env.SKY_CLOUD_MONTHLY_CONFIG_FILE,'utf8')));
const stripe=new Stripe(config.secretKey,{timeout:15000,maxNetworkRetries:0});
const identity=await stripe.accounts.retrieve(null);
if(identity.id!==config.accountId)throw Error('Sandbox account mismatch');
const file=resolve(process.env.SKY140_TEST_STATE||'work/sky-140-collection/state.json');
mkdirSync(dirname(file),{recursive:true,mode:0o700});
const state=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{
  runId:randomUUID(),startedAt:Date.now(),account:identity.id,mode:'stripe-test',
  productionBillingEnabled:false,actualCloudExecution:false,subscriptionCreated:false,
  scope:'Manual historical month-close, collection and access-policy acceptance harness; no production Agent enforcement',
  contract:null,operations:{},events:[],checks:[],status:'running',
};
if(state.account!==config.accountId||state.mode!=='stripe-test')throw Error('Saved account/mode mismatch');
function save(){writeFileSync(file+'.tmp',JSON.stringify(state,null,2),{mode:0o600});renameSync(file+'.tmp',file);}
save();
const key=name=>`sky140:${config.accountId}:${state.runId}:${name}`;
const testObject=o=>{if(o.livemode!==false)throw Error('Non-test object rejected');return o;};
async function step(name,fn){
  if(Object.hasOwn(state.operations,name))return state.operations[name];
  if(Date.now()-state.startedAt>23*3600000)throw Error('Idempotency retry window expired; reconcile saved IDs manually');
  const result=await fn(key(name));state.operations[name]=result;save();return result;
}
const budget={settledMinor:100,reservedMinor:0}; // Explicit synthetic $1 usage, not a model receipt.
async function decision(){return readSky140TestAccess(stripe,state.contract,state.contract.owner,budget,100);}
function check(name,passed,detail={}){if(state.checks.some(c=>c.name===name))return;if(!passed)throw Error(`Acceptance failed: ${name}`);if(!state.checks.some(c=>c.name===name))state.checks.push({name,passed,...detail});save();}
const verifier=monthlyStripeTest(config);
const htmlEscape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const server=createServer(async(req,res)=>{
  try{
    if(req.headers.host!=='127.0.0.1:5224'){res.writeHead(403);res.end();return;}
    if(req.method==='GET'&&req.url==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
      res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sky 140 — Sandbox検証</title><body style="font:18px system-ui;margin:40px auto;max-width:900px;padding:24px;background:#101827;color:#edf5ff"><p>SKY · STRIPE SANDBOX</p><h1>月額 $140 ／ Agent利用枠 $100</h1><p>本番課金なし。合成利用量・過去2か月の月末操作を使ったテストです。</p><h2>検証状態：${htmlEscape(state.status)}</h2><ul>${state.checks.map(c=>`<li style="margin:12px 0">✓ ${htmlEscape(c.name)}</li>`).join('')}</ul><p>署名通知：${state.events.length}件</p><h2>残る実装・受入</h2><p>顧客の契約同意、月次scheduler、実Agentへの権限制限、実Cloud使用量、税・与信・異議対応。本ページの利用判定はSandbox専用です。</p><p><a style="color:#96d7ff" href="/">最新状態に更新</a></p></body></html>`);return;
    }
    if(req.method!=='POST'||req.url!=='/webhook'){res.writeHead(404);res.end();return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>200000)throw Error('Body limit');chunks.push(chunk);}
    const event=await verifier.verifyEvent(Buffer.concat(chunks).toString('utf8'),req.headers['stripe-signature']??null);
    const contract=state.contract;const invoiceId=event.data.object.id;
    if(!contract?.invoices.some(i=>i.id===invoiceId)){res.writeHead(200);res.end('ignored');return;}
    if(!state.events.some(e=>e.id===event.id)){
      const access=await decision();
      state.events.push({id:event.id,type:event.type,invoice:invoiceId,access,at:new Date().toISOString()});save();
    }
    res.writeHead(200);res.end('verified');
  }catch{res.writeHead(400);res.end('Rejected or unavailable');}
});
server.listen(5224,'127.0.0.1',()=>console.log('Sky140 test report: http://127.0.0.1:5224/'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
async function invoiceFor(period){
  const charge=sky140TestMonthCharge(period,Date.now(),budget);
  const id=await step(`${period}:invoice`,async idempotencyKey=>testObject(await stripe.invoices.create({
    customer:state.contract.customer,currency:'usd',collection_method:'charge_automatically',auto_advance:false,
    pending_invoice_items_behavior:'exclude',metadata:{sky140_contract:state.contract.id,sky140_period:period,sky140_version:SKY140_TEST_VERSION},
  },{idempotencyKey})).id);
  if(!state.contract.invoices.some(i=>i.id===id)){state.contract.invoices.push({id,period});save();}
  await step(`${period}:item`,async idempotencyKey=>testObject(await stripe.invoiceItems.create({customer:state.contract.customer,invoice:id,amount:charge.fixedMinor,currency:'usd',discountable:false,description:`Sky 140 ${period} — TEST ONLY; $100 included, no extra usage charge`},{idempotencyKey})).id);
  await step(`${period}:finalize`,async idempotencyKey=>testObject(await stripe.invoices.finalizeInvoice(id,{auto_advance:false},{idempotencyKey})).id);
  const invoice=testObject(await stripe.invoices.retrieve(id));
  check(`${period}: 月末請求140ドル・枠内利用の追加請求0`,invoice.total===14000&&invoice.lines.data.length===1&&charge.extraUsageChargeMinor===0);
  return id;
}
async function card(name,token){return step(name,async idempotencyKey=>testObject(await stripe.paymentMethods.attach(token,{customer:state.contract.customer},{idempotencyKey})).id);}
async function pay(name,id,method){return step(name,async idempotencyKey=>{
  const result=testObject(await stripe.invoices.pay(id,{payment_method:method,off_session:true},{idempotencyKey}));
  if(result.status!=='paid'||result.amount_paid!==14000||result.amount_remaining!==0)throw Error('Payment mismatch');return {id:result.id,status:result.status,paid:result.amount_paid,remaining:result.amount_remaining};
});}
async function run(){
  if(state.status==='passed'){console.log('Saved passing acceptance report restored; no additional payment');return;}
  state.status='running';delete state.error;save();
  const customer=await step('customer',async idempotencyKey=>testObject(await stripe.customers.create({email:'sky140-test@example.com',description:'Sky140 explicit sandbox acceptance',metadata:{sky140_run:state.runId}},{idempotencyKey})).id);
  state.contract??={id:state.runId,owner:'synthetic-sky140-owner',account:config.accountId,customer,consentVersion:SKY140_TEST_VERSION,creditMinor:14000,state:'active',invoices:[]};save();
  check('有限与信140ドルのテスト契約で開始', (await decision()).allowed);
  const visa=await card('visa','pm_card_visa');
  const first=await invoiceFor('2026-08');
  await pay('2026-08:pay',first,visa);
  check('初月の140ドルをテストカードで全額回収',(await decision()).allowed);
  const second=await invoiceFor('2026-09');
  const decline=await card('decline-attached','pm_card_chargeCustomerFail');
  await step('2026-09:decline',async idempotencyKey=>{
    try{await stripe.invoices.pay(second,{payment_method:decline,off_session:true},{idempotencyKey});throw Error('Expected decline');}
    catch(error){if(error.type!=='StripeCardError'||error.code!=='card_declined')throw error;return {code:error.code,declineCode:error.decline_code};}
  });
  const denied=await decision();check('翌月の決済失敗で新規有料処理を拒否（テスト判定）',!denied.allowed&&denied.reason==='unpaid_or_unknown');
  check('古い支払済み請求があっても未払いを解除しない',!denied.allowed);
  check('制限中も成果export・支払い入口を保持',denied.exportAllowed&&denied.paymentAllowed);
  await pay('2026-09:recovery',second,visa);
  check('同じ請求の入金照合後に復旧（テスト判定）',(await decision()).allowed);
  for(let i=0;i<40&&!state.events.some(e=>e.type==='invoice.payment_failed');i++)await new Promise(r=>setTimeout(r,500));
  check('Stripe署名付きの決済失敗通知を受信',state.events.some(e=>e.type==='invoice.payment_failed'));
  for(let i=0;i<40&&!state.events.some(e=>e.type==='invoice.paid'&&e.invoice===second);i++)await new Promise(r=>setTimeout(r,500));
  check('Stripe署名付きの支払済み通知を受信',state.events.some(e=>e.type==='invoice.paid'&&e.invoice===second));
  state.status='passed';state.completedAt=new Date().toISOString();save();console.log(JSON.stringify({status:state.status,checks:state.checks.length,events:state.events.length,productionBillingEnabled:false}));
}
run().catch(error=>{state.status='needs_attention';state.error={type:error.type??error.name,code:error.code??null,message:error.type?'Stripe test request failed; inspect provider account':error.message};save();console.log(JSON.stringify(state.error));});
