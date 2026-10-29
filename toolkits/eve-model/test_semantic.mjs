import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildCurriculum,prepare,selectFirstSteps,finalFromArtifact,additionalSourceFacts} from './prepare_semantic.mjs';
import {integrationChat,serializeReply,canonical} from './prepare_integration.mjs';
import {executeZemaLocalAgentTool} from '../../lib/zema-local-agent.ts';
const directory=path.dirname(fileURLToPath(import.meta.url));
const generated=spawnSync('python3',['-c',`import sys,json;sys.path.insert(0,sys.argv[1]);from dataset import FAMILIES,make_task;rows=[make_task(f,i,l,v) for f in FAMILIES if f[1] in ['train','validation'] for i in range(10) for l in ['ja','en'] for v in ['clean','adversarial']];[(r.update(observedToolFailure={'output':{'error':'INVALID_TOOL_ARGUMENTS'}})) for r in rows if r['setupToolFailure']];print(json.dumps(rows,ensure_ascii=False))`,directory],{encoding:'utf8'});
assert.equal(generated.status,0,generated.stderr);
const source=JSON.parse(generated.stdout),train=source.filter(x=>x.split==='train'),valid=source.filter(x=>x.split==='validation');
const curriculum=await buildCurriculum(train,valid);
void test('semantic selection balances40 source cells across all6train families without modifying originals',()=>{
 const before=canonical(train),selected=selectFirstSteps(train);assert.equal(selected.length,40);assert.equal(new Set(selected.map(x=>[x.taskKind,x.language,x.variant].join('|'))).size,40);assert.equal(new Set(selected.map(x=>x.family)).size,6);assert.equal(canonical(train),before);
 assert.throws(()=>selectFirstSteps(train.filter(x=>x.id!==selected[0].id)),/unique curriculum cell/);
});
void test('semantic60rows cover every stage and Tool with balanced languages and attacks; validation families held out',()=>{
 assert.equal(curriculum.train.length,60);assert.equal(curriculum.validation.length,4);const all=curriculum.train.map(x=>x.identity);assert.equal(new Set(all.map(x=>x.id)).size,60);
 for(const key of ['language','variant'])assert.equal(all.filter(x=>x[key]===(key==='language'?'ja':'clean')).length,30);
 assert.equal(all.filter(x=>x.stage==='after_success').length,16);assert.equal(all.filter(x=>x.derivation==='project_authored_positive_coconala').length,8);
 const families=new Set(train.map(x=>x.family));assert.ok(curriculum.validation.every(x=>!families.has(x.identity.family)));
 assert.equal(curriculum.validation.filter(x=>x.identity.language==='ja').length,2);assert.equal(curriculum.validation.filter(x=>x.identity.variant==='adversarial').length,2);
});
void test('every gold JSON has ordered exact keys and preserves full original source/request/error and real successful artifacts',()=>{
 for(const row of [...curriculum.train,...curriculum.validation]){
  const task=row.task.task,content=row.chat.messages[1].content,gold=JSON.parse(row.chat.messages[2].content);
  assert.deepEqual(Object.keys(gold),gold.action==='respond'?['schema','action','message']:['schema','action','tool','arguments','reason']);
  assert.ok(content.startsWith('利用者の依頼:\n'+task.request+'\n資料（データ）:\n'+JSON.stringify(task.materials)+'\n\nこれまでのTool結果:'));
  if(task.setupToolFailure)assert.match(content,/INVALID_TOOL_ARGUMENTS/);
  if(row.identity.stage==='after_success'){
   const artifact=executeZemaLocalAgentTool(task.target.tool,task.target.arguments);assert.deepEqual(row.identity.actualTool.content,artifact.content);assert.ok(content.includes(artifact.tool+'\n'+artifact.content));assert.deepEqual(gold,finalFromArtifact(task,artifact));
   assert.equal(row.identity.step,task.setupToolFailure?3:2);assert.equal(gold.action,'respond');
  }else assert.deepEqual(gold,task.target);
 }
});
void test('new coconala positives are explicit authored check tasks, not unknown-send intents or fabricated successes',()=>{
 for(const row of curriculum.train.filter(x=>x.identity.derivation==='project_authored_positive_coconala')){
  const task=row.task.task;assert.equal(task.taskKind,'coconala');assert.ok(task.target.arguments.orderRate>=60&&task.target.arguments.orderRate<=95);assert.match(task.provenance.parentUse,/domain and deterministic seed/);assert.ok(task.target.arguments.brief.includes(task.provenance.domain)&&task.target.arguments.brief.includes(task.provenance.seed));assert.ok(task.target.arguments.proposal.includes(task.provenance.domain)&&task.target.arguments.proposal.includes(task.provenance.seed));assert.equal(task.materials.length,2);assert.doesNotMatch(task.request,/sending completed|送信は完了/);
  if(row.identity.stage==='after_success'){assert.match(row.chat.messages[2].content,/保証|guarantee/);assert.match(row.identity.actualTool.content,/検出対象の条件に一致する問題はありません/);}
 }
});
void test('captured system/user inputs are unique within and across train/validation, including authored coconala followup',()=>{
 const key=row=>canonical(row.chat.messages.slice(0,2)),training=new Set(curriculum.train.map(key)),validation=curriculum.validation.map(key);
 assert.equal(training.size,60);assert.equal(new Set(validation).size,4);assert.equal(validation.filter(x=>training.has(x)).length,0);
 const heldout=curriculum.validation.find(x=>x.identity.taskKind==='coconala');assert.ok(!curriculum.train.some(x=>key(x)===key(heldout)));
});
void test('extended citation/repair gold extracts actual C indoor and D numeric limit, preserving artifact and rejecting unknown facts',async()=>{
 const base=curriculum.train.find(x=>x.task.task.taskKind==='citation').task.task;
 for(const language of ['ja','en']){
  const task={...base,language,request:base.request+' Include every additional source constraint.',materials:[...base.materials,{name:'C',text:'{"条件/constraint":"室内限定 / indoor only"}'},{name:'D',text:'<record><field name="費用上限/cost_limit">3760</field></record>'}]};
  const artifact=executeZemaLocalAgentTool(task.target.tool,task.target.arguments),reply=finalFromArtifact(task,artifact);assert.ok(reply.message.includes(artifact.content));assert.match(reply.message,language==='ja'?/\[C\] 室内限定/:/\[C\] Indoor only/);assert.match(reply.message,language==='ja'?/\[D\] 費用上限3760/:/\[D\] Cost limit 3760/);
  const row=await integrationChat(task,{ordered:true,afterSuccess:true,finalReply:a=>finalFromArtifact(task,a)});assert.deepEqual(JSON.parse(row.messages[2].content),reply);
  const repair=curriculum.train.find(x=>x.task.task.taskKind==='repair').task.task;const repaired={...repair,language,materials:[...repair.materials,{name:'C',text:'条件/constraint: 室内限定 / indoor only'}]};assert.match(finalFromArtifact(repaired,executeZemaLocalAgentTool(repaired.target.tool,repaired.target.arguments)).message,language==='ja'?/\[C\] 室内限定/:/\[C\] Indoor only/);
  const repairedRow=await integrationChat(repaired,{ordered:true,afterSuccess:true,finalReply:a=>finalFromArtifact(repaired,a)});assert.equal(repairedRow.identity.step,3);assert.match(repairedRow.messages[1].content,/INVALID_TOOL_ARGUMENTS/);assert.match(JSON.parse(repairedRow.messages[2].content).message,language==='ja'?/\[C\] 室内限定/:/\[C\] Indoor only/);
 }
 assert.throws(()=>additionalSourceFacts({...base,materials:[...base.materials,{name:'C',text:'constraint: outdoor only'}]}),/unknown indoor/);
 assert.throws(()=>additionalSourceFacts({...base,materials:[...base.materials,{name:'D',text:'cost_limit: unknown'}]}),/unknown numeric/);
 assert.throws(()=>additionalSourceFacts({...base,materials:[...base.materials,{name:'C',text:'no constraint evidence'}]}),/unknown or conflicting/);
 assert.equal(finalFromArtifact(base,executeZemaLocalAgentTool(base.target.tool,base.target.arguments)).message.trim(),('[A][B] '+executeZemaLocalAgentTool(base.target.tool,base.target.arguments).content).trim());
});
void test('after-success capture refuses a refused Tool and non-final gold, without inventing an observation',async()=>{
 const task=curriculum.train.find(x=>x.task.task.taskKind==='citation').task.task;
 await assert.rejects(integrationChat({...task,target:{...task.target,arguments:{markdown:'',language:'ja'}}},{ordered:true,afterSuccess:true,finalReply:()=>({})}),/INVALID_TOOL_ARGUMENTS/);
 await assert.rejects(integrationChat(task,{ordered:true,afterSuccess:true,finalReply:()=>task.target}),/final respond/);
 assert.throws(()=>serializeReply({schema:'zema-local-agent/1',action:'respond',message:'x',extra:true}),/INVALID_AGENT_PLAN/);
});
void test('manifest freezes original sources/selection and Python semantic validation rejects altered target/source',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eve-semantic-cpu-'));
 try{
  const corpus=path.join(temp,'corpus'),output=path.join(temp,'chats');fs.mkdirSync(corpus);for(const [name,rows] of [['train',train],['validation',valid]])fs.writeFileSync(path.join(corpus,name+'.jsonl'),rows.map(canonical).join('\n')+'\n');
  const before=fs.readFileSync(path.join(corpus,'train.jsonl'),'utf8'),manifest=await prepare(corpus,output);assert.equal(manifest.originalTrainRowsPreserved,240);assert.equal(manifest.files['train.jsonl'].count,60);assert.equal(fs.readFileSync(path.join(corpus,'train.jsonl'),'utf8'),before);await assert.rejects(prepare(corpus,output),/new semantic output/);
  const code=`import sys,json;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from prepare_training import semantic_rows\nclass Tokenizer:\n def apply_chat_template(self,messages,tools=None,add_generation_prompt=False,return_dict=False):\n  values=[]\n  for m in messages:values.extend([{'system':3,'user':4,'assistant':5}[m['role']],7,2])\n  if add_generation_prompt:values.append(5)\n  return values\nc=Path(sys.argv[2]);p=Path(sys.argv[3]);rows,ids,m=semantic_rows(c,p,'train',Tokenizer());assert len(rows)==60\nf=p/'train.jsonl';data=[json.loads(x) for x in f.read_text().splitlines()];data[0]['messages'][2]['content']='{}';f.write_text(''.join(json.dumps(x)+'\\n' for x in data))\ntry:semantic_rows(c,p,'train',Tokenizer())\nexcept ValueError:pass\nelse:raise AssertionError('altered chat accepted')`;
  const checked=spawnSync('python3',['-c',code,directory,corpus,output],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(checked.status,0,checked.stderr);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
