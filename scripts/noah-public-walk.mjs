#!/usr/bin/env node
// 公開の画面を、知らない人のスマホ（幅 390）で開く。読むだけ。ボタンは押さない。
// 使い方: node scripts/noah-public-walk.mjs https://avoado.si [/noah,/noah/explore,...]
// 見る事: 横にはみ出す所・44px より小さい押す所（spec-90 の 5 章の 1）・画面が呼んで失敗した API・画面の誤り。
// task 129（docs/noah/ux-audit-2026-11-22.md の 3 章）。
import { createRequire } from 'node:module';

// Playwright はこのリポジトリの依存に入れていない（入っている環境の物を使う。NODE_PATH も見る）。
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { console.error('Playwright が見つかりません。npx playwright を使える環境で動かしてください。'); process.exit(2); }

const base = (process.argv[2] || 'https://avoado.si').replace(/\/$/, '');
const paths = (process.argv[3] || '/noah,/noah/explore,/noah/saved,/noah/activity,/noah/profile,/noah/registration,/noah/agents/new,/noah/teikibin,/noah/help,/noah/usage').split(',');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP' });
let problems = 0;
for (const path of paths) {
  const page = await context.newPage();
  const failed = [], errors = [];
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) failed.push(`${r.request().method()} ${r.url().replace(base, '')} ${r.status()}`); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(6000);
  const found = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const small = [...document.querySelectorAll('button, a[href], select, summary, [role=button]')].filter((e) => {
      const box = e.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(e).visibility === 'hidden') return false;
      const inline = e.tagName === 'A' && e.closest('p, li') && !e.className;
      return !inline && (box.width < 44 || box.height < 44);
    }).map((e) => `${e.tagName}"${(e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24)}" ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    return { overflow, small: [...new Set(small)] };
  });
  if (found.overflow > 0 || errors.length) problems++;
  console.log(`${path}: overflow ${found.overflow}px; small ${found.small.length}${found.small.length ? ' — ' + found.small.slice(0, 8).join(' | ') : ''}`);
  if (failed.length) console.log(`   API >= 400: ${[...new Set(failed)].join(' || ')}`);
  if (errors.length) console.log(`   page errors: ${errors.join(' || ')}`);
  await page.close();
}
await browser.close();
process.exitCode = problems ? 1 : 0;
