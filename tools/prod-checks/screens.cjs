// 公開の後の画面の確かめ（読むだけ。書き込まない。ブラウザの本人の作成だけは起きる）。
// HANDOFF の 7: 画像の検索 > 0 / Noah 自身の案内の下の行 / スマホのメニューにココナラ無し（Mac は有り）/ 登録情報の受取口座と本人確認がロック
const { chromium, devices } = require('playwright');
const path = require('path');
const BASE = process.argv[2] || 'https://avoado.si';
const OUT = path.join(__dirname, 'walk90');
(async () => {
  const browser = await chromium.launch();
  const out = { base: BASE, at: new Date().toISOString() };
  const phone = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' });
  const p = await phone.newPage();
  const settle = async (page) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(2500); };

  // 画像の検索（前は 0 件）
  await p.goto(`${BASE}/noah/explore?q=${encodeURIComponent('画像')}`, { waitUntil: 'domcontentloaded' });
  await settle(p);
  out.searchUrl = p.url();
  out.searchCards = await p.locator('main a[href*="/noah/discover/agent"], main a[href*="/noah/ready/"]').evaluateAll((els) => new Set(els.map((a) => a.getAttribute('href'))).size);
  out.searchCountText = (await p.locator('main').innerText()).match(/(\d[\d,]*)\s*件/)?.[0] ?? null;
  await p.screenshot({ path: path.join(OUT, 'screen-search.png') });

  // Noah 自身の案内の下の行
  await p.goto(`${BASE}/noah/ready`, { waitUntil: 'domcontentloaded' });
  await settle(p);
  const main = await p.locator('main').innerText();
  out.adNotice = main.includes('Noahの案内（広告を含む）');
  out.adOldHost = /法人のsi導入準備[\s\S]{0,200}avoado\.si · Noahで接続を確認/.test(main);
  await p.screenshot({ path: path.join(OUT, 'screen-ready.png') });

  // スマホのメニュー（画面の中に、ココナラへのリンクが無い）
  await p.goto(`${BASE}/noah`, { waitUntil: 'domcontentloaded' });
  await settle(p);
  out.phoneCoconalaLinks = await p.locator('a[href="/noah/coconala"]').count();

  // 登録情報
  await p.goto(`${BASE}/noah/profile`, { waitUntil: 'domcontentloaded' });
  await settle(p);
  const profile = await p.innerText('body');
  out.profileLocked = (profile.match(/サインインした本人だけ/g) || []).length;
  out.profileReason = profile.includes('サインインした本人だけが保存できます');
  out.profileFileInputs = await p.locator('input[type=file]').count();
  await p.screenshot({ path: path.join(OUT, 'screen-profile.png'), fullPage: true });

  // 追加の画面の注記
  await p.goto(`${BASE}/noah/agents/new`, { waitUntil: 'domcontentloaded' });
  await settle(p);
  out.uploadNoteVisibleText = (await p.innerText('body')).includes('自分のMacのNoahで動きます');

  // Mac の PC（メニューにココナラが出る）と Linux の PC（出ない）
  const mac = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
  await mac.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' }); Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 0 }); });
  const m = await mac.newPage();
  await m.goto(`${BASE}/noah/explore`, { waitUntil: 'domcontentloaded' });
  await settle(m);
  out.macCoconalaLinks = await m.locator('a[href="/noah/coconala"]').count();
  const linux = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
  const l = await linux.newPage();
  await l.goto(`${BASE}/noah/explore`, { waitUntil: 'domcontentloaded' });
  await settle(l);
  out.linuxCoconalaLinks = await l.locator('a[href="/noah/coconala"]').count();

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
