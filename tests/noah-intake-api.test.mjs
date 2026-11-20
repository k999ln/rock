// 取り込みの入口: 巡回の合図、切り替えと審査者での見せ方、取り下げの操作。仕様: docs/noah/spec-85-intake.md 11.3・11.5・11.6。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createIntakeApi, noahBotUserAgent } from '../lib/noah-intake-api.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { NOAH_WAKE, noahWakeSignature, verifyNoahWake } from '../lib/noah-intake-wake.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { intakeDatabase, registry, registryEntry, seedFamily } from './helpers/noah-intake-fixture.mjs';

const ORIGIN = 'https://noah.example.com';
const NOW = 1_795_170_000_000;
const KEY = ['wake', 'key', 'for', 'tests', 'only'].join('-').padEnd(40, '0');

function setup(t, env = {}, { entries = [registryEntry('io.example/one'), registryEntry('io.example/two')] } = {}) {
  const base = intakeDatabase(t);
  const reg = registry({ entries, size: 100 });
  const time = { value: NOW };
  const lines = [];
  const api = createIntakeApi({
    db: base.db, reviewers: ['reviewer-1'], flags: parseNoahFlags(env), wakeKey: KEY, fetcher: reg.fetcher, now: () => time.value, log: (line) => lines.push(line),
    authenticate: async (request) => {
      const user = request.headers.get('x-test-user');
      if (!user) throw Error('UNAUTHORIZED');
      return user;
    },
  });
  const get = (query = '', user) => api.handle(new Request(`${ORIGIN}/api/noah/intake${query}`, { headers: user ? { 'x-test-user': user } : {} }));
  const post = async (body, user, change = {}) =>
    api.handle(new Request(`${ORIGIN}/api/noah/intake`, {
      method: 'POST',
      headers: { ...(user ? { 'x-test-user': user, 'X-Rock-Owner-Scope': await ownerScopeFor(user) } : {}), Origin: ORIGIN, 'Content-Type': 'application/json', ...change },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }));
  const wake = async (change = {}) => {
    const stamp = String(change.at ?? time.value);
    const headers = { 'Content-Type': 'application/json', 'x-noah-time': stamp, 'x-noah-signature': await noahWakeSignature(change.key ?? KEY, stamp), ...change.headers };
    return api.tick(new Request(`${ORIGIN}/api/noah/intake/tick`, { method: change.method ?? 'POST', headers, ...(change.method === 'GET' ? {} : { body: change.body ?? '{}' }) }));
  };
  return { ...base, reg, time, lines, api, get, post, wake };
}

void test('巡回を起こす合図: 署名・時刻・本文・道', async () => {
  const key = 'k'.repeat(32);
  const stamp = String(NOW);
  const signature = await noahWakeSignature(key, stamp);
  assert.equal(signature, createHmac('sha256', key).update(`${stamp}\nPOST\n/api/noah/intake/tick\n{}`).digest('hex'), '既存の合図（verifyWake）と同じ作り');
  const ok = { key, timestamp: stamp, signature, body: '{}', now: NOW };
  assert.equal(await verifyNoahWake(ok), true);
  assert.equal(await verifyNoahWake({ ...ok, now: NOW + NOAH_WAKE.maxSkewMs }), true);
  assert.equal(await verifyNoahWake({ ...ok, now: NOW + NOAH_WAKE.maxSkewMs + 1 }), false, '2 分より古い合図');
  assert.equal(await verifyNoahWake({ ...ok, now: NOW - NOAH_WAKE.maxSkewMs - 1 }), false, '2 分より先の時刻');
  assert.equal(await verifyNoahWake({ ...ok, body: '{"source":"mcp-registry"}' }), false, '合図に中身を持たせない');
  assert.equal(await verifyNoahWake({ ...ok, path: '/api/noah/ask' }), false, '別の入口には使えない');
  assert.equal(await verifyNoahWake({ ...ok, signature: signature.replace(/^./, (c) => (c === '0' ? '1' : '0')) }), false);
  assert.equal(await verifyNoahWake({ ...ok, key: 'k'.repeat(31), signature: await noahWakeSignature('k'.repeat(31), stamp) }), false, '短い鍵は使わない');
  assert.equal(await verifyNoahWake({ ...ok, key: undefined }), false, '鍵を置いていなければ、誰の合図も通さない');
  assert.equal(await verifyNoahWake({ ...ok, timestamp: null }), false);
  assert.equal(await verifyNoahWake({ ...ok, timestamp: '1795170000' }), false, '秒の時刻は受けない');
  assert.equal(await verifyNoahWake({ ...ok, signature: 'zz' }), false);
});

