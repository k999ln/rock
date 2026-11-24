// task 130 段 1: 組み合わせファイル（eve-combination/1）の形と、検査の規則 1〜9。
// 合格条件: 470 通りの設計図すべてを骨組みに変換でき、止まる誤り（block）が 0。規則ごとに落ちる例がある。同じ入力で同じ結果。
import test from 'node:test';
import assert from 'node:assert/strict';
import { noahBlueprints } from '../lib/noah-business.ts';
import {
  EVE_COMBINATION_SCHEMA, defineCombination, eveCheckAccept, eveCombinationFromBlueprint,
  eveCombinationProblems, eveCombinationStatus, eveStepIsOutward,
} from '../lib/eve-combination.ts';
import { EVE_GLUE_SCHEMA, eveGlueProblem, eveGlueTestResults, eveGlueTestsPass, runEveGlue } from '../lib/eve-glue.ts';

const HASH = 'a1b2c3d4e5f60718';
/** 3 工程の小さな組み合わせ（調べる → 書く → 出す → 読む）。 */
const small = (patch = {}) => ({
  schema: EVE_COMBINATION_SCHEMA, id: 'test:small', version: 1, title: '小さな組み合わせ', blueprint: null, origin: 'discovered',
  demand: { id: 'demand:test', expectedPriceYen: 500 }, author: { kind: 'person', id: 'noellesugar99' }, finance: false, keepForSelf: [],
  budget: { perRunYen: 1_000, trialYen: 3_000 },
  steps: [
    { id: 'research', label: '調べる', kind: 'auto', capability: 'research.market', after: [], agent: { ref: 'noah:researcher', version: HASH, tool: 'search' }, flow: { inputs: ['題材'], outputs: ['調査結果'] } },
    { id: 'write', label: '書く', kind: 'auto', capability: 'content.article', after: ['research'], agent: { ref: 'noah:writer', version: HASH, tool: 'write' }, costYen: 100, flow: { inputs: ['調査結果'], outputs: ['記事'], dataFrom: [{ from: 'research', material: '調査結果' }] } },
    { id: 'publish', label: '出す', kind: 'tap', reason: '公開は本人が押す', after: ['write'], flow: { inputs: ['記事'], outputs: ['公開済みコンテンツ'], dataFrom: [{ from: 'write', material: '記事' }] } },
    { id: 'track', label: '売上を読む', kind: 'auto', capability: 'tracking.results', after: ['publish'], agent: { ref: 'noah:tracker', version: HASH, tool: 'read' }, flow: { inputs: ['公開済みコンテンツ'], outputs: ['入金確認'] } },
  ],
  exit: { step: 'track', material: '入金確認', source: '売り場の支払明細', counts: 'approved-or-paid' },
  ...patch,
});
const verified = { 'research.market': ['noah:researcher'], 'content.article': ['noah:writer'], 'tracking.results': ['noah:tracker'] };
const demand = [{ id: 'demand:test', sources: [{ url: 'https://example.com/listing', checkedAt: '2026-11-24T00:00:00Z' }] }];
const rules = (c, ctx = { verified, demand }) => eveCombinationProblems(c, ctx);
const has = (problems, rule, level) => problems.some((p) => p.rule === rule && p.level === level);

void test('段 1: all 470 blueprints become combinations with no blocking problem, deterministically', () => {
  const all = noahBlueprints();
  assert.equal(all.length, 470);
  let inserted = 0;
  for (const b of all) {
    const { combination, inserted: added } = eveCombinationFromBlueprint(b);
    inserted += added.length;
    defineCombination(combination);
    const problems = eveCombinationProblems(combination);
    assert.deepEqual(problems.filter((p) => p.level === 'block'), [], b.id);
    // 部品も需要もまだ無いので、本番ではなく試運転だけ。
    assert.equal(eveCombinationStatus(problems), 'paper', b.id);
    assert.equal(combination.exit.counts, 'approved-or-paid');
    assert.ok(combination.steps.some(eveStepIsOutward), `${b.id}: money needs something sent out`);
  }
  assert.ok(inserted > 0, 'sign-ups that lacked a terms check got one');
  const again = noahBlueprints().map((b) => eveCombinationProblems(eveCombinationFromBlueprint(b).combination));
  assert.deepEqual(again, noahBlueprints().map((b) => eveCombinationProblems(eveCombinationFromBlueprint(b).combination)), 'same input, same result');
});

