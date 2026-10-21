import assert from 'node:assert/strict';
import test from 'node:test';
import {
  routesToSky,
  withMiniSite,
} from '../services/sky-web/domain-router.mjs';

void test('Sky, assets and APIs stay native while Mini keeps its home and preorder paths', () => {
  for (const path of [
    '/sky',
    '/sky/outputs',
    '/os',
    '/os/sky',
    '/fitness',
    '/manifest.webmanifest',
    '/_next/static/chunk.js',
    '/api/work-jobs',
  ])
    assert.equal(routesToSky(path), true, path);
  for (const path of [
    '/',
    '/preorder/',
    '/_astro/main.css',
    '/api/preorders/checkout',
    '/api/admin/preorders',
  ])
    assert.equal(routesToSky(path), false, path);
});

void test('claim registration stays on Sky without proxying link credentials to Mini', async () => {
  const skyRequests = [];
  const miniRequests = [];
  const env = { fixture: 'service-claim' };
  const context = { fixture: 'request-context' };
  const app = withMiniSite(
    {
      fetch: async (request, receivedEnv, receivedContext) => {
        assert.equal(receivedEnv, env);
        assert.equal(receivedContext, context);
        skyRequests.push(request);
        return new Response('sky-connect');
      },
    },
    async (request) => {
      miniRequests.push(request);
      return new Response('mini-site');
    },
  );

  const requests = [
    new Request(
      'https://avoado.si/connect?source=invitation#rockstar-claim=fixture-link-package',
      {
        headers: {
          cookie: 'rock_session_fixture=1',
          'oai-authenticated-user-id': 'fixture-owner',
        },
      },
    ),
    new Request('https://avoado.si/connect/import', {
      method: 'POST',
      headers: {
        origin: 'https://avoado.si',
        'content-type': 'application/json',
        cookie: 'rock_session_fixture=1',
      },
      body: JSON.stringify({ claimCode: 'rsk_fixture_code' }),
    }),
    new Request('https://avoado.si/connect/status', { method: 'HEAD' }),
  ];
  for (const request of requests) {
    const response = await app.fetch(request, env, context);
    assert.equal(await response.text(), 'sky-connect');
    assert.equal(
      skyRequests.at(-1),
      request,
      'Sky receives the original request, not a Mini-origin rewrite',
    );
  }
  assert.equal(
    miniRequests.length,
    0,
    'no claim link, cookie or import body reaches the Mini fetcher',
  );
  assert.equal(skyRequests.length, requests.length);
  assert.equal(skyRequests[0].headers.get('cookie'), 'rock_session_fixture=1');
  assert.equal(
    skyRequests[0].headers.get('oai-authenticated-user-id'),
    'fixture-owner',
  );
  assert.equal(skyRequests[1].headers.get('origin'), 'https://avoado.si');
  assert.equal(
    await skyRequests[1].text(),
    JSON.stringify({ claimCode: 'rsk_fixture_code' }),
  );
  assert.equal(skyRequests[2].method, 'HEAD');
  assert.equal(
    routesToSky('/connectivity'),
    false,
    'the new prefix has a path boundary',
  );
});

void test('Mini proxy preserves the browser hostname and does not forward Sky identity', async () => {
  let forwarded;
  const app = withMiniSite(
    { fetch: () => new Response('sky') },
    async (request) => {
      forwarded = request;
      return new Response(null, {
        status: 302,
        headers: { location: '/preorder/confirm/', 'set-cookie': 'private=1' },
      });
    },
  );
  const response = await app.fetch(
    new Request('https://avoado.si/preorder/?ref=sky', {
      headers: {
        cookie: 'session=private',
        'oai-authenticated-user-id': 'owner',
      },
    }),
  );
  assert.equal(
    forwarded.url,
    'https://avocadomini.noellesugar1.chatgpt.site/preorder/?ref=sky',
  );
  assert.equal(forwarded.headers.has('cookie'), false);
  assert.equal(forwarded.headers.has('oai-authenticated-user-id'), false);
  assert.equal(
    response.headers.get('location'),
    'https://avoado.si/preorder/confirm/',
  );
  assert.equal(response.headers.has('set-cookie'), false);
});

