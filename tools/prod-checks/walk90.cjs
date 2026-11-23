// 本番の一周（spec-90 の 5 章の表）を、スマホ幅（iPhone 13 相当、390px）のブラウザで、知らない人として行う。
// 書き込みあり（接続・依頼・切る）。本人「好きにしていいよ」（2026-11-23）。最後に接続は切る。
// 1: 横に動かない / 2: 押すだけで試せる → 接続 → 5 秒以内に道具 / 3: 押すだけの道具で成果
// 4: 入力の要る道具は、送らずに欄と誤りの出方だけ見る / 5: 読み取りだけでない道具は、確かめが出て「やめる」で何も送らない
// 6: 頼んだ直後にブラウザを閉じ、1 分後に開いて仕事の一覧に成果 / 7: 頼んだ直後に別の Agent へ移れる / 10: 切る
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'https://avoado.si';
const OUT = path.join(__dirname, 'walk90');
fs.mkdirSync(OUT, { recursive: true });
const res = { base: BASE, at: new Date().toISOString(), rows: {}, notes: [] };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => undefined);
const save = () => fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(res, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openReadyCard(page, { skip = 0, exclude = null, prefer = null } = {}) {
  await page.goto(`${BASE}/noah/ready`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
  // 今の一覧（PR #37 の Store）には「押すだけで試せる」の絞りが無い。カードの下の行が「スマホで今すぐ」の物を選ぶ。
  await page.getByText('スマホで今すぐ').first().waitFor({ timeout: 20000 }).catch(() => undefined);
  const cards = await page.locator('main a[href*="/noah/discover/agent"], main a[href*="/noah/ready/"]').evaluateAll((els) => els.map((a) => {
    // そのカードだけを含む一番大きい箱（ほかのカードのリンクを含まない所まで）を見る。
    const sel = 'a[href*="/noah/discover/agent"], a[href*="/noah/ready/"]';
    const mine = a.getAttribute('href');
    let box = a; while (box.parentElement && [...box.parentElement.querySelectorAll(sel)].every((x) => x.getAttribute('href') === mine)) box = box.parentElement;
    const lines = box.innerText.split('\n').map((x) => x.trim()).filter(Boolean);
    return { name: lines[2] || lines[0], text: box.innerText, href: a.getAttribute('href'), instant: box.innerText.includes('スマホで今すぐ') };
  }));
  const pool = cards.filter((c) => c.instant && c.href && c.href !== exclude);
  const pick = (prefer && pool.find((c) => c.text.includes(prefer))) || pool[skip];
  if (!pick) throw new Error(`スマホで今すぐのカードが無い（${cards.length} 枚）`);
  await page.goto(new URL(pick.href, BASE).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
  return pick.name;
}

async function connect(page) {
  const button = page.getByRole('button', { name: '接続', exact: true });
  await button.waitFor({ timeout: 20000 });
  const started = Date.now();
  await button.click();
  await page.locator('[data-tool-name]').first().waitFor({ timeout: 30000 });
  return (Date.now() - started) / 1000;
}

async function pickTool(page, mark) {
  const tools = page.locator('[data-tool-name]');
  const count = await tools.count();
  for (let i = 0; i < count; i += 1) {
    const text = await tools.nth(i).innerText();
    if (mark(text)) {
      const name = await tools.nth(i).getAttribute('data-tool-name');
      await tools.nth(i).click();
      return { name, text: text.replace(/\s+/g, ' ').slice(0, 120) };
    }
  }
  return null;
}

async function submitEnabled(page) {
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button[type=submit]')].find((x) => x.textContent.trim() === '頼む');
    return !!b && !b.disabled;
  }, null, { timeout: 20000 });
}

async function cut(page) {
  const button = page.getByRole('button', { name: '切る', exact: true });
  if (!(await button.isVisible().catch(() => false))) return false;
  await button.click();
  await page.waitForTimeout(2500);
  return true;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' });
  let page = await ctx.newPage();
  let agentUrl = null;
  try {
    // 1
    await page.goto(`${BASE}/noah/ready`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    res.rows[1] = { overflowPx: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) };
    await shot(page, 'r1-ready');
    save();

    // 2
    const agent = await openReadyCard(page, { prefer: 'Carfinity' });
    agentUrl = page.url();
    const seconds = await connect(page);
    res.rows[2] = { agent, url: agentUrl, secondsToTools: seconds, stayedOnScreen: page.url() === agentUrl, ok: seconds <= 5 && page.url() === agentUrl };
    await shot(page, 'r2-connected');
    save();

    // 5 は本番では試さない（確かめが出ない不具合があると、相手のサーバーへ本当に送ってしまうため）。手元の試験（tests/noah-phone-loop など）で見る。
    res.rows[5] = { skipped: '本番では送らない。手元の試験で確かめる' };
    // 4（入力の要る道具: 送らずに、必須の欄を空で「頼む」→ 欄の下に誤り）
    const needsInput = await pickTool(page, (t) => t.includes('読み取りだけ') && !t.includes('押すだけ'));
    if (needsInput) {
      await page.waitForTimeout(800);
      const labels = await page.locator('form label, form legend').allInnerTexts().catch(() => []);
      const submit = page.getByRole('button', { name: '頼む', exact: true });
      let errorShown = null;
      if (await submit.isEnabled().catch(() => false)) {
        await submit.click();
        await page.waitForTimeout(1200);
        errorShown = await page.locator('form [role=alert], form [aria-invalid=true]').count();
      }
      await shot(page, 'r4-input');
      const sent = await page.getByText(/が返した内容です/).count();
      res.rows[4] = { tool: needsInput.name, fields: labels.slice(0, 8).map((s) => s.replace(/\s+/g, ' ').slice(0, 60)), errorsShown: errorShown, nothingSent: sent === 0 };
      await page.locator(`[data-tool-name="${needsInput.name}"]`).click().catch(() => undefined);
    } else res.rows[4] = { note: 'この Agent に、入力の要る読み取りだけの道具が無い' };
    save();

    // 3（押すだけの道具で頼む）
    const oneTap = await pickTool(page, (t) => t.includes('押すだけ'));
    if (!oneTap) throw new Error('押すだけの道具が見つからない');
    await submitEnabled(page);
    const asked = Date.now();
    await page.getByRole('button', { name: '頼む', exact: true }).click();
    const confirm = page.getByRole('button', { name: '確かめて頼む', exact: true });
    if (await confirm.waitFor({ timeout: 3000 }).then(() => true).catch(() => false)) await confirm.click();
    await page.getByText(/が返した内容です/).first().waitFor({ timeout: 120000 });
    res.rows[3] = { tool: oneTap.name, secondsToResult: (Date.now() - asked) / 1000, ok: true };
    await shot(page, 'r3-result');
    save();

    // 7（頼んだ直後に、別の Agent の画面へ移る）
    await pickTool(page, (t) => t.includes('押すだけ')).catch(() => null);
    await page.locator(`[data-tool-name="${oneTap.name}"]`).click().catch(() => undefined);
    await submitEnabled(page).catch(() => undefined);
    await page.getByRole('button', { name: '頼む', exact: true }).click().catch(() => undefined);
    await page.waitForTimeout(300);
    const other = await openReadyCard(page, { exclude: new URL(agentUrl).pathname + new URL(agentUrl).search });
    res.rows[7] = { movedTo: other, url: page.url(), ok: page.url() !== agentUrl };
    await shot(page, 'r7-moved');
    save();

    // 6（頼んだ直後にブラウザを閉じて、1 分後に開く）
    await page.goto(agentUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-tool-name]').first().waitFor({ timeout: 30000 });
    await page.locator(`[data-tool-name="${oneTap.name}"]`).click();
    await submitEnabled(page);
    await page.getByRole('button', { name: '頼む', exact: true }).click();
    await page.waitForTimeout(400);
    const state = await ctx.storageState();
    await page.close();
    res.notes.push(`closed at ${new Date().toISOString()}`);
    await sleep(60000);
    const ctx2 = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', storageState: state });
    page = await ctx2.newPage();
    await page.goto(agentUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(3000);
    const results = await page.getByText(/が返した内容です/).count();
    res.rows[6] = { resultsInWorkList: results, ok: results >= 2 };
    await shot(page, 'r6-reopened');
    save();

    // 10（切る）
    const didCut = await cut(page);
    await shot(page, 'r10-cut');
    const afterCut = await page.getByText(/が返した内容です/).count();
    await page.goto(`${BASE}/noah/ready`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    const connectedSection = await page.getByText('つながっているもの', { exact: true }).count();
    res.rows[10] = { pressed: didCut, resultsKept: afterCut, connectedHeadingOnReady: connectedSection, ok: didCut && afterCut >= 1 };
    await shot(page, 'r10-ready');
    agentUrl = null;
    save();
  } catch (error) {
    res.error = String(error && error.message || error).slice(0, 400);
    await shot(page, 'error');
    // 後始末: つないだままなら切る
    if (agentUrl) {
      try { await page.goto(agentUrl, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000); res.cleanupCut = await cut(page); } catch { res.cleanupCut = false; }
    }
    save();
  } finally {
    await browser.close();
    console.log(JSON.stringify(res, null, 1));
  }
})();
