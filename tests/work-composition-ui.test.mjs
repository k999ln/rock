import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import * as composition from '../lib/work-composition.ts';
import * as view from '../lib/work-composition-view.ts';
import * as jobView from '../lib/work-job-view.ts';
import * as intent from '../lib/owner-intent.ts';
import * as pendingOwner from '../lib/pending-owner-intent.ts';
import { createWorkJob, updateComposedWork, applyWorkCommand } from '../lib/workflow.ts';
import { executeCompositionNode } from '../lib/work-composition-executor.ts';

async function harness({ search = '', initialOwner = 'A', initialJobs = [], fingerprintDelay = 0 } = {}) {
  const slots = [], effects = [], inFlight = new Set(), jobs = new Map(), requests = [], listeners = new Map();
  let cursor = 0, tree, owner = initialOwner, corruptResponse = false, loseResponse = false, navigationProtected = false;
  let href = `https://local.test/zema/compose${search}`;
  if (initialJobs.length) jobs.set(initialOwner, new Map(initialJobs.map((job) => [job.id, job])));
  class OperationRequestError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } }
  class OperationResponseError extends Error {}
  const changed = (old, next) => !old || old.length !== next.length || old.some((value, index) => value !== next[index]);
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback(callback, deps) { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { value: callback, deps }; return slots[index].value; },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useEffect(effect, deps) { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) { const old = slots[index]; slots[index] = { deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect(); }); } },
  };
  const setNeedsSignin = () => {};
  async function operation(path, method = 'GET', payload, headers) {
    requests.push({ path, method, payload: payload && structuredClone(payload), headers });
    if (!owner) throw new OperationRequestError('Sign in', 401);
    const ownerScope = await intent.ownerScopeFor(owner);
    if (method === 'GET') {
      if (path === '/api/work-jobs') return { jobs: [...(jobs.get(owner)?.values() ?? [])], ownerScope };
      return { recipes: [...(jobs.get(owner)?.values() ?? [])].filter((job) => job.composition.recipe).map((job) => ({
        id: job.id, jobRevision: job.revision, name: job.composition.recipe.name, recipe: job.composition.recipe.plan,
      })), ownerScope };
    }
    if (headers?.[intent.OWNER_SCOPE_HEADER] !== ownerScope) throw new OperationRequestError('Owner changed', 409, intent.OWNER_CHANGED);
    if (!jobs.has(owner)) jobs.set(owner, new Map());
    const store = jobs.get(owner);
    const fingerprint = await view.compositionPayloadFingerprint(payload);
    let job = store.get(payload.jobId);
    if (['create', 'reuse_recipe'].includes(payload.action)) {
      if (!job) {
        job = createWorkJob({ id: payload.jobId, title: 'Composition', templateId: 'composition', plan: payload.plan });
        job.composition.creationFingerprint = fingerprint;
      }
      assert.equal(job.composition.creationFingerprint, fingerprint);
    } else if (path === '/api/work-jobs') job = applyWorkCommand(job, payload.command, payload.revision);
    else {
      const update = { id: payload.commandId, revision: payload.revision, fingerprint, action: payload.action };
      if (payload.action === 'run') {
        update.source = job.composition.source ?? payload.source;
        update.stepId = payload.stepId;
        update.result = await executeCompositionNode(job.composition, job.composition.plan.nodes.find((node) => node.id === payload.stepId), update.source);
      } else if (payload.action === 'revise') update.plan = payload.plan;
      else if (payload.action === 'save_recipe') update.name = payload.name;
      job = updateComposedWork(job, update);
    }
    store.set(job.id, job);
    if (loseResponse) { loseResponse = false; throw new OperationResponseError('lost response'); }
    if (corruptResponse) { corruptResponse = false; return { ownerScope, job: { ...job, id: randomUUID() } }; }
    return { ownerScope, job };
  }
  function track(promise) {
    inFlight.add(promise);
    void promise.then(() => inFlight.delete(promise), () => inFlight.delete(promise));
    return promise;
  }
  const trackedOperation = (...args) => track(operation(...args));
  // Fingerprinting precedes the first request; flushing requests alone can
  // finish before WebCrypto completes on a busy CI runner. Await both.
  const trackedView = { ...view, compositionPayloadFingerprint: (...args) => track((async () => {
    if (fingerprintDelay) await new Promise((resolve) => setTimeout(resolve, fingerprintDelay));
    return view.compositionPayloadFingerprint(...args);
  })()) };
  const jsx = (type, props) => ({ type, props });
  const window = {
    get location() { return new URL(href); },
    history: { state: null, replaceState(_state, _title, next) { href = String(next); } },
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); }, confirm: () => true,
  };
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': 'a',
    'lucide-react': Object.fromEntries(['Check','Download','Play','Plus','RefreshCw'].map((name) => [name, name])),
    '@/components/workspace-shell': 'shell', '@/components/execution-access': { ExecutionSignin: 'signin', useExecutionAccess: () => ({ accessState: 'ready', setNeedsSignin }) },
    '@/components/use-pending-save-navigation': { usePendingSaveNavigation(active) { navigationProtected = active; } },
    '@/lib/operations-client': { operationRequest: trackedOperation, OperationRequestError, OperationResponseError },
    '@/lib/owner-intent': intent, '@/lib/pending-owner-intent': pendingOwner, '@/lib/work-job-view': jobView, '@/lib/work-composition': composition, '@/lib/work-composition-view': trackedView,
    './work-composition-workspace.module.css': new Proxy({}, { get: (_, key) => String(key) }),
  };
  function compile(path) {
    const exports = {};
    runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText, { exports, window, crypto, URL, URLSearchParams, TextEncoder, setTimeout, Error,
      require(name) { assert.ok(name in modules, name); return modules[name]; } }, { filename: path });
    return exports;
  }
  modules['@/components/use-owner-memory-state'] = compile('components/use-owner-memory-state.ts');
  const component = compile('components/work-composition-workspace.tsx').default;
  function render() { cursor = 0; tree = component(); effects.splice(0).forEach((effect) => effect()); }
  function nodes(node, result = []) {
    if (Array.isArray(node)) node.forEach((child) => nodes(child, result));
    else if (node && typeof node === 'object') {
      result.push(node); nodes(typeof node.type === 'function' ? node.type(node.props) : node.props?.children, result);
    }
    return result;
  }
  function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(typeof node.type === 'function' ? node.type(node.props) : node.props?.children) : ''; }
  const find = (type, label) => nodes(tree).find((node) => node.type === type && (!label || text(node).includes(label)));
  async function flush() {
    for (let index = 0; index < 12; index++) { await Promise.allSettled(inFlight); await new Promise((resolve) => setImmediate(resolve)); render(); }
  }
  async function click(label) { const button = find('button', label); assert.ok(button && !button.props.disabled, label); button.props.onClick(); render(); await flush(); }
  function input(id, value) { const node = nodes(tree).find((item) => item.props?.id === id); assert.ok(node && !node.props.disabled && !node.props.readOnly, id); node.props.onChange({ target: { value, checked: Boolean(value) } }); render(); }
  render(); await flush();
  return { find, byId: (id) => nodes(tree).find((node) => node.props?.id === id), click, input, flush, render, requests, jobs, text: () => text(tree), protected: () => navigationProtected,
    owner(value) { owner = value; }, location(search) { href = `https://local.test/zema/compose${search}`; }, corrupt() { corruptResponse = true; }, lose() { loseResponse = true; },
    async focus() { for (const listener of listeners.get('focus') ?? []) listener(); render(); await flush(); },
    async consent() { const label = find('label', '本人用の仕事に保存'); const checkbox = nodes(label).find((node) => node.type === 'input'); assert.ok(checkbox); checkbox.props.onChange({ target: { checked: true } }); render(); await flush(); },
  };
}