void test('cross-origin Mini mutation is rejected before upstream dispatch', async () => {
  let calls = 0;
  const app = withMiniSite({ fetch: () => new Response('sky') }, async () => {
    calls++;
    return new Response('mini');
  });
  const response = await app.fetch(
    new Request('https://avoado.si/api/preorders/checkout', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
      body: '{}',
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

void test('avoado.si keeps RockstarOS at /os and canonicalizes Sky under /os/sky', async () => {
  const seen = [];
  const app = withMiniSite(
    {
      fetch: async (request) => {
        seen.push(new URL(request.url).pathname);
        return new Response('sky');
      },
    },
    async () => new Response('mini'),
  );
  const home = await app.fetch(new Request('https://avoado.si/os'));
  assert.equal(home.status, 200);
  const sky = await app.fetch(
    new Request('https://avoado.si/os/sky/outputs?source=nfc'),
  );
  assert.equal(sky.status, 200);
  assert.deepEqual(seen, ['/os', '/sky/outputs']);
  const old = await app.fetch(
    new Request('https://avoado.si/sky/outputs?source=nfc'),
  );
  assert.equal(old.status, 308);
  assert.equal(
    old.headers.get('location'),
    'https://avoado.si/os/sky/outputs?source=nfc',
  );
});

void test('Columbia keeps its campus Home while shared Sky and work routes use the main origin', async () => {
  const seen = [];
  let miniCalls = 0;
  const app = withMiniSite(
    {
      fetch: async (request) => {
        seen.push(new URL(request.url).pathname);
        return new Response('sky');
      },
    },
    async () => {
      miniCalls++;
      return new Response('mini');
    },
  );

  const home = await app.fetch(new Request('https://columbia.avoado.si/'));
  assert.equal(home.status, 200);
  assert.equal(await home.text(), 'sky');

  const canonical = await app.fetch(
    new Request('https://columbia.avoado.si/os/sky/outputs?source=nfc'),
  );
  assert.equal(canonical.status, 307);
  assert.equal(canonical.headers.get('location'), 'https://avoado.si/os/sky/outputs?source=nfc');
  const campus = await app.fetch(new Request('https://columbia.avoado.si/os/sky/campus/columbia'));
  assert.equal(campus.status, 200);
  const card = await app.fetch(new Request('https://columbia.avoado.si/os/sky/tools/mr-citations?entry=columbia-card'));
  assert.equal(card.status, 200);
  assert.deepEqual(seen, ['/', '/sky/campus/columbia', '/sky/tools/mr-citations']);
  assert.equal(miniCalls, 0);

  for (const path of ['/os/sky', '/os/sky/marketplace', '/chat', '/zema/library']) {
    const response = await app.fetch(new Request(`https://columbia.avoado.si${path}`));
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get('location'), `https://avoado.si${path}`);
  }

  const old = await app.fetch(
    new Request('https://columbia.avoado.si/sky/outputs?source=nfc'),
  );
  assert.equal(old.status, 308);
  assert.equal(
    old.headers.get('location'),
    'https://columbia.avoado.si/os/sky/outputs?source=nfc',
  );
});

void test('OS and Sky documents point to their own install manifests', async () => {
  const app = withMiniSite({
    fetch: () =>
      new Response('<link rel="manifest" href="/manifest.webmanifest">', {
        headers: { 'content-type': 'text/html' },
      }),
  });
  const os = await app.fetch(new Request('https://avoado.si/os'));
  assert.match(await os.text(), /href="\/os\/manifest\.webmanifest"/);
  const sky = await app.fetch(new Request('https://avoado.si/os/sky'));
  assert.match(await sky.text(), /href="\/os\/sky\/manifest\.webmanifest"/);
  const campus = await app.fetch(
    new Request('https://avoado.si/os/sky/campus/nyu/hub?source=nfc'),
  );
  assert.match(
    await campus.text(),
    /href="\/os\/sky\/campus\/nyu\/manifest\.webmanifest"/,
  );
});
