import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { settleCompanyOrder } from '../lib/sky-company-order.ts';
import {
  COCONALA_DESK_POLICY,
  GigDeskError,
  assignJudgmentTasks,
  draftProposal,
  parseCoconalaPosting,
  planJudgmentTasks,
  proposalWinRate,
  readPostingConstraints,
  resolveJudgments,
  selectProposals,
  triageGig,
} from '../lib/sky-gig-desk.ts';

const desk = JSON.parse(readFileSync(new URL('../examples/sky/gig-desk/desk.json', import.meta.url), 'utf8'));
const policy = COCONALA_DESK_POLICY;
const posting = (id) => parseCoconalaPosting(desk.postings.find((item) => item.id === id));
const triage = (id, extra = {}) => triageGig({
  posting: posting(id), offers: desk.offers, capabilities: desk.capabilities, policy, today: desk.today, ...extra,
});

void test('a pasted Coconala request is read without guessing missing fields', () => {
  const read = posting('req_sample_001');
  assert.equal(read.title, '「Googleカレンダーの予定を集計・グラフ作成」の自動化をお願いします。');
  assert.deepEqual([read.budgetMinYen, read.budgetMaxYen], [10_000, 30_000]);
  assert.deepEqual([read.closesOn, read.deliveryOn, read.applicants], ['2026-11-26', '2026-12-05', 3]);
  assert.equal(read.category, '業務自動化・効率化支援');
  assert.equal(read.clientRequiresNda, false);
  assert.deepEqual([posting('req_sample_002').budgetMinYen, posting('req_sample_002').budgetMaxYen], [null, 2_000]);
  const bare = parseCoconalaPosting({ id: 'req_bare', text: 'ロゴの相談\n募集内容\n見積りをお願いします。' });
  assert.deepEqual([bare.budgetMaxYen, bare.closesOn, bare.deliveryOn, bare.applicants], [null, null, null, null]);
  assert.equal(bare.body, '見積りをお願いします。');
  assert.equal(parseCoconalaPosting({ id: 'req_url', text: desk.postings[0].text, url: 'https://coconala.com/requests/4083470' }).url, 'https://coconala.com/requests/4083470');
  assert.throws(() => parseCoconalaPosting({ id: 'req_url', text: desk.postings[0].text, url: 'https://example.com/requests/1' }), GigDeskError);
});

void test('AI bans and personal data are read from the text; silence stays unconfirmed', () => {
  assert.equal(readPostingConstraints(posting('req_sample_003')).aiUse, 'not_allowed');
  assert.equal(readPostingConstraints(posting('req_sample_001')).aiUse, 'unconfirmed');
  assert.equal(readPostingConstraints({ ...posting('req_sample_001'), body: 'ChatGPTを使っていただいて構いません' }).aiUse, 'allowed');
  assert.equal(readPostingConstraints({ ...posting('req_sample_001'), body: 'AIで作成したものは不可です' }).aiUse, 'not_allowed');
  assert.equal(readPostingConstraints(posting('req_sample_004')).containsPersonalOrSecretData, true);
  assert.equal(readPostingConstraints(posting('req_sample_001')).containsPersonalOrSecretData, false);
});

void test('a request is proposed only when it fits an offer, the budget, the date and the AI terms', () => {
  const ok = triage('req_sample_001');
  assert.deepEqual([ok.decision, ok.offerId, ok.priceYen, ok.deliverOn], ['propose', 'sheet-automation', 20_000, '2026-11-23']);
  // 20,000 − 手数料4,400 − 予備2,000 − 実費2,560 − 確認の作業料360
  assert.equal(ok.marginYen, 10_680);
  assert.equal(ok.outsideReview, true);
  assert.match(triage('req_sample_002').reasons[0], /予算の上限2000円/u);
  assert.equal(triage('req_sample_003').reasons[0], 'AIでの制作を認めない募集');
  assert.equal(triage('req_sample_001', { today: '2026-11-27' }).reasons[0], '締切を過ぎている');
  assert.match(triage('req_sample_001', { today: '2026-11-25', offers: desk.offers.map((o) => ({ ...o, deliveryDays: 30 })) }).reasons[0], /間に合わない/u);
  assert.match(triage('req_sample_001', { posting: { ...posting('req_sample_001'), applicants: 40 } }).reasons[0], /応募が40人/u);
  assert.equal(triage('req_sample_001', { offers: [desk.offers[1]] }).reasons[0], '会社が売れる仕事の型に当たらない');
  assert.match(triage('req_sample_001', { capabilities: desk.capabilities.slice(0, 1) }).reasons[0], /作る工程がまだ無い/u);
});

