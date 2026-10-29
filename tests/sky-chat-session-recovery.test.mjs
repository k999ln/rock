import { skyAgentSystem } from '../lib/sky-agent-library.ts';
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

function harness({ saved = [], query = `tool=rockstar-amc&thread=${id}`, pendingHandoff = null, storageFails = false, routerThrows = false, remote = false, auto = false, source = false } = {}) {
  const slots = [], effects = [], layouts = [], requests = [], routes = [], consumed = [], estimates = [], selections = [];
  let routingConfig = null;
  const sourcePin = { ownerScope: 'owner-v1:' + 'a'.repeat(64), source: { schema: 'rockstaros.eve-source/1', key: 'dataset:fixture/source', revision: 1, metadataSha256: 'b'.repeat(64) } };
  let selectedSource = source ? sourcePin : null, holdSourceValidation = false, pendingSourceValidation;
  const sourceValidations = [], sourceClears = [];
  const sourceContext = {
    async validate(expected, signal) {
      sourceValidations.push({ expected, signal });
      const captured = selectedSource;
      if (holdSourceValidation) {
        pendingSourceValidation = Promise.withResolvers(); await pendingSourceValidation.promise;
        // Deliberately allow a late snapshot even after an abort. The workspace
        // must fence its own continuation rather than trust transport cancellation.
        return captured;
      }
      if (expected && expected !== selectedSource) throw new Error('出典の選択が変わりました。');
      if (signal?.aborted) throw new Error('source validation aborted');
      return selectedSource ?? undefined;
    },
    clear() { selectedSource = null; sourceClears.push(true); },
  };
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
    useLayoutEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; layouts.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const noop = () => {};
  const modules = {
    '@/components/eve-source-handoff': { useEveSourceContext: () => sourceContext, EveSourceHandoff: 'EveSourceHandoff' },
    '@/lib/sky-agent-library': { skyAgentSystem },
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
      routingConfig ??= { ...config, textSelectionMode: auto ? 'auto' : 'manual', ...(remote ? { textGeneration: 'openai' } : {}) };
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
      if (url === '/api/llm/select') { const pending = Promise.withResolvers(); selections.push({ ...pending, signal: init.signal }); return pending.promise; }
      if (url === '/api/llm/estimate') { estimates.at(-1).signal = init.signal; return { ok: true, json: async () => ({}) }; }
      if (url === '/api/llm/local-agent' || url === '/api/llm/free-cloud') { const pending = Promise.withResolvers(); requests.push({ ...pending, signal: init.signal, url, body: JSON.parse(init.body) }); return pending.promise; }
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
  function render() { cursor = 0; tree = component({ executionBlocked: false, accessState: 'ready', setNeedsSignin: noop }); layouts.splice(0).forEach((effect) => effect()); effects.splice(0).forEach((effect) => effect()); }
  function nodes(node, result = []) { if (Array.isArray(node)) node.forEach((x) => nodes(x, result)); else if (node && typeof node === 'object') { result.push(node); if (node.type !== 'Dialog' || node.props.open) nodes(node.props?.children, result); } return result; }
  function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.type === 'Dialog' && !node.props.open ? null : node.props?.children) : ''; }
  async function flush() { for (let i = 0; i < 6; i++) { await new Promise((resolve) => setImmediate(resolve)); if (mounted) render(); } }
  async function click(label, options = {}) {
    const n = nodes(tree).find((x) => ['button','a'].includes(x.type) && text(x).includes(label)); assert.ok(n, label);
    const event = { target: new FixtureElement(n.props), button: 0, ...options,
      defaultPrevented: false, propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } };
    // Real React capture runs before the Link's own click handler.
    nodes(tree).find((x) => x.props?.title === 'Jennifer').props.onClickCapture(event);
    if (!event.propagationStopped) n.props.onClick?.(event);
    if (n.type === 'a' && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) routes.push(n.props.href);
    render(); await flush();
  }
  function input(brief) { const field = nodes(tree).find((x) => x.type === 'textarea'); assert.ok(field); field.props.onChange({ target: { value: brief } }); render(); }
  function submit() { nodes(tree).find((x) => x.type === 'form' && x.props.onSubmit).props.onSubmit({ preventDefault() {} }); }
  async function send(brief) { input(brief); submit(); render(); await flush(); }
  render();
  return { flush, routes, requests, estimates, selections, values, consumed, input, submit, render, window, sourcePin, sourceValidations, sourceClears,
    holdSourceValidation() { holdSourceValidation = true; },
    releaseSourceValidation() { assert.ok(pendingSourceValidation); holdSourceValidation = false; pendingSourceValidation.resolve(); },
    clearSource() { const panel = nodes(tree).find(node => node.type === 'EveSourceHandoff'); assert.ok(panel); panel.props.context.clear(); render(); }, nodes: () => nodes(tree), text: () => text(tree), conversation: () => text(nodes(tree).find(n => n.props?.className === "sky-chat-messages")), click, send,
    consentCloud() { const label=nodes(tree).find(n=>n.type==='label'&&text(n).includes('今回の会話で無料Cloud'));nodes(label).find(n=>n.type==='input').props.onChange({target:{checked:true}});render(); },
    stored: () => sessions.readZemaChatSessions(storage),
    async shellLink(href, options = {}) {
      const event = { target: new FixtureElement({ href, ...options }), button: 0,
        defaultPrevented: false, propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; } };
      nodes(tree).find((x) => x.props?.title === 'Jennifer').props.onClickCapture(event);
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

void test('auto model is frozen into execution and exposes its selection reason', async () => {
  const h = harness({query:'tool=sky-auto', auto:true}); await h.flush(); await h.send('コードを作成');
  assert.equal(h.selections.length,1); assert.equal(h.requests.length,0);
  h.selections[0].resolve({ok:true,json:async()=>({selection:{provider:'ollama',model:'fixture-coder',reason:'コード向け'}})});
  await h.flush(); assert.equal(h.requests.length,1); assert.equal(h.requests[0].body.model,'fixture-coder');
  assert.equal(h.requests[0].body.provider,'ollama'); assert.ok(h.text().includes('コード向け'));
});
void test('late auto discovery cannot execute after changing conversation', async () => {
  const h=harness({query:'tool=sky-auto',auto:true}); await h.flush(); await h.send('hello');
  await h.choose('mr-citations'); assert.equal(h.selections[0].signal.aborted,true);
  h.selections[0].resolve({ok:true,json:async()=>({selection:{provider:'ollama',model:'fixture',reason:'test'}})});
  await h.flush(); assert.equal(h.requests.length,0);
});

void test('conversation routes selected free Cloud with consent and UUID, never to paid estimate', async () => {
 const h=harness({query:'tool=sky-auto',auto:true});await h.flush();h.consentCloud();await h.send('Synthetic free request');
 h.selections[0].resolve({ok:true,json:async()=>({selection:{provider:'pollinations',model:'openai-fast',reason:'free'}})});await h.flush();
 assert.equal(h.estimates.length,0);assert.equal(h.requests.length,1);const req=h.requests[0];
 assert.equal(req.url,'/api/llm/free-cloud');assert.match(req.body.id,/^[0-9a-f-]{36}$/);assert.equal(req.body.consent,true);assert.equal(req.body.prompt,'Synthetic free request');
 req.resolve({ok:true,json:async()=>({text:'Cloud fixture reply',reportedModel:'fixture',usage:{inputTokens:2,outputTokens:3,chargeMinor:0}})});await h.flush();assert.ok(h.text().includes('Cloud fixture reply'));assert.ok(h.text().includes('$0.00'));
});

void test('restoring and resaving an Agent conversation retains its exact saved reference', async () => {
  for (const agent of [
    { id: '22222222-2222-4222-8222-222222222222', revision: 0 },
    { id: '11111111-1111-4111-8111-111111111111', revision: 7 },
  ]) {
    const saved = session({ agent });
    const h = harness({ saved: [saved] }); await h.flush();
    assert.deepEqual(h.stored()[0].agent, agent);
    assert.equal(h.stored()[0].createdAt, saved.createdAt);
    assert.deepEqual(h.stored()[0].messages, saved.messages);
    assert.equal(h.requests.length, 0);
    assert.equal(h.estimates.length, 0);
    h.unmount();
  }
});

void test('an Agent reference stays with its own thread and does not leak to a plain thread', async () => {
  const agent = { id: '11111111-1111-4111-8111-111111111111', revision: 3 };
  const otherId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const h = harness({ saved: [session({ agent }), session({ id: otherId })] });
  await h.flush();
  assert.deepEqual(h.stored().find(s => s.id === id).agent, agent);
  await h.navigate(`tool=rockstar-amc&thread=${otherId}`);
  assert.equal(h.stored().find(s => s.id === otherId).agent, undefined);
  assert.deepEqual(h.stored().find(s => s.id === id).agent, agent);
  await h.navigate(`tool=rockstar-amc&thread=${id}`);
  assert.deepEqual(h.stored().find(s => s.id === id).agent, agent);
  assert.equal(h.requests.length, 0);
  h.unmount();
});


void test('reset or unmount during first source validation cannot select a model or revive stale conversation', async () => {
  for (const replacement of ['new-chat', 'mode', 'unmount']) {
    const h = harness({ query: 'tool=sky-auto', auto: true, source: true }); await h.flush();
    h.holdSourceValidation(); await h.send('Source validation must not survive reset');
    assert.equal(h.sourceValidations.length, 1); assert.equal(h.selections.length, 0); assert.equal(h.requests.length, 0);
    const pendingSignal = h.sourceValidations[0].signal;
    assert.ok(pendingSignal instanceof AbortSignal); assert.equal(pendingSignal.aborted, false);
    if (replacement === 'new-chat') {
      await h.click('新しい会話'); await h.click('未保存の入力を破棄して進む');
      assert.ok(h.sourceClears.length > 0);
    } else if (replacement === 'mode') {
      await h.choose('mr-citations'); assert.ok(h.sourceClears.length > 0);
    } else h.unmount();
    assert.equal(pendingSignal.aborted, true, replacement);
    h.releaseSourceValidation(); await h.flush();
    assert.equal(h.selections.length, 0, replacement); assert.equal(h.requests.length, 0, replacement); assert.equal(h.estimates.length, 0, replacement);
    assert.ok(!h.conversation().includes('Source validation must not survive reset'), replacement);
    assert.equal(h.writes(), 0, replacement);
    assert.equal(h.stored().length, 0, replacement);
  }
});

void test('clearing source during model selection requires the original pin and prevents inference or a source-tagged reply', async () => {
  const h = harness({ query: 'tool=sky-auto', auto: true, source: true }); await h.flush();
  await h.send('Pinned source request');
  assert.equal(h.sourceValidations.length, 1); assert.equal(h.sourceValidations[0].expected, undefined);
  assert.equal(h.selections.length, 1); assert.equal(h.requests.length, 0);
  h.clearSource(); assert.equal(h.sourceClears.length, 1);
  h.selections[0].resolve({ ok: true, json: async () => ({ selection: { provider: 'ollama', model: 'fixture', reason: 'fixture selection' } }) });
  await h.flush();
  assert.equal(h.sourceValidations.length, 2);
  assert.equal(h.requests.length, 0, 'cleared source must block actual inference dispatch'); assert.equal(h.estimates.length, 0);
  assert.equal(h.sourceValidations[1].expected, h.sourcePin, 'post-selection validation must demand the originally captured object');
  assert.equal(h.sourceValidations[1].signal, h.sourceValidations[0].signal, 'both checks share the cancellable send context');
  assert.ok(!h.conversation().includes('Pinned source request')); assert.equal(h.stored().length, 0);
  assert.match(h.text(), /出典の選択が変わりました/);
  const creator = h.nodes().find(node => Array.isArray(node.props?.replies));
  assert.ok(!creator || creator.props.replies.length === 0, 'no stale source-tagged assistant reply may reach the creator');
});

void test('unchanged selected source passes both checks and tags only its returned synthetic reply', async () => {
  const h = harness({ query: 'tool=sky-auto', auto: true, source: true }); await h.flush();
  await h.send('Current pinned request');
  h.selections[0].resolve({ ok: true, json: async () => ({ selection: { provider: 'ollama', model: 'fixture', reason: 'fixture selection' } }) });
  await h.flush(); assert.equal(h.sourceValidations.length, 2); assert.equal(h.sourceValidations[1].expected, h.sourcePin);
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ ok: true, json: async () => ({ text: 'Synthetic response from current source' }) }); await h.flush();
  assert.match(h.conversation(), /Synthetic response from current source/);
  const creator = h.nodes().find(node => Array.isArray(node.props?.replies));
  assert.ok(creator); assert.equal(creator.props.replies.length, 1); assert.deepEqual(creator.props.replies[0].source, h.sourcePin.source);
});


