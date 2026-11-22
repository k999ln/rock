import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  businessToday,
  prepareBusinessBrief,
  validateBusinessConfig,
  businessBlockers,
  withTracking,
  businessReferralUrl,
  emptyBusinessLedger,
  applyBusinessCommand,
  businessReport,
} from '../toolkits/noah-affiliate-agents/business-core.mjs';
import {
  normalizeBusinessCSV,
  parseCSV,
} from '../toolkits/noah-affiliate-agents/business-import.mjs';
import { noahMcpHandshake, noahMcpCall } from '../lib/noah-mouth-mcp-remote.ts';
import {
  emptyBusinessAgent,
  runBusinessAgent,
} from '../toolkits/noah-affiliate-agents/business-runner.mjs';
const today = businessToday(),
  now = Date.now();
const config = {
  schema: 'noah-business-config/1',
  checkedAt: today,
  validUntil: today,
  offerId: 'synthetic',
  publicName: '合成研修',
  publicDescription: '合成の説明',
  affiliateUrl: 'https://www.rentracks.jp/adx/r.html?idx=0.1.2.3.4&dna=5',
  trackingApproved: true,
  partnered: true,
  mediaApproved: true,
  contentApproved: true,
  approvalReference: 'PRIVATE-APPROVAL',
  channels: ['web', 'chat', 'social'],
  rewardYen: 12000,
  approvalDays: 30,
  enabled: true,
};
const input = {
  companyType: '法人',
  role: '導入・研修の担当',
  goal: '社員のsi活用・研修',
  workflow: '秘密を除いた定例資料を毎月作成する。',
  monthlyCount: 10,
  minutesEach: 60,
  teamSize: 5,
  timeframe: '3か月以内',
  companyEmailAvailable: true,
  priorContact: false,
  wantsConsultation: true,
  hourlyCostYen: 2000,
};
const uix = 'nb.' + 'a'.repeat(32);
const conversion = (patch = {}) => ({
  id: 'order1',
  offerId: config.offerId,
  uix,
  occurredOn: today,
  status: 'pending',
  rewardYen: 12000,
  decisionOn: null,
  reason: null,
  sourceRef: 'sha256:synthetic',
  observedOn: today,
  ...patch,
});
const campaign = {
  id: 'web-1',
  channel: 'web',
  landingUrl: 'https://agent.example/',
  title: '作業を整理',
  budgetYen: 5000,
  confirmed: true,
};
function command(state, action, payload, requestId = 'req' + state.revision) {
  return applyBusinessCommand(
    state,
    { requestId, expectedRevision: state.revision, action, payload },
    now,
  ).state;
}

