import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PILOT_TTL_MS, PILOT_TOOLS, connectorAuthorizationValid,
  pilotToolList, validatePilotRegistry, validatePilotRpc,
} from '../toolkits/sky-mcp-connector/pilot-policy.mjs';
import { createConnector, validateRegistry } from '../toolkits/sky-mcp-connector/server.mjs';
import { PILOT_ORIGIN } from '../toolkits/sky-mcp-connector/pilot-policy.mjs';

// Pure validation: no listening socket, /connect, random credential or Tool process.
void test('pilot registry excludes unrelated servers and SDK transports', () => {
  const path = new URL('../toolkits/sky-mcp-connector/registry.pilot.json', import.meta.url);
  const specs = validateRegistry(JSON.parse(readFileSync(path, 'utf8')), fileURLToPath(path));
  assert.doesNotThrow(() => validatePilotRegistry(specs));
  for (const invalid of [[], [...specs, { id: 'other' }], [{ ...specs[0], id: 'other' }], [{ ...specs[0], transport: 'local_http' }]])
    assert.throws(() => validatePilotRegistry(invalid), { code: 'pilot_scope_denied' });
});

void test('both MCP entrypoints can validate the same four-tool boundary', () => {
  for (const method of ['initialize', 'notifications/initialized', 'ping', 'tools/list'])
    assert.doesNotThrow(() => validatePilotRpc({ method }));
  for (const name of PILOT_TOOLS) assert.doesNotThrow(() => validatePilotRpc({ method: 'tools/call', params: { name } }));
  for (const request of [null, [], {}, { method: 'resources/read' }, { method: 'prompts/get' }, { method: 'tools/call' }, { method: 'tools/call', params: { name: 'send_payment' } }])
    assert.throws(() => validatePilotRpc(request), { code: 'pilot_scope_denied' });
});

void test('an upstream tool addition never appears in the pilot list', () => {
  const input = { tools: [...PILOT_TOOLS.map(name => ({ name })), { name: 'send_payment' }, null], nextCursor: 'next' };
  assert.deepEqual(pilotToolList(input).tools.map(tool => tool.name), PILOT_TOOLS);
  assert.equal(pilotToolList(input).nextCursor, 'next');
  assert.equal(input.tools.length, 6);
});

void test('stored-grant validation rejects expiry, missing tokens and malformed bytes', () => {
  const now = 1000, grant = { token: 'fixture', expiresAt: now + PILOT_TTL_MS };
  assert.equal(connectorAuthorizationValid('Bearer fixture', grant, now), true);
  assert.equal(connectorAuthorizationValid('Bearer fixture', grant, grant.expiresAt - 1), true);
  assert.equal(connectorAuthorizationValid('Bearer fixture', grant, grant.expiresAt), false);
  assert.equal(connectorAuthorizationValid('Bearer fixture', grant, grant.expiresAt + 1), false);
  for (const invalid of [undefined, { token: '' }, { token: 'fixture', expiresAt: NaN }, { token: 'fixture', expiresAt: Infinity }])
    assert.equal(connectorAuthorizationValid('Bearer fixture', invalid, now), false);
  assert.equal(connectorAuthorizationValid('Bearer fixturあ', grant, now), false);
  assert.equal(connectorAuthorizationValid('Bearer different', grant, now), false);
  assert.equal(connectorAuthorizationValid('Bearer fixture', grant, NaN), false);
  assert.equal(connectorAuthorizationValid('Bearer fixture', { token: 'fixture', expiresAt: null }, now), true);
});

void test('pilot HTTP rejects other origins and unauthenticated work without issuing a grant', async (t) => {
  const registryPath = fileURLToPath(new URL('../toolkits/sky-mcp-connector/registry.pilot.json', import.meta.url));
  const connector = await createConnector({ registryPath, port: 0, pilot: true });
  t.after(() => new Promise(resolve => { connector.server.closeAllConnections(); connector.server.close(resolve); }));
  const origin = `http://127.0.0.1:${connector.port}`;
  const get = (path, source) => fetch(origin + path, { headers: { Origin: source } });
  assert.equal((await get('/health', PILOT_ORIGIN)).status, 200);
  assert.equal((await get('/health', 'https://rockstaros-kaiya.noellesugar1.chatgpt.site')).status, 403);
  assert.equal((await get('/health', 'http://localhost:3000')).status, 403);
  assert.equal((await get('/servers', PILOT_ORIGIN)).status, 401);
  const unauthenticated = await fetch(origin + '/mcp', { method: 'POST', headers: { Origin: PILOT_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert.equal(unauthenticated.status, 401);
  assert.equal(connector.hub.list()[0].state, 'available');
  assert.equal(connector.hub.list()[0].passport, null);
});

void test('the published Sky origin reaches ordinary Connector health but does not gain access', async (t) => {
  const registryPath = fileURLToPath(new URL('../toolkits/sky-mcp-connector/registry.json', import.meta.url));
  const connector = await createConnector({ registryPath, port: 0 });
  t.after(() => new Promise(resolve => { connector.server.closeAllConnections(); connector.server.close(resolve); }));
  const url = `http://127.0.0.1:${connector.port}`;
  assert.equal((await fetch(url + '/health', { headers: { Origin: PILOT_ORIGIN } })).status, 200);
  assert.equal((await fetch(url + '/servers', { headers: { Origin: PILOT_ORIGIN } })).status, 401);
  assert.ok(connector.hub.list().every(server => server.passport === null));
});
