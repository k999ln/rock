import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as historyNavigation from '../lib/history-navigation-guard.ts';
import { catalog } from '../lib/catalog.ts';
import * as sessions from '../lib/zema-chat-session.ts';
import * as handoffs from '../lib/sky-zema-handoff.ts';
import * as providers from '../lib/llm-providers.ts';
import * as remoteClient from '../lib/remote-ai-text-client.ts';
import * as currency from '../lib/currency-format.ts';

const id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const session = (patch = {}) => ({ version: 1, id, toolId: 'rockstar-amc', createdAt: Date.now(),
  messages: [{ id: 'me-1', side: 'me', text: 'Synthetic retained brief', tool: 'rockstar-amc' }],
  activeRequest: { id: 'request-1', text: 'Synthetic retained brief', toolId: 'rockstar-amc' },
  workflowStatus: 'ready', outcome: null, ...patch });

function harness({ saved = [], query = `tool=rockstar-amc&thread=${id}`, pendingHandoff = null, storageFails = false, routerThrows = false, remote = false } = {}) {
  const slots = [], effects = [], requests = [], routes = [], consumed = [], estimates = [];
  let routingConfig = null;
  const values = new Map([[sessions.ZEMA_CHAT_SESSION_KEY, JSON.stringify(saved)]]);
  if (pendingHandoff) values.set(handoffs.SKY_ZEMA_HANDOFF_KEY, JSON.stringify(pendingHandoff));
  const storage = { getItem: (k) => values.get(k) ?? null, setItem(k, v) { if (storageFails) throw Error('fixture quota'); values.set(k, v); }, removeItem: (k) => values.delete(k) };
  const window = new EventTarget();
  window.setInterval = () => 0; window.clearInterval = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.requestAnimationFrame = setImmediate; window.cancelAnimationFrame = clearImmediate;
  let cursor = 0, tree, mounted = true, afterUnmountWrites = 0;
  const changed = (old, next) => !old || old.length !== next.length || old.some((v, i) => !Object.is(v, next[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) { const state = { value: typeof initial === 'function' ? initial() : initial }; state.set = (v) => { if (!mounted) afterUnmountWrites++; state.value = typeof v === 'function' ? v(state.value) : v; }; slots[i] = state; } return [slots[i].value, slots[i].set]; },
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
    '@/lib/history-navigation-guard': historyNavigation,
    '@/lib/catalog': { catalog }, '@/lib/sky-routing': { skyRoles: [], routeSkyRequest: () => null },
    '@/lib/sky-connections': { adaptersForCapability: () => [] }, '@/lib/fashion-mcp-client': { fashionMcpConnected: () => false },
    '@/lib/device': { deviceToken: () => '' }, '@/lib/mcp-hub': { listMcpConnections: async () => [] },
    '@/lib/operations-client': { operationRequest: async (url) => url === '/api/sky/connections' ? [{ tool: 'mr-citations' }, { tool: 'rockstar-amc' }] : [], OperationRequestError: Error },
    '@/components/provider-draft': { useProviderDraft: (_id, config) => {
      routingConfig ??= { ...config, ...(remote ? { textGeneration: 'openai' } : {}) };
      return { state: { config: routingConfig }, session: { edit(next) { routingConfig = next; } } };
    } },
    '@/lib/currency-format': currency,
    '@/lib/remote-ai-text-client': { ...remoteClient, remoteAiTextRequest(path, method, body, _timeout, fetchImpl) { const pending = Promise.withResolvers(); estimates.push({ ...pending, path, method, body }); if (fetchImpl) void fetchImpl(path, { method, signal: new AbortController().signal }); return pending.promise; } },
    '@/lib/llm-providers': providers,
    '@/lib/sky-zema-handoff': { ...handoffs, consumeSkyZemaHandoff(tool, _storage, _now, thread) { consumed.push({ tool, thread }); return handoffs.consumeSkyZemaHandoff(tool, storage, undefined, thread); } },
    '@/lib/zema-chat-session': { ...sessions, readZemaChatSessions: () => sessions.readZemaChatSessions(storage), saveZemaChatSession: (s) => sessions.saveZemaChatSession(s, storage) },
    '@/lib/sky-tool-labels': { skyToolLabelFor: () => null },
    '@/lib/jennifer-coordination': { createJenniferCoordinationPlan: noop },
    '@/lib/jennifer-projects': { parseJenniferProjectPortfolio: (value) => value },
    '@/lib/jennifer-amc-decomposition': { parseJenniferKnowledgeRegistry: (value) => value },
    '@/data/jennifer-projects.json': { default: { projects: [] } },
    '@/data/jennifer-knowledge.json': { default: { domains: [] } },
    '@/lib/amc-tool': { amcSummary: () => ({ readyTaskIds: [] }) },
    '@/lib/jennifer-amc-execution': {
      buildJenniferDispatchPrompt: noop,
      buildJenniferExecutionReport: noop,
      createJenniferExecutionGoal: noop,
      createJenniferTaskJobCoordination: noop,
    },
    '@/components/ui/textarea': { Textarea: 'textarea' },
    '@/components/ui/dialog': { Dialog: 'Dialog', DialogContent: 'DialogContent', DialogTitle: 'DialogTitle', DialogDescription: 'DialogDescription' },
  };
  class FixtureElement {
    constructor(props) { this.props = props; }
    closest() { return this.props.href ? this : null; }
    getAttribute(name) { return this.props[name] === undefined ? null : String(this.props[name]); }
    hasAttribute(name) { return this.props[name] !== undefined; }
  }
  const context = { Error, Event, Element: FixtureElement, queueMicrotask, window, crypto, AbortController, AbortSignal,
    fetch: async (url, init) => {
      if (url === '/api/llm/estimate') { estimates.at(-1).signal = init.signal; return { ok: true, json: async () => ({}) }; }
      if (url === '/api/llm/local-agent') { const pending = Promise.withResolvers(); requests.push({ ...pending, signal: init.signal }); return pending.promise; }
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
  async function flush() { for (let i = 0; i < 6; i++) { await new Promise((resolve) => setImmediate(resolve)); if (mounted) render(); } }
  async function click(label, options = {}) {
    const n = nodes(tree).find((x) => ['button','a'].includes(x.type) && text(x).includes(label)); assert.ok(n, label);
    const event = { target: new FixtureElement(n.props), button: 0, ...options,
      defaultPrevented: false, propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } };
    // Real React capture runs before the Link's own click handler.
    nodes(tree).find((x) => x.props?.title === 'Zema').props.onClickCapture(event);
    if (!event.propagationStopped) n.props.onClick?.(event);
    if (n.type === 'a' && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) routes.push(n.props.href);
    render(); await flush();
  }
  function input(brief) { const field = nodes(tree).find((x) => x.type === 'textarea'); assert.ok(field); field.props.onChange({ target: { value: brief } }); render(); }
  function submit() { nodes(tree).find((x) => x.type === 'form' && x.props.onSubmit).props.onSubmit({ preventDefault() {} }); }
  async function send(brief) { input(brief); submit(); render(); await flush(); }
  render();
  return { flush, routes, requests, estimates, values, consumed, input, submit, render, window, nodes: () => nodes(tree), text: () => text(tree), conversation: () => text(nodes(tree).find(n => n.props?.className === "sky-chat-messages")), click, send,
    stored: () => sessions.readZemaChatSessions(storage),
    async shellLink(href, options = {}) {
      const event = { target: new FixtureElement({ href, ...options }), button: 0,
        defaultPrevented: false, propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } };
      nodes(tree).find((x) => x.props?.title === 'Zema').props.onClickCapture(event);
      render(); await flush(); return event;
    },
    unmount() { mounted = false; slots.forEach((slot) => slot?.cleanup?.()); },
    writes: () => afterUnmountWrites,
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


const estimate = (cardId = 'synthetic-current-card') => ({
  estimate: { currency: 'USD', maximumChargeMinor: 10, inputTokenUpperBound: 10,
    outputTokenLimit: 1200, pricingVersion: cardId, expiresAt: Date.now() + 60000 },
  rateSource: 'https://example.invalid/pricing', cardId, userCapMinor: null,
});

void test('changing a Bot preserves the unsent draft without persisting or submitting it', async () => {
  const h = harness({ query: 'tool=sky-auto' }); await h.flush();
  h.input('Synthetic unsent draft'); await h.choose('mr-citations');
  assert.equal(h.nodes().find((n) => n.type === 'textarea').props.value, 'Synthetic unsent draft');
  assert.equal(h.requests.length, 0); assert.equal(h.estimates.length, 0);
  assert.deepEqual(h.stored(), []);
});

void test('a new chat requires explicit discard of an unsent draft and reload warns while it exists', async () => {
  const h = harness({ query: 'tool=sky-auto' }); await h.flush();
  h.input('Synthetic private draft'); await h.flush();
  const before = new Event('beforeunload', { cancelable: true }); h.window.dispatchEvent(before);
  assert.equal(before.defaultPrevented, true);
  await h.click('新しい会話');
  assert.ok(h.text().includes('未送信の依頼があります'));
  assert.equal(h.nodes().find((n) => n.type === 'textarea').props.value, 'Synthetic private draft');
  await h.click('入力を続ける');
  assert.equal(h.nodes().find((n) => n.type === 'textarea').props.value, 'Synthetic private draft');
  await h.click('新しい会話'); await h.click('未保存の入力を破棄して進む');
  assert.equal(h.nodes().find((n) => n.type === 'textarea').props.value, '');
  const after = new Event('beforeunload', { cancelable: true }); h.window.dispatchEvent(after);
  assert.equal(after.defaultPrevented, false);
  assert.deepEqual(h.stored(), []);
});

void test('a cloud estimate for edited text cannot overwrite the current request or unlock a newer estimate', async () => {
  const h = harness({ query: 'tool=sky-auto', remote: true }); await h.flush();
  await h.send('Old synthetic estimate'); assert.equal(h.estimates.length, 1);
  h.input('Current synthetic estimate'); await h.send('Current synthetic estimate');
  assert.equal(h.estimates.length, 2);
  assert.equal(h.estimates[0].signal.aborted, true);
  assert.equal(h.estimates[1].signal.aborted, false);
  h.estimates[0].resolve(estimate('obsolete-card')); await h.flush();
  assert.ok(!h.text().includes('obsolete-card'));
  assert.equal(h.nodes().find((n) => n.props?.['aria-label'] === '料金を見積もる').props.disabled, true);
  h.estimates[1].resolve(estimate()); await h.flush();
  assert.ok(h.text().includes('synthetic-current-card'));
  assert.equal(h.nodes().find((n) => n.type === 'textarea').props.value, 'Current synthetic estimate');
  assert.equal(h.requests.length, 0);
});

void test('late cloud estimate failures cannot repopulate errors after a tool change', async () => {
  const h = harness({ query: 'tool=sky-auto', remote: true }); await h.flush();
  await h.send('Synthetic cost check'); await h.choose('mr-citations');
  h.estimates[0].reject(new remoteClient.RemoteAiTextClientError(400, 'RATE_CARD_CURRENCY_REQUIRED', ['USD', 'JPY']));
  await h.flush();
  assert.ok(!h.text().includes('料金表の通貨を選んで'));
  assert.ok(!h.nodes().some((n) => n.type === 'option' && n.props?.value === 'JPY'));
  assert.equal(h.nodes().find((n) => n.type === 'textarea').props.value, 'Synthetic cost check');
});

void test('same-frame submit events send one cloud estimate and one local conversation request', async () => {
  for (const remote of [true, false]) {
    const h = harness({ query: 'tool=sky-auto', remote }); await h.flush();
    h.input('Synthetic single request'); h.submit(); h.submit(); h.render(); await h.flush();
    assert.equal(remote ? h.estimates.length : h.requests.length, 1);
  }
});


void test('a rejected estimate releases the submit lock for one explicit retry', async () => {
  const h = harness({ query: 'tool=sky-auto', remote: true }); await h.flush();
  await h.send('Synthetic retry');
  h.estimates[0].reject(new remoteClient.RemoteAiTextClientError(0, 'NETWORK')); await h.flush();
  assert.equal(h.nodes().find((n) => n.props?.['aria-label'] === '料金を見積もる').props.disabled, false);
  h.submit(); h.submit(); h.render(); await h.flush();
  assert.equal(h.estimates.length, 2);
  assert.equal(h.estimates[1].body.prompt, h.estimates[0].body.prompt);
  h.estimates[1].resolve(estimate()); await h.flush();
  assert.ok(h.text().includes('synthetic-current-card'));
  assert.equal(h.requests.length, 0);
});

void test('model and budget edits invalidate the old estimate and cancel its transport', async () => {
  const h = harness({ query: 'tool=sky-auto', remote: true }); await h.flush();
  await h.send('Synthetic bounded request');
  h.nodes().find((n) => n.type === 'input' && n.props.list === 'zema-chat-model-presets').props.onChange({ target: { value: 'new-model' } });
  h.render(); await h.flush();
  assert.equal(h.estimates[0].signal.aborted, true);
  h.estimates[0].resolve(estimate('wrong-model-card')); await h.flush();
  assert.ok(!h.text().includes('wrong-model-card'));
  h.submit(); h.render(); await h.flush();
  assert.equal(h.estimates[1].body.model, 'new-model');
  h.estimates[1].resolve(estimate()); await h.flush();
  h.submit(); h.render(); await h.flush();
  h.nodes().find((n) => n.props?.['aria-label'] === '支出上限 USD').props.onChange({ target: { value: '0.05' } });
  h.render(); await h.flush();
  assert.equal(h.estimates[2].signal.aborted, true);
  h.estimates[2].resolve(estimate('wrong-budget-card')); await h.flush();
  assert.ok(!h.text().includes('wrong-budget-card'));
  assert.equal(h.nodes().find((n) => n.props?.['aria-label'] === '支出上限 USD').props.value, '0.05');
});

void test('thread navigation and unmount invalidate delayed estimates without stale state writes', async () => {
  const h = harness({ query: 'tool=sky-auto', remote: true }); await h.flush();
  await h.send('Synthetic original route');
  await h.navigate('tool=sky-auto&thread=ffffffff-ffff-4fff-8fff-ffffffffffff');
  assert.equal(h.estimates[0].signal.aborted, true);
  h.estimates[0].resolve(estimate('wrong-thread-card')); await h.flush();
  assert.ok(!h.text().includes('wrong-thread-card'));
  await h.send('Synthetic unmount request');
  h.unmount(); assert.equal(h.estimates[1].signal.aborted, true);
  h.estimates[1].resolve(estimate()); await h.flush();
  assert.equal(h.writes(), 0);
});


void test('new-chat discard resets the current session after real capture and bubble propagation', async () => {
  const h = harness({ saved: [session()] }); await h.flush();
  h.input('Synthetic new unsent draft'); await h.click('新しい会話');
  assert.ok(h.text().includes('未送信の依頼があります'));
  assert.ok(h.nodes().some((n) => n.type === 'AMC'));
  await h.click('未保存の入力を破棄して進む');
  assert.equal(h.nodes().find((n) => n.type === 'textarea').props.value, '');
  assert.ok(!h.nodes().some((n) => n.type === 'AMC'));
  assert.ok(!h.conversation().includes('Synthetic retained brief'));
  assert.equal(h.routes.at(-1), '/chat');
  assert.equal(h.stored()[0].id, id);
});

void test('modified new-chat and history clicks keep the current draft and browser new-tab behavior', async () => {
  const h = harness({ saved: [session()] }); await h.flush(); h.input('Synthetic retained draft');
  for (const label of ['新しい会話', 'Synthetic retained brief']) {
    for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
      await h.click(label, { [modifier]: true });
      assert.equal(h.nodes().find((n) => n.type === 'textarea').props.value, 'Synthetic retained draft');
      assert.ok(!h.text().includes('未送信の依頼があります'));
      assert.ok(h.nodes().some((n) => n.type === 'AMC'));
      assert.equal(h.routes.length, 0);
    }
  }
});


void test('header navigation protects an unsent draft while skip links, downloads and new tabs remain available', async () => {
  const h = harness({ query: 'tool=sky-auto' }); await h.flush(); h.input('Synthetic shell draft');
  const home = await h.shellLink('/'); assert.equal(home.defaultPrevented, true);
  assert.ok(h.text().includes('未送信の依頼があります'));
  await h.click('入力を続ける');
  assert.equal(h.nodes().find((n) => n.type === 'textarea').props.value, 'Synthetic shell draft');
  for (const [href, options] of [['#workspace-main', {}], ['/download', { download: true }], ['/help', { target: '_blank' }], ['https://example.invalid/help', {}], ['//example.invalid/help', {}], ['mailto:support@example.invalid', {}]]) {
    const event = await h.shellLink(href, options); assert.equal(event.defaultPrevented, false);
    assert.ok(!h.text().includes('未送信の依頼があります'));
  }
  await h.shellLink('/'); await h.click('未保存の入力を破棄して進む');
  assert.equal(h.routes.at(-1), '/');
});


void test('discard confirmation names both unsent composer text and unsaved AMC work', async () => {
  const h = harness({ saved: [session()] }); await h.flush();
  h.nodes().find((n) => n.type === 'AMC').props.onDirtyChange(true);
  h.input('Synthetic composer and AMC edits'); await h.click('新しい会話');
  assert.ok(h.text().includes('未送信の依頼とAMCの未保存入力があります'));
  await h.click('入力を続ける');
  assert.ok(h.nodes().some((n) => n.type === 'AMC'));
  assert.equal(h.nodes().find((n) => n.type === 'textarea').props.value, 'Synthetic composer and AMC edits');
});
