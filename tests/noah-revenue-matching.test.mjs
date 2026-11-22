import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDiscovery,
  matchRevenueCandidates,
  validateOfferIndex,
  revenuePublications,
  observeBusinessAdapter,
} from '../toolkits/noah-affiliate-agents/revenue-matching.mjs';
import {
  loadRevenue,
  saveRevenue,
} from '../toolkits/noah-affiliate-agents/revenue-storage.mjs';
const now = Date.now(),
  at = new Date(now).toISOString();
const card = (n) => ({
  id: 'project-' + String(n).padStart(64, '0'),
  name: 'WordPress helper',
  summary: 'website maintenance',
});
const index = {
  schema: 'noah-partner-index/1',
  checkedAt: at,
  sourceSha256: 'a'.repeat(64),
  offers: [
    { id: '123', partnered: true, domains: ['website'], rewardYen: 'PRIVATE' },
  ],
};
await test('類似候補は広告/実行許可にならず、秘密列は保存しない', () => {
  const clean = validateOfferIndex(index);
  assert.doesNotMatch(JSON.stringify(clean), /PRIVATE|rewardYen/);
  const result = matchRevenueCandidates(
    [{ id: 'a', domains: ['website'] }],
    clean,
  );
  assert.equal(result.total, 1);
  assert.equal(result.approved, 0);
  assert.equal(result.samples[0].state, 'needs_evidence');
  assert.throws(() =>
    validateOfferIndex({
      ...index,
      offers: [...index.offers, ...index.offers],
    }),
  );
  assert.throws(() =>
    validateOfferIndex({
      ...index,
      offers: [{ ...index.offers[0], partnered: false }],
    }),
  );
});
await test('複数回の巡回を復旧し、完全な世代だけを採用する', async () => {
  const fetcher = async (url) => {
    if (new URL(url).pathname.endsWith('/revenue/catalog'))
      return new Response(null, { status: 404 });
    const offset = Number(new URL(url).searchParams.get('cursor'));
    return Response.json({
      items: [card(offset)],
      total: 3,
      nextCursor: offset === 2 ? null : String(offset + 1),
    });
  };
  let state = await advanceDiscovery(null, { fetcher, now, maxPages: 1 });
  assert.equal(state.snapshot, null);
  assert.equal(state.cycle.cards.length, 1);
  state = await advanceDiscovery(JSON.parse(JSON.stringify(state)), {
    fetcher,
    now: now + 900000,
  });
  assert.equal(state.snapshot.total, 3);
  assert.equal(state.cycle, null);
  assert.equal(state.error, null);
});
await test('重複・欠落・総数変化・不正cursor・過大ページで前世代を保つ', async () => {
  const old = {
    cycle: null,
    nextAt: 0,
    snapshot: { total: 1, checkedAt: at, cards: [{ id: 'old', domains: [] }] },
  };
  const responses = [
    [{ items: [card(0), card(0)], total: 2, nextCursor: null }],
    [{ items: [card(0)], total: 2, nextCursor: null }],
    [
      { items: [card(0)], total: 2, nextCursor: '1' },
      { items: [card(1)], total: 3, nextCursor: null },
    ],
    [{ items: [card(0)], total: 2, nextCursor: 'https://evil.example' }],
    [{ items: [card(0)], total: 2, nextCursor: '0' }],
  ];
  for (const batch of responses) {
    const state = await advanceDiscovery(old, {
      now,
      fetcher: async (url) =>
        url.includes('/revenue/catalog')
          ? new Response(null, { status: 404 })
          : Response.json(batch.shift()),
    });
    assert.ok(state.error);
    assert.deepEqual(state.snapshot, old.snapshot);
    assert.equal(state.cycle, null);
  }
  const oversized = await advanceDiscovery(old, {
    now,
    fetcher: async (url) =>
      url.includes('/revenue/catalog')
        ? new Response(null, { status: 404 })
        : new Response('x'.repeat(262145)),
  });
  assert.equal(oversized.error, 'catalog_page_too_large');
  assert.deepEqual(oversized.snapshot, old.snapshot);
});
await test('DOの値上限内で3千件の索引と一覧を分割保存し世代の削除も復旧', async () => {
  const rows = new Map();
  const storage = {
    get: async (k) => structuredClone(rows.get(k)),
    put: async (k, v) => {
      assert.ok(Buffer.byteLength(JSON.stringify(v)) < 128000, k);
      rows.set(k, structuredClone(v));
    },
    delete: async (k) => rows.delete(k),
  };
  const value = {
    revision: 1,
    enabled: true,
    discovery: {
      snapshot: {
        total: 3000,
        cards: Array.from({ length: 3000 }, (_, i) => ({
          ...card(i),
          name: 'あ'.repeat(200),
          domains: ['website'],
        })),
      },
      cycle: null,
    },
    index: {
      ...validateOfferIndex(index),
      offers: Array.from({ length: 3224 }, (_, i) => ({
        id: String(i),
        partnered: true,
        domains: ['website'],
      })),
    },
  };
  await saveRevenue(storage, value);
  assert.deepEqual(await loadRevenue(storage), value);
  value.discovery.snapshot = null;
  value.index = null;
  await saveRevenue(storage, value);
  assert.equal(rows.size, 1);
  assert.deepEqual(await loadRevenue(storage), value);
});
await test('実行器の条件と停止・鮮度を再確認し、承認報酬は公開しない', async () => {
  const fetcher = async (_url, options) =>
    Response.json(
      JSON.parse(options.body).action === 'report'
        ? { offerId: '123', launchBlockers: [], approvedYen: 0, privateValue: 'PRIVATE' }
        : {
            enabled: true,
            lastRunAt: at,
            runCount: 3,
            stages: ['acquisition', 'consultation', 'referral'].map((id) => ({
              id,
              state: 'running',
            })),
          },
    );
  const business = await observeBusinessAdapter('x'.repeat(32), {
    now,
    fetcher,
  });
  assert.equal(business.ready, true);
  const state = { enabled: true, business, index: validateOfferIndex(index) };
  assert.equal(business.offerId, '123');
  for (const invalid of [
    { ...state, index: null },
    { ...state, index: { offers: [] } },
    { ...state, business: { ...business, offerId: '456' } },
  ]) assert.deepEqual(revenuePublications(invalid, now), []);
  assert.equal(revenuePublications(state, now).length, 1);
  assert.doesNotMatch(
    JSON.stringify(revenuePublications(state, now)),
    /PRIVATE|approvedYen|rewardYen|siteId|offerId/,
  );
  assert.equal(revenuePublications(state, now + 1200001).length, 0);
  assert.equal(
    revenuePublications({ ...state, enabled: false }, now).length,
    0,
  );
  const failed = await observeBusinessAdapter('x'.repeat(32), {
    now,
    fetcher: async () => new Response('', { status: 401 }),
  });
  assert.equal(failed.ready, false);
  const closed = await observeBusinessAdapter('x'.repeat(32), {
    now,
    fetcher: async () =>
      Response.json({ enabled: true, launchBlockers: ['media'] }),
  });
  assert.equal(closed.ready, false);
});

