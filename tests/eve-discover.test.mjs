// task 130 段 4: Eve の探索と発見。合格条件: 型に無い組み合わせを 1 つ以上候補に出し、見込みの利益を出典付きの数字で示す。
// 部品が足りない時は、足りない素材の名前を返す。確かめていない矢印は使わない。相手は合成の物。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noahBlueprints } from '../lib/noah-business.ts';
import { defineCombination, eveCombinationProblems, eveCombinationStatus } from '../lib/eve-combination.ts';
import {
  eveChooseCandidate, eveCombinationFromDiscovery, eveDiscoverForward, eveDiscoverFromDemand, eveMaterial, eveNeighbors,
} from '../lib/eve-discover.ts';
import { EVE_GIG_SKILL_OFFERS, eveFitTemplate, eveOwnerMinutesPerRun, eveRankTemplates, eveTemplateDemand, eveTemplateSignatures } from '../lib/eve-combination-search.ts';

const NOW = '2026-11-23T00:00:00Z';
const src = (u) => [{ url: `https://example.com/${u}`, checkedAt: NOW }];
const D = (id, origin, outcome, place, priceYen, volumePerWeek, competitors, extra = {}) =>
  ({ id, origin, outcome, label: id, payer: 'p', place, priceYen, volumePerWeek, competitors, finance: false, sources: src(id), checkedAt: NOW, ...extra });
const ledger = [
  D('gig:column-writing:coconala', 'gig', 'delivery:column-writing', 'coconala', 12_000, 3, 4),
  D('gig:short-translation:coconala', 'gig', 'delivery:short-translation', 'coconala', 8_000, 2, 2),
  D('market:note:digital-template', 'market', 'digital:template', 'note', 1_230, 2, 50),
  D('affiliate:ai-tools:1001', 'affiliate', 'conversion:ai-tools:consultation', 'ASP', 8_000, null, null),
];
const H = 'abcdef012345';
const A = (id, capability, consumes, produces, extra = {}) => ({ id, version: H, tool: 'run', capability, consumes, produces, verified: true, costYen: 0, ownerMinutes: 0, runs: 0, accepted: 0, ...extra });
const arrows = [
  A('noah:researcher', 'research.market', ['topic'], 'research-report'),
  A('noah:writer', 'content.article', ['research-report'], 'delivery:column-writing', { costYen: 100 }),
  A('noah:translator', 'gig.deliver', ['delivery:column-writing'], 'delivery:short-translation', { costYen: 50 }),
  A('noah:templater', 'product.digital', ['research-report'], 'digital:template'),
  A('noah:unchecked', 'gig.deliver', ['topic'], 'delivery:short-translation', { verified: false }),
];
const input = { have: ['topic'], demand: ledger, arrows, templates: eveTemplateSignatures() };

void test('段 4: from demand back to what we have — candidates, profit, and the missing materials', () => {
  const { candidates, gaps } = eveDiscoverFromDemand(input);
  assert.ok(candidates.length >= 3);
  assert.ok(candidates.every((c) => c.arrows.every((a) => a.verified)), 'unverified arrows are never used');
  const column = candidates.find((c) => c.demandId === 'gig:column-writing:coconala');
  assert.deepEqual(column.arrows.map((a) => a.id), ['noah:researcher', 'noah:writer']);
  // 売れる見込み 1/(2+4)、単価 12,000 円、工程が通る見込み 1/2 × 1/2、実費 100 円。
  assert.equal(column.profitYen, Math.floor((1 / 6) * 12_000 * 0.25 - 100));
  assert.equal(column.origin, 'discovered', 'no blueprint makes things this way');
  assert.equal(column.blueprint, null);
  assert.deepEqual(gaps, [{ demandId: 'affiliate:ai-tools:1001', missingMaterials: [eveMaterial('conversion:ai-tools:consultation')] }]);
  const sorted = [...candidates].sort((a, b) => b.profitYen - a.profitYen);
  assert.deepEqual(candidates.map((c) => c.profitYen), sorted.map((c) => c.profitYen), 'sorted by expected profit');
  assert.deepEqual(eveDiscoverFromDemand(input), { candidates, gaps }, 'deterministic');
});

void test('段 4: forward from one agent — “A and B connect” — finds demand downstream', () => {
  const writer = arrows.find((a) => a.id === 'noah:writer');
  assert.deepEqual(eveNeighbors(writer, arrows).map((a) => a.id), ['noah:translator']);
  assert.deepEqual(eveDiscoverForward(writer, input), [], 'the starting agent needs its own input');
  const ready = { ...input, have: ['research-report'] };
  assert.deepEqual(eveDiscoverForward(writer, { ...ready, budgetYen: 125 }), [], 'the budget includes the starting agent');
  const found = eveDiscoverForward(writer, ready);
  assert.ok(found.length >= 1);
  assert.deepEqual(found[0].arrows.map((a) => a.id), ['noah:writer', 'noah:translator']);
  assert.equal(found[0].demandId, 'gig:short-translation:coconala');
  assert.deepEqual(eveDiscoverForward({ ...writer, verified: false }, input), [], 'an unverified start finds nothing');
});

void test('段 4: a path that equals a blueprint’s making steps is a template, with the blueprint id', () => {
  const templates = [{ blueprint: 'gig:writing:coconala', capabilities: ['content.article', 'research.market'] }];
  const { candidates } = eveDiscoverFromDemand({ ...input, templates });
  const column = candidates.find((c) => c.demandId === 'gig:column-writing:coconala');
  assert.equal(column.origin, 'template');
  assert.equal(column.blueprint, 'gig:writing:coconala');
});

