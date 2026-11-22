/** Synthetic browser acceptance; provider transport/persistence are tested separately with real SQLite. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '../toolkits/noah-coconala/node_modules/playwright-core/index.mjs';
const base = process.env.NOAH_TEST_URL ?? 'http://localhost:8796',
  out = process.env.NOAH_TEST_OUTPUT ?? '/tmp/noah-provider-browser-results';
await mkdir(out, { recursive: true });
const id = 'project-' + 'a'.repeat(64),
  scope = 'owner-v1:' + 'b'.repeat(64),
  digest = 'c'.repeat(64),
  host = 'https://example-demo.hf.space';
const plan = {
  projectId: id,
  name: '文章を整える',
  repository: 'example/demo',
  host,
  prefix: '/gradio_api',
  endpoints: [
    {
      name: 'rewrite',
      label: '文章を整える',
      digest,
      fields: [
        { name: 'message', label: '文章', kind: 'text', optional: false },
        {
          name: 'length',
          label: '長さ',
          kind: 'number',
          optional: true,
          value: 64,
          minimum: 64,
          maximum: 256,
        },
      ],
    },
  ],
};
const browser = await chromium.launch({
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  }),
  report = [];
try {
  for (const width of [320, 390, 1280]) {
    const ctx = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: width < 600,
        hasTouch: width < 600,
      }),
      page = await ctx.newPage(),
      errors = [],
      sent = [];
    let job = null,
      lost = true,
      reads = 0;
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      if (path === '/api/noah/discover/project')
        return route.fulfill({
          json: {
            card: {
              id,
              name: '文章を整える',
              summary: '文章を短く読みやすく整えます。',
              provider: 'example',
              sources: [],
            },
            connection: { kind: 'space', repository: 'example/demo' },
          },
        });
      if (path === '/api/noah/provider') {
        if (request.method() === 'GET')
          return route.fulfill({ json: { plan, ownerScope: scope } });
        const body = request.postDataJSON();
        sent.push(body);
        assert.equal(request.headers()['x-rock-owner-scope'], scope);
        if (lost) {
          lost = false;
          return route.abort('failed');
        }
        job = {
          id: body.id,
          workId: body.id,
          connectionId: body.id,
          agentId: id,
          mode: 'provider',
          tool: 'rewrite',
          host: 'example-demo.hf.space',
          state: 'running',
          revision: 1,
          stopRequested: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ownerScope: scope,
        };
        return route.fulfill({ status: 202, json: job });
      }
      if (path === '/api/noah/ask')
        return route.fulfill({
          json: { asks: job ? [job] : [], ownerScope: scope },
        });
      if (path.startsWith('/api/noah/ask/')) {
        if (++reads > 1)
          job = {
            ...job,
            state: 'succeeded',
            revision: 2,
            finishedAt: Date.now(),
            result: {
              text: '短く整えた文章です。',
              truncated: false,
              attachments: 0,
            },
          };
        return route.fulfill({ json: job });
      }
      if (path === '/api/noah/session')
        return route.fulfill({ json: { connected: true, created: false } });
      return route.fulfill({
        json: { ownerScope: scope, asks: [], connections: [], items: [] },
      });
    });
    await page.goto(`${base}/noah/discover/agent?id=${id}`);
    await page.getByRole('button', { name: '使う', exact: true }).click();
    await page
      .getByLabel('文章', { exact: true })
      .fill('長い文章を短くしてください。');
    assert.equal(
      await page.getByLabel('長さ', { exact: true }).getAttribute('min'),
      '64',
    );
    await page
      .getByRole('button', { name: '送信して実行', exact: true })
      .click();
    await page
      .getByRole('button', { name: '同じ依頼の受付を確認', exact: true })
      .waitFor();
    assert.equal(await page.locator('textarea').isDisabled(), true);
    await page.screenshot({ path: `${out}/request-${width}.png` });
    await page
      .getByRole('button', { name: '同じ依頼の受付を確認', exact: true })
      .click();
    await page.waitForURL('**/noah/tasks/**');
    await page
      .getByRole('heading', { name: '成果の詳細', exact: true })
      .waitFor();
    assert.match(await page.locator('body').innerText(), /短く整えた文章/);
    await page.reload();
    await page
      .getByRole('heading', { name: '成果の詳細', exact: true })
      .waitFor();
    assert.equal(sent.length, 2);
    assert.equal(sent[0].id, sent[1].id);
    assert.deepEqual(sent[0].input, sent[1].input);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${out}/result-${width}.png` });
    report.push({
      width,
      sameRequestAfterNetworkLoss: true,
      resultAfterReload: true,
      noOverflow: true,
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report));
