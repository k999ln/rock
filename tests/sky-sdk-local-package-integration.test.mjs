import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLineCounter } from '../toolkits/sky-tool-sdk/examples/line-counter.mjs';
import { createConnector } from '../toolkits/sky-mcp-connector/server.mjs';
import { compatibleLocalPackageRuntimes } from '../lib/sky-package-runtime.ts';
import { parseSkyToolPackage } from '../lib/sky-tool-package.ts';

void test('SDK sample is discovered and called through the existing local connector with exact-schema approval', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rock-sdk-integration-'));
  const localToolDirectory = join(root, 'discovery');
  const registryPath = join(root, 'registry.json');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(registryPath, JSON.stringify({ schema: 'rockstaros-mcp-registry/1', servers: [] }));
  let externalCalls = 0;
  const app = createLineCounter({ localToolDirectory, publicMcpUrl: 'https://example.invalid/mcp',
    skyUrl: 'https://example.invalid', developerToken: 'fixture-token-not-a-real-credential',
    fetch: async () => { externalCalls++; throw new Error('NO_EXTERNAL_REQUEST'); }, logger: { warn() {} } });
  const manifest = parseSkyToolPackage(app.manifests()[0]);
  const sdk = await app.start(); t.after(() => sdk.close());
  const connector = await createConnector({ registryPath, port: 0, localToolDirectory });
  t.after(() => new Promise(resolve => connector.server.close(resolve)));
  const base = `http://127.0.0.1:${connector.port}`, origin = 'http://localhost:3000';
  const headers = { Origin: origin, Host: `127.0.0.1:${connector.port}`, 'Content-Type': 'application/json' };
  const connect = await fetch(`${base}/connect`, { method: 'POST', headers, body: '{}' });
  assert.equal(connect.status, 200); const token = (await connect.json()).token;
  const request = (path, method, body) => fetch(`${base}${path}`, { method, headers: { ...headers, Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  let servers = (await (await request('/servers', 'GET')).json()).servers;
  const local = servers.find(item => item.id === sdk.localId); assert.equal(local.transport, 'local_http');
  assert.equal((await request(`/servers/${sdk.localId}/connect`, 'POST', {})).status, 200);
  servers = (await (await request('/servers', 'GET')).json()).servers;
  const candidates = compatibleLocalPackageRuntimes(manifest, servers);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].tool.name, 'count_lines');
  const args = { text: 'one\ntwo' };
  const prepared = await (await request(`/servers/${sdk.localId}/prepare`, 'POST', { name: 'count_lines', arguments: args })).json();
  assert.ok(prepared.approvalToken);
  const response = await request(`/servers/${sdk.localId}/execute`, 'POST', { name: 'count_lines', arguments: args, approvalToken: prepared.approvalToken, confirmed: true });
  assert.equal(response.status, 200); assert.equal((await response.json()).result.structuredContent.lines, 2);
  const replay = await request(`/servers/${sdk.localId}/execute`, 'POST', { name: 'count_lines', arguments: args, approvalToken: prepared.approvalToken, confirmed: true });
  assert.equal(replay.status, 403);
  assert.equal(externalCalls <= 1, true); // SDK usage callback is a synthetic injected fetch, never network.
});
