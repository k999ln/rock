// 「体調ノート」の端末の保存先（lib/noah-goal-health-store.ts）。保存が止まっているブラウザでも、
// 書いた物を黙って捨てず（false を返す）、その画面を開いている間は書いた物を見せる。ほかへは送らない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { NOAH_GOAL_HEALTH_STORAGE_KEY as KEY } from '../lib/noah-goal-health.ts';

let instance = 0;
async function load({ read = true, write = true, start = {} } = {}) {
  const items = new Map(Object.entries(start));
  globalThis.localStorage = {
    getItem: (key) => { if (!read) throw new Error('SecurityError'); return items.has(key) ? items.get(key) : null; },
    setItem: (key, value) => { if (!write) throw new Error('QuotaExceededError'); items.set(key, String(value)); },
    removeItem: (key) => { if (!write) throw new Error('SecurityError'); items.delete(key); },
  };
  const events = new Map();
  globalThis.window = { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name) };
  const store = await import(`../lib/noah-goal-health-store.ts?case=${++instance}`);
  return { store, items, events };
}

void test('ふつうのブラウザ: 書いた物を端末に置き、全部消すと無くなる。書くたびに画面へ知らせる', async () => {
  const { store, items } = await load();
  let told = 0;
  const stop = store.noahGoalHealthSubscribe(() => { told++; });
  assert.equal(store.noahGoalHealthSaved(), null);
  assert.equal(store.noahGoalHealthWrite('{"a":1}'), true);
  assert.equal(items.get(KEY), '{"a":1}');
  assert.equal(store.noahGoalHealthSaved(), '{"a":1}');
  assert.equal(store.noahGoalHealthWrite(null), true);
  assert.equal(items.has(KEY), false);
  assert.equal(store.noahGoalHealthSaved(), null);
  assert.equal(told, 2);
  stop();
});

void test('読めるが書けない（いっぱい）: false を返し、その後は書いた物を見せる（前の記録へ戻らない）', async () => {
  const { store, items } = await load({ write: false, start: { [KEY]: 'old' } });
  assert.equal(store.noahGoalHealthSaved(), 'old');
  assert.equal(store.noahGoalHealthWrite('new'), false);
  assert.equal(store.noahGoalHealthSaved(), 'new');
  assert.equal(items.get(KEY), 'old', '端末の物は変わらない');
  assert.equal(store.noahGoalHealthWrite('newer'), false, '続けて書いても、保存できたとは言わない');
  assert.equal(store.noahGoalHealthSaved(), 'newer');
});

void test('読めない（保存が止まっている）: 何も無い所から始め、書いた物はその画面の間だけ見せる', async () => {
  const { store } = await load({ read: false, write: false });
  assert.equal(store.noahGoalHealthSaved(), null);
  assert.equal(store.noahGoalHealthWrite('x'), false);
  assert.equal(store.noahGoalHealthSaved(), 'x');
});

void test('ほかの所へ送らない（fetch・送信の道具を使わない）', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../lib/noah-goal-health-store.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|sendBeacon|XMLHttpRequest|WebSocket|indexedDB/);
});
