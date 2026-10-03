import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createConnector,
  McpHub,
  validateRegistry,
} from '../toolkits/sky-mcp-connector/server.mjs';

const registryPath = resolve('toolkits/sky-mcp-connector/registry.json');
const fixtureSecret = 'synthetic-credential-for-guard-test';
const privateArgs = { document: { entries: [{ apiKey: fixtureSecret }] } };
const personalArgs = { document: { entries: [{ text: 'guard-fixture@example.test' }] } };
const safeArgs = { document: { entries: [{ text: '公開済みの説明を整理してください。' }] } };

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function bindFixture(hub, id, names = ['summarize']) {
  const entry = hub.entry(id);
  entry.state = 'connected';
  entry.passport = {
    tools: names.map(name => ({ name, title: name })),
    toolDigest: 'a'.repeat(64),
  };
  const calls = [];
  entry.transport.request = async message => {
    calls.push(message);
    return { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'processed' }] } };
  };
  return calls;
}

function legacyApproval(hub, id, name, args) {
  // A valid, exact approval issued before this policy was active must still
  // pass the new execute-time check before it can reach an upstream Tool.
  const payloadDigest = createHash('sha256').update(canonical({
    id, name, args, toolDigest: hub.entry(id).passport.toolDigest,
  })).digest('hex');
  const nonce = randomUUID(), expiresAt = Date.now() + 60_000;
  hub.approvals.set(nonce, { payloadDigest, expiresAt, used: false });
  const signature = createHmac('sha256', hub.approvalSecret)
    .update(`${nonce}:${payloadDigest}:${expiresAt}`).digest('hex');
  return `${nonce}.${expiresAt}.${signature}`;
}

function blocked(error) {
  assert.equal(error.code, 'SENSITIVE_DATA_BLOCKED');
  assert.equal(error.status, 422);
  assert.equal(error.message, 'SENSITIVE_DATA_BLOCKED');
  assert.equal(JSON.stringify(error).includes(fixtureSecret), false);
  return true;
}

for (const transport of ['stdio', 'streamable_http', 'local_http']) {
  void test(`third-party ${transport} arguments are rejected before approval or RPC`, async () => {
    const hub = new McpHub([{
      id: 'third-party', name: 'Third party', transport,
      command: 'node', args: ['third-party.mjs'], cwd: '/not-executed',
      envNames: [], url: 'https://not-requested.example/mcp',
    }]);
    const calls = bindFixture(hub, 'third-party');
    for (const args of [privateArgs, personalArgs]) {
      assert.throws(() => hub.prepare('third-party', 'summarize', args), blocked);
      assert.equal(hub.approvals.size, 0);
      const token = legacyApproval(hub, 'third-party', 'summarize', args);
      await assert.rejects(() => hub.execute('third-party', 'summarize', args, token, true), blocked);
      hub.approvals.clear();
    }
    assert.equal(calls.length, 0);
    hub.close();
  });
}

void test('safe nested data still requires exact, single-use approval', async () => {
  const hub = new McpHub([{ id: 'third-party', name: 'Third party', transport: 'stdio', command: 'node', args: [], cwd: '.', envNames: [] }]);
  const calls = bindFixture(hub, 'third-party');
  const prepared = hub.prepare('third-party', 'summarize', safeArgs);
  await assert.rejects(() => hub.execute('third-party', 'summarize', safeArgs, prepared.approvalToken, false), { code: 'approval_required' });
  await assert.rejects(() => hub.execute('third-party', 'summarize', { text: 'changed' }, prepared.approvalToken, true), { code: 'approval_mismatch' });
  assert.equal(calls.length, 0);
  const result = await hub.execute('third-party', 'summarize', safeArgs, prepared.approvalToken, true);
  assert.equal(result.content[0].text, 'processed');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params.arguments, safeArgs);
  await assert.rejects(() => hub.execute('third-party', 'summarize', safeArgs, prepared.approvalToken, true), { code: 'invalid_approval' });
  assert.equal(calls.length, 1);
  hub.close();
});

