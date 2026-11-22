import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  noahRevenueDirectory,
  noahRevenueTarget,
} from '../lib/noah-revenue-directory.ts';
const now = Date.now();
const item = {
  id: 'noah-business-training',
  origin: 'first_party',
  url: 'https://avoado.si/noah/business-si',
  mcp: 'https://noah-business-si.mr-kirin999.workers.dev/consult/mcp',
  checkedAt: new Date(now).toISOString(),
};
await test('既知の自社Agentだけを共通一覧とMCP実行先に接続', async () => {
  const rows = await noahRevenueDirectory(
    async () => Response.json({ items: [item] }),
    now,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].firstParty, 'business-training');
  assert.equal(rows[0].card.sources, undefined);
  assert.equal(rows[0].card.users, 0);
  assert.equal((await noahRevenueTarget(rows[0], now)).url, item.mcp);
  assert.equal(
    await noahRevenueTarget({ ...rows[0], firstParty: undefined }, now),
    null,
  );
  assert.equal(
    await noahRevenueTarget(
      { ...rows[0], card: { ...rows[0].card, href: 'https://evil.example' } },
      now,
    ),
    null,
  );
  assert.equal(await noahRevenueTarget(rows[0], now + 1200001), null);
});
await test('取り下げ・期限・不正接続先・API失敗・過大応答は掲載しない', async () => {
  for (const patch of [
    { mcp: 'https://evil.example/mcp' },
    { origin: 'mcp-registry' },
    { id: 'unknown' },
    { checkedAt: 'invalid' },
    { checkedAt: new Date(now - 1200001).toISOString() },
    { checkedAt: new Date(now + 1).toISOString() },
  ]) {
    assert.deepEqual(
      await noahRevenueDirectory(
        async () => Response.json({ items: [{ ...item, ...patch }] }),
        now,
      ),
      [],
    );
  }
  assert.deepEqual(
    await noahRevenueDirectory(async () => Response.json({ items: [] }), now),
    [],
  );
  assert.deepEqual(
    await noahRevenueDirectory(
      async () => new Response(null, { status: 302 }),
      now,
    ),
    [],
  );
  assert.deepEqual(
    await noahRevenueDirectory(async () => new Response('x'.repeat(8193)), now),
    [],
  );
});

await test('同じ取得の公開カードだけを一括投影し、非公開列を除く', async () => {
  const { createNoahRevenueCatalog } =
    await import('../lib/noah-revenue-catalog.ts');
  const entries = await noahRevenueDirectory(
    async () => Response.json({ items: [item] }),
    now,
  );
  const response = await createNoahRevenueCatalog(async () => entries)();
  const data = await response.json();
  assert.equal(data.total, 1);
  assert.equal(data.schema, 'noah-revenue-catalog/1');
  assert.deepEqual(Object.keys(data.items[0]).sort(), [
    'id',
    'name',
    'summary',
  ]);
  assert.equal(
    (await createNoahRevenueCatalog(async () => [...entries, ...entries])())
      .status,
    503,
  );
});

await test('収集側resolverはレビュー済み自社レーンだけを固定MCPへつなぐ', async () => {
  const { resolveNoahProvider } =
    await import('../lib/noah-provider-resolve.ts');
  const entries = await noahRevenueDirectory(
    async () => Response.json({ items: [item] }),
    now,
  );
  const never = async () => {
    throw Error('external source must not be fetched');
  };
  assert.equal((await resolveNoahProvider(entries[0], never)).url, item.mcp);
  await assert.rejects(
    resolveNoahProvider({ ...entries[0], firstParty: undefined }, never),
  );
});

await test('自社MCPから匿名準備票を作り、共通Workへ保存・再読込・本人分離', async (t) => {
  const { fixture } = await import('./fixtures/noah/intake.mjs');
  const { parseNoahFlags } = await import('../lib/noah-flags.ts');
  const { createNoahProviderRuntime } =
    await import('../lib/noah-provider-runtime.ts');
  const { build } = await import('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const built = await build({
    entryPoints: ['toolkits/noah-affiliate-agents/business-worker.mjs'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const config = {
    schema: 'noah-business-config/1',
    checkedAt: today,
    validUntil: today,
    offerId: 'synthetic',
    publicName: '合成研修',
    publicDescription: '合成の説明',
    affiliateUrl: null,
    partnered: false,
    mediaApproved: false,
    contentApproved: false,
    approvalReference: null,
    channels: ['web', 'chat'],
    rewardYen: 0,
    approvalDays: 30,
    enabled: false,
  };
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      script: built.outputFiles[0].text,
      modules: true,
      compatibilityDate: '2026-10-01',
      durableObjects: {
        BUSINESS_LEDGER: { className: 'BusinessLedger', useSQLite: true },
      },
      bindings: {
        BUSINESS_CONFIG_JSON: JSON.stringify(config),
        OPERATIONS_TOKEN: 'synthetic-owner-token-for-integration-only',
      },
    }),
  );
  let calls = 0;
  const fetcher = async (url, init) => {
    assert.equal(String(url), item.mcp);
    if (init?.body && JSON.parse(init.body).method === 'tools/call') calls++;
    return mf.dispatchFetch(url, init);
  };
  try {
    const entries = await noahRevenueDirectory(async () =>
      Response.json({
        items: [{ ...item, checkedAt: new Date().toISOString() }],
      }),
    );
    const f = fixture(t, fetcher),
      deps = {
        ...f.deps,
        flags: parseNoahFlags({
          NOAH_INTAKE_PUBLIC: 'true',
          NOAH_ASK_FORM: 'true',
        }),
        reviewers: [],
        authenticate: async () => 'owner-a',
        providerDirectory: async () => entries,
      };
    const runtime = createNoahProviderRuntime(deps),
      projectId = entries[0].card.feedbackId;
    const plan = await runtime.plan(projectId),
      endpoint = plan.endpoints.find(
        (e) => e.name === 'prepare_business_training',
      );
    assert.ok(endpoint, JSON.stringify(plan));
    const input = {
      id: crypto.randomUUID(),
      projectId,
      api: endpoint.name,
      digest: endpoint.digest,
      confirm: true,
      input: {
        companyType: '法人',
        role: '導入・研修の担当',
        goal: '社員のsi活用・研修',
        workflow: '公開用の模擬業務を整理します。',
        monthlyCount: 10,
        minutesEach: 60,
        teamSize: 3,
        timeframe: '3か月以内',
        companyEmailAvailable: false,
        priorContact: false,
        wantsConsultation: false,
      },
    };
    const accepted = await runtime.accept('owner-a', false, input);
    await accepted.run();
    const fresh = createNoahProviderRuntime(deps),
      job = await fresh.get('owner-a', input.id);
    assert.equal(
      job.noahRemote.state,
      'returned',
      JSON.stringify(job.noahRemote),
    );
    assert.match(job.noahRemote.result.text, /準備|整理/);
    assert.equal(await fresh.get('owner-b', input.id), null);
    assert.equal((await fresh.accept('owner-a', false, input)).replay, true);
    assert.equal(calls, 1);
  } finally {
    await mf.dispose();
  }
});