await test(
  '実Worker: 非公開索引・alarm照合・公開撤回・SQLite再起動',
  { timeout: 60000 },
  async () => {
    const { build } = await import('esbuild');
    const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const dir = await mkdtemp(tmpdir() + '/noah-revenue-worker-');
    const bundle = await build({
      entryPoints: ['toolkits/noah-affiliate-agents/combination-worker.mjs'],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
    });
    const token = 'synthetic-owner-token-with-thirty-two-characters';
    const options = {
      ...convertV4MiniflareOptions({
        script: bundle.outputFiles[0].text,
        modules: true,
        compatibilityDate: '2026-10-01',
        durableObjects: {
          COMBINATIONS: { className: 'CombinationLedger', useSQLite: true },
        },
        durableObjectsPersist: dir,
        bindings: {
          COMBINATION_CONFIG_JSON: JSON.stringify({
            schema: 'noah-combinations/1',
            schemes: [],
          }),
          OPERATIONS_TOKEN: token,
          BUSINESS_OPERATIONS_TOKEN: token,
        },
        outboundService: async (request) => {
          if (new URL(request.url).hostname === 'avoado.si')
            return Response.json({
              schema: 'noah-revenue-catalog/1',
              items: [card(0)],
              total: 1,
              nextCursor: null,
            });
          return Response.json(
            (await request.json()).action === 'report'
              ? { offerId: '123', launchBlockers: [] }
              : {
                  enabled: true,
                  lastRunAt: at,
                  runCount: 1,
                  stages: ['acquisition', 'consultation', 'referral'].map(
                    (id) => ({ id, state: 'running' }),
                  ),
                },
          );
        },
      }),
      resourcePersistencePath: dir,
      isolatedResourcePersistencePath: dir,
    };
    let mf = new Miniflare(options);
    const owner = (input) =>
      mf.dispatchFetch('https://example.com/operations/api', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
    const published = async () =>
      (await (await mf.dispatchFetch('https://example.com/api/revenue')).json())
        .items;
    try {
      assert.equal(
        (
          await mf.dispatchFetch('https://example.com/operations/api', {
            method: 'POST',
          })
        ).status,
        401,
      );
      assert.equal(
        (await owner({ action: 'revenue_index', expectedRevision: 0, index }))
          .status,
        200,
      );
      assert.equal(
        (await owner({ action: 'revenue_start', expectedRevision: 0 })).status,
        409,
      );
      assert.equal(
        (await owner({ action: 'revenue_start', expectedRevision: 1 })).status,
        200,
      );
      await owner({ action: 'revenue_sync' });
      let status = await (await owner({ action: 'revenue_status' })).json();
      assert.equal(status.catalog.total, 1, JSON.stringify(status));
      assert.equal(status.matches.total, 1);
      assert.equal((await published()).length, 1);
      await mf.dispose();
      mf = new Miniflare(options);
      status = await (await owner({ action: 'revenue_status' })).json();
      assert.equal(status.index.count, 1);
      assert.equal(status.matches.total, 1);
      await owner({
        action: 'revenue_stop',
        expectedRevision: status.revision,
      });
      assert.deepEqual(await published(), []);
      await owner({ action: 'revenue_sync' });
      assert.deepEqual(await published(), []);
    } finally {
      await mf.dispose();
      await rm(dir, { force: true, recursive: true });
    }
  },
);
