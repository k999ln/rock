// task 130 段 2: 試運転と、最初に手で通す 1 本（金融以外の紹介 × 登録済みブログ）。
// 合格条件: 試運転で全工程の見本が出る。外へ出す工程の実行 0 件。合格は作った者ではなく Jev の判定（eveCheckAccept）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defineCombination, eveCombinationProblems, eveCombinationStatus, eveStepIsOutward } from '../lib/eve-combination.ts';
import { eveDryRun } from '../lib/eve-combination-paper.ts';
import { NOAH_BUILTIN_CAPABILITIES } from '../lib/noah-business.ts';

const FIRST = JSON.parse(readFileSync(new URL('../data/eve-combinations/affiliate-ai-tools-blog.json', import.meta.url), 'utf8'));
const HASH = 'abcdef0123456789';
const sample = { '公開情報・検索条件': { topic: '法人向け AI 研修' }, 'ASPアカウント': { 見本: 'A8.net の会員' }, '掲載媒体情報': { url: 'https://example.com/blog' } };

/** 合成のエージェント（外へは通信しない）。工程の合格条件に合う物を返す。 */
const outputs = {
  'research.market': { topic: '法人向け AI 研修', keywords: ['比較', '料金', '助成金', '導入事例', '口コミ', '期間'] },
  'research.offer': { offers: [{ name: 'A 研修', condition: '無料相談の申込', rewardYen: 8000 }, { name: 'B 研修', condition: '資料請求', rewardYen: 1500 }] },
  'content.article': `PR ${'本文'.repeat(800)}`,
  'content.image': { mime: 'image/png', bytes: 120_000 },
  'site.build': `<p>PR</p>${'<p>LP</p>'.repeat(120)}`,
  'compliance.check': { ok: true, issues: [] },
  'tracking.results': { approved: 0, approvedYen: 0, clicks: 0 },
};
/** 部品が無い工程に、合成のエージェントを当てた写しを作る（保存した 1 本は、まだ確かめたエージェントが 0 なので部品が無い）。 */
const withAgents = (c) => ({
  ...c,
  steps: c.steps.map((s) => (s.kind === 'auto' && !s.glue && !eveStepIsOutward(s) && s.capability && !NOAH_BUILTIN_CAPABILITIES.includes(s.capability)
    ? { ...s, agent: { ref: `synthetic:${s.capability}`, version: HASH, tool: 'run' } } : s)),
});
const caller = (overrides = {}) => {
  const calls = [];
  const call = async (ref, input) => {
    calls.push({ ref: ref.ref, input });
    const cap = ref.ref.replace('synthetic:', '');
    if (overrides[cap] instanceof Error) throw overrides[cap];
    return { output: cap in overrides ? overrides[cap] : outputs[cap], costYen: 0 };
  };
  return { call, calls };
};

void test('the first combination is hand-written, well-formed, and on paper until parts and demand are confirmed', () => {
  const c = defineCombination(FIRST);
  assert.equal(c.author.kind, 'person');
  assert.equal(c.finance, false, 'not finance (2026-11-24: 金融以外の紹介)');
  assert.equal(c.blueprint, 'affiliate:ai-tools:blog');
  const problems = eveCombinationProblems(c);
  assert.deepEqual(problems.filter((p) => p.level === 'block'), []);
  assert.equal(eveCombinationStatus(problems), 'paper');
  const at = (id) => c.steps.findIndex((s) => s.id === id);
  assert.ok(at('disclose') < at('lp-host'), 'the ad label is checked before the LP goes public');
  assert.ok(c.steps.find((s) => s.id === 'lp-host').after.includes('disclose'));
  assert.ok(c.steps.find((s) => s.id === 'article').after.includes('brief'), 'the glue sits between research/offers and the article');
});

void test('段 2: a dry run shows a sample for every step and never runs an outward step', async () => {
  const c = withAgents(defineCombination(FIRST));
  const { call, calls } = caller();
  const result = await eveDryRun(c, { sample, call });
  assert.equal(result.status, 'passed', JSON.stringify(result.steps.filter((s) => !['ok', 'held', 'preview'].includes(s.status)), null, 1));
  assert.equal(result.outwardExecuted, 0);
  for (const s of result.steps) assert.ok(s.output !== undefined, `${s.id}: a sample is shown`);
  const outward = new Set(c.steps.filter(eveStepIsOutward).map((s) => s.id));
  assert.ok(outward.has('publish:blog') && outward.has('lp-host') && outward.has('apply') && outward.has('signup:asp-a8'));
  for (const id of outward) assert.ok(['held', 'preview'].includes(result.steps.find((s) => s.id === id).status), id);
  assert.ok(calls.every((x) => !['publish.blog', 'site.host'].includes(x.ref.replace('synthetic:', ''))), 'the caller never receives an outward step');
  const brief = result.steps.find((s) => s.id === 'brief');
  assert.equal(brief.status, 'ok');
  assert.match(brief.output.指示, /法人向け AI 研修.*広告（PR）/u);
  const articleCall = calls.find((x) => x.ref === 'synthetic:content.article');
  assert.equal(articleCall.input['記事の指示'].指示, brief.output.指示, 'the article agent receives the glue output');
  assert.equal(result.costYen, 0);
});

void test('段 2: Jev judges each step; a failed step stops what waits on it, and nothing is retried', async () => {
  const c = withAgents(defineCombination(FIRST));
  const short = caller({ 'content.article': '短い記事' });
  const r1 = await eveDryRun(c, { sample, call: short.call });
  assert.equal(r1.status, 'failed');
  assert.equal(r1.steps.find((s) => s.id === 'article').status, 'failed');
  assert.equal(r1.steps.find((s) => s.id === 'image').status, 'skipped');
  assert.equal(r1.steps.find((s) => s.id === 'publish:blog').status, 'skipped');
  const broken = caller({ 'research.offer': new Error('相手のサーバーが止まっている') });
  const r2 = await eveDryRun(c, { sample, call: broken.call });
  assert.equal(r2.steps.find((s) => s.id === 'offers').status, 'failed');
  assert.equal(broken.calls.filter((x) => x.ref === 'synthetic:research.offer').length, 1, 'not retried');
});

void test('段 2: without parts the dry run says which part is missing; keepForSelf and the budget are respected', async () => {
  const bare = defineCombination(FIRST);
  const r = await eveDryRun(bare, { sample });
  assert.equal(r.status, 'failed');
  assert.equal(r.steps.find((s) => s.id === 'research').status, 'no-part');
  assert.match(r.steps.find((s) => s.id === 'research').reason, /research\.market/u);
  const mine = withAgents(defineCombination({ ...FIRST, keepForSelf: ['article'] }));
  const own = await eveDryRun(mine, { sample, call: caller().call });
  assert.equal(own.steps.find((s) => s.id === 'article').status, 'held');
  const pricey = withAgents(defineCombination({ ...FIRST, budget: { perRunYen: 100, trialYen: 3000 }, steps: FIRST.steps.map((s) => (s.id === 'image' ? { ...s, costYen: 100 } : s.id === 'article' ? { ...s, costYen: 50 } : s)) }));
  const over = await eveDryRun(pricey, { sample, call: caller().call });
  assert.equal(over.steps.find((s) => s.id === 'image').status, 'skipped');
  assert.match(over.steps.find((s) => s.id === 'image').reason, /上限/u);
});
