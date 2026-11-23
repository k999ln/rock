// Mac の PC だけに「ココナラの仕事」が出るか（読むだけ）。userAgentData も Mac にする。
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'https://avoado.si';
(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const [name, platform, uaPlatform] of [['mac', 'MacIntel', 'macOS'], ['linux', 'Linux x86_64', 'Linux']]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
    await ctx.addInitScript(([p, u]) => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => p });
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 0 });
      Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => ({ platform: u, mobile: false, brands: [] }) });
    }, [platform, uaPlatform]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/noah/explore`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
    out[name] = await page.locator('a[href="/noah/coconala"]').count();
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out));
})();
