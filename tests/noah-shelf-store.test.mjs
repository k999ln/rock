// 棚の保存と入口（task 110）: カードを置く・運営が動かして確かめる・外す・棚の一覧・載せるかの見直し・巡回の合図・画面。
// 世界は、台帳・合成の接続先・本番と同じ migration の表（tests/fixtures/noah/connect-world.mjs）。棚に載るのは、握手が通り、審査者が実際に動かして成果が返った系列だけ。
// 仕様: docs/noah/spec-110-shelf.md の 4 章・10 章・13 章（完了の定義）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createIntakeTick } from '../lib/noah-intake-api.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { noahToolSha256 } from '../lib/noah-form.ts';
import { noahWakeSignature } from '../lib/noah-intake-wake.ts';
import { createNoahShelfApi } from '../lib/noah-shelf-api.ts';
import { parseNoahShelfFlags } from '../lib/noah-shelf.ts';
import { createNoahShelfStore, NOAH_SHELF_PROBE_MS, NOAH_SHELF_RECHECK_MS } from '../lib/noah-shelf-store.ts';
import * as shelfView from '../lib/noah-shelf-view.ts';
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
const SHELF_OPEN = { ...OPEN, NOAH_SHELF_PUBLIC: 'true' };
const HOUR = 3_600_000;
const lookup = (extra = {}) => tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', maxLength: 200 } } }, ...extra });
const shaOf = (definition) => noahToolSha256({ name: definition.name, description: definition.description ?? '', inputSchema: definition.inputSchema, readOnly: definition.annotations?.readOnlyHint === true });
/** 相手のサーバーの道具 1 つのカード（Agent 1 の lookup）。 */
const card = (change = {}) => ({
  schema: 'noah-package/1', id: 'pkg:player-lookup', shelf: 'earn', topic: 'research', title: '選手を調べる', promise: '選手の名前を渡すと、記録の要点が返ります。',
  give: '選手の名前', get: '記録の要点', have: ['topic'], want: 'summary',
  steps: [{ ref: { kind: 'family', familyId: familyId(1), tool: 'lookup' }, consumes: ['topic'], produces: 'summary', ownerMinutes: 1 }],
  checks: [{ id: 'has-answer', text: '答えが返っている', judge: 'rule' }], position: 10, status: 'draft', revision: 1, ...change,
});

/** 棚の入口を、その人として呼ぶ（user が null なら未サインイン）。 */
function shelfApi(w, user, env = SHELF_OPEN) {
  const handler = createNoahShelfApi({
    db: w.f.db, now: w.f.time, reviewers: [REVIEWER], flags: parseNoahFlags(env), shelfFlags: parseNoahShelfFlags(env),
    authenticate: async () => { if (!user) throw Error('UNAUTHORIZED'); return user; },
  });
  const send = async (method, path, body, headers = {}) => {
    const base = method === 'GET' ? {} : { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': user ? await ownerIntent.ownerScopeFor(user) : '' };
    const response = await handler(new Request(ORIGIN + path, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), headers: { ...base, ...headers } }));
    return { status: response.status, body: await response.json() };
  };
  return { get: (query = '') => send('GET', `/api/noah/shelf${query}`), post: (body, headers) => send('POST', '/api/noah/shelf', body, headers) };
}
const earn = async (api) => (await api.get()).body.shelves.find((shelf) => shelf.id === 'earn').cards;
const stateOf = async (w, id = 'pkg:player-lookup') => (await shelfApi(w, REVIEWER).get('?state=1')).body.cards.find((row) => row.id === id);

