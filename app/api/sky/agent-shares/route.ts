import { database, requestUser } from '@/lib/fund-store';
import { OperationError } from '@/lib/operations';
import { SkyAgentLibraryError } from '@/lib/sky-agent-library';
import { SkySocialError, socialId, socialObject, socialText } from '@/lib/sky-social';
import { communityKeysHeader } from '@/lib/community-access';
import { skyAgentShareStore } from '@/lib/sky-agent-share-store';
import { shareDigest, shareVersion } from '@/lib/sky-agent-share';
import {skyAgentOutcomeStore} from '@/lib/sky-agent-outcome-store';
import { skySocialStore } from '@/lib/sky-social-store';

const json = (value: unknown, status = 200) => Response.json(value,{ status, headers: {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'} });
function failure(error: unknown) {
  if (error instanceof SkySocialError || error instanceof SkyAgentLibraryError || error instanceof OperationError) return json({error:error.message},error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({error:'サインインしてください。'},401);
  return json({error:'共有担当を確認できません。入力を残して再試行してください。'},503);
}
export async function GET(request: Request) {
  try {
    const owner = await requestUser(request), store = skyAgentShareStore(database(),owner,communityKeysHeader(request));
    const q = new URL(request.url).searchParams;
    return json({ownerUserId:owner,...await store.read(q.get('id')!,Number(q.get('version'))),outcomes:await skyAgentOutcomeStore(database(),owner,communityKeysHeader(request)).summary(q.get('id')!,Number(q.get('version')))});
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    // Device/eSIM runtime sessions identify an owner but do not grant social publication authority.
    const authorization = request.headers.get('authorization') ?? '';
    if (authorization.startsWith('Bearer rock_session_') || authorization.startsWith('Bearer rock_esim_') || authorization.startsWith('RockEsimProof')) return json({error:'共有の書込みはサインイン済みの本人画面から操作してください。'},403);
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({error:'このサイトから操作してください。'},403);
    const owner = await requestUser(request);
    if (request.headers.get('x-sky-owner') !== owner) return json({error:'アカウントが変わりました。画面を開き直してください。'},409);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'JSONで送信してください。'},415);
    const reader = request.body?.getReader(); if (!reader) return json({error:'入力を確認してください。'},400);
    let text = '', size = 0; const decoder = new TextDecoder('utf-8',{fatal:true});
    try { while (true) { const chunk = await reader.read(); if(chunk.done) break; size += chunk.value.byteLength; if(size>12000) { await reader.cancel(); return json({error:'入力が長すぎます。'},413); } text += decoder.decode(chunk.value,{stream:true}); } text += decoder.decode(); }
    catch { return json({error:'UTF-8のJSONを確認してください。'},400); }
    finally { reader.releaseLock(); }
    let input: unknown; try { input = JSON.parse(text); } catch { return json({error:'JSONを確認してください。'},400); }
    if (input && typeof input === 'object' && !Array.isArray(input) && (input as Record<string,unknown>).action === 'post') {
      const v=socialObject(input,['action','id','version','digest','postId','content','approve']);
      const share=await skyAgentShareStore(database(),owner,communityKeysHeader(request)).read(socialId(v.id),shareVersion(v.version));
      if (v.approve !== true || share.withdrawn || share.digest !== shareDigest(v.digest)) throw new SkySocialError('投稿する共有版を確認してください。',409);
      return json(await skySocialStore(database(),owner,communityKeysHeader(request)).mutate({action:'post',id:socialId(v.postId),content:socialText(v.content,1000),communityId:share.manifest.communityId,attachment:{kind:'agent-template',resource:`${share.manifest.id}:${share.manifest.version}`}}));
    }
    return json(await skyAgentShareStore(database(),owner,communityKeysHeader(request)).mutate(input));
  } catch (error) { return failure(error); }
}
