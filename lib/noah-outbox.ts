import { NoahAgentError, noahUploadId } from './noah-agent-upload.ts';
import { noahAgentStore } from './noah-agent-store.ts';
import { workStore } from './work-store.ts';
import type { WorkJob } from './workflow.ts';
import { ownerScopeFor } from './owner-intent.ts';
import { authorizeNoahSend } from './noah-send-authorization.ts';
import { contactDeliveryTarget, deliveryDestination, deliveryDigest, parseDeliveryPayload, type NoahDeliveryDestination, type NoahDeliveryPayload, type NoahDeliveryReceipt, type NoahDeliveryTarget } from './noah-delivery.ts';

type Source={agentId:string;manifestSha256:string;sourceSha256:string|null;invite?:{id:string;revision:number;expiresAt:number;recipient:string|null}};
type Attempt={id:string;payloadSha256:string;startedAt:number;completedAt?:number;receipt?:NoahDeliveryReceipt;outcome?:'unknown'|'not_sent'|'accepted'|'rejected'};
export type NoahOutbox={schema:'noah-outbox/1';source:Source;destination:NoahDeliveryDestination;payload:NoahDeliveryPayload;fields:string[];requestSha256:string;snapshotSha256:string;state:'draft'|'approved'|'sending'|'unknown'|'accepted'|'rejected'|'cancelled';approval?:{ownerScope:string;snapshotSha256:string;expiresAt:number;confirmation:'noah-external-send/1';at:number};attempts:Attempt[];commands:{id:string;digest:string}[];error?:string};
export type NoahOutboxJob=WorkJob & {noahOutbox:NoahOutbox};
export type NoahOutboxInput={id:string;agentId:string;inviteId?:string|null;targetId:string;recipient:string;fields:string[];body:string};
export type NoahOutboxCommand={action:'approve'|'send'|'reconcile'|'cancel';revision:number;commandId:string;snapshotSha256:string;confirmation?:'noah-external-send/1'};
const fail=(message:string,status=409):never=>{throw new NoahAgentError(message,status);};
const allowedFields=['summary','author','license','priceNote'];
const object=(v:unknown,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export function createNoahOutboxService(deps:{db:Pick<D1Database,'prepare'>;targets:(owner:string)=>NoahDeliveryTarget[];fetcher?:typeof fetch;now?:()=>number}){
  const {db}=deps,now=deps.now??Date.now,store=workStore(db);
  async function get(owner:string,id:string):Promise<NoahOutboxJob>{
    noahUploadId(id);const job=await store.get(owner,id);if(!job?.noahOutbox||job.templateId!=='noah-outbox')return fail('送信記録が見つかりません。',404);return job as NoahOutboxJob;
  }
  function target(owner:string,destination:NoahDeliveryDestination|string){
    const id=typeof destination==='string'?destination:destination.id;
    const found=deps.targets(owner).find(t=>t.id===id);if(!found) return fail('この送信先は未設定、権限不足、または料金確認待ちです。',422);
    if(typeof destination!=='string'&&JSON.stringify(deliveryDestination(found))!==JSON.stringify(destination))return fail('送信先の設定が変わりました。別の送信先へ自動で切り替えません。');return found;
  }
  function sourceGuard(owner:string,source:Source){
    let sql="EXISTS(SELECT 1 FROM noah_agent_uploads a WHERE a.id=? AND a.owner_id=? AND a.deleted_at IS NULL AND a.upload_state='ready' AND a.manifest_sha256=? AND a.source_sha256 IS ?)";
    const args:unknown[]=[source.agentId,owner,source.manifestSha256,source.sourceSha256];
    if(source.invite){sql+=' AND EXISTS(SELECT 1 FROM noah_agent_invites i WHERE i.id=? AND i.owner_id=? AND i.upload_id=? AND i.revision=? AND i.revoked_at IS NULL AND i.expires_at>? AND i.expires_at=? AND i.recipient_id IS ? AND i.manifest_sha256=? AND i.source_sha256 IS ?)';const i=source.invite;args.push(i.id,owner,source.agentId,i.revision,now(),i.expiresAt,i.recipient,source.manifestSha256,source.sourceSha256);}
    return {sql,args};
  }
  async function checkSource(owner:string,source:Source){const guard=sourceGuard(owner,source);if(!await db.prepare(`SELECT 1 AS valid WHERE ${guard.sql}`).bind(...guard.args).first())fail('登録版・招待の期限・撤回・権限が変わりました。送信できません。',403);}
  async function save(owner:string,job:NoahOutboxJob,guardSource=false){
    const previous=job.revision;job.revision++;job.updatedAt=new Date(now()).toISOString();
    const guard=sourceGuard(owner,job.noahOutbox.source);
    const result=await db.prepare(`UPDATE work_jobs SET payload=?,revision=?,updated_at=? WHERE id=? AND user_id=? AND revision=?${guardSource?` AND ${guard.sql}`:''}`).bind(JSON.stringify(job),job.revision,job.updatedAt,job.id,owner,previous,...(guardSource?guard.args:[])).run();
    if(result.meta.changes!==1)fail('記録または送信権限が変わりました。再読み込みして確認してください。');return job;
  }
  async function settle(owner:string,id:string,attemptId:string,receipt:NoahDeliveryReceipt|null,notSent=false){
    const job=await get(owner,id),o=job.noahOutbox,a=o.attempts.at(-1);
    if(!a||a.id!==attemptId||!['sending','unknown'].includes(o.state))return job;
    if(!receipt&&!notSent&&o.state==='sending'&&now()-a.startedAt<30000)return job;
    if(receipt){a.receipt=receipt;a.outcome=receipt.status;o.state=receipt.status;delete o.error;}
    else {a.outcome=notSent?'not_sent':'unknown';o.state=notSent?'rejected':'unknown';o.error=notSent?'送信開始前に権限を確認できなかったため、本文を送りませんでした。':'受付結果が不明です。再送せず、同じ受付IDで確認してください。';}
    a.completedAt=now();job.status=o.state==='accepted'?'completed':'review';
    try{return await save(owner,job);}catch(e){const current=await get(owner,id);if(current.revision!==job.revision-1)return current;throw e;}
  }
  return {
    get,
    targets:(owner:string)=>deps.targets(owner).map(deliveryDestination),
    async list(owner:string,agentId:string|null=null,after:string|null=null){
      if(agentId)noahUploadId(agentId);let cursor:{at:string;id:string}|null=null;
      if(after){try{if(after.length>200)throw Error();cursor=JSON.parse(after);if(!object(cursor,['at','id'])||typeof cursor!.at!=='string'||!Number.isFinite(Date.parse(cursor!.at)))throw Error();noahUploadId(cursor!.id);}catch{return fail('送信履歴の続きから読み直してください。',400);}}
      const rows=await db.prepare(`SELECT payload FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.templateId')='noah-outbox'${agentId?" AND json_extract(payload,'$.noahOutbox.source.agentId')=?":''}${cursor?' AND (updated_at<? OR (updated_at=? AND id<?))':''} ORDER BY updated_at DESC,id DESC LIMIT 21`).bind(owner,...(agentId?[agentId]:[]),...(cursor?[cursor.at,cursor.at,cursor.id]:[])).all<{payload:string}>();
      const jobs=rows.results.map(r=>JSON.parse(r.payload) as NoahOutboxJob);return {jobs:jobs.slice(0,20),next:jobs.length>20?JSON.stringify({at:jobs[19].updatedAt,id:jobs[19].id}):null};
    },
    async create(owner:string,input:NoahOutboxInput){
      if(!object(input,['id','agentId','inviteId','targetId','recipient','fields','body'])||!Array.isArray(input.fields)||input.fields.length>4||new Set(input.fields).size!==input.fields.length||input.fields.some(f=>!allowedFields.includes(f))||typeof input.targetId!=='string')fail('送信の入力を確認してください。',400);
      noahUploadId(input.id);noahUploadId(input.agentId);if(input.inviteId)noahUploadId(input.inviteId);
      const requestSha256=await deliveryDigest(input),existing=await store.get(owner,input.id);
      if(existing){if(existing.noahOutbox?.requestSha256!==requestSha256)fail('同じ送信IDで内容は変更できません。');return existing as NoahOutboxJob;}
      const agent=await noahAgentStore(db,owner).get(input.agentId);if(!agent||agent.uploadState!=='ready')return fail('本人の保存済みAgentを選んでください。',404);
      const source:Source={agentId:agent.id,manifestSha256:agent.manifestSha256,sourceSha256:agent.source?.sha256??null};
      if(input.inviteId){const i=await db.prepare('SELECT id,revision,expires_at,recipient_id FROM noah_agent_invites WHERE id=? AND owner_id=? AND upload_id=?').bind(input.inviteId,owner,agent.id).first<{id:string;revision:number;expires_at:number;recipient_id:string|null}>();if(!i)return fail('本人が発行した招待を選んでください。',404);source.invite={id:i.id,revision:i.revision,expiresAt:i.expires_at,recipient:i.recipient_id};if(i.recipient_id!==null&&i.recipient_id!==input.recipient)fail('招待で指定した受取人と送信先が一致しません。',403);}
      await checkSource(owner,source);
      const selected:NoahDeliveryPayload['agent']={name:agent.manifest.name,version:agent.manifest.version};for(const field of allowedFields)if(input.fields.includes(field)){const value=agent.manifest[field as keyof typeof agent.manifest];selected[field as keyof typeof selected]=typeof value==='string'?value:'';}
      const payload=parseDeliveryPayload({recipient:input.recipient,agent:selected,body:input.body}),destination=deliveryDestination(target(owner,input.targetId));
      const snapshotSha256=await deliveryDigest({source,destination,payload}),time=new Date(now()).toISOString();
      const job:NoahOutboxJob={id:input.id,title:`送信: ${agent.manifest.name}`,templateId:'noah-outbox',plan:{schemaVersion:1,objective:'確認した宛先へ固定したAgent情報を送る',approvalGates:[]},revision:1,status:'active',steps:[],events:[],createdAt:time,updatedAt:time,noahOutbox:{schema:'noah-outbox/1',source,destination,payload,fields:input.fields,requestSha256,snapshotSha256,state:'draft',attempts:[],commands:[]}};
      const guard=sourceGuard(owner,source);
      await db.prepare(`INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) SELECT ?,?,?,?,? WHERE ${guard.sql} AND (SELECT COUNT(*) FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.templateId')='noah-outbox')<1000 ON CONFLICT(id) DO NOTHING`).bind(job.id,owner,JSON.stringify(job),job.revision,time,...guard.args,owner).run();
      const saved=await store.get(owner,job.id);if(saved?.noahOutbox?.requestSha256!==requestSha256)return fail('保存上限、権限変更、または同じIDの記録があります。履歴を確認してください。',409);return saved as NoahOutboxJob;
    },
    async command(owner:string,id:string,input:NoahOutboxCommand){
      if(!object(input,['action','revision','commandId','snapshotSha256','confirmation'])||!['approve','send','reconcile','cancel'].includes(input.action)||!Number.isSafeInteger(input.revision)||input.revision<1||typeof input.snapshotSha256!=='string')fail('送信操作を確認してください。',400);
      noahUploadId(input.commandId);const job=await get(owner,id),o=job.noahOutbox,digest=await deliveryDigest(input),replay=o.commands.find(c=>c.id===input.commandId);
      if(replay){if(replay.digest!==digest)fail('同じ操作IDの内容が変わりました。');return {job,dispatch:null};}
      if(job.revision!==input.revision||o.snapshotSha256!==input.snapshotSha256)fail('保存された内容を再読み込みして確認してください。');
      if(input.action==='reconcile'){
        if(!['sending','unknown'].includes(o.state))return {job,dispatch:null};
        const a=o.attempts.at(-1)!;const receipt=await contactDeliveryTarget(target(owner,o.destination),a,null,deps.fetcher);return {job:await settle(owner,id,a.id,receipt),dispatch:null};
      }
      if(o.commands.length>=32&&input.action!=='cancel')fail('この記録の操作上限です。履歴を確認してください。',429);
      let dispatch:string|null=null;
      if(input.action==='cancel'){
        if(!['draft','approved','rejected'].includes(o.state))fail('送信開始後は取り消せません。受付結果を確認してください。');o.state='cancelled';job.status='cancelled';delete o.approval;
      }else{
        target(owner,o.destination);await checkSource(owner,o.source);
        if(input.action==='approve'){
          if(!['draft','approved','rejected'].includes(o.state)||o.attempts.length>=3||input.confirmation!=='noah-external-send/1')fail('送信内容・宛先の明示確認が必要です。');
          o.approval={ownerScope:await ownerScopeFor(owner),snapshotSha256:o.snapshotSha256,expiresAt:Math.min(now()+600000,o.source.invite?.expiresAt??Infinity),confirmation:'noah-external-send/1',at:now()};o.state='approved';job.status='active';delete o.error;
        }else{
          authorizeNoahSend(o,await ownerScopeFor(owner),now());if(o.attempts.length>=3)fail('この送信の試行上限です。');
          dispatch=crypto.randomUUID();o.attempts.push({id:dispatch,payloadSha256:await deliveryDigest(o.payload),startedAt:now()});o.state='sending';job.status='active';
        }
      }
      o.commands.push({id:input.commandId,digest});return {job:await save(owner,job,input.action!=='cancel'),dispatch};
    },
    async dispatch(owner:string,id:string,attemptId:string){
      const job=await get(owner,id),o=job.noahOutbox,a=o.attempts.at(-1);if(o.state!=='sending'||a?.id!==attemptId)return job;
      let t:NoahDeliveryTarget;
      try{authorizeNoahSend({...o,state:'approved'},await ownerScopeFor(owner),now());t=target(owner,o.destination);await checkSource(owner,o.source);}catch{return settle(owner,id,attemptId,null,true);}
      const receipt=await contactDeliveryTarget(t,a,o.payload,deps.fetcher);
      // A completed transport attempt is immediately unknown on timeout. Only
      // concurrent readback while the original send is live gets the 30s grace.
      if(!receipt){const current=await get(owner,id);if(current.noahOutbox.state==='sending'&&current.noahOutbox.attempts.at(-1)?.id===attemptId){current.noahOutbox.state='unknown';current.noahOutbox.error='受付結果が不明です。再送せず、同じ受付IDで確認してください。';current.noahOutbox.attempts.at(-1)!.outcome='unknown';current.status='review';try{return await save(owner,current);}catch{return get(owner,id);}}return current;}
      return settle(owner,id,attemptId,receipt);
    },
  };
}
