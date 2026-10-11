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
  const slots = [], effects = [], posts = [], storage = new Map(initial ? [['rockstar-entitlement-handoff', JSON.stringify(initial)]] : []);
  let cursor = 0, tree;
  const changed = (old, next) => !old || old.length !== next.length || old.some((v, i) => !Object.is(v, next[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const fetcher = async (_path, options) => {
    if (options?.method === 'POST') { const value = JSON.parse(options.body); posts.push(value); return Response.json({ entitlement: { ...value.claim, alreadyClaimed: false } }); }
    return Response.json({ entitlements: [], claimRedemptionAvailable: true });
  };
  const globals = { Error, URL, TextEncoder, TextDecoder, atob, btoa, fetch: fetcher, queueMicrotask,
    window: { location: { hash: '', pathname: '/connect', search: '' }, history: { state: null, replaceState() {} }, sessionStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k,v), removeItem: (k) => storage.delete(k) } },
  };
  const packageExports = {};
  runInNewContext(compile(readFileSync(new URL('../lib/rockstar-entitlement-package.ts', import.meta.url), 'utf8')), { ...globals, exports: packageExports });
  const exports = {};
  runInNewContext(compile(readFileSync(new URL('../components/rockstar-entitlement-claim.tsx', import.meta.url), 'utf8')), { ...globals, exports, require(id) {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id === 'next/link') return () => null;
    if (id === '@/lib/rockstar-entitlement-package') return packageExports;
    if (id.endsWith('.css')) return {};
    throw Error(id);
  } });
  function render() { cursor = 0; tree = exports.RockstarEntitlementClaim(); effects.splice(0).forEach((effect) => effect()); }
  function nodes(node, out = []) { if (Array.isArray(node)) node.forEach((x) => nodes(x, out)); else if (node && typeof node === 'object') { out.push(node); nodes(node.props?.children, out); } return out; }
  function find(type) { return nodes(tree).find((x) => x.type === type); }
  async function flush() { for (let i = 0; i < 4; i++) { await new Promise((resolve) => setImmediate(resolve)); render(); } }
  async function paste(value) { find('textarea').props.onChange({ target: { value: JSON.stringify(value) } }); await flush(); }
  async function importFile(text, size = 120) { const input = nodes(tree).find((x) => x.type === 'input' && x.props.type === 'file'); input.props.onChange({ currentTarget: { files: text ? [{ size, text }] : [], value: 'fixture.json' } }); await flush(); }
  async function submit() { await find('form').props.onSubmit({ preventDefault() {} }); await flush(); }
  render(); return { posts, flush, paste, importFile, submit, input: () => find('textarea').props.value, disabled: () => find('button').props.disabled };
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
