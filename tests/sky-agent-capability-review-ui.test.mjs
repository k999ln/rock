import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as requirements from '../lib/sky-agent-requirements.ts';
import * as packageApi from '../lib/sky-tool-package.ts';
import * as intent from '../lib/owner-intent.ts';
import * as packageAccess from '../lib/rockstar-service-package-access.ts';

const source = readFileSync(new URL('../components/sky-agent-capability-review.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;

function harness(extraRequired = false) {
  const manifest = packageApi.createSkyToolPackageDraft({ sourceKind: 'github', sourceUrl: 'https://github.com/example/tool', developerName: 'Example', developerId: 'example', license: 'MIT' });
  if (extraRequired) manifest.io = { inputSchema: { type: 'object', properties: { text: { type: 'integer' }, secret: { type: 'string' } }, required: ['text', 'secret'] },
    outputSchema: { type: 'object', properties: { count: { type: 'string' } } } };
  const packageKey = packageApi.skyToolPackageKey(manifest);
  const item = { packageKey, manifest, manifestSha256: 'b'.repeat(64), status: 'verified', installable: true };
  const owner = 'owner-v1:' + 'a'.repeat(64);
  const initial = { id: '2e762de5-1f39-4a8a-95f9-03f8910b1630', revision: 1, name: '担当', instructions: '作業',
    provider: 'local-model', model: 'fixture-model', enabled: true, source: 'personal', sourceTool: null,
    updatedAt: 0, requirements: { inputFields: extraRequired ? ['text'] : [], outputFields: extraRequired ? ['count'] : [], packageKey, executionTarget: 'pc' } };
  const servers = [{ id: 's', name: 'PC', state: 'connected', transport: 'stdio', passport: { tools: [{ name: 'op',
    inputSchema: manifest.io.inputSchema, outputSchema: manifest.io.outputSchema, pricing: { model: 'free' } }] } }];
  const entitlements = { ownerScope: owner, entitlements: [{ status: 'active', serviceProfile: { state: 'ready', activation: 'owner_choice_required', packages: [{ packageKey, state: 'ready' }] } }] };
  const slots = [], effects = [], pushes = [], writes = [], timers = [];
  let cursor = 0, tree, account = owner, revoked = false, malformedWrite = false, releaseRegistry;
  let registryHeld = false;
  const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(initialValue) { const i = cursor++; if (!slots[i]) { const x = { value: typeof initialValue === 'function' ? initialValue() : initialValue }; x.set = value => { x.value = typeof value === 'function' ? value(x.value) : value; }; slots[i] = x; } return [slots[i].value, slots[i].set]; },
    useRef(initialValue) { const i = cursor++; if (!slots[i]) slots[i] = { current: initialValue }; return slots[i]; },
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  async function fetch(url, options = {}) {
    if (url.startsWith('/api/sky/agents?id=')) return Response.json({ ownerScope: account, agent: initial });
    if (url === '/api/sky/tool-registry') { if (registryHeld) await new Promise(resolve => { releaseRegistry = resolve; }); return Response.json({ packages: [{ ...item, ...(revoked ? { status: 'revoked', installable: false } : {}) }] }); }
    if (url === '/api/rockstar/entitlements') return Response.json(entitlements);
    if (url === '/api/sky/agents' && options.method === 'PUT') { writes.push(options); return Response.json(malformedWrite ? {} : { agent: initial }); }
    throw new Error(`unexpected request ${url}`);
  }
  const modules = { react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { useRouter: () => ({ push: url => pushes.push(url) }) },
    '@/lib/mcp-hub': { listMcpConnections: async () => servers }, '@/lib/sky-tool-package': packageApi,
    '@/lib/sky-agent-requirements': requirements, '@/lib/owner-intent': intent, '@/lib/rockstar-service-package-access': packageAccess };
  const exports = {};
  runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; },
    fetch, AbortController, URLSearchParams, queueMicrotask, window: { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} } });
  function render() { cursor = 0; tree = exports.default({ agent: initial }); while (effects.length) effects.shift()(); }
  function nodes(node, out = []) { if (Array.isArray(node)) node.forEach(n => nodes(n, out)); else if (node && typeof node === 'object') { out.push(node); nodes(node.props?.children, out); } return out; }
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const button = name => nodes(tree).find(n => n.type === 'button' && text(n).includes(name));
  async function flush() { for (let i = 0; i < 6; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } }
  render();
  return { flush, render, button, writes, pushes, text: () => text(tree),
    confirmSchema() { const node = nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox'); assert.ok(node); node.props.onChange({ target: { checked: true } }); render(); },
    unconfirmSchema() { const node = nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox'); assert.ok(node); node.props.onChange({ target: { checked: false } }); render(); },
    holdRegistry() { registryHeld = true; }, releaseRegistry() { assert.ok(releaseRegistry); registryHeld = false; releaseRegistry(); },
    begin(name) { const node = button(name); assert.ok(node && !node.props.disabled, name); node.props.onClick(); render(); },
    revoke() { revoked = true; }, switchOwner() { account = 'owner-v1:' + 'c'.repeat(64); }, switchEntitlementOwner() { entitlements.ownerScope = 'owner-v1:' + 'c'.repeat(64); }, malformedWrite() { malformedWrite = true; },
    expire() { timers.at(-1)?.(); render(); },
    changeInput(value) { const field = nodes(tree).find(n => n.type === 'textarea'); field.props.onChange({ target: { value } }); render(); },
    async click(name) { const node = button(name); assert.ok(node && !node.props.disabled, name); node.props.onClick(); render(); await flush(); },
  };
}

void test('Smith revalidates owner, package, entitlement and runtime before opening the same Agent job', async () => {
  const h = harness(); await h.flush();
  assert.equal(h.button('同じ担当で仕事の確認へ進む').props.disabled, true);
  assert.match(h.text(), /目的文から必要な項目や型を自動で読み取っていません/);
  h.confirmSchema();
  await h.click('同じ担当で仕事の確認へ進む');
  assert.equal(h.pushes.length, 1); assert.match(h.pushes[0], /agentRevision=1/); assert.match(h.pushes[0], /package=/);
  assert.equal(h.writes.length, 0);
});
void test('revoked Package or changed account cannot open a stale candidate', async () => {
  for (const failure of ['revoked', 'owner', 'entitlement-owner']) {
    const h = harness(); await h.flush(); h.confirmSchema(); if (failure === 'revoked') h.revoke(); else if (failure === 'owner') h.switchOwner(); else h.switchEntitlementOwner();
    await h.click('同じ担当で仕事の確認へ進む');
    assert.equal(h.pushes.length, 0); assert.match(h.text(), /変わりました|利用権を確認できません/);
  }
});
void test('expired review cannot be used and a malformed successful save cannot be resubmitted', async () => {
  const h = harness(); await h.flush(); h.expire(); assert.equal(h.button('同じ担当で仕事の確認へ進む'), undefined);
  const h2 = harness(); await h2.flush(); h2.changeInput('text'); h2.malformedWrite();
  await h2.click('必要な能力を保存');
  assert.equal(h2.writes.length, 1); assert.equal(h2.button('必要な能力を保存').props.disabled, true);
  assert.match(h2.text(), /保存結果が一致しません/);
});
void test('Smith displays Tool schema and does not advance when a required input is missing', async () => {
  const h = harness(true); await h.flush();
  assert.match(h.text(), /必須入力「secret」/);
  assert.match(h.text(), /"type": "integer"/);
  h.confirmSchema();
  assert.equal(h.button('同じ担当で仕事の確認へ進む'), undefined);
  assert.equal(h.pushes.length, 0);
});
void test('revocation, expiry or editing while registry lookup is pending prevents navigation', async () => {
  for (const action of ['revoke', 'recheck', 'expire', 'edit']) {
    const h = harness(); await h.flush(); h.confirmSchema(); h.holdRegistry();
    h.begin('同じ担当で仕事の確認へ進む'); await h.flush();
    if (action === 'revoke' || action === 'recheck') { h.unconfirmSchema(); if (action === 'recheck') h.confirmSchema(); }
    else if (action === 'expire') h.expire(); else h.changeInput('text');
    h.releaseRegistry(); await h.flush();
    assert.equal(h.pushes.length, 0, action);
    assert.match(h.text(), /確認が変更または期限切れ/);
  }
});
