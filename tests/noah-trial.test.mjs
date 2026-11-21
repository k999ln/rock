// 300 人の試行（task 114）: 経路の札・入口・段の判定・本人の報告・運営の画面。
// 表は本番と同じ migration（tests/fixtures/noah/intake.mjs）。棚のカードは、審査者が実際に動かして確かめた物（tests/noah-shelf-store.test.mjs と同じ道）。
// 試行の参加者の接続と依頼は、数える問い合わせが読む行だけを、表に直に書く（数えるのは、試行の人がどこまで行ったかで、つなぐ・頼むの作りは別の試験が見る）。
// 仕様: docs/noah/trial-300.md の 3・4・5・7・9 章、codex/tasks/114-noah-trial-300.md の合格条件。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { noahToolSha256 } from '../lib/noah-form.ts';
import { createNoahShelfApi } from '../lib/noah-shelf-api.ts';
import { parseNoahShelfFlags } from '../lib/noah-shelf.ts';
import { createNoahTrialApi } from '../lib/noah-trial-api.ts';
import { createNoahTrialStore } from '../lib/noah-trial.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as askView from '../lib/noah-ask-view.ts';
import * as botNotice from '../lib/noah-bot-notice.ts';
import * as formLib from '../lib/noah-form.ts';
import * as readyView from '../lib/noah-ready-view.ts';
import * as surface from '../lib/noah-surface.ts';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid, OPEN, ORIGIN } from './fixtures/noah/connect-world.mjs';
import { screen } from './fixtures/noah/screen.mjs';

const REVIEWER = 'reviewer-a';
const TRIAL_OPEN = { ...OPEN, NOAH_SHELF_PUBLIC: 'true', NOAH_TRIAL_OPEN: 'true' };
const DAY = 86_400_000, H = 'a'.repeat(64);
const lookup = () => tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', maxLength: 200 } } } });
const shaOf = (d) => noahToolSha256({ name: d.name, description: d.description ?? '', inputSchema: d.inputSchema, readOnly: d.annotations?.readOnlyHint === true });
const card = (change = {}) => ({
  schema: 'noah-package/1', id: 'pkg:player-lookup', shelf: 'earn', topic: 'research', title: '選手を調べる', promise: '選手の名前を渡すと、記録の要点が返ります。',
  give: '選手の名前', get: '記録の要点', have: ['topic'], want: 'summary',
  steps: [{ ref: { kind: 'family', familyId: familyId(1), tool: 'lookup' }, consumes: ['topic'], produces: 'summary', ownerMinutes: 1 }],
  checks: [{ id: 'has-answer', text: '答えが返っている', judge: 'rule' }], position: 10, status: 'draft', revision: 1, ...change,
});

/** 入口を、その人として呼ぶ（user が null なら未サインイン）。 */
function api(w, user, env = TRIAL_OPEN, create = createNoahTrialApi, path = '/api/noah/trial') {
  const handler = create({
    db: w.f.db, now: w.f.time, reviewers: [REVIEWER], flags: parseNoahFlags(env), shelfFlags: parseNoahShelfFlags(env),
    authenticate: async () => { if (!user) throw Error('UNAUTHORIZED'); return user; },
  });
  const send = async (method, query, body, headers = {}) => {
    const base = method === 'GET' ? {} : { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': user ? await ownerIntent.ownerScopeFor(user) : '' };
    const response = await handler(new Request(ORIGIN + path + query, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { ...base, ...headers } }));
    return { status: response.status, body: await response.json() };
  };
  return { get: (query = '') => send('GET', query), post: (body, headers) => send('POST', '', body, headers) };
}

/** 審査者が Agent 1 の lookup を動かし、「稼ぐ・仕事を省く」の棚にカードを載せた世界。 */
async function shelved(t) {
  const definition = lookup();
  const w = await world(t, { [hostOf(1)]: mcpServer({ tools: [definition, tool('stats')] }) }, { reviewers: [REVIEWER], env: TRIAL_OPEN });
  const waiting = [], reviewer = w.as(REVIEWER, { waitUntil: (work) => { waiting.push(work); } });
  await reviewer.connect(familyId(1), uuid(1));
  await reviewer.ask({ id: uuid(100), connectionId: uuid(1), form: { tool: 'lookup', toolSha256: await shaOf(definition), input: { query: 'x' } }, screen: 'narrow' });
  await Promise.all(waiting.splice(0));
  const shelf = api(w, REVIEWER, TRIAL_OPEN, createNoahShelfApi, '/api/noah/shelf');
  for (const pkg of [card(), card({ id: 'pkg:quiz-lookup', shelf: 'learn', topic: 'study', title: '小テストの答えを調べる', position: 20 })]) {
    assert.equal((await shelf.post({ action: 'put', package: pkg, revision: null })).status, 200);
    assert.equal((await shelf.post({ action: 'verify', id: pkg.id, revision: 1 })).body.listed, true);
  }
  return w;
}

