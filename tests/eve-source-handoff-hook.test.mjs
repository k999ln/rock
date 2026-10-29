import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as client from '../lib/eve-source-client.ts';
import { eveSourcePin } from '../lib/eve-source-context.ts';
import { HOME_INTENT_KEY,writeHomeIntent } from '../lib/home-intent.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
const plugin={key:'dataset:fixture/input',kind:'dataset',resource:'fixture/input',enabled:true,revision:1,
  metadata:{title:'Fixture',sourceUrl:'https://huggingface.co/datasets/fixture/input',revision:null,license:'MIT',task:null,downloads:0,likes:0,gated:false,sdk:null,skyFeeMinor:0},consentVersion:null,updatedAt:1};
const selection={ownerScope:await ownerScopeFor('source-hook-owner'),source:await eveSourcePin(plugin),plugin};
const compiled=ts.transpileModule(readFileSync(new URL('../lib/use-eve-source-handoff.ts',import.meta.url),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},
}).outputText;
function harness(){
  let cursor=0,context,held=false,pending,current=selection,updatesAfterUnmount=0,unmounted=false;
  const slots=[],effects=[],rows=new Map(),calls=[],errors=[],navigations=[];
  const storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};
  const react={
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:initial};return [slots[i].value,v=>{if(unmounted)updatesAfterUnmount++;slots[i].value=v;}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},
    useEffect(fn){const i=cursor++;if(!slots[i]){slots[i]={};effects.push(()=>slots[i].cleanup=fn());}},
  };
  const fetcher=async(url,options)=>{calls.push({url,options});if(held){pending=Promise.withResolvers();await pending.promise;}return Response.json(current);};
  const modules={react,'./eve-source-client':client},exports={};
  runInNewContext(compiled,{exports,Error,fetch:fetcher,AbortController,sessionStorage:storage,
    require:name=>{assert.ok(modules[name],name);return {__esModule:true,...modules[name]};}});
  function render(){cursor=0;context=exports.useEveSourceHandoff(()=>navigations.push('chat'),error=>errors.push(error));effects.splice(0).forEach(fn=>fn());}
  async function flush(){
    const deadline=performance.now()+5000;
    do{
      await new Promise(r=>setImmediate(r));render();
      if(!context.preparing || held&&pending)return;
    }while(performance.now()<deadline);
    assert.fail('Source queue did not finish or reach its intentionally held HTTP response');
  }
  render();return {render,flush,storage,calls,errors,navigations,get context(){return context;},get updatesAfterUnmount(){return updatesAfterUnmount;},
    hold(){held=true;},release(){held=false;assert.ok(pending);pending.resolve();},source(v){current=v;},
    unmount(){unmounted=true;slots.forEach(s=>s.cleanup?.());},
  };
}
void test('one explicit handoff writes the verified source once and navigates only after confirmation',async()=>{
 const h=harness();h.hold();const first=h.context.prepare(plugin,'Selected dataset');h.render();assert.equal(h.context.preparing,true);
 const second=h.context.prepare(plugin,'Ignored duplicate');await h.flush();assert.equal(h.calls.length,1);assert.equal(h.storage.getItem(HOME_INTENT_KEY),null);assert.deepEqual(h.navigations,[]);
 h.release();await Promise.all([first,second]);await h.flush();assert.equal(h.context.preparing,false);assert.deepEqual(h.navigations,['chat']);assert.equal(JSON.parse(h.storage.getItem(HOME_INTENT_KEY)).text,'Selected dataset');assert.deepEqual(h.errors,[]);
});
void test('late source lookup after unmount cannot write, navigate or update state',async()=>{
 const h=harness();h.hold();const pending=h.context.prepare(plugin,'Do not retain');await h.flush();h.unmount();h.release();await pending;
 assert.equal(h.storage.getItem(HOME_INTENT_KEY),null);assert.deepEqual(h.navigations,[]);assert.deepEqual(h.errors,[]);assert.equal(h.updatesAfterUnmount,0);
});
void test('changed source before lookup resolves reports error without preserving stale intent',async()=>{
 const h=harness();h.hold();const pending=h.context.prepare(plugin,'Old source');await h.flush();const changed={...plugin,revision:2};h.source({...selection,source:await eveSourcePin(changed),plugin:changed});h.release();await pending;await h.flush();
 assert.equal(h.storage.getItem(HOME_INTENT_KEY),null);assert.deepEqual(h.navigations,[]);assert.equal(h.errors.length,1);assert.equal(h.context.preparing,false);
});


