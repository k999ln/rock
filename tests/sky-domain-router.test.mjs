import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  routesToSky,
  withMiniSite,
} from '../services/sky-web/domain-router.mjs';

void test('Sky assets and APIs stay native while Mini keeps preorder paths', () => {
  assert.equal(routesToSky('/company-mark.png'), true);
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

void test('retired duplicate OS pages redirect before Mini proxy and preserve the guide', async () => {
 let proxied=0;const app=withMiniSite({fetch:async()=>new Response('native-guide')},async()=>{proxied++;return new Response('mini');});
 for(const path of ['/rockstaros','/rockstaros/','/rockstaros/crowdfunding']) {const r=await app.fetch(new Request(`https://avoado.si${path}?entry=legacy`));assert.equal(r.status,308);assert.equal(r.headers.get('location'),'https://avoado.si/os?entry=legacy');}
 assert.equal(await(await app.fetch(new Request('https://avoado.si/rockstaros/guide'))).text(),'native-guide');assert.equal(proxied,0);
});

void test('main-domain root runs WebOS and preserves the existing authenticated request', async () => {
  const request = new Request('https://avoado.si/', {headers: {cookie: 'fixture-session=1'}});
  let observed;
  const app = withMiniSite({fetch: async (value) => {observed = value; return new Response('webos-home');}}, async () => {throw new Error('Root must not proxy Mini');});
  const result = await app.fetch(request, {}, {});
  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'webos-home');
  assert.equal(observed, request);
  assert.equal(observed.headers.get('cookie'), 'fixture-session=1');
});

void test('local common OS links preserve canonical Sky aliases and request ownership', async () => {
  for (const host of ['localhost:8796', '127.0.0.1:8796', '[::1]:8796']) {
    const seen = [];
    const app = withMiniSite({ fetch: async (request) => {
      seen.push(request);
      return Response.json({ path: new URL(request.url).pathname });
    } }, () => { throw new Error('Local Sky must not proxy to Mini'); });
    const response = await app.fetch(new Request(`http://${host}/os/sky/agents?source=common-nav`, {
      headers: { cookie: 'synthetic-local-session=1' },
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).path, '/sky/agents');
    assert.equal(seen[0].url, `http://${host}/sky/agents?source=common-nav`);
    assert.equal(seen[0].headers.get('cookie'), 'synthetic-local-session=1');
    const redirect = await app.fetch(new Request(`http://${host}/sky/agents?revision=2`));
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), `http://${host}/os/sky/agents?revision=2`);
    const post = new Request(`http://${host}/os/sky/agents`, { method: 'POST',
      headers: { origin: `http://${host}`, 'content-type': 'application/json' },
      body: JSON.stringify({ synthetic: true }),
    });
    await app.fetch(post);
    assert.equal(seen.at(-1).headers.get('origin'), `http://${host}`);
    assert.equal(seen.at(-1).method, 'POST');
    assert.deepEqual(await seen.at(-1).json(), { synthetic: true });
  }
});

void test('every outer OS route enforces the exact source security policy, including redirects and errors', async () => {
  const policy = JSON.parse(readFileSync(new URL('../data/web-security-policy.json', import.meta.url), 'utf8'));
  const app = withMiniSite({ fetch: request => new Response('synthetic', {
    status: new URL(request.url).searchParams.has('fail') ? 503 : 200,
    headers: { 'content-type': 'text/plain', 'cache-control': 'private, no-store' },
  }) }, () => new Response('mini', { headers: { 'content-type': 'text/html' } }));
  for (const [url, expectedStatus] of [
    ['https://avoado.si/sky', 308],
    ['https://avoado.si/rockstaros', 308],
    ['https://avoado.si/sw.js', 200],
    ['https://avoado.si/os/eve?fail=1', 503],
    ['https://avoado.si/api/eve/history', 200],
    ['https://columbia.avoado.si/api/work-jobs', 409],
    ['https://fixture.chatgpt.site/api/work-jobs', 409],
    ['https://avoado.si/preorder/', 200],
  ]) {
    const response = await app.fetch(new Request(url));
    assert.equal(response.status, expectedStatus, url);
    for (const [key, value] of Object.entries(policy.universalHeaders))
      assert.equal(response.headers.get(key), value, `${url} ${key}`);
  }
  const worker = await app.fetch(new Request('https://avoado.si/sw.js'));
  assert.equal(worker.headers.get('cache-control'), policy.routeHeaders['/sw.js']['Cache-Control']);
  assert.equal(worker.headers.get('Service-Worker-Allowed'), '/');
  const privateResponse = await app.fetch(new Request('https://avoado.si/api/eve/history'));
  assert.equal(privateResponse.headers.get('cache-control'), 'private, no-store');
});

