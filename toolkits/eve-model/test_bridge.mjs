// Scripted transport controls only: these tests are not model or physical evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {createBridge,validateRun,validateSelection,loadBridgeCredentials,bridgeContentSecurityPolicy} from './server.mjs';
import {Journal} from './journal.mjs';
import {Planner} from './planner.mjs';

const task=i=>({id:'dev-'+i,request:'合成資料を比較して',materials:[{name:'A',text:'count: 12'},{name:'B',text:'duration: 3'}]});
const output={raw:JSON.stringify({schema:'zema-local-agent/1',action:'respond',message:'[A]12 [B]3'}),generationTokens:20,finishReason:'stop'};
const input=(id=crypto.randomUUID())=>({operationId:id,caseId:'dev-0',arm:'C',category:'pixel',fault:'none'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let nextPort=18750;
async function fixture(planner,withPhysicalControl=false) {
 const port=++nextPort;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eve-bridge-unit-'));fs.mkdirSync(path.join(root,'observed-v3'));
 fs.writeFileSync(path.join(root,'session.json'),JSON.stringify({deadlineAt:new Date(Date.now()+18000000).toISOString()}));
 fs.writeFileSync(path.join(root,'candidate-manifest.json'),JSON.stringify({base:{files:{'model.safetensors':'a'.repeat(64),'tokenizer.json':'b'.repeat(64)}},adapterSha256:'c'.repeat(64)}));
 const development=Array.from({length:20},(_,i)=>task(i));if(withPhysicalControl?.developmentCollision)development[0].id='dev_archive-01-ja-clean';
 fs.writeFileSync(path.join(root,'observed-v3','development.jsonl'),development.map(value=>JSON.stringify(value)).join('\n')+'\n');
 if(withPhysicalControl){
  const dir=path.join(root,'functional-v1');fs.mkdirSync(dir);
  const config=withPhysicalControl===true?{schema:'eve.physical-functional-fixtures/1',ids:['dev_archive-01-ja-clean']}:withPhysicalControl;
  const ids=config.ids??['dev_archive-01-ja-clean','functional-coco-ja-20','functional-coco-en-80'];
  const extra=ids.map((id,i)=>JSON.stringify({...task(i),id})).join('\n')+'\n';fs.writeFileSync(path.join(dir,'extra.jsonl'),extra);
  const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({schema:config.schema??'eve.physical-functional-fixtures/2',records:config.records??ids.length,caseIds:ids,trainingUse:false,teacherCalls:0,extraSha256:digest(extra),sourceDevelopmentSha256:digest(fs.readFileSync(path.join(root,'observed-v3','development.jsonl'))),...config.manifest}));
 }
 const original=planner.generate;
 planner.generate=async(...args)=>{const result=await original(...args);return {...result,binding:result.binding??bridge.binding};};
 // Known synthetic credentials are fixture inputs, never file-derived data sent
 // over the transport. The server still exercises its real private-file loader.
 const credentials={owner:'synthetic-'+crypto.randomUUID(),nonce:'1'.repeat(64),token:'2'.repeat(64),port};
 fs.writeFileSync(path.join(root,'bridge-credentials.json'),JSON.stringify(credentials),{mode:0o600,flag:'wx'});
 let bridge;try{bridge=await createBridge({root,base:'/synthetic-unused',python:'/synthetic-unused',port,planner});}catch(error){fs.rmSync(root,{recursive:true,force:true});throw error;}
 await new Promise((resolve,reject)=>{bridge.server.once('error',reject);bridge.server.listen(port,'127.0.0.1',resolve);});
 const target='http://127.0.0.1:'+bridge.server.address().port;
 const headers={Host:'127.0.0.1:'+port,Origin:'http://127.0.0.1:'+port,'Content-Type':'application/json'};
 const session=await fetch(target+'/api/session',{method:'POST',headers,body:JSON.stringify({nonce:credentials.nonce})});
 if(session.status!==200){const details=await session.text();await bridge.close();throw Error('test session: '+details);}
 const cookie=session.headers.get('set-cookie').split(';')[0];
 const request=(url,body,extra={})=>fetch(target+url,{method:body?'POST':'GET',headers:{...headers,Cookie:cookie,...extra},body:body?JSON.stringify(body):undefined});
 return {root,bridge,request,target,headers,cleanup:async()=>{await bridge.close();fs.rmSync(root,{recursive:true,force:true});}};
}
async function terminal(f,id) {
 for(let i=0;i<100;i++){const r=f.bridge.journal.get(id);if(r&&['completed','failed','cancelled','unknown'].includes(r.state))return r;await delay(10);}
 throw Error('test did not reach terminal state');
}
test('bounded request cannot select a command, model path or unknown case',()=>{
 const cases=new Map([['dev-0',task(0)]]);
 for(const bad of [{...input(),command:'shell'},{...input(),arm:'other'},{...input(),caseId:'absent'},{...input(),operationId:'../x'},{...input(),fault:'arbitrary'}])assert.throws(()=>validateRun(bad,cases));
});
test('authentication, Origin, Host and pool checks run before execution',async()=>{
 let calls=0;const f=await fixture({generate:async()=>{calls++;return output;},stop:async()=>({terminated:true})});
 try{
  assert.equal((await fetch(f.target+'/api/state',{headers:f.headers})).status,401);
  assert.equal((await f.request('/api/run',input(),{Origin:'https://attacker.example'})).status,403);
  const hostile=await new Promise((resolve,reject)=>{http.get(f.target+'/api/state',{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
  assert.equal(hostile,403);
  assert.equal((await f.request('/api/run',{...input(),category:'comparison'})).status,409);
  assert.equal(calls,0);
 }finally{await f.cleanup();}
});
test('same operation and reopen preserve original source without duplicate generation',async()=>{
 let calls=0;const f=await fixture({generate:async()=>{calls++;return output;},stop:async()=>({terminated:true})});
 try{
  const value=input();assert.equal((await f.request('/api/run',value)).status,202);
  const first=await terminal(f,value.operationId);assert.equal(first.state,'completed');assert.equal(first.job.status,'review');assert.equal(first.qualityAccepted,false);
  const savedSource=first.job.composition.source;
  assert.equal((await f.request('/api/run',value)).status,202);
  assert.equal((await f.request('/api/run',{...value,arm:'A'})).status,409);
  await f.request('/api/state');await f.request('/api/state');assert.equal(calls,1);
  assert.equal(f.bridge.journal.get(value.operationId).job.composition.source,savedSource);
  const other=new Journal(path.join(f.root,'client-jobs.sqlite'),'different-synthetic-owner');
  assert.equal(other.get(value.operationId),null);other.db.close();
 }finally{await f.cleanup();}
});
test('lost acceptance response reconciles same operation, never starts it twice',async()=>{
 let calls=0;const f=await fixture({generate:async()=>{calls++;return output;},stop:async()=>({terminated:true})});
 try{
  const value={...input(),fault:'lost_response'};await assert.rejects(f.request('/api/run',value));
  await terminal(f,value.operationId);
  const retry=await f.request('/api/run',value);assert.equal(retry.status,202);assert.equal((await retry.json()).replayed,true);assert.equal(calls,1);
 }finally{await f.cleanup();}
});
test('stop uses existing cancel reducer and rejects a late scripted output',async()=>{
 let release,calls=0;const f=await fixture({generate:async()=>{calls++;return await new Promise(r=>{release=()=>r(output);});},stop:async()=>{release?.();return {terminated:true};}});
 try{
  const value=input();await f.request('/api/run',value);
  for(let i=0;i<100&&!release;i++)await delay(5);
  assert.ok(release);const response=await f.request('/api/stop',{operationId:value.operationId});assert.equal(response.status,200);
  await delay(10);const saved=f.bridge.journal.get(value.operationId);assert.equal(saved.state,'cancelled');assert.equal(saved.job.status,'cancelled');assert.equal(saved.result,null);assert.equal(saved.lateOutputRejected,true);
  await f.request('/api/run',value);assert.equal(calls,1);
 }finally{await f.cleanup();}
});
test('unavailable model and oversized sources leave completed jobs intact',async()=>{
 let calls=0;const f=await fixture({generate:async()=>{calls++;return output;},stop:async()=>({terminated:true})});
 try{
  const original=input();await f.request('/api/run',original);const before=await terminal(f,original.operationId);
  const failed={...input(),fault:'unavailable'};await f.request('/api/run',failed);assert.equal((await terminal(f,failed.operationId)).state,'failed');
  const probe=await f.request('/api/probe',{kind:'oversize'});assert.equal((await probe.json()).rejected,true);
  assert.deepEqual(f.bridge.journal.get(original.operationId),before);assert.equal(calls,1);
 }finally{await f.cleanup();}
});

test('start admission is locked before asynchronous preparation',async()=>{
 const f=await fixture({generate:async()=>output,stop:async()=>({terminated:true})});
 try{
  const original=f.bridge.journal.create.bind(f.bridge.journal);let release,entered=false;
  f.bridge.journal.create=async(...args)=>{entered=true;await new Promise(r=>{release=r;});return original(...args);};
  const first=f.request('/api/run',input());
  for(let i=0;i<100&&!entered;i++)await delay(5);
  assert.ok(entered);assert.equal((await f.request('/api/compare',{})).status,409);
  assert.equal((await f.request('/api/select',{caseId:'dev-1',arm:'A',fault:'none'})).status,409);
  release();assert.equal((await first).status,202);
 }finally{await f.cleanup();}
});
test('stale UI stop ID cancels the actual currently active owned job',async()=>{
 let calls=0,release;const f=await fixture({generate:async()=>{calls++;return calls===1?output:await new Promise(r=>{release=()=>r(output);});},stop:async()=>{release?.();return {terminated:true};}});
 try{
  const first=input();await f.request('/api/run',first);await terminal(f,first.operationId);
  const second=input();await f.request('/api/run',second);
  for(let i=0;i<100&&!release;i++)await delay(5);
  const stopped=await (await f.request('/api/stop',{operationId:first.operationId})).json();
  assert.equal(stopped.stoppedId,second.operationId);assert.equal(stopped.record.state,'cancelled');
  assert.equal(f.bridge.journal.get(first.operationId).state,'completed');
 }finally{await f.cleanup();}
});
test('different candidate binding is rejected before accepting output',async()=>{
 let stopped=0;const f=await fixture({generate:async()=>({...output,binding:{baseSha256:'different'}}),stop:async()=>{stopped++;return {terminated:true};}});
 try{
  const value=input();await f.request('/api/run',value);const record=await terminal(f,value.operationId);
  assert.equal(record.state,'failed');assert.equal(record.result,null);assert.match(record.error,/identity mismatch/);assert.ok(stopped>=1);
 }finally{await f.cleanup();}
});
test('fatal resource fault ends the comparison instead of restarting each case',async()=>{
 let calls=0;const f=await fixture({generate:async()=>{calls++;throw Object.assign(Error('synthetic fatal resource fault'),{fatal:true});},stop:async()=>({terminated:true})});
 try{
  assert.equal((await f.request('/api/compare',{})).status,202);
  for(let i=0;i<100;i++){const state=await(await f.request('/api/state')).json();if(state.group.state!=='running')break;await delay(5);}
  assert.equal(calls,1);assert.equal(f.bridge.journal.list().length,1);
 }finally{await f.cleanup();}
});
test('owned real transport child with wrong ready binding is terminated',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eve-ready-binding-unit-'));
 const shim=path.join(dir,'synthetic-python');
 fs.writeFileSync(shim,'#!/usr/bin/env python3\nimport json,sys\nprint(json.dumps({"ready":True,"binding":{"baseSha256":"wrong"}}),flush=True)\nsys.stdin.read()\n',{mode:0o700});
 const p=new Planner({python:shim,root:dir,base:dir,expectedBinding:{baseSha256:'expected'}});
 try{await assert.rejects(p.start(),/identity mismatch/);await p.stop('identity');assert.equal(p.halted,true);assert.equal(p.child,null);}
 finally{await p.stop('identity');fs.rmSync(dir,{recursive:true,force:true});}
});
test('additional physical control never expands the20-task A/C experiment',async()=>{
 let calls=0;const f=await fixture({generate:async()=>{calls++;return output;},stop:async()=>({terminated:true})},true);
 try{
  const state=await(await f.request('/api/state')).json();assert.equal(state.cases.length,21);
  await f.request('/api/compare',{});
  for(let i=0;i<200;i++){const state=await(await f.request('/api/state')).json();if(state.group.state!=='running')break;await delay(5);}
  assert.equal(calls,40);assert.equal(f.bridge.journal.list().length,40);
  assert.ok(f.bridge.journal.list().every(r=>r.caseId!=='dev_archive-01-ja-clean'));
 }finally{await f.cleanup();}
});
test('length-limited reply cannot complete a job even if JSON appears closed',async()=>{
 const f=await fixture({generate:async()=>({...output,finishReason:'length'}),stop:async()=>({terminated:true})});
 try{const value=input();await f.request('/api/run',value);const record=await terminal(f,value.operationId);assert.equal(record.state,'failed');assert.equal(record.result,null);assert.equal(record.error,'INCOMPLETE_MODEL_REPLY');assert.equal(record.job.status,'review');}
 finally{await f.cleanup();}
});
test('resource exit75 after a result remains fatal during normal_job_end cleanup',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eve-exit75-unit-')),shim=path.join(dir,'synthetic-python');
 const binding={baseSha256:'synthetic expected binding'};
 const script='#!/usr/bin/env python3\nimport json,sys,signal,time,os\nsignal.signal(signal.SIGTERM,signal.SIG_IGN)\nbinding='+JSON.stringify(binding)+'\nprint(json.dumps({"ready":True,"binding":binding}),flush=True)\nr=json.loads(sys.stdin.readline())\nprint(json.dumps({"id":r["id"],"result":{"raw":"synthetic permitted output","binding":binding}}),flush=True)\ntime.sleep(0.03)\nos._exit(75)\n';
 fs.writeFileSync(shim,script,{mode:0o700});const p=new Planner({python:shim,root:dir,base:dir,expectedBinding:binding});
 try{const result=await p.generate({id:'synthetic-75'},1000);assert.equal(result.raw,'synthetic permitted output');await p.stop('normal_job_end');assert.equal(p.halted,true);await assert.rejects(p.start(),/halted/);}
 finally{await p.stop('owner_stop');fs.rmSync(dir,{recursive:true,force:true});}
});

test('credential identity is pinned to a private regular file without following links',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eve-credential-unit-'));
 try{
  const file=path.join(root,'credentials.json');const created=loadBridgeCredentials(file,19999);
  assert.deepEqual(loadBridgeCredentials(file,19999),created);
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.throws(()=>loadBridgeCredentials(file,19998),/port mismatch/);
  const link=path.join(root,'link.json');fs.symlinkSync(file,link);
  assert.throws(()=>loadBridgeCredentials(link,19999));
  assert.deepEqual(loadBridgeCredentials(file,19999),created);
  const hardlink=path.join(root,'hardlink.json');fs.linkSync(file,hardlink);
  assert.throws(()=>loadBridgeCredentials(file,19999),/private owned/);
  fs.unlinkSync(hardlink);fs.chmodSync(file,0o644);
  assert.throws(()=>loadBridgeCredentials(file,19999),/private owned/);
  assert.equal(fs.statSync(file).mode&0o777,0o644);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('CSP binds uppercase and mixed-case script tags and refuses ambiguous templates',()=>{
 const script='globalThis.synthetic=1;';
 const expected=crypto.createHash('sha256').update(script).digest('base64');
 for(const html of ['<script>'+script+'</script>','<SCRIPT>'+script+'</SCRIPT>','<ScRiPt>'+script+'</sCrIpT>'])assert.ok(bridgeContentSecurityPolicy(html).includes("script-src 'sha256-"+expected+"'"));
 assert.throws(()=>bridgeContentSecurityPolicy('<p>none</p>'),/exactly one/);
 assert.throws(()=>bridgeContentSecurityPolicy('<script>a</script><SCRIPT>b</SCRIPT>'),/exactly one/);
});

test('an existing credential FIFO is rejected without waiting for a writer',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eve-credential-fifo-unit-'));
 try{
  const fifo=path.join(root,'credentials.json');
  const made=spawnSync('mkfifo',['-m','600',fifo],{encoding:'utf8',timeout:2000});
  assert.equal(made.status,0,String(made.error??made.stderr));
  const script='import assert from "node:assert/strict";import {loadBridgeCredentials} from '+JSON.stringify(new URL('./server.mjs',import.meta.url).href)+';assert.throws(()=>loadBridgeCredentials(process.argv[1],19999),/private owned/);';
  const child=spawnSync(process.execPath,['--input-type=module','--eval',script,fifo],{encoding:'utf8',timeout:2000});
  assert.equal(child.error,undefined,String(child.error));
  assert.equal(child.status,0,child.stderr);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});


test('fixture selection is authenticated, same-origin, strict and never creates or generates a job',async()=>{
 let calls=0;const f=await fixture({generate:async()=>{calls++;return output;},stop:async()=>({terminated:true})});
 try{
  const preset={caseId:'dev-1',arm:'A',fault:'delay_result'};
  assert.equal((await fetch(f.target+'/api/select',{method:'POST',headers:f.headers,body:JSON.stringify(preset)})).status,401);
  assert.equal((await f.request('/api/select',preset,{Origin:'https://foreign.example'})).status,403);
  for(const bad of [{...preset,caseId:'absent'},{...preset,arm:'other'},{...preset,fault:'arbitrary'},{...preset,operationId:crypto.randomUUID()}])assert.equal((await f.request('/api/select',bad)).status,409);
  const accepted=await(await f.request('/api/select',preset)).json();assert.equal(accepted.selection.revision,1);assert.equal(accepted.modelCalls,0);assert.equal(accepted.jobsCreated,0);
  const state=await(await f.request('/api/state')).json();assert.deepEqual(state.selection,{revision:1,...preset});assert.equal(state.runs.length,0);assert.equal(f.bridge.journal.list().length,0);assert.equal(calls,0);
  const second=await(await f.request('/api/select',preset)).json();assert.equal(second.selection.revision,2);assert.equal(calls,0);assert.equal(f.bridge.journal.list().length,0);
  for(const bad of [{...preset,extra:true},{...preset,arm:null},{...preset,fault:false}])assert.throws(()=>validateSelection(bad,new Map([['dev-1',task(1)]])));
 }finally{await f.cleanup();}
});
test('fixture selection refuses an active model and a running comparison group',async()=>{
 let release,calls=0;const f=await fixture({generate:async()=>{calls++;return await new Promise(r=>{release=()=>r(output);});},stop:async()=>{release?.();return {terminated:true};}});
 try{
  const value=input();await f.request('/api/run',value);for(let i=0;i<100&&!release;i++)await delay(5);assert.ok(release);
  assert.equal((await f.request('/api/select',{caseId:'dev-1',arm:'C',fault:'none'})).status,409);assert.equal(f.bridge.journal.list().length,1);assert.equal(calls,1);release();await terminal(f,value.operationId);
 }finally{await f.cleanup();}
 const g=await fixture({generate:async()=>output,stop:async()=>({terminated:true})});
 try{
  const group=await g.bridge.compare();for(let i=0;i<200&&group.state==='running';i++)await delay(5);assert.equal(group.state,'completed');
  group.state='running'; // Synthetic stale group state, with active=null and busy=false.
  assert.equal((await g.request('/api/select',{caseId:'dev-1',arm:'A',fault:'none'})).status,409);assert.equal(g.bridge.journal.list().length,40);
 }finally{await g.cleanup();}
});
test('three-case functional manifest is exact and never expands the20-case A/C core',async()=>{
 let calls=0;const f=await fixture({generate:async()=>{calls++;return output;},stop:async()=>({terminated:true})},{});
 try{
  const state=await(await f.request('/api/state')).json();assert.equal(state.cases.length,23);assert.ok(state.cases.some(x=>x.id==='functional-coco-ja-20'));assert.ok(state.cases.some(x=>x.id==='functional-coco-en-80'));
  const selected=await f.request('/api/select',{caseId:'functional-coco-en-80',arm:'C',fault:'none'});assert.equal(selected.status,200);assert.equal(calls,0);
  await f.request('/api/compare',{});for(let i=0;i<200;i++){const state=await(await f.request('/api/state')).json();if(state.group.state!=='running')break;await delay(5);}
  assert.equal(calls,40);assert.equal(f.bridge.journal.list().length,40);assert.ok(f.bridge.journal.list().every(x=>x.caseId.startsWith('dev-')));
 }finally{await f.cleanup();}
 for(const config of [{schema:'eve.physical-functional-fixtures/3'},{records:2},{ids:['dev_archive-01-ja-clean','functional-coco-ja-20','functional-coco-ja-20']},{ids:['dev_archive-01-ja-clean','functional-coco-ja-20','unknown']},{developmentCollision:true},{manifest:{extraSha256:'0'.repeat(64)}},{manifest:{sourceDevelopmentSha256:'0'.repeat(64)}},{manifest:{caseIds:['unknown']}},{manifest:{trainingUse:true}}]){
  await assert.rejects(fixture({generate:async()=>output,stop:async()=>({terminated:true})},config),/functional|physical/);
 }
});
test('client applies a new preset after URL/options only, and same-revision polling cannot run or reset selection',()=>{
 const html=fs.readFileSync(new URL('./client.html',import.meta.url),'utf8'),extractScript=value=>value.match(/<script>([\s\S]*?)<\/script>/i)[1],script=extractScript(html);
 assert.equal(extractScript('<SCRIPT>fixture</SCRIPT>'),'fixture');assert.equal(extractScript('<ScRiPt>mixed</sCrIpT>'),'mixed');
 const helper=script.slice(script.indexOf('function applySelection('),script.indexOf('async function refresh('));assert.ok(helper);assert.doesNotMatch(helper,/\/api\/run|\.click|dispatchEvent/);
 assert.ok(script.indexOf('initialCase=null;applySelection(state.selection)')>script.indexOf("el('case').append(option)"));
 let runs=0;const controls={case:{value:'url-preset'},arm:{value:'C'},fault:{value:'none'},run:{onclick:()=>{runs++;}}};
 const context=vm.createContext({controls});vm.runInContext("let appliedSelectionRevision=0;const el=id=>controls[id];const state={cases:[{id:'dev-1'},{id:'manual'}]};"+helper,context);
 assert.equal(vm.runInContext("applySelection({revision:0,caseId:'dev-1',arm:'A',fault:'unavailable'})",context),false);assert.equal(controls.case.value,'url-preset');
 assert.equal(vm.runInContext("applySelection({revision:1,caseId:'dev-1',arm:'A',fault:'unavailable'})",context),true);assert.equal(controls.case.value,'dev-1');assert.equal(controls.arm.value,'A');assert.equal(controls.fault.value,'unavailable');
 controls.case.value='manual';assert.equal(vm.runInContext("applySelection({revision:1,caseId:'dev-1',arm:'A',fault:'unavailable'})",context),false);assert.equal(controls.case.value,'manual');assert.equal(runs,0);
});
test('Pixel select uses guarded private same-origin API then exact visible selectors without open/tap/model actions',()=>{
 const code=`import sys,json,io,xml.etree.ElementTree as ET;from pathlib import Path;from unittest.mock import patch;sys.path.insert(0,sys.argv[1]);import pixel
c={'nonce':'fixture-nonce','token':'fixture-cookie'};selection={'revision':1,'caseId':'dev-1','arm':'A','fault':'unavailable'}
def tree():
 root=ET.Element('hierarchy')
 for rid,text in zip(['case','arm','fault'],['dev-1','A: 元モデル','合成障害: モデル利用不可']):ET.SubElement(root,'node',{'package':pixel.BROWSER,'class':'android.widget.Spinner','resource-id':rid,'text':text,'bounds':'[1,1][100,30]','enabled':'true'})
 return root
calls=[]
class Response:
 def __init__(self,data):self.data=data
 def __enter__(self):return self
 def __exit__(self,*a):pass
 def read(self,*a):return json.dumps(self.data).encode()
def request(req,timeout):
 calls.append(req.full_url);assert req.get_header('Cookie')=='eve_dev=fixture-cookie';assert req.get_header('Origin')=='http://127.0.0.1:18749'
 if req.full_url.endswith('/api/select'):assert req.method=='POST';assert json.loads(req.data)=={'caseId':'dev-1','arm':'A','fault':'unavailable'};return Response({'selection':selection,'modelCalls':0,'jobsCreated':0})
 assert req.full_url.endswith('/api/state');return Response({'selection':selection,'active':None,'group':None})
with patch.object(pixel,'inspect_ui',return_value=('',tree())) as guard,patch.object(pixel,'credentials',return_value=c),patch.object(pixel.urllib.request,'urlopen',side_effect=request),patch.object(pixel,'adb') as adb,patch.object(pixel,'open_client') as opened,patch.object(pixel,'tap') as tapped:
 result=pixel.select_fixture(Path('/synthetic'),'dev-1','A','unavailable');assert result['uiConfirmed'];assert result['openedNewTab'] is False;assert guard.call_count==2;adb.assert_not_called();opened.assert_not_called();tapped.assert_not_called();assert 'fixture-cookie' not in json.dumps(result) and 'fixture-nonce' not in json.dumps(result)
with patch.object(pixel,'inspect_ui',side_effect=ValueError('guard refused')),patch.object(pixel.urllib.request,'urlopen') as http:
 try:pixel.select_fixture(Path('/synthetic'),'dev-1')
 except ValueError:pass
 else:raise AssertionError('unguarded selection accepted')
 http.assert_not_called()
wrong=tree()
for node in wrong.iter('node'):node.set('class','android.view.View');node.set('resource-id','results')
assert not pixel.selection_visible(wrong,'dev-1','A','unavailable')
with patch.object(pixel,'inspect_ui',return_value=('',tree())),patch.object(pixel,'credentials',return_value=c),patch.object(pixel.urllib.request,'urlopen',side_effect=pixel.urllib.error.URLError('fixture-cookie fixture-nonce')):
 try:pixel.select_fixture(Path('/synthetic'),'dev-1','A','unavailable')
 except ValueError as error:assert 'fixture-cookie' not in str(error) and 'fixture-nonce' not in str(error)
 else:raise AssertionError('failed private request accepted')
assert len(calls)==2
`;
 const result=spawnSync('python3',['-c',code,path.dirname(new URL('./pixel.py',import.meta.url).pathname)],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},timeout:5000});assert.equal(result.status,0,result.stderr);
});

test('Pixel observed View selectors require exact unique IDs, labels, classes and visible enabled bounds',()=>{
 const code=`import sys,copy,xml.etree.ElementTree as ET;sys.path.insert(0,sys.argv[1]);import pixel
expected={'arm':('C: 学習済みEve','[223,965][627,1089]'),'case':('dev_archive-00-ja-clean','[223,1139][897,1262]'),'fault':('通常','[223,1312][937,1435]')}
def tree(cls='android.view.View'):
 root=ET.Element('hierarchy')
 for rid,(text,bounds) in expected.items():ET.SubElement(root,'node',{'package':pixel.BROWSER,'resource-id':rid,'class':cls,'text':text,'enabled':'true','bounds':bounds})
 return root
def matches(root):return pixel.selection_visible(root,'dev_archive-00-ja-clean','C','none')
assert matches(tree());assert matches(tree('android.widget.Spinner'))
mixed=tree();list(mixed)[1].set('class','android.widget.Spinner');assert matches(mixed)
for key,value in [('resource-id','results'),('text','other'),('class','android.widget.TextView'),('enabled','false'),('enabled',''),('bounds','[0,0][0,0]'),('bounds','[223,1139][897,1139]'),('bounds','invalid'),('visible-to-user','false'),('package','other.app')]:
 root=tree();list(root)[1].set(key,value);assert not matches(root),(key,value)
root=tree();root.append(copy.deepcopy(list(root)[1]));assert not matches(root)
root=tree();root.remove(list(root)[2]);assert not matches(root)
root=tree();case=list(root)[1];case.set('content-desc',case.get('text'));case.set('text','');assert not matches(root)
root=tree();list(root)[0].set('resource-id','case');list(root)[1].set('resource-id','arm');assert not matches(root)
root=ET.Element('hierarchy')
for rid,(text,bounds) in expected.items():ET.SubElement(root,'node',{'package':pixel.BROWSER,'resource-id':'results','class':'android.view.View','text':text,'enabled':'true','bounds':bounds})
assert not matches(root)
`;
 const result=spawnSync('python3',['-c',code,path.dirname(new URL('./pixel.py',import.meta.url).pathname)],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},timeout:5000});assert.equal(result.status,0,result.stderr);
});
