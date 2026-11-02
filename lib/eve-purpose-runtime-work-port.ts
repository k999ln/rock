import {createRuntimeEveWorkPort} from './eve-runtime-work-port.ts';
import {linkedDigest,type LinkedAgent} from './rockstar-linked-execution.ts';
import {parseLinuxAgent} from './sky-linux-record.ts';
import type {EveRuntimePresence} from './sky-eve-connections.ts';
import {negotiateTextAdapters} from './rockstar-adapters.ts';
import type {EveWorkPort,EveWorkReference} from './rockstar-eve-interaction.ts';
import type {SkyLibraryAgent} from './sky-agent-library.ts';
type Binding={owner:string;threadId:string;deviceId:string;modelId:string;modelSha256:string;modelScheme:'gguf-sha256'};
type Api=Parameters<typeof createRuntimeEveWorkPort>[0]['api'];
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Intent={version:1;input:string;agentId:string;preparationId:string};
type Preparation={ownerUserId:string;command:{schema:string;owner:string;deviceId:string;request:{id:string;threadId:string;agent:LinkedAgent;model:{id:string;scheme:string;sha256:string};deadline:number}};state:string;expired:boolean;registered:boolean|null};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function purposeEvePendingKey(b:Binding){return 'rockstaros.eve.purpose.pending.v1:'+encodeURIComponent(JSON.stringify([b.owner,b.threadId,b.deviceId,b.modelId,b.modelSha256,b.modelScheme]));}
type PortOptions=Binding&{api:Api;storage:StoragePort;continuing:()=>boolean;clock?:()=>number;sleep?:(ms:number)=>Promise<void>};
export function libraryEvePendingKey(b:Binding,agent:Pick<SkyLibraryAgent,'id'|'revision'>){return purposeEvePendingKey(b)+':library:'+encodeURIComponent(JSON.stringify([agent.id,agent.revision]));}
/** Reuse the exact saved role; registration never creates another library agent. */
export function createLibraryRuntimeEveWorkPort(raw:PortOptions&{agent:SkyLibraryAgent}){
 const agent=Object.freeze({...raw.agent});
 if(agent.source!=='personal'||agent.sourceTool!==null||!agent.enabled||('attachment' in agent&&agent.attachment)||agent.provider!=='local-model'||agent.model!==raw.modelId||!uuid.test(agent.id)||!Number.isSafeInteger(agent.revision)||agent.revision<1)throw Error('対応する保存済みの文章担当とモデルを確認してください。');
 return purposePort(raw,agent);
}
/** Deterministic baseline from the actual confirmed purpose, not a fixed-use recipe.
 * It defines a text role only; model output cannot add OS/Tool permissions. */
