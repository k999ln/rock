import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const compile = (text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const bundle = (offerId) => ({ claim: { offerId }, claimCode: `rsk_${'synthetic'.repeat(5)}` });
const a = bundle('offer-from-link'), b = bundle('offer-from-file'), c = bundle('offer-from-paste');
function harness(initial = a) {
  const slots = [], effects = [], posts = [], requests = [], replies = [], controllers = [], deadlines = [], storage = new Map(initial ? [['rockstar-entitlement-handoff', JSON.stringify(initial)]] : []);
  let cursor = 0, tree;
  const changed = (old, next) => !old || old.length !== next.length || old.some((v, i) => !Object.is(v, next[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const fetcher = async (path, options = {}) => {
    requests.push({ path, options });
    const value = options.method === 'POST' ? JSON.parse(options.body) : null;
    if (value) posts.push(value);
    const reply = replies.shift();
    const hang = () => new Promise((_resolve, reject) => {
      if (options.signal?.aborted) reject(options.signal.reason);
      else options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
    if (reply?.hang === 'headers') return hang();
    if (reply?.hang === 'body') return { ok: true, status: 200, json: hang };
    if (reply) return Response.json(reply.body, { status: reply.status ?? 200 });
    if (value) return Response.json({ entitlement: { ...value.claim, alreadyClaimed: false } });
    return Response.json({ entitlements: [], claimRedemptionAvailable: true });
  };
  const globals = { Error, URL, TextEncoder, TextDecoder, atob, btoa, fetch: fetcher, queueMicrotask,
    AbortSignal: { timeout(ms) { deadlines.push(ms); const control = new AbortController(); controllers.push(control); return control.signal; } },
    window: { location: { hash: '', pathname: '/connect', search: '' }, history: { state: null, replaceState() {} }, sessionStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k,v), removeItem: (k) => storage.delete(k) } },
  };
  const packageExports = {};
  runInNewContext(compile(readFileSync(new URL('../lib/rockstar-entitlement-package.ts', import.meta.url), 'utf8')), { ...globals, exports: packageExports });
  const operationsExports = {};
  runInNewContext(compile(readFileSync(new URL('../lib/operations-client.ts', import.meta.url), 'utf8')), { ...globals, exports: operationsExports, require: () => ({}) });
  const exports = {};
  runInNewContext(compile(readFileSync(new URL('../components/rockstar-entitlement-claim.tsx', import.meta.url), 'utf8')), { ...globals, exports, require(id) {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id === 'next/link') return () => null;
    if (id === '@/lib/operations-client') return operationsExports;
    if (id === '@/lib/rockstar-entitlement-package') return packageExports;
    if (id.endsWith('.css')) return {};
    throw Error(id);
  } });
  function render() { cursor = 0; tree = exports.RockstarEntitlementClaim(); effects.splice(0).forEach((effect) => effect()); }
  function nodes(node, out = []) { if (Array.isArray(node)) node.forEach((x) => nodes(x, out)); else if (node && typeof node === 'object') { out.push(node); nodes(node.props?.children, out); } return out; }
  function find(type) { return nodes(tree).find((x) => x.type === type); }
  function text(node) { return typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : ''; }
  async function readback() { const button = nodes(tree).find((x) => x.type === 'button' && text(x).includes('再確認')); assert.ok(button); await button.props.onClick(); await flush(); }
  async function flush() { for (let i = 0; i < 4; i++) { await new Promise((resolve) => setImmediate(resolve)); render(); } }
  async function paste(value) { find('textarea').props.onChange({ target: { value: JSON.stringify(value) } }); await flush(); }
  async function importFile(text, size = 120) { const input = nodes(tree).find((x) => x.type === 'input' && x.props.type === 'file'); input.props.onChange({ currentTarget: { files: text ? [{ size, text }] : [], value: 'fixture.json' } }); await flush(); }
  async function submit() { await find('form').props.onSubmit({ preventDefault() {} }); await flush(); }
  render(); return { posts, requests, replies, controllers, deadlines, text: () => text(tree), signinLink: () => nodes(tree).find((x) => x.props?.href?.startsWith('/signin-with-chatgpt')).props, readback, flush, paste, importFile, submit, input: () => find('textarea').props.value, disabled: () => find('button').props.disabled };
}
void test('pasted purchase data replaces a previously loaded claim link', async () => { const h = harness(); await h.flush(); await h.paste(c); await h.submit(); assert.equal(h.posts[0].claim.offerId, c.claim.offerId); });
void test('selected purchase file replaces a previously loaded claim link', async () => { const h = harness(); await h.flush(); await h.importFile(async () => JSON.stringify(b)); await h.submit(); assert.equal(h.posts[0].claim.offerId, b.claim.offerId); });
void test('a late file read cannot replace data pasted after the file was selected', async () => { const h = harness(null); await h.flush(); let resolveFile; const delayed = new Promise((resolve) => { resolveFile = resolve; }); await h.importFile(() => delayed); await h.paste(c); resolveFile(JSON.stringify(b)); await h.flush(); await h.submit(); assert.equal(h.posts[0].claim.offerId, c.claim.offerId); });

void test('an unchanged handoff requires explicit submission and still redeems the same purchase', async () => {
  const h = harness(); await h.flush(); assert.equal(h.posts.length, 0);
  await h.submit(); assert.equal(h.posts[0].claim.offerId, a.claim.offerId);
});
void test('cancelling the file chooser preserves the current purchase choice', async () => {
  const h = harness(); await h.flush(); await h.importFile(null); await h.submit();
  assert.equal(h.posts[0].claim.offerId, a.claim.offerId);
});
void test('invalid manual input never falls back to the previous link', async () => {
  const h = harness(); await h.flush(); await h.paste({ invalid: true }); await h.submit();
  assert.equal(h.posts.length, 0);
});
void test('a newly selected invalid file cannot silently submit the old purchase', async () => {
  const h = harness(); await h.flush(); await h.importFile(async () => 'invalid');
  assert.equal(h.disabled(), true); await h.submit(); assert.equal(h.posts.length, 0);
});
void test('an oversized file clears the previous choice without reading its contents', async () => {
  const h = harness(); await h.flush(); let reads = 0;
  await h.importFile(async () => { reads++; return JSON.stringify(b); }, 16385);
  assert.equal(reads, 0); assert.equal(h.disabled(), true); await h.submit(); assert.equal(h.posts.length, 0);
});
void test('a pending file disables registration until a valid choice is available', async () => {
  const h = harness(); await h.flush(); const pending = Promise.withResolvers();
  await h.importFile(() => pending.promise); assert.equal(h.disabled(), true);
  await h.submit(); assert.equal(h.posts.length, 0);
  pending.resolve(JSON.stringify(b)); await h.flush(); assert.equal(h.disabled(), false);
  await h.submit(); assert.equal(h.posts[0].claim.offerId, b.claim.offerId);
});
void test('out-of-order file reads keep the last selected file', async () => {
  const h = harness(); await h.flush(); const first = Promise.withResolvers();
  await h.importFile(() => first.promise); await h.importFile(async () => JSON.stringify(c));
  first.resolve(JSON.stringify(b)); await h.flush(); assert.equal(h.input(), JSON.stringify(c));
  await h.submit(); assert.equal(h.posts[0].claim.offerId, c.claim.offerId);
});

for (const hang of ['headers', 'body']) void test(`claim ${hang} timeout permits status readback without resending the purchase`, async () => {
  const h = harness(); await h.flush(); h.replies.push({ hang });
  const pending = h.submit(); await h.flush();
  assert.ok(h.controllers.length >= 2, 'initial load and submission each have a bounded response deadline');
  h.controllers.at(-1).abort(new DOMException('timeout', 'TimeoutError'));
  await pending; assert.equal(h.posts.length, 1);
  assert.ok(h.text().includes('再確認'));
  h.replies.push({ body: { entitlements: [{ issuerId: 'issuer', claimId: 'claim', offerId: 'offer-from-link', scopes: ['sky'], status: 'active' }], claimRedemptionAvailable: true } });
  await h.readback(); assert.equal(h.posts.length, 1, 'readback never repeats the POST');
  assert.ok(h.text().includes('最新の利用権を確認しました'));
  assert.ok(h.text().includes('offer-from-link — sky — active'));
  assert.ok(!h.text().includes('登録はまだ行われていません'));
  await h.submit(); assert.equal(h.posts.length, 2); assert.deepEqual(h.posts[1], h.posts[0]);
  assert.ok(h.deadlines.every((ms) => ms === 10000));
});
for (const entitlement of ['invalid', { alreadyClaimed: 'false' }, null]) void test(`malformed claim success ${JSON.stringify(entitlement)} retains the purchase for explicit recovery`, async () => {
  const h = harness(); await h.flush(); h.replies.push({ body: { entitlement } });
  await h.submit(); assert.ok(h.text().includes('登録結果が不明'));
  await h.readback(); assert.equal(h.posts.length, 1);
  await h.submit(); assert.deepEqual(h.posts[1], h.posts[0]);
});
for (const status of [401, 302]) void test(`claim authentication loss (${status}) replaces prior purchase actions with sign-in`, async () => {
  const h = harness(); await h.flush(); h.replies.push({ status, body: { error: 'unauthorized' } });
  await h.submit(); assert.ok(h.text().includes('サインインして続ける'));
  assert.equal(h.signinLink().target, '_blank');
  assert.equal(h.signinLink().rel, 'noopener noreferrer');
  assert.ok(!h.text().includes('このRockstar IDに登録'));
  assert.equal(h.posts.length, 1);
  await h.readback(); assert.equal(h.posts.length, 1);
  await h.submit(); assert.deepEqual(h.posts[1], h.posts[0]);
});
