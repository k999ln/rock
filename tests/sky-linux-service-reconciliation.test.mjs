import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const terms = { schema: 'sky.linux-terms/1', version: 'fixture', baseMinor: 1600,
  cpuUnitMs: 1000, cpuUnitMinor: 1, includedCpuMs: 1000, monthlyCapMinor: 4000,
  graceDays: 3, retentionDays: 90, termsUrl: 'https://fixture.invalid/terms' };
function view(revision = 7, owner = 'owner-a') {
  const listing = { id: 'listing', agent: { name: 'Fixture Agent', instructions: 'Fixture instructions' },
    model: { name: 'Fixture model', license: 'MIT', bytes: 1, source: 'https://fixture.invalid/model' }, authorFeeMinor: 10 };
  return { enabled: true, terms, termsDigest: 'fixture-digest', eligibleOrders: [{ orderId: 'order-a', deviceRef: 'device-a' }],
    catalog: [listing], creatorEarnings: [], access: { canRead: true, canExport: true, canExecute: true, reason: null },
    currentMonthMaximumMinor: 1720, workspace: { revision, payload: { id: 'workspace-' + owner, ownerId: owner,
      orderId: 'order-a', deviceRef: 'device-a', terms, acceptedAt: 1, contractDigest: 'fixture',
      attachments: ['listing'], jobs: [{ id: 'fixture-job', state: 'running', reservedMinor: 120, computeMinor: 0,
        authorMinor: 0, listing, run: { text: 'PRIVATE ' + owner } }], invoices: [{ id: 'invoice', period: '2026-10',
        amountMinor: 1700, baseMinor: 1600, computeMinor: 100, authorMinor: 0, state: 'open', allocations: [] }] } } };
}
const emptyView = () => ({ ...view(), workspace: null, access: null, currentMonthMaximumMinor: null });
const ack = revision => ({ accepted: true, revision, workspace: null, access: null, reconciliation: 'refresh_required' });

// Actual TSX + actual operations-client compiled, with deterministic React hook
// scheduling and JSX tree inspection. This is a hook fixture, not a browser DOM.
function harness(visibility = 'visible') {
  const slots = [], effects = [], calls = [], events = new Map();
  let cursor = 0, dirty = false, tree, mounted = true, lateWrites = 0, randomIds = 0;
  const same = (a, b) => a && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { if (!mounted) { lateWrites++; return; }
        const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) {
      const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
  };
  const globals = { Error, TypeError, SyntaxError, Date, URL, Response, Request, TextEncoder, TextDecoder,
    AbortController, AbortSignal, crypto: { randomUUID() { randomIds++; return '12345678-1234-1234-1234-123456789012'; } },
    window: { addEventListener(name, callback) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); },
      removeEventListener(name, callback) { events.get(name)?.delete(callback); }, location: { assign() { throw Error('provider navigation forbidden'); } } },
    document: { visibilityState: visibility, addEventListener(name, callback) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); },
      removeEventListener(name, callback) { events.get(name)?.delete(callback); } },
    fetch(path, options = {}) { return new Promise((resolve, reject) => calls.push({ path, options,
      method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null, resolve, reject })); },
  };
  const operations = {};
  runInNewContext(compile(readFileSync(new URL('../lib/operations-client.ts', import.meta.url), 'utf8')),
    { ...globals, exports: operations, require: () => ({}) });
  const exports = {}, jsx = (type, props) => ({ type, props });
  const source = process.env.ESIM_ACK_TEST_BASE
    ? execFileSync('git', ['show', process.env.ESIM_ACK_TEST_BASE + ':components/sky-linux-service.tsx'], { encoding: 'utf8' })
    : readFileSync(new URL('../components/sky-linux-service.tsx', import.meta.url), 'utf8');
  runInNewContext(compile(source), { ...globals, exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'next/link') return 'a';
    if (name === './workspace-shell') return 'shell';
    if (name === './sky-feedback') return { SkyNotice: 'notice' };
    if (name === '@/lib/operations-client') return operations;
    if (name.endsWith('.css')) return {};
    throw Error('unexpected module ' + name);
  } });
  function render() { if (!mounted) return; for (let n = 0; n < 20; n++) {
    dirty = false; cursor = 0; tree = exports.default(); while (effects.length) effects.shift()(); if (!dirty) return;
  } throw Error('render did not settle'); }
  function visit(node, list) { if (!node || typeof node !== 'object') return list;
    if (Array.isArray(node)) { node.forEach(x => visit(x, list)); return list; }
    list.push(node); visit(node.props?.children, list); return list; }
  const nodes = () => visit(tree, []);
  function content(node) { if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (Array.isArray(node)) return node.map(content).join(' '); if (typeof node !== 'object') return String(node);
    return node.type === 'notice' ? node.props.message : content(node.props?.children); }
  const text = (node = tree) => content(node);
  const button = label => nodes().find(n => n.type === 'button' && text(n).includes(label));
  async function flush() { for (let i = 0; i < 5; i++) { await new Promise(r => setImmediate(r)); render(); } }
  function reply(index, data, status = 200) { assert.ok(calls[index], 'request missing at ' + index); calls[index].resolve(Response.json(data, { status })); }
  function click(label) { const node = button(label); assert.ok(node, label); node.props.onClick?.(); render(); return node; }
  function fire(name) { for (const callback of events.get(name) ?? []) callback(); render(); }
  render();
  return { calls, flush, render, reply, click, fire, button, nodes, text,
    setVisibility(value, dispatch = true) { globals.document.visibilityState = value; if (dispatch) fire('visibilitychange'); },
    get randomIds() { return randomIds; }, get lateWrites() { return lateWrites; },
    unmount() { mounted = false; slots.forEach(s => s?.cleanup?.()); } };
}
async function loaded() { const h = harness(); h.reply(0, view()); await h.flush(); return h; }
function noPrivate(h) {
  assert.doesNotMatch(h.text(), /PRIVATE owner|今月の基本料金|2026-10：|電子契約と証明を保存/);
  assert.equal(h.button('eSIMの利用権を確認して契約する'), undefined);
}

