import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readOwnerScope, OWNER_SCOPE_HEADER } from '../lib/owner-intent.ts';
const code = ts.transpileModule(readFileSync(new URL('../components/noah-result-data.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const scope = 'owner-v1:' + 'a'.repeat(64), otherScope = 'owner-v1:' + 'b'.repeat(64);
const detail = () => ({ id: 'job', revision: 4, result: { agentId: 'Test Agent', version: 'v1', completedAt: '2026-11-20T00:00:00Z', verification: 'host_observed_unverified', text: 'private result text', exitCode: 0, files: [{ name: 'report.csv', base64: 'eA==', bytes: 1, sha256: 'a'.repeat(64) }] }, contribution: null });
const page = () => ({ ownerScope: scope, operatorAllowed: false, items: [{ id: 'job', agentId: 'Test Agent', completedAt: '2026-11-20T00:00:00Z' }], nextCursor: null });
function harness(fetcher) {
  const slots = [], effects = [], exports = {}, calls = [], downloads = [], events = new Map(); let cursor = 0, tree;
  const jsx = (type, props) => ({ type, props });
  const document = { hidden: false, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name), createElement: () => ({ click() { downloads.push(this.download); } }) };
  runInNewContext(code, { exports, URLSearchParams, Error, Date, crypto, Blob, Uint8Array, atob, document, setTimeout: fn => fn(), URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    fetch: async (url, options) => { calls.push({ url, options }); return fetcher(url, options); },
    require(id) {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'react') return {
        useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
        useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
        useCallback(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => v !== old.deps[n])) slots[i] = { deps, value: fn }; return slots[i].value; },
        useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => v !== old.deps[n])) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
      };
      if (id === 'next/link') return { default: 'a' };
      if (id === '@/lib/noah-result-data-contract') return { NOAH_DATA_POLICY: 'noah-quality-v1' };
      if (id === '@/lib/owner-intent') return { readOwnerScope, OWNER_SCOPE_HEADER };
      if (id.endsWith('.module.css')) return { default: {} };
      throw Error(id);
    },
  });
  const render = () => { cursor = 0; tree = exports.default(); effects.splice(0).forEach(fn => fn()); };
  const walk = (value, disabled = false) => Array.isArray(value) ? value.flatMap(v => walk(v, disabled)) : value && typeof value === 'object' ? [{ ...value, disabled: disabled || !!value.props?.disabled }, ...walk(value.props?.children, disabled || (value.type === 'fieldset' && !!value.props.disabled))] : [];
  const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
  const button = label => { const node = walk(tree).find(n => n.type === 'button' && text(n).includes(label)); assert.ok(node, label); return node; };
  render();
  return { calls, downloads, text: () => text(tree), nodes: () => walk(tree), button, async flush() { for (let n = 0; n < 4; n++) { await new Promise(setImmediate); render(); } }, click(label) { const node = button(label); assert.equal(node.disabled, false, label); node.props.onClick(); render(); }, check(label, checked = true) { const node = walk(tree).find(n => n.type === 'label' && text(n).includes(label)); assert.ok(node, label); const input = walk(node.props.children).find(n => n.type === 'input'); assert.equal(input.disabled, false, label); input.props.onChange({ target: { checked } }); render(); }, visibility() { events.get('visibilitychange')?.(); render(); }, close() { slots.forEach(slot => slot.cleanup?.()); } };
}
const standard = async url => Response.json(new URL(url, 'https://noah.test').searchParams.has('id') ? { ...page(), detail: detail() } : page());
void test('sharing starts unselected, needs both selection and explicit consent, and sends no client result text', async t => {
  const h = harness(async (url, options) => options.method === 'POST' ? Response.json({ ...page(), contribution: { id: 'contribution', state: 'active', createdAt: 1, revokedAt: null } }) : standard(url)); t.after(() => h.close());
  await h.flush(); h.click('Test Agent'); await h.flush();
  assert.match(h.text(), /private result text/); assert.match(h.text(), /すでに運営が保存した写しは回収できません/);
  assert.equal(h.button('選択した成果を提供する').disabled, true);
  h.check('本文を提供する'); assert.equal(h.button('選択した成果を提供する').disabled, true);
  h.check('選んだ成果と目的を確認'); h.check('report.csv'); assert.equal(h.button('選択した成果を提供する').disabled, true);
  h.check('選んだ成果と目的を確認'); h.click('選択した成果を提供する'); await h.flush();
  const post = h.calls.find(c => c.options.method === 'POST'), body = JSON.parse(post.options.body);
  assert.equal(post.options.headers[OWNER_SCOPE_HEADER], scope); assert.equal(body.workRevision, 4); assert.equal(body.consent, true); assert.equal(body.policyVersion, 'noah-quality-v1'); assert.deepEqual(body.files, ['report.csv']); assert.doesNotMatch(post.options.body, /private result text/);
  assert.match(h.text(), /この成果は提供済み/); assert.equal(h.calls.filter(c => c.options.method === 'POST').length, 1);
});
void test('exports fetch authenticated current detail instead of downloading cached data', async t => {
  let changed = false;
  const h = harness(async url => changed ? Response.json({ error: 'アカウントが変わりました。' }, { status: 409 }) : standard(url)); t.after(() => h.close());
  await h.flush(); h.click('Test Agent'); await h.flush();
  h.click('成果をJSONで保存'); await h.flush(); assert.deepEqual(h.downloads, ['noah-result-job.json']);
  changed = true; h.click('report.csv を保存'); await h.flush();
  assert.equal(h.downloads.length, 1); assert.doesNotMatch(h.text(), /private result text|本文を提供する/); assert.match(h.text(), /アカウントが変わりました/);
  assert.equal(h.calls.at(-1).options.headers[OWNER_SCOPE_HEADER], scope);
});
void test('account mismatch or failed refresh clears previous results and consent', async t => {
  for (const mode of ['mismatch', '401', '503', 'network']) {
    let fail = false;
    const h = harness(async url => { if (!fail) return standard(url); if (mode === 'network') throw Error('network unavailable'); return mode === 'mismatch' ? Response.json({ ...page(), ownerScope: otherScope }) : Response.json({ error: '再確認してください。' }, { status: Number(mode) }); }); t.after(() => h.close());
    await h.flush(); h.click('Test Agent'); await h.flush(); h.check('本文を提供する'); h.check('選んだ成果と目的を確認'); fail = true;
    h.click('読み直す'); await h.flush(); assert.doesNotMatch(h.text(), /private result text|本文を提供する|選択した成果を提供する/);
    assert.equal(h.calls.some(c => c.options.method === 'POST'), false);
  }
});
void test('visibility change invalidates old consent callbacks and late responses', async t => {
  let deferred, defer = false;
  const h = harness(async url => defer ? new Promise(resolve => { deferred = resolve; }) : standard(url)); t.after(() => h.close());
  await h.flush(); h.click('Test Agent'); await h.flush(); h.check('本文を提供する'); h.check('選んだ成果と目的を確認');
  const staleShare = h.button('選択した成果を提供する').props.onClick;
  defer = true; h.click('成果をJSONで保存'); await new Promise(setImmediate); const resolveOld = deferred;
  h.visibility(); await new Promise(setImmediate); const resolveNew = deferred;
  resolveNew(Response.json({ ...page(), ownerScope: otherScope, items: [] })); await h.flush();
  resolveOld(Response.json({ ...page(), detail: detail() })); await h.flush(); staleShare(); await h.flush();
  assert.doesNotMatch(h.text(), /private result text/); assert.equal(h.downloads.length, 0); assert.equal(h.calls.some(c => c.options.method === 'POST'), false);
});
void test('operator view only appears with server permission and exports are rechecked after withdrawal', async t => {
  let withdrawn = false;
  const h = harness(async url => {
    const params = new URL(url, 'https://noah.test').searchParams;
    if (params.has('id') && withdrawn) return Response.json({ error: '提供されている成果がありません。' }, { status: 404 });
    return Response.json({ ...page(), operatorAllowed: true, ...(params.has('id') ? { detail: { ...detail(), contribution: undefined, revision: undefined } } : {}) });
  }); t.after(() => h.close());
  await h.flush(); h.click('運営に提供された成果'); await h.flush(); h.click('Test Agent'); await h.flush();
  assert.doesNotMatch(h.text(), /本文を提供する|提供を取り消す/); withdrawn = true; h.click('成果をJSONで保存'); await h.flush();
  assert.equal(h.downloads.length, 0); assert.doesNotMatch(h.text(), /private result text/); assert.match(h.calls.at(-1).url, /view=operator/);
});
void test('withdrawal is an explicit owner action and removes the share controls', async t => {
  let revoked = false;
  const h = harness(async (url, options) => {
    if (options.method === 'POST') { assert.deepEqual(JSON.parse(options.body), { action: 'revoke', id: 'contribution' }); revoked = true; }
    const contribution = { id: 'contribution', state: revoked ? 'revoked' : 'active', createdAt: 1, revokedAt: revoked ? 2 : null };
    return Response.json({ ...page(), ...(new URL(url, 'https://noah.test').searchParams.has('id') ? { detail: { ...detail(), contribution } } : {}), contribution });
  }); t.after(() => h.close()); await h.flush(); h.click('Test Agent'); await h.flush(); h.click('提供を取り消す'); await h.flush();
  assert.match(h.text(), /提供は取り消し済み/); assert.match(h.text(), /元の成果は残っています/); assert.equal(h.calls.filter(c => c.options.method === 'POST').length, 1);
});