void test('UI executes connected text plus check, saves a sanitized recipe, and creates a distinct reusable job', async () => {
  const app = await harness();
  await app.click('文章サンプルを入力');
  assert.equal(app.protected(), true);
  await app.click('確認して仕事を保存');
  assert.match(app.text(), /素材はまだ保存していません/);
  assert.equal(app.text().includes('再読込しても保存済みの成果を開けます'), false);
  await app.consent();
  await app.click('この手順を実行');
  assert.match(app.text(), /この手順の素材と成果を保存しました/);
  assert.equal(app.byId('composition-source').props.readOnly, true);
  assert.equal(app.find('button', 'この手順を実行').props.disabled, false);
  await app.click('この手順を実行');
  const original = [...app.jobs.get('A').values()][0];
  assert.equal(original.status, 'review');
  assert.equal(Object.keys(original.composition.artifacts).length, 2);
  app.input('composition-recipe-name', 'Repeatable article');
  await app.click('手順をレシピとして保存');
  const frozenOriginal = JSON.stringify(app.jobs.get('A').get(original.id));
  await app.click('Repeatable article');
  app.input('composition-objective', '別の原稿の出典整理');
  app.input('composition-acceptance', '出典を確認できる');
  app.input('composition-source', 'Second article.（出典: [Second](https://example.com/second)）');
  await app.click('確認して仕事を保存');
  assert.equal(app.jobs.get('A').size, 2);
  const next = [...app.jobs.get('A').values()].find((job) => job.id !== original.id);
  assert.equal(next.revision, 0); assert.equal(next.composition.source, null);
  assert.deepEqual(next.composition.artifacts, {});
  assert.equal(JSON.stringify(app.jobs.get('A').get(original.id)), frozenOriginal);
});

