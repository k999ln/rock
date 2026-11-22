// task 122: 稼ぎ方の設計図。分類表から数百の設計図を作り、工程の種類・理由・アカウント・費用を持たせ、確かめたエージェントだけを工程に当て、
// 並べ、アカウントを作る順と Eve が作る物を出す。予算は稼いだ分だけ、続けるか止めるかは決まった数で決める。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NOAH_ACCOUNTS, NOAH_AFFILIATE_VERTICALS, NOAH_CAPABILITIES, NOAH_OSHI_EXCLUDED, NOAH_OSHI_FANDOMS, NOAH_BUSINESS_SEED_YEN, noahAccountKit, noahAgentsFor, noahBlueprints,
  noahBusinessAllowance, noahBusinessCanSpend, noahEveBacklog, noahPlanBlueprints, noahTrialDecision,
} from '../lib/noah-business.ts';
import { businessMarkdown, businessReport } from '../scripts/noah-business-plan.mjs';

const DAY = 86_400_000;

void test('blueprints: hundreds of ways to earn, from the taxonomy, the same every time, each from sign-up to payout', () => {
  const all = noahBlueprints();
  assert.ok(all.length >= 400, `${all.length}`);
  assert.deepEqual(new Set(all.map((b) => b.model)), new Set(['affiliate', 'gig', 'digital', 'ads', 'commerce', 'app', 'oshi']));
  assert.equal(new Set(all.map((b) => b.id)).size, all.length, 'ids are unique');
  assert.deepEqual(noahBlueprints(), all, 'deterministic');
  const accounts = new Set(NOAH_ACCOUNTS.map((a) => a.id));
  for (const b of all) {
    assert.deepEqual(b.steps.slice(-3).map((s) => s.id), ['track', 'decide', 'payout'], b.id);
    assert.equal(new Set(b.steps.map((s) => s.id)).size, b.steps.length, `${b.id}: step ids`);
    for (const s of b.steps) {
      if (s.kind !== 'auto') assert.ok(s.reason, `${b.id}/${s.id}: a person is involved, so the reason is shown`);
      if (s.capability) assert.ok(NOAH_CAPABILITIES[s.capability], `${b.id}/${s.id}`);
      if (s.account) assert.ok(accounts.has(s.account), `${b.id}/${s.id}: ${s.account}`);
    }
    for (const a of b.accounts) assert.ok(b.steps.some((s) => s.id === `signup:${a}` && s.kind === 'human'), `${b.id}: sign-up for ${a}`);
    // 登録の前に、規約と要件を確かめる。
    for (const a of b.accounts) assert.ok(b.steps.findIndex((s) => s.id === `rules:${a}`) < b.steps.findIndex((s) => s.id === `signup:${a}`), `${b.id}: rules before ${a}`);
  }
});

void test('blueprints: finance gets Noelle\'s own check; ads are labelled; TikTok publishing is a tap; passwords, codes, ID and bank stay with the person', () => {
  const all = noahBlueprints(), byId = new Map(all.map((b) => [b.id, b]));
  const fx = byId.get('affiliate:fx:tiktok');
  assert.ok(fx.finance && fx.steps.some((s) => s.id === 'finance-review' && s.kind === 'review'));
  assert.ok(fx.steps.some((s) => s.id === 'disclose' && s.capability === 'compliance.check'));
  assert.equal(fx.steps.find((s) => s.id === 'publish:tiktok').kind, 'tap');
  assert.equal(byId.get('affiliate:beauty:blog').steps.some((s) => s.kind === 'review'), false);
  for (const v of NOAH_AFFILIATE_VERTICALS) assert.equal(byId.get(`affiliate:${v.id}:x`).finance, !!v.finance);
  const signup = fx.steps.find((s) => s.id === 'signup:asp-a8');
  assert.match(signup.reason, /パスワード.*確認コード.*口座/);
});