void test('saved ack then null read stays pending, hides private UI and never offers a new contract', async () => {
  const h = await loaded(); h.click('仕事を停止する'); h.reply(1, ack(8)); await h.flush();
  h.reply(2, emptyView()); await h.flush();
  noPrivate(h); assert.match(h.text(), /保存.*再確認|保存.*確認待ち/);
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
});
void test('saved ack then 500 clears old private body and leaves read-only recovery', async () => {
  const h = await loaded(); h.click('仕事を停止する'); h.reply(1, ack(8)); await h.flush();
  h.reply(2, { error: 'unavailable' }, 500); await h.flush();
  noPrivate(h); assert.match(h.text(), /確認でき|再確認/);
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
});

void test('pending ack accepts read-only refresh, rejects retained actions and recovers only a fresh matching view', async () => {
  const h = await loaded(), stop = h.button('仕事を停止する');
  const run = h.nodes().find(n => n.type === 'form' && h.text(n).includes('今回の追加料金'));
  stop.props.onClick(); h.render(); h.reply(1, ack(8)); await h.flush(); h.reply(2, emptyView()); await h.flush();
  stop.props.onClick(); run.props.onSubmit({ preventDefault() {} }); await h.flush();
  assert.equal(h.randomIds, 0); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  h.click('状態を更新'); h.reply(3, emptyView()); await h.flush(); noPrivate(h);
  h.click('状態を更新'); h.reply(4, view(7)); await h.flush(); noPrivate(h);
  h.click('状態を更新'); const fresh = view(8); fresh.workspace.payload.jobs[0].state = 'cancel_requested';
  h.reply(5, fresh); await h.flush(); assert.match(h.text(), /PRIVATE owner-a|停止の確認中/);
  assert.doesNotMatch(h.text(), /操作を保存しました/);
  stop.props.onClick(); run.props.onSubmit({ preventDefault() {} }); await h.flush();
  assert.equal(h.randomIds, 0, 'old render cannot allocate a new request after recovery');
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
});

