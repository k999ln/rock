import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  BILLING_CHURN_REPORT_PATH,
  BILLING_CHURN_REPORT_SUBJECT,
  createBillingToken,
} from '../lib/billing-token.ts';
import { cohortChurn } from '../lib/churn-cohort.ts';
import { createNoahChurnApi } from '../lib/noah-churn-api.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

const prices = { esim: 'price_A', card: 'price_B' };
const reviewer = 'reviewer-a';
const secret = 'churn-fixture-only-'.repeat(2);
const billingSecret = 'billing-fixture-only-'.repeat(2);
const billingUrl = 'https://billing.example.test';
const start = 1_704_067_200;
const month = 31 * 86_400;
const ended = start + 3 * month;

async function seed(db, { id, userId = id, arm, status = 'active', count = 3, end = null, firstPaid = start }) {
  await db.prepare(
    `INSERT INTO billing_subscriptions (
      stripe_subscription_id, user_id, stripe_customer_id, status, price_id,
      current_period_end, cancel_at_period_end, stripe_event_created_at, updated_at, ended_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, `cus_${userId}`, status, prices[arm] ?? 'price_other', ended,
    status === 'active' ? 1 : 0, ended + 3600, ended + 3600, end).run();

  const invoices = db.prepare(
    `INSERT INTO billing_invoices (
      stripe_invoice_id, user_id, stripe_subscription_id, stripe_customer_id,
      status, amount_paid, currency, paid_at, stripe_event_created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'jpy', ?, ?, ?)`,
  );
  const payment = (label, status, amount, at) =>
    invoices.bind(`${id}-${label}`, userId, id, `cus_${userId}`, status, amount, at, start, start);
  await db.batch([
    ...Array.from({ length: count }, (_, index) => payment(index, 'paid', 500, firstPaid + index * month)),
    payment('open', 'open', 500, null),
    payment('zero', 'paid', 0, start),
    payment('future', 'paid', 500, 4_102_444_800),
  ]);
}

async function billingFixture(t) {
  const bundled = await build({
    entryPoints: ['services/sky-billing/src/worker.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    external: ['node:*'],
    write: false,
  });
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    compatibilityDate: '2026-09-01',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'],
    script: bundled.outputFiles[0].text,
    bindings: {
      BILLING_SHARED_SECRET: billingSecret,
      BILLING_CHURN_SHARED_SECRET: secret,
      CHURN_ARMS: JSON.stringify({ [prices.esim]: 'esim', [prices.card]: 'card' }),
    },
  }));
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  for (const file of ['0001_billing.sql', '0005_churn_subscription_end.sql']) {
    const sql = readFileSync(new URL(`../services/sky-billing/migrations/${file}`, import.meta.url), 'utf8');
    for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
  return { db, worker };
}

async function renderSummary(report) {
  const { outputFiles } = await build({
    stdin: {
      contents: `import { createElement } from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { ChurnSummary } from './components/noah-churn-review.tsx';
        export const render = (report) => renderToStaticMarkup(createElement(ChurnSummary, { report }));`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom/server', 'react/jsx-runtime'],
    loader: { '.module.css': 'empty' },
    write: false,
  });
  const compiled = { exports: {} };
  runInNewContext(outputFiles[0].text, { module: compiled, require: createRequire(import.meta.url) });
  return compiled.exports.render(report);
}

void test('billing D1 reaches the reviewer screen with cohort totals and hidden small arms', async (t) => {
  const { db, worker } = await billingFixture(t);
  const expected = [];
  const recent = Math.floor(Date.now() / 1000) - 7 * 86_400;
  for (let index = 0; index < 5; index++) {
    const canceled = index < 2;
    const end = index === 0 ? ended : null;
    const count = index === 4 ? 1 : index === 0 ? 2 : 3;
    const firstPaid = index === 4 ? recent : start;
    await seed(db, { id: `esim-${index}`, arm: 'esim', status: canceled ? 'canceled' : 'active', end, count, firstPaid });
    expected.push({
      arm: 'esim',
      startedAt: firstPaid * 1000,
      periodsPaid: count,
      endedAt: canceled ? (end ?? ended + 3600) * 1000 : null,
    });
    await seed(db, { id: `card-${index}`, userId: `person-${Math.min(index, 3)}`, arm: 'card' });
  }
  await seed(db, { id: 'unknown-price', arm: 'other' });
  await seed(db, { id: 'never-paid', arm: 'esim', count: 0 });
  const site = createNoahChurnApi({
    authenticate: async () => reviewer,
    reviewers: [reviewer],
    billingUrl,
    secret,
    fetch: async (url, init) => worker.dispatchFetch(new Request(url, init).url, init),
  });
  const request = new Request('https://site.example.test/api/noah/churn');
  const response = await site(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
  const payload = await response.json();
  assert.deepEqual(payload, {
    report: cohortChurn(expected, payload.report.asOf),
    ownerScope: await ownerScopeFor(reviewer),
  });
  const html = await renderSummary(payload.report);
  assert.match(html, /解約 2 件・試行 9 回/u);
  assert.match(html, /継続 3 件・対象 4 件/u);
  assert.match(html, /95% 信頼区間/u);
  assert.match(html, /カードだけ（PWA）<\/h3><p>5 人に達するまで非表示です。/u);

  await seed(db, { id: 'card-5', arm: 'card' });
  const visible = (await (await site(request)).json()).report;
  const card = Array.from({ length: 6 }, () => ({
    arm: 'card', startedAt: start * 1000, periodsPaid: 3, endedAt: null,
  }));
  assert.deepEqual(visible, cohortChurn([...expected, ...card], visible.asOf));
});

void test('churn requests require reviewer and worker credentials', async (t) => {
  const { worker } = await billingFixture(t);
  const endpoint = billingUrl + BILLING_CHURN_REPORT_PATH;
  const regular = await createBillingToken(BILLING_CHURN_REPORT_SUBJECT, billingSecret);
  const wrongSubject = await createBillingToken(reviewer, secret);
  const internal = await createBillingToken(BILLING_CHURN_REPORT_SUBJECT, secret);
  for (const token of [regular, wrongSubject]) {
    const response = await worker.dispatchFetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 401);
  }
  const browser = await worker.dispatchFetch(endpoint, {
    headers: { Authorization: `Bearer ${internal}`, Origin: 'https://site.example.test' },
  });
  assert.equal(browser.status, 404);
  assert.equal(browser.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await worker.dispatchFetch(endpoint, { method: 'OPTIONS' })).status, 404);

  const site = createNoahChurnApi({
    authenticate: async () => 'ordinary-user',
    reviewers: [reviewer],
    billingUrl,
    secret,
    fetch: async () => assert.fail('non-reviewers must not reach the billing worker'),
  });
  assert.equal((await site(new Request('https://site.example.test/api/noah/churn'))).status, 404);
});