await test('相談は人数で工数を水増しせず、対象外にも整理票を返す', () => {
  const r = prepareBusinessBrief(input);
  assert.equal(r.hoursPerMonth, 10);
  assert.equal(r.estimatedCurrentCostYen, 20000);
  assert.equal(r.eligible, true);
  for (const patch of [
    { companyType: '個人' },
    { role: 'その他' },
    { goal: '業務を外注' },
    { companyEmailAvailable: false },
    { priorContact: true },
    { wantsConsultation: false },
  ]) {
    const b = prepareBusinessBrief({ ...input, ...patch });
    assert.equal(b.eligible, false);
    assert.match(b.text, /最初に試すこと/);
  }
  for (const patch of [
    { monthlyCount: NaN },
    { workflow: 'a' },
    { companyEmail: 'person@example.com' },
    { monthlyCount: 1.5 },
    { campaign: '../../' },
  ])
    assert.throws(() => prepareBusinessBrief({ ...input, ...patch }));
});
await test('媒体・文面・期限・正式リンクの不足は独立に閉じる', () => {
  assert.deepEqual(businessBlockers(config, 'web', now), []);
  for (const patch of [
    { enabled: false },
    { partnered: false },
    { mediaApproved: false },
    { contentApproved: false },
    { approvalReference: null },
    { affiliateUrl: null },
    { channels: ['chat'] },
    { validUntil: '2026-01-01', checkedAt: '2026-01-01' },
  ])
    assert.ok(businessBlockers({ ...config, ...patch }, 'web', now).length);
  for (const url of [
    'javascript:alert(1)',
    'https://evil.example/',
    'https://www.rentracks.jp/adx/r.html?idx=0.1.2.3.4&dna=5&dna=6',
  ])
    assert.throws(() =>
      validateBusinessConfig({ ...config, affiliateUrl: url }),
    );
  assert.equal(
    new URL(withTracking(config.affiliateUrl, uix)).searchParams.get('uix'),
    uix,
  );
});
await test('登録記事は媒体承認を分離し、正式タグを改変せず相談IDを外へ渡さない', () => {
  const article = {
    url: 'https://publisher.example/articles/1',
    mediaOrigin: 'https://publisher.example',
    siteId: '2',
    approved: true,
    tagVerified: true,
    reference: 'synthetic-ui-proof',
  };
  const c = { ...config, mediaApproved: false, registeredArticle: article };
  assert.deepEqual(businessBlockers(c, 'web', now), []);
  assert.equal(businessReferralUrl(c, uix), article.url);
  assert.equal(
    businessReferralUrl({ ...config, trackingApproved: false }, uix),
    config.affiliateUrl,
  );
  for (const patch of [{ approved: false }, { tagVerified: false }])
    assert.ok(
      businessBlockers(
        { ...c, registeredArticle: { ...article, ...patch } },
        'web',
        now,
      ).length,
    );
  for (const patch of [
    { siteId: '99' },
    { url: 'https://evil.example/post' },
    { url: article.url + '?token=x' },
    { url: 'javascript:alert(1)' },
    { reference: '' },
  ])
    assert.throws(() =>
      validateBusinessConfig({
        ...c,
        registeredArticle: { ...article, ...patch },
      }),
    );
});
await test('成果→承認→支払→銀行を分離し、重複・差額・古い版・不正列を拒否', () => {
  let s = command(emptyBusinessLedger(), 'campaign', campaign);
  s.leads.a = {
    uix,
    campaign: campaign.id,
    eligible: true,
    referralIssued: true,
  };
  s = command(s, 'import_conversions', { rows: [conversion()] });
  assert.equal(businessReport(s, config).totals.approvedYen, 0);
  const payout = {
    id: 'pay1',
    conversionIds: ['order1'],
    adjustmentsYen: 0,
    adjustmentReason: null,
    amountYen: 12000,
    paidOn: today,
    sourceRef: 'ASP-pay',
  };
  assert.throws(() => command(s, 'import_payouts', { rows: [payout] }));
  s = command(s, 'import_conversions', {
    rows: [conversion({ status: 'approved', decisionOn: today })],
  });
  assert.equal(businessReport(s, config).totals.bankMatchedYen, 0);
  assert.throws(() =>
    command(s, 'import_payouts', { rows: [{ ...payout, amountYen: 12001 }] }),
  );
  s = command(s, 'import_payouts', { rows: [payout] });
  assert.equal(businessReport(s, config).totals.bankMatchedYen, 0);
  assert.throws(() =>
    command(s, 'import_payouts', { rows: [{ ...payout, id: 'pay2' }] }),
  );
  const deposit = {
    id: 'bank1',
    payoutId: 'pay1',
    amountYen: 12000,
    receivedOn: today,
    sourceRef: 'BANK-entry',
  };
  assert.throws(() =>
    command(s, 'import_deposits', { rows: [{ ...deposit, amountYen: 11000 }] }),
  );
  assert.throws(() =>
    command(s, 'import_deposits', {
      rows: [{ ...deposit, accountNumber: '123' }],
    }),
  );
  const cmd = {
    requestId: 'deposit',
    expectedRevision: s.revision,
    action: 'import_deposits',
    payload: { rows: [deposit] },
  };
  s = applyBusinessCommand(s, cmd).state;
  assert.equal(applyBusinessCommand(s, cmd).duplicate, true);
  assert.throws(() => applyBusinessCommand(s, { ...cmd, requestId: 'stale' }));
  assert.throws(() =>
    command(s, 'import_deposits', { rows: [{ ...deposit, id: 'bank2' }] }),
  );
  assert.throws(() =>
    command(s, 'import_conversions', {
      rows: [conversion({ status: 'rejected', decisionOn: today })],
    }),
  );
  s = command(s, 'import_costs', {
    rows: [
      {
        id: 'cost1',
        campaign: campaign.id,
        category: 'labor',
        amountYen: 3000,
        incurredOn: today,
        sourceRef: 'time-record',
      },
    ],
  });
  const r = businessReport(s, config);
  assert.equal(r.totals.bankMatchedYen, 12000);
  assert.equal(r.totals.attributedCashLessCostsBeforeAdjustmentsYen, 9000);
  assert.equal(r.campaigns[0].approvalRate, 1);
});
await test('他媒体の振込と調整額をこのAgentの利益にしない', () => {
  let s = command(emptyBusinessLedger(), 'campaign', campaign);
  s.leads.a = { uix, campaign: campaign.id };
  s = command(s, 'import_conversions', {
    rows: [
      conversion({ status: 'approved', decisionOn: today }),
      conversion({
        id: 'foreign',
        offerId: 'other',
        status: 'approved',
        decisionOn: today,
        rewardYen: 8000,
      }),
    ],
  });
  s = command(s, 'import_payouts', {
    rows: [
      {
        id: 'combined',
        conversionIds: ['order1', 'foreign'],
        adjustmentsYen: -100,
        adjustmentReason: 'ASP adjustment',
        amountYen: 19900,
        paidOn: today,
        sourceRef: 'ASP',
      },
    ],
  });
  s = command(s, 'import_deposits', {
    rows: [
      {
        id: 'bank',
        payoutId: 'combined',
        amountYen: 19900,
        receivedOn: today,
        sourceRef: 'BANK',
      },
    ],
  });
  const r = businessReport(s, config);
  assert.equal(r.totals.bankMatchedYen, 19900);
  assert.equal(r.totals.attributedApprovedCashYen, 12000);
  assert.equal(r.totals.unallocatedAdjustmentsYen, -100);
  assert.equal(r.campaigns[0].approvedYen, 12000);
});
await test('CSVは明示対応した必要列だけ出力し、元資料のハッシュを残す', () => {
  const bytes = Buffer.from(
    '取引,金額,日付,名義,口座\r\nbank1,"12,000",2026/11/01,PRIVATE-NAME,PRIVATE-ACCOUNT\r\n',
  );
  const map = {
    action: 'import_deposits',
    encoding: 'utf-8',
    fields: {
      id: { column: '取引' },
      payoutId: { constant: 'pay1' },
      amountYen: { column: '金額' },
      receivedOn: { column: '日付' },
    },
  };
  const r = normalizeBusinessCSV(bytes, map);
  assert.equal(r.rows[0].amountYen, 12000);
  assert.equal(r.rows[0].receivedOn, '2026-11-01');
  assert.match(r.rows[0].sourceRef, /^sha256:[a-f0-9]{64}:row:2$/);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE|名義|口座/);
  assert.throws(() =>
    normalizeBusinessCSV(bytes, {
      ...map,
      fields: { ...map.fields, account: { column: '口座' } },
    }),
  );
  assert.throws(() => normalizeBusinessCSV(Buffer.from('取引,取引\nx,y'), map));
  assert.deepEqual(parseCSV('a,b\n"x\ny","z""q"'), [
    ['a', 'b'],
    ['x\ny', 'z"q'],
  ]);
  assert.throws(() => parseCSV('a\n"unterminated'));
});
await test('継続実行: 自社記事を公開し、接続待ちを隠さず、重複wakeと停止後は実行しない', () => {
  const initial = { ...emptyBusinessAgent(), enabled: true, nextRunAt: now };
  const first = runBusinessAgent(initial, emptyBusinessLedger(), config, {
    now,
    origin: 'https://agent.example',
  });
  assert.equal(first.ran, true);
  assert.equal(first.agent.runCount, 1);
  assert.equal(Object.keys(first.agent.articles).length, 1);
  assert.equal(Object.keys(first.ledger.campaigns).length, 1);
  assert.equal(first.agent.receipts[0].fullFlowComplete, false);
  assert.equal(
    first.agent.stages.find((x) => x.id === 'asp_collection').state,
    'needs_connection',
  );
  assert.equal(
    first.agent.stages.find((x) => x.id === 'bank_reconciliation').state,
    'needs_connection',
  );
  assert.equal(
    runBusinessAgent(first.agent, first.ledger, config, {
      now,
      origin: 'https://agent.example',
    }).ran,
    false,
  );
  const next = runBusinessAgent(first.agent, first.ledger, config, {
    now: now + 16 * 60 * 1000,
    origin: 'https://agent.example',
  });
  assert.equal(next.agent.runCount, 2);
  assert.equal(Object.keys(next.agent.articles).length, 2);
  assert.equal(businessReport(next.ledger, config).totals.bankMatchedYen, 0);
  assert.equal(
    runBusinessAgent({ ...next.agent, enabled: false }, next.ledger, config, {
      now: now + 1e8,
      origin: 'https://agent.example',
    }).ran,
    false,
  );
});
await test(
  '実Worker/SQLite: 未ログイン相談、秘密分離、Noah MCP接続、再起動後の台帳復旧',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'noah-business-'));
    const built = await build({
      entryPoints: ['toolkits/noah-affiliate-agents/business-worker.mjs'],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
    });
    const token = 'synthetic-private-operations-token-123456789';
    const options = {
      ...convertV4MiniflareOptions({
        script: built.outputFiles[0].text,
        modules: true,
        compatibilityDate: '2026-10-01',
        durableObjects: {
          BUSINESS_LEDGER: { className: 'BusinessLedger', useSQLite: true },
        },
        durableObjectsPersist: dir,
        bindings: {
          BUSINESS_CONFIG_JSON: JSON.stringify({
            ...config,
            mediaApproved: false,
            registeredArticle: {
              url: 'https://publisher.example/articles/1',
              mediaOrigin: 'https://publisher.example',
              siteId: '2',
              approved: true,
              tagVerified: true,
              reference: 'synthetic-ui-proof',
            },
          }),
          OPERATIONS_TOKEN: token,
          NOAH_ORIGIN: 'https://avoado.si',
        },
      }),
      resourcePersistencePath: dir,
      isolatedResourcePersistencePath: dir,
    };
    let mf = new Miniflare(options);
    const req = (p, v, h = {}) =>
      mf.dispatchFetch('https://agent.example' + p, {
        method: v === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', ...h },
        body: v === undefined ? undefined : JSON.stringify(v),
      });
    const owner = { authorization: 'Bearer ' + token };
    try {
      assert.equal((await req('/')).status, 200);
      assert.equal(
        (await req('/operations/api', { action: 'export' })).status,
        401,
      );
      assert.equal(
        (await req('/brief', input, { origin: 'https://evil.example' })).status,
        403,
      );
      const first = await (await req('/brief', input)).json();
      assert.equal(first.referralAvailable, true);
      assert.equal(first.referralUrl, 'https://publisher.example/articles/1');
      assert.equal(first.attribution, 'media_only');
      assert.doesNotMatch(first.referralUrl, /uix|rentracks/);
      assert.doesNotMatch(JSON.stringify(first), /PRIVATE|rewardYen|12000/);
      const snapshot = await (
        await req('/operations/api', { action: 'export' }, owner)
      ).json();
      assert.equal(Object.keys(snapshot.leads).length, 1);
      assert.doesNotMatch(
        JSON.stringify(snapshot),
        /秘密を除いた|workflow|companyEmail|hourlyCost/,
      );
      const ctx = { fetch: (url, init) => mf.dispatchFetch(url, init) };
      const hello = await noahMcpHandshake(
        'https://agent.example/consult/mcp',
        ctx,
      );
      assert.deepEqual(
        hello.tools.map((t) => t.name),
        ['prepare_business_training'],
      );
      const answer = await noahMcpCall(
        hello.session,
        'prepare_business_training',
        { ...input, wantsConsultation: false },
        ctx,
      );
      assert.equal(answer.ok, true);
      assert.match(answer.blocks[0].text, /整理票/);
      assert.doesNotMatch(answer.blocks[0].text, /rentracks/);
      const observation = {
        schema: 'noah-source-observation/1',
        stream: 'rentracks_payouts',
        sourceUrl: 'https://manage.rentracks.jp/manage/detail_pay',
        observedAt: new Date().toISOString(),
        sha256: 'a'.repeat(64),
        scope: null,
        summary: {
          totalRows: 0,
          targetRows: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
        },
        rows: [],
      };
      assert.equal(
        (
          await req('/operations/api', {
            action: 'source_observation',
            observation,
          })
        ).status,
        401,
      );
      const receipt = await (
        await req(
          '/operations/api',
          { action: 'source_observation', observation },
          owner,
        )
      ).json();
      assert.equal(receipt.receipt.bankReceiptVerified, false);
      assert.equal(
        (
          await (
            await req(
              '/operations/api',
              { action: 'source_observation', observation },
              owner,
            )
          ).json()
        ).duplicate,
        true,
      );
      await mf.dispose();
      mf = new Miniflare(options);
      const sources = await (
        await req('/operations/api', { action: 'source_status' }, owner)
      ).json();
      assert.equal(
        sources.find((s) => s.stream === 'rentracks_payouts').receipt.summary
          .totalRows,
        0,
      );
      const restored = await (
        await req('/operations/api', { action: 'export' }, owner)
      ).json();
      assert.equal(Object.keys(restored.leads).length, 2);
      const unauthorized = await (
        await req('/consult/mcp', {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'export_ledger', arguments: {} },
        })
      ).json();
      assert.equal(unauthorized.result.isError, true);
      assert.equal(
        (await req('/operations/api', { action: 'agent_start' })).status,
        401,
      );
      await req('/operations/api', { action: 'agent_start' }, owner);
      let run;
      for (let i = 0; i < 30; i++) {
        run = await (
          await req('/operations/api', { action: 'agent_status' }, owner)
        ).json();
        if (run.runCount) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(run.runCount, 1);
      assert.equal(run.receipts[0].fullFlowComplete, false);
      const guides = await req('/guides');
      assert.equal(guides.status, 200);
      assert.match(await guides.text(), /定例報告/);
      assert.match(await (await req('/guides/report')).text(), /guide-report/);
      const sitemap = await req('/sitemap.xml');
      assert.equal(sitemap.status, 200);
      const xml = await sitemap.text();
      assert.match(xml, /https:\/\/agent.example\/guides\/report/);
      assert.doesNotMatch(xml, /operations|consult|brief/);
      assert.match(
        await (await req('/robots.txt')).text(),
        /Sitemap: https:\/\/agent.example\/sitemap.xml/,
      );
      assert.match(
        await (await req('/?campaign=private-tag')).text(),
        /rel="canonical" href="https:\/\/agent.example\/"/,
      );
      assert.match(await (await req('/operations')).text(), /noindex,nofollow/);
      await req('/operations/api', { action: 'agent_stop' }, owner);
      const stopped = await (
        await req('/operations/api', { action: 'agent_status' }, owner)
      ).json();
      assert.equal(stopped.enabled, false);
      assert.equal(stopped.nextRunAt, null);
    } finally {
      await mf.dispose();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
