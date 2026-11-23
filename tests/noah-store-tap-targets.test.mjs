import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// task 129 の D7 の続き: PR #37（Noah Agent Store）の行の形で、評価の札のリンクが 30px、「その他の操作」が 38px、
// 詳細の「利用条件を見る」が 40px だった（本番の avoado.si で、スマホ幅・触れる画面で測った）。
const css = (file) => readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8');

await test('ストアの行: スマホの幅と触れる画面では、評価の札のリンクと「その他の操作」を 44px にする', () => {
  const pins = css('noah-pins.module.css');
  const block = /@media \(max-width:680px\), \(hover:none\) \{\n  \.storeItem \.sources a \{ min-height:44px; \}\n  \.storeItem \.more summary \{ width:44px; height:44px; \}\n\}/;
  assert.match(pins, block);
  // 元の小さい規則より後ろに置く（同じ強さなので、後ろが勝つ）。
  assert.ok(pins.search(block) > pins.indexOf('.storeItem .more summary { opacity:1; width:38px; height:38px; }'));
  assert.ok(pins.search(block) > pins.indexOf('.storeItem .sources a,.storeItem .sourceBadge { min-height:30px;'));
});

await test('詳細の「利用条件を見る」は 44px', () => {
  const catalog = css('noah-agent-catalog.module.css');
  assert.ok(catalog.lastIndexOf('.page .productPill { min-height:44px; }') > catalog.indexOf('.page .productPill { display:inline-flex; align-items:center; min-height:40px;'));
});
