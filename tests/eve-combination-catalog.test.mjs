// task 130 の画面と API が読む一覧。外へ通信しない。何も保存しない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eveAuthorShareExample } from '../lib/eve-author-share-example.ts';
import {
  EVE_DEMAND_LEDGER, eveCatalogEntry, eveCombinationCatalog, eveCombinationFile, eveCombinationGet, eveCombinationPost, eveTemplateShapeCount,
} from '../lib/eve-combination-catalog.ts';

const first = JSON.parse(readFileSync(new URL('../data/eve-combinations/affiliate-ai-tools-blog.json', import.meta.url), 'utf8'));

void test('referral illustration keeps conversion at approval and author share at deposit, outside the actual catalog score', () => {
  const example = eveAuthorShareExample(first);
  assert.deepEqual(example.atApproval, { conversionReached: true, approvedYen: 8_000, paidYen: null, costYen: 1_000, shareYen: null });
  assert.deepEqual(example.atDeposit, { conversionReached: true, approvedYen: 8_000, paidYen: 8_000, costYen: 1_000, shareYen: 1_400 });
  assert.equal(first.exit.material, '入金確認');
  assert.equal(eveAuthorShareExample({ ...first, id: 'another:combination' }), null);
});

void test('catalog: the first combination is listed with its status, owner steps and parts', () => {
  const items = eveCombinationCatalog();
  // 版 1（元の版。消さない）。
  const c = eveCatalogEntry(eveCombinationFile('affiliate:ai-tools:blog', 1));
  assert.ok(c);
  assert.equal(c.version, 1);
  assert.equal(c.status, 'paper', 'no demand and no parts attached → dry run only');
  assert.deepEqual(c.problems.filter((p) => p.level === 'block'), []);
  assert.equal(c.ownerMinutesPerRun, 9);
  assert.deepEqual(c.counts, { steps: 18, owner: 5, missing: 11, outward: 7 });
  assert.equal(c.steps.find((s) => s.id === 'brief').part, 'glue');
  assert.equal(c.steps.find((s) => s.id === 'decide').part, 'builtin');
  assert.equal(c.steps.find((s) => s.id === 'payout').part, 'owner');
  // 需要の台帳は、公開の出典が付いた物だけ（2026-11-25 に 2 件。90 日で外れる試験は tests/eve-run.test.mjs）。
  assert.ok(EVE_DEMAND_LEDGER.every((d) => d.sources.length > 0 && d.sources.every((x) => x.url.startsWith('https://'))));
  assert.deepEqual(eveTemplateShapeCount(), { blueprints: 470, shapes: 19 });
  assert.deepEqual(eveCombinationCatalog(), items, 'deterministic');
  // レントラックスと登録済みの媒体を使う組み合わせ（2026-11-24）。ASP と媒体を変えたので、元の組み合わせとは別の id にした。
  // A8.net の組み合わせ（2026-11-25。公開の条件がある案件を狙う）も、1 行で並ぶ。
  assert.deepEqual(items.map((x) => x.id).sort(), ['affiliate:ai-agent-cloud:blog:a8', 'affiliate:ai-tools:blog', 'affiliate:ai-tools:blog:rentracks'], 'one row per combination');
  const r = items.find((x) => x.id === 'affiliate:ai-tools:blog:rentracks');
  assert.equal(r.version, 2, 'version 2 points at the re-verified terms and keyword parts; version 1 is kept');
  assert.equal(eveCombinationFile('affiliate:ai-tools:blog:rentracks', 1).version, 1);
  assert.equal(r.status, 'paper', 'the Rentracks program terms are not public, so it has no sourced demand; offers / article / LP / hosting have no part attached');
  assert.deepEqual(r.problems.filter((p) => p.level === 'block'), []);
  assert.deepEqual(r.steps.filter((s) => s.part === 'agent').map((s) => [s.id, s.agent]), [
    ['rules:hosting', 'eve-part:terms-reader'], ['rules:asp-rentracks', 'eve-part:terms-reader'], ['research', 'eve-part:keyword-research'], ['disclose', 'eve-part:ad-check'], ['track', 'eve-part:results-csv'],
  ]);
  assert.equal(r.steps.find((s) => s.id === 'export:asp-rentracks').part, 'owner', 'logging in to the ASP and exporting the CSV is the owner’s step');
  assert.equal(r.ownerMinutesPerRun, 14);
  assert.deepEqual(r.counts, { steps: 19, owner: 6, missing: 6, outward: 8 });
  assert.equal(items.find((x) => x.id === 'affiliate:ai-tools:blog').version, 1, 'the original combination is unchanged — revenue records bound to it keep their version');
});

