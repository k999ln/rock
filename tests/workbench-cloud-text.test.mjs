import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createWorkJob } from '../lib/workflow.ts';
import { remoteAiTextRequestDigest } from '../lib/remote-ai-text-request.ts';
import * as remoteTextClient from '../lib/remote-ai-text-client.ts';
const { RemoteAiTextClientError } = remoteTextClient;

const root = new URL('../', import.meta.url);
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const ceiling = { currency: 'USD', maximumChargeMinor: 5, inputTokenUpperBound: 100, outputTokenLimit: 1200, modelId: 'fixture-model', pricingVersion: 'fixture-1', rateCardDigest: 'a'.repeat(64) };
const execution = (parentJobId, state = 'quoted') => ({ id: `quote-${parentJobId}`, parentJobId, parentBudgetLimitMinor: 1000, requestId: 'request-1', approvalDigest: 'b'.repeat(64), state,
  quote: { ceiling, requestDigest: 'c'.repeat(64), createdAt: 1, expiresAt: 9999999999999, approvedCapMinor: 100 },
  saveResult: false, resultText: state === 'completed' ? 'Synthetic saved answer' : null, createdAt: 1, updatedAt: 1 });

async function harness({ onRemote, budget = null, records = [], executionAvailable = false, initialDraft = { prompt: 'Synthetic cloud task', currency: 'USD', maximumBudgetInput: '1.00' } } = {}) {
  const slots = [], effects = [], calls = [], timers = new Map(), requests = new Set();
  const navigationListeners = new Set();
  class Element { closest() { return this; } getAttribute(name) { return name === 'href' ? '/home' : null; } hasAttribute() { return false; } }
  const document = { addEventListener(name, fn) { if (name === 'click') navigationListeners.add(fn); }, removeEventListener(name, fn) { if (name === 'click') navigationListeners.delete(fn); } };
  let account = 'a';
  let cursor = 0, tree, mounted = true, afterUnmountWrites = 0, href = `https://local.test/work?workJob=${first}`;
  const jobs = [first, second].map((id, index) => createWorkJob({ id, title: `Job ${index + 1}`, templateId: 'article' }));
  const changed = (old, next) => !old || old.length !== next.length || old.some((v, i) => !Object.is(v, next[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (value) => { if (!mounted) afterUnmountWrites++; slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  react.useLayoutEffect = (...args) => react.useEffect(...args);
  const jsx = (type, props) => ({ type, props });
  const inert = () => null;
  const window = { get location() { return new URL(href); }, history: { state: null, replaceState(_state, _title, url) { href = String(url); } }, addEventListener() {}, removeEventListener() {},
    setInterval(fn, milliseconds) { const id = Symbol(); timers.set(id, { fn, milliseconds }); return id; }, clearInterval(id) { timers.delete(id); } };
  const fetch = async (path, options = {}) => { if (path.startsWith('/api/llm/quotes?')) calls.at(-1).signal = options.signal; return { ok: true, status: 200, json: async () => path === '/api/work-jobs' ? { jobs, ownerScope: account ? `owner-v1:${account.repeat(64)}` : undefined } : { delegations: [], budget, reservations: [], agents: [] } }; };
  async function remote(path, method = 'GET', body, _timeout, fetchImpl) {
    const call = { path, method, body }; calls.push(call);
    if (fetchImpl) void fetchImpl(path, { method, signal: new AbortController().signal });
    const response = onRemote?.(call, calls);
    if (response !== undefined) return response;
    if (path.startsWith('/api/llm/quotes?')) return { executions: records.filter((r) => r.parentJobId === new URL(path, 'https://local.test').searchParams.get('parentJobId')), executionAvailable };
    if (path === '/api/llm/estimate') return { estimate: ceiling, unitRates: [], rateSource: 'https://provider.example/pricing', cardId: 'fixture-card', withinUserCap: true };
    if (path === '/api/llm/quotes' && method === 'POST') {
      const record = execution(body.parentJobId); record.requestId = body.requestId; record.saveResult = body.saveResult;
      record.quote.requestDigest = await remoteAiTextRequestDigest({ model: body.model, prompt: body.prompt, maxOutputTokens: body.maxOutputTokens });
      return { execution: record, executionAvailable };
    }
    throw Error(`Unexpected remote call ${method} ${path}`);
  }
  function trackedRemote(...args) { const promise = remote(...args); requests.add(promise); void promise.then(() => requests.delete(promise), () => requests.delete(promise)); return promise; }
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': 'a', 'lucide-react': { Check: inert, Play: inert, Plus: inert, RefreshCw: inert },
    '@/components/use-pending-save-navigation': { usePendingSaveNavigation() {} },
    '@/components/mr-tool-runner': { MrToolRunner: inert }, '@/components/device-connection': { DeviceConnection: inert }, '@/components/workspace-shell': inert,
    '@/components/mcp-bot-runner': { McpBotRunner: inert }, '@/components/ui/textarea': { Textarea: 'textarea' },
    '@/components/mii-work-preview': { default: inert }, '@/components/agent-tool-job-runner': { default: inert },
    '@/components/ui/select': Object.fromEntries(['Select','SelectTrigger','SelectValue','SelectContent','SelectItem'].map((x) => [x,x])),
    '@/components/ui/dialog': Object.fromEntries(['Dialog','DialogContent','DialogTitle','DialogDescription'].map((x) => [x,x])),
    '@/lib/operations-client': { OperationRequestError: class extends Error {} },
    '@/lib/remote-ai-text-client': { ...remoteTextClient, remoteAiTextRequest: trackedRemote },
  };
  for (const name of ['workflow', 'work-job-view','owner-intent','pending-owner-intent','a2a-delegation-recovery','currency-format','remote-ai-text-request','rockstar-service-package-access','rockstar-package-handoff','a2a-result-handoff','sky-package-runtime','jennifer-execution-reports'])
    modules[`@/lib/${name}`] = await import(new URL(`lib/${name}.ts`, root));
  function compile(path) {
    const exports = {};
    const compiled = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    runInNewContext(compiled, { exports, window, document, Element, fetch, crypto, URL, TextEncoder, AbortSignal, AbortController, Error, setTimeout, require(name) { assert.ok(name in modules, name); return modules[name]; } }, { filename: path });
    return exports;
  }
  modules['@/lib/history-navigation-guard'] = await import(new URL('lib/history-navigation-guard.ts', root));
  modules['@/components/use-pending-save-navigation'] = compile('components/use-pending-save-navigation.ts');
  modules['@/components/use-owner-memory-state'] = compile('components/use-owner-memory-state.ts');
  const childPath = 'components/workbench-cloud-text.tsx';
  const child = compile(childPath);
  modules['@/components/workbench-cloud-text'] = child;
  const component = compile('components/workbench.tsx').default;
  function render() { cursor = 0; tree = component({ embedded: true, cloudDraft: initialDraft }); effects.splice(0).forEach((effect) => effect()); }
  function nodes(node, result = []) { if (Array.isArray(node)) node.forEach((item) => nodes(item, result)); else if (node && typeof node === 'object') { result.push(node); if (typeof node.type === 'function' && (node.type === child.WorkbenchCloudText || node.type === child.WorkbenchCloudTextDeleteDialog)) nodes(node.type(node.props), result); else nodes(node.props?.children, result); } return result; }
  function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(typeof node.type === 'function' && (node.type === child.WorkbenchCloudText || node.type === child.WorkbenchCloudTextDeleteDialog) ? node.type(node.props) : node.props?.children) : ''; }
  const find = (type, label) => nodes(tree).find((node) => node.type === type && (!label || text(node).includes(label)));
  async function flush() { let quiet = 0; while (quiet < 2) { await Promise.allSettled(requests); await new Promise((resolve) => setImmediate(resolve)); if (mounted) render(); quiet = requests.size ? 0 : quiet + 1; } }
  async function click(label) { const button = find('button', label); assert.ok(button && !button.props.disabled, label); button.props.onClick(); render(); await flush(); }
  function input(label, value) { const parent = find('label', label); assert.ok(parent, label); const input = nodes(parent).find((node) => ['input','textarea'].includes(node.type)); assert.ok(input, label); input.props.onChange({ target: { value } }); render(); }
  async function quote() { const form = nodes(tree).find((node) => node.type === 'form' && text(node).includes('料金見積を確認して保存')); assert.ok(form); form.props.onSubmit({ preventDefault() {} }); render(); await flush(); const deadline = Date.now() + 5000; while (find('button', '料金を確認中…')?.props.disabled) { assert.ok(Date.now() < deadline); await flush(); } }
  render(); await flush();
  function navigateHome() { let blocked = false; const event = { button: 0, target: new Element(), preventDefault() { blocked = true; } }; for (const listener of navigationListeners) listener(event); return blocked; }
  return { navigateHome, calls, records, find, input, click, quote, flush, render, account(value) { account = value; }, async tick() { for (let i = 0; i < 6; i++) { await new Promise((resolve) => setImmediate(resolve)); if (mounted) render(); } }, unmount() { mounted = false; slots.forEach((slot) => slot?.cleanup?.()); }, writes: () => afterUnmountWrites, text: () => text(tree), nodes: () => nodes(tree), timers, quoteHandler: () => nodes(tree).find((node) => node.type === 'form' && text(node).includes('料金見積を確認して保存')).props.onSubmit, startQuote() { const form = nodes(tree).find((node) => node.type === 'form' && text(node).includes('料金見積を確認して保存')); form.props.onSubmit({ preventDefault() {} }); render(); } };
}

void test('Cloud AI preserves draft across job selection and retains the original polling cadence', async () => {
  const h = await harness(); h.input('親job全体の上限', '10.00');
  await h.click('Job 2');
  assert.equal(h.nodes().find((n) => n.props?.id === 'work-cloud-text-prompt').props.value, 'Synthetic cloud task');
  const cap = h.nodes().find((n) => n.type === 'input' && n.props.value === '10.00'); assert.ok(cap);
  assert.ok([...h.timers.values()].every((timer) => timer.milliseconds === 10000));
});

void test('uncertain quote save keeps the request ID and a closed execution gate never exposes run', async () => {
  let lost = true;
  const h = await harness({ onRemote(call) { if (call.path === '/api/llm/quotes' && call.method === 'POST' && lost) { lost = false; throw new RemoteAiTextClientError(0, 'NETWORK'); } } });
  h.input('親job全体の上限', '10.00'); await h.quote(); await h.quote();
  const posts = h.calls.filter((c) => c.path === '/api/llm/quotes' && c.method === 'POST');
  assert.equal(posts.length, 2); assert.equal(posts[0].body.requestId, posts[1].body.requestId);
  assert.equal(h.find('button', 'この上限で承認して実行'), undefined);
  assert.equal(h.calls.filter((c) => c.path === '/api/llm/text').length, 0);
});

void test('shared budget remaining amount rejects a quote locally without changing its currency', async () => {
  const h = await harness({ budget: { currency: 'USD', budgetLimitMinor: 100, reservedMinor: 60, settledMinor: 30 } });
  await h.click('Job 1'); h.input('この依頼の最大額', '0.11'); await h.quote();
  assert.equal(h.calls.filter((c) => c.method === 'POST').length, 0);
  assert.ok(h.text().includes('残り予算以下'));
});

void test('late estimate for the previous job cannot create a quote for either job', async () => {
  const estimate = Promise.withResolvers();
  const h = await harness({ onRemote(call) { if (call.path === '/api/llm/estimate') return estimate.promise; } });
  h.input('親job全体の上限', '10.00'); h.startQuote();
  const next = h.find('button', 'Job 2'); next.props.onClick(); h.render();
  estimate.resolve({ estimate: ceiling, unitRates: [], rateSource: 'https://provider.example/pricing', cardId: 'fixture' }); await h.flush();
  assert.equal(h.calls.filter((c) => c.path === '/api/llm/quotes' && c.method === 'POST').length, 0);
});

void test('a 401 clears saved answers and disables quote actions until explicit readback', async () => {
  let unauthorized = false;
  const h = await harness({ records: [execution(first, 'completed')], onRemote(call) { if (unauthorized && call.path.startsWith('/api/llm/quotes?')) throw new RemoteAiTextClientError(401, 'UNAUTHORIZED'); } });
  assert.ok(h.text().includes('Synthetic saved answer'));
  unauthorized = true; await h.click('状態を更新');
  assert.ok(!h.text().includes('Synthetic saved answer'));
  assert.equal(h.find('button', '料金見積を確認して保存'), undefined);
  assert.equal(h.nodes().find((node) => node.props?.id === 'work-cloud-text-prompt'), undefined);
  assert.ok(h.find('a', 'サインインして続ける'));
});

void test('uncertain answer deletion reconciles through GET without repeating DELETE', async () => {
  const h = await harness({ records: [execution(first, 'completed')], onRemote(call) { if (call.method === 'DELETE') throw new RemoteAiTextClientError(0, 'NETWORK'); } });
  await h.click('保存した回答を削除'); await h.click('回答本文を削除する');
  const index = h.calls.findIndex((c) => c.method === 'DELETE'); assert.ok(index >= 0);
  assert.equal(h.calls.filter((c) => c.method === 'DELETE').length, 1);
  assert.ok(h.calls.slice(index + 1).some((c) => c.method === 'GET' && c.path.startsWith('/api/llm/quotes?')));
});


void test('matching quote approves once and a lost execution response only reads back; changed input never approves', async () => {
  const record = execution(first);
  record.quote.requestDigest = await remoteAiTextRequestDigest({ model: ceiling.modelId, prompt: 'Synthetic cloud task', maxOutputTokens: ceiling.outputTokenLimit });
  const h = await harness({ records: [record], executionAvailable: true, onRemote(call) {
    if (call.path === `/api/llm/quotes/${record.id}` && call.method === 'POST') return { execution: { ...record, state: 'reserved' } };
    if (call.path === '/api/llm/text') throw new RemoteAiTextClientError(0, 'NETWORK');
  } });
  h.input('siへの依頼', 'Changed input');
  await h.click('この上限で承認して実行');
  await until(() => h.text().includes('見積時の依頼文と一致しません'), h);
  assert.equal(h.calls.filter((c) => c.method === 'POST').length, 0);
  h.input('siへの依頼', 'Synthetic cloud task');
  await h.click('この上限で承認して実行');
  await until(() => h.calls.some((c) => c.path === '/api/llm/text') && h.find('button', '料金見積を確認して保存')?.props.disabled === false, h);
  const posts = h.calls.filter((c) => c.method === 'POST');
  assert.deepEqual(posts.map((c) => c.path), [`/api/llm/quotes/${record.id}`, '/api/llm/text']);
  assert.equal(posts[0].body.action, 'approve');
  assert.equal(posts[0].body.approvalDigest, record.approvalDigest);
  assert.equal(posts[1].body.quoteId, record.id);
  const index = h.calls.findIndex((c) => c.path === '/api/llm/text');
  assert.ok(h.calls.slice(index + 1).some((c) => c.method === 'GET' && c.path.startsWith('/api/llm/quotes?')));
});

// WebCrypto completion is independent of fetch; synchronize on the actual UI/call
// condition instead of counting event-loop ticks or increasing arbitrary sleeps.
async function until(predicate, h) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Cloud AI async operation completed');
    await new Promise((resolve) => setImmediate(resolve));
    await h.flush();
  }
}


