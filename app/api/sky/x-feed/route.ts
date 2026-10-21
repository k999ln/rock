import { env } from 'cloudflare:workers';
import { database,requestUser } from '@/lib/fund-store';
import { body,json } from '@/lib/operations-api';
import { skyHubStore } from '@/lib/sky-hub-store';
import { X_TIMELINE_CONSENT,xTimelineUrl,SkyHubError } from '@/lib/sky-hub';
import { skyXFeed,xFeedSettings } from '@/lib/sky-x-feed';

async function handle(request:Request,refresh:boolean) {
  try{
    const owner=await requestUser(request);
    if(refresh&&request.headers.get('origin')!==new URL(request.url).origin)return json({error:'このサイトから取得してください。'},403);
    const input=refresh?await body(request):{source:new URL(request.url).searchParams.get('source')};
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['source','revision'].includes(k)))return json({error:'配信元を確認してください。'},400);
    const v=input as {source?:unknown;revision?:unknown},source=xTimelineUrl(v.source),db=database();
    const plugin=(await skyHubStore(db,owner).list()).find(p=>p.kind==='x'&&p.resource===source&&p.enabled&&p.consentVersion===X_TIMELINE_CONSENT);
    if(!plugin)return json({error:'Skyで配信元を追加してください。'},404);
    if(refresh&&v.revision!==plugin.revision)return json({error:'配信設定が変わっています。再読み込みしてください。'},409);
    const settings=xFeedSettings(env as unknown as Record<string,unknown>);
    if(!settings)return json({mode:'embed',posts:[],fetchedAt:0,retryAt:0,status:'api-not-configured'});
    const service=skyXFeed(db,settings);
    return json(await(refresh?service.refresh(source):service.snapshot(source)));
  }catch(error){
    if(error instanceof Error&&error.message==='UNAUTHORIZED')return json({error:'サインインして確認してください。'},401);
    if(error instanceof Error&&error.message==='ORIGIN')return json({error:'このサイトから取得してください。'},403);
    if(error instanceof Error&&error.message==='X_SOURCE_NOT_APPROVED')return json({mode:'api',posts:[],fetchedAt:0,retryAt:0,status:'source-not-approved'},403);
    if(error instanceof SkyHubError)return json({error:error.message},error.status);
    return json({error:'投稿を確認できません。配信設定を確認してください。'},503);
  }
}
export async function GET(request:Request){return handle(request,false);}
export async function POST(request:Request){return handle(request,true);}
