const { chromium, devices } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' });
  const page = await ctx.newPage();
  await page.goto('https://avoado.si/noah/ready', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  const cards = await page.locator('main h3 a, main a:has-text("見る")').evaluateAll(els => els.slice(0, 8).map(e => ({ text: e.innerText.trim().slice(0, 40), href: e.getAttribute('href') })));
  console.log('cards', JSON.stringify(cards));
  const buttons = await page.locator('main button').evaluateAll(els => els.slice(0, 15).map(e => e.innerText.trim().slice(0, 30)));
  console.log('buttons', JSON.stringify(buttons));
  // open Cerebrium Docs
  const link = page.locator('main a[href*="/noah/"]', { hasText: 'Cerebrium Docs' }).first();
  const href = await link.getAttribute('href').catch(() => null);
  console.log('cerebrium href', href);
  if (href) {
    await page.goto(new URL(href, 'https://avoado.si').toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    console.log('detail url', page.url());
    const b2 = await page.locator('main button, main a').evaluateAll(els => els.slice(0, 30).map(e => `${e.tagName}:${e.innerText.trim().replace(/\s+/g,' ').slice(0, 30)}`));
    console.log('detail controls', JSON.stringify(b2));
    await page.screenshot({ path: path.join(__dirname, 'explore', 'detail.png') });
  }
  await browser.close();
})();
