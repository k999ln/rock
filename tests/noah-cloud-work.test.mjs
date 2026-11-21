import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { cloudPackages } from '../services/noah-test-runtime/src/esim-trial/cloud-packages.mjs';
import { esimCloudRequestScope } from '../lib/esim-cloud-access.ts';

const root = '/api/noah/cloud-work';
const request = (path, method = 'GET') =>
  new Request('https://noah.test' + path, { method });
test('only the three cloud work routes accept the Noah grant; destinations come from registered bindings', () => {
  assert.equal(esimCloudRequestScope(request(root)), 'noah');
  for (const action of ['start', 'stop'])
    assert.equal(
      esimCloudRequestScope(request(root + '/' + action, 'POST')),
      'noah',
    );
  for (const [path, method] of [
    [root, 'POST'],
    [root + '/start', 'GET'],
    [root + '/unknown', 'POST'],
  ])
    assert.equal(esimCloudRequestScope(request(path, method)), null);
  assert.deepEqual(cloudPackages({})[0].routes, []);
  assert.throws(() =>
    cloudPackages({
      NOAH_AGENT_ROUTES: JSON.stringify([
        {
          id: 'external',
          name: 'Test',
          routes: [
            {
              id: 'alternate',
              kind: 'provider',
              label: 'Test',
              binding: 'LINE',
            },
          ],
        },
      ]),
    }),
  );
});

test('private hosted entry binds the request to carrier proof and returns a background result without an open screen', async (t) => {
  const { outputFiles } = buildSync({
    entryPoints: ['services/noah-test-runtime/src/cloud-entry.mjs'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  const quote = { currency: 'JPY', customerMinor: 0, operatorMinor: 0 };
  const input = {
    id: randomUUID(),
    route: 'auto',
    agent: 'text-check',
    text: '試験',
  };
  const expectedBody = new URLSearchParams(input).toString();
  let active = true,
    polls = 0;
  const line = async (req) => {
    const payload = await req.json();
    if (new URL(req.url).pathname === '/authorize') {
      assert.equal(payload.account, 'synthetic-owner');
      if (
        payload.evidence !== 'synthetic-evidence' ||
        payload.bodySha256 !==
          createHash('sha256')
            .update(payload.method === 'POST' ? expectedBody : '')
            .digest('hex')
      )
        return new Response(null, { status: 403 });
      return Response.json({
        active,
        account: payload.account,
        owner: 'member-opaque',
      });
    }
    assert.deepEqual(payload, {
      owner: 'member-opaque',
      agent: 'text-check',
      route: 'noah',
    });
    polls++;
    return Response.json({
      active,
      enrollment: 'simulation',
      device: 'test-device',
      quote,
    });
  };
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: '',
          modules: true,
          script: outputFiles[0].text,
          compatibilityDate: '2026-10-01',
          durableObjects: {
            JOBS: { className: 'CloudWork', useSQLite: true },
            RESULTS: { className: 'TextResult', useSQLite: true },
          },
          serviceBindings: {
            LINE: line,
            NOAH: { name: '', entrypoint: 'NoahTextAgent' },
          },
        },
      ],
    }),
  );
  t.after(() => mf.dispose());
  const headers = {
    'X-Noah-Account': 'synthetic-owner',
    'X-Noah-Carrier-Proof': 'synthetic-evidence',
  };
  const home = 'https://noah.test' + root;
  assert.equal((await mf.dispatchFetch(home)).status, 403);
  assert.equal(
    (
      await mf.dispatchFetch(home, {
        headers: { ...headers, 'X-Noah-Carrier-Proof': 'unverified' },
      })
    ).status,
    403,
  );
  assert.match(
    await (await mf.dispatchFetch(home, { headers })).text(),
    /バックグラウンドで実行/,
  );
  const start = await mf.dispatchFetch(home + '/start', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: expectedBody,
    redirect: 'manual',
  });
  assert.equal(start.status, 303);
  const limit = Date.now() + 15000;
  // No client requests or wake commands during execution.
  while (polls < 3 && Date.now() < limit)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(polls >= 3);
  const page = await (await mf.dispatchFetch(home, { headers })).text();
  for (const text of [
    '文字数 2',
    'できたこと',
    'できなかったこと',
    '未確認',
    'Noahクラウド',
  ])
    assert.ok(page.includes(text), text);
  active = false;
  assert.equal((await mf.dispatchFetch(home, { headers })).status, 403);
});