void test('API GET: list, one by id, and 404', () => {
  const list = eveCombinationGet(null);
  assert.equal(list.status, 200);
  assert.ok(list.body.combinations.length >= 1);
  const one = eveCombinationGet('affiliate:ai-tools:blog');
  assert.equal(one.status, 200);
  assert.equal(one.body.combination.version, 1);
  assert.deepEqual(one.body.versions, [1]);
  assert.equal(eveCombinationGet('affiliate:ai-tools:blog', '1').body.combination.version, 1, 'a version can be asked for');
  assert.equal(eveCombinationGet('affiliate:ai-tools:blog:rentracks').body.combination.title.includes('レントラックス'), true);
  assert.equal(eveCombinationGet('affiliate:ai-tools:blog', '9').status, 404);
  assert.equal(eveCombinationGet('affiliate:ai-tools:blog', 'x').status, 400);
  assert.equal(eveCombinationGet('nope').status, 404);
});

void test('API POST: check a hand-written combination; shape errors name the field', () => {
  const ok = eveCombinationPost({ action: 'check', combination: { ...first, id: 'mine:blog', author: { kind: 'person', id: 'maker1' } } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.entry.id, 'mine:blog');
  const bad = eveCombinationPost({ action: 'check', combination: { ...first, version: 0 } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.path, 'version');
  const brokenFlow = structuredClone(first);
  brokenFlow.steps.at(-1).flow = { inputs: [] };
  const broken = eveCombinationPost({ action: 'check', combination: brokenFlow });
  assert.equal(broken.status, 400);
  assert.match(broken.body.path, /\.flow$/u);
  assert.equal(eveCombinationPost({ action: 'check', combination: first, extra: 1 }).status, 400);
  assert.equal(eveCombinationPost({ action: 'send' }).status, 400);
  assert.equal(eveCombinationPost([]).status, 400);
});

void test('API POST: score from records — external records only; bad windows are refused', () => {
  const rec = (stage, count, source, reference, extra = {}) => ({ combinationId: 'affiliate:ai-tools:blog', version: 1, stage, count, source, reference, at: '2026-11-12T03:00:00Z', ...extra });
  const r = eveCombinationPost({
    action: 'score', id: 'affiliate:ai-tools:blog', version: 1, window: { from: '2026-11-10T00:00:00Z', to: '2026-11-24T00:00:00Z' },
    records: [rec('made', 3, 'work', 'work:1', { costYen: 300 }), rec('sent', 3, 'work', 'work:2'), rec('approved', 1, 'self', 'me', { amountYen: 5_000 })],
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.score.judge, null, 'self-supplied evidence cannot produce a Jev judgment');
  assert.equal(r.body.score.mode, 'preview');
  assert.equal(r.body.score.evidence, 'caller-supplied');
  assert.equal(r.body.score.approvedYen, 0, 'self-report is not approval');
  assert.equal(r.body.score.funnel.approved, null);
  assert.equal(r.body.score.rejected.length, 1);
  assert.equal(eveCombinationPost({ action: 'score', id: 'affiliate:ai-tools:blog', records: [], window: { from: 'x', to: 'y' } }).status, 400);
  assert.equal(eveCombinationPost({ action: 'score', id: 'nope', records: [], window: { from: '2026-11-10T00:00:00Z', to: '2026-11-24T00:00:00Z' } }).status, 404);
  assert.equal(eveCombinationPost({ action: 'score', id: 'affiliate:ai-tools:blog', version: 0, records: [], window: { from: '2026-11-10T00:00:00Z', to: '2026-11-24T00:00:00Z' } }).status, 400);
});
