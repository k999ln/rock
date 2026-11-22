import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { noahAgentStore } from './noah-agent-store.ts';
import { createNoahOutboxService, type NoahOutboxInput, type NoahOutboxCommand } from './noah-outbox.ts';
import { deliveryTargets } from './noah-delivery.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
export function createNoahOutboxApi(deps:{db:Pick<D1Database,'prepare'>;authenticate:(r:Request)=>Promise<string>;bindings:Record<string,unknown>;defer?:(p:Promise<unknown>)=>void;fetcher?:typeof fetch;now?:()=>number}){
  return async(request:Request,id?:string)=>{
    try{
      const owner=await deps.authenticate(request),scope=await ownerScopeFor(owner),url=new URL(request.url);
      if(!['GET','POST'].includes(request.method))return json({error:'対応しない操作です。'},405);
      if(request.method==='POST'){
        if(request.headers.get('origin')!==url.origin)throw new NoahAgentError('同じNoahから操作してください。',403);
        if(request.headers.get(OWNER_SCOPE_HEADER)!==scope)throw new NoahAgentError('アカウントが変わりました。再読込してください。',409);
      }
      const service=createNoahOutboxService({db:deps.db,targets:user=>deliveryTargets(deps.bindings,user,request.url),now:deps.now,fetcher:deps.fetcher});
      if(request.method==='GET'){
        if(id)return json({job:await service.get(owner,id),ownerScope:scope});
        const history=await service.list(owner,url.searchParams.get('agent'),url.searchParams.get('after'));
        let targets:ReturnType<typeof service.targets>=[],targetError='';try{targets=service.targets(owner);}catch{targetError='送信先の設定を確認できません。履歴は確認できます。';}
        const agents=(await noahAgentStore(deps.db,owner).list()).filter(a=>a.uploadState==='ready').map(a=>({id:a.id,name:a.manifest.name,version:a.manifest.version}));
        const invites=await deps.db.prepare('SELECT id,upload_id AS agentId,recipient_id AS recipient,expires_at AS expiresAt,revision,revoked_at AS revokedAt FROM noah_agent_invites WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').bind(owner).all();
        return json({...history,targets,targetError,agents,invites:invites.results,ownerScope:scope,observedAt:(deps.now??Date.now)()});
      }
      if(!request.headers.get('content-type')?.startsWith('application/json'))throw new NoahAgentError('JSONで操作してください。',415);
      const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedNoahBody(request,24000)));
      if(!id)return json({job:await service.create(owner,input as NoahOutboxInput),ownerScope:scope},201);
      const result=await service.command(owner,id,input as NoahOutboxCommand);
      if(result.dispatch){
        const run=service.dispatch(owner,id,result.dispatch).catch(()=>undefined);
        if(deps.defer)deps.defer(run);else await run;
      }
      return json({job:result.job,ownerScope:scope},result.dispatch?202:200);
    }catch(e){
      if(e instanceof NoahAgentError)return json({error:e.message},e.status);
      if(e instanceof Error&&e.message==='UNAUTHORIZED')return json({error:'サインインしてください。'},401);
      if(e instanceof SyntaxError)return json({error:'入力形式を確認してください。'},400);
      return json({error:'送信記録を確認できません。再送せず履歴から結果を確認してください。'},503);
    }
  };
}
