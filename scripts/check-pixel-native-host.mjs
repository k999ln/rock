import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:https';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile, rm, mkdtemp, chmod } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { nodeServiceFixture } from '../packages/rockstaros-runtime/test/helpers/node-service-fixture.mjs';
import { pixelPortableFixture } from '../tests/helpers/pixel-portable-fixture.mjs';
import { startPixelRuntimeBridge } from './sky-linux-runtime-bridge.mjs';
import { describeAdapter } from '../lib/rockstar-adapters.ts';
import { executionDigest } from '../packages/rockstaros-runtime/src/executor.mjs';
const exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);assert.ok(i>=0&&args[i+1],name+' is required');return resolve(args[i+1]);};
const javaHome=option('--java-home'),jsonJar=option('--json-jar'),proofPath=option('--proof');
const waitFor=async predicate=>{for(let i=0;i<200&&!predicate();i++)await new Promise(done=>setTimeout(done,5));assert.ok(predicate());};

void test('same native controller uses actual TLS/auth/SQLite/private manager; process/server restart, lost response and revocation remain scoped', {timeout:120000},async t=>{
 const service=await nodeServiceFixture(t,{persisted:true}),linux=await pixelPortableFixture(t);
 const directory=service.directory,classes=join(directory,'classes');await mkdir(classes);
 const sources=['EvePortableAgentPreparation','EvePortableCommands','EvePortableClaimJournal','PixelPortableBridgeProtocol','EvePortableController','EvePortableHttpClient'].map(name=>'toolkits/sky-linux-local/common-ui-src/'+name+'.java');
 sources.push('toolkits/sky-linux-local/owner-host-tests/dev/rock/shell/EvePortableHostProbe.java');
 await exec(join(javaHome,'bin/javac'),['--release','17','-cp',jsonJar,'-d',classes,...sources],{timeout:30000});
 // Test CA is confined to this temporary directory and these child JVMs; no OS trust changes.
 const cert=join(directory,'server.pem'),key=join(directory,'server.key'),trust=join(directory,'trust.p12');
 await exec('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],{timeout:15000});await chmod(key,0o600);
 await exec(join(javaHome,'bin/keytool'),['-importcert','-noprompt','-alias','fixture','-file',cert,'-keystore',trust,'-storetype','PKCS12','-storepass','fixture-only'],{timeout:15000});
 const socketDir=await mkdtemp(join(process.platform==='darwin'?'/private/tmp':tmpdir(),'nht-')),socketPath=join(socketDir,'runtime.sock');
 let bridge=await startPixelRuntimeBridge({manager:linux.manager,socketPath}),server,dropReports=true,lostReports=0,mode='',forbiddenRequests=0,apiRequests=0;
 const children=[];
 async function serve(port=0){
  server=createServer({cert:await readFile(cert),key:await readFile(key)},async(request,response)=>{
   try{
    if(request.url.startsWith('/__forbidden')){forbiddenRequests++;response.writeHead(500);response.end('{}');return;}
    assert.ok(request.url.startsWith('/api/eve/runtime'));apiRequests++;
    if(mode==='redirect'){response.writeHead(302,{Location:service.origin+'/__forbidden','Content-Type':'application/json'});response.end('{}');return;}
    if(mode==='html'||mode==='jsonish'){response.writeHead(200,{'Content-Type':mode==='html'?'text/html':'application/jsonp'});response.end('{}');return;}
    const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;assert.ok(size<=120000);chunks.push(chunk);}const body=Buffer.concat(chunks),value=body.length?JSON.parse(body):null;
    if(request.method!=='GET'&&request.headers.origin!==service.origin){response.writeHead(403,{'Content-Type':'application/json'});response.end('{}');return;}
    const result=await service.fetchImpl(service.origin+request.url,{method:request.method,headers:request.headers,body:request.method==='GET'?undefined:body,redirect:'error'});
    if(value?.action==='report'&&dropReports&&result.ok){lostReports++;response.destroy();return;}
    if(mode==='empty-denial'&&result.status===401){response.writeHead(401);response.end();return;}
    response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));
   }catch{if(!response.headersSent)response.writeHead(503,{'Content-Type':'application/json'});response.end('{}');}
  });
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',done);});service.origin='https://127.0.0.1:'+server.address().port;
 }
 async function stopServer(){server.closeAllConnections();await new Promise(done=>server.close(done));}
 t.after(async()=>{for(const c of children)if(c.exitCode===null&&!c.killed)c.kill('SIGKILL');await bridge.close();await stopServer();await rm(socketDir,{recursive:true,force:true});});
 await serve();const port=server.address().port;
 const auth=await service.link.begin('Synthetic native host');await service.link.approve(auth.userCode,'synthetic-owner');const session=await service.link.poll(auth.deviceCode);
 assert.equal(session.status,'authorized');const aes=randomBytes(32).toString('base64'),journalDir=join(directory,'native-journal');
 async function probe(){
  const child=spawn(join(javaHome,'bin/java'),['-cp',classes+':'+jsonJar,'dev.rock.shell.EvePortableHostProbe'],{stdio:['pipe','pipe','pipe']});children.push(child);
  const pending=[],queued=[];let stderr='';child.stderr.on('data',b=>stderr=(stderr+b).slice(-2000));
  const lines=createInterface({input:child.stdout});lines.on('line',line=>{const value=JSON.parse(line),next=pending.shift();if(next)next.resolve(value);else queued.push(value);});
  const done=new Promise(resolve=>child.once('exit',(code,signal)=>{for(const p of pending.splice(0))p.reject(Error('JVM exited '+code+'/'+signal+' '+stderr));resolve({code,signal});}));
  const command=value=>{const answer=queued.length?Promise.resolve(queued.shift()):new Promise((resolve,reject)=>pending.push({resolve,reject}));child.stdin.write(JSON.stringify(value)+'\n');if(value.action==='close')child.stdin.end();return answer;};
  const opened=await command({action:'open',origin:service.origin,owner:'synthetic-owner',device:session.deviceId,authorization:'Bearer '+session.accessToken,key:aes,directory:journalDir,socket:socketPath,trustStore:trust});assert.equal(opened.ok,true);assert.equal(opened.result.opened,true);
  return {child,command,done};
 }
 const presence=()=>({schema:'rockstaros.runtime-presence/1',name:'Synthetic native Pixel-shape host',phase:'ready',
  host:describeAdapter('pixel-android-account','host','android',{'identity.owner-local':true,'store.cas':true}),
  executor:describeAdapter('pixel-linux-gguf','executor','linux',{'text.generate':true,'model.pin':true,'execution.stop':true}),
  output:describeAdapter('pixel-eve-text','output','android',{'output.text':true}),agents:[linux.agent],
  models:[{id:linux.model.id,name:linux.model.name,scheme:'gguf-sha256',sha256:linux.model.sha256}],preparedModels:[linux.model.id]});
 await service.store.presence(presence(),session.deviceId);
 async function enqueue(){const id=crypto.randomUUID(),threadId=crypto.randomUUID();await service.store.enqueue({id,threadId,deviceId:session.deviceId,agentId:linux.agent.id,agentSha256:linux.agent.sha256,modelSha256:linux.model.sha256,modelScheme:'gguf-sha256',input:'[合成] Nativeから同じ会話へ保存',maxOutputTokens:32,confirm:'run-owner-local-text'});return {id,threadId};}
 const job=await enqueue(),first=await probe();const started=await first.command({action:'poll',presence:presence()});assert.equal(started.ok,true,JSON.stringify(started));assert.equal(started.result.state,'running');
 const child=await linux.wait();assert.equal(child.request.jobId,job.id);linux.finish(child);await waitFor(()=>linux.manager.snapshot().runs[0].job.status==='review');
 const lost=await first.command({action:'poll',presence:null});assert.equal(lost.ok,false);assert.ok(lostReports>0);
 const state=await first.command({action:'read',id:job.id});assert.equal(state.result.publication,'prepared');
 const before=await service.store.read(job.id),historyBefore=await service.history.get(job.threadId);assert.equal(historyBefore.session.messages.length,2);assert.equal(before.report.outputSha256,await executionDigest(linux.manager.snapshot().runs[0].text));
 first.child.kill('SIGKILL');assert.equal((await first.done).signal,'SIGKILL');
 await bridge.close();await linux.reopen();bridge=await startPixelRuntimeBridge({manager:linux.manager,socketPath});await stopServer();service.reopenDatabase();dropReports=false;await serve(port);
 const second=await probe();const resumed=await second.command({action:'poll',presence:null});assert.equal(resumed.ok,true);assert.equal(resumed.result.saved,true);assert.equal(resumed.result.id,job.id);assert.equal(resumed.result.state,'review');
 assert.equal(linux.counters.dispatched,1);assert.deepEqual(await service.store.read(job.id),before);assert.deepEqual(await service.history.get(job.threadId),historyBefore);assert.equal((await service.store.pendingOwner()).length,0);
 assert.equal((await second.command({action:'poll',presence:null})).result.state,'idle');
 // Owner browser authority is exercised through the actual owner store here;
 // the device fixture exposes only device-authenticated stop receipts.
 const stoppedJob=await enqueue();assert.equal((await second.command({action:'poll',presence:presence()})).result.state,'running');
 const stoppedChild=await linux.wait();assert.equal(stoppedChild.request.jobId,stoppedJob.id);
 const stopRequest=await service.store.requestStop({id:stoppedJob.id,confirm:'stop-owner-local-text'});assert.equal(stopRequest.stopConfirmed,false);
 const stopping=await second.command({action:'poll',presence:null});assert.equal(stopping.ok,true,JSON.stringify(stopping));
 await waitFor(()=>linux.counters.stopped===1);linux.finish(stoppedChild);
 await waitFor(()=>linux.manager.snapshot().runs.find(r=>r.job.id===stoppedJob.id).stop==='confirmed');
 const confirmed=stopping.result.state==='stop-confirmed'?stopping:await second.command({action:'poll',presence:null});assert.equal(confirmed.ok,true,JSON.stringify(confirmed));assert.equal(confirmed.result.state,'stop-confirmed');
 const stopBefore=(await service.store.pendingOwner()).find(p=>p.id===stoppedJob.id);assert.equal(stopBefore.state,'stop-confirmed');
 service.reopenDatabase();assert.deepEqual((await service.store.pendingOwner()).find(p=>p.id===stoppedJob.id),stopBefore);
 assert.equal(linux.manager.snapshot().runs.find(r=>r.job.id===stoppedJob.id).text,null);await assert.rejects(service.store.read(stoppedJob.id),e=>e.status===404);
 assert.deepEqual(await service.store.read(job.id),before);assert.equal(linux.counters.dispatched,2);
 const revokedJob=await enqueue();assert.equal((await second.command({action:'poll',presence:presence()})).result.state,'running');const late=await linux.wait();assert.equal(late.request.jobId,revokedJob.id);
 assert.equal(await service.link.revoke('synthetic-owner',session.deviceId),true);mode='empty-denial';const rejected=await second.command({action:'poll',presence:null});assert.equal(rejected.ok,false);assert.equal(rejected.errorClass,'HttpFailure');mode='';
 await waitFor(()=>linux.counters.stopped===2);linux.finish(late);await waitFor(()=>linux.manager.snapshot().runs.find(r=>r.job.id===revokedJob.id).stop==='confirmed');assert.equal(linux.manager.snapshot().runs.find(r=>r.job.id===revokedJob.id).text,null);
 await assert.rejects(service.store.read(revokedJob.id),e=>e.status===404);assert.equal((await service.store.list()).length,1);
 assert.deepEqual(await second.command({action:'close'}),{closed:true});assert.equal((await second.done).code,0);
 const negative=await probe();mode='redirect';assert.equal((await negative.command({action:'poll',presence:null})).ok,false);assert.equal(forbiddenRequests,0);mode='html';assert.equal((await negative.command({action:'poll',presence:null})).ok,false);mode='jsonish';assert.equal((await negative.command({action:'poll',presence:null})).ok,false);mode='';
 assert.deepEqual(await negative.command({action:'close'}),{closed:true});assert.equal((await negative.done).code,0);
 assert.equal(linux.counters.dispatched,3);assert.equal(service.sql.prepare('SELECT count(*) AS n FROM rockstar_device_sessions').get().n,1);
 const sourceSha256={};for(const path of [...sources,'scripts/check-pixel-native-host.mjs','packages/rockstaros-runtime/test/helpers/node-service-fixture.mjs',
  'scripts/sky-linux-local-runtime.mjs','scripts/sky-linux-runtime-bridge.mjs','scripts/pixel-runtime-stop-journal.mjs','tests/helpers/pixel-portable-fixture.mjs',
  'packages/rockstaros-runtime/src/index.mjs','packages/rockstaros-runtime/src/node-service-host.mjs',
  'lib/rockstar-device-link.ts','lib/eve-runtime-sync.ts','lib/eve-device-replicas.ts','lib/eve-history.ts',
  'lib/rockstar-linked-execution.ts','lib/rockstar-adapters.ts'])sourceSha256[path]=sha(await readFile(path));
 const proof={schema:'rockstaros.native-host-http-proof/1',sourceSha256,actualTls:true,jdkOriginHeaderCompatibility:true,fixtureTrustConfinedToChildJvms:true,actualDeviceAuthStore:true,actualSqliteFile:true,actualProductionManager:true,managerChild:'synthetic; no real inference',nativeJvmProcesses:3,abruptJvmKills:1,serverAndDatabaseRestarts:1,managerRestarts:1,lostReportResponses:lostReports,fixtureGenerationCalls:linux.counters.dispatched,scopedStops:linux.counters.stopped,ownerStopThroughNativeAndGuest:true,ownerStopReceiptPersistedAcrossDatabaseReopen:true,stoppedJobHasNoFabricatedReport:true,savedJobs:1,historyMessages:2,sameJobAndHistory:true,outputSha256:before.report.outputSha256,redirectFollowed:false,untrustedContentTypeAccepted:false,revokedResultPublished:false,apiRequests,physicalAccepted:false,androidTlsAccepted:false,publicAccepted:false,realInference:0,newActualOwnerGrants:0,payments:0};
 await writeFile(proofPath,JSON.stringify(proof,null,2)+'\n');t.diagnostic(JSON.stringify({proof:proofPath,fixtureGenerationCalls:3,savedJobs:1,historyMessages:2,physicalAccepted:false}));
});
