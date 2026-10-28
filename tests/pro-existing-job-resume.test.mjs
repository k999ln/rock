import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import * as composition from '../lib/work-composition.ts';
import * as compositionView from '../lib/work-composition-view.ts';
import * as jobView from '../lib/work-job-view.ts';
import * as intent from '../lib/owner-intent.ts';
import * as eveText from '../lib/eve-text-job.ts';
import * as handoff from '../lib/eve-text-handoff.ts';
import * as recovery from '../lib/eve-pending-recovery.ts';
import * as pendingOwner from '../lib/pending-owner-intent.ts';
import { workId, createWorkJob, updateComposedWork } from '../lib/workflow.ts';
import { executeCompositionNode } from '../lib/work-composition-executor.ts';

const page = () => readFileSync(new URL('../sites/avocado-mini/src/pages/pro/index.astro', import.meta.url), 'utf8');
function controller() {
  const section = page().match(/<fieldset[^>]*data-pro-resume[\s\S]*?<\/fieldset>/)?.[0];
  assert.ok(section, 'Pro has a distinct saved-job resume control');
  const elements = {};
  for (const name of ['id', 'prepare', 'link', 'status']) {
    const tag = section.match(new RegExp(`<[^>]*data-pro-resume-${name}(?:\\s|>|=)[^>]*>`))?.[0];
    assert.ok(tag, name);
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    elements[name] = { value: '', textContent: '', hidden: /\shidden(?:\s|>)/.test(tag), listeners: {},
      addEventListener(event, fn) { this.listeners[event] = fn; },
      setAttribute(key, value) { attrs[key] = String(value); },
      removeAttribute(key) { delete attrs[key]; },
      getAttribute(key) { return attrs[key] ?? null; },
      get href() { return attrs.href ?? ''; }, set href(value) { attrs.href = value; } };
  }
  const source = readFileSync(new URL('../sites/avocado-mini/src/pro-os.js', import.meta.url), 'utf8');
  runInNewContext(source.replace(/^import .*;\n/, ''), {
    document: { querySelector(selector) { return elements[selector.match(/^\[data-pro-resume-(.+)\]$/)?.[1]] ?? null; },
      createElement() { assert.fail('resume does not submit or download anything'); } }, URL,
    localStorage: new Proxy({}, { get() { assert.fail('resume must not read local card IDs or notes'); } }),
    fetch() { assert.fail('resume must not issue a request'); }, open() { assert.fail('resume must not open a window automatically'); },
    createProLocalExport() { assert.fail('resume is separate from export'); },
    previewProLocalExport() { assert.fail('resume is separate from archive'); },
  });
  return { elements, section,
    fire(name, event = 'click', extra = {}) { const e = { prevented: false, preventDefault() { this.prevented = true; }, ...extra }; elements[name].listeners[event]?.(e); return e; },
    type(value) { elements.id.value = value; elements.id.listeners.input?.(); },
  };
}

