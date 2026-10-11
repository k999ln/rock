import * as pendingOwnerIntent from '../lib/pending-owner-intent.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
const ownerA = 'owner-v1:' + 'a'.repeat(64), ownerB = 'owner-v1:' + 'b'.repeat(64);
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createTeamCase, applyTeamAction, teamMoney } from '../lib/coconala-team.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../components/coconala-team-workspace.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const navigationCompiled = ts.transpileModule(readFileSync(new URL('../components/use-pending-save-navigation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
class RequestError extends Error { constructor(message, status, code) { super(typeof message === 'number' ? `HTTP ${message}` : message); this.status = typeof message === 'number' ? message : status; this.code = code; } }
const fields = {
  案件名: 'Synthetic recovery case', 'ココナラ案件番号・参照': 'fixture-01', '顧客の表示名': 'fixture-customer',
  制作担当者名: 'fixture-worker', '委託する作業・成果物': 'synthetic article', 納品予定日: '2026-10-15',
  '納品先・方法': 'local fixture', 検査完了予定日: '2026-10-16', 修正対応の範囲: 'one revision',
  '成果物の権利・利用条件': 'fixture only', '担当者への支払期日': '2026-10-31',
  '規約・再委託条件の確認記録': 'fixture reference', '顧客へチーム制作を伝えた記録': 'fixture reference',
  '担当者へ発注条件を明示した記録': 'fixture reference',
};
function harness() {
  const slots = [], effects = [], requests = [], records = new Map(), timers = [], listeners = new Map(), documentListeners = new Map(), replies = [];
  let currentOwner = ownerA;
  let cursor = 0, tree, drop = null, validation = false;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(fn) { cursor++; return fn(); },
    useCallback(fn, deps) { const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) slots[i] = { fn, deps };
      return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        previous?.cleanup?.(); slots[i] = { deps };
        effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const inert = () => null;
  async function request(_path, method, value, headers) {
    const payload = value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    requests.push({ method, headers, value: payload });
    if (method === 'GET') return replies.length ? await replies.shift()() : { ownerScope: currentOwner, cases: [...records.values()] };
    if (validation) { const status = validation; validation = false;
      if (status === 'owner') throw new RequestError('Changed after identity check', 409, ownerIntent.OWNER_CHANGED);
      throw new RequestError(status); }
    let file;
    if (method === 'POST') {
      file = records.get(payload.id) ?? createTeamCase(payload);
    } else if (method === 'PATCH') {
      file = applyTeamAction(records.get(payload.caseId), payload.command, payload.revision);
    } else throw Error(`unexpected method ${method}`);
    records.set(file.id, file);
    if (drop === method) { drop = null; throw new RequestError(503); }
    return { caseFile: file };
  }
  const windowSurface = { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  class Element { constructor(attributes) { this.attributes = attributes; } closest() { return this; }
    getAttribute(name) { return this.attributes[name] ?? null; } hasAttribute(name) { return name in this.attributes; } }
  const navigation = {};
  runInNewContext(navigationCompiled, { exports: navigation, Element, window: windowSurface,
    document: { addEventListener(name, fn) { documentListeners.set(name, fn); }, removeEventListener(name) { documentListeners.delete(name); } },
    require(name) { assert.equal(name, 'react'); return react; },
  });
  const modules = { '@/lib/pending-owner-intent': pendingOwnerIntent, '@/lib/owner-intent': ownerIntent,
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': 'a',
    '@/components/use-pending-save-navigation': navigation,
    '@/lib/operations-client': { operationRequest: request, OperationRequestError: RequestError },
    '@/lib/coconala-team': { teamMoney }, '@/lib/catalog': { catalog: [] },
    '@/lib/sky-tool-ui': { skyToolUiState: inert },
    '@/components/ui/dialog': { Dialog: 'dialog', DialogContent: 'dialog-content', DialogDescription: 'p', DialogTitle: 'h2' },
    '@/components/tool-icon': { ToolIcon: inert }, '@/components/mr-tool-runner': { MrToolRunner: inert },
  };
  const exports = {};
  runInNewContext(compiled, { exports, crypto,
    window: windowSurface,
    require(id) {
      if (id in modules) return modules[id];
      if (id.startsWith('@/components/')) return inert;
      if (id === 'lucide-react') return new Proxy({}, { get: () => inert });
      if (id.endsWith('.module.css')) return {};
      throw Error(id);
    },
  });
  function render() { cursor = 0; tree = exports.default({ workspace: true }); while (effects.length) effects.shift()(); return tree; }
  function nodes(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach((item) => nodes(item, out)); return out; }
    if (node.type === 'dialog' && !node.props.open) return out;
    out.push(node); nodes(node.props?.children, out); return out;
  }
  function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) :
    Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : ''; }
  function find(type, label) { return nodes(tree).find((node) => node.type === type && (!label || text(node).includes(label))); }
  async function flush() { while (timers.length) timers.shift()(); await new Promise((resolve) => setImmediate(resolve)); render(); }
  async function click(label) { const button = find('button', label); assert.ok(button, label); assert.ok(!button.props.disabled, label);
    button.props.onClick(); render(); await flush(); }
  function fillLabel(label, value) { const input = nodes(find('label', label)).find((node) => ['input', 'textarea'].includes(node.type));
    assert.ok(input, label); assert.ok(!input.props.disabled, label); input.props.onChange({ target: { value } }); render(); }
  function fillPlaceholder(placeholder, value) { const input = nodes(tree).find((node) => node.props?.placeholder === placeholder);
    assert.ok(input); assert.ok(!input.props.disabled); input.props.onChange({ target: { value } }); render(); }
  async function submit() { find('form').props.onSubmit({ preventDefault() {} }); render(); await flush(); }
  async function reload() { const button = nodes(tree).find((node) => node.type === 'button' && node.props['aria-label'] === '再読込');
    assert.ok(button); assert.ok(!button.props.disabled); button.props.onClick(); render(); await flush(); }
  render();
  return { setOwner(value) { currentOwner = value; }, replies, reload, render,
    navigate(attributes) { let prevented = false; documentListeners.get('click')?.({ button: 0, target: new Element(attributes), preventDefault() { prevented = true; } }); return prevented; }, find, nodes: (node = tree) => nodes(node), flush, click, fillLabel, fillPlaceholder, submit, requests, records, listeners,
    drop(method) { drop = method; }, rejectNext(status = 400) { validation = status; } };
}

