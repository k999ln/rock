import * as pendingOwnerIntent from '../lib/pending-owner-intent.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
const ownerA = 'owner-v1:' + 'a'.repeat(64), ownerB = 'owner-v1:' + 'b'.repeat(64);
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createMercariRevenuePlan } from '../lib/mercari-revenue.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../components/mercari-revenue-starter.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
class RequestError extends Error { constructor(message, status, code) { super(typeof message === 'number' ? `HTTP ${message}` : message); this.status = typeof message === 'number' ? message : status; this.code = code; } }
function harness(records = new Map()) {
  const slots = [], effects = [], requests = [], listeners = new Map(), timers = new Map(), replies = [];
  let nextTimer = 0;
  let currentOwner = ownerA;
  let cursor = 0, tree, failure = null, resets = 0, access = 'ready', visibleRecords = records;
  const fixtureFields = { channel: 'consumer_assisted', title: 'Synthetic owned stock', condition: 'Checked', facts: 'Local fixture only',
    priceJPY: '3000', marketplaceFeeJPY: '300', shippingJPY: '750', itemCostJPY: '0', otherCostJPY: '0',
    ownsStock: 'on', accurate: 'on', prohibitedChecked: 'on' };
  const form = { fields: { ...fixtureFields }, reset() { resets++; this.fields = defaults(); } };
  let formKey;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(fn, deps) { const i = cursor++, previous = slots[i]; if (!previous || deps.some((value, index) => value !== previous.deps[index])) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        previous?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const inert = () => null, needsSignin = (value) => { access = value ? 'signin' : 'ready'; };
  async function request(_path, method = 'GET', value, headers) {
    requests.push({ method, headers, value: value === undefined ? undefined : JSON.parse(JSON.stringify(value)) });
    if (method === 'GET') return replies.length ? await replies.shift()() : { ownerScope: currentOwner, plans: [...visibleRecords.values()] };
    assert.equal(method, 'POST');
    const mode = failure; failure = null;
    if (mode === 'owner') throw new RequestError('Changed after identity check', 409, ownerIntent.OWNER_CHANGED);
    if (mode === 'unauthorized') throw new RequestError(401);
    if (mode === 'validation') throw new RequestError(400);
    if (mode === 'before') throw new RequestError(503);
    const plan = records.get(value.id) ?? createMercariRevenuePlan(value);
    records.set(plan.id, plan);
    if (mode === 'after') throw new Error('response lost');
    if (mode === 'invalid') return {};
    return plan;
  }
  const modules = { '@/lib/pending-owner-intent': pendingOwnerIntent, '@/lib/owner-intent': ownerIntent,
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': inert,
    '@/lib/operations-client': { operationRequest: request, OperationRequestError: RequestError },
    '@/components/workspace-shell': inert,
    '@/components/use-pending-save-navigation': { usePendingSaveNavigation(pending) { react.useEffect(() => { if (!pending) return; const fn = () => {}; listeners.set('beforeunload', fn); return () => listeners.delete('beforeunload'); }, [pending]); } },
    '@/components/execution-access': { ExecutionSignin: inert, useExecutionAccess: () => ({ executionBlocked: access !== 'ready', accessState: access, setNeedsSignin: needsSignin }) },
  };
  const exports = {};
  runInNewContext(compiled, { exports, crypto, Intl, Error,
    FormData: class { constructor(element) { this.fields = element.fields; } get(key) { return this.fields[key]; } },
    window: { setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }, addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } },
    require(id) {
      if (id in modules) return modules[id];
      if (id === 'lucide-react') return new Proxy({}, { get: () => inert });
      throw Error(id);
    },
  });
  function defaults() { return Object.fromEntries(nodes(tree).filter(n => ['input','textarea','select'].includes(n.type) && n.props.name).map(n => [n.props.name, n.props.type === 'checkbox' ? (n.props.defaultChecked ? 'on' : '') : n.props.defaultValue ?? ''])); }
  function render() { cursor = 0; tree = exports.default(); const currentForm = nodes(tree).find(n => n.type === 'form'); if (currentForm && currentForm.key !== formKey) { formKey = currentForm.key; form.fields = defaults(); } while (effects.length) effects.shift()(); return tree; }
  function nodes(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach((item) => nodes(item, out)); return out; }
    out.push(node); nodes(node.props?.children, out); return out;
  }
  function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) :
    Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : ''; }
  function visibleNodes(node, out = []) {
    if (!node || typeof node !== 'object' || node.props?.hidden) return out;
    if (Array.isArray(node)) { node.forEach((v) => visibleNodes(v, out)); return out; }
    out.push(node); visibleNodes(node.props?.children, out); return out;
  }
  function find(type, label) { return visibleNodes(tree).find((node) => node.type === type && (!label || text(node).includes(label))); }
  async function flush() { for (const [id, fn] of timers) { timers.delete(id); fn(); } await new Promise((resolve) => setImmediate(resolve)); render(); }
  async function click(label) { const button = find('button', label); assert.ok(button, label); assert.ok(!button.props.disabled, label);
    const result = button.props.onClick(); render(); await result; await flush(); }
  function fill(values = fixtureFields) { Object.assign(form.fields, values); find('form').props.onChange?.({ currentTarget: form }); render(); }
  async function submit(twice = false) { if (!form.fields.title) fill(); const handler = find('form').props.onSubmit;
    const promise = handler({ preventDefault() {}, currentTarget: form });
    if (twice) await handler({ preventDefault() {}, currentTarget: form });
    render(); await promise; await flush(); }
  render();
  return { setOwner(value) { currentOwner = value; }, replies, render, find, nodes: () => nodes(tree), flush, click, submit, requests, records, listeners, form,
    setAccess(value, visible = visibleRecords) { access = value; visibleRecords = visible; render(); },
    fill, get resets() { return resets; }, fail(mode) { failure = mode; } };
}

