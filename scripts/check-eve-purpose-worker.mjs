// Private real Worker/D1 wire acceptance. All users, credentials, inputs and model outputs are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:https';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {mkdir,chmod} from 'node:fs/promises';
import {startPixelRuntimeBridge} from './sky-linux-runtime-bridge.mjs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {copyWorkerBuildFixture} from './worker-build-fixture.mjs';
import {pixelPortableFixture} from '../tests/helpers/pixel-portable-fixture.mjs';
import {createPurposeRuntimeEveWorkPort,purposeEvePendingKey} from '../lib/eve-purpose-runtime-work-port.ts';
import {createEveInteractionSession} from '../lib/rockstar-eve-interaction.ts';
import {describeAdapter} from '../lib/rockstar-adapters.ts';
import {runtimeEveTextExport} from '../lib/eve-runtime-export.ts';
import {linkedDigest} from '../lib/rockstar-linked-execution.ts';
const exec=promisify(execFile),args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);assert.ok(i>=0&&args[i+1],name+' is required');return resolve(args[i+1]);};
const javaHome=option('--java-home'),jsonJar=option('--json-jar'),expiryMissing=args.includes('--expiry-missing'),expiryTest=args.includes('--expiry')||expiryMissing;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
void test('purpose creation crosses actual Worker/auth/D1/library/manager, preserves restart and stops exact execution', {timeout:expiryTest?240000:120000},async t=>{
 const root=process.cwd(),workerInput=args.includes('--worker-build')?option('--worker-build'):join(root,'dist'),workerProject=resolve(workerInput,'..'),state=mkdtempSync(join(tmpdir(),'eve-purpose-worker-')),build=join(state,'dist');copyWorkerBuildFixture(workerInput,build);
 const dir=join(build,'server'),config=JSON.parse(readFileSync(join(dir,'wrangler.json'),'utf8')),linux=await pixelPortableFixture(t);
 const inventory=()=>sha(JSON.stringify(readdirSync(dir,{recursive:true,encoding:'utf8'}).filter(f=>!f.split('/').some(s=>s.startsWith('._'))&&/\.(?:m?js|json)$/.test(f)).sort().map(f=>[f,sha(readFileSync(join(dir,f)))])));
 const workerInventorySha256=inventory(),sourcePaths=['lib/eve-runtime-export.ts','components/eve-sync-workspace.tsx','toolkits/sky-linux-local/runtime-lock.json','tests/helpers/pixel-portable-fixture.mjs','scripts/check-eve-purpose-worker.mjs','lib/eve-purpose-runtime-work-port.ts','lib/eve-runtime-work-port.ts','lib/rockstar-eve-interaction.ts','lib/eve-agent-preparation-sync.ts','lib/eve-runtime-sync.ts','app/api/eve/runtime/route.ts','app/api/sky/agents/route.ts','lib/sky-agent-library-store.ts','lib/request-auth.ts','lib/rockstar-device-link.ts','scripts/sky-linux-local-runtime.mjs','scripts/sky-linux-runtime-bridge.mjs','toolkits/sky-linux-local/owner-host-tests/dev/rock/shell/EvePortableHostProbe.java',...['EvePortableAgentPreparation','EvePortableCommands','EvePortableClaimJournal','PixelPortableBridgeProtocol','EvePortableController','EvePortableHttpClient'].map(n=>'toolkits/sky-linux-local/common-ui-src/'+n+'.java')];
 const sourceSha256=Object.fromEntries(sourcePaths.map(p=>[p,sha(readFileSync(p))]));
 const workerSourceSha256=Object.fromEntries(sourcePaths.filter(p=>p.startsWith('lib/')||p.startsWith('app/')||p.startsWith('components/')).map(p=>[p,sha(readFileSync(join(workerProject,p)))]));

 let mf,externalCalls=0,assertions=0,registrationCalls=0,lostEnqueue=false,droppedEnqueueResponses=0,loseRegistration=false,lostRegistrationResponses=0,nativeProcesses=0;
 const check=(a,b)=>{assert.deepEqual(a,b);assertions++;};
 function runtime(){return new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:join(state,'db'),workers:[{name:config.name,rootPath:dir,modules:[config.main,...readdirSync(dir,{recursive:true,encoding:'utf8'}).filter(p=>p!==config.main&&!p.split('/').some(s=>s.startsWith('._'))&&/\.m?js$/.test(p))].map(p=>({type:'ESModule',path:resolve(dir,p)})),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:{...config.vars,ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID:'',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'false',EVE_HISTORY_KEYRING:JSON.stringify({current:'fixture',keys:{fixture:'12'.repeat(32)}})},d1Databases:{DB:'purpose-runtime-fixture'},r2Buckets:['BUCKET'],outboundService:()=>{externalCalls++;return new Response('External calls forbidden',{status:503})}}]}));}
 mf=runtime();t.after(async()=>{await mf.dispose();});await mf.ready;
 let db=await mf.getD1Database('DB',config.name);
 const restoredSchema=args.includes('--source-restored-schema');
 if(restoredSchema){
  assert.ok(args.includes('--worker-build'),'Source restored fixture requires explicit worker build');
  const {sourceSandboxRestoreStatements}=await import(pathToFileURL(join(workerProject,'scripts/sky-monthly-sandbox-db.mjs')).href);
  for(const sql of sourceSandboxRestoreStatements())await db.prepare(sql).run();
 }else{
 for(const file of readdirSync(join(workerProject,'drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync(join(workerProject,'drizzle',file),'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(sql).run();
 }

 async function call(path,{method='GET',value,owner='alice',token,status=200,origin='http://localhost',headers={}}={}){
  const response=await mf.dispatchFetch('http://localhost'+path,{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),...(token?{authorization:'Bearer '+token}:{}),origin,'content-type':'application/json',...headers},...(value===undefined?{}:{body:JSON.stringify(value)})});
  const body=await response.json();if(response.status!==status)console.error(JSON.stringify({stage:path.split('?')[0],method,status:response.status,expectedStatus:status,error:body.error}));check(response.status,status);return body;
 }
 async function link(owner){const p='/api/rockstar/device-authorizations',auth=await call(p,{method:'POST',owner:null,status:201,value:{action:'begin',deviceName:'Synthetic purpose host'},headers:{'X-Rockstar-Device-Binding':'owner-device/v1'}});await call(p+'/approve',{method:'POST',owner,value:{action:'approve',userCode:auth.userCode}});const session=await call(p,{method:'POST',owner:null,value:{action:'poll',deviceCode:auth.deviceCode},headers:{'X-Rockstar-Device-Binding':'owner-device/v1'}});check(session.status,'authorized');assert.match(session.accessToken,/^rock_session_[A-Za-z0-9_-]{43}$/);return session;}
 const device=await link('alice'),other=await link('alice');
 const deviceCall=(value,query='')=>call('/api/eve/runtime'+query,{method:value?'PUT':'GET',value:value??undefined,owner:null,token:device.accessToken});
 function presence(){const s=linux.manager.snapshot();return {schema:'rockstaros.runtime-presence/1',name:'Synthetic production-manager host',phase:'ready',host:describeAdapter('purpose-host','host','android',{'identity.owner-local':true,'store.cas':true,'agent.prepare':true}),executor:describeAdapter('pixel-linux-gguf','executor','linux',{'text.generate':true,'model.pin':true,'execution.stop':true}),output:describeAdapter('purpose-output','output','android',{'output.text':true}),agents:s.agents,models:s.models.map(m=>({id:m.id,name:m.name,scheme:'gguf-sha256',sha256:m.sha256})),preparedModels:s.preparedModels};}
 await deviceCall({action:'presence',presence:presence()});
 await call('/api/eve/runtime?agentPreparations=1',{status:403});
 await call('/api/eve/runtime',{method:'PUT',owner:null,status:401,value:{action:'prepare-agent',request:{}}});
 await call('/api/eve/runtime',{method:'PUT',status:403,origin:'https://foreign.invalid',value:{action:'prepare-agent',request:{}}});
 await call('/api/eve/runtime',{method:'PUT',owner:null,token:device.accessToken,status:403,value:{action:'prepare-agent',request:{}}});
 await call('/api/eve/runtime',{method:'PUT',status:409,headers:{'x-sky-owner':'bob'},value:{action:'prepare-agent',request:{}}});
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);}};
 const classes=join(state,'classes'),socketDir=mkdtempSync(join(process.platform==='darwin'?'/private/tmp':tmpdir(),'epw-')),socketPath=join(socketDir,'runtime.sock'),presenceFile=join(state,'presence.json');await mkdir(classes);
 const sources=['EvePortableAgentPreparation','EvePortableCommands','EvePortableClaimJournal','PixelPortableBridgeProtocol','EvePortableController','EvePortableHttpClient'].map(name=>'toolkits/sky-linux-local/common-ui-src/'+name+'.java');sources.push('toolkits/sky-linux-local/owner-host-tests/dev/rock/shell/EvePortableHostProbe.java');
 await exec(join(javaHome,'bin/javac'),['--release','17','-cp',jsonJar,'-d',classes,...sources]);
 const cert=join(state,'server.pem'),key=join(state,'server.key'),trust=join(state,'trust.p12');
 await exec('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1']);await chmod(key,0o600);
 await exec(join(javaHome,'bin/keytool'),['-importcert','-noprompt','-alias','fixture','-file',cert,'-keystore',trust,'-storetype','PKCS12','-storepass','fixture-only']);
 const server=createServer({cert:readFileSync(cert),key:readFileSync(key)},async(request,response)=>{
  try{assert.ok(request.url.startsWith('/api/eve/runtime'));const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;assert.ok(size<=120000);chunks.push(chunk);}const result=await mf.dispatchFetch(tlsOrigin+request.url,{method:request.method,headers:request.headers,...(request.method==='GET'?{}:{body:Buffer.concat(chunks)})});response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));}
  catch{if(!response.headersSent)response.writeHead(503,{'Content-Type':'application/json'});response.end('{}');}
 });await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});const tlsOrigin='https://127.0.0.1:'+server.address().port;
 const children=[];let bridge,probe;t.after(async()=>{for(const c of children)if(c.exitCode===null&&!c.killed)c.kill('SIGKILL');if(bridge)await bridge.close();server.closeAllConnections();await new Promise(done=>server.close(done));});
 const writePresence=()=>writeFileSync(presenceFile,JSON.stringify(presence()),{mode:0o600});writePresence();
 const manager={snapshot:()=>linux.manager.snapshot(),describeText:()=>linux.manager.describeText(),executeText:(...v)=>linux.manager.executeText(...v),action:v=>linux.manager.action(v),assertExecutionAllowed:()=>linux.manager.assertExecutionAllowed(),prepareTextAgent:async request=>{if(loseRegistration&&expiryMissing){loseRegistration=false;lostRegistrationResponses++;throw Error('Synthetic failure before registration');}const role=await linux.manager.prepareTextAgent(request);registrationCalls++;writePresence();if(loseRegistration){loseRegistration=false;lostRegistrationResponses++;throw Error('Synthetic loss after committed registration');}return role;}};
 bridge=await startPixelRuntimeBridge({manager,socketPath});const aes=randomBytes(32).toString('base64');
 async function openProbe(){
  const child=spawn(join(javaHome,'bin/java'),['-cp',classes+':'+jsonJar,'dev.rock.shell.EvePortableHostProbe'],{stdio:['pipe','pipe','pipe']});children.push(child);nativeProcesses++;
  const pending=[];child.stderr.on('data',()=>{});createInterface({input:child.stdout}).on('line',line=>{const next=pending.shift();if(next)next.resolve(JSON.parse(line));});
  const done=new Promise(resolve=>child.once('exit',(code,signal)=>{for(const p of pending.splice(0))p.reject(Error('Native fixture exited'));resolve({code,signal});}));
  const rpc=body=>{const answer=new Promise((resolve,reject)=>pending.push({resolve,reject}));child.stdin.write(JSON.stringify(body)+'\n');if(body.action==='close')child.stdin.end();return answer;};
  const opened=await rpc({action:'open',origin:tlsOrigin,owner:'alice',device:device.deviceId,authorization:'Bearer '+device.accessToken,key:aes,directory:join(state,'native-journal'),socket:socketPath,trustStore:trust,presenceFile});check(opened.ok,true);return {child,rpc,done};
 }
 probe=await openProbe();
 async function restart(){probe.child.kill('SIGKILL');await probe.done;await bridge.close();await mf.dispose();await linux.reopen();mf=runtime();await mf.ready;db=await mf.getD1Database('DB',config.name);bridge=await startPixelRuntimeBridge({manager,socketPath});writePresence();await deviceCall({action:'presence',presence:presence()});probe=await openProbe();}
 async function register(){writePresence();const result=await probe.rpc({action:'prepare'});if(!result.ok)throw Error('Native registration response unconfirmed');}
 async function api(path,init={}){
  if(path.includes('preparationId=')){try{await register();}catch(error){console.error(JSON.stringify({stage:'registration',error:error.message}));throw error;}}
  const method=init.method??'GET',value=init.body?JSON.parse(init.body):undefined,headers=Object.fromEntries(new Headers(init.headers));
  const response=await mf.dispatchFetch('http://localhost'+path,{method,headers:{'oai-authenticated-user-id':'alice',origin:'http://localhost','content-type':'application/json',...headers},...(value===undefined?{}:{body:JSON.stringify(value)})});
  const result=await response.json();if(!response.ok){if(response.status!==404)console.error(JSON.stringify({stage:path.split('?')[0],method,status:response.status,error:result.error}));throw Object.assign(new Error(result.error??'API request failed'),{status:response.status});}assertions++;if(value?.action==='prepare-agent'&&lostEnqueue){lostEnqueue=false;droppedEnqueueResponses++;throw Error('Synthetic response loss after committed enqueue');}return result;
 }
 const binding={owner:'alice',threadId:crypto.randomUUID(),deviceId:device.deviceId,modelId:linux.model.id,modelSha256:linux.model.sha256,modelScheme:'gguf-sha256'},options={...binding,api,storage,continuing:()=>true,sleep:async()=>{}};
 const work=()=>createPurposeRuntimeEveWorkPort(options),session=createEveInteractionSession({work:work(),pendingKey:purposeEvePendingKey(binding),storage,changed:()=>{}});
 session.arm();session.hearFinal('Hey Eve');session.hearFinal('[合成] 出張の準備を短い文章で確認したい');await session.confirm();assert.equal(session.state.phase,'running',session.state.message);const firstId=session.state.jobId;
 const library=await call('/api/sky/agents');check(library.agents.filter(a=>a.source==='personal').length,1);const newAgent=library.agents.find(a=>a.source==='personal');
 const recover=await call('/api/eve/runtime?preparationThreadId='+binding.threadId);check(recover.preparations.length,1);check(recover.preparations[0].registered,true);check(recover.preparations[0].command.request.agent.id,newAgent.id);
 const prepId=recover.preparations[0].command.request.id;
 const fenceRequest={id:crypto.randomUUID(),threadId:crypto.randomUUID(),deviceId:device.deviceId,agentId:newAgent.id,agentSha256:recover.preparations[0].command.request.agent.sha256,modelSha256:linux.model.sha256,modelScheme:'gguf-sha256',input:'[合成] 未到着の開始を停止する',maxOutputTokens:256,confirm:'run-owner-local-text'};
 const fence=await call('/api/eve/runtime',{method:'PUT',value:{action:'fence-start',request:fenceRequest}});check(fence.stopConfirmed,true);
 await call('/api/eve/runtime',{method:'PUT',owner:null,token:device.accessToken,status:403,value:{action:'fence-start',request:{...fenceRequest,id:crypto.randomUUID()}}});
 const delayedStart=await call('/api/eve/runtime',{method:'POST',value:fenceRequest});check(delayedStart.state,'runtime-fenced');
 check((await deviceCall()).commands.some(e=>e.command.request.id===fenceRequest.id),false);
 await call('/api/eve/runtime',{method:'POST',status:409,value:{...fenceRequest,input:'変更した入力'}});
 const fencedBefore=await call('/api/eve/runtime?requestId='+fenceRequest.id);check(fencedBefore.pending.state,'cancelled-before-start');check(fencedBefore.execution,null);

 await call('/api/eve/runtime?preparationId='+prepId,{owner:'bob',status:404});await call('/api/eve/runtime?preparationId='+prepId,{owner:null,token:other.accessToken,status:404});
 async function beginExecution(id){const entries=(await deviceCall()).commands,entry=entries.find(e=>e.command.request.id===id);assert.ok(entry);const c=entry.command,claimId=crypto.randomUUID();await deviceCall({action:'claim',claim:{id,claimId,requestSha256:c.requestSha256}});const grant=await deviceCall({action:'authorize',id,claimId});check(grant.permission,'text.generate');const priorCount=linux.pending.length,controller=new AbortController(),promise=linux.manager.executeText(c.request,controller.signal,{scopeSha256:'ab'.repeat(32),claimId});promise.catch(()=>{});for(let i=0;i<200&&linux.pending.length<=priorCount;i++)await new Promise(resolve=>setTimeout(resolve,2));assert.ok(linux.pending.length>priorCount);const child=linux.pending.at(-1);return {c,claimId,controller,promise,child};}
 const first=await beginExecution(firstId);check(first.c.request.agent.id,newAgent.id);linux.finish(first.child);const output=await first.promise;
 const report={schema:'rockstaros.runtime-report/1',id:firstId,claimId:first.claimId,requestSha256:first.c.requestSha256,state:'review',text:output.text,outputSha256:await linkedDigest(output.text),model:output.model,durationMs:output.durationMs,errorCode:null};
 await deviceCall({action:'report',value:{report,revision:0}});await deviceCall({action:'ack',id:firstId,claimId:first.claimId});await session.refresh();check(session.state.phase,'result');check(session.state.result,output.text);const before=await call('/api/eve/runtime?requestId='+firstId),history=await call('/api/eve/history?id='+binding.threadId);check(before.execution.externalToolSuccess,false);check(history.session.messages.length,2);
 const draftExport=await runtimeEveTextExport(before.execution,before.execution),exportPath=join(state,draftExport.name);writeFileSync(exportPath,draftExport.text,{mode:0o600});check(sha(readFileSync(exportPath)),draftExport.sha256);check(readFileSync(exportPath,'utf8').includes(output.text),true);
 await restart();
 check(await call('/api/eve/runtime?requestId='+fenceRequest.id),fencedBefore); check(await call('/api/eve/runtime?requestId='+firstId),before);check(await call('/api/eve/history?id='+binding.threadId),history);check(await runtimeEveTextExport((await call('/api/eve/runtime?requestId='+firstId)).execution,before.execution),draftExport);await session.stop();check(session.state.phase,'standby');check(linux.counters.dispatched,1);
 const secondSession=createEveInteractionSession({work:work(),pendingKey:purposeEvePendingKey(binding),storage,changed:()=>{}});secondSession.arm();secondSession.hearFinal('Hey Eve');secondSession.hearFinal('[合成] 別の自由な目的の文章を作る');await secondSession.confirm();check(secondSession.state.phase,'running');const secondId=secondSession.state.jobId,second=await beginExecution(secondId);
 await secondSession.stop();check(secondSession.state.phase,'unknown');check((await call('/api/eve/runtime?requestId='+secondId)).pending.state,'stop-requested');
 second.controller.abort();linux.finish(second.child);await assert.rejects(second.promise,{code:'SKY_LINUX_OUTCOME_UNKNOWN'});await deviceCall({action:'stop-receipt',receipt:{id:secondId,claimId:second.claimId,requestSha256:second.c.requestSha256,state:'confirmed'}});await secondSession.stop();check(secondSession.state.phase,'standby');check(linux.counters.stopped,1);
 lostEnqueue=true;await assert.rejects(work().prepare('[合成] 応答が切れても同じ担当で続ける',()=>true));const writes=await db.prepare("SELECT COUNT(*) AS n FROM eve_device_commands WHERE owner_id='alice' AND state LIKE 'agent-prepare-%'").first();const restored=await work().prepare('[合成] 応答が切れても同じ担当で続ける',()=>true);assert.ok(restored.agentId);check((await db.prepare("SELECT COUNT(*) AS n FROM eve_device_commands WHERE owner_id='alice' AND state LIKE 'agent-prepare-%'").first()).n,writes.n);check(droppedEnqueueResponses,1);
 loseRegistration=true;await assert.rejects(work().prepare('[合成] 端末登録の応答喪失から復帰する',()=>true));const registrationsBefore=registrationCalls;
 const last=(await call('/api/eve/runtime?preparationThreadId='+binding.threadId)).preparations.find(v=>v.state.startsWith('agent-prepare-claimed:'));assert.ok(last);
 if(expiryTest){const waitMs=Math.max(0,last.command.request.deadline-Date.now()+100);console.log(JSON.stringify({phase:'waiting_for_real_registration_expiry',waitMs,missingRole:expiryMissing}));await new Promise(resolve=>setTimeout(resolve,waitMs));}
 await restart();
 if(expiryMissing){
  await assert.rejects(work().prepare('[合成] 端末登録の応答喪失から復帰する',()=>true));const unknown=await call('/api/eve/runtime?preparationId='+last.command.request.id);check(unknown.registered,null);check(unknown.state,'agent-prepare-unknown:'+last.command.request.id);check(unknown.expired,true);
 }else{await work().prepare('[合成] 端末登録の応答喪失から復帰する',()=>true);if(expiryTest){const recovered=await call('/api/eve/runtime?preparationId='+last.command.request.id);check(recovered.registered,true);check(recovered.expired,true);}}
 if(expiryTest)await call('/api/eve/runtime',{method:'PUT',owner:null,token:device.accessToken,status:409,value:{action:'authorize-agent-preparation',id:last.command.request.id,claimId:last.command.request.id}});
 check(registrationCalls,registrationsBefore);check(lostRegistrationResponses,1);check(externalCalls,0);check(linux.counters.dispatched,2);
 check(inventory(),workerInventorySha256);for(const [p,h] of Object.entries(sourceSha256))check(sha(readFileSync(p)),h);
 for(const [p,h] of Object.entries(workerSourceSha256))check(sha(readFileSync(join(workerProject,p))),h);
 const proof={status:'passed',workerBuildInput:workerInput,workerMigrationsInput:join(workerProject,restoredSchema?'drizzle-main':'drizzle'),schemaInitialization:restoredSchema?'source_synthetic_restored_schema':'empty_fixture_direct_migrations',productionMigrationAccepted:false,workerSourceSha256,fixtureModel:{id:linux.model.id,scheme:'gguf-sha256',sha256:linux.model.sha256,weightsLoaded:false},expiryTest,expiredRegisteredReadback:expiryTest&&!expiryMissing,expiredMissingRoleUnknown:expiryMissing,registrationFaultPhase:expiryMissing?'before_commit':'after_commit',workerInventorySha256,sourceSha256,assertions,scope:'copied compiled Worker, real D1/auth/library/queue, actual native Java preparation HTTP/TLS/private Unix bridge and production Linux manager with synthetic child output; not browser/Android/real model/physical acceptance',immutableWorkerRoot:build,persistence:state,actualDeviceAuth:true,actualPersonalLibrary:true,nativeRegistrationWire:true,missingStartFencePersisted:true,delayedStartNotDispatched:true,syntheticUtf8FileReadback:true,exportPreservedAfterRestart:true,actualBrowserDownload:false,nativeProcesses,fixtureTrustConfinedToChildJvms:true,lostRegistrationResponses,restartPreservedHistoryAndExecution:true,unknownStopWaitedForReceipt:true,droppedEnqueueResponses,registrationCalls,fixtureGenerationCalls:linux.counters.dispatched,fixtureStops:linux.counters.stopped,externalCalls,realModelCalls:0,physicalAccepted:false,publicDeployment:false,payments:0,outputSha256:sha(output.text)};
 writeFileSync(join(state,'proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
});
