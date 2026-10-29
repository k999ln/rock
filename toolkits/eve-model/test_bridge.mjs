// Scripted transport controls only: these tests are not model or physical evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {createBridge,validateRun} from './server.mjs';
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
 fs.writeFileSync(path.join(root,'observed-v3','development.jsonl'),Array.from({length:20},(_,i)=>JSON.stringify(task(i))).join('\n')+'\n');
 if(withPhysicalControl){
  const dir=path.join(root,'functional-v1');fs.mkdirSync(dir);
  const extra=JSON.stringify({...task(0),id:'dev_archive-01-ja-clean'})+'\n';fs.writeFileSync(path.join(dir,'extra.jsonl'),extra);
  const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({extraSha256:digest(extra),sourceDevelopmentSha256:digest(fs.readFileSync(path.join(root,'observed-v3','development.jsonl')))}));
 }
 const original=planner.generate;
 planner.generate=async(...args)=>{const result=await original(...args);return {...result,binding:result.binding??bridge.binding};};
 const bridge=await createBridge({root,base:'/synthetic-unused',python:'/synthetic-unused',port,planner});
 await new Promise((resolve,reject)=>{bridge.server.once('error',reject);bridge.server.listen(port,'127.0.0.1',resolve);});
 const target='http://127.0.0.1:'+bridge.server.address().port;
 const credentials=JSON.parse(fs.readFileSync(bridge.credentialsFile,'utf8'));
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
