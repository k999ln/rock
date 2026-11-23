const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' });
  const p = await ctx.newPage();
  await p.goto('https://avoado.si/noah', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(8000);
  const measure = () => p.evaluate(() => {
    const badge = [...document.querySelectorAll('a')].find(x => /取得/.test(x.textContent || ''));
    const more = document.querySelector('article details summary');
    return { badge: badge ? Math.round(badge.getBoundingClientRect().height) : null, more: more ? Math.round(more.getBoundingClientRect().height) : null };
  });
  const before = await measure();
  // 新しい規則を、本番のモジュールの組の名前に合わせて足す（同じ強さ・後ろ）。
  await p.evaluate(() => {
    const cls = (prefix) => [...document.querySelectorAll('[class]')].flatMap(e => [...e.classList]).find(c => c.startsWith(prefix));
    const item = cls('_storeItem_'), sources = cls('_sources_'), more = cls('_more_');
    const style = document.createElement('style');
    style.textContent = `@media (max-width:680px), (hover:none) { .${item} .${sources} a { min-height:44px; } .${item} .${more} summary { width:44px; height:44px; } }`;
    document.head.appendChild(style);
  });
  await p.waitForTimeout(500);
  console.log(JSON.stringify({ before, after: await measure() }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
