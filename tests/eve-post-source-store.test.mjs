import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { postSourceFixture } from './helpers/eve-post-source-fixture.mjs';
import { eveSourceContext } from '../lib/eve-source-context-store.ts';
import { evePostSourcePin,parseEveSourcePin,sameEveSource } from '../lib/eve-source-context.ts';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';

void test('exact selected keyed reply returns only its content and immutable owner-confirmed origin saves/reloads',async t=>{
  const f=await postSourceFixture(t),c=await f.context();
  assert.deepEqual(Object.keys(c).sort(),['post','source']);assert.equal(c.post.id,f.postId);assert.equal(c.post.replyTo,f.parentId);
  assert.equal(c.post.content,'Selected fixture text');assert.equal(JSON.stringify(c).includes('Unselected private parent'),false);assert.equal(JSON.stringify(c).includes(f.key),false);
  assert.equal(c.source.schema,'rockstaros.eve-post-source/1');assert.equal(c.source.post.communityId,f.communityId);
  assert.deepEqual(await evePostSourcePin({...c.post,likes:500}),c.source);
  const settings=await f.settings(),saved=await f.store().save(randomUUID(),0,settings,true);
  assert.equal(saved.revision,1);assert.deepEqual(saved.origin,settings.origin);assert.deepEqual((await f.store().get(saved.id)).origin,settings.origin);
  f.sqlite.prepare('UPDATE sky_community_keys SET revoked_at=2').run();
  const legacy=await f.store().save(saved.id,1,{name:'Legacy edit',instructions:'Still editable',provider:saved.provider,model:saved.model,enabled:true});
  assert.deepEqual(legacy.origin,saved.origin);await assert.rejects(f.store().save(saved.id,1,{name:'Stale edit',instructions:'Still editable',provider:saved.provider,model:saved.model,enabled:true}),{status:409});
  assert.equal(await skyAgentLibraryStore(f.db,'unrelated-reader').get(saved.id),null);
});
void test('public selected post still binds the authenticated profile and returns no thread or unrelated rows',async t=>{
  const f=await postSourceFixture(t),id=randomUUID();f.insert(id,{content:'Public selected'});
  const c=await eveSourceContext(f.db,f.owner,`post:${id}`);assert.equal(c.post.content,'Public selected');assert.equal(c.source.post.communityId,null);
  await assert.rejects(eveSourceContext(f.db,'no-profile',`post:${id}`),{status:409});
});
void test('missing/wrong/stolen key, another owner, revoke, leave, archive and deletion deny selected private source',async t=>{
  for(const change of ['missing','wrong','other-owner','revoked','leave','archive','delete','parent-delete','parent-move'])await t.test(change,async t=>{
    const f=await postSourceFixture(t);let owner=f.owner,keys=f.keys;
    if(change==='missing')keys={};if(change==='wrong')keys={[f.communityId]:'b'.repeat(64)};if(change==='other-owner')owner=f.author;
    if(change==='revoked')f.sqlite.prepare('UPDATE sky_community_keys SET revoked_at=2').run();
    if(change==='leave')f.sqlite.prepare('DELETE FROM sky_community_members').run();if(change==='archive')f.sqlite.prepare('UPDATE sky_communities SET archived_at=2').run();
    if(change==='delete')f.sqlite.prepare('DELETE FROM sky_social_posts WHERE id=?').run(f.postId);
    if(change==='parent-delete')f.sqlite.prepare('DELETE FROM sky_social_posts WHERE id=?').run(f.parentId);
    if(change==='parent-move')f.sqlite.prepare('UPDATE sky_social_posts SET community_id=NULL WHERE id=?').run(f.parentId);
    await assert.rejects(eveSourceContext(f.db,owner,`post:${f.postId}`,keys),{status:409});
  });
});
void test('source SELECT evaluates revocation atomically after key hashing rather than a prior allowed list',async t=>{
  const f=await postSourceFixture(t);let hit=false;f.db.beforeFirst=sql=>{if(sql.includes('FROM sky_social_posts s JOIN sky_social_profiles viewer')){hit=true;f.sqlite.prepare('UPDATE sky_community_keys SET revoked_at=2').run();}};
  await assert.rejects(f.context(),{status:409});assert.equal(hit,true);
});
void test('Agent INSERT rejects read-to-write changes atomically with definite no-write source code',async t=>{
  for(const change of ['revoke','key','leave','archive','delete','content','attachment','author','community','reply','createdAt','owner-profile','parent-delete'])await t.test(change,async t=>{
    const f=await postSourceFixture(t),settings=await f.settings();let hit=false;
    f.db.beforeRun=sql=>{if(hit||!sql.startsWith('INSERT INTO sky_agent_settings'))return;hit=true;
      if(change==='revoke')f.sqlite.prepare('UPDATE sky_community_keys SET revoked_at=2').run();
      if(change==='key')f.sqlite.prepare('UPDATE sky_community_keys SET key_hash=?').run('b'.repeat(64));
      if(change==='leave')f.sqlite.prepare('DELETE FROM sky_community_members').run();if(change==='archive')f.sqlite.prepare('UPDATE sky_communities SET archived_at=2').run();
      if(change==='delete')f.sqlite.prepare('DELETE FROM sky_social_posts WHERE id=?').run(f.postId);
      if(change==='content')f.sqlite.prepare('UPDATE sky_social_posts SET content=? WHERE id=?').run('Changed',f.postId);
      if(change==='attachment')f.sqlite.prepare('UPDATE sky_social_posts SET attachment=? WHERE id=?').run(JSON.stringify({kind:'dataset',resource:'fixture/other'}),f.postId);
      if(change==='author')f.sqlite.prepare('UPDATE sky_social_posts SET author_id=? WHERE id=?').run(f.profileId,f.postId);
      if(change==='community')f.sqlite.prepare('UPDATE sky_social_posts SET community_id=NULL WHERE id=?').run(f.postId);
      if(change==='reply')f.sqlite.prepare('UPDATE sky_social_posts SET reply_to=NULL WHERE id=?').run(f.postId);
      if(change==='createdAt')f.sqlite.prepare('UPDATE sky_social_posts SET created_at=2 WHERE id=?').run(f.postId);
      if(change==='owner-profile')f.sqlite.prepare('UPDATE sky_social_profiles SET owner_id=? WHERE id=?').run('changed-owner',f.profileId);
      if(change==='parent-delete')f.sqlite.prepare('DELETE FROM sky_social_posts WHERE id=?').run(f.parentId);
    };
    await assert.rejects(f.store().save(randomUUID(),0,settings,true),{status:409,code:'EVE_SOURCE_CHANGED'});assert.equal(hit,true);assert.equal(f.count(),0);
  });
});
void test('attachment property order is not a new source; semantic changes remain rejected',async t=>{
  const f=await postSourceFixture(t),settings=await f.settings();f.sqlite.prepare('UPDATE sky_social_posts SET attachment=? WHERE id=?').run('{"resource":"fixture/selected", "kind":"dataset"}',f.postId);
  assert.equal(sameEveSource((await f.context()).source,settings.origin.source),true);assert.equal((await f.store().save(randomUUID(),0,settings,true)).revision,1);
});
void test('concurrent committed same-ID insert remains generic conflict/readback even if key revoked afterward',async t=>{
  const f=await postSourceFixture(t),id=randomUUID(),settings=await f.settings();let hit=false;
  f.db.beforeRun=sql=>{if(hit||!sql.startsWith('INSERT INTO sky_agent_settings'))return;hit=true;
    f.sqlite.prepare('INSERT INTO sky_agent_settings(owner_user_id,id,source_tool,settings,revision,created_at,updated_at) VALUES(?,?,NULL,?,1,1,1)').run(f.owner,id,JSON.stringify(settings));
    f.sqlite.prepare('UPDATE sky_community_keys SET revoked_at=2').run();};
  await assert.rejects(f.store().save(id,0,settings,true),e=>e.status===409&&e.code===undefined);assert.equal(f.count(),1);assert.deepEqual((await f.store().get(id)).origin,settings.origin);
});
void test('post pin parser is strict and cannot be downgraded into a saved-resource pin or carry grants',async t=>{
  const f=await postSourceFixture(t),source=(await f.context()).source;
  for(const v of [{...source,grant:true},{...source,key:`post:${randomUUID()}`},{...source,post:{...source.post,permission:'root'}},{...source,schema:'rockstaros.eve-source/1'},{...source,post:{...source.post,createdAt:NaN}}])assert.throws(()=>parseEveSourcePin(v));
});