void test('lost create response retains a frozen operation and retries one draft with the same ID', async () => {
  const h = harness(); await h.flush(); await h.click('案件を作る');
  for (const [label, value] of Object.entries(fields)) h.fillLabel(label, value);
  h.drop('POST'); await h.submit();
  assert.equal(h.records.size, 1);
  assert.ok(h.find('button', '下書きとして保存').props.disabled);
  assert.ok(h.find('button', '閉じる').props.disabled);
  assert.ok(h.nodes(h.find('form')).filter((node) => ['input', 'textarea'].includes(node.type)).every((node) => node.props.disabled));
  assert.ok(h.listeners.has('beforeunload'));
  assert.equal(h.requests.filter((request) => request.method === 'POST').length, 1, 'no automatic resend');
  await h.click('同じ保存内容で結果を確認');
  const posts = h.requests.filter((request) => request.method === 'POST');
  assert.equal(posts.length, 2); assert.deepEqual(posts[0].value, posts[1].value);
  assert.equal(h.records.size, 1);
  assert.equal(h.find('form'), undefined);
  assert.equal(h.listeners.has('beforeunload'), false);
  assert.ok(!h.find('button', '案件を作る').props.disabled);
});

void test('lost manual receipt response replays the same command and records money only once', async () => {
  const h = harness(); await h.flush(); await h.click('案件を作る');
  for (const [label, value] of Object.entries(fields)) h.fillLabel(label, value);
  await h.submit(); await h.click('担当開始を記録');
  h.fillPlaceholder('金額（円）', '3000'); h.fillPlaceholder('外部明細・振込参照番号', 'manual-fixture-01');
  h.drop('PATCH'); await h.click('記録する');
  assert.equal([...h.records.values()][0].customerReceipts.length, 1);
  assert.ok(h.find('button', '記録する').props.disabled);
  await h.click('同じ保存内容で結果を確認');
  const patches = h.requests.filter((request) => request.method === 'PATCH');
  assert.deepEqual(patches.at(-1).value, patches.at(-2).value);
  const saved = [...h.records.values()][0];
  assert.equal(saved.customerReceipts.length, 1); assert.equal(saved.revision, 2);
  assert.equal(teamMoney(saved).manuallyRecordedCustomerNet, 3000);
  assert.equal(h.find('button', '同じ保存内容で結果を確認'), undefined);
});

