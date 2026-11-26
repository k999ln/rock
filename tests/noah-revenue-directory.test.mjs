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
    const observedAt = Date.now();
    const entries = await noahRevenueDirectory(
      async () => Response.json({
        items: [{ ...item, checkedAt: new Date(observedAt).toISOString() }],
      }),
      observedAt,
    );
    assert.equal(entries.length, 1);
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
    const { screen } = await import('./fixtures/noah/screen.mjs');
    const { createNoahDirectoryApi } = await import('../lib/noah-agent-directory-api.ts');
    const { createNoahProviderApi } = await import('../lib/noah-provider-api.ts');
    const { createNoahAskApi } = await import('../lib/noah-ask.ts');
    const { noahProjectDetail } = await import('../lib/noah-project-api.ts');
    const { noahCardHref } = await import('../lib/noah-project-view.ts');
    const ownerIntent = await import('../lib/owner-intent.ts');
    const askView = await import('../lib/noah-ask-view.ts');
    const myRoutes = await import('../lib/noah-my-routes.ts');
    const pageRoutes = await import('../lib/noah-page-routes.ts');
    const theaterFilms = await import('../lib/noah-theater-films.ts');
    const plugin = await import('../lib/noah-training-plugin.ts');
    const uploadContract = await import('../lib/noah-agent-upload.ts');
    const { createNoahAgentApi } = await import('../lib/noah-agent-api.ts');
    const { readFileSync } = await import('node:fs');
    for (const migration of ['0033_noah_agent_uploads', '0034_noah_upload_refactor']) f.sql.exec(readFileSync(new URL('../drizzle/' + migration + '.sql', import.meta.url), 'utf8'));
    const agents = createNoahAgentApi(deps);
    const unused = { default: () => null };
    const savedModules = { '@/lib/noah-my-routes': myRoutes, '@/lib/noah-page-routes': pageRoutes,
      './noah-theater': unused, './noah-library': unused, './noah-boards': {}, './sky-agent-library': unused, './sky-output-center': unused, './noah-result-data': unused };
    const cloudContract = await import('../lib/noah-cloud-contract.ts');
    const directory = createNoahDirectoryApi({ ...deps, directory: async () => entries });
    const provider = createNoahProviderApi(deps), asks = createNoahAskApi(deps);
    const ui = screen({ width: 390, modules: { ...savedModules, '@/lib/noah-theater-films': theaterFilms,
      'next/navigation': { useRouter: () => ({ push: href => ui.visits.push(href) }), useSearchParams: () => new URLSearchParams() },
      '@/lib/noah-training-plugin': plugin, '@/lib/noah-agent-upload': uploadContract, '@/lib/noah-local-connection': { NOAH_TEST_MANIFEST_SHA256: 'test-only' },
      './noah-agent-catalog': { adapterLabels: { mcp_http: 'MCP' } }, './noah-agent-upload-form': { permissionLabels: {} },
      './noah-local-connection': unused, './noah-launch': unused, './noah-engineering-mcp-trial': unused, './noah-managed-installation': unused, './noah-invites': { NoahInviteManager: () => null },
      '@/lib/owner-intent': ownerIntent, '@/lib/noah-ask-view': askView, '@/lib/noah-cloud-contract': cloudContract,
      './noah-timeline': { default: () => null }, './noah-ready-detail': { default: () => null },
      './noah-agent-source-ratings': { default: () => null },
      // Geometry belongs to the browser tests; use the real card route here.
      './noah-pin-grid': { default: ({items}) => items.map(card => ({ type: 'a', props: { href: noahCardHref(card), children: card.name } })) },
    }, fetch: async ({url, method, body, headers}) => {
      const target = new URL(url, 'https://noah.test');
      const request = new Request(target, { method, headers: { ...headers, Origin: target.origin }, ...(body ? { body: JSON.stringify(body) } : {}) });
      let response;
      if (target.pathname === '/api/noah/discover') response = await directory(request);
      else if (target.pathname === '/api/noah/discover/project') {
        assert.equal(target.searchParams.get('id'), projectId);
        return { body: noahProjectDetail(entries[0]) };
      } else if (target.pathname === '/api/noah/agents') response = method === 'POST' ? await agents.create(request) : await agents.list(request);
      else if (target.pathname.startsWith('/api/noah/agents/')) response = await agents.get(request, target.pathname.split('/').at(-1));
      else if (target.pathname === '/api/noah/feedback') return { body: { comments: [], summary: { users: 0, crowns: 0, comments: 0, crowned: false }, hasMore: false } };
      else if (target.pathname === '/api/noah/provider') response = await provider(request);
      else if (target.pathname === '/api/noah/ask') response = await asks.collection(request);
      else if (target.pathname.startsWith('/api/noah/ask/')) response = await asks.item(request, target.pathname.split('/').at(-1));
      else assert.fail('unexpected request ' + url);
      return { status: response.status, body: await response.json() };
    } });
    const home = ui.mount('components/noah-home.tsx', { mode: 'public' });
    await home.flush();
    assert.ok(home.find('a').some(link => link.props.href === '/noah#noah-collection'));
    assert.equal(home.find('a').some(link => link.props.href?.includes('/business-si')), false);
    assert.doesNotMatch(home.text(), /siの導入準備を、ここから|3回|10回|UTC/);
    const search = ui.mount('components/noah-public-catalog.tsx', { embedded: true });
    await search.flush();
    await search.change(search.find('input')[0], '研修');
    const card = search.find('a', entries[0].card.name)[0];
    assert.equal(card.props.href, noahCardHref(entries[0].card));
    assert.ok(ui.calls.some(call => new URL(call.url, 'https://noah.test').searchParams.get('q') === '研修'));
    const publicDetail = ui.mount('components/noah-project-detail.tsx', { id: new URL(card.props.href, 'https://noah.test').searchParams.get('id') });
    await publicDetail.flush();
    assert.equal(publicDetail.find('button', '使う').length, 0);
    await publicDetail.click('プラグインを追加');
    await publicDetail.flush();
    assert.ok(publicDetail.find('a', 'プラグインを開く')[0], publicDetail.text());
    const pluginHref = publicDetail.find('a', 'プラグインを開く')[0].props.href;
    assert.equal(calls, 0, 'adding a plugin saves the definition without executing it');
    const detail = ui.mount('components/noah-agent-detail.tsx', { id: pluginHref.split('/').at(-1) });
    await detail.flush(); await detail.click('使う');
    assert.doesNotMatch(detail.text(), /3回|10回|UTC/);
    for (const field of endpoint.fields) {
      const value = input.input[field.name];
      if (value === undefined || field.kind === 'fixed' || (field.kind === 'boolean' && value === false)) continue;
      const node = [...detail.find('input'), ...detail.find('select'), ...detail.find('textarea')].find(node => node.props.id === 'id-' + field.name);
      assert.ok(node, field.name);
      await detail.change(node, field.kind === 'choice' ? JSON.stringify(value) : value);
    }
    assert.equal(calls, 0, 'searching and preparing a form do not run the tool');
    await detail.submit(detail.find('form')[0]);
    assert.equal(ui.visits.length, 1, detail.text());
    input.id = ui.visits[0].split('/').at(-1);
    for (let reload = 0; reload < 2; reload++) {
      const savedHref = myRoutes.noahMyHref('saved', 'results');
      assert.equal(savedHref, '/noah/my?view=saved&tab=results');
      const saved = ui.mount('components/noah-my.tsx', { params: Object.fromEntries(new URL(savedHref, 'https://noah.test').searchParams) });
      await saved.flush();
      assert.ok(saved.find('a').some(link => link.props.href === `/noah/tasks/${input.id}`));
      const result = ui.mount('components/noah-task-detail.tsx', { id: input.id });
      await result.flush(); await result.tick(0);
      assert.match(result.text(), /公開用の模擬業務を整理します。/);
      assert.match(result.text(), /相談を希望しないため、整理票だけを作成/);
      assert.doesNotMatch(result.text(), /(?:1人|本人|全体|1日|日次).{0,8}(?:3回|10回)|UTC|無料枠/);
    }
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
