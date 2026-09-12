import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  entryPoints: [
    new URL('../lib/fashion-mcp-client.ts', import.meta.url).pathname,
  ],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const source = Buffer.from(built.outputFiles[0].text).toString('base64');
const token = 'FASHION-TEST-TOKEN-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const required = [
  'fashion.autopilot.run',
  'fashion.system.readiness',
  'instagram.accounts.discover',
  'instagram.content_plan.create',
  'instagram.draft.create',
  'instagram.publish.prepare',
  'instagram.insights.sync',
  'instagram.dm.classify',
  'approval.execute',
];
const tools = [
  ...required.map((name) => ({ name })),
  ...Array.from({ length: 29 }, (_, index) => ({ name: 'fixture.' + index })),
];
let sequence = 0;

async function harness(t, listedTools = tools) {
  const client = await import(
    'data:text/javascript;base64,' + source + '#' + sequence++
  );
  const saved = Object.fromEntries(
    ['fetch', 'window', 'sessionStorage'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const storage = new Map();
  const requests = [];
  globalThis.window = new EventTarget();
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.fetch = async (path, init) => {
    const url =
      typeof path === 'string'
        ? path
        : path instanceof URL
          ? path.href
          : path.url;
    const body = JSON.parse(init.body);
    requests.push({ path: url, body, headers: new Headers(init.headers) });
    if (url.endsWith('/connect'))
      return Response.json({ token, server: 'fashion-brand-ops-mcp' });
    if (url.endsWith('/disconnect'))
      return Response.json({ disconnected: true });
    if (body.method === 'initialize')
      return Response.json({ result: { protocolVersion: '2025-11-25' } });
    if (body.method === 'notifications/initialized')
      return new Response(null, { status: 202 });
    if (body.method === 'tools/list')
      return Response.json({ result: { tools: listedTools } });
    if (body.method === 'ping') return Response.json({ result: {} });
    assert.fail('Unexpected request: ' + url);
  };
  t.after(() => {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { client, storage, requests };
}

await test('one click initializes MCP, confirms all 38 tools, and stores the tab session', async (t) => {
  const h = await harness(t);
  const result = await h.client.connectFashionMcp();
  assert.equal(result.toolCount, 38);
  assert.equal(h.client.fashionMcpConnected(), true);
  assert.equal(h.storage.get('sky.fashion-mcp.session'), token);
  assert.equal(h.storage.get('sky.fashion-mcp.protocol'), '2025-11-25');
  assert.deepEqual(
    h.requests.slice(0, 4).map(({ body }) => body.method || 'connect'),
    ['connect', 'initialize', 'notifications/initialized', 'tools/list'],
  );
  assert.equal((await h.client.verifyFashionMcp()).toolCount, 38);
  await h.client.disconnectFashionMcp();
  assert.equal(h.client.fashionMcpConnected(), false);
  assert.equal(h.storage.size, 0);
});

await test('an incomplete tool catalog never becomes connected', async (t) => {
  const h = await harness(t, tools.slice(0, 37));
  await assert.rejects(h.client.connectFashionMcp(), /38個/);
  assert.equal(h.client.fashionMcpConnected(), false);
  assert.equal(h.storage.size, 0);
});
