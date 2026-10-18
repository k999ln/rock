import assert from 'node:assert/strict';
import test from 'node:test';
import { handleSkyMcpMessage, SKY_MCP_VERSION } from '../lib/sky-codex-bridge.ts';

const rpc = (method, params, id = 1) => handleSkyMcpMessage({ jsonrpc: '2.0', id, method, params }, true);

void test('Sky bridge advertises a bounded MCP tool surface', () => {
  assert.deepEqual(rpc('server/discover').result.supportedVersions, [SKY_MCP_VERSION]);
  const listed = rpc('tools/list').result.tools;
  assert.deepEqual(listed.map((tool) => tool.name), [
    'sky_find_tools', 'sky_route_request', 'sky_format_citations',
    'sky_check_coconala', 'sky_make_free_article',
  ]);
  assert.ok(listed.every((tool) => tool.annotations.readOnlyHint));
  assert.ok(listed.every((tool) => tool.inputSchema.additionalProperties === false));
});

void test('discovery distinguishes callable tools from catalog-only tools', () => {
  const result = rpc('tools/call', { name: 'sky_find_tools', arguments: { request: '出典' } }).result.structuredContent;
  assert.equal(result.tools.find((tool) => tool.id === 'mr-citations').bridgeStatus, 'callable_here');
  const another = rpc('tools/call', { name: 'sky_find_tools', arguments: { request: '特許' } }).result.structuredContent;
  assert.equal(another.tools.find((tool) => tool.id === 'rockstar-patent-assistant').bridgeStatus, 'catalog_only');
});

void test('Sky tools execute deterministic local work without publishing or paying', () => {
  const citation = rpc('tools/call', { name: 'sky_format_citations', arguments: { markdown: '本文。（出典: [公式](https://example.com)）', language: 'ja' } }).result.structuredContent;
  assert.match(citation.markdown, /## 出典/);
  assert.equal(citation.factChecked, false);
  const route = rpc('tools/call', { name: 'sky_route_request', arguments: { request: '出典を整理' } }).result.structuredContent;
  assert.equal(route.toolId, 'mr-citations');
  assert.equal(route.executed, false);
});

void test('Sky bridge rejects anonymous, unknown, and invalid calls', () => {
  const anonymous = handleSkyMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sky_route_request', arguments: { request: '出典' } } }, false);
  assert.equal(anonymous.error.code, -32001);
  assert.equal(rpc('tools/call', { name: 'shell', arguments: { command: 'whoami' } }).error.code, -32602);
  assert.equal(rpc('tools/call', { name: 'sky_route_request', arguments: { request: '出典', extra: 'x' } }).result.isError, true);
  assert.equal(rpc('notifications/initialized', {}, undefined), null);
});
