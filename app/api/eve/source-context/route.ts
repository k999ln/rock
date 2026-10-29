import { communityKeysHeader } from '@/lib/community-access';
import { SkySocialError } from '@/lib/sky-social';
import { database, requestUser } from '@/lib/fund-store';
import { OperationError } from '@/lib/operations';
import { ownerScopeFor } from '@/lib/owner-intent';
import { SkyHubError } from '@/lib/sky-hub';
import { eveSourceContext } from '@/lib/eve-source-context-store';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request) {
  try {
    const owner=await requestUser(request);
    const key=new URL(request.url).searchParams.get('key')??'';
    const context=await eveSourceContext(database(),owner,key,key.startsWith('post:')?communityKeysHeader(request):{});
    return json({...context,ownerScope:await ownerScopeFor(owner)});
  } catch(error) {
    if(error instanceof SkyHubError || error instanceof SkySocialError || error instanceof OperationError) return json({error:error.message},error.status);
    if(error instanceof Error && error.message==='UNAUTHORIZED') return json({error:'サインインして出典を確認してください。'},401);
    return json({error:'出典を確認できません。再試行してください。'},503);
  }
}
