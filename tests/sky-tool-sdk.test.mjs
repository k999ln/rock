import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkyToolApp } from '../toolkits/sky-tool-sdk/src/index.mjs';

void test('local SDK Tool starts without cloud credentials and protects direct calls', async (t) => {
  const localToolDirectory = await mkdtemp(join(tmpdir(), 'sky-sdk-local-'));
  t.after(() => rm(localToolDirectory, { recursive: true, force: true }));
  const app = createSkyToolApp({
    developer: {
      id: 'example-developer',
      name: 'Example Developer',
      supportUrl: 'https://example.com/support',
    },
    app: {
      id: 'com.example.local',
      name: 'Example Local',
      version: '1.0.0',
      sourceUrl: 'https://github.com/example/local',
      license: 'MIT',
    },
    localToolDirectory,
  });
  addCountTool(app);
  const runtime = await app.start();
  t.after(() => runtime.close());
  assert.match(runtime.localId, /^sdk-/);
  assert.deepEqual(runtime.registration, []);
  const response = await rpc(runtime, 1, 'tools/list');
  assert.equal(response.error, 'unauthorized');
  assert.throws(
    () => createSkyToolApp({
      developer: { id: 'example-developer', name: 'Example Developer', supportUrl: 'https://example.com/support' },
      app: { id: 'com.example.public', name: 'Example Public', version: '1.0.0', sourceUrl: 'https://github.com/example/public', license: 'MIT', publicMcpUrl: 'https://tools.example.com/mcp' },
    }),
    /公開登録にはSky URLと開発者キー/,
  );
});

void test('malformed local authentication cannot terminate the SDK process', async (t) => {
  const localToolDirectory = await mkdtemp(join(tmpdir(), 'sky-sdk-auth-'));
  const moduleUrl = new URL('../toolkits/sky-tool-sdk/src/index.mjs', import.meta.url);
  const child = spawn(process.execPath, ['--input-type=module', '--eval', `
    import { createSkyToolApp } from ${JSON.stringify(moduleUrl.href)};
    const app = createSkyToolApp({
      developer: { id: 'example-developer', name: 'Example Developer', supportUrl: 'https://example.com/support' },
      app: { id: 'com.example.auth', name: 'Example Auth', version: '1.0.0', sourceUrl: 'https://github.com/example/auth', license: 'MIT' },
      localToolDirectory: ${JSON.stringify(localToolDirectory)},
      fetch: async () => { throw new Error('Unexpected external request'); },
    });
    (${addCountTool.toString()})(app);
    const runtime = await app.start();
    process.send({ port: runtime.port, localId: runtime.localId });
    process.once('message', async () => {
      await runtime.close();
      process.disconnect();
    });
  `], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const exited = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    try { await bounded(exited); }
    finally { await rm(localToolDirectory, { recursive: true, force: true }); }
  });
  const runtime = await bounded(new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', () => reject(new Error('SDK child could not start')));
    child.once('exit', () => reject(new Error('SDK child exited before ready')));
  }));
  const descriptor = JSON.parse(await readFile(join(localToolDirectory, `${runtime.localId}.json`), 'utf8'));
  const pid = child.pid;
  assert.equal(descriptor.pid, pid);

  // Write Latin-1 explicitly: some HTTP clients encode these header characters
  // as UTF-8 on the wire, which would miss the same-character-count boundary.
  for (const supplied of ['é'.repeat(43), null, 'short', '!'.repeat(43)]) {
    const status = await new Promise((resolve, reject) => {
      let response = '';
      const socket = connect({ host: '127.0.0.1', port: runtime.port }, () => {
        const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        const header = supplied === null ? '' : `x-sky-local-secret: ${supplied}\r\n`;
        socket.write(Buffer.from(`POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${header}\r\n${body}`, 'latin1'));
      });
      socket.on('data', (chunk) => { response = (response + chunk.toString('latin1')).slice(0, 4096); });
      socket.once('error', () => reject(new Error('SDK local request failed')));
      socket.once('close', () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(response)?.[1]) || null));
      socket.setTimeout(3000, () => socket.destroy(new Error('SDK local request timed out')));
    });
    assert.equal(status, 401);
  }

  const baseUrl = `http://127.0.0.1:${runtime.port}`;
  const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  for (const [id, method, params] of [
    [2, 'tools/list', undefined],
    [3, 'tools/call', { name: 'count_characters', arguments: { text: 'Sky' } }],
  ]) {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sky-local-secret': descriptor.secret },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(response.status, 200);
    const message = await response.json();
    if (method === 'tools/list') assert.equal(message.result.tools[0].name, 'count_characters');
    else assert.deepEqual(message.result.structuredContent, { characters: 3 });
  }
  assert.equal(child.pid, pid);
  assert.equal(child.exitCode, null);
  child.send('close');
  assert.deepEqual(await bounded(exited), { code: 0, signal: null });
  assert.deepEqual(await readdir(localToolDirectory), []);
});

function bounded(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('SDK child deadline exceeded')), 5000); }),
  ]).finally(() => clearTimeout(timer));
}