void test('lost creation response freezes fields and retries exactly once with the original ID', async () => {
  const h = harness(); await h.flush(); h.fail('after'); await h.submit(true);
  assert.equal(h.records.size, 1); assert.equal(h.resets, 0);
  assert.equal(h.requests.filter((r) => r.method === 'POST').length, 1, 'no automatic retry or double click write');
  assert.ok(h.find('button', '出品原稿と利益計画を作る').props.disabled);
  assert.ok(h.nodes().filter((n) => ['input', 'select', 'textarea'].includes(n.type)).every((n) => n.props.disabled));
  assert.ok(h.listeners.has('beforeunload'));
  h.form.fields.title = 'mutated outside the locked input';
  await h.click('同じ保存内容で結果を確認');
  const posts = h.requests.filter((r) => r.method === 'POST');
  assert.equal(posts.length, 2); assert.deepEqual(posts[0].value, posts[1].value);
  assert.equal(h.records.size, 1); assert.equal(h.resets, 1);
  assert.equal(h.find('button', '同じ保存内容で結果を確認'), undefined);
  assert.equal(h.listeners.has('beforeunload'), false);
  assert.ok(!h.find('button', '内容を承認').props.disabled);
  const reloaded = harness(h.records); await reloaded.flush();
  assert.ok(reloaded.find('h3', 'Synthetic owned stock'));
});

void test('precommit failure and malformed success keep the same operation until verified', async () => {
  for (const failure of ['before', 'invalid']) {
    const h = harness(); await h.flush(); h.fail(failure); await h.submit();
    assert.equal(h.records.size, failure === 'before' ? 0 : 1); assert.equal(h.resets, 0);
    await h.click('同じ保存内容で結果を確認');
    assert.equal(h.records.size, 1); assert.equal(h.resets, 1);
    assert.deepEqual(h.requests.filter((r) => r.method === 'POST').map((r) => r.value.id), [...h.records.keys(), ...h.records.keys()]);
  }
});

