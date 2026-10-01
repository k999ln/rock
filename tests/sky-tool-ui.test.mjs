import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../lib/catalog.ts';
import { skyToolDetailActionLabel, skyToolUiState } from '../lib/sky-tool-ui.ts';

const tool = (id) => {
  const found = catalog.find((item) => item.id === id);
  assert.ok(found, `${id} exists in the catalog`);
  return found;
};

void test('catalog candidates stay explicitly unconnected on every Sky surface', () => {
  const candidate = tool('faster-whisper');
  assert.equal(skyToolUiState(candidate).label, '導入候補・本体未接続');
  assert.equal(skyToolUiState(candidate, { connectedTools: [candidate.id] }).label, '導入候補・下書きのみ');
  assert.equal(skyToolDetailActionLabel(candidate), '利用条件を見る');
});

void test('Jev Router remains PC CLI only even when a Sky registration record exists', () => {
  const router = tool('jev-router');
  assert.equal(skyToolUiState(router).label, 'Sky未接続・PC CLIのみ');
  assert.equal(skyToolUiState(router, { connectedTools: [router.id] }).label, 'Sky未接続・PC CLIのみ');
  assert.equal(skyToolDetailActionLabel(router), '導入条件を見る');
});

void test('live connection context changes only states that have a real runtime signal', () => {
  const brand = tool('fashion-brand-ops');
  assert.equal(skyToolUiState(brand).label, 'PCなしのブラウザ簡易版');
  assert.equal(skyToolUiState(brand, { fashionConnected: true }).label, '接続済み');
  const delivery = tool('mr-delivery');
  assert.equal(skyToolUiState(delivery).label, 'PC接続後');
  assert.equal(skyToolUiState(delivery, { pcConnected: true }).label, 'PC接続中');
});
