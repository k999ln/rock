import { guardHistoryNavigation } from '../lib/history-navigation-guard.ts';
import * as pendingOwnerIntent from '../lib/pending-owner-intent.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
const ownerA = 'owner-v1:' + 'a'.repeat(64), ownerB = 'owner-v1:' + 'b'.repeat(64);
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as material from '../lib/material-invention.ts';
import * as study from '../lib/material-study.ts';
import { applyWorkCommand } from '../lib/workflow.ts';
const fixture = JSON.parse(readFileSync(new URL('../contracts/material-invention-fixture.json', import.meta.url), 'utf8'));
const compiled = ts.transpileModule(readFileSync(new URL('../components/material-invention-workspace.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const navigationCompiled = ts.transpileModule(readFileSync(new URL('../components/use-pending-save-navigation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness(initialSignedIn = true) {
  const slots = [], effects = [], requests = [], records = new Map(), recordOwners = new Map(), computations = new Set();
  const listHoldQueue = [], responseChanges = new Map();
  let generationGate, currentOwner = ownerA, heldWrite, heldOpen, heldCreate;
  function track(promise) { computations.add(promise); void promise.then(() => computations.delete(promise), () => computations.delete(promise)); return promise; }
  let cursor = 0, tree, mode = null, signedIn = initialSignedIn, holdList = false, releaseList;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((v, j) => v !== old.deps[j])) { old?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); }
    },
  };
  const listeners = new Map(), documentListeners = new Map();
  const windowSurface = { addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  class Element { constructor(attributes) { this.attributes = attributes; } closest() { return this; }
    getAttribute(name) { return this.attributes[name] ?? null; } hasAttribute(name) { return name in this.attributes; } }
  const navigation = {};
  runInNewContext(navigationCompiled, { exports: navigation, Element, window: windowSurface,
    document: { addEventListener(name, fn) { documentListeners.set(name, fn); }, removeEventListener(name) { documentListeners.delete(name); } },
    require(name) { if (name === '@/lib/history-navigation-guard') return { guardHistoryNavigation }; assert.equal(name, 'react'); return react; },
  });
  const jsx = (type, props) => ({ type, props });
  const modules = { '@/lib/pending-owner-intent': pendingOwnerIntent, '@/lib/owner-intent': ownerIntent, react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': 'a',
    '@/contracts/material-invention-fixture.json': fixture, '@/lib/material-invention': { ...material,
      generateMaterialCandidateGraph(...args) { return track((async () => { if (generationGate) await generationGate.promise; return material.generateMaterialCandidateGraph(...args); })()); } }, '@/lib/material-study': { ...study, restoreMaterialStudy(...args) { return track(study.restoreMaterialStudy(...args)); } },
    './material-invention-workspace.module.css': {}, '@/components/use-pending-save-navigation': navigation,
  };
  async function response(value, kind, status = 200) {
    const change = responseChanges.get(kind); responseChanges.delete(kind);
    return Response.json(change ? await track(Promise.resolve(change(structuredClone(value)))) : value, { status });
  }
  async function fetch(url, options = {}) {
    const requestOwner = currentOwner;
    const method = options.method ?? 'GET', value = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ method, url, value, headers: options.headers });
    if (!signedIn) return new Response('Synthetic gateway sign-in required', { status: 401 });
    if (method === 'GET') {
      const id = new URL(url, 'https://local.test').searchParams.get('id');
      if (id) {
        const result = records.get(id);
        const reply = result && (recordOwners.get(id) ?? ownerA) === currentOwner ? await response(result, 'open') : Response.json({ error: 'Not found' }, { status: 404 });
        if (heldOpen) { const hold = heldOpen; heldOpen = null; return hold.promise.then(() => reply); }
        return reply;
      }
      const reply = await response({ ownerScope: currentOwner, jobs: [...records.values()].filter(({ job }) => (recordOwners.get(job.id) ?? ownerA) === currentOwner).map(({ job }) => job) }, 'list');
      if (listHoldQueue.length) { const hold = listHoldQueue.shift(); return hold.promise.then(() => reply); }
      if (holdList) { holdList = false; return new Promise((resolve) => { releaseList = () => resolve(reply); }); }
      return reply;
    }
    if (method === 'PATCH') {
      const previous = records.get(value.jobId); const result = { ...previous, job: applyWorkCommand(previous.job, value.command, value.revision) }; records.set(value.jobId, result); return response({ job: result.job }, 'PATCH');
    }
    assert.equal(method, 'POST');
    if (mode === 'owner') { mode = null; return Response.json({error:'Changed after identity check',code:ownerIntent.OWNER_CHANGED},{status:409}); }
    if (heldCreate) { const hold = heldCreate; heldCreate = null; hold.started.resolve(); await hold.promise; }
    const result = records.get(value.id) ?? await track(study.createMaterialStudy(value));
    records.set(value.id, result); recordOwners.set(value.id, requestOwner);
    if (heldWrite) { const hold = heldWrite; heldWrite = null; hold.ready.resolve(); await hold.promise; }
    if (mode === 'lost') { mode = null; throw Error('response lost'); }
    return response(result, 'POST', 201);
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
  async function flush() {
    // JSON decoding may begin a digest restore after a previous computation
    // finishes. Drain newly observed work before inspecting rendered state.
    do {
      await new Promise(resolve => setImmediate(resolve));
      while (computations.size) await Promise.allSettled(computations);
      await new Promise(resolve => setImmediate(resolve));
    } while (computations.size);
    render();
  }
  async function click(label) { const button = find('button', label); assert.ok(button, label); assert.ok(!button.props.disabled, label);
    button.props.onClick(); render(); await flush(); }
  function source(value) { find('textarea').props.onChange({ target: { value } }); render(); }
  render();
  return { listeners,
    navigate(attributes) { let prevented = false; documentListeners.get('click')?.({ button: 0, target: new Element(attributes), preventDefault() { prevented = true; } }); return prevented; },
    title(value) { nodes(find('label', '仕事の名前')).find(node => node.type === 'input').props.onChange({ target: { value } }); render(); }, holdWrite() { heldWrite = { ...Promise.withResolvers(), ready: Promise.withResolvers() }; const hold = heldWrite; return { ready: hold.ready.promise, release: () => hold.resolve() }; }, holdCreate() { heldCreate = { ...Promise.withResolvers(), started: Promise.withResolvers() }; const hold = heldCreate; return { started: hold.started.promise, release: () => hold.resolve() }; }, holdOpen() { heldOpen = Promise.withResolvers(); const hold = heldOpen; return () => hold.resolve(); }, setOwner(value) { currentOwner = value; }, render, find, flush, click, source, records, recordOwners, requests,
    changeResponse(kind, change) { responseChanges.set(kind, change); },
    holdNextList() { const gate = Promise.withResolvers(); listHoldQueue.push(gate); return () => gate.resolve(); },
    holdGeneration() { generationGate = Promise.withResolvers(); return () => generationGate.resolve(); }, holdList() { holdList = true; }, releaseList() { releaseList(); }, ownerRace() { mode = 'owner'; }, lost() { mode = 'lost'; }, signin(v) { signedIn = v; } };
}