void test('401 and 403 clear private state and fence an earlier successful reply until owner reauthentication', async t => {
  for (const status of [401, 403]) await t.test(String(status), async () => {
    const h = await loaded(); h.click('仕事を停止する'); h.reply(1, ack(8)); await h.flush();
    h.click('状態を更新'); h.reply(3, { error: 'denied' }, status); await h.flush();
    noPrivate(h); assert.match(h.text(), /閲覧権限.*サインイン/);
    h.reply(2, view(8)); await h.flush(); noPrivate(h);
    h.click('状態を更新'); h.reply(4, view(8)); await h.flush();
    assert.match(h.text(), /PRIVATE owner-a/); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  });
});

void test('observed owner change hides both bodies and rejects late former-owner replies', async () => {
  const h = await loaded(); h.click('仕事を停止する'); h.reply(1, ack(8)); await h.flush();
  h.click('状態を更新'); h.reply(3, view(9, 'owner-b')); await h.flush();
  noPrivate(h); assert.match(h.text(), /表示先が変わりました/);
  h.reply(2, view(8)); await h.flush(); noPrivate(h);
  h.click('状態を更新'); h.reply(4, view(8)); await h.flush();
  assert.match(h.text(), /PRIVATE owner-a/); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
});

void test('newer failed read wins over a late older200, and no private/error response is replayed', async () => {
  const h = await loaded(); h.click('仕事を停止する'); h.reply(1, ack(8)); await h.flush();
  h.click('状態を更新'); h.reply(3, { error: 'internal private diagnostics' }, 500); await h.flush();
  h.reply(2, view(8)); await h.flush(); noPrivate(h);
  assert.doesNotMatch(h.text(), /internal private diagnostics/);
  assert.match(h.text(), /保存版 8/); h.click('状態を更新'); h.reply(4, view(8)); await h.flush();
  assert.match(h.text(), /PRIVATE owner-a/);
});

void test('run reconciliation requires the accepted request ID as well as acknowledged owner/workspace/revision', async () => {
  const h = await loaded();
  const select = h.nodes().find(n => n.type === 'select' && n.props.value === '');
  select.props.onChange({ target: { value: 'listing' } }); h.render();
  h.nodes().find(n => n.type === 'textarea' && n.props.maxLength === 4000).props.onChange({ target: { value: 'PRIVATE new input' } }); h.render();
  const consent = h.nodes().find(n => n.type === 'input' && n.props.type === 'checkbox');
  consent.props.onChange({ target: { checked: true } }); h.render();
  const run = h.nodes().find(n => n.type === 'form' && h.text(n).includes('今回の追加料金'));
  run.props.onSubmit({ preventDefault() {} }); h.render();
  assert.equal(h.calls[1].body.action, 'run'); const requestId = h.calls[1].body.requestId;
  h.reply(1, ack(8)); await h.flush(); h.reply(2, view(9)); await h.flush(); noPrivate(h);
  h.click('状態を更新'); const fresh = view(9); fresh.workspace.payload.jobs[0].id = requestId;
  h.reply(3, fresh); await h.flush(); assert.match(h.text(), /PRIVATE owner-a/);
  assert.equal(h.randomIds, 1); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
});

void test('valid initial empty onboarding remains explicit; accepted order/device context must match fresh body', async t => {
  for (const matching of [true, false]) await t.test(matching ? 'matching' : 'different device', async () => {
    const h = harness(); h.reply(0, emptyView()); await h.flush();
    assert.ok(h.button('eSIMの利用権を確認して契約する'));
    h.nodes().find(n => n.type === 'select').props.onChange({ target: { value: 'order-a' } }); h.render();
    h.nodes().find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); h.render();
    const form = h.nodes().find(n => n.type === 'form'); form.props.onSubmit({ preventDefault() {} }); h.render();
    assert.equal(h.calls[1].body.action, 'accept'); h.reply(1, ack(0)); await h.flush();
    const fresh = view(0); if (!matching) fresh.workspace.payload.deviceRef = 'other-device';
    h.reply(2, fresh); await h.flush();
    if (matching) assert.match(h.text(), /PRIVATE owner-a/);
    else { noPrivate(h); assert.match(h.text(), /表示先が変わりました/); }
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  });
});

