import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { defaultSkyAgentSettings, parseSkyAgentSettings } from '../lib/sky-agent-library.ts';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
import { eveSourceContext } from '../lib/eve-source-context-store.ts';
import { eveSourcePin, parseEveSourcePin } from '../lib/eve-source-context.ts';
import { makeEveAgentOrigin, parseEveAgentOrigin } from '../lib/eve-agent-origin.ts';

const owner = 'origin-fixture-owner';
const metadata = () => ({ title:'Synthetic source',sourceUrl:'https://huggingface.co/fixture/source',revision:null,
  license:'MIT',task:'text-generation',downloads:1,likes:0,gated:false,sdk:null,skyFeeMinor:0 });
const role = () => defaultSkyAgentSettings('Synthetic role','Summarize owner-selected input.');
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f => f.endsWith('.sql') && !f.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  const db = { beforeRun:null, prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results:sqlite.prepare(sql).all(...args) }; },
    async run() { db.beforeRun?.(sql,args); return { meta:{ changes:Number(sqlite.prepare(sql).run(...args).changes) } }; },
  }; } }; } };
  const source = { key:'model:fixture/source',kind:'model',resource:'fixture/source',enabled:true,revision:1,
    metadata:metadata(),consentVersion:null,updatedAt:1000 };
  function insertSource(sourceOwner=owner, patch={}) {
    const value={...source,...patch};
    sqlite.prepare('INSERT INTO sky_hub_plugins(owner_user_id,plugin_key,kind,resource,enabled,revision,metadata,consent_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(sourceOwner,value.key,value.kind,value.resource,Number(value.enabled),value.revision,JSON.stringify(value.metadata),value.consentVersion,value.updatedAt);
    return value;
  }
  const store = skyAgentLibraryStore(db,owner);
  const count = () => Number(sqlite.prepare('SELECT COUNT(*) AS n FROM sky_agent_settings').get().n);
  return {sqlite,db,source,store,insertSource,count};
}
async function sourced(source) {
  return {...role(),origin:await makeEveAgentOrigin('synthetic-thread','synthetic-reply','Synthetic reply text',await eveSourcePin(source))};
}

void test('source-bound role persists owner-declared reply history and unknown upstream revision without gaining authority',async t=>{
  const f=fixture(t),source=f.insertSource(),settings=await sourced(source),id=randomUUID();
  const context=await eveSourceContext(f.db,owner,source.key);
  assert.deepEqual(context.source,settings.origin.source);
  assert.equal(context.plugin.metadata.revision,null);
  const saved=await f.store.save(id,0,settings,true);
  assert.equal(saved.revision,1);assert.deepEqual(saved.origin,settings.origin);
  assert.equal(Object.hasOwn(saved.origin,'executionAuthorized'),false);
  assert.deepEqual((await skyAgentLibraryStore(f.db,owner).get(id)).origin,settings.origin);
  assert.equal(await skyAgentLibraryStore(f.db,'other-owner').get(id),null);
});

void test('a different owner cannot use an existing owner source pin to create an Agent',async t=>{
  const f=fixture(t),settings=await sourced(f.insertSource());
  await assert.rejects(eveSourceContext(f.db,'other-owner',f.source.key),{status:409});
  await assert.rejects(skyAgentLibraryStore(f.db,'other-owner').save(randomUUID(),0,settings,true),{status:409});
  assert.equal(f.count(),0);
});

void test('disabled, removed, revised or metadata-changed sources reject stale creates without writing',async t=>{
  for(const change of ['disable','remove','revision','metadata']) await t.test(change,async t=>{
    const f=fixture(t),settings=await sourced(f.insertSource());
    if(change==='disable')f.sqlite.prepare('UPDATE sky_hub_plugins SET enabled=0').run();
    if(change==='remove')f.sqlite.prepare('DELETE FROM sky_hub_plugins').run();
    if(change==='revision')f.sqlite.prepare('UPDATE sky_hub_plugins SET revision=revision+1').run();
    if(change==='metadata')f.sqlite.prepare('UPDATE sky_hub_plugins SET metadata=?').run(JSON.stringify({...metadata(),revision:'new-upstream-revision'}));
    await assert.rejects(f.store.save(randomUUID(),0,settings,true),{status:409});
    assert.equal(f.count(),0);
  });
});

