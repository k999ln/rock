// Synthetic owners against one immutable local Worker build. No external services.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { copyWorkerBuildFixture } from './worker-build-fixture.mjs';
const root=process.cwd(),state=mkdtempSync(join(tmpdir(),'rock-agent-shares-')),build=join(state,'dist');copyWorkerBuildFixture(join(root,'dist'),build);
const dir=join(build,'server'),config=JSON.parse(readFileSync(join(dir,'wrangler.json'),'utf8'));
let assertions=0,externalCalls=0,modelCalls=0,metadataCalls=0,roleInstructions='';
const check=(actual,expected)=>{assert.deepEqual(actual,expected);assertions++};
async function outbound(request){
 const u=new URL(request.url);
 if(u.hostname==='127.0.0.1'&&u.port==='11434'){
  if(u.pathname==='/api/tags'){metadataCalls++;return Response.json({models:[{name:'fixture:1',digest:'a'.repeat(64),size:1e9}]})}
  if(u.pathname==='/api/chat'){
   const body=await request.json();check(body.model,'fixture:1');check(body.stream,false);check(body.options.num_predict,600);
   const prompt=body.messages.find(m=>m.role==='user').content;check(prompt.includes(roleInstructions),true);check(body.messages.find(m=>m.role==='system').content.includes(roleInstructions),false);
   const candidate=JSON.parse(prompt.split('\n')[1]);check(candidate.schema,'eve.plan-candidate/1');modelCalls++;
   return Response.json({model:'fixture:1',done:true,done_reason:'stop',message:{role:'assistant',content:JSON.stringify(candidate)},prompt_eval_count:10,eval_count:6});
  }
 }
 externalCalls++;return new Response('External requests forbidden',{status:503});
}
function runtime(){return new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:join(state,'db'),workers:[{name:config.name,rootPath:dir,modules:[config.main,...readdirSync(dir,{recursive:true,encoding:'utf8'}).filter(p=>p!==config.main&&!p.split('/').some(s=>s.startsWith('._'))&&/\.m?js$/.test(p))].map(p=>({type:'ESModule',path:resolve(dir,p)})),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:{...config.vars,ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID:'',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'false',EVE_HISTORY_KEYRING:JSON.stringify({current:'fixture',keys:{fixture:'12'.repeat(32)}})},d1Databases:{DB:'agent-shares-fixture'},r2Buckets:['BUCKET'],outboundService:outbound}]}));}
let mf=runtime();
async function api(path,method='GET',input,options={}){
 const owner=options.owner===undefined?'alice':options.owner;
 const response=await mf.dispatchFetch('http://localhost'+path,{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),origin:options.origin??'http://localhost','content-type':'application/json','x-sky-owner':options.expectedOwner??owner??'',...options.headers},...(input===undefined?{}:{body:options.raw?input:JSON.stringify(input)})});
 const data=await response.json();check(response.status,options.status??200);check(response.headers.get('cache-control'),'no-store');return data;
}
const endpoint='/api/sky/agent-shares',settings={name:'合成の引用整理担当',instructions:'出典URLを保持して短く整理する。未知の内容を確認済みとしない。',provider:'ollama',model:'fixture:1',enabled:true};
async function publish(agent,owner='alice'){
 const draft=await api(endpoint,'POST',{action:'preview',agentId:agent.id,description:'fixture: 自分の資料に使う担当',communityId:null},{owner});
 return api(endpoint,'POST',{action:'publish',agentId:agent.id,agentRevision:draft.agentRevision,description:draft.manifest.description,communityId:null,expectedVersion:draft.expectedVersion,digest:draft.digest,license:draft.manifest.license,approve:true},{owner});
}
const addInput=p=>({action:'add',id:p.manifest.id,version:p.manifest.version,digest:p.digest,provider:'ollama',model:'fixture:1',approve:true});
try{
 await mf.ready;const db=await mf.getD1Database('DB',config.name);
 for(const file of readdirSync(join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync(join(root,'drizzle',file),'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(sql).run();
 await api(endpoint,'POST',{action:'preview'},{owner:null,status:401});
 await api(endpoint,'POST',{}, {origin:'https://other.invalid',status:403});
 await api(endpoint,'POST',{}, {expectedOwner:'bob',status:409});
 await api(endpoint,'POST',{}, {headers:{authorization:'Bearer rock_session_fixture_not_a_browser_session'},status:403});
 await api(endpoint,'POST',{}, {headers:{authorization:'RockEsimProof fixture_not_a_browser_session'},status:403});
 await api(endpoint,'POST',{}, {headers:{authorization:'Bearer rock_esim_fixture_not_a_browser_session'},status:403});
 await api(endpoint,'POST','{bad', {raw:true,status:400});
 await api(endpoint,'POST','x'.repeat(12001),{raw:true,status:413});
 for(const owner of ['alice','bob','carol'])await api('/api/sky/social','POST',{action:'profile',name:`Fixture ${owner}`},{owner});
 const original=(await api('/api/sky/agents','PUT',{id:randomUUID(),revision:0,settings,create:true})).agent;
 await api(endpoint,'POST',{action:'preview',agentId:original.id,description:'fixture',communityId:null},{owner:'bob',status:404});
 const historyBefore=await api(endpoint,'POST',{action:'versions',agentId:original.id,communityId:null});check(historyBefore.versions.length,0);
 const shared=await publish(original);const read=await api(`${endpoint}?id=${shared.manifest.id}&version=1`,'GET',undefined,{owner:'bob'});check(read.digest,shared.digest);
 const authorHistory=await api(endpoint,'POST',{action:'versions',agentId:original.id,communityId:null});check(authorHistory.versions.map(v=>v.version),[1]);check((await api(endpoint,'POST',{action:'versions',agentId:original.id,communityId:null},{owner:'bob'})).versions,[]);
 const postId=randomUUID();const post={action:'post',id:shared.manifest.id,version:1,digest:shared.digest,postId,content:'fixtureの担当を追加できます',approve:true};await api(endpoint,'POST',post);await api(endpoint,'POST',post);
 const timeline=await api('/api/sky/social');check(timeline.posts.filter(p=>p.id===postId).length,1);check(timeline.posts.find(p=>p.id===postId).attachment.kind,'agent-template');
 const imported=await api(endpoint,'POST',addInput(shared),{owner:'bob'});check(imported.agent.enabled,false);check(imported.agent.sourceTool,null);
 const replay=await api(endpoint,'POST',addInput(shared),{owner:'bob'});check(replay.agent.id,imported.agent.id);check(replay.replayed,true);
 await api('/api/sky/agents?id='+imported.agent.id,'GET',undefined,{owner:'carol',status:404});
 const b=(await api('/api/sky/agents','PUT',{id:imported.agent.id,revision:1,settings:{...settings,name:'合成の改善担当',instructions:'日本語で出典URLを保持する',enabled:true}},{owner:'bob'})).agent;
 const derivative=await publish(b,'bob');check(derivative.manifest.parent.digest,shared.digest);
 const c=await api(endpoint,'POST',addInput(derivative),{owner:'carol'});check(c.agent.enabled,false);check(c.agent.instructions,b.instructions);
 // The imported role, actual controlled LLM plan, Tool and result share one WorkJob/thread.
 const workPath='/api/eve/tool-work',threadId=randomUUID(),workInput={jobId:randomUUID(),threadId,objective:'合成資料の引用を整える',source:'本文。（出典: [資料](https://example.com/fixture-source)）',saveMaterial:true,agentSelection:{id:b.id,revision:b.revision},agentToolConsent:true,plannerRequest:{modelLabel:b.model,modelDigest:'a'.repeat(64)}};
 await api(workPath,'POST',{...workInput,agentToolConsent:false},{owner:'bob',status:400});
 await api(workPath,'POST',workInput,{owner:'bob',expectedOwner:'alice',status:409});
 await api(workPath,'POST',{...workInput,agentSelection:{id:original.id,revision:original.revision}},{owner:'bob',status:404});
 let result=await api(workPath,'POST',workInput,{owner:'bob',status:201});check(result.job.eveTool.agentBinding.id,b.id);check(result.job.eveTool.agentBinding.shared.digest,shared.digest);roleInstructions=b.instructions;
 result=await api(workPath,'PATCH',{jobId:result.job.id,revision:result.job.revision,commandId:randomUUID(),action:'planner-claim'},{owner:'bob'});
 const planner={jobId:result.job.id,attemptId:result.job.eveTool.planning.attempts.at(-1).id};
 await api('/api/llm/text','POST',{provider:'ollama',model:'different',prompt:'ignored',evePlanner:planner},{owner:'bob',status:409});check(modelCalls,0);
 const inference=await api('/api/llm/text','POST',{provider:'ollama',model:b.model,prompt:'ignored',evePlanner:planner},{owner:'bob'});check(inference.eveWork.eveTool.planning.status,'proposed');result={job:inference.eveWork};check(modelCalls,1);
 await api('/api/sky/agents','PUT',{id:b.id,revision:b.revision,settings:{...settings,name:b.name,instructions:b.instructions,enabled:false}},{owner:'bob'});
 result=await api(workPath,'PATCH',{jobId:result.job.id,revision:result.job.revision,commandId:randomUUID(),action:'planner-adopt'},{owner:'bob'});
 for(const action of ['advance','advance','complete'])result=await api(workPath,'PATCH',{jobId:result.job.id,revision:result.job.revision,commandId:randomUUID(),action},{owner:'bob'});
 check(result.job.eveTool.agentBinding.revision,b.revision);check(result.job.eveTool.agentBinding.instructions,b.instructions);
 await api(workPath,'POST',{...workInput,jobId:randomUUID(),threadId:randomUUID()},{owner:'bob',status:409});
 check((await api(workPath,'POST',workInput,{owner:'bob',status:201})).job,result.job);check(modelCalls,1);
 check(result.job.status,'completed');check(result.historySaved,true);
 const savedOutput=result.job.composition.artifacts.s1.text;check(savedOutput.includes('https://example.com/fixture-source'),true);
 const history=await api('/api/eve/history?id='+threadId,'GET',undefined,{owner:'bob'});check(history.session.messages.some(m=>m.text.includes(result.job.id)),true);
 // Opt-in outcome publication uses the same completed work; no model/Tool replay.
 const outcomePath='/api/sky/agent-outcomes',reportInput={jobId:result.job.id,jobRevision:result.job.revision,helpful:true};
 await api(outcomePath,'POST',{action:'preview',...reportInput},{owner:null,status:401});
 await api(outcomePath,'POST',{action:'preview',...reportInput},{owner:'bob',origin:'https://other.invalid',status:403});
 await api(outcomePath,'POST',{action:'preview',...reportInput},{owner:'bob',expectedOwner:'alice',status:409});
 await api(outcomePath,'POST',{action:'preview',...reportInput},{owner:'bob',headers:{authorization:'Bearer rock_session_fixture'},status:403});
 await api(outcomePath,'POST',{action:'preview',...reportInput},{owner:'carol',status:404});
 const report=await api(outcomePath,'POST',{action:'preview',...reportInput},{owner:'bob'});
 const staleNo=await api(outcomePath,'POST',{action:'preview',...reportInput,helpful:false},{owner:'bob'});
 const publishReport={action:'publish',...reportInput,digest:report.digest,expected:report.expected,approve:true};
 await api(outcomePath,'POST',{...publishReport,approve:false},{owner:'bob',status:409});
 await api('/api/sky/social','POST',{action:'post',id:randomUUID(),content:'forged outcome',communityId:null,attachment:report.attachment},{owner:'bob',status:400});
 await api(outcomePath,'POST',publishReport,{owner:'bob'});
 const posted=(await api('/api/sky/social','GET',undefined,{owner:'carol'})).posts.find(p=>p.id===report.postId);
 check(posted.attachment.kind,'agent-outcome');check(JSON.stringify(posted).includes(result.job.id),false);check(JSON.stringify(posted).includes('fixture-source'),false);check(JSON.stringify(posted).includes(b.instructions),false);
 const summaryQuery=outcomePath+'?id='+shared.manifest.id+'&version=1';
 check((await api(summaryQuery,'GET',undefined,{owner:'carol'})).summary,{original:{helpful:0,notHelpful:0},modified:{helpful:1,notHelpful:0}});
 const fromOutcome=await api(endpoint,'POST',addInput(shared),{owner:'carol'});check(fromOutcome.agent.enabled,false);
 await api(outcomePath,'POST',{...publishReport,helpful:false,digest:staleNo.digest,expected:staleNo.expected},{owner:'bob',status:409});
 await api('/api/sky/social','POST',{action:'reaction',id:report.postId,reaction:'like',enabled:true},{owner:'carol'});
 const updated=await api(outcomePath,'POST',{action:'preview',...reportInput,helpful:false},{owner:'bob'});
 await api(outcomePath,'POST',{...publishReport,helpful:false,digest:updated.digest,expected:updated.expected},{owner:'bob'});
 check((await api('/api/sky/social','GET',undefined,{owner:'carol'})).posts.find(p=>p.id===report.postId).likes,0);
 check((await api(summaryQuery,'GET',undefined,{owner:'carol'})).summary.modified,{helpful:0,notHelpful:1});
 const negativeStatus=await api(outcomePath,'POST',{action:'status',postId:report.postId},{owner:'bob'});
 await api(outcomePath,'POST',{action:'withdraw',postId:report.postId,digest:negativeStatus.digest,approve:true},{owner:'bob'});
 check((await api('/api/sky/social','GET',undefined,{owner:'carol'})).posts.some(p=>p.id===report.postId),false);
 await api(outcomePath,'POST',publishReport,{owner:'bob',status:409});
 const republish=await api(outcomePath,'POST',{action:'preview',...reportInput},{owner:'bob'});
 await api(outcomePath,'POST',{...publishReport,digest:republish.digest,expected:republish.expected},{owner:'bob'});
 const reportBefore=await api(outcomePath,'POST',{action:'status',postId:report.postId},{owner:'bob'});
 check(modelCalls,1);
 await api(endpoint,'POST',{action:'withdraw',id:shared.manifest.id,version:1,digest:shared.digest,approve:true});
 await api(endpoint,'POST',addInput(shared),{owner:'carol',status:410});
 check((await api(`${endpoint}?id=${shared.manifest.id}&version=1`)).withdrawn,true);check((await api(endpoint,'POST',{action:'versions',agentId:original.id,communityId:null})).versions[0].withdrawnAt>0,true);
 const installedBefore=(await api('/api/sky/agents?id='+b.id,'GET',undefined,{owner:'bob'})).agent;
 await mf.dispose();mf=runtime();await mf.ready;
 check((await api('/api/sky/agents?id='+b.id,'GET',undefined,{owner:'bob'})).agent,installedBefore);
 check((await api(workPath+'?id='+result.job.id,'GET',undefined,{owner:'bob'})).job,result.job);
 check((await api(endpoint,'POST',addInput(derivative),{owner:'carol'})).agent.id,c.agent.id);
 check(await api(outcomePath,'POST',{action:'status',postId:report.postId},{owner:'bob'}),reportBefore);
 check(externalCalls,0);
 console.log(JSON.stringify({status:'passed',assertions,scope:'immutable built Worker HTTP/D1; synthetic A/B/C; imported Agent role, controlled local LLM plan, citation Tool, verification and encrypted history in the SAME job/thread; opt-in outcome post, private-safe counts, correction/withdrawal/restart; actual browser/Pixel/real model/owner not accepted',immutableWorkerRoot:build,persistence:state,restartPreservedAgentAndWork:true,networkCalls:externalCalls,controlledModelCalls:modelCalls,modelMetadataCalls:metadataCalls,realModelCalls:0,sharedAgentBoundSameJob:true,optInOutcomeLoop:true,newDeviceGrants:0,payments:0,outputSha256:createHash('sha256').update(savedOutput).digest('hex')}));
}finally{await mf.dispose()}