void test('Material keeps the exact pending save through a 401 after a lost committed response', async () => {
  const h = harness(); await h.flush(); await h.click('合成サンプルを開く'); await h.click('この端末で候補を生成');
  h.lost(); await h.click('入力と候補を本人用に保存');
  assert.equal(h.records.size, 1);
  h.signin(false); await h.click('同じ操作を再試行');
  assert.equal(h.find('textarea').props.value, '', '401 hides the prior owner input');
  assert.equal(h.find('button', '同じ操作を再試行'), undefined);
  assert.equal(h.find('button', '入力と候補を本人用に保存'), undefined);
  assert.equal(h.find('a', 'サインインして保存を使う').props.target, '_blank');
  h.signin(true); await h.click('一覧を再読込'); await h.click('同じ操作を再試行'); await h.flush();
  const posts = h.requests.filter((r) => r.method === 'POST');
  assert.equal(posts.length, 2); assert.deepEqual(posts[1].value, posts[0].value);
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

void test('Material parks the private comparison and exact pending ID across 401 and a different owner', async () => {
  const h = harness(); await h.flush(); await h.click('合成サンプルを開く'); await h.click('この端末で候補を生成');
  h.lost(); await h.click('入力と候補を本人用に保存');
  const source = h.find('textarea').props.value;
  h.signin(false); await h.click('同じ操作を再試行');
  h.signin(true); h.setOwner(ownerB); await h.click('一覧を再読込');
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
  assert.equal(h.find('button', '同じ操作を再試行'), undefined);
  assert.equal(h.find('textarea').props.value, '');
  h.setOwner(ownerA); await h.click('一覧を再読込');
  assert.equal(h.find('textarea').props.value, source);
  await h.click('同じ操作を再試行');
  const posts = h.requests.filter(r => r.method === 'POST');
  assert.equal(posts.length, 2); assert.deepEqual(posts[1].value, posts[0].value);
  assert.equal(posts[1].headers[ownerIntent.OWNER_SCOPE_HEADER], ownerA); assert.equal(h.records.size, 1);
});
void test('a foreign owner and a stale release handler cannot rebind a private pending formulation', async () => {
  const h = harness(); await h.flush(); await h.click('合成サンプルを開く'); await h.click('この端末で候補を生成');
  h.lost(); await h.click('入力と候補を本人用に保存');
  const release = h.find('button', '保留を解除（入力は保持）').props.onClick;
  const source = h.find('textarea').props.value;
  h.setOwner(ownerB); await h.click('同じ操作を再試行');
  assert.equal(h.find('button', '保留を解除（入力は保持）'), undefined);
  assert.equal(h.find('textarea').props.value, '');
  release(); h.render(); await h.flush();
  assert.equal(h.find('button', '入力と候補を本人用に保存'), undefined);
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
  h.setOwner(ownerA); await h.click('一覧を再読込');
  assert.equal(h.find('textarea').props.value, source);
  await h.click('同じ操作を再試行');
  const posts = h.requests.filter(r => r.method === 'POST');
  assert.deepEqual(posts[1].value, posts[0].value); assert.equal(h.records.size, 1);
});
void test('Material unknown owner scope prevents new and pending writes without losing the comparison', async () => {
  const h = harness(); await h.flush(); h.setOwner(null); await h.click('一覧を再読込');
  await h.click('合成サンプルを開く'); await h.click('この端末で候補を生成');
  assert.ok(h.find('button', '入力と候補を本人用に保存').props.disabled);
  h.setOwner(ownerA); await h.click('一覧を再読込'); h.lost(); await h.click('入力と候補を本人用に保存');
  h.setOwner(null); await h.click('同じ操作を再試行');
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
  assert.equal(h.find('textarea').props.value, '');
  assert.equal(h.find('button', '同じ操作を再試行'), undefined);
  h.setOwner(ownerA); await h.click('一覧を再読込'); await h.click('同じ操作を再試行');
  const posts = h.requests.filter(r => r.method === 'POST'); assert.deepEqual(posts[1].value, posts[0].value);
});

void test('Material keeps the original ID when API rejects an owner switch after preflight', async () => {
 const h = harness(); await h.flush(); await h.click('合成サンプルを開く'); await h.click('この端末で候補を生成');
 h.ownerRace(); await h.click('入力と候補を本人用に保存');
 assert.equal(h.find('textarea').props.value, '');
 await h.click('一覧を再読込'); assert.ok(h.find('button', '同じ操作を再試行')); await h.click('同じ操作を再試行');
 const posts = h.requests.filter(r => r.method === 'POST');
 assert.deepEqual(posts[1].value, posts[0].value);
 assert.equal(posts[1].headers[ownerIntent.OWNER_SCOPE_HEADER], ownerA);
 assert.equal(h.records.size, 1);
});

async function privateStudy(h) {
  await h.flush(); await h.click('合成サンプルを開く');
  const input = structuredClone(fixture); input.goal.title = 'Alice private formulation'; input.materials[0].name = 'Alice private material';
  h.source(JSON.stringify(input)); h.title('Alice private title'); await h.click('この端末で候補を生成');
}
void test('confirmed owner changes hide title, input and graph and restore them only to the original owner', async () => {
  const h = harness(); await privateStudy(h); const source = h.find('textarea').props.value;
  h.setOwner(ownerB); await h.click('一覧を再読込');
  assert.equal(h.find('textarea').props.value, ''); assert.equal(h.find('strong', 'Alice private material'), undefined);
  assert.equal(h.find('button', '入力と候補を本人用に保存'), undefined);
  h.setOwner(ownerA); await h.click('一覧を再読込');
  assert.equal(h.find('textarea').props.value, source); assert.ok(h.find('strong', 'Alice private material'));
});
void test('same-frame save and command activation issue only one owned mutation', async () => {
  const h = harness(); await privateStudy(h);
  const save = h.find('button', '入力と候補を本人用に保存').props.onClick;
  save(); save(); h.render(); await h.flush();
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1); assert.equal(h.records.size, 1);
  const cancel = h.find('button', '仕事を終了する').props.onClick;
  cancel(); cancel(); h.render(); await h.flush();
  assert.equal(h.requests.filter(r => r.method === 'PATCH').length, 1);
  assert.equal([...h.records.values()][0].job.status, 'cancelled');
});
void test('anonymous candidate preview still works entirely in this browser with no server write', async () => {
  const h = harness(false); await h.flush(); await h.click('合成サンプルを開く'); await h.click('この端末で候補を生成');
  assert.ok(h.find('button', '入力を含むJSONを保存'));
  assert.equal(h.find('button', '入力と候補を本人用に保存').props.disabled, true);
  assert.equal(h.requests.filter(r => r.method !== 'GET').length, 0);
});
void test('a committed write finishing after an owner switch stays parked for original-ID reconciliation', async () => {
  const h = harness(); await privateStudy(h);
  const reload = h.find('button', '一覧を再読込').props.onClick;
  const held = h.holdWrite(); const saving = h.click('入力と候補を本人用に保存');
  await held.ready;
  const original = h.requests.find(request => request.method === 'POST');
  assert.equal(h.recordOwners.get(original.value.id), ownerA, 'Alice owns the committed study before switching');
  h.setOwner(ownerB); reload(); h.render(); await h.flush();
  held.release(); await saving; await h.flush();
  assert.equal(h.find('textarea').props.value, ''); assert.equal(h.find('strong', 'Alice private material'), undefined);
  h.setOwner(ownerA); await h.click('一覧を再読込'); await h.click('同じ操作を再試行');
  const posts = h.requests.filter(r => r.method === 'POST'); assert.deepEqual(posts[1].value, posts[0].value); assert.equal(h.records.size, 1);
});
void test('Material fixture binds the request owner before asynchronous creation commits', async () => {
  const h = harness(); await privateStudy(h);
  const reload = h.find('button', '一覧を再読込').props.onClick;
  const creation = h.holdCreate(), response = h.holdWrite();
  const saving = h.click('入力と候補を本人用に保存');
  await creation.started;
  const original = h.requests.find(request => request.method === 'POST');
  assert.equal(h.records.size, 0, 'creation is explicitly paused before commit');
  assert.equal(original.headers[ownerIntent.OWNER_SCOPE_HEADER], ownerA);
  h.setOwner(ownerB); reload(); h.render(); await h.flush();
  creation.release(); await response.ready;
  assert.equal(h.recordOwners.get(original.value.id), ownerA, 'later account state cannot change the dispatched request owner');
  response.release(); await saving; await h.flush();
  assert.equal(h.find('textarea').props.value, '');
  assert.equal(h.find('strong', 'Alice private material'), undefined);
  h.setOwner(ownerA); await h.click('一覧を再読込'); await h.click('同じ操作を再試行');
  const posts = h.requests.filter(request => request.method === 'POST');
  assert.deepEqual(posts[1].value, posts[0].value); assert.equal(h.records.size, 1);
  assert.equal(h.recordOwners.get(original.value.id), ownerA);
});

void test('late saved-study reads and local previews cannot fill a different owner workspace', async () => {
  for (const kind of ['open', 'preview']) {
    const h = harness(); await privateStudy(h);
    const reload = h.find('button', '一覧を再読込').props.onClick;
    let release, operation;
    if (kind === 'open') {
      await h.click('入力と候補を本人用に保存'); await h.click('新しい入力');
      release = h.holdOpen(); operation = h.click('Alice private title');
    } else { release = h.holdGeneration(); operation = h.click('この端末で候補を生成'); }
    h.setOwner(ownerB); reload(); h.render(); await new Promise(resolve => setImmediate(resolve)); h.render();
    release(); await operation; await h.flush();
    assert.equal(h.find('textarea').props.value, ''); assert.equal(h.find('strong', 'Alice private material'), undefined);
  }
});

void test('a late list cannot restore Alice after a save preflight confirms Bob', async () => {
  const h = harness(); await privateStudy(h);
  const oldList = h.find('button', '一覧を再読込').props.onClick;
  h.setOwner(ownerB);
  const releaseBob = h.holdNextList();
  h.find('button', '入力と候補を本人用に保存').props.onClick(); h.render();
  h.setOwner(ownerA);
  const releaseAlice = h.holdNextList();
  oldList(); h.render(); h.setOwner(ownerB);
  releaseBob(); await h.flush();
  assert.equal(h.find('textarea').props.value, '');
  releaseAlice(); await h.flush();
  assert.equal(h.find('textarea').props.value, '', 'the confirmed Bob identity fences an older Alice list');
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 0);
});