void test('definitive validation failure releases the form with its entered values', async () => {
  const h = harness(); await h.flush(); h.fail('validation'); await h.submit();
  assert.equal(h.records.size, 0); assert.equal(h.resets, 0);
  assert.equal(h.form.fields.title, 'Synthetic owned stock');
  assert.ok(!h.find('button', '出品原稿と利益計画を作る').props.disabled);
  assert.equal(h.find('button', '同じ保存内容で結果を確認'), undefined);
  assert.equal(h.listeners.has('beforeunload'), true);
});


void test('Mercari rechecks the owner list after authentication recovery instead of showing the old owner', async () => {
  const h = harness(); await h.flush(); await h.submit();
  assert.ok(h.find('h3', 'Synthetic owned stock'));
  h.setAccess('signin'); await h.flush();
  assert.ok(h.nodes().some((n) => n.type === 'form'), 'auth notice must hide, not unmount, the input form');
  h.setAccess('checking', new Map()); await h.flush();
  h.setAccess('ready'); await h.flush();
  assert.equal(h.find('h3', 'Synthetic owned stock'), undefined);
  assert.equal(h.requests.filter((r) => r.method === 'GET').length, 3);
});

void test('Mercari retains the uncertain payload through sign-in and deduplicates the refreshed row', async () => {
  const h = harness(); await h.flush(); h.fail('after'); await h.submit();
  h.fail('unauthorized'); await h.click('同じ保存内容で結果を確認');
  h.setAccess('ready'); await h.flush();
  await h.click('同じ保存内容で結果を確認');
  const posts = h.requests.filter((r) => r.method === 'POST');
  assert.equal(posts.length, 3); assert.deepEqual(posts[0].value, posts[2].value);
  assert.equal(h.records.size, 1); assert.equal(h.nodes().filter((n) => n.type === 'h3').length, 1);
});

void test('a late pre-create Mercari list cannot erase the confirmed saved card', async () => {
  const h = harness(); const delayed = Promise.withResolvers();
  await h.flush(); h.setAccess('checking'); h.setAccess('ready');
  h.replies.push(() => delayed.promise); await h.flush();
  await h.submit(); assert.equal(h.records.size, 1);
  delayed.resolve({ ownerScope: ownerA, plans: [] }); await h.flush();
  assert.ok(h.find('h3', 'Synthetic owned stock'));
  assert.equal(h.records.size, 1);
});

