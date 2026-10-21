import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { skyXFeed,xFeedSettings,xRetryAt,parseXPosts } from '../lib/sky-x-feed.ts';
const source='https://x.com/huggingface',token='fixture-not-a-real-token';
const settings={token,sources:[source,'https://x.com/fixture'],dailyRequests:8};
const publicUser={data:{id:'123',username:'huggingface',name:'Fixture public author',protected:false}};
const posts={data:[{id:'456',author_id:'123',created_at:'2026-10-20T12:00:00Z',text:'Synthetic fixture; never a live X post.'}]};
function fixture(t){const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(readFileSync(new URL('../drizzle/0025_sky_x_feed_state.sql',import.meta.url),'utf8'));const db={prepare(sql){return{bind(...args){return{async first(){return sqlite.prepare(sql).get(...args)??null;},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}};}};return{db,sqlite};}
void test('X API is disabled unless credentials, approved sources and bounded call limits are explicitly configured',()=>{
 assert.equal(xFeedSettings({}),null);assert.equal(xFeedSettings({SKY_X_BEARER_TOKEN:token}),null);
 const env={SKY_X_API_APPROVED:'1',SKY_X_BEARER_TOKEN:token,SKY_X_API_SOURCES:JSON.stringify([source]),SKY_X_MAX_REQUESTS_PER_DAY:'2'};
 assert.deepEqual(xFeedSettings(env),{token,sources:[source],dailyRequests:2});
 assert.equal(xFeedSettings({...env,SKY_X_API_SOURCES:'["https://private.invalid"]'}),null);assert.equal(xFeedSettings({...env,SKY_X_MAX_REQUESTS_PER_DAY:'99999'}),null);
});
void test('X refresh uses only official fixed endpoints, stores real response fields and reuses fresh cache',async t=>{
 const {db}=fixture(t),seen=[];const service=skyXFeed(db,settings,async(url,init)=>{seen.push({url:new URL(url),init});return Response.json(seen.length===1?publicUser:posts);});
 const value=await service.refresh(source);assert.equal(value.status,'ready');assert.equal(value.posts[0].url,'https://x.com/huggingface/status/456');assert.equal(seen.length,2);assert.equal(seen[1].url.searchParams.get('max_results'),'5');
 for(const request of seen){assert.equal(request.url.origin,'https://api.x.com');assert.equal(request.init.redirect,'manual');assert.equal(request.init.headers.Authorization,`Bearer ${token}`);}
 await service.refresh(source);await service.snapshot(source);assert.equal(seen.length,2);assert.doesNotMatch(JSON.stringify(value),new RegExp(token));
 await assert.rejects(service.refresh('https://x.com/unapproved'),/NOT_APPROVED/);assert.equal(seen.length,2);
});
void test('concurrent X refreshes share one lease instead of multiplying upstream reads',async t=>{
 const {db}=fixture(t);let count=0;const service=skyXFeed(db,settings,async()=>{count++;await new Promise(resolve=>setTimeout(resolve,10));return Response.json(count===1?publicUser:posts);});
 await Promise.all([service.refresh(source),service.refresh(source),service.refresh(source)]);assert.equal(count,2);assert.equal((await service.snapshot(source)).posts.length,1);
});
void test('X 429 obeys reset headers and applies a global cooldown across sources',async t=>{
 const {db}=fixture(t);const now=Date.parse('2026-10-20T12:00:00Z');let count=0;
 const service=skyXFeed(db,settings,async()=>{count++;return new Response(null,{status:429,headers:{'x-rate-limit-reset':String((now+30*60_000)/1000)}});},()=>now);
 const first=await service.refresh(source);assert.equal(first.status,'rate-limited');assert.equal(first.retryAt,now+30*60_000);await service.refresh(source);await service.refresh('https://x.com/fixture');assert.equal(count,1);
 assert.equal(xRetryAt(new Headers({'retry-after':'3600'}),now),now+3600_000);
 assert.equal(xRetryAt(new Headers({'retry-after':new Date(now+3600_000).toUTCString()}),now),now+3600_000);
});
void test('X daily request cap is reserved before each call and API errors do not fabricate posts',async t=>{
 const {db}=fixture(t);let now=Date.parse('2026-10-20T12:00:00Z'),count=0;
 const service=skyXFeed(db,{...settings,dailyRequests:2},async()=>{count++;return Response.json(count===1?publicUser:posts);},()=>now);
 await service.refresh(source);now+=16*60_000;const result=await service.refresh(source);assert.equal(count,2);assert.equal(result.status,'api-limit');assert.equal(result.posts.length,1);assert.ok(result.retryAt>now);
 const noAuth=skyXFeed(fixture(t).db,settings,async()=>new Response(null,{status:401}),()=>now);assert.equal((await noAuth.refresh(source)).posts.length,0);
});
void test('X protected profile and expired cached posts are no longer displayed',async t=>{
 const {db}=fixture(t);let now=Date.parse('2026-10-20T12:00:00Z'),count=0;
 const service=skyXFeed(db,settings,async()=>{count++;return Response.json(count===1?publicUser:count===2?posts:{data:{...publicUser.data,protected:true}});},()=>now);
 await service.refresh(source);now+=16*60_000;const hidden=await service.refresh(source);assert.equal(hidden.status,'source-unavailable');assert.equal(hidden.posts.length,0);
 assert.deepEqual(parseXPosts({meta:{result_count:0}}),[]);assert.throws(()=>parseXPosts({data:[{id:'bad',text:'bad'}]}));
});
void test('X snapshots withhold posts after 24 hours even when upstream is not refreshed',async t=>{
 const {db}=fixture(t);let now=Date.parse('2026-10-20T12:00:00Z'),count=0;
 const service=skyXFeed(db,settings,async()=>Response.json(++count===1?publicUser:posts),()=>now);
 await service.refresh(source);now+=24*60*60_000;assert.equal((await service.snapshot(source)).posts.length,0);assert.equal(count,2);
});
void test('X list refresh with only protected authors clears prior cached posts',async t=>{
 const {db}=fixture(t),list='https://x.com/i/lists/123';let now=Date.parse('2026-10-20T12:00:00Z'),count=0;
 const service=skyXFeed(db,{...settings,sources:[list]},async()=>Response.json({...posts,includes:{users:[{...publicUser.data,protected:++count>1}]}}),()=>now);
 assert.equal((await service.refresh(list)).posts.length,1);now+=16*60_000;const result=await service.refresh(list);assert.equal(result.status,'source-unavailable');assert.equal(result.posts.length,0);
});
void test('X source input cannot turn API fetching into a redirect or arbitrary-host proxy',async t=>{
 const {db}=fixture(t);let calls=0;const service=skyXFeed(db,settings,async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://other.invalid'}});});
 const result=await service.refresh(source);assert.equal(calls,1);assert.equal(result.status,'upstream-error');assert.equal(result.posts.length,0);await assert.rejects(service.refresh('https://x.com@127.0.0.1/x'));assert.equal(calls,1);
});
