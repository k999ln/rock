import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildFree, officialPackaging } from '../services/noah-cloud-agents/build-free.mjs';
import { NOAH_CLOUD_PROFILES } from '../lib/noah-cloud-contract.ts';

const bundle = await buildFree({write:false,entryPoints:undefined,stdin:{contents:"export {NoahFreeCloudJob} from './free-worker.mjs'; export {validatePythonResult,pythonJob} from './free-python.mjs';",resolveDir:new URL('../services/noah-cloud-agents/',import.meta.url).pathname},plugins:[officialPackaging,{name:'rpc-unit-host',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'rpc',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env}}; export class RpcTarget {}'}));}}]});
const {NoahFreeCloudJob,validatePythonResult,pythonJob}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const valid=()=>({text:'fixture result',files:[],operations:[{name:'ai-interview-prep',ok:true,inputSha256:'a'.repeat(64),resultSha256:'b'.repeat(64)}]});
function world({profile='boss',execute,call,model=async()=>({choices:[{finish_reason:'stop',message:{content:'done'}}]}),milliseconds=2000}={}) {
  const data=new Map([['job',{id:'00000000-0000-4000-8000-000000000001',owner:'a'.repeat(64),profile,mode:'run',prompt:'fixture',calls:0,state:'queued',deadlineAt:Date.now()+milliseconds}]]);
  let serial=Promise.resolve(),calls=0;
  const ctx={storage:{get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),setAlarm:async()=>{}},blockConcurrencyWhile(fn){const p=serial.then(fn);serial=p.catch(()=>{});return p;}};
  const stub={execute,call,tools:async()=>JSON.stringify([{name:'convert_time',inputSchema:{type:'object'}}])};
  const job=new NoahFreeCloudJob(ctx,{[{time:'PYTHON',boss:'PYTHON_BOSS',hermes:'PYTHON_HERMES'}[profile]]:{getByName(name){assert.equal(name,`${'a'.repeat(64)}:00000000-0000-4000-8000-000000000001`);return stub;}},AI:{async run(...args){calls++;return model(...args);}},BUDGET:{getByName:()=>({fetch:async()=>Response.json({ok:true})})}});
  return {job,data,calls:()=>calls};
}
const until=async predicate=>{const end=Date.now()+2000;while(!predicate()){assert.ok(Date.now()<end,'test wait expired');await new Promise(r=>setTimeout(r,5));}};
void test('official Python manifests match the admitted distributions',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../services/noah-cloud-agents/python/distributions.json',import.meta.url)));
  for(const [name,pin] of Object.entries(manifest)){assert.equal(pin.sha256,NOAH_CLOUD_PROFILES[name].sha256);assert.equal(pin.version,NOAH_CLOUD_PROFILES[name].version);assert.equal(new URL(pin.url).host,'files.pythonhosted.org');}
});
void test('Python model RPC uses the same four-call admission and persists a verified receipt',async()=>{
  const w=world({execute:async(encoded,bridge)=>{assert.equal(JSON.parse(encoded).profile,'boss');await bridge.live();for(let n=0;n<4;n++)await bridge.complete(JSON.stringify({messages:[{role:'user',content:'fixture'}]}));return JSON.stringify(valid());}});
  await w.job.execute();assert.equal(w.data.get('job').state,'returned');assert.equal(w.calls(),4);assert.equal(w.data.get('job').result.calls,4);
  const receipt=JSON.parse(Buffer.from(w.data.get('job').result.files[0].base64,'base64').toString());assert.equal(receipt.runtime,'official-python-workers');assert.equal(receipt.distribution,NOAH_CLOUD_PROFILES.boss.sha256);
  const over=world({execute:async(_,bridge)=>{for(let n=0;n<5;n++)await bridge.complete(JSON.stringify({messages:[{role:'user',content:'fixture'}]}));return JSON.stringify(valid());}});
  await over.job.execute();assert.equal(over.calls(),4);assert.equal(over.data.get('job').state,'failed');assert.equal(over.data.get('job').result,undefined);
});
void test('stop during Python model RPC wins over late output without blocking the admission gate',async()=>{
  let release;const held=new Promise(r=>{release=r;});
  const w=world({model:async()=>held,execute:async(_,bridge)=>{await bridge.complete(JSON.stringify({messages:[{role:'user',content:'fixture'}]}));return JSON.stringify(valid());}});
  const running=w.job.execute();await until(()=>w.calls()===1);await w.job.end('cancelled');await running;assert.equal(w.data.get('job').state,'cancelled');release({choices:[]});await new Promise(r=>setTimeout(r,5));assert.equal(w.data.get('job').result,undefined);
});
void test('a pending Python execution expires and a pending Time tool can be stopped',async()=>{
  const w=world({milliseconds:35,execute:async()=>new Promise(()=>{})});await w.job.execute();assert.equal(w.data.get('job').state,'failed');assert.match(w.data.get('job').error,/時間の上限/);
  let entered=false,release;const held=new Promise(r=>{release=r;});
  const t=world({profile:'time',call:async()=>{entered=true;return held;},model:async()=>({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'time1',function:{name:'convert_time',arguments:'{}'}}]}}]})});
  const running=t.job.execute();await until(()=>entered);await t.job.end('cancelled');await running;release('{}');assert.equal(t.data.get('job').state,'cancelled');assert.equal(t.calls(),1);
});
void test('Python results require actual successful permitted operations and cannot forge the receipt',()=>{
  for(const value of [{...valid(),operations:[]},{...valid(),operations:[{...valid().operations[0],ok:false}]},{...valid(),operations:[{...valid().operations[0],name:'terminal'}]},{...valid(),files:[{name:'noah-execution.json'}]}])assert.throws(()=>validatePythonResult('boss',JSON.stringify(value)));
});
void test('Python error envelopes retain a fixed cause without returning upstream private text or a result',async()=>{
  for(const code of ['model_output_limit','model_response_shape','model_empty_content','model_json_invalid']) {
    const w=world({execute:async()=>JSON.stringify({...valid(),error:{code,message:'private prompt and traceback'}})});
    await w.job.execute();assert.equal(w.data.get('job').state,'failed');assert.ok(w.data.get('job').error.includes(code));assert.ok(!w.data.get('job').error.includes('private'));assert.equal(w.data.get('job').result,undefined);
  }
  assert.throws(()=>validatePythonResult('boss',JSON.stringify({error:{code:'private error'}})),error=>!error.message.includes('private'));
});

void test('each official Python profile has a distinct binding with no fallback to another isolate',()=>{
  const ids=[];
  const env=Object.fromEntries(['PYTHON','PYTHON_BOSS','PYTHON_HERMES'].map(name=>[name,{getByName(id){ids.push([name,id]);return name;}}]));
  for(const [profile,binding] of [['time','PYTHON'],['boss','PYTHON_BOSS'],['hermes','PYTHON_HERMES']]) assert.equal(pythonJob(env,{profile,owner:'owner',id:'job'}),binding);
  assert.deepEqual(ids.map(v=>v[0]),['PYTHON','PYTHON_BOSS','PYTHON_HERMES']);
  assert.throws(()=>pythonJob({PYTHON:env.PYTHON},{profile:'hermes',owner:'owner',id:'job'}));
});
