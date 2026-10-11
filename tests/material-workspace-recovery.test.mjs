import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as material from '../lib/material-invention.ts';
import * as study from '../lib/material-study.ts';
const fixture = JSON.parse(readFileSync(new URL('../contracts/material-invention-fixture.json', import.meta.url), 'utf8'));
const compiled = ts.transpileModule(readFileSync(new URL('../components/material-invention-workspace.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
function harness() {
  const slots = [], effects = [], requests = [], records = new Map(), computations = new Set();
  let generationGate;
  function track(promise) { computations.add(promise); void promise.then(() => computations.delete(promise), () => computations.delete(promise)); return promise; }
  let cursor = 0, tree, mode = null, signedIn = true, holdList = false, releaseList;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((v, j) => v !== old.deps[j])) { old?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const modules = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': 'a',
    '@/contracts/material-invention-fixture.json': fixture, '@/lib/material-invention': { ...material,
      generateMaterialCandidateGraph(...args) { return track((async () => { if (generationGate) await generationGate.promise; return material.generateMaterialCandidateGraph(...args); })()); } }, '@/lib/material-study': study,
    './material-invention-workspace.module.css': {}, '@/components/use-pending-save-navigation': { usePendingSaveNavigation() {} },
  };
  async function fetch(url, options = {}) {
    const method = options.method ?? 'GET', value = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ method, url, value });
    if (!signedIn) return new Response('Synthetic gateway sign-in required', { status: 401 });
    if (method === 'GET') {
      const response = Response.json({ jobs: [...records.values()].map(({ job }) => job) });
      if (holdList) { holdList = false; return new Promise((resolve) => { releaseList = () => resolve(response); }); }
      return response;
    }
    assert.equal(method, 'POST');
    const result = records.get(value.id) ?? await track(study.createMaterialStudy(value));
    records.set(value.id, result);
    if (mode === 'lost') { mode = null; throw Error('response lost'); }
    return Response.json(result, { status: 201 });
  }
  const exports = {};
  runInNewContext(compiled, { exports, crypto, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout, fetch,
    require(id) { assert.ok(id in modules, id); return modules[id]; },
  });
  function render() { cursor = 0; tree = exports.default(); while (effects.length) effects.shift()(); }
  function nodes(node, out = []) { if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach((v) => nodes(v, out)); return out; }
    out.push(node); nodes(node.props?.children, out); return out; }
  function text(n) { return typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(text).join('') : n ? text(n.props?.children) : ''; }
  function find(type, label) { return nodes(tree).find((n) => n.type === type && (!label || text(n).includes(label))); }
  async function flush() { while (computations.size) await Promise.allSettled(computations);
    await new Promise((r) => setImmediate(r)); render(); }
  async function click(label) { const button = find('button', label); assert.ok(button, label); assert.ok(!button.props.disabled, label);
    button.props.onClick(); render(); await flush(); }
  function source(value) { find('textarea').props.onChange({ target: { value } }); render(); }
  render();
  return { render, find, flush, click, source, records, requests,
    holdGeneration() { generationGate = Promise.withResolvers(); return () => generationGate.resolve(); }, holdList() { holdList = true; }, releaseList() { releaseList(); }, lost() { mode = 'lost'; }, signin(v) { signedIn = v; } };
}

void test('Material keeps the exact pending save through a 401 after a lost committed response', async () => {
  const h = harness(); await h.flush(); await h.click('合成サンプルを開く'); await h.click('この端末で候補を生成');
  h.lost(); await h.click('入力と候補を本人用に保存');
  assert.equal(h.records.size, 1);
  h.signin(false); await h.click('同じ操作を再試行');
  assert.ok(h.find('button', '同じ操作を再試行'), '401 must not discard the original uncertain save ID');
  assert.ok(h.find('button', '入力と候補を本人用に保存').props.disabled);
  assert.equal(h.find('a', 'サインインして保存を使う').props.target, '_blank');
  h.signin(true); await h.click('同じ操作を再試行'); await h.flush();
  const posts = h.requests.filter((r) => r.method === 'POST');
  assert.equal(posts.length, 3); assert.deepEqual(posts[1].value, posts[0].value); assert.deepEqual(posts[2].value, posts[0].value);
  assert.equal(h.records.size, 1);
});

void test('Material clears saved-list titles when a refresh loses authentication', async () => {
  const h = harness();
  const result = await study.createMaterialStudy({ id: crypto.randomUUID(), title: 'Owner A private title', request: fixture, sample: true });
  h.records.set(result.job.id, result); await h.flush(); await h.click('一覧を再読込');
  assert.ok(h.find('button', 'Owner A private title'));
  h.signin(false); await h.click('一覧を再読込');
  assert.equal(h.find('button', 'Owner A private title'), undefined);
});

void test('Material paste limit counts UTF-8 bytes before generating or sending', async () => {
  const h = harness(); await h.flush();
  h.source(JSON.stringify({ ...fixture, extra: 'あ'.repeat(16000) })); await h.click('この端末で候補を生成');
  assert.match(h.find('output').props.children, /47 KB/);
  assert.equal(h.find('button', '入力と候補を本人用に保存'), undefined);
  assert.equal(h.requests.filter((r) => r.method === 'POST').length, 0);
});


void test('a late prior-account Material list cannot undo a later 401', async () => {
  const h = harness(); await h.flush();
  const result = await study.createMaterialStudy({ id: crypto.randomUUID(), title: 'Prior account private title', request: fixture, sample: true });
  h.records.set(result.job.id, result);
  h.holdList(); await h.click('一覧を再読込');
  h.signin(false); await h.click('一覧を再読込');
  h.releaseList(); await h.flush();
  assert.equal(h.find('button', 'Prior account private title'), undefined);
  assert.ok(h.find('a', 'サインインして保存を使う'));
});

void test('opening a Material saved study after auth loss removes stale titles and offers sign-in', async () => {
  const h = harness(); await h.flush();
  const result = await study.createMaterialStudy({ id: crypto.randomUUID(), title: 'Expired account study', request: fixture, sample: true });
  h.records.set(result.job.id, result); await h.click('一覧を再読込');
  h.signin(false); await h.click('Expired account study');
  assert.equal(h.find('button', 'Expired account study'), undefined);
  assert.ok(h.find('a', 'サインインして保存を使う'));
});

void test('Material harness waits for the actual candidate computation rather than an event-loop count', async () => {
  const h = harness(); await h.flush(); await h.click('合成サンプルを開く');
  const release = h.holdGeneration();
  const generating = h.click('この端末で候補を生成');
  assert.equal(h.find('button', '入力と候補を本人用に保存'), undefined);
  release(); await generating;
  assert.ok(h.find('button', '入力と候補を本人用に保存'));
});