void test('lost or unrelated responses preserve the exact create identity until confirmed retry', async () => {
  for (const corruption of ['lose', 'corrupt']) {
    const app = await harness({ fingerprintDelay: 25 });
    await app.click('文章サンプルを入力'); app[corruption]();
    await app.click('確認して仕事を保存');
    assert.ok(app.find('button', '同じ操作で結果を確認'));
    assert.equal(app.jobs.get('A').size, 1);
    const first = app.requests.find((request) => request.payload?.action === 'create').payload;
    await app.click('同じ操作で結果を確認');
    const repeated = app.requests.filter((request) => request.payload?.action === 'create').at(-1).payload;
    assert.deepEqual(repeated, first); assert.equal(app.jobs.get('A').size, 1);
    assert.equal(app.find('button', '同じ操作で結果を確認'), undefined);
  }
});

void test('401 and owner change hide every private field and restore only the original owner draft', async () => {
  const app = await harness(); await app.click('文章サンプルを入力');
  app.input('composition-source', 'Private A text');
  const captured = app.find('button', '確認して仕事を保存').props.onClick;
  app.owner(null); await app.focus();
  assert.equal(app.find('textarea'), undefined);
  app.owner('B'); await app.focus();
  assert.equal(app.find('textarea', '').props.value, '');
  captured(); await app.flush();
  assert.equal(app.jobs.get('B'), undefined);
  assert.equal(app.text().includes('Private A text'), false);
  app.owner('A'); await app.focus();
  assert.equal(app.byId('composition-source').props.value, 'Private A text');
  assert.equal(app.protected(), true);
});

