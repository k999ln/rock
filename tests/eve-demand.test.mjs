// task 130 段 3: 需要の台帳。合格条件: 出典の無い需要 0。受注・ASP・売り場の 3 つの元から、出典付きの需要が各 1 件以上。
// ここで使う募集・案件・価格は合成の物（外へは通信しない）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKY_GIG_OFFERS } from '../lib/sky-gig-offers.ts';
import {
  EVE_DEMAND_MAX_AGE_DAYS, eveDemandFromAffiliateOffers, eveDemandFromGigPostings, eveDemandFromMarket,
  eveDemandLedger, eveDemandProblems, eveExpectedProfit, eveSaleRate,
} from '../lib/eve-demand.ts';

const NOW = Date.parse('2026-11-24T00:00:00Z');
const day = (n) => new Date(NOW - n * 86_400_000).toISOString();
const posting = (id, title, budget, applicants, url = `https://coconala.com/requests/${id}`) => ({
  id, channel: 'coconala', url, title, category: null, body: '', budgetMinYen: null, budgetMaxYen: budget, closesOn: null, deliveryOn: null, applicants,
});

void test('段 3: gig postings become demand with the buyer budget as price, counted per offer', () => {
  const observed = [
    { observedAt: day(1), posting: posting('1', 'SEO記事を5本お願いします', 15_000, 4) },
    { observedAt: day(2), posting: posting('2', 'コラム執筆（AI 研修）', 9_000, 10) },
    { observedAt: day(20), posting: posting('3', 'ブログ記事のライティング', 12_000, 6) },
    { observedAt: day(1), posting: posting('4', 'GAS でスプレッドシートを集計したい', 20_000, 2) },
    { observedAt: day(1), posting: posting('5', 'SEO記事（予算は相談）', null, 3) },
    { observedAt: day(1), posting: posting('6', 'SEO記事（URL なし）', 8_000, 1, null) },
  ];
  const demand = eveDemandFromGigPostings(observed, SKY_GIG_OFFERS, NOW);
  const column = demand.find((d) => d.id === 'gig:column-writing:coconala');
  assert.ok(column, JSON.stringify(demand.map((d) => d.id)));
  assert.equal(column.priceYen, 12_000, 'median of 15,000 / 9,000 / 12,000');
  assert.equal(column.volumePerWeek, 2, 'only the postings seen in the last 7 days');
  assert.equal(column.competitors, 6);
  assert.equal(column.sources.length, 3, 'no budget or no URL → not counted');
  assert.ok(demand.some((d) => d.id === 'gig:sheet-automation:coconala'));
  assert.deepEqual(eveDemandFromGigPostings(observed, SKY_GIG_OFFERS, NOW), demand, 'deterministic');
});

void test('段 3: ASP offers become demand per conversion; account/deposit/trade are finance', () => {
  const offers = [
    { id: '1001', productName: '法人向け AI 研修', serviceKey: 'ai-training', rewardYen: 8_000, event: 'consultation', partnered: true, evidence: [{ url: 'https://example.com/asp/1001', note: '案件の詳細', checkedAt: day(3) }] },
    { id: '1002', productName: 'ネット証券', serviceKey: 'securities', rewardYen: 12_000, event: 'account', partnered: false, evidence: [{ url: 'https://example.com/asp/1002', note: '案件の詳細', checkedAt: day(3) }] },
    { id: '1003', productName: '報酬なし', serviceKey: 'x', rewardYen: 0, event: 'purchase', evidence: [] },
  ];
  const demand = eveDemandFromAffiliateOffers(offers);
  assert.deepEqual(demand.map((d) => d.id), ['affiliate:ai-training:1001', 'affiliate:securities:1002']);
  assert.equal(demand[0].finance, false);
  assert.equal(demand[1].finance, true);
  assert.match(demand[1].label, /提携前/u);
  assert.equal(demand[0].outcome, 'conversion:ai-training:consultation');
});

void test('段 3: marketplace prices are grouped per place and outcome', () => {
  const demand = eveDemandFromMarket([
    { place: 'note', item: 'AI 研修の資料テンプレ', outcome: 'digital:template', priceYen: 980, soldPerWeek: 3, listings: 40, url: 'https://note.com/a', checkedAt: day(5) },
    { place: 'note', item: '別の資料テンプレ', outcome: 'digital:template', priceYen: 1_480, soldPerWeek: 1, listings: 60, url: 'https://note.com/b', checkedAt: day(6) },
  ]);
  assert.equal(demand.length, 1);
  assert.equal(demand[0].priceYen, 1_230);
  assert.equal(demand[0].competitors, 50);
  assert.equal(demand[0].volumePerWeek, 2);
});

