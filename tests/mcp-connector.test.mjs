import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSkyToolApp } from '../toolkits/sky-tool-sdk/src/index.mjs';
import {
  createConnector,
  McpHub,
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
  return { request, connector };
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
    price: { model: 'free', note: 'ローカルテスト用。実行ごとの追加料金なし。' },
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
  const fixtureUrl = `http://127.0.0.1:${runtime.port}${runtime.path}`;
  assert.equal(descriptor.url, fixtureUrl);
  const direct = await fetch(fixtureUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert.equal(direct.status, 401);
  const connected = await (await request(`/servers/${runtime.localId}/connect`, {})).json();
  assert.equal(connected.passport.tools[0].name, 'count');
  assert.deepEqual(connected.passport.tools[0].outputSchema.required, ['characters']);
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
  assert.ok(fashion.passport.tools.every((tool) => tool.pricing.model === 'unknown'));
  const blocked = await request('/servers/fashion-brand-ops/prepare', {
    name: fashion.passport.tools[0].name,
    arguments: {},
  });
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error, 'paid_execution_requires_priced_a2a');

  const reconnected = await (
    await request('/servers/rock-star-mr/connect', {})
  ).json();
  assert.equal(reconnected.passport.tools.length, 4);
});

void test('remote MCP self-declared free pricing cannot authorize direct execution', async () => {
  const hub = new McpHub([{
    id: 'remote-free', name: 'Remote service', description: 'test remote MCP',
    transport: 'streamable_http', url: 'https://mcp.example.test/mcp', authEnv: null,
  }]);
  hub.entry('remote-free').transport = {
    protocol: null,
    reset() {},
    async request(message) {
      if (!('id' in message)) return null;
      const result = message.method === 'initialize'
        ? { protocolVersion: '2025-11-25', serverInfo: { name: 'fixture', version: '1' } }
        : { tools: [{
          name: 'summarize', description: 'Remote summary', inputSchema: { type: 'object' },
          _meta: { 'rockstaros.dev/pricing': { model: 'free', note: 'Provider claim' } },
        }] };
      return { jsonrpc: '2.0', id: message.id, result };
    },
  };
  const passport = await hub.connect('remote-free');
  assert.equal(passport.tools[0].pricing.model, 'free');
  assert.throws(
    () => hub.prepare('remote-free', 'summarize', {}),
    (error) => error.code === 'paid_execution_requires_priced_a2a' && error.message.includes('自己申告'),
  );
  hub.close();
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
  const executedMessage = await executed.json();
  assert.equal(executedMessage.result.isError, false);
  assert.equal(
    executedMessage.result.structuredContent.output,
    '本文。\n---\n\n## 出典\n\n- [MCP](https://modelcontextprotocol.io/)\n',
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

void test('failed reauthorization invalidates the previous Passport and approval before dispatch', async (t) => {
  const { request, connector } = await harness(t);
  assert.equal((await request('/servers/rock-star-mr/connect', {})).status, 200);
  const args = { text: 'local fixture' };
  const prepared = await (await request('/servers/rock-star-mr/prepare', {
    name: 'format_citations', arguments: args,
  })).json();
  const transport = connector.hub.entry('rock-star-mr').transport;
  const original = transport.request.bind(transport);
  let calls = 0;
  transport.request = async (message, timeout) => {
    if (message.method === 'initialize')
      throw Object.assign(new Error('fixture authorization revoked'), { code: 'authorization_required', status: 401 });
    if (message.method === 'tools/call') calls++;
    return original(message, timeout);
  };
  assert.equal((await request('/servers/rock-star-mr/connect', {})).status, 401);
  const stale = await request('/servers/rock-star-mr/execute', {
    name: 'format_citations', arguments: args,
    approvalToken: prepared.approvalToken, confirmed: true,
  });
  assert.equal(stale.status, 403);
  assert.equal(calls, 0);
  const listed = await (await request('/servers', undefined, 'GET')).json();
  assert.equal(listed.servers[0].state, 'needs_authorization');
  assert.equal(listed.servers[0].passport, null);
  transport.request = original;
  assert.equal((await request('/servers/rock-star-mr/connect', {})).status, 200);
  assert.equal((await request('/servers/rock-star-mr/execute', {
    name: 'format_citations', arguments: args,
    approvalToken: prepared.approvalToken, confirmed: true,
  })).status, 403);
  const fresh = await (await request('/servers/rock-star-mr/prepare', {
    name: 'format_citations', arguments: args,
  })).json();
  const recovered = await request('/servers/rock-star-mr/execute', {
    name: 'format_citations', arguments: args,
    approvalToken: fresh.approvalToken, confirmed: true,
  });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).result.isError, false);
});

void test('disconnect wins over an earlier delayed MCP initialize response', async (t) => {
  const { request, connector } = await harness(t);
  const transport = connector.hub.entry('rock-star-mr').transport;
  const original = transport.request.bind(transport);
  const reached = Promise.withResolvers(), resume = Promise.withResolvers();
  const sent = [];
  transport.request = async (message, timeout) => {
    sent.push(message.method);
    const response = await original(message, timeout);
    if (message.method === 'initialize') {
      reached.resolve();
      await resume.promise;
    }
    return response;
  };
  const connecting = request('/servers/rock-star-mr/connect', {});
  try {
    await reached.promise;
    assert.equal((await request('/servers/rock-star-mr/disconnect', {})).status, 200);
  } finally { resume.resolve(); }
  assert.equal((await connecting).status, 409);
  assert.deepEqual(sent, ['initialize']);
  const listed = await (await request('/servers', undefined, 'GET')).json();
  assert.equal(listed.servers[0].state, 'available');
  assert.equal(listed.servers[0].passport, null);
  assert.equal((await request('/servers/rock-star-mr/prepare', {
    name: 'format_citations', arguments: { text: 'stopped fixture' },
  })).status, 409);
});

void test('late local HTTP MCP responses cannot replace the current connection or session', async (t) => {
  for (const scenario of ['reconnect', 'late_auth_failure', 'remove', 'replace']) {
    await t.test(scenario, async (t) => {
      const directory = await mkdtemp(join(tmpdir(), 'sky-mcp-race-'));
      t.after(() => rm(directory, { recursive: true, force: true }));
      const reached = Promise.withResolvers(), resume = Promise.withResolvers();
      const delayedMethod = scenario === 'late_auth_failure' ? 'tools/list' : 'initialize';
      let delayed = false, initializations = 0;
      const seen = [];
      const upstream = createServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        seen.push(message.method);
        if (!('id' in message)) { response.writeHead(202); response.end(); return; }
        if (message.method === 'initialize') initializations++;
        const version = initializations;
        const result = message.method === 'initialize'
          ? { protocolVersion: '2025-11-25', serverInfo: { name: 'race fixture', version: String(version) }, capabilities: { tools: {} } }
          : { tools: [{ name: 'fixture', inputSchema: { type: 'object' } }] };
        if (!delayed && message.method === delayedMethod) {
          delayed = true;
          reached.resolve();
          await resume.promise;
          if (scenario === 'late_auth_failure') { response.writeHead(401); response.end('{}'); return; }
        }
        response.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': `session-${version}` });
        response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
      });
      await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
      t.after(() => { resume.resolve(); return new Promise(resolve => upstream.close(resolve)); });
      const id = `sdk-${'a'.repeat(24)}`;
      const path = join(directory, `${id}.json`);
      const descriptor = {
        schema: 'sky-local-tool/1', id, name: 'Race fixture', description: 'Local synthetic MCP',
        transport: 'local_http', url: `http://127.0.0.1:${upstream.address().port}/mcp`,
        secret: 'a'.repeat(43), pid: process.pid, toolPricing: [{ name: 'fixture', model: 'free' }],
      };
      await writeFile(path, JSON.stringify(descriptor), { mode: 0o600 });
      const { request, connector } = await harness(t, { localToolDirectory: directory });
      const pending = request(`/servers/${id}/connect`, {});
      try {
        await reached.promise;
        if (scenario === 'remove') {
          await rm(path);
          const listed = await (await request('/servers', undefined, 'GET')).json();
          assert.equal(listed.servers.some(entry => entry.id === id), false);
        } else {
          if (scenario === 'replace')
            await writeFile(path, JSON.stringify({ ...descriptor, secret: 'b'.repeat(43) }), { mode: 0o600 });
          const connected = await request(`/servers/${id}/connect`, {});
          assert.equal(connected.status, 200);
          assert.equal((await connected.json()).passport.server.version, '2');
        }
      } finally { resume.resolve(); }
      assert.equal((await pending).status, 409);
      if (scenario === 'remove') {
        assert.equal(connector.hub.entries.has(id), false);
        assert.deepEqual(seen, ['initialize']);
      } else {
        const entry = connector.hub.entry(id);
        assert.equal(entry.state, 'connected');
        assert.equal(entry.passport.server.version, '2');
        assert.equal(entry.transport.sessionId, 'session-2');
        assert.equal(seen.filter(method => method === 'notifications/initialized').length,
          scenario === 'late_auth_failure' ? 2 : 1);
      }
    });
  }
});

