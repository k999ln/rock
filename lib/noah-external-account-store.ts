import { NoahAgentError } from './noah-agent-upload.ts';
import { sha256Hex } from './noah-connect-requirements.ts';
import { fromBase64, toBase64, type ProfileBucket, type ProfileKeys } from './noah-profile-store.ts';

export type ExternalAccount = { version:1; job:string; state:'registering'|'registered'|'ready'|'failed'; credential?:string; externalId?:string; configurationDigest?:string; updatedAt:number };
export type ExternalAccountSlot = { account:ExternalAccount|null; etag:string|null };
/** Server-only: this store is deliberately absent from the profile response. */
export function createNoahExternalAccountStore(bucket:ProfileBucket|undefined,keys:ProfileKeys|null,now=Date.now) {
  const encoder=new TextEncoder();
  const available=Boolean(bucket&&keys);
  const requireStore=()=>{if(!bucket||!keys)throw new NoahAgentError('接続情報を保存できません。時間をおいてお試しください。',503);};
  const path=async(owner:string,provider:string)=>{
    if(!/^[a-z][a-z0-9_-]{0,79}$/.test(provider)||!owner)throw new NoahAgentError('接続先を確認してください。');
    return `noah-external/v1/${await sha256Hex(owner)}/${provider}`;
  };
  const aad=(owner:string,provider:string,kid:string)=>encoder.encode(`noah-external/1\0${owner}\0${provider}\0${kid}`);
  const key=async(kid:string)=>{
    if(!keys?.keys[kid])throw Error('missing key');
    return crypto.subtle.importKey('raw',Uint8Array.from(keys.keys[kid].match(/../g)!,v=>parseInt(v,16)),'AES-GCM',false,['encrypt','decrypt']);
  };
  async function load(owner:string,provider:string):Promise<ExternalAccountSlot>{
    requireStore();const item=await bucket!.get(await path(owner,provider));if(!item)return {account:null,etag:null};
    try {
      if(item.size>16_384)throw Error('size');
      const envelope=JSON.parse(await item.text());
      if(envelope.version!==1)throw Error('version');
      const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(envelope.nonce),additionalData:aad(owner,provider,envelope.key)},await key(envelope.key),fromBase64(envelope.ciphertext));
      const account=JSON.parse(new TextDecoder().decode(decoded)) as ExternalAccount;
      if(account.version!==1||!['registering','registered','ready','failed'].includes(account.state)||typeof account.job!=='string'||(account.credential!==undefined&&(typeof account.credential!=='string'||account.credential.length>2048)))throw Error('record');
      return {account,etag:item.etag};
    } catch {throw new NoahAgentError('接続情報を確認できません。時間をおいてお試しください。',503);}
  }
  async function save(owner:string,provider:string,slot:ExternalAccountSlot,value:ExternalAccount):Promise<ExternalAccountSlot>{
    requireStore();const objectPath=await path(owner,provider),kid=keys!.active,nonce=crypto.getRandomValues(new Uint8Array(12));
    const account={...value,updatedAt:now()},plain=encoder.encode(JSON.stringify(account));
    if(plain.length>8192)throw new NoahAgentError('接続情報が大きすぎます。',413);
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad(owner,provider,kid)},await key(kid),plain);
    const result=await bucket!.put(objectPath,JSON.stringify({version:1,key:kid,nonce:toBase64(nonce),ciphertext:toBase64(new Uint8Array(ciphertext))}),{onlyIf:slot.etag?{etagMatches:slot.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/octet-stream',cacheControl:'private, no-store'}});
    if(!result)throw new NoahAgentError('別の画面で登録が進んでいます。状況を確認してください。',409);
    return {account,etag:result.etag};
  }
  return {available,load,save};
}
export type NoahExternalAccountStore=ReturnType<typeof createNoahExternalAccountStore>;
