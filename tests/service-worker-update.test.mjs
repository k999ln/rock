import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const source = readFileSync(resolve(import.meta.dirname, '../public/sw.js'), 'utf8');

function workerHarness(cacheNames = []) {
  const listeners = new Map();
  const deleted = [];
  const added = [];
  let skipWaitingCalls = 0;
  const self = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async skipWaiting() {
      skipWaitingCalls += 1;
    },
    clients: { async claim() {} },
    location: { origin: 'https://owner.example' },
  };
  const caches = {
    async open() { return { async add(path) { added.push(path); } }; },
    async keys() {
      return cacheNames;
    },
    async delete(name) {
      deleted.push(name);
      return true;
    },
  };
  vm.runInNewContext(source, { self, caches, Promise, URL, Response });
  return { listeners, deleted, added, get skipWaitingCalls() { return skipWaitingCalls; } };
}

void test('a new worker waits until RockstarOS receives an explicit apply message', async () => {
  const harness = workerHarness();
  assert.equal(harness.listeners.has('install'), true);
  let work;
  harness.listeners.get('install')({ waitUntil(value) { work = value; } });
  await Promise.resolve(work);
  assert.deepEqual(harness.added, ['/offline.html']);
  assert.equal(harness.skipWaitingCalls, 0, 'preparing offline recovery must not apply the update');
  work = undefined;
  harness.listeners.get('message')({
    data: { type: 'UNRELATED' },
    waitUntil(value) { work = value; },
  });
  assert.equal(harness.skipWaitingCalls, 0);
  assert.equal(work, undefined);

  harness.listeners.get('message')({
    data: { type: 'ROCKSTAROS_ACTIVATE_UPDATE' },
    waitUntil(value) { work = value; },
  });
  await Promise.resolve(work);
  assert.equal(harness.skipWaitingCalls, 1);
});

void test('activation keeps only the selected shell cache and removes prior RockstarOS generations', async () => {
  const match = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8').match(/const CACHE = '([^']+)';/);
  assert.ok(match);
  const selected = match[1];
  const previous = ['loop-app-v3', 'rockstaros-shell-v1', 'rockstaros-shell-v3', 'rockstaros-shell-v4'].filter(name => name !== selected);
  const harness = workerHarness([...previous, selected, 'another-product-cache']);
  let work;
  harness.listeners.get('activate')({ waitUntil(value) { work = value; } });
  await Promise.resolve(work);
  assert.deepEqual(harness.deleted.sort((left, right) => left.localeCompare(right)), previous.sort((left, right) => left.localeCompare(right)));
  assert.ok(!harness.deleted.includes(selected));
  assert.ok(!harness.deleted.includes('another-product-cache'));
});

void test('API, sign-in/out and foreign-origin requests are never intercepted by the PWA cache', () => {
  const harness = workerHarness();
  const fetchHandler = harness.listeners.get('fetch');
  for (const url of [
    'https://owner.example/api/jobs',
    'https://owner.example/signin',
    'https://owner.example/signout',
    'https://outside.example/rockstaros',
  ]) {
    let intercepted = false;
    fetchHandler({
      request: { method: 'GET', url },
      respondWith() { intercepted = true; },
    });
    assert.equal(intercepted, false, url);
  }
});
