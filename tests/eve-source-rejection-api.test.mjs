import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { loadRouteFixture } from './route-fixture.mjs';
import * as library from '../lib/sky-agent-library.ts';
import * as agentStore from '../lib/sky-agent-library-store.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import { eveSourcePin } from '../lib/eve-source-context.ts';
import { makeEveAgentOrigin } from '../lib/eve-agent-origin.ts';
import { createEveAgent,prepareEveAgentPending,readEveAgentPending } from '../lib/eve-agent-creation.ts';

async function fixture(t) {
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')&&!f.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  const db={beforeRun:null,prepare(sql){return{bind(...args){return{
    async all(){return{results:sqlite.prepare(sql).all(...args)};},
    async run(){db.beforeRun?.(sql,args);return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};},
  };}};}};
  class OperationError extends Error { constructor(message,status){super(message);this.status=status;} }
  const route=loadRouteFixture(new URL('../app/api/sky/agents/route.ts',import.meta.url),new Map([
    ['@/lib/fund-store',{database:()=>db,requestUser:async r=>r.headers.get('x-test-owner')}],
    ['@/lib/operations',{OperationError}],['@/lib/owner-intent',ownerIntent],
    ['@/lib/sky-agent-library-store',agentStore],['@/lib/sky-agent-library',library],
  ]));
  const owner='source-rejection-owner',scope=await ownerIntent.ownerScopeFor(owner);
  const plugin={key:'model:fixture/source',kind:'model',resource:'fixture/source',enabled:true,revision:1,
    metadata:{title:'Synthetic',sourceUrl:'https://huggingface.co/fixture/source',revision:null,license:null,
      task:null,downloads:null,likes:null,gated:false,sdk:null,skyFeeMinor:0},consentVersion:null,updatedAt:1};
  sqlite.prepare('INSERT INTO sky_hub_plugins(owner_user_id,plugin_key,kind,resource,enabled,revision,metadata,consent_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(owner,plugin.key,plugin.kind,plugin.resource,1,1,JSON.stringify(plugin.metadata),null,1);
  const settings={...library.defaultSkyAgentSettings('Synthetic role','Owner-confirmed instructions'),
    origin:await makeEveAgentOrigin('synthetic-thread','synthetic-reply','Synthetic reply',await eveSourcePin(plugin))};
  const request={ownerScope:scope,id:randomUUID(),settings},pending=await prepareEveAgentPending(request);
  const rows=new Map(),storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};
  const calls=[];
  async function fetcher(url,init={}){
    const method=init.method??'GET';
    const response=await route[method](new Request(`https://fixture.invalid${url}`,{
      ...init,method,headers:{...init.headers,origin:'https://fixture.invalid','x-test-owner':owner},
    }));
    assert.equal(response.headers.get('cache-control'),'no-store');
    calls.push({method,status:response.status,body:await response.clone().json()});return response;
  }
  const run=()=>createEveAgent(fetcher,request,pending,storage);
  const count=()=>Number(sqlite.prepare('SELECT COUNT(*) AS n FROM sky_agent_settings').get().n);
  return{sqlite,db,owner,scope,settings,request,pending,storage,rows,calls,fetcher,run,count};
}

void test('authoritative stale source API rejection clears pending and permits a fresh confirmed attempt',async t=>{
  const f=await fixture(t);
  f.sqlite.prepare('UPDATE sky_hub_plugins SET enabled=0').run();
  const result=await f.run();
  assert.equal(result.state,'rejected');assert.equal(f.count(),0);assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].status,409);assert.equal(f.calls[0].body.code,'EVE_SOURCE_CHANGED');
  assert.equal(readEveAgentPending(f.storage,f.scope),null);
  f.sqlite.prepare('UPDATE sky_hub_plugins SET enabled=1').run();
  const next={...f.request,id:randomUUID()},record=await prepareEveAgentPending(next);
  const saved=await createEveAgent(f.fetcher,next,record,f.storage);
  assert.equal(saved.state,'saved');assert.equal(f.count(),1);assert.equal(f.rows.size,0);
});

