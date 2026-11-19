import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
import { skySocialStore } from '../lib/sky-social-store.ts';
import { skyAgentShareStore } from '../lib/sky-agent-share-store.ts';
import { eveToolWorkStore } from '../lib/eve-tool-work.ts';
import { eveHistoryStore } from '../lib/eve-history.ts';
import { runEvePlannerInference } from '../lib/eve-planner-inference.ts';
import { evePlannerPrompt } from '../lib/eve-plan-candidate.ts';
import { observeLlmUsage } from '../lib/sky-usage-observation.ts';
import { verifyEveToolAgent } from '../lib/eve-tool-agent.ts';
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
 const prepare=(query,args=[])=>({bind(...v){return prepare(query,v)},async first(){return sql.prepare(query).get(...args)??null},async all(){return {results:sql.prepare(query).all(...args)}},execute(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}},async run(){return this.execute()}});
 const db={prepare,async batch(items){sql.exec('BEGIN');try{const r=items.map(s=>s.execute());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 const keys={current:'fixture',keys:{fixture:'12'.repeat(32)}};const settings={name:'合成の出典担当',instructions:'英語の出典もURLを保持して整理する。未知の情報は確認済みとしない。',provider:'ollama',model:'fixture:1',enabled:true};
 return {sql,db,keys,settings,library:(owner='bob')=>skyAgentLibraryStore(db,owner),tools:(owner='bob')=>eveToolWorkStore(db,owner,keys),history:(owner='bob')=>eveHistoryStore(db,owner,keys,true),async agent(){return skyAgentLibraryStore(db,'bob').save(crypto.randomUUID(),0,settings,true)}};
}
function input(agent,extra={}){return {jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),objective:'リンク先を保持して整理する',source:'本文 [資料](https://example.com/agent-source)',saveMaterial:true,agentSelection:{id:agent.id,revision:agent.revision},agentToolConsent:true,...extra}}
const command=(job,action)=>({jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action});
void test('owner-selected saved Agent reaches actual Tool, verification, completion and the same encrypted thread',async t=>{
 const f=fixture(t),a=await f.agent(),request=input(a);let {job}=await f.tools().create(request);
 assert.equal(job.eveTool.agentBinding.id,a.id);assert.equal(job.eveTool.agentBinding.instructions,a.instructions);assert.equal(job.eveTool.agentBinding.provider,'ollama');
 for(const action of ['advance','advance','complete'])job=(await f.tools().command(command(job,action))).job;
 assert.equal(job.status,'completed');assert.match(job.composition.artifacts.s1.text,/https:\/\/example.com\/agent-source/);assert.equal(job.eveTool.verification.checks.every(c=>c.passed),true);
 const messages=(await f.history().get(request.threadId)).session.messages;assert.equal(messages.some(m=>m.text.includes(a.name)&&m.text.includes(job.id)),true);
 assert.deepEqual((await f.tools().create(request)).job,job);assert.deepEqual(await f.tools().get(job.id),job);
});
void test('missing consent, forged snapshots, other-owner, stale and disabled profiles cannot create work',async t=>{
 const f=fixture(t),a=await f.agent(),req=input(a);
 await assert.rejects(f.tools().create({...req,agentToolConsent:false}));await assert.rejects(f.tools().create({...req,agentBinding:{id:a.id}}));await assert.rejects(f.tools('alice').create(req),{status:404});
 await f.library().save(a.id,1,{...f.settings,enabled:false});await assert.rejects(f.tools().create(req),{status:409});await assert.rejects(f.tools().create(input({...a,revision:2})),{status:409});
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,0);
});
void test('profile changes do not rewrite old approved work, but new work must bind the latest enabled revision',async t=>{
 const f=fixture(t),a=await f.agent(),req=input(a),created=await f.tools().create(req);
 await f.library().save(a.id,1,{...f.settings,name:'新しい担当',enabled:false});
 assert.deepEqual((await f.tools().create(req)).job,created.job);
 let job=created.job;for(const action of ['advance','advance','complete'])job=(await f.tools().command(command(job,action))).job;
 assert.equal(job.eveTool.agentBinding.name,a.name);assert.equal(job.eveTool.agentBinding.revision,1);
 await assert.rejects(f.tools().create(input(a)),{status:409});
 const updated=await f.library().save(a.id,2,{...f.settings,name:'新しい担当'});assert.equal((await f.tools().create(input(updated))).job.eveTool.agentBinding.revision,3);
});
void test('role revision changes at commit leave neither a Tool job nor a phantom goal message',async t=>{
 const f=fixture(t),a=await f.agent(),req=input(a),original=f.db.prepare.bind(f.db);
 f.db.prepare=query=>{if(query.startsWith('INSERT INTO work_jobs'))f.sql.prepare('UPDATE sky_agent_settings SET revision=2 WHERE owner_user_id=? AND id=?').run('bob',a.id);return original(query)};
 await assert.rejects(f.tools().create(req),{status:409});assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM eve_messages').get().n,0);
});
void test('a shared role retains exact source attribution inside its resulting job without publicizing the input',async t=>{
 const f=fixture(t);await skySocialStore(f.db,'alice').mutate({action:'profile',name:'Fixture Alice'});
 const original=await f.library('alice').save(crypto.randomUUID(),0,f.settings,true);const store=skyAgentShareStore(f.db,'alice'),d=await store.preview(original.id,'合成の担当',null);
 await store.mutate({action:'publish',agentId:original.id,agentRevision:1,description:d.manifest.description,communityId:null,expectedVersion:0,digest:d.digest,license:d.manifest.license,approve:true});
 const imported=await skyAgentShareStore(f.db,'bob').mutate({action:'add',id:d.manifest.id,version:1,digest:d.digest,provider:'ollama',model:'fixture:1',approve:true});const active=await f.library().save(imported.agent.id,1,f.settings);
 let job=(await f.tools().create(input(active))).job;for(const action of ['advance','advance','complete'])job=(await f.tools().command(command(job,action))).job;
 assert.equal(job.eveTool.agentBinding.shared.digest,d.digest);assert.equal(job.eveTool.agentBinding.shared.author,d.manifest.author);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_social_posts').get().n,0);
});
void test('saved-role integrity is checked before another Tool step, without preventing normal stop after profile edits',async t=>{
 const f=fixture(t),a=await f.agent();const job=(await f.tools().create(input(a))).job;
 const binding=job.eveTool.agentBinding;assert.equal((await verifyEveToolAgent(binding)).sha256,binding.sha256);await assert.rejects(verifyEveToolAgent({...binding,instructions:'tampered'}),{status:409});
 job.eveTool.agentBinding.instructions='tampered';f.sql.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(job),job.id);
 await assert.rejects(f.tools().command(command(job,'advance')),{status:409});
});
void test('a bound planner uses the frozen role in its actual model request and cannot switch models/providers',async t=>{
 const f=fixture(t),a=await f.agent();await assert.rejects(f.tools().create(input(a,{plannerRequest:{modelLabel:'other',modelDigest:'a'.repeat(64)}})),{status:409});
 const req=input(a,{plannerRequest:{modelLabel:a.model,modelDigest:'a'.repeat(64)}});let job=(await f.tools().create(req)).job;job=(await f.tools().plannerCommand(command(job,'planner-claim'))).job;
 const lease=job.eveTool.planning.attempts.at(-1).id;let calls=0;
 const generated=async request=>{calls++;assert.equal(request.provider,'ollama');assert.equal(request.model,a.model);assert.match(request.prompt,/untrusted data/);assert.ok(request.prompt.includes(a.instructions));const prompt=evePlannerPrompt({jobId:job.id,objective:job.plan.objective,sourceSha256:job.eveTool.sourceSha256});assert.equal(request.prompt.startsWith(prompt.prompt),true);return {provider:'ollama',model:a.model,text:JSON.stringify({schema:'eve.plan-candidate/1',jobId:job.id,objective:job.plan.objective,sourceSha256:job.eveTool.sourceSha256,nodes:[{id:'s1',tool:'mr-citations',inputs:['source'],config:{}},{id:'s2',tool:'compose-check',inputs:['s1'],config:{minChars:1,requiredText:[]}}],unknowns:[],stopReason:null}),metering:observeLlmUsage('ollama',{model:a.model,prompt_eval_count:10,eval_count:6})}};
 const result=await runEvePlannerInference(f.db,'bob',f.keys,{jobId:job.id,attemptId:lease},a.model,{},generated,async()=> 'a'.repeat(64));assert.equal(calls,1);assert.equal(result.eveWork.eveTool.agentBinding.sha256,job.eveTool.agentBinding.sha256);assert.equal(result.eveWork.eveTool.planning.status,'proposed');
 job=result.eveWork;job=(await f.tools().plannerCommand(command(job,'planner-adopt'))).job;for(const action of ['advance','advance','complete'])job=(await f.tools().command(command(job,action))).job;assert.equal(job.status,'completed');assert.equal(calls,1);assert.equal(job.eveTool.agentBinding.id,a.id);
});

void test('a stop during a role-bound inference retains observed usage and cannot run a Tool or revive the work',async t=>{
 const f=fixture(t),a=await f.agent(),created=await f.tools().create(input(a,{plannerRequest:{modelLabel:a.model,modelDigest:'a'.repeat(64)}}));let job=(await f.tools().plannerCommand(command(created.job,'planner-claim'))).job;const lease=job.eveTool.planning.attempts.at(-1).id;
 const generated=async()=>{await f.library().save(a.id,1,{...f.settings,enabled:false});await f.tools().command(command(await f.tools().get(job.id),'cancel'));return {provider:'ollama',model:a.model,text:'{}',metering:observeLlmUsage('ollama',{model:a.model,prompt_eval_count:10,eval_count:6})}};
 const result=await runEvePlannerInference(f.db,'bob',f.keys,{jobId:job.id,attemptId:lease},a.model,{},generated,async()=> 'a'.repeat(64));job=result.eveWork;assert.equal(job.status,'cancelled');assert.equal(job.eveTool.planning.attempts.at(-1).inference.usage.metrics.find(m=>m.meter==='input_tokens').quantity,10);assert.deepEqual(job.composition.artifacts,{});assert.equal(job.eveTool.agentBinding.revision,1);
});
