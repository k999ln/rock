import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {copyWorkerBuildFixture} from './worker-build-fixture.mjs';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);assert.ok(i>=0&&args[i+1],name+' required');return args[i+1];};
const root=resolve(arg('--project')),model=arg('--model'),controlled=args.includes('--controlled-incomplete');
const {sourceSandboxRestoreStatements}=await import(pathToFileURL(join(root,'scripts/sky-monthly-sandbox-db.mjs')));
const resume=args.includes('--resume-state'),state=resume?resolve(arg('--resume-state')):mkdtempSync(join(tmpdir(),'eve-real-model-worker-')),build=join(state,'dist');if(!resume)copyWorkerBuildFixture(join(root,'dist'),build);
const dir=join(build,'server'),config=JSON.parse(readFileSync(join(dir,'wrangler.json'),'utf8')),historyKeys={current:'fixture',keys:{fixture:'12'.repeat(32)}};
const sha=x=>createHash('sha256').update(x).digest('hex'),inventory=()=>sha(JSON.stringify(readdirSync(dir,{recursive:true,encoding:'utf8'}).filter(p=>/\.(?:m?js|json)$/.test(p)&&!p.split('/').some(v=>v.startsWith('._'))).sort().map(p=>[p,sha(readFileSync(join(dir,p)))]))),workerSha256=inventory();
const inputs=['lib/sky-model-measured-selection.ts','lib/sky-model-evaluation.ts','lib/sky-model-selector.ts','lib/llm-providers.ts','app/api/llm/evaluate/route.ts','app/api/llm/select/route.ts','scripts/sky-monthly-sandbox-db.mjs'];
const sourceSha256=Object.fromEntries(inputs.map(p=>[p,sha(readFileSync(join(root,p)))]));
let modelCalls=0,metadataCalls=0,externalCalls=0;
const diagnostics=[],callLimit=args.includes('--diagnostic-once')?1:3;
const saveDiagnostics=()=>writeFileSync(join(state,'transport-diagnostics.json'),JSON.stringify(diagnostics,null,2)+'\n',{mode:0o600});
const fixtureTags={models:[{name:model,digest:'a'.repeat(64),size:1e9}]};
const tags=controlled?fixtureTags:await (await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(5000)})).json(),installed=tags.models.find(m=>m.name===model);assert.ok(installed,'Requested installed model required');const digest=installed.digest;
async function outbound(request){
 const url=new URL(request.url);
 if(url.origin!=='http://127.0.0.1:11434'||!['/api/tags','/api/show','/api/chat'].includes(url.pathname)){externalCalls++;return new Response('External calls forbidden',{status:503});}
 const body=request.method==='GET'?undefined:await request.text();let requestedProtocol;
 if(url.pathname==='/api/chat'){const value=JSON.parse(body);assert.equal(value.model,model);assert.equal(value.options.num_predict,600);assert.equal(value.stream,false);requestedProtocol={jsonOutput:value.format==='json',thinkingDisabled:value.think===false};assert.ok(!resume,'Resume cannot start inference');assert.ok(modelCalls<callLimit,'Diagnostic call limit');modelCalls++;}
 else{metadataCalls++;if(url.pathname==='/api/show')assert.equal(JSON.parse(body).model,model);}
 if(controlled){
  if(url.pathname==='/api/tags')return Response.json(fixtureTags);
  if(url.pathname==='/api/show')return Response.json({model_info:{'fixture.context_length':8192},capabilities:['completion']});
  return Response.json({model,done:true,done_reason:'length',message:{role:'assistant',content:'unusable truncated fixture'},prompt_eval_count:14,eval_count:600});
 }
 try{
  const response=await fetch(url,{method:request.method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body}),signal:AbortSignal.timeout(45000),redirect:'error'});
  if(url.pathname==='/api/chat'){
   const value=await response.clone().json(),counter=n=>Number.isSafeInteger(n)&&n>=0?n:null;
   diagnostics.push({requestedProtocol,status:response.status,done:typeof value.done==='boolean'?value.done:null,doneReason:['stop','length','load'].includes(value.done_reason)?value.done_reason:'other',contentCharacters:typeof value.message?.content==='string'?value.message.content.length:null,thinkingCharacters:typeof value.message?.thinking==='string'?value.message.thinking.length:null,outputSha256:typeof value.message?.content==='string'?sha(value.message.content):null,inputTokens:counter(value.prompt_eval_count),outputTokens:counter(value.eval_count)});saveDiagnostics();
  }
  return response;
 }catch(error){if(url.pathname==='/api/chat'){diagnostics.push({transportFailure:['TimeoutError','AbortError','TypeError'].includes(error?.name)?error.name:'other'});saveDiagnostics();}throw error;}
}

