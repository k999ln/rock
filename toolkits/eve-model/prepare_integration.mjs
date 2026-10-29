// Capture the real pure Zema planner inputs; never generate a model reply.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {runZemaLocalAgent,parseZemaLocalAgentReply,executeZemaLocalAgentTool} from '../../lib/zema-local-agent.ts';
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
const canonical=x=>JSON.stringify(sorted(x));
export async function integrationChat(task){
  parseZemaLocalAgentReply(canonical(task.target));
  const request=task.request+'\n資料（データ）:\n'+JSON.stringify(task.materials);
  let captured=null;
  if(task.setupToolFailure){
    let code;try{executeZemaLocalAgentTool(task.setupToolFailure.tool,task.setupToolFailure.arguments);}catch(error){code=error.code;}
    if(code!=='INVALID_TOOL_ARGUMENTS'||task.observedToolFailure?.output?.error!==code)throw Error('real past repair rejection required');
  }
  const stop=Error('offline planner input capture');
  try{await runZemaLocalAgent({request,maxSteps:3,planner:async input=>{
    if(task.setupToolFailure&&input.step===1)return canonical({schema:'zema-local-agent/1',action:'tool',...task.setupToolFailure,reason:'matched synthetic invalid argument; input preparation only'});
    captured=input;throw stop;
  }});}catch(error){if(error!==stop)throw error;}
  if(!captured||captured.step!==(task.setupToolFailure?2:1)||!captured.prompt.startsWith('利用者の依頼:\n'+request+'\n\nこれまでのTool結果:'))throw Error('unchanged real integration input required');
  return {messages:[{role:'system',content:captured.system},{role:'user',content:captured.prompt},{role:'assistant',content:canonical(task.target)}],
    identity:{id:task.id,taskSha256:digest(canonical(task)),step:captured.step,sourceCount:task.materials.length,requestSha256:digest(request),promptSha256:digest(captured.prompt),systemSha256:digest(captured.system)}};
}
export async function prepare(corpus,output){
  if(fs.existsSync(output))throw Error('new integration output directory required');
  const result={},metadata={schema:'eve.integration-training-inputs/1',modelCalls:0,sealedFilesRead:false,files:{},selected:{},plannerModuleSha256:digest(fs.readFileSync(new URL('../../lib/zema-local-agent.ts',import.meta.url)))};
  for(const split of ['train','validation']){
    const raw=fs.readFileSync(path.join(corpus,split+'.jsonl'),'utf8'),rows=raw.trim().split('\n').map(JSON.parse);
    const chosen=split==='train'?rows:[['combine','ja'],['constraint','en'],['conflict','ja'],['repair','en']].map(([kind,lang])=>rows.find(r=>r.taskKind===kind&&r.language===lang&&r.variant==='clean'));
    if(chosen.some(x=>!x))throw Error('fixed balanced validation selection missing');
    const chats=[];metadata.selected[split]=[];
    for(const task of chosen){const row=await integrationChat(task);chats.push({messages:row.messages});metadata.selected[split].push(row.identity);}
    const name=split==='train'?'train.jsonl':'valid.jsonl';result[name]=chats.map(canonical).join('\n')+'\n';metadata.files[name]={sha256:digest(result[name]),sourceSha256:digest(raw),count:chats.length};
  }
  fs.mkdirSync(output,{recursive:true});for(const [name,body] of Object.entries(result))fs.writeFileSync(path.join(output,name),body);
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(metadata,null,2)+'\n');return metadata;
}
if(process.argv[1]===new URL(import.meta.url).pathname){const [corpus,output]=process.argv.slice(2);if(!corpus||!output)throw Error('corpus output required');const r=await prepare(corpus,output);console.log(JSON.stringify({output,counts:Object.fromEntries(Object.entries(r.files).map(([k,v])=>[k,v.count])),modelCalls:0}));}
