// task 122: 稼ぎ方の設計図。分類表から数百の設計図を作り、工程の種類・理由・アカウント・費用を持たせ、確かめたエージェントだけを工程に当て、
// 並べ、アカウントを作る順と Eve が作る物を出す。予算は稼いだ分だけ、続けるか止めるかは決まった数で決める。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NOAH_ACCOUNTS, NOAH_AFFILIATE_VERTICALS, NOAH_CAPABILITIES, NOAH_OSHI_AGENT, NOAH_OSHI_EXCLUDED, NOAH_OSHI_FANDOMS, NOAH_OSHI_PAINS, NOAH_BUSINESS_SEED_YEN, noahAccountKit, noahAgentsFor, noahBlueprints,
  noahBusinessAllowance, noahBusinessCanSpend, noahEveBacklog, noahPlanBlueprints, noahTrialDecision,
  NOAH_STEP_WAITS, noahBlueprintLevels, noahBlueprintReady, noahBlueprintWaitProblem, noahBlueprintWithout,
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

void test('推し活: one Noah agent aimed at the researched pains — complete info, cheaper trips, safety; applying, booking and cancelling are the fan\'s own tap', () => {
  const steps = new Map(NOAH_OSHI_AGENT.steps.map((s) => [s.id, s]));
  for (const id of ['collect', 'schedule', 'trip-plan', 'hotel-better', 'official-resale', 'goods-preorder', 'cap']) assert.equal(steps.get(id).kind, 'auto', id);
  for (const id of ['apply', 'hotel-hold', 'hotel-release']) assert.equal(steps.get(id).kind, 'tap', id);
  assert.match(steps.get('apply').reason, /BOT/); assert.match(steps.get('hotel-release').reason, /戻せない/);
  for (const s of NOAH_OSHI_AGENT.steps) if (s.capability) assert.ok(NOAH_CAPABILITIES[s.capability], s.id);
  // 困り事は出典付き。強い困り事には、必ず工程が当たる。工程の ID は実在する。
  for (const pain of NOAH_OSHI_PAINS) {
    assert.ok(pain.sources.length && pain.sources.every((u) => u.startsWith('https://')), pain.id);
    const answer = NOAH_OSHI_AGENT.answers[pain.id] ?? [];
    if (pain.strength === 'high') assert.ok(answer.length, `${pain.id} has an answer`);
    for (const id of answer) assert.ok(steps.has(id), `${pain.id} → ${id}`);
  }
  assert.equal(NOAH_OSHI_AGENT.startLanguage, 'ja'); assert.deepEqual([...NOAH_OSHI_AGENT.reminders.freeCancel], [-86_400_000, -21_600_000]);
  assert.ok(NOAH_OSHI_AGENT.polling.officialMs >= 15 * 60_000 && NOAH_OSHI_AGENT.polling.restockMs >= 5 * 60_000, 'polite polling');
});

void test('推し活: the company earns from trips and supplies now; overseas proxy buying is on hold, human-paced, and never tickets', () => {
  const all = noahBlueprints(), oshi = all.filter((b) => b.model === 'oshi'), byId = new Map(all.map((b) => [b.id, b]));
  assert.ok(!oshi.some((b) => b.id.startsWith('oshi:assistant:')), 'the assistant is a Noah agent, not a separate subscription');
  const proxy = byId.get('oshi:proxy-overseas:anime:x');
  assert.match(proxy.hold, /後回し/);
  assert.equal(proxy.steps.find((s) => s.id === 'buy').kind, 'tap'); assert.match(proxy.steps.find((s) => s.id === 'buy').reason, /人の速さ/);
  assert.equal(proxy.steps.find((s) => s.id === 'license').kind, 'review');
  for (const id of ['receive', 'ship']) assert.equal(proxy.steps.find((s) => s.id === id).kind, 'human', id);
  const plans = noahPlanBlueprints({}), firstHeld = plans.findIndex((p) => p.hold);
  assert.ok(firstHeld > 0 && plans.slice(firstHeld).every((p) => p.hold), 'held blueprints come after all others');
  assert.equal(oshi.filter((b) => b.id.startsWith('oshi:proxy-overseas:')).length, NOAH_OSHI_FANDOMS.length * 3);
  assert.ok(!oshi.some((b) => /ticket|チケット/u.test(b.id) || b.steps.some((s) => /チケットを(仕入|売)|転売する|買い占め/u.test(s.label))));
  assert.ok(byId.get('oshi:supplies:suzuri-pod').steps.some((s) => s.id === 'rights' && s.capability === 'compliance.check'));
  for (const ex of NOAH_OSHI_EXCLUDED) assert.ok(ex.reason && ex.source.startsWith('https://'), ex.id);
  assert.deepEqual(NOAH_OSHI_EXCLUDED.map((e) => e.id), ['ticket-auto-apply', 'ticket-resale', 'limited-sniping', 'multi-account', 'queue-bypass', 'fan-made-goods']);
});

