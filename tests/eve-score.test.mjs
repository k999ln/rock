// task 130 段 5・6: 採点と作り直し、作者の受け取り。合格条件: 仕様の「Jevの合格条件」をすべて満たす。
// 1 外部の記録が無い入金を成績表に出さない。2 クリックや本人の申告を承認へ昇格させない。3 出典の無い需要を使わない。
// 4 試験に通っていない部品を使わない。5 元の版を書き換えない。6 版が変わった相手へ黙って送らない。
// 7 Eve が作った物を Eve が合格にしない。8 同じ入力で同じ結果。記録・相手は合成の物（外へは通信しない）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineCombination } from '../lib/eve-combination.ts';
import { eveDryRun } from '../lib/eve-combination-paper.ts';
import {
  EVE_AUTHOR_SHARE_BPS, eveAuthorShare, eveBlamedSteps, eveFunnelDrop, eveSaleRecordsFromScores, eveScore,
} from '../lib/eve-combination-score.ts';
import {
  eveAdoptRebuild, eveCombinationDiff, eveProposeRebuild, eveRebuildCandidates, eveRebuildImproves, eveRebuildTargets, eveVersionDrift, eveWithAgent,
} from '../lib/eve-combination-rebuild.ts';

const H = 'abcdef012345';
const ag = (ref, tool = 'run') => ({ ref, version: H, tool });
const C = defineCombination({
  schema: 'eve-combination/1', id: 'test:column', version: 1, title: '調べて書いて出す', blueprint: null, origin: 'discovered',
  demand: { id: 'affiliate:ai-tools:1001', expectedPriceYen: 8_000 }, author: { kind: 'person', id: 'maker1' }, finance: false, keepForSelf: [],
  budget: { perRunYen: 1_000, trialYen: 3_000 },
  steps: [
    { id: 'research', label: '需要を調べる', kind: 'auto', capability: 'research.market', after: [], agent: ag('noah:r'), accept: { type: 'json', required: ['topic', 'keywords'] }, flow: { inputs: ['テーマ'], outputs: ['調査'] } },
    { id: 'article', label: '記事を書く', kind: 'auto', capability: 'content.article', after: ['research'], agent: ag('noah:w-old'), fallback: [ag('noah:w-unv'), ag('noah:w-fb')], accept: { type: 'text', minLength: 200, mustInclude: ['PR'] }, costYen: 100, flow: { inputs: ['調査'], outputs: ['記事'], dataFrom: [{ from: 'research', material: '調査' }] } },
    { id: 'publish', label: 'ブログに出す', kind: 'tap', capability: 'publish.blog', reason: '本人が中身を確かめて押します。', after: ['article'], flow: { inputs: ['記事'], outputs: ['公開した記事'], dataFrom: [{ from: 'article', material: '記事' }] } },
    { id: 'track', label: '成果を読む', kind: 'auto', capability: 'tracking.results', after: ['publish'], agent: ag('noah:t'), flow: { inputs: ['公開した記事'], outputs: ['成果'], dataFrom: [{ from: 'publish', material: '公開した記事' }] } },
    { id: 'payout', label: '入金を確かめる', kind: 'human', reason: '口座は本人だけが見られます。', after: ['track'], flow: { inputs: ['成果'], outputs: ['入金確認'], dataFrom: [{ from: 'track', material: '成果' }] } },
  ],
  exit: { step: 'payout', material: '入金確認', source: 'ASP の支払明細と銀行の入金', counts: 'approved-or-paid' },
});

const AT = (d) => `2026-11-${String(d).padStart(2, '0')}T03:00:00Z`;
const R = (stage, count, source, reference, extra = {}) => ({ combinationId: C.id, version: 1, stage, count, source, reference, at: AT(12), ...extra });
const records = [
  R('made', 10, 'work', 'work:r1', { costYen: 1_000 }),
  R('sent', 10, 'work', 'work:r2'),
  R('seen', 400, 'platform', 'ga:week1'),
  R('clicked', 2, 'platform', 'ga:clicks1'),
  R('clicked', 2, 'platform', 'ga:clicks1'), // 同じ参照番号 → 1 回だけ
  R('applied', 1, 'asp', 'a8:occ:1'),
  R('approved', 1, 'asp', 'a8:ok:1', { amountYen: 8_000 }),
  R('paid', 1, 'bank', 'bank:2026-11-20:1', { amountYen: 8_000 }),
  // 数えない物
  R('approved', 3, 'self', 'me:said', { amountYen: 24_000 }), // 本人の申告
  R('approved', 5, 'platform', 'x:likes', { amountYen: undefined }), // 金額の無い「承認」
  R('paid', 1, 'bank', '', { amountYen: 50_000 }), // 参照番号の無い入金
  R('approved', 9, 'work', 'work:guess', { amountYen: 72_000 }), // Work の見積りを承認へ昇格しない
  { ...R('paid', 1, 'bank', 'bank:other'), combinationId: 'other', amountYen: 9_999 }, // 別の組み合わせ
  { ...R('paid', 1, 'bank', 'bank:late', { amountYen: 9_999 }), at: AT(28) }, // 期間の外
];
const WINDOW = { from: AT(10).replace('03:00', '00:00'), to: AT(24).replace('03:00', '00:00') };

