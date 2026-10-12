import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createWorkJob } from '../lib/workflow.ts';
import { remoteAiTextRequestDigest } from '../lib/remote-ai-text-request.ts';
import { RemoteAiTextClientError } from '../lib/remote-ai-text-client.ts';

const root = new URL('../', import.meta.url);
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const ceiling = { currency: 'USD', maximumChargeMinor: 5, inputTokenUpperBound: 100, outputTokenLimit: 1200, modelId: 'fixture-model', pricingVersion: 'fixture-1', rateCardDigest: 'a'.repeat(64) };
const execution = (parentJobId, state = 'quoted') => ({ id: `quote-${parentJobId}`, parentJobId, parentBudgetLimitMinor: 1000, requestId: 'request-1', approvalDigest: 'b'.repeat(64), state,
  quote: { ceiling, requestDigest: 'c'.repeat(64), createdAt: 1, expiresAt: 9999999999999, approvedCapMinor: 100 },
  resultText: state === 'completed' ? 'Synthetic saved answer' : null, createdAt: 1, updatedAt: 1 });

async function harness({ onRemote, budget = null, records = [], executionAvailable = false } = {}) {
  const slots = [], effects = [], calls = [], timers = new Map(), requests = new Set();
  let cursor = 0, tree, href = `https://local.test/work?workJob=${first}`;
  const jobs = [first, second].map((id, index) => createWorkJob({ id, title: `Job ${index + 1}`, templateId: 'article' }));
  const changed = (old, next) => !old || old.length !== next.length || old.some((v, i) => !Object.is(v, next[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const inert = () => null;
  const window = { get location() { return new URL(href); }, history: { state: null, replaceState(_state, _title, url) { href = String(url); } }, addEventListener() {}, removeEventListener() {},
    setInterval(fn, milliseconds) { const id = Symbol(); timers.set(id, { fn, milliseconds }); return id; }, clearInterval(id) { timers.delete(id); } };
  const fetch = async (path) => ({ ok: true, status: 200, json: async () => path === '/api/work-jobs' ? { jobs, ownerScope: `owner-v1:${'a'.repeat(64)}` } : { delegations: [], budget, reservations: [], agents: [] } });
  async function remote(path, method = 'GET', body) {
    const call = { path, method, body }; calls.push(call);
    const response = onRemote?.(call, calls);
    if (response !== undefined) return response;
    if (path.startsWith('/api/llm/quotes?')) return { executions: records.filter((r) => r.parentJobId === new URL(path, 'https://local.test').searchParams.get('parentJobId')), executionAvailable };
    if (path === '/api/llm/estimate') return { estimate: ceiling, unitRates: [], rateSource: 'https://provider.example/pricing', cardId: 'fixture-card', withinUserCap: true };
    if (path === '/api/llm/quotes' && method === 'POST') return { execution: execution(body.parentJobId), executionAvailable };
    throw Error(`Unexpected remote call ${method} ${path}`);
  }
  function trackedRemote(...args) { const promise = remote(...args); requests.add(promise); void promise.then(() => requests.delete(promise), () => requests.delete(promise)); return promise; }
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': 'a', 'lucide-react': { Check: inert, Play: inert, Plus: inert, RefreshCw: inert },
    '@/components/use-pending-save-navigation': { usePendingSaveNavigation() {} },
    '@/components/mr-tool-runner': { MrToolRunner: inert }, '@/components/device-connection': { DeviceConnection: inert }, '@/components/workspace-shell': inert,
    '@/components/mcp-bot-runner': { McpBotRunner: inert }, '@/components/ui/textarea': { Textarea: 'textarea' },
    '@/components/ui/select': Object.fromEntries(['Select','SelectTrigger','SelectValue','SelectContent','SelectItem'].map((x) => [x,x])),
    '@/components/ui/dialog': Object.fromEntries(['Dialog','DialogContent','DialogTitle','DialogDescription'].map((x) => [x,x])),
    '@/lib/operations-client': { OperationRequestError: class extends Error {} },
    '@/lib/remote-ai-text-client': { remoteAiTextRequest: trackedRemote, RemoteAiTextClientError },
  };
  for (const name of ['workflow','owner-intent','pending-owner-intent','a2a-delegation-recovery','currency-format','remote-ai-text-request','rockstar-service-package-access','rockstar-package-handoff','a2a-result-handoff','sky-package-runtime'])
    modules[`@/lib/${name}`] = await import(new URL(`lib/${name}.ts`, root));
  function compile(path) {
    const exports = {};
    const compiled = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    runInNewContext(compiled, { exports, window, fetch, crypto, URL, TextEncoder, AbortSignal, Error, setTimeout, require(name) { assert.ok(name in modules, name); return modules[name]; } }, { filename: path });
    return exports;
  }
  const childPath = 'components/workbench-cloud-text.tsx';
  const child = compile(childPath);
  modules['@/components/workbench-cloud-text'] = child;
  const component = compile('components/workbench.tsx').default;
  function render() { cursor = 0; tree = component({ embedded: true, cloudDraft: { prompt: 'Synthetic cloud task', currency: 'USD', maximumBudgetInput: '1.00' } }); effects.splice(0).forEach((effect) => effect()); }
  function nodes(node, result = []) { if (Array.isArray(node)) node.forEach((item) => nodes(item, result)); else if (node && typeof node === 'object') { result.push(node); if (typeof node.type === 'function' && (node.type === child.WorkbenchCloudText || node.type === child.WorkbenchCloudTextDeleteDialog)) nodes(node.type(node.props), result); else nodes(node.props?.children, result); } return result; }
  function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(typeof node.type === 'function' && (node.type === child.WorkbenchCloudText || node.type === child.WorkbenchCloudTextDeleteDialog) ? node.type(node.props) : node.props?.children) : ''; }
  const find = (type, label) => nodes(tree).find((node) => node.type === type && (!label || text(node).includes(label)));
  async function flush() { let quiet = 0; while (quiet < 2) { await Promise.allSettled(requests); await new Promise((resolve) => setImmediate(resolve)); render(); quiet = requests.size ? 0 : quiet + 1; } }
  async function click(label) { const button = find('button', label); assert.ok(button && !button.props.disabled, label); button.props.onClick(); render(); await flush(); }
  function input(label, value) { const parent = find('label', label); assert.ok(parent, label); const input = nodes(parent).find((node) => ['input','textarea'].includes(node.type)); assert.ok(input, label); input.props.onChange({ target: { value } }); render(); }
  async function quote() { const form = nodes(tree).find((node) => node.type === 'form' && text(node).includes('料金見積を確認して保存')); assert.ok(form); form.props.onSubmit({ preventDefault() {} }); render(); await flush(); }
  render(); await flush();
  return { calls, records, find, input, click, quote, flush, render, text: () => text(tree), nodes: () => nodes(tree), timers, startQuote() { const form = nodes(tree).find((node) => node.type === 'form' && text(node).includes('料金見積を確認して保存')); form.props.onSubmit({ preventDefault() {} }); render(); } };
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
  assert.equal(h.find('button', '料金見積を確認して保存').props.disabled, true);
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
  h.input('AIへの依頼', 'Changed input');
  await h.click('この上限で承認して実行');
  await until(() => h.text().includes('見積時の依頼文と一致しません'), h);
  assert.equal(h.calls.filter((c) => c.method === 'POST').length, 0);
  h.input('AIへの依頼', 'Synthetic cloud task');
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
