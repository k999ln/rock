import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '@/lib/remote-ai-guard';
import { cloudMonthlyTestAllowed,handleCloudMonthlyTest } from '@/lib/sky-cloud-monthly-http';
async function handle(request:Request){
 const runtime=env as unknown as Record<string,unknown>;
 if(!cloudMonthlyTestAllowed(request,runtime.SKY_CLOUD_MONTHLY_MODE))return new Response(null,{status:404});
 try{const db=database();const webhook=new URL(request.url).pathname.endsWith('/webhook');const owner=webhook?null:await authorizeRemoteAiRequest(request,'cloud-monthly-test',db);return handleCloudMonthlyTest(request,owner,db,runtime);}
 catch(error){return Response.json({error:'本人確認または設定を確認してください。'},{status:error instanceof RemoteAiGuardError?error.status:503});}
}
export const GET=handle;
export const POST=handle;
