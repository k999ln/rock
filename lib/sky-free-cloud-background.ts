import {freeCloudEnabled,runFreeCloudText,type FreeCloudRuntime} from './sky-free-cloud.ts';
import {workStore} from './work-store.ts';
import {WorkError,type WorkJob} from './workflow.ts';
type DB=Pick<D1Database,'prepare'|'batch'>;
export type BackgroundRuntime=FreeCloudRuntime & {SKY_FREE_CLOUD_BACKGROUND_ENABLED?:string;SKY_FREE_CLOUD_WAKE_KEY?:string};
export function backgroundEnabled(env:BackgroundRuntime,owner:string){return env.SKY_FREE_CLOUD_BACKGROUND_ENABLED==='true' && freeCloudEnabled(env,owner);}
export function backgroundView(job:WorkJob){const r=job.freeCloud!;return {id:job.id,createdAt:job.createdAt,state:r.state,model:r.model,retryAt:r.retryAt,retryDeadline:r.retryDeadline,attempts:r.attempts??0,text:r.text,reportedModel:r.reportedModel,providerResponseId:r.providerResponseId,inputTokens:r.inputTokens,outputTokens:r.outputTokens,chargeMinor:r.chargeMinor,error:r.error,background:!!r.backgroundConsent};}
export async function backgroundJobs(db:DB,owner:string){return (await workStore(db).list(owner)).filter(j=>typeof j.freeCloud?.backgroundPrompt==='string').slice(0,20).map(backgroundView);}
export async function cancelBackground(db:DB,owner:string,id:string){
 const store=workStore(db),job=await store.get(owner,id);
 if(!job?.freeCloud?.backgroundConsent)throw new WorkError('依頼が見つかりません。',404);
 if(!['queued','waiting'].includes(job.freeCloud.state))throw new WorkError('送信中または処理済みです。再送せず結果を確認してください。',409);
 if(!await store.update(owner,{...job,revision:job.revision+1,updatedAt:new Date().toISOString(),freeCloud:{...job.freeCloud,state:'cancelled',backgroundConsent:false}},job.revision))throw new WorkError('依頼が更新されました。再確認してください。',409);
}
export async function verifyWake(request:Request,key:string|undefined,now=Date.now()){
 const stamp=request.headers.get('x-sky-time')??'',hex=request.headers.get('x-sky-signature')??'';
 if(!key||key.length<32||!/^\d{13}$/.test(stamp)||Math.abs(now-Number(stamp))>120000||! /^[a-f0-9]{64}$/.test(hex))return false;
 if(await request.text()!=='{}')return false;
 const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',k,Uint8Array.from(hex.match(/../g)!,v=>parseInt(v,16)),new TextEncoder().encode(`${stamp}\nPOST\n/api/llm/free-cloud/tick\n{}`));
}
// One eligible job per wake. WorkJob CAS, not cron delivery count, owns the send.
export async function tickBackground(db:DB,env:BackgroundRuntime,refresh:()=>Promise<number>,fetcher:typeof fetch=fetch,now=Date.now()){
 const owner=env.SKY_FREE_CLOUD_OWNER_ID??'';
 if(!backgroundEnabled(env,owner))return {processed:0,disabled:true};
 const rows=await db.prepare("SELECT payload FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.freeCloud.backgroundConsent')=1 AND json_extract(payload,'$.freeCloud.state') IN ('queued','waiting') ORDER BY updated_at ASC LIMIT 20").bind(owner).all<{payload:string}>();
 for(const row of rows.results){
  const job=JSON.parse(row.payload) as WorkJob,r=job.freeCloud!;
  if(now>=(r.retryDeadline??0)){
   await workStore(db).update(owner,{...job,revision:job.revision+1,updatedAt:new Date().toISOString(),freeCloud:{...r,state:'unconfirmed',error:'バックグラウンド実行の期限が切れました。再送していません。'}},job.revision);continue;
  }
  if(r.state==='waiting'&&now<(r.retryAt??Infinity))continue;
  if(!r.backgroundPrompt||!r.backgroundConsent)continue;
  const planNow=await refresh();
  try{
   const result=await runFreeCloudText({db,owner,id:job.id,prompt:r.backgroundPrompt,model:r.model,consent:true,autoContinue:r.autoContinue,runtime:env,fetcher,clock:()=>planNow});
   return {processed:1,state:result.freeCloud?.state};
  }catch{return {processed:1,state:'blocked_or_unconfirmed'};}
 }
 return {processed:0};
}
