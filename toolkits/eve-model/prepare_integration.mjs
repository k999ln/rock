// Capture real pure planner inputs. No model generation or external Tool effects.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {runZemaLocalAgent,parseZemaLocalAgentReply,executeZemaLocalAgentTool} from '../../lib/zema-local-agent.ts';
export const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
export const canonical=x=>JSON.stringify(sorted(x));
export function serializeReply(value){
 const reply=parseZemaLocalAgentReply(JSON.stringify(value));
 return JSON.stringify(reply.action==='respond'?{schema:reply.schema,action:reply.action,message:reply.message}:{schema:reply.schema,action:reply.action,tool:reply.tool,arguments:reply.arguments,reason:reply.reason});
}
export async function integrationChat(task,{ordered=false,afterSuccess=false,finalReply}={}){
 const targetText=ordered?serializeReply(task.target):canonical(task.target);
 parseZemaLocalAgentReply(targetText);
 const request=task.request+'\n資料（データ）:\n'+JSON.stringify(task.materials);
 let captured=null,artifact=null;
 if(task.setupToolFailure){
  let code;try{executeZemaLocalAgentTool(task.setupToolFailure.tool,task.setupToolFailure.arguments);}catch(error){code=error.code;}
  if(code!=='INVALID_TOOL_ARGUMENTS'||task.observedToolFailure?.output?.error!==code)throw Error('real past repair rejection required');
 }
 if(afterSuccess){
  if(task.target.action!=='tool'||typeof finalReply!=='function')throw Error('after-success requires actual Tool and grounded final reply');
  artifact=executeZemaLocalAgentTool(task.target.tool,task.target.arguments);
  if(!artifact?.content||artifact.tool!==task.target.tool)throw Error('successful actual Tool artifact required');
 }
 const toolStep=task.setupToolFailure?2:1,stop=Error('offline planner input capture');
 try{await runZemaLocalAgent({request,maxSteps:3,planner:async input=>{
  if(task.setupToolFailure&&input.step===1)return serializeReply({schema:'zema-local-agent/1',action:'tool',...task.setupToolFailure,reason:'Real invalid-argument preparation only'});
  if(afterSuccess&&input.step===toolStep)return targetText;
  captured=input;throw stop;
 }});}catch(error){if(error!==stop)throw error;}
 if(!captured||captured.step!==toolStep+(afterSuccess?1:0)||!captured.prompt.startsWith('利用者の依頼:\n'+request+'\n\nこれまでのTool結果:'))throw Error('unchanged real integration input required');
 if(task.setupToolFailure&&!captured.prompt.includes('INVALID_TOOL_ARGUMENTS'))throw Error('past rejection lost');
 if(artifact&&!captured.prompt.includes(artifact.tool+'\n'+artifact.content))throw Error('actual successful Tool artifact missing or truncated');
 const reply=afterSuccess?finalReply(artifact):task.target;
 if(afterSuccess&&reply?.action!=='respond')throw Error('after-success final respond required');
 const replyText=ordered?serializeReply(reply):canonical(reply);
 return {messages:[{role:'system',content:captured.system},{role:'user',content:captured.prompt},{role:'assistant',content:replyText}],
  identity:{id:task.id,taskSha256:digest(canonical(task)),step:captured.step,sourceCount:task.materials.length,requestSha256:digest(request),promptSha256:digest(captured.prompt),systemSha256:digest(captured.system),...(ordered?{targetSha256:digest(replyText),stage:afterSuccess?'after_success':'first_step',actualTool:artifact?{tool:artifact.tool,content:artifact.content,contentSha256:digest(artifact.content)}:null}:{})}};
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
if(process.argv[1]===new URL(import.meta.url).pathname){const [corpus,output]=process.argv.slice(2);if(!corpus||!output)throw Error('corpus output required');console.log(JSON.stringify({output,...await prepare(corpus,output)}));}