void test('段 3: the ledger keeps only sourced, fresh, https demand — at least one from each of the three origins', () => {
  const good = [
    ...eveDemandFromGigPostings([{ observedAt: day(1), posting: posting('1', 'SEO記事', 15_000, 4) }], SKY_GIG_OFFERS, NOW),
    ...eveDemandFromAffiliateOffers([{ id: '1001', productName: 'AI 研修', serviceKey: 'ai-training', rewardYen: 8_000, event: 'consultation', partnered: true, evidence: [{ url: 'https://example.com/asp/1001', note: 'n', checkedAt: day(3) }] }]),
    ...eveDemandFromMarket([{ place: 'note', item: 'テンプレ', outcome: 'digital:template', priceYen: 980, url: 'https://note.com/a', checkedAt: day(5) }]),
  ];
  const bad = [
    { ...good[0], id: 'gig:nosource', sources: [] },
    { ...good[1], id: 'affiliate:stale', sources: [{ url: 'https://example.com', checkedAt: day(EVE_DEMAND_MAX_AGE_DAYS + 1) }] },
    { ...good[2], id: 'market:http', sources: [{ url: 'http://example.com', checkedAt: day(1) }] },
    { ...good[2], id: 'market:free', priceYen: 0 },
  ];
  const { entries, rejected } = eveDemandLedger([...good, ...bad], NOW);
  assert.deepEqual(new Set(entries.map((d) => d.origin)), new Set(['gig', 'affiliate', 'market']));
  assert.ok(entries.every((d) => d.sources.length > 0 && eveDemandProblems(d, NOW).length === 0), 'no unsourced demand');
  assert.deepEqual(rejected.map((r) => r.id).sort(), ['affiliate:stale', 'gig:nosource', 'market:free', 'market:http']);
  const fresher = { ...good[2], checkedAt: day(0), sources: [{ url: 'https://note.com/new', checkedAt: day(0) }] };
  assert.equal(eveDemandLedger([good[2], fresher], NOW).entries[0].sources[0].url, 'https://note.com/new', 'same id → the fresher one');
});

void test('段 3: sale rate is conservative until 5 real outcomes exist, then follows the record', () => {
  const base = { id: 'x', origin: 'market', outcome: 'o', label: 'l', payer: 'p', place: 'q', priceYen: 1_000, finance: false, sources: [{ url: 'https://a.b', checkedAt: day(1) }], checkedAt: day(1) };
  assert.deepEqual(eveSaleRate({ ...base, volumePerWeek: 0, competitors: null }), { rate: 0, basis: 'prior' });
  assert.deepEqual(eveSaleRate({ ...base, volumePerWeek: null, competitors: null }), { rate: 0.1, basis: 'prior' });
  assert.deepEqual(eveSaleRate({ ...base, volumePerWeek: 5, competitors: 8 }), { rate: 0.1, basis: 'prior' });
  assert.deepEqual(eveSaleRate({ ...base, volumePerWeek: 5, competitors: 0 }), { rate: 0.5, basis: 'prior' });
  assert.deepEqual(eveSaleRate({ ...base, volumePerWeek: 5, competitors: 8 }, { offered: 4, sold: 4 }), { rate: 0.1, basis: 'prior' }, 'under 5 → still the prior');
  assert.deepEqual(eveSaleRate({ ...base, volumePerWeek: 5, competitors: 8 }, { offered: 8, sold: 3 }), { rate: 0.4, basis: 'record' });
  const p = eveExpectedProfit({ demand: { ...base, volumePerWeek: 5, competitors: 8 }, record: { offered: 8, sold: 3 }, costYen: 100, ownerMinutes: 10, ownerMinuteValueYen: 20 });
  assert.deepEqual(p, { profitYen: 100, rate: 0.4, basis: 'record' }, '0.4 × 1,000 − 100 − 10 × 20 = 100');
});

// 段 3 の後半: 能力を確かめる（語で当たっただけの候補は工程に当てない）。相手は合成の物。
import { EVE_VERIFY_TASKS, eveMergeVerified, eveVerifyCapability } from '../lib/eve-verify.ts';

void test('段 3: a capability is verified only when the sample job passes Jev; failures are recorded and never retried', async () => {
  const task = EVE_VERIFY_TASKS.find((t) => t.capability === 'research.market');
  const calls = [];
  const call = async (ref) => {
    calls.push(ref.ref);
    if (ref.ref === 'noah:good') return { output: { topic: '法人向け AI 研修', keywords: ['比較', '料金', '助成金', '事例', '口コミ'] } };
    if (ref.ref === 'noah:thin') return { output: { topic: '法人向け AI 研修', keywords: ['比較'] } };
    throw new Error('timeout');
  };
  const refs = ['noah:good', 'noah:thin', 'noah:down'].map((ref) => ({ ref, version: 'abcdef012345', tool: 'search' }));
  const results = await eveVerifyCapability(task, refs, call, () => NOW);
  assert.deepEqual(results.map((r) => [r.ref, r.ok]), [['noah:good', true], ['noah:thin', false], ['noah:down', false]]);
  assert.deepEqual(calls, ['noah:good', 'noah:thin', 'noah:down'], 'one call each');
  assert.match(results[0].inputHash, /^[a-f0-9]{64}$/u);
  assert.equal(results[2].outputHash, null);
  const file = { schema: 'noah-business-capabilities/1', note: 'n', verified: { 'tracking.results': ['noah:reader'] } };
  const merged = eveMergeVerified(file, results);
  assert.deepEqual(merged.verified, { 'research.market': ['noah:good'], 'tracking.results': ['noah:reader'] });
  assert.deepEqual(file.verified, { 'tracking.results': ['noah:reader'] }, 'the original is not rewritten');
  assert.deepEqual(eveMergeVerified(merged, results).verified, merged.verified, 'idempotent');
});

void test('段 3: the sample jobs cover the two capabilities that block all 470 blueprints', () => {
  const caps = EVE_VERIFY_TASKS.map((t) => t.capability);
  assert.ok(caps.includes('research.market') && caps.includes('tracking.results'));
  for (const t of EVE_VERIFY_TASKS) assert.ok(t.accept && t.input && t.label, t.capability);
});
