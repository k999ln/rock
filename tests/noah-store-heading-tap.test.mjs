import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// task 129 の D7 の続き: PR #41（Today storefront）の「注目のAgent」の見出しの「すべて見る」が、
// 本番の avoado.si（v225）のスマホ幅で 73×40px だった（scripts/noah-public-walk.mjs で測った）。押す所は 44px 以上にする。
await test('「注目のAgent」の見出しの「すべて見る」は、高さ 44px 以上', () => {
  const css = readFileSync(new URL('../components/noah-store.module.css', import.meta.url), 'utf8');
  const rule = /\.listHeading a \{[^}]*min-height: (\d+)px;/.exec(css);
  assert.ok(rule, '.listHeading a の規則がある');
  assert.ok(Number(rule[1]) >= 44, `min-height ${rule[1]}px`);
});