void test('an older same-job list cannot replace a newer successful readback', async () => {
  const old = Promise.withResolvers(); let hold = false;
  const records = [];
  const h = await harness({ records, onRemote(call) {
    if (hold && call.path.startsWith('/api/llm/quotes?')) { hold = false; return old.promise; }
  } });
  hold = true; h.find('button', '状態を更新').props.onClick(); h.render();
  records.push(execution(first, 'completed'));
  h.find('button', '状態を更新').props.onClick(); h.render(); await h.tick();
  assert.ok(h.text().includes('Synthetic saved answer'));
  old.resolve({ executions: [], executionAvailable: false }); await h.flush();
  assert.ok(h.text().includes('Synthetic saved answer'));
});

void test('a list started before quote creation cannot erase its confirmed response', async () => {
  const old = Promise.withResolvers(); let hold = false;
  const h = await harness({ onRemote(call) {
    if (hold && call.path.startsWith('/api/llm/quotes?')) { hold = false; return old.promise; }
  } });
  h.input('親job全体の上限', '10.00');
  hold = true; h.find('button', '状態を更新').props.onClick(); h.render();
  h.startQuote();
  const deadline = Date.now() + 5000;
  while (!h.find('strong', '見積・承認待ち')) { assert.ok(Date.now() < deadline); await h.tick(); }
  assert.ok(h.find('strong', '見積・承認待ち'));
  old.resolve({ executions: [], executionAvailable: false }); await h.flush();
  assert.ok(h.find('strong', '見積・承認待ち'));
});

