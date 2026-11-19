import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { visiblePollingFixture } from './helpers/noah-visible-polling-fixture.mjs';
import { noahModel } from '../lib/noah-model-catalog.mjs';

const compiled = ts.transpileModule(readFileSync(new URL('../components/noah-execution-panel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(fetcher, model = 'test') {
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
      if (id === '@/lib/noah-visible-polling') return { startNoahVisiblePolling: polling.start };
      if (id === '@/lib/noah-model-catalog.mjs') return { noahModel };
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === '@/lib/owner-intent') return { OWNER_SCOPE_HEADER: 'X-Rock-Owner-Scope' };
      if (id.endsWith('.css')) return { default: {} };
      if (id === './noah-operation-panel') return { default: () => null };
      throw new Error(`Unexpected module ${id}`);
    },
  });
  function render() { cursor = 0; tree = exports.default({ id: 'agent-a', scope: 'owner-a', execution: { model, providerModel: 'test-model', capability: 'test', limits: { seconds: 240, modelCalls: 8 } } }); effects.splice(0).forEach(fn => fn()); }
  function walk(node) { return Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : []; }
  const nodes = () => walk(tree);
  const flush = async () => { for (let i = 0; i < 3; i++) { await new Promise(setImmediate); render(); } };
  render();
  return { flush, nodes, polling,
    async poll() { await polling.next(); await flush(); },
    unmount() { slots.forEach(s => s.cleanup?.()); },
  };
}

void test('poll recovery clears only its error, hides foreign results, and never erases a failed action', async t => {
  let state = 'offline';
  const h = harness(async (_url, options) => {
    if (options.method === 'POST') return { ok: false, json: async () => ({ error: 'Action refused' }) };
    if (state === 'offline') throw new Error('Read unavailable');
    return { ok: true, json: async () => ({ ownerScope: state === 'foreign' ? 'owner-b' : 'owner-a', jobs: [{ id: 'job-a', createdAt: '2026-11-16', noahExecution: { agentId: 'agent-a', state: 'returned', prompt: 'Synthetic result' } }] }) };
  });
  t.after(() => h.unmount());
  const alerts = () => h.nodes().filter(n => n.props.role === 'alert').map(n => n.props.children);
  const run = () => h.nodes().find(n => n.type === 'button' && n.props.children === '依頼して実行');
  await h.flush();
  assert.deepEqual(alerts(), ['Read unavailable']);
  h.nodes().find(n => n.type === 'textarea').props.onChange({ target: { value: 'Test task' } }); await h.flush();
  assert.equal(run().props.disabled, true);
  state = 'ready'; await h.poll();
  assert.deepEqual(alerts(), []); assert.equal(run().props.disabled, false);
  run().props.onClick(); await h.flush(); assert.deepEqual(alerts(), ['Action refused']);
  await h.poll(); assert.deepEqual(alerts(), ['Action refused']);
  state = 'foreign'; await h.poll();
  assert.equal(h.nodes().some(n => n.type === 'article'), false);
  assert.equal(run().props.disabled, true);
});

void test('own Codex requires a visible send confirmation and records it on the same request', async t => {
  const posts = [];
  const h = harness(async (_url, options) => { if (options.method === 'POST') posts.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ ownerScope: 'owner-a', jobs: [] }) }; }, 'codex-account');
  t.after(() => h.unmount()); await h.flush();
  const run = () => h.nodes().find(n => n.type === 'button' && n.props.children === 'Codexへ依頼して実行');
  h.nodes().find(n => n.type === 'textarea').props.onChange({ target: { value: 'Synthetic task' } }); await h.flush();
  assert.equal(run().props.disabled, true); run().props.onClick(); await h.flush(); assert.equal(posts.length, 0);
  h.nodes().find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); await h.flush();
  assert.equal(run().props.disabled, false); run().props.onClick(); await h.flush();
  assert.equal(posts.length, 1); assert.equal(posts[0].providerConsent, 'codex-account/1');
  const firstId = posts[0].id; run().props.onClick(); await h.flush(); assert.equal(posts[1].id, firstId);
  h.nodes().find(n => n.type === 'button' && n.props.children === '新しい依頼にする').props.onClick(); await h.flush();
  assert.equal(h.nodes().find(n => n.type === 'input').props.checked, false);
});

void test('hiding the execution view suspends reads but does not cancel, resend, or stop the submitted job', async t => {
  const posts = [], reads = []; let finishPost, finishOldRead;
  const h = harness(async (_url, options) => {
    if (options.method === 'POST') {
      posts.push(options); await new Promise(resolve => { finishPost = resolve; });
      return { ok: true, json: async () => ({ ownerScope: 'owner-a' }) };
    }
    reads.push(options.signal);
    if (reads.length === 2) await new Promise(resolve => { finishOldRead = resolve; });
    return { ok: true, json: async () => ({ ownerScope: 'owner-a', jobs: [] }) };
  });
  t.after(() => h.unmount()); await h.flush();
  h.nodes().find(n => n.type === 'textarea').props.onChange({ target: { value: 'Background task' } }); await h.flush();
  h.nodes().find(n => n.type === 'button' && n.props.children === '依頼して実行').props.onClick(); await h.flush();
  assert.equal(posts.length, 1);
  await h.poll(); h.polling.change('hidden'); await h.flush();
  assert.equal(reads[1].aborted, true); assert.equal(posts[0].signal, undefined);
  finishPost(); finishOldRead(); await h.flush();
  assert.equal(reads.length, 2); assert.equal(h.polling.timers.size, 0);
  h.polling.change('visible'); await h.flush();
  assert.equal(reads.length, 3); assert.equal(posts.length, 1);
  h.unmount(); await h.flush(); assert.equal(posts.length, 1);
});
