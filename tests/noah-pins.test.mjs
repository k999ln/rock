// ピンタレスト風の一覧（task 115）の試験: 分野・カードの形・数えた実績の点（Reddit の hot）・本人へのおすすめ（Pixie を決まった値で）・並べ方・頁の印、
// ボード（作る・保存・外す・公開・フォロー・消す）・「表示しない」・1 日 1 回の数え直し・見せてよいか（閉じている間は 404）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOAH_PIN_RANK, noahBoardName, noahComposePins, noahPinCursorDecode, noahPinCursorEncode, noahPinHot, noahPinInitials, noahPinShape, noahPinTopic, noahPinVotes, noahPixieScores,
} from '../lib/noah-pins.ts';
import { createNoahBoardsApi, createNoahPinsApi } from '../lib/noah-pins-api.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, OPEN, ORIGIN } from './fixtures/noah/connect-world.mjs';

const day = 86_400_000;

void test('topics, shapes and initials are decided by fixed words and a fixed hash', () => {
  assert.equal(noahPinTopic('Shiwake', '勘定科目と仕訳を探す'), 'money');
  assert.equal(noahPinTopic('Keenable', 'Search the live web'), 'research');
  assert.equal(noahPinTopic('Ippuku', 'Find coin lockers and toilets in Japan'), 'life');
  assert.equal(noahPinTopic('Zzz', 'nothing to see'), 'other');
  assert.equal(noahPinShape('a'), noahPinShape('a'));
  assert.ok([0, 1, 2].includes(noahPinShape('mcp-registry:ai.shiwake/mcp')));
  assert.equal(noahPinInitials('job context'), 'JC');
  assert.equal(noahPinInitials('Shiwake'), 'SH');
  assert.equal(noahPinInitials('仕訳 AI'), '仕');
  assert.equal(noahBoardName('  経理  '), '経理');
  assert.equal(noahBoardName(''), null);
  assert.equal(noahBoardName('a'.repeat(41)), null);
  assert.equal(noahBoardName('改\n行'), '改 行');
});

void test('votes are counted people, and hot is the reddit formula: ten times the votes equals 45,000 seconds of recency', () => {
  assert.equal(noahPinVotes({ savers: 3, succeeded: 2, hides: 1 }), 3 + 4 - 5);
  const at = Date.UTC(2026, 10, 1);
  // Reddit の式（r2/lib/db/_sorts.pyx）と同じ値。
  assert.equal(noahPinHot(10, at), Math.round((1 + (at / 1000 - 1134028003) / 45000) * 1e7) / 1e7);
  assert.ok(Math.abs(noahPinHot(100, at) - noahPinHot(10, at + 45_000_000)) < 1e-6);
  assert.ok(noahPinHot(-10, at) < noahPinHot(0, at));
  assert.ok(noahPinHot(1, at + day) > noahPinHot(1, at), '同じ票なら、新しく載った物が上');
});

void test('pixie: several saved agents reaching the same agent outrank one reaching it often, fewer than five people are not used, and older saves weigh less', () => {
  const now = Date.UTC(2026, 10, 22);
  const edges = [];
  // q1・q2 の両方から行き着く a（5 人）と、q1 からだけ多く行き着く b（5 人）。c は 4 人だけ。
  for (let i = 0; i < 5; i++) {
    edges.push({ from: 'q1', to: 'a', boardId: `b1-${i}`, boardSize: 4, owner: `u${i}` }, { from: 'q2', to: 'a', boardId: `b2-${i}`, boardSize: 4, owner: `u${i}` });
    edges.push({ from: 'q1', to: 'b', boardId: `b1-${i}`, boardSize: 4, owner: `u${i}` }, { from: 'q1', to: 'b', boardId: `b3-${i}`, boardSize: 4, owner: `u${i}` });
  }
  for (let i = 0; i < 4; i++) edges.push({ from: 'q1', to: 'c', boardId: `b1-${i}`, boardSize: 4, owner: `u${i}` });
  const scores = noahPixieScores([{ familyId: 'q1', savedAt: now }, { familyId: 'q2', savedAt: now }], edges, now);
  assert.deepEqual(scores.map((row) => row.familyId), ['a', 'b']);
  assert.equal(scores[0].people, 5);
  // 起点・除く物は出さない。
  assert.deepEqual(noahPixieScores([{ familyId: 'q1', savedAt: now }], edges, now, new Set(['a'])).map((row) => row.familyId), ['b']);
  // 古い保存（2 週間前 = 半減期 2 回）は、新しい保存より弱い。
  const fresh = noahPixieScores([{ familyId: 'q1', savedAt: now }], edges, now)[0].score;
  const old = noahPixieScores([{ familyId: 'q1', savedAt: now - 14 * day }], edges, now)[0].score;
  assert.ok(Math.abs(old - fresh / 4) < 1e-12);
});