void test('two same-frame creates submit one job and material erasure keeps recipe deletion available', async () => {
  const app = await harness(); await app.click('文章サンプルを入力');
  const create = app.find('button', '確認して仕事を保存').props.onClick;
  create(); create(); app.render(); await app.flush();
  assert.equal(app.requests.filter((request) => request.payload?.action === 'create').length, 1);
  assert.equal(app.jobs.get('A').size, 1);
  await app.consent(); await app.click('この手順を実行'); await app.click('この手順を実行');
  app.input('composition-recipe-name', 'Erasable recipe'); await app.click('手順をレシピとして保存');
  await app.click('素材と成果を削除');
  assert.match(app.text(), /未保存編集を削除しました/);
  const saved = [...app.jobs.get('A').values()][0];
  assert.equal(saved.composition.source, null); assert.deepEqual(saved.composition.artifacts, {});
  assert.equal(app.byId('composition-source').props.value, '');
  assert.ok(saved.composition.recipe);
  await app.click('このレシピを削除');
  assert.match(app.text(), /レシピを削除しました/);
  assert.equal([...app.jobs.get('A').values()][0].composition.recipe, undefined);
});

void test('captured edits and run handlers cannot act after selecting a newer job', async () => {
  const app = await harness(); await app.click('文章サンプルを入力'); await app.click('確認して仕事を保存');
  await app.consent();
  const staleRun = app.find('button', 'この手順を実行').props.onClick;
  const staleEdit = app.byId('composition-objective').props.onChange;
  await app.click('新しい仕事');
  app.input('composition-objective', '新しい記事の出典整理');
  app.input('composition-acceptance', '新しい完成条件');
  await app.click('確認して仕事を保存');
  const previousRequests = app.requests.filter((request) => request.method !== 'GET').length;
  staleEdit({ target: { value: 'Stale overwrite' } }); staleRun(); app.render(); await app.flush();
  assert.equal(app.byId('composition-objective').props.value, '新しい記事の出典整理');
  assert.equal(app.requests.filter((request) => request.method !== 'GET').length, previousRequests);
  const first = [...app.jobs.get('A').values()][0];
  assert.equal(first.composition.source, null); assert.deepEqual(first.composition.artifacts, {});
});

void test('friendly article configuration reaches the real article adapter without editing JSON', async () => {
  const app = await harness(); await app.click('文章サンプルを入力');
  app.input('composition-objective', '記事を整えて無料版の紹介記事を作る');
  await app.click('手順を提案');
  app.input('article-length-s2', '1');
  app.input('article-summary-s2', '- First\n- Second\n- Third');
  app.input('article-paidContents-s2', 'Remaining synthetic text');
  app.input('article-noteUrl-s2', 'https://note.com/fixture/n/synthetic');
  await app.click('確認して仕事を保存'); await app.consent();
  await app.click('この手順を実行'); await app.click('この手順を実行'); await app.click('この手順を実行');
  const saved = [...app.jobs.get('A').values()][0];
  assert.equal(saved.status, 'review');
  assert.equal(Object.keys(saved.composition.artifacts).length, 3);
  assert.match(saved.composition.artifacts.s2.text, /## まとめ/);
  const links = [...saved.composition.artifacts.s2.text.matchAll(/https:\/\/[^\s)]+/g)]
    .map((match) => new URL(match[0]).href);
  assert.ok(links.some((url) => url === 'https://note.com/fixture/n/synthetic'));
});

async function completedOriginal(app) {
  await app.click('文章サンプルを入力'); await app.click('確認して仕事を保存'); await app.consent();
  await app.click('この手順を実行'); await app.click('この手順を実行');
  app.input('composition-review', '本人が原文を確認しました。'); await app.click('確認して仕事を完了');
  return [...app.jobs.get('A').values()][0];
}

