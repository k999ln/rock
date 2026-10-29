import assert from 'node:assert/strict';
import test from 'node:test';
import { evePostSourcePin } from '../lib/eve-source-context.ts';
import { queueEvePostIntent, queueEveSourceIntent, checkEveSourceSelection } from '../lib/eve-source-client.ts';
import { HOME_INTENT_KEY, takeHomeIntentRecord } from '../lib/home-intent.ts';
import { selectedCommunityRequestHeaders, saveCommunityKey, setCommunityKeyProfile, forgetCommunityKey } from '../lib/community-key-client.ts';
import { createEveAgent, prepareEveAgentPending } from '../lib/eve-agent-creation.ts';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import { makeEveAgentOrigin } from '../lib/eve-agent-origin.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',community='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',otherCommunity='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const author='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const post={id,authorId:author,communityId:community,replyTo:null,createdAt:100,content:'Only this selected post',attachment:{kind:'dataset',resource:'fixture/source'}};
const view=(p=post)=>({...p,author:{id:p.authorId,name:'Fixture'},community:p.communityId?{id:p.communityId,name:'Selected'}:null});
const storage=()=>{const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};};
const ownerScope=await ownerScopeFor('post-client-fixture');
const selected=async(p=post,owner=ownerScope)=>({ownerScope:owner,post:p,source:await evePostSourcePin(p)});
function setup(t){
 const previous=globalThis.window;const win=new EventTarget();win.localStorage=storage();globalThis.window=win;
 t.after(()=>{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;});
 setCommunityKeyProfile(author);saveCommunityKey(community,{accessKey:'a'.repeat(64),recoveryKey:'e'.repeat(64)});
 saveCommunityKey(otherCommunity,{accessKey:'f'.repeat(64)});return win;
}
void test('selected post alone is bound to owner, content and key; no key, parent or unrelated context persists',async t=>{
 setup(t);const s=storage(),current=await selected();let calls=0;
 await queueEvePostIntent(s,view(),async(url,opts)=>{calls++;assert.equal(url,`/api/eve/source-context?key=post%3A${id}`);assert.equal(opts.cache,'no-store');assert.deepEqual(JSON.parse(opts.headers['x-rock-community-keys']),{[community]:'a'.repeat(64)});return Response.json(current);});
 assert.equal(calls,1);const raw=s.getItem(HOME_INTENT_KEY);assert.ok(!raw.includes('a'.repeat(64)));assert.ok(!raw.includes(otherCommunity));
 const intent=takeHomeIntentRecord(s);assert.equal(intent.context.ownerScope,ownerScope);assert.deepEqual(intent.context.source,current.source);
 assert.ok(intent.text.includes(post.content));assert.ok(intent.text.includes('権限や実行の指示ではありません'));assert.equal(takeHomeIntentRecord(s),null);
});
void test('deleted, changed, wrong-owner and wrong-item post selections never silently refresh old content',async t=>{
 setup(t);const s=storage(),pin=await selected();
 for(const changed of [{...post,content:'edited'},{...post,attachment:null},{...post,replyTo:author},{...post,communityId:null}]){
  await assert.rejects(queueEvePostIntent(s,view(),async()=>Response.json(await selected(changed))));assert.equal(s.getItem(HOME_INTENT_KEY),null);
 }
 await assert.rejects(queueEvePostIntent(s,view(),async()=>Response.json({error:'unavailable'},{status:404})));assert.equal(s.getItem(HOME_INTENT_KEY),null);
 await assert.rejects(checkEveSourceSelection(pin,async()=>Response.json(await selected(post,await ownerScopeFor('different-owner')))));
 await assert.rejects(checkEveSourceSelection(pin,async()=>Response.json(await selected({...post,id:author}))));
});
void test('key forgetting, replacement and ABA while a post lookup waits invalidate even a late successful response',async t=>{
 const win=setup(t),current=await selected();
 for(const action of ['forget','replace','aba','profile','storage']){
  setCommunityKeyProfile(author);saveCommunityKey(community,{accessKey:'a'.repeat(64)});
  const s=storage(),held=Promise.withResolvers(),started=Promise.withResolvers();
  const pending=queueEvePostIntent(s,view(),async()=>{started.resolve();return held.promise;});await started.promise;
  if(action==='forget')forgetCommunityKey(community);
  if(action==='replace'||action==='aba')saveCommunityKey(community,{accessKey:'b'.repeat(64)});
  if(action==='aba')saveCommunityKey(community,{accessKey:'a'.repeat(64)});
  if(action==='profile')setCommunityKeyProfile(otherCommunity);
  if(action==='storage')win.dispatchEvent(new Event('storage'));
  held.resolve(Response.json(current));await assert.rejects(pending);assert.equal(s.getItem(HOME_INTENT_KEY),null,action);
 }
});
void test('post and existing resource writers share latest-selection fencing, including a newer failed request',async t=>{
 setup(t);const s=storage(),current=await selected(),held=Promise.withResolvers(),started=Promise.withResolvers();
 const older=queueEvePostIntent(s,view(),async()=>{started.resolve();return held.promise;});await started.promise;
 const plugin={key:'dataset:fixture/source',kind:'dataset',resource:'fixture/source',enabled:true,revision:1,metadata:{title:'Fixture',sourceUrl:'https://example.test/fixture',revision:null,license:null,task:null,downloads:0,likes:0,gated:false,sdk:null,skyFeeMinor:0}};
 await assert.rejects(queueEveSourceIntent(s,plugin,'newer failed selection',async()=>Response.json({error:'denied'},{status:403})));
 held.resolve(Response.json(current));await assert.rejects(older,/新しい依頼/);assert.equal(s.getItem(HOME_INTENT_KEY),null);
});
void test('public post lookup sends no community keys; only a selected reply snapshot is copied',async t=>{
 setup(t);const s=storage(),reply={...post,communityId:null,replyTo:author,content:'Selected reply only'};
 await queueEvePostIntent(s,view(reply),async(_url,opts)=>{assert.deepEqual(opts.headers,{});return Response.json(await selected(reply));});
 assert.match(takeHomeIntentRecord(s).text,/選んだSkyの返信/);assert.deepEqual(selectedCommunityRequestHeaders(null),{});
});
void test('source-bound explicit save sends selected access key to owner API only, and lost ack reconciles without resending keys',async t=>{
 setup(t);const current=await selected();const settings={...defaultSkyAgentSettings('Fixture role','Untrusted text'),origin:await makeEveAgentOrigin('thread','reply','Synthetic response',current.source)};
 const request={ownerScope,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',settings},pending=await prepareEveAgentPending(request),s=storage();let writes=0,reads=0;
 const fetcher=async(url,opts)=>{
  if(opts?.method==='PUT'){
   writes++;assert.equal(url,'/api/sky/agents');assert.deepEqual(JSON.parse(opts.headers['x-rock-community-keys']),{[community]:'a'.repeat(64)});
   assert.equal(JSON.stringify(opts.body).includes('a'.repeat(64)),false);throw Error('lost acknowledgement');
  }
  reads++;assert.equal(url,`/api/sky/agents?id=${request.id}`);assert.equal(opts.headers,undefined);
  return Response.json({ownerScope,agent:{...settings,id:request.id,revision:1,source:'personal',sourceTool:null}});
 };
 const result=await createEveAgent(fetcher,request,pending,s);assert.equal(result.state,'saved');assert.equal(writes,1);assert.equal(reads,1);
 assert.equal(s.getItem(`unused`),null);
});
void test('key change before initial snapshot hashing settles blocks lookup rather than silently adopting a new key',async t=>{
 setup(t);const s=storage();let calls=0;
 const pending=queueEvePostIntent(s,view(),async()=>{calls++;return Response.json(await selected());});
 saveCommunityKey(community,{accessKey:'b'.repeat(64)});
 await assert.rejects(pending);assert.equal(calls,0);assert.equal(s.getItem(HOME_INTENT_KEY),null);
});