let serial = 1000;
/** 試行の参加者が「接続」を押した（connected: つながった）行と、依頼の行。数える問い合わせが読む列だけ、本物の形で書く。 */
function connection(w, owner, { connected = true, family = familyId(1) } = {}) {
  const id = uuid(++serial), at = w.f.time();
  w.f.sql.prepare(`INSERT INTO noah_connections(id,owner_id,family_key,agent_id,digest,request_sha256,connect_json,connect_sha256,plan_sha256,place,state,consent_json,price_json,cost_taps,cost_typed,revision,created_at,updated_at,connected_at)
    VALUES(?,?,?,?,?,?,'{}',?,?,'provider',?,'{}','{"model":"free"}',0,0,1,?,?,?)`).run(id, owner, family, family, H, H, H, H, connected ? 'connected' : 'failed', at, at, connected ? at + 100 : null);
  return id;
}
function ask(w, owner, connectionId, at, { state = 'succeeded', tool: name = 'lookup' } = {}) {
  const done = ['succeeded', 'failed', 'stopped', 'limit', 'unknown'].includes(state);
  w.f.sql.prepare(`INSERT INTO noah_asks(id,owner_id,connection_id,work_id,request_sha256,mode,host,tool,tool_sha256,state,revision,created_at,updated_at,finished_at)
    VALUES(?,?,?,?,?,'form',?,?,?,?,1,?,?,?)`).run(uuid(++serial), owner, connectionId, `work-${serial}`, H, hostOf(1), name, H, state, at, at, done ? at + 1000 : null);
}
/** 試行の参加者 1 人: 札で入り、（任意で）つなぎ、成果まで行き、翌日以降にもう一度頼む。 */
async function participant(w, owner, via, { connect = true, connected = true, result = true, returned = false } = {}) {
  assert.equal((await api(w, owner).post({ action: 'enter', via })).body.entered, true, owner);
  if (!connect) return;
  const c = connection(w, owner, { connected });
  if (!connected || !result) return;
  const at = w.f.time();
  ask(w, owner, c, at);
  if (returned) ask(w, owner, c, at + DAY + DAY / 2);
}
const state = async (w) => (await api(w, REVIEWER).get('?state=1')).body;

void test('the tables: the migration is the contract, and both migration folders carry the same file', () => {
  const contract = readFileSync(new URL('../docs/contracts/noah-shelf-v1.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../drizzle/0051_noah_trial.sql', import.meta.url), 'utf8');
  assert.equal(migration, readFileSync(new URL('../drizzle-main/0051_noah_trial.sql', import.meta.url), 'utf8'));
  const from = (sql) => sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS noah_trial_channels'), sql.indexOf('CREATE INDEX IF NOT EXISTS noah_trial_reports_package'));
  assert.ok(from(migration).length > 500);
  assert.equal(from(migration), from(contract));
  assert.ok(migration.trimEnd().endsWith('CREATE INDEX IF NOT EXISTS noah_trial_reports_package ON noah_trial_reports(package_id);'));
  assert.doesNotMatch(migration, /noah_package_evidence|noah_shelf_daily|noah_shelf_seen|noah_package_connections/);
});

