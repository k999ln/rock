import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createNoahRecommendationsApi, noahRecommendationSettings, noahRecommendationContext } from '../lib/noah-recommendations.ts';
import { createResearchCatalog } from '../lib/noah-research-query.ts';
const noahResearchCatalog=createResearchCatalog(JSON.parse(readFileSync(new URL('../data/noah-research-index.json',import.meta.url),'utf8')));
import { scoreNoahRecommendation } from '../lib/noah-recommendation-policy.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

function fixture(t) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(readFileSync(new URL('../drizzle/0042_noah_recommendations.sql',import.meta.url),'utf8'));
  sql.exec('CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT)');
  let time=1800000000000;const queries=[];
  const db={prepare(query){queries.push(query);return {bind(...args){return {async all(){return {results:sql.prepare(query).all(...args)};}};}};}};
  const api=createNoahRecommendationsApi({db,clock:()=>time,authenticate:async r=>{const owner=r.headers.get('test-owner');if(!owner)throw Error('UNAUTHORIZED');return owner;}});
  async function put(input,owner='alice',headers={}){return api.put(new Request('https://noah.test/api/noah/recommendations',{method:'PUT',headers:{'Content-Type':'application/json',Origin:'https://noah.test','test-owner':owner,'x-rock-owner-scope':await ownerScopeFor(owner),...headers},body:JSON.stringify(input)}));}
  const pref=[{kind:'personalize',subject:'enabled'}];
  const context=async(owner='alice',p=pref,snapshot=time)=>noahRecommendationContext(db,owner,snapshot,await noahRecommendationSettings(db,owner),p,id=>noahResearchCatalog.get(id)?.entry.tags??[]);
  function work(id,owner,start,end,{agent='research-8782e21ebeda898af4b7',state='returned',exitCode=0}={}){
    sql.prepare('INSERT INTO work_jobs VALUES(?,?,?)').run(id,owner,JSON.stringify({noahExecution:{agentId:agent,startedAt:start,completedAt:end,state,prompt:'PRIVATE PROMPT MUST NOT BE READ',result:{exitCode,text:'PRIVATE RESULT MUST NOT BE READ'}}}));
  }
  return {sql,db,api,put,context,work,queries,time:()=>time,advance:n=>time+=n};
}
const setting=(revision=0,more={})=>({revision,historyEnabled:true,runtime:'any',clearHistory:false,...more});

void test('history is opt-in, scoped to owner, successful, completed, and newer than consent',async t=>{
  const f=fixture(t),n=f.time();f.work('old','alice',n-100,n-1);f.work('other','bob',n+1,n+2);
  assert.deepEqual((await f.context()).historyTags,[]);
  assert.equal((await f.put(setting())).status,200);
  f.advance(50);f.work('failed','alice',n+1,n+2,{exitCode:1});f.work('active','alice',n+1,n+2,{state:'running'});
  assert.deepEqual((await f.context()).historyTags,[]);
  f.work('success','alice',n+1,n+20);
  const c=await f.context();assert.ok(c.historyTags.length>0);assert.deepEqual((await f.context('bob')).historyTags,[]);
  assert.deepEqual((await f.context('alice',[])).historyTags,[]);
  assert.ok(!JSON.stringify(c).includes('PRIVATE'));assert.ok(f.queries.filter(q=>q.includes('FROM work_jobs')).every(q=>q.includes('WHERE user_id=?')&&!/SELECT\s+(?:\*|payload)/i.test(q)));
});
void test('clear excludes late completions and old work remains intact; new work can rank',async t=>{
  const f=fixture(t),n=f.time();await f.put(setting());f.advance(20);f.work('one','alice',n+1,n+10);assert.ok((await f.context()).historyTags.length);
  assert.equal((await f.put(setting(1,{clearHistory:true}))).status,200);assert.deepEqual((await f.context()).historyTags,[]);
  f.advance(20);f.work('late','alice',n+2,n+30);assert.deepEqual((await f.context()).historyTags,[]);
  f.work('new','alice',n+21,n+35);assert.ok((await f.context()).historyTags.length);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,3);
  assert.equal((await f.put(setting(2,{historyEnabled:false}))).status,200);assert.deepEqual((await f.context()).historyTags,[]);
  f.advance(20);await f.put(setting(3));assert.deepEqual((await f.context()).historyTags,[]);
});
void test('mutations enforce authentication, origin, owner scope and CAS across concurrent tabs',async t=>{
  const f=fixture(t);assert.equal((await f.put(setting(),'')).status,401);
  assert.equal((await f.put(setting(),'alice',{Origin:'https://attacker.test'})).status,403);
  assert.equal((await f.put(setting(),'alice',{'x-rock-owner-scope':await ownerScopeFor('bob')})).status,409);
  const results=await Promise.all([f.put(setting()),f.put(setting())]);assert.deepEqual(results.map(r=>r.status).sort((a,b)=>a-b),[200,409]);
  assert.equal((await f.put(setting(0))).status,409);assert.equal((await f.put(setting(1,{runtime:'unknown'}))).status,400);
  assert.equal((await f.put({...setting(1),owner:'bob'})).status,400);
});
void test('pagination snapshot excludes later successes and settings changes invalidate old cursors',async t=>{
  const f=fixture(t);await f.put(setting());const n=f.time();f.advance(10);f.work('later','alice',n+1,n+5);
  const old=await f.context('alice',undefined,n),current=await f.context();assert.deepEqual(old.historyTags,[]);assert.ok(current.historyTags.length);
  const first=noahResearchCatalog.list(new URLSearchParams('limit=2'),old,n);assert.ok(first.nextCursor);
  const second=noahResearchCatalog.list(new URLSearchParams({limit:'2',cursor:first.nextCursor}),old,n);assert.ok(second.entries.every(e=>!first.entries.some(p=>p.id===e.id)));
  await f.put(setting(1,{clearHistory:true}));const cleared=await f.context();
  assert.throws(()=>noahResearchCatalog.list(new URLSearchParams({limit:'2',cursor:first.nextCursor}),cleared,n),/最初から/);
});
void test('runtime ranking uses verified adapter declarations; unknown runtimes never acquire capability',()=>{
  const context={enabled:true,fingerprint:'test',interests:[],followed:[],hidden:[],historyTags:['coding'],runtime:'headless'};
  assert.equal(scoreNoahRecommendation({id:'a',author:'x',tags:[]},context).score,0);
  assert.equal(scoreNoahRecommendation({id:'b',author:'x',tags:['coding'],runtime:'local-model'},context).score,15);
  assert.equal(scoreNoahRecommendation({id:'b',author:'x',tags:['coding'],runtime:'local-model'},{...context,enabled:false}).score,0);
  const page=noahResearchCatalog.list(new URLSearchParams('limit=50'),context,1);assert.ok(page.entries[0].reason.includes('画面を使わない'));
});
