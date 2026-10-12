import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const origin = 'https://sky-browser.test';
const tenant = 'http-security-fixture';

async function startConnector(t, { fixedToken = '', host = '127.0.0.1' } = {}) {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fashion-http-security-'));
  const dbPath = path.join(directory, 'ops.db');
  let stderr = '';
  const child = spawn(process.execPath, ['src/http.mjs'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      FASHION_HTTP_HOST: host,
      FASHION_HTTP_PORT: String(port),
      FASHION_BROWSER_ORIGINS: origin,
      FASHION_BRAND_DB_PATH: dbPath,
      FASHION_MCP_BEARER_TOKEN: fixedToken,
      ROCKSTAR_TENANT_ID: fixedToken ? tenant : '',
      ROCKSTAR_APPROVAL_SECRET: 'x'.repeat(40),
      FASHION_CREATIVE_PROVIDER: 'mock',
      FASHION_SOCIAL_PROVIDER: 'mock',
      FASHION_PAYMENT_PROVIDER: 'mock',
      FASHION_NOTIFICATION_PROVIDER: 'mock',
      META_APP_SECRET: 'fixture-meta-signing-value',
    },
  });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
    if (fixedToken)
      assert.ok(!stderr.includes(fixedToken), 'server must not log credentials');
  });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(child.exitCode, null, 'connector exited before becoming ready');
    try {
      if ((await fetch(url + '/health')).ok) return { url, dbPath };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail('connector did not become ready');
}

async function rpc(url, headers = {}, params = undefined) {
  return fetch(url + '/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: params ? 'tools/call' : 'ping',
      ...(params ? { params } : {}),
    }),
  });
}

void test('configured bearer and tenant cannot be bypassed with Origin or a minted browser session', async (t) => {
  const fixedToken = randomBytes(32).toString('base64url');
  const { url } = await startConnector(t, { fixedToken });
  const tenantHeader = { 'X-Rockstar-Tenant-ID': tenant };

  for (const suppliedOrigin of [undefined, origin, 'https://attacker.test']) {
    const headers = { ...tenantHeader, ...(suppliedOrigin ? { Origin: suppliedOrigin } : {}) };
    assert.equal((await rpc(url, headers)).status, 401);
    assert.equal((await rpc(url, { ...headers, Authorization: 'Bearer invalid' })).status, 401);
    const valid = await rpc(url, { ...headers, Authorization: `Bearer ${fixedToken}` });
    assert.equal(valid.status, 200);
    assert.deepEqual((await valid.json()).result, {});
  }
  assert.equal((await rpc(url, { Authorization: `Bearer ${fixedToken}`, Origin: origin })).status, 401);
  assert.equal((await rpc(url, {
    Authorization: `Bearer ${fixedToken}`, Origin: origin,
    'X-Rockstar-Tenant-ID': 'different-tenant',
  })).status, 401);

  const connect = await fetch(url + '/connect', {
    method: 'POST', headers: { Origin: origin, ...tenantHeader }, body: '{}',
  });
  assert.equal(connect.status, 403);
  assert.deepEqual(await connect.json(), { error: 'browser_session_disabled' });
});

void test('non-loopback bind cannot mint sessions using forged loopback Host and allowed Origin', async (t) => {
  const fixedToken = randomBytes(32).toString('base64url');
  const { url } = await startConnector(t, { fixedToken, host: '0.0.0.0' });
  // The real listener is non-loopback even though the client supplies a loopback
  // Host and sends the allowlisted Origin from a non-browser HTTP client.
  const response = await fetch(url + '/connect', {
    method: 'POST', headers: { Origin: origin }, body: '{}',
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal((await rpc(url, { Origin: origin, 'X-Rockstar-Tenant-ID': tenant })).status, 401);
  assert.equal((await rpc(url, {
    Authorization: `Bearer ${fixedToken}`, 'X-Rockstar-Tenant-ID': tenant,
  })).status, 200);
});

void test('HTTP JSON and tool database failures expose only fixed codes, while signed-webhook failures remain denied', async (t) => {
  const { url, dbPath } = await startConnector(t);
  const invalid = await fetch(url + '/mcp', {
    method: 'POST', body: '"private-request-marker" invalid-json',
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: 'invalid_json' });

  const database = new DatabaseSync(dbPath);
  database.exec(`CREATE TRIGGER private_error_fixture BEFORE INSERT ON brands
    BEGIN SELECT RAISE(ABORT, 'private-db-marker /internal/schema.sqlite'); END;`);
  database.close();
  const failed = await rpc(url, {}, {
    name: 'fashion.brand.upsert',
    arguments: { id: 'brand-error-fixture', name: 'Fixture', policy: {} },
  });
  assert.equal(failed.status, 200);
  assert.deepEqual((await failed.json()).result, {
    content: [{ type: 'text', text: JSON.stringify({ error: 'tool_request_failed' }) }],
    structuredContent: { error: 'tool_request_failed' },
    isError: true,
  });
  const webhook = await fetch(url + '/webhooks/instagram', {
    method: 'POST', body: '{}', headers: { 'X-Hub-Signature-256': 'invalid' },
  });
  assert.equal(webhook.status, 401);
  assert.deepEqual(await webhook.json(), { error: 'webhook_verification_failed' });
  assert.equal((await rpc(url)).status, 200);
});