void test('duplicate same-frame quote submissions make only one estimate and one quote request', async () => {
  const h = await harness(); h.input('親job全体の上限', '10.00');
  const submit = h.quoteHandler();
  submit({ preventDefault() {} }); submit({ preventDefault() {} }); h.render();
  await until(() => h.calls.some((c) => c.path === '/api/llm/quotes' && c.method === 'POST') && h.find('button', '料金見積を確認して保存')?.props.disabled === false, h);
  assert.equal(h.calls.filter((c) => c.path === '/api/llm/estimate').length, 1);
  assert.equal(h.calls.filter((c) => c.path === '/api/llm/quotes' && c.method === 'POST').length, 1);
});

void test('duplicate same-frame approvals send the authorized execution only once', async () => {
  const record = execution(first);
  record.quote.requestDigest = await remoteAiTextRequestDigest({ model: ceiling.modelId, prompt: 'Synthetic cloud task', maxOutputTokens: ceiling.outputTokenLimit });
  const records = [record];
  const h = await harness({ records, executionAvailable: true, onRemote(call) {
    if (call.path === `/api/llm/quotes/${record.id}` && call.method === 'POST') return { execution: { ...record, state: 'reserved' } };
    if (call.path === '/api/llm/text') { records[0] = { ...record, state: 'completed', resultText: 'One accepted result' }; return { execution: records[0], text: records[0].resultText }; }
  } });
  const approve = h.find('button', 'この上限で承認して実行').props.onClick;
  approve(); approve(); h.render();
  await until(() => h.calls.some((c) => c.path === '/api/llm/text') && h.find('button', '料金見積を確認して保存')?.props.disabled === false, h);
  assert.equal(h.calls.filter((c) => c.path === `/api/llm/quotes/${record.id}` && c.method === 'POST').length, 1);
  assert.equal(h.calls.filter((c) => c.path === '/api/llm/text').length, 1);
  assert.ok(h.text().includes('One accepted result'));
});