void test('合図の入口: 鍵なし・古い時刻・本文あり・Origin あり・巡回が閉じている', async (t) => {
  const closed = setup(t);
  assert.equal((await closed.wake({ key: 'x'.repeat(40) })).status, 401, '違う鍵');
  assert.equal((await closed.wake({ headers: { 'x-noah-signature': '' } })).status, 401, '署名なし');
  assert.equal((await closed.wake({ at: NOW - NOAH_WAKE.maxSkewMs - 1 })).status, 401, '古い時刻');
  assert.equal((await closed.wake({ body: '{"source":"mcp-registry"}' })).status, 401, '本文あり');
  assert.equal((await closed.wake({ body: 'x'.repeat(500) })).status, 401, '大きい本文は読まない');
  assert.equal((await closed.wake({ headers: { Origin: ORIGIN } })).status, 403, '画面から呼ぶ入口ではない');
  assert.equal((await closed.wake({ method: 'GET' })).status, 405);
  const disabled = await closed.wake();
  assert.deepEqual([disabled.status, await disabled.json()], [200, { disabled: true }], '閉じている間は、合図が届いても何もしない');
  assert.deepEqual([closed.reg.state.calls.length, closed.lines.length], [0, 0]);

  const unkeyed = createIntakeApi({ db: closed.db, reviewers: [], flags: parseNoahFlags({ NOAH_PATROL_ENABLED: 'true' }), authenticate: async () => 'x', now: () => NOW });
  const stamp = String(NOW);
  const forged = new Request(`${ORIGIN}/api/noah/intake/tick`, { method: 'POST', headers: { 'x-noah-time': stamp, 'x-noah-signature': await noahWakeSignature('', stamp).catch(() => 'a'.repeat(64)) }, body: '{}' });
  assert.equal((await unkeyed.tick(forged)).status, 401, '鍵を置いていなければ、誰の合図も通さない');
});

void test('合図で巡回が進む。応答と記録は件数だけ。失敗は 500', async (t) => {
  const f = setup(t, { NOAH_PATROL_ENABLED: 'true' });
  const response = await f.wake();
  assert.deepEqual([response.status, await response.json(), response.headers.get('cache-control')], [200, { pages: 1, seen: 2, changed: 2, more: false }, 'no-store, private']);
  assert.equal(f.reg.state.calls[0].init.headers['User-Agent'], noahBotUserAgent(ORIGIN));
  assert.equal(noahBotUserAgent(ORIGIN), 'NoahBot/1 (+https://noah.example.com/noah/help#bot)');
  assert.equal(f.lines.length, 1);
  const line = JSON.parse(f.lines[0]);
  assert.deepEqual(Object.keys(line), ['event', 'pages', 'seen', 'changed', 'probes', 'ok', 'authRequired', 'unreachable', 'rateLimited', 'skippedHost', 'toolsChanged', 'swept', 'ms']);
  assert.deepEqual([line.event, line.pages, line.seen, line.changed], ['noah-patrol', 1, 2, 2]);
  assert.ok(Object.values(line).every((value) => value === 'noah-patrol' || typeof value === 'number'), '接続先の名前・URL・本人の ID を出さない');
  // 期限が来ていない合図は、何も読まずに成功する。
  const idle = await f.wake();
  assert.deepEqual([idle.status, await idle.json(), f.reg.state.calls.length], [200, { pages: 0, seen: 0, changed: 0, more: false }, 1]);
  // 台帳が読めない時は 500（合図を送った側の実行が、失敗として残る）。
  f.time.value = NOW + 3_600_000;
  f.reg.state.respond = () => new Response('down', { status: 500 });
  const failed = await f.wake();
  assert.deepEqual([failed.status, await failed.json()], [500, { error: 'unavailable', pages: 0, seen: 0, changed: 0 }]);
  // 保存できない時も 500。
  const broken = createIntakeApi({ db: { prepare: () => { throw Error('D1 down'); }, batch: async () => [] }, reviewers: [], flags: parseNoahFlags({ NOAH_PATROL_ENABLED: 'true' }), wakeKey: KEY, authenticate: async () => 'x', now: () => NOW, log: () => {} });
  const stamp = String(NOW);
  const down = await broken.tick(new Request(`${ORIGIN}/api/noah/intake/tick`, { method: 'POST', headers: { 'x-noah-time': stamp, 'x-noah-signature': await noahWakeSignature(KEY, stamp) }, body: '{}' }));
  assert.deepEqual([down.status, await down.json()], [500, { error: 'unavailable' }]);
});

