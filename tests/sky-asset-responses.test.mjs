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

const filmUrl = 'https://avoado.si/noah/theater/training.mp4';
const films = { '/noah/theater/training.mp4': { storage: '/_site-assets/abc/noah/theater/training.mp4', theaterVideoBytes: 6 } };
const filmHeaders = {
  'content-type': 'video/mp4', 'content-length': '6', etag: '"v1"',
  'last-modified': 'Sun, 06 Nov 1994 08:49:37 GMT',
};
const filmWorker = (binding = request => new Response(request.method === 'HEAD' ? null : 'abcdef', { headers: filmHeaders })) =>
  withAssetResponses({}, films, binding);

void test('a theater MP4 on storage that ignores Range returns seekable byte ranges', async () => {
  const worker = filmWorker();
  for (const [range, expected, body] of [
    ['bytes=2-4', 'bytes 2-4/6', 'cde'], ['bytes=3-', 'bytes 3-5/6', 'def'],
    ['bytes=-2', 'bytes 4-5/6', 'ef'], ['bytes=0-99', 'bytes 0-5/6', 'abcdef'],
    ['bytes=-99', 'bytes 0-5/6', 'abcdef'],
  ]) {
    const result = await worker.fetch(new Request(filmUrl, { headers: { range } }));
    assert.equal(result.status, 206);
    assert.equal(result.headers.get('content-range'), expected);
    assert.equal(result.headers.get('content-length'), String(body.length));
    assert.equal(result.headers.get('content-type'), 'video/mp4');
    assert.equal(result.headers.get('accept-ranges'), 'bytes');
    assert.equal(result.headers.get('cache-control'), 'no-cache, must-revalidate');
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await result.text(), body);
  }
  for (const range of ['bytes=6-', 'bytes=-0', 'bytes=4-1']) {
    const result = await worker.fetch(new Request(filmUrl, { headers: { range } }));
    assert.equal(result.status, 416);
    assert.equal(result.headers.get('content-range'), 'bytes */6');
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(await result.text(), '');
  }
});

void test('theater playback preserves If-Range validators and full, HEAD, conditional, or upstream range responses', async () => {
  const worker = filmWorker();
  for (const [validator, status] of [
    [filmHeaders.etag, 206], [filmHeaders['last-modified'], 206],
    ['"old"', 200], ['W/"v1"', 200], ['Mon, 07 Nov 1994 08:49:37 GMT', 200],
  ]) {
    const result = await worker.fetch(new Request(filmUrl, { headers: { range: 'bytes=0-1', 'if-range': validator } }));
    assert.equal(result.status, status);
    assert.equal(await result.text(), status === 206 ? 'ab' : 'abcdef');
  }
  for (const headers of [{}, { range: 'bytes=0-0,2-2' }]) {
    const result = await worker.fetch(new Request(filmUrl, { headers }));
    assert.equal(result.status, 200);
    assert.equal(await result.text(), 'abcdef');
  }
  const head = await worker.fetch(new Request(filmUrl, { method: 'HEAD', headers: { range: 'bytes=0-1' } }));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '6');
  assert.equal(head.body, null);
  const req = new Request(filmUrl, { headers: { range: 'bytes=1-2' } });
  const cached = await filmWorker(() => new Response(null, { status: 304, headers: filmHeaders })).fetch(req);
  assert.equal(cached.status, 304);
  const partial = await filmWorker(() => new Response('bc', {
    status: 206, headers: { ...filmHeaders, 'content-range': 'bytes 1-2/6', 'content-length': '2' },
  })).fetch(req);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), 'bytes 1-2/6');
  assert.equal(await partial.text(), 'bc');
});

void test('the fallback only slices a small unencoded MP4 with a known size', async () => {
  const req = new Request(filmUrl, { headers: { range: 'bytes=1-2' } });
  for (const overrides of [
    { 'content-length': '99999999' }, { 'content-length': '' }, { 'content-type': 'text/html' },
    { 'content-encoding': 'gzip' },
  ]) {
    const worker = filmWorker(() => new Response('abcdef', { headers: { ...filmHeaders, ...overrides } }));
    const result = await worker.fetch(req);
    assert.equal(result.status, 200);
    assert.equal(await result.text(), 'abcdef');
  }
  const path = new URL(filmUrl).pathname;
  const largeVideo = { [path]: { ...films[path], theaterVideoBytes: 4 * 1024 * 1024 + 1 } };
  const largeWorker = withAssetResponses({}, largeVideo, () => new Response('untouched', { headers: { 'content-type': 'video/mp4' } }));
  const large = await largeWorker.fetch(req);
  assert.equal(large.status, 200);
  assert.equal(await large.text(), 'untouched');
});