void test('saved-job input builds only a fixed lookup URL; new-job and archive entries remain distinct', () => {
  const h = controller(), id = randomUUID();
  assert.equal(h.elements.link.hidden, true); assert.equal(h.elements.link.getAttribute('href'), null);
  h.fire('prepare'); assert.equal(h.elements.link.hidden, true);
  h.type(id.toUpperCase()); h.fire('prepare');
  const url = new URL(h.elements.link.href);
  assert.equal(url.origin, 'https://avoado.si'); assert.equal(url.pathname, '/zema/compose');
  assert.deepEqual([...url.searchParams], [['job', workId(id.toUpperCase())]]);
  assert.equal(url.hash, ''); assert.equal(url.username, ''); assert.equal(url.password, '');
  assert.equal(h.elements.link.hidden, false);
  assert.equal(h.elements.link.getAttribute('target'), '_blank');
  assert.deepEqual(h.elements.link.getAttribute('rel').split(/\s+/).sort(), ['noopener', 'noreferrer']);
  assert.equal(h.elements.link.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(h.elements.link.getAttribute('data-astro-prefetch'), 'false');
  assert.equal(h.fire('link').prevented, false, 'normal navigation remains user operated');
  assert.match(h.elements.status.textContent, /not checked/);
  assert.match(h.section, /local board/); assert.match(h.section, /does not create a replacement/);
  assert.match(page(), /href="https:\/\/avoado.si\/zema\/compose\?tool=mr-citations"/);
  assert.match(page(), /href="https:\/\/avoado.si\/account\/import\/pro"/);
});

void test('empty, local-card, URL, extra-query and body-like inputs cannot become lookup or authority', () => {
  const h = controller(), id = randomUUID();
  const rejected = ['', 'old-local-1', '123', ` ${id}`, `${id}\n`, `https://avoado.si/zema/compose?job=${id}`,
    `https://evil.test/?job=${id}`, `${id}&owner=another`, `${id}?consent=true`, `${id}#source=PRIVATE`,
    JSON.stringify({ job: id, source: 'PRIVATE', owner: 'another', consent: true, budgetMinor: 0 }),
    '<script>alert(1)</script>', '00000000-0000-0000-0000-000000000000', '00000000-0000-7123-8123-000000000000'];
  for (const value of rejected) {
    assert.throws(() => workId(value), value);
    h.type(id); h.fire('prepare'); assert.equal(h.elements.link.hidden, false);
    h.type(value); h.fire('prepare');
    assert.equal(h.elements.link.hidden, true, value); assert.equal(h.elements.link.getAttribute('href'), null, value);
    assert.equal(h.fire('link').prevented, true, value);
  }
});

void test('ID contract agrees with workId versions1–5; edits and stale/tampered link clicks invalidate prior lookup', () => {
  const h = controller();
  for (const version of [1, 2, 3, 4, 5]) {
    const id = `abcdef12-3456-${version}123-8123-123456abcdef`.toUpperCase();
    h.type(id); h.fire('id', 'keydown', { key: 'Enter' });
    assert.equal(new URL(h.elements.link.href).searchParams.get('job'), workId(id));
  }
  const previous = h.elements.link.href;
  h.elements.id.value = randomUUID();
  assert.equal(h.fire('link').prevented, true, 'queued click cannot follow old ID after a silent input change');
  assert.equal(h.elements.link.getAttribute('href'), null);
  h.fire('prepare'); h.elements.link.href += '&consent=true&owner=another';
  assert.equal(h.fire('link').prevented, true, 'only the reviewed job lookup is navigable');
  assert.equal(h.elements.link.getAttribute('href'), null);
  assert.notEqual(previous, h.elements.link.href);
  h.type(randomUUID()); h.fire('prepare'); h.fire('id', 'change');
  assert.equal(h.elements.link.hidden, true);
});

// Real common component and workflow fixtures, synthetic hooks/auth and a GET-only
// transport. Every non-GET fails immediately; no private browser/account is used.
async function lookupWorkspace(search, { owner = 'A', jobs = [] } = {}) {
  const slots = [], effects = [], requests = [], promises = new Set(); let cursor = 0, tree;
  const scope = owner ? await intent.ownerScopeFor(owner) : null;
  const react = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useCallback(fn) { cursor++; return fn; },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps?.some((v, n) => v !== slots[i].deps?.[n])) {
      const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const track = promise => { promises.add(promise); void promise.then(() => promises.delete(promise), () => promises.delete(promise)); return promise; };
  class OperationRequestError extends Error { constructor(message, status) { super(message); this.status = status; } }
  class OperationResponseError extends Error {}
  const operationRequest = (path, method = 'GET') => track((async () => {
    requests.push({ path, method }); assert.equal(method, 'GET', 'opening a Pro resume lookup must never write');
    if (!scope) throw new OperationRequestError('Sign in', 401);
    if (path === '/api/work-jobs') return { ownerScope: scope, jobs };
    if (path === '/api/work-jobs/composition') return { ownerScope: scope, recipes: [] };
    assert.fail(`unexpected lookup request ${path}`);
  })());
  const jsx = (type, props) => ({ type, props });
  const modules = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': 'a',
    'lucide-react': Object.fromEntries(['Check', 'Download', 'Play', 'Plus', 'RefreshCw'].map(n => [n, n])),
    '@/components/workspace-shell': 'shell', '@/components/eve-text-estimate': () => null,
    '@/components/execution-access': { ExecutionSignin: 'signin', useExecutionAccess: () => ({ accessState: scope ? 'ready' : 'signin', setNeedsSignin() {} }) },
    '@/components/use-pending-save-navigation': { usePendingSaveNavigation() {} },
    '@/lib/operations-client': { operationRequest, OperationRequestError, OperationResponseError },
    '@/lib/eve-pending-recovery': { ...recovery, loadEvePendingRecovery: () => null },
    '@/lib/eve-text-handoff': handoff, '@/lib/eve-text-job': eveText, '@/lib/owner-intent': intent,
    '@/lib/pending-owner-intent': pendingOwner, '@/lib/work-job-view': jobView,
    '@/lib/work-composition': composition, '@/lib/work-composition-view': compositionView,
    './work-composition-workspace.module.css': new Proxy({}, { get: (_, key) => String(key) }),
  };
  const window = { location: new URL(`https://avoado.si/zema/compose${search}`), addEventListener() {}, removeEventListener() {} };
  function compile(path) {
    const exports = {};
    runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText, { exports, window, crypto, URL, URLSearchParams, TextEncoder, Uint8Array, Error,
      require(name) { assert.ok(name in modules, name); return modules[name]; } });
    return exports;
  }
  modules['@/components/use-owner-memory-state'] = compile('components/use-owner-memory-state.ts');
  const component = compile('components/work-composition-workspace.tsx').default;
  function render() { cursor = 0; tree = component(); effects.splice(0).forEach(fn => fn()); }
  function nodes(value, found = []) { if (Array.isArray(value)) value.forEach(v => nodes(v, found));
    else if (value && typeof value === 'object') { found.push(value); nodes(value.props?.children, found); } return found; }
  const text = value => value == null || typeof value === 'boolean' ? '' : typeof value !== 'object' ? String(value)
    : Array.isArray(value) ? value.map(text).join('') : text(value.props?.children);
  render();
  for (let i = 0; i < 8; i++) { await Promise.allSettled(promises); await new Promise(resolve => setImmediate(resolve)); render(); }
  return { requests, tree, text: text(tree), nodes: nodes(tree), unmount() { slots.forEach(v => v?.cleanup?.()); } };
}