void test('段 5: the scorecard counts external records only — no self-report, no click or estimate promoted to approval, no unreferenced payment', () => {
  const s = eveScore(C, records, WINDOW);
  assert.deepEqual(s.funnel, { made: 10, sent: 10, seen: 400, clicked: 2, applied: 1, approved: 1, paid: 1 });
  assert.equal(s.approvedYen, 8_000);
  assert.equal(s.paidYen, 8_000);
  assert.equal(s.costYen, 1_000);
  assert.equal(s.profitYen, 7_000);
  assert.equal(s.days, 14);
  assert.equal(s.dailyProfitYen, 500);
  assert.equal(s.yieldPerYen, 8);
  assert.equal(s.decision, 'scale', '承認額が費用の 2 倍以上');
  assert.equal(s.judge, 'jev');
  const why = Object.fromEntries(s.rejected.map((r) => [r.reference, r.reason]));
  assert.match(why['me:said'], /本人の申告/u);
  assert.match(why['x:likes'], /金額/u);
  assert.match(why[''], /参照番号/u);
  assert.match(why['work:guess'], /数えません/u);
  assert.match(why['ga:clicks1'], /1 回だけ/u);
  assert.equal(s.rejected.length, 5, 'the other combination and the late record are not even listed');
  assert.deepEqual(eveScore(C, [...records].reverse(), WINDOW), s, 'same input → same scorecard, whatever the order');
});

void test('段 5: the biggest drop and the steps to blame — raw, with peers, and skipping stages nobody measured', () => {
  const s = eveScore(C, records, WINDOW);
  assert.deepEqual({ from: s.drop.from, stage: s.drop.stage, basis: s.drop.basis }, { from: 'seen', stage: 'clicked', basis: 'raw' });
  assert.deepEqual(s.blame, [{ step: 'article', capability: 'content.article' }]);
  const peer = { made: 10, sent: 10, seen: 400, clicked: 2, applied: 2, approved: 1, paid: 1 };
  const withPeers = eveFunnelDrop(s.funnel, [peer]);
  assert.deepEqual({ stage: withPeers.stage, basis: withPeers.basis }, { stage: 'applied', basis: 'peers' }, 'clicks are normal for this kind; the landing side is weak');
  assert.deepEqual(eveBlamedSteps(C, 'applied'), [], 'this combination has no landing step Eve can swap');
  const unmeasured = eveFunnelDrop({ made: 10, sent: 10, seen: null, clicked: 0, applied: null, approved: null, paid: null });
  assert.deepEqual({ from: unmeasured.from, stage: unmeasured.stage }, { from: 'sent', stage: 'clicked' });
  assert.equal(eveFunnelDrop({ made: null, sent: null, seen: null, clicked: null, applied: null, approved: null, paid: null }), null);
});

void test('段 5: results go back into the sale rate — sent is offered, approved is sold; unmeasured is not zero', () => {
  const s = eveScore(C, records, WINDOW);
  assert.deepEqual(eveSaleRecordsFromScores([s]), { 'affiliate:ai-tools:1001': { offered: 10, sold: 1 } });
  const noApproval = eveScore(C, records.filter((r) => r.stage !== 'approved'), WINDOW);
  assert.deepEqual(eveSaleRecordsFromScores([noApproval]), {}, 'approval not measured → nothing fed back');
});

