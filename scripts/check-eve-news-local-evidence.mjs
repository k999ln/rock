// Opt-in evidence review of fictional owner-authored material; no download or publication.
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';import{eveAgentFixture}from'../tests/helpers/eve-agent-fixture.mjs';import{eveNewsWorkStore}from'../lib/eve-news-work.ts';import{runEveNewsRepair}from'../lib/eve-news-repair.ts';import{readOllamaModelInventory}from'../lib/ollama-model-inventory.ts';import{generateText}from'../lib/llm-providers.ts';
import { evidenceEvaluationCases, evidenceSuiteVersion, scoreEvidenceCase, summarizeEvidenceSuite } from '../toolkits/eve-news/evidence-evaluation-cases.mjs';
async function runSuite() {
 const model=process.argv[2]||'qwen2.5:1.5b',output=process.argv[3]||'/private/tmp/eve-news-evidence-suite.json';
 const runtime={SKY_OLLAMA_BASE_URL:'http://127.0.0.1:11434'};
 const installed=(await readOllamaModelInventory(runtime)).find(item=>item.name===model);
 if(!installed)throw Error('Use an already-installed local model; no download');
 const fixtures=evidenceEvaluationCases(JSON.parse(readFileSync('toolkits/eve-news/examples/fictional-packet.json')));
 const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const proof={schema:'eve.news-evidence-suite-result/1',suite:evidenceSuiteVersion,fixtureSha256:hash(fixtures),recordedAt:new Date().toISOString(),model:installed,syntheticInputOnly:true,modelDownloaded:false,cloudCalled:false,published:false,rows:[],actualModelCalls:0,limits:{cases:8,maxOutputTokensPerCase:800,maxInferenceMsPerCase:40000,retries:0},scope:'Exploratory fictional source-relation evaluation through existing WorkJob/adapter/usage. Not real-world truth, neutrality, independent reviewer certification or automatic routing eligibility.'};
 const save=()=>{proof.summary=summarizeEvidenceSuite(proof.rows);writeFileSync(output,JSON.stringify(proof,null,2)+'\n');};
 save();
 for(const fixture of fixtures){
  const cleanup=[],f=eveAgentFixture({after:fn=>cleanup.push(fn)}),owner='fictional-evidence-suite',store=eveNewsWorkStore(f.db,owner,f.keys),started=Date.now();
  try{
   let job=(await store.create({jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),packet:fixture.packet,draft:fixture.draft,modelLabel:'owner-authored',saveMaterial:true})).job;
   job=(await store.command({jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action:'check'})).job;
   const before=structuredClone(job);
   const request={jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action:'evaluate-claim',claimId:'c1',modelLabel:installed.name,modelDigest:installed.digest,consentLocal:true};
   const result=await runEveNewsRepair(f.db,owner,f.keys,request,runtime,async(...args)=>{proof.actualModelCalls++;save();return generateText(...args);});
   const after=await store.get(job.id),attempt=after.eveNews.repairAttempts[0];
   assert.deepEqual(after.eveNews.draft,before.eveNews.draft);assert.deepEqual(after.eveNews.audit,before.eveNews.audit);assert.equal(after.status,before.status);
   const row={caseId:fixture.id,pairId:fixture.pairId,expectedAssessment:fixture.expectedAssessment,inputSha256:hash({packet:fixture.packet,draft:fixture.draft}),jobId:job.id,threadId:job.eveNews.threadId,durationMs:Date.now()-started,attempt,score:scoreEvidenceCase(fixture,attempt),draftUnchanged:true,auditUnchanged:true,statusUnchanged:true,historySaved:result.historySaved};
   proof.rows.push(row);save();console.log(JSON.stringify({caseId:row.caseId,outcome:attempt.outcome,passed:row.score.passed}));
   // A lost response or changed/unavailable model ends this run; never resend it.
   if(attempt.state==='unknown'||attempt.state==='sending'||['model_changed','model_unavailable'].includes(attempt.outcome)){proof.stoppedAt=fixture.id;break;}
  }catch(error){proof.failure={caseId:fixture.id,message:error.message};break;}
  finally{for(const fn of cleanup)fn();}
 }
 proof.sourceSha256=Object.fromEntries(['lib/eve-news-evidence.ts','lib/eve-news-repair.ts','scripts/check-eve-news-local-evidence.mjs','toolkits/eve-news/evidence-evaluation-cases.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
 save();if(!proof.summary.fixtureCriteriaPassed)process.exitCode=1;
 console.log(JSON.stringify({suite:proof.suite,summary:proof.summary,actualModelCalls:proof.actualModelCalls,evidence:output}));
}
if(process.argv.includes('--suite')) { await runSuite(); } else {
const model=process.argv[2]||'qwen2.5:1.5b',output=process.argv[3]||'/private/tmp/eve-news-local-evidence.json',runtime={SKY_OLLAMA_BASE_URL:'http://127.0.0.1:11434'},installed=(await readOllamaModelInventory(runtime)).find(item=>item.name===model);if(!installed)throw Error('Use an already-installed local model; no download');
const cleanup=[],f=eveAgentFixture({after:fn=>cleanup.push(fn)}),owner='fictional-evidence-evaluation',store=eveNewsWorkStore(f.db,owner,f.keys),packet=JSON.parse(readFileSync('toolkits/eve-news/examples/fictional-packet.json'));
const draft={headline:'架空の採決',articleText:'採決を延期した。',claimLedger:[{id:'c1',text:'採決を延期した',type:'unverified_claim',evidenceState:'unknown',sourceIds:['record-1'],reason:'本人作成の評価用主張'}],unresolvedQuestions:['次の日程']};let calls=0,proof={schema:'eve.news-local-evidence-evaluation/1',recordedAt:new Date().toISOString(),model:installed,syntheticInputOnly:true,modelDownloaded:false,cloudCalled:false,published:false,semanticTruth:'not_verified'};
try{let job=(await store.create({jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),packet,draft,modelLabel:'owner-authored',saveMaterial:true})).job;job=(await store.command({jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action:'check'})).job;const before=structuredClone(job);
const request={jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action:'evaluate-claim',claimId:'c1',modelLabel:installed.name,modelDigest:installed.digest,consentLocal:true};const response=await runEveNewsRepair(f.db,owner,f.keys,request,runtime,async(...args)=>{calls++;const result=await generateText(...args);if(process.argv.includes('--diagnostic-output'))writeFileSync(output+'.report.txt',result.text);return result;});job=await store.get(job.id);assert.deepEqual(job.eveNews.draft,before.eveNews.draft);assert.deepEqual(job.eveNews.audit,before.eveNews.audit);assert.equal(job.status,before.status);
proof={...proof,jobId:job.id,threadId:job.eveNews.threadId,status:job.status,attempt:job.eveNews.repairAttempts[0],draftUnchanged:true,auditUnchanged:true,historySaved:response.historySaved,reportStored:job.eveNews.repairAttempts[0].outcome==='review_saved',expectedAssessment:'supported',assessmentMatchesExpected:job.eveNews.repairAttempts[0].evidenceReport?job.eveNews.repairAttempts[0].evidenceReport.assessment==='supported':null,accepted:job.eveNews.repairAttempts[0].evidenceReport?.assessment==='supported',scope:'actual installed model/adapter + isolated SQLite/history; model suggestion with literal quote checks, not truth/independence/political acceptance'};if(!proof.accepted)process.exitCode=1;
}catch(error){proof.failure=error.message;process.exitCode=1;}
finally{proof.actualModelCalls=calls;proof.sourceSha256=Object.fromEntries(['lib/eve-news-evidence.ts','lib/eve-news-repair.ts','lib/eve-news-work.ts','lib/workflow.ts','scripts/check-eve-news-local-evidence.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));writeFileSync(output,JSON.stringify(proof,null,2)+'\n');for(const fn of cleanup)fn();}
console.log(JSON.stringify({accepted:proof.accepted??false,calls,evidence:output}));

}