void test('stale unauthorized list cannot replace current owner readback after switching A to B to A', async () => {
  const old = Promise.withResolvers(); let hold = false;
  const h = await harness({ records: [execution(first, 'completed')], onRemote(call) {
    if (hold && call.path.startsWith('/api/llm/quotes?')) { hold = false; return old.promise; }
  } });
  hold = true; h.find('button', '状態を更新').props.onClick(); h.render();
  const oldCall = h.calls.at(-1);
  h.find('button', 'Job 2').props.onClick(); h.render(); await h.tick();
  h.find('button', 'Job 1').props.onClick(); h.render(); await h.tick();
  assert.equal(oldCall.signal.aborted, true);
  assert.ok(h.text().includes('Synthetic saved answer'));
  old.reject(new RemoteAiTextClientError(401, 'UNAUTHORIZED')); await h.flush();
  assert.ok(h.text().includes('Synthetic saved answer'));
  assert.equal(h.find('a', 'サインインして続ける'), undefined);
});

void test('a switched-away estimate cannot create a quote after returning to the same job', async () => {
  const old = Promise.withResolvers();
  const h = await harness({ onRemote(call) { if (call.path === '/api/llm/estimate') return old.promise; } });
  h.input('親job全体の上限', '10.00'); h.startQuote();
  h.find('button', 'Job 2').props.onClick(); h.render(); await h.tick();
  h.find('button', 'Job 1').props.onClick(); h.render(); await h.tick();
  old.resolve({ estimate: ceiling, unitRates: [], rateSource: 'https://provider.example/pricing', cardId: 'old-fixture' }); await h.flush();
  assert.equal(h.calls.filter((c) => c.path === '/api/llm/quotes' && c.method === 'POST').length, 0);
  assert.equal(h.find('button', '料金見積を確認して保存').props.disabled, false);
});

