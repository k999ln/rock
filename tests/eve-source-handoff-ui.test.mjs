import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as home from '../lib/home-intent.ts';
import * as client from '../lib/eve-source-client.ts';
import { eveSourcePin } from '../lib/eve-source-context.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

const plugin = { key:'model:fixture/source',kind:'model',resource:'fixture/source',enabled:true,revision:1,
  metadata:{title:'Fixture',sourceUrl:'https://huggingface.co/fixture/source',revision:null,license:'MIT',task:null,downloads:0,likes:0,gated:false,sdk:null,skyFeeMinor:0},consentVersion:null,updatedAt:100 };
const initialSelection = {ownerScope:await ownerScopeFor('ui-fixture-owner'),source:await eveSourcePin(plugin),plugin};
const compiled=ts.transpileModule(readFileSync(new URL('../components/eve-source-handoff.tsx',import.meta.url),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
}).outputText;
function harness({bound=true}={}) {
  let cursor=0,enabled=true,thread='',context,tree,current=initialSelection,now=Date.now(),holdNext=false,unmounted=false,updatesAfterUnmount=0,activeChecks=0;
  const slots=[],effects=[],frames=new Map(),rows=new Map(),requests=[],drafts=[];
  const storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};
  home.writeHomeIntent(storage,'Selected source request',now,bound?{ownerScope:current.ownerScope,source:current.source}:undefined);
  const same=(a,b)=>a?.length===b?.length&&a.every((v,i)=>v===b[i]);
  const react={
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{if(unmounted)updatesAfterUnmount++;slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const before=slots[i];slots[i]={deps};effects.push(()=>{before?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  const fetcher=async(url,options={})=>{
    const request={url,options};requests.push(request);
    if(holdNext){holdNext=false;request.pending=Promise.withResolvers();await request.pending.promise;}
    return Response.json(current);
  };
  const jsx=(type,props)=>({type,props});
  const modules={react,'react/jsx-runtime':{jsx,jsxs:jsx},
    '@/lib/home-intent':{...home,takeHomeIntentRecord:s=>home.takeHomeIntentRecord(s,now)},
    '@/lib/eve-source-client':{async checkEveSourceSelection(pin,fetch=fetcher,signal){
      activeChecks++;
      try{return await client.checkEveSourceSelection(pin,fetch,signal);}
      finally{activeChecks--;}
    }},
  };
  const exports={};
  runInNewContext(compiled,{exports,Error,fetch:fetcher,AbortController,AbortSignal,sessionStorage:storage,Date:{now:()=>now},
    requestAnimationFrame:fn=>{const id=frames.size+1;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    require:name=>{assert.ok(modules[name],name);return {__esModule:true,...modules[name]};}});
  function render(){cursor=0;context=exports.useEveSourceContext(enabled,thread);tree=exports.EveSourceHandoff({context,onDraft:text=>drafts.push(text)});effects.splice(0).forEach(fn=>fn());}
  // Settle actual async checks, including WebCrypto, rather than assuming a
  // fixed number of event-loop turns is enough under concurrent suite load.
  // An intentionally held HTTP response is a semantic stopping point.
  async function flush(){
    const deadline=performance.now()+5000;
    do{
      for(const [id,fn]of frames){frames.delete(id);fn();}
      await new Promise(r=>setImmediate(r));render();
      const held=requests.some(request=>request.pending&&!request.released);
      if(frames.size===0&&(held||(!context.checking&&activeChecks===0)))return;
    }while(performance.now()<deadline);
    assert.fail(`Source hook did not settle: checking=${context.checking}, activeChecks=${activeChecks}, frames=${frames.size}`);
  }
  render();
  return {flush,render,requests,drafts,storage,get context(){return context;},get tree(){return tree;},get updatesAfterUnmount(){return updatesAfterUnmount;},
    hold(){holdNext=true;},release(){const request=[...requests].reverse().find(r=>r.pending&&!r.released);assert.ok(request,'an intentionally held source lookup must have started');request.released=true;request.pending.resolve();},
    source(value){current=value;},clock(value){now=value;},get now(){return now;},
    route(value,active=!value){thread=value;enabled=active;render();},
    unmount(){unmounted=true;slots.forEach(s=>s.cleanup?.());},
  };
}
void test('selected context waits for explicit apply and never sends or saves; legacy text also waits',async()=>{
  for(const bound of [true,false]){
    const h=harness({bound});await h.flush();assert.equal(h.context.handoff.text,'Selected source request');assert.equal(h.context.selection,null);assert.deepEqual(h.drafts,[]);
    const before=h.requests.length;await h.context.apply(text=>h.drafts.push(text));await h.flush();
    assert.deepEqual(h.drafts,['Selected source request']);assert.equal(h.context.handoff,null);assert.equal(Boolean(h.context.selection),bound);
    assert.equal(h.requests.length-before,bound?1:0);assert.ok(h.requests.every(r=>!r.options.method||r.options.method==='GET'));
  }
});
void test('changed owner or source between initial check and explicit apply cannot fill the draft',async()=>{
  for(const current of [{...initialSelection,ownerScope:await ownerScopeFor('different-owner')},
    {...initialSelection,source:await eveSourcePin({...plugin,revision:2}),plugin:{...plugin,revision:2}}]){
    const h=harness();await h.flush();assert.ok(h.context.handoff,'initial source must be ready');assert.equal(h.context.checking,false);h.source(current);await h.context.apply(text=>h.drafts.push(text));await h.flush();assert.deepEqual(h.drafts,[]);assert.equal(h.context.selection,null);assert.match(h.context.error,/変わりました/);
  }
});
void test('late apply after route change or unmount cannot populate another conversation',async()=>{
  for(const action of ['route','unmount']){
    const h=harness();await h.flush();assert.ok(h.context.handoff,'initial source must be ready');assert.equal(h.context.checking,false);h.hold();const pending=h.context.apply(text=>h.drafts.push(text));await h.flush();
    if(action==='route')h.route('another-thread');else h.unmount();h.release();await pending;
    assert.deepEqual(h.drafts,[]);assert.equal(h.updatesAfterUnmount,0);
  }
});
void test('expired or clock-reversed context is rejected before explicit apply',async()=>{
  for(const offset of [home.HOME_INTENT_MAX_AGE_MS+1,-1]){
    const h=harness();await h.flush();h.clock(h.now+offset);await h.context.apply(text=>h.drafts.push(text));await h.flush();assert.deepEqual(h.drafts,[]);assert.match(h.context.error,/期限/);
  }
});
void test('clearing a selection during validation rejects the late validation result',async()=>{
  const h=harness();await h.flush();await h.context.apply(text=>h.drafts.push(text));await h.flush();assert.ok(h.context.selection,'source must be applied before validation');assert.equal(h.context.checking,false);h.hold();const pending=h.context.validate();await h.flush();h.context.clear();h.release();await assert.rejects(pending,/選択が変わりました/);
});
void test('late validation after unmount must not authorize a subsequent send',async()=>{
  const h=harness();await h.flush();await h.context.apply(text=>h.drafts.push(text));await h.flush();assert.ok(h.context.selection,'source must be applied before validation');assert.equal(h.context.checking,false);h.hold();const pending=h.context.validate();await h.flush();h.unmount();h.release();await assert.rejects(pending);assert.equal(h.updatesAfterUnmount,0);
});
void test('validation rechecks expiry after its asynchronous source lookup',async()=>{
  for(const offset of [home.HOME_INTENT_MAX_AGE_MS+1,-1]){
    const h=harness();await h.flush();await h.context.apply(text=>h.drafts.push(text));await h.flush();assert.ok(h.context.selection,'source must be applied before validation');assert.equal(h.context.checking,false);h.hold();const pending=h.context.validate();await h.flush();h.clock(h.now+offset);h.release();await assert.rejects(pending,/期限/);
  }
});
void test('cancelling a pending apply cannot later restore selection or replace typed input',async()=>{
  const h=harness();await h.flush();assert.ok(h.context.handoff,'initial source must be ready');assert.equal(h.context.checking,false);h.hold();const pending=h.context.apply(text=>h.drafts.push(text));await h.flush();h.context.clear();h.release();await pending;await h.flush();assert.deepEqual(h.drafts,[]);assert.equal(h.context.selection,null);
});

void test('cancelling the initial source lookup suppresses its later result',async()=>{
  const h=harness();h.hold();await h.flush();assert.equal(h.context.checking,true);h.context.clear();h.release();await h.flush();
  assert.equal(h.context.handoff,null);assert.equal(h.context.selection,null);assert.equal(h.context.checking,false);assert.deepEqual(h.drafts,[]);
});
void test('partial clock rollback invalidates selected context permanently until new selection',async()=>{
  const h=harness();await h.flush();await h.context.apply(text=>h.drafts.push(text));await h.flush();const first=h.now;
  h.clock(first+100);assert.ok(await h.context.validate());h.clock(first+99);await assert.rejects(h.context.validate(),/時計/);
  h.clock(first+101);await assert.rejects(h.context.validate(),/失効/);
});
void test('expiry during apply does not fill the draft and reports the expired context',async()=>{
  const h=harness();await h.flush();assert.ok(h.context.handoff,'initial source must be ready');assert.equal(h.context.checking,false);h.hold();const pending=h.context.apply(text=>h.drafts.push(text));await h.flush();h.clock(h.now+home.HOME_INTENT_MAX_AGE_MS+1);h.release();await pending;await h.flush();
  assert.deepEqual(h.drafts,[]);assert.equal(h.context.selection,null);assert.match(h.context.error,/期限/);
});
void test('request cancellation and replaced expected selection refuse validation',async()=>{
  const h=harness();await h.flush();await h.context.apply(text=>h.drafts.push(text));await h.flush();const pinned=h.context.selection;
  const c=new AbortController();h.hold();const pending=h.context.validate(pinned,c.signal);await h.flush();c.abort();h.release();await assert.rejects(pending);
  await assert.rejects(h.context.validate({...pinned}),/選択が変わった|失効/);
});

void test('route identity change immediately hides old handoff before its reset frame and blocks applying it',async()=>{
  for(const active of [true,false]){
    const h=harness();await h.flush();assert.ok(h.context.handoff);const requestCount=h.requests.length;
    h.route('different-conversation',active);
    assert.equal(h.context.handoff,null);assert.equal(h.context.selection,null);assert.equal(h.context.error,'');assert.equal(h.context.checking,false);assert.equal(h.tree,null);
    await h.context.apply(text=>h.drafts.push(text));assert.deepEqual(h.drafts,[]);assert.equal(h.requests.length,requestCount);
    await h.flush();assert.equal(h.context.handoff,null);assert.equal(h.context.selection,null);assert.equal(h.tree,null);
  }
});
void test('route identity or enabled change immediately hides an applied source and refuses its expected pin',async()=>{
  for(const destination of [{key:'different-conversation',enabled:true},{key:'',enabled:false}]){
    const h=harness();await h.flush();await h.context.apply(text=>h.drafts.push(text));await h.flush();const pinned=h.context.selection;assert.ok(pinned);
    h.route(destination.key,destination.enabled);
    assert.equal(h.context.handoff,null);assert.equal(h.context.selection,null);assert.equal(h.context.error,'');assert.equal(h.context.checking,false);assert.equal(h.tree,null);
    await assert.rejects(h.context.validate(pinned),/画面が変わりました/);assert.equal(await h.context.validate(),undefined);
    await h.context.apply(text=>h.drafts.push(text));assert.deepEqual(h.drafts,['Selected source request']);
  }
});
void test('route A to B to A before reset frames cannot revive the consumed old handoff',async()=>{
  const h=harness();await h.flush();assert.ok(h.context.handoff);
  h.route('different-conversation',true);assert.equal(h.context.handoff,null);
  h.route('',true);assert.equal(h.context.handoff,null);assert.equal(h.tree,null);
  await h.context.apply(text=>h.drafts.push(text));assert.deepEqual(h.drafts,[]);
});