void test('見せない: 切り替えが閉じている間は、審査者だけ。開けると、サインインしていない人にも見える', async (t) => {
  const closed = setup(t);
  const id = seedFamily(closed.sql, 'io.show/agent', { summary: 'visible' });
  const unlisted = seedFamily(closed.sql, 'io.show/unchecked', { level: 0 });
  for (const query of ['', '?limit=0', `?id=${encodeURIComponent(id)}`, '?state=1', '?q=visible']) {
    assert.equal((await closed.get(query)).status, 404, `未サインイン ${query}`);
    assert.equal((await closed.get(query, 'someone')).status, 404, `審査者でない本人 ${query}`);
    assert.equal((await closed.get(query, 'reviewer-1')).status, 200, `審査者 ${query}`);
  }
  assert.deepEqual(await (await closed.get('')).json(), { error: '見つかりません。' });

  const open = setup(t, { NOAH_INTAKE_PUBLIC: 'true' });
  seedFamily(open.sql, 'io.show/agent', { summary: 'visible' });
  seedFamily(open.sql, 'io.show/unchecked', { level: 0 });
  const response = await open.get('');
  const body = await response.json();
  assert.deepEqual([response.status, response.headers.get('cache-control'), response.headers.get('x-content-type-options')], [200, 'no-store, private', 'nosniff']);
  assert.deepEqual([body.items.map((item) => item.id), body.counts, body.source, body.ownerScope, body.nextCursor], [[id], { ran: 0, new: 1 }, 'Official MCP Registry', null, null]);
  assert.equal(body.items[0].connect.badge, 'unverified');
  assert.equal(JSON.stringify(body).includes('connect_json'), false);
  const signedIn = await (await open.get('', 'someone')).json();
  assert.deepEqual([signedIn.ownerScope, signedIn.items[0].connect.taps], [await ownerScopeFor('someone'), 0]);
  // 系列の ID は、query で渡す（/ と : を含む）。
  const detail = await (await open.get(`?id=${encodeURIComponent(id)}`)).json();
  assert.deepEqual([detail.agent.id, detail.agent.members, detail.agent.connection, detail.source, 'review' in detail.agent], [id, 1, null, 'Official MCP Registry', false]);
  assert.equal((await open.get(`?id=${encodeURIComponent(unlisted)}`)).status, 404, '載せていない系列');
  assert.equal((await open.get(`?id=${encodeURIComponent(unlisted)}`, 'someone')).status, 404);
  assert.equal((await (await open.get(`?id=${encodeURIComponent(unlisted)}`, 'reviewer-1')).json()).agent.review.listing.reason, 'not_checked');
  assert.equal((await open.get('?id=')).status, 404);
  // 集計は、開けていても審査者だけ。
  assert.equal((await open.get('?state=1')).status, 404);
  assert.equal((await open.get('?state=1', 'someone')).status, 404);
  const state = await (await open.get('?state=1', 'reviewer-1')).json();
  assert.deepEqual([state.table.map((row) => row.label), state.listing.families, state.warnings, state.withdrawn], [['相手のサーバー', '端末で動かす'], { ran: 0, new: 1 }, [], []]);
  assert.equal((await open.get('?cursor=broken')).status, 400);
  assert.equal((await open.get('?q=a')).status, 400);
  // 値の形が違う切り替えは、閉じた物として扱い、運営に知らせる。
  const wrong = setup(t, { NOAH_INTAKE_PUBLIC: 'TRUE' });
  assert.equal((await wrong.get('')).status, 404);
  assert.deepEqual((await (await wrong.get('?state=1', 'reviewer-1')).json()).warnings, ['NOAH_INTAKE_PUBLIC は true か false です。閉じた物として扱います。']);
});