void test('duplicate cancellation and answer deletion keep one mutation and retain the confirmed result', async () => {
  for (const state of ['quoted', 'completed']) {
    const record = execution(first, state);
    const h = await harness({ records: [record], onRemote(call) {
      if (call.path === `/api/llm/quotes/${record.id}` && call.method === 'POST') return { execution: { ...record, state: 'cancelled' } };
      if (call.method === 'DELETE') return { execution: { ...record, resultText: null }, resultDeleted: true };
    } });
    if (state === 'completed') await h.click('保存した回答を削除');
    const action = h.find('button', state === 'completed' ? '回答本文を削除する' : '見積を取り消す').props.onClick;
    action(); action(); h.render(); await h.flush();
    assert.equal(h.calls.filter((c) => c.method !== 'GET').length, 1);
    if (state === 'completed') assert.ok(!h.text().includes('Synthetic saved answer'));
    else assert.ok(h.find('strong', '取消済み'));
  }
});

void test('unmount cancels the pending list and ignores both late reads and mutations', async () => {
  for (const mutation of [false, true]) {
    const old = Promise.withResolvers(); let hold = false;
    const h = await harness({ onRemote(call) {
      if (hold && (mutation ? call.path === '/api/llm/estimate' : call.path.startsWith('/api/llm/quotes?'))) { hold = false; return old.promise; }
    } });
    h.input('親job全体の上限', '10.00'); hold = true;
    if (mutation) h.startQuote(); else { h.find('button', '状態を更新').props.onClick(); h.render(); }
    const last = h.calls.at(-1);
    h.unmount();
    if (!mutation) assert.equal(last.signal.aborted, true);
    old.resolve(mutation ? { estimate: ceiling } : { executions: [execution(first, 'completed')], executionAvailable: true }); await h.flush();
    assert.equal(h.writes(), 0);
    assert.equal(h.calls.filter((c) => c.path === '/api/llm/quotes' && c.method === 'POST').length, 0);
  }
});

