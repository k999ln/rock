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
const inputs=['lib/eve-planner-inference.ts','lib/eve-plan-candidate.ts','lib/eve-planner-state.ts','lib/eve-tool-work.ts','lib/workflow.ts','app/api/eve/tool-work/route.ts','app/api/llm/text/route.ts','lib/sky-model-measured-selection.ts','lib/sky-model-evaluation.ts','lib/sky-model-selector.ts','lib/llm-providers.ts','app/api/llm/evaluate/route.ts','app/api/llm/select/route.ts','scripts/sky-monthly-sandbox-db.mjs'];
const sourceSha256=Object.fromEntries(inputs.map(p=>[p,sha(readFileSync(join(root,p)))]));
let modelCalls=0,metadataCalls=0,externalCalls=0,stopBeforeDeliveryJob=null,cancellationSaved=false;
const diagnostics=[],callLimit=1;
const saveDiagnostics=()=>writeFileSync(join(state,'transport-diagnostics.json'),JSON.stringify(diagnostics,null,2)+'\n',{mode:0o600});
const fixtureTags={models:[{name:model,digest:'a'.repeat(64),size:1e9}]};
const tags=controlled?fixtureTags:await (await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(5000)})).json(),installed=tags.models.find(m=>m.name===model);assert.ok(installed,'Requested installed model required');const digest=installed.digest;
async function outbound(request){
 const url=new URL(request.url);
 if(url.origin!=='http://127.0.0.1:11434'||!['/api/tags','/api/show','/api/chat'].includes(url.pathname)){externalCalls++;return new Response('External calls forbidden',{status:503});}
 const body=request.method==='GET'?undefined:await request.text();let requestedProtocol;
 if(url.pathname==='/api/chat'){const value=JSON.parse(body);assert.equal(value.model,model);assert.equal(value.options.num_predict,600);assert.equal(value.stream,false);requestedProtocol={jsonOutput:value.format==='json',structuredOutput:!!value.format&&typeof value.format==='object',thinkingDisabled:value.think===false};assert.ok(!resume,'Resume cannot start inference');assert.ok(modelCalls<callLimit,'Diagnostic call limit');modelCalls++;}
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
  if(url.pathname==='/api/chat'&&args.includes('--stop-before-delivery')){
   assert.ok(stopBeforeDeliveryJob);const saved=await call('/api/eve/tool-work?id='+stopBeforeDeliveryJob,'GET');assert.equal(saved.status,200);
   const cancelled=await call('/api/eve/tool-work','PATCH',{jobId:stopBeforeDeliveryJob,revision:saved.data.job.revision,commandId:crypto.randomUUID(),action:'cancel'});assert.equal(cancelled.status,200);assert.equal(cancelled.data.job.status,'cancelled');cancellationSaved=true;
  }
  return response;
 }catch(error){if(url.pathname==='/api/chat'){diagnostics.push({transportFailure:['TimeoutError','AbortError','TypeError'].includes(error?.name)?error.name:'other'});saveDiagnostics();}throw error;}
}

function runtime(){return new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:join(state,'db'),workers:[{name:config.name,rootPath:dir,modules:[config.main,...readdirSync(dir,{recursive:true,encoding:'utf8'}).filter(p=>p!==config.main&&!p.split('/').some(v=>v.startsWith('._'))&&/\.m?js$/.test(p))].map(p=>({type:'ESModule',path:resolve(dir,p)})),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:{...config.vars,ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID:'local-preview:eval',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'false',ROCKSTAR_LOCAL_MODEL_EVALUATION_MEMORY_BYTES:'8000000000',EVE_HISTORY_KEYRING:JSON.stringify(historyKeys)},d1Databases:{DB:'evaluation-fixture'},r2Buckets:['BUCKET'],outboundService:outbound}]}));}
let mf=runtime();
async function call(path,method,input,{owner='alice',origin='http://localhost',host='http://localhost'}={}){const r=await mf.dispatchFetch(host+path,{method,headers:{origin,'content-type':'application/json','oai-authenticated-user-id':owner},...(input===undefined?{}:{body:JSON.stringify(input)})});return {status:r.status,data:await r.json()};}