// 2026-11-22 本人の評価「（工程を『何を待つか』で並べ直した図は）いいとおもう」: 工程は待つ相手が全部終わったら始め、同時に進められる物は同時に進める。
void test('waits: every step says what it waits for, only earlier steps, so the list order still works one by one; same steps, fewer levels', () => {
  for (const b of noahBlueprints()) {
    assert.equal(noahBlueprintWaitProblem(b.steps), null, b.id);
    const levels = noahBlueprintLevels(b.steps);
    assert.equal(levels.flat().length, b.steps.length, `${b.id}: every step is in one level`);
    assert.ok(levels.length < b.steps.length, `${b.id}: some steps run at the same time (${levels.length} levels for ${b.steps.length} steps)`);
    assert.deepEqual(levels.at(-1).map((s) => s.id), ['decide', 'payout'], `${b.id}: the last level decides and checks the payout`);
    for (const s of b.steps) if (s.waitNote) assert.ok(Object.values(NOAH_STEP_WAITS).includes(s.waitNote), `${b.id}/${s.id}: the reason comes from the table`);
  }
  // 待つ相手の書き方を間違えた設計図は、段にしない。
  assert.match(noahBlueprintWaitProblem([{ id: 'a', label: 'A', kind: 'auto', after: ['b'] }, { id: 'b', label: 'B', kind: 'auto', after: [] }]), /前に無い工程/);
  assert.match(noahBlueprintWaitProblem([{ id: 'a', label: 'A', kind: 'auto' }]), /何を待つか/);
  assert.throws(() => noahBlueprintLevels([{ id: 'a', label: 'A', kind: 'auto', after: ['a'] }]));
});

void test('waits: FX × YouTube — 19 steps in 11 levels (the ASP sign-up needs the channel first); scripts and the LP are made while the partnership application waits', () => {
  const fx = noahBlueprints().find((b) => b.id === 'affiliate:fx:youtube');
  assert.equal(fx.steps.length, 19);
  assert.deepEqual(noahBlueprintLevels(fx.steps).map((level) => level.map((s) => s.id)), [
    ['rules:youtube', 'rules:asp-a8', 'research'], ['signup:youtube'], ['signup:asp-a8'], ['media:asp-a8', 'offers'], ['apply', 'script', 'lp'],
    ['video', 'voice', 'lp-host'], ['disclose'], ['finance-review'], ['publish:youtube'], ['track'], ['decide', 'payout'],
  ]);
  const step = (id) => fx.steps.find((s) => s.id === id);
  assert.equal(step('media:asp-a8').waitNote, NOAH_STEP_WAITS.media);
  assert.deepEqual(step('signup:asp-a8').after, ['rules:asp-a8', 'signup:youtube'], 'the ASP asks for the channel at sign-up');
  assert.deepEqual(step('publish:youtube').after, ['finance-review', 'apply', 'signup:youtube'], 'the link goes up only after the partnership and the checks');
  // 本人の工程（提携の申し込み）を待っていない工程は、先に進む。
  const done = new Set(['rules:asp-a8', 'rules:youtube', 'research', 'signup:asp-a8', 'signup:youtube', 'media:asp-a8', 'offers']);
  assert.deepEqual(noahBlueprintReady(fx.steps, done).map((s) => s.id), ['apply', 'script', 'lp']);
  done.add('script'); done.add('lp');
  assert.deepEqual(noahBlueprintReady(fx.steps, done).map((s) => s.id), ['apply', 'video', 'voice', 'lp-host'], 'video, voice and hosting go on while apply waits');
  assert.deepEqual(noahBlueprintReady(fx.steps, new Set()).map((s) => s.id), ['rules:youtube', 'rules:asp-a8', 'research'], 'at the start, nothing waits for a person');
});