void test('source changes between authenticated read and actual INSERT fail atomically',async t=>{
  for(const change of ['disable','remove','revision','metadata','owner','key']) await t.test(change,async t=>{
    const f=fixture(t),settings=await sourced(f.insertSource());let raced=false;
    f.db.beforeRun=sql=>{
      if(raced || !sql.startsWith('INSERT INTO sky_agent_settings'))return;
      raced=true;
      if(change==='disable')f.sqlite.prepare('UPDATE sky_hub_plugins SET enabled=0').run();
      if(change==='remove')f.sqlite.prepare('DELETE FROM sky_hub_plugins').run();
      if(change==='revision')f.sqlite.prepare('UPDATE sky_hub_plugins SET revision=revision+1').run();
      if(change==='metadata')f.sqlite.prepare('UPDATE sky_hub_plugins SET metadata=?').run(JSON.stringify({...metadata(),license:'changed'}));
      if(change==='owner')f.sqlite.prepare('UPDATE sky_hub_plugins SET owner_user_id=?').run('other-owner');
      if(change==='key')f.sqlite.prepare('UPDATE sky_hub_plugins SET plugin_key=?').run('model:fixture/other');
    };
    await assert.rejects(f.store.save(randomUUID(),0,settings,true),{status:409});
    assert.equal(raced,true);assert.equal(f.count(),0);
  });
});

void test('legacy edits retain immutable origin even after source removal, without bypassing Agent revision or owner',async t=>{
  const f=fixture(t),settings=await sourced(f.insertSource()),saved=await f.store.save(randomUUID(),0,settings,true);
  f.sqlite.prepare('DELETE FROM sky_hub_plugins').run();
  const legacy={...role(),name:'Edited by old client'};
  const updated=await f.store.save(saved.id,1,legacy);
  assert.equal(updated.revision,2);assert.deepEqual(updated.origin,saved.origin);
  assert.equal(updated.name,legacy.name);
  await assert.rejects(f.store.save(saved.id,1,legacy),{status:409});
  await assert.rejects(skyAgentLibraryStore(f.db,'other-owner').save(saved.id,2,legacy),{status:404});
  assert.deepEqual(await f.store.get(saved.id),updated);
});

void test('existing origin cannot be changed, cleared, or replaced by a new source',async t=>{
  const f=fixture(t),settings=await sourced(f.insertSource()),saved=await f.store.save(randomUUID(),0,settings,true);
  const origin=saved.origin;
  for(const changed of [{...origin,threadId:'different-thread'},{...origin,replyId:'different-reply'},
    {...origin,replySha256:'a'.repeat(64)},{...origin,source:{...origin.source,revision:2}},
    {schema:origin.schema,threadId:origin.threadId,replyId:origin.replyId,replySha256:origin.replySha256}]) {
    await assert.rejects(f.store.save(saved.id,1,{...role(),origin:changed}),{status:409});
  }
  await assert.rejects(f.store.save(saved.id,1,{...role(),origin:null}),{status:400});
  assert.deepEqual((await f.store.get(saved.id)).origin,origin);assert.equal((await f.store.get(saved.id)).revision,1);
});

void test('legacy Agents remain origin-free and cannot acquire fabricated historical origin on update',async t=>{
  const f=fixture(t),saved=await f.store.save(randomUUID(),0,role(),true);
  const origin=await makeEveAgentOrigin('synthetic-thread','synthetic-reply','Synthetic reply text');
  await assert.rejects(f.store.save(saved.id,1,{...role(),origin}),{status:409});
  const updated=await f.store.save(saved.id,1,{...role(),name:'Ordinary edit'});
  assert.equal(Object.hasOwn(updated,'origin'),false);assert.equal(updated.revision,2);
});

void test('history without a marketplace source is explicitly owner-declared and valid, never upgraded into model attestation',async t=>{
  const f=fixture(t),origin=await makeEveAgentOrigin('synthetic-thread','synthetic-reply','Owner-selected synthetic reply');
  const saved=await f.store.save(randomUUID(),0,{...role(),origin},true);
  assert.deepEqual(saved.origin,origin);assert.equal(Object.hasOwn(origin,'source'),false);
  assert.throws(()=>parseEveAgentOrigin({...origin,modelVerified:true}));
  assert.throws(()=>parseSkyAgentSettings({...role(),origin:{...origin,grant:'network'}}));
});

void test('source and origin parsers fail closed for unsupported versions, malformed identities and grants',async t=>{
  const f=fixture(t),settings=await sourced(f.insertSource()),origin=settings.origin,pin=origin.source;
  for(const patch of [{schema:'rockstaros.eve-source/2'},{key:'x:https://x.com/fixture'},{revision:0},
    {revision:1.1},{metadataSha256:'not-a-hash'},{permission:'network'}])
    assert.throws(()=>parseEveSourcePin({...pin,...patch}));
  for(const patch of [{schema:'rockstaros.eve-agent-origin/2'},{threadId:''},{replyId:'bad/id'},
    {replySha256:'bad'},{approved:true},{source:null}])
    assert.throws(()=>parseEveAgentOrigin({...origin,...patch}));
});
