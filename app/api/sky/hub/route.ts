import { database,requestUser } from '@/lib/fund-store';
import { body,json } from '@/lib/operations-api';
import { OperationError } from '@/lib/operations';
import { SkyHubError,xTimelineMetadata } from '@/lib/sky-hub';
import { skyHubStore } from '@/lib/sky-hub-store';
import { huggingFaceMetadata } from '@/lib/sky-huggingface';
function failure(error: unknown) {
  if(error instanceof SkyHubError || error instanceof OperationError) return json({error:error.message},error.status);
  if(error instanceof Error && error.message==='UNAUTHORIZED') return json({error:'サインインすると自分の追加項目を保存できます。'},401);
  if(error instanceof Error && error.message==='ORIGIN') return json({error:'このサイトから操作してください。'},403);
  return json({error:'追加した項目を確認できません。再読み込みしてください。'},503);
}
export async function GET(request:Request) { try{return json({plugins:await skyHubStore(database(),await requestUser(request)).list()});}catch(error){return failure(error);} }
export async function PUT(request:Request) { try{
  if(request.headers.get('origin')!==new URL(request.url).origin) throw new Error('ORIGIN');
  const owner=await requestUser(request);
  return json({plugins:await skyHubStore(database(),owner).save(await body(request),async(kind,resource)=>kind==='x'?xTimelineMetadata(resource):huggingFaceMetadata(kind,resource))});
}catch(error){return failure(error);} }
