import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../lib/catalog.ts';
import { skyToolExecutionScope } from '../lib/sky-tool-execution-scope.ts';
import { candidateOutputKind, outputFor } from '../lib/sky-candidate-output.ts';
import { skyToolUiState } from '../lib/sky-tool-ui.ts';

void test('every advertised service has an explicit implementation boundary', () => {
  const scopes = catalog.map((tool) => [tool.id, skyToolExecutionScope(tool)]);
  assert.equal(scopes.length, 34);
  assert.equal(scopes.filter(([, scope]) => scope === 'unavailable').length, 0);
  assert.equal(scopes.filter(([, scope]) => scope === 'template').length, 11);
  assert.equal(
    scopes.filter(([, scope]) => scope === 'connection-plan').length,
    9,
  );
  assert.equal(
    scopes.filter(([, scope]) => scope === 'browser-processing').length,
    3,
  );
  assert.equal(
    skyToolExecutionScope({ id: 'new-unimplemented-tool', status: 'ready' }),
    'unavailable',
  );
});

for (const tool of catalog.filter((tool) => candidateOutputKind(tool.id))) {
  void test(`${tool.id} produces a local ${candidateOutputKind(tool.id)}, not external execution`, () => {
    const input = '合成の試験依頼。既存入力を保存し、検証条件を確認する。';
    const output = outputFor(tool.id, input);
    assert.ok(output.includes(input));
    assert.match(output, /端末内で入力を添えた定型テンプレート/);
    assert.match(output, /AIによる分析・外部サービスの実行はしていません/);
    if (candidateOutputKind(tool.id) === 'connection-plan')
      assert.match(output, /ツール本体・外部サービス・端末は実行していません/);
    assert.throws(() => outputFor(tool.id, '   '), /入力を1行以上/);
  });
}

void test('unknown or inherited object names never become a connection plan', () => {
  for (const id of ['unknown', '__proto__', 'constructor', 'toString']) {
    assert.equal(candidateOutputKind(id), undefined);
    assert.throws(() => outputFor(id, 'synthetic'), /確認手順がありません/);
    assert.notEqual(
      skyToolUiState({ id, status: 'ready' }).className,
      'is-ready',
    );
  }
});

void test('PAPER and assisted listings do not advertise browser-only or live execution', () => {
  for (const id of ['rockstar-markets-analysis', 'mercari-revenue']) {
    const tool = catalog.find((tool) => tool.id === id);
    const status = skyToolUiState(tool);
    assert.notEqual(status.label, '今使える');
    assert.notEqual(status.detail, 'ブラウザ内で実行');
    assert.equal(
      skyToolUiState(tool, { service: { database: 'unavailable' } }).label,
      '実行記録サービスを確認中',
    );
  }
  assert.equal(
    skyToolExecutionScope(catalog.find((tool) => tool.id === 'jev-router')),
    'pc-cli',
  );
});
