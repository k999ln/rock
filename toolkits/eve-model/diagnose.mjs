// One preregistered raw decision per cell; no model Tool execution or task acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Planner} from './planner.mjs';
import {integrationChat} from './prepare_integration.mjs';
import {parseZemaLocalAgentReply,executeZemaLocalAgentTool} from '../../lib/zema-local-agent.ts';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const atomic=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
export function reviewedSystems(protocol,root,oldTrainingSystem,currentSystem){
 if(protocol.schema!=='eve.semantic-quality-protocol/1')return {compact:oldTrainingSystem,integration:currentSystem};
 const expected={old:'old-system.txt',current:'new-system.txt'},result={};
 for(const [name,file] of Object.entries(expected)){
  const config=protocol.diagnostics.systems?.[name];
  if(!config||config.file!==file)throw Error('fixed reviewed diagnostic system required');
  const body=fs.readFileSync(path.join(root,file),'utf8');
  if(sha(body)!==config.sha256)throw Error('reviewed diagnostic system changed');
  result[name]=body;
 }
 if(result.old!==oldTrainingSystem||result.current!==currentSystem)throw Error('diagnostic system/training-serving binding mismatch');
 return result;
}
export async function reviewedDiagnosticInputs(protocol,root,tasks,prepare=integrationChat){
 const ids=protocol.diagnostics.tasks;
 if(!Array.isArray(ids)||ids.length!==5||new Set(ids).size!==5)throw Error('five unique diagnostic cases required');
 let expected=null;
 if(protocol.schema==='eve.semantic-quality-protocol/1'){
  const raw=fs.readFileSync(path.join(root,'diagnostic-input-identity.json'));
  if(sha(raw)!==protocol.diagnostics.inputIdentitySha256)throw Error('reviewed input identity changed');
  const proof=JSON.parse(raw);expected=new Map(proof.cells.map(x=>[x.id,x.promptSha256]));
  if(proof.cells.length!==5||expected.size!==5||ids.some(id=>!expected.has(id)))throw Error('diagnostic input case identity mismatch');
 }
 const prepared=new Map();
 for(const id of ids){
  const selected=tasks.filter(t=>t.id===id);if(selected.length!==1)throw Error('unique fixed source case required');
  const row=await prepare(selected[0]);const system=row.messages[0].content,prompt=row.messages[1].content;
  if(expected&&(sha(prompt)!==expected.get(id)||sha(system)!==protocol.diagnostics.systems.current.sha256))throw Error('prepared input differs from reviewed prompt/system');
  prepared.set(id,Object.freeze({system,prompt}));
 }
 return prepared;
}
export function diagnosticAttempt(protocol,root,resumption=false){
 if(!resumption)return {output:'diagnostics.json',prefix:'diagnostic'};
 if(protocol.schema!=='eve.semantic-quality-protocol/1')throw Error('reviewed semantic resumption only');
 const decision=JSON.parse(fs.readFileSync(path.join(root,'diagnostic-resumption-decision.json')));
 const failedRaw=fs.readFileSync(path.join(root,'diagnostics.json')),failed=JSON.parse(failedRaw);
 const reviewRaw=fs.readFileSync(path.join(root,'DIAGNOSTIC_RESUMPTION_REVIEW.json')),review=JSON.parse(reviewRaw);
 if(sha(reviewRaw)!==decision.reviewSha256||review.diagnosticManualResumptionPermitted!==true||review.reviewedProtocolSha256!==sha(fs.readFileSync(path.join(root,'protocol.json'))))throw Error('manual resumption review binding mismatch');
 if(decision.status!=='adopted'||decision.onceOnly!==true||decision.reservedCallsBefore!==0||decision.failedAttemptSha256!==sha(failedRaw)||decision.protocolSha256!==sha(fs.readFileSync(path.join(root,'protocol.json')))||typeof decision.reviewSha256!=='string'||!/^[a-f0-9]{64}$/.test(decision.reviewSha256))throw Error('explicit reviewed one-time diagnostic resumption required');
 if(failed.rows?.length!==20||failed.rows.some(x=>x.output||!['failed','not_started'].includes(x.state))||failed.rows.filter(x=>x.state==='failed').length!==1||fs.existsSync(path.join(root,'runtime.sqlite')))throw Error('startup-only zero-call failure required for resumption');
 return {output:'diagnostics-reviewed-resumption.json',prefix:'diagnostic-reviewed1'};
}
export async function diagnose({root,base,python,candidateRoot,prepare=integrationChat,plannerFactory=options=>new Planner(options),resumption=false}){
 const protocol=JSON.parse(fs.readFileSync(path.join(root,'protocol.json'),'utf8'));
 const attempt=diagnosticAttempt(protocol,root,resumption);
 const manifestRaw=fs.readFileSync(path.join(candidateRoot,'candidate-manifest.json'));
 if(sha(manifestRaw)!==protocol.priorCandidateUnchanged.manifestSha256)throw Error('frozen reference candidate changed');
 const reference=JSON.parse(manifestRaw),binding={baseSha256:reference.base.files['model.safetensors'],adapterSha256:reference.adapterSha256,tokenizerSha256:reference.base.files['tokenizer.json'],candidateManifestSha256:sha(manifestRaw)};
 const taskRaw=fs.readFileSync(path.join(root,'observed-v3/development.jsonl'),'utf8');
 if(protocol.schema==='eve.semantic-quality-protocol/1'&&sha(taskRaw)!==protocol.diagnostics.developmentSha256)throw Error('reviewed development source changed');
 const tasks=taskRaw.trim().split('\n').map(JSON.parse);
 const trainingDirectory=protocol.schema==='eve.semantic-quality-protocol/1'?'training':'training-v4';
 const trainingManifestRaw=fs.readFileSync(path.join(candidateRoot,trainingDirectory,'manifest.json'));
 if(sha(trainingManifestRaw)!==reference.trainingDataManifestSha256)throw Error('frozen reference training manifest changed');
 const oldTraining=fs.readFileSync(path.join(candidateRoot,trainingDirectory,'train.jsonl'),'utf8');
 if(sha(oldTraining)!==JSON.parse(trainingManifestRaw).files['train.jsonl'].sha256)throw Error('frozen compact-system source changed');
 const compact=JSON.parse(oldTraining.split('\n')[0]).messages[0].content;
 const inputs=await reviewedDiagnosticInputs(protocol,root,tasks,prepare);
 const systems=reviewedSystems(protocol,root,compact,inputs.get(protocol.diagnostics.tasks[0]).system);
 const planned=[];
 for(const id of protocol.diagnostics.tasks)for(const system of Object.keys(systems))for(const arm of ['A','C'])planned.push({id:`${attempt.prefix}:${id}:${system}:${arm}`,caseId:id,system,arm,state:'not_started'});
 if(planned.length!==20)throw Error('fixed20 diagnostic decisions required');
 const out=path.join(root,attempt.output);if(fs.existsSync(out))throw Error('refuse diagnostic overwrite/retry');
 const result={schema:'eve.raw-system-weight-diagnostics/1',startedAt:new Date().toISOString(),groupSecondsLimit:1200,protocolSha256:sha(fs.readFileSync(path.join(root,'protocol.json'))),binding,compactSystemSha256:sha(compact),placement:'Mac MLX supporting raw diagnostic; not physical Tool-loop acceptance',rawDecisionsOnly:true,taskComplete:null,reviewedManualResumption:resumption,rows:planned};fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 const planner=plannerFactory({root,base,python,candidateRoot,expectedBinding:binding});const cutoff=Date.now()+1200000;
 try{for(const row of planned){
   const task=tasks.find(t=>t.id===row.caseId);if(!task)throw Error('unknown fixed diagnostic task');
   if(Date.now()>=cutoff||planner.halted)break;
   const prepared=inputs.get(row.caseId);row.state='running';atomic(out,result);
   try{
    const output=await planner.generate({id:row.id,category:'diagnostic',arm:row.arm,system:systems[row.system],prompt:prepared.prompt,maxTokens:256},Math.min(120000,cutoff-Date.now()));
    let parsed=null,strict=false;try{JSON.parse(output.raw);parsed=parseZemaLocalAgentReply(output.raw);strict=!output.excludedReasoning&&output.finishReason==='stop';}catch{}
    let toolArgumentsAccepted=null,toolArgumentError=null;if(parsed?.action==='tool'){try{executeZemaLocalAgentTool(parsed.tool,parsed.arguments);toolArgumentsAccepted=true;}catch(error){toolArgumentsAccepted=false;toolArgumentError=error.code??'TOOL_ARGUMENT_REJECTED';}}
    Object.assign(row,{state:'observed',output,parsed,strictSchema:strict,toolArgumentsAccepted,toolArgumentError,systemSha256:sha(systems[row.system]),promptSha256:sha(prepared.prompt)});
   }catch(error){Object.assign(row,{state:'failed',error:error.message,fatal:Boolean(error.fatal)});}
   finally{await planner.stop('normal_job_end');atomic(out,result);}
  }}finally{await planner.stop('normal_job_end');result.finishedAt=new Date().toISOString();result.note='Missing/failed/incomplete cells remain in the20 planned denominator. No new candidate was selected from these outputs.';atomic(out,result);}
 return {planned:20,observed:planned.filter(r=>r.state==='observed').length,failed:planned.filter(r=>r.state==='failed').length,notStarted:planned.filter(r=>r.state==='not_started').length};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const [root,base,python,candidateRoot,mode]=process.argv.slice(2);if(mode&&mode!=='reviewed-resumption')throw Error('unknown diagnostic attempt mode');if(!candidateRoot)throw Error('root base python frozen-candidate-root required');console.log(JSON.stringify(await diagnose({root,base,python,candidateRoot,resumption:mode==='reviewed-resumption'})));}