void test('段 6: the author is paid only from external payment records; Eve-made goes to the operator; the rate is 20%', () => {
  const s = eveScore(C, records, WINDOW);
  assert.equal(EVE_AUTHOR_SHARE_BPS, 2_000, 'the owner decided 20% on 2026-11-24 (I2)');
  const byDefault = eveAuthorShare(s, 'user2');
  assert.deepEqual([byDefault.status, byDefault.baseYen, byDefault.shareYen], ['due', 7_000, 1_400], '20% of (paid 8,000 − cost 1,000)');
  const pending = eveAuthorShare(s, 'user2', null);
  assert.deepEqual([pending.status, pending.baseYen, pending.shareYen, pending.payee], ['pending-rate', 7_000, null, { kind: 'person', id: 'maker1' }]);
  const due = eveAuthorShare(s, 'user2', 1_000);
  assert.deepEqual([due.status, due.shareYen], ['due', 700], '10% of (paid 8,000 − cost 1,000)');
  assert.equal(eveAuthorShare(s, 'maker1', 1_000).status, 'none', 'using your own combination pays no one');
  const unpaid = eveScore(C, records.filter((r) => r.stage !== 'paid'), WINDOW);
  assert.equal(unpaid.approvedYen, 8_000);
  assert.deepEqual([eveAuthorShare(unpaid, 'user2', 1_000).status, eveAuthorShare(unpaid, 'user2', 1_000).shareYen], ['none', null], 'approved but not paid → nothing yet');
  const loss = eveScore(C, records.map((r) => (r.reference === 'bank:2026-11-20:1' ? { ...r, amountYen: 500 } : r)), WINDOW);
  assert.equal(eveAuthorShare(loss, 'user2', 1_000).status, 'none', 'paid below cost → nothing');
  const eveMade = eveScore(defineCombination({ ...C, author: { kind: 'eve' } }), records, WINDOW);
  assert.deepEqual(eveAuthorShare(eveMade, 'user2', 1_000).payee, { kind: 'operator' });
  assert.throws(() => eveAuthorShare(s, 'user2', 12_000));
});

void test('成果承認から後日の入金までを同じ案件の累積で比較し、費用の欠けた期間を確定に使わない', () => {
  const cost = R('made', 1, 'work', 'work:case-1', { costYen: 1_000 });
  const approval = R('approved', 1, 'asp', 'asp:case-1', { amountYen: 8_000, at: AT(15) });
  const payment = R('paid', 1, 'bank', 'bank:case-1', { amountYen: 8_000, at: AT(21) });
  const history = [cost, approval, payment, payment];
  const accepted = eveScore(C, history, { from: AT(10), to: AT(15) });
  assert.deepEqual([accepted.funnel.approved, accepted.funnel.paid, eveAuthorShare(accepted, 'reader').shareYen], [1, null, null]);
  const settled = eveScore(C, history, WINDOW);
  assert.deepEqual([settled.funnel.approved, settled.funnel.paid, eveAuthorShare(settled, 'reader').shareYen], [1, 1, 1_400]);
  const slice = eveScore(C, [...history, { ...cost, reference: 'work:later', at: AT(21), costYen: 50 }], { from: AT(20), to: AT(22) });
  assert.equal(slice.costYen, 50);
  assert.equal(eveAuthorShare(slice, 'reader').status, 'pending-cost');
  const lateCost = { ...cost, reference: 'work:after-payment', costYen: 500, at: AT(23) };
  const completeHistory = [...history, lateCost];
  const atPayment = eveScore(C, completeHistory, { from: AT(10), to: AT(21) });
  const pending = eveAuthorShare(atPayment, 'reader');
  assert.deepEqual([atPayment.costYen, pending.status, pending.shareYen], [1_000, 'pending-cost', null]);
  const final = eveAuthorShare(eveScore(C, completeHistory, WINDOW), 'reader');
  assert.deepEqual([final.status, final.baseYen, final.shareYen], ['due', 6_500, 1_300]);
  for (const fees of [[], [{ ...cost, costYen: undefined }], [cost, { ...cost, reference: 'work:other', costYen: undefined }],
    [cost, { ...cost, costYen: 900 }], [cost, { ...cost, reference: 'work:invalid', costYen: -1 }]]) {
    const share = eveAuthorShare(eveScore(C, [payment, ...fees], WINDOW), 'reader');
    assert.deepEqual([share.status, share.baseYen, share.shareYen], ['pending-cost', null, null]);
  }
  const free = eveScore(C, [payment, { ...cost, costYen: 0 }], WINDOW);
  assert.equal(eveAuthorShare(free, 'reader').shareYen, 1_600);
  const { costComplete, ...legacy } = free;
  assert.equal(costComplete, true);
  assert.equal(eveAuthorShare(legacy, 'reader').shareYen, null);
});

