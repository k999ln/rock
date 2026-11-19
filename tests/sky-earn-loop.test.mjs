import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { settleCompanyOrder } from '../lib/sky-company-order.ts';
import { DeviceTierError, chooseExecutor, settleDeviceResults } from '../lib/sky-device-tiers.ts';
import { COCONALA_DESK_POLICY, decideLanePass, postingFromLaneDetail, triageGig } from '../lib/sky-gig-desk.ts';
import { CREATOR_LANES, SKY_GIG_CAPABILITIES, SKY_GIG_OFFERS, creatorCapabilities } from '../lib/sky-gig-offers.ts';
import { ownerSteps, planRecipes } from '../lib/sky-recipe-planner.ts';

const detail = (id, title, text, extra = {}) => ({
  request_id: id, canonical_url: `https://coconala.com/requests/${id}`, title, category: 'その他', visible_text: text,
  accepting_applications: true, budget_min_jpy: 10_000, budget_max_jpy: 40_000, applicants_count: 2, contracted_count: 0, ...extra,
});
const details = [
  detail('5000001', 'GASでGmailをスプレッドシートに転記したい', '毎朝の転記を自動化したいです。\n締切日 2026年11月30日\n納品希望日 2026年12月20日'),
  detail('5000002', 'ロゴを手描きで作ってほしい', '手描きの温かいロゴ。生成AIの使用は不可です。'),
  detail('5000003', '結婚式の司会をお願いします', '当日会場に来られる方。'),
  detail('5000004', '競合調査のレポート', '同業5社の料金と特徴を調べてほしい。', { accepting_applications: false }),
  detail('5000005', 'アンケート集計と分析', '300件の回答を集計しグラフにしてください。'),
  detail('5000006', '商品説明のリライト', '30商品の商品説明を読みやすく。', { budget_min_jpy: null, budget_max_jpy: 1_000 }),
];
const pass = (extra = {}) => decideLanePass({
  details, alreadyAppliedIds: [], maxApplications: 7, proposedToday: 0, offers: SKY_GIG_OFFERS,
  capabilities: SKY_GIG_CAPABILITIES, policy: COCONALA_DESK_POLICY, company: { name: 'avocado' }, today: '2026-11-18', ...extra,
});

void test('every built-in offer can be built from the shared steps and priced above its floor', () => {
  assert.equal(new Set(SKY_GIG_OFFERS.map((offer) => offer.id)).size, 16);
  for (const offer of SKY_GIG_OFFERS) {
    const posting = postingFromLaneDetail(detail('5999999', `${offer.keywords[0]}の依頼`, `${offer.keywords[0]}をお願いします。`, { budget_min_jpy: null, budget_max_jpy: null }));
    const result = triageGig({ posting, offers: [offer], capabilities: SKY_GIG_CAPABILITIES, policy: COCONALA_DESK_POLICY, today: '2026-11-18' });
    assert.equal(result.decision, 'propose', offer.id);
    assert.ok(result.priceYen >= offer.floorYen && result.marginYen >= COCONALA_DESK_POLICY.minimumMarginYen, offer.id);
  }
});

void test('one lane pass returns decisions in the apply-lane shape, with no human step by default', () => {
  const result = pass();
  assert.equal(result.submission, 'auto');
  const submit = result.decisions.filter((item) => item.business_class === 'submit_required');
  assert.deepEqual(submit.map((item) => item.request_id).sort(), ['5000001', '5000005']);
  for (const item of submit) {
    assert.ok(item.proposal_text.length >= 200 && item.proposal_text.length <= 3_000);
    assert.ok(Number.isSafeInteger(item.price_jpy) && /^\d{4}-\d{2}-\d{2}$/u.test(item.deliver_date));
    assert.deepEqual([item.work_frequency, item.weekly_hours_min, item.weekly_hours_max, item.screening_answers], [null, null, null, []]);
    assert.match(item.proposal_text, /制作にはAIを使い/u);
  }
  const refused = Object.fromEntries(result.decisions.filter((item) => item.business_class === 'hard_prohibited').map((item) => [item.request_id, item.reason_codes[0]]));
  assert.equal(refused['5000002'], 'AIでの制作を認めない募集');
  assert.equal(refused['5000003'], '会社が売れる仕事の型に当たらない');
  assert.match(refused['5000006'], /予算の上限1000円/u);
  // 受付を終えた募集は決定に含めない。
  assert.ok(result.decisions.every((item) => item.request_id !== '5000004'));
  assert.equal(postingFromLaneDetail(details[0]).closesOn, '2026-11-30');
  assert.equal(postingFromLaneDetail(details[0]).deliveryOn, '2026-12-20');
});

void test('a pass never re-applies, respects per-pass and daily caps, and defers instead of banning', () => {
  assert.ok(pass({ alreadyAppliedIds: ['5000001'] }).decisions.every((item) => item.request_id !== '5000001'));
  const one = pass({ maxApplications: 1 });
  assert.equal(one.decisions.filter((item) => item.business_class === 'submit_required').length, 1);
  assert.equal(one.deferredRequestIds.length, 1);
  const full = pass({ proposedToday: COCONALA_DESK_POLICY.dailyProposalLimit });
  assert.equal(full.decisions.filter((item) => item.business_class === 'submit_required').length, 0);
  assert.deepEqual(full.deferredRequestIds.sort(), ['5000001', '5000005']);
  // 採用されない型は、禁止ではなく持ち越しになる。
  const cold = pass({ proposals: SKY_GIG_OFFERS.map((offer) => ({ offerId: offer.id, sent: 500, won: 0 })) });
  assert.equal(cold.decisions.filter((item) => item.business_class === 'submit_required').length, 0);
  assert.ok(cold.deferredRequestIds.includes('5000001'));
  assert.equal(pass({ policy: { ...COCONALA_DESK_POLICY, submission: 'owner' } }).submission, 'owner');
});