// One evaluated hook module and one shared storage reproduce two simultaneous
// Home surfaces; separate VM globals would hide cross-instance queue races.
function sharedHomeHarness(){
  let active,afterWrite=null;
  const rows=new Map(),requests=[],navigations=[],instances=[];
  const storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>{rows.set(k,v);if(afterWrite){const action=afterWrite;afterWrite=null;queueMicrotask(action);}},removeItem:k=>rows.delete(k)};
  const react={
    useRef(initial){const instance=active,i=instance.cursor++;return instance.slots[i]??={current:initial};},
    useState(initial){const instance=active,i=instance.cursor++;if(!instance.slots[i])instance.slots[i]={value:initial};return [instance.slots[i].value,value=>instance.slots[i].value=value];},
    useEffect(fn){const instance=active,i=instance.cursor++;if(!instance.slots[i]){instance.slots[i]={};instance.effects.push(()=>instance.slots[i].cleanup=fn());}},
  };
  const fetcher=async(url,options)=>{
    const request={url,options,pending:Promise.withResolvers(),released:false,response:null};requests.push(request);
    await request.pending.promise;return request.response??Response.json(selection);
  };
  const modules={react,'./eve-source-client':client},exports={};
  runInNewContext(compiled,{exports,Error,fetch:fetcher,AbortController,sessionStorage:storage,
    require:name=>{assert.ok(modules[name],name);return {__esModule:true,...modules[name]};}});
  function render(instance){active=instance;instance.cursor=0;instance.context=exports.useEveSourceHandoff(()=>navigations.push(instance.name),error=>instance.errors.push(error));instance.effects.splice(0).forEach(fn=>fn());}
  for(const name of ['A-older','B-newer']){
    const instance={name,cursor:0,slots:[],effects:[],errors:[],context:null};instances.push(instance);render(instance);
  }
  async function until(predicate,label){const deadline=performance.now()+5000;while(!predicate()){
    assert.ok(performance.now()<deadline,`Shared Home did not reach ${label}`);await new Promise(r=>setImmediate(r));instances.forEach(render);
  }}
  return {storage,requests,navigations,instances,render,
    supersedeOnNextWrite(text){afterWrite=()=>writeHomeIntent(storage,text);},
    async start(index,text){const instance=instances[index],count=requests.length;const pending=instance.context.prepare(plugin,text);render(instance);await until(()=>requests.length===count+1,'held lookup');return {pending,requestIndex:count};},
    release(index,response){const request=requests[index];assert.ok(request&&!request.released);request.released=true;request.response=response??null;request.pending.resolve();},
    async settle(run){await run.pending;instances.forEach(render);},
    unmount(){for(const instance of instances)for(const slot of instance.slots)slot.cleanup?.();},
  };
}
void test('shared Home queue keeps the newer instance selection when older lookup finishes before navigation cleanup',async t=>{
  const h=sharedHomeHarness();t.after(()=>h.unmount());
  const older=await h.start(0,'A older selection'),newer=await h.start(1,'B newer selection');
  h.release(newer.requestIndex);await h.settle(newer);assert.equal(JSON.parse(h.storage.getItem(HOME_INTENT_KEY)).text,'B newer selection');
  h.release(older.requestIndex);await h.settle(older);
  assert.equal(JSON.parse(h.storage.getItem(HOME_INTENT_KEY)).text,'B newer selection');assert.deepEqual(h.navigations,['B-newer']);
  assert.equal(h.instances[0].context.preparing,false);assert.equal(h.instances[1].context.preparing,false);
});
void test('newer instance failure still invalidates the older pending choice without leaving either instance busy',async t=>{
  const h=sharedHomeHarness();t.after(()=>h.unmount());
  const older=await h.start(0,'A old choice'),newer=await h.start(1,'B failed choice');
  h.release(newer.requestIndex,Response.json({error:'Synthetic source unavailable'},{status:503}));await h.settle(newer);
  h.release(older.requestIndex);await h.settle(older);
  assert.equal(h.storage.getItem(HOME_INTENT_KEY),null);assert.deepEqual(h.navigations,[]);assert.ok(h.instances[1].errors.length);
  assert.equal(h.instances[0].context.preparing,false);assert.equal(h.instances[1].context.preparing,false);
});
void test('legacy Home writer supersedes an in-flight source choice from another active surface',async t=>{
  const h=sharedHomeHarness();t.after(()=>h.unmount());const older=await h.start(0,'A old source');
  writeHomeIntent(h.storage,'Newer legacy request');h.release(older.requestIndex);await h.settle(older);
  assert.equal(JSON.parse(h.storage.getItem(HOME_INTENT_KEY)).text,'Newer legacy request');assert.deepEqual(h.navigations,[]);assert.equal(h.instances[0].context.preparing,false);
});

void test('a newer legacy write between source write and navigation prevents the older hook navigation',async t=>{
  const h=sharedHomeHarness();t.after(()=>h.unmount());const older=await h.start(0,'A source write');
  h.supersedeOnNextWrite('Newer request before navigation');h.release(older.requestIndex);await h.settle(older);
  assert.equal(JSON.parse(h.storage.getItem(HOME_INTENT_KEY)).text,'Newer request before navigation');assert.deepEqual(h.navigations,[]);assert.equal(h.instances[0].context.preparing,false);
});
