import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as contract from '../lib/noah-operation-contract.mjs';

const code = ts.transpileModule(readFileSync(new URL('../components/noah-operation-runtime.tsx', import.meta.url), 'utf8'), { compilerOptions: {target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS} }).outputText;
const job = {id:'38dbdafa-22e2-4845-b573-fadfbcb049ac',revision:3,noahOperation:{state:'paused',active:null,history:[],binding:{agentId:'agent-a',recipe:'terminal',version:'1.0.0',model:'qwen3:4b'}}};
const runtime = {revision:3,current:job.noahOperation.binding,candidate:{...job.noahOperation.binding,modelSha256:'a'.repeat(64)},candidateDigest:'b'.repeat(64),changed:true};
function harness(fetcher) {
  const slots=[],effects=[],exports={};let cursor=0,tree,updates=0;
  const props={job:structuredClone(job),scope:'owner-a',connected:true,disabled:false,onUpdated(){updates++;}};
  const react={useState(initial){const i=cursor++;slots[i]??={value:initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
  const jsx=(type,props)=>({type,props});
  runInNewContext(code,{exports,Error,crypto,fetch:fetcher,require(id){if(id==='react')return react;if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};if(id==='@/lib/noah-operation-contract.mjs')return contract;if(id==='@/lib/owner-intent')return {OWNER_SCOPE_HEADER:'X-Rock-Owner-Scope'};throw Error(id);}});
  function render(){cursor=0;tree=exports.default(props);effects.splice(0).forEach(f=>f());}
  function walk(n){return Array.isArray(n)?n.flatMap(walk):n&&typeof n==='object'?[n,...walk(n.props?.children)]:[];}
  const nodes=()=>walk(tree),flush=async()=>{for(let i=0;i<3;i++){await new Promise(setImmediate);render();}};
  render();return {props,nodes,flush,updates:()=>updates,button:text=>nodes().find(n=>n.type==='button'&&n.props.children===text),confirm:()=>nodes().find(n=>n.type==='input').props.onChange({target:{checked:true}}),unmount(){slots.forEach(s=>s.cleanup?.());}};
}
const preview=()=>({ok:true,json:async()=>({ownerScope:'owner-a',job,runtime})});
const saved=input=>({ok:true,json:async()=>({ownerScope:'owner-a',job:{...job,revision:4,noahOperation:{...job.noahOperation,bindingVersion:2,bindings:[{version:2,commandId:input.commandId,candidateDigest:input.candidateDigest,previousRevision:input.revision}]}}})});
void test('preview is read-only and changed runtime needs separate confirmation; save never resumes',async t=>{
  const posts=[],h=harness(async(url,options)=>{if(options.method==='GET')return preview();posts.push({url,input:JSON.parse(options.body)});return saved(posts.at(-1).input);});t.after(()=>h.unmount());
  h.button('実行環境の変更を確認').props.onClick();await h.flush();assert.equal(posts.length,0);
  assert.equal(h.button('実行環境を保存（停止を維持）').props.disabled,true);
  h.button('実行環境を保存（停止を維持）').props.onClick();await h.flush();assert.equal(posts.length,0);
  h.confirm();await h.flush();h.button('実行環境を保存（停止を維持）').props.onClick();await h.flush();
  assert.equal(posts.length,1);assert.ok(posts[0].url.endsWith('/runtime'));assert.equal(posts[0].input.confirmation,'noah-operation-runtime/1');assert.equal('binding' in posts[0].input,false);assert.equal(h.updates(),1);
});
void test('unknown response keeps the same command across retry even when polling observes a newer revision and disconnection',async t=>{
  const posts=[],h=harness(async(_url,options)=>{if(options.method==='GET')return preview();const input=JSON.parse(options.body);posts.push(input);if(posts.length===1)throw Error('network');return saved(input);});t.after(()=>h.unmount());
  h.button('実行環境の変更を確認').props.onClick();await h.flush();h.confirm();await h.flush();h.button('実行環境を保存（停止を維持）').props.onClick();await h.flush();
  h.props.job={...job,revision:4};h.props.connected=false;await h.flush();assert.equal(h.button('同じ操作の保存結果を確認').props.disabled,false);
  h.button('同じ操作の保存結果を確認').props.onClick();await h.flush();assert.deepEqual(posts[0],posts[1]);assert.equal(h.updates(),1);
});
void test('changed revision needs fresh preview and a definitive conflict permits preview again',async t=>{
  let posts=0;const h=harness(async(_url,options)=>{if(options.method==='GET')return preview();posts++;return {ok:false,status:409,json:async()=>({error:'candidate changed'})};});t.after(()=>h.unmount());
  h.button('実行環境の変更を確認').props.onClick();await h.flush();h.confirm();h.props.job={...job,revision:4};await h.flush();assert.equal(h.button('実行環境を保存（停止を維持）').props.disabled,true);
  h.button('実行環境を保存（停止を維持）').props.onClick();await h.flush();assert.equal(posts,0);
  h.props.job=job;await h.flush();h.button('実行環境を保存（停止を維持）').props.onClick();await h.flush();
  assert.equal(h.button('実行環境の変更を確認').props.disabled,false);assert.equal(h.updates(),0);
});
void test('foreign owner and late unmounted responses cannot authorize saves or refresh another account',async t=>{
  const h=harness(async()=>({ok:true,json:async()=>({ownerScope:'other',job,runtime})}));t.after(()=>h.unmount());
  h.button('実行環境の変更を確認').props.onClick();await h.flush();assert.equal(h.button('実行環境を保存（停止を維持）'),undefined);assert.equal(h.updates(),0);
  let deliver;const late=harness(async()=>new Promise(r=>{deliver=r;}));
  late.button('実行環境の変更を確認').props.onClick();late.unmount();deliver(preview());await late.flush();assert.equal(late.button('実行環境を保存（停止を維持）'),undefined);assert.equal(late.updates(),0);
});
