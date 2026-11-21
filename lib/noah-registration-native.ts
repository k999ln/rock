import { NoahAgentError } from './noah-agent-upload.ts';
import { OWNER_SCOPE_HEADER,ownerScopeFor } from './owner-intent.ts';
import type { ConfiguredRegistration, RegistrationExecutor } from './noah-registration.ts';
import type { RegistrationState } from './noah-registration-contract.ts';
import type { NoahExternalAccountStore, ExternalAccountSlot } from './noah-external-account-store.ts';

export const AGENTBOARD_ORIGIN='https://www.agentboard.ai';
export const AGENTBOARD_MCP=`${AGENTBOARD_ORIGIN}/mcp`;
export const AGENTBOARD_AGENT='mcp-registry:ai.agentboard/agentboard';
export const AGENTBOARD_PROVIDER:ConfiguredRegistration={id:'agentboard',name:'Agentboard',agentIds:[AGENTBOARD_AGENT],revision:1,providerOrigin:AGENTBOARD_ORIGIN,verificationUrl:`${AGENTBOARD_ORIGIN}/join`,termsUrl:`${AGENTBOARD_ORIGIN}/rules`,termsVersion:'2026-11-22',executorUrl:'https://avoado.si/api/noah/registration/native',executorOrigin:'https://avoado.si',executorName:'Noah 登録Agent',requiresAccount:true,notice:'ここで使う名前がAgentboardに公開されます。接続キーはNoahが暗号化して保管します。',fields:[{key:'name',label:'Agentboardで使う名前',type:'text',profileField:'displayName',required:true,maxLength:80}]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export async function nativeRegistrationJson(response:Response):Promise<unknown>{
  const reader=response.body?.getReader();if(!reader)throw Error('empty');let size=0,text='';const decoder=new TextDecoder();
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072)throw Error('too large');text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{await reader.cancel().catch(()=>{});}
}
export function createNoahNativeRegistration(deps:{store:NoahExternalAccountStore;authenticate:(request:Request)=>Promise<string>;fetcher?:typeof fetch;now?:()=>number;observe?:(event:{stage:string;state?:string;status?:number})=>void}){
  const fetcher=deps.fetcher??fetch,now=deps.now??Date.now;
  // Only fixed stage/state names and HTTP status: never inputs, identities or keys.
  const observe=(event:{stage:string;state?:string;status?:number})=>{try{deps.observe?.(event);}catch{/* Diagnostics must not change registration. */}};
  const request=async(path:string,init:RequestInit)=>fetcher(`${AGENTBOARD_ORIGIN}${path}`,{...init,redirect:'error',signal:AbortSignal.timeout(12000),cache:'no-store'});
  async function verify(owner:string,slot:ExternalAccountSlot):Promise<RegistrationState>{
    const a=slot.account!;if(!a.credential||!a.externalId)return 'unknown';
    const response=await request('/api/me',{headers:{Authorization:`Bearer ${a.credential}`}});
    observe({stage:'verify_response',status:response.status});
    if(!response.ok){await response.body?.cancel();return 'unknown';}
    const body=await nativeRegistrationJson(response);
    if(!object(body)||!object(body.agent)||body.agent.id!==a.externalId||body.agent.status!=='active')return 'unknown';
    if(a.state!=='ready')await deps.store.save(owner,'agentboard',slot,{...a,state:'ready'});
    return 'completed';
  }
  return async(requestContext:Request,provider:ConfiguredRegistration):Promise<RegistrationExecutor|undefined>=>{
    if(provider.id!==AGENTBOARD_PROVIDER.id||provider.executorUrl!==AGENTBOARD_PROVIDER.executorUrl)return undefined;
    let owner:string;try{owner=await deps.authenticate(requestContext);}catch{throw new NoahAgentError('接続キーを安全に保存するため、Noahにサインインしてください。',401);}
    if(requestContext.method==='POST'&&requestContext.headers.get(OWNER_SCOPE_HEADER)!==await ownerScopeFor(owner))throw new NoahAgentError('アカウントが変わりました。画面を開き直してください。',409);
    if(!deps.store.available)throw new NoahAgentError('登録の実行環境は準備中です。',503);
    return async(id,values,documents)=>{
      if(documents&&Object.keys(documents).length)throw new NoahAgentError('この登録先に書類は送りません。');
      let slot:ExternalAccountSlot;try{slot=await deps.store.load(owner,'agentboard');}catch(error){observe({stage:'store_load_failed'});throw error;}
      observe({stage:'store_loaded',state:slot.account?.state??'empty'});
      if(slot.account?.credential)return verify(owner,slot);
      if(!values)return slot.account?.state==='failed'?'failed':'unknown';
      if(Object.keys(values).some(k=>k!=='name')||!values.name?.trim()||values.name.length>80)throw new NoahAgentError('使う名前を確認してください。');
      // An uncertain attempt is never repeated, even with a different UI ticket.
      if(slot.account&&slot.account.state!=='failed')return 'unknown';
      try{slot=await deps.store.save(owner,'agentboard',slot,{version:1,job:id,state:'registering',updatedAt:now()});}catch(error){observe({stage:'store_claim_failed'});throw error;}
      try{
        const response=await request('/api/agents/register',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({name:values.name.trim()})});
        observe({stage:'register_response',status:response.status});
        if(!response.ok){await response.body?.cancel();if([400,422,429].includes(response.status))await deps.store.save(owner,'agentboard',slot,{...slot.account!,state:'failed'});return [400,422,429].includes(response.status)?'failed':'unknown';}
        const body=await nativeRegistrationJson(response);
        if(!object(body)||typeof body.credential!=='string'||!/^agb_[a-f0-9]{32,256}$/.test(body.credential)||!object(body.agent)||typeof body.agent.id!=='string'||body.agent.id.length>160)return 'unknown';
        // Save before verification: polling can finish verification without registering again.
        slot=await deps.store.save(owner,'agentboard',slot,{...slot.account!,state:'registered',credential:body.credential,externalId:body.agent.id});
        return await verify(owner,slot);
      }catch{observe({stage:'dispatch_or_save_failed'});return 'unknown';}
    };
  };
}
