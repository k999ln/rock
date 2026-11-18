import test from 'node:test';
import assert from 'node:assert/strict';
import { withAssetResponses } from '../services/sky-web/asset-responses.mjs';

void test('public storage fallback has a fixed origin and forwards only cache/range headers', async () => {
  const requests = [], app = {fetch: () => new Response('app')};
  const worker = withAssetResponses(app, {'/photo.png': {storage:'/_site-assets/abc/photo.png'}}, async request => {
    requests.push(request);
    return new Response('png', {headers: {'content-type':'image/png',etag:'fixture'}});
  });
  const result = await worker.fetch(new Request('https://avoado.si/photo.png?secret=private', {headers: {
    cookie:'private', authorization:'Bearer private', 'if-none-match':'fixture', range:'bytes=0-2',
  }}));
  assert.equal(result.status, 200);
  assert.equal(requests[0].url, 'https://sky-marketplace.noellesugar1.chatgpt.site/_site-assets/abc/photo.png');
  assert.deepEqual([...requests[0].headers], [['if-none-match','fixture'],['range','bytes=0-2']]);
  assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(await (await worker.fetch(new Request('https://avoado.si/photo.png', {method:'POST'}))).text(), 'app');
  assert.equal(await (await worker.fetch(new Request('https://avoado.si/toString'))).text(), 'app');
  assert.equal(requests.length, 1);
});
