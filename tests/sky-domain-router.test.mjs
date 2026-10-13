import assert from 'node:assert/strict';
import test from 'node:test';
import { routesToSky, withMiniSite } from '../services/sky-web/domain-router.mjs';

void test('Sky, assets and APIs stay native while Mini keeps its home and preorder paths', () => {
  for (const path of ['/sky', '/sky/outputs', '/fitness', '/_next/static/chunk.js', '/api/work-jobs'])
    assert.equal(routesToSky(path), true, path);
  for (const path of ['/', '/preorder/', '/_astro/main.css', '/api/preorders/checkout', '/api/admin/preorders'])
    assert.equal(routesToSky(path), false, path);
});

void test('Mini proxy preserves the browser hostname and does not forward Sky identity', async () => {
  let forwarded;
  const app = withMiniSite({ fetch: () => new Response('sky') }, async (request) => {
    forwarded = request;
    return new Response(null, { status: 302, headers: { location: '/preorder/confirm/', 'set-cookie': 'private=1' } });
  });
  const response = await app.fetch(new Request('https://avoado.si/preorder/?ref=sky', {
    headers: { cookie: 'session=private', 'oai-authenticated-user-id': 'owner' },
  }));
  assert.equal(forwarded.url, 'https://avocadomini.noellesugar1.chatgpt.site/preorder/?ref=sky');
  assert.equal(forwarded.headers.has('cookie'), false);
  assert.equal(forwarded.headers.has('oai-authenticated-user-id'), false);
  assert.equal(response.headers.get('location'), 'https://avoado.si/preorder/confirm/');
  assert.equal(response.headers.has('set-cookie'), false);
});

void test('cross-origin Mini mutation is rejected before upstream dispatch', async () => {
  let calls = 0;
  const app = withMiniSite({ fetch: () => new Response('sky') }, async () => { calls++; return new Response('mini'); });
  const response = await app.fetch(new Request('https://avoado.si/api/preorders/checkout', {
    method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}',
  }));
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});
