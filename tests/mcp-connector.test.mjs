import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  createConnector,
  validateRemoteUrl,
  validateRegistry,
} from '../toolkits/sky-mcp-connector/server.mjs';

const registryPath = resolve('toolkits/sky-mcp-connector/registry.json');

async function harness(t) {
  const connector = await createConnector({ registryPath, port: 0 });
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
  assert.equal(fashion.passport.tools.length, 38);
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
