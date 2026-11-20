import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as feed from '../lib/noah-timeline-feed.ts';
const code=ts.transpileModule(readFileSync(new URL('../components/use-noah-timeline.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const post=(id,following=false,community=null)=>({id,following,community,content:id,author:{name:'Author'}});
function harness(catalog,social,initial='all') {
  const slots=[],effects=[],calls=[],exports={}; let cursor=0,filter=initial,result;
  runInNewContext(code,{exports,URLSearchParams,AbortController,DOMException,Error, setTimeout:fn=>setTimeout(()=>fn(),1),clearTimeout,window:{addEventListener(){},removeEventListener(){}},
    fetch:async url=>{calls.push(url);return catalog(url);},
    require(id){
      if(id==='@/lib/noah-timeline-feed')return feed;
      if(id==='@/lib/community-key-client')return{communityFetch:async url=>{calls.push(url);return social(url);},setCommunityKeyProfile:()=>false};
      if(id==='react')return{
        useState(value){const i=cursor++;slots[i]??={value};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},
        useRef(value){const i=cursor++;return slots[i]??={current:value};},
        useCallback(fn){cursor++;return fn;},
        useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
      };throw Error(id);
    },
  });
  const render=()=>{cursor=0;result=exports.useNoahTimeline('public','','all',filter);effects.splice(0).forEach(fn=>fn());}; render();
  return {calls,get result(){return result;},setFilter(v){filter=v;render();},async flush(){for(let n=0;n<4;n++){await new Promise(resolve=>setTimeout(resolve,5));render();}},close(){slots.forEach(s=>s?.cleanup?.());}};
}
const catalog=async()=>Response.json({entries:[{id:'agent',name:'Agent'}],nextCursor:null});
void test('all feed fetches no news, excludes community posts and gives followed posts priority',async t=>{
  const h=harness(catalog,async()=>({posts:[post('ordinary'),post('follow',true),post('private-group',true,{id:'group'})],cursor:null}));t.after(()=>h.close());await h.flush();
  assert.equal(h.calls.length,2);assert.ok(h.calls.every(u=>u.startsWith('/api/noah/public-catalog?')||u.startsWith('/api/sky/social?')));
  assert.deepEqual(Array.from(h.result.data.items,i=>i.key),['post:follow','agent:agent','post:ordinary']);
});
void test('Agent filter does not request social feed and an obsolete all-feed response cannot reappear',async t=>{
  let finish;const h=harness(catalog,()=>new Promise(resolve=>{finish=resolve;}));t.after(()=>h.close());await h.flush();h.setFilter('agent');await h.flush();
  assert.equal(h.calls.filter(u=>u.startsWith('/api/sky/social?')).length,1);assert.deepEqual(Array.from(h.result.data.items,i=>i.kind),['agent']);
  finish({posts:[post('late-follow',true)],cursor:null});await h.flush();assert.deepEqual(Array.from(h.result.data.items,i=>i.key),['agent:agent']);
});
void test('failed social feed leaves real Agent results and a retryable error',async t=>{
  const h=harness(catalog,async()=>{throw Error('offline');});t.after(()=>h.close());await h.flush();
  assert.deepEqual(Array.from(h.result.data.items,i=>i.key),['agent:agent']);assert.match(h.result.data.errors[0],/投稿：offline/);assert.equal(h.result.loading,false);
});