async function paginationHarness(t, list) {
  const directory = await mkdtemp(join(tmpdir(), 'sky-mcp-pages-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cursors = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!('id' in message)) { response.writeHead(202); response.end(); return; }
    let result;
    if (message.method === 'initialize') {
      result = { protocolVersion: '2025-11-25', serverInfo: { name: 'pages fixture', version: '1' }, capabilities: { tools: {} } };
    } else if (message.method === 'tools/list') {
      cursors.push(message.params.cursor);
      // A broken client must terminate the test without running an infinite fixture.
      result = cursors.length > 7 ? { tools: [] } : await list(cursors.length, message.params.cursor);
    } else {
      response.writeHead(500); response.end('{}'); return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => upstream.close(resolve)));
  const id = `sdk-${'c'.repeat(24)}`;
  await writeFile(join(directory, `${id}.json`), JSON.stringify({
    schema: 'sky-local-tool/1', id, name: 'Pages fixture', description: 'Local synthetic MCP',
    transport: 'local_http', url: `http://127.0.0.1:${upstream.address().port}/mcp`,
    secret: 'c'.repeat(43), pid: process.pid, toolPricing: [],
  }), { mode: 0o600 });
  return { ...await harness(t, { localToolDirectory: directory }), id, cursors };
}

void test('MCP pagination rejects looping, unbounded and invalid cursors before publishing a Passport', async (t) => {
  const cases = [
    { name: 'repeated cursor with no tools', cursor: () => 'same', pages: 2 },
    { name: 'cursor cycle with no tools', cursor: page => page % 2 ? 'first' : 'second', pages: 3 },
    { name: 'fresh cursors with no tools', cursor: page => `page-${page}`, pages: 5, status: 409, error: 'too_many_tool_pages' },
    ...[null, false, 0, 1, {}, [], '', 'é'.repeat(513)].map((cursor, index) => ({
      name: `invalid cursor ${index}`, cursor: () => cursor, pages: 1,
    })),
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async (t) => {
      const { request, connector, id, cursors } = await paginationHarness(t, page => ({ tools: [], nextCursor: scenario.cursor(page) }));
      const response = await request(`/servers/${id}/connect`, {});
      assert.equal(response.status, scenario.status ?? 502);
      assert.equal((await response.json()).error, scenario.error ?? 'invalid_tools_cursor');
      assert.equal(cursors.length, scenario.pages);
      assert.equal(connector.hub.entry(id).state, 'error');
      assert.equal(connector.hub.entry(id).passport, null);
      assert.equal((await request(`/servers/${id}/prepare`, { name: 'fixture', arguments: {} })).status, 409);
    });
  }
});

