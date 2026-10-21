import {env} from 'cloudflare:workers';
import {database} from '@/lib/fund-store';
import {verifyWake,tickBackground,type BackgroundRuntime} from '@/lib/sky-free-cloud-background';
import {hostedMonthlyClock} from '@/lib/sky-hosted-monthly';
import {rockstarServiceScopeAllowed} from '@/lib/rockstar-service-access';
export async function POST(request:Request){
 const runtime=env as unknown as BackgroundRuntime & Record<string,string>;
 if(!await verifyWake(request,runtime.SKY_FREE_CLOUD_WAKE_KEY))return Response.json({error:'Unauthorized'},{status:401});
 const db=database(),owner=runtime.SKY_FREE_CLOUD_OWNER_ID??'';
 if(!await rockstarServiceScopeAllowed(db,owner,'rockstaros_access',runtime.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED))return Response.json({error:'Forbidden'},{status:403});
 try{return Response.json(await tickBackground(db,runtime,()=>hostedMonthlyClock(db,runtime,owner)),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Reconciliation pending'},{status:503});}
}