void test('malformed committed Material responses retain the exact ID and last safe graph', async () => {
  for (const change of [value => ({ ...value, graph: {} }), value => ({ ...value, graph: null }), value => {
    value.graph.candidates[0].safety.status = 'APPROVED'; return value;
  }, value => { value.job.materialStudy.requestDigest = '0'.repeat(64); return value; }]) {
    const h = harness(); await privateStudy(h);
    h.changeResponse('POST', change); await h.click('入力と候補を本人用に保存');
    assert.ok(h.find('button', '同じ操作を再試行'));
    assert.ok(h.find('strong', 'Alice private material'));
    assert.equal(h.records.size, 1);
    await h.click('同じ操作を再試行');
    const posts = h.requests.filter(r => r.method === 'POST');
    assert.deepEqual(posts[1].value, posts[0].value); assert.equal(h.records.size, 1);
    assert.equal(h.find('button', '同じ操作を再試行'), undefined);
  }
});
void test('valid-looking same-ID Material responses must still match the original input title and sample', async () => {
  for (const field of ['request', 'title', 'sample']) {
    const h = harness(); await privateStudy(h);
    h.changeResponse('POST', async value => {
      const saved = value.job.materialStudy;
      const input = { id: value.job.id, title: value.job.title, request: saved.request, sample: saved.sample };
      if (field === 'request') input.request.goal.title = 'Unrelated private goal';
      if (field === 'title') input.title = 'Unrelated private title';
      if (field === 'sample') input.sample = !input.sample;
      return study.createMaterialStudy(input);
    });
    await h.click('入力と候補を本人用に保存');
    assert.ok(h.find('button', '同じ操作を再試行'), field);
    assert.equal(h.find('p', 'Unrelated private goal'), undefined);
    await h.click('同じ操作を再試行');
    const posts = h.requests.filter(r => r.method === 'POST');
    assert.deepEqual(posts[1].value, posts[0].value); assert.equal(h.records.size, 1);
  }
});
void test('malformed saved-study reads leave the last confirmed input and graph usable', async () => {
  const h = harness(); await privateStudy(h); await h.click('入力と候補を本人用に保存');
  const original = h.find('textarea').props.value;
  for (const change of [value => ({ ...value, graph: {} }), value => {
    value.job.materialStudy.requestDigest = '0'.repeat(64); return value;
  }]) {
    h.changeResponse('open', change); await h.click('Alice private title');
    assert.equal(h.find('textarea').props.value, original);
    assert.ok(h.find('strong', 'Alice private material'));
  }
});
void test('a Material state command requires its persisted event before retiring the command ID', async () => {
  const h = harness(); await privateStudy(h); await h.click('入力と候補を本人用に保存');
  h.changeResponse('PATCH', value => { value.job.events = []; return value; });
  await h.click('仕事を終了する'); assert.ok(h.find('button', '同じ操作を再試行'));
  await h.click('同じ操作を再試行');
  const commands = h.requests.filter(r => r.method === 'PATCH');
  assert.deepEqual(commands[1].value, commands[0].value);
  assert.equal([...h.records.values()][0].job.status, 'cancelled');
  assert.equal(h.find('button', '同じ操作を再試行'), undefined);
});
void test('malformed Material list rows do not crash rendering or expose unverified labels', async () => {
  const h = harness(); await privateStudy(h);
  h.changeResponse('list', value => ({ ...value, jobs: [{ title: { secret: 'unverified' } }] }));
  await h.click('一覧を再読込');
  assert.equal(h.find('textarea').props.value, '');
  await h.click('一覧を再読込'); assert.ok(h.find('strong', 'Alice private material'));
});

