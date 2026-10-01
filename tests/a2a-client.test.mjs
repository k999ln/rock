import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  A2ARequestIndeterminateError,
  createA2AClient,
  parseA2AAgentCard,
} from '../lib/a2a-client.ts';

const origin = 'https://agent.example.test';
const card = {
  name: 'Fixture Research Agent',
  description: 'Returns a fixture artifact for approved research jobs.',
  version: '1.2.0',
  supportedInterfaces: [
    { url: `${origin}/a2a`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
  ],
  capabilities: { streaming: false, pushNotifications: false },
  skills: [{ id: 'research', name: 'Research', description: 'Research a supplied topic.' }],
};

const jsonResponse = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const rpcResponse = (id, result) => jsonResponse({ jsonrpc: '2.0', id, result });

void test('A2A 1.0 discovery and approved send, task read, cancellation use JSON-RPC contract', async () => {
  const calls = [];
  const authorized = [];
  const client = createA2AClient({
    allowedOrigins: [origin],
    bearerToken: 'test-secret-never-log',
    authorizeDelegation: async (intent) => authorized.push(intent),
    fetch: async (input, init = {}) => {
      const url = new URL(input);
      calls.push({ url, init });
      if (url.pathname.endsWith('agent-card.json')) return jsonResponse(card);
      const request = JSON.parse(init.body);
      if (request.method === 'message/send')
        return rpcResponse(request.id, {
          task: { id: 'remote-1', status: { state: 'TASK_STATE_SUBMITTED' }, artifacts: [] },
        });
      if (request.method === 'tasks/get')
        return rpcResponse(request.id, {
          id: request.params.id,
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ name: 'summary', parts: [{ text: 'verified fixture output' }] }],
        });
      if (request.method === 'tasks/cancel')
        return rpcResponse(request.id, {
          id: request.params.id,
          status: { state: 'TASK_STATE_CANCELED' },
        });
      throw new Error('unexpected method');
    },
  });

  const discovered = await client.discoverAtOrigin(origin);
  assert.equal(discovered.name, card.name);
  assert.deepEqual(discovered.skills?.map((skill) => skill.id), ['research']);

  const sent = await client.sendMessage(discovered, 'zema-job-55', 'この資料の要点を整理してください');
  assert.equal(sent.kind, 'task');
  if (sent.kind === 'task') assert.equal(sent.task.id, 'remote-1');

  const completed = await client.getTask(discovered, 'remote-1');
  assert.equal(completed.status.state, 'TASK_STATE_COMPLETED');
  const canceled = await client.cancelTask(discovered, 'remote-1');
  assert.equal(canceled.status.state, 'TASK_STATE_CANCELED');

  const send = JSON.parse(calls.find(({ init }) => init.body?.includes('message/send')).init.body);
  assert.equal(send.params.message.messageId, 'zema-job-55');
  assert.equal(send.params.message.role, 'ROLE_USER');
  assert.equal(send.params.configuration.returnImmediately, true);
  assert.equal(authorized[0].messageId, 'zema-job-55');
  assert.equal(authorized[0].targetOrigin, origin);
  assert.match(authorized[0].inputSha256, /^[0-9a-f]{64}$/);
  assert.equal(authorized[0].protocolVersion, '1.0');
  assert.equal(calls.at(-1).init.headers.get('A2A-Version'), '1.0');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[1].init.headers.get('Authorization'), 'Bearer test-secret-never-log');
});