void test('edited results use a fresh unchecked job and explicit new check while the completed original remains unchanged', async () => {
  const app = await harness(); const original = await completedOriginal(app);
  const originalJson = JSON.stringify(original);
  await app.click('編集して検査する');
  assert.equal(app.byId('original-artifact-s1').props.readOnly, true);
  const editedText = 'Updated result. <script>untrusted input remains plain text</script>';
  app.input('edited-artifact-s1', editedText);
  app.input('edit-acceptance-s1', 'Updatedという文言と5文字以上を確認する');
  app.input('edit-min-s1', '5'); app.input('edit-required-s1', 'Updated');
  await app.click('編集版を新しい仕事へ');
  const next = [...app.jobs.get('A').values()].find((job) => job.id !== original.id);
  assert.match(app.text(), /素材はまだ保存していません/);
  assert.equal(next.status, 'active'); assert.equal(next.revision, 0);
  assert.equal(next.composition.source, null); assert.deepEqual(next.composition.artifacts, {});
  assert.deepEqual(next.events, []); assert.equal(next.composition.recipe, undefined);
  assert.equal(next.steps.every((step) => !step.passed), true);
  assert.equal(app.byId('composition-source').props.value, editedText);
  assert.equal(app.protected(), true);
  await app.consent(); await app.click('この手順を実行');
  const checked = app.jobs.get('A').get(next.id);
  assert.equal(checked.composition.source, editedText); assert.equal(checked.status, 'review');
  assert.equal(checked.composition.artifacts.s1.text, editedText);
  assert.equal(checked.composition.artifacts.s1.checks.some((check) => check.name === '必須文言' && check.passed), true);
  assert.equal(JSON.stringify(app.jobs.get('A').get(original.id)), originalJson);
  await app.click('元の仕事を表示');
  assert.equal(app.byId('original-artifact-s1').props.value, original.composition.artifacts.s1.text);
});

void test('an edited-result creation keeps its private transfer snapshot and original ID across lost response and owner roundtrip', async () => {
  const app = await harness(); const original = await completedOriginal(app);
  await app.click('編集して検査する');
  app.input('edited-artifact-s1', 'Private edited A text'); app.input('edit-acceptance-s1', '確認する');
  app.lose(); await app.click('編集版を新しい仕事へ');
  const originalPayload = app.requests.filter((request) => request.payload?.action === 'create').at(-1).payload;
  assert.equal('source' in originalPayload, false);
  assert.ok(app.find('button', '同じ操作で結果を確認'));
  app.owner(null); await app.focus(); assert.equal(app.byId('edited-artifact-s1'), undefined);
  app.owner('B'); await app.focus(); assert.equal(app.byId('edited-artifact-s1'), undefined);
  app.owner('A'); await app.focus(); assert.equal(app.byId('edited-artifact-s1').props.value, 'Private edited A text');
  await app.click('同じ操作で結果を確認');
  const retry = app.requests.filter((request) => request.payload?.action === 'create').at(-1).payload;
  assert.deepEqual(retry, originalPayload); assert.equal(app.jobs.get('A').size, 2);
  assert.equal(app.byId('composition-source').props.value, 'Private edited A text');
  assert.equal(app.jobs.get('A').get(original.id).status, 'completed');
});

void test('captured editor actions cannot overwrite later edits or create a job after selecting another job', async () => {
  const app = await harness(); const original = await completedOriginal(app);
  await app.click('編集して検査する'); app.input('edit-acceptance-s1', '確認する');
  const capturedCreate = app.find('button', '編集版を新しい仕事へ').props.onClick;
  const capturedDiscard = app.find('button', 'この編集を破棄').props.onClick;
  app.byId('edited-artifact-s1').props.onChange({ target: { value: 'A later edit before rerender' } });
  capturedCreate(); capturedDiscard(); app.render(); await app.flush();
  assert.equal(app.jobs.get('A').size, 1);
  assert.equal(app.byId('edited-artifact-s1').props.value, 'A later edit before rerender');
  const staleCreate = app.find('button', '編集版を新しい仕事へ').props.onClick;
  await app.click('新しい仕事'); staleCreate(); await app.flush(); assert.equal(app.jobs.get('A').size, 1);
  await app.click(original.composition.plan.objective);
  assert.equal(app.byId('edited-artifact-s1').props.value, 'A later edit before rerender');
});

