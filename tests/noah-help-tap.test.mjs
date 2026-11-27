import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// task 129 の D7 の続き: 本番の avoado.si の /noah/help（2026-11-27、スマホ幅）で、文の外に 1 つで置いたリンク
// 「マーケットへ戻る」（120×19px）と「Mac用Noahと導入手順を見る」（203×19px）が小さかった（scripts/noah-public-walk.mjs で測った）。
// 押す所は 44px 以上にする。文の中（p・li）のリンクは、文の行の高さのままでよい（歩きの道具も数えない）。
await test('/noah/help の、文の外に置いたリンクは、高さ 44px 以上', () => {
  const css = readFileSync(new URL('../components/sky-service-help.module.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /^([^{}]*)\{([^}]*)\}/gm;
  const found = [...css.matchAll(rule)].find(([, selectors]) => {
    const list = selectors.split(',').map((one) => one.trim());
    return list.includes('.page > a') && list.includes('.page section > a');
  });
  assert.ok(found, '.page > a と .page section > a の規則がある');
  const height = /min-height:\s*(\d+)px/.exec(found[2]);
  assert.ok(height && Number(height[1]) >= 44, `min-height ${height?.[1]}px`);
  assert.match(found[2], /display:\s*inline-flex/, 'インラインのまま、高さを持つ');

  const page = readFileSync(new URL('../components/sky-service-help.tsx', import.meta.url), 'utf8');
  assert.match(page, /<article className=\{styles\.page\}>\s*<Link href="\/noah\/marketplace">マーケットへ戻る<\/Link>/, '「マーケットへ戻る」は .page の直下');
  assert.match(page, /<section aria-labelledby="noah-help-mac">.*<\/p><Link href="\/noah\/devices#mac">/, '「Mac用Noahと導入手順を見る」は section の直下');
});
