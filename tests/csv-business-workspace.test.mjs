import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createCsvHistoryRequest } from '../lib/csv-history-request.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as csvView from '../lib/csv-job-view.ts';
import * as pendingIntent from '../lib/pending-owner-intent.ts';
const ts = createRequire(import.meta.url)('typescript');
const compiled = ts.transpileModule(readFileSync(new URL('../components/csv-business-workspace.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const operations = {};
const clientSource = ts.transpileModule(readFileSync(new URL('../lib/operations-client.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
runInNewContext(clientSource, { exports: operations, Error,
  require(id) { assert.ok(['./device', './sky-zema-handoff'].includes(id), id); return {}; },
});
const owner = `owner-v1:${'a'.repeat(64)}`, otherOwner = `owner-v1:${'b'.repeat(64)}`;
const history = (jobs = [], ownerScope = owner) => ({ jobs, ownerScope, trialPayment: { available: true, mode: 'test' } });
const job = (id, status = 'quoted') => ({ id, status, paymentStatus: 'unpaid', inputName: 'customer.csv', inputBytes: 10, inputSha256: 'hash', inputEncoding: 'utf8', quoteMinor: 300000, currency: 'JPY', outputSha256: null, validation: null, attempt: 0, revision: 0, errorCode: null, expiresAt: Date.now() + 86400000, createdAt: Date.now(), completedAt: null, artifacts: [] });
function nodes(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const child of node) nodes(child, out); return out; }
  out.push(node); nodes(node.props?.children, out); return out;
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return node && typeof node === 'object' ? text(node.props?.children) : '';
}
function harness() {
  const slots = [], effects = [], requests = [], timers = [];
  let cursor = 0, tree, pendingNavigation = false, stateWrites = 0;
  const changed = (old, deps) => !old || deps.some((value, index) => !Object.is(value, old.deps[index]));
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { stateWrites++; slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useMemo(fn, deps) { const index = cursor++; if (changed(slots[index], deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useCallback(fn, deps) { return this.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const index = cursor++, old = slots[index]; if (changed(old, deps)) effects.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); },
  };
  // React imports call callbacks without their receiver.
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
  const jsx = (type, props) => ({ type, props }), exports = {};
  runInNewContext(compiled, {
    exports, Error, TypeError, File, FormData, URLSearchParams, AbortSignal, AbortController, crypto,
    window: { setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, location: { search: '', assign() {} }, confirm: () => true },
    require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === '@/lib/csv-job-view') return csvView;
      if (id === '@/lib/csv-history-request') return { createCsvHistoryRequest };
      if (id === '@/lib/owner-intent') return ownerIntent;
      if (id === '@/lib/pending-owner-intent') return pendingIntent;
      if (id === '@/lib/operations-client') return operations;
      if (id === '@/components/use-pending-save-navigation') return { usePendingSaveNavigation: pending => { pendingNavigation = pending; } };
      if (id === '@/lib/csv-trial-sample') return { CSV_TRIAL_SAMPLE: 'name\nTest\n' };
      return new Proxy({ __esModule: true, default: () => null }, { get: (target, key) => target[key] ?? (() => null) });
    },
    fetch: (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve: (status, body) => resolve({ ok: status >= 200 && status < 300, status, json: async () => { if (body instanceof Error) throw body; return body; } }), reject })),
  });
  function render() { cursor = 0; tree = exports.default({}); for (const effect of effects.splice(0)) effect(); return tree; }
  async function settle() { await new Promise(resolve => setImmediate(resolve)); render(); }
  function button(label) { const result = nodes(tree).find(node => node.type === 'button' && text(node).includes(label)); assert.ok(result, `button ${label}`); return result; }
  async function respond(index, status, body) { assert.ok(requests[index], `request ${index}`); requests[index].resolve(status, body); await settle(); }
  render(); timers.splice(0).forEach(fn => fn());
  return {
    requests, render, settle, button, respond, nodes: () => nodes(tree), text: () => text(tree), pending: () => nodes(tree).some(node => node.props?.['aria-label'] === 'CSV見積りの保存結果の確認'), navigation: () => pendingNavigation, stateWrites: () => stateWrites,
    ready: (jobs = [], scope = owner) => respond(0, 200, history(jobs, scope)),
    select(name = 'customer.csv') { nodes(tree).find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [new File(['name\nTest\n'], name)] } }); render(); },
    change(label, value) { const target = nodes(tree).find(node => node.type === 'label' && text(node).includes(label)); const field = nodes(target).find(node => ['input', 'textarea', 'select'].includes(node.type)); assert.ok(field, label); field.props.onChange({ target: { value } }); render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
async function quote(h) {
  h.select(); h.button('¥3,000の見積り').props.onClick();
  await h.respond(h.requests.length - 1, 200, history());
  return h.requests.at(-1);
}
void test('same-frame quote clicks issue one owner check and one POST', async () => {
  const h = harness(); await h.ready(); h.select(); const click = h.button('¥3,000の見積り').props.onClick;
  click(); click(); assert.equal(h.requests.length, 2);
  await h.respond(1, 200, history());
  assert.equal(h.requests.filter(request => request.options.method === 'POST').length, 1);
  assert.equal(h.requests[2].options.headers[ownerIntent.OWNER_SCOPE_HEADER], owner);
});
void test('lost quote response retains original ID, file and specification across input edits', async () => {
  const h = harness(); await h.ready(); const first = await quote(h);
  first.reject(new TypeError('response lost after server save')); await h.settle();
  assert.equal(h.pending(), true);
  h.select('edited.csv'); h.change('列順', 'changed');
  assert.equal(h.button('¥3,000の見積り').props.disabled, true);
  h.button('同じ見積りの結果を確認').props.onClick(); await h.respond(h.requests.length - 1, 200, history());
  const retry = h.requests.at(-1);
  for (const key of ['id', 'specification', 'sample', 'trial']) assert.equal(retry.options.body.get(key), first.options.body.get(key));
  assert.equal(retry.options.body.get('file').name, 'customer.csv');
  await h.respond(h.requests.length - 1, 201, { job: job(first.options.body.get('id')) });
  assert.equal(h.pending(), false); assert.match(h.text(), /edited.csv/);
});
void test('explicit release preserves edited input and starts a new quote identity', async () => {
  const h = harness(); await h.ready(); const first = await quote(h);
  first.reject(new TypeError('offline')); await h.settle(); h.select('edited.csv'); h.change('列順', 'changed');
  h.button('保留を解除（入力は保持）').props.onClick(); h.render();
  assert.equal(h.pending(), false); h.button('¥3,000の見積り').props.onClick(); await h.respond(h.requests.length - 1, 200, history());
  const next = h.requests.at(-1);
  assert.notEqual(next.options.body.get('id'), first.options.body.get('id'));
  assert.equal(next.options.body.get('file').name, 'edited.csv');
  assert.deepEqual(JSON.parse(next.options.body.get('specification')).order, ['changed']);
});
void test('definitive invalid input clears the intent while unknown responses preserve it', async () => {
  for (const status of [400, 413, 500, 401]) {
    const h = harness(); await h.ready([job('previous')]); await quote(h);
    await h.respond(h.requests.length - 1, status, { error: 'request failed', code: 'TEST' });
    assert.equal(h.pending(), status === 500 || status === 401);
    if (status === 401) { assert.doesNotMatch(h.text(), /previous/); assert.match(h.text(), /別タブでサインイン/); }
  }
});
void test('changed owner and owner change between read and POST never replace original intent', async () => {
  const h = harness(); await h.ready(); const first = await quote(h);
  await h.respond(h.requests.length - 1, 409, { error: ownerIntent.OWNER_CHANGED_MESSAGE, code: ownerIntent.OWNER_CHANGED });
  assert.equal(h.pending(), true);
  h.button('同じ見積りの結果を確認').props.onClick(); await h.respond(h.requests.length - 1, 200, history([], otherOwner));
  assert.equal(h.requests.filter(request => request.options.method === 'POST').length, 1);
  assert.match(h.text(), /保存を始めたアカウントと異なります/);
  h.button('同じ見積りの結果を確認').props.onClick(); await h.respond(h.requests.length - 1, 200, history());
  assert.equal(h.requests.at(-1).options.body.get('id'), first.options.body.get('id'));
});
void test('late history response cannot restore jobs or auth after the newer 401', async () => {
  const h = harness(); await h.ready([job('old-private-job')]);
  h.button('再読込').props.onClick(); h.button('再読込').props.onClick();
  await h.respond(2, 401, { error: 'signin required' });
  await h.respond(1, 200, history([job('old-private-job')]));
  assert.doesNotMatch(h.text(), /old-private-job/); assert.equal(h.button('サンプルを完走').props.disabled, true);
});
void test('slow pre-quote history cannot erase the newly confirmed quote', async () => {
  const h = harness(); await h.ready(); h.button('再読込').props.onClick();
  const request = await quote(h), id = request.options.body.get('id');
  await h.respond(h.requests.length - 1, 201, { job: job(id) }); await h.respond(1, 200, history());
  assert.match(h.text(), new RegExp(id));
});
void test('same-frame acceptance, payment and deletion each issue one mutation', async () => {
  for (const action of ['入金確認済みとして開始', '50円のテスト決済へ', '削除']) {
    const h = harness(), existing = job('existing'); if (action.includes('50円')) existing.quoteMinor = 5000;
    await h.ready([existing]); h.change('取引・入金の照合番号', 'reference');
    const click = h.button(action).props.onClick; click(); click();
    assert.equal(h.requests.length, 2, action);
    if (action === '削除') assert.ok(h.requests[1].options.signal);
  }
});
void test('failed acceptance locks mutations while reconciliation restores a current auth result', async () => {
  const h = harness(); await h.ready([job('existing')]); h.change('取引・入金の照合番号', 'reference');
  h.button('入金確認済みとして開始').props.onClick();
  await h.respond(1, 401, { error: 'expired session' });
  assert.equal(h.button('サンプルを完走').props.disabled, true);
  await h.respond(2, 200, history([job('existing', 'completed')]));
  assert.equal(h.button('サンプルを完走').props.disabled, false);
  assert.doesNotMatch(h.text(), /別タブでサインイン/);
});
void test('accepted job exposes an explicit resume with its current revision', async () => {
  const h = harness(), existing = { ...job('accepted', 'accepted'), revision: 3, paymentStatus: 'sample' };
  await h.ready([existing]); h.button('受付済みの処理を再開').props.onClick();
  assert.deepEqual(JSON.parse(h.requests[1].options.body), { action: 'accept', revision: 3 });
});
void test('sample quote hands the lock to acceptance and completes without another user action', async () => {
  const h = harness(); await h.ready(); h.button('サンプルを完走').props.onClick();
  await h.respond(1, 200, history()); const id = h.requests[2].options.body.get('id');
  await h.respond(2, 201, { job: { ...job(id), paymentStatus: 'sample', quoteMinor: 0 } });
  assert.equal(h.requests[3].options.method, 'POST');
  await h.respond(3, 200, { job: { ...job(id, 'completed'), paymentStatus: 'sample', quoteMinor: 0 } });
  assert.match(h.text(), /検査合格・納品可能/); assert.equal(h.pending(), false); assert.equal(h.button('サンプルを完走').props.disabled, false);
});
void test('pending owner check and pending quote response do not write state after unmount', async () => {
  for (const stage of ['read', 'post']) {
    const h = harness(); await h.ready(); h.select(); h.button('¥3,000の見積り').props.onClick();
    if (stage === 'post') await h.respond(1, 200, history());
    h.unmount(); const before = h.stateWrites(), request = h.requests.at(-1);
    request.resolve(200, stage === 'read' ? history() : { job: job(request.options.body.get('id')) });
    await h.settle(); assert.equal(h.stateWrites(), before); assert.equal(h.requests.length, stage === 'read' ? 2 : 3);
  }
});

void test('incomplete refusal responses retain the original quote intent for safe confirmation', async () => {
  for (const body of [{}, [], { error: 'owner mismatch', code: null }, new SyntaxError('truncated response')]) {
    const h = harness(); await h.ready(); const first = await quote(h);
    await h.respond(h.requests.length - 1, 409, body);
    assert.equal(h.pending(), true);
    h.button('同じ見積りの結果を確認').props.onClick(); await h.respond(h.requests.length - 1, 200, history());
    assert.equal(h.requests.at(-1).options.body.get('id'), first.options.body.get('id'));
  }
});
void test('sign-in redirects and bodyless 401 clear old-owner rows without discarding quote identity', async () => {
  for (const status of [302, 401]) {
    const h = harness(); await h.ready([job('private-old-row')]); const request = await quote(h);
    assert.equal(request.options.redirect, 'manual');
    await h.respond(h.requests.length - 1, status, new SyntaxError('not JSON'));
    assert.equal(h.pending(), true); assert.doesNotMatch(h.text(), /private-old-row/); assert.match(h.text(), /別タブでサインイン/);
  }
});

function value(h, label) {
 const target=h.nodes().find(n=>n.type==='label'&&text(n).includes(label));
 return nodes(target).find(n=>['input','textarea','select'].includes(n.type)).props.value;
}
void test('pending CSV filename and conditions must be hidden after 401 and another owner',async()=>{
 const h=harness();await h.ready();h.select('alice-private-client.csv');h.change('列順','alice_private_column');h.change('取引・入金の照合番号','alice-private-payment');
 h.button('¥3,000の見積り').props.onClick();await h.respond(1,200,history());await h.respond(2,401,{error:'signin'});
 h.button('保存先の接続を確認').props.onClick();await h.respond(3,200,history([],otherOwner));
 assert.doesNotMatch(h.text(),/alice-private-client/);assert.notEqual(value(h,'列順'),'alice_private_column');assert.notEqual(value(h,'取引・入金の照合番号'),'alice-private-payment');
});
void test('malformed ownerless history cannot keep previous private rows',async()=>{
 const h=harness();await h.ready([job('alice-private-job')]);h.button('再読込').props.onClick();await h.respond(1,200,{});
 assert.doesNotMatch(h.text(),/alice-private-job/);
});
void test('partial quote success cannot release the uncertain quote identity',async()=>{
 const h=harness();await h.ready();const request=await quote(h);const id=request.options.body.get('id');
 await h.respond(2,201,{job:{id,revision:0}});assert.equal(h.pending(),true);assert.equal(h.button('¥3,000の見積り').props.disabled,true);
});
void test('partial completed quote success cannot crash the view',async()=>{
 const h=harness();await h.ready();const request=await quote(h);const id=request.options.body.get('id');
 await assert.doesNotReject(()=>h.respond(2,201,{job:{id,revision:0,status:'completed'}}));assert.equal(h.pending(),true);
});
void test('different owner cannot release original pending identity',async()=>{
 const h=harness();await h.ready();const request=await quote(h);request.reject(new TypeError('response lost'));await h.settle();
 h.button('保存先の接続を確認').props.onClick();await h.respond(3,200,history([],otherOwner));
 const release=h.button('保留を解除（入力は保持）');release.props.onClick();h.render();assert.equal(h.pending(),true);
});
void test('new owner cannot submit old unsent file and specification',async()=>{
 const h=harness();await h.ready();h.select('alice-private-client.csv');h.change('列順','alice_private_column');
 h.button('再読込').props.onClick();await h.respond(1,200,history([],otherOwner));
 assert.equal(h.button('¥3,000の見積り').props.disabled,true);
});
void test('stale pending input event cannot mutate retained file payload sent on retry',async()=>{
 const h=harness();await h.ready();h.select('alice-private-client.csv');h.change('列順','alice_private_column');
 const staleField=nodes(h.nodes().find(n=>n.type==='label'&&text(n).includes('列順'))).find(n=>n.type==='input').props.onChange;
 h.button('¥3,000の見積り').props.onClick();await h.respond(1,200,history());const first=h.requests[2];first.reject(new TypeError('response lost'));await h.settle();
 staleField({target:{value:'changed'}});h.render();h.button('同じ見積りの結果を確認').props.onClick();await h.respond(3,200,history());
 assert.equal(h.requests[4].options.body.get('specification'),first.options.body.get('specification'));
 assert.equal(h.requests[4].options.body.get('file').name,'alice-private-client.csv');
});
void test('unsent file and conditions must protect navigation before a POST exists',async()=>{
 const h=harness();await h.ready();assert.equal(h.navigation(),false);h.select('alice-private-client.csv');h.change('列順','alice_private_column');assert.equal(h.navigation(),true);
});
void test('new owner must not upload bytes and conditions selected by the previous owner',async()=>{
 const h=harness();await h.ready();h.select('alice-private-client.csv');h.change('列順','alice_private_column');
 h.button('再読込').props.onClick();await h.respond(1,200,history([],otherOwner));
 h.button('¥3,000の見積り').props.onClick();
 if (h.requests[2]) await h.respond(2,200,history([],otherOwner));
 const post=h.requests.find(request=>request.options.method==='POST');
 assert.equal(post,undefined,'old owner private file must not be offered for upload under the new owner binding');
});

void test('hidden draft and pending operation return only to their original owner unchanged', async () => {
  const h = harness(); await h.ready(); h.select('alice-secret.csv'); h.change('列順', 'alice_column');
  h.change('取引・入金の照合番号', 'alice-reference');
  const staleInput = nodes(h.nodes().find(node => node.type === 'label' && text(node).includes('列順'))).find(node => node.type === 'input').props.onChange;
  h.button('¥3,000の見積り').props.onClick(); await h.respond(1, 200, history());
  const first = h.requests[2]; await h.respond(2, 401, { error: 'signin' });
  assert.doesNotMatch(h.text(), /alice-secret/); assert.equal(value(h, '列順'), '');
  h.button('保存先の接続を確認').props.onClick(); await h.respond(3, 200, history([], otherOwner));
  staleInput({ target: { value: 'bob-column' } }); h.render();
  assert.equal(value(h, '列順'), ''); assert.equal(value(h, '取引・入金の照合番号'), '');
  const postsBefore = h.requests.filter(request => request.options.method === 'POST').length;
  h.button('同じ見積りの結果を確認').props.onClick(); await h.respond(4, 200, history([], otherOwner));
  assert.equal(h.requests.filter(request => request.options.method === 'POST').length, postsBefore);
  h.button('保存先の接続を確認').props.onClick(); await h.respond(5, 200, history());
  assert.match(h.text(), /alice-secret/); assert.equal(value(h, '列順'), 'alice_column');
  assert.equal(value(h, '取引・入金の照合番号'), 'alice-reference');
  h.button('同じ見積りの結果を確認').props.onClick(); await h.respond(6, 200, history());
  const retry = h.requests[7];
  for (const key of ['id', 'specification', 'sample', 'trial']) assert.equal(retry.options.body.get(key), first.options.body.get(key));
  assert.equal(retry.options.body.get('file').name, 'alice-secret.csv');
});
void test('meaningful draft guard can be explicitly cleared without deleting saved jobs', async () => {
  const h = harness(); await h.ready([job('saved')]);
  assert.equal(h.navigation(), false); h.change('列順', ''); assert.equal(h.navigation(), false);
  h.select('private.csv'); assert.equal(h.navigation(), true);
  const discard = h.button('未保存の入力を破棄').props.onClick;
  h.button('再読込').props.onClick(); await h.respond(1, 200, history([], otherOwner));
  discard(); h.render(); assert.equal(h.navigation(), true);
  h.button('入力元の接続を確認').props.onClick(); await h.respond(2, 200, history([job('saved')]));
  h.button('未保存の入力を破棄').props.onClick(); h.render();
  assert.equal(h.navigation(), false); assert.match(h.text(), /saved/);
  assert.equal(h.requests.filter(request => request.options.method === 'DELETE').length, 0);
});
void test('empty original-owner fields can be used by a new owner without retaining private input', async () => {
  const h = harness(); await h.ready(); h.change('列順', '');
  h.button('再読込').props.onClick(); await h.respond(1, 200, history([], otherOwner));
  h.select('bob.csv'); h.change('列順', 'bob_column');
  h.button('¥3,000の見積り').props.onClick(); await h.respond(2, 200, history([], otherOwner));
  assert.equal(h.requests[3].options.body.get('file').name, 'bob.csv');
  assert.equal(h.requests[3].options.headers[ownerIntent.OWNER_SCOPE_HEADER], otherOwner);
});
void test('sample intent uploads only public sample and preserves a separate raw-file draft', async () => {
  const h = harness(); await h.ready(); h.select('private-customer.csv'); h.button('サンプルを完走').props.onClick();
  await h.respond(1, 200, history()); const request = h.requests[2], id = request.options.body.get('id');
  assert.equal(request.options.body.get('file').name, 'sample.csv'); assert.equal(request.options.body.get('sample'), 'true');
  await h.respond(2, 201, { job: { ...job(id), paymentStatus: 'sample', quoteMinor: 0 } });
  await h.respond(3, 200, { job: { ...job(id, 'completed'), paymentStatus: 'sample', quoteMinor: 0 } });
  assert.equal(h.pending(), false); assert.equal(h.navigation(), true); assert.match(h.text(), /private-customer.csv/);
});
void test('malformed accepted/payment job responses cannot enter the view and reconcile without resubmission', async () => {
  for (const action of ['入金確認済みとして開始', '支払いを確認して開始']) {
    const h = harness(), saved = job('saved'); if (action.includes('支払い')) saved.quoteMinor = 5000;
    await h.ready([saved]); h.change('取引・入金の照合番号', 'reference'); h.button(action).props.onClick();
    await assert.doesNotReject(() => h.respond(1, 200, { job: { id: saved.id, revision: 1, status: 'completed' } }));
    assert.doesNotMatch(h.text(), /saved/); assert.equal(h.requests[2].options.method, undefined);
    await h.respond(2, 200, history([job('saved', 'completed')]));
    assert.match(h.text(), /検査合格・納品可能/); assert.equal(h.requests.filter(request => request.options.method === 'POST').length, 1);
  }
});
void test('processing failures and failed independent validation have distinct labels', async () => {
  for (const [code, expected] of [['PROCESSING', '処理失敗・再試行待ち'], ['STORAGE', '処理失敗・再試行待ち'], ['QUALITY', '検査不合格・再試行待ち']]) {
    const h = harness(); await h.ready([{ ...job('failed', 'quality_failed'), attempt: 1, errorCode: code }]);
    assert.match(h.text(), new RegExp(expected)); assert.ok(h.button('安全に再試行（1/3）'));
  }
});
void test('CSV read-model validation rejects missing fields and malformed field types', () => {
  const valid = job('valid'); assert.equal(csvView.isCsvClientJob(valid), true);
  for (const field of Object.keys(valid)) {
    const partial = { ...valid }; delete partial[field];
    assert.equal(csvView.isCsvClientJob(partial), false, `missing ${field}`);
  }
  for (const patch of [{ artifacts: {} }, { artifacts: ['unknown'] }, { attempt: -1 }, { revision: NaN }, { quoteMinor: '3000' }, { inputName: null }, { validation: [] }, { completedAt: 'today' }])
    assert.equal(csvView.isCsvClientJob({ ...valid, ...patch }), false, JSON.stringify(patch));
  assert.equal(csvView.isCsvHistory(history([valid])), true);
  assert.equal(csvView.isCsvHistory({ jobs: [valid] }), true, 'legacy ownerless data remains read-only');
  for (const invalid of [{}, { jobs: [null], ownerScope: owner }, { jobs: [], ownerScope: 'alice' }, { jobs: [], trialPayment: { available: 'yes', mode: null } }])
    assert.equal(csvView.isCsvHistory(invalid), false);
});

void test('sample retry after sign-in uses the freshly confirmed owner for its acceptance', async () => {
  const h = harness(); await h.ready(); h.button('サンプルを完走').props.onClick();
  await h.respond(1, 200, history()); const id = h.requests[2].options.body.get('id');
  await h.respond(2, 401, { error: 'signin' });
  h.button('同じ見積りの結果を確認').props.onClick(); await h.respond(3, 200, history());
  assert.equal(h.requests[4].options.body.get('id'), id);
  await h.respond(4, 201, { job: { ...job(id), paymentStatus: 'sample', quoteMinor: 0 } });
  assert.equal(h.requests[5].url, `/api/csv-jobs/${id}`);
  assert.deepEqual(JSON.parse(h.requests[5].options.body), { action: 'accept', revision: 0 });
  await h.respond(5, 200, { job: { ...job(id, 'completed'), paymentStatus: 'sample', quoteMinor: 0 } });
  assert.equal(h.pending(), false); assert.equal(h.navigation(), false);
});
void test('pending owner preflight replaces other-owner history before the result returns', async () => {
  const h = harness(); await h.ready(); const first = await quote(h);
  first.reject(new TypeError('lost response')); await h.settle();
  h.button('保存先の接続を確認').props.onClick(); await h.respond(3, 200, history([job('bob-private-row')], otherOwner));
  assert.match(h.text(), /bob-private-row/);
  h.button('同じ見積りの結果を確認').props.onClick(); await h.respond(4, 200, history([job('alice-row')]));
  assert.doesNotMatch(h.text(), /bob-private-row/); assert.match(h.text(), /alice-row/);
  assert.equal(h.requests[5].options.body.get('id'), first.options.body.get('id'));
});

void test('failed retry owner preflight cannot retire an already uncertain quote ID',async()=>{
  for(const status of [400,404,409,413,415]){
    const h=harness();await h.ready();h.change('列順', 'private-column');const original=await quote(h);
    original.reject(new TypeError('server committed but reply was lost'));await h.settle();
    h.button('同じ見積りの結果を確認').props.onClick();
    await h.respond(3,status,{error:'owner/history preflight temporarily unavailable',code:'PREFLIGHT_UNAVAILABLE'});
    assert.equal(h.pending(),true,`GET ${status} cannot prove the earlier POST did not commit`);
    assert.equal(value(h, '列順'), '');
    assert.doesNotMatch(h.text(), /customer\.csv/);
    assert.equal(h.button('保留を解除（入力は保持）').props.disabled, true);
    h.button('同じ見積りの結果を確認').props.onClick();await h.respond(4,200,history());
    assert.equal(h.requests[5].options.body.get('id'),original.options.body.get('id'));
  }
});

void test('explicit draft discard is a status message without a false connection failure', async () => {
  const h = harness(); await h.ready([job('saved-status')]); h.select('private.csv');
  h.button('未保存の入力を破棄').props.onClick(); h.render();
  const status = h.nodes().find(node => node.type === 'output');
  assert.match(text(status), /入力を破棄しました/);
  assert.equal(h.nodes().some(node => node.props?.role === 'alert'), false);
  assert.doesNotMatch(h.text(), /通信を確認して、履歴を再確認/);
  assert.equal(h.navigation(), false); assert.match(h.text(), /saved-status/);
});
void test('same-owner unknown quote offers recovery without claiming sign-in is required', async () => {
  const h = harness(); await h.ready(); const first = await quote(h);
  first.reject(new TypeError('reply lost')); await h.settle();
  const panel = h.nodes().find(node => node.props?.['aria-label'] === 'CSV見積りの保存結果の確認');
  assert.match(text(panel), /同じ受付番号で結果を確認できます/);
  assert.equal(nodes(panel).some(node => node.type === 'a' && text(node).includes('別タブで元のアカウント')), false);
  assert.equal(h.button('同じ見積りの結果を確認').props.disabled, false);
  h.button('保留を解除（入力は保持）').props.onClick(); h.render();
  assert.match(text(h.nodes().find(node => node.type === 'output')), /保留を解除しました/);
  assert.equal(h.pending(), false); assert.equal(h.navigation(), true);
});
