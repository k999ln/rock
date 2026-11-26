import test from 'node:test';
import assert from 'node:assert/strict';
import { readNoahDirectory, noahCardIdentity, noahFamilyUrl, noahProjectUrl, selectNoahDirectory } from '../lib/noah-agent-directory.ts';
import { createNoahDirectoryApi } from '../lib/noah-agent-directory-api.ts';
import { createNoahFeedbackApi } from '../lib/noah-feedback.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { world } from './fixtures/noah/connect-world.mjs';
const NOW=Date.UTC(2026,10,22), PROJECT_URL='https://github.com/maker/agent';
const family=(id,url=PROJECT_URL)=>({id,name:'Same Agent',summary:'Works with documents',external_key:'maker/agent',repository:url,record_json:JSON.stringify({repository:{url}}),connect_json:null});
const collected=(source='github',url=PROJECT_URL,extra={})=>({id:source+'-one',source,name:'Same Agent',summary:'Works with documents',author:'maker',url,sourceUrl:source==='x'?'https://x.com/maker/status/123':url,observedAt:NOW,expiresAt:NOW+3600000,...(source==='x'?{summary:'Xで紹介されたAgentのリンクです。内容と利用条件は配布元で確認できます。',author:'@maker'}:{}),...extra});
const bucket=(records)=>({get:async key=>{const source=key.split('/').at(-1).replace('.json','');return records[source]?{json:async()=>({schema:'noah-collection/1',source,collectedAt:NOW,items:records[source]})}:null;}});
const db=(rows)=>({prepare:()=>({first:async()=>null,all:async()=>({results:rows})})});
void test('same project keeps one identity across intake, multiple sources, source filters and promotion',async()=>{
  const dependencies={db:db([family('mcp-registry:maker/a')]),bucket:bucket({github:[collected('github',PROJECT_URL,{metrics:{stars:120}})],x:[collected('x')]}),now:()=>NOW,listed:true};
  const entries=await readNoahDirectory(dependencies);
  assert.equal(entries.length,1);assert.equal(entries[0].families.length,1);assert.equal(entries[0].card.external,undefined);assert.equal(entries[0].card.sources.length,2);
  assert.equal(selectNoahDirectory(entries,'github','').length,1);assert.equal(selectNoahDirectory(entries,'x','')[0].card.feedbackId,entries[0].card.feedbackId);
  const before=await readNoahDirectory({...dependencies,db:db([])});
  assert.equal(before[0].card.external,true);assert.equal(before[0].card.feedbackId,entries[0].card.feedbackId,'promotion cannot reset crowns');
  assert.equal(entries[0].card.users,0,'external stars never become successful users');
});
void test('identity never combines similar names or shared hosts; GitHub casing and .git are normalized',async()=>{
  const records=[collected('github','https://github.com/a/tool'),collected('github','https://github.com/b/tool',{id:'github-two'})];
  const entries=await readNoahDirectory({db:db([]),bucket:bucket({github:records}),now:()=>NOW,listed:true});
  assert.equal(entries.length,2);assert.notEqual(entries[0].card.feedbackId,entries[1].card.feedbackId);
  assert.equal(noahProjectUrl('https://github.com/MAKER/Agent.git/'),PROJECT_URL);
  assert.equal(await noahCardIdentity(noahProjectUrl('https://github.com/MAKER/Agent.git/'),'unused'),await noahCardIdentity(PROJECT_URL,'other'));
  assert.equal(noahProjectUrl('http://127.0.0.1/'),null);
  assert.equal(noahProjectUrl('https://example.com/?token=secret'),null);
  assert.equal(noahFamilyUrl({record_json:'broken',repository:PROJECT_URL,connect_json:null}),null);
});
void test('closed intake stays out, expired discoveries disappear, source and query filters combine',async()=>{
  const entries=await readNoahDirectory({db:db([family('private')]),bucket:bucket({github:[collected(),collected('github','https://github.com/b/old',{id:'old',observedAt:NOW-10000,expiresAt:NOW-1})]}),now:()=>NOW,listed:false});
  assert.equal(entries.length,1);assert.deepEqual(entries[0].families,[]);
  assert.equal(selectNoahDirectory(entries,'noah','').length,0);assert.equal(selectNoahDirectory(entries,'github','documents').length,1);assert.equal(selectNoahDirectory(entries,'x','documents').length,0);
});
void test('reviewed pins survive source aggregation but stay absent while the display gate is closed',async()=>{
  const pin={title:'車を探す',give:'車の条件',get:'車の一覧',scene:{template:'funnel',labels:['車の条件','候補','車の一覧'],parts:[],variant:null}};
  const records={github:[collected('github')],x:[collected('x',PROJECT_URL,{pin})]};
  const hidden=await readNoahDirectory({db:db([]),bucket:bucket(records),now:()=>NOW,listed:true});
  assert.equal(hidden[0].card.pin,undefined);
  const visible=await readNoahDirectory({db:db([]),bucket:bucket(records),now:()=>NOW,listed:true,showGeneratedPins:true});
  assert.deepEqual(visible[0].card.pin,pin);
  assert.equal(visible[0].card.sources.length,2);
});
void test('directory pagination does not duplicate cards and preserves browser owner scopes',async t=>{
  const w=await world(t,[]),scope=await ownerScopeFor('browser-a');
  const entries=await readNoahDirectory({db:db([]),bucket:bucket({github:Array.from({length:25},(_,i)=>collected('github',`https://github.com/a/tool-${i}`,{id:`github-${i}`}))}),now:()=>NOW,listed:true});
  const api=createNoahDirectoryApi({db:w.f.db,authenticate:async()=> 'browser-a',reviewers:['browser-a'],directory:async options=>{
    assert.deepEqual(options,{reviewer:true,showGeneratedPins:true});
    return entries;
  }});
  const get=async q=>{const r=await api(new Request('https://noah.test/api/noah/discover'+q));return {status:r.status,body:await r.json()};};
  const first=await get('');assert.equal(first.status,200);assert.equal(first.body.ownerScope,scope);assert.equal(first.body.items.length,20);
  const second=await get('?cursor='+first.body.nextCursor);assert.equal(second.body.items.length,5);assert.equal(second.body.nextCursor,null);
  assert.equal(new Set([...first.body.items,...second.body.items].map(i=>i.feedbackId)).size,25);
  entries.forEach((entry,index)=>{entry.card.topic=index<22?'data':'learn';});
  const category=await get('?topic=data&source=github&q=documents');
  assert.equal(category.body.total,22);assert.equal(category.body.items.length,20);
  const tail=await get('?topic=data&source=github&q=documents&cursor='+category.body.nextCursor);
  assert.equal(tail.body.nextCursor,null);assert.equal(tail.body.items.length,2);
  assert.ok([...category.body.items,...tail.body.items].every(card=>card.topic==='data'));
  assert.equal((await get('?topic=unknown')).status,400);
  assert.equal((await get('?source=bogus')).status,400);assert.equal((await get('?cursor=-1')).status,400);
  const unavailable=createNoahDirectoryApi({db:w.f.db,authenticate:async()=>{throw Error('AUTH_UNAVAILABLE');},directory:async()=>entries});
  assert.equal((await unavailable(new Request('https://noah.test/api/noah/discover'))).status,503,'authentication failure cannot expose an empty anonymous scope');
});
void test('the same shared feedback ID has one owner vote, supports undo, and never imports stars',async t=>{
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec('CREATE TABLE sky_social_profiles(id TEXT PRIMARY KEY,owner_id TEXT UNIQUE,name TEXT)');
  for(const file of ['0043_noah_runner','0046_noah_feedback'])sql.exec(readFileSync(new URL(`../drizzle-main/${file}.sql`,import.meta.url),'utf8'));
  const prepare=(q,args=[])=>({bind(...next){return prepare(q,next);},async first(){return sql.prepare(q).get(...args)??null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}};}});
  const id=await noahCardIdentity(PROJECT_URL,'ignored'),api=createNoahFeedbackApi({db:{prepare},authenticate:async()=> 'browser-a',publicAgent:value=>value===id,users:async()=>3});
  const post=async(enabled,revision)=>api(new Request('https://noah.test/api/noah/feedback',{method:'POST',headers:{Origin:'https://noah.test','Content-Type':'application/json','X-Rock-Owner-Scope':await ownerScopeFor('browser-a')},body:JSON.stringify({action:'crown',agentId:id,id:randomUUID(),enabled,revision})}));
  const vote=await post(true,0);assert.equal(vote.status,200);assert.equal((await vote.json()).summary.crowns,1);
  const row=await (await api(new Request(`https://noah.test/api/noah/feedback?ids=${id}`))).json();assert.equal(row.summaries[0].crowns,1);assert.equal(row.summaries[0].users,3);
  const stale=await post(true,0);assert.equal(stale.status,409);
  const undo=await post(false,1);assert.equal(undo.status,200);assert.equal((await undo.json()).summary.crowns,0);
});

void test('unified discovery retains source ranking, run hints and malformed-source isolation', async () => {
  const records = {github:[
    collected('github','https://github.com/a/popular',{id:'popular',createdAt:NOW-1000,metrics:{stars:1000},run:'mac'}),
    collected('github','https://github.com/a/recent',{id:'recent',createdAt:NOW,metrics:{stars:0},run:'key'}),
    collected('github','https://github.com/a/blocked',{id:'blocked',name:'NSFW generator',createdAt:NOW}),
  ]};
  const valid=bucket(records);
  const entries=await readNoahDirectory({db:db([]),listed:true,now:()=>NOW,bucket:{get:async key=>key.endsWith('/huggingface.json')?{json:async()=>({schema:'broken'})}:valid.get(key)}});
  assert.equal(entries.length,2);
  assert.match(selectNoahDirectory(entries,'github','')[0].card.href,/popular$/);
  assert.match(selectNoahDirectory(entries,'github','','new')[0].card.href,/recent$/);
  assert.equal(selectNoahDirectory(entries,'github','')[0].card.run,'mac');
  assert.equal(selectNoahDirectory(entries,'github','')[0].card.sources[0].metrics.stars,1000);
});
