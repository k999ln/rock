import { skyHubKey, skyHubKind, skyHubResource, type SkyHubPlugin } from './sky-hub.ts';
import { socialAttachment, socialId, type SkySocialAttachment } from './sky-social.ts';

/** Owner-confirmed source history, never an authenticity or execution grant. */
export type EveHubSourcePin = { schema: 'rockstaros.eve-source/1'; key: string; revision: number; metadataSha256: string };
export type EvePostIdentity = { id:string;authorId:string;communityId:string|null;replyTo:string|null;createdAt:number };
export type EvePostSnapshot = EvePostIdentity & {content:string;attachment:SkySocialAttachment|null};
export type EvePostSourcePin = { schema:'rockstaros.eve-post-source/1';key:string;metadataSha256:string;post:EvePostIdentity };
export type EveSourcePin = EveHubSourcePin | EvePostSourcePin;
function postIdentity(value:unknown):EvePostIdentity {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error('投稿の出典を確認してください。');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).length!==5 || !['id','authorId','communityId','replyTo','createdAt'].every(k=>Object.hasOwn(v,k)) ||
    !Number.isSafeInteger(v.createdAt) || (v.createdAt as number)<0) throw new Error('投稿の出典を確認してください。');
  return {id:socialId(v.id),authorId:socialId(v.authorId),communityId:v.communityId===null?null:socialId(v.communityId),
    replyTo:v.replyTo===null?null:socialId(v.replyTo),createdAt:v.createdAt as number};
}
export function parseEveSourcePin(value: unknown): EveSourcePin {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('出典を確認してください。');
  const v = value as Record<string, unknown>;
  if(Object.keys(v).length!==4 || typeof v.key!=='string' || v.key.length>300 || typeof v.metadataSha256!=='string' || !/^[a-f0-9]{64}$/.test(v.metadataSha256)) throw new Error('出典の版を確認してください。');
  if(v.schema==='rockstaros.eve-post-source/1') {
    const post=postIdentity(v.post);
    if(v.key!==`post:${post.id}`) throw new Error('投稿の出典が一致しません。');
    return {schema:v.schema,key:v.key,metadataSha256:v.metadataSha256,post};
  }
  if(v.schema!=='rockstaros.eve-source/1' || !Number.isSafeInteger(v.revision) || (v.revision as number)<1) throw new Error('出典の版を確認してください。');
  const split = v.key.indexOf(':');
  const kind = skyHubKind(v.key.slice(0, split));
  if (kind === 'x' || skyHubKey(kind, skyHubResource(kind, v.key.slice(split + 1))) !== v.key) throw new Error('追加済みのモデル・データ・アプリを選んでください。');
  return { schema: v.schema, key: v.key, revision: v.revision as number, metadataSha256: v.metadataSha256 };
}
async function digest(value:unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function eveSourcePin(plugin: SkyHubPlugin): Promise<EveHubSourcePin> {
  const value = plugin.metadata;
  const metadataSha256 = await digest({ title:value.title, sourceUrl:value.sourceUrl, revision:value.revision,
    license:value.license, task:value.task, downloads:value.downloads, likes:value.likes, gated:value.gated, sdk:value.sdk, skyFeeMinor:value.skyFeeMinor });
  return parseEveSourcePin({schema:'rockstaros.eve-source/1',key:plugin.key,revision:plugin.revision,metadataSha256}) as EveHubSourcePin;
}
export async function evePostSourcePin(value:EvePostSnapshot):Promise<EvePostSourcePin> {
  const post=postIdentity({id:value.id,authorId:value.authorId,communityId:value.communityId,replyTo:value.replyTo,createdAt:value.createdAt});
  if(typeof value.content!=='string' || !value.content.trim() || value.content.length>1000) throw new Error('投稿本文を確認してください。');
  const attachment=socialAttachment(value.attachment);
  return {schema:'rockstaros.eve-post-source/1',key:`post:${post.id}`,metadataSha256:await digest({...post,content:value.content,attachment}),post};
}
export function sameEveSource(a: EveSourcePin, b: EveSourcePin) {
  return a.schema===b.schema && a.key===b.key && a.metadataSha256===b.metadataSha256 &&
    (a.schema==='rockstaros.eve-source/1' ? b.schema==='rockstaros.eve-source/1' && a.revision===b.revision : b.schema==='rockstaros.eve-post-source/1' && JSON.stringify(a.post)===JSON.stringify(b.post));
}