void test('requests with personal data are built inside the company and never routed to outside reviewers', () => {
  const secret = triage('req_sample_004');
  assert.equal(secret.decision, 'propose');
  assert.equal(secret.outsideReview, false);
  assert.ok(secret.recipe.steps.every((step) => step.kind !== 'reviewer'));
  assert.equal(secret.placement.placement, 'company_only');
  const draft = draftProposal(posting('req_sample_004'), secret, desk.offers[0], desk.company);
  assert.match(draft.text, /社外の人・端末には出しません/u);
  const noInsideReviewer = desk.capabilities.filter((item) => item.id !== 'company-review');
  assert.equal(triage('req_sample_004', { capabilities: noInsideReviewer }).decision, 'skip');
});

void test('the draft states price, date, AI use and human review, and is never sent by Sky', () => {
  const decided = triage('req_sample_001');
  const draft = draftProposal(posting('req_sample_001'), decided, desk.offers[0], desk.company);
  for (const part of ['20,000円', '2026-11-23', '制作にはAIを使い', '担当者が内容を確認', '承諾をいただいた分だけ'])
    assert.ok(draft.text.includes(part), part);
  assert.equal(draft.submission, 'owner_only');
  assert.throws(() => draftProposal(posting('req_sample_003'), triage('req_sample_003'), desk.offers[1], desk.company), GigDeskError);
});

void test('proposals are capped per day, never repeated, and dropped when the odds do not pay', () => {
  const all = desk.postings.map((item) => triage(item.id));
  const first = selectProposals(all, policy, { proposedToday: 0, alreadyProposedIds: [] });
  assert.deepEqual(first.send.map((item) => item.postingId), ['req_sample_001', 'req_sample_004']);
  assert.deepEqual(selectProposals(all, policy, { proposedToday: 4, alreadyProposedIds: [] }).send.map((item) => item.postingId), ['req_sample_001']);
  assert.deepEqual(selectProposals(all, policy, { proposedToday: 5, alreadyProposedIds: [] }).send, []);
  assert.deepEqual(selectProposals(all, policy, { proposedToday: 0, alreadyProposedIds: ['req_sample_001'] }).send.map((item) => item.postingId), ['req_sample_004']);
  assert.deepEqual(selectProposals([...all, ...all], policy, { proposedToday: 0, alreadyProposedIds: [] }).send.length, 2);
  // 19件送って採用0なら、同じ型の提案は得にならないので止まる。
  assert.equal(proposalWinRate(undefined), 0.1);
  const cold = triage('req_sample_004', { proposals: [{ offerId: 'sheet-automation', sent: 190, won: 0 }] });
  assert.ok(cold.score <= 0);
  assert.deepEqual(selectProposals([cold], policy, { proposedToday: 0, alreadyProposedIds: [] }).send, []);
});

const items = ['a', 'b', 'c', 'd'].map((key) => ({ itemId: `item_${key}`, question: 'どちらが読みやすいですか', options: ['A', 'B'] }));
const members = ['m_aya', 'm_ben', 'm_cho', 'm_dai'].map((ref) => ({ ref, capacity: 3, insideCompany: ref === 'm_aya' }));
const grid = { placement: 'grid_allowed', reasons: [], humanReviewRequired: true };
const inside = { placement: 'company_only', reasons: [], humanReviewRequired: true };

