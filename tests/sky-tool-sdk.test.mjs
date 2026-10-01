import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
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
