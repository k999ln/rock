import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = new URL('../components/esim-purchase-setup.tsx', import.meta.url);
const compile = (text) => ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const orderId = '00000000-0000-4000-8000-000000000001';
const ready = { orderId, state: 'profile_bound_install_material_ready', installMaterialAvailable: true, installMaterialAcknowledged: false };
const cloud = { available: false, state: 'not_issued', key: null, accessExpiresAt: null };
const material = { smdpAddress: 'fixture.example', matchingId: 'synthetic-install-code', iccid: 'synthetic-iccid' };

function harness() {
  const slots = [], replies = [], requests = [], deadlines = [], controllers = [];
  let cursor = 0, tree;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
  };
  const jsx = (type, props) => ({ type, props });
  const inert = () => null;
  const transport = async (path, options) => {
    requests.push({ path, options });
    const next = replies.shift();
    assert.ok(next, 'response fixture must exist');
    const hang = () => new Promise((_resolve, reject) => {
      if (options.signal?.aborted) reject(options.signal.reason);
      else options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
    if (next.hang === 'headers') return hang();
    if (next.hang === 'body') return { ok: true, status: 200, json: hang };
    return Response.json(next.body, { status: next.status ?? 200 });
  };
  const globals = {
    crypto, URL, Error, fetch: transport,
    AbortSignal: { timeout(ms) { deadlines.push(ms); const control = new AbortController(); controllers.push(control); return control.signal; } },
    sessionStorage: { getItem: () => null, setItem() {} },
  };
  const operationExports = {};
  runInNewContext(compile(readFileSync(new URL('../lib/operations-client.ts', import.meta.url), 'utf8')), {
    ...globals, exports: operationExports, require: () => ({}),
  });
  const exports = {};
  runInNewContext(compile(readFileSync(source, 'utf8')), {
    ...globals, exports, require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'next/link') return inert;
      if (id === '@/lib/operations-client') return operationExports;
      if (id === 'lucide-react') return new Proxy({}, { get: () => inert });
      if (id.endsWith('.module.css')) return {};
      throw Error(id);
    },
  });
  function render() { cursor = 0; tree = exports.EsimPurchaseSetup({ orderId }); }
  function nodes(node, out = []) {
    if (Array.isArray(node)) node.forEach((child) => nodes(child, out));
    else if (node && typeof node === 'object') { out.push(node); nodes(node.props?.children, out); }
    return out;
  }
  function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) :
    Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : ''; }
  function button(label) { return nodes(tree).find((node) => node.type === 'button' && text(node).includes(label)); }
  async function flush() { await new Promise((resolve) => setImmediate(resolve)); render(); }
  async function click(label) { const target = button(label); assert.ok(target, label); assert.ok(!target.props.disabled, label);
    target.props.onClick(); render(); await flush(); }
  render();
  return { replies, requests, deadlines, controllers, button, text: () => text(tree), click, flush, render };
}
async function showMaterial(h) {
  h.replies.push({ body: ready }, { body: cloud }); await h.click('状態を確認');
  h.replies.push({ body: { material } }); await h.click('導入情報を表示');
  assert.ok(h.text().includes(material.matchingId));
}

void test('refreshing an ineligible order removes previously displayed installation material', async () => {
  const h = harness(); await showMaterial(h);
  h.replies.push({ body: { orderId, state: 'not_eligible' } }); await h.click('状態を更新');
  assert.ok(!h.text().includes(material.matchingId), 'old install code must no longer be shown');
});
void test('authentication loss removes installation material and previous entitlement state', async () => {
  const h = harness(); await showMaterial(h);
  h.replies.push({ body: { error: 'unauthorized' }, status: 401 }); await h.click('状態を更新');
  assert.ok(!h.text().includes(material.matchingId), 'old install code must no longer be shown');
  assert.ok(!h.text().includes('導入情報を確認できます'));
});
for (const hang of ['headers', 'body']) void test(`timeout during ${hang} returns control without automatically repeating the request`, async () => {
  const h = harness(); h.replies.push({ hang }); await h.click('状態を確認');
  h.controllers.forEach((control) => control.abort(new DOMException('timeout', 'TimeoutError'))); await h.flush();
  assert.equal(h.button('状態を確認')?.props.disabled, false);
  assert.deepEqual(h.deadlines, [10000]);
  assert.equal(h.requests.length, 1);
});