void test('the desk command turns a lane snapshot into decisions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sky-lane-'));
  const desk = JSON.parse(readFileSync(new URL('../examples/sky/gig-desk/desk.json', import.meta.url), 'utf8'));
  writeFileSync(join(dir, 'desk.json'), JSON.stringify({ ...desk, offers: SKY_GIG_OFFERS, capabilities: SKY_GIG_CAPABILITIES }));
  writeFileSync(join(dir, 'snapshot.json'), JSON.stringify({ request_details: details, already_applied_ids: ['5000005'], objective: { max_applications: 7 } }));
  const out = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/sky-gig-desk.mjs', join(dir, 'desk.json'), '--lane', join(dir, 'snapshot.json')], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }));
  assert.deepEqual(out.decisions.filter((item) => item.business_class === 'submit_required').map((item) => item.request_id), ['5000001']);
});

void test('a creator only makes the thing; everything else is planned, and unconnected markets show up as gaps', () => {
  for (const lane of CREATOR_LANES) {
    const goal = { have: ['idea'], want: 'paid-sale', budgetMinor: 10_000, ownerMinuteValueMinor: 50, expectedRepeats: 12, keepForSelf: [lane.made] };
    const blocked = planRecipes(goal, creatorCapabilities(lane));
    assert.equal(blocked.candidates.length, 0, lane.id);
    assert.ok(blocked.gap.unavailableCapabilityIds.length >= 1 || blocked.gap.missingMaterials.length >= 1, lane.id);
    const plan = planRecipes(goal, creatorCapabilities(lane, [lane.markets[0], lane.funnel[0]]));
    assert.equal(plan.candidates.length, 1, lane.id);
    assert.deepEqual(ownerSteps(plan.candidates[0]).map((step) => step.capabilityId), [`${lane.id}:make`]);
    assert.equal(plan.candidates[0].unwantedOwnerMinutes, 0);
    assert.equal(plan.candidates[0].steps.length, 8);
  }
});

void test('work is placed on the cheapest device that can do it, and client secrets never reach member devices', () => {
  const all = ['member-phone', 'member-home', 'company-home', 'cloud'];
  assert.deepEqual(chooseExecutor({ task: 'classify', data: 'public', available: all }), {
    executor: 'member-phone', verification: 'duplicate_quorum', paysMember: true, reason: '参加者の端末で処理し、別の持ち主の端末と結果が一致したものだけ採用',
  });
  assert.equal(chooseExecutor({ task: 'code', data: 'client-consented', available: all }).executor, 'member-home');
  assert.equal(chooseExecutor({ task: 'code', data: 'public', available: ['member-phone', 'cloud'] }).executor, 'cloud');
  assert.equal(chooseExecutor({ task: 'classify', data: 'client-secret', available: all }).executor, 'company-home');
  assert.equal(chooseExecutor({ task: 'classify', data: 'client-secret', available: ['member-phone', 'member-home', 'cloud'] }).executor, 'cloud');
  assert.throws(() => chooseExecutor({ task: 'classify', data: 'client-secret', available: ['member-phone', 'member-home'] }), DeviceTierError);
  const own = chooseExecutor({ task: 'draft-long', data: 'own', available: ['member-phone', 'member-home', 'cloud'] });
  assert.deepEqual([own.executor, own.verification, own.paysMember], ['member-home', 'none', false]);
  assert.throws(() => chooseExecutor({ task: 'sing', data: 'public', available: all }), DeviceTierError);
});

void test('device results are paid only when different owners agree, once per person per unit', () => {
  const sha = (char) => char.repeat(64);
  const result = (unitId, memberRef, char) => ({ unitId, memberRef, outputSha256: sha(char) });
  const settled = settleDeviceResults({
    orderId: 'order_010', quorum: 2, unitRateMinor: 5,
    results: [
      result('unit_1', 'm_aya', 'a'), result('unit_1', 'm_ben', 'a'), result('unit_1', 'm_cho', 'b'),
      result('unit_1', 'm_aya', 'a'), // 同じ人の二度目
      result('unit_2', 'm_aya', 'c'), result('unit_2', 'm_aya', 'c'), // 1人だけでは一致にならない
      result('unit_3', 'm_ben', 'd'), result('unit_3', 'm_cho', 'e'),
    ],
  });
  assert.deepEqual(settled.accepted, [{ unitId: 'unit_1', outputSha256: sha('a') }]);
  assert.deepEqual(settled.unresolved, ['unit_2', 'unit_3']);
  assert.deepEqual(settled.contributions.map((item) => [item.participantRef, item.kind]), [['m_aya', 'compute'], ['m_ben', 'compute']]);
  const order = settleCompanyOrder({
    orderId: 'order_010', cashReceivedMinor: 10_000, refundsMinor: 0, platformFeeMinor: 2_200, directCostsMinor: 0,
    reserveBps: 1_000, dividendBps: 5_000, contributions: settled.contributions, dividendParticipants: ['m_aya', 'm_ben', 'm_cho'],
  });
  assert.equal(order.feesMinor, 10);
});