// Keep the real response parser in the loop; only HTTP transport is synthetic.
const wireResponse = (call, body) => remoteTextClient.remoteAiTextRequest(call.path, call.method, call.body, 15000, async () => Response.json(body));
void test('incomplete quote and estimate responses never poison rendering or report successful save', async () => {
  for (const path of ['/api/llm/estimate', '/api/llm/quotes']) {
    const h = await harness({ onRemote(call) { if (call.path === path && call.method === 'POST') return wireResponse(call, path.endsWith('estimate') ? { estimate: {} } : { execution: {}, executionAvailable: true }); } });
    h.input('親job全体の上限', '10.00'); await h.quote();
    await until(() => h.find('button', '料金見積を確認して保存')?.props.disabled === false, h);
    assert.doesNotThrow(() => h.text()); assert.ok(!h.text().includes('見積を保存しました'));
    assert.ok(h.text().includes('応答の内容を確認できません'));
    if (path.endsWith('estimate')) assert.equal(h.calls.filter((call) => call.path === '/api/llm/quotes' && call.method === 'POST').length, 0);
  }
});
void test('quote responses must match parent, request ID and request digest while uncertain retry retains the original ID', async () => {
  for (const mismatch of ['parent', 'request', 'digest']) {
    const h = await harness({ onRemote(call) {
      if (call.path === '/api/llm/quotes' && call.method === 'POST') {
        const record = execution(mismatch === 'parent' ? second : first, 'completed'); record.resultText = 'Unrelated private answer';
        record.requestId = mismatch === 'request' ? 'other-request' : call.body.requestId;
        // The original digest is computed from the exact sent intent; replace only the field under test.
        return remoteAiTextRequestDigest({ model: call.body.model, prompt: call.body.prompt, maxOutputTokens: call.body.maxOutputTokens }).then((digest) => {
          record.quote.requestDigest = mismatch === 'digest' ? 'd'.repeat(64) : digest; return wireResponse(call, { execution: record, executionAvailable: true });
        });
      }
    } });
    h.input('親job全体の上限', '10.00'); await h.quote(); await until(() => h.find('button', '料金見積を確認して保存')?.props.disabled === false, h);
    assert.ok(!h.text().includes('Unrelated private answer')); assert.ok(!h.text().includes('見積を保存しました'));
    await h.quote(); await until(() => h.calls.filter((call) => call.path === '/api/llm/quotes' && call.method === 'POST').length === 2, h);
    const posts = h.calls.filter((call) => call.path === '/api/llm/quotes' && call.method === 'POST'); assert.equal(posts[0].body.requestId, posts[1].body.requestId);
  }
});
void test('malformed or unrelated lists retain the last confirmed answer and close execution', async () => {
  for (const response of [{}, { executions: [execution(second, 'completed')], executionAvailable: true }, { executions: {}, executionAvailable: true }]) {
    let malformed = false;
    const h = await harness({ records: [execution(first, 'completed')], onRemote(call) { if (malformed && call.path.startsWith('/api/llm/quotes?')) return wireResponse(call, response); } });
    assert.ok(h.text().includes('Synthetic saved answer')); malformed = true; await h.click('状態を更新');
    assert.ok(h.text().includes('Synthetic saved answer')); assert.ok(h.text().includes('応答の内容を確認できません'));
  }
});
void test('invalid approval responses never send execution even with a valid initial quote', async () => {
  for (const mismatch of ['missing', 'id', 'approvalDigest', 'quoted', 'cancelled']) {
    const record = execution(first); record.quote.requestDigest = await remoteAiTextRequestDigest({ model: ceiling.modelId, prompt: 'Synthetic cloud task', maxOutputTokens: ceiling.outputTokenLimit });
    const h = await harness({ records: [record], executionAvailable: true, onRemote(call) {
      if (call.path === `/api/llm/quotes/${record.id}` && call.method === 'POST') {
        const reply = { ...record, state: 'reserved' };
        if (mismatch === 'id') reply.id = 'different-quote';
        if (mismatch === 'approvalDigest') reply.approvalDigest = 'e'.repeat(64);
        if (['quoted', 'cancelled'].includes(mismatch)) reply.state = mismatch;
        return wireResponse(call, mismatch === 'missing' ? {} : { execution: reply });
      }
      if (call.path === '/api/llm/text') return wireResponse(call, { execution: { ...record, state: 'completed' }, text: 'Should not dispatch' });
    } });
    await h.click('この上限で承認して実行'); await until(() => h.find('button', '料金見積を確認して保存')?.props.disabled === false, h);
    assert.equal(h.calls.filter((call) => call.path === '/api/llm/text').length, 0);
    assert.equal(h.calls.filter((call) => call.method === 'POST').length, 1);
    assert.ok(h.text().includes('応答の内容を確認できません'));
  }
});
void test('uncorrelated text completion is never displayed and never automatically resent', async () => {
  const record = execution(first); record.quote.requestDigest = await remoteAiTextRequestDigest({ model: ceiling.modelId, prompt: 'Synthetic cloud task', maxOutputTokens: ceiling.outputTokenLimit });
  const h = await harness({ records: [record], executionAvailable: true, onRemote(call) {
    if (call.path === `/api/llm/quotes/${record.id}` && call.method === 'POST') return wireResponse(call, { execution: { ...record, state: 'reserved' } });
    if (call.path === '/api/llm/text') return wireResponse(call, { execution: { ...record, parentJobId: second, state: 'completed' }, text: 'Another job private response' });
  } });
  await h.click('この上限で承認して実行'); await until(() => h.find('button', '料金見積を確認して保存')?.props.disabled === false, h);
  assert.equal(h.calls.filter((call) => call.path === '/api/llm/text').length, 1);
  assert.ok(!h.text().includes('Another job private response'));
});
void test('unreconciled usage remains readable without rendering a nonexistent itemized price', async () => {
  const record = { ...execution(first, 'unreconciled'), usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5, cachedInputTokens: null, cacheWriteInputTokens: null }, price: { status: 'unreconciled', reason: 'MISSING_USAGE' } };
  const h = await harness({ records: [record] }); assert.doesNotThrow(() => h.text()); assert.ok(h.text().includes('利用量照合待ち'));
});
void test('private cloud drafts and pending request IDs are separated by confirmed owner and restored on return', async () => {
  const h = await harness({ onRemote(call) { if (call.path === '/api/llm/quotes' && call.method === 'POST') throw new RemoteAiTextClientError(0, 'NETWORK'); } });
  h.input('siへの依頼', 'Alice private instruction'); h.input('親job全体の上限', '10.00');
  await h.quote(); await until(() => h.find('button', '料金見積を確認して保存')?.props.disabled === false, h);
  const staleSubmit = h.quoteHandler(); const originalId = h.calls.find((call) => call.path === '/api/llm/quotes' && call.method === 'POST').body.requestId;
  h.account('b'); await h.click('再読込'); await h.click('Job 2');
  assert.equal(h.nodes().find((node) => node.props?.id === 'work-cloud-text-prompt').props.value, '');
  const count = h.calls.filter((call) => call.method === 'POST').length; staleSubmit({ preventDefault() {} }); await h.flush();
  assert.equal(h.calls.filter((call) => call.method === 'POST').length, count);
  h.input('siへの依頼', 'Bob separate instruction');
  h.account('a'); await h.click('再読込'); await h.click('Job 1');
  assert.equal(h.nodes().find((node) => node.props?.id === 'work-cloud-text-prompt').props.value, 'Alice private instruction');
  await h.quote(); await until(() => h.calls.filter((call) => call.path === '/api/llm/quotes' && call.method === 'POST').length === 2, h);
  assert.equal(h.calls.filter((call) => call.path === '/api/llm/quotes' && call.method === 'POST')[1].body.requestId, originalId);
});
void test('unknown owner hides private cloud input and blocks a captured submit until owner confirmation returns', async () => {
  const h = await harness(); h.input('siへの依頼', 'Alice private instruction'); h.input('親job全体の上限', '10.00');
  const submit = h.quoteHandler(); h.account(null); await h.click('再読込');
  assert.equal(h.nodes().find((node) => node.props?.id === 'work-cloud-text-prompt'), undefined);
  submit({ preventDefault() {} }); await h.flush(); assert.equal(h.calls.filter((call) => call.method === 'POST').length, 0);
  h.account('a'); await h.click('再読込'); await h.click('Job 1');
  assert.equal(h.nodes().find((node) => node.props?.id === 'work-cloud-text-prompt').props.value, 'Alice private instruction');
});