void test('段 1: a fully verified, sourced combination is live; defineCombination freezes a copy', () => {
  const c = defineCombination(small());
  assert.deepEqual(rules(c), []);
  assert.equal(eveCombinationStatus(rules(c)), 'live');
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.steps[0]));
  assert.throws(() => defineCombination(small({ schema: 'other' })), /schema/);
  assert.throws(() => defineCombination(small({ exit: { step: 'track', material: '入金確認', source: '明細', counts: 'clicks' } })), /承認・入金だけ/);
  assert.throws(() => defineCombination(small({ origin: 'template', blueprint: null })), /元の設計図/);
  assert.throws(() => defineCombination(small({ author: { kind: 'person' } })), /author/);
});

void test('規則 1: steps must wait only for earlier steps, and hand over what they received', () => {
  const steps = small().steps.map((s) => (s.id === 'write' ? { ...s, after: ['publish'] } : s));
  assert.ok(has(rules(small({ steps })), 1, 'block'));
});

void test('規則 2: the road to the money exit must send something out', () => {
  const steps = small().steps.map((s) => (s.id === 'publish' ? { ...s, kind: 'auto', capability: 'content.image', reason: undefined, agent: { ref: 'noah:writer', version: HASH, tool: 'x' } } : s));
  assert.ok(has(rules(small({ steps })), 2, 'block'));
});

void test('規則 3: the exit reads an external record; demand without a source keeps it on paper', () => {
  assert.ok(has(rules(small({ exit: { step: 'nope', material: '入金確認', source: '明細', counts: 'approved-or-paid' } })), 3, 'block'));
  assert.ok(has(rules(small({ exit: { step: 'track', material: 'クリック数', source: '明細', counts: 'approved-or-paid' } })), 3, 'block'));
  assert.ok(has(rules(small({ demand: null })), 3, 'paper'));
  assert.ok(has(rules(small(), { verified, demand: [{ id: 'demand:test', sources: [] }] }), 3, 'paper'));
});

void test('規則 4: auto steps use only verified agents or tested glue', () => {
  assert.ok(has(rules(small(), { verified: {}, demand }), 4, 'paper'));
  const glue = { schema: EVE_GLUE_SCHEMA, ops: [{ op: 'pick', from: 'title', as: 'headline' }], tests: [{ input: { title: 'A' }, expected: { headline: 'A' } }] };
  const withGlue = (g) => small({ steps: [...small().steps.slice(0, 1), { id: 'glue', label: '形を直す', kind: 'auto', capability: 'glue.convert', after: ['research'], glue: g }, ...small().steps.slice(1).map((s) => (s.id === 'write' ? { ...s, after: ['research', 'glue'] } : s))] });
  assert.equal(rules(withGlue(glue)).filter((p) => p.rule === 4).length, 0, 'tested glue is fine');
  assert.ok(has(rules(withGlue({ ...glue, tests: [{ input: { title: 'A' }, expected: { headline: 'B' } }] })), 4, 'paper'));
  assert.ok(has(rules(withGlue({ ...glue, ops: [{ op: 'eval', as: 'x' }] })), 4, 'block'));
});

void test('規則 5: person steps say why; sign-ups follow a terms check', () => {
  const steps = small().steps.map((s) => (s.id === 'publish' ? { ...s, reason: '' } : s));
  assert.ok(has(rules(small({ steps })), 5, 'block'));
  const signup = { id: 'signup:note', label: 'note に登録する', kind: 'human', reason: 'パスワードは本人', account: 'note', after: [] };
  assert.ok(has(rules(small({ steps: [signup, ...small().steps] })), 5, 'block'));
  const withRules = [{ id: 'rules:note', label: '規約を確かめる', kind: 'auto', after: [] }, { ...signup, after: ['rules:note'] }, ...small().steps];
  assert.equal(rules(small({ steps: withRules })).filter((p) => p.rule === 5).length, 0);
});

void test('規則 6: finance needs a review by the owner', () => {
  assert.ok(has(rules(small({ finance: true })), 6, 'block'));
});

void test('規則 7: cost stays inside the budget', () => {
  assert.ok(has(rules(small({ budget: { perRunYen: 50, trialYen: 3_000 } })), 7, 'block'));
  assert.ok(has(rules(small({ budget: { perRunYen: 1_000, trialYen: 10 } })), 7, 'block'));
});

void test('規則 8: every agent is pinned to a version hash', () => {
  const steps = small().steps.map((s) => (s.id === 'write' ? { ...s, agent: { ...s.agent, version: 'latest' } } : s));
  assert.ok(has(rules(small({ steps })), 8, 'block'));
});

