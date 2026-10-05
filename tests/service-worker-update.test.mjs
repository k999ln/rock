import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const source = readFileSync(resolve(import.meta.dirname, '../public/sw.js'), 'utf8');

const ownerWindow = {
  id: 'owner-window',
  type: 'window',
  url: 'https://owner.example/settings?section=updates',
};

function workerHarness(cacheNames = [], getClient = async () => ownerWindow) {
  const listeners = new Map();
  const deleted = [];
  const clientLookups = [];
  let skipWaitingCalls = 0;
  const self = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async skipWaiting() {
      skipWaitingCalls += 1;
    },
    clients: {
      async claim() {},
      async get(id) {
        clientLookups.push(id);
        return getClient(id);
      },
    },
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
  return { listeners, deleted, clientLookups, get skipWaitingCalls() { return skipWaitingCalls; } };
}

function sendMessage(harness, overrides = {}) {
  /** @type {Promise<void> | undefined} */
  let work;
  harness.listeners.get('message')({
    origin: 'https://owner.example',
    source: ownerWindow,
    data: { type: 'ROCKSTAROS_ACTIVATE_UPDATE' },
    ...overrides,
    waitUntil(value) {
      assert.ok(value instanceof Promise);
      work = value;
    },
  });
  return work;
}

void test('a waiting worker activates only for an explicit update from a same-origin window', async () => {
  const harness = workerHarness();
  assert.equal(harness.listeners.has('install'), false);
  const unrelated = sendMessage(harness, { data: { type: 'UNRELATED' } });
  assert.equal(harness.skipWaitingCalls, 0);
  assert.equal(unrelated, undefined);
  assert.deepEqual(harness.clientLookups, []);

  // No controller property: the page can still be controlled by the old worker.
  const work = sendMessage(harness);
  assert.ok(work instanceof Promise);
  assert.equal(harness.skipWaitingCalls, 0);
  await work;
  assert.deepEqual(harness.clientLookups, [ownerWindow.id]);
  assert.equal(harness.skipWaitingCalls, 1);
});

void test('foreign, opaque and missing message origins never reach client lookup or activation', async () => {
  for (const origin of [
    undefined,
    null,
    '',
    'null',
    'https://outside.example',
    'http://owner.example',
    'https://owner.example:8443',
    'https://sub.owner.example',
    'https://owner.example.attacker.example',
    'https://owner.example@attacker.example',
  ]) {
    const harness = workerHarness();
    assert.equal(sendMessage(harness, { origin }), undefined, String(origin));
    assert.deepEqual(harness.clientLookups, [], String(origin));
    assert.equal(harness.skipWaitingCalls, 0, String(origin));
  }
});

void test('messages without a window Client sender cannot activate an update', async () => {
  for (const sender of [
    undefined,
    null,
    {},
    { type: 'worker', id: ownerWindow.id },
    { type: 'sharedworker', id: ownerWindow.id },
    { postMessage() {} },
    { type: 'window' },
    { type: 'window', id: '' },
    { type: 'window', id: 1 },
  ]) {
    const harness = workerHarness();
    assert.equal(sendMessage(harness, { source: sender }), undefined);
    assert.deepEqual(harness.clientLookups, []);
    assert.equal(harness.skipWaitingCalls, 0);
  }
});

void test('a sender must still resolve to a same-origin window at activation time', async () => {
  for (const client of [
    undefined,
    null,
    { ...ownerWindow, type: 'worker' },
    { ...ownerWindow, url: 'https://outside.example' },
    { ...ownerWindow, url: 'http://owner.example' },
    { ...ownerWindow, url: 'https://owner.example:8443' },
    { ...ownerWindow, url: 'https://owner.example@attacker.example' },
    { ...ownerWindow, url: 'data:text/html,closed' },
    { ...ownerWindow, url: '/settings' },
    { ...ownerWindow, url: undefined },
  ]) {
    const harness = workerHarness([], async () => client);
    await sendMessage(harness);
    assert.deepEqual(harness.clientLookups, [ownerWindow.id]);
    assert.equal(harness.skipWaitingCalls, 0, client?.url);
  }
});

void test('client lookup failure fails closed without rejecting the event lifetime promise', async () => {
  const harness = workerHarness([], async () => { throw new Error('client unavailable'); });
  await assert.doesNotReject(sendMessage(harness));
  assert.equal(harness.skipWaitingCalls, 0);
});

void test('a closed sender cannot authorize activation using an origin supplied inside the payload', async () => {
  const harness = workerHarness([], async () => undefined);
  await sendMessage(harness, {
    data: {
      type: 'ROCKSTAROS_ACTIVATE_UPDATE',
      origin: 'https://owner.example',
      source: ownerWindow,
    },
  });
  assert.equal(harness.skipWaitingCalls, 0);
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
