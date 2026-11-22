import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  validateCombinationConfig,
  combinationVerdict,
  publicCombination,
  emptyCombinationState,
  runCombinations,
  prepareCombination,
  applyCombinationObservation,
  combinationReport,
} from '../toolkits/noah-affiliate-agents/combination-core.mjs';
const now = Date.now(),
  at = new Date(now).toISOString();
const scheme = {
  id: 'sample-bank',
  title: '合成サービス',
  summary: '実案件ではない試験用サービス',
  category: 'finance',
  tool: {
    name: '公式ツール',
    serviceKeys: ['sample-bank'],
    available: true,
    useAllowed: true,
  },
  offer: {
    id: '1',
    productName: '合成口座',
    serviceKey: 'sample-bank',
    rewardYen: 12000,
    partnered: true,
    channels: ['owned_web'],
    event: 'account',
  },
  checkedAt: at,
  validUntil: new Date(now + 86400000).toISOString(),
  evidence: [
    {
      url: 'https://example.com/official',
      note: '公式の説明',
      checkedAt: at,
      public: true,
    },
    {
      url: 'https://example.com/private',
      note: 'PRIVATE-CONTRACT',
      checkedAt: at,
      public: false,
    },
  ],
  preparation: ['費用と必要事項を確認'],
  exclusions: ['重複申込は対象外'],
  siteId: '2',
  termsConsistent: true,
  mediaApproved: true,
  contentApproved: true,
  guideApproved: true,
  enabled: true,
  affiliateUrl: 'https://www.rentracks.jp/adx/r.html?idx=0.1.2.3.4&dna=5',
};
const config = { schema: 'noah-combinations/1', schemes: [scheme] };
const input = {
  schemeId: scheme.id,
  purpose: 'open',
  region: 'jp',
  adult: true,
  existingAccount: false,
  riskUnderstood: true,
};
const active = () => ({ ...emptyCombinationState(), enabled: true });
const prepare = (state = active(), c = config) =>
  prepareCombination(state, c, input, { now, uuid: 'a'.repeat(32) });