void test('ordinary validation400 keeps editable current flow without fabricating saved acknowledgement', async () => {
  const h = await loaded(); h.click('仕事を停止する'); h.reply(1, { error: '対象を確認してください' }, 400); await h.flush();
  noPrivate(h); h.reply(2, view()); await h.flush();
  assert.match(h.text(), /対象を確認してください/); assert.match(h.text(), /PRIVATE owner-a/);
  assert.doesNotMatch(h.text(), /保存版/); assert.equal(h.calls.length, 3); assert.ok(h.button('仕事を停止する'));
});

void test('uncertain POST500/network cannot become committed or unlock controls from an unrelated read', async t => {
  for (const mode of ['500', 'network', 'stale ack']) await t.test(mode, async () => {
    const h = await loaded(); h.click('仕事を停止する');
    if (mode === 'network') h.calls[1].reject(Error('network failed'));
    else h.reply(1, mode === 'stale ack' ? ack(6) : { error: 'unknown' }, mode === '500' ? 500 : 200);
    await h.flush(); noPrivate(h); assert.doesNotMatch(h.text(), /操作を保存しました/);
    if (mode !== 'stale ack') h.click('状態を更新');
    h.reply(2, view(9)); await h.flush(); noPrivate(h);
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  });
});

void test('connection/lifecycle boundary invalidates a pending old POST and never revives its private body', async t => {
  for (const event of ['sky-execution-access-check', 'focus', 'pageshow']) await t.test(event, async () => {
    const h = await loaded(); h.click('仕事を停止する'); h.fire(event);
    h.reply(2, view(9, 'owner-b')); await h.flush(); noPrivate(h);
    h.reply(1, ack(8)); await h.flush(); noPrivate(h);
    assert.doesNotMatch(h.text(), /保存版 8/); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  });
});

void test('newer initial owner read wins and unmount rejects all late state writes', async () => {
  const h = harness(); h.click('状態を更新'); h.reply(1, view(1, 'owner-b')); await h.flush();
  h.reply(0, view()); await h.flush(); assert.match(h.text(), /PRIVATE owner-b/); assert.doesNotMatch(h.text(), /PRIVATE owner-a/);
  const second = await loaded(); second.click('仕事を停止する'); second.unmount();
  second.reply(1, ack(8)); await second.flush(); assert.equal(second.lateWrites, 0); assert.equal(second.calls.length, 2);
});

void test('current null usage total stays unconfirmed and does not use a measured16USD fallback', async () => {
  const h = harness(), current = view(); current.currentMonthMaximumMinor = null;
  h.reply(0, current); await h.flush(); assert.match(h.text(), /現在の費用は未確認/);
  assert.doesNotMatch(h.text(), /予約上限：\s*\$16/);
});

void test('known saved ack never upgrades fresh execution access, invoice payment or job completion', async () => {
  const h = await loaded(), payment = h.button('支払い方法・請求書を開く');
  h.click('仕事を停止する'); payment.props.onClick(); h.render();
  h.reply(1, ack(8)); await h.flush(); noPrivate(h);
  assert.match(h.text(), /閲覧権限・契約の利用開始・入金・仕事の完了は確認できません/);
  const current = view(8); current.access.canExecute = false; current.access.reason = 'entitlement_expired';
  h.reply(2, current); await h.flush();
  assert.match(h.text(), /Addを停止中/); assert.match(h.text(), /未入金/); assert.match(h.text(), /実行中/);
  assert.equal(h.button('この担当に依頼する').props.disabled, true);
  assert.equal(h.calls.some(c => c.path.includes('payments')), false);
});

void test('POST401/403 and OWNER_CHANGED never restore the previous body or mark rejected work saved', async t => {
  for (const mode of [401, 403, 409]) await t.test(String(mode), async () => {
    const h = await loaded(); h.click('仕事を停止する');
    h.reply(1, { error: 'denied', ...(mode === 409 ? { code: 'OWNER_CHANGED' } : {}) }, mode); await h.flush();
    noPrivate(h); assert.doesNotMatch(h.text(), /操作を保存しました/);
    assert.match(h.text(), mode === 409 ? /表示先が変わりました/ : /閲覧権限/);
    assert.equal(h.calls.length, 2);
  });
});

