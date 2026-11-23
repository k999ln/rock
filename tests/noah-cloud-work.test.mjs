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
await test('only the dedicated cloud work routes accept the Noah grant; destinations come from registered bindings', () => {
  assert.equal(esimCloudRequestScope(request(root)), 'noah');
  for (const method of ['GET', 'POST'])
    assert.equal(
      esimCloudRequestScope(request(root + '/metered', method)),
      'noah',
    );
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

await test('private hosted entry binds the request to carrier proof and returns a background result without an open screen', async (t) => {
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
        orderId: 'order-one',
        deviceRef: 'approved-device',
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
  const metered = home + '/metered';
  assert.equal((await mf.dispatchFetch(metered, { headers })).status, 403);
  const contractHeaders = {
    ...headers,
    'X-Noah-Order': 'order-one',
    'X-Noah-Device': 'approved-device',
  };
  const gate = await mf.dispatchFetch(metered, { headers: contractHeaders });
  assert.equal(gate.status, 204);
  assert.equal(gate.headers.get('X-Noah-Line-Verified'), 'metered');
  assert.equal(
    (
      await mf.dispatchFetch(metered, {
        headers: { ...contractHeaders, 'X-Noah-Device': 'other' },
      })
    ).status,
    403,
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
    '完了1回',
    '0円（avokadoの実行記録）',
  ])
    assert.ok(page.includes(text), text);
  active = false;
  assert.equal((await mf.dispatchFetch(home, { headers })).status, 403);
});

await test('a pinned managed desktop survives polling and confirms the same remote stop before freeing the job', async () => {
  const { CloudWork } =
    await import('../services/noah-test-runtime/src/esim-trial/cloud-work.mjs');
  const rows = new Map(),
    operations = [];
  const storage = {
    get: async (k) =>
      Array.isArray(k) ? new Map(k.map((v) => [v, rows.get(v)])) : rows.get(k),
    put: async (k, v) => rows.set(k, v),
    delete: async (k) => rows.delete(k),
    setAlarm: async () => {},
    deleteAlarm: async () => {},
    transaction: (callback) => callback(storage),
  };
  const sha = 'b'.repeat(64);
  let created = false,
    stops = 0;
  const env = {
    LINE: {
      fetch: async () =>
        Response.json({
          active: true,
          enrollment: 'order',
          device: 'phone',
          quote: { currency: 'JPY', customerMinor: 0, operatorMinor: 0 },
        }),
    },
    AGENT_DESKTOP: {
      fetch: async (url, options) => {
        const method = options.method ?? 'GET';
        assert.equal(options.headers['X-Noah-Desktop-Package'], sha);
        operations.push({ url, method });
        if (method === 'PUT') {
          assert.ok(!created);
          created = true;
        }
        if (method === 'DELETE')
          return new Response(null, { status: ++stops === 1 ? 202 : 204 });
        return new Response(null, { status: created ? 202 : 404 });
      },
    },
  };
  assert.ok(!cloudPackages(env).some((p) => p.id === 'desktop'));
  env.NOAH_DESKTOP_PACKAGE_SHA256 = sha;
  assert.equal(cloudPackages(env).find((p) => p.id === 'desktop').version, sha);
  const worker = new CloudWork({ storage }, env);
  const call = async (path, data = {}) => {
    const response = await worker.fetch(
      new Request('https://jobs.invalid/' + path, {
        method: 'POST',
        headers: { 'X-Trial-Owner': 'member' },
        body: JSON.stringify(data),
      }),
    );
    return { status: response.status, data: await response.json() };
  };
  const form = (await call('list', { agent: 'desktop' })).data;
  const id = randomUUID();
  const start = {
    agent: 'desktop',
    route: 'auto',
    id,
    text: 'sample',
    offer: form.offer,
  };
  env.NOAH_DESKTOP_PACKAGE_SHA256 = 'c'.repeat(64);
  assert.equal((await call('start', start)).status, 409);
  env.NOAH_DESKTOP_PACKAGE_SHA256 = sha;
  assert.equal((await call('start', start)).status, 202);
  await worker.alarm();
  assert.equal((await call('start', start)).status, 200);
  await worker.alarm();
  assert.equal((await call('stop', { id })).data.stopped, false);
  await worker.alarm();
  assert.equal(
    (await call('list', { work: id })).data.jobs[0].state,
    'stopping',
  );
  await worker.alarm();
  assert.equal(
    (await call('list', { work: id })).data.jobs[0].state,
    'stopped',
  );
  assert.equal(new Set(operations.map((call) => call.url)).size, 1);
  assert.deepEqual(
    operations.map((call) => call.method),
    ['GET', 'PUT', 'GET', 'DELETE', 'DELETE'],
  );
  assert.equal(
    (await call('list', { work: id })).data.jobs[0].usage.amountMinor,
    null,
  );
});
