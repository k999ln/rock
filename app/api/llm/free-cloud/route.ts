import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '@/lib/remote-ai-guard';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { freeCloudTextHttp } from '@/lib/sky-free-cloud-http';
import type { FreeCloudRuntime } from '@/lib/sky-free-cloud';
export async function POST(request: Request) {
  try {
    const db=database();
    const owner=await authorizeRemoteAiRequest(request,'llm-free-cloud',db);
    const runtime=env as unknown as FreeCloudRuntime & {ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?:string};
    if(!(await rockstarServiceScopeAllowed(db,owner,'rockstaros_access',runtime.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,env,request))) return missingRockstarServiceScope('RockstarOS');
    return freeCloudTextHttp(request,db,owner,runtime);
  }catch(error){return Response.json({error:'本人認証・操作権限を確認してください。'},{status:error instanceof RemoteAiGuardError?error.status:400,headers:{'Cache-Control':'no-store'}});}
}
