import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noahMacMenuAllowed } from '../lib/noah-surface.ts';

// メニューの「ココナラの仕事」は「このMacに接続」だけで動く（127.0.0.1 の Mac の接続）。
// スマホの人は開いても先へ進めないのに、公開のメニューに全員へ出ていた（使い勝手の確かめ 3 章の 17、本人の判断 Q5）。
// 決め（2026-11-23、本人「好きにしていいよ」）: Mac で開いた時だけメニューに出す。画面そのものは残す。

await test('Mac の PC だけが Mac の画面をメニューに出し、スマホ・iPad・ほかの PC は出さない', () => {
  assert.equal(noahMacMenuAllowed('MacIntel', 0), true);
  assert.equal(noahMacMenuAllowed('macOS', 0), true);
  assert.equal(noahMacMenuAllowed('MacIntel', 5), false, 'iPad は Mac と名乗るが、触れる画面');
  assert.equal(noahMacMenuAllowed('iPhone', 5), false);
  assert.equal(noahMacMenuAllowed('Linux armv81', 5), false);
  assert.equal(noahMacMenuAllowed('Android', 5), false);
  assert.equal(noahMacMenuAllowed('Win32', 0), false);
  assert.equal(noahMacMenuAllowed('', 0), false);
});

await test('ココナラは専用メニューを置かずホームへ統合し、個別Agentを保持する', () => {
  const shell = readFileSync(new URL('../components/noah-shell.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /ココナラの仕事|href: '\/noah\/coconala'/);
  const page = readFileSync(new URL('../app/noah/coconala/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /permanentRedirect\('\/noah'\)/);
  assert.ok(readFileSync(new URL('../app/noah/coconala/agent/page.tsx', import.meta.url), 'utf8').length);
});