void test('plan: only verified agents count; word matches are candidates; owned accounts drop their sign-up; the order is fixed', () => {
  const agents = [{ id: 'a', name: 'Video Maker', summary: 'makes short video' }, { id: 'b', name: 'Arabic Name Calligraphy', summary: 'writes your name' }];
  assert.deepEqual(noahAgentsFor('content.video', agents).map((a) => a.id), ['a']);
  const none = noahPlanBlueprints({}), withVideo = noahPlanBlueprints({ 'content.video': ['a'] });
  const pick = (plans, id) => plans.find((p) => p.id === id);
  assert.ok(pick(none, 'ads:ai:youtube').gaps.includes('content.video'));
  assert.ok(!pick(withVideo, 'ads:ai:youtube').gaps.includes('content.video'));
  assert.ok(pick(withVideo, 'ads:ai:youtube').score > pick(none, 'ads:ai:youtube').score);
  const owned = noahPlanBlueprints({}, new Set(['youtube', 'youtube-partner']));
  assert.equal(pick(owned, 'ads:ai:youtube').humanSteps, pick(none, 'ads:ai:youtube').humanSteps - 2);
  assert.ok(!pick(owned, 'ads:ai:youtube').steps.some((s) => s.id === 'rules:youtube'));
  assert.deepEqual(noahPlanBlueprints({}).map((p) => p.id), none.map((p) => p.id));
  for (let i = 1; i < none.length; i++) assert.ok(none[i - 1].score >= none[i].score);
  // 本人の工程が多い物ほど下がる（他が同じなら）。
  const fx = pick(none, 'affiliate:fx:x'), beauty = pick(none, 'affiliate:beauty:x');
  assert.ok(beauty.score > fx.score, 'the extra finance check costs a little');
});

void test('account kit and Eve backlog: what to create first, and which missing abilities block the most', () => {
  const plans = noahPlanBlueprints({});
  const kit = noahAccountKit(plans, 50);
  for (let i = 1; i < kit.length; i++) assert.ok(kit[i - 1].unlocks >= kit[i].unlocks);
  assert.ok(kit.every((a) => a.needs.length && a.label));
  const backlog = noahEveBacklog(plans);
  assert.equal(backlog[0].blocked, plans.length, 'market research is in every blueprint');
  assert.ok(!backlog.some((b) => b.capability === 'optimize.rules'), 'the keep/stop rules run inside Noah');
});

void test('budget: spend only what was earned (approved revenue), starting from a small seed', () => {
  assert.equal(noahBusinessAllowance({ approvedYen: 0, spentYen: 0 }), NOAH_BUSINESS_SEED_YEN);
  assert.equal(noahBusinessAllowance({ approvedYen: 5000, spentYen: 12_000, reservedYen: 1000 }), 2000);
  assert.equal(noahBusinessCanSpend({ approvedYen: 0, spentYen: 9000 }, 1000), true);
  assert.equal(noahBusinessCanSpend({ approvedYen: 0, spentYen: 9000 }, 1001), false);
  assert.equal(noahBusinessCanSpend({ approvedYen: 0, spentYen: 0 }, -1), false);
  assert.throws(() => noahBusinessAllowance({ approvedYen: -1, spentYen: 0 }));
});

void test('trial: scale when approved revenue covers twice the cost, keep with clicks or an approval, stop quiet trials after 14 days and 10 outputs', () => {
  const base = { startedAt: 0, now: 3 * DAY, outputs: 3, clicks: 0, approved: 0, approvedYen: 0, costYen: 1000 };
  assert.equal(noahTrialDecision(base), 'wait');
  assert.equal(noahTrialDecision({ ...base, approved: 1, approvedYen: 2000 }), 'scale');
  assert.equal(noahTrialDecision({ ...base, approved: 1, approvedYen: 500 }), 'continue');
  assert.equal(noahTrialDecision({ ...base, clicks: 50 }), 'continue');
  assert.equal(noahTrialDecision({ ...base, now: 14 * DAY, outputs: 10, clicks: 19 }), 'stop');
  assert.equal(noahTrialDecision({ ...base, now: 14 * DAY, outputs: 9, clicks: 0 }), 'wait', 'not enough tries yet');
});

