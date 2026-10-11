import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createMercariRevenuePlan } from '../lib/mercari-revenue.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../components/mercari-revenue-starter.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
class RequestError extends Error { constructor(status) { super(`HTTP ${status}`); this.status = status; } }
function harness(records = new Map()) {
  const slots = [], effects = [], requests = [], listeners = new Map(), timers = new Map();
  let nextTimer = 0;
  let cursor = 0, tree, failure = null, resets = 0, access = 'ready', visibleRecords = records;
  const form = { fields: { channel: 'consumer_assisted', title: 'Synthetic owned stock', condition: 'Checked', facts: 'Local fixture only',
    priceJPY: '3000', marketplaceFeeJPY: '300', shippingJPY: '750', itemCostJPY: '0', otherCostJPY: '0',
    ownsStock: 'on', accurate: 'on', prohibitedChecked: 'on' }, reset() { resets++; } };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn, deps) { const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        previous?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const inert = () => null, needsSignin = (value) => { access = value ? 'signin' : 'ready'; };
  async function request(_path, method = 'GET', value) {
    requests.push({ method, value: value === undefined ? undefined : JSON.parse(JSON.stringify(value)) });
    if (method === 'GET') return { plans: [...visibleRecords.values()] };
    assert.equal(method, 'POST');
    const mode = failure; failure = null;
    if (mode === 'unauthorized') throw new RequestError(401);
    if (mode === 'validation') throw new RequestError(400);
    if (mode === 'before') throw new RequestError(503);
    const plan = records.get(value.id) ?? createMercariRevenuePlan(value);
    records.set(plan.id, plan);
    if (mode === 'after') throw new Error('response lost');
    if (mode === 'invalid') return {};
    return plan;
  }
  const modules = {
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
  function render() { cursor = 0; tree = exports.default(); while (effects.length) effects.shift()(); return tree; }
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
  async function submit(twice = false) { const handler = find('form').props.onSubmit;
    const promise = handler({ preventDefault() {}, currentTarget: form });
    if (twice) await handler({ preventDefault() {}, currentTarget: form });
    render(); await promise; await flush(); }
  render();
  return { render, find, nodes: () => nodes(tree), flush, click, submit, requests, records, listeners, form,
    setAccess(value, visible = visibleRecords) { access = value; visibleRecords = visible; render(); },
    get resets() { return resets; }, fail(mode) { failure = mode; } };
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
  assert.equal(h.listeners.has('beforeunload'), false);
});


void test('Mercari rechecks the owner list after authentication recovery instead of showing the old owner', async () => {
  const h = harness(); await h.flush(); await h.submit();
  assert.ok(h.find('h3', 'Synthetic owned stock'));
  h.setAccess('signin'); await h.flush();
  assert.ok(h.nodes().some((n) => n.type === 'form'), 'auth notice must hide, not unmount, the input form');
  h.setAccess('checking', new Map()); await h.flush();
  h.setAccess('ready'); await h.flush();
  assert.equal(h.find('h3', 'Synthetic owned stock'), undefined);
  assert.equal(h.requests.filter((r) => r.method === 'GET').length, 2);
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