void test('done (114): two channels, seven people (six and one): only the six-person channel is counted on the operator screen; an unknown or closed tag makes no row', async (t) => {
  const w = await shelved(t), operator = api(w, REVIEWER);
  // 札を足す（審査者だけ）。形の違う札・同じ札・審査者でない人は拒む。
  assert.equal((await operator.post({ action: 'channel', via: 'salon-1', label: 'サロン 11/21 の投稿', wave: 1 })).status, 200);
  assert.equal((await operator.post({ action: 'channel', via: 'talk-1', label: '勉強会 11/28', wave: 1 })).status, 200);
  assert.equal((await operator.post({ action: 'channel', via: 'talk-1', label: '重なり', wave: 1 })).status, 409);
  assert.equal((await operator.post({ action: 'channel', via: 'Salon_2', label: '形が違う', wave: 1 })).status, 400);
  assert.equal((await operator.post({ action: 'channel', via: 'x', label: '段が違う', wave: 4 })).status, 400);
  assert.equal((await api(w, 'owner-z').post({ action: 'channel', via: 'mine', label: '自分の札', wave: 1 })).status, 403);

  for (let n = 1; n <= 6; n++) await participant(w, `person-${n}`, 'salon-1', { result: n <= 4 });
  await participant(w, 'person-7', 'talk-1');
  // 知らない札・形の違う札では、行ができない。もう入った本人は、別の札でも書き換えない。
  for (const via of ['nope', 'SALON-1', 'salon-1/../x', 42, null]) assert.deepEqual((await api(w, 'person-8').post({ action: 'enter', via })).body.entered, false);
  assert.deepEqual([(await api(w, 'person-7').post({ action: 'enter', via: 'salon-1' })).body.already, w.f.sql.prepare("SELECT via FROM noah_trial_entries WHERE owner_id='person-7'").get().via], [true, 'talk-1']);
  // 閉じた札でも、行ができない（入った人の行は残る）。
  assert.equal((await operator.post({ action: 'close', via: 'talk-1' })).status, 200);
  assert.equal((await api(w, 'person-9').post({ action: 'enter', via: 'talk-1' })).body.entered, false);
  assert.equal(w.f.sql.prepare('SELECT COUNT(*) n FROM noah_trial_entries').get().n, 7);

  const s = await state(w);
  // 5 人未満の経路（talk-1 の 1 人）は、数を出さない。札の一覧には、人数が無い。
  assert.deepEqual(s.funnel, [{ via: 'salon-1', entered: 6, connected: 6, firstResult: 4 }]);
  assert.deepEqual(s.channels.map((row) => [row.via, row.label, row.wave, row.closedAt !== null, Object.keys(row).sort().join()]), [
    ['salon-1', 'サロン 11/21 の投稿', 1, false, 'closedAt,createdAt,label,via,wave'], ['talk-1', '勉強会 11/28', 1, true, 'closedAt,createdAt,label,via,wave'],
  ]);
  assert.deepEqual(s.waves[0].counts, { pressed: 7, connected: 7, firstResult: 5, returned: 0 });
  // 応答に、本人の ID は無い。
  assert.doesNotMatch(JSON.stringify(s), /person-/);
});

void test('done (114): wave 1 finishes with enough people and rates; fewer returning people show "また使う割合が足りません" in wave 2', async (t) => {
  const w = await shelved(t), operator = api(w, REVIEWER);
  await operator.post({ action: 'channel', via: 'salon-1', label: 'サロン', wave: 1 });
  // 30 人が成果まで（つながる 30/30・成果 30/30）。また使った人は 10 人（33%）。
  for (let n = 1; n <= 30; n++) await participant(w, `p-${n}`, 'salon-1', { returned: n <= 10 });
  let s = await state(w);
  assert.deepEqual([s.waves[0].done, s.waves[0].text, s.current], [true, ['段 1 を終えました'], 2]);
  assert.deepEqual(s.waves[1].text, ['人数が足りません（成果まで行った人 30 / 100）']);
  // また使った人を 5 人（17%）に減らすと、段 2 で「また使う割合が足りません」。
  w.f.sql.prepare("DELETE FROM noah_asks WHERE owner_id IN ('p-6','p-7','p-8','p-9','p-10') AND created_at > ?").run(w.f.time() + DAY);
  s = await state(w);
  assert.deepEqual(s.waves[0].text, ['段 1 を終えました']);
  assert.deepEqual(s.waves[1].text, ['人数が足りません（成果まで行った人 30 / 100）', 'また使う割合が足りません（20% 以上）']);
  assert.deepEqual(s.waves[1].counts, { pressed: 30, connected: 30, firstResult: 30, returned: 5 });
  // つながらない人が多いと、段 1 も終わらない。
  for (let n = 1; n <= 10; n++) await participant(w, `q-${n}`, 'salon-1', { connected: false });
  s = await state(w);
  assert.deepEqual([s.current, s.waves[0].text], [1, ['つながる割合が足りません（90% 以上）']]);
  // 届ける人数の式（成果 300 人・開いた人の 3 割が接続・その 5 割が成果）。
  assert.equal((await import('../lib/noah-trial.ts')).noahTrialReach(300, 30, 50), 2000);
});

