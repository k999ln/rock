import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createWorkJob, updateComposedWork } from '../lib/workflow.ts';
import * as eve from '../lib/eve-text-job.ts';
import * as client from '../lib/remote-ai-text-client.ts';
import * as currency from '../lib/currency-format.ts';
import { executeCompositionNode } from '../lib/work-composition-executor.ts';

async function job() {
  const prepared = eve.prepareEveTextJob([{ name: 'A.md', text: 'Synthetic A' }, { name: 'B.md', text: 'Synthetic B' }], 'Synthetic compare');
  const work = createWorkJob({ id: crypto.randomUUID(), title: 'Synthetic saved materials', templateId: 'composition', plan: prepared.plan });
  const result = await executeCompositionNode(work.composition, prepared.plan.nodes[0], prepared.source);
  return updateComposedWork(work, { action: 'run', id: crypto.randomUUID(), fingerprint: 'a'.repeat(64), revision: 0, stepId: 's1', source: prepared.source, result });
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function response(work, cap = null) {
  const prepared = await eve.prepareEveTextEstimate(work);
  return { estimate: { currency: 'USD', maximumChargeMinor: 5, inputTokenUpperBound: 100, outputTokenLimit: 1200,
    modelId: 'fixture-model', pricingVersion: 'fixture-1', rateCardDigest: 'a'.repeat(64), expiresAt: Date.now() + 600_000 },
    unitRates: [{ category: 'ordinary-input', rateMinorMicrosPerMillionTokens: 1000000000 },
      { category: 'output', rateMinorMicrosPerMillionTokens: 2000000000 }], rateSource: 'https://example.test/rates', cardId: 'fixture-card',
    sourceRef: prepared.sourceRef, promptDigest: prepared.promptDigest, withinUserCap: cap === null || cap >= 5,
    userCapMinor: cap, estimateOnly: true, executionAuthorized: false, providerSubmission: 'not_performed' };
}
async function harness(onRequest) {
  const slots = [], effects = [], calls = [], timers = new Map(); let timerId = 0;
  let cursor = 0, dirty = false, tree, mounted = true, lateWrites = 0;
  let props = { job: await job(), ownerScope: 'owner-a', disabled: false };
  const same = (a, b) => a && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { if (!mounted) lateWrites++; const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }];
    },
    useLayoutEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) {
      const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
  };
  const jsx = (type, props) => ({ type, props });
  const modules = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/lib/eve-text-job': eve,
    '@/lib/currency-format': currency, '@/lib/remote-ai-text-client': { ...client, remoteAiTextRequest: async (path, method, body) => {
      const call = { path, method, body }; calls.push(call); return onRequest(call, props.job);
    } } };
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../components/eve-text-estimate.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, { exports, Date,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require: name => { assert.ok(modules[name], name); return modules[name]; } });
  function render() {
    for (let n = 0; n < 20; n++) {
      cursor = 0; dirty = false; tree = exports.default(props);
      while (effects.length) effects.shift()();
      if (!dirty) return;
    }
    throw Error('render did not settle');
  }
  function nodes(node, list = []) {
    if (!node || typeof node !== 'object') return list;
    if (Array.isArray(node)) { node.forEach(n => nodes(n, list)); return list; }
    list.push(node); nodes(node.props?.children, list); return list;
  }
  function text(node) { if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node); if (Array.isArray(node)) return node.map(text).join(' '); return text(node.props?.children); }
  const input = label => nodes(tree).find(n => n.type === 'input' && n.props['aria-label'] === label);
  const button = () => nodes(tree).find(n => n.type === 'button');
  const consent = () => nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox');
  const change = (label, value) => { input(label).props.onChange({ target: { value } }); render(); };
  const agree = () => { consent().props.onChange({ target: { checked: true } }); render(); };
  const click = () => { button().props.onClick(); render(); };
  async function until(predicate) { for (let i = 0; i < 100; i++) { render(); if (predicate()) return; await new Promise(r => setTimeout(r, 2)); } throw Error('timed out'); }
  render();
  return { calls, render, button, consent, change, agree, click, text: () => text(tree), until,
    fireTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(timer => timer.fn()); render(); },
    get timerCount() { return timers.size; },
    get props() { return props; }, setProps(next) { props = { ...props, ...next }; render(); },
    unmount() { mounted = false; slots.forEach(s => s?.cleanup?.()); }, get lateWrites() { return lateWrites; } };
}

