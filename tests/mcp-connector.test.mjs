import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSkyToolApp } from '../toolkits/sky-tool-sdk/src/index.mjs';
import {
  createConnector,
  validateRemoteUrl,
  validateRegistry,
} from '../toolkits/sky-mcp-connector/server.mjs';

const registryPath = resolve('toolkits/sky-mcp-connector/registry.json');

async function harness(t, options = {}) {
  const localToolDirectory = options.localToolDirectory ?? await mkdtemp(join(tmpdir(), 'sky-connector-test-'));
  if (!options.localToolDirectory)
    t.after(() => rm(localToolDirectory, { recursive: true, force: true }));
  const connector = await createConnector({ registryPath, port: 0, ...options, localToolDirectory });
  t.after(() => new Promise((done) => connector.server.close(done)));
  const base = `http://127.0.0.1:${connector.port}`;
  const origin = 'http://localhost:3000';
  const connected = await fetch(`${base}/connect`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Host: `127.0.0.1:${connector.port}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(connected.status, 200);
  const { token } = await connected.json();
  const request = (path, body, method = 'POST') =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        Origin: origin,
        Host: `127.0.0.1:${connector.port}`,
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { request };
}

void test('SDK tools appear in the PC hub and execute only after one-time approval', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sky-local-tools-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sky = createSkyToolApp({
    skyUrl: 'https://sky.example',
    developerToken: `sky_dev_${'a'.repeat(43)}`,
    developer: { id: 'test-developer', name: 'Test Developer', supportUrl: 'https://example.com/support' },
    app: { id: 'com.example.local', name: 'Local Counter', version: '1.0.0', sourceUrl: 'https://example.com/source', license: 'MIT' },
    localToolDirectory: directory,
  });
  sky.tool({
    name: 'count',
    description: '入力された文章に含まれるUnicode文字数を返します。',
    inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
    outputSchema: { type: 'object', required: ['characters'], properties: { characters: { type: 'integer' } } },
    handler: async ({ text }) => ({ characters: [...text].length }),
  });
  const runtime = await sky.start();
  let runtimeClosed = false;
  t.after(() => runtimeClosed ? undefined : runtime.close());
  const { request } = await harness(t, { localToolDirectory: directory });
  const before = await (await request('/servers', undefined, 'GET')).json();
  assert.equal(before.servers.at(-1).id, runtime.localId);
  assert.equal(before.servers.at(-1).state, 'available');
  const descriptor = JSON.parse(await readFile(join(directory, `${runtime.localId}.json`), 'utf8'));
  const direct = await fetch(descriptor.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert.equal(direct.status, 401);
  const connected = await (await request(`/servers/${runtime.localId}/connect`, {})).json();
  assert.equal(connected.passport.tools[0].name, 'count');
  const args = { text: 'Sky' };
  const prepared = await (await request(`/servers/${runtime.localId}/prepare`, { name: 'count', arguments: args })).json();
  const executed = await (await request(`/servers/${runtime.localId}/execute`, { name: 'count', arguments: args, approvalToken: prepared.approvalToken, confirmed: true })).json();
  assert.equal(executed.result.structuredContent.characters, 3);
  await runtime.close();
  runtimeClosed = true;
  const after = await (await request('/servers', undefined, 'GET')).json();
  assert.equal(after.servers.some((server) => server.id === runtime.localId), false);
});

void test('registry is declarative, bounded and rejects duplicate server identities', () => {
  assert.throws(
    () =>
      validateRegistry(
        {
          schema: 'rockstaros-mcp-registry/1',
          servers: [
            {
              id: 'same',
              name: 'A',
              description: 'A',
              transport: 'stdio',
              command: 'node',
              args: [],
              cwd: '.',
              required: true,
            },
            {
              id: 'same',
              name: 'B',
              description: 'B',
              transport: 'stdio',
              command: 'node',
              args: [],
              cwd: '.',
              required: true,
            },
          ],
        },
        registryPath,
      ),
    /重複/,
  );
  assert.throws(
    () =>
      validateRegistry(
        {
          schema: 'rockstaros-mcp-registry/1',
          servers: [
            {
              id: 'bad',
              name: 'Bad',
              description: 'Bad',
              transport: 'shell',
              command: 'node',
              args: [],
              cwd: '.',
              required: true,
            },
          ],
        },
        registryPath,
      ),
    /transport/,
  );
});

void test('remote transport rejects credentials, insecure URLs and local network targets', async () => {
  await assert.rejects(
    () => validateRemoteUrl('http://example.com/mcp'),
    /HTTPS/,
  );
  await assert.rejects(
    () => validateRemoteUrl('https://user:secret@example.com/mcp'),
    /認証情報/,
  );
  await assert.rejects(
    () => validateRemoteUrl('https://127.0.0.1/mcp'),
    /ローカル/,
  );
  await assert.rejects(
    () => validateRemoteUrl('https://[::ffff:127.0.0.1]/mcp'),
    /ローカル/,
  );
});

void test('one connector negotiates the latest shared MCP protocol and arbitrary tool counts', async (t) => {
  const { request } = await harness(t);
  const before = await (await request('/servers', undefined, 'GET')).json();
  assert.deepEqual(
    before.servers.map((server) => server.id),
    ['rock-star-mr', 'fashion-brand-ops'],
  );

  const mr = await (await request('/servers/rock-star-mr/connect', {})).json();
  assert.equal(mr.passport.protocolVersion, '2025-11-25');
  assert.equal(mr.passport.tools.length, 4);
  assert.equal(mr.passport.toolDigest.length, 64);
  assert.ok(mr.passport.tools.every((tool) => tool.approval === 'required'));

  const fashion = await (
    await request('/servers/fashion-brand-ops/connect', {})
  ).json();
  assert.equal(fashion.passport.protocolVersion, '2025-11-25');
  assert.equal(fashion.passport.tools.length, 41);
  assert.notEqual(fashion.passport.toolDigest, mr.passport.toolDigest);

  const reconnected = await (
    await request('/servers/rock-star-mr/connect', {})
  ).json();
  assert.equal(reconnected.passport.tools.length, 4);
});

void test('tool execution requires an exact, single-use approval and blocks direct bypass', async (t) => {
  const { request } = await harness(t);
  await request('/servers/rock-star-mr/connect', {});

  const args = {
    text: '本文。（出典: [MCP](https://modelcontextprotocol.io/)）',
  };
  const bypass = await request('/servers/rock-star-mr/mcp', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'format_citations', arguments: args },
  });
  assert.equal(bypass.status, 403);

  const prepared = await (
    await request('/servers/rock-star-mr/prepare', {
      name: 'format_citations',
      arguments: args,
    })
  ).json();
  assert.equal(prepared.approvalRequired, true);
  const altered = await request('/servers/rock-star-mr/execute', {
    name: 'format_citations',
    arguments: { text: 'changed' },
    approvalToken: prepared.approvalToken,
    confirmed: true,
  });
  assert.equal(altered.status, 409);

  const approved = await (
    await request('/servers/rock-star-mr/prepare', {
      name: 'format_citations',
      arguments: args,
    })
  ).json();
  const executed = await request('/servers/rock-star-mr/execute', {
    name: 'format_citations',
    arguments: args,
    approvalToken: approved.approvalToken,
    confirmed: true,
  });
  assert.equal(executed.status, 200);
  assert.match(
    JSON.stringify(await executed.json()),
    /modelcontextprotocol\.io/,
  );
  const replay = await request('/servers/rock-star-mr/execute', {
    name: 'format_citations',
    arguments: args,
    approvalToken: approved.approvalToken,
    confirmed: true,
  });
  assert.equal(replay.status, 403);

  const preparedBeforeStop = await (
    await request('/servers/rock-star-mr/prepare', {
      name: 'format_citations',
      arguments: args,
    })
  ).json();
  const stopped = await request('/servers/rock-star-mr/disconnect', {});
  assert.deepEqual(await stopped.json(), {
    id: 'rock-star-mr',
    state: 'available',
  });
  const afterStop = await (await request('/servers', undefined, 'GET')).json();
  assert.equal(afterStop.servers[0].state, 'available');
  assert.equal(afterStop.servers[0].passport, null);
  const staleApproval = await request('/servers/rock-star-mr/execute', {
    name: 'format_citations',
    arguments: args,
    approvalToken: preparedBeforeStop.approvalToken,
    confirmed: true,
  });
  assert.equal(staleApproval.status, 403);
});

void test('connector binds browser token to an allowlisted Origin', async (t) => {
  const { request } = await harness(t);
  const denied = await request('/servers', undefined, 'GET');
  assert.equal(denied.status, 200);
  const connector = await createConnector({ registryPath, port: 0 });
  t.after(() => new Promise((done) => connector.server.close(done)));
  const response = await fetch(`http://127.0.0.1:${connector.port}/connect`, {
    method: 'POST',
    headers: {
      Origin: 'https://evil.example',
      Host: `127.0.0.1:${connector.port}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(response.status, 403);
});
