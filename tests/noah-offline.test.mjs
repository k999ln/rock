import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { buildNoahOffline } from '../scripts/build-noah-offline.mjs';

function worker() {
  const handlers = new Map();
  let cached;
  const offline = new Response('Noah game');
  vm.runInNewContext(readFileSync(new URL('../scripts/noah-offline-worker.js', import.meta.url), 'utf8'), {
    Request, Response, URL,
    self: {
      location: { origin: 'https://avoado.si' },
      addEventListener: (type, handler) => handlers.set(type, handler),
    },
    caches: {
      open: async () => ({ add: async (request) => { cached = request; } }),
      match: async (path) => path === new URL(cached.url).pathname ? offline.clone() : undefined,
    },
    fetch: async () => { throw new TypeError('Network unavailable'); },
  });
  return { handlers, cached: () => cached };
}

void test('Noah restores the public game offline without storing session, RSC or page responses', async () => {
  const { handlers, cached } = worker();
  /** @type {Promise<unknown>} */
  let installed;
  handlers.get('install')({ waitUntil: promise => { installed = promise; } });
  await installed;
  assert.equal(cached().url, 'https://avoado.si/noah-offline.html');
  assert.equal(cached().credentials, 'omit');

  for (const path of ['/noah', '/noah/activity?tab=work']) {
    /** @type {Promise<Response>} */
    let result;
    handlers.get('fetch')({
      request: { method: 'GET', url: 'https://avoado.si' + path, mode: 'navigate' },
      respondWith: promise => { result = promise; },
    });
    assert.equal(await (await result).text(), 'Noah game');
  }

  for (const [path, mode] of [
    ['/api/noah/session', 'same-origin'],
    ['/noah/activity?_rsc=offline', 'same-origin'],
    ['/noah-downloads/Noah-Mac.zip', 'navigate'],
    ['/sky', 'navigate'],
  ]) {
    handlers.get('fetch')({
      request: { method: 'GET', url: 'https://avoado.si' + path, mode },
      respondWith: () => assert.fail('requests outside Noah navigation are not intercepted'),
    });
  }
});

void test('the Noah offline document ships its game and font without network dependencies', async () => {
  const html = await buildNoahOffline();
  assert.match(html, /id="noah-offline"/);
  assert.match(html, /data:font\/woff2;base64,/);
  assert.match(html, /<script>/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=|<link\b[^>]*\bhref=|url\(["']?\/fonts\//);
});
