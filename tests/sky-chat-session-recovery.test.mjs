import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { catalog } from '../lib/catalog.ts';
import * as sessions from '../lib/zema-chat-session.ts';
import * as handoffs from '../lib/sky-zema-handoff.ts';
import * as providers from '../lib/llm-providers.ts';

const id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const session = (patch = {}) => ({ version: 1, id, toolId: 'rockstar-amc', createdAt: Date.now(),
  messages: [{ id: 'me-1', side: 'me', text: 'Synthetic retained brief', tool: 'rockstar-amc' }],
  activeRequest: { id: 'request-1', text: 'Synthetic retained brief', toolId: 'rockstar-amc' },
  workflowStatus: 'ready', outcome: null, ...patch });

function harness({ saved = [], query = `tool=rockstar-amc&thread=${id}`, pendingHandoff = null, storageFails = false, routerThrows = false } = {}) {
  const slots = [], effects = [], requests = [], routes = [], consumed = [];
  const values = new Map([[sessions.ZEMA_CHAT_SESSION_KEY, JSON.stringify(saved)]]);
  if (pendingHandoff) values.set(handoffs.SKY_ZEMA_HANDOFF_KEY, JSON.stringify(pendingHandoff));
  const storage = { getItem: (k) => values.get(k) ?? null, setItem(k, v) { if (storageFails) throw Error('fixture quota'); values.set(k, v); }, removeItem: (k) => values.delete(k) };
  const window = new EventTarget();
  window.setInterval = () => 0; window.clearInterval = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.requestAnimationFrame = setImmediate; window.cancelAnimationFrame = clearImmediate;
  let cursor = 0, tree;
  const changed = (old, next) => !old || old.length !== next.length || old.some((v, i) => !Object.is(v, next[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) { const state = { value: typeof initial === 'function' ? initial() : initial }; state.set = (v) => { state.value = typeof v === 'function' ? v(state.value) : v; }; slots[i] = state; } return [slots[i].value, slots[i].set]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const noop = () => {};
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/dynamic': { default: (load) => String(load).includes('amc-tool-runner') ? 'AMC' : 'Workbench' },
    'next/link': { default: 'a' },
    'next/navigation': { useRouter: () => ({ replace: (url) => { routes.push(url); if (routerThrows) throw Error("fixture navigation"); }, push: (url) => routes.push(url) }), useSearchParams: () => new URLSearchParams(query) },
    '@/lib/catalog': { catalog }, '@/lib/sky-routing': { skyRoles: [], routeSkyRequest: () => null },
    '@/lib/sky-connections': { adaptersForCapability: () => [] }, '@/lib/fashion-mcp-client': { fashionMcpConnected: () => false },
    '@/lib/device': { deviceToken: () => '' }, '@/lib/mcp-hub': { listMcpConnections: async () => [] },
    '@/lib/operations-client': { operationRequest: async (url) => url === '/api/sky/connections' ? [{ tool: 'mr-citations' }, { tool: 'rockstar-amc' }] : [], OperationRequestError: Error },
    '@/components/provider-draft': { useProviderDraft: (_id, config) => ({ state: { config }, session: {} }) },
    '@/lib/llm-providers': providers,
    '@/lib/sky-zema-handoff': { ...handoffs, consumeSkyZemaHandoff(tool, _storage, _now, thread) { consumed.push({ tool, thread }); return handoffs.consumeSkyZemaHandoff(tool, storage, undefined, thread); } },
    '@/lib/zema-chat-session': { ...sessions, readZemaChatSessions: () => sessions.readZemaChatSessions(storage), saveZemaChatSession: (s) => sessions.saveZemaChatSession(s, storage) },
    '@/lib/sky-tool-labels': { skyToolLabelFor: () => null },
    '@/components/ui/textarea': { Textarea: 'textarea' },
    '@/components/ui/dialog': { Dialog: 'Dialog', DialogContent: 'DialogContent', DialogTitle: 'DialogTitle', DialogDescription: 'DialogDescription' },
  };
  const context = { Error, Event, queueMicrotask, window, crypto, AbortController,
    fetch: async (url, init) => {
      if (url === '/api/llm/text') { const pending = Promise.withResolvers(); requests.push({ ...pending, signal: init.signal }); return pending.promise; }
      return { ok: true, json: async () => url === '/api/csv-jobs' ? { jobs: [] } : { funds: [], membership: null, analytics: [] } };
    },
    require(name) { if (modules[name]) return { __esModule: true, ...modules[name] }; if (name.startsWith('@/components/') || name === 'lucide-react') return {}; if (['@/lib/zema-private-storage','@/lib/currency-format','@/lib/remote-ai-text-client'].includes(name)) return {}; throw Error(`Unexpected module ${name}`); },
  };
  function compile(path, suffix = '') {
    const exports = {};
    const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    runInNewContext(compiled + suffix, { ...context, exports }, { filename: path }); return exports;
  }
  modules['@/components/use-sky-chat-session'] = compile('components/use-sky-chat-session.ts');
  const component = compile('components/sky-chat-workspace.tsx', '\nexports.Authenticated = AuthenticatedSkyChatWorkspace;').Authenticated;
  function render() { cursor = 0; tree = component({ executionBlocked: false, accessState: 'ready', setNeedsSignin: noop }); effects.splice(0).forEach((effect) => effect()); }
  function nodes(node, result = []) { if (Array.isArray(node)) node.forEach((x) => nodes(x, result)); else if (node && typeof node === 'object') { result.push(node); if (node.type !== 'Dialog' || node.props.open) nodes(node.props?.children, result); } return result; }
  function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.type === 'Dialog' && !node.props.open ? null : node.props?.children) : ''; }
  async function flush() { for (let i = 0; i < 6; i++) { await new Promise((resolve) => setImmediate(resolve)); render(); } }
  async function click(label) { const n = nodes(tree).find((x) => ['button','a'].includes(x.type) && text(x).includes(label)); assert.ok(n, label); n.props.onClick(); render(); await flush(); }
  async function send(brief) { const input = nodes(tree).find((x) => x.type === 'textarea'); assert.ok(input); input.props.onChange({ target: { value: brief } }); render(); const form = nodes(tree).find((x) => x.type === 'form' && x.props.onSubmit); form.props.onSubmit({ preventDefault() {} }); render(); await flush(); }
  render();
  return { flush, routes, requests, values, consumed, nodes: () => nodes(tree), text: () => text(tree), conversation: () => text(nodes(tree).find(n => n.props?.className === "sky-chat-messages")), click, send,
    stored: () => sessions.readZemaChatSessions(storage),
    async navigate(nextQuery) { query = nextQuery; render(); await flush(); },
    async choose(tool) { nodes(tree).find((x) => x.type === 'select' && x.props['aria-label'] === '担当を選ぶ').props.onChange({ target: { value: tool } }); render(); await flush(); },
  };
}