void test('definitive validation failure releases the input without losing entered terms', async () => {
  const h = harness(); await h.flush(); await h.click('案件を作る');
  h.fillLabel('案件名', 'keep my draft'); h.rejectNext(); await h.submit();
  assert.equal(h.records.size, 0);
  assert.ok(!h.find('button', '下書きとして保存').props.disabled);
  const title = h.nodes(h.find('label', '案件名')).find((node) => node.type === 'input');
  assert.equal(title.props.value, 'keep my draft'); assert.ok(!title.props.disabled);
  assert.equal(h.find('button', '同じ保存内容で結果を確認'), undefined);
});

async function savedCase() {
  const h = harness(); await h.flush(); await h.click('案件を作る');
  for (const [label, value] of Object.entries(fields)) h.fillLabel(label, value);
  await h.submit(); return h;
}

void test('a late Coconala list cannot undo a newer 401 or restore prior private cases', async () => {
  const h = await savedCase(), prior = [...h.records.values()];
  const delayed = Promise.withResolvers(); h.replies.push(() => delayed.promise); await h.reload();
  h.replies.push(() => { throw new RequestError(401); }); await h.reload();
  assert.ok(h.find('h2', 'サインインして案件を管理'));
  delayed.resolve({ ownerScope: ownerA, cases: prior }); await h.flush();
  assert.ok(h.find('h2', 'サインインして案件を管理'));
  assert.equal(h.find('h2', 'Synthetic recovery case'), undefined);
  assert.equal(h.find('button', '担当開始を記録'), undefined);
});

void test('a prior-owner Coconala list cannot replace a newer account list', async () => {
  const h = await savedCase(), prior = [...h.records.values()];
  const other = { ...prior[0], id: crypto.randomUUID(), terms: { ...prior[0].terms, title: 'Different account fixture' } };
  const delayed = Promise.withResolvers(); h.replies.push(() => delayed.promise); await h.reload();
  h.replies.push(() => ({ ownerScope: ownerA, cases: [other] })); await h.reload();
  assert.ok(h.find('h2', 'Different account fixture'));
  delayed.resolve({ ownerScope: ownerA, cases: prior }); await h.flush();
  assert.ok(h.find('h2', 'Different account fixture'));
  assert.equal(h.find('h2', 'Synthetic recovery case'), undefined);
});

void test('a pre-action Coconala list cannot roll back a confirmed PATCH in the workspace', async () => {
  const h = await savedCase(), prior = [...h.records.values()];
  const delayed = Promise.withResolvers(); h.replies.push(() => delayed.promise); await h.reload();
  await h.click('担当開始を記録');
  assert.equal([...h.records.values()][0].status, 'assigned');
  assert.equal(h.find('button', '担当開始を記録'), undefined);
  delayed.resolve({ ownerScope: ownerA, cases: prior }); await h.flush();
  assert.equal(h.find('button', '担当開始を記録'), undefined);
  assert.ok(h.nodes().some((node) => node.props?.placeholder === '成果物を受領した記録・検査結果'));
});

