import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { createServer as createViteServer } from 'vite';
import { createLocalRuntimeManager, createSkyLocalRuntimePlugin, isLocalRuntimeRequest } from '../scripts/sky-local-runtime.mjs';

const origin = 'http://localhost:3107';

void test('only the current loopback page can request a bundled local runtime', () => {
  const request = { socket: { remoteAddress: '::1' }, headers: { origin, host: 'localhost:3107' } };
  assert.equal(isLocalRuntimeRequest(request, 3107), true);
  for (const headers of [
    { origin: 'https://attacker.invalid', host: 'localhost:3107' },
    { origin: 'http://localhost:3108', host: 'localhost:3108' },
    { origin, host: 'attacker.invalid:3107' },
    { origin: 'null', host: 'localhost:3107' },
    { origin, host: 'localhost:3107', 'sec-fetch-site': 'cross-site' },
  ]) assert.equal(isLocalRuntimeRequest({ ...request, headers }, 3107), false);
  assert.equal(isLocalRuntimeRequest({ ...request, socket: { remoteAddress: '192.168.0.2' } }, 3107), false);
});

async function unusedPort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

void test('one managed connector starts once, enforces its page origin, and stops with its owner', async (t) => {
  const port = await unusedPort();
  const manager = createLocalRuntimeManager({ connectorPort: port });
  t.after(() => manager.close());
  await Promise.all([manager.start('connector', origin), manager.start('connector', origin)]);
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/health`, { headers: { Origin: origin } });
  assert.equal((await health.json()).service, 'rockstaros-sky-mcp');
  assert.equal((await fetch(`${base}/health`, { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  await manager.close();
  await assert.rejects(fetch(`${base}/health`, { headers: { Origin: origin } }));
  await assert.rejects(manager.start('connector', origin), /終了/);
});

void test('managed Fashion has real local persistence, no live providers, and a clean shutdown', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sky-runtime-test-'));
  const port = await unusedPort();
  const manager = createLocalRuntimeManager({ fashionPort: port, fashionDbPath: join(directory, 'test.db') });
  t.after(async () => { await manager.close(); await rm(directory, { recursive: true, force: true }); });
  await Promise.all([manager.start('fashion', origin), manager.start('fashion', origin)]);
  const base = `http://127.0.0.1:${port}`;
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.service, 'fashion-brand-ops-mcp');
  assert.ok(Object.values(health.providers).every((name) => name === 'mock'));
  assert.equal((await fetch(`${base}/connect`, { method: 'OPTIONS', headers: { Origin: origin } })).status, 204);
  assert.equal((await fetch(`${base}/connect`, { method: 'OPTIONS', headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  // A second manager may reuse this valid service, but must not own or stop it.
  const second = createLocalRuntimeManager({ fashionPort: port });
  await second.start('fashion', origin);
  await second.start('fashion', 'http://127.0.0.1:3107');
  await second.close();
  assert.equal((await fetch(`${base}/health`)).status, 200);
  await manager.close();
  await assert.rejects(fetch(`${base}/health`));
});

void test('closing an isolated Vite server waits for both on-demand local runtimes to stop', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sky-vite-runtime-test-'));
  const connectorPort = await unusedPort();
  const fashionPort = await unusedPort();
  const vite = await createViteServer({
    configFile: false,
    root: directory,
    appType: 'custom',
    logLevel: 'silent',
    plugins: [createSkyLocalRuntimePlugin({
      connectorPort,
      fashionPort,
      fashionDbPath: join(directory, 'fashion.db'),
    })],
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
  });
  t.after(async () => {
    await vite.close();
    await rm(directory, { recursive: true, force: true });
  });
  await vite.listen();
  const port = vite.httpServer.address().port;
  const pageOrigin = `http://127.0.0.1:${port}`;
  for (const service of ['connector', 'fashion']) {
    const response = await fetch(`${pageOrigin}/__sky/runtime/start`, {
      method: 'POST',
      headers: { Origin: pageOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ service }),
    });
    assert.equal(response.status, 200, `${service}: ${await response.text()}`);
  }
  assert.equal((await fetch(`http://127.0.0.1:${connectorPort}/health`, { headers: { Origin: pageOrigin } })).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${fashionPort}/health`)).status, 200);
  await vite.close();
  await assert.rejects(fetch(`http://127.0.0.1:${connectorPort}/health`, { headers: { Origin: pageOrigin } }));
  await assert.rejects(fetch(`http://127.0.0.1:${fashionPort}/health`));
});

void test('browser bootstrap is single-flight and never turns unavailable into connected', async (t) => {
  const built = await build({ entryPoints: ['lib/sky-local-runtime.ts'], bundle: true, write: false, format: 'esm' });
  const client = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  const savedWindow = globalThis.window;
  const savedFetch = globalThis.fetch;
  t.after(() => { globalThis.window = savedWindow; globalThis.fetch = savedFetch; });
  globalThis.window = { location: { hostname: 'localhost' } };
  let finish;
  let requests = 0;
  globalThis.fetch = () => { requests++; return new Promise((done) => { finish = done; }); };
  const first = client.ensureLocalRuntime('connector');
  const second = client.ensureLocalRuntime('connector');
  assert.equal(requests, 1);
  finish(Response.json({ service: 'connector', status: 'ready' }));
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  globalThis.fetch = async () => Response.json({ error: 'not ready' }, { status: 503 });
  await assert.rejects(client.ensureLocalRuntime('fashion'), /not ready/);
  globalThis.fetch = async () => new Response(null, { status: 404 });
  assert.equal(await client.ensureLocalRuntime('fashion'), false);
  globalThis.window.location.hostname = 'sky.example';
  globalThis.fetch = () => { throw new Error('must not send remote bootstrap'); };
  assert.equal(await client.ensureLocalRuntime('connector'), false);
});