void test('MCP pagination accepts five complete pages including an empty intermediate page', async (t) => {
  const { request, id, cursors } = await paginationHarness(t, page => ({
    tools: page === 2 ? [] : [{ name: `fixture-${page}`, inputSchema: { type: 'object' } }],
    ...(page < 5 ? { nextCursor: page === 1 ? 'é'.repeat(512) : `page-${page}` } : {}),
  }));
  const response = await request(`/servers/${id}/connect`, {});
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).passport.tools.map(tool => tool.name), ['fixture-1', 'fixture-3', 'fixture-4', 'fixture-5']);
  assert.deepEqual(cursors, [undefined, 'é'.repeat(512), 'page-2', 'page-3', 'page-4']);
});

void test('disconnect during the final MCP page wins over pagination failure', async (t) => {
  const reached = Promise.withResolvers(), resume = Promise.withResolvers();
  t.after(() => resume.resolve());
  const { request, connector, id, cursors } = await paginationHarness(t, async page => {
    if (page === 5) { reached.resolve(); await resume.promise; }
    return { tools: [], nextCursor: `page-${page}` };
  });
  const pending = request(`/servers/${id}/connect`, {});
  try {
    await reached.promise;
    assert.equal((await request(`/servers/${id}/disconnect`, {})).status, 200);
  } finally { resume.resolve(); }
  const response = await pending;
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'connection_superseded');
  assert.equal(cursors.length, 5);
  assert.equal(connector.hub.entry(id).state, 'available');
  assert.equal(connector.hub.entry(id).passport, null);
});

