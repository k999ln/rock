import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {reviewedSystems,reviewedDiagnosticInputs,diagnose,diagnosticAttempt} from './diagnose.mjs';
import {runZemaLocalAgent,parseZemaLocalAgentReply} from '../../lib/zema-local-agent.ts';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
test('diagnostic systems reject changed files, arbitrary paths and training-serving mismatch',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eve-reviewed-system-'));
 try{
  fs.writeFileSync(path.join(root,'old-system.txt'),'old');fs.writeFileSync(path.join(root,'new-system.txt'),'new');
  const p={schema:'eve.semantic-quality-protocol/1',diagnostics:{systems:{old:{file:'old-system.txt',sha256:sha('old')},current:{file:'new-system.txt',sha256:sha('new')}}}};
  assert.deepEqual(reviewedSystems(p,root,'old','new'),{old:'old',current:'new'});
  assert.throws(()=>reviewedSystems(p,root,'other','new'),/binding mismatch/);
  assert.throws(()=>reviewedSystems({...p,diagnostics:{systems:{...p.diagnostics.systems,current:{file:'../private',sha256:sha('new')}}}},root,'old','new'),/fixed reviewed/);
  fs.writeFileSync(path.join(root,'new-system.txt'),'changed');assert.throws(()=>reviewedSystems(p,root,'old','new'),/system changed/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('planner examples use runnable enum values and distinguish requested Tools from success',async()=>{
 let system;
 await runZemaLocalAgent({request:'Summarize source facts',planner:async input=>{system=input.system;return JSON.stringify({schema:'zema-local-agent/1',action:'respond',message:'Noted'});}});
 assert.ok(!system.includes('ja または en'));assert.ok(!system.includes('null または'));
 assert.match(system,/actual input values/);assert.match(system,/Repair errors/);assert.match(system,/ALL relevant sources/);
 const examples=system.split('\n').filter(s=>s.startsWith('Respond: ')||s.startsWith('Tool: ')).map(s=>JSON.parse(s.slice(s.indexOf('{'))));
 assert.equal(examples.length,2);for(const row of examples)assert.doesNotThrow(()=>parseZemaLocalAgentReply(JSON.stringify(row)));
});

test('the actual diagnostic driver rejects the last mismatched input before Planner and reservations',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eve-reviewed-input-'));
 try{
  const ids=['a','b','c','d','e'],cells=ids.map(id=>({id,promptSha256:sha('prompt-'+id)}));
  const raw=JSON.stringify({cells});fs.writeFileSync(path.join(root,'diagnostic-input-identity.json'),raw);
  const p={schema:'eve.semantic-quality-protocol/1',diagnostics:{tasks:ids,inputIdentitySha256:sha(raw),systems:{old:{file:'old-system.txt',sha256:sha('old')},current:{file:'new-system.txt',sha256:sha('system')}}}};
  const prepare=async task=>({messages:[{content:'system'},{content:'prompt-'+task.id}]});
  const tasks=ids.map(id=>({id}));assert.equal((await reviewedDiagnosticInputs(p,root,tasks,prepare)).size,5);
  const candidate=path.join(root,'reference');fs.mkdirSync(path.join(candidate,'training'),{recursive:true});fs.mkdirSync(path.join(root,'observed-v3'));
  const data=JSON.stringify({messages:[{content:'old'}]})+'\n';fs.writeFileSync(path.join(candidate,'training/train.jsonl'),data);
  const manifest=JSON.stringify({files:{'train.jsonl':{sha256:sha(data)}}});fs.writeFileSync(path.join(candidate,'training/manifest.json'),manifest);
  const candidateDoc=JSON.stringify({base:{files:{'model.safetensors':'base','tokenizer.json':'tokenizer'}},adapterSha256:'adapter',trainingDataManifestSha256:sha(manifest)});
  fs.writeFileSync(path.join(candidate,'candidate-manifest.json'),candidateDoc);p.priorCandidateUnchanged={manifestSha256:sha(candidateDoc)};
  const taskRaw=tasks.map(JSON.stringify).join('\n')+'\n';fs.writeFileSync(path.join(root,'observed-v3/development.jsonl'),taskRaw);p.diagnostics.developmentSha256=sha(taskRaw);
  fs.writeFileSync(path.join(root,'protocol.json'),JSON.stringify(p));fs.writeFileSync(path.join(root,'old-system.txt'),'old');fs.writeFileSync(path.join(root,'new-system.txt'),'system');
  let plannerConstructions=0;
  await assert.rejects(diagnose({root,candidateRoot:candidate,base:'must-not-load',python:'must-not-spawn',
    prepare:async task=>({messages:[{content:'system'},{content:task.id==='e'?'changed':'prompt-'+task.id}]}),
    plannerFactory:()=>{plannerConstructions++;throw Error('must not construct');}}),/reviewed prompt/);
  assert.equal(plannerConstructions,0);assert.equal(fs.existsSync(path.join(root,'runtime.sqlite')),false);assert.equal(fs.existsSync(path.join(root,'diagnostics.json')),false);
  await assert.rejects(reviewedDiagnosticInputs({...p,diagnostics:{...p.diagnostics,tasks:['a','b','c','d','d']}},root,tasks,prepare),/five unique/);
  const out=path.join(root,'diagnostics.json'),original='original evidence\n';
  const options={root,candidateRoot:candidate,base:'must-not-load',python:'must-not-spawn',prepare,plannerFactory:()=>{plannerConstructions++;throw Error('must not construct');}};
  fs.writeFileSync(out,original);await assert.rejects(diagnose(options),/refuse diagnostic overwrite\/retry/);assert.equal(fs.readFileSync(out,'utf8'),original);assert.equal(plannerConstructions,0);fs.unlinkSync(out);
  // A competing creator wins immediately before the exclusive publication; never overwrite it.
  const write=fs.writeFileSync;let raced=false;
  try{fs.writeFileSync=(file,data,opts)=>{if(file===out&&opts?.flag==='wx'&&!raced){raced=true;write(file,original,{flag:'wx'});}return write(file,data,opts);};
   await assert.rejects(diagnose(options),/refuse diagnostic overwrite\/retry/);
  }finally{fs.writeFileSync=write;}
  assert.equal(raced,true);assert.equal(fs.readFileSync(out,'utf8'),original);assert.equal(plannerConstructions,0);assert.equal(fs.existsSync(path.join(root,'runtime.sqlite')),false);

 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('manual diagnostic resumption preserves old failure and rejects evidence or ledger changes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eve-reviewed-resume-'));
 try{
  const protocol={schema:'eve.semantic-quality-protocol/1'};const protocolRaw=JSON.stringify(protocol);fs.writeFileSync(path.join(root,'protocol.json'),protocolRaw);
  const rows=Array.from({length:20},(_,i)=>({state:i===0?'failed':'not_started'}));const failed=JSON.stringify({rows});fs.writeFileSync(path.join(root,'diagnostics.json'),failed);
  const review=JSON.stringify({diagnosticManualResumptionPermitted:true,reviewedProtocolSha256:sha(protocolRaw)});fs.writeFileSync(path.join(root,'DIAGNOSTIC_RESUMPTION_REVIEW.json'),review);
  const decision={status:'adopted',onceOnly:true,reservedCallsBefore:0,failedAttemptSha256:sha(failed),protocolSha256:sha(protocolRaw),reviewSha256:sha(review)};
  fs.writeFileSync(path.join(root,'diagnostic-resumption-decision.json'),JSON.stringify(decision));
  assert.deepEqual(diagnosticAttempt(protocol,root,true),{output:'diagnostics-reviewed-resumption.json',prefix:'diagnostic-reviewed1'});assert.equal(fs.readFileSync(path.join(root,'diagnostics.json'),'utf8'),failed);
  fs.writeFileSync(path.join(root,'runtime.sqlite'),'exists');assert.throws(()=>diagnosticAttempt(protocol,root,true),/zero-call/);fs.unlinkSync(path.join(root,'runtime.sqlite'));
  fs.writeFileSync(path.join(root,'DIAGNOSTIC_RESUMPTION_REVIEW.json'),'{}');assert.throws(()=>diagnosticAttempt(protocol,root,true),/review binding/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