void test('the report: only trial people who ran the card on the earn shelf; four numbers; overwritten; totals shown from five people', async (t) => {
  const w = await shelved(t), operator = api(w, REVIEWER);
  await operator.post({ action: 'channel', via: 'salon-1', label: 'サロン', wave: 1 });
  const report = (owner, values, id = 'pkg:player-lookup') => api(w, owner).post({ action: 'report', packageId: id, ...values });
  const values = (listed, sold, netYen, minutes) => ({ listed, sold, netYen, minutes });

  // 試行に入っていない人・成果まで行っていない人・別の道具だけ動かした人・教育の棚のカードは、入れられない。
  connection(w, 'outsider'); ask(w, 'outsider', w.f.sql.prepare("SELECT id FROM noah_connections WHERE owner_id='outsider'").get().id, w.f.time());
  assert.equal((await report('outsider', values(true, 1, 2000, 30))).status, 403);
  await participant(w, 'no-result', 'salon-1', { result: false });
  assert.equal((await report('no-result', values(true, 1, 2000, 30))).status, 403);
  await participant(w, 'other-tool', 'salon-1', { result: false });
  ask(w, 'other-tool', w.f.sql.prepare("SELECT id FROM noah_connections WHERE owner_id='other-tool'").get().id, w.f.time(), { tool: 'stats' });
  assert.equal((await report('other-tool', values(true, 1, 2000, 30))).status, 403);
  await participant(w, 'r-1', 'salon-1');
  assert.equal((await report('r-1', values(false, 0, 0, 10), 'pkg:quiz-lookup')).status, 403);
  // 4 つの数の決まり。
  assert.equal((await report('r-1', values(false, 1, 0, 10))).status, 400);
  assert.equal((await report('r-1', values(true, 0, 500, 10))).status, 400);
  assert.equal((await report('r-1', values(true, 1.5, 500, 10))).status, 400);
  assert.equal((await report('r-1', { listed: 'yes', sold: 0, netYen: 0, minutes: 0 })).status, 400);
  assert.equal((await api(w, 'r-1').post({ action: 'report', packageId: 'pkg:player-lookup', ...values(true, 1, 1, 1), note: '文章' })).status, 400);
  // 入れられる人の画面: 入れられる・まだ合計は無い。上書きされる。
  assert.deepEqual((await api(w, 'r-1').get('?card=pkg:player-lookup')).body.eligible, true);
  assert.equal((await report('r-1', values(true, 1, 2000, 60))).status, 200);
  assert.equal((await report('r-1', values(true, 2, 5200, 70))).status, 200);
  assert.deepEqual({ ...w.f.sql.prepare('SELECT listed,sold,net_yen,minutes FROM noah_trial_reports').get() }, { listed: 1, sold: 2, net_yen: 5200, minutes: 70 });

  // 4 人では、合計を出さない。5 人目で、誰にでも出る（未サインインにも）。
  for (const [owner, v] of [['r-2', values(true, 1, 2600, 30)], ['r-3', values(false, 0, 0, 20)], ['r-4', values(true, 0, 0, 15)]]) { await participant(w, owner, 'salon-1'); assert.equal((await report(owner, v)).status, 200); }
  assert.equal((await api(w, null).get('?card=pkg:player-lookup')).body.summary, null);
  await participant(w, 'r-5', 'salon-1');
  assert.equal((await report('r-5', values(true, 1, 2600, 35))).status, 200);
  const shown = (await api(w, null).get('?card=pkg:player-lookup')).body;
  // 5 人・出品 4 人・売れた 3 人・4 件・手取り 10,400・分 170 → 1 件の手取り 2,600・1 件の分 43（170 / 4 = 42.5）。
  assert.deepEqual([shown.summary, shown.eligible, shown.report], ['報告した 5 人のうち、出品した 4 人・売れた 3 人。1 件の手取りの平均 ¥2,600・掛けた分の平均 43 分', false, null]);
  const s = await state(w);
  assert.deepEqual(s.earn.map((row) => [row.packageId, row.people, row.orders, row.netYen]), [['pkg:player-lookup', 5, 4, 10400]]);
});