const capture = (status = 'pending', sha = 'a', time = now) => ({
  schema: 'noah-source-observation/1',
  stream: 'rentracks_orders',
  sourceUrl: 'https://manage.rentracks.jp/manage/detail_sales',
  offerId: '1',
  sha256: sha.repeat(64),
  observedAt: new Date(time).toISOString(),
  scope: { allSites: true, allStates: true },
  summary: { targetRows: 1 },
  rows: [
    {
      id: '123',
      offerId: '1',
      uix: 'nb.' + 'a'.repeat(32),
      status,
      rewardYen: 12000,
      sourceRef: 'rentracks.sha256.' + sha.repeat(64) + '.order.123',
    },
  ],
});
await test('独立した許可と鮮度がすべて揃う場合だけ正式紹介', () => {
  validateCombinationConfig(config);
  assert.equal(combinationVerdict(scheme, now).state, 'ready');
  for (const change of [
    { tool: { ...scheme.tool, serviceKeys: ['other-bank'] } },
    { tool: { ...scheme.tool, useAllowed: false } },
    { offer: { ...scheme.offer, partnered: false } },
    { offer: { ...scheme.offer, channels: ['email'] } },
    { mediaApproved: false },
    { contentApproved: false },
    { termsConsistent: false },
    { enabled: false },
    { affiliateUrl: 'https://evil.example/' },
    { validUntil: new Date(now - 1).toISOString() },
  ]) {
    const c = { ...config, schemes: [{ ...scheme, ...change }] };
    assert.equal(prepare(active(), c).result.referralUrl, null);
  }
  assert.throws(() =>
    validateCombinationConfig({ ...config, schemes: [scheme, scheme] }),
  );
  assert.equal(prepare(emptyCombinationState()).result.referralUrl, null);
  assert.equal(prepare(emptyCombinationState()).result.state, 'preparing');
  for (const change of [
    { adult: false },
    { region: 'other' },
    { existingAccount: true },
    { purpose: 'compare' },
    { riskUnderstood: false },
  ])
    assert.equal(
      prepareCombination(active(), config, { ...input, ...change }, { now })
        .result.referralUrl,
      null,
    );
});
await test('公開投影にASP契約・単価・正式URLを混ぜない', () => {
  assert.doesNotMatch(
    JSON.stringify(publicCombination(scheme, now)),
    /PRIVATE|rewardYen|12000|rentracks|siteId|partnered/,
  );
  const { state, result } = prepare();
  assert.match(result.referralUrl, /uix=nb\./);
  assert.deepEqual(Object.keys(state.leads[result.uix]).sort(), [
    'campaign',
    'createdAt',
    'offerId',
    'schemeId',
    'siteId',
  ]);
});
await test('定期実行・期限切れ・公開撤回', () => {
  const first = runCombinations(active(), config, now);
  assert.equal(first.state.articles[scheme.id].state, 'ready');
  assert.equal(runCombinations(first.state, config, now + 1000).ran, false);
  const expired = runCombinations(first.state, config, now + 2 * 86400000);
  assert.equal(expired.state.articles[scheme.id].state, 'preparing');
  assert.equal(
    expired.state.stages[scheme.id].approvalTracking,
    'needs_connection',
  );
  const removed = runCombinations(
    first.state,
    { ...config, schemes: [{ ...scheme, guideApproved: false }] },
    now + 900000,
  );
  assert.deepEqual(removed.state.articles, {});
});
await test('実成果の帰属・重複・承認遷移と費用不明を保持', () => {
  let state = prepare().state;
  state = applyCombinationObservation(state, config, capture(), now).state;
  assert.equal(combinationReport(state, config)[0].pending, 1);
  assert.equal(
    applyCombinationObservation(state, config, capture(), now).duplicate,
    true,
  );
  state = applyCombinationObservation(
    state,
    config,
    capture('approved', 'b'),
    now,
  ).state;
  const report = combinationReport(state, config)[0];
  assert.equal(report.approvedYen, 12000);
  assert.equal(report.approved, 1);
  assert.equal(report.approvedMinusCostYen, null);
  assert.equal(report.depositVerified, false);
  assert.throws(() =>
    applyCombinationObservation(state, config, capture('pending', 'c'), now),
  );
  assert.throws(() =>
    applyCombinationObservation(
      state,
      config,
      capture('approved', 'c', now - 1),
      now,
    ),
  );
  const other = capture();
  other.rows[0].uix = 'nb.' + 'b'.repeat(32);
  assert.equal(
    applyCombinationObservation(prepare().state, config, other, now).unmatched,
    1,
  );
  const invalid = capture();
  invalid.rows[0].sourceRef = 'unverified';
  assert.throws(() =>
    applyCombinationObservation(prepare().state, config, invalid, now),
  );
});
await test('0件の取得と期限切れを区別', () => {
  const empty = { ...capture(), rows: [], summary: { targetRows: 0 } };
  const observed = applyCombinationObservation(
    active(),
    config,
    empty,
    now,
  ).state;
  assert.equal(
    runCombinations(observed, config, now).state.stages[scheme.id]
      .approvalTracking,
    'observed',
  );
  assert.equal(
    runCombinations(observed, config, now + 86400001).state.stages[scheme.id]
      .approvalTracking,
    'stale',
  );
});
await test(
  '実Worker/SQLite: 認証・MCP・アラーム・再起動後の承認追跡',
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'noah-combinations-'));
    const built = await build({
      entryPoints: ['toolkits/noah-affiliate-agents/combination-worker.mjs'],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
    });
    const token = 'synthetic-operations-only-token-for-test';
    const options = {
      ...convertV4MiniflareOptions({
        script: built.outputFiles[0].text,
        modules: true,
        compatibilityDate: '2026-10-01',
        durableObjects: {
          COMBINATIONS: { className: 'CombinationLedger', useSQLite: true },
        },
        durableObjectsPersist: dir,
        bindings: {
          COMBINATION_CONFIG_JSON: JSON.stringify(config),
          OPERATIONS_TOKEN: token,
        },
      }),
      resourcePersistencePath: dir,
      isolatedResourcePersistencePath: dir,
    };
    let mf = new Miniflare(options);
    const request = (p, v, headers = {}) =>
      mf.dispatchFetch('https://agent.example' + p, {
        method: v === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: v === undefined ? undefined : JSON.stringify(v),
      });
    const owner = (v) =>
      request('/operations/api', v, { authorization: 'Bearer ' + token });
    try {
      assert.equal(
        (await request('/operations/api', { action: 'start' })).status,
        401,
      );
      assert.equal(
        (
          await request('/api/prepare', input, {
            origin: 'https://evil.example',
          })
        ).status,
        403,
      );
      assert.equal(
        (await (await request('/api/prepare', input)).json()).referralUrl,
        null,
      );
      await owner({ action: 'start' });
      let state;
      for (let i = 0; i < 50; i++) {
        state = await (await owner({ action: 'status' })).json();
        if (state.runCount > 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(state.runCount > 0);
      const catalog = await (await request('/api/catalog')).json();
      assert.equal(catalog.items.length, 1);
      assert.doesNotMatch(JSON.stringify(catalog), /PRIVATE|rewardYen/);
      const prep = await (await request('/api/prepare', input)).json();
      assert.match(prep.referralUrl, /uix=nb\./);
      const obs = capture('approved');
      obs.rows[0].uix = prep.uix;
      assert.equal(
        (await (await owner({ action: 'observe', observation: obs })).json())
          .accepted,
        1,
      );
      const mcp = await (
        await request('/consult/mcp', {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'list_service_combinations', arguments: {} },
        })
      ).json();
      assert.equal(JSON.parse(mcp.result.content[0].text)[0].id, scheme.id);
      assert.equal((await request('/agent/' + scheme.id)).status, 200);
      await owner({ action: 'stop' });
      assert.equal(
        (await (await request('/api/prepare', input)).json()).referralUrl,
        null,
      );
      await mf.dispose();
      mf = new Miniflare(options);
      const restored = await (await owner({ action: 'status' })).json();
      assert.equal(restored.enabled, false);
      assert.equal(restored.report[0].approved, 1);
    } finally {
      await mf.dispose();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

await test('掛け合わせは確認済みサービスキーだけ。新規候補は必ず公開前', async () => {
  const { draftCombinationCandidates } =
    await import('../toolkits/noah-affiliate-agents/combination-candidates.mjs');
  const t = {
    id: 'official-tool',
    name: '公式ツール',
    summary: '準備を整理',
    category: 'finance',
    serviceKeys: ['sample-bank'],
    allowedServices: ['sample-bank'],
    available: true,
    evidence: scheme.evidence,
    preparation: scheme.preparation,
  };
  const o = {
    ...scheme.offer,
    publicName: '合成口座',
    siteId: '2',
    evidence: scheme.evidence,
    exclusions: scheme.exclusions,
    termsConsistent: true,
  };
  const r = draftCombinationCandidates(
    [t],
    [o, { ...o, id: '2', serviceKey: 'different-bank' }],
    now,
  );
  assert.equal(r.config.schemes.length, 1);
  assert.equal(r.config.schemes[0].guideApproved, false);
  assert.equal(r.config.schemes[0].affiliateUrl, null);
  assert.equal(r.assessments[0].state, 'preparing');
});
