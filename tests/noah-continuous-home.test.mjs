import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import { world, familyId, hostOf } from './fixtures/noah/connect-world.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { readNoahDirectory } from '../lib/noah-agent-directory.ts';
import { createNoahDirectoryApi } from '../lib/noah-agent-directory-api.ts';
import { createNoahBoardsStore } from '../lib/noah-boards-store.ts';
import { rankNoahDirectory } from '../lib/noah-directory-ranking.ts';

const item=id=>({id,name:id,provider:id,summary:'',host:null,topic:'data',shape:0,savedIn:[]});
const page=(ids,cursor=null)=>({body:{items:ids.map(item),nextCursor:cursor,total:40,ownerScope:null}});
function mount(fetch,props={}) {
  const watchers=new Set();let cards=[];
  const ui=screen({fetch,modules:{'./noah-pin-grid':{default:p=>{cards=p.items;return null;}}},
    hostElement:(_type,p)=>p['data-noah-feed-end']!==undefined?{}:null,
    IntersectionObserver:class {constructor(cb){this.cb=cb;}observe(){watchers.add(this);}disconnect(){watchers.delete(this);}},
  });
  const home=ui.mount('components/noah-pin-home.tsx',props);
  return {ui,home,cards:()=>cards,watchers,enter:()=>{for(const w of watchers)w.cb([{isIntersecting:true}]);}};
}
void test('scrolling appends once, preserves order, deduplicates and stops at the end without a more button',async()=>{
  let resolve;
  const t=mount(async({url})=>url.includes('cursor=0')?page(['a'],'20'):await new Promise(r=>resolve=r));
  await t.home.flush();assert.equal(t.home.find('button','もっと見る').length,0);
  t.enter();t.enter();assert.equal(t.ui.calls.length,2,'observer notifications share the same in-flight request');
  resolve(page(['a','b','b','c']));await t.home.flush();
  assert.deepEqual(Array.from(t.cards(),i=>i.id),['a','b','c']);assert.equal(t.watchers.size,0);
  t.enter();assert.equal(t.ui.calls.length,2);
  await t.home.tick(120000);assert.equal(t.ui.calls.length,2,'no background refresh moves the reader');
});
void test('a failed continuation pauses automatic fetches and explicit retry retains the loaded cards',async()=>{
  let tries=0;
  const t=mount(async({url})=>url.includes('cursor=0')?page(['a'],'20'):++tries===1?{status:503,body:{error:'offline'}}:page(['b']));
  await t.home.flush();t.enter();await t.home.flush();
  assert.equal(t.watchers.size,0);assert.deepEqual(Array.from(t.cards(),i=>i.id),['a']);
  t.enter();assert.equal(tries,1);await t.home.click('再試行');
  assert.deepEqual(Array.from(t.cards(),i=>i.id),['a','b']);
});
void test('late pages from old search conditions cannot enter the replacement collection',async()=>{
  let resolve;const props={searchQuery:''};
  const t=mount(async({url})=>url.includes('q=new')?page(['new']):url.includes('cursor=0')?page(['old'],'20'):await new Promise(r=>resolve=r),props);
  await t.home.flush();t.enter();props.searchQuery='new';t.home.render();resolve(page(['stale']));await t.home.flush();
  assert.deepEqual(Array.from(t.cards(),i=>i.id),['new']);
});
void test('a changed ranking offers a controlled restart rather than silently skipping cards',async()=>{
  const t=mount(async({url})=>url.includes('cursor=0')?page(['a'],'20'):{status:409,body:{error:'一覧が更新されました。',restart:true,ownerScope:null}});
  await t.home.flush();t.enter();await t.home.flush();assert.equal(t.watchers.size,0);
  assert.deepEqual(Array.from(t.cards(),i=>i.id),['a']);await t.home.click('一覧を読み直す');
  assert.equal(t.ui.calls.length,3);assert.ok(t.ui.calls[2].url.includes('cursor=0'));
});
void test('directory recommendation uses saved/followed board facts, unique project identities and scoped continuation',async t=>{
  const w=await world(t,Object.fromEntries(Array.from({length:25},(_,i)=>[hostOf(i+1),mcpServer({tools:[tool('lookup')]})])));
  const entries=await readNoahDirectory({db:w.f.db,listed:true,now:w.f.time});
  entries.forEach((e,i)=>{e.card.provider='provider-'+i;e.card.topic=i%2?'data':'dev';});
  const boards=createNoahBoardsStore(w.f.deps);
  const board=await boards.create('author','Picks','public');
  await boards.save('author',board.id,familyId(25));await boards.follow('viewer',board.id,true);
  const api=createNoahDirectoryApi({...w.as('viewer').deps,directory:async()=>entries});
  const get=async query=>{const r=await api(new Request('https://noah.test/api/noah/discover?source=noah'+query));return {status:r.status,...await r.json()};};
  const first=await get('');assert.equal(first.status,200);assert.equal(first.items[0].id,familyId(25));
  const second=await get('&cursor='+first.nextCursor);assert.equal(second.status,200);assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.items,...second.items].map(i=>i.feedbackId)).size,25);
  assert.equal((await get('&topic=data&cursor='+first.nextCursor)).status,409,'cursor belongs to its filters');
  await boards.hide('viewer',familyId(25),true);
  assert.equal((await get('&cursor='+first.nextCursor)).status,409);
  const refreshed=await get('');assert.equal(refreshed.total,24);assert.ok(refreshed.items.every(i=>i.id!==familyId(25)));
});
void test('directory composition uses the policy pools, not outside stars, and merges family aliases before mixing',async()=>{
  const entries=['personal','hot1','ran','hot2','fresh'].map((id,i)=>({card:{...item(id),feedbackId:'project-'+id,topic:i%2?'dev':'data'},families:[id],observedAt:0}));
  entries[0].families.push('alias');entries[4].hot=9999999;
  const facts=[{id:'hot1',votes:20,hot:100,level:1,fresh:0},{id:'hot2',votes:2,hot:90,level:1,fresh:0},{id:'ran',votes:0,hot:0,level:2,ran:100,fresh:0}];
  const db={prepare:()=>({bind(){return this;},all:async()=>({results:facts})})};
  const ranked=await rankNoahDirectory(entries,db,['alias','personal']);
  assert.deepEqual(ranked.map(e=>e.card.id),['personal','hot1','ran','hot2','fresh']);
});

void test('an account change clears the old collection and starts a fresh scoped request',async()=>{
  let calls=0;
  const t=mount(async()=>++calls===1?page(['old'],'20'):calls===2?{status:409,body:{error:'changed',restart:true,ownerScope:'new-owner'}}:{body:{...page(['new']).body,ownerScope:'new-owner'}});
  await t.home.flush();t.enter();await t.home.flush();
  assert.deepEqual(Array.from(t.cards(),i=>i.id),['new']);assert.equal(t.ui.calls.length,3);
});

void test('compact tabs retain all as default and category changes reset the source without duplicating requests',async()=>{
  const t=mount(async()=>page(['a']));await t.home.flush();
  assert.equal(new URL(t.ui.calls[0].url,'https://noah.test').searchParams.get('source'),'');
  assert.equal(t.home.find('button','すべて')[0].props['aria-pressed'],true);
  await t.home.click('接続できる');
  assert.equal(new URL(t.ui.calls.at(-1).url,'https://noah.test').searchParams.get('source'),'noah');
  await t.home.click('すべて');
  assert.equal(new URL(t.ui.calls.at(-1).url,'https://noah.test').searchParams.get('source'),'');
  assert.equal(t.home.find('button','おすすめ順').length,0,'sort is kept in the compact settings menu');
});
