import { randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { InstallError } from './noah-source-fetch.mjs';
import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../lib/sky-private-loopback.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function parse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k=>!['id','revision','commandId','agentId','digest','replacePending'].includes(k)) ||
    ![value.id,value.commandId].every(v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)) ||
    !Number.isSafeInteger(value.revision)||value.revision<0||typeof value.agentId!=='string'||value.agentId.length>80||!/^[a-f0-9]{64}$/.test(value.digest)||typeof value.replacePending!=='boolean') throw new InstallError('準備するAgent・版・操作IDを確認してください。',400);
  return value;
}
function matches(pin,binding) {
  if (!binding || binding.version!==pin.version || binding.model!==pin.model) return false;
  if(pin.kind==='upload') return binding.source?.uploadId===pin.agentId && binding.source.manifestSha256===pin.manifestSha256 && binding.source.sourceSha256===pin.sourceSha256;
  if(pin.kind==='invite') return binding.invite?.inviteId===pin.invite?.id && binding.invite.revision===pin.invite.revision && binding.invite.expiresAt===pin.invite.expiresAt && binding.invite.manifestSha256===pin.manifestSha256 && binding.invite.sourceSha256===pin.sourceSha256;
  if(pin.kind==='release') return binding.release?.manifestSha256===pin.manifestSha256 && binding.release.sourceSha256===pin.sourceSha256;
  return true; // Server also re-resolves the reviewed recipe digest at commit.
}
export function createInstancePreparation({ wait = signal => delay(500,undefined,{signal}) } = {}) {
  const running=new Map(); let closing=false;
  const key=(scope,id)=>`${scope}/${id}`;
  const api={
    attached(scope,instance) { return {...instance,preparationAttached:Boolean(running.get(key(scope,instance.id)))}; },
    async start(scope,raw,client) {
      const input=parse(raw),k=key(scope,input.id),prior=running.get(k);
      if(closing) throw new InstallError('実行hostは停止中です。',503);
      if(prior&&JSON.stringify(prior.input)===JSON.stringify(input)) { await prior.accepted; return client.api('get',{id:input.id}); }
      if(prior&&!input.replacePending) throw new InstallError('このAgentの準備中です。',409);
      if(!prior&&running.size>=2) throw new InstallError('版の準備が混雑しています。しばらく待って再試行してください。',429);
      await client.revalidate();
      const claim=randomBytes(32).toString('hex'),controller=new AbortController(),context={input,controller,task:null,accepted:Promise.resolve(null)};
      // Reserve before awaiting account acceptance: two clicks must not create two claims.
      if(running.get(k)!==prior) throw new InstallError('別の準備操作が始まりました。',409);
      if(!prior&&running.size>=2) throw new InstallError('版の準備が混雑しています。しばらく待って再試行してください。',429);
      running.set(k,context);
      const accepted=Promise.resolve(client.api('prepare',{...input,claimSha256:hash(claim)})); context.accepted=accepted;
      let result;
      try { result=await accepted; }
      catch(e) { if(running.get(k)===context) { if(prior) running.set(k,prior); else running.delete(k); } throw e; }
      prior?.controller.abort();
      if(result.instance.pending?.id!==input.commandId) { if(running.get(k)===context) running.delete(k); return result; }
      const pin=result.instance.pending.pin;
      context.task=(async()=>{
        try {
          await client.revalidate(); controller.signal.throwIfAborted();
          await client.installations.connect(scope,pin.agentId,client.revalidate);
          for(let tries=0;;tries++) {
            controller.signal.throwIfAborted();
            const state=await client.installations.status(scope,pin.agentId);
            if(!state.busy) { if(state.state!=='connected') throw new InstallError('新版の接続準備に失敗しました。',409); break; }
            if(tries>=600) throw new InstallError('新版の準備が時間内に終わりませんでした。',504);
            await wait(controller.signal);
          }
          await client.revalidate(); controller.signal.throwIfAborted();
          const runtime=await client.installations.execution(scope,pin.agentId);
          await runtime.revalidate?.();
          if(!matches(pin,runtime.binding || {version:runtime.runtimeInfo?.version,model:runtime.execution?.model})) throw new InstallError('準備した版・モデルが選択内容と一致しません。',409);
          controller.signal.throwIfAborted();
          await client.api('finish',{id:input.id,commandId:input.commandId,claim,state:'selected'});
        } catch {
          // If cancelled/replaced, the old claim cannot commit or overwrite its successor.
          await client.api('finish',{id:input.id,commandId:input.commandId,claim,state:'failed'}).catch(()=>{});
        } finally { if(running.get(k)===context) running.delete(k); }
      })();
      return result;
    },
    async cancel(scope,input,client) {
      const result=await client.api('cancel',input);
      const context=running.get(key(scope,input.id));context?.controller.abort();
      return result;
    },
    async close() { closing=true; for(const c of running.values()) c.controller.abort(); await Promise.allSettled([...running.values()].map(async c=>{await c.accepted.catch(()=>{});await c.task;})); },
  };
  return api;
}

export function instancePreparationMiddleware({manager,installations,port,getOwner,instanceFor}) {
  return async(request,response,next)=>{
    const path=request.url?.split('?')[0];if(path!=='/__noah/instances') return next();
    const send=(status,value)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(value));};
    try {
      const mutate=request.method==='POST';
      if(!['GET','POST'].includes(request.method)) throw new InstallError('対応しない操作です。',405);
      if(!isLocalRuntimeHost(request,port)||request.headers['sec-fetch-site']==='cross-site'||mutate&&!isLocalRuntimeRequest(request,port)) throw new InstallError('このMacのNoahから操作してください。',403);
      const owner=await getOwner(request),scope=owner.ownerScope;
      if(!owner.localHostOwner||!/^owner-v1:[a-f0-9]{64}$/.test(scope)) throw new InstallError('このMacの本人として接続してください。',403);
      const client={api:instanceFor(request,scope),installations,revalidate:async()=>{const current=await getOwner(request);if(!current.localHostOwner||current.ownerScope!==scope) throw new InstallError('本人の接続が変わりました。',403);}};
      let data;
      if(mutate) {
        if(request.headers['x-rock-owner-scope']!==scope) throw new InstallError('アカウントが変わりました。',409);
        if(!request.headers['content-type']?.startsWith('application/json')) throw new InstallError('JSONで指定してください。',415);
        const chunks=[];let size=0;for await(const chunk of request) {size+=chunk.length;if(size>4096) throw new InstallError('入力が大きすぎます。',413);chunks.push(chunk);}
        let value;try{value=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new InstallError('JSONを確認してください。',400);}
        if(value?.action==='cancel'&&Object.keys(value).every(k=>['action','id','revision'].includes(k))) data=await manager.cancel(scope,{id:value.id,revision:value.revision},client);
        else data=await manager.start(scope,value,client);
      } else {
        const q=new URL(request.url,'http://localhost').searchParams;
        data=await client.api('get',Object.fromEntries(['id','agentId'].filter(k=>q.has(k)).map(k=>[k,q.get(k)])));
      }
      if(data.instance) data.instance=manager.attached(scope,data.instance);
      if(data.instances) data.instances=data.instances.map(i=>manager.attached(scope,i));
      send(mutate&&data.instance?.pending?202:200,{...data,ownerScope:scope});
    } catch(e) {send(e instanceof InstallError?e.status:503,{error:e instanceof InstallError?e.message:'版の準備先を確認できません。'});}
  };
}
