import { eveSourcePin, parseEveSourcePin, sameEveSource, type EveSourcePin } from './eve-source-context.ts';
import { readOwnerScope } from './owner-intent.ts';
import { beginHomeIntentSelection, writeHomeIntent } from './home-intent.ts';
import type { SkyHubPlugin } from './sky-hub.ts';
export type EveSourceSelection={ownerScope:string;source:EveSourcePin;plugin:SkyHubPlugin};
export async function readEveSourceSelection(key:string,fetcher:typeof fetch=fetch,signal?:AbortSignal):Promise<EveSourceSelection> {
  const response=await fetcher(`/api/eve/source-context?${new URLSearchParams({key})}`,{cache:'no-store',signal});
  const value=await response.json() as EveSourceSelection & {error?:string};
  if (!response.ok || !readOwnerScope(value.ownerScope) || !value.plugin || !value.plugin.enabled) throw new Error(value.error || '出典を確認できません。');
  const source=parseEveSourcePin(value.source);
  if(source.key!==key || !sameEveSource(source,await eveSourcePin(value.plugin))) throw new Error('出典が一致しません。Skyから選び直してください。');
  if(signal?.aborted) throw new Error('出典の確認を取り消しました。');
  return {...value,source};
}
export async function checkEveSourceSelection(selection:Pick<EveSourceSelection,'ownerScope'|'source'>,fetcher:typeof fetch=fetch,signal?:AbortSignal) {
  const current=await readEveSourceSelection(selection.source.key,fetcher,signal);
  if(current.ownerScope!==selection.ownerScope || !sameEveSource(current.source,selection.source)) throw new Error('本人または出典が変わりました。Skyから選び直してください。');
  return current;
}
export async function queueEveSourceIntent(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,plugin:SkyHubPlugin,text:string,fetcher:typeof fetch=fetch,signal?:AbortSignal) {
  // Claim the shared slot synchronously, before hashing or looking up a source.
  const permit=beginHomeIntentSelection(storage);
  const requireCurrent=()=>{
    if(signal?.aborted) throw new Error('出典の確認を取り消しました。');
    if(!permit.isCurrent()) throw new Error('新しい依頼が選ばれました。出典を選び直してください。');
  };
  requireCurrent();
  const expected=await eveSourcePin(plugin);
  requireCurrent();
  const current=await readEveSourceSelection(plugin.key,fetcher,signal);
  if(!sameEveSource(expected,current.source)) throw new Error('出典が更新されました。Skyで最新の内容を確認してください。');
  requireCurrent();
  writeHomeIntent(storage,text,Date.now(),{ownerScope:current.ownerScope,source:current.source},permit);
  return permit;
}
