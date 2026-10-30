import assert from 'node:assert/strict';
import test from 'node:test';
import {
  routesToSky,
  withMiniSite,
} from '../services/sky-web/domain-router.mjs';

void test('legacy install roots stay on the service worker without proxying URL inputs to Mini', async () => {
  const native = [];
  const upstream = [];
  const env = {};
  const context = {};
  const app = withMiniSite({ fetch(request, receivedEnv, receivedContext) {
    assert.equal(receivedEnv, env);
    assert.equal(receivedContext, context);
    native.push(request);
    return new Response('native-install-entry');
  } }, request => {
    upstream.push(request);
    return new Response('mini-page');
  });
  for (const method of ['GET', 'HEAD']) {
    for (const path of ['/install', '/install/']) {
      assert.equal(routesToSky(path), true);
      const request = new Request(`https://avoado.si${path}?returnTo=https%3A%2F%2Foutside.invalid&token=synthetic-fixture`, { method });
      assert.equal(await (await app.fetch(request, env, context)).text(), 'native-install-entry');
      assert.equal(native.at(-1), request);
    }
  }
  assert.equal(upstream.length, 0);
  for (const path of ['/installation', '/install-extra', '/install.js', '/install/guide']) {
    assert.equal(routesToSky(path), false);
    assert.equal(await (await app.fetch(new Request(`https://avoado.si${path}`), env, context)).text(), 'mini-page');
  }
  assert.equal(native.length, 4);
  assert.equal(upstream.length, 4);
});

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

void test('MATOU public aliases redirect temporarily without capturing adjacent or mutable paths', async () => {
  let skyCalls = 0;
  let miniCalls = 0;
  const app = withMiniSite(
    { fetch: async () => { skyCalls++; return new Response('sky'); } },
    async () => { miniCalls++; return new Response('mini'); },
  );

  for (const [path, destination] of [
    ['/MATOU', '/'],
    ['/MATOU/', '/'],
    ['/MATOU/giving', '/giving'],
    ['/MATOU/giving/', '/giving/'],
    ['/MATOU/story', '/story'],
    ['/MATOU/story/', '/story/'],
  ]) {
    for (const method of ['GET', 'HEAD']) {
      const response = await app.fetch(new Request(`https://avoado.si${path}?source=outreach`, { method }));
      assert.equal(response.status, 302, `${method} ${path}`);
      assert.equal(
        response.headers.get('location'),
        `https://matou-kimono-closet.noellesugar1.chatgpt.site${destination}?source=outreach`,
      );
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }

  assert.equal(skyCalls, 0);
  assert.equal(miniCalls, 0);

  const adjacent = await app.fetch(new Request('https://avoado.si/MATOUx'));
  assert.equal(await adjacent.text(), 'mini');
  const privatePath = await app.fetch(new Request('https://avoado.si/MATOU/api/session'));
  assert.equal(await privatePath.text(), 'mini');
  const mutation = await app.fetch(new Request('https://avoado.si/MATOU', {
    method: 'POST',
    headers: { origin: 'https://avoado.si' },
    body: '{}',
  }));
  assert.equal(await mutation.text(), 'mini');
  assert.equal(miniCalls, 3);
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

  for (const path of [
    '/api/jennifer/access',
    '/api/jennifer/passkeys/register',
    '/api/amc',
    '/api/jobs',
    '/api/work-jobs',
    '/api/sky/a2a-delegations',
  ]) {
    const response = await app.fetch(new Request(`https://columbia.avoado.si${path}`, {
      method: path.endsWith('/register') ? 'POST' : 'GET',
      ...(path.endsWith('/register') ? {
        headers: { origin: 'https://columbia.avoado.si' },
        body: '{}',
      } : {}),
    }));
    assert.equal(response.status, 409, path);
    assert.deepEqual(await response.json(), {
      error: 'canonical_origin_required',
      canonicalOrigin: 'avoado.si',
      path,
    });
  }
  assert.deepEqual(seen, ['/', '/sky/campus/columbia', '/sky/tools/mr-citations']);

  const old = await app.fetch(
    new Request('https://columbia.avoado.si/sky/outputs?source=nfc'),
  );
  assert.equal(old.status, 308);
  assert.equal(
    old.headers.get('location'),
    'https://columbia.avoado.si/os/sky/outputs?source=nfc',
  );
});

void test('generated Sites hosts cannot become a second Jennifer origin', async () => {
  let skyCalls = 0;
  const app = withMiniSite({
    fetch: () => {
      skyCalls++;
      return new Response('sky');
    },
  });
  const chat = await app.fetch(new Request(
    'https://rockstaros-kaiya.noellesugar1.chatgpt.site/chat?thread=fixture',
  ));
  assert.equal(chat.status, 307);
  assert.equal(chat.headers.get('location'), 'https://avoado.si/chat?thread=fixture');

  for (const path of ['/api/jennifer/access', '/api/amc', '/api/work-jobs']) {
    const response = await app.fetch(new Request(
      `https://rockstaros-kaiya.noellesugar1.chatgpt.site${path}`,
    ));
    assert.equal(response.status, 409, path);
  }
  assert.equal(skyCalls, 0);
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
