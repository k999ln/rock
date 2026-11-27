import { emptyNoahProfile, PROFILE_CONSENT_VERSION, NOAH_PROFILE_FIELDS, profileField, PROFILE_MAX_DOCUMENT, type NoahProfile, type NoahDelegation, type NoahIdentityDocument } from './noah-profile-contract.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { sha256Hex } from './noah-connect-requirements.ts';

export type ProfileBucket = Pick<R2Bucket, 'get' | 'put' | 'delete'>;
export type ProfileKeys = { active: string; keys: Record<string, string> };
type Envelope = { version: 1; key: string; nonce: string; ciphertext: string };
type Loaded = { profile: NoahProfile; etag: string | null };
function bad(message:string,status=400):never { throw new NoahAgentError(message,status); }
const encoder = new TextEncoder();
const controls=(s:string,allowNewline=false)=>Array.from(s).some(c=>{const n=c.charCodeAt(0);return n===127||(n<32&&!(allowNewline&&[9,10,13].includes(n)));});
export const toBase64 = (bytes: Uint8Array): string => { const chunks:string[]=[];for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));return btoa(chunks.join('')); };
export const fromBase64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export function profileKeys(raw?: string): ProfileKeys | null {
  try {
    const value = JSON.parse(raw ?? 'null') as ProfileKeys;
    if (!value || !/^[a-z0-9_-]{1,24}$/.test(value.active) || !value.keys || Object.keys(value.keys).length > 3 || !Object.hasOwn(value.keys, value.active)) return null;
    if (Object.entries(value.keys).some(([k,v]) => !/^[a-z0-9_-]{1,24}$/.test(k) || typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v))) return null;
    return value;
  } catch { return null; }
}
export function validateProfileFields(input: unknown): NoahProfile['fields'] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('保存する情報を確認してください。');
  const fields: NoahProfile['fields'] = {};
  for (const [key,value] of Object.entries(input)) {
    if (!profileField(key) || typeof value !== 'string' || value.length > NOAH_PROFILE_FIELDS[key].max || controls(value,true)) bad('保存できない項目、または長すぎる入力があります。');
    if (value && key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) bad('メールアドレスを確認してください。');
    if (value && (key === 'birthDate' || key === 'identityExpiry') && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value))) bad('日付を確認してください。');
    if (value) fields[key] = value.trim();
  }
  return fields;
}
export function validateGrant(value: unknown): NoahDelegation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad('任せる範囲を確認してください。');
  const v = value as NoahDelegation;
  if (Object.keys(v).some(k => !['target','name','action','label','digest','mode'].includes(k)) || typeof v.target !== 'string' || !v.target || v.target.length > 400 || typeof v.name !== 'string' || !v.name || v.name.length > 200 || typeof v.action !== 'string' || !v.action || v.action.length > 128 || typeof v.label !== 'string' || !v.label || v.label.length > 200 || !/^[a-f0-9]{64}$/.test(v.digest) || !['allow','confirm','deny'].includes(v.mode)) bad('任せる範囲を確認してください。');
  return { target:v.target, name:v.name, action:v.action, label:v.label, digest:v.digest, mode:v.mode };
}

