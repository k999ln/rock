import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// task 129 の D7: 押す所は 44px 以上。scripts/noah-public-walk.mjs で、主な 9 画面（幅 390）に残っていた物:
// 「下書きを再開・新規登録」25px・「下書きの保存量」23px・「Agentを確認する →」19px（保存・追加・利用状況の画面）、
// 「Agentを探す」23px・「タイムラインへ戻る」19px（登録サポートの画面）。どれも文字だけのリンクと、開け閉めの見出し。
const css = (file) => readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8');

await test('保存・追加・利用状況の画面: 見出しの横と空の時の文字のリンクは 44px、開け閉めの見出しは上下に 11px の余白', () => {
  const catalog = css('noah-agent-catalog.module.css');
  assert.match(catalog, /\.page \.sectionTitle a, \.page \.empty a \{ display:inline-flex; align-items:center; min-height:44px; \}/);
  // 開け閉めの印（▶）を消さないように、display は変えずに余白で 44px にする（23px + 11px × 2）。
  assert.match(catalog, /\.formPage summary \{ padding-block:11px; \}/);
});

await test('登録サポートの画面: 枠の中と画面の下の、文字だけのリンクは 44px', () => {
  assert.match(css('noah-registration.module.css'), /\.page > a, \.panel > a \{ display:inline-flex; align-items:center; min-height:44px; \}/);
});
