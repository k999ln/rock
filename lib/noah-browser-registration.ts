import { NoahAgentError } from './noah-agent-upload.ts';
import { OWNER_SCOPE_HEADER,ownerScopeFor } from './owner-intent.ts';
import { canonicalJson,sha256Hex } from './noah-connect-requirements.ts';
import type { NoahExternalAccountStore } from './noah-external-account-store.ts';
import type { ConfiguredRegistration,RegistrationExecutor } from './noah-registration.ts';
import type { RegistrationState } from './noah-registration-contract.ts';
import { boundedJson,signature,validInput } from '../services/noah-registration-browser/protocol.mjs';

type BrowserReply={id:string;state:RegistrationState;expiresAt?:number;sequence?:number;image?:string;width?:number;height?:number;verified?:{credential:string;externalId:string}};
type Dependencies={url?:string;key?:string;store:NoahExternalAccountStore;providers:ConfiguredRegistration[];authenticate:(r:Request)=>Promise<string>;fetcher?:typeof fetch};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
export function createNoahBrowserRegistration(deps:Dependencies){
  const fetcher=deps.fetcher??fetch;
  let endpoint:URL|null=null;try{const u=new URL(deps.url!);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/v1/session')endpoint=u;}catch{/* unconfigured */}
  const available=Boolean(endpoint&&deps.key&&deps.key.length>=32&&deps.store.available);
  const digest=(p:ConfiguredRegistration)=>sha256Hex(canonicalJson(p));
  const matches=(p:ConfiguredRegistration)=>p.execution==='browser'&&p.executorUrl===endpoint?.href;
  async function owner(request:Request){let user:string;try{user=await deps.authenticate(request);}catch{throw new NoahAgentError('Noahにサインインしてください。',401);}
    if(request.method==='POST'&&request.headers.get(OWNER_SCOPE_HEADER)!==await ownerScopeFor(user))throw new NoahAgentError('アカウントが変わりました。画面を開き直してください。',409);return user;}
  async function call(user:string,provider:ConfiguredRegistration,id:string,action:string,extra:Record<string,unknown>={}):Promise<BrowserReply>{
    if(!available||!matches(provider))throw new NoahAgentError('登録の実行環境は準備中です。',503);
    const body=JSON.stringify({id,owner:await sha256Hex(user),providerId:provider.id,action,...extra}),time=String(Date.now());
    const response=await fetcher(endpoint!,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','X-Noah-Time':time,'X-Noah-Signature':await signature(deps.key!,time,body)},body});
    if(!response.ok){await response.body?.cancel();throw new NoahAgentError(response.status===429?'登録用ブラウザが混み合っています。時間をおいて確認してください。':'登録の状態を確認できません。同じ仕事を開き直してください。',response.status===429?429:503);}
    const reply=await boundedJson(response,1_048_576) as BrowserReply;
    if(reply.id!==id||!['running','needs_user','completed','failed','unknown'].includes(reply.state))throw new NoahAgentError('登録の応答を確認できません。',503);
    return reply;
  }
  async function finish(user:string,provider:ConfiguredRegistration,id:string,reply:BrowserReply):Promise<RegistrationState>{
    // A browser's success text never grants a connection. Only its fixed identity endpoint can verify it.
    if(!reply.verified)return reply.state==='completed'?'unknown':reply.state;
    const {credential,externalId}=reply.verified;
    if(typeof credential!=='string'||!credential||credential.length>2048||/\s/.test(credential)||Array.from(credential).some(c=>c.charCodeAt(0)<32)||typeof externalId!=='string'||!externalId||externalId.length>160)return 'unknown';
    const slot=await deps.store.load(user,provider.id);if(slot.account?.job!==id||slot.account.configurationDigest!==await digest(provider))return 'unknown';
    await deps.store.save(user,provider.id,slot,{...slot.account,state:'ready',credential,externalId});
    await call(user,provider,id,'cancel').catch(()=>{});return 'completed';
  }
  async function executor(request:Request,provider:ConfiguredRegistration):Promise<RegistrationExecutor|undefined>{
    if(provider.execution!=='browser')return undefined;
    if(!available||!matches(provider))throw new NoahAgentError('登録の実行環境は準備中です。',503);
    const user=await owner(request);
    return async(id,values,documents)=>{
      if(documents&&Object.keys(documents).length)throw new NoahAgentError('この登録先は書類の自動提出にまだ対応していません。');
      let slot=await deps.store.load(user,provider.id);
      if(slot.account&&slot.account.configurationDigest!==await digest(provider))return 'unknown';
      if(slot.account?.state==='ready')return 'completed';
      if(values){
        if(slot.account)return slot.account.job===id?finish(user,provider,id,await call(user,provider,id,'resume')):'unknown';
        slot=await deps.store.save(user,provider.id,slot,{version:1,job:id,state:'registering',configurationDigest:await digest(provider),updatedAt:Date.now()});
        return finish(user,provider,id,await call(user,provider,id,'register',{revision:provider.revision,values}));
      }
      if(slot.account?.job!==id||slot.account.configurationDigest!==await digest(provider))return 'unknown';
      const status=await call(user,provider,id,'status');
      return status.state==='needs_user'?finish(user,provider,id,await call(user,provider,id,'resume')):finish(user,provider,id,status);
    };
  }
  async function control(request:Request){try{
    const url=new URL(request.url);
    if(!['GET','POST'].includes(request.method))return json({error:'対応しない操作です。'},405);
    if(request.method==='POST'&&request.headers.get('origin')!==url.origin)return json({error:'Noahから操作してください。'},403);
    const user=await owner(request),id=url.searchParams.get('job'),provider=deps.providers.find(p=>p.id===url.searchParams.get('provider'));
    if(!id||!/^[a-f0-9-]{36}$/.test(id)||!provider||!matches(provider))return json({error:'登録先が見つかりません。'},404);
    const slot=await deps.store.load(user,provider.id);if(slot.account?.job!==id||slot.account.configurationDigest!==await digest(provider))return json({error:'この登録は開けません。'},404);
    if(slot.account.state==='ready')return json({id,state:'completed'});
    let action='frame',extra:Record<string,unknown>={};
    if(request.method==='POST'){
      if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'入力形式を確認してください。'},415);
      const data=await boundedJson(request,8192) as {action?:string;input?:unknown};
      if(!data||!['input','resume','cancel'].includes(data.action??''))return json({error:'操作を確認してください。'},400);
      action=data.action!;if(action==='input'){if(!validInput(data.input))return json({error:'入力を確認してください。'},400);extra={input:data.input};}
    }
    const reply=await call(user,provider,id,action,extra);
    const state=action==='resume'?await finish(user,provider,id,reply):reply.state;
    // Never return the service credential, remote session ID, target URLs, or internal verification reply.
    return json({id,state,expiresAt:reply.expiresAt,sequence:reply.sequence,...(action==='frame'&&reply.image&&reply.image.length<=900_000?{image:reply.image,width:390,height:640}:{})});
  }catch(e){return json({error:e instanceof NoahAgentError?e.message:'登録の画面を確認できません。'},e instanceof NoahAgentError?e.status:503);}}
  function ownerFetch(user:string,url:string):typeof fetch|undefined{
    const provider=deps.providers.find(p=>matches(p)&&p.mcpUrl===url);if(!provider)return undefined;
    return async(input,init)=>{
      const target=input instanceof Request?input.url:String(input);if(target!==url)throw new NoahAgentError('接続先が変わりました。',409);
      const {account}=await deps.store.load(user,provider.id);if(account?.state!=='ready'||!account.credential||account.configurationDigest!==await digest(provider))throw new NoahAgentError('登録してから接続してください。',401);
      const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));headers.set('Authorization',`Bearer ${account.credential}`);
      const response=await fetcher(input,{...init,headers,redirect:'manual'});
      if(!response.ok){await response.body?.cancel();return new Response(null,{status:response.status});}
      // Bounded MCP replies; exact credential echo is stripped before Work or UI sees it.
      const reader=response.body?.getReader();let length=0,body='';const decoder=new TextDecoder();
      try{if(reader)for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>1_048_576)throw Error('response_size');body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}finally{await reader?.cancel().catch(()=>{});}
      const output=new Headers(response.headers);output.delete('Content-Length');output.delete('Content-Encoding');output.delete('Set-Cookie');return new Response(body.split(account.credential).join('[保護された接続情報]'),{status:response.status,headers:output});
    };
  }
  return {available,executor,control,ownerFetch};
}
