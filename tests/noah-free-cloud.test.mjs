import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { buildFree } from '../services/noah-cloud-agents/build-free.mjs';
import { NOAH_CLOUD_PROFILES, NOAH_FREE_CLOUD_PROFILES } from '../lib/noah-cloud-contract.ts';
import { noahProjectDetail } from '../lib/noah-project-api.ts';

const key = 'test-only-' + 'k'.repeat(40), owner = 'a'.repeat(64), project = 'project-' + 'b'.repeat(64);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const source = `
import worker, { NoahFreeCloudJob, NoahCloudConnection, NoahCloudBudget } from './free-worker.mjs';
import { officialSession } from './free-official.mjs';
import { promises as fs } from 'node:fs';
export { NoahCloudConnection, NoahCloudBudget };
export class TestJob extends NoahFreeCloudJob {
  async schedule(job) { if(this.env.TEST_DEADLINE && job.mode==='run') await this.ctx.storage.put('job',{...job,deadlineAt:Date.now()+this.env.TEST_DEADLINE}); await super.schedule(job); }
  constructor(ctx, env) { super(ctx, {...env, AI: {run: async (model,input) => (await env.MODEL.fetch('https://model/', {method:'POST',body:JSON.stringify({model,input})})).json()}}); }
}
export default {async fetch(request,env) {
  if(new URL(request.url).pathname !== '/official') return worker.fetch(request,env);
  const input=await request.json(), s=await officialSession(input.profile);
  try {
    if(input.link) { await fs.mkdir('/tmp/outside'); await fs.writeFile('/tmp/outside/secret','not-yours'); await fs.symlink('/tmp/outside','/tmp/workspace/link'); }
    if(input.snapshotSize !== undefined) {
      await fs.writeFile('/tmp/workspace/boundary.bin',new Uint8Array(input.snapshotSize).fill(197));
      try { return Response.json({files:await s.files()}); } catch(error) { return Response.json({error:error.message},{status:422}); }
    }
    const results=[];
    for(const call of input.calls??[]) results.push(await s.call(call.name,call.args));
    return Response.json({tools:s.tools,results,files:input.link?[]:await s.files()});
  } finally {await s.close();}
}};`;
const bundle = await buildFree({entryPoints:undefined,stdin:{contents:source,resolveDir:new URL('../services/noah-cloud-agents/',import.meta.url).pathname,sourcefile:'test-entry.mjs'},write:false});
async function world(t, model, deadline = 0) {
  const received = [], modelInputs = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],
    bindings:{NOAH_CLOUD_KEY:key,NOAH_CLOUD_MODE:'free',TEST_DEADLINE:deadline},
    durableObjects:{JOBS:{className:'TestJob',useSQLite:true},CONNECTIONS:{className:'NoahCloudConnection',useSQLite:true},BUDGET:{className:'NoahCloudBudget',useSQLite:true}},
    serviceBindings:{MODEL:async req=>{const b=await req.json();assert.ok(b.input.messages.every(m=>typeof m.content==='string'),'Workers AI requires text on tool-call assistant messages');modelInputs.push(b);return Response.json(await model(b.input));}},
    outboundService:async req=>{assert.equal(req.url,'https://avoado.si/api/noah/cloud-agents/result');assert.equal(req.headers.get('Authorization'),'Bearer '+key);received.push(await req.json());return Response.json({saved:true});},
  }));
  t.after(()=>mf.dispose());
  const rpc=body=>mf.dispatchFetch('https://runtime/rpc',{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify({owner,project,profile:'memory',distribution:NOAH_CLOUD_PROFILES.memory.sha256,...body})});
  const wait=async predicate=>{const deadline=Date.now()+20000;while(!predicate()){if(Date.now()>deadline)throw Error('timed out');await new Promise(r=>setTimeout(r,30));}};
  const connect=async n=>{await rpc({action:'connect',id:id(n)});let connected=false;const deadline=Date.now()+20000;while(!connected){const s=await(await rpc({action:'status'})).json();if(s.connection?.state==='failed')throw Error(s.connection.error);connected=s.connection?.state==='connected';if(Date.now()>deadline)throw Error('probe timeout');if(!connected)await new Promise(r=>setTimeout(r,30));}};
  return {mf,rpc,wait,connect,received,modelInputs};
}
void test('official packages run in workerd with request-isolated memory and enforced filesystem boundaries',async t=>{
  const w=await world(t,async()=>{throw Error('unexpected model');});
  const run=async body=>{const r=await w.mf.dispatchFetch('https://runtime/official',{method:'POST',body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
  const memory=await run({profile:'memory',calls:[{name:'create_entities',args:{entities:[{name:'nonce',entityType:'test',observations:['saved by official tool']}]}}]});
  assert.match(Buffer.from(memory.files[0].base64,'base64').toString(),/nonce/);
  const next=await run({profile:'memory',calls:[{name:'read_graph',args:{}}]});assert.equal(next.results[0].structuredContent.entities.length,0);
  const files=await run({profile:'filesystem',calls:[{name:'write_file',args:{path:'/tmp/workspace/check.txt',content:'official file'}},{name:'read_text_file',args:{path:'/tmp/workspace/check.txt'}},{name:'read_text_file',args:{path:'/bundle/test-entry.mjs'}}]});
  assert.equal(Buffer.from(files.files[0].base64,'base64').toString(),'official file');assert.equal(files.results[2].isError,true);
  const link=await run({profile:'filesystem',link:true,calls:[{name:'read_text_file',args:{path:'/tmp/workspace/link/secret'}}]});assert.equal(link.results[0].isError,true);
  const thought=await run({profile:'thinking',calls:[{name:'sequentialthinking',args:{thought:'Make a short plan',thoughtNumber:1,totalThoughts:1,nextThoughtNeeded:false}}]});assert.equal(thought.results[0].structuredContent.thoughtHistoryLength,1);
  for(const size of [0,32768]) {
    const snapshot=await run({profile:'filesystem',snapshotSize:size});
    const bytes=Buffer.from(snapshot.files[0].base64,'base64');assert.equal(bytes.length,size);assert.ok(bytes.every(b=>b===197));
  }
  const oversized=await w.mf.dispatchFetch('https://runtime/official',{method:'POST',body:JSON.stringify({profile:'filesystem',snapshotSize:32769})});
  assert.equal(oversized.status,422);assert.match((await oversized.json()).error,/容量が上限/);
});
void test('alarm executes official tool and delivers hashed results without any job GET, then refuses replay and another owner',async t=>{
  const w=await world(t,async input=>input.messages.at(-1).role==='tool'?{choices:[{finish_reason:'stop',message:{content:'情報を保存しました。'}}]}:{choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'call1',type:'function',function:{name:'create_entities',arguments:JSON.stringify({entities:[{name:'closed-browser-nonce',entityType:'test',observations:['saved']} ]})}}]}}]});
  await w.connect(1);
  const body={action:'start',connectionId:id(1),jobId:id(2),prompt:'Save the nonce',receipt:'r'.repeat(40)};
  assert.equal((await w.rpc(body)).status,202);
  await w.wait(()=>w.received.length===1); // Only the result callback is observed; no polling saves it.
  const result=w.received[0].job;assert.equal(result.state,'returned');assert.equal(result.calls,2);assert.equal(result.result.calls,2);
  const memory=result.result.files.find(f=>f.name==='memory.jsonl');assert.match(Buffer.from(memory.base64,'base64').toString(),/closed-browser-nonce/);
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(memory.base64,'base64'))).toString('hex');assert.equal(memory.sha256,hash);
  assert.equal((await w.rpc(body)).status,200);assert.equal(w.modelInputs.length,2);
  assert.equal((await w.rpc({...body,prompt:'changed'})).status,409);
  assert.equal((await w.rpc({action:'job',jobId:id(2),owner:'c'.repeat(64)})).status,404);
  assert.equal(w.modelInputs[0].model,'@cf/openai/gpt-oss-20b');assert.equal(w.modelInputs[0].input.max_tokens,1024);
});
void test('stop fences a pending model response and prevents all subsequent tools/model calls',async t=>{
  let release; const held=new Promise(r=>{release=r;});
  const w=await world(t,async()=>{await held;return {choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'late',type:'function',function:{name:'create_entities',arguments:'{}'}}]}}]};});
  await w.connect(10);await w.rpc({action:'start',connectionId:id(10),jobId:id(11),prompt:'stop test',receipt:'r'.repeat(40)});
  await w.wait(()=>w.modelInputs.length===1);
  const stopped=await(await w.rpc({action:'stop',jobId:id(11)})).json();assert.equal(stopped.state,'cancelled');
  release();await w.wait(()=>w.received.length===1);assert.equal(w.received[0].job.state,'cancelled');assert.equal(w.received[0].job.result,undefined);
  assert.equal((await(await w.rpc({action:'job',jobId:id(11)})).json()).state,'cancelled');assert.equal(w.modelInputs.length,1);
});
void test('free runtime and project UI reject unprepared CLI profiles',async t=>{
  const w=await world(t,async()=>({}));
  for(const [profile,definition] of Object.entries(NOAH_CLOUD_PROFILES)) {
    const entry={card:{id:project,href:definition.repository,name:definition.name},families:[]};
    const detail=noahProjectDetail(entry,true,NOAH_FREE_CLOUD_PROFILES);
    assert.equal(detail.connection.kind==='cloud',NOAH_FREE_CLOUD_PROFILES.includes(profile));
    if(!NOAH_FREE_CLOUD_PROFILES.includes(profile))assert.equal((await w.rpc({profile,action:'connect',id:id(30),distribution:definition.sha256})).status,403);
  }
});

void test('a nonresponding model reaches the persistent deadline without waiting for another alarm or accepting its late result',async t=>{
  let release;const held=new Promise(r=>{release=r;});
  const w=await world(t,async()=>{await held;return {choices:[{finish_reason:'stop',message:{content:'late'}}]};},1800);
  await w.connect(80);await w.rpc({action:'start',connectionId:id(80),jobId:id(81),prompt:'timeout',receipt:'r'.repeat(40)});
  await w.wait(()=>w.received.length===1);
  assert.equal(w.received[0].job.state,'failed');assert.match(w.received[0].job.error,/時間の上限/);assert.equal(w.modelInputs.length,1);
  release();assert.equal((await(await w.rpc({action:'job',jobId:id(81)})).json()).state,'failed');
});
