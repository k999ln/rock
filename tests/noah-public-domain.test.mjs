import test from 'node:test';
import assert from 'node:assert/strict';
import { routesToSky, withMiniSite } from '../services/sky-web/domain-router.mjs';

void test('Noah pages and public API remain on the existing Site instead of Mini proxy', async () => {
  const seen = [];
  const app = withMiniSite({ fetch: request => { seen.push(new URL(request.url).pathname); return new Response('site'); } }, () => { throw Error('unexpected external proxy'); });
  for (const path of ['/noah', '/noah/agents/anicca', '/api/noah/public-catalog', '/noah-downloads/Noah-Mac.zip']) {
    assert.equal(routesToSky(path), true);
    assert.equal(await (await app.fetch(new Request('https://avoado.si' + path), {}, {})).text(), 'site');
  }
  assert.equal(seen.length, 4); assert.equal(routesToSky('/noah-unrelated'), false);
});
void test('only exact public shard and logo assets are delivered by the asset binding', async () => {
  let assetCalls = 0, workerCalls = 0;
  const app = withMiniSite({ fetch: () => { workerCalls++; return new Response('worker'); } });
  const env = { ASSETS: { fetch: () => { assetCalls++; return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); } } };
  const path = '/noah-research/0123456789abcdef/00.json';
  const response = await app.fetch(new Request('https://avoado.si' + path), env, {});
  assert.equal(await response.text(), '{}'); assert.ok(response.headers.get('X-Content-Type-Options'));
  await app.fetch(new Request('https://avoado.si' + path, { method: 'POST' }), env, {});
  await app.fetch(new Request('https://avoado.si/noah-research/secret.txt'), env, {});
  assert.equal(assetCalls, 1); assert.equal(workerCalls, 2);
});
