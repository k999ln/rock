import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// /noah/billing（月次請求のテスト）は公開のまま、中の API は 404 だった（使い勝手の確かめ 3 章の 18、task 128 の D9）。
// 公開の Noah では 404 にする。Sky の試験の画面は /sky/billing に残す。
await test('/noah/billing は 404 にして、Sky の試験の画面を Noah に出さない', () => {
  const page = readFileSync(new URL('../app/noah/billing/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /import \{ notFound \} from 'next\/navigation';/);
  assert.match(page, /notFound\(\);/);
  assert.doesNotMatch(page, /app\/sky\/billing\/page|sky-monthly-sandbox'/);
  const sky = readFileSync(new URL('../app/sky/billing/page.tsx', import.meta.url), 'utf8');
  assert.match(sky, /SkyMonthlySandbox/, 'Sky の試験の画面はそのまま');
});
