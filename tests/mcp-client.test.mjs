import test from 'node:test';
import assert from 'node:assert/strict';
import { connectMcpSession, requestMcp } from '../lib/mcp-client.ts';
import { catalog, coreMcpToolNames } from '../lib/catalog.ts';
import { JOB_TOOLS, SKY_CONNECTION_TOOLS } from '../lib/operations.ts';

const token = 'SYNTHETIC-LOCAL-SESSION-XXXXXXXXXXXXXXXXXXXXXXXX';
const profile = {
  baseUrl: 'http://127.0.0.1:38479', accept: 'application/json, text/event-stream',
  protocols: ['2025-11-25', '2025-06-18'], clientInfo: { name: 'test', version: '1' },
  minimumTokenLength: 32,
};

await test('one catalog defines connection identity and preserves the restricted tracked-job boundary', () => {
  assert.equal(catalog.length, 34);
  assert.equal(new Set(SKY_CONNECTION_TOOLS).size, SKY_CONNECTION_TOOLS.length);
  assert.deepEqual(new Set(SKY_CONNECTION_TOOLS), new Set(catalog.map(({ id }) => id)));
  assert.equal(SKY_CONNECTION_TOOLS.filter((id) => id === 'rockstar-ip-studio').length, 1);
  assert.deepEqual(new Set(JOB_TOOLS), new Set([
    ...catalog.filter(({ status }) => status === 'candidate').map(({ id }) => id),
    'coconala', 'mr-free-article', 'mr-citations', 'mr-delivery',
  ]));
  assert.equal(JOB_TOOLS.includes('jev-evaluation'), false, 'catalog ready never grants tracked execution');
  assert.deepEqual(new Set(coreMcpToolNames), new Set(['coconala_check', 'make_free_article', 'format_citations', 'verify_delivery']));
  assert.equal(coreMcpToolNames.length, 4);
});

await test('handshake never sends a token to connect, propagates only the negotiated protocol and forbids redirects', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    assert.equal(init.redirect, 'error');
    if (url.endsWith('/connect')) return Response.json({ token });
    if (body.method === 'initialize') return Response.json({ result: { protocolVersion: '2025-06-18' } });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return Response.json({ result: { tools: [{ name: 'read_only' }] } });
  });
  const result = await connectMcpSession(profile);
  assert.equal(result.protocolVersion, '2025-06-18');
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[1].init.headers['MCP-Protocol-Version'], undefined);
  for (const call of calls.slice(1)) assert.equal(call.init.headers.Authorization, 'Bearer ' + token);
  for (const call of calls.slice(2)) assert.equal(call.init.headers['MCP-Protocol-Version'], '2025-06-18');
  assert.equal(calls.some(({ body }) => body.method === 'tools/call'), false);
});

for (const scenario of ['short-token', 'wrong-server', 'unsupported-protocol', 'notification-not-202']) {
  await test(`handshake fails closed before discovery on ${scenario}`, async (t) => {
    const methods = [];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      const body = JSON.parse(init.body); methods.push(body.method || 'connect');
      if (url.endsWith('/connect')) return Response.json({ token: scenario === 'short-token' ? 'short' : token, server: scenario === 'wrong-server' ? 'other' : 'fashion' });
      if (body.method === 'initialize') return Response.json({ result: { protocolVersion: scenario === 'unsupported-protocol' ? '1900-01-01' : '2025-11-25' } });
      if (body.method === 'notifications/initialized') return new Response(null, { status: 200 });
      assert.fail('discovery must not run after a failed handshake');
    });
    await assert.rejects(connectMcpSession({ ...profile, serverName: 'fashion', initializedStatus: 202 }));
    assert.equal(methods.includes('tools/list'), false);
  });
}

await test('ambiguous tool failure is sent once and preserves the exact approved arguments', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    throw new Error('response lost');
  });
  const args = { approval_id: 'fixture-approved', digest: 'fixture-digest', amount: 0 };
  await assert.rejects(requestMcp({ ...profile, token }, 'tools/call', { name: 'approval.execute', arguments: args }), { code: 'network' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.params, { name: 'approval.execute', arguments: args });
});

await test('RPC errors and malformed results cannot become successful tool results', async (t) => {
  for (const payload of [{ error: { message: 'denied' } }, { result: null }, { result: [] }, {}]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
    await assert.rejects(requestMcp({ ...profile, token }, 'tools/call', { name: 'example', arguments: {} }));
    mock.mock.restore();
  }
});