async function storedJob() {
  const id = randomUUID(), source = 'Synthetic saved source（出典: [Example](https://example.test/saved)）';
  const plan = composition.parseCompositionPlan({ version: 1, objective: 'Saved owner-A work', acceptance: 'Source link remains',
    inputKind: 'text', budgetMinor: 0, currency: 'JPY', deadline: '', nodes: [
      { id: 's1', tool: 'mr-citations', inputs: ['source'], config: {} },
      { id: 's2', tool: 'compose-check', inputs: ['s1'], config: { minChars: 1, requiredText: [] } },
    ] });
  const job = createWorkJob({ id, title: 'Saved owner-A work', templateId: 'composition', plan });
  return updateComposedWork(job, { id: randomUUID(), revision: 0, fingerprint: 'd'.repeat(64), action: 'run', source, stepId: 's1',
    result: await executeCompositionNode(job.composition, plan.nodes[0], source) });
}

void test('Pro lookup opens an owned saved job in the real common component without POST or implicit source consent', async () => {
  const job = await storedJob(), h = controller(); h.type(job.id); h.fire('prepare');
  const app = await lookupWorkspace(new URL(h.elements.link.href).search, { jobs: [job] });
  assert.equal(app.nodes.find(n => n.props?.id === 'composition-source').props.value, job.composition.source);
  assert.ok(app.nodes.some(n => n.type === 'button' && String(n.props?.children).includes('仕事を中止')));
  assert.ok(app.nodes.some(n => n.type === 'a' && n.props?.href?.includes(`jobId=${job.id}`) && n.props.href.includes(`revision=${job.revision}`)));
  const consent = app.nodes.find(n => n.type === 'input' && n.props?.type === 'checkbox' && n.props?.checked === false);
  assert.ok(consent, 'resuming does not restore source-save consent');
  assert.ok(app.requests.length >= 2); assert.ok(app.requests.every(r => r.method === 'GET'));
  app.unmount();
});

void test('unknown, another-owner and signed-out lookups reveal no requested body and never create a replacement', async () => {
  const job = await storedJob();
  for (const [owner, id] of [['A', randomUUID()], ['B', job.id], [null, job.id]]) {
    const h = controller(); h.type(id); h.fire('prepare');
    const app = await lookupWorkspace(new URL(h.elements.link.href).search, { owner, jobs: [] });
    assert.equal(app.text.includes(job.composition.source), false); assert.equal(app.text.includes('Saved owner-A work'), false);
    assert.ok(app.requests.every(r => r.method === 'GET'));
    assert.equal(app.nodes.find(n => n.props?.id === 'composition-source')?.props.value ?? '', '');
    app.unmount();
  }
});
