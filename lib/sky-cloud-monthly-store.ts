import { WorkError } from './workflow.ts';
import { cloudMonthlySource } from './sky-cloud-monthly-source.ts';
import type { CloudMonthlyInvoice, MonthlyStripeTest } from './sky-cloud-monthly-stripe.ts';
import type Stripe from 'stripe';
type DB=Pick<D1Database,'prepare'|'batch'>;
export function skyCloudMonthlyStore(db:DB,accountId:string,now:()=>number=Date.now){
  async function get(owner:string,id:string){const row=await db.prepare('SELECT * FROM sky_cloud_monthly_invoices WHERE owner_id=? AND id=? AND stripe_account_id=?').bind(owner,id,accountId).first<CloudMonthlyInvoice>();if(!row)throw new WorkError('月次請求が見つかりません。',404);return row;}
  async function attach(owner:string,id:string,column:'stripe_customer_id'|'stripe_invoice_id'|'stripe_item_id',value:string){await db.prepare(`UPDATE sky_cloud_monthly_invoices SET ${column}=?,updated_at=? WHERE owner_id=? AND id=? AND stripe_account_id=? AND ${column} IS NULL AND status='submitting'`).bind(value,now(),owner,id,accountId).run();return get(owner,id);}
  async function reconcile(row:CloudMonthlyInvoice,provider:MonthlyStripeTest){
    const remote=await provider.retrieve(row);
    if(remote.id!==row.stripe_invoice_id||remote.livemode!==false||remote.customer!==row.stripe_customer_id||remote.metadata?.sky_monthly!==row.id||remote.currency.toUpperCase()!==row.currency||remote.total!==row.total_minor)
      throw new WorkError('Stripe請求とSky明細が一致しません。',409);
    let status='open';
    if(remote.status==='paid'){
      if(remote.amount_paid!==row.total_minor||remote.amount_remaining!==0)throw new WorkError('Stripe入金額が一致しません。',409);
      status='paid';
    } else if(remote.status==='void'||remote.status==='uncollectible')status='attention';
    else if(remote.status!=='open')throw new WorkError('Stripe請求は未確定です。',409);
    let url=remote.hosted_invoice_url??null;
    if(url){const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.hostname!=='invoice.stripe.com')url=null;}
    await db.prepare("UPDATE sky_cloud_monthly_invoices SET status=?,hosted_invoice_url=?,updated_at=? WHERE id=? AND stripe_account_id=? AND status!='paid'").bind(status,url,now(),row.id,accountId).run();
    return get(row.owner_id,row.id);
  }
  return {
    get,
    async snapshot(owner:string){
      const invoices=await db.prepare('SELECT * FROM sky_cloud_monthly_invoices WHERE owner_id=? AND stripe_account_id=? ORDER BY period DESC LIMIT 100').bind(owner,accountId).all();
      const items=await db.prepare('SELECT t.* FROM sky_cloud_monthly_items t JOIN sky_cloud_monthly_invoices i ON i.id=t.invoice_id WHERE t.owner_id=? AND i.stripe_account_id=? ORDER BY t.occurred_at DESC LIMIT 500').bind(owner,accountId).all();
      const llm=await db.prepare("SELECT 'remote_llm' AS kind,id,model_id AS provider,settled_minor AS amount,currency,updated_at AS occurredAt FROM remote_ai_text_executions WHERE owner_user_id=? AND state='completed' ORDER BY updated_at DESC LIMIT 100").bind(owner).all();
      const a2a=await db.prepare("SELECT 'a2a' AS kind,delegation_id AS id,provider_id AS provider,amount_minor AS amount,currency,issued_at AS occurredAt FROM a2a_usage_receipts WHERE owner_user_id=? ORDER BY issued_at DESC LIMIT 100").bind(owner).all();
      return {invoices:invoices.results,items:items.results,sources:[...llm.results,...a2a.results],mode:'stripe-test',productionBillingEnabled:false};
    },
    async importUsage(owner:string,kind:string,id:string){
      const source=await cloudMonthlySource(db,owner,kind,id);
      const previous=await db.prepare('SELECT i.*,t.source_digest FROM sky_cloud_monthly_items t JOIN sky_cloud_monthly_invoices i ON i.id=t.invoice_id WHERE t.source_kind=? AND t.source_id=? AND t.owner_id=?').bind(kind,id,owner).first<CloudMonthlyInvoice&{source_digest:string}>();
      if(previous){if(previous.stripe_account_id!==accountId||previous.source_digest!==source.digest)throw new WorkError('使用量は別の請求またはsandboxに記録済みです。',409);return previous;}
      const period=new Date(source.at).toISOString().slice(0,7);
      await db.prepare('INSERT INTO sky_cloud_monthly_invoices(id,owner_id,period,currency,stripe_account_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,period,currency,stripe_account_id) DO NOTHING').bind(crypto.randomUUID(),owner,period,source.currency,accountId,now(),now()).run();
      const row=await db.prepare('SELECT * FROM sky_cloud_monthly_invoices WHERE owner_id=? AND period=? AND currency=? AND stripe_account_id=?').bind(owner,period,source.currency,accountId).first<CloudMonthlyInvoice>();
      if(!row)throw new WorkError('月次請求を保存できません。',503);
      try{
        await db.prepare(`INSERT INTO sky_cloud_monthly_items(source_kind,source_id,invoice_id,owner_id,provider_id,provider_reference,amount_minor,currency,pricing_version,usage_json,source_digest,occurred_at)
          SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM sky_cloud_monthly_items WHERE source_kind=? AND source_id=?)`).bind(source.kind,source.id,row.id,owner,source.provider,source.reference,source.amount,source.currency,source.pricingVersion,JSON.stringify(source.usage),source.digest,source.at,kind,id).run();
      }catch{throw new WorkError('締め済み・重複使用量・合計上限を確認してください。',409);}
      const saved=await db.prepare('SELECT source_digest FROM sky_cloud_monthly_items WHERE source_kind=? AND source_id=? AND owner_id=?').bind(kind,id,owner).first<{source_digest:string}>();
      if(saved?.source_digest!==source.digest)throw new WorkError('使用量の保存が競合しました。',409);
      return get(owner,row.id);
    },
    async close(owner:string,id:string,expectedTotal:number,provider:MonthlyStripeTest){
      let row=await get(owner,id);
      if(row.total_minor!==expectedTotal||!Number.isSafeInteger(expectedTotal)||expectedTotal<=0)throw new WorkError('最新の請求額を確認してください。',409);
      if(row.status==='paid'||row.status==='open')return reconcile(row,provider);
      if(row.status==='attention')throw new WorkError('請求に確認が必要です。',409);
      await db.prepare("UPDATE sky_cloud_monthly_invoices SET status='submitting',submission_started_at=?,updated_at=? WHERE id=? AND owner_id=? AND stripe_account_id=? AND status='draft' AND total_minor=?").bind(now(),now(),id,owner,accountId,expectedTotal).run();
      row=await get(owner,id);
      if(row.status!=='submitting'||row.total_minor!==expectedTotal)throw new WorkError('請求確定が競合しました。',409);
      if(row.submission_started_at===null||now()-row.submission_started_at>23*3600000)throw new WorkError('再送安全期間を超えました。Stripe側を照合してください。',409);
      if(!row.stripe_customer_id)row=await attach(owner,id,'stripe_customer_id',await provider.customer(row));
      if(!row.stripe_invoice_id)row=await attach(owner,id,'stripe_invoice_id',await provider.invoice(row));
      if(!row.stripe_item_id)row=await attach(owner,id,'stripe_item_id',await provider.item(row));
      await provider.finalize(row);
      return reconcile(row,provider);
    },
    async reconcile(owner:string,id:string,provider:MonthlyStripeTest){const row=await get(owner,id);if(!row.stripe_invoice_id)throw new WorkError('Stripe請求はまだ作成されていません。',409);return reconcile(row,provider);},
    async webhook(raw:string,signature:string|null,provider:MonthlyStripeTest){
      const event=await provider.verifyEvent(raw,signature);
      if(!['invoice.paid','invoice.payment_failed','invoice.finalized','invoice.voided','invoice.marked_uncollectible'].includes(event.type))return {ignored:true};
      const object=event.data.object as Stripe.Invoice;
      const row=await db.prepare('SELECT * FROM sky_cloud_monthly_invoices WHERE stripe_invoice_id=? AND stripe_account_id=?').bind(object.id,accountId).first<CloudMonthlyInvoice>();
      if(!row)throw new WorkError('請求の保存を待って再送してください。',503);
      const old=await db.prepare('SELECT event_id FROM sky_cloud_monthly_events WHERE event_id=?').bind(event.id).first();
      if(old)return {duplicate:true};
      await reconcile(row,provider);
      await db.prepare('INSERT INTO sky_cloud_monthly_events(event_id,invoice_id,type,processed_at) VALUES(?,?,?,?) ON CONFLICT(event_id) DO NOTHING').bind(event.id,row.id,event.type,now()).run();
      return {received:true};
    },
  };
}