void test('custom RPC methods and direct tools/call cannot bypass the data guard', async () => {
  const hub = new McpHub([{ id: 'third-party', name: 'Third party', transport: 'stdio', command: 'node', args: [], cwd: '.', envNames: [] }]);
  const calls = bindFixture(hub, 'third-party');
  await assert.rejects(() => hub.rpc('third-party', 'resources/read', personalArgs), blocked);
  await assert.rejects(() => hub.rpc('third-party', 'tools/call', { name: 'summarize', arguments: privateArgs }), blocked);
  await assert.rejects(() => hub.rpc('third-party', 'guard-fixture@example.test', {}), blocked);
  assert.equal(calls.length, 0);
  hub.close();
});

void test('only fixed bundled local processors retain private local input handling', async () => {
  const specs = validateRegistry(JSON.parse(await readFile(registryPath, 'utf8')), registryPath);
  const hub = new McpHub(specs);
  const calls = bindFixture(hub, 'rock-star-mr', ['format_citations', 'unreviewed_tool']);
  const args = { text: 'Contact guard-fixture@example.test for this private draft.' };
  const prepared = hub.prepare('rock-star-mr', 'format_citations', args);
  await hub.execute('rock-star-mr', 'format_citations', args, prepared.approvalToken, true);
  assert.equal(calls.length, 1);
  assert.throws(() => hub.prepare('rock-star-mr', 'unreviewed_tool', args), blocked);
  hub.entry('rock-star-mr').spec.args = ['third-party.mjs'];
  assert.throws(() => hub.prepare('rock-star-mr', 'format_citations', args), blocked);
  assert.equal(calls.length, 1);
  hub.close();
});

async function harness(t) {
  const localToolDirectory = await mkdtemp(join(tmpdir(), 'sky-spider-guard-test-'));
  t.after(() => rm(localToolDirectory, { recursive: true, force: true }));
  const connector = await createConnector({ registryPath, port: 0, localToolDirectory });
  t.after(() => new Promise(done => connector.server.close(done)));
  const base = `http://127.0.0.1:${connector.port}`;
  const headers = {
    Origin: 'http://localhost:3000',
    Host: `127.0.0.1:${connector.port}`,
    'Content-Type': 'application/json',
  };
  const response = await fetch(`${base}/connect`, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 200);
  const { token } = await response.json();
  const request = (path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  return { ...connector, request };
}

void test('HTTP prepare, execute and generic MCP routes return sanitized rejection with zero upstream calls', async t => {
  const { hub, request } = await harness(t);
  const id = 'fashion-brand-ops';
  const calls = bindFixture(hub, id);
  const approvalToken = legacyApproval(hub, id, 'summarize', privateArgs);
  const attempts = [
    [`/servers/${id}/prepare`, { name: 'summarize', arguments: privateArgs }],
    [`/servers/${id}/execute`, { name: 'summarize', arguments: privateArgs, approvalToken, confirmed: true }],
    [`/servers/${id}/mcp`, { method: 'resources/read', params: personalArgs }],
  ];
  for (const [path, body] of attempts) {
    const response = await request(path, body);
    assert.equal(response.status, 422);
    const result = await response.json();
    assert.deepEqual(result, { error: 'SENSITIVE_DATA_BLOCKED', message: 'SENSITIVE_DATA_BLOCKED' });
    assert.equal(JSON.stringify(result).includes(fixtureSecret), false);
    assert.equal(calls.length, 0);
  }
  const prepared = await (await request(`/servers/${id}/prepare`, { name: 'summarize', arguments: safeArgs })).json();
  const response = await request(`/servers/${id}/execute`, { name: 'summarize', arguments: safeArgs, approvalToken: prepared.approvalToken, confirmed: true });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

void test('legacy /mcp cannot grant a third-party script the bundled MR exemption', async t => {
  const { hub, request } = await harness(t);
  const calls = bindFixture(hub, 'rock-star-mr', ['format_citations']);
  hub.entry('rock-star-mr').spec.args = ['third-party.mjs'];
  const response = await request('/mcp', {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'format_citations', arguments: personalArgs },
  });
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: 'SENSITIVE_DATA_BLOCKED', message: 'SENSITIVE_DATA_BLOCKED' });
  assert.equal(calls.length, 0);
});