export function draftEvePurposeRole(input:string,modelId:string){
 if(typeof input!=='string'||!input.trim()||input.length>1000)throw Error('依頼を1,000文字以内で確認してください。');
 const purpose=input.trim();let name='';for(const {segment} of new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(purpose.replace(/\s+/gu,' '))){if(name.length+segment.length>72)break;name+=segment;}return parseLinuxAgent({name:(name||'依頼')+'の担当',instructions:'この担当の目的:\n'+purpose+'\n\n目的と完成条件に沿って文章を下書きする。不明な点は明示し、未実行の外部操作を成功と主張しない。この役割はOS権限や外部送信・課金の承認ではない。',modelId});
}
export function createPurposeRuntimeEveWorkPort(raw:PortOptions):EveWorkPort&{cancelPreparation:()=>Promise<void>}{return purposePort(raw);}
function purposePort(raw:PortOptions,selection?:SkyLibraryAgent):EveWorkPort&{cancelPreparation:()=>Promise<void>}{
 const b=Object.freeze({...raw}),now=b.clock??Date.now,sleep=b.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms))),intentKey=(selection?libraryEvePendingKey(b,selection):purposeEvePendingKey(b))+':preparation';
 if(!b.owner||![b.threadId,b.deviceId].every(id=>uuid.test(id))||!/^[a-f0-9]{64}$/.test(b.modelSha256)||b.modelScheme!=='gguf-sha256')throw Error('本人・会話・実行先・AIの版を確認してください。');
 const live=()=>{if(!b.continuing())throw Error('本人か会話が変わりました。元の依頼の状態を確認してください。');};
 async function api<T>(path:string,init?:RequestInit):Promise<T>{live();const headers=new Headers(init?.headers);headers.set('x-sky-owner',b.owner);const value=await b.api<T>(path,{...init,headers});live();return value;}
 const put=<T>(value:unknown)=>api<T>('/api/eve/runtime',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 function intent():Intent|null{
  const value=b.storage.getItem(intentKey);if(!value)return null;
  try{const i=JSON.parse(value) as Intent;if(Object.keys(i).sort().join(',')!=='agentId,input,preparationId,version'||i.version!==1||!uuid.test(i.agentId)||!uuid.test(i.preparationId)||typeof i.input!=='string'||!i.input.trim()||i.input.length>1000)throw Error();return i;}
  catch{throw Error('担当登録の記録を読めません。元の会話の登録状態を確認してください。');}
 }
 function store(i:Intent){b.storage.setItem(intentKey,JSON.stringify(i));}
 async function read(i:Intent){try{return await api<Preparation>('/api/eve/runtime?preparationId='+encodeURIComponent(i.preparationId));}catch(e){if(e&&typeof e==='object'&&'status'in e&&e.status===404)return null;throw e;}}
 async function cancelPreparation(){
  const i=intent();if(!i)return;
  try{const result=await put<{id:string;cancelled:boolean;registered:boolean|null}>({action:'cancel-agent-preparation',id:i.preparationId});if(result.id!==i.preparationId||result.cancelled!==true&&result.registered!==true)throw Error('担当登録の中止を確認できません。');}
  catch(e){if(!(e&&typeof e==='object'&&'status'in e&&e.status===404))throw e;}
  b.storage.removeItem(intentKey);
 }
 function port(r:Pick<EveWorkReference,'agentId'|'agentSha256'|'modelSha256'>){
  if(r.modelSha256!==b.modelSha256)throw Error('使うAIの版が変わりました。');
  return createRuntimeEveWorkPort({...b,agentId:r.agentId,agentSha256:r.agentSha256});
 }
 function matches(a:SkyLibraryAgent,role:ReturnType<typeof draftEvePurposeRole>){return (!selection||(a.id===selection.id&&a.revision===selection.revision))&&a.source==='personal'&&a.sourceTool===null&&a.enabled===true&&!('attachment' in a&&a.attachment)&&a.name===role.name&&a.instructions===role.instructions&&a.provider==='local-model'&&a.model===b.modelId;}
 async function library(id:string){const view=await api<{ownerUserId:string;agent:SkyLibraryAgent}>('/api/sky/agents?id='+encodeURIComponent(id));if(view.ownerUserId!==b.owner||view.agent?.id!==id)throw Error('担当の本人が一致しません。');return view.agent;}
 function checkPreparation(v:Preparation,i:Intent,sha:string){const c=v.command,r=c?.request;if(v.ownerUserId!==b.owner||c?.owner!==b.owner||c.schema!=='rockstaros.agent-preparation-command/1'||c.deviceId!==b.deviceId||r?.id!==i.preparationId||r.threadId!==b.threadId||r.agent?.id!==i.agentId||r.agent.sha256!==sha||r.model?.id!==b.modelId||r.model.scheme!==b.modelScheme||r.model.sha256!==b.modelSha256)throw Error('担当登録の本人・会話・担当・AIが一致しません。');}
 return {
  cancelPreparation,
  async prepare(input,continuing){
   if(typeof input!=='string'||!input.trim()||input.length>1000)throw Error('依頼を1,000文字以内で確認してください。');
   const role=selection?parseLinuxAgent({name:selection.name,instructions:selection.instructions,modelId:b.modelId}):draftEvePurposeRole(input,b.modelId),sha=await linkedDigest(JSON.stringify(role));live();
   if(selection&&!matches(await library(selection.id),role))throw Error('担当の設定が変わりました。smisで現在の版を確認してください。');
   const snapshot=await api<{ownerUserId:string;devices:EveRuntimePresence[]}>('/api/eve/runtime'),device=snapshot.devices?.find(d=>d.deviceId===b.deviceId),model=device?.models.find(m=>m.id===b.modelId);
   if(snapshot.ownerUserId!==b.owner||!device||device.phase!=='ready'||now()-device.updatedAt>=30000||device.host.capabilities['agent.prepare']!==true||!model||model.scheme!==b.modelScheme||model.sha256!==b.modelSha256||!device.preparedModels.includes(model.id))throw Error('選んだ実行先で担当登録とAIの準備を確認してください。');
   negotiateTextAdapters(device.host,device.executor,device.output,now());
   if(!continuing())return null;
   let i=intent();
   if(i&&i.input!==input){const prior=await read(i);if(prior&&prior.registered!==true&&prior.state!=='agent-prepare-cancelled')throw Error('前の担当登録が残っています。元の登録を確認・中止してください。');b.storage.removeItem(intentKey);i=null;}
   if(!i){
    const recovery=await api<{ownerUserId:string;threadId:string;preparations:Preparation[];hasMore:boolean}>('/api/eve/runtime?preparationThreadId='+encodeURIComponent(b.threadId));
    if(recovery.ownerUserId!==b.owner||recovery.threadId!==b.threadId||!Array.isArray(recovery.preparations)||recovery.hasMore)throw Error('保存済みの担当登録をすべて確認できません。元の登録番号で状態を確認してください。');
    const found=recovery.preparations.find(v=>v.command?.deviceId===b.deviceId&&(!selection||v.command.request.agent.id===selection.id)&&v.command.request?.agent.sha256===sha&&v.command.request.model?.sha256===b.modelSha256&&v.state!=='agent-prepare-cancelled');
    i={version:1,input,agentId:selection?.id??found?.command.request.agent.id??crypto.randomUUID(),preparationId:found?.command.request.id??crypto.randomUUID()};store(i);
   }
   try{
    let a:SkyLibraryAgent|null=null;try{a=await library(i.agentId);}catch(e){if(!(e&&typeof e==='object'&&'status'in e&&e.status===404))throw e;}
    if(!a){
     if(selection)throw Error('保存した担当が見つかりません。smisで確認してください。');
     // ID is durable before the first mutation. A lost save response is read
     // through that same ID on the next confirmed attempt, never recreated.
     await api('/api/sky/agents',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:i.agentId,revision:0,create:true,settings:{name:role.name,instructions:role.instructions,provider:'local-model',model:b.modelId,enabled:true}})});
     a=await library(i.agentId);
    }
    if(!matches(a,role))throw Error('保存した担当の役割・AI・有効状態が変わりました。内容を確認してください。');
    if(!continuing()){await cancelPreparation();return null;}
    let current=await read(i);
    if(!current){const result=await put<{id:string}>({action:'prepare-agent',request:{id:i.preparationId,threadId:b.threadId,deviceId:b.deviceId,agent:{id:i.agentId,...role,sha256:sha},model:{id:b.modelId,scheme:b.modelScheme,sha256:b.modelSha256},confirm:'prepare-owner-local-agent'}});if(result.id!==i.preparationId)throw Error('担当登録番号が一致しません。送り直さず確認してください。');}
    for(let attempt=0;attempt<125;attempt++){
     if(!continuing()){await cancelPreparation();return null;}
     current=await read(i);if(!current)throw Error('担当登録の保存を確認できません。元の番号を確認してください。');checkPreparation(current,i,sha);
     if(current.registered===true){
      if(!matches(await library(i.agentId),role))throw Error('担当の設定が変わりました。実行は始めていません。');
      const reference={agentId:i.agentId,agentSha256:sha,modelSha256:b.modelSha256,input};
      const prepared=await port(reference).prepare(input,continuing);if(!prepared)return null;
      b.storage.removeItem(intentKey);return prepared;
     }
     if(current.state.startsWith('agent-prepare-unknown:'))throw Error('担当の登録を確認できません。同じ登録番号で照会するか、中止して内容を確認してください。自動では登録し直しません。');
     if(current.expired||current.state==='agent-prepare-cancelled')throw Error('担当登録の期限か中止状態を確認してください。自動で登録し直しません。');
     await sleep(1000);
    }
    throw Error('担当登録がまだ未確認です。同じ登録番号で状態を確認してください。');
   }finally{if(!continuing()&&b.continuing()){try{await cancelPreparation();}catch{/* Retain the original intent; never infer success from failed cancellation. */}}}
  },
  async start(reference){const a=await library(reference.agentId),role=parseLinuxAgent({name:a.name,instructions:a.instructions,modelId:b.modelId});if(!matches(a,role)||await linkedDigest(JSON.stringify(role))!==reference.agentSha256)throw Error('担当の役割か利用状態が変わりました。実行を始めていません。');return port(reference).start(reference);},
  read(reference){return port(reference).read(reference);},
  stop(reference){return port(reference).stop(reference);},
  stopExisting(reference){return port(reference).stopExisting!(reference);},
 };
}