void test('report: verified mappings for agents no longer listed are ignored; the markdown names the first steps and the facts with sources', () => {
  const runnable = [{ id: 'a', name: 'Video Maker', summary: 'video' }];
  const report = businessReport({ runnable, discovered: [{ id: 'd', name: 'Social Poster', summary: 'post to tiktok', url: 'https://github.com/x/y' }], verified: { 'content.video': ['a', 'gone'] }, now: Date.UTC(2026, 10, 22) });
  assert.equal(report.coverage.find((c) => c.capability === 'content.video').verified, 1);
  assert.ok(report.eve.find((e) => e.capability === 'publish.sns').discovered.some((d) => d.name === 'Social Poster'));
  const md = businessMarkdown(report);
  assert.match(md, /## アカウントを作る順/); assert.match(md, /\[本人\]/);
  // 確かめた事実は、出典の URL と一緒に出る。
  for (const account of report.accounts) for (const fact of account.facts ?? []) assert.ok(md.includes(fact.source), fact.source);
  const data = JSON.parse(readFileSync(new URL('../data/noah-business-capabilities.json', import.meta.url), 'utf8'));
  assert.equal(data.schema, 'noah-business-capabilities/1');
  for (const [capability, ids] of Object.entries(data.verified)) { assert.ok(NOAH_CAPABILITIES[capability], capability); assert.ok(Array.isArray(ids)); }
});

void test('推し活: the assistant watches, schedules and reminds, but applying and paying are always the fan\'s own tap; proxy buying is human-paced and never tickets', () => {
  const all = noahBlueprints(), oshi = all.filter((b) => b.model === 'oshi'), byId = new Map(all.map((b) => [b.id, b]));
  assert.equal(oshi.filter((b) => b.id.startsWith('oshi:assistant:')).length, NOAH_OSHI_FANDOMS.length);
  const assistant = byId.get('oshi:assistant:idol');
  for (const id of ['watch', 'calendar', 'notify', 'travel', 'budget']) assert.equal(assistant.steps.find((s) => s.id === id).kind, 'auto', id);
  assert.equal(assistant.steps.find((s) => s.id === 'apply').kind, 'tap', 'no bot applies to a lottery or first-come sale');
  assert.match(assistant.steps.find((s) => s.id === 'apply').reason, /BOT/);
  assert.equal(assistant.steps.find((s) => s.id === 'travel-book').kind, 'tap', 'paid bookings are confirmed by the person');
  const proxy = byId.get('oshi:proxy-overseas:anime:x');
  assert.equal(proxy.steps.find((s) => s.id === 'buy').kind, 'tap');
  assert.match(proxy.steps.find((s) => s.id === 'buy').reason, /人の速さ/);
  assert.equal(proxy.steps.find((s) => s.id === 'license').kind, 'review', 'whether a secondhand dealer licence is needed is checked first');
  for (const id of ['receive', 'ship']) assert.equal(proxy.steps.find((s) => s.id === id).kind, 'human', id);
  // チケットを扱う設計図・転売・自作の版権グッズは無い。除外した物は、理由と出典を持つ。
  assert.ok(!oshi.some((b) => /ticket|チケット/u.test(b.id) || b.steps.some((s) => /チケットを(仕入|売)|転売する|買い占め/u.test(s.label))));
  assert.ok(byId.get('oshi:supplies:suzuri-pod').steps.some((s) => s.id === 'rights' && s.capability === 'compliance.check'));
  for (const ex of NOAH_OSHI_EXCLUDED) assert.ok(ex.reason && ex.source.startsWith('https://'), ex.id);
  assert.deepEqual(NOAH_OSHI_EXCLUDED.map((e) => e.id), ['ticket-auto-apply', 'ticket-resale', 'limited-sniping', 'multi-account', 'queue-bypass', 'fan-made-goods']);
});
