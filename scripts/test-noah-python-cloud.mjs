import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = resolve(root,'services/noah-cloud-agents/python');
const temporary = await mkdtemp(resolve(tmpdir(),'noah-python-test-'));
const port = 18993;
const config = resolve(temporary,'wrangler.jsonc');
await writeFile(config,JSON.stringify({name:'noah-python-test-host',main:resolve(folder,'test-host.mjs'),compatibility_date:'2026-10-01',durable_objects:{bindings:['time','boss','hermes'].map(profile=>({name:profile==='time'?'PYTHON':'PYTHON_'+profile.toUpperCase(),class_name:'NoahPythonJob',script_name:'noah-python-cloud-agents'+(profile==='time'?'':'-'+profile)}))}}));
const command = process.env.NOAH_PYTHON_WRANGLER || resolve(root,'services/noah-cloud-agents/node_modules/.bin/wrangler');
const child = spawn(command,['dev','--config',config,...['wrangler.jsonc','wrangler.boss.jsonc','wrangler.hermes.jsonc'].flatMap(name=>['--config',resolve(folder,name)]),'--ip','127.0.0.1','--port',String(port),'--persist-to',resolve(temporary,'state')],{cwd:folder,stdio:['ignore','pipe','pipe'],detached:true});
let output = '';
child.stdout.on('data',b=>{output=(output+b).slice(-10000);}); child.stderr.on('data',b=>{output=(output+b).slice(-10000);});
const origin = `http://127.0.0.1:${port}`;
const run = async body => {
  const response=await fetch(origin,{method:'POST',body:JSON.stringify({id:randomUUID(),prompt:'Noah fixture note',...body}),signal:AbortSignal.timeout(45000)});
  return {status:response.status,...await response.json()};
};
const decode = (value,name) => {
  const f=value.data.files.find(f=>f.name===name);assert.ok(f,name);
  const bytes=Buffer.from(f.base64,'base64');assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);return bytes.toString();
};
try {
  const deadline=Date.now()+120000;
  while(true){try{if((await fetch(origin+'/ready')).ok)break;}catch{}if(child.exitCode!==null||Date.now()>deadline)throw Error(output);await new Promise(r=>setTimeout(r,300));}
  for(const profile of ['time','boss','hermes']) {const probe=await run({profile,mode:'probe'});assert.equal(probe.ready,true,JSON.stringify({profile,...probe}));}
  const cross=await run({profile:'hermes',routeProfile:'time'});assert.equal(cross.status,422);assert.equal(cross.calls.length,0);
  const time=await run({profile:'time',tool:'convert_time',arguments:{source_timezone:'Asia/Tokyo',target_timezone:'UTC',time:'09:00'}});
  assert.equal(time.status,200);assert.equal(time.tools.length,3);assert.equal(time.result.structuredContent.time_difference,'-9.0h');assert.match(time.result.structuredContent.target.datetime,/T00:00:00\+00:00$/);
  const invalid=await run({profile:'time',tool:'convert_time',arguments:{time:'99:99'}});assert.ok(invalid.status===422||invalid.result?.isError);
  const wrong=await run({profile:'time',tool:'read_file',arguments:{}});assert.equal(wrong.status,422);
  const nonce='private-plan-'+randomUUID(), id=randomUUID();
  const hermes=await run({id,profile:'hermes',prompt:nonce});assert.equal(hermes.status,200,hermes.error);assert.equal(hermes.calls.length,2);
  assert.deepEqual(hermes.calls[0].tools?.map(t=>t.function?.name).sort(),['memory','todo']);
  assert.deepEqual(JSON.parse(decode(hermes,'plan.json')).map(t=>t.content),[nonce]);assert.match(decode(hermes,'MEMORY.md'),new RegExp(nonce));
  assert.deepEqual(hermes.data.operations.map(o=>[o.name,o.ok]),[['todo',true],['memory',true]]);
  assert.ok(hermes.calls.every(v=>Buffer.byteLength(JSON.stringify(v))<32768));
  const replay=await run({id,profile:'hermes',prompt:nonce});assert.equal(replay.status,422);assert.equal(replay.calls.length,0);
  const resumed=await run({profile:'hermes',mode:'no-tool-once',prompt:'Recover the actual tool action'});assert.equal(resumed.status,200,JSON.stringify(resumed.error));assert.equal(resumed.calls.length,3);assert.deepEqual(JSON.parse(decode(resumed,'plan.json')).map(t=>t.content),['Recover the actual tool action']);
  const isolated=await run({profile:'hermes',mode:'read',prompt:'Read a fresh job'});assert.equal(isolated.status,200,isolated.error);assert.deepEqual(JSON.parse(decode(isolated,'plan.json')),[]);assert.ok(!JSON.stringify(isolated).includes(nonce));assert.ok(!isolated.data.files.some(f=>f.name==='MEMORY.md'));
  for(const mode of ['no-tool','bad-tool','stopped','stop-model']){const result=await run({profile:'hermes',mode});assert.equal(result.status,422,mode);assert.ok(!result.data);if(mode==='no-tool')assert.equal(result.error.code,'hermes_tool_not_called');}
  const slow=run({profile:'hermes',mode:'slow',prompt:'Slow independent plan'});
  const pendingDeadline=Date.now()+5000;
  while(!(await(await fetch(origin+'/busy')).json()).pending){assert.ok(Date.now()<pendingDeadline);await new Promise(r=>setTimeout(r,10));}
  const probeStart=Date.now(), probe=await run({profile:'hermes',mode:'probe'});assert.equal(probe.ready,true);assert.ok(Date.now()-probeStart<1000,'connection probe must not wait for another model');assert.equal((await slow).status,200);
  const prompt='@/private/arbitrary-file: '+randomUUID();
  const boss=await run({profile:'boss',prompt});assert.equal(boss.status,200,boss.error);assert.equal(boss.calls.length,1);assert.ok(JSON.stringify(boss.calls[0]).includes(prompt));assert.equal(JSON.parse(decode(boss,'interview-preparation.json')).questions.length,5);assert.equal(boss.data.operations[0].name,'ai-interview-prep');
  const bad=await run({profile:'boss',mode:'bad-boss',prompt:'Fresh invalid response'});assert.equal(bad.status,422);assert.ok(!bad.data);assert.ok(!JSON.stringify(bad).includes(prompt));
  for(const [mode,code] of [['missing-choices','model_response_shape'],['empty-content','model_empty_content'],['output-limit','model_output_limit'],['truncated-json','model_output_limit'],['invalid-json','model_json_invalid']]) {
    const failed=await run({profile:'boss',mode,prompt:'Safe failure classification'});
    assert.equal(failed.status,422);assert.equal(failed.error.code,code);assert.deepEqual(Object.keys(failed.error).sort(),['code','models']);assert.equal(failed.error.models.length,1);assert.equal(failed.calls.length,1);assert.ok(!failed.data);
  }
  console.log('Python workerd: official Time, Hermes todo/memory, boss CLI; hashes, isolation, replay, stop/error gates and @input passed. Model responses were fixtures.');
} finally {try{if(typeof child.pid==='number')process.kill(-child.pid,'SIGTERM');}catch{}await new Promise(r=>setTimeout(r,200));await rm(temporary,{recursive:true,force:true});}