void test('compose: personal, popular, ran and fresh are mixed in a fixed pattern, every fifth slot tries something new, and providers and topics do not run on', () => {
  const c = (id, provider = id, topic = 'other') => ({ id, provider, topic });
  const sources = { personal: [c('p1')], popular: [c('h1'), c('h2'), c('h3'), c('h4')], ran: [c('r1'), c('r2')], fresh: [c('f1'), c('f2')] };
  assert.deepEqual(noahComposePins(sources, 10).map((item) => item.id), ['p1', 'h1', 'r1', 'h2', 'f1', 'h3', 'h4', 'r2', 'f2']);
  // 同じ提供者は、直近 6 枚に 1 枚まで（守れる候補がある間）。
  const same = { personal: [], popular: [c('a1', 'acme'), c('a2', 'acme'), c('b1', 'beta')], ran: [], fresh: [] };
  assert.deepEqual(noahComposePins(same, 3).map((item) => item.id), ['a1', 'b1', 'a2']);
  // 同じ分野は 2 枚まで続く。
  const topics = { personal: [], popular: [c('m1', 'x1', 'money'), c('m2', 'x2', 'money'), c('m3', 'x3', 'money'), c('d1', 'x4', 'dev')], ran: [], fresh: [] };
  assert.deepEqual(noahComposePins(topics, 4).map((item) => item.id), ['m1', 'm2', 'd1', 'm3']);
  // 前の頁で出した物は出さない。
  assert.ok(!noahComposePins(sources, 10, new Set(['h1'])).some((item) => item.id === 'h1'));
});

void test('the page cursor round-trips and rejects anything malformed', () => {
  const cursor = { popular: [12.5, 'mcp-registry:a/b'], ran: null, fresh: [99, 'mcp-registry:c/d'], done: ['ran'], shown: ['mcp-registry:e/f'] };
  assert.deepEqual(noahPinCursorDecode(noahPinCursorEncode(cursor)), cursor);
  for (const bad of ['', '!!', 'e30', noahPinCursorEncode({ ...cursor, extra: 1 }), noahPinCursorEncode({ ...cursor, shown: Array.from({ length: 31 }, (_, i) => `id-${i}xx`) }), noahPinCursorEncode({ ...cursor, popular: [1, 'a'] })]) {
    assert.equal(noahPinCursorDecode(bad), null, bad);
  }
});

