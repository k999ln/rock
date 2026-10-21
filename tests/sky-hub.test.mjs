import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { xTimelineUrl,hfResource,xTimelineMetadata,X_TIMELINE_CONSENT } from '../lib/sky-hub.ts';
import { searchHuggingFace,huggingFaceMetadata } from '../lib/sky-huggingface.ts';
import { skyHubStore } from '../lib/sky-hub-store.ts';
const metadata={ title:'fixture/model',sourceUrl:'https://huggingface.co/fixture/model',revision:'a'.repeat(40),license:'apache-2.0',task:'text-generation',downloads:1,likes:2,gated:false,sdk:null,skyFeeMinor:0 };
function fixture(t){const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(readFileSync(new URL('../drizzle/0024_sky_hub_plugins.sql',import.meta.url),'utf8'));const db={prepare(sql){return{bind(...args){return{async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}};}};return{db,store:skyHubStore(db,'fixture-owner')};}
void test('X source validation permits only canonical public profiles or lists',()=>{
 assert.equal(xTimelineUrl('https://twitter.com/HuggingFace/'),'https://x.com/huggingface');
 assert.equal(xTimelineUrl('https://x.com/i/lists/123'),'https://x.com/i/lists/123');
 for(const url of ['http://x.com/huggingface','https://x.com/home','https://x.com/a/status/123','https://x.com/a?token=x','https://x.com.evil.invalid/a','https://x.com@evil.invalid/a','https://127.0.0.1/a','https://x.com:444/a']) assert.throws(()=>xTimelineUrl(url));
});
void test('HF search uses a fixed public endpoint and projects bounded untrusted metadata',async()=>{
 let seen;const fetcher=async(url,init)=>{seen={url:new URL(url),init};return Response.json([{id:'fixture/model',private:false,downloads:7,likes:3,tags:['license:apache-2.0'],secret:'must-not-return'},{id:'private/model',private:true},{id:'../attack'}]);};
 const rows=await searchHuggingFace('model','qwen',fetcher);assert.equal(rows.length,1);assert.equal(rows[0].metadata.skyFeeMinor,0);assert.equal(rows[0].metadata.license,'apache-2.0');assert.equal(seen.url.origin,'https://huggingface.co');assert.equal(seen.url.searchParams.get('limit'),'12');assert.equal(seen.init.redirect,'manual');assert.deepEqual(seen.init.headers,{Accept:'application/json'});assert.doesNotMatch(JSON.stringify(rows),/must-not-return/);
});
void test('HF Add verifies exact public identity and pinned revision; malformed/upstream failures do not become success',async()=>{
 assert.equal((await huggingFaceMetadata('model','fixture/model',async()=>Response.json({id:'fixture/model',sha:'a'.repeat(40)}))).revision,'a'.repeat(40));
 await assert.rejects(huggingFaceMetadata('model','fixture/model',async()=>Response.json({id:'different/model',sha:'a'.repeat(40)})));
 await assert.rejects(huggingFaceMetadata('model','fixture/model',async()=>Response.json({id:'fixture/model'})));
 await assert.rejects(searchHuggingFace('model','',async()=>new Response('unavailable',{status:429})),{status:503});
 assert.throws(()=>hfResource('https://another.invalid/anything'));assert.throws(()=>hfResource('a/../../x'));
});
void test('Hub additions persist per owner, reject races, and do not trust client metadata',async t=>{
 const {db,store}=fixture(t);const input={kind:'model',resource:'fixture/model',enabled:true,revision:0};
 const rows=await store.save(input,async()=>metadata);assert.equal(rows[0].revision,1);assert.deepEqual((await skyHubStore(db,'another-owner').list()),[]);
 await assert.rejects(store.save({...input,metadata:{ready:true}},async()=>metadata),{status:400});
 const edits=await Promise.allSettled([store.save({...input,revision:1,enabled:false},async()=>metadata),store.save({...input,revision:1,enabled:false},async()=>metadata)]);assert.equal(edits.filter(e=>e.status==='fulfilled').length,1);assert.equal((await store.list())[0].enabled,false);
});
void test('X Add requires explicit versioned consent; disabling needs no third-party access',async t=>{
 const {store}=fixture(t);const input={kind:'x',resource:'https://x.com/huggingface',enabled:true,revision:0};
 await assert.rejects(store.save(input,async()=>xTimelineMetadata(input.resource)),{status:400});
 await store.save({...input,consentVersion:X_TIMELINE_CONSENT},async()=>xTimelineMetadata(input.resource));
 await store.save({...input,revision:1,enabled:false},async()=>{throw new Error('must not contact X');});
 const row=(await store.list())[0];assert.equal(row.enabled,false);assert.equal(row.consentVersion,X_TIMELINE_CONSENT);
});
