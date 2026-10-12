import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const ts = createRequire(new URL('../package.json', import.meta.url))('typescript');
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const a = 'ABCDEFGH', b = 'JKLMNPQR';
function harness(initialReply) {
  const slots = [], effects = [], requests = [], replies = initialReply ? [initialReply] : [], controllers = [];
  let cursor = 0, tree;
  const changed = (old, next) => !old || old.length !== next.length || old.some((v, i) => !Object.is(v, next[i]));
  const react = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const fetcher = async (path, options = {}) => {
    requests.push({ path, options, body: options.body ? JSON.parse(options.body) : null });
    const reply = replies.shift();
    if (reply?.pending) return reply.pending;
    const hang = () => new Promise((_resolve, reject) => {
      if (options.signal?.aborted) reject(options.signal.reason);
      else options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
    if (reply?.hang === 'headers') return hang();
    if (reply?.hang === 'body') return { ok: true, status: 200, json: hang };
    if (reply) return Response.json(reply.body, { status: reply.status ?? 200 });
    if (options.method === 'POST') return Response.json({ state: JSON.parse(options.body).action === 'approve' ? 'approved' : 'denied' });
    if (options.method === 'DELETE') return Response.json({ revoked: true });
    if (path.includes('user_code=')) return Response.json({ authorization: { clientName: path.endsWith(a) ? 'Device A' : 'Device B', expiresAt: Date.now() + 600000 } });
    return Response.json({ sessions: [] });
  };
  const globals = { Error, URL, Date, Intl, fetch: fetcher, AbortSignal: { timeout(ms) { assert.equal(ms, 10000); const c = new AbortController(); controllers.push(c); return c.signal; } } };
  const operations = {}; runInNewContext(compile('../lib/operations-client.ts'), { ...globals, exports: operations, require: () => ({}) });
  const exports = {}; runInNewContext(compile('../components/rockstar-device-authorization.tsx'), { ...globals, exports, require(id) {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id === 'next/link') return () => null;
    if (id === '@/lib/operations-client') return operations;
    if (id.endsWith('.css')) return {};
    throw Error(id);
  } });
  function nodes(node, out = []) { if (Array.isArray(node)) node.forEach((v) => nodes(v, out)); else if (node && typeof node === 'object') { out.push(node); nodes(node.props?.children, out); } return out; }
  const text = (node) => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : '';
  function render() { cursor = 0; tree = exports.RockstarDeviceAuthorization({ initialCode: a }); effects.splice(0).forEach((fn) => fn()); }
  async function flush() { for (let i = 0; i < 4; i++) { await new Promise((r) => setImmediate(r)); render(); } }
  const find = (type) => nodes(tree).find((n) => n.type === type);
  const button = (name) => nodes(tree).find((n) => n.type === 'button' && text(n) === name);
  render(); return { requests, replies, controllers, flush, text: () => text(tree), button, input: () => find('input'),
    async code(value) { find('input').props.onChange({ target: { value } }); await flush(); },
    async inspect() { await find('form').props.onSubmit({ preventDefault() {} }); await flush(); },
    async click(name) { const n = button(name); assert.ok(n, name); n.props.onClick(); await flush(); },
  };
}
void test('editing a device code invalidates the previously inspected device before approval', async () => {
  const h = harness(); await h.flush(); await h.inspect(); assert.ok(h.text().includes('Device A'));
  await h.code(b); assert.ok(!h.button('この端末を承認'));
  assert.ok(!h.text().includes('Device A'));
  await h.inspect(); assert.ok(h.text().includes('Device B')); await h.click('この端末を承認');
  assert.deepEqual(h.requests.find((r) => r.body?.action === 'approve').body, { action: 'approve', userCode: b });
});
for (const status of [401, 302]) void test(`device approval auth loss (${status}) removes the old confirmation and requires readback`, async () => {
  const h = harness(); await h.flush(); await h.inspect(); h.replies.push({ status, body: { error: 'sign_in_required' } });
  await h.click('この端末を承認'); assert.ok(h.text().includes('サインインして続ける'));
  assert.ok(!h.text().includes('sign_in_required'));
  assert.ok(!h.text().includes('Device A')); assert.ok(!h.button('この端末を承認'));
  const mutations = () => h.requests.filter((r) => r.body).length;
  assert.equal(mutations(), 1); await h.click('端末の状態を再確認'); assert.equal(mutations(), 1);
  assert.ok(!h.button('この端末を承認'), 'a new sign-in still needs a fresh inspection');
  await h.inspect(); assert.ok(h.text().includes('Device A'));
});
for (const hang of ['headers', 'body']) void test(`device approval ${hang} timeout permits only explicit readback and reinspection`, async () => {
  const h = harness(); await h.flush(); await h.inspect(); h.replies.push({ hang });
  await h.click('この端末を承認'); assert.equal(h.input().props.disabled, true);
  assert.ok(h.controllers.length >= 3);
  h.controllers.at(-1).abort(new DOMException('deadline', 'TimeoutError')); await h.flush();
  assert.ok(h.text().includes('操作結果が不明')); assert.ok(!h.button('この端末を承認'));
  await h.click('端末の状態を再確認'); assert.equal(h.requests.filter((r) => r.body).length, 1);
  assert.ok(!h.button('この端末を承認'));
});
void test('a late initial device list cannot restore controls after a newer 401', async () => {
  const delayed = Promise.withResolvers(), h = harness({ pending: delayed.promise });
  await h.flush(); h.replies.push({ status: 401, body: {} }); await h.click('端末の状態を再確認');
  delayed.resolve(Response.json({ sessions: [{ id: 'old', deviceName: 'Old account device', expiresAt: Date.now() + 600000 }] })); await h.flush();
  assert.ok(h.text().includes('サインインして続ける')); assert.ok(!h.text().includes('Old account device'));
  assert.ok(!h.button('端末を確認'));
});
void test('malformed approval success does not claim that the device connected', async () => {
  const h = harness(); await h.flush(); await h.inspect(); h.replies.push({ body: { state: 'pending' } });
  await h.click('この端末を承認'); assert.ok(h.text().includes('操作結果が不明'));
  assert.ok(!h.text().includes('接続を承認しました'));
});
void test('unknown revocation is read back without automatically repeating DELETE', async () => {
  const h = harness({ body: { sessions: [{ id: 'owned-session', deviceName: 'Owned device', expiresAt: Date.now() + 600000 }] } });
  await h.flush(); h.replies.push({ hang: 'body' }); await h.click('接続を解除');
  h.controllers.at(-1).abort(new DOMException('deadline', 'TimeoutError')); await h.flush();
  assert.ok(h.text().includes('操作結果が不明')); assert.ok(!h.text().includes('Owned device'));
  await h.click('端末の状態を再確認'); assert.equal(h.requests.filter((r) => r.options.method === 'DELETE').length, 1);
  assert.ok(h.text().includes('登録された端末はありません'));
});
void test('an in-flight device inspection locks the displayed code until its result returns', async () => {
  const h = harness(); await h.flush(); const delayed = Promise.withResolvers(); h.replies.push({ pending: delayed.promise });
  const pending = h.inspect(); await h.flush(); const disabled = h.input().props.disabled;
  delayed.resolve(Response.json({ authorization: { clientName: 'Device A', expiresAt: Date.now() + 600000 } })); await pending;
  assert.equal(disabled, true); assert.equal(h.input().props.disabled, false);
});
