import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {skySocialStore} from '../lib/sky-social-store.ts';
import {skyAgentShareStore} from '../lib/sky-agent-share-store.ts';
import {skyAgentLibraryStore} from '../lib/sky-agent-library-store.ts';
import {eveToolWorkStore} from '../lib/eve-tool-work.ts';
import {skyAgentOutcomeStore} from '../lib/sky-agent-outcome-store.ts';
import {outcomeResource,parseOutcomeResource} from '../lib/sky-agent-outcomes.ts';
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(`../drizzle/${f}`,import.meta.url),'utf8'));
 const prepare=(query,args=[])=>({bind(...v){return prepare(query,v)},async first(){return sql.prepare(query).get(...args)??null},async all(){return {results:sql.prepare(query).all(...args)}},execute(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}},async run(){return this.execute()}});
 const db={prepare,async batch(items){sql.exec('BEGIN');try{const r=items.map(i=>i.execute());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 const keys={alice:{},bob:{},carol:{}},settings={name:'合成担当',instructions:'出典URLを保持する。',provider:'ollama',model:'fixture:1',enabled:true};
 const library=(owner='bob')=>skyAgentLibraryStore(db,owner),shares=(owner='bob')=>skyAgentShareStore(db,owner,keys[owner]),social=(owner='bob')=>skySocialStore(db,owner,keys[owner]),outcomes=(owner='bob',k=keys[owner])=>skyAgentOutcomeStore(db,owner,k),tools=(owner='bob')=>eveToolWorkStore(db,owner,{current:'fixture',keys:{fixture:'12'.repeat(32)}});
 async function setup(communityId=null){for(const owner of Object.keys(keys))await social(owner).mutate({action:'profile',name:`Fixture ${owner}`});const a=await library('alice').save(crypto.randomUUID(),0,settings,true),d=await shares('alice').preview(a.id,'合成の説明',communityId);const p=await shares('alice').mutate({action:'publish',agentId:a.id,agentRevision:1,description:d.manifest.description,communityId,expectedVersion:0,digest:d.digest,license:d.manifest.license,approve:true});return p;}
 async function agent(p,owner='bob',modified=false){const b=await shares(owner).mutate({action:'add',id:p.manifest.id,version:1,digest:p.digest,provider:'ollama',model:settings.model,approve:true});return library(owner).save(b.agent.id,b.agent.revision,{...settings,...(modified?{instructions:'本人が変更した秘密の役割文'}:{}),enabled:true});}
 async function work(a,owner='bob',complete=true){let job=(await tools(owner).create({jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),objective:'合成の目的',source:'非公開原稿の一文 [出典](https://example.com/private-source)',saveMaterial:true,agentSelection:{id:a.id,revision:a.revision},agentToolConsent:true})).job;if(complete)for(const action of ['advance','advance','complete'])job=(await tools(owner).command({jobId:job.id,revision:job.revision,commandId:crypto.randomUUID(),action})).job;return job;}
 const preview=(job,helpful=true,owner='bob')=>outcomes(owner).mutate({action:'preview',jobId:job.id,jobRevision:job.revision,helpful});
 const publish=(job,d,helpful=true,owner='bob',extra={})=>outcomes(owner).mutate({action:'publish',jobId:job.id,jobRevision:job.revision,helpful,digest:d.digest,expected:d.expected,approve:true,...extra});
 return {sql,db,keys,settings,library,shares,social,outcomes,tools,setup,agent,work,preview,publish};
}
void test('completed shared role -> explicit preview/approval -> native post and versioned self-report counts, without private material',async t=>{
 const f=fixture(t),p=await f.setup(),job=await f.work(await f.agent(p)),d=await f.preview(job);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_social_posts').get().n,0);
 await f.publish(job,d);const post=(await f.social('carol').state()).posts[0];assert.equal(post.attachment.kind,'agent-outcome');assert.equal(parseOutcomeResource(post.attachment.resource).digest,p.digest);
 for(const value of [job.id,job.eveTool.threadId,'非公開原稿','private-source',job.eveTool.agentBinding.instructions])assert.equal(JSON.stringify(post).includes(value),false);
 assert.deepEqual(await f.outcomes('carol').summary(p.manifest.id,1),{original:{helpful:1,notHelpful:0},modified:{helpful:0,notHelpful:0}});assert.equal((await f.tools().get(job.id)).status,'completed');
});
void test('consent, current revision, owner, completed work and server-built report are required',async t=>{
 const f=fixture(t),p=await f.setup(),a=await f.agent(p),active=await f.work(a,'bob',false);await assert.rejects(f.preview(active),{status:409});
 const job=await f.work(a),d=await f.preview(job);await assert.rejects(f.publish(job,d,true,'bob',{approve:false}));await assert.rejects(f.preview({...job,revision:1}),{status:409});await assert.rejects(f.preview(job,true,'carol'),{status:404});
 await assert.rejects(f.outcomes().mutate({action:'preview',jobId:job.id,jobRevision:job.revision,helpful:true,content:'forged'}));
 await assert.rejects(f.social().mutate({action:'post',id:crypto.randomUUID(),content:'forged',communityId:null,attachment:d.attachment}));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_social_posts').get().n,0);
});
void test('multiple jobs do not inflate a profile/version and changed settings stay separate from original reports',async t=>{
 const f=fixture(t),p=await f.setup(),a=await f.agent(p),job=await f.work(a);await f.publish(job,await f.preview(job));
 const changed=await f.library().save(a.id,a.revision,{...f.settings,instructions:'本人が変更した秘密の役割文'}),other=await f.work(changed);const d=await f.preview(other,false);await f.publish(other,d,false);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_social_posts').get().n,1);assert.deepEqual(await f.outcomes().summary(p.manifest.id,1),{original:{helpful:0,notHelpful:0},modified:{helpful:0,notHelpful:1}});
 assert.equal(JSON.stringify((await f.social().state()).posts).includes(changed.instructions),false);
});
void test('stale previews cannot overwrite changed answers or resurrect withdrawn reports; explicit fresh consent can replace',async t=>{
 const f=fixture(t),p=await f.setup(),job=await f.work(await f.agent(p)),yes=await f.preview(job),no=await f.preview(job,false);await f.publish(job,yes);await assert.rejects(f.publish(job,no,false),{status:409});
 const status=await f.outcomes().mutate({action:'status',postId:yes.postId});await f.outcomes().mutate({action:'withdraw',postId:yes.postId,digest:status.digest,approve:true});await assert.rejects(f.publish(job,yes),{status:409});
 assert.equal((await f.social().state()).posts.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_social_posts').get().n,1);
 const fresh=await f.preview(job,false);await f.publish(job,fresh,false);assert.equal((await f.outcomes().summary(p.manifest.id,1)).original.notHelpful,1);
});
void test('social deletion retains an invisible tombstone; update and withdrawal remove old reactions',async t=>{
 const f=fixture(t),p=await f.setup(),job=await f.work(await f.agent(p)),d=await f.preview(job);await f.publish(job,d);
 await f.social('carol').mutate({action:'reaction',id:d.postId,reaction:'like',enabled:true});assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_social_reactions').get().n,1);
 await f.publish(job,await f.preview(job,false),false);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_social_reactions').get().n,0);
 const pending=await f.preview(job);await f.social().mutate({action:'deletePost',id:d.postId});await assert.rejects(f.publish(job,pending),{status:409});assert.equal((await f.social().state()).posts.length,0);assert.equal((await f.outcomes().summary(p.manifest.id,1)).original.notHelpful,0);
});
void test('job/thread and share withdrawal races reject publication at the final SQL write',async t=>{
 for(const mode of ['thread','share']){
  const f=fixture(t),p=await f.setup(),job=await f.work(await f.agent(p)),d=await f.preview(job),prepare=f.db.prepare.bind(f.db);
  f.db.prepare=query=>{if(query.startsWith('INSERT INTO sky_social_posts')){if(mode==='thread')f.sql.prepare('UPDATE eve_conversations SET deleted_at=1 WHERE owner_id=? AND id=?').run('bob',job.eveTool.threadId);else f.sql.prepare('UPDATE sky_agent_shares SET withdrawn_at=1 WHERE id=?').run(p.manifest.id);}return prepare(query)};
  await assert.rejects(f.publish(job,d),{status:409});assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_social_posts').get().n,0);
 }
});
void test('author self-reports are excluded and count resources reject malformed fields',async t=>{
 const f=fixture(t),p=await f.setup(),job=await f.work(await f.agent(p,'alice'),'alice'),d=await f.preview(job,true,'alice');await f.publish(job,d,true,'alice');assert.equal((await f.outcomes().summary(p.manifest.id,1)).original.helpful,0);
 const v={id:p.manifest.id,version:1,digest:p.digest,helpful:true,modified:false};assert.deepEqual(parseOutcomeResource(outcomeResource(v)),v);for(const s of ['01:'+p.digest+':h:o','1:'+p.digest+':fake:o','1:'+p.digest+':h:o:extra'])assert.throws(()=>parseOutcomeResource(p.manifest.id+':'+s));
});
void test('keyed reports remain inside their community; an author can withdraw their known report after key revocation',async t=>{
 const f=fixture(t);await f.setup();const id=crypto.randomUUID();f.keys.alice[id]='a'.repeat(64);
 await f.social('alice').mutate({action:'createCommunity',id,name:'合成の場所',description:'合成',rules:'合成',visibility:'members',accessKey:f.keys.alice[id],recoveryKey:'b'.repeat(64)});
 const invite=(await f.social('alice').mutate({action:'invite',id})).invite,view=await f.social().mutate({action:'previewInvite',...invite});f.keys.bob[id]='c'.repeat(64);
 await f.social().mutate({action:'join',...invite,confirmRules:true,rulesVersion:view.community.rulesVersion,accessKey:f.keys.bob[id]});
 const p=await f.setup(id),job=await f.work(await f.agent(p)),d=await f.preview(job);assert.equal(d.communityId,id);await f.publish(job,d);
 await assert.rejects(f.outcomes('bob',{}).summary(p.manifest.id,1),{status:403});await assert.rejects(f.outcomes('carol').summary(p.manifest.id,1),{status:403});
 assert.equal((await f.social('carol').state()).posts.some(p=>p.id===d.postId),false);
 const status=await f.outcomes().mutate({action:'status',postId:d.postId}),edit=await f.preview(job,false),batch=f.db.batch.bind(f.db);
 f.db.batch=async items=>{f.sql.prepare('UPDATE sky_community_keys SET revoked_at=1 WHERE community_id=? AND profile_id=(SELECT id FROM sky_social_profiles WHERE owner_id=?)').run(id,'bob');return batch(items)};
 await assert.rejects(f.publish(job,edit,false),{status:409});f.db.batch=batch;assert.equal((await f.outcomes('alice').summary(p.manifest.id,1)).original.helpful,1);
 await assert.rejects(f.preview(job),{status:403});await f.outcomes('bob',{}).mutate({action:'withdraw',postId:d.postId,digest:status.digest,approve:true});
 assert.equal((await f.outcomes('alice').summary(p.manifest.id,1)).original.helpful,0);assert.equal((await f.tools().get(job.id)).status,'completed');
});
void test('a colliding ordinary post cannot be overwritten as a report, including a different visibility',async t=>{
 const f=fixture(t),p=await f.setup(),job=await f.work(await f.agent(p)),d=await f.preview(job);
 await f.social().mutate({action:'post',id:d.postId,content:'既存の普通の投稿',communityId:null,attachment:null});
 await assert.rejects(f.preview(job),{status:409});assert.equal((await f.social().state()).posts[0].content,'既存の普通の投稿');
});
void test('outcome preview rejects changed source bytes even when URLs are unchanged and labels fixed Tool recipes',async t=>{
 const f=fixture(t),p=await f.setup(),job=await f.work(await f.agent(p));const draft=await f.preview(job);assert.match(draft.content,/Toolの手順：固定手順/);
 job.composition.source='変更された本文 [出典](https://example.com/private-source)';f.sql.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(job),job.id);
 await assert.rejects(f.preview(job),{status:409});assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_social_posts').get().n,0);
});
void test('repeated publish/withdraw cycles under one clock tick cannot revive an older withdrawn intent',async t=>{
 const f=fixture(t),p=await f.setup(),job=await f.work(await f.agent(p));const original=Date.now,now=original();Date.now=()=>now;
 try{
  const d=await f.preview(job);await f.publish(job,d);let status=await f.outcomes().mutate({action:'status',postId:d.postId});await f.outcomes().mutate({action:'withdraw',postId:d.postId,digest:status.digest,approve:true});
  const stale=await f.preview(job);await f.publish(job,stale);status=await f.outcomes().mutate({action:'status',postId:d.postId});await f.outcomes().mutate({action:'withdraw',postId:d.postId,digest:status.digest,approve:true});
  await assert.rejects(f.publish(job,stale),{status:409});assert.equal((await f.social().state()).posts.length,0);
 }finally{Date.now=original;}
});
