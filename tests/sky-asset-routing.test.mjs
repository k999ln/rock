import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const policy = JSON.parse(readFileSync(new URL('../data/web-security-policy.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../services/sky-web/domain-router.mjs', import.meta.url), 'utf8');
const stager = readFileSync(new URL('../scripts/stage-sky-domain-router.mjs', import.meta.url), 'utf8');
const js = 'export const fixture = true;\n';

async function assetFixture(staged) {
  const directory = mkdtempSync(join(tmpdir(), 'rock-assets-security-'));
  for (const path of ['scripts', 'services/sky-web', 'dist/server', 'dist/client/_next/static']) mkdirSync(join(directory, path), { recursive: true });
  const server = join(directory, 'dist/server');
  writeFileSync(join(directory, 'scripts/stage-sky-domain-router.mjs'), stager);
  writeFileSync(join(directory, 'services/sky-web/domain-router.mjs'), source);
  writeFileSync(join(directory, 'dist/client/_next/static/fixture.js'), js);
  writeFileSync(join(directory, 'dist/client/sw.js'), '/* asset-first stale service worker */');
  // Intentionally no _headers file: responses must actually cross the wrapper.
  assert.throws(() => readFileSync(join(directory, 'dist/client/_headers')), /ENOENT/);
  writeFileSync(join(server, 'wrangler.json'), JSON.stringify({ main: 'index.js', assets: { directory: '../client', binding: 'ASSETS', run_worker_first: false } }));
  const app = `export default { async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/_next/static/')) return env.ASSETS.fetch(request);
    if (path.startsWith('/api/')) return Response.json({error:'unauthorized'}, {status:401, headers:{'cache-control':'private, no-store'}});
    return new Response('app fixture', {headers:{'cache-control':'no-store'}});
  }};`;
  writeFileSync(join(server, 'index.js'), app);
  if (staged) {
    const result = spawnSync(process.execPath, ['scripts/stage-sky-domain-router.mjs'], { cwd: directory, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
  } else {
    writeFileSync(join(server, 'vinext.js'), app);
    writeFileSync(join(server, 'domain-router.mjs'), source);
    writeFileSync(join(server, 'index.js'), "import app from './vinext.js'; import {withMiniSite} from './domain-router.mjs'; export default withMiniSite(app);");
  }
  const config = JSON.parse(readFileSync(join(server, 'wrangler.json'), 'utf8'));
  let worker;
  try {
    worker = new Miniflare(convertV4MiniflareOptions({
      name: 'rock-asset-policy-test', rootPath: server, modulesRoot: server,
      modules: ['index.js', 'vinext.js', 'domain-router.mjs'].map(path => ({type:'ESModule', path:join(server,path)})),
      compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'],
      assets: {...config.assets, directory: resolve(server, config.assets.directory), routerConfig:{has_user_worker:true}},
      host: '127.0.0.1', port: 0,
    }));
    await worker.ready;
    return { worker, config, async close() { await worker.dispose(); rmSync(directory, {recursive:true,force:true}); } };
  } catch (error) { await worker?.dispose(); rmSync(directory, {recursive:true,force:true}); throw error; }
}

void test('asset-first delivery really bypasses the security wrapper without _headers', async t => {
  const f = await assetFixture(false); t.after(() => f.close());
  const asset = await f.worker.dispatchFetch('https://avoado.si/_next/static/fixture.js');
  assert.equal(asset.status, 200); assert.equal(await asset.text(), js);
  for (const key of Object.keys(policy.universalHeaders)) assert.equal(asset.headers.get(key), null, key);
  const sw = await f.worker.dispatchFetch('https://avoado.si/sw.js');
  assert.match(await sw.text(), /asset-first stale service worker/);
  assert.equal(sw.headers.get('Service-Worker-Allowed'), null);
  const api = await f.worker.dispatchFetch('https://avoado.si/api/eve/history');
  assert.equal(api.status, 401);
  for (const [key,value] of Object.entries(policy.universalHeaders)) assert.equal(api.headers.get(key), value, key);
  assert.equal(api.headers.get('cache-control'), 'private, no-store');
});

void test('staged Worker-first delivery protects assets, redirects, canonical SW and API denial through real asset routing', async t => {
  const f = await assetFixture(true); t.after(() => f.close());
  const check = response => { for (const [key,value] of Object.entries(policy.universalHeaders)) assert.equal(response.headers.get(key), value, key); return response; };
  const asset = check(await f.worker.dispatchFetch('https://avoado.si/_next/static/fixture.js'));
  assert.equal(asset.status, 200); assert.equal(await asset.text(), js);
  assert.equal(asset.headers.get('cache-control'), policy.routeHeaders['/_next/static/*']['Cache-Control']);
  const etag = asset.headers.get('etag'); assert.ok(etag);
  const head = check(await f.worker.dispatchFetch('https://avoado.si/_next/static/fixture.js', {method:'HEAD'}));
  assert.equal(head.status, 200); assert.equal(await head.text(), ''); assert.equal(head.headers.get('etag'), etag);
  const notModified = check(await f.worker.dispatchFetch('https://avoado.si/_next/static/fixture.js', {headers:{'if-none-match':etag}}));
  assert.equal(notModified.status, 304); assert.equal(await notModified.text(), '');
  const missing = check(await f.worker.dispatchFetch('https://avoado.si/_next/static/missing.js'));
  assert.equal(missing.status, 404);
  const redirect = check(await f.worker.dispatchFetch('https://avoado.si/sky', {redirect:'manual'}));
  assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), 'https://avoado.si/os/sky');
  const sw = check(await f.worker.dispatchFetch('https://avoado.si/sw.js'));
  assert.equal(sw.status, 200); assert.match(await sw.text(), /skipWaiting/);
  assert.equal(sw.headers.get('Service-Worker-Allowed'), '/');
  assert.equal(sw.headers.get('cache-control'), 'no-cache, no-store, must-revalidate');
  const api = check(await f.worker.dispatchFetch('https://avoado.si/api/eve/history'));
  assert.equal(api.status, 401); assert.equal(api.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await api.json(), {error:'unauthorized'});
});