void test('A2A 1.0 client interoperates with independent Node and Python HTTP agents', async (t) => {
  const nodeTasks = new Map();
  let nodeTaskSequence = 0;
  const nodeServer = createServer(async (request, response) => {
    const write = (status, value) => {
      const body = Buffer.from(JSON.stringify(value));
      response.writeHead(status, { 'content-type': 'application/json', 'content-length': body.length });
      response.end(body);
    };
    if (request.method === 'GET' && request.url === '/.well-known/agent-card.json') {
      const origin = `http://127.0.0.1:${nodeServer.address().port}`;
      write(200, {
        name: 'Node Fixture Agent',
        description: 'Independent Node HTTP A2A fixture for local interoperability.',
        version: '2.0.0',
        supportedInterfaces: [{ url: `${origin}/rpc`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
        capabilities: { streaming: false, pushNotifications: false },
        skills: [{ id: 'classify', name: 'Classify', description: 'Returns a local fixture result.' }],
      });
      return;
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 1_000_000) { write(413, { error: 'too_large' }); return; }
      chunks.push(chunk);
    }
    let rpc;
    try { rpc = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { write(400, { error: 'invalid_json' }); return; }
    if (request.url !== '/rpc' || request.method !== 'POST' || request.headers['a2a-version'] !== '1.0' ||
        rpc.jsonrpc !== '2.0' || typeof rpc.id !== 'string') {
      write(400, { error: 'invalid_rpc' });
      return;
    }
    const params = rpc.params ?? {};
    let result;
    if (rpc.method === 'message/send') {
      const taskId = `node-task-${++nodeTaskSequence}`;
      const text = (params.message?.parts ?? []).map((part) => part.text ?? '').join(' ');
      nodeTasks.set(taskId, { text });
      result = { task: { id: taskId, contextId: 'node-context-1', status: {
        state: nodeTaskSequence === 1 ? 'TASK_STATE_COMPLETED' : 'TASK_STATE_SUBMITTED',
      }, ...(nodeTaskSequence === 1 ? { artifacts: [{ name: 'classification', parts: [{ text: `Node received: ${text}` }] }] } : {}) } };
    } else if (rpc.method === 'tasks/get' && nodeTasks.has(params.id)) {
      result = { id: params.id, contextId: 'node-context-1', status: { state: 'TASK_STATE_COMPLETED' },
        artifacts: [{ name: 'classification', parts: [{ text: `Node received: ${nodeTasks.get(params.id).text}` }] }] };
    } else if (rpc.method === 'tasks/cancel' && nodeTasks.has(params.id)) {
      result = { id: params.id, contextId: 'node-context-1', status: { state: 'TASK_STATE_CANCELED' } };
    } else {
      write(200, { jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'Method not found' } });
      return;
    }
    write(200, { jsonrpc: '2.0', id: rpc.id, result });
  });
  nodeServer.listen(0, '127.0.0.1');
  await once(nodeServer, 'listening');
  t.after(async () => {
    nodeServer.close();
    await once(nodeServer, 'close');
  });

  const python = spawn('python3', [fileURLToPath(new URL('./fixtures/a2a/python_agent.py', import.meta.url))], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let pythonStderr = '';
  python.stderr.setEncoding('utf8').on('data', (chunk) => { pythonStderr += chunk; });
  const pythonOrigin = await new Promise((resolve, reject) => {
    let buffered = '';
    const timeout = setTimeout(() => reject(new Error(`Python fixture did not start: ${pythonStderr}`)), 5_000);
    python.stdout.setEncoding('utf8').on('data', (chunk) => {
      buffered += chunk;
      const match = buffered.match(/LISTENING:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    python.once('error', (error) => { clearTimeout(timeout); reject(error); });
    python.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Python fixture exited ${code}: ${pythonStderr}`)); });
  });
  t.after(async () => {
    if (python.exitCode !== null) return;
    python.kill('SIGTERM');
    const exited = once(python, 'exit').catch(() => undefined);
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
    if (python.exitCode === null) python.kill('SIGKILL');
  });

  async function exercise(origin, expectedName, expectedVersion, providerLabel, initialState) {
    const approvals = [];
    const client = createA2AClient({
      allowedOrigins: [origin],
      authorizeDelegation: async (intent) => approvals.push(intent),
    });
    const card = await client.discoverAtOrigin(origin);
    assert.equal(card.name, expectedName);
    assert.equal(card.version, expectedVersion);
    const first = await client.sendMessage(card, `interop-${providerLabel}-1`, 'Summarize this approved task.');
    assert.equal(first.kind, 'task');
    if (first.kind !== 'task') throw new Error('fixture agent returned a message instead of a task');
    assert.equal(first.task.status.state, initialState);
    const completed = await client.getTask(card, first.task.id);
    assert.equal(completed.status.state, 'TASK_STATE_COMPLETED');
    assert.match(completed.artifacts?.[0]?.parts?.[0]?.text, /received: Summarize this approved task\./);
    const second = await client.sendMessage(card, `interop-${providerLabel}-2`, 'Cancel this approved task.');
    assert.equal(second.kind, 'task');
    if (second.kind !== 'task') throw new Error('fixture agent returned a message instead of a task');
    const canceled = await client.cancelTask(card, second.task.id);
    assert.equal(canceled.status.state, 'TASK_STATE_CANCELED');
    assert.equal(approvals.length, 2);
    assert(approvals.every((intent) => intent.targetOrigin === origin && intent.protocolVersion === '1.0'));
    assert(approvals.every((intent) => /^[a-f0-9]{64}$/.test(intent.inputSha256)));
  }

  await exercise(`http://127.0.0.1:${nodeServer.address().port}`, 'Node Fixture Agent', '2.0.0', 'node', 'TASK_STATE_COMPLETED');
  await exercise(pythonOrigin, 'Python Fixture Agent', '1.0.0', 'python', 'TASK_STATE_SUBMITTED');
});

void test('message/send transport ambiguity raises indeterminate and never retries', async () => {
  let sends = 0;
  const client = createA2AClient({
    allowedOrigins: [origin],
    authorizeDelegation: async () => {},
    fetch: async (_url, init = {}) => {
      if (init.method === 'GET') return jsonResponse(card);
      sends += 1;
      throw new Error('connection lost after request');
    },
  });
  const discovered = await client.discover(`${origin}/.well-known/agent-card.json`);
  await assert.rejects(
    client.sendMessage(discovered, 'stable-message-id', '仕事を委任'),
    (error) => error instanceof A2ARequestIndeterminateError && error.messageId === 'stable-message-id',
  );
  assert.equal(sends, 1);
});

void test('message/send server failure remains indeterminate instead of being retried', async () => {
  const client = createA2AClient({
    allowedOrigins: [origin],
    authorizeDelegation: async () => {},
    fetch: async (_url, init = {}) => init.method === 'GET'
      ? jsonResponse(card)
      : jsonResponse({ error: 'worker timed out' }, 503),
  });
  const discovered = await client.discoverAtOrigin(origin);
  await assert.rejects(
    client.sendMessage(discovered, 'job-503', 'run once'),
    (error) => error instanceof A2ARequestIndeterminateError && error.messageId === 'job-503',
  );
});

void test('discovery and Agent Card checks fail closed on unapproved or unsupported endpoints', async () => {
  const client = createA2AClient({ allowedOrigins: [origin], fetch: async () => jsonResponse(card) });
  await assert.rejects(client.discoverAtOrigin('https://unapproved.example'), { code: 'a2a_origin_not_approved' });
  assert.throws(
    () => parseA2AAgentCard({ ...card, supportedInterfaces: [{ ...card.supportedInterfaces[0], protocolVersion: '0.3' }] }),
    { code: 'unsupported_a2a_interface' },
  );
  assert.throws(
    () => parseA2AAgentCard({ ...card, name: '' }),
    { code: 'invalid_agent_card' },
  );
  assert.throws(
    () => parseA2AAgentCard({
      ...card,
      capabilities: { extensions: [{ uri: 'https://example.test/required/v1', required: true }] },
    }),
    { code: 'unsupported_a2a_extension' },
  );
});

void test('an unapproved Agent Card endpoint cannot redirect authenticated requests', async () => {
  const client = createA2AClient({
    allowedOrigins: [origin],
    bearerToken: 'secret',
    authorizeDelegation: async () => {},
    fetch: async () => jsonResponse({
      ...card,
      supportedInterfaces: [{ ...card.supportedInterfaces[0], url: 'https://other.example/a2a' }],
    }),
  });
  const discovered = await client.discover(`${origin}/.well-known/agent-card.json`);
  await assert.rejects(client.sendMessage(discovered, 'job-1', 'run'), { code: 'a2a_origin_not_approved' });
});

void test('sending is denied unless the Broker authorization callback is wired', async () => {
  let requests = 0;
  const client = createA2AClient({
    allowedOrigins: [origin],
    fetch: async () => { requests += 1; return jsonResponse(card); },
  });
  const discovered = await client.discover(`${origin}/.well-known/agent-card.json`);
  await assert.rejects(client.sendMessage(discovered, 'job-2', 'run'), { code: 'delegation_authorization_required' });
  assert.equal(requests, 1, 'only Agent Card discovery may have been sent');
});
