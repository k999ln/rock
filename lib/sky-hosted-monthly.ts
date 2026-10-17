import Stripe from 'stripe';
import {WorkError} from './workflow.ts';
import {freeCloudEnabled,type FreeCloudRuntime} from './sky-free-cloud.ts';
import {readMonthlyStripeConfig,monthlyStripeTest} from './sky-cloud-monthly-stripe.ts';
import {skyRecurringSandbox,RECURRING_TEST_CONSENT} from './sky-recurring-sandbox.ts';
type DB=Pick<D1Database,'prepare'|'batch'>;
type Runtime=FreeCloudRuntime & Record<string,unknown>;
type Trial={owner_id:string;id:string;contract_id:string;old_contract_json:string;stripe_account_id:string;created_at:number;period_start:number;period_end:number;phase:string;fixture_minor:number;customer_id:string|null;fail_method_id:string|null;good_method_id:string|null};
export const HOSTED_MONTHLY_CONSENT='sky140-hosted-sandbox-v1';
export function hostedMonthlyEnabled(env:Runtime,owner:string){return env.SKY_HOSTED_MONTHLY_SANDBOX==='true'&&freeCloudEnabled(env,owner);}
export function hostedMonthlyService(db:DB,env:Runtime,injected?:Stripe){
 const config=readMonthlyStripeConfig(env),stripe=injected??new Stripe(config.secretKey,{httpClient:Stripe.createFetchHttpClient(),timeout:15000,maxNetworkRetries:0});
 const collector=skyRecurringSandbox(db,env,stripe);
 const trial=(owner:string)=>db.prepare('SELECT * FROM sky_hosted_monthly_tests WHERE owner_id=?').bind(owner).first<Trial>();
 const clock=(t:Trial)=>t.phase==='restored'?Date.now():t.phase==='unpaid'?t.period_end:t.period_end-1000;
 const test=<T extends {livemode?:boolean}>(v:T)=>{if(v.livemode!==false)throw new WorkError('本番objectを拒否しました。',409);return v;};
 async function authorize(owner:string){if(!hostedMonthlyEnabled(env,owner))throw new WorkError('本人限定Sandboxです。',403);if((await stripe.accounts.retrieve(null)).id!==config.accountId)throw new WorkError('Sandbox account不一致',409);}
 async function refresh(owner:string){const t=await trial(owner);if(!t)return null;await authorize(owner);if(t.phase==='migrating')throw new WorkError('契約移行を完了してください。',409);await collector.tickOne(t.contract_id,clock(t));return clock(t);}
 async function action(owner:string,action:string,consent:unknown){
  await authorize(owner);if(consent!==HOSTED_MONTHLY_CONSENT)throw new WorkError('Sandbox検証への明示同意が必要です。',400);
  if(!['migrate','cap','close-month','pay'].includes(action))throw new WorkError('操作不正',400);
  let t=await trial(owner);
  if(!t){
   if(action!=='migrate')throw new WorkError('月次契約へ切り替えてください。',409);
   const old=await db.prepare('SELECT * FROM sky_recurring_contracts WHERE owner_id=?').bind(owner).first<Record<string,unknown>>();
   if(!old||old.consent_version!=='synthetic-free-only-v1'||old.stripe_account_id!=='acct_fixture_free_only')throw new WorkError('既存契約が移行対象ではありません。上書きしません。',409);
   const pending=await db.prepare("SELECT (SELECT COUNT(*) FROM sky_recurring_charges WHERE contract_id=?)+(SELECT COUNT(*) FROM remote_ai_text_executions WHERE owner_user_id=? AND state IN ('reserved','sending','unreconciled'))+(SELECT COUNT(*) FROM agent_delegation_budget_reservations WHERE owner_user_id=? AND state='held') n").bind(old.id,owner,owner).first<{n:number}>();
   if(pending?.n)throw new WorkError('未確定の請求・予約を先に照合してください。',409);
   const date=new Date(),end=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1),start=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-1,1);
   await db.prepare("INSERT INTO sky_hosted_monthly_tests(owner_id,id,contract_id,old_contract_json,stripe_account_id,created_at,period_start,period_end) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner_id) DO NOTHING").bind(owner,crypto.randomUUID(),old.id,JSON.stringify(old),config.accountId,Date.now(),start,end).run();t=(await trial(owner))!;
  }
  if(t.stripe_account_id!==config.accountId)throw new WorkError('移行先account不一致',409);
  const lock=crypto.randomUUID(),wall=Date.now();
  const claim=await db.prepare('UPDATE sky_hosted_monthly_tests SET lease=?,lease_until=? WHERE owner_id=? AND lease_until<?').bind(lock,wall+120000,owner,wall).run();if(claim.meta.changes!==1)throw new WorkError('処理中です。完了後に確認してください。',409);
  try{
   t=(await trial(owner))!;
   if(action==='migrate'&&t.phase==='migrating'){
    if(wall-t.created_at>23*3600000)throw new WorkError('移行の再送期限超過。運営照合が必要です。',409);
    const key=(op:string)=>({idempotencyKey:`sky-hosted:${config.accountId}:${t!.id}:${op}`});
    const customer=t.customer_id??test(await stripe.customers.create({description:'Owner-authorized Sky monthly SANDBOX migration'},key('customer'))).id;
    await db.prepare('UPDATE sky_hosted_monthly_tests SET customer_id=? WHERE owner_id=? AND lease=?').bind(customer,owner,lock).run();
    const fail=t.fail_method_id??test(await stripe.paymentMethods.attach('pm_card_chargeCustomerFail',{customer},key('fail'))).id;
    await db.prepare('UPDATE sky_hosted_monthly_tests SET fail_method_id=? WHERE owner_id=? AND lease=?').bind(fail,owner,lock).run();
    const good=t.good_method_id??test(await stripe.paymentMethods.attach('pm_card_visa',{customer},key('good'))).id;
    await db.prepare('UPDATE sky_hosted_monthly_tests SET good_method_id=? WHERE owner_id=? AND lease=?').bind(good,owner,lock).run();
    const old=JSON.parse(t.old_contract_json) as Record<string,unknown>;
    const changes=await db.batch([
     db.prepare("UPDATE sky_recurring_contracts SET stripe_account_id=?,customer_id=?,payment_method_id=?,consent_version=?,period_start=?,period_end=?,status='active',access_until=?,updated_at=? WHERE owner_id=? AND id=? AND stripe_account_id='acct_fixture_free_only' AND consent_version='synthetic-free-only-v1' AND updated_at=? AND lease_until=0").bind(config.accountId,customer,fail,RECURRING_TEST_CONSENT,t.period_start,t.period_end,t.period_end,wall,owner,t.contract_id,old.updated_at),
     db.prepare("UPDATE sky_hosted_monthly_tests SET phase='active' WHERE owner_id=? AND lease=? AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE id=? AND stripe_account_id=? AND customer_id=? AND consent_version=?)").bind(owner,lock,t.contract_id,config.accountId,customer,RECURRING_TEST_CONSENT),
    ]);if(changes.some(r=>r.meta.changes!==1))throw new WorkError('既存契約が変更されたため移行を保留しました。',409);
   }else if(action==='cap'&&t.phase==='active'){
    await db.prepare("UPDATE sky_hosted_monthly_tests SET fixture_minor=10000,phase='capped' WHERE owner_id=? AND lease=?").bind(owner,lock).run();
   }else if(action==='close-month'&&t.phase==='capped'){
    await db.prepare("UPDATE sky_hosted_monthly_tests SET phase='unpaid' WHERE owner_id=? AND lease=?").bind(owner,lock).run();
   }else if(action==='pay'&&t.phase==='unpaid'){
    const invoices=await collector.charges(t.contract_id);if(invoices.length!==1||!invoices[0].invoice_id)throw new WorkError('月締め請求を先に確認してください。',409);
    const c=await collector.contract(t.contract_id);if(c.payment_method_id!==t.good_method_id)await collector.replacePaymentMethod(owner,t.contract_id,t.good_method_id!);
    await collector.tickOne(t.contract_id,t.period_end);
    const paid=await collector.contract(t.contract_id);if(paid.status!=='active'||paid.period_start!==t.period_end)throw new WorkError('入金照合中です。復旧は未確認です。',409);
    await db.prepare("UPDATE sky_hosted_monthly_tests SET phase='restored' WHERE owner_id=? AND lease=?").bind(owner,lock).run();
   }else if(!((action==='migrate'&&t.phase!=='migrating')||(action==='cap'&&t.phase==='capped')||(action==='close-month'&&t.phase==='unpaid')||(action==='pay'&&t.phase==='restored')))throw new WorkError('検証の順序が一致しません。',409);
  }finally{await db.prepare('UPDATE sky_hosted_monthly_tests SET lease=NULL,lease_until=0 WHERE owner_id=? AND lease=?').bind(owner,lock).run();}
  await refresh(owner);return status(owner);
 }
 async function status(owner:string){if(!hostedMonthlyEnabled(env,owner))throw new WorkError('本人限定Sandboxです。',403);const t=await trial(owner);if(!t)return {phase:'not_migrated',productionBilling:false};const c=await collector.contract(t.contract_id);return {phase:t.phase,clock:clock(t),status:c.status,periodStart:c.period_start,periodEnd:c.period_end,fixtureMinor:t.fixture_minor,oldContractPreserved:true,charges:(await collector.charges(t.contract_id)).map(r=>({status:r.status,invoiceId:r.invoice_id,monthlyMinor:14000})),productionBilling:false};}
 return {action,status,refresh,async webhook(raw:string,signature:string|null){const event=await monthlyStripeTest(config,stripe).verifyEvent(raw,signature);const invoice=event.data.object as Stripe.Invoice;if(!event.type.startsWith('invoice.'))return {received:true};const t=await db.prepare('SELECT t.* FROM sky_hosted_monthly_tests t JOIN sky_recurring_charges c ON c.contract_id=t.contract_id WHERE c.invoice_id=?').bind(invoice.id).first<Trial>();if(!t)return {received:true};await authorize(t.owner_id);await collector.webhook(raw,signature,clock(t));await db.prepare('INSERT INTO sky_hosted_monthly_events(id,type,invoice_id,processed_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(event.id,event.type,invoice.id,Date.now()).run();return {received:true};}};
}
export async function hostedMonthlyClock(db:DB,env:Runtime,owner:string){if(!hostedMonthlyEnabled(env,owner))return Date.now();return (await hostedMonthlyService(db,env).refresh(owner))??Date.now();}