void test('CSV editing preserves the CSV format and runs a fresh structure check without changing its source job', async () => {
  const app = await harness();
  app.input('composition-objective', 'CSVの空白を整理する'); app.input('composition-acceptance', '列と行を確認する');
  app.input('composition-format', 'csv'); app.input('composition-source', 'name,amount\n Alice ,100\nBob,200');
  app.input('csv-trim-s1', 'name'); await app.click('確認して仕事を保存'); await app.consent();
  await app.click('この手順を実行'); await app.click('この手順を実行');
  const original = [...app.jobs.get('A').values()][0]; const before = JSON.stringify(original);
  await app.click('編集して検査する');
  const edited = 'name,amount\nAlice,101\nBob,201';
  app.input('edited-artifact-s1', edited); app.input('edit-acceptance-s1', 'CSVの2列2行を確認する');
  await app.click('編集版を新しい仕事へ'); await app.consent(); await app.click('この手順を実行');
  const next = [...app.jobs.get('A').values()].find((job) => job.id !== original.id);
  assert.equal(next.composition.plan.inputKind, 'csv');
  assert.equal(next.composition.artifacts.s1.kind, 'csv'); assert.equal(next.composition.artifacts.s1.text, edited);
  assert.equal(app.find('a', '成果をダウンロード').props.download, `zema-step-s1-r${next.revision}.csv`);
  assert.ok(next.composition.artifacts.s1.checks.some((check) => check.name === 'CSV構造' && check.passed));
  assert.equal(JSON.stringify(app.jobs.get('A').get(original.id)), before);
});

void test('explicit material erasure also removes this job’s retained editor, and stale callbacks cannot resurrect it', async () => {
  const app = await harness(); await completedOriginal(app); await app.click('編集して検査する');
  app.input('edited-artifact-s1', 'Private edited text to erase');
  const staleEdit = app.byId('edited-artifact-s1').props.onChange;
  const staleCreate = app.find('button', '編集版を新しい仕事へ').props.onClick;
  assert.equal(app.protected(), true);
  await app.click('素材と成果を削除');
  staleEdit({ target: { value: 'Resurrected text' } }); staleCreate(); app.render(); await app.flush();
  assert.equal(app.byId('edited-artifact-s1'), undefined); assert.equal(app.byId('composition-source').props.value, '');
  assert.equal(app.protected(), false); assert.equal(app.jobs.get('A').size, 1);
});

void test('saved output downloads use an owner-authenticated HTTP attachment pinned to the displayed revision', async () => {
  const app = await harness(); await completedOriginal(app);
  const saved = [...app.jobs.get('A').values()][0];
  const link = app.find('a', '成果をダウンロード'); assert.ok(link);
  const url = new URL(link.props.href, 'https://local.test');
  assert.equal(url.pathname, '/api/work-jobs/composition/artifact');
  assert.equal(url.searchParams.get('jobId'), saved.id);
  assert.equal(url.searchParams.get('nodeId'), 's1');
  assert.equal(url.searchParams.get('revision'), String(saved.revision));
  assert.equal([...url.searchParams.keys()].length, 3);
  assert.equal(link.props.download, `zema-step-s1-r${saved.revision}.txt`);
  assert.equal(link.props.referrerPolicy, 'no-referrer');
  assert.equal(link.props.target, undefined);
  assert.equal(link.props.onClick, undefined);
  app.owner(null); await app.focus(); assert.equal(app.find('a', '成果をダウンロード'), undefined);
  app.owner('B'); await app.focus(); assert.equal(app.find('a', '成果をダウンロード'), undefined);
  app.owner('A'); await app.focus(); assert.ok(app.find('a', '成果をダウンロード'));
  await app.click('素材と成果を削除'); assert.equal(app.find('a', '成果をダウンロード'), undefined);
});