void test('external URL changes during source validation abort before model selection without a reset handler', async () => {
  for (const nextQuery of ['tool=mr-citations', '', 'tool=sky-auto&view=work',
    'tool=sky-auto&agent=11111111-1111-4111-8111-111111111111&agentRevision=1',
    'tool=sky-auto&agentRevision=2', `tool=sky-auto&thread=${id}`]) {
    const h = harness({ query: 'tool=sky-auto', auto: true, source: true }); await h.flush();
    h.holdSourceValidation(); await h.send('Old URL source request');
    assert.equal(h.sourceValidations.length, 1); const signal = h.sourceValidations[0].signal;
    assert.equal(signal.aborted, false);
    await h.navigate(nextQuery); // Direct URL update: no choose/resetConversation call.
    assert.equal(h.sourceClears.length, 0, 'the fixture must not invoke the reset handler');
    h.releaseSourceValidation(); await h.flush();
    assert.equal(h.selections.length, 0, nextQuery); assert.equal(signal.aborted, true, nextQuery); assert.equal(h.requests.length, 0, nextQuery); assert.equal(h.estimates.length, 0, nextQuery);
    assert.ok(!h.conversation().includes('Old URL source request')); assert.equal(h.stored().length, 0);
    h.unmount();
  }
});

void test('external Tool URL change during model selection cannot infer or attach an old source reply', async () => {
  const h = harness({ query: 'tool=sky-auto', auto: true, source: true }); await h.flush();
  await h.send('Old selected-model request');
  assert.equal(h.sourceValidations.length, 1); assert.equal(h.selections.length, 1);
  const signal = h.selections[0].signal; assert.equal(signal.aborted, false);
  await h.navigate('tool=mr-citations'); // Both old and new requestedThreadId are empty.
  assert.equal(h.sourceClears.length, 0);
  h.selections[0].resolve({ ok: true, json: async () => ({ selection: { provider: 'ollama', model: 'fixture-old', reason: 'obsolete selection' } }) });
  await h.flush();
  assert.equal(h.requests.length, 0); assert.equal(h.estimates.length, 0);
  assert.equal(signal.aborted, true);
  assert.equal(h.sourceValidations.length, 1, 'an invalidated URL must not continue to another source check');
  assert.ok(!h.conversation().includes('Old selected-model request')); assert.ok(!h.text().includes('obsolete selection'));
  assert.equal(h.stored().length, 0);
});

void test('the send-created thread URL preserves its own current inference and source reply', async () => {
  const h = harness({ query: 'tool=sky-auto', auto: true, source: true }); await h.flush();
  await h.send('Current own-thread request');
  h.selections[0].resolve({ ok: true, json: async () => ({ selection: { provider: 'ollama', model: 'fixture-current', reason: 'current selection' } }) });
  await h.flush(); assert.equal(h.requests.length, 1);
  const ownRoute = h.routes.find(route => route.includes('thread=')); assert.ok(ownRoute);
  const signal = h.requests[0].signal;
  await h.navigate(new URL(ownRoute, 'https://fixture.invalid').search.slice(1));
  assert.equal(signal.aborted, false, 'the request owns the new thread route');
  h.requests[0].resolve({ ok: true, json: async () => ({ text: 'Own-thread synthetic answer' }) }); await h.flush();
  assert.match(h.conversation(), /Own-thread synthetic answer/);
  const creator = h.nodes().find(node => Array.isArray(node.props?.replies));
  assert.ok(creator); assert.deepEqual(creator.props.replies.at(-1).source, h.sourcePin.source);
});
