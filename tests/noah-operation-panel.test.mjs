import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { visiblePollingFixture } from './helpers/noah-visible-polling-fixture.mjs';

const compiled = ts.transpileModule(readFileSync(new URL('../components/noah-operation-panel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(fetcher, ownCodex = false) {
  const slots = [], effects = [], polling = visiblePollingFixture(); let cursor = 0, tree;
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) {
        slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props }), exports = {};
  runInNewContext(compiled, { exports, Error, crypto, AbortController, TextDecoder, Uint8Array, atob,
    setTimeout, clearTimeout,
    fetch: fetcher, require(id) {
      if (id === 'react') return react;
      if (id === './noah-operation-runtime') return {default:'operation-runtime'};
      if (id === '@/lib/noah-visible-polling') return { startNoahVisiblePolling: polling.start };
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === '@/lib/owner-intent') return { OWNER_SCOPE_HEADER: 'X-Rock-Owner-Scope' };
      if (id.endsWith('.css')) return { default: {} };
      if (id === '@/lib/noah-execution-contract.mjs') return {recipeFor:()=>null};
      if (id === 'next/link') return {default:'a'};
      throw new Error(`Unexpected module ${id}`);
    },
  });
  function render() { cursor = 0; tree = exports.default({ id: 'agent-a', scope: 'owner-a', prompt: 'Synthetic task', connected: true, ownCodex, providerConsent: true }); effects.splice(0).forEach(fn => fn()); }
  function walk(node) { return Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : []; }
  const nodes = () => walk(tree);
  const flush = async () => { for (let i = 0; i < 3; i++) { await new Promise(setImmediate); render(); } };
  render();
  return { flush, nodes, polling,
    async poll() { await polling.next(); await flush(); },
    unmount() { slots.forEach(s => s.cleanup?.()); },
  };
}

const job = { id: '70e91ad3-6623-40de-9b98-672a40cbd6f9',revision:3,noahOperation:{configVersion:1,state:'paused',attempts:1,succeeded:1,history:[],active:null,nextRunAt:null,config:{id:'70e91ad3-6623-40de-9b98-672a40cbd6f9',agentId:'agent-a',prompt:'old task',intervalSeconds:60,maxRuns:3,expiresAt:Date.now()+3600000,timeZone:'Asia/Tokyo',confirmation:'noah-operation/1'}}};
const find = (h,text) => h.nodes().find(n=>n.type==='button'&&n.props.children===text);
void test('event UI requires confirmation, submits source and replays one intent; foreign reads hide controls',async t=>{
  const posts=[];let foreign=false;
  const h=harness(async(url,options)=>{if(options.method==='POST')posts.push(JSON.parse(options.body));return {ok:true,json:async()=>({ownerScope:foreign?'other':'owner-a',jobs:url.includes('executions')?[{title:'recent source',noahExecution:{agentId:'source-agent'}}]:[]})};},true);
  t.after(()=>h.unmount());await h.flush();
  h.nodes().find(n=>n.props['aria-label']==='実行のきっかけ').props.onChange({target:{value:'event'}});await h.flush();
  assert.equal(find(h,'運用開始').props.disabled,true);find(h,'運用開始').props.onClick();await h.flush();assert.equal(posts.length,0);
  h.nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});await h.flush();find(h,'運用開始').props.onClick();await h.flush();
  assert.equal(posts[0].trigger.agentId,'source-agent');assert.equal(posts[0].providerConsent,'codex-account/1');find(h,'運用開始').props.onClick();await h.flush();assert.equal(posts[0].id,posts[1].id);
  foreign=true;await h.poll();assert.equal(find(h,'運用開始').props.disabled,true);
});
void test('editing retains observed revision through polling; stale edit error remains visible',async t=>{
  const posts=[];let revision=3;
  const h=harness(async(url,options)=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));return {ok:false,json:async()=>({error:'stale revision'})};}return {ok:true,json:async()=>({ownerScope:'owner-a',jobs:url.includes('executions')?[]:[{...job,revision}]})};});
  t.after(()=>h.unmount());await h.flush();find(h,'条件を変更').props.onClick();await h.flush();revision=4;await h.poll();
  h.nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'new task'}});h.nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});await h.flush();find(h,'条件を保存（停止を維持）').props.onClick();await h.flush();
  assert.equal(posts[0].revision,3);assert.equal(posts[0].config.prompt,'new task');await h.poll();assert.ok(h.nodes().some(n=>n.props.role==='alert'&&n.props.children==='stale revision'));
});

void test('hiding a running operation stops only display polling and refreshes its actual state on return', async t => {
  const posts=[]; let reads=0, state='enabled';
  const h=harness(async(url,options)=>{
    if(options.method==='POST') posts.push(url);
    if(url.includes('/operations')) reads++;
    return {ok:true,json:async()=>({ownerScope:'owner-a',jobs:url.includes('/operations')?[{...job,noahOperation:{...job.noahOperation,state}}]:[]})};
  });
  t.after(()=>h.unmount()); await h.flush(); assert.equal(reads,1);
  h.polling.change('hidden'); await h.flush(); assert.equal(h.polling.timers.size,0);
  state='exhausted'; h.polling.change('visible'); await h.flush();
  assert.equal(reads,2); assert.equal(posts.length,0);
  assert.ok(h.nodes().some(n=>JSON.stringify(n.props.children)?.includes('設定した上限で終了')));
});
