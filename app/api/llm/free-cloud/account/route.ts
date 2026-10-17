import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '@/lib/remote-ai-guard';
import { freeCloudEnabled, type FreeCloudRuntime } from '@/lib/sky-free-cloud';
import { enrollFreeCloudSandbox } from '@/lib/sky-free-cloud-sandbox';
import { skyRecurringUsage } from '@/lib/sky-recurring-plan';
import { WorkError } from '@/lib/workflow';
const headers={'Cache-Control':'no-store, private'};
async function handle(request:Request){
 try{
  const db=database(),owner=await authorizeRemoteAiRequest(request,'free-cloud-account',db);
  const runtime=env as unknown as FreeCloudRuntime & {SKY_FREE_CLOUD_SANDBOX_SETUP?:string};
  if(request.method==='POST'){
   const raw=await request.text();if(raw.length>200)throw new WorkError('入力が長すぎます。',413);
   await enrollFreeCloudSandbox(db,owner,runtime,(JSON.parse(raw) as {consent?:unknown}).consent);
  }
  let plan;try{plan=await skyRecurringUsage(db,owner);}catch{plan={reason:'not_configured'};}
  return Response.json({accountId:owner,enabled:freeCloudEnabled(runtime,owner),plan,contractLabel:'検証用の合成契約・請求なし。本番月額契約ではありません。'},{headers});
 }catch(error){return Response.json({error:error instanceof WorkError?error.message:'サインイン・操作権限を確認してください。'},{status:error instanceof WorkError||error instanceof RemoteAiGuardError?error.status:400,headers});}
}
export const GET=handle;
export const POST=handle;