void test('Coconala pending saves protect same-tab navigation while allowing separate-tab sign-in', async () => {
  const h = await savedCase(); await h.click('担当開始を記録');
  h.fillPlaceholder('金額（円）', '3000'); h.fillPlaceholder('外部明細・振込参照番号', 'navigation-fixture');
  h.drop('PATCH'); await h.click('記録する');
  const back = h.find('a', 'ライブラリへ戻る'); assert.ok(back);
  assert.equal(h.navigate({ href: back.props.href }), true);
  assert.equal(h.navigate({ href: '/' }), true, 'WorkspaceShell Home shares the document guard');
  h.rejectNext(401); await h.click('同じ保存内容で結果を確認');
  const signin = h.find('a', '別タブでサインイン'); assert.ok(signin);
  assert.equal(h.navigate({ href: signin.props.href, target: signin.props.target }), false);
  assert.equal(h.navigate({ href: 'blob:fixture', download: 'fixture.json' }), false);
  await h.click('サインイン後に接続を確認'); await h.click('同じ保存内容で結果を確認');
  assert.equal(h.navigate({ href: back.props.href }), false, 'confirmed save releases navigation');
  assert.equal([...h.records.values()][0].customerReceipts.length, 1);
});

void test('Coconala pending create survives 401 and a different owner without any POST to that owner', async () => {
  const h = harness(); await h.flush(); await h.click('案件を作る');
  for (const [label, value] of Object.entries(fields)) h.fillLabel(label, value);
  h.rejectNext(503); await h.submit();
  h.rejectNext(401); await h.click('同じ保存内容で結果を確認');
  h.setOwner(ownerB); await h.click('サインイン後に接続を確認');
  assert.ok(h.find('button', '同じ保存内容で結果を確認').props.disabled);
  assert.ok(h.find('button', '下書きとして保存').props.disabled);
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 2);
  assert.equal(h.records.size, 0);
  h.setOwner(ownerA); await h.click('保存先の接続を確認'); await h.click('同じ保存内容で結果を確認');
  const posts = h.requests.filter(r => r.method === 'POST');
  assert.equal(posts.length, 3); assert.deepEqual(posts[2].value, posts[0].value);
  assert.equal(posts[2].headers[ownerIntent.OWNER_SCOPE_HEADER], ownerA);
  assert.equal(h.records.size, 1);
});
void test('Coconala explicitly releases the pending ID and preserves terms before a new-owner save', async () => {
  const h = harness(); await h.flush(); await h.click('案件を作る');
  for (const [label, value] of Object.entries(fields)) h.fillLabel(label, value);
  h.rejectNext(503); await h.submit(); h.setOwner(ownerB);
  await h.click('同じ保存内容で結果を確認');
  assert.ok(h.find('button', '保留を解除（入力は保持）'));
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
  await h.click('保存先の接続を確認'); await h.click('保留を解除（入力は保持）');
  await h.submit();
  const posts = h.requests.filter(r => r.method === 'POST');
  assert.equal(posts.length, 2); assert.notEqual(posts[1].value.id, posts[0].value.id);
  assert.deepEqual(posts[1].value.terms, posts[0].value.terms);
  assert.equal(posts[1].headers[ownerIntent.OWNER_SCOPE_HEADER], ownerB);
});
void test('Coconala refuses unknown owner scope on GET and on retry without dropping the pending input', async () => {
  const h = harness(); h.setOwner(null); await h.flush(); await h.click('案件を作る');
  assert.ok(h.find('button', '下書きとして保存').props.disabled);
  h.setOwner(ownerA); await h.click('保存先の接続を確認');
  for (const [label, value] of Object.entries(fields)) h.fillLabel(label, value);
  h.rejectNext(503); await h.submit(); h.setOwner(null); await h.click('同じ保存内容で結果を確認');
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1);
  assert.ok(h.find('button', '同じ保存内容で結果を確認'));
  assert.ok(h.find('button', '下書きとして保存').props.disabled);
});

void test('Coconala keeps the frozen operation when owner changes between preflight and POST', async () => {
 const h = harness(); await h.flush(); await h.click('案件を作る');
 for (const [label, value] of Object.entries(fields)) h.fillLabel(label, value);
 h.rejectNext('owner'); await h.submit();
 assert.ok(h.find('button', '同じ保存内容で結果を確認'));
 await h.click('同じ保存内容で結果を確認');
 const posts = h.requests.filter(r => r.method === 'POST');
 assert.deepEqual(posts[1].value, posts[0].value);
 assert.equal(posts[1].headers[ownerIntent.OWNER_SCOPE_HEADER], ownerA);
 assert.equal(h.records.size, 1);
});
