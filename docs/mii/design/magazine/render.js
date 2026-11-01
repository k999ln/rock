const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + __dirname + '/spreads.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: 'mii-design-notes-06-09.pdf', width: '420mm', height: '280mm', printBackground: true, preferCSSPageSize: true });
  await b.close();
})();
