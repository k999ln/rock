import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createCsvHistoryRequest } from '../lib/csv-history-request.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as csvView from '../lib/csv-job-view.ts';
import * as pendingIntent from '../lib/pending-owner-intent.ts';
import { requestUser } from '../lib/request-auth.ts';
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
const job = (id, status = 'quoted') => ({ id, status, paymentStatus: 'unpaid', inputName: 'customer.csv', inputBytes: 10, inputSha256: 'hash', inputEncoding: 'utf8', quoteMinor: 300000, currency: 'JPY', outputSha256: null, validation: null, attempt: 0, revision: 0, errorCode: null, expiresAt: Date.now() + 86400000, createdAt: Date.now(), completedAt: null, approvedAt: null, deliveryRevision: 0, revisionReason: null, specification: { renames: {}, order: [], trim: [], dedupe: { keys: [], mode: 'report_only' }, sort: [], outputEncoding: 'utf8-bom', spreadsheetSafe: true }, artifacts: [] });
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
  const slots = [], effects = [], requests = [], timers = [], copied = [];
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
    exports, Error, TypeError, File, FormData, URL, URLSearchParams, AbortSignal, AbortController, crypto, navigator: { clipboard: { writeText: async value => { copied.push(value); } } },
    window: { setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, location: { search: '', origin: 'https://local.test', assign() {} }, confirm: () => true, prompt: () => 'Synthetic cancellation' },
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
    requests, render, settle, button, respond, copied, nodes: () => nodes(tree), text: () => text(tree), pending: () => nodes(tree).some(node => node.props?.['aria-label'] === 'CSV見積りの保存結果の確認'), navigation: () => pendingNavigation, stateWrites: () => stateWrites,
    ready: async (jobs = [], scope = owner) => { await respond(0, 200, history(jobs, scope)); await respond(requests.length - 1, 200, { status: 'active', cancelAtMonth: null, monthlyFeeEnabled: false, ownerScope: scope }); },
    select(name = 'customer.csv') { nodes(tree).find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [new File(['name\nTest\n'], name)] } }); render(); },
    change(label, value) { const target = nodes(tree).find(node => node.type === 'label' && text(node).includes(label)); const field = nodes(target).find(node => ['input', 'textarea', 'select'].includes(node.type)); assert.ok(field, label); field.props.onChange({ target: { value } }); render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
const posts = h => h.requests.filter(r => r.options.method === 'POST' || r.options.method === 'DELETE');
async function confirm(h, jobs = [], scope = owner) { await h.respond(h.requests.length - 1, 200, history(jobs, scope)); }
async function quote(h) { h.select(); h.button('¥3,000の見積り').props.onClick(); await confirm(h); return h.requests.at(-1); }
async function refreshAs(h, jobs = [], scope = owner) { h.button('再読込').props.onClick(); await confirm(h, jobs, scope); await h.respond(h.requests.length - 1, 200, { status: 'active', cancelAtMonth: null, monthlyFeeEnabled: false, ownerScope: scope }); }
await test('public delivery/revision projection is accepted without reducing it to the main branch schema', () => {
  for (const status of ['quoted', 'accepted', 'processing', 'delivered', 'approved', 'revision_requested', 'canceled', 'quality_failed']) assert.ok(csvView.isCsvClientJob(job('public', status)), status);
  for (const patch of [{ deliveryRevision: null }, { specification: null }, { artifacts: {} }, { approvedAt: 'yesterday' }, { currency: 'not a currency' }]) assert.equal(csvView.isCsvClientJob({ ...job('bad'), ...patch }), false);
});
await test('same-frame quote dispatches one check and keeps one immutable quote after response loss', async () => {
  const h = harness(); await h.ready(); h.select('private.csv'); h.change('列順', 'private-column');
  const click = h.button('¥3,000の見積り').props.onClick, before = h.requests.length; click(); click(); assert.equal(h.requests.length, before + 1);
  await confirm(h); const first = h.requests.at(-1); assert.equal(first.options.headers[ownerIntent.OWNER_SCOPE_HEADER], owner);
  first.reject(new TypeError('reply lost')); await h.settle(); assert.equal(h.pending(), true);
  h.button('同じ見積りの結果を確認').props.onClick(); await confirm(h);
  const retry = h.requests.at(-1); assert.equal(retry.options.body.get('id'), first.options.body.get('id')); assert.equal(retry.options.body.get('specification'), first.options.body.get('specification')); assert.equal(await retry.options.body.get('file').text(), await first.options.body.get('file').text());
  await h.respond(h.requests.length - 1, 201, { job: job(first.options.body.get('id')) }); assert.equal(h.pending(), false);
});
await test('all owner preflight refusals retain a previously unknown quote ID; malformed success also preserves it', async () => {
  for (const status of [400, 404, 409, 413, 415, 401, 200]) {
    const h = harness(); await h.ready(); const first = await quote(h); first.reject(new TypeError('lost')); await h.settle();
    h.button('同じ見積りの結果を確認').props.onClick(); await h.respond(h.requests.length - 1, status, status === 200 ? {} : { error: 'synthetic refusal', code: 'TEST' });
    assert.equal(h.pending(), true, String(status)); assert.equal(posts(h).length, 1);
    h.button('同じ見積りの結果を確認').props.onClick(); await confirm(h); assert.equal(h.requests.at(-1).options.body.get('id'), first.options.body.get('id'));
  }
});
await test('owner switch masks File/spec/revision data, blocks captured dispatch, and original owner restores exact bytes', async () => {
  const h = harness(), revision = job('rev', 'revision_requested'); revision.revisionReason = 'private revision reason'; await h.ready([revision]);
  h.select('alice-private.csv'); h.change('列順', 'alice-private-column'); h.change('条件内修正の仕様', '{"private":"alice"}');
  const oldCreate = h.button('¥3,000の見積り').props.onClick;
  await refreshAs(h, [job('bob')], otherOwner); assert.doesNotMatch(h.text(), /alice-private|private revision reason/);
  assert.equal(h.nodes().find(n => n.type === 'input' && n.props.type === 'file').props.disabled, true);
  oldCreate(); await h.settle(); assert.equal(posts(h).length, 0);
  await refreshAs(h, [revision], owner); assert.match(h.text(), /alice-private.csv/);
  const raw = h.nodes().find(n => n.type === 'textarea' && n.props.rows === 9); assert.equal(raw.props.value, '{"private":"alice"}');
  h.button('¥3,000の見積り').props.onClick(); await confirm(h, [revision]); assert.equal(await h.requests.at(-1).options.body.get('file').text(), 'name\nTest\n');
});
await test('stale GET and cross-owner billing cannot restore private history after 401', async () => {
  const h = harness(); await h.ready([job('private-job')]);
  h.button('再読込').props.onClick(); const old = h.requests.length - 1;
  h.button('再読込').props.onClick(); await h.respond(h.requests.length - 1, 401, { error: 'signin' }); await h.respond(old, 200, history([job('private-job')]));
  assert.doesNotMatch(h.text(), /private-job/); assert.equal(h.button('サンプルを完走').props.disabled, true);
  h.button('再読込').props.onClick(); await confirm(h, [job('private-job')]);
  await h.respond(h.requests.length - 1, 200, { status: 'active', monthlyFeeEnabled: false, cancelAtMonth: null, ownerScope: otherOwner }); assert.doesNotMatch(h.text(), /private-job/);
});
await test('draft discard is owner and exact snapshot fenced and never touches saved public jobs', async () => {
  const h = harness(); await h.ready([job('saved')]); h.select('first.csv'); const old = h.button('未保存の入力を破棄').props.onClick;
  h.select('second.csv'); old(); h.render(); assert.match(h.text(), /second.csv/); assert.equal(h.navigation(), true);
  h.button('未保存の入力を破棄').props.onClick(); h.render(); assert.equal(h.navigation(), false); assert.match(h.text(), /saved/); assert.equal(posts(h).length, 0);
});
await test('public acceptance, retry, revision and cancel actions keep their exact revision and guard duplicate clicks', async () => {
  const cases = [
    ['quoted', '照合済みの入金で作業を開始', 'accept', 'paid_by_buyer'],
    ['quality_failed', '安全に再試行', 'retry', 'manual_verified'],
    ['revision_requested', '内容を確認して修正版を作成', 'apply_revision', 'paid_by_buyer'],
    ['quoted', 'この受付を取り消す', 'cancel', 'unpaid'],
  ];
  for (const [status, label, action, paymentStatus] of cases) {
    const h = harness(), j = { ...job('live', status), revision: 6, deliveryRevision: 2, paymentStatus }; await h.ready([j]);
    if (action === 'apply_revision') h.change('条件内修正の仕様', JSON.stringify(j.specification));
    const click = h.button(label).props.onClick; click(); click(); await confirm(h, [j]);
    assert.equal(posts(h).length, 1, action); const request = posts(h)[0], body = JSON.parse(request.options.body);
    assert.equal(request.options.headers[ownerIntent.OWNER_SCOPE_HEADER], owner); assert.equal(body.action, action); assert.equal(body.revision, 6);
    if (action === 'apply_revision') assert.deepEqual(body.specification, j.specification);
    await h.respond(h.requests.length - 1, 200, { job: { ...j, status: 'accepted', revision: 7 } }); assert.match(h.text(), /live/);
  }
});
await test('public delivery artifacts, share creation/revocation and account controls remain reachable', async () => {
  const h = harness(), j = { ...job('delivered', 'delivered'), deliveryRevision: 2, artifacts: ['result', 'report-json'] }; await h.ready([j]);
  assert.ok(h.nodes().some(n => n.type === 'a' && n.props.href === '/api/csv-jobs/delivered/artifact/result'));
  h.button('期限付きリンク').props.onClick(); await confirm(h, [j]); const share = posts(h).at(-1); assert.deepEqual(JSON.parse(share.options.body), { action: 'create' });
  await h.respond(h.requests.length - 1, 200, { url: '/csv/delivery/synthetic-token', expiresAt: Date.now() + 10000 }); assert.equal(h.copied[0], 'https://local.test/csv/delivery/synthetic-token');
  h.button('共有リンクを無効化').props.onClick(); await confirm(h, [j]); await h.respond(h.requests.length - 1, 200, { revoked: 1 }); assert.doesNotMatch(h.text(), /有効期限:/);
  assert.ok(h.nodes().some(n => n.props?.href === '/api/csv-account/export'));
  h.button('翌JST月から停止を予約').props.onClick(); await confirm(h, [j]); const request = posts(h).at(-1); assert.equal(JSON.parse(request.options.body).action, 'cancel_next_month');
  await h.respond(h.requests.length - 1, 200, { result: { status: 'cancel_pending', cancelAtMonth: '2026-11', monthlyFeeEnabled: false }, ownerScope: owner }); assert.match(h.text(), /2026-11/);
});
await test('sample remains the fixed server route without private file payload; deletion remains DELETE', async () => {
  const h = harness(); await h.ready([job('old')]); h.select('never-send.csv'); const click = h.button('サンプルを完走').props.onClick; click(); click(); await confirm(h);
  assert.equal(posts(h).length, 1); assert.equal(posts(h)[0].url, '/api/csv-jobs/sample'); assert.equal(posts(h)[0].options.body, undefined);
  await h.respond(h.requests.length - 1, 201, { job: job('sample', 'processing') });
  h.button('ファイルと記録を今すぐ削除').props.onClick(); await confirm(h); assert.equal(posts(h).at(-1).options.method, 'DELETE');
  await h.respond(h.requests.length - 1, 204, null); assert.doesNotMatch(h.text(), /sample\b/);
});
function apiFixture(path) {
  const calls = [], exports = {};
  class CsvJobError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  const store = { CsvJobError, csvApiError: error => Response.json({ error: error.message }, { status: error.status ?? (error.message === 'UNAUTHORIZED' ? 401 : error.message === 'ORIGIN' ? 403 : 500) }) };
  for (const name of ['listCsvJobs','createCsvJob','createCsvSampleJob','acceptCsvJob','retryCsvJob','applyCsvRevision','actOnCsvDelivery','deleteCsvJob','createCsvDeliveryLink','revokeCsvDeliveryLinks']) store[name] = async (...args) => { calls.push([name, ...args]); return name === 'listCsvJobs' ? [] : name === 'createCsvJob' ? job(args[1].id) : job('live'); };
  const account = { csvBillingAccountSnapshot: async user => { calls.push(['billing',user]); return { status: 'active', cancelAtMonth: null, monthlyFeeEnabled: false }; }, cancelCsvBillingAccount: async (...args) => { calls.push(['cancelBilling',...args]); return { status: 'cancel_pending', cancelAtMonth: '2026-11', monthlyFeeEnabled: false }; } };
  const modules = { '@/lib/owner-intent': ownerIntent, '@/lib/request-auth': { requestUser }, '@/lib/csv-job-store': store, '@/lib/csv-operations-store': account, '@/lib/csv-transform': { CSV_LIMITS: { bytes: 10000000 } } };
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(output, { exports, File, Response, Uint8Array, require: name => { assert.ok(modules[name], name); return modules[name]; } });
  async function call(method, { user = 'alice', scope, origin = 'https://local.test' } = {}) {
    const headers = { origin, ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(scope === undefined ? {} : { [ownerIntent.OWNER_SCOPE_HEADER]: scope }) };
    let body = JSON.stringify({ action: path.includes('csv-account') ? 'cancel_next_month' : 'accept', revision: 0, idempotencyKey: crypto.randomUUID() }); headers['content-type'] = 'application/json';
    if (path === 'app/api/csv-jobs/route.ts') {
      const form = new FormData(); form.set('id',crypto.randomUUID());form.set('file',new File(['a\n1\n'],'input.csv'));form.set('specification','{}');const encoded = new Response(form);body=await encoded.arrayBuffer();headers['content-type']=encoded.headers.get('content-type');
    }
    return exports[method](new Request('https://local.test/api/csv-jobs', { method, headers, ...(['GET','DELETE'].includes(method) ? {} : { body }) }), { params: Promise.resolve({ id: 'live' }) });
  }
  return { calls, call };
}
await test('all public CSV mutators retain real authentication/origin and reject foreign intent before any store call', async () => {
  const paths = [['app/api/csv-jobs/route.ts','POST'],['app/api/csv-jobs/[id]/route.ts','POST'],['app/api/csv-jobs/[id]/route.ts','DELETE'],['app/api/csv-jobs/[id]/delivery-link/route.ts','POST'],['app/api/csv-jobs/sample/route.ts','POST'],['app/api/csv-account/route.ts','POST']];
  const scope = await ownerIntent.ownerScopeFor('alice');
  for (const [path, method] of paths) {
    const f = apiFixture(path);
    for (const options of [{ user:'bob',scope },{scope:''},{scope:'malformed'}]) assert.equal((await f.call(method,options)).status,409,path);
    assert.equal((await f.call(method,{user:null,scope})).status,401,path);assert.equal((await f.call(method,{scope,origin:'https://foreign.test'})).status,403,path);assert.deepEqual(f.calls,[],path);
    assert.ok((await f.call(method,{scope})).ok,path);assert.ok((await f.call(method,{user:'bob'})).ok,`${path} legacy client`);assert.equal(f.calls.length,2,path);
  }
});
await test('public history and billing scopes agree with actual authenticated identity', async () => {
  for (const path of ['app/api/csv-jobs/route.ts','app/api/csv-account/route.ts']) {
    const f=apiFixture(path);for(const user of ['alice','bob']) {const response=await f.call('GET',{user});const body=await response.json();assert.equal(body.ownerScope,await ownerIntent.ownerScopeFor(user));assert.ok(path.includes('csv-account') ? csvView.isCsvBilling(body) : csvView.isCsvHistory(body));}
    assert.equal((await f.call('GET',{user:null})).status,401);
  }
});
await test('missing or malformed history owner never displays jobs or retires a retained draft', async () => {
  for (const scope of [undefined, null, '', 'not-an-owner']) {
    const h=harness();await h.ready([job('original-private-job')]);h.select('original-private-file.csv');h.change('列順','private-column');
    const oldCreate=h.button('¥3,000の見積り').props.onClick;
    h.button('再読込').props.onClick();await h.respond(h.requests.length-1,200,{jobs:[job('ownerless-private-job')],...(scope===undefined?{}:{ownerScope:scope})});
    assert.doesNotMatch(h.text(),/original-private-job|ownerless-private-job|original-private-file.csv/);
    assert.equal(h.button('サンプルを完走').props.disabled,true);assert.equal(h.navigation(),true);
    oldCreate();await h.settle();assert.equal(posts(h).length,0);
    await refreshAs(h,[job('original-private-job')]);assert.match(h.text(),/original-private-file.csv/);
    const label=h.nodes().find(n=>n.type==='label'&&text(n).includes('列順'));assert.equal(nodes(label).find(n=>n.type==='input').props.value,'private-column');
  }
});