void test('waits: monetization (AdSense, YouTube Partner) is applied for after something is published; drafts and research do not wait for sign-up', () => {
  const byId = new Map(noahBlueprints().map((b) => [b.id, b]));
  for (const id of ['ads:ai:youtube', 'ads:ai:blog', 'oshi:calendar-media:anime']) {
    const steps = byId.get(id).steps, signup = steps.find((s) => /^signup:(adsense|youtube-partner)$/u.test(s.id));
    assert.ok(signup.after.some((a) => a.startsWith('publish')), `${id}: ${signup.after.join(', ')}`);
    assert.equal(signup.waitNote, NOAH_STEP_WAITS.monetize);
    assert.ok(steps.find((s) => s.id === 'track').after.includes(signup.id), `${id}: revenue is read once monetization is on`);
  }
  assert.deepEqual(byId.get('gig:translation:coconala')?.steps.find((s) => s.id === 'listing').after ?? [], []);
  for (const b of byId.values()) {
    const research = b.steps.find((s) => s.id === 'research');
    if (research) assert.deepEqual(research.after, [], `${b.id}: research waits for nothing`);
  }
});

void test('waits: dropping steps (owned accounts) keeps the chain — whoever waited for a dropped step waits for what it waited for', () => {
  const steps = [
    { id: 'rules:a', label: 'r', kind: 'auto', after: [] }, { id: 'signup:a', label: 's', kind: 'human', after: ['rules:a'] },
    { id: 'x', label: 'x', kind: 'auto', after: [] }, { id: 'use', label: 'u', kind: 'auto', after: ['signup:a', 'x'] },
  ];
  assert.deepEqual(noahBlueprintWithout(steps, (s) => s.id.endsWith(':a')).map((s) => [s.id, s.after]), [['x', []], ['use', ['x']]]);
  const all = ['youtube', 'youtube-partner', 'asp-a8', 'x', 'instagram', 'tiktok', 'hosting', 'adsense', 'coconala', 'apple-developer'];
  for (const owned of [new Set(['youtube', 'youtube-partner']), new Set(all)]) {
    for (const p of noahPlanBlueprints({}, owned)) {
      assert.equal(noahBlueprintWaitProblem(p.steps), null, p.id);
      assert.ok(!p.steps.some((s) => s.after.some((id) => id.endsWith(':youtube') && id.startsWith('signup'))), `${p.id}: no step waits for a dropped sign-up`);
    }
  }
  const ads = noahPlanBlueprints({}, new Set(['youtube', 'youtube-partner'])).find((p) => p.id === 'ads:ai:youtube');
  assert.deepEqual(ads.steps.find((s) => s.id === 'track').after, ['publish:youtube']);
});