try{
 assert.equal(resume,false,'This gate never automatically repeats an old planner attempt');assert.equal(controlled,false,'Real installed model required');
 await mf.ready;const db=await mf.getD1Database('DB',config.name);for(const sql of sourceSandboxRestoreStatements())await db.prepare(sql).run();
 const created=await call('/api/eve/tool-work','POST',{jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),objective:'原稿内の引用を出典欄へ整理し、リンク先を保持する',source:'合成原稿です。（出典: [一次資料](https://example.com/planner-source-wire)）',saveMaterial:true,plannerRequest:{modelLabel:model,modelDigest:digest}});assert.equal(created.status,201,JSON.stringify(created.data));let job=created.data.job;
 const command=async(action)=>{const value=await call('/api/eve/tool-work','PATCH',{jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action});assert.equal(value.status,200,JSON.stringify(value.data));job=value.data.job;};
 assert.equal((await call('/api/eve/tool-work','PATCH',{jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action:'advance'})).status,409);assert.equal(modelCalls,0);
 await command('planner-claim');stopBeforeDeliveryJob=job.id;const attemptId=job.eveTool.planning.attempts.at(-1).id;
 const input={provider:'ollama',model,prompt:'[合成試験] 保存済みの目的から計画候補を作る',evePlanner:{jobId:job.id,attemptId}};
 writeFileSync(join(state,'planner-handle.json'),JSON.stringify({jobId:job.id,threadId:job.eveTool.threadId,attemptId,model,digest,workerSha256,input},null,2)+'\n',{mode:0o600});
 const inferred=await call('/api/llm/text','POST',input);assert.equal(inferred.status,200,JSON.stringify(inferred.data));job=inferred.data.eveWork;
 assert.equal(modelCalls,1);assert.equal(Object.keys(job.composition.artifacts).length,0);const accepted=job.eveTool.planning.status==='proposed';
 assert.equal((await call('/api/llm/text','POST',input)).status,409);assert.equal(modelCalls,1);
 await mf.dispose();mf=runtime();await mf.ready;assert.deepEqual((await call('/api/eve/tool-work?id='+job.id,'GET')).data.job,job);
 let execution=null;
 if(accepted){
  await command('planner-adopt');const limit=job.steps.length;
  for(let i=0;i<limit&&job.status==='active';i++)await command('advance');
  assert.equal(job.status,'review');assert.ok(job.eveTool.verification.checks.every(c=>c.passed));await command('complete');assert.equal(job.status,'completed');
  const history=await call('/api/eve/history?id='+job.eveTool.threadId,'GET');assert.equal(history.status,200);assert.ok(history.data.session.messages.some(m=>m.text.includes(job.id)&&m.text.includes('検査済み・完了')));
  await mf.dispose();mf=runtime();await mf.ready;assert.deepEqual((await call('/api/eve/tool-work?id='+job.id,'GET')).data.job,job);assert.deepEqual((await call('/api/eve/history?id='+job.eveTool.threadId,'GET')).data,history.data);
  execution={status:job.status,planner:job.eveTool.planner,steps:job.steps.map(s=>({tool:s.tool,passed:s.passed})),verification:job.eveTool.verification,historyReadback:true,secondRestartUnchanged:true};
 }else{
  assert.equal((await call('/api/eve/tool-work','PATCH',{jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action:'advance'})).status,409);
 }
 let stopGate=null;if(args.includes('--stop-before-delivery')){assert.equal(cancellationSaved,true);assert.equal(job.status,'cancelled');assert.equal(accepted,false);assert.equal(job.eveTool.planning.candidate,undefined);const usage=job.eveTool.planning.attempts.at(-1).inference.usage;assert.ok(usage);assert.ok(usage.metrics.find(m=>m.meter==='output_tokens').quantity>0);stopGate={cancelBeforeDelivery:true,modelResponseAlreadyCompleted:true,candidateWithheld:true,usagePreserved:true,noToolArtifacts:true,jobCancelled:true,notPhysicalOrProviderStop:true};}
 assert.equal(modelCalls,1);assert.equal(externalCalls,0);assert.equal(inventory(),workerSha256);for(const [p,h] of Object.entries(sourceSha256))assert.equal(sha(readFileSync(join(root,p))),h);
 const proof={status:'passed',candidateAccepted:accepted,execution,stopGate,scope:'fixed Source Worker/D1 synthetic owner with explicitly selected actual local planner model and bounded citation Tool; not measured automatic model adoption, browser, physical or general planning acceptance',project:root,workerSha256,sourceSha256,model,digest,jobId:job.id,threadId:job.eveTool.threadId,planning:job.eveTool.planning,diagnostics,modelCalls,metadataCalls,externalCalls,candidateDidNotExecuteTools:true,repeatedInferenceRejected:true,restartUnchanged:true,newModelDownload:false,cloudFallback:false,physicalAccepted:false,publicDeployment:false,state};
 writeFileSync(join(state,'proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await mf.dispose();}