void test('after 401 only a fresh matching parent owner confirmation can reveal the preserved private cloud draft', async () => {
  for (const account of ['a', 'b']) {
    let phase = 'initial';
    const h = await harness({ onRemote(call) {
      if (call.path.startsWith('/api/llm/quotes?')) {
        if (phase === 'expired') throw new RemoteAiTextClientError(401, 'UNAUTHORIZED');
        if (phase === 'reauthenticated') return { executions: [], executionAvailable: false };
      }
    } });
    h.input('siへの依頼', 'Alice preserved private instruction');
    phase = 'expired'; await h.click('状態を更新');
    assert.equal(h.nodes().find((node) => node.props?.id === 'work-cloud-text-prompt'), undefined);
    h.account(account); phase = 'reauthenticated'; await h.click('状態を更新');
    const prompt = h.nodes().find((node) => node.props?.id === 'work-cloud-text-prompt')?.props.value;
    if (account === 'a') assert.equal(prompt, 'Alice preserved private instruction');
    else assert.notEqual(prompt, 'Alice preserved private instruction');
    assert.equal(h.calls.filter((call) => call.method === 'POST').length, 0);
  }
});

void test('a refresh handler captured before 401 must reconfirm the current owner before revealing a private draft', async () => {
  let expired = false;
  const h = await harness({ onRemote(call) { if (expired && call.path.startsWith('/api/llm/quotes?')) throw new RemoteAiTextClientError(401, 'UNAUTHORIZED'); } });
  h.input('siへの依頼', 'Alice private instruction');
  const staleRefresh = h.find('button', '状態を更新').props.onClick;
  expired = true; await h.click('状態を更新');
  h.account('b'); expired = false; staleRefresh(); await h.flush();
  assert.notEqual(h.nodes().find((node) => node.props?.id === 'work-cloud-text-prompt')?.props.value, 'Alice private instruction');
  assert.equal(h.calls.filter((call) => call.method === 'POST').length, 0);
});


void test('Cloud-only input guards actual same-tab navigation, default form does not, and explicit same-owner discard releases it', async () => {
  const h = await harness({ initialDraft: null });
  assert.equal(h.navigateHome(), false);
  h.input('siへの依頼', 'Unsaved cloud-only request');
  assert.equal(h.navigateHome(), true);
  await h.click('Cloud依頼の未保存入力を破棄');
  assert.equal(h.nodes().find((n) => n.props?.id === 'work-cloud-text-prompt').props.value, '');
  assert.equal(h.navigateHome(), false); assert.equal(h.calls.filter((c) => c.method === 'POST').length, 0);
});

void test('hidden cloud input retains navigation protection and stale owner setters/discard cannot erase it', async () => {
  const h = await harness({ initialDraft: null });
  h.input('siへの依頼', 'Alice retained cloud-only input');
  const oldInput = h.nodes().find((n) => n.props?.id === 'work-cloud-text-prompt').props.onChange;
  const oldDiscard = h.find('button', 'Cloud依頼の未保存入力を破棄').props.onClick;
  h.account('b'); await h.click('再読込'); await h.click('Job 2');
  assert.equal(h.nodes().find((n) => n.props?.id === 'work-cloud-text-prompt').props.value, '');
  oldInput({ target: { value: 'Stale overwrite' } }); oldDiscard(); h.render(); await h.flush();
  assert.equal(h.navigateHome(), true);
  h.account('a'); await h.click('再読込'); await h.click('Job 1');
  assert.equal(h.nodes().find((n) => n.props?.id === 'work-cloud-text-prompt').props.value, 'Alice retained cloud-only input');
  await h.click('Cloud依頼の未保存入力を破棄'); assert.equal(h.navigateHome(), false);
});

void test('an unknown sent quote blocks current and stale discard/input while retaining the exact retry intent', async () => {
  let lose = true;
  const h = await harness({ onRemote(call) { if (lose && call.path === '/api/llm/quotes' && call.method === 'POST') throw new RemoteAiTextClientError(0, 'NETWORK'); } });
  h.input('親job全体の上限', '10.00');
  const oldInput = h.nodes().find((n) => n.props?.id === 'work-cloud-text-prompt').props.onChange;
  const oldDiscard = h.find('button', 'Cloud依頼の未保存入力を破棄').props.onClick;
  await h.quote();
  assert.equal(h.find('button', 'Cloud依頼の未保存入力を破棄').props.disabled, true);
  oldInput({ target: { value: 'Stale overwrite' } }); oldDiscard(); h.render(); await h.flush();
  assert.equal(h.nodes().find((n) => n.props?.id === 'work-cloud-text-prompt').props.value, 'Synthetic cloud task');
  assert.equal(h.navigateHome(), true);
  lose = false; await h.quote();
  const posts = h.calls.filter((c) => c.path === '/api/llm/quotes' && c.method === 'POST');
  assert.equal(posts.length, 2); assert.deepEqual(posts[1].body, posts[0].body);
  assert.equal(h.find('button', 'Cloud依頼の未保存入力を破棄').props.disabled, false);
  await h.click('Cloud依頼の未保存入力を破棄'); assert.equal(h.navigateHome(), false);
});


