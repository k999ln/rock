import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialize, openRuntime, readJson } from '../toolkits/noah-revenue-pack/runtime.mjs';
import { runRevenueStep } from '../lib/noah-revenue-pack.ts';

function setup(t){const root=mkdtempSync(join(tmpdir(),'noah-revenue-')),path=initialize(join(root,'state'));let runtime=openRuntime(path);t.after(()=>{try{runtime.close();}catch{}rmSync(root,{recursive:true,force:true});});return {get runtime(){return runtime;},reopen(){runtime.close();runtime=openRuntime(path);return runtime;}};}
function provider(onSend=()=>{},body={}){return async(url,init)=>{assert.equal(init.redirect,'manual');if(url.endsWith('/models'))return Response.json([{name:'openai-fast',tier:'anonymous',input_modalities:['text'],output_modalities:['text']}]);assert.equal(url,'https://text.pollinations.ai/openai');assert.equal(init.headers.Authorization,undefined);onSend(JSON.parse(init.body));return Response.json({id:'test-response',model:'gpt-oss-20b',user_tier:'anonymous',choices:[{finish_reason:'stop',message:{content:'試験の下書き'}}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5},...body});};}
const request={id:'test-batch',brief:'架空店舗の紹介文を作る。価格と実績は未確定。',consent:'anonymous-free-direct-v1'};

void test('runtime JSON reads reject symlinks and oversized files without following another target',t=>{
  const root=mkdtempSync(join(tmpdir(),'noah-revenue-files-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const target=join(root,'target.json'),link=join(root,'link.json');
  writeFileSync(target,'{"fixture":true}');symlinkSync(target,link);
  assert.deepEqual(readJson(target),{fixture:true});assert.throws(()=>readJson(link));
  writeFileSync(target,' '.repeat(65537));assert.throws(()=>readJson(target),/容量上限/);
});
void test('repeated stop and pre-existing output never overwrite an existing file or symlink target',async t=>{
  const {runtime:r}=setup(t),target=join(r.root,'existing.md'),output=join(r.root,'test-batch-offer.md');
  writeFileSync(target,'keep this existing file');symlinkSync(target,output);
  await r.run(request,provider());assert.equal(readFileSync(target,'utf8'),'keep this existing file');
  r.stop();r.stop();assert.equal(readFileSync(join(r.root,'STOP'),'utf8'),'stopped\n');
});

void test('legacy pack records remain readable and count toward the shared daily cap after main integration',async t=>{
  const {runtime:r}=setup(t);let sends=0;const fetcher=provider(()=>sends++);
  for(let i=0;i<6;i++){
    const job=await runRevenueStep(step(r,{batchId:`legacy-${i}`,fetcher}));
    assert.equal(job.noahRevenue,undefined);
    assert.equal(job.noahRevenuePack.schema,'noah.revenue/1');
    const legacy={...job,noahRevenue:job.noahRevenuePack};delete legacy.noahRevenuePack;
    r.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(legacy),job.id);
  }
  const replay=await runRevenueStep(step(r,{batchId:'legacy-0',fetcher}));
  assert.equal(replay.freeCloud.state,'completed');assert.equal(sends,6);
  for(let i=0;i<6;i++)await runRevenueStep(step(r,{batchId:`current-${i}`,fetcher}));
  await assert.rejects(runRevenueStep(step(r,{batchId:'over-cap',fetcher})),/日次12仕事/);
  assert.equal(sends,12);assert.equal((await r.list()).length,12);
});
function step(r,extra={}){return {db:r.db,owner:r.owner,allowedOwner:r.owner,consent:true,batchId:'one',role:'offer',brief:'架空の依頼',previous:'',checkStopped:r.checkStopped,...extra};}
void test('three roles chain outputs, retain review status and persist without replaying after restart',async t=>{const s=setup(t);let sends=0;const f=provider(body=>{sends++;if(sends>1)assert.match(body.messages[0].content,/試験の下書き/);});const jobs=await s.runtime.run(request,f);assert.equal(sends,3);assert.equal(jobs.length,3);for(const j of jobs){assert.equal(j.status,'review');assert.equal(j.freeCloud.chargeMinor,0);assert.equal(j.freeCloud.state,'completed');}assert.match(readFileSync(join(s.runtime.root,'test-batch-content.md'),'utf8'),/試験の下書き/);await s.reopen().run(request,f);assert.equal(sends,3);await assert.rejects(s.runtime.run({...request,brief:'変更'},f));assert.equal(sends,3);});
void test('different owner, missing consent and stopped runtime make zero provider calls',async t=>{const {runtime:r}=setup(t);let calls=0;const fetcher=async()=>{calls++;throw Error();};await assert.rejects(runRevenueStep(step(r,{owner:'other',fetcher})));await assert.rejects(runRevenueStep(step(r,{consent:false,fetcher})));r.stop();await assert.rejects(runRevenueStep(step(r,{fetcher})));assert.equal(calls,0);});
void test('parallel same-id execution has a single send claim',async t=>{const {runtime:r}=setup(t);let sends=0;const input=step(r,{fetcher:provider(()=>sends++)});await Promise.all([runRevenueStep(input),runRevenueStep(input)]);assert.equal(sends,1);});
void test('atomic daily reservation admits at most 12 work records',async t=>{const {runtime:r}=setup(t);let sends=0;const fetcher=provider(()=>sends++);const results=await Promise.allSettled(Array.from({length:16},(_,i)=>runRevenueStep(step(r,{batchId:`cap-${i}`,fetcher}))));assert.equal(sends,12);assert.equal(results.filter(r=>r.status==='rejected').length,4);assert.equal((await r.list()).length,12);});
void test('paid tier, incomplete response and ambiguous network failures are never replayed',async t=>{for(const kind of ['paid','length','usage','network']){const {runtime:r}=setup(t);let sends=0;const fetcher=kind==='network'?async(url,init)=>{if(url.endsWith('/models'))return provider()(url,init);sends++;throw Error('lost');}:provider(()=>sends++,kind==='paid'?{user_tier:'paid'}:kind==='usage'?{usage:null}:{choices:[{finish_reason:'length',message:{content:'partial'}}]});const input=step(r,{fetcher});await assert.rejects(runRevenueStep(input));const replay=await runRevenueStep(input);assert.equal(replay.freeCloud.state,'unconfirmed');assert.equal(replay.freeCloud.chargeMinor,undefined);assert.equal(sends,1);}});
void test('stop during a model response preserves it and prevents the next stage',async t=>{const {runtime:r}=setup(t);let sends=0;await assert.rejects(r.run(request,provider(()=>{sends++;r.stop();})),/停止中/);assert.equal(sends,1);assert.equal((await r.list())[0].freeCloud.state,'completed');});
void test('only confirmed pre-generation FREE_LIMIT may resume after its declared wait',async t=>{const {runtime:r}=setup(t);let sends=0,now=Date.now();const normal=provider();const fetcher=async(url,init)=>{if(url.endsWith('/models'))return normal(url,init);sends++;if(sends===1)return Response.json({error:{code:'FREE_LIMIT'}},{status:402,headers:{'Retry-After':'45'}});return normal(url,init);};const input=step(r,{fetcher,now:()=>now});assert.equal((await runRevenueStep(input)).freeCloud.state,'waiting');await runRevenueStep(input);assert.equal(sends,1);now+=45000;await Promise.all([runRevenueStep(input),runRevenueStep(input)]);assert.equal(sends,2);assert.equal((await runRevenueStep(input)).freeCloud.state,'completed');});