void test('restored running session keeps brief/outcome, becomes failed and never auto-executes', async () => {
  const h = harness({ saved: [session({ workflowStatus: 'running', outcome: { ok: true, text: 'Existing outcome' } })] }); await h.flush();
  assert.ok(h.text().includes('画面を開き直しました'));
  assert.equal(h.stored()[0].workflowStatus, 'failed');
  assert.equal(h.stored()[0].outcome.text, 'Existing outcome');
  assert.equal(h.nodes().find((n) => n.type === 'AMC').props.initialText, 'Synthetic retained brief');
  assert.equal(h.requests.length, 0);
});

void test('thread and tool must both match; wrong route cannot consume the pending handoff', async () => {
  const pending = { version: 1, id, source: 'sky', toolId: 'rockstar-amc', request: 'Pending brief', executionProvider: 'local-model', createdAt: Date.now() };
  const h = harness({ saved: [session()], pendingHandoff: pending, query: `tool=mr-citations&thread=${id}` }); await h.flush();
  assert.ok(!h.conversation().includes('Synthetic retained brief')); assert.ok(h.values.has(handoffs.SKY_ZEMA_HANDOFF_KEY));
  await h.navigate(`tool=rockstar-amc&thread=${id}`);
  assert.ok(h.text().includes('Synthetic retained brief'));
  assert.ok(h.values.has(handoffs.SKY_ZEMA_HANDOFF_KEY), 'saved matching session takes precedence over handoff');
});

