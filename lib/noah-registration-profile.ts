import { NoahAgentError } from './noah-agent-upload.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';
import { canonicalJson, sha256Hex } from './noah-connect-requirements.ts';
import { profileField } from './noah-profile-contract.ts';
import { toBase64, type NoahProfileStore } from './noah-profile-store.ts';
import type { ConfiguredRegistration } from './noah-registration.ts';
export type RegistrationDocument={name:string;type:string;base64:string};
export type ResolvedRegistration={values:Record<string,string>;documents:Record<string,RegistrationDocument>;beforeSend:()=>Promise<void>};
export function registrationProfileResolver(store:NoahProfileStore,authenticate:(request:Request)=>Promise<string>){
  return async(request:Request,provider:ConfiguredRegistration,reuse:unknown):Promise<ResolvedRegistration>=>{
    let owner:string|null=null;
    try {owner=await authenticate(request);}catch(e){if(!(e instanceof Error && e.message==='UNAUTHORIZED'))throw e;}
    if(!owner){if(reuse!==undefined)throw new NoahAgentError('保存情報を使うにはサインインしてください。',401);return {values:{},documents:{},beforeSend:async()=>{}};}
    if(request.headers.get(OWNER_SCOPE_HEADER)!==await ownerScopeFor(owner))throw new NoahAgentError('アカウントが変わりました。画面を開き直してください。',409);
    const user=owner,digest=await sha256Hex(canonicalJson(provider)),target=`registration:${provider.id}`;
    await store.authorize(user,target,'register',digest,true);
    const profile=(await store.load(user)).profile;
    const values:Record<string,string>={},documents:Record<string,RegistrationDocument>={};
    if(reuse!==undefined){
      const v=reuse as {revision?:unknown;fields?:unknown;documentId?:unknown};
      if(!v || typeof v!=='object' || Array.isArray(v) || Object.keys(v).some(k=>!['revision','fields','documentId'].includes(k)) || v.revision!==profile.revision || !Array.isArray(v.fields) || v.fields.length>16 || new Set(v.fields).size!==v.fields.length)throw new NoahAgentError('保存情報が更新されました。使う項目を確認し直してください。',409);
      for(const key of v.fields){
        const field=provider.fields.find(f=>f.key===key);
        if(!field || field.type==='password' || !field.profileField)throw new NoahAgentError('この項目は保存情報から渡せません。');
        if(field.profileField==='identityDocument'){
          if(typeof v.documentId!=='string' || !profile.documents.some(d=>d.id===v.documentId))throw new NoahAgentError('渡す本人確認書類を選んでください。');
          if(profile.fields.identityExpiry && profile.fields.identityExpiry < new Date().toISOString().slice(0,10))throw new NoahAgentError('本人確認書類の期限を確認してください。');
          const file=await store.document(user,v.documentId);documents[field.key]={name:file.meta.name,type:file.meta.type,base64:toBase64(file.bytes)};values[field.key]=file.meta.name;
        } else if(profileField(field.profileField)){
          const value=profile.fields[field.profileField];if(!value)throw new NoahAgentError('保存情報に必要な項目がありません。');values[field.key]=value;
        }
      }
    }
    return {values,documents,beforeSend:async()=>{
      if(await authenticate(request)!==user)throw new NoahAgentError('アカウントが変わりました。',409);
      await store.authorize(user,target,'register',digest,true);
      if((await store.load(user)).profile.revision!==profile.revision)throw new NoahAgentError('保存情報が更新されました。送信を止めました。',409);
    }};
  };
}
