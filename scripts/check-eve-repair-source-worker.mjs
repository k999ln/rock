import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,cpSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {copyWorkerBuildFixture} from './worker-build-fixture.mjs';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),index=args.indexOf('--project');assert.ok(index>=0&&args[index+1],'--project required');const root=resolve(args[index+1]),state=mkdtempSync(join(tmpdir(),'eve-repair-worker-')),build=join(state,'dist');copyWorkerBuildFixture(join(root,'dist'),build);
const {sourceSandboxRestoreStatements}=await import(pathToFileURL(join(root,'scripts/sky-monthly-sandbox-db.mjs')));
const dir=join(build,'server'),config=JSON.parse(readFileSync(join(dir,'wrangler.json'),'utf8')),historyKeys={current:'fixture',keys:{fixture:'12'.repeat(32)}},sha=x=>createHash('sha256').update(x).digest('hex');
const inventory=()=>sha(JSON.stringify(readdirSync(dir,{recursive:true,encoding:'utf8'}).filter(p=>/\.(?:m?js|json)$/.test(p)&&!p.split('/').some(v=>v.startsWith('._'))).sort().map(p=>[p,sha(readFileSync(join(dir,p)))]))),workerSha256=inventory();
const sourceFiles=['lib/eve-tool-work.ts','lib/eve-plan-candidate.ts','lib/work-composition-executor.ts','lib/workflow.ts','lib/eve-history.ts','app/api/eve/tool-work/route.ts'];const sourceSha256=Object.fromEntries(sourceFiles.map(p=>[p,sha(readFileSync(join(root,p)))]));let externalCalls=0,citationAdvances=0;
let persistencePath=join(state,'db');
function runtime(){return new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:persistencePath,workers:[{name:config.name,rootPath:dir,modules:[config.main,...readdirSync(dir,{recursive:true,encoding:'utf8'}).filter(p=>p!==config.main&&!p.split('/').some(v=>v.startsWith('._'))&&/\.m?js$/.test(p))].map(p=>({type:'ESModule',path:resolve(dir,p)})),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:{...config.vars,ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID:'local-preview:eval',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'false',ROCKSTAR_LOCAL_MODEL_EVALUATION_MEMORY_BYTES:'8000000000',EVE_HISTORY_KEYRING:JSON.stringify(historyKeys)},d1Databases:{DB:'evaluation-fixture'},r2Buckets:['BUCKET'],outboundService:()=>{externalCalls++;return new Response('No external calls',{status:503});}}]}));}
let mf=runtime();
async function call(path,method,input,{owner='alice',origin='http://localhost',host='http://localhost'}={}){const r=await mf.dispatchFetch(host+path,{method,headers:{origin,'content-type':'application/json','oai-authenticated-user-id':owner},...(input===undefined?{}:{body:JSON.stringify(input)})});return {status:r.status,data:await r.json()};}

