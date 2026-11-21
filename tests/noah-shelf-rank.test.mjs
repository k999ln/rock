// 棚の実績の並びと、見せた記録（task 111）: 実績の数え直し・並び・カードの数・見せた記録・「非表示」・履歴を消す・画面。
// 表は本番と同じ migration。カードは、審査者が実際に動かして確かめた物。実績の数え直しが読む接続と依頼の行は、手で数えられる形で、表に直に書く。
// 仕様: docs/noah/spec-110-shelf.md の 5・6 章、codex/tasks/111-noah-shelf-rank.md の合格条件。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { noahToolSha256 } from '../lib/noah-form.ts';
import { createNoahRecommendationsApi } from '../lib/noah-recommendations.ts';
import { createNoahShelfApi } from '../lib/noah-shelf-api.ts';
import { noahCardScore, parseNoahShelfFlags } from '../lib/noah-shelf.ts';
import { createNoahShelfStore, NOAH_SHELF_EVIDENCE_DAYS } from '../lib/noah-shelf-store.ts';
import * as shelfView from '../lib/noah-shelf-view.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid, OPEN, ORIGIN } from './fixtures/noah/connect-world.mjs';
import { screen } from './fixtures/noah/screen.mjs';

const REVIEWER = 'reviewer-a', DAY = 86_400_000, H = 'a'.repeat(64);
const RANKED = { ...OPEN, NOAH_SHELF_PUBLIC: 'true', NOAH_SHELF_RANK: 'true', NOAH_SHELF_SEEN: 'true' };
const lookup = () => tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', maxLength: 200 } } } });
const shaOf = (d) => noahToolSha256({ name: d.name, description: d.description ?? '', inputSchema: d.inputSchema, readOnly: d.annotations?.readOnlyHint === true });
/** 仕様書 5 章の例の 2 枚（20 人・400 人）と、実績の無い 3 枚。全部が「稼ぐ・仕事を省く」の棚で、領域は別々。 */
const CARDS = [
  { id: 'pkg:good', family: 1, topic: 'office', position: 90 },
  { id: 'pkg:busy', family: 2, topic: 'dev', position: 10 },
  { id: 'pkg:fresh-a', family: 3, topic: 'research', position: 20 },
  { id: 'pkg:fresh-b', family: 4, topic: 'support', position: 30 },
  { id: 'pkg:fresh-c', family: 5, topic: 'office', position: 40 },
];
const pkg = ({ id, family, topic, position }) => ({
  schema: 'noah-package/1', id, shelf: 'earn', topic, title: `カード ${id.slice(4)}`, promise: '名前を渡すと、要点が返ります。', give: '名前', get: '要点', have: ['topic'], want: 'summary',
  steps: [{ ref: { kind: 'family', familyId: familyId(family), tool: 'lookup' }, consumes: ['topic'], produces: 'summary', ownerMinutes: 1 }],
  checks: [{ id: 'has-answer', text: '答えが返っている', judge: 'rule' }], position, status: 'draft', revision: 1,
});
const EV = {
  'pkg:good': { people: 20, connects: 20, connected: 19, asks: 40, succeeded: 36, first_users: 18, returned: 9, median_seconds: 20 },
  'pkg:busy': { people: 400, connects: 400, connected: 380, asks: 4000, succeeded: 1600, first_users: 300, returned: 30, median_seconds: 20 },
};

