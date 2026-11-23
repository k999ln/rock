const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' });
  const p = await ctx.newPage();
  await p.goto('https://avoado.si/noah', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(8000);
  const info = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find(x => /取得/.test(x.textContent || ''));
    if (!a) return null;
    const cs = getComputedStyle(a), r = a.getBoundingClientRect();
    const more = document.querySelector('article details summary');
    const ms = more ? getComputedStyle(more) : null, mr = more?.getBoundingClientRect();
    return { text: a.textContent, cls: a.className, parentCls: a.parentElement?.className, minHeight: cs.minHeight, height: r.height, display: cs.display,
      more: more ? { w: mr.width, h: mr.height, cssW: ms.width, hoverNone: matchMedia('(hover:none)').matches } : null };
  });
  console.log(JSON.stringify(info));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
