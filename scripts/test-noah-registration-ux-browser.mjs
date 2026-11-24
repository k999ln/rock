/** Actual Noah screens with synthetic APIs; never registers with an external service. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.NOAH_PLAYWRIGHT_PACKAGE || 'playwright-core');
const base = process.env.NOAH_TEST_URL || 'http://localhost:5197';
const output = process.env.NOAH_TEST_OUTPUT;
if (!output) throw Error('NOAH_TEST_OUTPUT is required');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.NOAH_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = [];
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ja-JP' });
    const page = await context.newPage(), errors = [], sends = [], saves = [];
    page.on('pageerror', e => errors.push(e.message));
    let profile = { revision: 1, ownerScope: 'fixture-only', available: true, browserOwned: true,
      fields: { email: 'sample@example.com' }, reuseEnabled: true, consents: [], documents: [], grants: [], paused: false };
    const provider = { id: 'example', name: 'サンプルAgent', agentIds: ['fixture-agent'], revision: 1,
      providerOrigin: 'https://provider.example.com', executorOrigin: 'https://registration.example.com', executorName: '登録担当',
      termsUrl: 'https://provider.example.com/terms', termsVersion: 'v1',
      fields: [{ key: 'email', label: 'メール', type: 'email', required: true, maxLength: 320, profileField: 'email' },
        { key: 'name', label: '氏名', type: 'text', required: true, maxLength: 120, profileField: 'name' },
        { key: 'bio', label: '紹介文', type: 'text', required: false, maxLength: 100, profileField: 'bio' },
        { key: 'contact', label: '連絡用メール', type: 'email', required: false, maxLength: 320 }] };
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()), post = route.request().method() === 'POST';
      let body = {};
      if (url.pathname === '/api/noah/session') body = { connected: true };
      else if (url.pathname === '/api/noah/profile') {
        if (post) { const input = route.request().postDataJSON(); saves.push(input); profile = { ...profile, fields: input.fields, revision: profile.revision + 1, reuseEnabled: input.reuse }; }
        body = profile;
      } else if (url.pathname === '/api/noah/registration') {
        if (post) { const input = route.request().postDataJSON(); sends.push(input); body = { job: { id: input.id, providerName: provider.name, providerOrigin: provider.providerOrigin, state: 'completed', expiresAt: Date.now() + 86400000, returnTo: '/noah/ready/agent?id=fixture-agent' } }; }
        else body = { providers: [provider] };
      } else if (url.pathname === '/api/noah/intake') body = url.searchParams.has('id') ? {
        id: 'fixture-agent', name: provider.name, summary: '保存した情報で、このAgentの準備を続けます。', provider: 'Example', host: 'provider.example.com', website: provider.providerOrigin,
        listed: true, ownerScope: 'fixture-only', section: 'ran', tools: 1, users: 0, checkedAt: Date.now(), connection: null,
        connect: { badge: 'one_click', taps: 1, typed: 0, placeLabel: '提供元', price: { model: 'unknown' }, level: 2 }
      } : { items: [] };
      else if (url.pathname === '/api/noah/ask') body = { asks: [] };
      await route.fulfill({ json: body });
    });
    await page.goto(`${base}/noah/registration?agent=fixture-agent`);
    await page.getByRole('heading', { name: 'このAgentに、必要な分だけ。' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'メール', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('紹介文', { exact: true }).isVisible(), false);
    await page.getByLabel('氏名').fill('テスト 利用者');
    await page.getByText('任意の情報を追加', { exact: true }).click();
    await page.getByLabel('連絡用メール', { exact: true }).fill('invalid-email');
    await page.getByText('任意の情報を追加', { exact: true }).click();
    await page.getByRole('button', { name: '同意して登録・続ける' }).click();
    assert.ok(await page.getByLabel('連絡用メール', { exact: true }).isVisible());
    assert.equal(sends.length, 0); assert.equal(saves.length, 0);
    await page.getByLabel('連絡用メール', { exact: true }).fill('');
    await page.getByText('任意の情報を追加', { exact: true }).click();
    assert.equal(await page.getByRole('switch').getAttribute('aria-checked'), 'true');
    assert.ok(await page.getByText('https://registration.example.com', { exact: false }).first().isVisible());
    assert.ok(await page.getByRole('link', { name: '料金・利用条件を確認' }).isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/registration-${width}.png`, fullPage: true });
    await page.getByRole('switch').click();
    await page.getByRole('button', { name: '同意して登録・続ける' }).click();
    await page.getByRole('link', { name: 'Agentへ戻って続ける' }).waitFor();
    assert.equal(sends.length, 1); assert.equal(saves.length, 0);
    assert.equal(sends[0].values.name, 'テスト 利用者');
    assert.deepEqual(sends[0].profile.fields, ['email']);
    assert.equal(sends[0].consent, true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/completed-${width}.png`, fullPage: true });
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`${base}/noah/registration?agent=fixture-agent`);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    assert.equal(await page.locator('input[name="email"]').inputValue(), 'sample@example.com');
    await page.locator('input[name="email"]').fill('updated@example.com');
    await page.getByLabel('氏名').fill('テスト 利用者');
    await page.getByRole('button', { name: '同意して登録・続ける' }).click();
    await page.getByRole('link', { name: 'Agentへ戻って続ける' }).waitFor();
    assert.equal(saves.length, 1); assert.equal(sends.length, 2);
    assert.equal(saves[0].fields.email, 'updated@example.com');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`${base}/noah/registration?agent=fixture-agent`);
    await page.getByRole('heading', { name: '入力は、もうできています。' }).waitFor();
    await page.getByRole('button', { name: '同意して登録・続ける' }).click();
    await page.getByRole('link', { name: 'Agentへ戻って続ける' }).waitFor();
    assert.equal(saves.length, 1); assert.equal(sends.length, 3);
    await page.goto(`${base}/noah/profile`);
    await page.getByRole('region', { name: '保存・送信・料金' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/profile-${width}.png`, fullPage: true });
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`${base}/noah/ready/agent?id=fixture-agent`);
    await page.getByRole('button', { name: '必要な情報を確認して使う' }).click();
    const dialog = page.getByRole('dialog', { name: 'このAgentの登録' });
    await dialog.getByRole('heading', { name: '入力は、もうできています。' }).waitFor();
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.screenshot({ path: `${output}/sheet-${width}.png`, fullPage: true });
    await dialog.getByRole('button', { name: '同意して登録・続ける' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/sheet-consent-${width}.png`, fullPage: true });
    await dialog.getByRole('button', { name: '同意して登録・続ける' }).click();
    await dialog.getByRole('link', { name: 'Agentへ戻って続ける' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(page.url().includes('id=fixture-agent'));
    assert.equal(sends.length, 4); assert.equal(saves.length, 1);
    report.push({ width, sends: sends.length, saves: saves.length, errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify(report));