/** 審査者が Agent 1 へつなぎ、lookup を 1 回動かして成果が返った世界。 */
async function ran(t, options = {}) {
  const definition = options.definition ?? lookup();
  const server = mcpServer({ tools: [definition, tool('stats')], call: (params) => ({ content: [{ type: 'text', text: `found ${params.arguments.query ?? ''}` }] }) });
  const w = await world(t, { [hostOf(1)]: server }, { reviewers: [REVIEWER], env: SHELF_OPEN });
  // 依頼は 202 で受け付け、応答の後の仕事（waitUntil）で動く。試験では、その仕事が終わるのを待つ。
  const waiting = [];
  const reviewer = w.as(REVIEWER, { waitUntil: (work) => { waiting.push(work); } });
  assert.equal((await reviewer.connect(familyId(1), uuid(1))).body.state, 'connected');
  const ask = async (n, def = definition, input = { query: `p${n}` }) => {
    const reply = await reviewer.ask({ id: uuid(100 + n), connectionId: uuid(1), form: { tool: def.name, toolSha256: await shaOf(def), input }, screen: 'narrow' });
    assert.equal(reply.status, 202, JSON.stringify(reply.body));
    await Promise.all(waiting.splice(0));
    assert.equal(w.asked('id=?', uuid(100 + n))[0].state, 'succeeded');
  };
  if (options.ask !== false) await ask(1);
  w.clear();
  return { w, server, reviewer, ask, definition };
}
/** カードを置いて、確かめて、巡回の合図と同じ見直しを 1 回（載せたカードの系列の次の握手が、24 時間以内になる）。 */
async function shelved(w) {
  const reviewer = shelfApi(w, REVIEWER);
  assert.equal((await reviewer.post({ action: 'put', package: card(), revision: null })).status, 200);
  assert.equal((await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 1 })).body.listed, true);
  await createNoahShelfStore({ db: w.f.db, now: w.f.time }).recheck();
  return reviewer;
}
/** 巡回の握手を 1 回（同じ接続先へは 1 時間に 1 回なので、時計を進めてから）。 */
const patrolAfter = async (w, ms) => { w.f.advance(ms); return w.patrol(); };