void test('書き込みは審査者だけ。同じ Noah の画面から、同じ本人で。手元の巡回は、巡回を開けた時だけ', async (t) => {
  const f = setup(t, { NOAH_INTAKE_PUBLIC: 'true' });
  const id = seedFamily(f.sql, 'io.write/agent');
  const withdraw = { action: 'withdraw', id, revision: 1 };
  assert.equal((await f.post(withdraw)).status, 401, '未サインイン');
  assert.equal((await f.post(withdraw, 'reviewer-1', { Origin: 'https://evil.example.com' })).status, 403, '別の origin');
  assert.equal((await f.post(withdraw, 'reviewer-1', { 'X-Rock-Owner-Scope': await ownerScopeFor('someone') })).status, 409, '本人が変わった');
  assert.equal((await f.post(withdraw, 'someone')).status, 403, '審査者でない');
  assert.equal((await f.post(withdraw, 'reviewer-1', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.post('{broken', 'reviewer-1')).status, 400);
  assert.equal((await f.post('[]', 'reviewer-1')).status, 400);
  assert.equal((await f.post({ action: 'withdraw', id, revision: 1, source: 'x' }, 'reviewer-1')).status, 400, '知らない項目');
  assert.equal((await f.post({ action: 'delete', id, revision: 1 }, 'reviewer-1')).status, 400);
  assert.equal((await f.post({ action: 'withdraw', id, revision: '1' }, 'reviewer-1')).status, 400);
  assert.equal((await f.post(JSON.stringify({ action: 'withdraw', id: 'x'.repeat(3000), revision: 1 }), 'reviewer-1')).status, 413);
  assert.equal((await f.api.handle(new Request(`${ORIGIN}/api/noah/intake`, { method: 'PUT', headers: { 'x-test-user': 'reviewer-1' } }))).status, 405);
  assert.equal(f.sql.prepare('SELECT withdrawn_at FROM noah_intake_families WHERE id=?').get(id).withdrawn_at, null, '拒否した操作は、何も変えない');

  f.time.value = NOW + 1_000;
  const done = await f.post(withdraw, 'reviewer-1');
  assert.deepEqual([done.status, await done.json()], [200, { family: { id, revision: 2, withdrawnAt: NOW + 1_000 }, ownerScope: await ownerScopeFor('reviewer-1') }]);
  assert.deepEqual((await (await f.get('')).json()).items, [], '一覧から消える');
  assert.equal((await f.get(`?id=${encodeURIComponent(id)}`)).status, 404, '詳細からも消える');
  assert.equal((await f.post({ action: 'restore', id, revision: 1 }, 'reviewer-1')).status, 409, 'revision が違う');
  assert.equal((await f.post({ action: 'restore', id: 'mcp-registry:io.write/missing', revision: 1 }, 'reviewer-1')).status, 404);
  assert.equal((await f.post({ action: 'restore', id, revision: 2 }, 'reviewer-1')).status, 200);
  assert.deepEqual((await (await f.get('')).json()).items.map((item) => item.id), [id]);

  // 手元の巡回（空の POST）: 巡回を閉じている間は、何もしない。取得先や取得時刻は指定できない。
  const idle = await f.post({}, 'reviewer-1');
  assert.deepEqual([idle.status, (await idle.json()).disabled, f.reg.state.calls.length], [200, true, 0]);
  assert.equal((await f.post({}, 'someone')).status, 403);
  const patrol = setup(t, { NOAH_PATROL_ENABLED: 'true' });
  const synced = await (await patrol.post({}, 'reviewer-1')).json();
  assert.deepEqual([synced.outcomes, synced.sources.map((source) => source.id), patrol.reg.state.calls.length], [[{ source: 'mcp-registry', mode: 'full', pages: 1, seen: 2, changed: 2, more: false, error: null }], ['mcp-registry'], 1]);
  assert.equal((await patrol.post({ source: 'https://evil.example.com', cursor: '9' }, 'reviewer-1')).status, 400);
});
