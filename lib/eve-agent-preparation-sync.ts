import {linkedFields, linkedId, linkedHash, linkedDigest, linkedCanonical, LinkedExecutionError, type LinkedAgent, type LinkedPresence, type LinkedModel} from './rockstar-linked-execution.ts';
import {parseLinuxAgent} from './sky-linux-record.ts';
import type {eveHistoryStore} from './eve-history.ts';
type Row={id:string;device_id:string;thread_id:string;digest:string;envelope:string;state:string;expires_at:number};
type Request={id:string;threadId:string;agent:LinkedAgent;model:Omit<LinkedModel,'name'>;deadline:number};
type Command={schema:'rockstaros.agent-preparation-command/1';owner:string;deviceId:string;request:Request;requestSha256:string};
type Context={db:Pick<D1Database,'prepare'>;owner:string;history:ReturnType<typeof eveHistoryStore>;active:(device:string)=>Promise<void>;available:(device:string)=>Promise<{presence:LinkedPresence}>;find:(id:string)=>Promise<Row|null>;clock?:()=>number};
const pending='agent-prepare-pending',cancelled='agent-prepare-cancelled';
const ensurePreparation=(ok:unknown,code:string,status=409)=>{if(!ok)throw new LinkedExecutionError(code,status);};
/** Reuses the existing encrypted device-command queue; preparation never starts inference. */
export function eveAgentPreparationQueue({db,owner,history,active,available,find,clock=Date.now}:Context){
 async function unpack(row:Row):Promise<Command>{
  ensurePreparation(row.state.startsWith('agent-prepare-'),'AGENT_PREPARATION_NOT_FOUND',404);
  const c=await history.unsealRecord<Command>(row.envelope,`command:${row.id}`);
  ensurePreparation(c.schema==='rockstaros.agent-preparation-command/1'&&c.owner===owner&&c.deviceId===row.device_id&&c.request.id===row.id&&c.request.threadId===row.thread_id&&c.request.deadline===row.expires_at&&await linkedDigest(c.request)===c.requestSha256,'AGENT_PREPARATION_CORRUPT');
  return c;
 }
 async function selected(device:string,model:Request['model']){
  const {presence:p}=await available(device),m=p.models.find(m=>m.id===model.id);
  ensurePreparation(p.host.capabilities['agent.prepare']===true,'AGENT_PREPARATION_UNSUPPORTED');
  ensurePreparation(m&&m.scheme==='gguf-sha256'&&linkedCanonical({id:m.id,scheme:m.scheme,sha256:m.sha256})===linkedCanonical(model)&&p.preparedModels.includes(m.id),'RUNTIME_SELECTION_CHANGED');
  return p;
 }
 async function enqueue(raw:unknown){
  const v=linkedFields(raw,['id','threadId','deviceId','agent','model','confirm']);
  const id=linkedId(v.id),threadId=linkedId(v.threadId),deviceId=linkedId(v.deviceId);
  ensurePreparation(v.confirm==='prepare-owner-local-agent','AGENT_PREPARATION_APPROVAL_REQUIRED',400);
  const a=linkedFields(v.agent,['id','name','instructions','modelId','sha256']),m=linkedFields(v.model,['id','scheme','sha256']);
  let recipe;try{recipe=parseLinuxAgent({name:a.name,instructions:a.instructions,modelId:a.modelId});}catch{throw new LinkedExecutionError('INVALID_RUNTIME_AGENT');}
  const agent={id:linkedId(a.id),...recipe,sha256:linkedHash(a.sha256)};
  ensurePreparation(['name','instructions','modelId'].every(k=>a[k]===recipe[k as keyof typeof recipe])&&await linkedDigest(JSON.stringify(recipe))===agent.sha256,'RUNTIME_AGENT_PIN_MISMATCH',400);
  ensurePreparation(m.id===agent.modelId&&m.scheme==='gguf-sha256','RUNTIME_SELECTION_CHANGED',400);
  const model={id:agent.modelId,scheme:'gguf-sha256' as const,sha256:linkedHash(m.sha256)};
  await history.assertWritable(threadId);const digest=await linkedDigest(v),prior=await find(id);
  if(prior){ensurePreparation(prior.digest===digest&&prior.device_id===deviceId,'RUNTIME_REQUEST_CONFLICT');await unpack(prior);return {id,state:prior.state};}
  await selected(deviceId,model);
  const now=clock(),request:Request={id,threadId,agent,model,deadline:now+120000},command:Command={schema:'rockstaros.agent-preparation-command/1',owner,deviceId,request,requestSha256:await linkedDigest(request)};
  const envelope=await history.sealRecord(command,`command:${id}`);
  await db.prepare("INSERT INTO eve_device_commands(owner_id,id,device_id,thread_id,digest,envelope,state,created_at,expires_at) SELECT ?,?,?,?,?,?,'agent-prepare-pending',?,? WHERE (SELECT COUNT(*) FROM eve_device_commands WHERE owner_id=? AND device_id=? AND state LIKE 'agent-prepare-%' AND ((state='agent-prepare-pending' AND expires_at>?) OR state LIKE 'agent-prepare-claimed:%'))<8 AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0) AND EXISTS(SELECT 1 FROM rockstar_device_sessions WHERE user_id=? AND id=? AND revoked_at IS NULL AND expires_at>?) ON CONFLICT(owner_id,id) DO NOTHING")
   .bind(owner,id,deviceId,threadId,digest,envelope,now,request.deadline,owner,deviceId,now,owner,threadId,owner,deviceId,now).run();
  const row=await find(id);ensurePreparation(row&&row.digest===digest&&row.device_id===deviceId,'AGENT_PREPARATION_CONFLICT_OR_LIMIT');
  return {id,state:row!.state};
 }
 async function read(id:string,device?:string){
  if(device)await active(device);const row=await find(linkedId(id));ensurePreparation(row&&(!device||row.device_id===device),'AGENT_PREPARATION_NOT_FOUND',404);
  const command=await unpack(row!);await history.assertWritable(row!.thread_id);
  return {ownerUserId:owner,command,state:row!.state,expired:row!.expires_at<=clock(),registered:row!.state.startsWith('agent-prepare-done:')?true:row!.state===pending?false:null};
 }
 async function listOwner(threadId:string){
  linkedId(threadId);await history.assertWritable(threadId);
  const rows=await db.prepare("SELECT * FROM eve_device_commands WHERE owner_id=? AND thread_id=? AND state LIKE 'agent-prepare-%' ORDER BY created_at DESC,id DESC LIMIT 33").bind(owner,threadId).all<Row>();
  const preparations=await Promise.all(rows.results.slice(0,32).map(async row=>({ownerUserId:owner,command:await unpack(row),state:row.state,expired:row.expires_at<=clock(),registered:row.state.startsWith('agent-prepare-done:')?true:row.state===pending?false:null})));
  await history.assertWritable(threadId);
  return {ownerUserId:owner,threadId,preparations,hasMore:rows.results.length>32};
 }
 async function commands(device:string){
  await active(device);const rows=await db.prepare("SELECT * FROM eve_device_commands WHERE owner_id=? AND device_id=? AND ((state='agent-prepare-pending' AND expires_at>?) OR state LIKE 'agent-prepare-claimed:%') AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=eve_device_commands.thread_id AND deleted_at<>0) ORDER BY created_at,id LIMIT 4").bind(owner,device,clock(),owner).all<Row>();
  return Promise.all(rows.results.map(async row=>({command:await unpack(row),state:row.state,expiresAt:row.expires_at})));
 }
 async function claimed(device:string,id:string,claimId:string){
  await active(device);const row=await find(linkedId(id));ensurePreparation(row&&row.device_id===device,'AGENT_PREPARATION_NOT_FOUND',404);
  const c=await unpack(row!);await history.assertWritable(c.request.threadId);
  ensurePreparation(row!.state===`agent-prepare-claimed:${linkedId(claimId)}`&&row!.expires_at>clock(),'AGENT_PREPARATION_AUTHORIZATION_EXPIRED');
  await selected(device,c.request.model);
  const fresh=await db.prepare("SELECT c.id FROM eve_device_commands c JOIN rockstar_device_sessions s ON s.id=c.device_id AND s.user_id=c.owner_id WHERE c.owner_id=? AND c.id=? AND c.device_id=? AND c.state=? AND c.expires_at>? AND s.revoked_at IS NULL AND s.expires_at>? AND NOT EXISTS(SELECT 1 FROM eve_conversations h WHERE h.owner_id=c.owner_id AND h.id=c.thread_id AND h.deleted_at<>0)").bind(owner,id,device,`agent-prepare-claimed:${claimId}`,clock(),clock()).first();
  ensurePreparation(fresh,'AGENT_PREPARATION_AUTHORIZATION_EXPIRED');return {row:row!,command:c};
 }
 async function claim(device:string,raw:unknown){
  await active(device);const v=linkedFields(raw,['id','claimId','requestSha256']),id=linkedId(v.id),claimId=linkedId(v.claimId),row=await find(id);
  ensurePreparation(row&&row.device_id===device,'AGENT_PREPARATION_NOT_FOUND',404);const c=await unpack(row!);
  ensurePreparation(linkedHash(v.requestSha256)===c.requestSha256,'RUNTIME_REQUEST_CONFLICT');await history.assertWritable(c.request.threadId);await selected(device,c.request.model);
  const state=`agent-prepare-claimed:${claimId}`;
  if(row!.state!==state){const result=await db.prepare("UPDATE eve_device_commands SET state=? WHERE owner_id=? AND id=? AND device_id=? AND state='agent-prepare-pending' AND expires_at>? AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0)").bind(state,owner,id,device,clock(),owner,c.request.threadId).run();ensurePreparation(result.meta.changes===1,'AGENT_PREPARATION_ALREADY_CLAIMED');}
  await claimed(device,id,claimId);return {claimId,requestSha256:c.requestSha256};
 }
 async function authorize(device:string,id:string,claimId:string){const {command:c}=await claimed(device,id,claimId);return {owner,preparationId:c.request.id,requestSha256:c.requestSha256,permission:'agent.prepare',maximumCostMinor:0,expiresAt:c.request.deadline};}
 async function acknowledge(device:string,raw:unknown){
  await active(device);const v=linkedFields(raw,['id','claimId','requestSha256','agent','model']),id=linkedId(v.id),claimId=linkedId(v.claimId),row=await find(id);
  ensurePreparation(row&&row.device_id===device,'AGENT_PREPARATION_NOT_FOUND',404);const c=await unpack(row!);await history.assertWritable(c.request.threadId);
  ensurePreparation(linkedHash(v.requestSha256)===c.requestSha256&&linkedCanonical(v.agent)===linkedCanonical(c.request.agent)&&linkedCanonical(v.model)===linkedCanonical(c.request.model),'AGENT_PREPARATION_RECEIPT_MISMATCH');
  const state=`agent-prepare-done:${claimId}`;ensurePreparation([state,`agent-prepare-claimed:${claimId}`].includes(row!.state),'AGENT_PREPARATION_STATE_CONFLICT');
  const p=await selected(device,c.request.model);ensurePreparation(p.agents.some(a=>linkedCanonical(a)===linkedCanonical(c.request.agent)),'AGENT_PREPARATION_READBACK_REQUIRED');
  if(row!.state!==state){const r=await db.prepare('UPDATE eve_device_commands SET state=? WHERE owner_id=? AND id=? AND device_id=? AND state=? AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0)').bind(state,owner,id,device,row!.state,owner,c.request.threadId).run();ensurePreparation(r.meta.changes===1,'AGENT_PREPARATION_STATE_CONFLICT');}
  return {id,registered:true};
 }
 async function unknown(device:string,raw:unknown){
  await active(device);const v=linkedFields(raw,['id','claimId','requestSha256']),id=linkedId(v.id),claimId=linkedId(v.claimId),row=await find(id);
  ensurePreparation(row&&row.device_id===device,'AGENT_PREPARATION_NOT_FOUND',404);const c=await unpack(row!);await history.assertWritable(c.request.threadId);
  ensurePreparation(linkedHash(v.requestSha256)===c.requestSha256,'RUNTIME_REQUEST_CONFLICT');
  const state=`agent-prepare-unknown:${claimId}`;
  ensurePreparation(row!.state===state||row!.state===`agent-prepare-claimed:${claimId}`&&row!.expires_at<=clock(),'AGENT_PREPARATION_STATE_CONFLICT');
  if(row!.state!==state){const result=await db.prepare('UPDATE eve_device_commands SET state=? WHERE owner_id=? AND id=? AND device_id=? AND state=? AND expires_at<=? AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0) AND EXISTS(SELECT 1 FROM rockstar_device_sessions WHERE user_id=? AND id=? AND revoked_at IS NULL AND expires_at>?)').bind(state,owner,id,device,row!.state,clock(),owner,c.request.threadId,owner,device,clock()).run();ensurePreparation(result.meta.changes===1,'AGENT_PREPARATION_STATE_CONFLICT');}
  return {id,registered:null,state:'unknown'};
 }
 async function cancel(id:string){
  const row=await find(linkedId(id));ensurePreparation(row,'AGENT_PREPARATION_NOT_FOUND',404);const c=await unpack(row!);await history.assertWritable(c.request.threadId);
  if(row!.state.startsWith('agent-prepare-done:'))return {id,registered:true,cancelled:false};
  if(row!.state!==cancelled){const r=await db.prepare('UPDATE eve_device_commands SET state=? WHERE owner_id=? AND id=? AND state=? AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0)').bind(cancelled,owner,id,row!.state,owner,c.request.threadId).run();ensurePreparation(r.meta.changes===1,'AGENT_PREPARATION_STATE_CONFLICT');}
  // This fences future grants/acknowledgement; an already saved local recipe
  // may remain. It is not proof of removal and never authorizes inference.
  return {id,registered:null,cancelled:true};
 }
 return {enqueue,read,listOwner,commands,claim,authorize,acknowledge,unknown,cancel};
}
