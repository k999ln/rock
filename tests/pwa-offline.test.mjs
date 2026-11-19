import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');

function worker() {
  const handlers = new Map();
  const saved = new Map();
  const offline = new Response(readFileSync(resolve(root, 'public/offline.html')), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  const context = {
    URL,
    Response,
    Promise,
    self: {
      location: { origin: 'https://avoado.si' },
      addEventListener: (type, handler) => handlers.set(type, handler),
    },
    caches: {
      open: async () => ({ add: async (path) => saved.set(path, offline) }),
      match: async (request) => saved.get(typeof request === 'string' ? request : request.url),
    },
    fetch: async () => { throw new TypeError('Network unavailable'); },
  };
  vm.runInNewContext(readFileSync(resolve(root, 'public/sw.js'), 'utf8'), context);
  return { handlers, saved };
}

void test('PWA shows a static recovery page for an uncached navigation while offline', async () => {
  const { handlers, saved } = worker();
  /** @type {Promise<unknown>} */
  let installed;
  handlers.get('install')({ waitUntil: (promise) => { installed = promise; } });
  await installed;
  assert.ok(saved.has('/offline.html'));

  /** @type {Promise<Response>} */
  let result;
  handlers.get('fetch')({
    request: { method: 'GET', url: 'https://avoado.si/sky', mode: 'navigate' },
    respondWith: (promise) => { result = promise; },
  });
  const response = await result;
  const html = await response.text();
  assert.match(html, /仕事の状態や成果は取得できていません/);
  assert.match(html, /<form action="" method="get">/);
  assert.doesNotMatch(html, /onclick=|<script/);
});

void test('PWA leaves private API requests outside the offline shell', () => {
  const { handlers } = worker();
  let intercepted = false;
  handlers.get('fetch')({
    request: { method: 'GET', url: 'https://avoado.si/api/work-jobs', mode: 'same-origin' },
    respondWith: () => { intercepted = true; },
  });
  assert.equal(intercepted, false);
});