void test('0件で正額の記録と矛盾した明細を見分け、円単位の20%を整数で切り捨てる', () => {
  const cost = R('made', 1, 'work', 'work:cost', { costYen: 0 });
  const paid = R('paid', 0, 'bank', 'bank:zero', { amountYen: 8_000 });
  const none = eveScore(C, [cost, paid, R('approved', 0, 'asp', 'asp:zero', { amountYen: 8_000 })], WINDOW);
  assert.deepEqual([none.rejected.length, none.funnel.approved, none.funnel.paid, eveAuthorShare(none, 'reader').shareYen], [2, null, null, null]);
  // Multiplying this amount by 2,000 as a Number rounds the share up by one yen.
  const amountYen = Number.MAX_SAFE_INTEGER - 22;
  const one = { ...paid, count: 1, amountYen };
  assert.equal(eveAuthorShare(eveScore(C, [cost, one], WINDOW), 'reader').shareYen, Number(BigInt(amountYen) / BigInt(5)));
  assert.throws(() => eveScore(C, [one, { ...one, amountYen: 1 }], WINDOW), /conflicting_receipt/);
  assert.throws(() => eveScore(C, [one, { ...one, reference: 'bank:other' }], WINDOW), /amount_out_of_range/);
});

// 作り直し。相手は合成の物。
const agents = [
  { ref: 'noah:r', version: H, tool: 'run', capability: 'research.market', runs: 20, accepted: 19 },
  { ref: 'noah:w-old', version: H, tool: 'run', capability: 'content.article', runs: 10, accepted: 3 },
  { ref: 'noah:w-fb', version: H, tool: 'run', capability: 'content.article', runs: 10, accepted: 9, costYen: 150 },
  { ref: 'noah:w-v', version: H, tool: 'run', capability: 'content.article', runs: 0, accepted: 0 },
  { ref: 'noah:w-unv', version: H, tool: 'run', capability: 'content.article', runs: 50, accepted: 50 },
  { ref: 'noah:t', version: H, tool: 'run', capability: 'tracking.results', runs: 20, accepted: 20 },
];
const verified = { 'research.market': ['noah:r'], 'content.article': ['noah:w-fb', 'noah:w-old', 'noah:w-v'], 'tracking.results': ['noah:t'] };
const demand = { id: 'affiliate:ai-tools:1001', origin: 'affiliate', outcome: 'conversion:ai-tools:consultation', label: 'AI 研修', payer: 'p', place: 'ASP', priceYen: 8_000, volumePerWeek: 5, competitors: 1, finance: false, sources: [{ url: 'https://example.com/asp/1001', checkedAt: AT(20) }], checkedAt: AT(20) };
const caller = (calls) => async (ref) => {
  calls.push(ref.ref);
  if (ref.ref === 'noah:r') return { output: { topic: 'AI 研修', keywords: ['比較', '料金'] }, costYen: 0 };
  if (ref.ref === 'noah:w-fb') return { output: `PR ${'法人向け AI 研修を比べました。'.repeat(20)}`, costYen: 150 };
  if (ref.ref === 'noah:w-v') return { output: '短い記事', costYen: 50 };
  if (ref.ref === 'noah:t') return { output: { clicks: 0, approved: 0, approvedYen: 0 }, costYen: 0 };
  throw new Error(`unexpected ${ref.ref}`);
};
const base = (calls, extra = {}) => ({ score: eveScore(C, records, WINDOW), agents, verified, demand, sample: { テーマ: 'AI 研修' }, call: caller(calls), now: () => 0, ...extra });

void test('段 5: rebuild only the blamed step; fallback (verified only) → verified → Eve builds; propose only when 20% better', async () => {
  const s = eveScore(C, records, WINDOW);
  assert.deepEqual(eveRebuildTargets(C, s), [{ step: 'article', capability: 'content.article', why: 'funnel' }]);
  const cands = eveRebuildCandidates(C, eveRebuildTargets(C, s)[0], agents, verified);
  assert.deepEqual(cands.map((c) => [c.source, c.to?.ref ?? null]), [['fallback', 'noah:w-fb'], ['verified', 'noah:w-v'], ['eve-build', null]], 'the unverified fallback is dropped, however good its record');
  const calls = [];
  const r = await eveProposeRebuild(C, base(calls));
  assert.ok(!calls.includes('noah:w-unv') && !calls.includes('noah:w-old'));
  assert.equal(r.proposals.length, 1);
  const p = r.proposals[0];
  assert.deepEqual([p.step, p.source, p.from.ref, p.to.ref, p.fromVersion, p.toVersion], ['article', 'fallback', 'noah:w-old', 'noah:w-fb', 1, 2]);
  assert.ok(eveRebuildImproves(p.beforeYen, p.afterYen) && p.afterYen > p.beforeYen);
  assert.deepEqual(p.diff.map((d) => [d.step, d.field]), [['article', 'agent'], ['article', 'fallback'], ['article', 'costYen']]);
  assert.deepEqual(p.combination.steps.find((x) => x.id === 'article').fallback.map((f) => f.ref), ['noah:w-old', 'noah:w-unv'], 'the old part is kept first, to go back');
  assert.deepEqual(r.tried.map((t) => t.ref), ['noah:w-v']);
  assert.match(r.tried[0].reason, /通りませんでした/u);
  assert.deepEqual(r.builds, []);
  assert.equal(C.version, 1);
  assert.equal(C.steps.find((x) => x.id === 'article').agent.ref, 'noah:w-old', 'the original version is never rewritten');
  const again = await eveProposeRebuild(C, base([]));
  assert.deepEqual(again, r, 'same input → same proposals');
});

