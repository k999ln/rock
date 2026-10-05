import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalog } from '../lib/catalog.ts';
import { skyToolUiState } from '../lib/sky-tool-ui.ts';

const detail = await readFile(
  new URL('../components/sky-tool-workspace.tsx', import.meta.url),
  'utf8',
);
const home = await readFile(
  new URL('../components/sky-workspace.tsx', import.meta.url),
  'utf8',
);

void test('Jev Router remains an unconnected candidate rather than an active Sky runner', () => {
  const router = catalog.find((tool) => tool.id === 'jev-router');
  assert.ok(router);
  assert.equal(router.status, 'candidate');
  assert.equal(router.runner, 'candidate-local');
  assert.equal(skyToolUiState(router).label, 'Sky未接続・PC CLIのみ');
  assert.equal(skyToolUiState(router, { connectedTools: [router.id] }).label, 'Sky未接続・PC CLIのみ');
  assert.match(detail, /isJevRouter \? \(/);
  assert.match(detail, /Skyからのワンクリック接続は準備中/);
  assert.match(detail, /Sky Web・専用OS・スマホアプリからの自動接続は未実装/);
  assert.match(detail, /const state = skyToolUiState\(tool, runtimeContext\)/);
  assert.match(detail, /<SkyToolOverview\s+tool=\{tool\}\s+state=\{state\}/);
});

void test('Sky home never presents Jev Router registration as a working connection', () => {
  assert.match(home, /if \(tool\.id === 'jev-router'\) return '導入条件を見る'/);
  assert.match(home, /if \(tool\.id === 'jev-router'\) \{\s*setSelected\(null\);\s*router\.push\('\/sky\/tools\/jev-router'\)/);
  assert.match(home, /skyToolUiState\(tool, \{ fashionConnected, connectedTools, pcConnected: connected, service \}\)/);
  assert.match(home, /selected\.id === 'jev-router' \? \(/);
  assert.match(home, /本体はSkyに未接続です/);
});
