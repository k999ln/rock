/** Real Chrome/touch UI regression with explicit API fixtures; not cloud-execution evidence. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.NOAH_PLAYWRIGHT_PACKAGE || 'playwright-core');
const base = process.env.NOAH_TEST_URL || 'http://localhost:4333', output = process.env.NOAH_TEST_OUTPUT;
if (!output) throw Error('NOAH_TEST_OUTPUT is required');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.NOAH_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = { browser: browser.version(), mode: 'API fixtures; real browser and touch', checks: [] };
const project = 'project-' + 'a'.repeat(64);
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 500, hasTouch: true, locale: 'ja-JP' });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    let connection = null, jobs = [], starts = 0, failRead = false, rejectStart = false, requireConfirmation = false;
    const attempts = [];
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await context.route('**/api/noah/discover/project?**', route => route.fulfill({ json: { card: { id: project, name: 'Hermes Agent', summary: '文章とファイルを作成するAgent', provider: 'NousResearch', sources: [{ source: 'github', sourceUrl: 'https://github.com/NousResearch/hermes-agent', observedAt: Date.now(), metrics: { stars: 265164 } }] }, connection: { kind: 'cloud', profile: 'hermes', providerFamilyId: null } } }));
    await context.route('**/api/noah/cloud-agents**', async route => {
      const req = route.request();
      if (req.method() === 'GET') {
        if (failRead) { failRead = false; return route.fulfill({ status: 503, json: { error: '接続を確認できません。' } }); }
        const id = new URL(req.url()).searchParams.get('jobId');
        return route.fulfill({ json: id ? { ownerScope: 'scope-a', job: jobs.find(j => j.id === id) } : { ownerScope: 'scope-a', connection, jobs } });
      }
      assert.equal(req.headers()['x-rock-owner-scope'], 'scope-a');
      const data = req.postDataJSON();
      if (data.action === 'connect') connection = { id: data.id, state: 'preparing' };
      if (data.action === 'disconnect') connection = { ...connection, state: 'disconnected' };
      if (data.action === 'start') {
        if (requireConfirmation && !data.confirm) return route.fulfill({ status: 409, json: { error: '毎回確認してください', confirmationRequired: true } });
        attempts.push(data.jobId);
        if (rejectStart) { rejectStart = false; jobs.unshift({ id: data.jobId, prompt: data.prompt, state: 'failed', files: [], error: '利用枠が埋まっています' }); return route.fulfill({ status: 429, json: { error: '利用枠が埋まっています' } }); }
        starts++; jobs.unshift({ id: data.jobId, prompt: data.prompt, state: 'running', files: [] });
      }
      if (data.action === 'stop') jobs = jobs.map(j => j.id === data.jobId ? { ...j, state: 'cancelled' } : j);
      return route.fulfill({ json: { ownerScope: 'scope-a', connection } });
    });
    try {
      await page.goto(`${base}/noah/discover/agent?id=${project}`, { waitUntil: 'domcontentloaded' });
      const panel = page.getByRole('region', { name: 'クラウドで使う' });
      const connect = panel.getByRole('button', { name: '接続して使う', exact: true }); await connect.waitFor();
      await page.screenshot({ path: `${output}/connect-${width}.png` });
      await connect.tap(); await panel.getByRole('button', { name: '準備を止める' }).waitFor();
      connection.state = 'connected'; await panel.getByText('接続済み', { exact: true }).waitFor();
      const prompt = panel.getByRole('textbox'); await prompt.tap(); await prompt.fill('1200と800を足してtotal.txtへ保存して');
      assert.ok(await prompt.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16));
      const submit = panel.getByRole('button', { name: '依頼する', exact: true }); await submit.tap();
      await panel.getByText('実行中', { exact: true }).waitFor(); assert.equal(starts, 1); assert.equal(await submit.isDisabled(), true);
      await panel.getByRole('button', { name: '停止', exact: true }).tap(); await panel.getByText('停止済み', { exact: true }).waitFor();
      rejectStart = true; await prompt.fill('ファイルを作成して'); await submit.tap(); await panel.getByText('実行できませんでした', { exact: true }).waitFor(); assert.equal(await prompt.inputValue(), 'ファイルを作成して');
      requireConfirmation = true; await submit.tap(); await panel.getByRole('button', { name: '確認して依頼', exact: true }).tap();
      await panel.getByText('実行中', { exact: true }).waitFor(); assert.notEqual(attempts.at(-1), attempts.at(-2), 'a rejected admission can be explicitly retried with a new ID');
      jobs[0] = { ...jobs[0], state: 'returned', result: { text: '合計2000を保存しました。' }, files: [{ name: 'total.txt', base64: 'MjAwMAo=', bytes: 5 }] };
      // A new page in the same owner context reads persisted API results.
      await page.reload({ waitUntil: 'domcontentloaded' }); await panel.getByText('結果を受け取りました', { exact: true }).waitFor();
      const downloaded = page.waitForEvent('download'); await panel.getByRole('button', { name: 'total.txtを保存' }).tap(); assert.equal((await downloaded).suggestedFilename(), 'total.txt');
      assert.equal(starts, 2); assert.equal(context.pages().length, 1); assert.equal(new URL(page.url()).origin, new URL(base).origin);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.waitForTimeout(250); // Let the existing tap-feedback transform settle before measuring.
      for (const button of await panel.getByRole('button').all()) { const rect = await button.boundingBox(); if (rect) assert.ok(rect.height >= 43.9, `${await button.innerText()}: ${rect.height}px`); }
      await page.screenshot({ path: `${output}/result-${width}.png`, fullPage: true });
      failRead = true; await page.reload({ waitUntil: 'domcontentloaded' }); await panel.getByRole('button', { name: '再確認' }).waitFor();
      assert.equal(await panel.getByText('合計2000を保存しました。').count(), 0, 'failed owner read hides previous private result');
      await panel.getByRole('button', { name: '再確認' }).tap(); await panel.getByText('合計2000を保存しました。').waitFor();
      await panel.getByRole('button', { name: '切断', exact: true }).tap(); await connect.waitFor(); assert.deepEqual(errors, []);
      report.checks.push({ width, pass: true, starts }); console.log(`PASS ${width}: connect, tap, stop, reload, download, failed-read recovery`);
    } catch (error) { report.checks.push({ width, pass: false, error: String(error) }); console.error(String(error)); await page.screenshot({ path: `${output}/failure-${width}.png` }); }
    await context.close();
  }
} finally { await browser.close(); await writeFile(`${output}/cloud-browser-report.json`, JSON.stringify(report, null, 2)); }
if (report.checks.some(c => !c.pass)) process.exitCode = 1;