void test('closed: no tag is read and no report field appears; the operator can still prepare channels; same-origin, owner scope and JSON checks', async (t) => {
  const w = await shelved(t), closed = { ...OPEN, NOAH_SHELF_PUBLIC: 'true' };
  assert.equal((await api(w, 'owner-a', closed).get('?me=1')).status, 404);
  assert.equal((await api(w, null, closed).get('?card=pkg:player-lookup')).status, 404);
  assert.equal((await api(w, 'owner-a', closed).post({ action: 'enter', via: 'salon-1' })).status, 404);
  assert.equal((await api(w, 'owner-a', closed).post({ action: 'report', packageId: 'pkg:player-lookup', listed: false, sold: 0, netYen: 0, minutes: 0 })).status, 404);
  assert.equal((await api(w, REVIEWER, closed).post({ action: 'channel', via: 'salon-1', label: 'サロン', wave: 1 })).status, 200);
  const prepared = (await api(w, REVIEWER, closed).get('?state=1')).body;
  assert.deepEqual([prepared.open, prepared.channels.length], [false, 1]);
  assert.equal((await api(w, 'owner-a', closed).get('?state=1')).status, 404);
  assert.equal(w.f.sql.prepare('SELECT COUNT(*) n FROM noah_trial_entries').get().n, 0);
  // 開いている時の検査。
  const open = api(w, 'owner-a');
  assert.deepEqual((await open.get('?me=1')).body.entered, false);
  assert.equal((await api(w, null).get('?me=1')).body.ownerScope, null);
  assert.equal((await api(w, null).post({ action: 'enter', via: 'salon-1' })).status, 401);
  assert.equal((await open.post({ action: 'enter', via: 'salon-1' }, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await open.post({ action: 'enter', via: 'salon-1' }, { 'X-Rock-Owner-Scope': 'stale' })).status, 409);
  assert.equal((await open.post({ action: 'enter', via: 'salon-1' }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await open.post({ action: 'enter', via: 'salon-1', extra: 1 })).status, 400);
  assert.equal((await open.get('?card=nope')).status, 404);
  assert.equal((await open.get('?card=pkg:missing')).status, 404);
  assert.equal(w.f.sql.prepare('SELECT COUNT(*) n FROM noah_trial_entries').get().n, 0);
  // 運営の画面の 3 つの数え方は、試行の人から引く（接続と依頼の表を、端から読まない）。
  w.f.queries.length = 0;
  await createNoahTrialStore({ db: w.f.db, now: w.f.time }).state();
  for (const query of w.f.queries) assert.doesNotMatch(query, /FROM noah_(connections|asks)\s+(?:[a-z]\s+)?(?:GROUP|ORDER|$)/u, query);
});

const MODULES = { '@/lib/owner-intent': ownerIntent, '@/lib/noah-ready-view': readyView, '@/lib/noah-ask-view': askView, '@/lib/noah-bot-notice': botNotice, '@/lib/noah-form': formLib, '@/lib/noah-surface': surface, 'next/image': { default: 'img' }, 'next/navigation': { usePathname: () => '/noah/ready' } };

void test('the screen: the tag is kept in the tab until sign-in, then sent once; closed sends and keeps nothing', async (t) => {
  const w = await shelved(t);
  await api(w, REVIEWER).post({ action: 'channel', via: 'salon-1', label: 'サロン', wave: 1 });
  const session = { user: null };
  const ui = screen({ fetch: w.browser(session, { env: TRIAL_OPEN, reviewers: [REVIEWER] }), modules: MODULES, now: w.f.time() });
  const before = ui.mount('components/noah-trial-entry.tsx', { via: 'salon-1' });
  await before.flush();
  assert.deepEqual([ui.storage.get('noah-trial-via'), ui.calls.filter((call) => call.method === 'POST').length], ['salon-1', 0]);
  // サインインから戻った画面（札の付かない URL）が、持っていた札で 1 回だけ送る。
  session.user = 'owner-a';
  const after = ui.mount('components/noah-trial-entry.tsx', { via: null });
  await after.flush();
  assert.deepEqual(ui.calls.filter((call) => call.method === 'POST').map((call) => call.body), [{ action: 'enter', via: 'salon-1' }]);
  assert.deepEqual([ui.storage.has('noah-trial-via'), w.f.sql.prepare('SELECT owner_id,via,wave FROM noah_trial_entries').all().map((row) => ({ ...row }))], [false, [{ owner_id: 'owner-a', via: 'salon-1', wave: 1 }]]);
  const again = ui.mount('components/noah-trial-entry.tsx', { via: 'salon-1' });
  await again.flush();
  assert.equal(ui.calls.filter((call) => call.method === 'POST').length, 1);
  // 閉じている間は、札を持ちもしない。
  const shut = screen({ fetch: w.browser({ user: null }, { env: OPEN, reviewers: [] }), modules: MODULES, now: w.f.time() });
  const page = shut.mount('components/noah-trial-entry.tsx', { via: 'salon-1' });
  await page.flush();
  assert.equal(shut.storage.has('noah-trial-via'), false);
});

void test('the screen: the report form under the card detail, and the operator section', async (t) => {
  const w = await shelved(t);
  await api(w, REVIEWER).post({ action: 'channel', via: 'salon-1', label: 'サロン 11/21', wave: 1 });
  await participant(w, 'owner-a', 'salon-1');
  const ui = screen({ fetch: w.browser({ user: 'owner-a' }, { env: TRIAL_OPEN, reviewers: [REVIEWER] }), modules: MODULES, now: w.f.time() });
  const page = ui.mount('components/noah-trial-report.tsx', { packageId: 'pkg:player-lookup' });
  await page.flush();
  assert.ok(page.text().includes('報告は任意です。'));
  assert.equal(page.find('input').length, 1);
  await page.click('出品した');
  assert.equal(page.find('input').length, 3);
  const [sold, net, minutes] = page.find('input');
  await page.change(sold, '2');
  await page.change(net, '5200');
  await page.change(minutes, '70');
  await page.submit(page.find('form')[0]);
  assert.deepEqual(ui.calls.filter((call) => call.method === 'POST').map((call) => call.body), [{ action: 'report', packageId: 'pkg:player-lookup', listed: true, sold: 2, netYen: 5200, minutes: 70 }]);
  assert.ok(page.text().includes('報告しました。いつでも直せます。'));
  assert.ok(page.text().includes('報告を直す'));
  // 入れられない人（成果まで行っていない）で、合計も無い時は、何も出さない。
  const other = screen({ fetch: w.browser({ user: 'owner-b' }, { env: TRIAL_OPEN, reviewers: [] }), modules: MODULES, now: w.f.time() }).mount('components/noah-trial-report.tsx', { packageId: 'pkg:player-lookup' });
  await other.flush();
  assert.equal(other.text(), '');

  const operator = screen({ fetch: w.browser({ user: REVIEWER }, { env: TRIAL_OPEN, reviewers: [REVIEWER] }), modules: MODULES, now: w.f.time() });
  const review = operator.mount('components/noah-trial-review.tsx', { ownerScope: await ownerIntent.ownerScopeFor(REVIEWER) });
  await review.flush();
  const text = review.text();
  for (const part of ['切り替え（リンクからの入口と、本人の報告）：開 ／ 今の段：1', '「接続」を押した人 1 ／ つながった人 1 ／ 成果まで行った人 1 ／ また使った人 0', '人数が足りません（成果まで行った人 1 / 30）', 'salon-1（サロン 11/21・段 1）']) assert.ok(text.includes(part), part);
  // 5 人未満の経路は、数を出さない。
  assert.ok(text.includes('経路ごと（5 人以上の経路だけ）まだありません。'));
  const [viaInput, labelInput] = review.find('input');
  await review.change(viaInput, 'talk-1');
  await review.change(labelInput, '勉強会');
  await review.submit(review.find('form')[0]);
  assert.deepEqual(operator.calls.filter((call) => call.method === 'POST').map((call) => call.body), [{ action: 'channel', via: 'talk-1', label: '勉強会', wave: 1 }]);
  assert.ok(review.text().includes('talk-1（勉強会・段 1）'));
  await review.press(review.find('button', '閉じる')[0]);
  assert.ok(review.text().includes('salon-1（サロン 11/21・段 1） ・閉じました'));
});
