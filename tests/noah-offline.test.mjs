import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildNoahOffline } from '../scripts/build-noah-offline.mjs';
import { stageSecureAssets } from '../scripts/stage-secure-assets.mjs';
import { withAssetResponses } from '../services/sky-web/asset-responses.mjs';
import { withMiniSite } from '../services/sky-web/domain-router.mjs';

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

void test('the production asset layer serves the self-contained Noah game and its worker', async (fixture) => {
  const html = await buildNoahOffline();
  assert.match(html, /id="noah-offline"/);
  assert.match(html, /data:font\/woff2;base64,/);
  assert.match(html, /<script>/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=|<link\b[^>]*\bhref=|url\(["']?\/fonts\//);

  const root = await mkdtemp(join(tmpdir(), 'noah-offline-assets-'));
  fixture.after(() => rm(root, { recursive: true, force: true }));
  const client = join(root, 'dist/client');
  const server = join(root, 'dist/server');
  const sky = join(root, 'services/sky-web');
  await Promise.all([client, server, sky].map(directory => mkdir(directory, { recursive: true })));
  const workerSource = await readFile(new URL('../scripts/noah-offline-worker.js', import.meta.url), 'utf8');
  await Promise.all([
    writeFile(join(client, 'noah-offline.html'), html),
    writeFile(join(client, 'noah-sw.js'), workerSource),
    writeFile(join(server, 'index.js'), 'export default { fetch() {} };'),
    copyFile(new URL('../services/sky-web/asset-responses.mjs', import.meta.url), join(sky, 'asset-responses.mjs')),
  ]);
  await stageSecureAssets(root);
  const entries = JSON.parse(await readFile(join(server, 'asset-map.json'), 'utf8'));
  const app = withMiniSite({ fetch() { assert.fail('offline assets must be served before the page router'); } }, () => assert.fail('offline assets must not reach Mini'));
  const production = withAssetResponses(app, entries);
  const env = { ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname;
    return new Response(await readFile(join(client, path)), { headers: { 'content-type': 'application/javascript' } });
  } } };
  const page = await production.fetch(new Request('https://avoado.si/noah-offline.html'), env);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  assert.equal(await page.text(), html);
  const sw = await production.fetch(new Request('https://avoado.si/noah-sw.js'), env);
  assert.equal(sw.status, 200);
  assert.match(sw.headers.get('content-type'), /javascript/);
  assert.equal(await sw.text(), workerSource);
});
