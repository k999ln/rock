// Noah のメニュー（components/noah-shell.tsx）の行き先が、公開の場所（avoado.si）で本当に開く事。
// 公開の画面は services/sky-web/main-page-policy.mjs の一覧に無いと 404 になる（2026-11-27、体調ノートを足した時に見つけた）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mainPageStatus } from '../services/sky-web/main-page-policy.mjs';

const shell = readFileSync(new URL('../components/noah-shell.tsx', import.meta.url), 'utf8');

void test('メニューの決まった行き先（/noah/…）は、全部、公開の場所で 200', () => {
  const fixed = [...shell.matchAll(/href: '(\/noah\/[^'?#]*)'/g)].map((match) => match[1]);
  assert.ok(fixed.includes('/noah/goals/health'), '体調ノートの入口がメニューにある');
  assert.ok(fixed.length >= 2);
  for (const path of fixed) assert.equal(mainPageStatus(path), 200, path);
});

void test('体調ノートの画面は公開の一覧にあり、下の知らない道は 404 のまま', () => {
  assert.equal(mainPageStatus('/noah/goals/health'), 200);
  assert.equal(mainPageStatus('/noah/goals/health/'), 200);
  assert.equal(mainPageStatus('/noah/goals'), 404, '目的型の一覧の画面はまだ無い');
  assert.equal(mainPageStatus('/noah/goals/unknown'), 404);
});
