import { eveHistoryStore, EveHistoryError, eveThreadId, type EveHistoryKeys, type EveHistoryItem } from './eve-history.ts';
import { linuxRunExport, type LinuxLocalRun } from './sky-linux-record.ts';

type Database = Pick<D1Database,'prepare'|'batch'>;
type Row = {job_id:string;thread_id:string;device_id:string;revision:number;digest:string;envelope:string;updated_at:number};
export type EveDeviceJob = {run:LinuxLocalRun;threadId:string;deviceId:string;revision:number;digest:string;updatedAt:number;outputSha256:string|null;exportText:string|null;provenance:'linked-device-report'};
export type EveDevicePresence = {deviceId:string;name:string;phase:string;agents:{id:string;name:string;sha256:string;modelId:string}[];models:{id:string;name:string;sha256:string}[];preparedModels:string[];updatedAt:number};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash=/^[a-f0-9]{64}$/;
export async function eveDigest(value:string) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function canonical(value:unknown):string {if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;return JSON.stringify(value);}
function validate(input:unknown) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new EveHistoryError('同期する仕事を確認してください。');
  const v=input as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['run','threadId','revision'].includes(k))||!Number.isSafeInteger(v.revision)||Number(v.revision)<0)throw new EveHistoryError('同期の版を確認してください。');
  eveThreadId(v.threadId);
  const r=v.run as LinuxLocalRun;
  if(!r||Object.keys(r).some(k=>!['job','agent','modelSha256','input','text','error','durationMs','rawOutputSha256','modelName','surface','handoff','threadId','contextSha256','stop','usage','inputSha256','stateLabel'].includes(k))||!r.job||!uuid.test(r.job.id)||r.job.templateId!=='sky-linux-private'||!Number.isSafeInteger(r.job.revision)||r.job.revision<0||
    !['active','review','completed','cancelled'].includes(r.job.status)||!Array.isArray(r.job.steps)||r.job.steps.length>16||
    !r.agent||!uuid.test(r.agent.id)||typeof r.agent.name!=='string'||r.agent.name.length>80||typeof r.agent.instructions!=='string'||r.agent.instructions.length>1200||
    typeof r.agent.modelId!=='string'||r.agent.modelId.length>100||!hash.test(r.modelSha256)||!hash.test(r.agent.sha256)||
    typeof r.input!=='string'||!r.input.trim()||r.input.length>4000||!(r.text===null||typeof r.text==='string'&&r.text.length<=32000)||
    !(r.error===null||typeof r.error==='string'&&r.error.length<=1000)||!['none','requested','confirmed','unconfirmed'].includes(r.stop)||
    !r.usage||r.usage.mode!=='owner-local'||r.usage.cloudUsageMinor!==0||r.usage.cloudTokensUsed!==0||r.usage.agentPriceMinor!==0||
    (r.text!==null&&!['review','completed'].includes(r.job.status))||JSON.stringify(r).length>100000)throw new EveHistoryError('対応するPixelの文章仕事だけを同期できます。');
  return {run:r,threadId:String(v.threadId),revision:Number(v.revision)};
}

