import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as iosInstall from '../lib/esim-ios-install.ts';

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

function harness({ iosConnect = false, userAgent = '' } = {}) {
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
    crypto, URL, Error, fetch: transport, navigator: { userAgent },
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
      if (id === 'next/link') return 'a';
      if (id === 'next/image') return 'img';
      if (id === '@/lib/operations-client') return operationExports;
      if (id === '@/lib/esim-ios-install') return iosInstall;
      if (id === 'lucide-react') return new Proxy({}, { get: () => inert });
      if (id.endsWith('.module.css')) return {};
      throw Error(id);
    },
  });
  function render() { cursor = 0; tree = exports.EsimPurchaseSetup({ orderId, iosConnect }); }
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
  return { replies, requests, deadlines, controllers, button, text: () => text(tree), nodes: () => nodes(tree),
    links: () => nodes(tree).map(node => node.props?.href).filter(Boolean), click, flush, render };
}
void test('installation gives a return path and offers the first Agent only after device access is verified', async () => {
  const h = harness();
  await showMaterial(h);
  assert.ok(h.text().includes('購入履歴・eSIM設定'));
  assert.ok(!h.links().includes('/noah/explore'));
  h.replies.push({ body: { ...ready, deviceInstallState: 'verified_installed_enabled' } }, { body: cloud });
  await h.click('状態を更新');
  assert.ok(!h.links().includes('/noah/explore'));
  h.replies.push({ body: { ...ready, esimDeviceEntitlementState: 'active' } }, { body: cloud });
  await h.click('状態を更新');
  for (const href of ['/noah/explore','/connect/service','/noah/usage','/noah/linux#monthly-statement'])
    assert.ok(h.links().includes(href), href);
  h.replies.push({ body: { ...ready, esimDeviceEntitlementState: 'revoked_or_stale' } }, { body: cloud });
  await h.click('状態を更新');
  assert.ok(!h.links().includes('/noah/explore'));
  assert.ok(h.requests.filter(request => request.options.method === 'POST').length === 1);
});
void test('a Sky-scoped active key keeps its workspace link without offering the Noah cloud runner', async () => {
  const h = harness();
  h.replies.push({ body: ready }, { body: { ...cloud, state: 'active', key: { scopes: ['sky'] } } });
  await h.click('状態を確認');
  assert.ok(h.links().includes('/noah'));
  assert.ok(!h.text().includes('NoahクラウドでAgentを使う'));
});
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

for (const [version, supportsLink] of [['17_3', false], ['17_4', true]]) {
  void test(`iOS ${version} exposes the correct install path and lets the account declare after setup`, async () => {
    const h = harness({ iosConnect: true, userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS ${version} like Mac OS X)` });
    h.replies.push({ body: { ...ready, iosEveEntitlementState: 'not_declared' } });
    await h.click('状態を確認');
    h.replies.push({ body: { material } });
    await h.click('導入情報を表示');
    const link = h.nodes().find(({ props }) => props.href?.startsWith('https://esimsetup.apple.com/'));
    assert.equal(Boolean(link), supportsLink);
    if (link) assert.equal(link.props.referrerPolicy, 'no-referrer');
    await h.click('QRコードを表示');
    assert.ok(h.nodes().some(({ type, props }) => type === 'img' && props.src.startsWith('data:image/gif;')));
    h.replies.push({ body: { iosEveEntitlementState: 'awaiting_provider' } });
    await h.click('eSIMの導入を宣言');
    assert.ok(h.text().includes('ダウンロード通知を確認中'));
    assert.ok(h.nodes().some(({ props }) => props.href === '/connect/done'));
    assert.equal(h.requests.at(-1).options.body, undefined);
    assert.match(h.requests.at(-1).path, /\/install-proof\/ios$/);
  });
}
