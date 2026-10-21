import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createZoomLocalRuntime, createSkyZoomLocalPlugin } from '../scripts/sky-zoom-local-runtime.mjs';
import { modelTaskCases } from '../lib/sky-model-selector.ts';
import { normalizeWorkJob } from '../lib/workflow.ts';
import { buildSkyOwnerExport } from '../lib/sky-owner-export.ts';
const hash='a'.repeat(64), key='b'.repeat(64);
const source='決定: 月曜に確認\n担当: Kai\n予算は未決定', sourceHash=createHash('sha256').update(source).digest('hex');
const recipe={schema:'sky.private-zoom-recipe/1',name:'会議メモ',purpose:'概要・決定・担当を整理',outputs:['summary','decisions','owners'],summaryLines:3,decisionLabel:'決定',ownerLabel:'担当'};
const signal=()=>new AbortController().signal;
function fixture({bad=false,remote=false,deferred=false,capturePatch={}}={}) {
 const calls=[]; let now=100000, finish;
 const fetchImpl=async(url,options)=>{
  assert.ok(url.startsWith('http://127.0.0.1:11434/')); assert.equal(options.redirect,'error'); assert.equal(options.headers.Authorization,undefined);
  calls.push(url); const body=options.body?JSON.parse(options.body):null;
  if(url.endsWith('/api/tags')) return Response.json({models:[{name:'qwen3:4b',digest:hash,size:2500000000}]});
  if(url.endsWith('/api/show')) return Response.json({remote_host:remote?'cloud.example':undefined,details:{format:'gguf'},capabilities:['completion'],model_info:{'general.architecture':'qwen3','qwen3.context_length':8192}});
  if(body.messages?.length===0){assert.equal(body.keep_alive,0);return Response.json({done:true});}
  assert.equal(body.stream,false);assert.equal(body.options.num_ctx,8192);assert.equal(body.options.num_gpu,0);assert.equal(body.tools,undefined);
  const input=body.messages[1].content;
  const testCase=modelTaskCases['meeting-notes'].find((f)=>f.input===input);
  let content;
  if(testCase) { now+=1000; content={answer:testCase.required.join(' '),decisions:testCase.decisions,owners:testCase.owners}; }
  else { assert.equal(input,source,'runtime must summarize the source with the same message shape as evaluation'); if(deferred) await new Promise((resolve)=>{finish=resolve;}); content={answer:'月曜に確認。担当Kai。',decisions:['月曜に確認'],owners:['Kai']}; }
  return Response.json({model:body.model,done:true,message:{content:bad?'bad-json':JSON.stringify(content)}});
 };
 const native={read:async(command,_target)=>command==='windows'?{pid:123,windows:[{index:0,key,title:'Zoom試験'}]}:command==='status'?{accessibility:true,installedRunning:true}:{text:source,hash:sourceHash,key,pid:123,title:'Zoom試験',readOnly:true,...capturePatch},close:async()=>{}};
 const runtime=createZoomLocalRuntime({fetchImpl,native,memory:32e9,now:()=>now});
 const call=(body,token,s=signal())=>runtime.dispatch(body,token,s);
 return {runtime,call,calls,tick:(n)=>{now+=n},finish:()=>finish?.()};
}
async function add(f) {
 await f.call({action:'windows'});
 const lease=await f.call({action:'add',recipe,targetKey:key});
 await f.call({action:'capture',consent:true},lease.token); return lease.token;
}
void test('measured local model and actual-read fixture use shared Sky job review/confirm/export metadata',async()=>{
 const f=fixture();try {
  const report=await f.call({action:'evaluate'});assert.equal(report.ranked[0].name,'qwen3:4b');assert.equal(report.ranked[0].measurement.quality,100);
  const token=await add(f);const result=await f.call({action:'run',modelDigest:hash},token);
  assert.equal(result.job.status,'review');assert.equal(result.job.revision,2);assert.equal(result.job.skyApp.result.execution,'local-llm');
  assert.equal(result.job.skyApp.request.sourceRevision,sourceHash);assert.equal(result.job.skyApp.result.model.digest,hash);
  assert.deepEqual(normalizeWorkJob(JSON.parse(JSON.stringify(result.job))),result.job);
  const confirmed=await f.call({action:'confirm'},token);assert.equal(confirmed.job.status,'completed');assert.equal(confirmed.job.revision,3);
  const snapshot=structuredClone(confirmed.job);
  const exported=await buildSkyOwnerExport({job:snapshot,agents:[],cloud:[],budget:null,reservations:[]});
  assert.match(exported.html,/月曜に確認/);assert.match(exported.html,/qwen3:4b/);
  assert.match(exported.html,/ローカルLLM/);assert.match(exported.html,/default-src &#39;none&#39;/);
  assert.doesNotMatch(exported.html,/<script|<iframe|<img|<link|<form/i);
  assert.ok(exported.manifest.files.some((v)=>v.name==='sky-app.json'));
  const overview=exported.html.split('<details class="technical">')[0];
  assert.match(overview,/<h1>会議のまとめ<\/h1>/);assert.match(overview,/<h2>決まったこと<\/h2>/);
  assert.match(overview,/<h2>担当<\/h2>/);assert.match(overview,/予算はまだ決まっていません。/);
  assert.doesNotMatch(overview,new RegExp(snapshot.id));assert.doesNotMatch(overview,/qwen3|revision|sky\.app|[a-f0-9]{64}/);
  assert.deepEqual(snapshot,confirmed.job);
  await f.call({action:'stop'},token);await f.runtime.close();
  // The exported bytes are independent of the stopped runtime and contain their own inputs/results.
  assert.match(exported.html,new RegExp(sourceHash));
  for(const file of exported.manifest.files) {
    const body=exported.html.match(new RegExp(`<pre data-export-file="${file.name.replaceAll('.', '\\.')}">([\\s\\S]*?)</pre>`))[1]
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
    assert.equal(createHash('sha256').update(body).digest('hex'),file.sha256);
  }
  await assert.rejects(f.call({action:'run',modelDigest:hash},token));
 }finally{await f.runtime.close();}
});
void test('closed schema, explicit read consent, short lease, recent input and measured digest are required',async()=>{
 const f=fixture();try {
  await assert.rejects(f.call({action:'windows',shell:'x'}));
  await assert.rejects(f.call({action:'add',recipe,targetKey:key}));
  await f.call({action:'windows'});const {token}=await f.call({action:'add',recipe,targetKey:key});
  await assert.rejects(f.call({action:'capture'},token));
  await f.call({action:'capture',consent:true},token);
  await assert.rejects(f.call({action:'run',modelDigest:hash},token));
  await f.call({action:'evaluate'});f.tick(120001);
  await assert.rejects(f.call({action:'run',modelDigest:hash},token));
  f.tick(15*60000);await assert.rejects(f.call({action:'state'},token));
 }finally{await f.runtime.close();}
});
void test('low quality or remote candidates never fall back to GPT or any cloud endpoint',async()=>{
 for(const options of [{bad:true},{remote:true}]) {const f=fixture(options);try{
  const report=await f.call({action:'evaluate'});assert.equal(report.ranked.length,0);assert.ok(report.excluded.length);
  assert.ok(f.calls.every((u)=>u.startsWith('http://127.0.0.1:11434/')));
 }finally{await f.runtime.close();}}
});
void test('stop revokes native access and suppresses late generation even if the model ignores abort',async()=>{
 const f=fixture({deferred:true});try{
  await f.call({action:'evaluate'});const token=await add(f);
  const pending=f.call({action:'run',modelDigest:hash},token); const rejected=assert.rejects(pending,/停止/);
  for(let i=0;i<30;i++){await new Promise((r)=>setImmediate(r)); if(f.calls.filter((u)=>u.endsWith('/api/chat')).length===5)break;}
  const stopped=await f.call({action:'stop'},token);assert.equal(stopped.job.status,'cancelled');assert.equal(stopped.job.skyApp.result,null);
  f.finish();await rejected;
  await assert.rejects(f.call({action:'capture',consent:true},token),/停止/);
  assert.equal((await f.call({action:'stop'},token)).job.status,'cancelled');
 }finally{await f.runtime.close();}
});
void test('device middleware is Vite serve-only',()=>{assert.equal(createSkyZoomLocalPlugin().apply,'serve');});
void test('production and test modes never register a native middleware',()=>{
 for(const mode of ['production','test']) createSkyZoomLocalPlugin().configureServer({config:{mode},middlewares:{use(){assert.fail('native endpoint exposed');}}});
});
void test('changed native title, process, capability or source hash cannot enter a Sky job',async()=>{
 for(const capturePatch of [{title:'別会議'},{pid:999},{key:'c'.repeat(64)},{hash:'c'.repeat(64)}]) {
  const f=fixture({capturePatch});try {await assert.rejects(add(f),/一致/);}finally{await f.runtime.close();}
 }
});