async function create(strict=false,short=false){
 const source='合成資料。'.repeat(short?1:1400)+'（出典: [資料](https://example.com/repair)）',id=crypto.randomUUID(),objective='引用整形しリンク先を保持';
 const candidate={schema:'eve.plan-candidate/1',jobId:id,objective,sourceSha256:sha(source),unknowns:[],stopReason:null,nodes:[{id:'s1',tool:'mr-citations',inputs:['source'],config:{}},{id:'s2',tool:'mr-citations',inputs:['source'],config:{}},{id:'s3',tool:'compose-join',inputs:['s1','s2'],config:{}},{id:'s4',tool:'compose-check',inputs:['s3'],config:{minChars:1,requiredText:strict?['素材にない本人の必要条件']:[]}}]};
 const response=await call('/api/eve/tool-work','POST',{jobId:id,threadId:crypto.randomUUID(),objective,source,saveMaterial:true,plannerCandidate:JSON.stringify(candidate)});assert.equal(response.status,201,JSON.stringify(response.data));return response.data.job;
}
async function command(job,action,status=200,request){if(!request&&action==='advance'&&!job.eveTool.pendingFailure&&job.steps.find(s=>!s.passed)?.tool==='mr-citations')citationAdvances++;const input=request??{jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action};const response=await call('/api/eve/tool-work','PATCH',input);assert.equal(response.status,status,JSON.stringify(response.data));return {job:response.data.job,request:input};}
async function restart(){await mf.dispose();mf=runtime();await mf.ready;}
try{
 await mf.ready;const db=await mf.getD1Database('DB',config.name);for(const sql of sourceSandboxRestoreStatements())await db.prepare(sql).run();
 let job=await create();job=(await command(job,'advance')).job;job=(await command(job,'advance')).job;
 const passed=structuredClone(job.composition.artifacts.s1),acceptance=job.composition.plan.acceptance,citationRuns=citationAdvances;
 const failed=await command(job,'advance');job=failed.job;assert.equal(job.eveTool.pendingFailure.code,'output_limit');assert.equal(job.eveTool.pendingFailure.repairable,true);
 assert.deepEqual((await command(job,'advance',200,failed.request)).job,job);
 await restart();assert.deepEqual((await call('/api/eve/tool-work?id='+job.id,'GET')).data.job,job);
 job=(await command(job,'advance')).job;assert.equal(job.eveTool.repairCount,1);assert.equal(job.eveTool.pendingFailure,undefined);assert.deepEqual(job.composition.artifacts.s1,passed);assert.equal(job.composition.plan.acceptance,acceptance);assert.equal(job.composition.plan.budgetMinor,0);
 job=(await command(job,'advance')).job;assert.equal(job.status,'review');assert.ok(job.eveTool.verification.checks.every(c=>c.passed));job=(await command(job,'complete')).job;assert.equal(job.status,'completed');assert.equal(citationAdvances,citationRuns);assert.equal(citationRuns,2);
 const repaired={id:job.id,threadId:job.eveTool.threadId,repairCount:job.eveTool.repairCount,outputSha256:job.eveTool.verification.outputSha256,passedArtifactSha256:sha(passed.text),verification:job.eveTool.verification,failures:job.eveTool.failures,citationAdvanceRequestsBefore:citationRuns,citationAdvanceRequestsAfter:citationAdvances,acceptancePreserved:true,budgetPreserved:true};
 await restart();assert.deepEqual((await call('/api/eve/tool-work?id='+job.id,'GET')).data.job,job);
 let strict=await create(true,true);for(let i=0;i<4;i++)strict=(await command(strict,'advance')).job;assert.equal(strict.eveTool.pendingFailure.code,'verification_failed');assert.equal(strict.eveTool.pendingFailure.repairable,false);const plan=structuredClone(strict.composition.plan);
 await command(strict,'advance',409);await command(strict,'complete',409);const saved=(await call('/api/eve/tool-work?id='+strict.id,'GET')).data.job;assert.deepEqual(saved.composition.plan,plan);assert.equal(saved.eveTool.repairCount??0,0);
 const history=await call('/api/eve/history?id='+strict.eveTool.threadId,'GET');assert.equal(history.status,200);assert.ok(history.data.session.messages.at(-1).text.includes('未達の完成条件: 必須文言'));strict=(await command(strict,'cancel')).job;assert.equal(strict.status,'cancelled');await command(strict,'advance',409);
 assert.equal((await call('/api/eve/tool-work?id='+strict.id,'GET',undefined,{owner:'bob'})).status,404);
 await restart();assert.deepEqual((await call('/api/eve/tool-work?id='+strict.id,'GET')).data.job,strict);assert.equal(inventory(),workerSha256);for(const [p,h] of Object.entries(sourceSha256))assert.equal(sha(readFileSync(join(root,p))),h);assert.equal(externalCalls,0);
 let backupRestore=null;
 if(args.includes('--backup-restore')){
  const completedBefore=(await call('/api/eve/tool-work?id='+job.id,'GET')).data.job;
  const completedHistory=await call('/api/eve/history?id='+job.eveTool.threadId,'GET');
  const cancelledHistory=await call('/api/eve/history?id='+strict.eveTool.threadId,'GET');
  assert.equal(completedHistory.status,200);assert.equal(cancelledHistory.status,200);
  await mf.dispose();
  const originalPath=persistencePath,snapshot=join(state,'offline-snapshot'),restored=join(state,'restored-db');
  const files=base=>Object.fromEntries(readdirSync(base,{recursive:true,encoding:'utf8'}).filter(p=>!p.split('/').some(v=>v.startsWith('._'))).filter(p=>statSync(join(base,p)).isFile()).sort().map(p=>[p,sha(readFileSync(join(base,p)))]));
  const originalHashes=files(originalPath);assert.ok(Object.keys(originalHashes).length>0);
  cpSync(originalPath,snapshot,{recursive:true,errorOnExist:true,force:false});assert.deepEqual(files(snapshot),originalHashes);
  cpSync(snapshot,restored,{recursive:true,errorOnExist:true,force:false});assert.deepEqual(files(restored),originalHashes);
  persistencePath=restored;mf=runtime();await mf.ready;
  assert.deepEqual((await call('/api/eve/tool-work?id='+job.id,'GET')).data.job,completedBefore);
  assert.deepEqual((await call('/api/eve/tool-work?id='+strict.id,'GET')).data.job,strict);
  assert.deepEqual(await call('/api/eve/history?id='+job.eveTool.threadId,'GET'),completedHistory);
  assert.deepEqual(await call('/api/eve/history?id='+strict.eveTool.threadId,'GET'),cancelledHistory);
  assert.equal((await call('/api/eve/tool-work?id='+job.id,'GET',undefined,{owner:'bob'})).status,404);
  assert.equal((await call('/api/eve/history?id='+job.eveTool.threadId,'GET',undefined,{owner:'bob'})).status,404);
  await command(strict,'advance',409);await command(job,'advance',409);
  await mf.dispose();assert.deepEqual(files(originalPath),originalHashes);assert.deepEqual(files(snapshot),originalHashes);
  persistencePath=originalPath;mf=runtime();await mf.ready;
  assert.deepEqual((await call('/api/eve/tool-work?id='+job.id,'GET')).data.job,completedBefore);
  assert.deepEqual((await call('/api/eve/tool-work?id='+strict.id,'GET')).data.job,strict);
  backupRestore={offlineSnapshot:true,freshDestination:true,additionalWorkerRestarts:2,fileCount:Object.keys(originalHashes).length,snapshotInventorySha256:sha(JSON.stringify(originalHashes)),completedJobExact:true,cancelledJobExact:true,encryptedHistoryExact:true,foreignOwnerDenied:true,terminalExecutionDenied:true,originalAndSnapshotUnmodified:true,externalKeyringRequired:true,cloudBackup:false,deviceBackup:false,liveSnapshot:false};
 }
 const proof={status:'passed',scope:'fixed Source Worker/D1 synthetic typed candidate and actual local citation/compose adapters; no LLM, browser, physical or general repair acceptance',workerSha256,sourceSha256,backupRestore,repaired,strict:{id:strict.id,threadId:strict.eveTool.threadId,status:strict.status,criterionNotWeakened:true,completionRejected:true,repairRefused:true,failureVisibleInHistory:true},sameCommandReplayNoRun:true,workerRestarts:3,restartUnchanged:true,realModelCalls:0,externalCalls,publicDeployment:false,physicalAccepted:false,state};writeFileSync(join(state,'proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await mf.dispose();}