void test('stale same-owner release and retry callbacks cannot replace a newer pending Material save', async () => {
  const h = harness(); await privateStudy(h); h.lost(); await h.click('入力と候補を本人用に保存');
  const oldRelease = h.find('button', '保留を解除（入力は保持）').props.onClick;
  const oldRetry = h.find('button', '同じ操作を再試行').props.onClick;
  await h.click('保留を解除（入力は保持）');
  assert.match(h.find('output').props.children, /完了している可能性/);
  h.title('Second intentional study'); h.lost(); await h.click('入力と候補を本人用に保存');
  oldRelease(); oldRetry(); h.render(); await h.flush();
  assert.ok(h.find('button', '同じ操作を再試行'));
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 2);
  await h.click('同じ操作を再試行');
  const posts = h.requests.filter(r => r.method === 'POST');
  assert.deepEqual(posts[2].value, posts[1].value); assert.notEqual(posts[1].value.id, posts[0].value.id);
});


for (const authenticated of [false, true]) void test(`unsent Material input protects navigation before valid export (authenticated=${authenticated})`, async () => {
  const h = harness(authenticated); await h.flush();
  assert.equal(h.navigate({ href: '/zema' }), false); assert.equal(h.listeners.has('beforeunload'), false);
  h.source('{"goal":"unfinished private input'); h.title('Unsent study');
  assert.equal(h.records.size, 0); assert.equal(h.find('button', '入力を含むJSONを保存'), undefined);
  assert.equal(h.navigate({ href: '/zema' }), true); assert.equal(h.listeners.has('beforeunload'), true);
  assert.equal(h.navigate({ href: '/signin-with-chatgpt', target: '_blank' }), false);
  await h.click('未保存の入力を破棄'); assert.equal(h.find('textarea').props.value, '');
  assert.equal(h.navigate({ href: '/zema' }), false); assert.equal(h.listeners.has('beforeunload'), false);
});

