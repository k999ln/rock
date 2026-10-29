import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createWorkJob } from '../lib/workflow.ts';
import { formatCurrencyMinor } from '../lib/currency-format.ts';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../components/mii-work-preview.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };

function fixtureJob() {
  const job = createWorkJob({ id: randomUUID(), title: '本人の仕事', templateId: 'article',
    plan: { schemaVersion: 1, objective: '利用者が自分で決めた依頼' } });
  job.agentBinding = { schema: 'rockstaros.work-agent-binding/1', agentId: 'role-123', agentRevision: 4, requestDigest: 'a'.repeat(64) };
  return job;
}
function harness(job = fixtureJob()) {
  const owner = 'owner-v1:' + 'b'.repeat(64), slots = [], effects = [], reads = [], cancels = [], accepted = [], events = [], staged = [];
  let cursor = 0, tree, currentJob = job, currentOwner = owner, waitRead = null, valid = false, inputAvailable = true, budgetFailure = false;
  const timers = new Map(); let nextTimer = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) { const slot = { value: typeof initial === 'function' ? initial() : initial };
      slot.set = next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }; slots[i] = slot; } return [slots[i].value, slots[i].set]; },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const old = slots[i]; slots[i] = { deps };
      effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  react.useLayoutEffect = (...args) => react.useEffect(...args);
  const adapter = {
    observe(value) { valid = true; events.push({ action: 'observe', value }); },
    disconnect() { valid = false; events.push({ action: 'disconnect' }); }, close() { valid = false; events.push({ action: 'close' }); },
    createInputGuard() { return () => valid; },
    async readExisting(reference) { reads.push(reference); if (waitRead) return waitRead.promise;
      return { job: currentJob, agentBinding: 'verified', executorBinding: 'unverified',
        hardwareAccepted: false, executionAuthorized: false, cancelReconciliation: 'clear' }; },
    async readBudget() { if (budgetFailure) throw new Error('unavailable'); return { jobId: currentJob.id, jobRevision: currentJob.revision, readAt: Date.now(), budget: { currency: 'USD', budgetLimitMinor: 1000, reservedMinor: 200, settledMinor: 300, revision: 1, updatedAt: 1 } }; },
    async cancelPlan(request) { cancels.push(request); return { state: 'plan_cancelled', remoteStop: 'unconfirmed', physicalStop: 'unconfirmed' }; },
  };
  const modules = { react, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/mii-work-adapter': { createMiiWorkAdapter: () => adapter },
    '@/lib/mii-indexeddb-journal': { createMiiIndexedDbJournal: () => ({}) },
    '@/lib/currency-format': { formatCurrencyMinor } };
  const exports = {};
  runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; }, crypto: { randomUUID }, Date, setTimeout: callback => { const key = ++nextTimer; timers.set(key, callback); return key; }, clearTimeout: key => timers.delete(key) });
  function render() { cursor = 0; tree = exports.default({ job: currentJob, ownerScope: currentOwner,
    onRead: value => { accepted.push(value); currentJob = value; }, inputAvailable, onInput: input => staged.push(input) }); while (effects.length) effects.shift()(); }
  function nodes(node, out = []) { if (Array.isArray(node)) node.forEach(value => nodes(value, out));
    else if (node && typeof node === 'object') { out.push(node); nodes(node.props?.children, out); } return out; }
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) :
    Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const button = name => nodes(tree).find(value => value.type === 'button' && text(value).includes(name));
  async function flush() { for (let i = 0; i < 4; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } }
  render();
  return { staged, reads, cancels, accepted, events, button, render, flush, html: () => renderToStaticMarkup(tree),
    click(name) { const value = button(name); assert.ok(value && !value.props.disabled, name); value.props.onClick(); render(); },
    check() { const input = nodes(tree).find(value => value.type === 'input'); assert.ok(input); input.props.onChange({ target: { checked: true } }); render(); },
    type(value) { nodes(tree).find(n => n.type === 'textarea').props.onChange({ target: { value } }); render(); },
    availability(value) { inputAvailable = value; render(); },
    deferRead() { waitRead = deferred(); return waitRead; },
    budgetFailure(value) { budgetFailure = value; }, expireBudget() { for (const callback of timers.values()) callback(); timers.clear(); render(); },
    setOwner(value) { currentOwner = value; render(); }, setJob(value) { currentJob = value; render(); } };
}