export function createNoahProfileStore(bucket: ProfileBucket | undefined, keys: ProfileKeys | null, now = Date.now, beforeProfileSave?: (owner: string, previous: NoahProfile, next: NoahProfile, now: number) => Promise<void>) {
  const available = Boolean(bucket && keys);
  const requireStore = () => { if (!bucket || !keys) bad('登録情報の保存は準備中です。時間をおいてお試しください。', 503); };
  const path = async (owner: string, suffix = 'profile') => `noah-private/v1/${await sha256Hex(owner)}/${suffix}`;
  async function seal(owner: string, slot: string, bytes: Uint8Array): Promise<string> {
    requireStore();
    const kid = keys!.active, nonce = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(keys!.keys[kid].match(/../g)!, x=>parseInt(x,16)), 'AES-GCM', false, ['encrypt']);
    const ciphertext = await crypto.subtle.encrypt({ name:'AES-GCM', iv:nonce, additionalData:encoder.encode(`noah-profile/1\0${owner}\0${slot}\0${kid}`) }, key, bytes as Uint8Array<ArrayBuffer>);
    return JSON.stringify({version:1,key:kid,nonce:toBase64(nonce),ciphertext:toBase64(new Uint8Array(ciphertext))} satisfies Envelope);
  }
  async function unseal(owner: string, slot: string, text: string): Promise<Uint8Array> {
    try {
      const e = JSON.parse(text) as Envelope;
      if (e.version !== 1 || !keys?.keys[e.key]) throw Error('key');
      const key = await crypto.subtle.importKey('raw', Uint8Array.from(keys.keys[e.key].match(/../g)!,x=>parseInt(x,16)), 'AES-GCM', false, ['decrypt']);
      return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(e.nonce),additionalData:encoder.encode(`noah-profile/1\0${owner}\0${slot}\0${e.key}`)},key,fromBase64(e.ciphertext)));
    } catch { return bad('保存情報を開けません。再読み込みしてください。',503); }
  }
  async function load(owner: string): Promise<Loaded> {
    requireStore(); const item = await bucket!.get(await path(owner));
    if (!item) return {profile:emptyNoahProfile(),etag:null};
    if (item.size > 128_000) bad('保存情報を確認できません。',503);
    const p = JSON.parse(new TextDecoder().decode(await unseal(owner,'profile',await item.text()))) as NoahProfile;
    if (!Number.isSafeInteger(p.revision) || p.revision < 1 || !p.fields || !Array.isArray(p.documents) || !Array.isArray(p.grants) || typeof p.paused !== 'boolean') bad('保存情報を確認できません。',503);
    return {profile:{...p,reuseEnabled:p.reuseEnabled===true,consents:p.consents??[]},etag:item.etag};
  }
  async function save(owner: string, loaded: Loaded, next: NoahProfile) {
    next = {...next,revision:loaded.profile.revision+1};
    const encoded = encoder.encode(JSON.stringify(next));
    const revoking=(!next.reuseEnabled&&loaded.profile.reuseEnabled)||(next.paused&&!loaded.profile.paused);
    if (encoded.byteLength > (revoking?80_000:76_000)) bad('保存できる情報の上限です。不要な設定を整理してください。',413);
    const envelope = await seal(owner,'profile',encoded);
    if (beforeProfileSave) await beforeProfileSave(owner,loaded.profile,next,now());
    const result = await bucket!.put(await path(owner), envelope, { onlyIf: loaded.etag ? {etagMatches:loaded.etag} : {etagDoesNotMatch:'*'}, httpMetadata:{contentType:'application/octet-stream',cacheControl:'private, no-store'} });
    if (!result) bad('別の画面で情報が更新されました。読み直してから保存してください。',409);
    return next;
  }
  async function change(owner: string, revision: number, mutate: (profile: NoahProfile)=>NoahProfile) {
    const loaded = await load(owner);
    if (!Number.isSafeInteger(revision) || loaded.profile.revision !== revision) bad('保存情報が更新されました。読み直してください。',409);
    return save(owner,loaded,mutate(loaded.profile));
  }
  async function document(owner: string, id: string) {
    const {profile} = await load(owner); const meta = profile.documents.find(d=>d.id===id);
    if (!meta) bad('書類が見つかりません。',404);
    const file = await bucket!.get(await path(owner,`document/${id}`));
    if (!file || file.size > PROFILE_MAX_DOCUMENT * 1.5) bad('書類を取得できません。',404);
    return {meta, bytes:await unseal(owner,`document/${id}`,await file.text())};
  }
  async function addDocument(owner:string, revision:number, name:string, type:string, bytes:Uint8Array, consentVersion?:string) {
    const signature = type==='application/pdf' ? new TextDecoder().decode(bytes.slice(0,5))==='%PDF-' : type==='image/png' ? [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v) : type==='image/jpeg' && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    if (!signature || !bytes.length || bytes.length > PROFILE_MAX_DOCUMENT || !name || name.length>160 || controls(name)) bad('5MB以内のPDF・JPEG・PNGを選んでください。');
    const loaded = await load(owner);
    if (loaded.profile.revision!==revision) bad('保存情報が更新されました。読み直してください。',409);
    if (loaded.profile.documents.length>=2) bad('書類は2件まで保存できます。');
    const id=crypto.randomUUID(), slot=`document/${id}`, objectPath=await path(owner,slot);
    const meta:NoahIdentityDocument={id,name,type,bytes:bytes.length,uploadedAt:now()};
    await bucket!.put(objectPath,await seal(owner,slot,bytes),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/octet-stream',cacheControl:'private, no-store'}});
    try { const next={...loaded.profile,documents:[...loaded.profile.documents,meta]}; return await save(owner,loaded,consentVersion===undefined?next:consent(next,consentVersion,true,[],[id])); }
    catch(e) { await bucket!.delete(objectPath); throw e; }
  }
  async function removeDocument(owner:string,revision:number,id:string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) bad('書類を選び直してください。');
    const p=await change(owner,revision,p=>({...p,documents:p.documents.filter(d=>d.id!==id)}));
    await bucket!.delete(await path(owner,`document/${id}`)); return p;
  }
  function consent(p:NoahProfile,version:unknown,reuse:boolean,fields:(keyof typeof NOAH_PROFILE_FIELDS)[],documents:string[],action:'save'|'reuse-stop'|'reuse-resume'='save'):NoahProfile {
    if(version!==PROFILE_CONSENT_VERSION) bad('保存・再利用の説明が更新されました。画面を読み直してください。',409);
    if(action==='reuse-stop'&&!p.reuseEnabled)return p;
    if(p.consents.length>=128&&action!=='reuse-stop') bad('保存の記録が上限に達しました。サポートへご連絡ください。',409);
    return {...p,reuseEnabled:reuse,consents:[...p.consents,{version:PROFILE_CONSENT_VERSION,at:now(),action,fields,documents}]};
  }
  async function authorizeRevision(owner:string,target:string,action:string,digest:string,confirmed:boolean) {
    requireStore(); // Loss of a key must never bypass saved stops or denials.
    const {profile}=await load(owner);
    if (profile.paused) bad('すべての委任を停止しています。「登録情報と任せる範囲」で再開できます。',403);
    const grants=profile.grants.filter(g=>g.target===target && g.action===action);
    if (grants.some(g=>g.mode==='deny')) bad('この操作は「任せない」に設定されています。',403);
    const grant=grants.find(g=>g.digest===digest);
    if ((grant?.mode==='confirm' || (grants.length && !grant)) && !confirmed) bad('この操作は毎回の確認が必要です。内容を確認して実行してください。',409);
    return profile.revision;
  }
  async function authorize(owner:string,target:string,action:string,digest:string,confirmed:boolean) {
    await authorizeRevision(owner,target,action,digest,confirmed);
  }
  return {available,load,change,document,addDocument,removeDocument,authorize,authorizeRevision,consent};
}
export type NoahProfileStore = ReturnType<typeof createNoahProfileStore>;
