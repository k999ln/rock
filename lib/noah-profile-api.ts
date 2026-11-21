import { emptyNoahProfile, PROFILE_MAX_DOCUMENT } from './noah-profile-contract.ts';
import { validateProfileFields, validateGrant, type NoahProfileStore } from './noah-profile-store.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function profileBody(request:Request,max:number) {
  const reader=request.body?.getReader(); if(!reader) throw new NoahAgentError('入力を確認してください。');
  const chunks:Uint8Array[]=[];let size=0;
  try { while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max){await reader.cancel();throw new NoahAgentError('保存できるサイズを超えています。',413);}chunks.push(part.value);} } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export function createNoahProfileApi(deps:{store:NoahProfileStore;authenticate:(request:Request)=>Promise<string>}) {
  async function owner(request:Request,write=false){
    const user=await deps.authenticate(request);
    if(write){
      if(request.headers.get('origin')!==new URL(request.url).origin)throw new NoahAgentError('Noahの画面から操作してください。',403);
      if(request.headers.get(OWNER_SCOPE_HEADER)!==await ownerScopeFor(user))throw new NoahAgentError('アカウントが変わりました。画面を開き直してください。',409);
    }return user;
  }
  async function respond(work:()=>Promise<Response>){try{return await work();}catch(e){
    if(e instanceof NoahAgentError)return json({error:e.message},e.status);
    if(e instanceof Error && e.message==='UNAUTHORIZED')return json({error:'保存先を開けませんでした。もう一度お試しください。'},401);
    if(e instanceof SyntaxError)return json({error:'入力を確認してください。'},400);
    return json({error:'保存先に接続できません。もう一度お試しください。'},503);
  }}
  const view=async(user:string,profile:Awaited<ReturnType<NoahProfileStore['load']>>['profile'])=>json({...profile,ownerScope:await ownerScopeFor(user),available:deps.store.available,browserOwned:user.startsWith('noah-browser:')});
  return {
    collection:(request:Request)=>respond(async()=>{
      const user=await owner(request,request.method==='POST');
      if(request.method==='GET')return view(user,deps.store.available?(await deps.store.load(user)).profile:emptyNoahProfile());
      if(request.method!=='POST')return json({error:'対応しない操作です。'},405);
      if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new NoahAgentError('入力の形式を確認してください。',415);
      const input=JSON.parse(new TextDecoder().decode(await profileBody(request,30000))) as Record<string,unknown>;
      if(!input || typeof input!=='object' || Array.isArray(input) || !Number.isSafeInteger(input.revision))throw new NoahAgentError('情報を読み直してください。');
      const allowed:Record<string,string[]>={fields:['fields','consentVersion','reuse'],reuse:['enabled','consentVersion'],grant:['grant'],pause:['paused'],deleteDocument:['id'],clear:[]};
      const keys=allowed[String(input.action)];
      if(!keys || Object.keys(input).some(k=>!['action','revision',...keys].includes(k)))throw new NoahAgentError('操作を確認してください。');
      let profile;
      const revision=Number(input.revision);
      if(input.action==='deleteDocument')profile=await deps.store.removeDocument(user,revision,String(input.id));
      else profile=await deps.store.change(user,revision,p=>{
        if(input.action==='fields'){if(typeof input.reuse!=='boolean')throw new NoahAgentError('再利用の設定を確認してください。');const fields=validateProfileFields(input.fields);return deps.store.consent({...p,fields},input.consentVersion,input.reuse,Object.keys(fields) as (keyof typeof fields)[],[]);}
        if(input.action==='reuse' && typeof input.enabled==='boolean')return deps.store.consent(p,input.consentVersion,input.enabled,Object.keys(p.fields) as (keyof typeof p.fields)[],p.documents.map(d=>d.id),input.enabled?'reuse-resume':'reuse-stop');
        if(input.action==='grant'){const grant=validateGrant(input.grant);return {...p,grants:[...p.grants.filter(g=>!(g.target===grant.target && g.action===grant.action)),grant]};}
        if(input.action==='pause' && typeof input.paused==='boolean')return {...p,paused:input.paused};
        if(input.action==='clear')return {...p,fields:{}};
        throw new NoahAgentError('操作を確認してください。');
      });
      return view(user,profile);
    }),
    documents:(request:Request)=>respond(async()=>{
      const user=await owner(request,true);
      if(request.method!=='POST')return json({error:'対応しない操作です。'},405);
      const type=request.headers.get('content-type')??'';
      if(!['application/pdf','image/png','image/jpeg'].includes(type))throw new NoahAgentError('PDF・JPEG・PNGを選んでください。',415);
      let name='';try{name=decodeURIComponent(request.headers.get('X-Noah-File-Name')??'');}catch{throw new NoahAgentError('ファイル名を確認してください。');}
      const revision=Number(request.headers.get('X-Noah-Profile-Revision'));
      if(!request.headers.has('X-Noah-Profile-Revision')||!Number.isSafeInteger(revision))throw new NoahAgentError('保存情報を読み直してください。');
      return view(user,await deps.store.addDocument(user,revision,name,type,await profileBody(request,PROFILE_MAX_DOCUMENT),request.headers.get('X-Noah-Consent-Version')??''));
    }),
    document:(request:Request,id:string)=>respond(async()=>{
      const user=await owner(request);const {meta,bytes}=await deps.store.document(user,id);
      return new Response(bytes as Uint8Array<ArrayBuffer>,{headers:{'Content-Type':meta.type,'Content-Disposition':`attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(meta.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'}});
    }),
  };
}