void test('mii software preview shows the same objective, verified role, saved output, unverified Tool observation, cost and export', async () => {
  const job = fixtureJob();
  job.standaloneAgent = { schema: 'sky.citations.result/1', agentId: 'sky-citation-agent', inputSha256: 'c'.repeat(64),
    language: 'ja', text: '保存済みの本人成果', sourceCount: 0, warnings: [], execution: 'first-party-rules' };
  job.toolAttempts = [{ id: randomUUID(), toolName: '試用Tool', state: 'observed_unverified' }];
  job.toolObservations = [{ id: randomUUID(), toolName: '試用Tool', text: '<script>untrusted</script>', verification: 'client_observed_unverified' }];
  const h = harness(job); h.click('miiから同じ仕事を確認'); await h.flush();
  const html = h.html();
  assert.match(html, /利用者が自分で決めた依頼/); assert.match(html, /担当ID:.*role-123/);
  assert.match(html, /センサー・座標・校正や実際のmii・音声・空間表示・物理停止は確認していません/);
  assert.match(html, /保存された担当との一致:.*確認済み/); assert.match(html, /実行端末と機器の状態は未確認/);
  assert.match(html, /試用Tool.*実行成功は独立確認されていません/);
  assert.match(html, /保存済みの本人成果/); assert.match(html, /&lt;script&gt;untrusted&lt;\/script&gt;/);
  assert.match(html, /委任予算は未確認/); assert.match(html, /MCP Toolの料金や請求確定額ではありません/); assert.match(html, /Agent成果本文は含まれません/);
  assert.ok(html.includes(`/api/sky/exports/${job.id}?revision=${job.revision}`));
  assert.equal(h.reads.length, 1); assert.equal(h.reads[0].jobId, job.id); assert.equal(h.reads[0].agentRevision, 4);
  assert.deepEqual(h.cancels, []);
});

void test('pending Tool status, prior Sky and composition results, and missing costs are distinct from success', async () => {
  const job = fixtureJob();
  job.toolAttempts = [{ id: randomUUID(), toolName: '準備Tool', state: 'pending' }];
  job.skyApp = { result: { body: '既存の連携下書き' } };
  job.composition = { artifacts: { n1: { text: '既存の構成成果', status: 'needs_review' } } };
  job.freeCloud = { text: '既存の回答', state: 'unconfirmed' };
  const h = harness(job); h.click('miiから同じ仕事を確認'); await h.flush(); const html = h.html();
  assert.match(html, /試行を記録済み.*開始・終了は未確認/);
  assert.match(html, /既存の連携下書き/); assert.match(html, /既存の構成成果/); assert.match(html, /既存の回答/);
  assert.match(html, /組合せ仕事の内部成果はこの持出しの対象外/); assert.match(html, /未確認の額を0円や確定済みとして扱わず/);
});

void test('claim and cancellation states are shown without certifying remote or physical stop', async () => {
  const job = fixtureJob();
  job.status = 'cancelled';
  job.toolAttempts = [
    { id: randomUUID(), toolName: '受付Tool', state: 'claimed' },
    { id: randomUUID(), toolName: '停止Tool', state: 'stop_requested' },
    { id: randomUUID(), toolName: '取消Tool', state: 'cancelled_before_claim' },
    { id: randomUUID(), toolName: '応答Tool', state: 'observed_unverified', stopRequestedAt: '2026-10-28T10:00:00.000Z' },
  ];
  const h = harness(job); h.click('miiから同じ仕事を確認'); await h.flush(); const html = h.html();
  assert.match(html, /計画取消（実行先の停止は未確認）/);
  assert.match(html, /受付Tool.*実際の処理・停止は未確認/);
  assert.match(html, /停止Tool.*停止要求を記録しました。実行先の停止は未確認/);
  assert.match(html, /取消Tool.*開始許可前の取消を記録/);
  assert.match(html, /応答Tool.*停止要求後の応答を観測.*実行先の停止は独立確認されていません/);
  assert.equal(h.button('計画取消を依頼'), undefined);
});

void test('owner change while reading discards the old response and requires a new read', async () => {
  const job = fixtureJob(), h = harness(job), pending = h.deferRead();
  h.click('miiから同じ仕事を確認'); h.setOwner('owner-v1:' + 'd'.repeat(64));
  pending.resolve({ job, agentBinding: 'verified', executorBinding: 'unverified', cancelReconciliation: 'clear' });
  await h.flush();
  assert.equal(h.accepted.length, 0); assert.ok(!h.html().includes('利用者が自分で決めた依頼'));
  assert.equal(h.events.filter(item => item.action === 'disconnect').length, 1);
});

