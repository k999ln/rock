import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

void test('Sky MCP displays the real PC session and discovers registered servers dynamically', () => {
  const workspace = read('components/sky-workspace.tsx');
  const center = read('components/sky-mcp-center.tsx');

  assert.match(workspace, /deviceToken/);
  assert.match(workspace, /loop-device/);
  assert.match(center, /connected: boolean/);
  assert.match(center, /onOpenDevice/);
  assert.match(center, /listMcpConnections/);
  assert.match(center, /connectMcp/);
  assert.match(center, /server\.passport\?\.tools/);
  assert.doesNotMatch(center, /demo\.sky\.local/);

  for (const id of [
    'coconala_check',
    'format_citations',
    'make_free_article',
    'verify_delivery',
  ]) {
    assert.match(center, new RegExp(id));
  }
});

void test('the onboarding screen exposes the generic Connector package and connect steps', () => {
  const source = read('components/device-connection.tsx');
  const center = read('components/sky-mcp-center.tsx');
  const server = read('toolkits/mr/mcp_server.py');

  assert.match(source, /sky-mcp-connector\.zip/);
  assert.match(source, /Sky\s+MCP接続\.command/);
  assert.match(center, /Sky MCP接続\.command/);
  assert.match(source, /このPCを接続/);
  assert.match(source, /各自動化をワンタップ接続/);
  assert.match(center, /Connectorと登録済みMCPの検出/);
  assert.match(source, /送信後の結果不明時は自動再送しません/);
  assert.match(
    server,
    /https:\/\/rockstaros-kaiya\.noellesugar1\.chatgpt\.site/,
  );
  assert.match(server, /http:\/\/localhost:3000/);
});

void test('Sky makes execution destinations and unfinished OAuth boundaries explicit', () => {
  const center = read('components/sky-mcp-center.tsx');

  assert.match(center, /接続先を選ぶ/);
  assert.match(center, /このPC/);
  assert.match(center, /Sky Cloud/);
  assert.match(center, /提供者のMCP/);
  assert.match(center, /disabled={!available}/);
  assert.match(center, /OAuthが必要な接続先は権限確認と接続証跡が揃うまで/);
  assert.match(center, /Streamable HTTP/);
  assert.match(center, /server\.transport === 'stdio'/);
  assert.match(center, /server\.transport === 'streamable_http'/);
  assert.match(center, /listMcpConnections/);
  assert.match(center, /connectMcp/);
});