function shelfApi(w, user, env = RANKED, extra = {}) {
  const handler = createNoahShelfApi({
    db: w.f.db, now: w.f.time, reviewers: [REVIEWER], flags: parseNoahFlags(env), shelfFlags: parseNoahShelfFlags(env), ...extra,
    authenticate: async () => { if (!user) throw Error('UNAUTHORIZED'); return user; },
  });
  const send = async (method, query, body, headers = {}) => {
    const base = method === 'GET' ? {} : { Origin: ORIGIN, 'Content-Type': 'application/json', ...(user ? { 'X-Rock-Owner-Scope': await ownerIntent.ownerScopeFor(user) } : {}) };
    const response = await handler(new Request(`${ORIGIN}/api/noah/shelf${query}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { ...base, ...headers } }));
    return { status: response.status, body: await response.json() };
  };
  return { get: (query = '') => send('GET', query), post: (body, headers) => send('POST', '', body, headers) };
}
const earn = async (api) => (await api.get()).body.shelves.find((shelf) => shelf.id === 'earn').cards;

/** 審査者が、5 つの系列の lookup を動かし、5 枚を棚に載せた世界。 */
async function shelved(t) {
  const definition = lookup();
  const servers = Object.fromEntries(CARDS.map((card) => [hostOf(card.family), mcpServer({ tools: [definition, tool('stats')] })]));
  const w = await world(t, servers, { reviewers: [REVIEWER], env: RANKED });
  const waiting = [], reviewer = w.as(REVIEWER, { waitUntil: (work) => { waiting.push(work); } });
  for (const card of CARDS) {
    assert.equal((await reviewer.connect(familyId(card.family), uuid(card.family))).body.state, 'connected');
    await reviewer.ask({ id: uuid(100 + card.family), connectionId: uuid(card.family), form: { tool: 'lookup', toolSha256: await shaOf(definition), input: { query: 'x' } }, screen: 'narrow' });
    await Promise.all(waiting.splice(0));
  }
  const operator = shelfApi(w, REVIEWER);
  for (const card of CARDS) {
    assert.equal((await operator.post({ action: 'put', package: pkg(card), revision: null })).status, 200);
    assert.equal((await operator.post({ action: 'verify', id: card.id, revision: 1 })).body.listed, true, card.id);
  }
  return w;
}
const putEvidence = (w) => {
  for (const [id, e] of Object.entries(EV)) w.f.sql.prepare(`INSERT INTO noah_package_evidence(package_id,people,connects,connected,asks,succeeded,reviewed,accepted,first_users,returned,median_seconds,since_at,computed_at)
    VALUES(?,?,?,?,?,?,0,0,?,?,?,?,?)`).run(id, e.people, e.connects, e.connected, e.asks, e.succeeded, e.first_users, e.returned, e.median_seconds, 0, w.f.time());
};

let serial = 5000;
function connection(w, owner, family, { connected = true, at = w.f.time() } = {}) {
  const id = uuid(++serial), key = familyId(family);
  w.f.sql.prepare(`INSERT INTO noah_connections(id,owner_id,family_key,agent_id,digest,request_sha256,connect_json,connect_sha256,plan_sha256,place,state,consent_json,price_json,cost_taps,cost_typed,revision,created_at,updated_at,connected_at)
    VALUES(?,?,?,?,?,?,'{}',?,?,'provider',?,'{}','{"model":"free"}',0,0,1,?,?,?)`).run(id, owner, key, key, H, H, H, H, connected ? 'connected' : 'failed', at, at, connected ? at + 100 : null);
  return id;
}
function ask(w, owner, connectionId, at, { state = 'succeeded', name = 'lookup', took = 1000 } = {}) {
  w.f.sql.prepare(`INSERT INTO noah_asks(id,owner_id,connection_id,work_id,request_sha256,mode,host,tool,tool_sha256,state,revision,created_at,updated_at,finished_at)
    VALUES(?,?,?,?,?,'form',?,?,?,?,1,?,?,?)`).run(uuid(++serial), owner, connectionId, `work-${serial}`, H, hostOf(1), name, H, state, at, at, at + took);
}

void test('the tables: the migration is the contract, and both migration folders carry the same file', () => {
  const contract = readFileSync(new URL('../docs/contracts/noah-shelf-v1.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../drizzle/0052_noah_shelf_evidence.sql', import.meta.url), 'utf8');
  assert.equal(migration, readFileSync(new URL('../drizzle-main/0052_noah_shelf_evidence.sql', import.meta.url), 'utf8'));
  const from = (sql) => sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS noah_package_evidence'), sql.indexOf('CHECK(last_at >= first_at)'));
  assert.ok(from(migration).length > 1000);
  assert.equal(from(migration), from(contract));
  assert.doesNotMatch(migration, /noah_package_connections|noah_trial_/);
});

void test('done (111): the two example cards and three without evidence come out in the tested order; closing the switch returns to the operator order', async (t) => {
  const w = await shelved(t);
  putEvidence(w);
  const ranked = await earn(shelfApi(w, null));
  assert.deepEqual(ranked.map((card) => [card.id, card.position, card.why]), [
    ['pkg:good', 1, 'evidence'], ['pkg:fresh-a', 2, 'operator'], ['pkg:fresh-b', 3, 'operator'], ['pkg:fresh-c', 4, 'operator'], ['pkg:busy', 5, 'evidence'],
  ]);
  assert.ok(noahCardScore({ people: 20, connects: 20, connected: 19, asks: 40, succeeded: 36, reviewed: 0, accepted: 0, firstUsers: 18, returned: 9, medianSeconds: 20 }).score > 0.5 ** 4);
  // カードの数: 5 人以上の実績だけ。割合は数えたそのまま。
  assert.deepEqual(ranked.map((card) => card.numbers), [{ resultPercent: 90, againPercent: 50, seconds: 20 }, null, null, null, { resultPercent: 40, againPercent: 10, seconds: 20 }]);
  // 切り替えを閉じると、運営の順。数も出さない。
  const closed = await earn(shelfApi(w, null, { ...RANKED, NOAH_SHELF_RANK: 'false' }));
  assert.deepEqual(closed.map((card) => [card.id, card.why, card.numbers]), [['pkg:busy', 'operator', null], ['pkg:fresh-a', 'operator', null], ['pkg:fresh-b', 'operator', null], ['pkg:fresh-c', 'operator', null], ['pkg:good', 'operator', null]]);
});

void test('the rollup counts the last 90 days by hand: people, connections, finished asks of that tool, first results, returning people, the median; it does not add up twice', async (t) => {
  const w = await shelved(t), store = createNoahShelfStore({ db: w.f.db, now: w.f.time }), at = w.f.time();
  // 系列 3（pkg:fresh-a）。審査者の分（接続 1・成果 1）に、手で足す。
  const c1 = connection(w, 'o1', 3, { at: at - 60_000 }); ask(w, 'o1', c1, at - 30_000); ask(w, 'o1', c1, at - 30_000 + DAY + DAY / 2);
  const c2 = connection(w, 'o2', 3, { at: at - 120_000 }); ask(w, 'o2', c2, at - 31_000);
  const c3 = connection(w, 'o3', 3); ask(w, 'o3', c3, at, { state: 'failed' });
  connection(w, 'o4', 3, { connected: false });
  const c5 = connection(w, 'o5', 3); ask(w, 'o5', c5, at, { name: 'stats' });
  const c6 = connection(w, 'o6', 3, { at: at - (NOAH_SHELF_EVIDENCE_DAYS + 10) * DAY }); ask(w, 'o6', c6, at - (NOAH_SHELF_EVIDENCE_DAYS + 10) * DAY + 5000);
  const running = connection(w, 'o7', 3); w.f.sql.prepare(`INSERT INTO noah_asks(id,owner_id,connection_id,work_id,request_sha256,mode,host,tool,tool_sha256,state,revision,created_at,updated_at)
    VALUES(?,?,?,?,?,'form',?,'lookup',?,'running',1,?,?)`).run(uuid(++serial), 'o7', running, 'work-running', H, hostOf(1), H, at, at);

  const first = await store.rollup();
  assert.equal(first.cards, CARDS.length);
  const row = (id) => ({ ...w.f.sql.prepare('SELECT people,connects,connected,asks,succeeded,reviewed,accepted,first_users,returned,median_seconds FROM noah_package_evidence WHERE package_id=?').get(id) });
  // 審査者の秒数: その接続を作ってから、最初の成果まで。
  const mine = w.f.sql.prepare(`SELECT (a.finished_at - c.created_at) / 1000 AS s FROM noah_asks a JOIN noah_connections c ON c.id = a.connection_id WHERE a.owner_id = ? AND c.family_key = ?`).get(REVIEWER, familyId(3)).s;
  // 人: 審査者・o1・o2・o3・o4・o5・o7（o6 は期間より前）。依頼: 審査者 1・o1 2・o2 1・o3 1（o5 は別の道具、o7 は終わっていない）。
  // 秒数: o1 = 30、o2 = 89（31 秒前に終わる依頼の、1 秒後に終わる）。中央値は、3 人の真ん中。
  const seconds = [mine, 31, 90].sort((a, b) => a - b);
  assert.deepEqual(row('pkg:fresh-a'), { people: 7, connects: 7, connected: 6, asks: 5, succeeded: 4, reviewed: 0, accepted: 0, first_users: 3, returned: 1, median_seconds: seconds[1] });
  // 他の系列のカードは、審査者の分だけ。
  assert.deepEqual([row('pkg:good').people, row('pkg:good').asks, row('pkg:good').succeeded, row('pkg:good').first_users], [1, 1, 1, 1]);
  // もう 1 回流しても、足し込まない。同じ日の合図では、流さない。次の日は流す。
  await store.rollup();
  assert.deepEqual(row('pkg:fresh-a').people, 7);
  assert.equal(await store.rollupIfDue(), null);
  w.f.advance(DAY);
  assert.notEqual(await store.rollupIfDue(), null);
  // 本人の ID は、集計の表に無い。
  assert.doesNotMatch(JSON.stringify(w.f.sql.prepare('SELECT * FROM noah_package_evidence').all()), /o1|reviewer/);
});

void test('done (111): seen records only for people who agreed to history; ten views by someone who did not leave no row; hiding works for anyone; forgetting keeps only the hidden mark', async (t) => {
  const w = await shelved(t);
  w.f.sql.prepare("INSERT INTO noah_recommendation_settings(owner_id,revision,history_enabled,history_since,runtime,updated_at) VALUES('owner-c',1,1,0,'any',?)").run(w.f.time());
  const seenRows = (owner) => w.f.sql.prepare('SELECT package_id,shown,opened,hidden FROM noah_shelf_seen WHERE owner_id=? ORDER BY package_id').all(owner).map((row) => ({ ...row }));
  const daily = () => w.f.sql.prepare('SELECT package_id,band,shown,opened FROM noah_shelf_daily ORDER BY package_id,band').all().map((row) => ({ ...row }));

  for (let n = 0; n < 10; n++) await shelfApi(w, 'owner-n').get();
  assert.deepEqual(seenRows('owner-n'), []);
  // 全員を合わせた数は、日・カード・位置の区分ごと（運営の順の 1〜3 が top、4〜5 が mid）。
  assert.deepEqual(daily().map((row) => [row.package_id, row.band, row.shown]), [['pkg:busy', 'top', 10], ['pkg:fresh-a', 'top', 10], ['pkg:fresh-b', 'top', 10], ['pkg:fresh-c', 'mid', 10], ['pkg:good', 'mid', 10]]);
  await shelfApi(w, 'owner-c').get();
  assert.deepEqual(seenRows('owner-c').map((row) => [row.package_id, row.shown]), CARDS.map((card) => card.id).sort().map((id) => [id, 1]));
  // 詳細を開いた（未サインインも数える。位置の区分で）。
  assert.deepEqual((await shelfApi(w, null).post({ action: 'opened', id: 'pkg:fresh-a', pos: 2 })).body, { recorded: true });
  await shelfApi(w, 'owner-c').post({ action: 'opened', id: 'pkg:good', pos: 5 });
  assert.equal(daily().find((row) => row.package_id === 'pkg:fresh-a').opened, 1);
  assert.equal(seenRows('owner-c').find((row) => row.package_id === 'pkg:good').opened, 1);
  assert.equal((await shelfApi(w, null).post({ action: 'opened', id: 'pkg:good', pos: 0 })).status, 400);
  assert.equal((await shelfApi(w, null).post({ action: 'opened', id: 'pkg:missing', pos: 1 })).status, 200);
  assert.equal(daily().some((row) => row.package_id === 'pkg:missing'), false);
  // 切り替えが閉の間は、何も数えない。
  const before = JSON.stringify(daily());
  await shelfApi(w, 'owner-c', { ...RANKED, NOAH_SHELF_SEEN: 'false' }).get();
  assert.deepEqual((await shelfApi(w, null, { ...RANKED, NOAH_SHELF_SEEN: 'false' }).post({ action: 'opened', id: 'pkg:good', pos: 5 })).body, { recorded: false });
  assert.equal(JSON.stringify(daily()), before);

  // 「非表示」: 同意していない本人でも受け付け、その本人の棚から外れる（並びの切り替えが閉でも）。
  assert.equal((await shelfApi(w, null).post({ action: 'hide', id: 'pkg:busy', hidden: true })).status, 401);
  assert.equal((await shelfApi(w, 'owner-n').post({ action: 'hide', id: 'pkg:busy', hidden: true })).status, 200);
  assert.deepEqual(seenRows('owner-n'), [{ package_id: 'pkg:busy', shown: 0, opened: 0, hidden: 1 }]);
  assert.ok(!(await earn(shelfApi(w, 'owner-n', { ...RANKED, NOAH_SHELF_RANK: 'false' }))).some((card) => card.id === 'pkg:busy'));
  assert.ok((await earn(shelfApi(w, 'owner-c'))).some((card) => card.id === 'pkg:busy'));
  assert.equal((await shelfApi(w, 'owner-n').post({ action: 'hide', id: 'pkg:missing', hidden: true })).status, 404);

  // 履歴を消す（PUT /api/noah/recommendations）: 見た記録は消え、「非表示」だけが残る（回数は 0）。
  await shelfApi(w, 'owner-c').post({ action: 'hide', id: 'pkg:fresh-b', hidden: true });
  const settings = createNoahRecommendationsApi({ db: w.f.db, authenticate: async () => 'owner-c', clock: w.f.time });
  const reply = await settings.put(new Request(`${ORIGIN}/api/noah/recommendations`, { method: 'PUT', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerIntent.ownerScopeFor('owner-c') }, body: JSON.stringify({ revision: 1, historyEnabled: true, runtime: 'any', clearHistory: true }) }));
  assert.equal(reply.status, 200);
  assert.deepEqual(seenRows('owner-c'), [{ package_id: 'pkg:fresh-b', shown: 0, opened: 0, hidden: 1 }]);
  assert.deepEqual(seenRows('owner-n'), [{ package_id: 'pkg:busy', shown: 0, opened: 0, hidden: 1 }]);
});

void test('the screen: numbers on the card, a hide button for signed-in people, and the detail counts one open', async (t) => {
  const w = await shelved(t);
  putEvidence(w);
  const MODULES = { '@/lib/noah-shelf-view': shelfView, '@/lib/owner-intent': ownerIntent };
  const ui = screen({ fetch: w.browser({ user: 'owner-a' }, { env: RANKED, reviewers: [REVIEWER] }), modules: MODULES, now: w.f.time() });
  const page = ui.mount('components/noah-shelf.tsx');
  await page.flush();
  const [top] = page.find('article');
  assert.ok(page.text(top).includes('成果が返った割合 90%・また使った人 50%・最初の成果まで 約 20 秒'), page.text(top));
  assert.equal(page.find('article').filter((node) => page.text(node).includes('まだ数字はありません')).length, 3);
  await page.press(page.find('button', '表示しない')[0]);
  assert.deepEqual(ui.calls.filter((call) => call.method === 'POST').map((call) => call.body), [{ action: 'hide', id: 'pkg:good', hidden: true }]);
  assert.equal(page.find('article').length, 4);
  // 未サインインには「表示しない」が無い。
  const anon = screen({ fetch: w.browser({ user: null }, { env: RANKED, reviewers: [] }), modules: MODULES, now: w.f.time() }).mount('components/noah-shelf.tsx');
  await anon.flush();
  assert.equal(anon.find('button').length, 0);
  // 詳細を開いた時、1 回だけ数える。
  const opened = screen({ fetch: w.browser({ user: null }, { env: RANKED, reviewers: [] }), modules: MODULES, now: w.f.time() });
  const marker = opened.mount('components/noah-shelf-opened.tsx', { from: 'pkg:fresh-a', pos: 2 });
  await marker.flush();
  marker.render();
  await marker.flush();
  assert.deepEqual(opened.calls.map((call) => [call.method, call.body]), [['POST', { action: 'opened', id: 'pkg:fresh-a', pos: 2 }]]);
  assert.equal(w.f.sql.prepare("SELECT opened FROM noah_shelf_daily WHERE package_id='pkg:fresh-a'").get().opened, 1);
});
