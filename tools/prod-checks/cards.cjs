const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' });
  const page = await ctx.newPage();
  await page.goto('https://avoado.si/noah/ready', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  const sel = 'main a[href*="/noah/discover/agent"]';
  const cards = await page.locator(sel).evaluateAll((els) => { const seen = new Set(); return els.map((a) => { const mine = a.getAttribute('href'); let box = a; while (box.parentElement && [...box.parentElement.querySelectorAll('a[href*="/noah/discover/agent"]')].every((x) => x.getAttribute('href') === mine)) box = box.parentElement; return { href: mine, meta: box.innerText.replace(/\s+/g, ' ').slice(0, 120) }; }).filter((c) => !seen.has(c.href) && seen.add(c.href)); });
  for (const c of cards) console.log(c.meta);
  await browser.close();
})();
