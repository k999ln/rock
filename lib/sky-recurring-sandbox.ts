import Stripe from 'stripe';
import { WorkError } from './workflow.ts';
import { readMonthlyStripeConfig, monthlyStripeTest } from './sky-cloud-monthly-stripe.ts';
export const RECURRING_TEST_CONSENT = 'sky140-monthly-postpaid-sandbox-v1';
type DB = Pick<D1Database,'prepare'|'batch'>;
type Contract = {id:string;owner_id:string;stripe_account_id:string;customer_id:string;payment_method_id:string;payment_revision:number;consent_version:string;credit_minor:number;period_start:number;period_end:number;status:string;access_until:number;lease:string|null;lease_until:number};
type Charge = {id:string;contract_id:string;period_start:number;period_end:number;status:string;invoice_id:string|null;item_id:string|null;started_at:number;attempt_revision:number;attempt_key_revision:number;attempt_started_at:number|null};
export const nextRecurringMonth = (start:number) => {const d=new Date(start);d.setUTCMonth(d.getUTCMonth()+1);return d.getTime();};
/** Server-only, explicitly sandbox-only. Scheduler and webhook use the same durable collector. */
export function skyRecurringSandbox(db:DB, env:Record<string,unknown>, injected?:Stripe) {
 const config=readMonthlyStripeConfig(env);
 const stripe=injected??new Stripe(config.secretKey,{timeout:15000,maxNetworkRetries:0});
 const verifier=monthlyStripeTest(config,stripe);
 const test=<T extends {livemode?:boolean}>(o:T)=>{if(o.livemode!==false)throw new WorkError('本番objectは使えません。',409);return o;};
 const account=async()=>{if((await stripe.accounts.retrieve(null)).id!==config.accountId)throw new WorkError('Sandbox不一致',409);};
 async function contract(id:string){const c=await db.prepare('SELECT * FROM sky_recurring_contracts WHERE id=? AND stripe_account_id=?').bind(id,config.accountId).first<Contract>();if(!c)throw new WorkError('契約なし',404);return c;}
 async function charges(id:string){return (await db.prepare('SELECT * FROM sky_recurring_charges WHERE contract_id=? ORDER BY period_start').bind(id).all<Charge>()).results;}
 async function enroll(owner:string,customer:string,pm:string,start:number,consent:string){
  await account();const date=new Date(start);
  if(!owner||consent!==RECURRING_TEST_CONSENT||!Number.isSafeInteger(start)||date.toISOString().slice(8)!=='01T00:00:00.000Z')throw new WorkError('テスト同意・UTC月初が必要です。',409);
  test(await stripe.customers.retrieve(customer) as Stripe.Customer);
  const method=test(await stripe.paymentMethods.retrieve(pm));if(method.customer!==customer)throw new WorkError('支払方法不一致',409);
  const old=await db.prepare('SELECT * FROM sky_recurring_contracts WHERE owner_id=?').bind(owner).first<Contract>();
  if(old){if(old.stripe_account_id!==config.accountId||old.customer_id!==customer||old.consent_version!==consent)throw new WorkError('契約競合',409);return old;}
  const pending=await db.prepare("SELECT (SELECT COUNT(*) FROM remote_ai_text_executions WHERE owner_user_id=? AND state IN ('reserved','sending','unreconciled'))+(SELECT COUNT(*) FROM agent_delegation_budget_reservations WHERE owner_user_id=? AND state='held') AS n").bind(owner,owner).first<{n:number}>();if(pending?.n)throw new WorkError('既存の未確定実行を照合してから契約してください。',409);
  const id=crypto.randomUUID();await db.prepare(`INSERT INTO sky_recurring_contracts(id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,period_start,period_end,status,access_until,created_at,updated_at) VALUES(?,?,?,?,?,?,14000,?,?,'active',?,?,?)`).bind(id,owner,config.accountId,customer,pm,consent,start,nextRecurringMonth(start),Math.min(start+300000,nextRecurringMonth(start)),start,start).run();return contract(id);
 }
 async function tickOne(id:string,now:number){
  let c=await contract(id);if(['cancelled','disputed'].includes(c.status))return c;
  const lease=crypto.randomUUID();const wall=Date.now();
  const lock=await db.prepare("UPDATE sky_recurring_contracts SET lease=?,lease_until=?,status='collecting',access_until=0 WHERE id=? AND lease_until<? AND status NOT IN ('cancelled','disputed')").bind(lease,wall+120000,id,wall).run();
  if(lock.meta.changes!==1)return c;
  async function write(sql:string,values:unknown[]){const r=await db.prepare(sql).bind(...values).run();if(r.meta.changes!==1)throw new WorkError('契約が並行更新されました。',409);}
  const key=(r:Charge,op:string)=>`sky-recurring:${config.accountId}:${r.id}:${op}`;
  try {
   await account();c=await contract(id);
   if(c.period_end<=now){
    await db.prepare("INSERT INTO sky_recurring_charges(id,contract_id,period_start,period_end,status,started_at) VALUES(?,?,?,?,'creating',?) ON CONFLICT(contract_id,period_start) DO NOTHING").bind(crypto.randomUUID(),id,c.period_start,c.period_end,wall).run();
   }
   let allPaid=true;
   for(let r of await charges(id)){
    const safeRetry=wall-r.started_at<23*3600000;
    if(!r.invoice_id){
     if(!safeRetry)throw new WorkError('請求作成の再送期限超過。照合が必要です。',409);
     const remote=test(await stripe.invoices.create({customer:c.customer_id,currency:'usd',collection_method:'charge_automatically',auto_advance:false,pending_invoice_items_behavior:'exclude',metadata:{sky_recurring:r.id,sky_contract:id,period_start:String(r.period_start),period_end:String(r.period_end)}},{idempotencyKey:key(r,'invoice')}));
     await write('UPDATE sky_recurring_charges SET invoice_id=? WHERE id=? AND invoice_id IS NULL AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE id=? AND lease=?)',[remote.id,r.id,id,lease]);r={...r,invoice_id:remote.id};
    }
    if(!r.item_id){
     if(!safeRetry)throw new WorkError('明細再送期限超過',409);
     const item=test(await stripe.invoiceItems.create({customer:c.customer_id,invoice:r.invoice_id!,amount:14000,currency:'usd',discountable:false,description:'Sky 140 monthly postpaid — includes $100 usage — SANDBOX ONLY'},{idempotencyKey:key(r,'item')}));
     await write('UPDATE sky_recurring_charges SET item_id=? WHERE id=? AND item_id IS NULL AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE id=? AND lease=?)',[item.id,r.id,id,lease]);r={...r,item_id:item.id};
    }
    let invoice=test(await stripe.invoices.retrieve(r.invoice_id!));
    if(invoice.status==='draft')invoice=test(await stripe.invoices.finalizeInvoice(r.invoice_id!,{auto_advance:false},{idempotencyKey:key(r,'finalize')}));
    if(invoice.customer!==c.customer_id||invoice.currency!=='usd'||invoice.total!==14000||invoice.metadata?.sky_recurring!==r.id||invoice.metadata?.sky_contract!==id||invoice.metadata?.period_start!==String(r.period_start)||invoice.metadata?.period_end!==String(r.period_end))throw new WorkError('請求不一致',409);
    if(invoice.status==='open'&&r.attempt_revision<c.payment_revision){
     if(r.attempt_key_revision!==c.payment_revision){await write('UPDATE sky_recurring_charges SET attempt_key_revision=?,attempt_started_at=? WHERE id=? AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE id=? AND lease=?)',[c.payment_revision,wall,r.id,id,lease]);r={...r,attempt_key_revision:c.payment_revision,attempt_started_at:wall};}
     if(r.attempt_started_at===null||wall-r.attempt_started_at>=23*3600000)throw new WorkError('支払い再送期限超過。運営照合が必要です。',409);
     try {await stripe.invoices.pay(r.invoice_id!,{payment_method:c.payment_method_id,off_session:true},{idempotencyKey:key(r,`pay-${c.payment_revision}`)});}
     catch(error){if(!(error instanceof Stripe.errors.StripeCardError))throw error;}
     await write('UPDATE sky_recurring_charges SET attempt_revision=? WHERE id=? AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE id=? AND lease=?)',[c.payment_revision,r.id,id,lease]);
     invoice=test(await stripe.invoices.retrieve(r.invoice_id!));
    }
    const paid=invoice.status==='paid'&&invoice.amount_paid===14000&&invoice.amount_remaining===0;
    if(!paid)allPaid=false;
    await write("UPDATE sky_recurring_charges SET status=?,paid_at=? WHERE id=? AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE id=? AND lease=?)",[paid?'paid':invoice.status==='open'?'open':'attention',paid?now:null,r.id,id,lease]);
   }
   let start=c.period_start,end=c.period_end;
   if(allPaid&&end<=now){start=end;end=nextRecurringMonth(start);}
   const active=allPaid&&end>now;
   await write("UPDATE sky_recurring_contracts SET status=?,period_start=?,period_end=?,access_until=?,updated_at=? WHERE id=? AND lease=? AND status NOT IN ('cancelled','disputed')",[active?'active':'past_due',start,end,active?Math.min(now+300000,end):0,now,id,lease]);
   return contract(id);
  } finally {await db.prepare('UPDATE sky_recurring_contracts SET lease=NULL,lease_until=0 WHERE id=? AND lease=?').bind(id,lease).run();}
 }
 return {
  enroll,contract,charges,tickOne,
  async tick(now=Date.now()) {if(!Number.isSafeInteger(now)||now<0)throw new WorkError('時刻不正',409);const rows=await db.prepare("SELECT id FROM sky_recurring_contracts WHERE stripe_account_id=? AND status NOT IN ('cancelled','disputed')").bind(config.accountId).all<{id:string}>();const result=[];for(const row of rows.results){try{result.push(await tickOne(row.id,now));}catch{result.push({id:row.id,status:'collecting',error:'reconciliation_required'});}}return result;},
  async replacePaymentMethod(owner:string,id:string,pm:string){await account();const c=await contract(id);if(c.owner_id!==owner)throw new WorkError('本人不一致',403);const m=test(await stripe.paymentMethods.retrieve(pm));if(m.customer!==c.customer_id)throw new WorkError('支払方法不一致',409);const update=await db.prepare('UPDATE sky_recurring_contracts SET payment_method_id=?,payment_revision=payment_revision+1,access_until=0 WHERE id=? AND owner_id=? AND lease_until<?').bind(pm,id,owner,Date.now()).run();if(update.meta.changes!==1)throw new WorkError('請求処理中です。後で再試行してください。',409);return contract(id);},
  async webhook(raw:string,signature:string|null,now=Date.now()){
   const event=await verifier.verifyEvent(raw,signature);
   if(event.type.startsWith('invoice.')){const invoice=event.data.object as Stripe.Invoice;const row=await db.prepare('SELECT contract_id FROM sky_recurring_charges WHERE invoice_id=?').bind(invoice.id).first<{contract_id:string}>();if(row){await db.prepare("UPDATE sky_recurring_contracts SET access_until=0 WHERE id=?").bind(row.contract_id).run();return tickOne(row.contract_id,now);}}
   if(event.type==='charge.refunded'||event.type==='charge.dispute.created'){
    await account();const obj=event.data.object;const chargeId=event.type==='charge.refunded'?obj.id:(obj as Stripe.Dispute).charge;
    const charge=test(await stripe.charges.retrieve(typeof chargeId==='string'?chargeId:chargeId.id));
    await db.prepare("UPDATE sky_recurring_contracts SET status='disputed',access_until=0 WHERE customer_id=? AND stripe_account_id=?").bind(typeof charge.customer==='string'?charge.customer:'',config.accountId).run();
   }
   return {received:true};
  },
 };
}