function sdk(overrides = {}) {
  const calls = [];
  const mockFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.endsWith('/api/sky/tool-packages')) {
      const key = `${body.manifest.id}@${body.manifest.version}`;
      return Response.json(
        {
          package: {
            packageKey: key,
            manifestSha256: 'a'.repeat(64),
            status: 'submitted',
            installable: false,
          },
        },
        { status: 201 },
      );
    }
    if (url.endsWith('/api/sky/tool-publications'))
      return Response.json({
        package: {
          packageKey: body.packageKey,
          manifestSha256: body.manifestSha256,
          status: 'published_declared',
          installable: false,
        },
      });
    if (url.endsWith('/api/sky/tool-events'))
      return Response.json({ recorded: true }, { status: 202 });
    return Response.json({ error: 'not found' }, { status: 404 });
  };
  const app = createSkyToolApp({
    skyUrl: 'https://sky.example',
    developerToken: `sky_dev_${'a'.repeat(43)}`,
    developer: {
      id: 'example-developer',
      name: 'Example Developer',
      supportUrl: 'https://example.com/support',
    },
    app: {
      id: 'com.example.text',
      name: 'Example Text',
      version: '1.0.0',
      sourceUrl: 'https://github.com/example/text',
      license: 'MIT',
      publicMcpUrl: 'https://tools.example.com/mcp',
    },
    registration: 'required',
    autoPublish: true,
    fetch: mockFetch,
    logger: { warn() {} },
    localDiscovery: false,
    ...overrides,
  });
  return { app, calls };
}

function addCountTool(app, handler = async ({ text }) => ({ characters: [...text].length })) {
  app.tool({
    name: 'count_characters',
    title: '文字数を数える',
    description: '入力された文章のUnicode文字数を数え、構造化された結果として返します。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: { text: { type: 'string' } },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { characters: { type: 'integer' } },
    },
    handler,
  });
}

async function rpc(runtime, id, method, params) {
  const response = await fetch(`http://${runtime.host}:${runtime.port}${runtime.path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sky-installation-id': 'install_test_01',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  return response.json();
}

void test('one embedded definition registers, publishes and exposes MCP discovery', async (t) => {
  const { app, calls } = sdk();
  addCountTool(app);
  const runtime = await app.start();
  t.after(() => runtime.close());

  assert.equal(runtime.registration[0].status, 'published_declared');
  assert.equal(calls[0].body.manifest.id, 'com.example.text.count-characters');
  assert.equal(calls[0].body.manifest.capabilities.sideEffects[0], 'none');

  const initialized = await rpc(runtime, 1, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  });
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  const listed = await rpc(runtime, 2, 'tools/list');
  assert.equal(listed.result.tools[0].name, 'count_characters');
  assert.equal(listed.result.tools[0].annotations.readOnlyHint, true);
});

void test('MCP calls validate arguments, run the handler and report bounded usage', async (t) => {
  let executions = 0;
  const { app, calls } = sdk({ autoPublish: false });
  addCountTool(app, async ({ text }) => {
    executions += 1;
    return { characters: [...text].length };
  });
  const runtime = await app.start();
  t.after(() => runtime.close());

  const invalid = await rpc(runtime, 3, 'tools/call', {
    name: 'count_characters',
    arguments: { unknown: true },
  });
  assert.equal(invalid.error.code, -32602);
  assert.equal(executions, 0);

  const result = await rpc(runtime, 4, 'tools/call', {
    name: 'count_characters',
    arguments: { text: 'Rock' },
  });
  assert.equal(result.result.structuredContent.characters, 4);
  assert.equal(executions, 1);

  await new Promise((resolve) => setTimeout(resolve, 20));
  const event = calls.find(({ url }) => url.endsWith('/api/sky/tool-events'));
  assert.deepEqual(Object.keys(event.body).sort(), [
    'durationMs',
    'eventId',
    'installationId',
    'occurredAt',
    'outcome',
    'packageKey',
    'toolName',
  ]);
  assert.match(event.body.eventId, /^[0-9a-f-]{36}$/);
  assert.equal(event.body.installationId, 'install_test_01');
  assert.equal(event.body.outcome, 'succeeded');
});

void test('side-effect tools require an authorization callback', () => {
  const { app } = sdk();
  assert.throws(
    () =>
      app.tool({
        name: 'charge_customer',
        description: '確認済みの顧客と金額に対して外部決済処理を一度だけ開始します。',
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['amount'],
          properties: { amount: { type: 'integer' } },
        },
        sideEffects: ['financial'],
        handler: async () => ({ status: 'prepared' }),
      }),
    /authorize callback/,
  );
});

void test('handler results must match the declared output schema', async (t) => {
  const { app } = sdk({ registration: false, autoPublish: false });
  app.tool({
    name: 'typed_result',
    description: '宣言された出力Schemaと異なる結果を拒否する検証用Toolです。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['count'],
      properties: { count: { type: 'integer' } },
    },
    handler: async () => ({ count: 'not-an-integer' }),
  });
  const runtime = await app.start();
  t.after(() => runtime.close());
  const response = await rpc(runtime, 5, 'tools/call', {
    name: 'typed_result',
    arguments: {},
  });
  assert.equal(response.error.data.code, 'invalid_result');
});
