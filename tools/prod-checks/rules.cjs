const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' });
  const p = await ctx.newPage();
  await p.goto(process.argv[2] || 'https://avoado.si/noah', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(8000);
  const info = await p.evaluate(() => {
    const find = (el, props) => {
      const out = [];
      const walk = (rules, media) => { for (const r of rules) {
        if (r.cssRules && !r.selectorText) { walk(r.cssRules, (r.conditionText || r.media?.mediaText || '') ); continue; }
        if (!r.selectorText) continue;
        try { if (el.matches(r.selectorText) && props.some(pr => r.style.getPropertyValue(pr))) out.push({ sel: r.selectorText.slice(0, 120), media, vals: props.map(pr => pr + ':' + r.style.getPropertyValue(pr)).filter(v => !v.endsWith(':')).join(' ') }); } catch {}
      } };
      for (const s of document.styleSheets) { try { walk(s.cssRules, ''); } catch {} }
      return out;
    };
    const a = [...document.querySelectorAll('a')].find(x => /取得/.test(x.textContent || ''));
    const more = document.querySelector('article details summary');
    return { badge: a ? find(a, ['min-height', 'height']) : null, more: more ? find(more, ['width', 'height', 'min-width', 'min-height']) : null };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