void test('review questions are spread evenly, never twice to one person, and stay inside when required', () => {
  const tasks = planJudgmentTasks({ orderId: 'order_001', items, policy });
  const spread = assignJudgmentTasks(tasks, members, grid);
  assert.equal(spread.assignments.length, 12);
  assert.deepEqual(spread.load.map((item) => item.count), [3, 3, 3, 3]);
  assert.deepEqual(spread.short, []);
  for (const task of tasks)
    assert.equal(new Set(spread.assignments.filter((item) => item.taskId === task.taskId).map((item) => item.memberRef)).size, 3);
  const kept = assignJudgmentTasks(tasks, members, inside);
  assert.ok(kept.assignments.every((item) => item.memberRef === 'm_aya'));
  assert.deepEqual(kept.short.map((item) => item.missing), [2, 2, 2, 3]);
  assert.throws(() => assignJudgmentTasks(tasks, members, { placement: 'blocked', reasons: [], humanReviewRequired: true }), GigDeskError);
  assert.throws(() => planJudgmentTasks({ orderId: 'order_001', items: [items[0], items[0]], policy }), GigDeskError);
});

void test('majority answers are paid once each and feed the company settlement', () => {
  const tasks = planJudgmentTasks({ orderId: 'order_001', items: items.slice(0, 3), policy });
  const { assignments } = assignJudgmentTasks(tasks, members.slice(0, 3), grid);
  const answer = (item, memberRef, option) => ({ taskId: `order_001:item_${item}`, memberRef, option });
  const resolved = resolveJudgments(tasks, assignments, [
    answer('a', 'm_aya', 'A'), answer('a', 'm_ben', 'A'), answer('a', 'm_cho', 'B'),
    answer('a', 'm_aya', 'A'), // 二度目は数えない
    answer('a', 'm_dai', 'A'), // 割り当てていない人
    answer('b', 'm_aya', 'A'), answer('b', 'm_ben', 'B'), // まだ1人足りない
    answer('c', 'm_aya', 'C'), // 選択肢に無い
  ]);
  assert.deepEqual(resolved.results.map((item) => [item.itemId, item.state, item.option]), [
    ['item_a', 'decided', 'A'], ['item_b', 'waiting', null], ['item_c', 'waiting', null],
  ]);
  assert.deepEqual(resolved.contributions.map((item) => item.participantRef), ['m_aya', 'm_ben']);
  const settled = settleCompanyOrder({
    orderId: 'order_001', cashReceivedMinor: 20_000, refundsMinor: 0, platformFeeMinor: 4_400, directCostsMinor: 2_560,
    reserveBps: 1_000, dividendBps: 5_000, contributions: resolved.contributions, dividendParticipants: ['m_aya', 'm_ben', 'm_cho'],
  });
  assert.equal(settled.feesMinor, 60);
  assert.equal(settled.lines.reduce((sum, line) => sum + line.totalMinor, 0) + 4_400 + 2_560 + settled.reserveMinor + settled.companyMinor, 20_000);
});

void test('a split vote goes to the company and pays everyone who answered', () => {
  const four = { ...policy, judgmentQuorum: 1 };
  const [task] = planJudgmentTasks({ orderId: 'order_002', items: [{ itemId: 'item_x', question: 'どれが良いですか', options: ['A', 'B'] }], policy: four });
  const two = { ...task, quorum: 2 };
  const { assignments } = assignJudgmentTasks([two], members, grid);
  const resolved = resolveJudgments([two], assignments, assignments.map((item, index) => ({ taskId: item.taskId, memberRef: item.memberRef, option: index ? 'B' : 'A' })));
  assert.deepEqual(resolved.needsCompanyReview, ['item_x']);
  assert.equal(resolved.contributions.length, 2);
});

void test('the desk command runs on the example file and sends nothing', () => {
  const out = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/sky-gig-desk.mjs', 'examples/sky/gig-desk/desk.json', '--json'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }));
  assert.equal(out.send.length, 2);
  assert.ok(out.drafts.every((draft) => draft.submission === 'owner_only'));
  const source = readFileSync(new URL('../lib/sky-gig-desk.ts', import.meta.url), 'utf8') + readFileSync(new URL('../scripts/sky-gig-desk.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\(|playwright|puppeteer|XMLHttpRequest/u);
});
