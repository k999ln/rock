// One preregistered raw decision per cell; no model Tool execution or task acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Planner} from './planner.mjs';
import {integrationChat} from './prepare_integration.mjs';
import {parseZemaLocalAgentReply} from '../../lib/zema-local-agent.ts';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const atomic=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
export async function diagnose({root,base,python,candidateRoot}){
 const protocol=JSON.parse(fs.readFileSync(path.join(root,'protocol.json'),'utf8'));
 const manifestRaw=fs.readFileSync(path.join(candidateRoot,'candidate-manifest.json'));
 if(sha(manifestRaw)!==protocol.priorCandidateUnchanged.manifestSha256)throw Error('frozen reference candidate changed');
 const reference=JSON.parse(manifestRaw),binding={baseSha256:reference.base.files['model.safetensors'],adapterSha256:reference.adapterSha256,tokenizerSha256:reference.base.files['tokenizer.json'],candidateManifestSha256:sha(manifestRaw)};
 const tasks=fs.readFileSync(path.join(root,'observed-v3/development.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const trainingManifestRaw=fs.readFileSync(path.join(candidateRoot,'training-v4/manifest.json'));
 if(sha(trainingManifestRaw)!==reference.trainingDataManifestSha256)throw Error('frozen reference training manifest changed');
 const oldTraining=fs.readFileSync(path.join(candidateRoot,'training-v4/train.jsonl'),'utf8');
 if(sha(oldTraining)!==JSON.parse(trainingManifestRaw).files['train.jsonl'].sha256)throw Error('frozen compact-system source changed');
 const compact=JSON.parse(oldTraining.split('\n')[0]).messages[0].content;
 const planned=[];
 for(const id of protocol.diagnostics.tasks)for(const system of ['compact','integration'])for(const arm of ['A','C'])planned.push({id:`diagnostic:${id}:${system}:${arm}`,caseId:id,system,arm,state:'not_started'});
 if(planned.length!==20)throw Error('fixed20 diagnostic decisions required');
 const out=path.join(root,'diagnostics.json');if(fs.existsSync(out))throw Error('refuse diagnostic overwrite/retry');
 const result={schema:'eve.raw-system-weight-diagnostics/1',startedAt:new Date().toISOString(),groupSecondsLimit:1200,protocolSha256:sha(fs.readFileSync(path.join(root,'protocol.json'))),binding,compactSystemSha256:sha(compact),placement:'Mac MLX supporting raw diagnostic; not physical Tool-loop acceptance',rawDecisionsOnly:true,taskComplete:null,rows:planned};atomic(out,result);
 const planner=new Planner({root,base,python,candidateRoot,expectedBinding:binding});const cutoff=Date.now()+1200000;
 try{for(const row of planned){
   const task=tasks.find(t=>t.id===row.caseId);if(!task)throw Error('unknown fixed diagnostic task');
   if(Date.now()>=cutoff||planner.halted)break;
   const prepared=await integrationChat(task);row.state='running';atomic(out,result);
   try{
    const output=await planner.generate({id:row.id,category:'diagnostic',arm:row.arm,system:row.system==='compact'?compact:prepared.messages[0].content,prompt:prepared.messages[1].content,maxTokens:256},Math.min(120000,cutoff-Date.now()));
    let parsed=null,strict=false;try{JSON.parse(output.raw);parsed=parseZemaLocalAgentReply(output.raw);strict=!output.excludedReasoning&&output.finishReason==='stop';}catch{}
    Object.assign(row,{state:'observed',output,parsed,strictSchema:strict,promptSha256:sha(prepared.messages[1].content)});
   }catch(error){Object.assign(row,{state:'failed',error:error.message,fatal:Boolean(error.fatal)});}
   finally{await planner.stop('normal_job_end');atomic(out,result);}
  }}finally{await planner.stop('normal_job_end');result.finishedAt=new Date().toISOString();result.note='Missing/failed/incomplete cells remain in the20 planned denominator. No new candidate was selected from these outputs.';atomic(out,result);}
 return {planned:20,observed:planned.filter(r=>r.state==='observed').length,failed:planned.filter(r=>r.state==='failed').length,notStarted:planned.filter(r=>r.state==='not_started').length};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const [root,base,python,candidateRoot]=process.argv.slice(2);if(!candidateRoot)throw Error('root base python frozen-candidate-root required');console.log(JSON.stringify(await diagnose({root,base,python,candidateRoot})));}