function runtime(){return new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:join(state,'db'),workers:[{name:config.name,rootPath:dir,modules:[config.main,...readdirSync(dir,{recursive:true,encoding:'utf8'}).filter(p=>p!==config.main&&!p.split('/').some(v=>v.startsWith('._'))&&/\.m?js$/.test(p))].map(p=>({type:'ESModule',path:resolve(dir,p)})),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:{...config.vars,ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID:'local-preview:eval',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'false',ROCKSTAR_LOCAL_MODEL_EVALUATION_MEMORY_BYTES:'8000000000',EVE_HISTORY_KEYRING:JSON.stringify(historyKeys)},d1Databases:{DB:'evaluation-fixture'},r2Buckets:['BUCKET'],outboundService:outbound}]}));}
let mf=runtime();
async function call(path,method,input,{owner='alice',origin='http://localhost',host='http://localhost'}={}){const r=await mf.dispatchFetch(host+path,{method,headers:{origin,'content-type':'application/json','oai-authenticated-user-id':owner},...(input===undefined?{}:{body:JSON.stringify(input)})});return {status:r.status,data:await r.json()};}
async function create(){const result=await call('/api/eve/tool-work','POST',{jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),objective:'引用を整理',source:'本文 [資料](https://example.com/test)',saveMaterial:true});assert.equal(result.status,201,JSON.stringify(result.data));return result.data.job;}
try{
 await mf.ready;const db=await mf.getD1Database('DB',config.name);if(!resume)for(const sql of sourceSandboxRestoreStatements())await db.prepare(sql).run();
 const job=resume?(await call('/api/eve/tool-work?id='+arg('--resume-job'),'GET')).data.job:await create(),previous=resume?job.modelEvaluations.runs.at(-1):null,input={jobId:job.id,revision:job.revision,runId:previous?.id??crypto.randomUUID(),task:'planning',model,memoryBudget:8e9};
 assert.equal((await call('/api/llm/evaluate','POST',input,{owner:'bob'})).status,404);
 assert.equal((await call('/api/llm/evaluate','POST',input,{origin:'https://outside.invalid'})).status,403);
 assert.equal((await call('/api/llm/evaluate','POST',input,{host:'https://avoado.si',origin:'https://avoado.si'})).status,404);
 assert.equal((await call('/api/llm/evaluate','POST',{...input,report:{quality:100}})).status,400);
 assert.equal(modelCalls,0);assert.equal(metadataCalls,0);
 writeFileSync(join(state,'evaluation-handle.json'),JSON.stringify({project:root,jobId:job.id,input,workerSha256,model,digest},null,2)+'\n',{mode:0o600});
 const result=await call('/api/llm/evaluate','POST',input);assert.equal(result.status,200,JSON.stringify(result.data));
 assert.ok(['observed','partial'].includes(result.data.run.state));assert.ok(result.data.run.rows.length>0);assert.ok(resume?modelCalls===0:modelCalls>0&&modelCalls<=3);
 const selectionInput={prompt:'コードの計画を確認',allowCloud:false,allowedModels:[{provider:'ollama',model}],evaluation:{jobId:job.id,task:'planning',memoryBudget:8e9}};
 const selected=await call('/api/llm/select','POST',selectionInput),quality=result.data.run.report?.measurement.quality??null;
 if(selected.status===200){assert.equal(selected.data.selection.model,model);assert.equal(selected.data.selection.digest,digest);assert.ok(quality>=95);}
 else{assert.equal(selected.status,409);assert.equal(selected.data.selection,null);}
 const callsBeforeReplay=modelCalls;assert.equal((await call('/api/llm/evaluate','POST',input)).data.replayed,true);assert.equal(modelCalls,callsBeforeReplay);
 await mf.dispose();mf=runtime();await mf.ready;assert.deepEqual((await call('/api/eve/tool-work?id='+job.id,'GET')).data.job,result.data.job);assert.equal((await call('/api/llm/evaluate','POST',input)).data.replayed,true);assert.equal(modelCalls,callsBeforeReplay);
 if(controlled){assert.equal(result.data.run.state,'partial');assert.equal(result.data.run.rows[0].outputSha256,null);assert.equal(result.data.run.rows[0].usage.metrics.find(m=>m.meter==='output_tokens').quantity,600);assert.equal(result.data.run.rows[0].usage.metrics.find(m=>m.meter==='input_tokens').quantity,14);}
 const after=controlled?fixtureTags:await (await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(5000)})).json();assert.equal(after.models.find(m=>m.name===model)?.digest,digest);assert.equal(externalCalls,0);assert.equal(inventory(),workerSha256);
 for(const [p,h] of Object.entries(sourceSha256))assert.equal(sha(readFileSync(join(root,p))),h);
 let fixedRecipe=null;
 if(args.includes('--finish-fixed-recipe')){
  assert.ok(resume,'Finish only an existing explicitly selected synthetic job');
  assert.equal(selected.status,409,'Do not label this as model adoption');
  let work=(await call('/api/eve/tool-work?id='+job.id,'GET')).data.job;
  assert.equal(work.eveTool.planning,undefined,'Baseline is a fixed recipe, not an adopted model plan');
  const evaluationBefore=JSON.stringify(work.modelEvaluations),steps=work.steps.length;
  for(let i=0;i<steps&&work.status==='active';i++){
   const next=await call('/api/eve/tool-work','PATCH',{jobId:work.id,revision:work.revision,commandId:crypto.randomUUID(),action:'advance'});assert.equal(next.status,200,JSON.stringify(next.data));work=next.data.job;
  }
  assert.equal(work.status,'review');assert.ok(work.eveTool.verification.checks.every(c=>c.passed));
  const finished=await call('/api/eve/tool-work','PATCH',{jobId:work.id,revision:work.revision,commandId:crypto.randomUUID(),action:'complete'});assert.equal(finished.status,200);work=finished.data.job;assert.equal(work.status,'completed');
  assert.equal(JSON.stringify(work.modelEvaluations),evaluationBefore);
  const history=await call('/api/eve/history?id='+work.eveTool.threadId,'GET');assert.equal(history.status,200);assert.ok(history.data.session.messages.some(m=>m.text.includes(work.id)&&m.text.includes('検査済み・完了')));
  await mf.dispose();mf=runtime();await mf.ready;assert.deepEqual((await call('/api/eve/tool-work?id='+work.id,'GET')).data.job,work);assert.deepEqual((await call('/api/eve/history?id='+work.eveTool.threadId,'GET')).data,history.data);
  assert.equal(modelCalls,0);
  fixedRecipe={explicitOperatorChoice:true,modelAutomaticallyAdopted:false,actualCitationTool:true,status:work.status,verification:work.eveTool.verification,steps:work.steps.map(s=>({tool:s.tool,passed:s.passed})),sameJobId:work.id,sameThreadId:work.eveTool.threadId,evaluationPreserved:true,historySaved:true,secondWorkerRestartUnchanged:true,additionalInference:0};
 }
 const proof={status:'passed',scope:fixedRecipe?'fixed Source Worker/D1, stored real local evaluation and explicit fixed citation Tool continuation; not adopted model plan, browser or physical acceptance':controlled?'fixed Source Worker/D1 and controlled truncated response; not real model, Tool, browser or physical acceptance':'fixed Source Worker/D1 with synthetic owner and actual installed local Ollama; evaluation persistence and eligibility, not Tool/physical/browser acceptance',fixedRecipe,controlledIncomplete:controlled,realModel:!controlled,diagnostics,callLimit,project:root,workerSha256,sourceSha256,model,digest,quality,selected:selected.status===200,run:result.data.run,jobId:job.id,modelCalls,metadataCalls,externalCalls,resumedExistingRun:resume,runComplete:result.data.run.report?.complete??false,inferenceResponseConfirmed:result.data.run.rows.some(r=>r.outputSha256!==null),restartUnchanged:true,replayNoInference:true,weightsDownloaded:false,publicDeployment:false,physicalAccepted:false,state};
 writeFileSync(join(state,'proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));

}finally{await mf.dispose();}
