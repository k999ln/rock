import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const code=ts.transpileModule(readFileSync(new URL('../components/noah-draft-storage.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
const draft={id:'draft-a',name:'Draft',revision:4,restoreUntil:Date.now()+86400000,registeredUploadId:'upload-a'};
const storage={allocatedBytes:10,inputBytes:5,objectBytes:5,reservedBytes:0,pendingBytes:0,limitBytes:67108864,activeDrafts:1,limitDrafts:32,objects:1,limitObjects:512,lastScanAt:null,scanPending:false,nextTrash:null,trash:[draft]};
const reply=(body={storage},ownerScope='owner-a')=>({ok:true,json:async()=>({ownerScope,...body})});
function harness(fetcher){
  const slots=[],effects=[],exports={},restored=[];let cursor=0,tree;
  const props={scope:'owner-a',refresh:0,disabled:false,onRestored(id){restored.push(id);}};
  const react={useState(initial){const i=cursor++;slots[i]??={value:initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
  const jsx=(type,props)=>({type,props});
  runInNewContext(code,{exports,Error,AbortController,AbortSignal,fetch:fetcher,require(id){if(id==='react')return react;if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};if(id==='next/link')return {default:'a'};if(id==='@/lib/owner-intent')return {OWNER_SCOPE_HEADER:'X-Rock-Owner-Scope'};throw Error(id);}});
  function render(){cursor=0;tree=exports.default(props);effects.splice(0).forEach(f=>f());}
  function walk(n){return Array.isArray(n)?n.flatMap(walk):n&&typeof n==='object'?[n,...walk(n.props?.children)]:[];}
  const nodes=()=>walk(tree),flush=async()=>{for(let i=0;i<3;i++){await new Promise(setImmediate);render();}};
  render();return {props,restored,nodes,flush,button:text=>nodes().find(n=>n.type==='button'&&n.props.children===text),unmount(){slots.forEach(s=>s.cleanup?.());}};
}
void test('storage read is nonmutating, continuation deduplicates and collection requires an explicit click',async t=>{
  const calls=[],h=harness(async(url,options)=>{calls.push({url,options});return reply({storage:calls.length===1?{...storage,nextTrash:'next'}:storage});});t.after(()=>h.unmount());await h.flush();
  assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);
  assert.ok(h.nodes().some(n=>n.props?.href==='/noah/agents/upload-a'));
  h.button('整理した下書きの続きを表示').props.onClick();await h.flush();assert.equal(calls[1].options.method,'GET');assert.equal(h.nodes().filter(n=>n.props?.children==='この下書きを復元').length,1);
  h.button('保存量を再確認・不要ファイルを回収').props.onClick();await h.flush();assert.equal(calls[2].options.method,'POST');assert.equal(calls[2].options.headers['X-Rock-Owner-Scope'],'owner-a');assert.equal(calls[2].options.body,'{}');
});
void test('lost restore acknowledgement retries the observed revision and opens only the confirmed draft',async t=>{
  const posts=[],h=harness(async(_url,options)=>{if(options.method!=='POST')return reply();posts.push(JSON.parse(options.body));if(posts.length===1)throw Error('network');return reply({draft:{id:draft.id}});});t.after(()=>h.unmount());await h.flush();
  h.button('この下書きを復元').props.onClick();await h.flush();assert.equal(h.restored.length,0);
  h.button('この下書きを復元').props.onClick();await h.flush();assert.deepEqual(posts,[{revision:4},{revision:4}]);assert.deepEqual(h.restored,[draft.id]);
});
void test('foreign read or restore results cannot expose storage or open a different draft',async t=>{
  const foreign=harness(async()=>reply({storage},'other'));t.after(()=>foreign.unmount());await foreign.flush();assert.equal(foreign.button('この下書きを復元'),undefined);
  const h=harness(async(_url,options)=>options.method==='POST'?reply({draft:{id:'other-draft'}}):reply());t.after(()=>h.unmount());await h.flush();h.button('この下書きを復元').props.onClick();await h.flush();assert.equal(h.restored.length,0);
});
void test('disabled state and duplicate click do not restore, stale response cannot navigate after refresh or unmount',async t=>{
  let deliver,posts=0;const h=harness(async(_url,options)=>{if(options.method!=='POST')return reply();posts++;return new Promise(r=>{deliver=r;});});t.after(()=>h.unmount());await h.flush();
  h.props.disabled=true;await h.flush();h.button('この下書きを復元').props.onClick();assert.equal(posts,0);
  h.props.disabled=false;await h.flush();h.button('この下書きを復元').props.onClick();h.button('この下書きを復元').props.onClick();assert.equal(posts,1);
  h.props.refresh++;await h.flush();deliver(reply({draft:{id:draft.id}}));await h.flush();assert.equal(h.restored.length,0);assert.equal(h.button('この下書きを復元').props.disabled,false);
  h.button('この下書きを復元').props.onClick();h.unmount();deliver(reply({draft:{id:draft.id}}));await h.flush();assert.equal(h.restored.length,0);
});
