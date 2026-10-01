import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectRemoteMcp,
  McpInspectionError,
  remoteMcpUrl,
} from '../lib/mcp-inspection.ts';

const json = (value, init = {}) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

void test('remote MCP inspection initializes, keeps the session and accepts any non-empty tool set', async () => {
  const requests = [];
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ body, headers: new Headers(init.headers) });
    if (body.method === 'initialize')
      return json(
        {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'fixture-mcp', version: '1.0.0' },
          },
        },
        { headers: { 'Mcp-Session-Id': 'fixture-session' } },
      );
    if (body.method === 'notifications/initialized')
      return new Response(null, { status: 202 });
    return json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        tools: [
          { name: 'first_tool', inputSchema: { type: 'object' } },
          { name: 'second-tool', inputSchema: { type: 'object' } },
        ],
      },
    });
  };
  const result = await inspectRemoteMcp(
    'https://tools.example.com/mcp',
    fetcher,
  );
  assert.equal(result.status, 'ready');
  assert.equal(result.protocolVersion, '2025-06-18');
  assert.equal(result.toolCount, 2);
  assert.deepEqual(result.toolNames, ['first_tool', 'second-tool']);
  assert.equal(
    requests.at(-1).headers.get('mcp-session-id'),
    'fixture-session',
  );
});

void test('remote MCP inspection treats an authentication challenge as reachable', async () => {
  const result = await inspectRemoteMcp(
    'https://tools.example.com/mcp',
    async () => new Response(null, { status: 401 }),
  );
  assert.equal(result.status, 'auth_required');
  assert.match(result.message, /OAuth/);
});

void test('remote MCP inspection reads Streamable HTTP event data', async () => {
  let request = 0;
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    request += 1;
    if (body.method === 'notifications/initialized')
      return new Response(null, { status: 202 });
    const result =
      body.method === 'initialize'
        ? {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
          }
        : { tools: [{ name: 'event_tool' }] };
    return new Response(
      `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  };
  const result = await inspectRemoteMcp(
    'https://tools.example.com/mcp',
    fetcher,
  );
  assert.equal(request, 3);
  assert.deepEqual(result.toolNames, ['event_tool']);
});

void test('remote MCP inspection blocks local and credential-bearing targets', () => {
  for (const endpoint of [
    'http://tools.example.com/mcp',
    'https://127.0.0.1/mcp',
    'https://device.local/mcp',
    'https://token:secret@tools.example.com/mcp',
  ])
    assert.throws(() => remoteMcpUrl(endpoint), McpInspectionError);
});
