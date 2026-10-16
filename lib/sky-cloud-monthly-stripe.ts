import Stripe from 'stripe';
import { WorkError } from './workflow.ts';
import { verifyStripeSignature } from '../shared/stripe.mjs';
export type CloudMonthlyInvoice = { id:string; owner_id:string; period:string; currency:string; stripe_account_id:string; status:string; total_minor:number; stripe_customer_id:string|null; stripe_invoice_id:string|null; stripe_item_id:string|null; hosted_invoice_url:string|null; submission_started_at:number|null; created_at:number; updated_at:number };
export type MonthlyStripeConfig={ secretKey:string; accountId:string; webhookSecret:string };
export function readMonthlyStripeConfig(env:Record<string,unknown>):MonthlyStripeConfig {
  if(env.SKY_CLOUD_MONTHLY_MODE!=='stripe-test'||typeof env.SKY_MONTHLY_STRIPE_KEY!=='string'||!/^(sk|rk|rkcs)_test_[A-Za-z0-9]+$/.test(env.SKY_MONTHLY_STRIPE_KEY)||typeof env.SKY_MONTHLY_STRIPE_ACCOUNT!=='string'||!/^acct_[A-Za-z0-9]+$/.test(env.SKY_MONTHLY_STRIPE_ACCOUNT)||typeof env.SKY_MONTHLY_STRIPE_WEBHOOK_SECRET!=='string'||!/^whsec_[A-Za-z0-9]+$/.test(env.SKY_MONTHLY_STRIPE_WEBHOOK_SECRET))
    throw new WorkError('Stripe test設定が揃っていません。本番鍵は使えません。',503);
  return {secretKey:env.SKY_MONTHLY_STRIPE_KEY,accountId:env.SKY_MONTHLY_STRIPE_ACCOUNT,webhookSecret:env.SKY_MONTHLY_STRIPE_WEBHOOK_SECRET};
}
export function monthlyStripeTest(config:MonthlyStripeConfig, client?:Stripe) {
  // The same validation is enforced for direct callers and scripts.
  readMonthlyStripeConfig({SKY_CLOUD_MONTHLY_MODE:'stripe-test',SKY_MONTHLY_STRIPE_KEY:config.secretKey,SKY_MONTHLY_STRIPE_ACCOUNT:config.accountId,SKY_MONTHLY_STRIPE_WEBHOOK_SECRET:config.webhookSecret});
  const stripe=client??new Stripe(config.secretKey,{maxNetworkRetries:0,timeout:15000});
  const key=(row:CloudMonthlyInvoice,operation:string)=>`sky-monthly:${config.accountId}:${row.id}:${operation}`;
  function testObject<T extends {livemode?:boolean}>(value:T):T {if(value.livemode!==false)throw new WorkError('本番オブジェクトを拒否しました。',409);return value;}
  async function account(){const value=await stripe.accounts.retrieve(null);if(value.id!==config.accountId)throw new WorkError('Stripe sandboxが一致しません。',409);}
  return {
    async customer(row:CloudMonthlyInvoice){await account();return testObject(await stripe.customers.create({description:'Sky monthly usage test',email:'sky-monthly-test@example.com',metadata:{sky_monthly:row.id}},{idempotencyKey:key(row,'customer')})).id;},
    async invoice(row:CloudMonthlyInvoice){await account();const value=testObject(await stripe.invoices.create({customer:row.stripe_customer_id!,currency:row.currency.toLowerCase(),collection_method:'send_invoice',days_until_due:30,auto_advance:false,pending_invoice_items_behavior:'exclude',metadata:{sky_monthly:row.id,sky_period:row.period}},{idempotencyKey:key(row,'invoice')}));return value.id;},
    async item(row:CloudMonthlyInvoice){await account();const value=testObject(await stripe.invoiceItems.create({customer:row.stripe_customer_id!,invoice:row.stripe_invoice_id!,amount:row.total_minor,currency:row.currency.toLowerCase(),description:`Sky Agent usage ${row.period} (test only)`,discountable:false,metadata:{sky_monthly:row.id}},{idempotencyKey:key(row,'item')}));return value.id;},
    async finalize(row:CloudMonthlyInvoice){await account();return testObject(await stripe.invoices.finalizeInvoice(row.stripe_invoice_id!,{auto_advance:false},{idempotencyKey:key(row,'finalize')}));},
    async retrieve(row:CloudMonthlyInvoice){await account();return testObject(await stripe.invoices.retrieve(row.stripe_invoice_id!));},
    async verifyEvent(raw:string,signature:string|null){
      try { await verifyStripeSignature(raw,signature,config.webhookSecret); } catch { throw new WorkError('Webhook署名が一致しません。',400); }
      const event=JSON.parse(raw) as Stripe.Event;if(event.livemode!==false)throw new WorkError('本番イベントを拒否しました。',400);return event;
    },
  };
}
export type MonthlyStripeTest=ReturnType<typeof monthlyStripeTest>;