void test('規則 9: no keys, passwords, or card/account numbers in the file', () => {
  const leak = (args) => small({ steps: small().steps.map((s) => (s.id === 'research' ? { ...s, agent: { ...s.agent, args } } : s)) });
  assert.ok(has(rules(leak({ key: 'sk-abcdefghijklmnopqrstuvwx' })), 9, 'block'));
  assert.ok(has(rules(leak({ password: 'hunter2' })), 9, 'block'));
  assert.ok(has(rules(leak({ q: '4111 1111 1111 1111' })), 9, 'block'));
  assert.equal(rules(leak({ q: '{topic}', limit: '20' })).filter((p) => p.rule === 9).length, 0);
});

void test('accept rules (judged by Jev, never by the maker)', () => {
  assert.equal(eveCheckAccept({ type: 'json', required: ['keywords'], minItems: 2 }, { keywords: ['a', 'b'] }).ok, true);
  assert.equal(eveCheckAccept({ type: 'json', required: ['keywords'] }, { other: 1 }).ok, false);
  assert.equal(eveCheckAccept({ type: 'json', required: ['keywords'] }, []).ok, false);
  assert.equal(eveCheckAccept({ type: 'json', minItems: 3 }, { items: [1] }).ok, false);
  assert.deepEqual(eveCheckAccept({ type: 'text', minLength: 5, mustInclude: ['PR'] }, 'PR です。広告'), { ok: true, reason: '長さと語が合っています。' });
  assert.equal(eveCheckAccept({ type: 'text', mustInclude: ['PR'] }, '広告の表示なし').ok, false);
  assert.equal(eveCheckAccept({ type: 'file', mime: ['video/mp4'], maxBytes: 10 }, { mime: 'video/mp4', bytes: 11 }).ok, false);
  assert.equal(eveCheckAccept({ type: 'file', mime: ['video/mp4'] }, { mime: 'video/mp4', bytes: -1 }).ok, false);
  assert.equal(eveCheckAccept({ type: 'file', mime: ['video/mp4'] }, { mime: 'video/mp4', bytes: 11 }).ok, true);
});

void test('glue: a declarative transform that cannot reach the network, with fixed tests', () => {
  const spec = {
    schema: EVE_GLUE_SCHEMA,
    ops: [
      { op: 'take', from: 'keywords', n: 2, as: 'top' },
      { op: 'join', from: '$out.top', sep: '、', as: 'brief.keywords' },
      { op: 'template', as: 'brief.instruction', text: '「{{topic}}」の記事を、{{$out.brief.keywords}}を入れて書く' },
      { op: 'map', from: 'competitors', as: 'brief.avoid', fields: { title: 'name' } },
      { op: 'number', from: 'price', as: 'priceYen' },
      { op: 'count', from: 'competitors', as: 'competitorCount' },
    ],
    tests: [{ input: { topic: 'AI 研修', keywords: ['比較', '料金', '口コミ'], competitors: [{ name: 'A社' }], price: '3,000円' },
      expected: { top: ['比較', '料金'], brief: { keywords: '比較、料金', instruction: '「AI 研修」の記事を、比較、料金を入れて書く', avoid: [{ title: 'A社' }] }, priceYen: 3000, competitorCount: 1 } }],
  };
  assert.equal(eveGlueProblem(spec), null);
  assert.equal(eveGlueTestsPass(spec), true);
  assert.throws(() => runEveGlue(spec, { price: 'たくさん' }), /数になりません/);
  assert.match(eveGlueProblem({ ...spec, ops: [{ op: 'pick', from: '__proto__.x', as: 'y' }] }), /道が不正/);
  assert.match(eveGlueProblem({ ...spec, ops: [{ op: 'fetch', from: 'url', as: 'y' }] }), /知らない操作/);
  assert.match(eveGlueProblem({ ...spec, tests: [] }), /固定テスト/);
  assert.equal(eveGlueTestResults({ ...spec, tests: [{ input: {}, expected: { wrong: true } }] })[0].ok, false);
  const big = { schema: EVE_GLUE_SCHEMA, ops: [{ op: 'pick', from: 'x', as: 'y' }], tests: [{ input: {}, expected: { y: null } }] };
  assert.throws(() => runEveGlue(big, { x: 'あ'.repeat(30_000) }), /バイトを超えました/);
});

void test('an intermediate glue result respects the same size limit as the final result', () => {
  const spec = { schema: EVE_GLUE_SCHEMA, tests: [{ input: {}, expected: {} }], ops: [
    { op: 'pick', from: 'report', as: 'result' },
    { op: 'const', value: 'done', as: 'result' },
  ] };
  assert.throws(() => runEveGlue(spec, { report: 'a'.repeat(65_536) }), /バイト/);
  assert.deepEqual(runEveGlue(spec, { report: 'small report' }), { result: 'done' });
});