void test('outer response protection preserves streaming bodies and private cache semantics', async () => {
  let writer;
  const stream = new ReadableStream({ start(controller) { writer = controller; } });
  const app = withMiniSite({ fetch: () => new Response(stream, { headers: {
    'content-type': 'text/event-stream', 'cache-control': 'private, no-store',
    'x-request-id': 'synthetic-stream-1', 'content-security-policy': 'unsafe-source-value',
  } }) });
  const response = await app.fetch(new Request('https://avoado.si/api/sky/stream'));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-request-id'), 'synthetic-stream-1');
  assert.equal(response.body.locked, false);
  const reader = response.body.getReader();
  const pending = reader.read();
  writer.enqueue(new TextEncoder().encode('data: synthetic\n\n'));
  assert.equal(new TextDecoder().decode((await pending).value), 'data: synthetic\n\n');
  writer.close();
  assert.equal((await reader.read()).done, true);
});

void test('public build assets use the configured asset binding and preserve content and cache metadata', async () => {
  const observed = [];
  const app = withMiniSite({ fetch: () => new Response('framework missing static', {status:404}) });
  const env = { ASSETS: { async fetch(request) {
    observed.push(request);
    return new Response(request.method === 'HEAD' ? null : 'fixture-js', {status:200, headers:{
      'content-type':'application/javascript', 'cache-control':'public, max-age=31536000, immutable', etag:'"asset-fixture"',
    }});
  } } };
  for (const method of ['GET','HEAD']) {
    const request = new Request('https://avoado.si/_next/static/chunks/fixture.js?version=1', {method,headers:{'if-none-match':'"prior"'}});
    const response = await app.fetch(request, env, {});
    assert.equal(response.status, 200);
    assert.equal(await response.text(), method === 'HEAD' ? '' : 'fixture-js');
    assert.equal(response.headers.get('etag'), '"asset-fixture"');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(response.headers.get('content-type'), 'application/javascript');
    assert.equal(observed.at(-1), request);
    assert.equal(observed.at(-1).headers.get('if-none-match'), '"prior"');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
});

void test('asset binding never becomes a generic API, method, image optimizer or Mini proxy', async () => {
  let assets = 0, sky = 0, mini = 0;
  const app = withMiniSite({fetch:()=>{sky++; return new Response('app');}}, ()=>{mini++;return new Response('mini');});
  const env = {ASSETS:{fetch:()=>{assets++;return new Response('asset');}}};
  for (const path of ['/api/eve/history','/_next/image?url=synthetic','/_next/static%2Fapi','/_next/static/../../api/eve/history'])
    assert.equal(await(await app.fetch(new Request('https://avoado.si'+path),env,{})).text(), 'app');
  assert.equal(await(await app.fetch(new Request('https://avoado.si/_next/static/chunks/fixture.js',{method:'POST',body:'synthetic'}),env,{})).text(),'app');
  assert.equal(await(await app.fetch(new Request('https://avoado.si/_astro/mini.css'),env,{})).text(),'mini');
  assert.equal(await(await app.fetch(new Request('https://avoado.si/_next/static/chunks/fixture.js'),{},{})).text(),'app');
  assert.equal(assets,0); assert.equal(sky,6); assert.equal(mini,1);
});

void test('build asset cache policy covers successful reads but never promotes private, cookie or missing responses', async () => {
  const policy = JSON.parse(readFileSync(new URL('../data/web-security-policy.json', import.meta.url), 'utf8'));
  const app = withMiniSite({fetch:()=>new Response('unreachable')});
  for (const [status, cache, cookie, expected] of [
    [200,'public, max-age=0, must-revalidate',false,policy.routeHeaders['/_next/static/*']['Cache-Control']],
    [206,'public, max-age=0, must-revalidate',false,policy.routeHeaders['/_next/static/*']['Cache-Control']],
    [304,'public, max-age=0, must-revalidate',false,policy.routeHeaders['/_next/static/*']['Cache-Control']],
    [200,'private, no-store',false,'private, no-store'],
    [200,'no-store',false,'no-store'],
    [200,'public, max-age=0',true,'public, max-age=0'],
    [404,'public, max-age=0',false,'public, max-age=0'],
  ]) {
    const headers = {'cache-control':cache,etag:'"fixed-asset"','x-fixture':'retained'};
    if (cookie) headers['set-cookie']='fixture=synthetic';
    const response = await app.fetch(new Request('https://avoado.si/_next/static/chunks/fixture.js'),{ASSETS:{fetch:()=>new Response(status===304?null:'fixture',{status,headers})}},{});
    assert.equal(response.status,status); assert.equal(response.headers.get('cache-control'),expected);
    assert.equal(response.headers.get('etag'),'"fixed-asset"'); assert.equal(response.headers.get('x-fixture'),'retained');
    assert.equal(await response.text(),status===304?'':'fixture');
  }
});
