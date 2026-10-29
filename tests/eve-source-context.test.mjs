import assert from 'node:assert/strict';
import test from 'node:test';
import { eveSourcePin,parseEveSourcePin } from '../lib/eve-source-context.ts';
import { checkEveSourceSelection,queueEveSourceIntent,readEveSourceSelection } from '../lib/eve-source-client.ts';
import { takeHomeIntentRecord,writeHomeIntent,HOME_INTENT_KEY } from '../lib/home-intent.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
const plugin={key:'model:fixture/source',kind:'model',resource:'fixture/source',enabled:true,revision:1,
 metadata:{title:'Fixture',sourceUrl:'https://huggingface.co/fixture/source',revision:null,license:'MIT',task:null,downloads:0,likes:0,gated:false,sdk:null,skyFeeMinor:0},consentVersion:null,updatedAt:100};
const storage=()=>{const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};};
const ownerScope=await ownerScopeFor('fixture-owner');
const selection=async(p=plugin,owner=ownerScope)=>({ownerScope:owner,source:await eveSourcePin(p),plugin:p});
void test('only explicitly selected saved resource is queued with owner and exact metadata, then consumed once',async()=>{
 const s=storage();let calls=0;const current=await selection();
 await queueEveSourceIntent(s,plugin,'Selected resource request',async(url,options)=>{
  calls++;assert.equal(url,'/api/eve/source-context?key=model%3Afixture%2Fsource');assert.equal(options.cache,'no-store');return Response.json(current);
 });
 assert.equal(calls,1);const record=takeHomeIntentRecord(s);assert.equal(record.text,'Selected resource request');assert.deepEqual(record.context,{ownerScope,source:current.source});assert.equal(takeHomeIntentRecord(s),null);
});
void test('changed source cannot silently become the selected version',async()=>{
 const s=storage();
 for(const patch of [{revision:2},{metadata:{...plugin.metadata,revision:'different'}},{enabled:false}]){
  await assert.rejects(queueEveSourceIntent(s,plugin,'Request',async()=>Response.json(await selection({...plugin,...patch}))));
  assert.equal(s.getItem(HOME_INTENT_KEY),null);
 }
});
void test('owner change and source metadata/local-version change refuse fresh use',async()=>{
 const pinned=await selection();
 for(const current of [await selection(plugin,await ownerScopeFor('other-owner')),await selection({...plugin,revision:2}),await selection({...plugin,metadata:{...plugin.metadata,license:'different'}})])
  await assert.rejects(checkEveSourceSelection(pinned,async()=>Response.json(current)));
});
void test('unavailable, malformed, wrong source and aborted lookups never write an intent',async()=>{
 for(const response of [Response.json({error:'unavailable'},{status:503}),Response.json({...await selection(),source:{...await eveSourcePin(plugin),key:'model:fixture/other'}}),Response.json({...await selection(),ownerScope:'raw-user-id'}),Response.json({...await selection(),plugin:null})]) {
  const s=storage();await assert.rejects(queueEveSourceIntent(s,plugin,'Request',async()=>response));assert.equal(s.getItem(HOME_INTENT_KEY),null);
 }
 const c=new AbortController(),pending=Promise.withResolvers(),s=storage();
 const work=queueEveSourceIntent(s,plugin,'Request',async()=>{await pending.promise;return Response.json(await selection());},c.signal);
 c.abort();pending.resolve();await assert.rejects(work);assert.equal(s.getItem(HOME_INTENT_KEY),null);
});
void test('legacy text handoff works but malformed bound context cannot downgrade into plain text',async()=>{
 const s=storage();writeHomeIntent(s,'Legacy',100);assert.equal(takeHomeIntentRecord(s,101).text,'Legacy');
 for(const context of [null,{}, {ownerScope,source:{...await eveSourcePin(plugin),schema:'future'}},{ownerScope:'user',source:await eveSourcePin(plugin)}]){
  s.setItem(HOME_INTENT_KEY,JSON.stringify({text:'must not downgrade',at:100,context}));assert.equal(takeHomeIntentRecord(s,101),null);
 }
});
void test('source schema is strict; local plugin revision does not fill unknown upstream revision',async()=>{
 const pin=await eveSourcePin(plugin);assert.equal(plugin.metadata.revision,null);assert.equal(pin.revision,1);
 for(const patch of [{revision:0},{revision:1.5},{schema:'rockstaros.eve-source/2'},{grant:true},{metadataSha256:'bad'},{key:'model:../private'},{key:'x:https://x.com/example'}])assert.throws(()=>parseEveSourcePin({...pin,...patch}));
 const first=await readEveSourceSelection(plugin.key,async()=>Response.json(await selection()));assert.deepEqual(first.source,pin);
});