void test('actual panel restores without fetch, needs explicit choice and only displays an itemized estimate', async () => {
  const h = await harness((_call, work) => response(work));
  assert.equal(h.calls.length, 0); assert.equal(h.button().props.disabled, true);
  h.click(); await new Promise(r => setTimeout(r, 5)); assert.equal(h.calls.length, 0);
  h.agree(); h.click(); h.click(); await h.until(() => h.text().includes('最大見積'));
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].path, '/api/llm/estimate');
  assert.equal(h.calls[0].body.consent, true); assert.equal(h.calls[0].body.eveSource.jobId, h.props.job.id);
  assert.equal(h.calls[0].body.prompt, undefined); assert.equal(h.calls[0].body.system, undefined);
  assert.match(h.text(), /入力.*出力/); assert.match(h.text(), /未承認/);
  assert.doesNotMatch(h.text(), /ROCKSTAR_|pricingGate|runtimeEnv|Synthetic A|approve everything/);
});
void test('over-comparison is visible without quote, approve, reserve or text execution', async () => {
  const h = await harness(call => response(h.props.job, call.body.maximumBudgetMinor));
  h.change('見積通貨', 'USD'); h.change('見積比較上限', '0'); h.agree(); h.click();
  await h.until(() => h.text().includes('比較用上限を超えています'));
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].body.maximumBudgetMinor, 0);
  assert.equal(h.calls.some(c => /quotes|\/text$/.test(c.path)), false);
});
void test('changing inputs invalidates consent and rejects a retained old click handler', async () => {
  const h = await harness((_call, work) => response(work)); h.agree();
  const old = h.button().props.onClick; h.change('見積モデル', 'other-model'); old();
  await new Promise(r => setTimeout(r, 5)); assert.equal(h.calls.length, 0); assert.equal(h.consent().props.checked, false);
});
void test('deferred estimate is discarded on owner/job/revision/clear/cancel/disabled/input changes', async () => {
  for (const kind of ['owner', 'job', 'revision', 'clear', 'cancel', 'disabled', 'input']) {
    const wait = deferred(); const h = await harness(() => wait.promise);
    const saved = h.props.job, value = await response(saved);
    h.agree(); const old = h.button().props.onClick; h.click(); await h.until(() => h.calls.length === 1);
    if (kind === 'owner') h.setProps({ ownerScope: 'owner-b' });
    if (kind === 'job') h.setProps({ job: await job() });
    if (kind === 'revision') h.setProps({ job: { ...saved, revision: saved.revision + 1 } });
    if (kind === 'clear') h.setProps({ job: { ...saved, composition: { ...saved.composition, source: null, materialCleared: true } } });
    if (kind === 'cancel') h.setProps({ job: { ...saved, status: 'cancelled' } });
    if (kind === 'disabled') h.setProps({ disabled: true });
    if (kind === 'input') h.change('見積モデル', 'other-model');
    old(); wait.resolve(value); await new Promise(r => setTimeout(r, 5)); h.render();
    assert.equal(h.calls.length, 1, kind); assert.doesNotMatch(h.text(), /最大見積/, kind);
    assert.equal(h.consent().props.checked, false, kind);
  }
});
void test('unmount and invalid response never write a late result or retry', async () => {
  const wait = deferred(); const h = await harness(() => wait.promise), value = await response(h.props.job);
  h.agree(); h.click(); await h.until(() => h.calls.length === 1); h.unmount(); wait.resolve(value);
  await new Promise(r => setTimeout(r, 5)); assert.equal(h.lateWrites, 0); assert.equal(h.calls.length, 1);
  const invalid = await harness(async (_call, work) => ({ ...await response(work), executionAuthorized: true }));
  invalid.agree(); invalid.click(); await invalid.until(() => invalid.text().includes('見積を確認できません'));
  assert.doesNotMatch(invalid.text(), /最大見積/); assert.equal(invalid.calls.length, 1);
});
void test('expired network reply and missing/malformed expiry never enter actual panel state', async () => {
  for (const expiresAt of [undefined, NaN, Infinity, -1, 1.5, 'future', Date.now() - 1, Date.now()]) {
    const wait = deferred(), h = await harness(() => wait.promise), value = await response(h.props.job);
    value.estimate.expiresAt = expiresAt;
    h.agree(); h.click(); await h.until(() => h.calls.length === 1); wait.resolve(value);
    await h.until(() => h.text().includes('見積を確認できません'));
    assert.doesNotMatch(h.text(), /最大見積/); assert.equal(h.calls.length, 1); assert.equal(h.timerCount, 0);
    h.unmount();
  }
});
void test('estimate valid at parse but expired by actual render is withheld at the exact boundary', async t => {
  let at = Date.now();
  const clock = t.mock.method(Date, 'now', () => at);
  const expiry = at + 1000;
  // Resolve while current; advance the clock without rendering the queued state.
  const wait = deferred(), delayed = await harness(() => wait.promise), value = await response(delayed.props.job);
  value.estimate.expiresAt = expiry; delayed.agree(); delayed.click(); await delayed.until(() => delayed.calls.length === 1);
  wait.resolve(value); await new Promise(r => setTimeout(r, 5)); at = expiry; delayed.render();
  assert.doesNotMatch(delayed.text(), /最大見積/); assert.match(delayed.text(), /有効期限/);
  delayed.fireTimers(); at = expiry - 1; delayed.render(); assert.doesNotMatch(delayed.text(), /最大見積/, 'expired state cannot revive after clock rollback');
  assert.equal(delayed.calls.length, 1); delayed.unmount(); clock.mock.restore();
});
void test('display deadline clears an otherwise idle panel and never refreshes or revives an old response', async t => {
  let at = Date.now(); const clock = t.mock.method(Date, 'now', () => at);
  const h = await harness(async (_call, work) => { const value = await response(work); value.estimate.expiresAt = at + 1000; return value; });
  h.agree(); h.click(); await h.until(() => h.text().includes('最大見積'));
  assert.equal(h.timerCount, 1); h.fireTimers(); assert.match(h.text(), /最大見積/, 'early timer cannot manufacture expiry');
  at += 1000; h.fireTimers(); assert.doesNotMatch(h.text(), /最大見積/); assert.match(h.text(), /有効期限/);
  assert.equal(h.calls.length, 1); assert.equal(h.timerCount, 0);
  h.setProps({ ownerScope: 'owner-b', job: await job() }); h.fireTimers(); assert.equal(h.calls.length, 1);
  assert.equal(h.consent().props.checked, false); h.unmount(); clock.mock.restore();
});