void test('Mercari binds a pending create across 401, rejects B, and resumes the original A ID', async () => {
  const h = harness(); await h.flush(); h.fail('before'); await h.submit();
  h.fail('unauthorized'); await h.click('同じ保存内容で結果を確認');
  h.setOwner(ownerB); h.setAccess('ready'); await h.flush();
  assert.ok(h.find('button', '同じ保存内容で結果を確認').props.disabled);
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 2);
  assert.equal(h.records.size, 0); assert.equal(h.resets, 0);
  h.setOwner(ownerA); await h.click('保存先の接続を確認'); await h.click('同じ保存内容で結果を確認');
  const posts = h.requests.filter(r => r.method === 'POST');
  assert.equal(posts.length, 3); assert.deepEqual(posts[2].value, posts[0].value);
  assert.equal(posts[2].headers[ownerIntent.OWNER_SCOPE_HEADER], ownerA);
});
void test('Mercari only lets the original owner release or discard retained private input', async () => {
  const h = harness(); await h.flush(); h.fail('before'); await h.submit();
  const staleRelease = h.find('button', '保留を解除（入力は保持）').props.onClick;
  h.setOwner(ownerB); await h.click('同じ保存内容で結果を確認');
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
  await h.click('保存先の接続を確認');
  const release = h.find('button', '保留を解除（入力は保持）');
  assert.equal(release.props.disabled, true); release.props.onClick(); staleRelease(); h.render();
  assert.ok(h.find('button', '同じ保存内容で結果を確認')); assert.equal(h.form.fields.title, '');
  h.setOwner(ownerA); await h.click('保存先の接続を確認');
  assert.equal(h.form.fields.title, 'Synthetic owned stock');
  await h.click('保留を解除（入力は保持）'); assert.equal(h.listeners.has('beforeunload'), true);
  await h.click('未保存の入力を破棄'); assert.equal(h.form.fields.title, '');
  assert.equal(h.listeners.has('beforeunload'), false);
  h.setAccess('checking'); await h.flush(); h.setOwner(ownerB); h.setAccess('ready'); await h.flush();
  h.fill({ ...h.form.fields, title: 'Bob own stock', condition: 'Checked', facts: 'Bob facts', priceJPY: '3000', marketplaceFeeJPY: '300', shippingJPY: '750', ownsStock: 'on', accurate: 'on', prohibitedChecked: 'on' });
  await h.submit();
  const posts = h.requests.filter(r => r.method === 'POST');
  assert.equal(posts.length, 2); assert.notEqual(posts[1].value.id, posts[0].value.id);
  assert.equal(posts[1].value.title, 'Bob own stock'); assert.equal(posts[1].headers[ownerIntent.OWNER_SCOPE_HEADER], ownerB);
});
void test('Mercari never treats an unknown identity GET as ready for a new or pending write', async () => {
  const h = harness(); h.setOwner(null); await h.flush();
  assert.ok(h.find('button', '出品原稿と利益計画を作る').props.disabled);
  h.setOwner(ownerA); await h.click('保存先の接続を確認'); h.fail('before'); await h.submit();
  h.setOwner(null); await h.click('同じ保存内容で結果を確認');
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
  assert.ok(h.find('button', '同じ保存内容で結果を確認'));
  assert.equal(h.resets, 0);
});

void test('Mercari keeps the frozen operation when owner changes between preflight and POST', async () => {
 const h = harness(); await h.flush(); h.fail('owner'); await h.submit();
 assert.ok(h.find('button', '同じ保存内容で結果を確認'));
 await h.click('同じ保存内容で結果を確認');
 const posts = h.requests.filter(r => r.method === 'POST');
 assert.deepEqual(posts[1].value, posts[0].value);
 assert.equal(posts[1].headers[ownerIntent.OWNER_SCOPE_HEADER], ownerA);
 assert.equal(h.records.size, 1);
});


for (const status of [400, 404, 409, 413, 415]) void test(`Mercari preflight GET ${status} cannot disprove an earlier committed save`, async () => {
  const h = harness(); await h.flush(); h.fail('after'); await h.submit();
  const original = h.requests.find(r => r.method === 'POST');
  h.replies.push(async () => { throw new RequestError('Synthetic preflight failure', status); });
  await h.click('同じ保存内容で結果を確認');
  assert.ok(h.find('button', '同じ保存内容で結果を確認'));
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
  assert.equal(h.records.size, 1); assert.equal(h.form.fields.title, '');
  assert.equal(h.listeners.has('beforeunload'), true);
  await h.click('同じ保存内容で結果を確認');
  assert.deepEqual(h.requests.filter(r => r.method === 'POST')[1].value, original.value);
  assert.equal(h.records.size, 1);
});

