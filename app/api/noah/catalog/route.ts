import { noahResearchCatalog } from '@/lib/noah-research-catalog';
import { ResearchQueryError, researchSnapshot } from '@/lib/noah-research-query';
import { database, requestUser } from '@/lib/fund-store';
import { noahRecommendationContext, noahRecommendationSettings } from '@/lib/noah-recommendations';
import { ownerScopeFor } from '@/lib/owner-intent';
export async function GET(request: Request) {
  try {
    let owner:string|null;
    try { owner=await requestUser(request); } catch(e) { if(e instanceof Error&&e.message==='UNAUTHORIZED') owner=null; else throw e; }
    const db=database(),params=new URL(request.url).searchParams,snapshot=researchSnapshot(params,Date.now());
    const preferences=owner?(await db.prepare('SELECT kind,subject FROM noah_feed_preferences WHERE owner_id=? ORDER BY kind,subject LIMIT 256').bind(owner).all<{kind:string;subject:string}>()).results:[];
    const context=await noahRecommendationContext(db,owner,snapshot,await noahRecommendationSettings(db,owner),preferences,id=>noahResearchCatalog.get(id)?.entry.tags??[]);
    return Response.json({...noahResearchCatalog.list(params,context,snapshot),ownerScope:owner?await ownerScopeFor(owner):null}, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ResearchQueryError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