void test('the table: the migration is the contract, and both migration folders carry the same file', () => {
  const contract = readFileSync(new URL('../docs/contracts/noah-shelf-v1.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../drizzle/0050_noah_shelf.sql', import.meta.url), 'utf8');
  assert.equal(migration, readFileSync(new URL('../drizzle-main/0050_noah_shelf.sql', import.meta.url), 'utf8'));
  const body = (sql) => sql.split('\n').filter((line) => !line.startsWith('--') && line.trim() !== '' && !line.startsWith('--> statement-breakpoint')).join('\n');
  // 表 2 つと索引 2 つが、DDL 案の文と同じ（説明の行を除く）。
  for (const name of ['noah_packages', 'noah_package_steps']) {
    const pick = (sql) => new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n\\);`).exec(body(sql))?.[0];
    assert.ok(pick(migration));
    assert.equal(pick(migration), pick(contract));
  }
  for (const line of ['CREATE INDEX IF NOT EXISTS noah_packages_shelf ON noah_packages(shelf, position, id) WHERE listed = 1;', 'CREATE INDEX IF NOT EXISTS noah_package_steps_ref ON noah_package_steps(kind, ref);']) {
    assert.ok(migration.includes(line) && contract.includes(line), line);
  }
  // 実績・見せた記録・つなげる数・試行の表は、この task では足さない。
  assert.doesNotMatch(body(migration), /noah_package_evidence|noah_shelf_daily|noah_shelf_seen|noah_package_connections|noah_trial_/);
});

void test('done (13): the reviewer runs the tool, puts the card, verifies it, and it is on the shelf; the card opens that tool', async (t) => {
  const { w } = await ran(t);
  assert.equal(w.family(1).level, 2);
  const reviewer = shelfApi(w, REVIEWER), anyone = shelfApi(w, null);

  const placed = await reviewer.post({ action: 'put', package: card(), revision: null });
  assert.deepEqual([placed.status, placed.body.status, placed.body.listed, placed.body.reasonText, placed.body.revision], [200, 'draft', false, 'まだ動かして確かめていません', 1]);
  // 下書きは、棚に出ない。工程の行は、カードの行と一緒に入る。
  assert.deepEqual(await earn(anyone), []);
  assert.deepEqual(w.f.sql.prepare('SELECT package_id,step,kind,ref,tool FROM noah_package_steps').all().map((row) => ({ ...row })), [{ package_id: 'pkg:player-lookup', step: 0, kind: 'family', ref: familyId(1), tool: 'lookup' }]);

  const verified = await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 1 });
  assert.deepEqual([verified.status, verified.body.status, verified.body.listed, verified.body.revision], [200, 'verified', true, 2]);
  const [shown] = await earn(anyone);
  assert.deepEqual(
    [shown.id, shown.title, shown.topicLabel, shown.runs, shown.ownerSteps, shown.ownerMinutes, shown.why, shown.position, shown.target],
    ['pkg:player-lookup', '選手を調べる', '調査', ['provider'], 0, 1, 'operator', 1, `/noah/ready/agent?id=${encodeURIComponent(familyId(1))}&tool=lookup&from=pkg%3Aplayer-lookup&pos=1`],
  );
  // 応答に、本人の ID・依頼の中身・接続先の URL は無い。
  assert.doesNotMatch(JSON.stringify(await anyone.get()), new RegExp(`${REVIEWER}|p1|${hostOf(1)}`));
  // 確かめた時の中身は、サーバーが今の事実から作った物（その系列の道具の一覧の hash と、動かした回数）。
  const row = await stateOf(w);
  assert.deepEqual([row.listed, row.runs, row.package.verified.fingerprints], [true, 1, [w.check(1).tools_sha256]]);
  assert.match(row.package.verified.fingerprints[0], /^[0-9a-f]{64}$/);
});

void test('done (13): stop the provider and it leaves the shelf after the second failed handshake; back and run again, it returns', async (t) => {
  const { w, server, ask } = await ran(t);
  await shelved(w);
  const anyone = shelfApi(w, null);
  assert.equal((await earn(anyone)).length, 1);

  server.options.status = 503;
  assert.equal(await patrolAfter(w, 25 * HOUR), 1);
  // 1 回の失敗では外さない（level が変わらない）。
  assert.equal((await earn(anyone)).length, 1);
  assert.equal(await patrolAfter(w, 7 * HOUR), 1);
  assert.deepEqual(await earn(anyone), []);
  const gone = await stateOf(w);
  assert.deepEqual([gone.listed, gone.reason, gone.reasonStep, gone.reasonText], [false, 'step_not_running', 0, '工程の先が、今は動きません']);

  // 戻っても、握手が通っただけ（L1）では出さない。人が動かして成果が返ると（L2）、道具が同じなので、確かめ直さずに戻る。
  server.options.status = undefined;
  assert.equal(await patrolAfter(w, 49 * HOUR), 1);
  assert.equal(w.family(1).level, 1);
  assert.deepEqual(await earn(anyone), []);
  await ask(2);
  assert.equal((await earn(anyone)).length, 1);
});

void test('done (13): change the tool definitions and the next handshake takes it off, with the reason the operator reads', async (t) => {
  const { w, server, ask } = await ran(t);
  const reviewer = await shelved(w), anyone = shelfApi(w, null);

  const changed = lookup({ description: 'Looks up a player, now with teams.' });
  server.state.tools = [changed, tool('stats')];
  assert.equal(await patrolAfter(w, 25 * HOUR), 1);
  assert.equal(w.family(1).level, 2);
  assert.deepEqual(await earn(anyone), []);
  const row = await stateOf(w);
  assert.deepEqual([row.reason, row.reasonText], ['step_changed', '確かめた時から、中身が変わりました。もう一度動かしてください']);

  // 動かし直すまでは、確かめ直せない（動かした後に、巡回が道具の一覧を読み直したため）。動かし直すと、確かめられて、戻る。
  const early = await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: row.revision });
  assert.equal(early.status, 409);
  assert.match(early.body.error, /もう一度動かしてから/);
  await ask(3, changed);
  const again = await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: row.revision });
  assert.deepEqual([again.status, again.body.listed], [200, true]);
  assert.equal((await earn(anyone)).length, 1);
});

void test('done (13): only reviewers write; the lure words are refused; the shelf is closed to everyone else until the switch opens', async (t) => {
  const { w } = await ran(t);
  const reviewer = shelfApi(w, REVIEWER);
  // 審査者でない本人の POST は 403。未サインインの POST は 401。
  assert.equal((await shelfApi(w, 'owner-b').post({ action: 'put', package: card(), revision: null })).status, 403);
  assert.equal((await shelfApi(w, null).post({ action: 'put', package: card(), revision: null })).status, 401);
  // カードの文に「稼げます」と書いた put は 400。何も書かない。
  const lured = await reviewer.post({ action: 'put', package: card({ promise: '毎日これで稼げます。' }), revision: null });
  assert.equal(lured.status, 400);
  assert.match(lured.body.error, /「稼げ」/);
  assert.equal(w.f.sql.prepare('SELECT COUNT(*) n FROM noah_packages').get().n, 0);
  // 同じ Origin・account の印・JSON の検査（ほかの Noah の入口と同じ）。
  assert.equal((await reviewer.post({ action: 'put', package: card(), revision: null }, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await reviewer.post({ action: 'put', package: card(), revision: null }, { 'X-Rock-Owner-Scope': 'stale' })).status, 409);
  assert.equal((await reviewer.post({ action: 'put', package: card(), revision: null }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await reviewer.post({ action: 'put', package: card(), revision: null, extra: 1 })).status, 400);
  assert.equal((await reviewer.post({ action: 'put', package: card(), revision: null })).status, 200);
  // 版が古い書き込みは 409（2 人の審査者が同時に押しても、片方だけ）。同じ ID の新しいカードも 409。
  assert.equal((await reviewer.post({ action: 'put', package: card(), revision: null })).status, 409);
  assert.equal((await reviewer.post({ action: 'retire', id: 'pkg:player-lookup', revision: 7 })).status, 409);

  // 切り替えが閉じている間は、審査者でなければ 404（一覧・運営の画面とも）。審査者は使える。
  const closed = { ...OPEN };
  assert.equal((await shelfApi(w, null, closed).get()).status, 404);
  assert.equal((await shelfApi(w, 'owner-b', closed).get()).status, 404);
  assert.equal((await shelfApi(w, REVIEWER, closed).get()).status, 200);
  // 押した先（取り込んだ Agent の詳細）が閉じている時も、棚を出さない。
  assert.equal((await shelfApi(w, null, { NOAH_SHELF_PUBLIC: 'true' }).get()).status, 404);
  // 運営の画面は、審査者だけ。
  assert.equal((await shelfApi(w, 'owner-b').get('?state=1')).status, 404);
  assert.deepEqual((await shelfApi(w, REVIEWER, { ...SHELF_OPEN, NOAH_SHELF_RANK: 'yes' }).get('?state=1')).body.warnings, ['NOAH_SHELF_RANK は true か false です。閉じた物として扱います。']);
});

void test('verify reads only the reviewer\'s own recent successful runs of that tool, and builds the record itself', async (t) => {
  const { w, ask } = await ran(t, { ask: false });
  const reviewer = shelfApi(w, REVIEWER);
  await reviewer.post({ action: 'put', package: card(), revision: null });
  // まだ誰も動かしていない（L1）。
  let reply = await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 1 });
  assert.deepEqual([reply.status, /人が動かした記録がありません/.test(reply.body.error)], [409, true]);

  // 別の人が動かして L2 になっても、審査者自身の記録が無ければ通さない。
  const waiting = [];
  const other = w.as('owner-b', { waitUntil: (work) => { waiting.push(work); } });
  await other.connect(familyId(1), uuid(2));
  const definition = lookup();
  assert.equal((await other.ask({ id: uuid(200), connectionId: uuid(2), form: { tool: 'lookup', toolSha256: await shaOf(definition), input: { query: 'x' } }, screen: 'narrow' })).status, 202);
  await Promise.all(waiting.splice(0));
  assert.equal(w.family(1).level, 2);
  reply = await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 1 });
  assert.deepEqual([reply.status, /あなたが直近 7 日に動かして/.test(reply.body.error)], [409, true]);

  // 別の道具を動かしても、通さない。
  await ask(1, tool('stats'), {});
  assert.equal((await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 1 })).status, 409);

  // 審査者自身が lookup を動かすと通る。8 日たつと、もう確かめられない。
  await ask(2);
  w.f.advance(8 * 24 * HOUR);
  assert.equal((await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 1 })).status, 409);
  w.f.advance(-8 * 24 * HOUR);
  reply = await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 1 });
  assert.deepEqual([reply.status, reply.body.listed], [200, true]);
  // 審査者が入れた verified・review は使わない（put は、いつも下書きに戻す）。
  const forged = await reviewer.post({ action: 'put', package: card({ status: 'verified', verified: { at: 1, runs: 99, fingerprints: ['b'.repeat(64)] }, review: { expertAt: 1 } }), revision: 2 });
  assert.deepEqual([forged.status, forged.body.status, forged.body.listed], [200, 'draft', false]);
  const row = await stateOf(w);
  assert.deepEqual([row.status, row.verifiedAt, row.reviewAt], ['draft', null, null]);
});

void test('cards outside the launch scope are kept with a reason: home and chained cards, gaps, health advice without the expert check, retired', async (t) => {
  const { w } = await ran(t);
  const reviewer = shelfApi(w, REVIEWER);
  const seed = JSON.parse(readFileSync(new URL('./fixtures/noah/shelf-seed.json', import.meta.url), 'utf8')).packages;
  for (const pkg of seed) assert.equal((await reviewer.post({ action: 'put', package: pkg, revision: null })).status, 200, pkg.id);
  const state = (await reviewer.get('?state=1')).body.cards;
  assert.equal(state.length, seed.length);
  assert.ok(state.every((row) => row.status === 'draft' && !row.listed && row.reason === 'draft'));
  // 家の端末のカードは、ローンチの範囲では確かめられない。
  const home = state.find((row) => row.id === 'pkg:bug-fix');
  const refused = await reviewer.post({ action: 'verify', id: home.id, revision: home.revision });
  assert.deepEqual([refused.status, /まだ確かめられません/.test(refused.body.error)], [409, true]);
  // 助言のカードにだけ、専門家に確かめた日を記録できる。未来の日は拒む。
  const health = state.find((row) => row.id === 'pkg:health-notes');
  assert.equal((await reviewer.post({ action: 'review', id: home.id, revision: home.revision, expertAt: w.f.time() - 1 })).status, 400);
  assert.equal((await reviewer.post({ action: 'review', id: health.id, revision: health.revision, expertAt: w.f.time() + 1 })).status, 400);
  const reviewed = await reviewer.post({ action: 'review', id: health.id, revision: health.revision, expertAt: w.f.time() - 1 });
  assert.deepEqual([reviewed.status, reviewed.body.revision], [200, health.revision + 1]);
  assert.equal((await stateOf(w, health.id)).reviewAt, w.f.time() - 1);

  // 外すと棚から消え、行は残る（確かめた記録は、確かめた状態の時だけ置く）。置き直すと、下書きから。
  await reviewer.post({ action: 'put', package: card(), revision: null });
  await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 1 });
  const retired = await reviewer.post({ action: 'retire', id: 'pkg:player-lookup', revision: 2 });
  assert.deepEqual([retired.status, retired.body.reasonText], [200, '外しました']);
  assert.deepEqual(await earn(shelfApi(w, null)), []);
  const row = await stateOf(w);
  assert.deepEqual([row.status, row.runs, row.verifiedAt, row.reason], ['retired', null, null, 'retired']);
  assert.equal((await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 3 })).status, 409);
});

void test('the recheck copies the live decision into the table, pulls the next handshake to 24 hours, and runs from the patrol tick at most every 10 minutes', async (t) => {
  const { w, server } = await ran(t);
  const reviewer = shelfApi(w, REVIEWER), store = createNoahShelfStore({ db: w.f.db, now: w.f.time });
  await reviewer.post({ action: 'put', package: card(), revision: null });
  await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 1 });
  const copy = () => ({ ...w.f.sql.prepare('SELECT listed,reason,reason_step,revision,checked_at FROM noah_packages').get() });
  assert.deepEqual([copy().listed, copy().reason, copy().revision], [1, null, 2]);

  // 次の握手を、遠くへ置いた系列（つないでいる人がいない時は 72 時間）。載っているカードが使うので、24 時間以内へ早める。
  w.f.sql.prepare('UPDATE noah_intake_checks SET next_check_at=checked_at+? WHERE candidate_id=?').run(72 * HOUR, familyId(1));
  const first = await store.recheck();
  assert.deepEqual([first.checked, first.changed, first.probesPulled], [1, 0, 1]);
  const check = w.check(1);
  assert.equal(check.next_check_at, check.checked_at + NOAH_SHELF_PROBE_MS);
  assert.deepEqual([copy().revision, copy().checked_at], [2, w.f.time()]);
  assert.equal((await store.recheck()).probesPulled, 0);

  // 相手が止まり、2 回目の握手の後: 写しが変わり（版が 1 つ進む）、引き寄せる系列は無くなる。
  server.options.status = 503;
  await patrolAfter(w, 25 * HOUR);
  await patrolAfter(w, 7 * HOUR);
  const second = await store.recheck();
  assert.deepEqual([second.changed, copy().listed, copy().reason, copy().reason_step, copy().revision], [1, 0, 'step_not_running', 0, 3]);

  // 巡回の合図: 前の見直しから 10 分たっていなければ、何もしない。見直しが失敗しても、合図の結果は変えない。
  const key = 'synthetic-wake-test-only-'.repeat(2), calls = [];
  const tick = async (shelfRecheck) => {
    const run = createIntakeTick({ ...w.f.deps, flags: parseNoahFlags({ NOAH_PATROL_ENABLED: 'true' }), reviewers: [], authenticate: async () => { throw Error('UNAUTHORIZED'); }, wakeKey: key, shelfRecheck });
    const timestamp = String(w.f.time());
    const response = await run(new Request('https://noah.test/api/noah/intake/tick', { method: 'POST', body: '{}', headers: { 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(key, timestamp) } }));
    return [response.status, Object.keys(await response.json()).sort()];
  };
  t.mock.method(console, 'info', () => undefined);
  const quiet = await tick(async () => { calls.push(await store.recheckIfDue()); });
  // 前の見直し（上の recheck）から 10 分たっていないので、何もしない。
  assert.deepEqual(calls, [null]);
  w.f.advance(NOAH_SHELF_RECHECK_MS);
  await tick(async () => { calls.push(await store.recheckIfDue()); });
  assert.equal(calls[1].checked, 1);
  // 見直しが失敗しても（棚の表がまだ無い、など）、合図の結果は変えない。
  const broken = await tick(async () => { throw Error('no such table: noah_packages'); });
  assert.deepEqual(broken, quiet);
});

const MODULES = { '@/lib/owner-intent': ownerIntent, '@/lib/noah-ready-view': readyView, '@/lib/noah-ask-view': askView, '@/lib/noah-bot-notice': botNotice, '@/lib/noah-form': formLib, '@/lib/noah-surface': surface, '@/lib/noah-shelf-view': shelfView, 'next/image': { default: 'img' }, 'next/navigation': { usePathname: () => '/noah/ready' } };
const browse = (w, user, env = SHELF_OPEN) => screen({ fetch: w.browser({ user }, { env, reviewers: [REVIEWER] }), modules: MODULES, now: w.f.time() });

void test('the screen: the shelf sits on top of the ready list, one main button per card, hidden while searching; closed or empty shows nothing', async (t) => {
  const { w } = await ran(t);
  const reviewer = shelfApi(w, REVIEWER);
  await reviewer.post({ action: 'put', package: card({ priceHint: { offerId: 'research-brief', floorYen: 3000 } }), revision: null });

  // 載るカードが無い時は、棚を出さない（下の一覧は、今のまま）。
  const empty = browse(w, null).mount('components/noah-shelf.tsx');
  await empty.flush();
  assert.equal(empty.text(), '');

  await reviewer.post({ action: 'verify', id: 'pkg:player-lookup', revision: 1 });
  const ui = browse(w, null), page = ui.mount('components/noah-shelf.tsx');
  await page.flush();
  assert.deepEqual(ui.calls.map((call) => call.url), ['/api/noah/shelf']);
  const [article] = page.find('article');
  const text = page.text(article);
  for (const part of ['選手を調べる', '調査', '選手の名前を渡すと、記録の要点が返ります。', '渡す物選手の名前', '受け取る物記録の要点', '相手のサーバー', 'あなたがやる事 0・約 1 分', 'まだ数字はありません', '先に売った人の最低額: 3,000 円（約束ではありません）', 'Noah の説明', '使う']) assert.ok(text.includes(part), part);
  assert.ok(page.text().includes('稼ぐ・仕事を省く'));
  // 押す所は、名前と「使う」の 2 つで、行き先は同じ（その道具を開く）。ボタンは無い。
  const links = page.nodes(article).filter((node) => node.type === 'a');
  assert.deepEqual(links.map((node) => node.props.href), Array(2).fill(`/noah/ready/agent?id=${encodeURIComponent(familyId(1))}&tool=lookup&from=pkg%3Aplayer-lookup&pos=1`));
  assert.equal(page.find('button').length, 0);

  // 一覧の一番上に出て、探している間は出さない。
  const shelf = { type: 'section', props: { children: '棚の段' }, key: null };
  const list = browse(w, null).mount('components/noah-ready.tsx', { shelf });
  await list.flush();
  assert.ok(list.text().indexOf('棚の段') >= 0 && list.text().indexOf('棚の段') < list.text().indexOf(readyView.NOAH_READY_TEXT.ran));
  await list.type('Agent 1');
  await list.tick(300);
  await list.flush();
  assert.ok(!list.text().includes('棚の段'));

  // 閉じている（404）・読めない（503）時は、何も出さない。
  const closed = browse(w, null, OPEN).mount('components/noah-shelf.tsx');
  await closed.flush();
  assert.equal(closed.text(), '');
  const down = screen({ fetch: async () => ({ status: 503, body: { error: '棚を確認できません。' } }), modules: MODULES }).mount('components/noah-shelf.tsx');
  await down.flush();
  assert.equal(down.text(), '');
});

void test('the screen: a card opens the detail with its tool already chosen; an unknown tool falls back to the list', async (t) => {
  const { w } = await ran(t);
  const open = async (tool) => {
    // 利用者の操作から始める握手は、接続先ごとに 60 秒の枠がある。前の依頼の分を空けてから開く。
    w.f.advance(61_000);
    const page = browse(w, REVIEWER).mount('components/noah-ready-detail.tsx', { id: familyId(1), tool });
    await page.flush();
    return page;
  };
  // 使える道具が 2 つある接続でも、カードの道具の入力欄が、最初から開いている。
  const chosen = await open('lookup');
  assert.equal(chosen.find('form').length, 1);
  assert.ok(chosen.find('button').some(node => node.props['data-tool-name'] === 'lookup' && node.props['aria-pressed'] === true));
  const formText = chosen.text(chosen.find('form')[0]);
  assert.ok(chosen.text().includes('情報を検索'), chosen.text());
  assert.ok(formText.startsWith('検索する内容'), formText);
  assert.ok(formText.includes('提供者の説明lookup'), formText);
  assert.ok(formText.indexOf(askView.NOAH_ASK_TEXT.submit) >= 0 &&
    formText.indexOf(askView.NOAH_ASK_TEXT.submit) < formText.indexOf('提供者の説明lookup'), formText);
  // 無い道具の名前なら、いつもの一覧から選ぶ。
  const fallback = await open('missing');
  assert.equal(fallback.find('form').length, 0);
  assert.ok(fallback.text().includes(askView.NOAH_ASK_TEXT.pick));
});

void test('the operator screen: state, reasons in words, verify and retire with the revision and owner scope; non-reviewers see nothing', async (t) => {
  const { w } = await ran(t);
  await shelfApi(w, REVIEWER).post({ action: 'put', package: card(), revision: null });
  const ui = browse(w, REVIEWER), scope = await ownerIntent.ownerScopeFor(REVIEWER);
  const page = ui.mount('components/noah-shelf-review.tsx', { ownerScope: scope });
  await page.flush();
  assert.ok(page.text().includes('選手を調べる'));
  assert.ok(page.text().includes('稼ぐ・仕事を省く · 下書き · まだ動かして確かめていません'));
  assert.ok(page.text().includes('棚に出ている数：0 ／ カード 1 枚'));

  await page.click('確かめた');
  const sent = ui.calls.filter((call) => call.method === 'POST');
  assert.deepEqual(sent.map((call) => [call.body, call.headers['X-Rock-Owner-Scope']]), [[{ action: 'verify', id: 'pkg:player-lookup', revision: 1 }, scope]]);
  assert.ok(page.text().includes('確かめました。棚に出ています。'));
  assert.ok(page.text().includes('稼ぐ・仕事を省く · 確かめた · 棚に出ています'));
  assert.ok(page.text().includes('成果が返った依頼 1 件'));

  await page.click('外す');
  assert.ok(page.text().includes('外しました。外しました'));
  assert.ok(!page.find('button').some((node) => page.text(node) === '確かめた'));

  // カードを置く: 貼った JSON。同じ ID は、今の版で書き換える。
  const [area] = page.find('textarea');
  await page.change(area, JSON.stringify(card({ title: '選手を調べる（改）' })));
  const [form] = page.nodes().filter((node) => node.type === 'form');
  await page.submit(form);
  assert.deepEqual(ui.calls.filter((call) => call.method === 'POST').at(-1).body.revision, 3);
  assert.ok(page.text().includes('選手を調べる（改）'));

  const outsider = browse(w, 'owner-b').mount('components/noah-shelf-review.tsx', { ownerScope: await ownerIntent.ownerScopeFor('owner-b') });
  await outsider.flush();
  assert.equal(outsider.text(), '');
});