void test('Mercari unsent values and consent stay in memory for their author and stale handlers cannot submit/discard them', async () => {
  const h = harness(); await h.flush(); assert.equal(h.listeners.has('beforeunload'), false);
  h.fill(); assert.equal(h.listeners.has('beforeunload'), true);
  const oldForm = h.find('form'); const oldInput = oldForm.props.onChange;
  const oldSubmit = oldForm.props.onSubmit; const oldDiscard = h.find('button', '未保存の入力を破棄').props.onClick;
  h.setAccess('signin'); await h.flush(); h.setOwner(ownerB); h.setAccess('ready', new Map()); await h.flush();
  for (const key of ['title', 'condition', 'facts', 'priceJPY', 'ownsStock', 'accurate', 'prohibitedChecked']) assert.equal(h.form.fields[key], '', key);
  oldInput({ currentTarget: { fields: { ...h.form.fields, title: 'stale Alice mutation' } } });
  await oldSubmit({ preventDefault() {}, currentTarget: h.form }); oldDiscard(); h.render();
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 0);
  assert.equal(h.form.fields.title, '');
  h.fill({ title: 'Bob private product' });
  h.setAccess('checking'); await h.flush(); h.setOwner(ownerA); h.setAccess('ready'); await h.flush();
  assert.equal(h.form.fields.title, 'Synthetic owned stock'); assert.equal(h.form.fields.facts, 'Local fixture only');
  assert.equal(h.form.fields.ownsStock, 'on');
  await h.click('未保存の入力を破棄'); assert.equal(h.form.fields.title, '');
  assert.equal(h.listeners.has('beforeunload'), true, 'Bob draft still remains');
  h.setAccess('checking'); await h.flush(); h.setOwner(ownerB); h.setAccess('ready'); await h.flush();
  assert.equal(h.form.fields.title, 'Bob private product'); assert.equal(h.form.fields.ownsStock, '');
  await h.click('未保存の入力を破棄'); assert.equal(h.listeners.has('beforeunload'), false);
});

for (const malformed of [{}, { ownerScope: ownerB, plans: {} }, { ownerScope: ownerB, plans: [{}] }]) void test(`Mercari malformed snapshot masks prior private input and keeps uncertain ID (${JSON.stringify(malformed)})`, async () => {
  const h = harness(); await h.flush(); h.fail('after'); await h.submit();
  const original = h.requests.find(r => r.method === 'POST');
  h.replies.push(async () => malformed); await h.click('保存先の接続を確認');
  assert.equal(h.find('h3', 'Synthetic owned stock'), undefined); assert.equal(h.form.fields.title, '');
  assert.ok(h.find('button', '同じ保存内容で結果を確認')); assert.equal(h.listeners.has('beforeunload'), true);
  await h.click('同じ保存内容で結果を確認');
  assert.deepEqual(h.requests.filter(r => r.method === 'POST')[1].value, original.value);
  assert.equal(h.records.size, 1);
});

void test('Mercari captured retry and input handlers cannot revive a retired pending operation', async () => {
  const h = harness(); await h.flush(); h.fill();
  const oldInput = h.find('form').props.onChange;
  h.fail('before'); await h.submit();
  const oldRetry = h.find('button', '同じ保存内容で結果を確認').props.onClick;
  oldInput({ currentTarget: { fields: { ...h.form.fields, title: 'stale during pending' } } }); h.render();
  await h.click('保留を解除（入力は保持）');
  await oldRetry(); await h.flush();
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
  assert.equal(h.form.fields.title, 'Synthetic owned stock');
  assert.equal(h.find('button', '同じ保存内容で結果を確認'), undefined);
});

void test('Mercari stale release cannot retire a newer unknown save for the same owner', async () => {
  const h = harness(); await h.flush(); h.fail('before'); await h.submit();
  const oldRelease = h.find('button', '保留を解除（入力は保持）').props.onClick;
  await h.click('保留を解除（入力は保持）'); h.fail('after'); await h.submit();
  const pending = h.requests.filter(r => r.method === 'POST').at(-1).value;
  await h.click('保存先の接続を確認'); oldRelease(); h.render();
  assert.ok(h.find('button', '同じ保存内容で結果を確認'));
  await h.click('同じ保存内容で結果を確認');
  assert.deepEqual(h.requests.filter(r => r.method === 'POST').at(-1).value, pending);
  assert.equal(h.records.size, 1);
});
