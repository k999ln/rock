import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { screen } from './fixtures/noah/screen.mjs';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as readyView from '../lib/noah-ready-view.ts';

const code = ts.transpileModule(readFileSync(new URL('../lib/noah-haptics.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function setup({ unsupported = false, unavailableStorage = false } = {}) {
  const exports = {}, values = new Map(), events = new Map(), calls = [];
  let now = 1000;
  const window = {
    localStorage: {
      getItem(key) { if (unavailableStorage) throw Error('disabled'); return values.get(key) ?? null; },
      setItem(key, value) { if (unavailableStorage) throw Error('disabled'); values.set(key, value); },
    },
    addEventListener(name, callback) { events.set(name, callback); },
    removeEventListener(name, callback) { if (events.get(name) === callback) events.delete(name); },
    dispatchEvent(event) { events.get(event.type)?.(event); },
  };
  const document = { hidden: false }, navigator = { userActivation: { hasBeenActive: true } };
  if (!unsupported) navigator.vibrate = pattern => { calls.push(JSON.parse(JSON.stringify(pattern))); return true; };
  runInNewContext(code, { exports, window, document, navigator, Event, Date: { now: () => now } });
  return { api: exports, window, navigator, document, values, events, calls, advance: ms => { now += ms; } };
}

void test('tap and selection use short pulses, success is distinct, duplicate tap events are suppressed', () => {
  const h = setup();
  assert.equal(h.api.noahHaptic('tap'), true);
  assert.equal(h.api.noahHaptic('tap'), false);
  h.advance(80); assert.equal(h.api.noahHaptic('select'), true);
  assert.equal(h.api.noahHaptic('success'), true);
  assert.deepEqual(h.calls, [16, 24, [12, 45, 12]]);
});

void test('disabled, hidden, inactive, unsupported and policy-blocked environments stay silent', () => {
  const h = setup();
  h.document.hidden = true; assert.equal(h.api.noahHaptic('success'), false);
  h.document.hidden = false; h.navigator.userActivation.hasBeenActive = false;
  assert.equal(h.api.noahHaptic('tap'), false);
  h.navigator.userActivation.hasBeenActive = true; h.api.setNoahHaptics(false);
  assert.equal(h.api.noahHaptic('success'), false);
  assert.deepEqual(h.calls, [0]);
  const unsupported = setup({ unsupported: true });
  assert.equal(unsupported.api.noahHaptic('tap'), false);
  const denied = setup(); denied.navigator.vibrate = () => { throw Error('denied'); };
  assert.equal(denied.api.noahHaptic('tap'), false);
});

void test('preference persists, syncs across tabs, unsubscribes and works without storage', () => {
  const h = setup(); let updates = 0;
  const unsubscribe = h.api.subscribeNoahHaptics(() => updates++);
  h.api.setNoahHaptics(false);
  assert.equal(h.values.get(h.api.NOAH_HAPTICS_KEY), 'off');
  assert.equal(h.api.noahHapticsEnabled(), false); assert.equal(updates, 1);
  h.values.set(h.api.NOAH_HAPTICS_KEY, 'on');
  h.events.get('storage')({ key: h.api.NOAH_HAPTICS_KEY });
  assert.equal(h.api.noahHapticsEnabled(), true); assert.equal(updates, 2);
  unsubscribe(); assert.equal(h.events.size, 0);
  const privateTab = setup({ unavailableStorage: true });
  privateTab.api.setNoahHaptics(false);
  assert.equal(privateTab.api.noahHaptic('tap'), false);
  privateTab.api.setNoahHaptics(true);
  assert.equal(privateTab.api.noahHaptic('tap'), true);
});

void test('server rendering and synthetic/non-control events never request vibration', () => {
  const exports = {};
  runInNewContext(code, { exports });
  assert.equal(exports.noahHapticsEnabled(), true);
  assert.equal(exports.noahHapticsSupported(), false);
  assert.equal(exports.noahHaptic('success'), false);
  assert.equal(exports.noahControlFeedback(null, true), null);
  assert.equal(exports.noahControlFeedback({}, false), null);
});

void test('connection success feedback follows the confirmed response, never a failed connection or a render', async () => {
  for (const status of [200, 503]) {
    const pulses = [];
    const ui = screen({
      modules: { '@/lib/owner-intent': ownerIntent, '@/lib/noah-ready-view': readyView, '@/lib/noah-haptics': { noahHaptic: kind => pulses.push(kind) } },
      fetch: async ({ method }) => method === 'GET'
        ? { body: { planSha256: 'plan' } }
        : { status, body: status === 200 ? { id: 'connected-id', state: 'connected', revision: 1 } : { error: 'unavailable' } },
    });
    const page = ui.mount('components/noah-connect-button.tsx', { agentId: 'family-1', listed: true, signedIn: true, ownerScope: 'owner', connection: null, onChange() {} });
    await page.flush();
    assert.deepEqual(pulses, []);
    await page.click('接続'); await page.flush();
    assert.deepEqual(pulses, status === 200 ? ['success'] : []);
    page.render(); await page.flush();
    assert.deepEqual(pulses, status === 200 ? ['success'] : []);
  }
});
