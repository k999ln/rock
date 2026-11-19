import type {EveWorkObservation,EveWorkPort,EveWorkReference} from './rockstar-eve-interaction.ts';
import type {EveRuntimeExecution,EveRuntimePending} from './eve-runtime-sync.ts';
import {skyEveDeviceState,type EveRuntimePresence} from './sky-eve-connections.ts';
type Binding={owner:string;threadId:string;deviceId:string;agentId:string;agentSha256:string;modelSha256:string;modelScheme:'gguf-sha256'|'ollama-manifest-sha256'};
type Request=<T>(path:string,init?:RequestInit)=>Promise<T>;
type Snapshot={ownerUserId:string;devices:EveRuntimePresence[]};
type Observation={ownerUserId:string;pending:EveRuntimePending;execution:EveRuntimeExecution|null};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hash=/^[a-f0-9]{64}$/;
/** Scope the existing pending handle to its owner and immutable execution context. */
export function runtimeEvePendingKey(binding:Binding){return 'rockstaros.eve.runtime.pending.v1:'+encodeURIComponent(JSON.stringify([binding.owner,binding.threadId,binding.deviceId,binding.agentId,binding.agentSha256,binding.modelSha256,binding.modelScheme]));}
/** Choices are discovery only; the bound port authenticates the exact job again. */
export function runtimeEveRestorableWork(binding:Binding, snapshot:{ownerUserId:string;pending:EveRuntimePending[];executions:EveRuntimeExecution[]}):EveWorkReference[]{
 if(snapshot.ownerUserId!==binding.owner)return [];
 const choices=new Map<string,EveWorkReference>(),conflicts=new Set<string>();
 const rows=[...snapshot.pending.map(p=>({id:p.id,threadId:p.threadId,deviceId:p.deviceId,input:p.input,agent:{id:p.agentId,sha256:p.agentSha256},model:p.model})),...snapshot.executions.map(e=>({id:e.id,threadId:e.threadId,deviceId:e.deviceId,input:e.input,agent:e.request.agent,model:e.request.model}))];
 for(const row of rows){
  if(!uuid.test(row.id)||row.threadId!==binding.threadId||row.deviceId!==binding.deviceId||row.agent?.id!==binding.agentId||row.agent.sha256!==binding.agentSha256||row.model?.sha256!==binding.modelSha256||row.model.scheme!==binding.modelScheme||!row.input.trim()||row.input.length>1000)continue;
  const ref={id:row.id,agentId:row.agent.id,agentSha256:row.agent.sha256,modelSha256:row.model.sha256,input:row.input};
  const old=choices.get(ref.id);if(old&&old.input!==ref.input)conflicts.add(ref.id);else choices.set(ref.id,ref);
 }
 return [...choices.values()].filter(ref=>!conflicts.has(ref.id));
}
/** Account runtime adapter, not an executor or agent creator. Existing selected
 * agents remain pinned; creation is a separate existing Eve/library operation. */
