import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const origin = 'https://sky-browser.test';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(url, child, stderr) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null)
      throw new Error('connector exited: ' + stderr());
    try {
      const response = await fetch(url + '/health');
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('connector did not become ready: ' + stderr());
}

test('browser one-click session initializes, lists 38 tools, and revokes cleanly', async (t) => {
  const port = await freePort();
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'fashion-browser-mcp-'),
  );
  let errorOutput = '';
  const child = spawn(process.execPath, ['src/http.mjs'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      FASHION_HTTP_PORT: String(port),
      FASHION_BROWSER_ORIGINS: origin,
      FASHION_BRAND_DB_PATH: path.join(temporary, 'ops.db'),
      ROCKSTAR_APPROVAL_SECRET: 'x'.repeat(40),
    },
  });
  child.stderr.on('data', (chunk) => {
    errorOutput += chunk.toString();
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    await rm(temporary, { recursive: true, force: true });
  });

  const url = 'http://127.0.0.1:' + port;
  await waitForHealth(url, child, () => errorOutput);

  const preflight = await fetch(url + '/connect', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Private-Network': 'true',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(
    preflight.headers.get('access-control-allow-private-network'),
    'true',
  );

  const connection = await fetch(url + '/connect', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(connection.status, 200);
  const connected = await connection.json();
  assert.equal(connected.server, 'fashion-brand-ops-mcp');
  assert.ok(connected.token.length >= 40);

  async function rpc(method, params = {}) {
    const response = await fetch(url + '/mcp', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + connected.token,
        'MCP-Protocol-Version': '2025-11-25',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
    });
    return { response, message: await response.json() };
  }

  const initialized = await rpc('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
  assert.equal(initialized.response.status, 200);
  assert.equal(initialized.message.result.protocolVersion, '2025-11-25');
  const listed = await rpc('tools/list');
  assert.equal(listed.message.result.tools.length, 38);
  assert.ok(
    listed.message.result.tools.some(
      (tool) => tool.name === 'instagram.publish.prepare',
    ),
  );

  const disconnected = await fetch(url + '/disconnect', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + connected.token,
    },
    body: '{}',
  });
  assert.equal(disconnected.status, 200);
  assert.equal((await rpc('ping')).response.status, 401);

  const denied = await fetch(url + '/connect', {
    method: 'POST',
    headers: {
      Origin: 'https://attacker.test',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
