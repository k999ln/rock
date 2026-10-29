import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as requirements from '../lib/sky-agent-requirements.ts';
import * as runtime from '../lib/sky-package-runtime.ts';
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
  const declaration={schema:'rockstaros.tool-capability/1',capabilityIds:['fixture.process'],permissions:manifest.capabilities.permissions.map(permission=>({permission,scopes:permission==='network'?['origin:fixture']:[]}))};
  manifest.io.inputSchema[requirements.SKY_TOOL_CONTRACT_ANNOTATION]=declaration;
  const packageKey = packageApi.skyToolPackageKey(manifest);
  const item = { packageKey, manifest, manifestSha256: 'b'.repeat(64), status: 'verified', installable: true };
  const owner = 'owner-v1:' + 'a'.repeat(64);
  const initial = { id: '2e762de5-1f39-4a8a-95f9-03f8910b1630', revision: 1, name: '担当', instructions: '作業',
    provider: 'local-model', model: 'fixture-model', enabled: true, source: 'personal', sourceTool: null,
    updatedAt: 0, requirements: { inputFields: extraRequired ? ['text'] : [], outputFields: extraRequired ? ['count'] : [], packageKey, executionTarget: 'pc', contract:{schema:'rockstaros.agent-tool-expectation/1',inputTypes:extraRequired?{text:'integer'}:{},outputTypes:extraRequired?{count:'string'}:{},capabilityIds:['fixture.process'],allowedPermissions:declaration.permissions,runtime:{serverId:'s',toolName:'op'}} } };
  const servers = [{ id: 's', name: 'PC', state: 'connected', transport: 'stdio', passport: { observationId: crypto.randomUUID(), observedAt:Date.now(), observationExpiresAt:Date.now()+29_000, server: { name: 'PC service', version: 'fixture-3' }, toolDigest:'d'.repeat(64), tools: [{ name: 'op',
    inputSchema: manifest.io.inputSchema, outputSchema: manifest.io.outputSchema, pricing: { model: 'free' } }] } }];
  const entitlements = { ownerScope: owner, entitlements: [{ status: 'active', serviceProfile: { state: 'ready', activation: 'owner_choice_required', packages: [{ packageKey, state: 'ready' }] } }] };
  const slots = [], effects = [], pushes = [], writes = [], timers = [];
  let cursor = 0, tree, account = owner, revoked = false, malformedWrite = false, releaseRegistry;
  const refreshPending = [];
  let registryHeld = false, refreshHeld = false, refreshFails = false, holdFinal = false, readsWhileHeld = 0, releaseAgent;
  const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(initialValue) { const i = cursor++; if (!slots[i]) { const x = { value: typeof initialValue === 'function' ? initialValue() : initialValue }; x.set = value => { x.value = typeof value === 'function' ? value(x.value) : value; }; slots[i] = x; } return [slots[i].value, slots[i].set]; },
    useRef(initialValue) { const i = cursor++; if (!slots[i]) slots[i] = { current: initialValue }; return slots[i]; },
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  async function fetch(url, options = {}) {
    if (url.startsWith('/api/sky/agents?id=')) { if (holdFinal && ++readsWhileHeld === 2) await new Promise(resolve => { releaseAgent = resolve; }); return Response.json({ ownerScope: account, agent: initial }); }
    if (url === '/api/sky/tool-registry') { if (registryHeld) await new Promise(resolve => { releaseRegistry = resolve; }); return Response.json({ packages: [{ ...item, ...(revoked ? { status: 'revoked', installable: false } : {}) }] }); }
    if (url === '/api/rockstar/entitlements') return Response.json(entitlements);
    if (url === '/api/sky/agents' && options.method === 'PUT') { writes.push(options); return Response.json(malformedWrite ? {} : { agent: initial }); }
    throw new Error(`unexpected request ${url}`);
  }
  const modules = { react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { useRouter: () => ({ push: url => pushes.push(url) }) },
    '@/lib/mcp-hub': { listMcpConnections: async () => servers, refreshMcpObservation: async () => { if (refreshFails) throw new Error('fixture refresh failure'); if (refreshHeld) return await new Promise((resolve, reject) => refreshPending.push({ resolve, reject })); return { ...servers[0].passport, observationId: crypto.randomUUID(), observedAt: Date.now(), observationExpiresAt: Date.now() + 29_000 }; } }, '@/lib/sky-package-runtime': runtime, '@/lib/sky-tool-package': packageApi,
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
    checkbox() { return nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox'); },
    confirmSchema() { const node = nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox'); assert.ok(node); node.props.onChange({ target: { checked: true } }); render(); },
    unconfirmSchema() { const node = nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox'); assert.ok(node); node.props.onChange({ target: { checked: false } }); render(); },
    holdRegistry() { registryHeld = true; }, releaseRegistry() { assert.ok(releaseRegistry); registryHeld = false; releaseRegistry(); },
    begin(name) { const node = button(name); assert.ok(node && !node.props.disabled, name); node.props.onClick(); render(); },
    changeRuntime() { servers[0].passport.toolDigest='e'.repeat(64); },
    expireObservation() { servers[0].passport.observationExpiresAt=Date.now()-1; render(); },
    selectRuntime(value) { const field=nodes(tree).find(n=>n.type==='label' && text(n).includes('使用する接続と操作')); nodes(field).find(n=>n.type==='select').props.onChange({target:{value}}); render(); },
    holdRefresh() { refreshHeld = true; }, failRefresh() { refreshFails = true; },
    resolveRefresh(index) { refreshPending[index].resolve({ ...servers[0].passport, observationId: crypto.randomUUID(), observedAt: Date.now(), observationExpiresAt: Date.now() + 29_000 }); },
    holdFinalAgent() { holdFinal = true; readsWhileHeld = 0; }, releaseFinalAgent() { assert.ok(releaseAgent); holdFinal = false; releaseAgent(); },
    changePermission() { servers[0].passport.tools[0].inputSchema=structuredClone(manifest.io.inputSchema); servers[0].passport.tools[0].inputSchema[requirements.SKY_TOOL_CONTRACT_ANNOTATION].permissions.push({permission:'external_account',scopes:['account:other']}); },
    revoke() { revoked = true; }, switchOwner() { account = 'owner-v1:' + 'c'.repeat(64); }, switchEntitlementOwner() { entitlements.ownerScope = 'owner-v1:' + 'c'.repeat(64); }, malformedWrite() { malformedWrite = true; },
    expire() { timers.at(-1)?.(); render(); },
    changeCondition(label,value) { const field=nodes(tree).find(n=>n.type==='label'&&text(n).includes(label));nodes(field).find(n=>n.type==='textarea').props.onChange({target:{value}});render(); },
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

void test('new explicit condition changes invalidate acknowledgement; unspecified and empty stay distinct',async()=>{
 const h=harness();await h.flush();h.confirmSchema();h.changeCondition('許容permissionとscope','[]');
 assert.equal(h.button('同じ担当で仕事の確認へ進む'),undefined);assert.match(h.text(),/許容されていません/);
 h.changeCondition('許容permissionとscope','');assert.match(h.text(),/未指定/);
});
void test('runtime digest or explicit permission changes after acknowledgement cannot navigate',async()=>{
 for(const change of ['changeRuntime','changePermission']){const h=harness();await h.flush();h.confirmSchema();h[change]();
 await h.click('同じ担当で仕事の確認へ進む');assert.equal(h.pushes.length,0);assert.match(h.text(),/変わりました/);}
});

void test('Smith reports expired Tool observation and cannot open the reviewed job', async () => {
  const h = harness(); await h.flush(); h.confirmSchema(); h.expireObservation();
  assert.match(h.text(), /観測が未確認または期限切れ/);
  const action = h.button('同じ担当で仕事の確認へ進む');
  if (action && !action.props.disabled) { h.begin('同じ担当で仕事の確認へ進む'); await h.flush(); }
  assert.equal(h.pushes.length, 0);
});

void test('failed, pending, superseded or wrong-owner refresh never reuses the old observation', async () => {
  for (const mode of ['fail', 'pending', 'owner', 'selection', 'superseded']) {
    const h = harness(); await h.flush(); h.confirmSchema();
    if (mode === 'fail') h.failRefresh(); else h.holdRefresh();
    h.begin('選択した実Toolを再確認'); await h.flush();
    assert.match(h.text(), /観測が未確認または期限切れ/);
    const action = h.button('同じ担当で仕事の確認へ進む'); assert.ok(!action || action.props.disabled);
    if (mode === 'owner') { h.switchOwner(); h.resolveRefresh(0); await h.flush(); assert.match(h.text(), /観測が未確認または期限切れ/); }
    if (mode === 'selection') { h.selectRuntime(JSON.stringify(['other', 'op'])); h.resolveRefresh(0); await h.flush(); assert.match(h.text(), /観測が未確認または期限切れ/); }
    if (mode === 'superseded') {
      h.begin('選択した実Toolを再確認'); await h.flush(); h.resolveRefresh(0); await h.flush();
      assert.match(h.text(), /観測が未確認または期限切れ/); h.resolveRefresh(1); await h.flush();
      assert.doesNotMatch(h.text(), /観測が未確認または期限切れ/);
    }
    assert.equal(h.pushes.length, 0);
  }
});
void test('observation expiry during final Agent read blocks navigation', async () => {
  const h = harness(); await h.flush(); h.confirmSchema(); h.holdFinalAgent();
  h.begin('同じ担当で仕事の確認へ進む'); await h.flush(); h.expireObservation(); h.releaseFinalAgent(); await h.flush();
  assert.equal(h.pushes.length, 0);
});

void test('Smith identifies the observed Tool, declared version and UTC lease without asserting safety', async () => {
  const h = harness(); await h.flush();
  assert.match(h.text(), /接続先: PC/); assert.match(h.text(), /選択Tool: op/);
  assert.match(h.text(), /接続先の申告版: fixture-3/); assert.match(h.text(), /Package版: 0\.1\.0/);
  assert.match(h.text(), /観測日時: .*Z/); assert.match(h.text(), /有効期限: .*Z/);
  assert.match(h.text(), /安全性・権限・処理成功の保証ではありません/);
  assert.equal(h.checkbox().props.disabled, false); h.expireObservation();
  assert.equal(h.checkbox().props.disabled, true);
});
