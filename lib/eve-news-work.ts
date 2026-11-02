import {NEWS_EVALUATION_HISTORY_SQL,newsLearningCheck,newsLearningPreview,newsLearningSplit} from './eve-news-learning.ts';
import { cleanNewsInput, auditNewsDraft, type NewsPacket, type NewsDraft, type NewsAudit } from './eve-news-audit.ts';
import { createEveNewsJob, recordEveNewsAudit, reviseEveNewsDraft, appendEveNewsSources, recordEveNewsLearningConsent, normalizeWorkJob, applyWorkCommand, objectInput, workId, WorkError, type WorkJob } from './workflow.ts';
import { workStore } from './work-store.ts';
import { eveHistoryStore, eveThreadId, EveHistoryError, type EveHistoryKeys } from './eve-history.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
export type EveNewsWorkState = { schema: 'eve.news-work/1'; threadId: string; requestSha256: string; packet: NewsPacket; draft: NewsDraft; modelIdentity: 'unverified_import'; externalToolSuccess: false; usage: 'not_reported'; learningConsents?: import('./eve-news-learning.ts').NewsLearningConsent[]; sourceRevisions?: {packet:NewsPacket;draft:NewsDraft;audit?:NewsAudit;replacedAt:string;reason:string;commandId:string;replacementSha256:string}[]; repairAttempts?: NewsRepairAttempt[]; audit?: NewsAudit; revisions?: { draft: NewsDraft; audit: NewsAudit; replacedAt: string; reason: string; commandId: string; replacementSha256: string }[] };
export type NewsRepairAttempt = { purpose?: 'evidence-review'; claimId?: string; draftSequence?: number; packetSequence?: number; evidenceReport?: import('./eve-news-evidence.ts').NewsEvidenceReport; writerIdentity?: 'different_observed_model'|'writer_unverified'; id: string; fingerprint: string; modelLabel: string; modelDigest: string; inputSha256: string; startedAt: number; leaseUntil: number; state: 'sending'|'reported'|'unknown'|'not_sent'; usage: import('./sky-usage-observation.ts').SkyUsageObservation|null; beforeDigest?: string|null; afterDigest?: string|null; outputSha256?: string; outcome?: 'adopted'|'invalid_draft'|'no_change'|'withheld'|'model_changed'|'model_unavailable'|'inference_unconfirmed'|'review_saved'|'invalid_review'; finishedAt?: number };
type Database = Pick<D1Database, 'prepare' | 'batch'>;
export function eveNewsWorkStore(db: Database, owner: string, keys?: EveHistoryKeys) {
  const works = workStore(db), history = keys ? eveHistoryStore(db,owner,keys) : null;
  const requireHistory = () => { if (!history) throw new WorkError('会話の暗号化保存を確認してください。',503); return history; };
  async function get(id: unknown) { const job=await works.get(owner,workId(id)); if(!job?.eveNews)throw new WorkError('このアカウントのニュース仕事が見つかりません。',404);return job; }
  async function ownerLearningCheck(job:WorkJob,split:import('./eve-news-learning.ts').NewsLearningSplit){
    const check=await newsLearningCheck(job,split);
    if(split==='training_candidate'&&await db.prepare(NEWS_EVALUATION_HISTORY_SQL).bind(owner,check.contentSha256,check.dataSha256).first()){
      check.knownEvaluationIndicators=true;
      if(!check.blockedReasons.includes('known_evaluation_material'))check.blockedReasons.push('known_evaluation_material');
    }
    return check;
  }
  async function sync(job: WorkJob) {
    const news=job.eveNews!, h=requireHistory();let current;
    try {current=await h.get(news.threadId);}catch(error){if(!(error instanceof EveHistoryError)||error.status!==404)throw error;}
    const report=news.audit;
    const lastConsent=news.learningConsents?.at(-1),learningStatus=lastConsent?(await newsLearningCheck(job,lastConsent.split??'evaluation')).consentStatus:'not_granted';
    const text=['ニュース草稿の仕事: '+job.id,job.status==='cancelled'?'停止済み':job.status==='review'?'参照検査済み・人による確認待ち':report?'参照検査で要確認':'参照検査待ち',
      ...news.repairAttempts?.map(attempt=>(attempt.purpose==='evidence-review'?'資料照合（モデル提案・真偽未確定）: ':'モデル修正: ')+attempt.modelLabel+' / '+attempt.state+' / '+(attempt.outcome??'結果未確認')+' / '+(attempt.usage?attempt.usage.metrics.map(metric=>metric.meter+': '+(metric.quantity??'未報告')+' '+metric.unit).join(', '):'使用量未報告')+' / 金額未確定')??[],
      ...news.repairAttempts?.filter(attempt=>attempt.evidenceReport).map(attempt=>'照合対象: '+attempt.claimId+' / '+attempt.evidenceReport!.assessment+' / '+(attempt.draftSequence===(news.revisions?.length??0)&&(attempt.packetSequence??0)===(news.sourceRevisions?.length??0)?'この資料・草稿への提案':'過去の資料・草稿への提案')+' / '+attempt.evidenceReport!.explanation)??[],
      '学習準備の同意: '+learningStatus+'（会話保存/記憶とは別。訓練・公開・外部送信の許可ではありません）',
      '未掲載。真偽・政治的公平性は未検証。モデル情報は取込元の申告、取込前の初回生成の使用量/金額は未報告。',
      ...report?.checks.map(check=>(check.passed?'形式確認: ':'要確認: ')+check.id+' — '+check.detail)??[],...report?.warnings??[],
      news.draft.headline,news.draft.articleText,'資料ID: '+news.packet.sources.map(source=>source.sourceId).join(', '),'全資料と主張台帳は保存した仕事で確認してください。'].join('\n');
    await h.save({session:{...(current?.session??{version:1,id:news.threadId,toolId:'sky-auto',createdAt:Date.parse(job.createdAt),workflowStatus:'ready',outcome:null}),activeRequest:null,messages:[{id:'news-goal-'+job.id,side:'me',text:job.plan.objective},{id:'news-result-'+job.id,side:'sky',text:text.slice(0,30000)}]},revision:current?.revision??0,remember:current?.remember??false},{jobId:job.id,revision:job.revision,kind:'news'});
  }
  async function response(job: WorkJob) {let historySaved=true;try{await sync(job);}catch{historySaved=false;}return {job,historySaved};}
  async function learning(raw:{jobId:string;revision:number;split:unknown;preview?:boolean}) {
      const job=await get(raw.jobId);
      if(!Number.isSafeInteger(raw.revision)||job.revision!==raw.revision)throw new WorkError('仕事の版が変わりました。読み直してください。',409);
      const split=newsLearningSplit(raw.split);await requireHistory().get(job.eveNews!.threadId);
      const check=await ownerLearningCheck(job,split);
      if(!raw.preview)return{check};
      if(check.blockedReasons.length||check.consentStatus!=='granted')throw new WorkError('準備同意・現行データ・権利・秘密/評価素材の確認が必要です。',403);
      return newsLearningPreview(job,split,async()=>{
        const training=split==='training_candidate';
        const row=await db.prepare(`SELECT w.payload FROM work_jobs w WHERE w.user_id=? AND w.id=? AND EXISTS(SELECT 1 FROM eve_conversations c WHERE c.owner_id=w.user_id AND c.id=json_extract(w.payload,'$.eveNews.threadId') AND c.deleted_at=0)${training?` AND NOT EXISTS (${NEWS_EVALUATION_HISTORY_SQL})`:''}`).bind(owner,job.id,...(training?[owner,check.contentSha256,check.dataSha256]:[])).first<{payload:string}>();
        if(!row)throw new WorkError('元の会話・仕事・評価用素材の割当が変わりました。読み直してください。',410);
        return normalizeWorkJob(JSON.parse(row.payload) as WorkJob);
      },()=>requireHistory().get(job.eveNews!.threadId));
  }
  return {
    get,
    learning,
    async learningCollection(raw:unknown){
      const input=objectInput(raw,['jobs','split']),split=newsLearningSplit(input.split);
      if(!Array.isArray(input.jobs)||!input.jobs.length||input.jobs.length>20)throw new WorkError('まとめる仕事は1〜20件を選んでください。');
      const selected=input.jobs.map(item=>{const v=objectInput(item,['jobId','revision']);if(!Number.isSafeInteger(v.revision)||Number(v.revision)<0)throw new WorkError('仕事の版を確認してください。');return{jobId:workId(v.jobId),revision:Number(v.revision)};}).sort((a,b)=>a.jobId<b.jobId?-1:a.jobId>b.jobId?1:0);
      if(new Set(selected.map(v=>v.jobId)).size!==selected.length)throw new WorkError('同じ仕事は重ねて選べません。');
      const prepared=[];
      for(const item of selected){const job=await get(item.jobId),value=await learning({...item,split,preview:true});if(job.revision!==item.revision||!('dataset' in value))throw new WorkError('仕事を読み直してください。',409);prepared.push({job,value});}
      const records: Array<{recordSha256:string;contentSha256:string;provenance:Array<{jobId:string;jobRevision:number;consentCommandId:string}>;input:unknown;output:unknown;verification:unknown}>=[];
      for(const {value} of prepared){const recordSha256=await sha256Hex(JSON.stringify(value.dataset.records[0]));const existing=records.find(r=>r.recordSha256===recordSha256);if(existing){existing.provenance.push(value.dataset.provenance);continue;}records.push({recordSha256,contentSha256:value.check.contentSha256,provenance:[value.dataset.provenance],...value.dataset.records[0]});}
      const dataset={schema:'eve.news-dataset-collection-preparation/1',scope:'owner_private_preparation_only',split,trainingAllowed:false,requiresConsentRecheckBeforeTraining:true,acceptance:{deduplication:'record_sha256_exact_only',decontamination:'known_indicators_and_owner_evaluation_hash_only',modelLicense:'not_reviewed',semanticQuality:'not_accepted_for_training',trainingConfig:'not_fixed'},selectedJobs:prepared.map(({job,value})=>({jobId:job.id,revision:job.revision,dataSha256:value.check.dataSha256,contentSha256:value.check.contentSha256,consentCommandId:value.dataset.provenance.consentCommandId})),duplicateRecordsRemoved:selected.length-records.length,records};
      const serialized=JSON.stringify(dataset);if(new TextEncoder().encode(serialized).length>131072)throw new WorkError('まとめた準備データは128 KiB以内にしてください。選択件数を減らしてください。',413);
      const datasetSha256=await sha256Hex(serialized),result={dataset,datasetSha256,hashBasis:'UTF-8 JSON.stringify(dataset)'};
      if(new TextEncoder().encode(JSON.stringify(result,null,2)).length>131072)throw new WorkError('保存用JSONは128 KiB以内にしてください。選択件数を減らしてください。',413);
      for(const {job} of prepared)await requireHistory().get(job.eveNews!.threadId);
      const trainingSql=split==='training_candidate'?prepared.map(()=>` AND NOT EXISTS (${NEWS_EVALUATION_HISTORY_SQL})`).join(''):'';
      // One read snapshot fences every selected job and every historical evaluation assignment.
      const rows=await db.prepare(`SELECT w.id,w.payload FROM work_jobs w WHERE w.user_id=? AND w.id IN (${selected.map(()=>'?').join(',')}) AND EXISTS(SELECT 1 FROM eve_conversations c WHERE c.owner_id=w.user_id AND c.id=json_extract(w.payload,'$.eveNews.threadId') AND c.deleted_at=0)${trainingSql}`).bind(owner,...selected.map(v=>v.jobId),...(split==='training_candidate'?prepared.flatMap(({value})=>[owner,value.check.contentSha256,value.check.dataSha256]):[])).all<{id:string;payload:string}>();
      if(rows.results.length!==selected.length||prepared.some(({job})=>{const row=rows.results.find(r=>r.id===job.id);return !row||JSON.stringify(normalizeWorkJob(JSON.parse(row.payload) as WorkJob))!==JSON.stringify(job);}))throw new WorkError('準備中に仕事・同意・会話・評価割当が変わりました。読み直してください。',409);
      return result;
    },
    async list(thread?: string) {if(thread)eveThreadId(thread);return works.list(owner,{kind:'news',threadId:thread});},
    async create(raw: unknown) {
      const v=objectInput(raw,['jobId','threadId','packet','draft','modelLabel','saveMaterial']);
      if(v.saveMaterial!==true)throw new WorkError('非秘密の資料と草稿を、このアカウントへ保存する同意が必要です。');
      const id=workId(v.jobId),threadId=eveThreadId(v.threadId),input=cleanNewsInput(v.packet,v.draft,v.modelLabel);
      if(JSON.stringify(input).length>96000)throw new WorkError('資料と草稿は96,000文字以内にしてください。',413);
      const {generatedAt: _generatedAt,...stableDraft}=input.draft;
      const requestSha256=await sha256Hex(JSON.stringify({threadId,packet:input.packet,draft:stableDraft}));
      const old=await works.get(owner,id);
      if(old){if(old.eveNews?.requestSha256!==requestSha256)throw new WorkError('同じ仕事IDの内容が異なります。',409);return response(old);}
      const h=requireHistory();
      const tombstone=await db.prepare('SELECT deleted_at FROM eve_conversations WHERE owner_id=? AND id=?').bind(owner,threadId).first<{deleted_at:number}>();
      if(tombstone?.deleted_at)throw new EveHistoryError('削除した会話へニュース仕事は作成できません。',410);
      try{await h.get(threadId);}catch(error){if(!(error instanceof EveHistoryError)||error.status!==404)throw error;}
      const state:EveNewsWorkState={schema:'eve.news-work/1',threadId,requestSha256,...input,modelIdentity:'unverified_import',externalToolSuccess:false,usage:'not_reported'};
      const saved=await works.create(owner,createEveNewsJob(id,state),{threadId});
      if(!saved||saved.eveNews?.requestSha256!==requestSha256)throw new WorkError('仕事IDが使用されています。',409);
      return response(saved);
    },
    async command(raw: unknown) {
      const v=objectInput(raw,['jobId','revision','commandId','action','draft','modelLabel','reason','sources','saveMaterial','split','dataSha256','rightsReviewed','sensitiveDataReviewed','allowDatasetPreparation']),job=await get(v.jobId);
      if(v.action==='sync')return response(job);
      const commandId=workId(v.commandId);
      if(v.action==='cancel'){
        const next=applyWorkCommand(job,{id:commandId,action:'cancel'},v.revision);
        if(next!==job&&!await works.update(owner,next,job.revision))throw new WorkError('仕事が更新されました。',409);
        return response(next);
      }
      if(job.eveNews!.repairAttempts?.some(a=>a.id===commandId))throw new WorkError('この操作IDはモデル修正に使用されています。',409);
      if(v.action==='learning-grant'||v.action==='learning-withdraw'){
        const granting=v.action==='learning-grant',split=granting?newsLearningSplit(v.split):undefined;
        if(granting&&(v.allowDatasetPreparation!==true||v.rightsReviewed!==true||v.sensitiveDataReviewed!==true||typeof v.dataSha256!=='string'||!/^[a-f0-9]{64}$/.test(v.dataSha256)))throw new WorkError('学習準備の対象hash・用途・権利・秘密確認への個別同意が必要です。');
        if(!granting&&[v.split,v.dataSha256,v.rightsReviewed,v.sensitiveDataReviewed,v.allowDatasetPreparation].some(value=>value!==undefined))throw new WorkError('撤回は対象の仕事と現在の版だけを指定してください。');
        const fingerprint=await sha256Hex(JSON.stringify({action:v.action,...(granting?{split,dataSha256:v.dataSha256,rightsReviewed:true,sensitiveDataReviewed:true,allowDatasetPreparation:true}:{})}));
        const replay=job.eveNews!.learningConsents?.find(c=>c.commandId===commandId);
        if(replay){if(replay.fingerprint!==fingerprint)throw new WorkError('同じ同意操作IDの内容が異なります。',409);return response(job);}
        const oldEvent=job.events.find(event=>event.command.id===commandId);
        if(oldEvent){if(!granting&&oldEvent.command.action==='record'&&oldEvent.command.tool==='eve-news-learning-preparation-consent')return response(job);throw new WorkError('同じ操作IDが使用されています。',409);}
        let contentSha256:string|undefined;
        if(granting){await requireHistory().get(job.eveNews!.threadId);const check=await ownerLearningCheck(job,split!);contentSha256=check.contentSha256;if(check.dataSha256!==v.dataSha256||check.blockedReasons.length)throw new WorkError('現行資料・権利・秘密・評価素材の確認が必要です。',409);}
        const consent:import('./eve-news-learning.ts').NewsLearningConsent={schema:'eve.news-learning-consent/1',status:granting?'granted':'withdrawn',scope:'dataset_preparation_only',range:'current_news_material_and_draft',commandId,fingerprint,at:new Date().toISOString(),...(granting?{split,dataSha256:v.dataSha256 as string,contentSha256,rightsReviewed:true as const,sensitiveDataReviewed:true as const}:{})};
        const next=recordEveNewsLearningConsent(job,consent,Number(v.revision));
        if(next!==job&&!await works.update(owner,next,job.revision,undefined,undefined,granting?job.eveNews!.threadId:undefined,granting&&split==='training_candidate'?{contentSha256:contentSha256!,dataSha256:v.dataSha256 as string}:undefined))throw new WorkError('同意・仕事・元の会話が更新されています。読み直してください。',409);
        return response(next);
      }
      if(v.action==='append-sources'){
        if(v.saveMaterial!==true||!Array.isArray(v.sources)||!v.sources.length)throw new WorkError('追加資料の保存同意と資料を確認してください。');
        if(typeof v.reason!=='string'||!v.reason.trim()||v.reason.length>1000)throw new WorkError('追加理由は1〜1000文字で記録してください。');
        const news=job.eveNews!;
        // Validate the appended slice independently so a replay after insertion has the same identity.
        const addition=cleanNewsInput({...news.packet,sources:v.sources},{...news.draft,claimLedger:[{id:'append-validation',text:'資料の形式を検査する',type:'unverified_claim',evidenceState:'unknown',sourceIds:[(v.sources[0] as {sourceId?:unknown})?.sourceId],reason:'保存前の形式検査'}]},news.draft.modelProfileIdAndHash).packet.sources;
        const hash=await sha256Hex(JSON.stringify({sources:addition,reason:v.reason.trim()}));
        const replay=news.sourceRevisions?.find(item=>item.commandId===commandId);
        if(replay){if(replay.replacementSha256!==hash)throw new WorkError('同じ資料追加操作IDの内容が異なります。',409);return response(job);}
        if(job.events.some(event=>event.command.id===commandId))throw new WorkError('同じ操作IDが使用されています。',409);
        const packet={...news.packet,sources:[...news.packet.sources,...addition]};
        const clean=cleanNewsInput(packet,news.draft,news.draft.modelProfileIdAndHash);
        if(new Set(clean.packet.sources.map(source=>source.canonicalUrl)).size!==clean.packet.sources.length)throw new WorkError('同じ出典URLは重ねて追加できません。',409);
        if(JSON.stringify(clean).length>96000)throw new WorkError('資料と草稿の上限を超えています。',413);
        await requireHistory().get(news.threadId);
        const next=appendEveNewsSources(job,clean.packet,{...clean.draft,generatedAt:news.draft.generatedAt},v.reason.trim(),hash,Number(v.revision),commandId);
        if(JSON.stringify(next).length>512000)throw new WorkError('旧資料を含む保存上限に達しました。',413);
        if(!await works.update(owner,next,job.revision))throw new WorkError('別の操作で更新されています。同じ仕事を読み直してください。',409);
        return response(next);
      }
      if(v.action==='revise'){
        const input=cleanNewsInput(job.eveNews!.packet,v.draft,v.modelLabel);
        if(JSON.stringify(input).length>96000)throw new WorkError('資料と草稿は96,000文字以内にしてください。',413);
        if(typeof v.reason!=='string'||!v.reason.trim()||v.reason.length>1000)throw new WorkError('修正理由は1〜1000文字で記録してください。');
        const {generatedAt:_at,...stable}=input.draft;
        const hash=await sha256Hex(JSON.stringify({draft:stable,reason:v.reason.trim()}));
        const old=job.eveNews!.revisions?.find(item=>item.commandId===commandId);
        if(old){if(old.replacementSha256!==hash)throw new WorkError('同じ修正操作IDの内容が異なります。',409);return response(job);}
        if(job.events.some(event=>event.command.id===commandId))throw new WorkError('同じ操作IDが使用されています。',409);
        await requireHistory().get(job.eveNews!.threadId);
        const next=reviseEveNewsDraft(job,input.draft,v.reason.trim(),hash,Number(v.revision),commandId);
        if(!await works.update(owner,next,job.revision))throw new WorkError('別の操作で更新されています。同じ仕事を読み直してください。',409);
        return response(next);
      }
      if(v.action!=='check')throw new WorkError('参照検査または停止を選んでください。');
      const previous=job.events.find(event=>event.command.id===commandId);
      if(previous){if(previous.command.action!=='record'||previous.command.tool!=='eve-news-draft-audit')throw new WorkError('同じ操作IDの内容が異なります。',409);return response(job);}
      await requireHistory().get(job.eveNews!.threadId);
      const started=Date.now(),audit=auditNewsDraft(job.eveNews!.packet,job.eveNews!.draft);
      const next=recordEveNewsAudit(job,audit,Number(v.revision),commandId,Date.now()-started);
      if(!await works.update(owner,next,job.revision))throw new WorkError('別の操作で更新されています。同じ仕事を読み直してください。',409);
      return response(next);
    },
  };
}
