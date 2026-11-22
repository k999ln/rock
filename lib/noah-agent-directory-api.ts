import { NOAH_COLLECTION_SOURCES } from './noah-collection.ts';
import { selectNoahDirectory, type DirectoryEntry } from './noah-agent-directory.ts';
import { createNoahBoardsStore } from './noah-boards-store.ts';
import { ownerScopeFor } from './owner-intent.ts';
import type { PinsApiDependencies } from './noah-pins-api.ts';
export function createNoahDirectoryApi(deps: PinsApiDependencies & { directory: () => Promise<DirectoryEntry[]> }) {
  return async (request: Request) => {
    const json = (data: unknown, status=200) => Response.json(data, {status, headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
    try {
      if (request.method !== 'GET') return json({error:'method_not_allowed'},405);
      const params=new URL(request.url).searchParams, source=params.get('source')??'', q=params.get('q')??'', cursor=params.get('cursor')??'0', order=params.get('order')??'hot';
      if (!['','noah','discovered',...NOAH_COLLECTION_SOURCES].includes(source) || q.length>200 || !['hot','new'].includes(order) || !/^(0|[1-9]\d{0,5})$/.test(cursor)) return json({error:'一覧の条件を確認してください。'},400);
      let owner: string|null=null;
      try {owner=await deps.authenticate(request);} catch(error) {if (!(error instanceof Error && error.message==='UNAUTHORIZED')) throw error;}
      const hidden = new Set(owner ? (await deps.db.prepare('SELECT family_id FROM noah_pin_hidden WHERE owner_id=?').bind(owner).all<{family_id:string}>()).results.map(r=>r.family_id) : []);
      const all=selectNoahDirectory(await deps.directory(),source,q,order as 'hot' | 'new').filter(e=>!e.families.some(id=>hidden.has(id)));
      const offset=Number(cursor), page=all.slice(offset,offset+20), store=createNoahBoardsStore({...deps,decoratePins:undefined});
      const pins=await store.pins(page.flatMap(e=>e.families.slice(0,1)),owner), byId=new Map(pins.map(p=>[p.id,p]));
      const items=page.map(e=>{const pin=byId.get(e.card.id);return pin?{...e.card,...pin,feedbackId:e.card.feedbackId,sources:e.card.sources}:e.card;});
      return json({items,total:all.length,nextCursor:offset+20<all.length?String(offset+20):null,ownerScope:owner?await ownerScopeFor(owner):null});
    } catch {return json({error:'一覧を読み込めませんでした。再試行してください。'},503);}
  };
}
