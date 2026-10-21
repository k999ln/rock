import { requestUser } from '@/lib/fund-store';
import { json } from '@/lib/operations-api';
import { SkyHubError,skyHubKind } from '@/lib/sky-hub';
import { searchHuggingFace } from '@/lib/sky-huggingface';
export async function GET(request:Request) { try {
  await requestUser(request);const url=new URL(request.url);const kind=skyHubKind(url.searchParams.get('kind')??'model');
  if(kind==='x') throw new SkyHubError('モデル・データセット・アプリから選んでください。');
  return json({entries:await searchHuggingFace(kind,url.searchParams.get('q')??''),source:'Hugging Face',skyFeeMinor:0,executionStarted:false});
}catch(error){if(error instanceof SkyHubError)return json({error:error.message},error.status);if(error instanceof Error&&error.message==='UNAUTHORIZED')return json({error:'サインインしてカタログを検索してください。'},401);return json({error:'カタログを取得できません。再試行してください。'},503);} }