void test('段 5: frozen steps are kept, no demand means no proposal, and the trial budget stops the tries', async () => {
  const kept = await eveProposeRebuild(C, base([], { history: { article: [true, true, true, true, true] } }));
  assert.deepEqual([kept.proposals.length, kept.kept.map((k) => k.step)], [0, ['article']]);
  const noDemand = await eveProposeRebuild(C, base([], { demand: null }));
  assert.equal(noDemand.proposals.length, 0);
  assert.match(noDemand.notes[0], /需要/u);
  const tight = defineCombination({ ...C, budget: { perRunYen: 1_000, trialYen: 200 } });
  const calls = [];
  const capped = await eveProposeRebuild(tight, base(calls, { score: eveScore(tight, records.map((x) => ({ ...x })), WINDOW) }));
  assert.ok(capped.tried.some((t) => /予算/u.test(t.reason)));
  assert.ok(capped.spentYen <= 200);
  const notReplaceable = await eveProposeRebuild(C, base([], { score: { ...eveScore(C, records, WINDOW), drop: { from: 'clicked', stage: 'applied', rate: 0.5, basis: 'peers' }, blame: [] } }));
  assert.equal(notReplaceable.proposals.length, 0);
  assert.match(notReplaceable.notes[0], /差し替えられる工程がありません/u);
});

void test('段 5: dry-run failures are targets too; when nothing verified helps, Eve builds the part', async () => {
  const dry = await eveDryRun(eveWithAgent(C, 'article', ag('noah:w-v')), { sample: { テーマ: 'AI 研修' }, call: caller([]), now: () => 0 });
  assert.equal(dry.steps.find((x) => x.id === 'article').status, 'failed');
  const onlyBad = { ...verified, 'content.article': ['noah:w-v'] };
  const c2 = eveWithAgent(C, 'article', ag('noah:w-v'));
  const r = await eveProposeRebuild(c2, { ...base([]), score: null, dryRun: dry, verified: onlyBad });
  assert.deepEqual(eveRebuildTargets(c2, null, dry).map((t) => [t.step, t.why]), [['article', 'dry-run']]);
  assert.equal(r.proposals.length, 0);
  assert.deepEqual(r.builds.map((b) => b.step), ['article']);
});

void test('段 5: only the owner adopts; Eve cannot pass its own rebuild; a changed version is never called silently', async () => {
  const r = await eveProposeRebuild(C, base([]));
  assert.throws(() => eveAdoptRebuild(r.proposals[0], { kind: 'eve' }, AT(24)), /owner_only/u);
  const adopted = eveAdoptRebuild(r.proposals[0], { kind: 'person', id: 'noellesugar99' }, AT(24));
  assert.deepEqual([adopted.combination.version, adopted.adoptedBy, adopted.fromVersion], [2, 'noellesugar99', 1]);
  assert.deepEqual(eveCombinationDiff(C, C), []);
  const live = { 'noah:w-old': 'fedcba987654' };
  assert.deepEqual(eveVersionDrift(C, live), [{ step: 'article', ref: 'noah:w-old', pinned: H, live: 'fedcba987654' }]);
  const calls = [];
  const run = await eveDryRun(C, { sample: { テーマ: 'AI 研修' }, call: async (ref, input) => { calls.push(ref.ref); return caller([])(ref, input); }, now: () => 0, versions: live });
  assert.equal(run.steps.find((x) => x.id === 'article').status, 'no-part');
  assert.match(run.steps.find((x) => x.id === 'article').reason, /版が/u);
  assert.ok(!calls.includes('noah:w-old'), 'not sent to a part whose version changed');
  assert.equal(run.status, 'failed');
});