void test('Sky tool links seed only the chosen connected Tool and a fresh check, with no URL-derived material or approval', async () => {
  for (const tool of ['mr-citations', 'mr-free-article', 'rockstar-csv-cleanup']) {
    const app = await harness({ search: `?tool=${tool}&source=PRIVATE&objective=OLD&acceptance=OLD&budgetMinor=10000&consent=true` });
    assert.equal(app.byId('composition-tool-s1').props.value, tool);
    assert.equal(app.byId('composition-tool-s2').props.value, 'compose-check');
    assert.equal(app.byId('composition-format').props.value, tool === 'rockstar-csv-cleanup' ? 'csv' : 'text');
    for (const field of ['composition-objective', 'composition-acceptance', 'composition-source']) assert.equal(app.byId(field).props.value, '');
    assert.equal(app.find('button', '確認して仕事を保存').props.disabled, true);
    assert.equal(app.requests.some((request) => request.method !== 'GET'), false);
  }
});

void test('unavailable and malformed tool query parameters explicitly refuse seeding an executable request', async () => {
  for (const search of ['?tool=jev-router', '?tool=missing', '?tool=compose-check', '?tool=mr-citations&tool=rockstar-csv-cleanup']) {
    const app = await harness({ search });
    assert.match(app.text(), /指定されたToolはこの経路で利用できません/);
    assert.equal(app.byId('composition-objective').props.value, '');
    assert.equal(app.requests.some((request) => request.method !== 'GET'), false);
  }
  const app = await harness({ search: '?tool=rockstar-csv-cleanup', initialOwner: null });
  assert.match(app.text(), /Skyで選んだTool/); assert.equal(app.byId('composition-source'), undefined);
});

void test('job URLs and existing owner drafts take priority over tool links, including owner reauthentication', async () => {
  const plan = { ...composition.suggestComposition('既存の記事の出典整理', 'text'), acceptance: '既存の条件' };
  const existing = createWorkJob({ id: randomUUID(), title: plan.objective, templateId: 'composition', plan });
  const saved = await harness({ search: `?job=${existing.id}&tool=rockstar-csv-cleanup`, initialJobs: [existing] });
  assert.equal(saved.byId('composition-objective').props.value, plan.objective);
  assert.equal(saved.byId('composition-format').props.value, 'text');
  const app = await harness({ search: '?tool=rockstar-csv-cleanup' });
  app.input('composition-objective', 'Private A CSV'); app.input('composition-source', 'a,b\n1,2');
  app.location('?tool=mr-free-article'); await app.focus();
  assert.equal(app.byId('composition-tool-s1').props.value, 'rockstar-csv-cleanup');
  assert.equal(app.byId('composition-source').props.value, 'a,b\n1,2');
  app.owner(null); await app.focus(); assert.equal(app.byId('composition-source'), undefined);
  app.owner('B'); await app.focus(); assert.equal(app.byId('composition-source').props.value, '');
  assert.equal(app.byId('composition-tool-s1').props.value, 'mr-free-article');
  app.owner('A'); await app.focus();
  assert.equal(app.byId('composition-tool-s1').props.value, 'rockstar-csv-cleanup');
  assert.equal(app.byId('composition-objective').props.value, 'Private A CSV');
  assert.equal(app.byId('composition-source').props.value, 'a,b\n1,2');
});

void test('changing a tool query never replaces a selected recipe or its fresh private input', async () => {
  const app = await harness(); await completedOriginal(app);
  app.input('composition-recipe-name', 'Stored recipe'); await app.click('手順をレシピとして保存');
  await app.click('Stored recipe'); app.input('composition-source', 'Fresh recipe material');
  app.location('?tool=rockstar-csv-cleanup'); await app.focus();
  assert.equal(app.byId('composition-tool-s1').props.value, 'mr-citations');
  assert.equal(app.byId('composition-format').props.value, 'text');
  assert.equal(app.byId('composition-source').props.value, 'Fresh recipe material');
  assert.match(app.text(), /レシピから新しい仕事/);
});
