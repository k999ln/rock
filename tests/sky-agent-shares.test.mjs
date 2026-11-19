import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { skyAgentShareStore } from '../lib/sky-agent-share-store.ts';
import { parseAgentShare, agentShareResource, parseAgentShareResource } from '../lib/sky-agent-share.ts';
import { skyAgentLibraryStore, bindSkyAgentLlmInput } from '../lib/sky-agent-library-store.ts';
import { skySocialStore } from '../lib/sky-social-store.ts';
import { communityKeyHash } from '../lib/community-access.ts';

function fixture(t) {
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(`../drizzle/${f}`,import.meta.url),'utf8'));
 const prepare=(query,args=[])=>({ bind(...v){return prepare(query,v)},async first(){return sql.prepare(query).get(...args)??null},async all(){return {results:sql.prepare(query).all(...args)}}, execute(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}},async run(){return this.execute()}});
 const db={prepare,async batch(items){sql.exec('BEGIN');try{const r=items.map(i=>i.execute());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 const keys={alice:{},bob:{},carol:{}};
 const shares=(owner='alice',key=keys[owner])=>skyAgentShareStore(db,owner,key);
 const library=(owner='alice')=>skyAgentLibraryStore(db,owner);
 const social=(owner='alice',key=keys[owner])=>skySocialStore(db,owner,key);
 const settings={name:'引用整理',instructions:'入力の出典URLを保って短く整理する。未確認は未確認と示す。',provider:'ollama',model:'qwen2.5:1.5b',enabled:true};
 return {sql,db,keys,shares,library,social,settings,async setup(){for(const o of Object.keys(keys))await social(o).mutate({action:'profile',name:`Fixture ${o}`});return library().save(randomUUID(),0,settings,true)}};
}
async function publish(f,agent,owner='alice',communityId=null){const d=await f.shares(owner).preview(agent.id,'合成の引用整理担当',communityId);return f.shares(owner).mutate({action:'publish',agentId:agent.id,agentRevision:d.agentRevision,description:d.manifest.description,communityId,expectedVersion:d.expectedVersion,digest:d.digest,license:d.manifest.license,approve:true})}
const add=(f,p,owner='bob',patch={})=>f.shares(owner).mutate({action:'add',id:p.manifest.id,version:p.manifest.version,digest:p.digest,provider:'ollama',model:'qwen2.5:1.5b',approve:true,...patch});

void test('personal version -> B Add -> owner activation/Eve binding -> derivative -> C Add preserves attribution',async t=>{
 const f=fixture(t),a=await f.setup(),p=await publish(f,a); const b=await add(f,p);
 assert.equal(b.agent.enabled,false); assert.equal(b.agent.sourceTool,null); assert.notEqual(b.agent.id,a.id);
 assert.equal(await f.library('carol').get(b.agent.id),null);
 await assert.rejects(bindSkyAgentLlmInput(f.db,'bob',{agentId:b.agent.id,agentRevision:1,provider:'ollama',model:b.agent.model}),{status:409});
 const active=await f.library('bob').save(b.agent.id,1,{...f.settings,enabled:true,instructions:'出典URLを保持して日本語で短く整理する'});
 const bound=await bindSkyAgentLlmInput(f.db,'bob',{agentId:active.id,agentRevision:2,provider:active.provider,model:active.model,baseUrl:'https://forged.invalid'});
 assert.match(bound.system,/日本語/); assert.equal(bound.baseUrl,undefined);
 const derivative=await publish(f,active,'bob'); assert.deepEqual(derivative.manifest.parent,{id:p.manifest.id,version:1,digest:p.digest,author:p.manifest.author,license:p.manifest.license});
 const c=await add(f,derivative,'carol'); assert.match(c.agent.instructions,/日本語/); assert.equal(c.agent.enabled,false);
 assert.equal(await f.library().get(a.id).then(v=>v.revision),1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_connections').get().n,0);
});
void test('canonical manifest rejects credentials/grants/invalid versions and resource trailing junk',async t=>{
 const f=fixture(t),a=await f.setup(),p=await publish(f,a);
 for(const v of [{...p.manifest,credential:'x'},{...p.manifest,agent:{...p.manifest.agent,enabled:true}},{...p.manifest,parent:undefined},{...p.manifest,version:1.5},{...p.manifest,license:'unknown'}]) assert.throws(()=>parseAgentShare(v));
 assert.deepEqual(parseAgentShareResource(agentShareResource(p.manifest.id,1)),{id:p.manifest.id,version:1});
 for(const suffix of ['01','1x','0','101','1:2']) assert.throws(()=>parseAgentShareResource(`${p.manifest.id}:${suffix}`));
});
void test('publish requires exact preview revision/hash/license approval and CAS permits one immutable version',async t=>{
 const f=fixture(t),a=await f.setup(),d=await f.shares().preview(a.id,'合成',null);
 const input={action:'publish',agentId:a.id,agentRevision:1,description:'合成',communityId:null,expectedVersion:0,digest:d.digest,license:'CC-BY-4.0',approve:true};
 for(const patch of [{approve:false},{license:'other'},{digest:'0'.repeat(64)},{agentRevision:2}]) await assert.rejects(f.shares().mutate({...input,...patch}));
 const r=await Promise.allSettled([f.shares().mutate(input),f.shares().mutate(input)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_agent_shares').get().n,1);
 const v2=await publish(f,a);assert.equal(v2.manifest.version,2);assert.equal((await f.shares('bob').read(d.manifest.id,1)).digest,d.digest);
});
void test('owner-scoped imports replay without overwriting later edits or granting execution; model mismatch rejects',async t=>{
 const f=fixture(t),a=await f.setup(),p=await publish(f,a); const first=await add(f,p);assert.equal(first.replayed,false);
 await f.library('bob').save(first.agent.id,1,{...f.settings,name:'本人の変更',enabled:false});
 const replay=await add(f,p);assert.equal(replay.replayed,true);assert.equal(replay.agent.name,'本人の変更');
 await assert.rejects(add(f,p,'bob',{model:'other'}),{status:409});
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_agent_share_installs').get().n,1);
 const current=await f.library('bob').get(first.agent.id);assert.equal(current.revision,2);
});
void test('withdrawal prevents new read/Add while preserving installed private settings and attribution',async t=>{
 const f=fixture(t),a=await f.setup(),p=await publish(f,a),b=await add(f,p);
 await assert.rejects(f.shares('bob').mutate({action:'withdraw',id:p.manifest.id,version:1,digest:p.digest,approve:true}),{status:403});
 await f.shares().mutate({action:'withdraw',id:p.manifest.id,version:1,digest:p.digest,approve:true});
 await assert.rejects(add(f,p,'carol'),{status:410});assert.equal((await f.library('bob').get(b.agent.id)).instructions,a.instructions);
 const derivative=await publish(f,b.agent,'bob');assert.equal(derivative.manifest.parent.digest,p.digest);
 assert.equal((await f.shares().read(p.manifest.id,1)).withdrawn,true);
});
void test('private community requires current key for preview/read/Add and forbids public derivative',async t=>{
 const f=fixture(t),a=await f.setup(),id=randomUUID(),key='a'.repeat(64),recovery='b'.repeat(64);f.keys.alice[id]=key;
 await f.social().mutate({action:'createCommunity',id,name:'合成の場所',description:'合成',rules:'合成のルール',visibility:'members',accessKey:key,recoveryKey:recovery});
 const invite=(await f.social().mutate({action:'invite',id})).invite; const prev=await f.social('bob').mutate({action:'previewInvite',...invite});f.keys.bob[id]='c'.repeat(64);
 await f.social('bob').mutate({action:'join',...invite,confirmRules:true,rulesVersion:prev.community.rulesVersion,accessKey:f.keys.bob[id]});
 const p=await publish(f,a,'alice',id);await assert.rejects(f.shares('bob',{}).read(p.manifest.id,1),{status:403});await assert.rejects(add(f,p,'carol'),{status:403});
 const b=await add(f,p);await assert.rejects(publish(f,b.agent,'bob'),{status:403});
 const derived=await publish(f,b.agent,'bob',id);assert.equal(derived.manifest.communityId,id);
 f.sql.prepare('UPDATE sky_community_keys SET revoked_at=1 WHERE community_id=? AND profile_id=(SELECT id FROM sky_social_profiles WHERE owner_id=?)').run(id,'bob');
 await assert.rejects(f.shares('bob').read(p.manifest.id,1),{status:403}); assert.ok(await f.library('bob').get(b.agent.id));
});
void test('write transaction rechecks source revision and withdrawal before committing',async t=>{
 const f=fixture(t),a=await f.setup(),p=await publish(f,a); const original=f.db.batch.bind(f.db);
 f.db.batch=async items=>{f.sql.prepare('UPDATE sky_agent_shares SET withdrawn_at=1 WHERE id=?').run(p.manifest.id);return original(items)};
 await assert.rejects(add(f,p),{status:409});assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_agent_share_installs').get().n,0);
});
void test('capacity failure and tampered manifest leave no partial install',async t=>{
 const f=fixture(t),a=await f.setup(),p=await publish(f,a);
 const insert=f.sql.prepare('INSERT INTO sky_agent_settings VALUES(?,?,NULL,?,1,1,1)');for(let i=0;i<100;i++)insert.run('bob',randomUUID(),JSON.stringify(f.settings));
 await assert.rejects(add(f,p),{status:409}); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_agent_share_installs').get().n,0);
 f.sql.prepare('UPDATE sky_agent_shares SET manifest=? WHERE id=?').run(JSON.stringify({...p.manifest,description:'tampered'}),p.manifest.id);
 await assert.rejects(f.shares('carol').read(p.manifest.id,1),{status:503});
});
void test('private target configuration is not included in shared manifest',async t=>{
 const f=fixture(t),a=await f.setup(); const p=await publish(f,a);
 assert.deepEqual(Object.keys(p.manifest.agent),['name','instructions','provider','model']);
 assert.equal(JSON.stringify(p.manifest).includes('owner_id'),false);assert.equal(JSON.stringify(p.manifest).includes(a.id),false);
 assert.equal(p.digest,await communityKeyHash(JSON.stringify(p.manifest)));
});
void test('concurrent Add creates one private agent and exactly one first-install response',async t=>{
 const f=fixture(t),a=await f.setup(),p=await publish(f,a);
 const r=await Promise.all([add(f,p),add(f,p)]);assert.equal(new Set(r.map(v=>v.agent.id)).size,1);assert.equal(r.filter(v=>!v.replayed).length,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_agent_share_installs').get().n,1);
});
void test('a shared template can be posted with Add and a forged template reference is rejected',async t=>{
 const f=fixture(t),a=await f.setup(),p=await publish(f,a),id=randomUUID();
 await f.social().mutate({action:'post',id,content:'合成の担当共有',attachment:{kind:'agent-template',resource:agentShareResource(p.manifest.id,1)}});
 const row=f.sql.prepare('SELECT attachment FROM sky_social_posts WHERE id=?').get(id);assert.equal(JSON.parse(row.attachment).kind,'agent-template');
 await assert.rejects(f.social().mutate({action:'post',id:randomUUID(),content:'合成',attachment:{kind:'agent-template',resource:agentShareResource(randomUUID(),1)}}),{status:404});
});
void test('source revision is checked at commit, after the preview and hash have been calculated',async t=>{
 const f=fixture(t),a=await f.setup(),d=await f.shares().preview(a.id,'合成',null);const original=f.db.prepare.bind(f.db);
 f.db.prepare=query=>{const stmt=original(query);if(query.startsWith('INSERT INTO sky_agent_shares')){const bind=stmt.bind.bind(stmt);stmt.bind=(...args)=>{const bound=bind(...args),run=bound.run.bind(bound);bound.run=async()=>{f.sql.prepare('UPDATE sky_agent_settings SET revision=2 WHERE owner_user_id=? AND id=?').run('alice',a.id);return run()};return bound}}return stmt};
 await assert.rejects(f.shares().mutate({action:'publish',agentId:a.id,agentRevision:1,description:'合成',communityId:null,expectedVersion:0,digest:d.digest,license:d.manifest.license,approve:true}),{status:409});
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_agent_shares').get().n,0);
});

void test('author can find immutable versions after reopening and manage a prior publication',async t=>{
 const f=fixture(t),a=await f.setup(),one=await publish(f,a),two=await publish(f,a);
 const mine=await f.shares().mutate({action:'versions',agentId:a.id,communityId:null});assert.equal(mine.id,one.manifest.id);assert.deepEqual(mine.versions.map(v=>v.version),[2,1]);
 assert.deepEqual((await f.shares('bob').versions(a.id,null)).versions,[]);
 await f.shares().mutate({action:'withdraw',id:one.manifest.id,version:1,digest:one.digest,approve:true});
 assert.ok((await f.shares().versions(a.id,null)).versions.find(v=>v.version===1).withdrawnAt);assert.equal((await f.shares('bob').read(two.manifest.id,2)).withdrawn,false);
});
void test('an ambiguous publication can be read by pinned version without creating a new version',async t=>{
 const f=fixture(t),a=await f.setup(),d=await f.shares().preview(a.id,'合成',null),input={action:'publish',agentId:a.id,agentRevision:1,description:'合成',communityId:null,expectedVersion:0,digest:d.digest,license:d.manifest.license,approve:true};
 await f.shares().mutate(input);await assert.rejects(f.shares().mutate(input),{status:409});
 const read=await f.shares().read(d.manifest.id,1);assert.equal(read.mine,true);assert.equal(read.digest,d.digest);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sky_agent_shares').get().n,1);
});