void test('handoff is consumed once, saved and restored without rerunning or refreshing its creation time', async () => {
  const createdAt = Date.now() - 1000;
  const h = harness({ pendingHandoff: { version: 1, id, source: 'sky', toolId: 'rockstar-amc', request: 'Handoff once', executionProvider: 'local-model', createdAt } }); await h.flush();
  assert.ok(!h.values.has(handoffs.SKY_ZEMA_HANDOFF_KEY)); assert.equal(h.consumed.length, 1);
  assert.equal(h.stored()[0].createdAt, createdAt); assert.ok(h.text().includes('Handoff once'));
  await h.navigate('tool=sky-auto'); await h.navigate(`tool=rockstar-amc&thread=${id}`);
  assert.equal(h.consumed.length, 1); assert.equal(h.stored()[0].createdAt, createdAt); assert.equal(h.requests.length, 0);
});

void test('expired sessions cannot revive private text or an active runner', async () => {
  const h = harness({ saved: [session({ createdAt: Date.now() - sessions.ZEMA_CHAT_SESSION_TTL_MS - 1000 })] }); await h.flush();
  assert.ok(!h.conversation().includes('Synthetic retained brief')); assert.equal(h.nodes().filter((n) => n.type === 'AMC').length, 0); assert.deepEqual(h.stored(), []);
});

void test('new AMC conversation persists once and storage/navigation failures keep the current request usable', async () => {
  for (const options of [{}, { storageFails: true }, { routerThrows: true }]) {
    const h = harness({ query: 'tool=rockstar-amc', ...options }); await h.flush(); await h.send('New synthetic plan');
    assert.equal(h.nodes().find((n) => n.type === 'AMC').props.initialText, 'New synthetic plan');
    if (options.storageFails) assert.equal(h.routes.length, 0);
    else { assert.equal(h.stored().length, 1); assert.ok(h.routes[0].includes('&thread=')); }
    assert.equal(h.requests.length, 0);
  }
});

void test('dirty AMC blocks mode reset until explicit discard and keeps the saved thread intact', async () => {
  const h = harness({ saved: [session()] }); await h.flush();
  h.nodes().find((n) => n.type === 'AMC').props.onDirtyChange(true);
  await h.choose('mr-citations'); assert.ok(h.text().includes('AMCに未保存の入力があります')); assert.equal(h.routes.length, 0);
  await h.click('入力を続ける'); assert.ok(h.nodes().find((n) => n.type === 'AMC'));
  await h.choose('mr-citations'); await h.click('未保存の入力を破棄して進む');
  assert.equal(h.routes.at(-1), '/chat?tool=mr-citations'); assert.equal(h.nodes().filter((n) => n.type === 'AMC').length, 0); assert.equal(h.stored()[0].id, id);
});

void test('mode reset aborts the active conversation and ignores its late answer', async () => {
  const h = harness({ query: 'tool=sky-auto' }); await h.flush(); await h.send('Synthetic conversation');
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].signal.aborted, false);
  await h.choose('mr-citations'); assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve({ ok: true, json: async () => ({ text: 'Late old answer' }) }); await h.flush();
  assert.ok(!h.text().includes('Late old answer')); assert.ok(!h.conversation().includes('Synthetic conversation'));
});

void test('new chat blocks during a running Tool and clears current state only after it stops', async () => {
  const h = harness({ saved: [session({ outcome: { ok: true, text: 'Saved result' } })] }); await h.flush();
  h.nodes().find((n) => n.type === 'AMC').props.onRunningChange(true); await h.flush();
  await h.click('新しい会話'); assert.ok(h.nodes().some((n) => n.type === 'AMC'));
  h.nodes().find((n) => n.type === 'AMC').props.onRunningChange(false); await h.flush();
  await h.click('新しい会話');
  assert.ok(!h.nodes().some((n) => n.type === 'AMC'));
  assert.ok(!h.conversation().includes('Synthetic retained brief'));
  assert.equal(h.stored()[0].outcome.text, 'Saved result');
});
