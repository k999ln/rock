import { REVENUE_ROLES, revenueDigest, revenuePrompt, runRevenueStep } from '../../../lib/noah-revenue-pack.ts';

export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export const OWNER='noah-revenue-owner-v1';
export const SESSION_SECONDS=30*24*60*60;
export function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort((a,b)=>a.localeCompare(b)).join(',')!==[...keys].sort((a,b)=>a.localeCompare(b)).join(','))throw new HttpError(400,'入力項目を確認してください。');}
export function validateRun(input){
  exact(input,['id','brief','consent','generation']);
  if(typeof input.id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(input.id)||typeof input.brief!=='string'||!input.brief.trim()||input.brief.length>3000||input.consent!=='anonymous-free-direct-v1'||!Number.isSafeInteger(input.generation)||input.generation<0)throw new HttpError(400,'依頼・無料クラウド送信への同意を確認してください。');
  revenuePrompt('offer',input.brief,'');
}
export function sqlAdapter(sql){return {prepare(query){return {bind(...values){return {
  async first(){return sql.exec(query,...values).toArray()[0]??null;},
  async all(){return {results:sql.exec(query,...values).toArray()};},
  async run(){const cursor=sql.exec(query,...values);return {meta:{changes:cursor.rowsWritten}};},
};}};}};}
export class RevenueOperation {
  constructor(ctx,{fetcher,now=Date.now}={}){
    this.ctx=ctx;this.now=now;this.fetcher=fetcher;this.running=false;
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS work_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL)');
    this.db=sqlAdapter(ctx.storage.sql);
  }
  async command(action,input={},sessionHash=''){
    if(action==='run')validateRun(input);
    const digest=action==='run'?await revenueDigest([input.brief,input.consent]):null;
    return this.ctx.storage.transaction(async tx=>{
      const now=this.now(),auth=await tx.get('auth')||{pairs:[],sessions:[]};
      auth.pairs=auth.pairs.filter(x=>x.expiresAt>now);auth.sessions=auth.sessions.filter(x=>x.expiresAt>now);
      if(action==='pair'){
        if(auth.pairs.length>=8)throw new HttpError(429,'接続コードが発行済みです。5分後にお試しください。');
        const expiresAt=now+300000;auth.pairs.push({hash:input.hash,expiresAt});await tx.put('auth',auth);return{expiresAt};
      }
      if(action==='exchange'){
        const pair=auth.pairs.find(x=>x.hash===input.hash);if(!pair)throw new HttpError(401,'接続コードは期限切れ、または使用済みです。');
        auth.pairs=auth.pairs.filter(x=>x!==pair);auth.sessions.push({hash:input.sessionHash,expiresAt:now+SESSION_SECONDS*1000});auth.sessions=auth.sessions.slice(-8);await tx.put('auth',auth);return{connected:true};
      }
      if(!auth.sessions.some(x=>x.hash===sessionHash))throw new HttpError(401,'本人の端末接続が必要です。');
      const state=await tx.get('state')||{generation:0,operation:null};
      if(action==='logout'){exact(input,[]);auth.sessions=auth.sessions.filter(x=>x.hash!==sessionHash);await tx.put('auth',auth);return{disconnected:true};}
      if(action==='run'){
        const old=await tx.get(`batch:${input.id}`);
        if(old){if(old.digest!==digest)throw new HttpError(409,'同じ依頼IDの内容が変わっています。');return{accepted:true,id:input.id,reused:true};}
        if(state.generation!==input.generation)throw new HttpError(409,'停止後に状態が変わりました。画面を更新して新しい依頼を作ってください。');
        if(state.operation?.state==='running'||(state.operation?.leaseUntil||0)>now)throw new HttpError(409,'前の処理の応答待ちです。');
        const count=this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM work_jobs').toArray()[0].n;
        const batches=await tx.get('batchCount')||0;if(count>1197||batches>=400)throw new HttpError(429,'保存上限です。成果を保全してから管理者に整理を依頼してください。');
        const day=new Date(now).toISOString().slice(0,10),daily=await tx.get('daily')||{day,count:0};if(daily.day!==day){daily.day=day;daily.count=0;}
        if(daily.count>=4)throw new HttpError(429,'今日は4回・12担当の上限です。翌日UTCに再開できます。');
        daily.count++;await tx.put('daily',daily);await tx.put('batchCount',batches+1);
        await tx.put(`batch:${input.id}`,{digest,brief:input.brief,consent:input.consent});
        state.operation={id:input.id,state:'running',stage:0,previous:'',nextAt:now+1000,leaseUntil:0,error:null};
        await tx.put('state',state);await tx.setAlarm(state.operation.nextAt);return{accepted:true,id:input.id};
      }
      if(action==='stop'){
        exact(input,[]);state.generation++;
        if(state.operation){state.operation.state='stopped';state.operation.nextAt=null;}
        await tx.put('state',state);await tx.deleteAlarm();
      }else if(action!=='status')throw new HttpError(404,'見つかりません。');
      const jobs=this.ctx.storage.sql.exec('SELECT payload FROM work_jobs ORDER BY updated_at DESC,id DESC LIMIT 100').toArray().map(x=>JSON.parse(x.payload));
      return {active:state.operation?.state==='running',stopped:state.operation?.state==='stopped',generation:state.generation,error:state.operation?.error||null,operation:state.operation?{id:state.operation.id,state:state.operation.state,stage:state.operation.stage,nextAt:state.operation.nextAt}:null,
        jobs:jobs.map(j=>({id:j.id,title:j.title,state:j.freeCloud?.state,text:j.freeCloud?.text,error:j.freeCloud?.error,chargeMinor:j.freeCloud?.chargeMinor,providerResponseId:j.freeCloud?.providerResponseId,inputTokens:j.freeCloud?.inputTokens,outputTokens:j.freeCloud?.outputTokens,status:j.status}))};
    });
  }
  async alarm(){
    if(this.running)return;this.running=true;
    try{
      const captured=await this.ctx.storage.transaction(async tx=>{
        const state=await tx.get('state'),op=state?.operation;if(!op||op.state!=='running'){await tx.deleteAlarm();return null;}
        if(op.nextAt>this.now()){await tx.setAlarm(op.nextAt);return null;}
        // A durable watchdog wakes after interruption. runRevenueStep never resends a sending Work.
        op.leaseUntil=this.now()+240000;await tx.put('state',state);await tx.setAlarm(op.leaseUntil);
        return{...op,batch:await tx.get(`batch:${op.id}`),generation:state.generation};
      });
      if(!captured)return;
      const checkStopped=async()=>{const s=await this.ctx.storage.get('state');if(s.generation!==captured.generation||s.operation?.id!==captured.id||s.operation.state!=='running')throw new HttpError(409,'停止しました。');};
      let job,error;
      try{job=await runRevenueStep({db:this.db,owner:OWNER,allowedOwner:OWNER,consent:captured.batch.consent==='anonymous-free-direct-v1',batchId:captured.id,role:REVENUE_ROLES[captured.stage].id,brief:captured.batch.brief,previous:captured.previous,execution:'cloud-alarm',fetcher:this.fetcher,checkStopped,now:this.now});}
      catch(e){error=e.status?e.message:'クラウド応答を確認できません。自動再送せず停止しました。';}
      await this.ctx.storage.transaction(async tx=>{
        const state=await tx.get('state'),op=state.operation;if(op.id!==captured.id)return;
        op.leaseUntil=0;
        if(state.generation!==captured.generation||op.state!=='running'){await tx.put('state',state);await tx.deleteAlarm();return;}
        const f=job?.freeCloud;
        if(f?.state==='completed'){
          op.stage++;op.previous=f.text;
          if(op.stage===REVENUE_ROLES.length){op.state='completed';op.nextAt=null;await tx.deleteAlarm();}
          else{op.nextAt=this.now()+46000;await tx.setAlarm(op.nextAt);}
        }else if(f?.state==='waiting'&&f.retryAt>this.now()&&f.retryAt<f.retryDeadline&&(f.attempts||0)<5){op.nextAt=f.retryAt;await tx.setAlarm(op.nextAt);}
        else{op.state='needs-review';op.nextAt=null;op.error=error||f?.error||'送信結果は未確認です。再送せず停止しました。';await tx.deleteAlarm();}
        await tx.put('state',state);
      });
    }finally{this.running=false;}
  }
}
