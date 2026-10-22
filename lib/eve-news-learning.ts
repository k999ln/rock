import type { WorkJob } from './workflow.ts';
import { WorkError } from './workflow.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
// Owner-scoped historical assignments survive withdrawal; only exact hashes are compared.
export const NEWS_EVALUATION_HISTORY_SQL = `SELECT 1 FROM work_jobs evaluated, json_each(COALESCE(json_extract(evaluated.payload,'$.eveNews.learningConsents'),'[]')) consent WHERE evaluated.user_id=? AND json_extract(consent.value,'$.status')='granted' AND json_extract(consent.value,'$.split')='evaluation' AND (json_extract(consent.value,'$.contentSha256')=? OR json_extract(consent.value,'$.dataSha256')=?)`;
export type NewsLearningSplit='evaluation'|'training_candidate';
export type NewsLearningConsent={schema:'eve.news-learning-consent/1';status:'granted'|'withdrawn';scope:'dataset_preparation_only';range:'current_news_material_and_draft';split?:NewsLearningSplit;dataSha256?:string;contentSha256?:string;commandId:string;fingerprint:string;at:string;rightsReviewed?:true;sensitiveDataReviewed?:true};
export function newsLearningSplit(value:unknown):NewsLearningSplit {if(value!=='evaluation'&&value!=='training_candidate')throw new WorkError('評価用または学習候補の用途を選んでください。');return value;}
export async function newsLearningCheck(job:WorkJob,split:NewsLearningSplit){
 const n=job.eveNews;if(!n)throw new WorkError('ニュース仕事を確認してください。',404);
 const payload={topic:n.packet.topic,sources:n.packet.sources,draft:{headline:n.draft.headline,articleText:n.draft.articleText,claimLedger:n.draft.claimLedger,unresolvedQuestions:n.draft.unresolvedQuestions,modelProfileIdAndHash:n.draft.modelProfileIdAndHash}};
 const dataSha256=await sha256Hex(JSON.stringify({packet:n.packet,draft:n.draft}));
 const contentSha256=await sha256Hex(JSON.stringify({topic:payload.topic,sources:payload.sources.map(s=>({url:s.canonicalUrl,excerpt:s.excerpt})).sort((a,b)=>a.url<b.url?-1:a.url>b.url?1:0),headline:payload.draft.headline,articleText:payload.draft.articleText}));
 const text=[payload.topic,payload.draft.headline,payload.draft.articleText,payload.draft.modelProfileIdAndHash,...payload.draft.unresolvedQuestions,...payload.draft.claimLedger.flatMap(c=>[c.text,c.reason]),...payload.sources.flatMap(s=>[s.excerpt,s.canonicalUrl,s.publisherOrSpeaker])].join('\n');
 const allText=JSON.stringify(payload);
 const sensitiveFlags:string[]=[];
 if(/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{12,})/i.test(allText))sensitiveFlags.push('credential_pattern');
 if(/(?:api[_ -]?key|password|secret|access[_ -]?token|パスワード|秘密鍵|APIキー)\s*[:：=]\s*["']?[^\s"']{6,}|[?&](?:token|key|secret|api_key)=[^&\s]{6,}/i.test(allText))sensitiveFlags.push('named_secret_pattern');
 if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(allText))sensitiveFlags.push('email_pattern');
 if(/(?:^|[^\w])(?:\+?\d[ -]?){9,15}(?:$|[^\w])/m.test(text))sensitiveFlags.push('phone_or_account_number_pattern');
 const knownEvaluationIndicators=n.learningConsents?.some(c=>c.status==='granted'&&c.split==='evaluation'&&(c.dataSha256===dataSha256||c.contentSha256===contentSha256))===true||/評価用の架空|fictional|fictional-fixture|eve-news-fixture|benchmark/i.test(JSON.stringify({packet:n.packet,draft:payload.draft}));
 const blockedReasons:string[]=[];
 if(!['active','review'].includes(job.status))blockedReasons.push('work_stopped');
 if(!n.packet.sources.every(s=>s.rightsScope==='owner_authored'))blockedReasons.push('rights_not_owner_authored');
 if(sensitiveFlags.length)blockedReasons.push('sensitive_text_review_required');
 if(split==='training_candidate'&&knownEvaluationIndicators)blockedReasons.push('known_evaluation_material');
 const latest=n.learningConsents?.at(-1),consentStatus=!latest?'not_granted':latest.status==='withdrawn'?'withdrawn':latest.dataSha256!==dataSha256||latest.split!==split?'stale':'granted';
 return{schema:'eve.news-learning-check/1' as const,jobRevision:job.revision,split,dataSha256,contentSha256,consentStatus,blockedReasons,sensitiveFlags,knownEvaluationIndicators,trainingAllowed:false as const,scope:'dataset_preparation_only' as const};
}
export async function newsLearningPreview(job:WorkJob,split:NewsLearningSplit,readback:()=>Promise<WorkJob>,assertHistory:()=>Promise<unknown>){
 const check=await newsLearningCheck(job,split),n=job.eveNews!;
 if(check.blockedReasons.length||check.consentStatus!=='granted')throw new WorkError('準備同意・現行データ・権利・秘密/評価素材の確認が必要です。',403);
 await assertHistory();
 const dataset={schema:'eve.news-dataset-preparation/1',scope:'owner_private_preparation_only',split,dataSha256:check.dataSha256,contentSha256:check.contentSha256,trainingAllowed:false,requiresConsentRecheckBeforeTraining:true,
  acceptance:{rights:'owner_attestation_only',secretScan:'known_patterns_only_not_a_guarantee',decontamination:'known_indicators_only',crossDatasetDeduplication:'pending',modelLicense:'not_reviewed',semanticQuality:'not_accepted_for_training'},
  provenance:{jobId:job.id,jobRevision:job.revision,consentCommandId:n.learningConsents!.at(-1)!.commandId},
  records:[{input:{topic:n.packet.topic,sources:n.packet.sources},output:{headline:n.draft.headline,articleText:n.draft.articleText,claimLedger:n.draft.claimLedger,unresolvedQuestions:n.draft.unresolvedQuestions,modelProfileIdAndHash:n.draft.modelProfileIdAndHash},verification:{referenceChecks:n.audit?.checks.map(c=>({id:c.id,passed:c.passed}))??[],semanticTruth:'not_verified',politicalFairness:'not_evaluated',publication:'not_published'}}]};
 if(JSON.stringify(dataset).length>96000)throw new WorkError('準備データの上限を超えています。',413);
 await assertHistory();
 // The final read joins the live conversation in the store; do not await more work after this fence.
 const fresh=await readback();
 if(fresh.revision!==job.revision||fresh.status!==job.status||JSON.stringify(fresh.eveNews)!==JSON.stringify(n))throw new WorkError('準備中にデータまたは同意が変わりました。読み直してください。',409);
 return{check,dataset};
}