void test('the blueprint page (/noah/review/business) shows plans only to an authenticated reviewer; ?id= opens the leveled explanation', async () => {
  const { runInNewContext } = await import('node:vm');
  const ts = (await import('typescript')).default;
  const { noahReviewerAccess } = await import('../lib/noah-reviewer.ts');
  const business = await import('../lib/noah-business.ts');
  const navigation = await import('../lib/noah-navigation.ts');
  const jsx = (type, props) => ({ type, props });
  const source = ts.transpileModule(readFileSync(new URL('../app/noah/review/business/page.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const capabilities = JSON.parse(readFileSync(new URL('../data/noah-business-capabilities.json', import.meta.url), 'utf8'));
  const nodes = (tree) => (tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : []);
  const render = async (owner, id) => {
    const deps = noahReviewerAccess(async (request) => { assert.equal(request.headers.get('cookie'), 'session-fixture'); if (!owner) throw Error('UNAUTHORIZED'); return owner; }, 'reviewer', '');
    const modules = {
      'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' }, 'next/headers': { headers: async () => new Headers({ cookie: 'session-fixture' }) }, 'next/link': { default: 'a' },
      '@/data/noah-business-capabilities.json': { default: capabilities }, '@/components/noah-blueprint-levels': { default: 'levels' }, '@/lib/noah-business': business,
      '@/lib/noah-navigation': navigation,
      '@/lib/noah-intake-server': { noahIntakeDependencies: () => deps }, '@/components/noah-service.module.css': { default: {} }, '@/components/noah-blueprint-levels.module.css': { default: {} },
    };
    const exports = {};
    runInNewContext(source, { exports, Request, encodeURIComponent, require: (name) => { assert.ok(name in modules, name); return modules[name]; } });
    const tree = await exports.default({ searchParams: Promise.resolve(id ? { id } : {}) });
    return typeof tree.type === 'function' ? { name: tree.type.name, page: tree.type(tree.props) } : { name: tree.type, page: tree };
  };
  for (const owner of ['other-owner', null]) {
    const { page } = await render(owner, 'affiliate:fx:youtube');
    assert.equal(page.type, 'main');
    assert.ok(!nodes(page).some((n) => n.type === 'levels' || (n.type === 'a' && String(n.props.href).includes('?id='))), `${owner}: nothing of the plans`);
  }
  const list = await render('reviewer');
  assert.equal(list.name, 'List');
  assert.equal(nodes(list.page).filter((n) => n.type === 'a' && String(n.props.href).startsWith('/noah/review/business?id=')).length, business.noahBlueprints().length);
  const detail = await render('reviewer', 'affiliate:fx:youtube');
  assert.equal(detail.name, 'Detail');
  const levels = nodes(detail.page).find((n) => n.type === 'levels');
  assert.equal(levels.props.steps.length, 19);
  assert.match(JSON.stringify(nodes(detail.page).map((n) => n.props?.children).filter((c) => typeof c === 'string' || Array.isArray(c))), /待つ相手の前提/);
  assert.equal((await render('reviewer', 'no-such-plan')).name, 'List', 'an unknown id falls back to the list');
});

// 2026-11-22 に確かめた事実（出典付き）: ASP は登録の時に載せる場の情報を入れる。AdSense は独自のコンテンツ、YouTube パートナーは公開した動画の再生で決まる。
void test('waits: every ASP sign-up waits for the place it will advertise on; the checked facts carry https sources', () => {
  for (const b of noahBlueprints()) {
    for (const s of b.steps) {
      const account = NOAH_ACCOUNTS.find((a) => `signup:${a.id}` === s.id);
      if (account?.kind !== 'asp') continue;
      assert.equal(s.waitNote, NOAH_STEP_WAITS.aspSignup, `${b.id}/${s.id}`);
      assert.ok(s.after.some((id) => id.startsWith('signup:')), `${b.id}/${s.id}: waits for the channel sign-up`);
    }
  }
  for (const id of ['asp-a8', 'asp-accesstrade', 'adsense', 'youtube-partner']) {
    const facts = NOAH_ACCOUNTS.find((a) => a.id === id).facts ?? [];
    assert.ok(facts.length && facts.every((f) => f.text && f.source.startsWith('https://')), id);
  }
  assert.match(NOAH_ACCOUNTS.find((a) => a.id === 'youtube-partner').facts.map((f) => f.text).join(' '), /2027-02-01/);
});