export function createRuntimeEveWorkPort(rawOptions:Binding&{api:Request;continuing:()=>boolean;clock?:()=>number}):EveWorkPort{
 const options=Object.freeze({...rawOptions}),now=options.clock??Date.now;
 if(!options.owner||!uuid.test(options.threadId)||!uuid.test(options.deviceId)||!uuid.test(options.agentId)||!hash.test(options.agentSha256)||!hash.test(options.modelSha256)||!['gguf-sha256','ollama-manifest-sha256'].includes(options.modelScheme))throw Error('本人・会話・実行先・担当の版を確認してください。');
 const live=()=>{if(!options.continuing())throw Error('アカウントか実行先が変わりました。元の仕事を確認してください。');};
 async function api<T>(path:string,init?:RequestInit):Promise<T>{live();const headers=new Headers(init?.headers);headers.set('x-sky-owner',options.owner);const value=await options.api<T>(path,{...init,headers});live();return value;}
 function reference(value:EveWorkReference){live();if(!uuid.test(value.id)||value.agentId!==options.agentId||value.agentSha256!==options.agentSha256||value.modelSha256!==options.modelSha256||typeof value.input!=='string'||!value.input.trim()||value.input.length>1000)throw Error('仕事と担当・AIの版を確認してください。');}
 async function observe(value:EveWorkReference):Promise<EveWorkObservation|null>{
  reference(value);let view:Observation;
  try{view=await api<Observation>('/api/eve/runtime?requestId='+encodeURIComponent(value.id));}
  catch(error){if(error&&typeof error==='object'&&'status' in error&&error.status===404)return null;throw error;}
  if(view.ownerUserId!==options.owner)throw Error('本人が変わりました。元の仕事を確認してください。');
  const p=view.pending,e=view.execution;
  if(!p||p.id!==value.id||p.threadId!==options.threadId||p.deviceId!==options.deviceId||p.input!==value.input.trim()||p.agentId!==value.agentId||p.agentSha256!==value.agentSha256||p.model?.sha256!==value.modelSha256||p.model.scheme!==options.modelScheme)throw Error('保存した依頼の本人・担当・実行先が一致しません。');
  if(e&&(e.id!==value.id||e.threadId!==options.threadId||e.deviceId!==options.deviceId||e.input!==value.input.trim()||e.request?.agent.id!==value.agentId||e.request.agent.sha256!==value.agentSha256||e.request.model.sha256!==value.modelSha256||e.request.model.scheme!==options.modelScheme))throw Error('保存した成果の仕事と担当が一致しません。');
  if(['stop-requested','stop-unknown'].includes(p.state))return {status:'unknown',text:null};
  if(['cancelled-before-start','stop-confirmed','stop-finished'].includes(p.state))return {status:'stopped',text:e?.report.text??null};
  if(e?.report.state==='review')return {status:'review',text:e.report.text};
  if(e?.report.state==='unknown')return {status:'unknown',text:null};
  if(!['pending','received'].includes(p.state))throw Error('仕事の状態を確認できません。');
  if(p.state==='pending'&&(!Number.isFinite(p.expiresAt)||p.expiresAt<=now()))return {status:'unknown',text:null};
  return {status:'running',text:null};
 }
 const startRequest=(value:EveWorkReference)=>({id:value.id,threadId:options.threadId,deviceId:options.deviceId,agentId:value.agentId,agentSha256:value.agentSha256,modelSha256:value.modelSha256,modelScheme:options.modelScheme,input:value.input,maxOutputTokens:256,confirm:'run-owner-local-text'});
 async function stop(value:EveWorkReference,existing=false):Promise<EveWorkObservation|null>{const before=await observe(value);if(before&&['review','completed','stopped'].includes(before.status))return before;if(!before&&existing)return {status:'unknown',text:null};live();const saved=await api<{id:string}>('/api/eve/runtime',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(before?{action:'stop',request:{id:value.id,confirm:'stop-owner-local-text'}}:{action:'fence-start',request:startRequest(value)})});if(saved.id!==value.id)throw Error('停止する仕事番号を確認してください。');return observe(value);}
 return {
  async prepare(input,continuing){
   if(typeof input!=='string'||!input.trim()||input.length>1000)throw Error('依頼を1,000文字以内で確認してください。');
   const view=await api<Snapshot>('/api/eve/runtime');if(!continuing())return null;
   if(view.ownerUserId!==options.owner||!Array.isArray(view.devices))throw Error('本人と接続を確認してください。');
   const device=view.devices.find(d=>d.deviceId===options.deviceId),agent=device?.agents.find(a=>a.id===options.agentId),model=device?.models.find(m=>m.id===agent?.modelId);
   if(!device||!agent||!model||agent.sha256!==options.agentSha256||model.sha256!==options.modelSha256||model.scheme!==options.modelScheme||!skyEveDeviceState(device,agent.id,now()).available)throw Error('選んだ担当・AI・実行先の準備が変わりました。');
   live();if(!continuing())return null;
   return {agentId:agent.id,agentSha256:agent.sha256,modelSha256:model.sha256,input};
  },
  async start(value){reference(value);const saved=await api<{id:string}>('/api/eve/runtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(startRequest(value))});if(saved.id!==value.id)throw Error('保存した仕事番号を確認してください。再送しないでください。');return (await observe(value))??{status:'unknown',text:null};},
  read:observe,
  stop,
  stopExisting:value=>stop(value,true),
 };
}
