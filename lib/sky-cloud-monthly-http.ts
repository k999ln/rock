import { readBoundedStream } from './bounded-stream.ts';
import { WorkError } from './workflow.ts';
import { monthlyStripeTest, readMonthlyStripeConfig } from './sky-cloud-monthly-stripe.ts';
import { skyCloudMonthlyStore } from './sky-cloud-monthly-store.ts';
export function cloudMonthlyTestAllowed(request:Request,mode:unknown){const url=new URL(request.url);return mode==='stripe-test'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);}
export async function handleCloudMonthlyTest(request:Request,owner:string|null,db:Pick<D1Database,'prepare'|'batch'>,env:Record<string,unknown>){
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 if(!cloudMonthlyTestAllowed(request,env.SKY_CLOUD_MONTHLY_MODE))return json({error:'Stripe test環境のみ利用できます。'},404);
 try{
  const config=readMonthlyStripeConfig(env);const provider=monthlyStripeTest(config);const store=skyCloudMonthlyStore(db,config.accountId);
  const webhook=new URL(request.url).pathname.endsWith('/webhook');
  if(!webhook&&!owner)return json({error:'本人確認が必要です。'},401);
  if(request.method==='GET'&&!webhook)return json(await store.snapshot(owner!));
  if(request.method!=='POST')return json({error:'METHOD'},405);
  if(!webhook&&request.headers.get('origin')!==new URL(request.url).origin)return json({error:'ORIGIN'},403);
  const reader=request.body?.getReader();if(!reader)throw new WorkError('入力がありません。');
  const raw=new TextDecoder().decode(await readBoundedStream(reader,200000,()=>new WorkError('入力上限です。',413)));
  if(webhook)return json(await store.webhook(raw,request.headers.get('stripe-signature'),provider));
  const body=JSON.parse(raw) as Record<string,unknown>;if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.id!=='string')throw new WorkError('入力を確認してください。');
  if(body.action==='import'&&typeof body.kind==='string')return json({invoice:await store.importUsage(owner!,body.kind,body.id)});
  if(body.action==='close'&&typeof body.expectedTotal==='number')return json({invoice:await store.close(owner!,body.id,body.expectedTotal,provider)});
  if(body.action==='reconcile')return json({invoice:await store.reconcile(owner!,body.id,provider)});
  throw new WorkError('操作を確認してください。');
 }catch(error){if(error instanceof WorkError)return json({error:error.message},error.status);if(error && typeof error==='object' && 'statusCode' in error && error.statusCode===403)return json({error:'Stripe sandboxの権限を確認してください。未引き取りのsandboxはclaim完了後に再試行してください。'},503);if(error instanceof SyntaxError)return json({error:'JSONを確認してください。'},400);return json({error:'Provider応答を確認できません。同じ請求IDで照合・再試行してください。'},503);}
}