/** Replication only. It neither dispatches work nor inserts device reports into the execution/financial ledger. */
export function eveDeviceSyncStore(db:Database,owner:string,keys:EveHistoryKeys) {
  const history=eveHistoryStore(db,owner,keys);
  const find=(id:string)=>db.prepare('SELECT * FROM eve_device_jobs WHERE owner_id=? AND job_id=?').bind(owner,eveThreadId(id)).first<Row>();
  const unpack=async(row:Row):Promise<EveDeviceJob>=>({...(await history.unsealRecord<{run:LinuxLocalRun;outputSha256:string|null;exportText:string|null}>(row.envelope,`job:${row.job_id}`)),threadId:row.thread_id,deviceId:row.device_id,revision:row.revision,digest:row.digest,updatedAt:row.updated_at,provenance:'linked-device-report'});
  async function list(threadId='') {
    if(threadId)eveThreadId(threadId);
    const rows=await db.prepare('SELECT * FROM eve_device_jobs WHERE owner_id=? AND (?=\'\' OR thread_id=?) ORDER BY updated_at DESC,job_id DESC LIMIT 100').bind(owner,threadId,threadId).all<Row>();
    return Promise.all(rows.results.map(unpack));
  }
  async function mergeHistory(run:LinuxLocalRun,threadId:string) {
    for(let attempt=0;attempt<4;attempt++) {
      let current:EveHistoryItem|undefined;try{current=await history.get(threadId);}catch(e){if(!(e instanceof EveHistoryError)||e.status!==404)throw e;}
      const messages=[{id:`linux:${run.job.id}:request`,side:'me' as const,text:run.input},...(run.text?[{id:`linux:${run.job.id}:result`,side:'sky' as const,text:run.text}]:[])];
      // Stable message IDs permit append/repair without re-saving unrelated messages.
      if(current&&messages.every(m=>current.session.messages.some(old=>old.id===m.id&&old.text===m.text)))return;
      const session=current?.session??{version:1 as const,id:threadId,toolId:'sky-auto',createdAt:Date.parse(run.job.createdAt)||Date.now(),messages:[],activeRequest:null,workflowStatus:'ready' as const,outcome:null};
      try{await history.save({session:{...session,messages,activeRequest:null},revision:current?.revision??0,remember:current?.remember??true});return;}
      catch(e){if(!(e instanceof EveHistoryError)||e.status!==409||attempt===3)throw e;}
    }
  }
  async function publish(input:unknown,deviceId:string) {
    const {run,threadId,revision}=validate(input),id=run.job.id;
    await history.assertWritable(threadId);
    const digest=await eveDigest(canonical({run,threadId})),prior=await find(id);
    if(prior&&(prior.device_id!==deviceId||prior.thread_id!==threadId))throw new EveHistoryError('この仕事の実行元か会話が異なります。',409);
    if(prior?.digest===digest){await mergeHistory(run,threadId);return {revision:prior.revision,digest};}
    if((prior?.revision??0)!==revision)throw new EveHistoryError('新しい仕事の版があります。上書きせず読み直してください。',409);
    if(prior){const old=(await unpack(prior)).run;if(run.job.revision<old.job.revision||canonical({agent:run.agent,input:run.input,model:run.modelSha256})!==canonical({agent:old.agent,input:old.input,model:old.modelSha256})||old.text!==null&&run.text!==old.text||['completed','cancelled'].includes(old.job.status)&&run.job.status!==old.job.status)throw new EveHistoryError('保存済みの仕事の内容や確定状態を変更できません。',409);}
    const value={run,outputSha256:run.text?await eveDigest(run.text):null,exportText:run.text?linuxRunExport(run):null};
    const envelope=await history.sealRecord(value,`job:${id}`),now=Date.now();
    const result=prior?await db.prepare('UPDATE eve_device_jobs SET revision=revision+1,digest=?,envelope=?,updated_at=? WHERE owner_id=? AND job_id=? AND device_id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0)').bind(digest,envelope,now,owner,id,deviceId,revision,owner,threadId).run():await db.prepare('INSERT INTO eve_device_jobs(owner_id,job_id,thread_id,device_id,revision,digest,envelope,updated_at) SELECT ?,?,?,?,1,?,?,? WHERE NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0) ON CONFLICT(owner_id,job_id) DO NOTHING').bind(owner,id,threadId,deviceId,digest,envelope,now,owner,threadId).run();
    if(result.meta.changes!==1)throw new EveHistoryError('別の同期が更新しました。読み直してください。',409);
    // A failure here is repairable by the identical publish, not by a new job ID.
    await mergeHistory(run,threadId);return {revision:revision+1,digest};
  }
  async function presence(value:unknown,deviceId:string){
    const p=value as EveDevicePresence;
    if(!p||typeof p.name!=='string'||p.name.length>80||!['none','added','preparing','ready','stopped','failed'].includes(p.phase)||!Array.isArray(p.agents)||p.agents.length>32||!Array.isArray(p.models)||p.models.length>8||!Array.isArray(p.preparedModels)||p.preparedModels.length>8||JSON.stringify(p).length>16000)throw new EveHistoryError('端末の能力を確認してください。');
    const agents=p.agents.map(a=>{if(!uuid.test(a.id)||typeof a.name!=='string'||a.name.length>80||!hash.test(a.sha256)||typeof a.modelId!=='string'||a.modelId.length>100)throw new EveHistoryError('担当の能力を確認してください。');return {id:a.id,name:a.name,sha256:a.sha256,modelId:a.modelId};});
    const models=p.models.map(m=>{if(typeof m.id!=='string'||m.id.length>100||typeof m.name!=='string'||m.name.length>180||!hash.test(m.sha256))throw new EveHistoryError('AIの能力を確認してください。');return {id:m.id,name:m.name,sha256:m.sha256};});
    const now=Date.now(),data={deviceId,name:p.name,phase:p.phase,agents,models,preparedModels:p.preparedModels.filter(id=>models.some(m=>m.id===id)),updatedAt:now};
    await db.prepare('INSERT INTO eve_device_presence(owner_id,device_id,envelope,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id,device_id) DO UPDATE SET envelope=excluded.envelope,updated_at=excluded.updated_at').bind(owner,deviceId,await history.sealRecord(data,`presence:${deviceId}`),now).run();
  }
  async function devices(){const rows=await db.prepare('SELECT p.device_id,p.envelope FROM eve_device_presence p JOIN rockstar_device_sessions s ON s.id=p.device_id AND s.user_id=p.owner_id WHERE p.owner_id=? AND s.revoked_at IS NULL AND s.expires_at>? ORDER BY p.updated_at DESC LIMIT 50').bind(owner,Date.now()).all<{device_id:string;envelope:string}>();return Promise.all(rows.results.map(r=>history.unsealRecord<EveDevicePresence>(r.envelope,`presence:${r.device_id}`)));}
  async function enqueue(value:unknown){
    const v=value as {id:string;threadId:string;deviceId:string;agentId:string;input:string;confirm:string};
    if(!v||Object.keys(v).some(k=>!['id','threadId','deviceId','agentId','input','confirm'].includes(k))||!uuid.test(v.id)||!uuid.test(v.deviceId)||!uuid.test(v.agentId)||typeof v.input!=='string'||!v.input.trim()||v.input.length>2000||v.confirm!=='run-on-pixel')throw new EveHistoryError('依頼・実行先・料金を確認してください。');
    eveThreadId(v.threadId);await history.assertWritable(v.threadId);const digest=await eveDigest(canonical(v));
    const old=await db.prepare('SELECT digest,state FROM eve_device_commands WHERE owner_id=? AND id=?').bind(owner,v.id).first<{digest:string;state:string}>();
    if(old){if(old.digest!==digest)throw new EveHistoryError('同じ依頼IDの内容が異なります。',409);return {id:v.id,state:old.state};}
    const p=(await devices()).find(d=>d.deviceId===v.deviceId),a=p?.agents.find(a=>a.id===v.agentId),m=p?.models.find(m=>m.id===a?.modelId);
    if(!p||Date.now()-p.updatedAt>30000||p.phase!=='ready'||!a||!m||!p.preparedModels.includes(m.id))throw new EveHistoryError('Pixelを接続して、選んだ担当のAIを準備してください。',409);
    let context='';try{const t=await history.get(v.threadId);context=t.session.messages.slice(-4).map(m=>`${m.side==='me'?'本人':'Eve'}: ${m.text}`).join('\n').slice(-1200);}catch(e){if(!(e instanceof EveHistoryError)||e.status!==404)throw e;}
    const command={action:'run',requestId:v.id,threadId:v.threadId,agentId:a.id,input:v.input,context,surface:'eve',agentSha256:a.sha256,modelSha256:m.sha256,accepted:true};
    const now=Date.now();await db.prepare("INSERT INTO eve_device_commands(owner_id,id,device_id,thread_id,digest,envelope,state,created_at,expires_at) VALUES(?,?,?,?,?,?,'pending',?,?) ON CONFLICT(owner_id,id) DO NOTHING").bind(owner,v.id,v.deviceId,v.threadId,digest,await history.sealRecord(command,`command:${v.id}`),now,now+600000).run();
    const inserted=await db.prepare('SELECT digest,state FROM eve_device_commands WHERE owner_id=? AND id=?').bind(owner,v.id).first<{digest:string;state:string}>();if(inserted?.digest!==digest)throw new EveHistoryError('同じ依頼IDの内容が異なります。',409);return {id:v.id,state:inserted.state};
  }
  async function pending(deviceId:string){const r=await db.prepare("SELECT id,envelope,expires_at FROM eve_device_commands WHERE owner_id=? AND device_id=? AND state='pending' AND expires_at>? ORDER BY created_at LIMIT 8").bind(owner,deviceId,Date.now()).all<{id:string;envelope:string;expires_at:number}>();return Promise.all(r.results.map(async c=>({command:await history.unsealRecord<Record<string,unknown>>(c.envelope,`command:${c.id}`),expiresAt:c.expires_at})));}
  async function acknowledge(deviceId:string,id:string){eveThreadId(id);const r=await find(id);if(!r||r.device_id!==deviceId)throw new EveHistoryError('同じ仕事の受領をまだ確認できません。',409);await db.prepare("UPDATE eve_device_commands SET state='dispatched' WHERE owner_id=? AND device_id=? AND id=? AND state='pending'").bind(owner,deviceId,id).run();}
  return {list,publish,presence,devices,enqueue,pending,acknowledge};
}