void test('first quote validation refusal permits editing but a refusal after unknown save cannot retire its identity', async () => {
  for (const priorLostResponse of [false, true]) {
    let phase = priorLostResponse ? 'lost' : 'rejected';
    const h = await harness({ onRemote(call) {
      if (call.path === '/api/llm/quotes' && call.method === 'POST')
        throw new RemoteAiTextClientError(phase === 'lost' ? 0 : 422, phase === 'lost' ? 'NETWORK' : 'REMOTE_AI_QUOTE_OVER_CAP_OR_INVALID');
    } });
    h.input('親job全体の上限', '10.00'); await h.quote();
    if (priorLostResponse) { phase = 'rejected'; await h.quote(); }
    assert.equal(h.find('button', 'Cloud依頼の未保存入力を破棄').props.disabled, priorLostResponse);
    h.input('siへの依頼', 'Corrected request');
    assert.equal(h.nodes().find((n) => n.props?.id === 'work-cloud-text-prompt').props.value,
      priorLostResponse ? 'Synthetic cloud task' : 'Corrected request');
    if (priorLostResponse) {
      const posts = h.calls.filter((c) => c.path === '/api/llm/quotes' && c.method === 'POST');
      assert.deepEqual(posts[1].body, posts[0].body);
    }
  }
});

void test('matching saved quote readback reconciles unknown creation without another POST and permits explicit discard', async () => {
  let saved;
  const h = await harness({ onRemote(call) {
    if (call.path === '/api/llm/quotes' && call.method === 'POST') return (async () => {
      saved = execution(call.body.parentJobId); saved.requestId = call.body.requestId;
      saved.quote.requestDigest = await remoteAiTextRequestDigest({ model: call.body.model, prompt: call.body.prompt, maxOutputTokens: call.body.maxOutputTokens });
      throw new RemoteAiTextClientError(0, 'NETWORK');
    })();
    if (saved && call.path.startsWith('/api/llm/quotes?')) return { executions: [saved], executionAvailable: false };
  } });
  h.input('親job全体の上限', '10.00'); await h.quote();
  assert.equal(h.find('button', 'Cloud依頼の未保存入力を破棄').props.disabled, true);
  await h.click('状態を更新');
  assert.equal(h.find('button', 'Cloud依頼の未保存入力を破棄').props.disabled, false);
  assert.equal(h.calls.filter((c) => c.path === '/api/llm/quotes' && c.method === 'POST').length, 1);
  await h.click('Cloud依頼の未保存入力を破棄'); assert.equal(h.navigateHome(), false);
});


void test('a captured Cloud discard cannot erase a later same-owner draft or release its navigation guard', async () => {
  const h = await harness({ initialDraft: null });
  h.input('siへの依頼', 'Earlier draft');
  const staleDiscard = h.find('button', 'Cloud依頼の未保存入力を破棄').props.onClick;
  h.input('siへの依頼', 'Later draft with new private work');
  staleDiscard(); h.render(); await h.flush();
  assert.equal(h.nodes().find((n) => n.props?.id === 'work-cloud-text-prompt').props.value, 'Later draft with new private work');
  assert.equal(h.navigateHome(), true);
  await h.click('Cloud依頼の未保存入力を破棄'); assert.equal(h.navigateHome(), false);
});


void test('a saved quote with changed price identity cannot reconcile or release the original unknown intent', async () => {
  for (const patch of [{ currency: 'JPY' }, { pricingVersion: 'other-price' }, { rateCardDigest: 'f'.repeat(64) }, { maximumChargeMinor: 6 }]) {
    let saved;
    const h = await harness({ onRemote(call) {
      if (call.path === '/api/llm/quotes' && call.method === 'POST') return (async () => {
        saved = execution(call.body.parentJobId); saved.requestId = call.body.requestId;
        saved.quote.ceiling = { ...saved.quote.ceiling, ...patch };
        saved.quote.requestDigest = await remoteAiTextRequestDigest({ model: call.body.model, prompt: call.body.prompt, maxOutputTokens: call.body.maxOutputTokens });
        throw new RemoteAiTextClientError(0, 'NETWORK');
      })();
      if (saved && call.path.startsWith('/api/llm/quotes?')) return { executions: [saved], executionAvailable: false };
    } });
    h.input('親job全体の上限', '10.00'); await h.quote(); await h.click('状態を更新');
    assert.equal(h.find('button', 'Cloud依頼の未保存入力を破棄').props.disabled, true);
    assert.equal(h.navigateHome(), true); assert.equal(h.calls.filter((c) => c.path === '/api/llm/quotes' && c.method === 'POST').length, 1);
  }
});