void test('two helpers share latest selection: a late older response cannot overwrite the newer intent', async () => {
 const s=storage(), current=await selection(), first=Promise.withResolvers(), second=Promise.withResolvers();
 const firstStarted=Promise.withResolvers(),secondStarted=Promise.withResolvers();
 const older=queueEveSourceIntent(s,plugin,'Older selected source',async()=>{firstStarted.resolve();return first.promise;});
 await firstStarted.promise;
 const newer=queueEveSourceIntent(s,plugin,'Newer selected source',async()=>{secondStarted.resolve();return second.promise;});
 assert.equal(s.getItem(HOME_INTENT_KEY),null,'new selection clears the shared slot synchronously');
 await secondStarted.promise;second.resolve(Response.json(current));const permit=await newer;
 assert.equal(permit.isCurrent(),true);assert.equal(JSON.parse(s.getItem(HOME_INTENT_KEY)).text,'Newer selected source');
 first.resolve(Response.json(current));await assert.rejects(older,/新しい依頼/);
 assert.equal(JSON.parse(s.getItem(HOME_INTENT_KEY)).text,'Newer selected source');assert.equal(permit.isCurrent(),true);
});
void test('a newer failed helper still invalidates the older lookup and clears any previous completed intent',async()=>{
 const s=storage(),current=await selection();
 const completed=await queueEveSourceIntent(s,plugin,'Previously completed source',async()=>Response.json(current));
 assert.equal(completed.isCurrent(),true);
 const first=Promise.withResolvers(),started=Promise.withResolvers();
 const older=queueEveSourceIntent(s,plugin,'Older in flight',async()=>{started.resolve();return first.promise;});
 assert.equal(s.getItem(HOME_INTENT_KEY),null);assert.equal(completed.isCurrent(),false);
 await started.promise;
 const newer=queueEveSourceIntent(s,plugin,'Newer failed selection',async()=>Response.json({error:'fixture lookup failed'},{status:503}));
 assert.equal(s.getItem(HOME_INTENT_KEY),null);
 await assert.rejects(newer,/fixture lookup failed/);
 first.resolve(Response.json(current));await assert.rejects(older,/新しい依頼/);
 assert.equal(s.getItem(HOME_INTENT_KEY),null,'failed newer choice must not revive the old source');
});
void test('legacy writes supersede source helpers and setter-only legacy callers remain supported',async()=>{
 const s=storage(),current=await selection(),pending=Promise.withResolvers(),started=Promise.withResolvers();
 const work=queueEveSourceIntent(s,plugin,'Old source',async()=>{started.resolve();return pending.promise;});await started.promise;
 writeHomeIntent(s,'Explicit legacy request');
 pending.resolve(Response.json(current));await assert.rejects(work,/新しい依頼/);
 assert.equal(takeHomeIntentRecord(s).text,'Explicit legacy request');
 const records=[];writeHomeIntent({setItem:(key,value)=>records.push([key,value])},'Setter-only legacy',100);
 assert.equal(records[0][0],HOME_INTENT_KEY);assert.deepEqual(JSON.parse(records[0][1]),{text:'Setter-only legacy',at:100});
});
void test('denied or unverifiable deletion blocks lookup and invalidates completed selection permits',async()=>{
 const current=await selection();
 for(const mode of ['denied','no-op','unreadable']){
  const s=storage(),old=await queueEveSourceIntent(s,plugin,'Previous source',async()=>Response.json(current));
  const remove=s.removeItem,read=s.getItem;let fetches=0;
  if(mode==='denied')s.removeItem=()=>{throw new Error('storage removal denied');};
  else if(mode==='no-op')s.removeItem=()=>{};
  else s.getItem=()=>{throw new Error('storage read denied');};
  await assert.rejects(queueEveSourceIntent(s,plugin,'New selection',async()=>{fetches++;return Response.json(current);}));
  assert.equal(fetches,0,mode);assert.equal(old.isCurrent(),false,mode);
  s.removeItem=remove;s.getItem=read;
  const next=await queueEveSourceIntent(s,plugin,'Explicit recovery',async()=>Response.json(current));
  assert.equal(next.isCurrent(),true);assert.equal(takeHomeIntentRecord(s).text,'Explicit recovery');
 }
});
