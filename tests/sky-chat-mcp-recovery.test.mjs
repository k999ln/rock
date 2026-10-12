import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../components/sky-chat-workspace.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText + '\nexports.Authenticated = AuthenticatedSkyChatWorkspace;';
const server = (id) => ({ id, name: `Fixture ${id}`, state: 'connected', passport: { tools: [{ name: 'read' }] } });

function harness() {
  const slots = [], effects = [], lists = [];
  const window = new EventTarget();
  window.setInterval = () => 0; window.clearInterval = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.requestAnimationFrame = setImmediate; window.cancelAnimationFrame = clearImmediate;
  let cursor = 0, tree, token = 'owner-a', mounted = true, afterUnmountWrites = 0;
  const changed = (old, next) => !old || old.length !== next.length || old.some((v, i) => !Object.is(v, next[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) { const state = { value: typeof initial === 'function' ? initial() : initial }; state.set = (value) => { if (!mounted) afterUnmountWrites++; state.value = typeof value === 'function' ? value(state.value) : value; }; slots[i] = state; } return [slots[i].value, slots[i].set]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const noop = () => {};
  const session = { id: 'fixture-thread', toolId: 'mcp:initial', createdAt: 1, messages: [], activeRequest: { id: 'fixture-request', text: 'Synthetic request', toolId: 'mcp:initial' }, workflowStatus: 'ready', outcome: null };
  const modules = {
    'react': react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/dynamic': { default: () => 'DynamicFixture' },
    'next/navigation': { useRouter: () => ({ replace: noop, push: noop }), useSearchParams: () => new URLSearchParams('tool=mcp%3Ainitial&thread=fixture-thread') },
    '@/lib/catalog': { catalog: [] },
    '@/lib/sky-routing': { skyRoles: [], routeSkyRequest: () => null },
    '@/lib/sky-connections': { adaptersForCapability: () => [] },
    '@/lib/fashion-mcp-client': { fashionMcpConnected: () => false },
    '@/lib/device': { deviceToken: () => token },
    '@/lib/mcp-hub': { listMcpConnections() { const request = Promise.withResolvers(); lists.push(request); return request.promise; } },
    '@/lib/operations-client': { operationRequest: async () => [], OperationRequestError: Error },
    '@/components/provider-draft': { useProviderDraft: (_id, config) => ({ state: { config }, session: {} }) },
    '@/lib/llm-providers': { isTextModelProvider: () => true, textModelProviderDefinition: () => ({ locality: 'local', defaultModel: 'fixture-model' }), textModelProviders: [], localModelPresets: [] },
    '@/lib/sky-zema-handoff': { skyRequestLimit: () => 10000, SKY_ZEMA_JOB_EVENT: 'fixture-job' },
    '@/lib/zema-chat-session': { readZemaChatSessions: () => [session], saveZemaChatSession: () => [session] },
    '@/lib/sky-tool-labels': { skyToolLabelFor: () => null },
    '@/components/mcp-bot-runner': { McpBotRunner: 'McpBotRunner' },
  };
  const exports = {};
  const context = { Error, Event, queueMicrotask, window, crypto,
    fetch: async (url) => ({ ok: true, json: async () => url === '/api/csv-jobs' ? { jobs: [] } : { funds: [], membership: null, analytics: [] } }),
    require(id) { if (modules[id]) return { __esModule: true, ...modules[id] }; if (id.startsWith('@/components/') || id === 'lucide-react' || id === 'next/link') return {}; if (id === '@/lib/zema-private-storage' || id === '@/lib/currency-format' || id === '@/lib/remote-ai-text-client') return {}; throw Error(`Unexpected module ${id}`); },
  };
  const sessionExports = {};
  const sessionCompiled = ts.transpileModule(readFileSync(new URL('../components/use-sky-chat-session.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(sessionCompiled, { ...context, exports: sessionExports });
  modules['@/components/use-sky-chat-session'] = sessionExports;
  runInNewContext(compiled, { ...context, exports });
  const props = { executionBlocked: false, accessState: 'ready', setNeedsSignin: noop };
  function render() { cursor = 0; tree = exports.Authenticated(props); effects.splice(0).forEach((effect) => effect()); }
  function nodes(node, out = []) { if (Array.isArray(node)) node.forEach((x) => nodes(x, out)); else if (node && typeof node === 'object') { out.push(node); nodes(node.props?.children, out); } return out; }
  async function flush() { for (let i = 0; i < 4; i++) { await new Promise((resolve) => setImmediate(resolve)); if (mounted) render(); } }
  render();
  return {
    lists, flush,
    names: () => nodes(tree).filter((node) => node.type === 'button' && node.props['aria-label']?.startsWith('Fixture ')).map((node) => node.props['aria-label']),
    event: (name = 'sky-mcp-servers') => window.dispatchEvent(new Event(name)),
    setToken(value, notify = true) { token = value; if (notify) window.dispatchEvent(new Event('loop-device')); },
    disconnect() { const runner = nodes(tree).find((node) => node.type === 'McpBotRunner'); assert.ok(runner, 'actual component renders a runner for the saved synthetic request'); runner.props.onDisconnected(); },
    unmount() { mounted = false; slots.forEach((slot) => slot?.cleanup?.()); },
    writes: () => afterUnmountWrites,
  };
}

for (const stale of ['success', 'error']) void test(`old event ${stale} cannot overwrite newer MCP list`, async () => {
  const h = harness(); h.event();
  h.lists[1].resolve([server('new')]); await h.flush();
  if (stale === 'success') h.lists[0].resolve([server('old')]); else h.lists[0].reject(Error('old error'));
  await h.flush(); assert.deepEqual(h.names(), ['Fixture newと会話する']);
});

void test('token removal invalidates pending list response', async () => {
  const h = harness(); h.setToken(''); await h.flush();
  h.lists[0].resolve([server('old')]); await h.flush(); assert.deepEqual(h.names(), []);
});

for (const stale of ['success', 'error']) void test(`old manual ${stale} cannot overwrite newer event list`, async () => {
  const h = harness(); h.lists[0].resolve([server('initial')]); await h.flush(); h.disconnect(); h.event();
  h.lists[2].resolve([server('new')]); await h.flush();
  if (stale === 'success') h.lists[1].resolve([server('old')]); else h.lists[1].reject(Error('old error'));
  await h.flush(); assert.deepEqual(h.names(), ['Fixture newと会話する']);
});

void test('manual list cannot write after unmount', async () => {
  const h = harness(); h.lists[0].resolve([server('initial')]); await h.flush(); h.disconnect(); await h.flush(); h.unmount();
  h.lists[1].resolve([server('old')]); await h.flush(); assert.equal(h.writes(), 0);
});

void test('owner token change clears the previous list until current readback and rejects late old errors', async () => {
  const h = harness(); h.lists[0].resolve([server('initial')]); await h.flush();
  h.event('focus'); h.setToken('owner-b'); await h.flush();
  assert.deepEqual(h.names(), []);
  h.lists[2].resolve([server('current-owner')]); await h.flush();
  h.lists[1].reject(Error('old owner failure')); await h.flush();
  assert.deepEqual(h.names(), ['Fixture current-ownerと会話する']);
});

void test('response checks current device token even before its change event arrives', async () => {
  const h = harness(); h.setToken('owner-b', false);
  h.lists[0].resolve([server('old-owner')]); await h.flush();
  assert.deepEqual(h.names(), []);
});

void test('latest error clears stale availability and the next current response restores it', async () => {
  const h = harness(); h.lists[0].resolve([server('initial')]); await h.flush();
  h.event(); h.lists[1].reject(Error('current failure')); await h.flush();
  assert.deepEqual(h.names(), []);
  h.event(); h.lists[2].resolve([server('reconnected')]); await h.flush();
  assert.deepEqual(h.names(), ['Fixture reconnectedと会話する']);
});