void test('changing selected role or job hides old data and prevents its cancellation', async () => {
  const job = fixtureJob(), h = harness(job); h.click('miiから同じ仕事を確認'); await h.flush();
  assert.match(h.html(), /利用者が自分で決めた依頼/);
  h.setJob({ ...fixtureJob(), title: '別の仕事' });
  assert.ok(!h.html().includes('利用者が自分で決めた依頼')); assert.equal(h.button('計画取消を依頼'), undefined);
  assert.equal(h.cancels.length, 0);
});

void test('returning to a previous account does not resurrect an old readback', async () => {
  const job = fixtureJob(), h = harness(job); h.click('miiから同じ仕事を確認'); await h.flush();
  h.setOwner('owner-v1:' + 'd'.repeat(64));
  h.setOwner('owner-v1:' + 'b'.repeat(64));
  h.render();
  assert.ok(!h.html().includes('利用者が自分で決めた依頼'));
  assert.equal(h.button('計画取消を依頼'), undefined);
  assert.equal(h.cancels.length, 0);
});

void test('plan cancellation is explicit and its reply leaves external and physical stop unconfirmed', async () => {
  const h = harness(); h.click('miiから同じ仕事を確認'); await h.flush();
  assert.equal(h.button('計画取消を依頼').props.disabled, true); h.check(); h.click('計画取消を依頼'); await h.flush();
  assert.equal(h.cancels.length, 1); assert.equal(h.cancels[0].confirmed, true);
  assert.match(h.html(), /実行先や物理機器が停止したかは未確認/);
});

void test('synthetic text stages the same job without bypassing approval; accepted revisions do not invalidate its fence', async () => {
  const h = harness(); h.click('miiから同じ仕事を確認'); await h.flush(); h.type('one\ntwo');
  h.click('同じ仕事のTool確認へ渡す'); assert.equal(h.staged.length, 1); const input = h.staged[0];
  assert.equal(input.text, 'one\ntwo'); assert.equal(input.isCurrent(), true); assert.equal(h.cancels.length, 0);
  const job = h.accepted[0]; input.onJob({ ...job, revision: job.revision + 1 }); h.render();
  assert.equal(input.isCurrent(), true); assert.equal(h.accepted.at(-1).revision, job.revision + 1);
  h.type('changed'); assert.equal(input.isCurrent(), false);
});

for (const button of ['追跡喪失を模擬', '取り外しを模擬', '再起動を模擬', 'scene変更を模擬']) void test(`mii ${button} requires a new explicit read and input`, async () => {
  const h = harness(); h.click('miiから同じ仕事を確認'); await h.flush(); h.type('synthetic'); h.click('同じ仕事のTool確認へ渡す');
  const old = h.staged[0]; h.click(button); assert.equal(old.isCurrent(), false);
  assert.equal(h.button('同じ仕事のTool確認へ渡す').props.disabled, true);
  h.click('miiから同じ仕事を確認'); await h.flush(); assert.equal(old.isCurrent(), false);
  h.click('同じ仕事のTool確認へ渡す'); assert.equal(h.staged[1].isCurrent(), true);
});

void test('unsupported capability, external revision and different owner invalidate staged mii text', async () => {
  const h = harness(); h.click('miiから同じ仕事を確認'); await h.flush(); h.type('synthetic'); h.click('同じ仕事のTool確認へ渡す');
  const old = h.staged[0]; h.availability(false); assert.equal(old.isCurrent(), false);
  assert.equal(h.button('同じ仕事のTool確認へ渡す').props.disabled, true);
  h.setJob({ ...h.accepted[0], revision: h.accepted[0].revision + 1 }); assert.equal(old.isCurrent(), false);
  h.setOwner('owner-v1:' + 'f'.repeat(64)); assert.equal(old.isCurrent(), false);
});

void test('budget failure then successful read removes the old error and invalidation hides the snapshot', async () => {
  const h = harness(); h.click('miiから同じ仕事を確認'); await h.flush();
  h.budgetFailure(true); h.click('委任予算を読み直す'); await h.flush(); assert.match(h.html(), /委任予算を確認できません/);
  h.budgetFailure(false); h.click('委任予算を読み直す'); await h.flush();
  assert.match(h.html(), /取得時点の委任予算/); assert.doesNotMatch(h.html(), /委任予算を確認できません/);
  h.click('追跡喪失を模擬'); assert.doesNotMatch(h.html(), /取得時点の委任予算/);
});
void test('budget snapshot expires instead of remaining visible', async () => {
  const h = harness(); h.click('miiから同じ仕事を確認'); await h.flush();
  h.click('委任予算を読み直す'); await h.flush(); assert.match(h.html(), /取得時点の委任予算/);
  h.expireBudget(); assert.doesNotMatch(h.html(), /取得時点の委任予算/); assert.match(h.html(), /委任予算は未確認/);
});