void test('atomic source race is a definitive no-write rejection rather than permanently uncertain create',async t=>{
  const f=await fixture(t);let raced=false;
  f.db.beforeRun=sql=>{if(!raced&&sql.startsWith('INSERT INTO sky_agent_settings')){
    raced=true;f.sqlite.prepare('UPDATE sky_hub_plugins SET revision=2').run();
  }};
  const result=await f.run();
  assert.equal(raced,true);assert.equal(result.state,'rejected');assert.equal(f.count(),0);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.code,'EVE_SOURCE_CHANGED');assert.equal(f.rows.size,0);
});

void test('existing same-ID committed create still reconciles after the source becomes unavailable',async t=>{
  const f=await fixture(t);
  await agentStore.skyAgentLibraryStore(f.db,f.owner).save(f.request.id,0,f.settings,true);
  f.sqlite.prepare('DELETE FROM sky_hub_plugins').run();
  const result=await f.run();
  assert.equal(result.state,'saved');assert.equal(f.count(),1);assert.equal(f.calls.length,2);
  assert.equal(f.calls[0].status,409);assert.equal(Object.hasOwn(f.calls[0].body,'code'),false);
  assert.equal(f.calls[1].method,'GET');assert.equal(f.rows.size,0);
});

void test('concurrent duplicate that commits at INSERT is not mistaken for a source rejection',async t=>{
  const f=await fixture(t);let raced=false;
  f.db.beforeRun=(sql,args)=>{if(!raced&&sql.startsWith('INSERT INTO sky_agent_settings')){
    raced=true;
    f.sqlite.prepare('INSERT INTO sky_agent_settings(owner_user_id,id,source_tool,settings,revision,created_at,updated_at) VALUES(?,?,?,?,1,?,?)')
      .run(...args.slice(0,6));
    f.sqlite.prepare('UPDATE sky_hub_plugins SET enabled=0').run();
  }};
  const result=await f.run();
  assert.equal(raced,true);assert.equal(result.state,'saved');assert.equal(f.count(),1);
  assert.equal(f.calls[0].status,409);assert.equal(Object.hasOwn(f.calls[0].body,'code'),false);
  assert.equal(f.calls[1].method,'GET');assert.equal(f.rows.size,0);
});

void test('different same-ID record retains uncertain pending and is never accepted or overwritten',async t=>{
  const f=await fixture(t);
  await agentStore.skyAgentLibraryStore(f.db,f.owner).save(f.request.id,0,{...f.settings,instructions:'Different saved role'},true);
  f.sqlite.prepare('DELETE FROM sky_hub_plugins').run();
  const result=await f.run();
  assert.equal(result.state,'unknown');assert.equal(f.count(),1);
  assert.deepEqual(readEveAgentPending(f.storage,f.scope),f.pending);
  assert.equal(f.calls[0].status,409);assert.equal(Object.hasOwn(f.calls[0].body,'code'),false);
});

void test('ordinary quota conflict is not misreported as a definitive source rejection',async t=>{
  const f=await fixture(t);
  const insert=f.sqlite.prepare('INSERT INTO sky_agent_settings(owner_user_id,id,source_tool,settings,revision,created_at,updated_at) VALUES(?,?,NULL,?,1,1,1)');
  const settings=JSON.stringify(library.defaultSkyAgentSettings('Existing','Synthetic'));
  for(let i=0;i<100;i++)insert.run(f.owner,randomUUID(),settings);
  const result=await f.run();
  assert.equal(result.state,'unknown');assert.equal(f.count(),100);
  assert.equal(f.calls[0].status,409);assert.equal(Object.hasOwn(f.calls[0].body,'code'),false);
  assert.deepEqual(readEveAgentPending(f.storage,f.scope),f.pending);
});

void test('lost success response reconciles exact origin even when source changes after commit',async t=>{
  const f=await fixture(t);let dropped=false;
  const fetcher=async(url,init)=>{
    const response=await f.fetcher(url,init);
    if(!dropped&&init?.method==='PUT'){
      dropped=true;assert.equal(response.status,200);f.sqlite.prepare('UPDATE sky_hub_plugins SET enabled=0').run();throw new Error('Synthetic dropped acknowledgement');
    }
    return response;
  };
  const result=await createEveAgent(fetcher,f.request,f.pending,f.storage);
  assert.equal(result.state,'saved');assert.deepEqual(result.agent.origin,f.settings.origin);
  assert.equal(f.count(),1);assert.equal(f.calls.length,2);assert.equal(f.rows.size,0);
});