void test('段 4: every 5th run tries the least-tested path', () => {
  const { candidates } = eveDiscoverFromDemand({ ...input, arrows: arrows.map((a) => (a.id === 'noah:researcher' ? { ...a, runs: 20, accepted: 18 } : a)) });
  assert.equal(eveChooseCandidate(candidates, 0).mode, 'best');
  const trial = eveChooseCandidate(candidates, 4);
  assert.ok(trial.mode === 'trial' || trial.candidate.key === candidates[0].key);
  assert.equal(eveChooseCandidate([], 0), null);
});

void test('段 4: a discovery becomes a full combination ending at the money exit; finance adds the owner review', () => {
  const { candidates } = eveDiscoverFromDemand(input);
  const d = candidates.find((c) => c.demandId === 'gig:short-translation:coconala');
  const demand = ledger.find((x) => x.id === d.demandId);
  const c = eveCombinationFromDiscovery(d, demand, { kind: 'eve' });
  defineCombination(c);
  assert.equal(c.origin, 'discovered');
  assert.equal(c.exit.step, 'payout');
  const verified = { 'research.market': ['noah:researcher'], 'content.article': ['noah:writer'], 'gig.deliver': ['noah:translator'] };
  const problems = eveCombinationProblems(c, { verified, demand: ledger });
  assert.deepEqual(problems.filter((p) => p.level === 'block'), []);
  assert.deepEqual(problems.filter((p) => p.level === 'paper').map((p) => p.step), ['track'], 'only the result reader is still missing');
  assert.equal(eveCombinationStatus(problems), 'paper');
  const fin = eveCombinationFromDiscovery(d, { ...demand, finance: true }, { kind: 'person', id: 'noellesugar99' });
  assert.ok(fin.steps.some((s) => s.kind === 'review'));
  assert.deepEqual(eveCombinationProblems(fin, { verified, demand: ledger }).filter((p) => p.level === 'block'), []);
});

void test('段 4: fitting verified agents into a template — best first, two fallbacks, gaps for the rest', () => {
  const first = defineCombination(JSON.parse(readFileSync(new URL('../data/eve-combinations/affiliate-ai-tools-blog.json', import.meta.url), 'utf8')));
  const agents = [
    { ref: 'noah:r1', version: H, tool: 'search', capability: 'research.market', runs: 10, accepted: 9 },
    { ref: 'noah:r2', version: H, tool: 'search', capability: 'research.market', runs: 10, accepted: 5 },
    { ref: 'noah:r3', version: H, tool: 'search', capability: 'research.market', runs: 0, accepted: 0 },
    { ref: 'noah:r4', version: H, tool: 'search', capability: 'research.market', runs: 2, accepted: 2 },
    { ref: 'noah:x', version: H, tool: 'x', capability: 'content.article', runs: 50, accepted: 50 },
  ];
  const verified = { 'research.market': ['noah:r1', 'noah:r2', 'noah:r3', 'noah:r4'] };
  const { combination, filled, gaps } = eveFitTemplate(first, agents, verified);
  const research = combination.steps.find((s) => s.id === 'research');
  assert.equal(research.agent.ref, 'noah:r1');
  // 合格率の見積り: r1 = 10/12、r4 = 3/4、r2 = 6/12、r3 = 1/2（r2 と r3 は同じなので ref の順）。
  assert.deepEqual(research.fallback.map((f) => f.ref), ['noah:r4', 'noah:r2']);
  assert.ok(filled.some((f) => f.step === 'rules:hosting'), 'terms checks use research.market too');
  assert.ok(gaps.some((g) => g.capability === 'content.article'), 'an agent that is not verified is not used, however good its record');
  assert.equal(first.steps.find((s) => s.id === 'research').agent, undefined, 'the original is not rewritten');
  // 本人の工程: 媒体の登録（押す 2 分）・提携の申込（押す 2 分）・入金の確認（5 分）。登録は最初の 1 回だけなので数えない。ブログへの公開は自動。
  assert.equal(eveOwnerMinutesPerRun(first), 2 + 2 + 5);
});

void test('段 4: templates are matched to demand and ranked by expected profit; templates without demand are not ranked', () => {
  const blueprints = noahBlueprints();
  const writing = blueprints.find((b) => b.id === 'gig:writing:coconala');
  assert.deepEqual(eveTemplateDemand(writing, ledger).map((d) => d.id), ['gig:column-writing:coconala']);
  assert.ok(EVE_GIG_SKILL_OFFERS.writing.includes('column-writing'));
  const ai = blueprints.find((b) => b.id === 'affiliate:ai-tools:blog');
  assert.deepEqual(eveTemplateDemand(ai, ledger).map((d) => d.id), ['affiliate:ai-tools:1001']);
  const ranked = eveRankTemplates({ ledger, agents: [], verified: {} });
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((r) => ledger.some((d) => d.id === r.demandId)));
  assert.ok(ranked.some((r) => r.blueprint === 'gig:writing:coconala'));
  assert.ok(ranked.every((r) => r.status !== 'blocked'), 'templates with demand are well-formed');
  assert.deepEqual(ranked.map((r) => r.profitYen), [...ranked].map((r) => r.profitYen).sort((a, b) => b - a));
  assert.deepEqual(eveRankTemplates({ ledger, agents: [], verified: {} }).map((r) => r.combination.id), ranked.map((r) => r.combination.id), 'deterministic');
});

void test('different Japanese materials cannot connect until a verified agent produces the required input', () => {
  const demand = [D('demand:summary', 'gig', '要約', 'store', 200, 1, 1)];
  const writer = A('noah:writer', 'content.article', ['記事'], '要約');
  const plan = have => eveDiscoverFromDemand({ have, arrows: [writer], demand });
  assert.deepEqual(plan(['画像']).gaps[0].missingMaterials, ['記事']);
  assert.equal(plan(['記事']).candidates[0].arrows[0].id, writer.id);
});