void test('parked unsent Material input remains guarded and only its original workspace can discard it', async () => {
  const h = harness(); await h.flush(); h.source('{"private":"Alice draft'); h.title('Alice draft');
  const oldDiscard = h.find('button', '未保存の入力を破棄').props.onClick;
  h.setOwner(ownerB); await h.click('一覧を再読込'); oldDiscard(); h.render();
  assert.equal(h.find('textarea').props.value, ''); assert.equal(h.find('button', '未保存の入力を破棄'), undefined);
  assert.equal(h.navigate({ href: '/zema' }), true);
  h.setOwner(ownerA); await h.click('一覧を再読込'); assert.equal(h.find('textarea').props.value, '{"private":"Alice draft');
  await h.click('未保存の入力を破棄'); assert.equal(h.navigate({ href: '/zema' }), false);
});

void test('stale Material discard cannot erase a newer draft or a committed unknown save', async () => {
  const h = harness(); await h.flush(); h.source('{"earlier":');
  const oldDiscard = h.find('button', '未保存の入力を破棄').props.onClick;
  h.source('{"later":'); oldDiscard(); h.render(); assert.equal(h.find('textarea').props.value, '{"later":');
  await h.click('合成サンプルを開く'); await h.click('この端末で候補を生成');
  const preSaveDiscard = h.find('button', '未保存の入力を破棄').props.onClick;
  h.lost(); await h.click('入力と候補を本人用に保存'); const first = h.requests.find(request => request.method === 'POST');
  oldDiscard(); preSaveDiscard(); h.render(); assert.ok(h.find('button', '同じ操作を再試行'));
  await h.click('同じ操作を再試行'); const posts = h.requests.filter(request => request.method === 'POST');
  assert.deepEqual(posts.at(-1).value, first.value); assert.equal(h.records.size, 1);
  assert.equal(h.navigate({ href: '/zema' }), false);
});

void test('confirmed saved and restored Material input leaves navigation without an unsaved warning', async () => {
  const h = harness(); await h.flush(); await h.click('合成サンプルを開く'); await h.click('この端末で候補を生成');
  assert.equal(h.navigate({ href: '/zema' }), true);
  await h.click('入力と候補を本人用に保存'); assert.equal(h.navigate({ href: '/zema' }), false);
  const saved = [...h.records.values()][0]; h.source('{"edited":'); assert.equal(h.navigate({ href: '/zema' }), true);
  await h.click(saved.job.title); assert.equal(h.navigate({ href: '/zema' }), false);
  assert.equal(h.find('button', '未保存の入力を破棄'), undefined);
  await h.click('新しい入力'); assert.equal(h.navigate({ href: '/zema' }), false, 'a fresh empty editor has no unsaved work');
});
