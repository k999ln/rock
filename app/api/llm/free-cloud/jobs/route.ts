import {env} from 'cloudflare:workers';
import {database} from '@/lib/fund-store';
import {authorizeRemoteAiRequest,RemoteAiGuardError} from '@/lib/remote-ai-guard';
import {backgroundJobs,cancelBackground,backgroundEnabled,type BackgroundRuntime} from '@/lib/sky-free-cloud-background';
import {WorkError} from '@/lib/workflow';
async function handle(request:Request){
 try{
  const db=database(),owner=await authorizeRemoteAiRequest(request,'free-cloud-jobs',db);
  if(request.method==='POST'){
   const raw=await request.text();if(raw.length>300)throw new WorkError('入力不正',400);
   const value=JSON.parse(raw);if(typeof value.id!=='string'||value.action!=='cancel')throw new WorkError('入力不正',400);
   await cancelBackground(db,owner,value.id);
  }
  return Response.json({enabled:backgroundEnabled(env as unknown as BackgroundRuntime,owner),jobs:await backgroundJobs(db,owner)},{headers:{'Cache-Control':'no-store, private'}});
 }catch(error){return Response.json({error:error instanceof RemoteAiGuardError&&error.code==='RATE_LIMITED'?'確認が集中しています。約1分後に再確認してください。':error instanceof WorkError?error.message:'本人認証を確認してください。'},{status:error instanceof WorkError||error instanceof RemoteAiGuardError?error.status:400});}
}
export const GET=handle;
export const POST=handle;