void test('ordinary validation fresh read cannot resurrect former-owner body after account changed', async () => {
  const h = await loaded(); h.click('仕事を停止する'); h.reply(1, { error: 'validation' }, 400); await h.flush();
  noPrivate(h); h.reply(2, view(9, 'owner-b')); await h.flush(); noPrivate(h);
  assert.match(h.text(), /表示先が変わりました/);
});

// Original independent review counterexamples, preserved as product regressions.
void test('visibility boundary must quarantine current private body and prevent retained mutation', async () => {
  const h = await loaded(), retained = h.button('仕事を停止する');
  h.setVisibility('hidden'); retained.props.onClick(); h.render();
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 0, 'hidden retained current handler must not POST');
  noPrivate(h); h.unmount();
});
void test('visibility boundary must fence saved refresh; returning visible rechecks authority before restoring private UI', async () => {
  const h = await loaded(); h.click('仕事を停止する'); h.reply(1, ack(8)); await h.flush();
  h.setVisibility('hidden'); h.reply(2, view(8)); await h.flush(); noPrivate(h);
  h.setVisibility('visible');
  assert.equal(h.calls.filter(c => c.method === 'GET').length, 3, 'visible return needs fresh GET');
  noPrivate(h); h.reply(3, view(8)); await h.flush(); assert.match(h.text(), /PRIVATE owner-a/);
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1); h.unmount();
});

void test('hidden retained stop/run handlers are denied even before visibility event delivery', async () => {
  const h = await loaded(), stop = h.button('仕事を停止する');
  const run = h.nodes().find(n => n.type === 'form' && h.text(n).includes('今回の追加料金'));
  h.setVisibility('hidden', false); stop.props.onClick(); run.props.onSubmit({ preventDefault() {} }); h.render();
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 0); assert.equal(h.randomIds, 0); noPrivate(h);
  h.setVisibility('visible'); noPrivate(h); h.reply(1, view()); await h.flush();
  assert.match(h.text(), /PRIVATE owner-a/); h.unmount();
});
void test('hidden focus/pageshow/access-check never fetch or restore; visible current handler can act deliberately', async t => {
  for (const event of ['focus', 'pageshow', 'sky-execution-access-check']) await t.test(event, async () => {
    const h = await loaded(), stale = h.button('仕事を停止する'); h.setVisibility('hidden');
    h.fire(event); h.click('状態を更新'); noPrivate(h); assert.equal(h.calls.length, 1);
    h.setVisibility('visible'); noPrivate(h); assert.equal(h.calls.length, 2);
    h.reply(1, view()); await h.flush(); stale.props.onClick(); h.render(); assert.equal(h.calls.length, 2);
    h.click('仕事を停止する'); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
    h.reply(2, ack(8)); await h.flush(); h.reply(3, view(8)); await h.flush(); assert.match(h.text(), /PRIVATE owner-a/);
    h.unmount();
  });
});
void test('hiding an in-flight mutation preserves unknown outcome and ignores its late saved ack', async () => {
  const h = await loaded(); h.click('仕事を停止する'); h.setVisibility('hidden');
  h.reply(1, ack(8)); await h.flush(); noPrivate(h); assert.doesNotMatch(h.text(), /保存版 8/);
  h.setVisibility('visible'); h.reply(2, view(9)); await h.flush(); noPrivate(h);
  assert.match(h.text(), /保存結果を確認中/); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  h.unmount();
});
void test('initial hidden or prerender view waits for visible current authority and preserves legitimate empty onboarding', async t => {
  for (const visibility of ['hidden', 'prerender']) await t.test(visibility, async () => {
    const h = harness(visibility); assert.equal(h.calls.length, 0); noPrivate(h);
    h.setVisibility('visible'); assert.equal(h.calls.length, 1); noPrivate(h);
    h.reply(0, emptyView()); await h.flush(); assert.ok(h.button('eSIMの利用権を確認して契約する'));
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0); h.unmount();
  });
});
void test('visibility listener cleanup prevents reads or state writes after unmount', async () => {
  const h = await loaded(); h.setVisibility('hidden'); h.unmount(); h.setVisibility('visible');
  h.fire('focus'); await h.flush(); assert.equal(h.calls.length, 1); assert.equal(h.lateWrites, 0);
});
