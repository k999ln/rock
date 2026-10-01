import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const source = readFileSync(resolve(import.meta.dirname, '../public/sw.js'), 'utf8');

function workerHarness(cacheNames = []) {
  const listeners = new Map();
  const deleted = [];
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
    async keys() {
      return cacheNames;
    },
    async delete(name) {
      deleted.push(name);
      return true;
    },
  };
  vm.runInNewContext(source, { self, caches, Promise, URL, Response });
  return { listeners, deleted, get skipWaitingCalls() { return skipWaitingCalls; } };
}

void test('a new worker waits until RockstarOS receives an explicit apply message', async () => {
  const harness = workerHarness();
  assert.equal(harness.listeners.has('install'), false);
  let work;
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
  const harness = workerHarness([
    'loop-app-v3',
    'rockstaros-shell-v3',
    'rockstaros-shell-v4',
    'another-product-cache',
  ]);
  let work;
  harness.listeners.get('activate')({ waitUntil(value) { work = value; } });
  await Promise.resolve(work);
  assert.deepEqual(harness.deleted.sort((left, right) => left.localeCompare(right)), [
    'loop-app-v3',
    'rockstaros-shell-v3',
  ]);
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
