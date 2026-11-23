import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { desktopJobs } from '../services/noah-managed-desktop/jobs.mjs';
import { desktopHandler } from '../services/noah-managed-desktop/server.mjs';

const bundled = (file) =>
  buildSync({
    entryPoints: [file],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  }).outputFiles[0].text;

await test('eSIM cloud form crosses its private desktop bridge and HTTP runner, reopens one result and acknowledges guest stop', async (t) => {
  const sha = 'c'.repeat(64),
    token = 'runner-test-secret'.repeat(3),
    db = new DatabaseSync(':memory:');
  const operations = [];
  let runs = 0,
    stops = 0;
  const jobs = desktopJobs(
    db,
    async (signal) => ({
      async run(text) {
        runs++;
        if (text === '停止結果不明') {
          await once(signal, 'abort');
          throw Object.assign(new Error('Guest teardown was not confirmed'), { unconfirmed: true });
        }
        if (text === '停止確認') {
          await once(signal, 'abort');
          signal.throwIfAborted();
        }
        return { text: '専用画面の結果 ' + text, exitCode: 0, files: [] };
      },
      async stop() {
        stops++;
      },
    }),
    sha,
  );
  const handler = desktopHandler(jobs, token, sha);
  const server = createServer((req, res) => {
    operations.push({ method: req.method, path: req.url });
    void handler(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = 'http://127.0.0.1:' + server.address().port;
  t.after(() => {
    server.closeAllConnections();
    server.close();
    db.close();
  });
  let active = true;
  const line = async (req) => {
    const body = await req.json();
    if (new URL(req.url).pathname === '/authorize') {
      if (body.account !== 'member' || body.evidence !== 'test-line')
        return new Response(null, { status: 403 });
      return Response.json({
        active,
        account: body.account,
        owner: 'member-opaque',
      });
    }
    assert.equal(body.agent, 'desktop');
    assert.equal(body.route, 'noah');
    return Response.json({
      active,
      device: 'test-phone',
      enrollment: 'order',
      quote: { customerMinor: 0, operatorMinor: 0, currency: 'JPY' },
    });
  };
  // Only the transport between the Worker and loopback is substituted. The bridge
  // chooses the destination and adds the runner credential itself.
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: '',
          modules: true,
          compatibilityDate: '2026-10-01',
          script: bundled('services/noah-test-runtime/src/cloud-entry.mjs'),
          durableObjects: { JOBS: { className: 'CloudWork', useSQLite: true } },
          bindings: { NOAH_DESKTOP_PACKAGE_SHA256: sha },
          serviceBindings: { LINE: line, AGENT_DESKTOP: 'desktop-bridge' },
        },
        {
          name: 'desktop-bridge',
          modules: true,
          compatibilityDate: '2026-10-01',
          script: bundled('services/noah-managed-desktop/bridge.mjs'),
          bindings: {
            NOAH_DESKTOP_PACKAGE_SHA256: sha,
            DESKTOP_RUNNER_TOKEN: token,
            DESKTOP_RUNNER_ORIGIN: 'https://runner.test',
          },
          outboundService: async (req) => {
            const target = new URL(req.url);
            assert.equal(target.origin, 'https://runner.test');
            assert.equal(req.headers.get('X-Noah-Desktop-Package'), sha);
            assert.equal(req.headers.get('Authorization'), 'Bearer ' + token);
            assert.ok(
              !req.headers.has('X-Noah-Account') &&
                !req.headers.has('X-Noah-Carrier-Proof'),
            );
            return fetch(address + target.pathname, {
              method: req.method,
              headers: req.headers,
              ...(req.method === 'PUT' ? { body: await req.text() } : {}),
            });
          },
        },
      ],
    }),
  );
  t.after(() => mf.dispose());
  const direct = await mf.getWorker('desktop-bridge');
  const quick = await direct.fetch(
    'https://bridge.invalid/jobs/' + 'e'.repeat(64),
    { headers: { 'X-Noah-Desktop-Package': sha } },
  );
  assert.equal(quick.status, 404, 'bridge contract preflight');
  operations.length = 0;
  const home = 'https://avoado.si/api/noah/cloud-work';
  const headers = {
    'X-Noah-Account': 'member',
    'X-Noah-Carrier-Proof': 'test-line',
  };
  const get = async (suffix) =>
    (await mf.dispatchFetch(home + suffix, { headers })).text();
  const post = async (action, params) =>
    mf.dispatchFetch(home + '/' + action, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
      redirect: 'manual',
    });
  const wait = async (check) => {
    for (let i = 0; i < 160; i++) {
      if (await check()) return;
      await delay(100);
    }
    assert.fail(
      'dedicated desktop operation timed out ' + JSON.stringify(operations),
    );
  };
  const initial = await get('?agent=desktop');
  const offer = initial.match(/name="offer" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(offer);
  assert.match(initial, /専用画面で依頼する/);
  assert.equal(runs, 0);
  const id = randomUUID(),
    first = { agent: 'desktop', route: 'auto', id, text: '集計', offer };
  assert.equal((await post('start', first)).status, 303);
  assert.equal((await post('start', first)).status, 303);
  await wait(() => runs === 1);
  await wait(async () =>
    (await get('?work=' + id)).includes('専用画面の結果 集計'),
  );
  assert.match(await get('?work=' + id), /0円（avokadoの実行記録）/);
  assert.equal(runs, 1);
  assert.equal(stops, 1);
  const second = { ...first, id: randomUUID(), text: '停止確認' };
  assert.equal((await post('start', second)).status, 303);
  await wait(() => runs === 2);
  assert.equal((await post('stop', { id: second.id })).status, 303);
  await wait(async () =>
    (await get('?work=' + second.id)).includes(
      '専用画面の停止を確認しました。',
    ),
  );
  assert.equal(stops, 2);
  assert.equal(operations.filter((row) => row.method === 'PUT').length, 2);
  assert.equal(new Set(operations.map((row) => row.path)).size, 2);
  assert.equal(operations.filter((row) => row.method === 'DELETE').length, 1);
  assert.equal((await post('start', second)).status, 303);
  assert.equal(runs, 2);
  const third = { ...first, id: randomUUID(), text: '停止より前に完了' };
  assert.equal((await post('start', third)).status, 303);
  await wait(() => stops === 3);
  assert.equal((await post('stop', { id: third.id })).status, 303);
  await wait(async () => (await get('?work=' + third.id)).includes('専用画面の結果 停止より前に完了'));
  assert.match(await get('?work=' + third.id), /0円（avokadoの実行記録）/);
  const uncertain = { ...first, id: randomUUID(), text: '停止結果不明' };
  assert.equal((await post('start', uncertain)).status, 303);
  await wait(() => runs === 4);
  assert.equal((await post('stop', { id: uncertain.id })).status, 303);
  await wait(async () => (await get('?work=' + uncertain.id)).includes('元の依頼の結果と停止状態を確認'));
  assert.equal((await post('start', uncertain)).status, 303);
  assert.equal(runs, 4);
  active = false;
  assert.equal(
    (await mf.dispatchFetch(home + '?work=' + id, { headers })).status,
    403,
  );
});
