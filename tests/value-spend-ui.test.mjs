import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'components/value-spend-panel.tsx'), 'utf8');

void test('Value/Spend UI keeps live execution locked and shows the mandatory safety path', () => {
  assert.match(source, /disabled title="明示許可と本番受入が必要です"/);
  for (const label of ['提案', 'リスク確認', '本人承認', '隔離署名', 'Adapter', '実行記録', '照合']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /秘密鍵はAdapterへ渡さない/);
  assert.match(source, /実資金、外部API、秘密鍵には接続していません/);
  assert.match(source, /disabled={!amountIsValid \|\| emergencyStopped}/);
});

void test('Value/Spend UI separates external and game assets', () => {
  assert.match(source, /外部資産/);
  assert.match(source, /ゲーム内資産/);
  assert.match(source, /譲渡・換金・外部送出の条件を個別判定/);
});

void test('Value/Spend UI follows the Sky feed interaction model', () => {
  assert.match(source, /sky-feed-layout wallet-feed-layout/);
  assert.match(source, /sky-feed-column wallet-feed-column/);
  assert.match(source, /sky-feed-post wallet-feed-post/);
  for (const tab of ['概要', '支出', '記録']) {
    assert.match(source, new RegExp(tab));
  }
  for (const role of [
    'Value Router',
    'Polymarket Adapter',
    'Risk Guard',
    'Receipt &amp; Reconciliation',
  ]) {
    assert.match(source, new RegExp(role));
  }
});