void test('a delivery with a lost reply recovers the same attempt after a status read', async () => {
  const h = harness();
  h.replies.push({ body: ready }, { body: cloud }); await h.click('状態を確認');
  h.replies.push({ hang: 'body' }); await h.click('導入情報を表示');
  const original = JSON.parse(h.requests.at(-1).options.body);
  h.controllers.at(-1).abort(new DOMException('timeout', 'TimeoutError')); await h.flush();
  assert.ok(h.text().includes('結果が不明'));
  assert.equal(h.requests.filter((request) => request.options.method === 'POST').length, 1);
  assert.ok(!h.text().includes(material.matchingId));
  h.replies.push({ body: ready }, { body: cloud }); await h.click('状態を確認');
  h.replies.push({ body: { material } }); await h.click('導入情報を表示');
  const retry = JSON.parse(h.requests.at(-1).options.body);
  assert.deepEqual(retry, original);
  assert.ok(h.text().includes(material.matchingId));
  assert.ok(h.requests.every((request) => request.options.redirect === 'manual'));
});

void test('an acknowledgement with a lost reply hides the local code and reads back its committed state', async () => {
  const h = harness(); await showMaterial(h);
  h.replies.push({ hang: 'headers' }); await h.click('サーバーから消去');
  h.controllers.at(-1).abort(new DOMException('timeout', 'TimeoutError')); await h.flush();
  assert.ok(!h.text().includes(material.matchingId));
  assert.ok(!h.button('サーバーから消去'));
  h.replies.push({ body: { ...ready, state: 'install_material_acknowledged', installMaterialAvailable: false, installMaterialAcknowledged: true } }, { body: cloud });
  await h.click('状態を確認');
  assert.ok(h.text().includes('サーバー上の暗号化導入情報を消去しました'));
  assert.ok(!h.button('導入情報を表示'));
  assert.equal(h.requests.filter((request) => request.options.body?.includes('acknowledge')).length, 1);
});

void test('a cloud rotation with a lost reply removes stale access and reads back the new key without repeating rotation', async () => {
  const h = harness();
  const active = { ...cloud, available: true, state: 'active', key: { id: 'fixture-key-before', expiresAt: 2000000000000, scopes: ['sky:read'] } };
  h.replies.push({ body: ready }, { body: active }); await h.click('状態を確認');
  h.replies.push({ body: { material } }); await h.click('導入情報を表示');
  h.replies.push({ hang: 'body' }); await h.click('キーを再発行');
  assert.equal(JSON.parse(h.requests.at(-1).options.body).expectedKeyId, 'fixture-key-before');
  h.controllers.at(-1).abort(new DOMException('timeout', 'TimeoutError')); await h.flush();
  assert.ok(!h.text().includes(material.matchingId));
  assert.ok(!h.text().includes('アクセスキーは有効です'));
  h.replies.push({ body: ready }, { body: { ...active, key: { ...active.key, id: 'fixture-key-after' } } });
  await h.click('状態を確認');
  assert.ok(h.text().includes('アクセスキーは有効です'));
  assert.equal(h.requests.filter((request) => request.options.body?.includes('rotate')).length, 1);
});

void test('a sign-in redirect clears cached access without following the redirect', async () => {
  const h = harness(); await showMaterial(h);
  h.replies.push({ body: {}, status: 302 }); await h.click('状態を更新');
  assert.ok(!h.text().includes(material.matchingId));
  assert.ok(h.text().includes('サインインが必要'));
  assert.equal(h.requests.at(-1).options.redirect, 'manual');
});