void test('legacy MCP refuses changed processor identity before transport dispatch', async (t) => {
  const { request, connector } = await harness(t);
  const entry = connector.hub.entry('rock-star-mr');
  const original = entry.spec;
  let dispatched = 0;
  entry.transport.request = async () => { dispatched++; return { result: {} }; };
  const message = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  for (const change of [
    { id: 'example-tool' },
    { transport: 'local_http' },
    { command: 'node' },
    { cwd: join(original.cwd, 'different') },
    { args: ['different.py'] },
    { args: [...original.args, '--extra'] },
    { envNames: ['EXAMPLE_SETTING'] },
  ]) {
    entry.spec = { ...original, ...change };
    const response = await request('/mcp', message);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'legacy_mcp_not_supported');
    assert.equal(dispatched, 0);
  }
  entry.spec = original;
  const normal = await request('/mcp', message);
  assert.equal(normal.status, 200);
  assert.equal(dispatched, 1);
});

void test('legacy MCP limits dispatch to bundled operations and keeps the generic approval gate', async (t) => {
  const { request, connector } = await harness(t);
  const entry = connector.hub.entry('rock-star-mr');
  const dispatched = [];
  entry.transport.request = async (message) => {
    dispatched.push(message);
    return message.method === 'notifications/initialized' ? null : { jsonrpc: '2.0', id: message.id, result: {} };
  };
  for (const input of [
    { method: 'tools/call', params: { name: 'additional_tool' } },
    null, {}, [], { method: 'resources/read' }, { method: 'tools/call' },
  ]) {
    const response = await request('/mcp', input);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'legacy_mcp_not_supported');
    assert.equal(dispatched.length, 0);
  }
  for (const method of ['initialize', 'notifications/initialized', 'ping', 'tools/list']) {
    const message = { jsonrpc: '2.0', id: 2, method };
    const response = await request('/mcp', message);
    assert.equal(response.status, method === 'notifications/initialized' ? 202 : 200);
    assert.deepEqual(dispatched.at(-1), message);
  }
  for (const name of ['coconala_check', 'format_citations', 'make_free_article', 'verify_delivery']) {
    const message = { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: {} } };
    const response = await request('/mcp', message);
    assert.equal(response.status, 200);
    assert.deepEqual(dispatched.at(-1), message);
    const direct = await request('/servers/rock-star-mr/mcp', message);
    assert.equal(direct.status, 403);
    assert.equal((await direct.json()).error, 'approval_required');
  }
  assert.equal(dispatched.length, 8);
});

void test('legacy MCP preserves the real bundled lifecycle and four local processors', async (t) => {
  const { request } = await harness(t);
  const rpc = async (method, params, id = 1) => {
    const response = await request('/mcp', { jsonrpc: '2.0', id: method === 'notifications/initialized' ? undefined : id, method, params });
    assert.equal(response.status, method === 'notifications/initialized' ? 202 : 200);
    return response.status === 202 ? null : await response.json();
  };
  const initialized = await rpc('initialize', { protocolVersion: '2025-11-25' });
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  assert.equal(await rpc('notifications/initialized'), null);
  assert.deepEqual((await rpc('ping')).result, {});
  const listed = await rpc('tools/list');
  assert.deepEqual(listed.result.tools.map((tool) => tool.name).sort(), [
    'coconala_check', 'format_citations', 'make_free_article', 'verify_delivery',
  ]);
  const fixtures = new URL('../toolkits/mr/examples/', import.meta.url);
  const inputs = [
    ['coconala_check', JSON.parse(await readFile(new URL('coconala.json', fixtures), 'utf8'))],
    ['format_citations', { text: '本文。（出典: [MCP](https://modelcontextprotocol.io/)）' }],
    ['make_free_article', {
      markdown: await readFile(new URL('article.md', fixtures), 'utf8'),
      summary: await readFile(new URL('summary.md', fixtures), 'utf8'),
      afterChars: 40, price: 500, paidContents: '作業手順', noteUrl: 'https://note.com/example/n/example',
    }],
    ['verify_delivery', { sample: true }],
  ];
  for (const [name, args] of inputs) {
    const response = await rpc('tools/call', { name, arguments: args });
    assert.equal(response.result.isError, false);
    const result = response.result.structuredContent;
    assert.equal(typeof result.output, 'string');
    assert.ok(result.output.length > 0);
    if (name === 'format_citations')
      assert.equal(result.output, '本文。\n---\n\n## 出典\n\n- [MCP](https://modelcontextprotocol.io/)\n');
    if (name === 'coconala_check' || name === 'verify_delivery')
      assert.equal(result.status, 'PASS');
  }
});