/** 「本番」と同じ表で、ピンの入口とボードの入口を、その人として呼ぶ。 */
async function pinsWorld(t, count = 8, config = OPEN) {
  const servers = Object.fromEntries(Array.from({ length: count }, (_, i) => [hostOf(i + 1), mcpServer({ tools: [tool('lookup')] })]));
  const w = await world(t, servers);
  let next = 0;
  const deps = { db: w.f.db, now: w.f.time, reviewers: ['reviewer'], flags: parseNoahFlags(config), uuid: () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
    authenticate: async (request) => { const user = request.headers.get('x-test-user'); if (!user) throw Error('UNAUTHORIZED'); return user; } };
  const pinsApi = createNoahPinsApi(deps), boardsApi = createNoahBoardsApi(deps);
  const headers = async (user) => (user ? { 'x-test-user': user, 'X-Rock-Owner-Scope': await ownerScopeFor(user) } : {});
  const get = async (path, user = null) => {
    const api = path.startsWith('/api/noah/pins') ? pinsApi : boardsApi;
    const response = await api(new Request(`${ORIGIN}${path}`, { headers: await headers(user) }));
    return { status: response.status, body: await response.json() };
  };
  const post = async (user, body) => {
    const response = await boardsApi(new Request(`${ORIGIN}/api/noah/boards`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...await headers(user) }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const feedAll = async (user = null) => {
    const ids = [];
    let cursor = null;
    for (let page = 0; page < 20; page++) {
      const reply = await get(`/api/noah/pins${cursor ? `?cursor=${cursor}` : ''}`, user);
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      ids.push(...reply.body.items.map((item) => item.id));
      cursor = reply.body.nextCursor;
      if (!cursor) break;
    }
    return ids;
  };
  return { w, get, post, feedAll };
}

void test('the feed lists every runnable agent once across pages, with its topic and shape, and is closed (404) until the list is public except for reviewers', async (t) => {
  const { get, feedAll } = await pinsWorld(t, 8);
  const ids = await feedAll();
  assert.equal(ids.length, 8);
  assert.equal(new Set(ids).size, 8);
  const first = (await get('/api/noah/pins')).body.items[0];
  assert.ok(first.topic && [0, 1, 2].includes(first.shape) && Array.isArray(first.savedIn));
  const closed = await pinsWorld(t, 2, {});
  assert.equal((await closed.get('/api/noah/pins')).status, 404);
  assert.equal((await closed.get('/api/noah/pins', 'someone')).status, 404);
  assert.equal((await closed.get('/api/noah/pins', 'reviewer')).status, 200);
  assert.equal((await closed.get('/api/noah/boards', 'someone')).status, 404);
  assert.equal((await get('/api/noah/pins?cursor=@@')).status, 400);
});

void test('boards: create, save, the saved mark, unsave, rename, make public, follow, and remove; private boards are not readable by others', async (t) => {
  const { w, get, post } = await pinsWorld(t, 3);
  assert.equal((await post('alice', { action: 'create', name: '', visibility: 'private' })).status, 400);
  assert.equal((await post(null, { action: 'create', name: '経理', visibility: 'private' })).status, 401);
  const made = await post('alice', { action: 'create', name: '経理', visibility: 'private' });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const board = made.body.id;
  assert.equal((await post('alice', { action: 'save', boardId: board, familyId: familyId(1) })).status, 200);
  assert.equal((await post('alice', { action: 'save', boardId: board, familyId: familyId(1) })).status, 200, '2 回目は何もしない');
  assert.equal((await post('alice', { action: 'save', boardId: board, familyId: 'mcp-registry:nobody/none' })).status, 404);
  assert.equal((await post('bob', { action: 'save', boardId: board, familyId: familyId(2) })).status, 404, '他の人のボードには保存できない');
  const mine = await get('/api/noah/boards', 'alice');
  assert.equal(mine.body.mine[0].pins, 1);
  assert.equal(mine.body.mine[0].covers[0].id, familyId(1));
  const feed = (await get('/api/noah/pins', 'alice')).body.items;
  assert.deepEqual(feed.find((item) => item.id === familyId(1)).savedIn, [board]);
  // 保存した人の数が、実績に入る（全員の合計。本人の ID は無い）。
  assert.deepEqual({ ...w.f.sql.prepare('SELECT savers, votes FROM noah_pin_stats WHERE family_id = ?').get(familyId(1)) }, { savers: 1, votes: 1 });
  // 非公開のボードは、他の人と未サインインから見えない。
  assert.equal((await get(`/api/noah/boards?id=${board}`, 'bob')).status, 404);
  assert.equal((await get(`/api/noah/boards?id=${board}`)).status, 404);
  assert.equal((await post('bob', { action: 'follow', id: board })).status, 404);
  const revision = (await get(`/api/noah/boards?id=${board}`, 'alice')).body.board.revision;
  assert.equal((await post('alice', { action: 'update', id: board, revision, visibility: 'public', name: '経理の道具' })).status, 200);
  assert.equal((await get(`/api/noah/boards?id=${board}`)).body.board.name, '経理の道具');
  assert.equal((await post('bob', { action: 'follow', id: board })).status, 200);
  assert.equal((await post('alice', { action: 'follow', id: board })).status, 404, '自分のボードはフォローしない');
  assert.equal((await get('/api/noah/boards', 'bob')).body.following[0].id, board);
  assert.equal((await get(`/api/noah/boards?id=${board}`, 'bob')).body.board.following, true);
  // 非公開に戻すと、他の人のフォローは外れる。
  const now = (await get(`/api/noah/boards?id=${board}`, 'alice')).body.board.revision;
  assert.equal((await post('alice', { action: 'update', id: board, revision: now, visibility: 'private' })).status, 200);
  assert.deepEqual((await get('/api/noah/boards', 'bob')).body.following, []);
  assert.equal((await post('alice', { action: 'update', id: board, revision: now, name: 'x' })).status, 409, '古い版では変えない');
  assert.equal((await post('alice', { action: 'unsave', boardId: board, familyId: familyId(1) })).status, 200);
  assert.equal(w.f.sql.prepare('SELECT savers FROM noah_pin_stats WHERE family_id = ?').get(familyId(1)).savers, 0);
  const last = (await get(`/api/noah/boards?id=${board}`, 'alice')).body.board.revision;
  assert.equal((await post('alice', { action: 'remove', id: board, revision: last })).status, 200);
  assert.deepEqual((await get('/api/noah/boards', 'alice')).body.mine, []);
  assert.equal((await post('alice', { action: 'rename', id: board })).status, 400);
});

void test('hide: the agent leaves that person\'s feed only, and pulls its rank down for everyone; following and saves bring agents into the first page', async (t) => {
  const { w, get, post, feedAll } = await pinsWorld(t, 6);
  assert.equal((await post('alice', { action: 'hide', familyId: familyId(2) })).status, 200);
  assert.ok(!(await feedAll('alice')).includes(familyId(2)));
  assert.ok((await feedAll('bob')).includes(familyId(2)));
  assert.equal(w.f.sql.prepare('SELECT votes FROM noah_pin_stats WHERE family_id = ?').get(familyId(2)).votes, -5);
  assert.equal((await post('alice', { action: 'unhide', familyId: familyId(2) })).status, 200);
  assert.equal(w.f.sql.prepare('SELECT votes FROM noah_pin_stats WHERE family_id = ?').get(familyId(2)).votes, 0);
  // 保存された Agent は、票があるので「人気」から出る（全員の一覧の先頭の方）。
  const b = (await post('carol', { action: 'create', name: '共有', visibility: 'public' })).body.id;
  await post('carol', { action: 'save', boardId: b, familyId: familyId(5) });
  assert.ok((await get('/api/noah/pins')).body.items.slice(0, 4).some((item) => item.id === familyId(5)));
  await post('dave', { action: 'follow', id: b });
  assert.equal((await get('/api/noah/pins', 'dave')).body.items[0].id, familyId(5), 'フォローしたボードに入った物が、最初に混ざる');
});

void test('related ("これも使われています") walks other people\'s boards and needs five people; the daily rollup counts people whose asks succeeded', async (t) => {
  const { w, get, post } = await pinsWorld(t, 4);
  for (const user of ['u1', 'u2', 'u3', 'u4']) {
    const b = (await post(user, { action: 'create', name: '仕事', visibility: 'private' })).body.id;
    await post(user, { action: 'save', boardId: b, familyId: familyId(1) });
    await post(user, { action: 'save', boardId: b, familyId: familyId(2) });
  }
  assert.deepEqual((await get(`/api/noah/pins?related=${encodeURIComponent(familyId(1))}`)).body.items, [], '4 人では出さない');
  const b = (await post('u5', { action: 'create', name: '仕事', visibility: 'private' })).body.id;
  await post('u5', { action: 'save', boardId: b, familyId: familyId(1) });
  await post('u5', { action: 'save', boardId: b, familyId: familyId(2) });
  assert.deepEqual((await get(`/api/noah/pins?related=${encodeURIComponent(familyId(1))}`)).body.items.map((item) => item.id), [familyId(2)]);
  // 成果が返った依頼（2 人）を置いてから、一覧を読む（その日の最初の 1 回だけ数え直す）。
  const at = w.f.time();
  ['x1', 'x2'].forEach((owner, i) => {
    const connection = `00000000-0000-4000-8000-0000000009${i}0`, ask = `00000000-0000-4000-8000-0000000009${i}1`;
    w.f.sql.prepare(`INSERT INTO noah_connections(id, owner_id, family_key, agent_id, digest, request_sha256, connect_json, connect_sha256, plan_sha256, place, state, consent_json, price_json, cost_taps, cost_typed, revision, created_at, updated_at, connected_at)
      VALUES(?, ?, ?, 'a', 'd', ?, '{}', ?, ?, 'provider', 'connected', '{}', '{}', 0, 0, 1, ?, ?, ?)`).run(connection, owner, familyId(3), 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), at, at, at);
    w.f.sql.prepare(`INSERT INTO noah_asks(id, owner_id, connection_id, work_id, request_sha256, mode, host, tool, tool_sha256, state, revision, created_at, updated_at, finished_at)
      VALUES(?, ?, ?, 'w', ?, 'form', ?, 'lookup', ?, 'succeeded', 1, ?, ?, ?)`).run(ask, owner, connection, 'd'.repeat(64), hostOf(3), 'e'.repeat(64), at, at, at);
  });
  await get('/api/noah/pins');
  assert.deepEqual({ ...w.f.sql.prepare('SELECT succeeded, votes FROM noah_pin_stats WHERE family_id = ?').get(familyId(3)) }, { succeeded: 2, votes: 4 });
  // 同じ日の 2 回目は数え直さない。
  w.f.sql.prepare("UPDATE noah_pin_stats SET succeeded = 0 WHERE family_id = ?").run(familyId(3));
  await get('/api/noah/pins');
  assert.equal(w.f.sql.prepare('SELECT succeeded FROM noah_pin_stats WHERE family_id = ?').get(familyId(3)).succeeded, 0);
  assert.equal(NOAH_PIN_RANK.minPeople, 5);
});
