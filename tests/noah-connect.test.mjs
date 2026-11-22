// 接続（Passport）: 相手のサーバーで動く Agent へ、1 回の操作でつなぐ・やり直す・切る。つないだ後の、道具の一覧。
// 通信はしない。台帳も接続先も、この試験の中の関数（合成のサーバー）。道具は 1 回も呼ばない事を、相手が受けた要求の記録で確かめる。
// 仕様: docs/noah/spec-74-one-click-connect.md の 11.3・11.6、spec-87-tool-agent.md の 11.3、spec-88-mass-probe.md の 9.3。
import test from 'node:test';
import assert from 'node:assert/strict';
import { NOAH_CONNECT_LIMITS, NOAH_CONNECT_MESSAGES } from '../lib/noah-connect.ts';
import { NOAH_CONNECTION_STATES } from '../lib/noah-connect-plan.ts';
import { NOAH_HOST_BUSY } from '../lib/noah-form.ts';
import { NOAH_HANDSHAKE_MESSAGES, NOAH_USER_HANDSHAKE_MS } from '../lib/noah-user-handshake.ts';
import { entry, NOW } from './fixtures/noah/intake.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid, rpcs, handshakes } from './fixtures/noah/connect-world.mjs';

const HOUR = 3_600_000, DAY = 24 * HOUR;
const HEX = /^[a-f0-9]{64}$/;
const HANDSHAKE = ['initialize', 'notifications/initialized', 'tools/list'];
const remote = (url) => ({ remotes: [{ type: 'streamable-http', url }] });
/** 入力欄にできない道具（必須の入力が入れ子）。 */
const nested = (name) => tool(name, false, { inputSchema: { type: 'object', required: ['o'], properties: { o: { type: 'object' } } } });
/** 応答の要点: status・接続の状態・文。断られた時は、添えられた今の接続（connection）の状態を読む。 */
const brief = ({ status, body }) => [status, body.state ?? body.connection?.state ?? null, body.error ?? null];
/** 接続の表へ、直に 1 行入れる（上限の数え方と、表の制約の試験で使う）。 */
function seed(w, n, change = {}) {
  const row = {
    id: uuid(1000 + n), owner_id: 'owner-a', family_key: `seed-${n}`, agent_id: `seed-${n}`, digest: 'd'.repeat(64), request_sha256: 'e'.repeat(64),
    connect_json: '{}', connect_sha256: 'f'.repeat(64), plan_sha256: 'f'.repeat(64), place: 'provider', state: 'connected', consent_json: '{}', price_json: '{}',
    cost_taps: 0, cost_typed: 0, revision: 1, created_at: NOW - 2 * DAY, updated_at: NOW - 2 * DAY, connected_at: NOW - 2 * DAY, ...change,
  };
  w.f.sql.prepare(`INSERT INTO noah_connections(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  return row;
}
/** 相手を、途中で止められるサーバー。down が真の間、つながらない。 */
function switchable(options = {}) {
  const server = mcpServer(options), control = { down: false, attempts: 0 };
  return { ...server, control, fetch: (url, init) => { control.attempts++; if (control.down) throw new TypeError('fetch failed'); return server.fetch(url, init); } };
}

void test('the table: one live connection per person and family, and the pairs the columns must keep', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer() });
  seed(w, 1);
  // 同じ本人・同じ系列の、切っていない接続は 1 件。別の本人・別の系列は入る。
  assert.throws(() => seed(w, 2, { family_key: 'seed-1' }), /UNIQUE/);
  seed(w, 3, { family_key: 'seed-1', owner_id: 'owner-b' });
  // 切ると、同じ系列をつなぎ直せる。記録は残る。
  w.f.sql.prepare("UPDATE noah_connections SET state='disconnected',disconnected_at=?,revision=revision+1 WHERE id=?").run(NOW, uuid(1001));
  seed(w, 2, { family_key: 'seed-1' });
  assert.equal(w.rows("owner_id='owner-a' AND family_key='seed-1'").length, 2);
  // 置き場所と端末、状態と時刻の対。形の違う値。
  w.f.sql.prepare("INSERT INTO noah_runner_devices(id,owner_id,credential_sha256,boot_id,name,platform,created_at,last_seen_at) VALUES('dev-1','owner-a','c1','b1','Mac','darwin',1,1)").run();
  seed(w, 4, { place: 'home', device_id: 'dev-1' });
  const refused = [
    { place: 'mac' }, { place: 'home' }, { place: 'provider', device_id: 'dev-1' }, { place: 'home', device_id: 'dev-none' },
    { state: 'connected', connected_at: null }, { state: 'needs_action' }, { state: 'disconnected' }, { disconnected_at: 9 }, { state: 'ready' },
    { connect_json: 'x' }, { consent_json: 'x' }, { price_json: 'x' }, { revision: 0 }, { id: 'short' }, { request_sha256: 'abc' }, { tools_sha256: 'abc' },
    { cost_taps: -1 }, { probe_ms: -1 }, { error: 'x'.repeat(301) }, { connect_json: JSON.stringify({ pad: 'x'.repeat(16_400) }) },
  ];
  for (const [index, change] of refused.entries()) assert.throws(() => seed(w, 10 + index, change), /constraint|CHECK|FOREIGN KEY/i, JSON.stringify(change).slice(0, 80));
  // 状態の名前は、型契約と同じ 10 個。
  for (const [index, state] of NOAH_CONNECTION_STATES.entries()) {
    seed(w, 100 + index, { state, ...(state === 'needs_action' ? { needs_json: '{}' } : {}), ...(state === 'disconnected' ? { disconnected_at: NOW } : {}) });
  }
  // 本人の一覧と、つなぐ前の上限は、本人の行だけを索引で引く。
  const plan = (sql, ...args) => w.f.sql.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map((row) => row.detail).join('\n');
  assert.match(plan('SELECT id FROM noah_connections WHERE owner_id=? AND disconnected_at IS NULL ORDER BY updated_at DESC,id LIMIT 50', 'owner-a'), /USING (COVERING )?INDEX noah_connections_/);
  assert.match(plan("SELECT 1 FROM noah_connections WHERE family_key=? AND state='connected'", 'seed-1'), /noah_connections_family/);
});

void test('one press connects: the handshake runs inside the request, and nothing runs on the Mac', async (t) => {
  const server = mcpServer({ session: 'session-1' });
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a');
  const checked = w.check(1);
  const response = await user.connect(familyId(1), uuid(1));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, private');
  const { ownerScope, connectedAt, ...body } = response.body;
  assert.deepEqual(body, { id: uuid(1), state: 'connected', revision: 3, agentId: familyId(1), name: 'Agent 1', digest: w.f.candidate(1).record_sha256, place: 'provider', placeLabel: `相手のサーバー（${hostOf(1)}）`, deviceId: null });
  assert.match(ownerScope, /^owner-v1:[a-f0-9]{64}$/);
  assert.equal(connectedAt, w.f.time());
  // 行: 握手で得た道具の定義の hash と、同意した時の接続要件・送り先・権限。
  const [row] = w.rows();
  assert.equal(w.rows().length, 1);
  assert.deepEqual([row.owner_id, row.family_key, row.agent_id, row.state, row.place, row.device_id, row.runner_command_id, row.error, row.revision], ['owner-a', familyId(1), familyId(1), 'connected', 'provider', null, null, null, 3]);
  assert.match(row.tools_sha256, HEX);
  assert.equal(row.tools_sha256, w.check(1).tools_sha256, '巡回の握手と同じ道具の定義');
  assert.deepEqual([row.connected_at, row.probe_ms, row.cost_taps, row.cost_typed, row.last_used_at, row.disconnected_at], [w.f.time(), 0, 0, 0, null, null]);
  assert.deepEqual([row.connect_json, row.connect_sha256, row.digest], [checked.connect_json, checked.connect_sha256, w.f.candidate(1).record_sha256]);
  assert.deepEqual(JSON.parse(row.consent_json), { permissions: ['read_user_input', 'write_results'], sendsTo: hostOf(1), at: w.f.time() });
  assert.deepEqual([JSON.parse(row.price_json), row.confirmed_tools_json, row.egress_granted_json], [{ model: 'free' }, '[]', '[]']);
  // 相手が受けたのは、握手（初期化・通知・道具の一覧）と、セッションを閉じる要求だけ。道具は呼んでいない。
  assert.deepEqual(rpcs(server), [...HANDSHAKE, 'DELETE']);
  // 人の操作から始まった握手である事を名乗る（巡回は NoahBot/1）。本人を表す値は送らない。
  for (const request of server.log) {
    assert.equal(request.headers['user-agent'], 'Noah/1 (+https://avoado.si/noah/help#bot)');
    assert.deepEqual(Object.keys(request.headers).filter((name) => /cookie|authorization|owner|x-rock/i.test(name)), []);
    assert.doesNotMatch(JSON.stringify(request), /owner-a/);
  }
  // 握手の待ちは、全体で 8 秒。
  assert.equal(NOAH_USER_HANDSHAKE_MS, 8_000);
  // 家の端末への命令は、1 件も増えない。巡回の握手の記録（最後に確かめた時刻・失敗の数）も、変えない。
  assert.equal(w.f.sql.prepare('SELECT COUNT(*) AS n FROM noah_runner_commands').get().n, 0);
  assert.deepEqual(w.check(1), checked);
  // 本人の一覧と、1 件の読み取りと、詳細の画面（系列の ID から、その本人の接続）。
  assert.deepEqual((await user.list()).body.connections.map((item) => [item.id, item.state, item.name, item.placeLabel]), [[uuid(1), 'connected', 'Agent 1', `相手のサーバー（${hostOf(1)}）`]]);
  assert.deepEqual(await user.get(uuid(1)).then(({ status, body: one }) => [status, one.state, one.revision, one.connectedAt]), [200, 'connected', 3, w.f.time()]);
  assert.deepEqual((await w.f.store.detail(familyId(1), 'owner-a', false)).connection, { id: uuid(1), state: 'connected', revision: 3, error: null });
  assert.equal((await w.f.store.detail(familyId(1), 'owner-b', false)).connection, null);
});

void test('when the provider does not answer the connection fails with a reason, and a retry connects', async (t) => {
  const server = switchable(), { control } = server;
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a'), checked = w.check(1);
  control.down = true;
  const failed = await user.connect(familyId(1), uuid(1));
  assert.deepEqual(brief(failed), [200, 'failed', '相手のサーバーが応答しません。時間をおいて試してください。']);
  assert.deepEqual([failed.body.revision, failed.body.connectedAt], [3, undefined]);
  assert.deepEqual(w.rows().map((row) => [row.state, row.error, row.connected_at, row.tools_sha256]), [['failed', '相手のサーバーが応答しません。時間をおいて試してください。', null, null]]);
  // 握手の表には書かない（1 人の失敗で、全員の一覧から外さない。外すかどうかは、巡回の握手で決める）。
  assert.deepEqual(w.check(1), checked);
  assert.deepEqual(await w.listed(), [familyId(1)]);
  // 相手が戻った後、やり直す。行は増えない。
  control.down = false;
  w.f.advance(NOAH_CONNECT_LIMITS.retryAfterMs);
  const retried = await user.act(uuid(1), 'retry', 3);
  assert.deepEqual([...brief(retried), retried.body.revision, retried.body.connectedAt], [200, 'connected', null, 5, w.f.time()]);
  assert.deepEqual(w.rows().map((row) => [row.state, row.error, row.revision, row.connected_at]), [['connected', null, 5, w.f.time()]]);
  assert.deepEqual(rpcs(server), HANDSHAKE);
  // つながった物は、やり直せない。
  assert.deepEqual(brief(await user.act(uuid(1), 'retry', 5)), [409, 'connected', NOAH_CONNECT_MESSAGES.notNow]);
});

void test('every way a handshake can fail has its own sentence', async (t) => {
  const cases = [
    [{ status: 403 }, NOAH_HANDSHAKE_MESSAGES.forbidden],
    [{ status: 500 }, NOAH_HANDSHAKE_MESSAGES.unreachable],
    [{ status: 404 }, NOAH_HANDSHAKE_MESSAGES.unreachable],
    [{ status: 400 }, NOAH_HANDSHAKE_MESSAGES.incompatible],
    [{ answers: '1999-01-01' }, NOAH_HANDSHAKE_MESSAGES.incompatible],
    [{ timeout: true }, NOAH_HANDSHAKE_MESSAGES.unreachable],
  ];
  const servers = Object.fromEntries(cases.map((_, index) => [hostOf(index + 1), mcpServer()]));
  const w = await world(t, servers);
  const user = w.as('owner-a'), before = cases.map((_, index) => w.check(index + 1));
  for (const [index, [change, message]] of cases.entries()) {
    const server = servers[hostOf(index + 1)];
    // 時間切れは、握手の待ちの合図（signal）が切れた時と同じ形の失敗で起こす（8 秒は待たない）。握手の要求には、待ちの合図が付いている。
    let signal = null;
    if (change.timeout) server.options.before = (_body, init) => { signal = init.signal; throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };
    else Object.assign(server.options, change);
    assert.deepEqual(brief(await user.connect(familyId(index + 1), uuid(index + 1))), [200, 'failed', message], JSON.stringify(change));
    if (change.timeout) assert.ok(signal instanceof AbortSignal && !signal.aborted);
  }
  assert.deepEqual(Object.values(NOAH_HANDSHAKE_MESSAGES).filter((message) => message.length > 300), [], '行の error は 300 文字まで');
  // どれも、握手の表には書かない。一覧にも残る。
  assert.deepEqual(cases.map((_, index) => w.check(index + 1)), before);
  assert.equal((await w.listed()).length, cases.length);
});

void test('a provider that starts asking for permission or payment leaves the list at once', async (t) => {
  const servers = { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer(), [hostOf(3)]: mcpServer() };
  const w = await world(t, servers);
  const user = w.as('owner-a');
  assert.deepEqual(await w.listed(), [familyId(1), familyId(2), familyId(3)]);
  servers[hostOf(1)].options.status = 401;
  servers[hostOf(2)].options.status = 402;
  w.f.advance(HOUR);
  const denied = await user.connect(familyId(1), uuid(1));
  assert.deepEqual(brief(denied), [200, 'failed', 'この Agent は、相手の許可が要るようになりました。まだ対応していません。']);
  assert.deepEqual(brief(await user.connect(familyId(2), uuid(2))), [200, 'failed', 'この Agent は、呼ぶたびの支払いが要るようになりました。まだ対応していません。']);
  // 握手の表: つながる物ではなくなった（level 0）。30 日後に確かめ直す。巡回が最後に握手した時刻は、書き換えない。
  const pick = (row) => [row.level, row.result, row.auth, row.l1_at, row.next_check_at, row.checked_at, row.failures, row.lease_until];
  assert.deepEqual(pick(w.check(1)), [0, 'auth_required', 'unknown', null, w.f.time() + 30 * DAY, NOW, 0, 0]);
  assert.deepEqual(pick(w.check(2)), [0, 'payment_required', 'payment', null, w.f.time() + 30 * DAY, NOW, 0, 0]);
  // 系列へ写す。一覧・検索から消える。関係の無い系列は、そのまま。
  assert.deepEqual([w.family(1).listed, w.family(1).level, w.family(2).listed, w.family(3).listed], [0, 0, 0, 1]);
  assert.deepEqual(await w.listed(), [familyId(3)]);
  // 相手が受けたのは、最初の要求 1 回だけ（許可の公開情報は探さない）。
  assert.deepEqual(rpcs(servers[hostOf(1)]), ['initialize']);
  // 一覧から外れた物の詳細は、無い物として答える。ただし、つないでいる本人は読める（外れた理由を見て、切れるように）。
  const mine = await w.f.store.detail(familyId(1), 'owner-a', false);
  assert.deepEqual([mine.listed, mine.connection], [false, { id: uuid(1), state: 'failed', revision: denied.body.revision, error: 'この Agent は、相手の許可が要るようになりました。まだ対応していません。' }]);
  await assert.rejects(w.f.store.detail(familyId(1), 'owner-b', false), { status: 404 });
  await assert.rejects(w.f.store.detail(familyId(1), null, false), { status: 404 });
  assert.equal((await w.f.store.detail(familyId(3), 'owner-b', false)).listed, true);
  // やり直しても、載せていない物へは送らない。もう一度つなごうとしても同じ。
  w.f.advance(NOAH_CONNECT_LIMITS.retryAfterMs);
  assert.deepEqual(brief(await user.act(uuid(1), 'retry', denied.body.revision)), [422, 'failed', 'この Agent は、今はつなげません。']);
  assert.deepEqual(await w.as('owner-b').plan(familyId(1)).then(({ status }) => status), 422);
  assert.deepEqual(rpcs(servers[hostOf(1)]), ['initialize']);
  // 切れば、行は片づく。
  assert.deepEqual(brief(await user.act(uuid(1), 'disconnect', denied.body.revision)), [200, 'disconnected', 'この Agent は、相手の許可が要るようになりました。まだ対応していません。']);
});

void test('families that are not listed cannot be connected, and are never contacted', async (t) => {
  const keyed = entry(2, { remotes: [{ type: 'streamable-http', url: `https://${hostOf(2)}/mcp`, headers: [{ name: 'X-Api-Key', isRequired: true, isSecret: true }] }] });
  const bulk = Array.from({ length: 20 }, (_, i) => entry(100 + i, remote(`https://shared.example.com/mcp/${i}`)));
  const servers = { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer(), [hostOf(4)]: mcpServer(), [hostOf(5)]: mcpServer(), [hostOf(6)]: mcpServer({ tools: [nested('configure')] }), 'shared.example.com': mcpServer() };
  const records = [entry(1), keyed, ...bulk, entry(4), entry(6)];
  const w = await world(t, servers, { records: [...records, entry(5)] });
  const detail = await w.f.store.detail(familyId(4), null, true);
  await w.f.store.moderate('withdraw', familyId(4), detail.revision);
  const plans = { 5: (await w.as('owner-a').plan(familyId(5))).body.planSha256 };
  w.f.advance(HOUR);
  await w.sync([...records, entry(5, {}, 'deleted')]);
  w.clear();
  const user = w.as('owner-a');
  const bulkFamily = w.f.sql.prepare("SELECT id FROM noah_intake_families WHERE id LIKE 'bulk:%'").get().id;
  // 鍵の要る物・量産・運営が取り下げた物・台帳で取り下げになった物・入力欄で使える道具が無い物。画面を通さない要求（計画の hash は適当な値）でも、つなげない。
  for (const [index, agent] of [familyId(2), bulkFamily, familyId(4), familyId(5), familyId(6)].entries()) {
    assert.deepEqual(brief(await user.connect(agent, uuid(index + 1), plans[5])), [422, null, 'この Agent は、今はつなげません。'], agent);
  }
  assert.deepEqual(brief(await user.connect(familyId(99), uuid(9), plans[5])), [404, null, 'Agentが見つかりません。']);
  assert.equal(w.rows().length, 0, '行ができない');
  assert.deepEqual(w.net.hosts, [], '相手へ 1 回も送らない');
});

void test('pressing twice or reloading: one row, one handshake, the same answer three times', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a');
  const plan = (await user.plan(familyId(1))).body.planSha256;
  const answers = [];
  for (let press = 0; press < 3; press++) answers.push(await user.connect(familyId(1), uuid(1), plan));
  assert.deepEqual(answers.map(({ status }) => status), [200, 200, 200]);
  assert.deepEqual(answers[1].body, answers[0].body);
  assert.deepEqual(answers[2].body, answers[0].body);
  assert.equal(w.rows().length, 1);
  assert.equal(handshakes(server), 1);
  // 同じ操作 ID で、内容が違う要求は断る。行も握手も増えない。
  assert.deepEqual(brief(await user.connect(familyId(1), uuid(1), 'a'.repeat(64))), [409, null, '同じ操作IDの内容は変更できません。']);
  assert.deepEqual([w.rows().length, handshakes(server)], [1, 1]);
  // 別の本人が、同じ操作 ID を使っても、その人の行は見えない（今の行を返さない）。
  assert.deepEqual(brief(await w.as('owner-b').connect(familyId(1), uuid(1))), [409, null, '同じ操作IDの内容は変更できません。']);
  assert.deepEqual([w.rows().length, handshakes(server)], [1, 1]);
});

void test('two requests with the same ID at the same moment make one handshake', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a');
  const plan = (await user.plan(familyId(1))).body.planSha256;
  const [first, second] = await Promise.all([user.connect(familyId(1), uuid(1), plan), user.connect(familyId(1), uuid(1), plan)]);
  assert.deepEqual([first.status, second.status], [200, 200]);
  assert.deepEqual([first.body.id, second.body.id], [uuid(1), uuid(1)]);
  // 握手を行うのは、行を入れた方だけ。もう一方は、その時の行（進んでいる途中）を返す。
  assert.deepEqual([first.body.state, second.body.state].sort((a, b) => a.localeCompare(b)), ['connected', 'probing']);
  assert.deepEqual([w.rows().length, handshakes(server), w.rows()[0].state], [1, 1, 'connected']);
  // 同じ系列へ、別々の操作 ID で同時に。行は 1 件。握手は 1 回。
  const [third, fourth] = await Promise.all([w.as('owner-b').connect(familyId(1), uuid(2), plan), w.as('owner-b').connect(familyId(1), uuid(3), plan)]);
  assert.deepEqual([third.status, fourth.status, new Set([third.body.id, fourth.body.id]).size], [200, 200, 1]);
  assert.deepEqual([w.rows("owner_id='owner-b'").length, handshakes(server)], [1, 2]);
});

void test('when the conditions changed after the plan was read, the connection is refused with the new plan', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a');
  const before = (await user.plan(familyId(1))).body;
  // 計画を読んだ後に、台帳の記録（説明）が変わる。接続要件の hash が変わる。
  w.f.advance(HOUR);
  await w.sync([entry(1, { description: 'A new description' })]);
  assert.notEqual(w.check(1).connect_sha256, before.connectSha256);
  w.clear();
  const refused = await user.connect(familyId(1), uuid(1), before.planSha256);
  assert.deepEqual(brief(refused), [409, null, '条件が変わりました。もう一度確かめてください。']);
  const { ownerScope: _scope, ...fresh } = (await user.plan(familyId(1))).body;
  assert.deepEqual(refused.body.plan, fresh);
  assert.notEqual(refused.body.plan.planSha256, before.planSha256);
  assert.deepEqual([w.rows().length, handshakes(server)], [0, 0], '古い条件の行ができない。相手へ送らない');
  // 新しい計画で、つながる。
  assert.deepEqual(brief(await user.connect(familyId(1), uuid(1), refused.body.plan.planSha256)), [200, 'connected', null]);
});

void test('connecting the same family again returns the connection that is already there', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a');
  const first = await user.connect(familyId(1), uuid(1));
  const again = await user.connect(familyId(1), uuid(2));
  assert.deepEqual([again.status, again.body], [200, first.body]);
  assert.deepEqual([w.rows().length, handshakes(server)], [1, 1]);
  // 別の本人は、同じ系列へ、自分の接続を持てる。
  assert.deepEqual(brief(await w.as('owner-b').connect(familyId(1), uuid(3))), [200, 'connected', null]);
  assert.equal(w.rows().length, 2);
  // 台帳の記録が変わった後（つないだ版と違う）: 別の操作 ID では、今の接続を置き換えない。
  w.f.advance(HOUR);
  await w.sync([entry(1, { description: 'A new description' })]);
  assert.deepEqual(brief(await user.connect(familyId(1), uuid(4))), [409, null, '新しい版があります。つながっているものの一覧で確かめてください。']);
  assert.equal(w.rows().length, 2);
});

void test('disconnecting keeps the record, stops the use, and lets the person connect again', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a');
  const connected = await user.connect(familyId(1), uuid(1));
  // 古い版（revision）では、切れない。今の状態を返す。
  assert.deepEqual(brief(await user.act(uuid(1), 'disconnect', connected.body.revision - 1)), [409, 'connected', '内容が更新されました。再読込してください。']);
  w.f.advance(1000);
  const gone = await user.act(uuid(1), 'disconnect', connected.body.revision);
  assert.deepEqual([...brief(gone), gone.body.revision], [200, 'disconnected', null, connected.body.revision + 1]);
  const [row] = w.rows();
  assert.deepEqual([row.state, row.disconnected_at, row.connected_at, row.tools_sha256 !== null], ['disconnected', w.f.time(), NOW, true], '記録は残る');
  // 切った後: 一覧に出ない。道具の一覧は開けない（相手へ送らない）。もう一度は切れない。
  assert.deepEqual((await user.list()).body.connections, []);
  w.clear();
  assert.deepEqual(brief(await user.tools(uuid(1))), [409, null, '接続を確かめてください。']);
  assert.deepEqual(brief(await user.act(uuid(1), 'disconnect', gone.body.revision)), [409, 'disconnected', NOAH_CONNECT_MESSAGES.notNow]);
  assert.deepEqual(brief(await user.act(uuid(1), 'retry', gone.body.revision)), [409, 'disconnected', NOAH_CONNECT_MESSAGES.notNow]);
  assert.equal(handshakes(server), 0);
  assert.equal((await w.f.store.detail(familyId(1), 'owner-a', false)).connection, null);
  // もう一度つなげる（新しい操作 ID。行は 2 件になる）。切った行の操作 ID を使い回しても、切った行が返るだけ。
  assert.deepEqual(brief(await user.connect(familyId(1), uuid(1))), [200, 'disconnected', null]);
  assert.deepEqual(brief(await user.connect(familyId(1), uuid(2))), [200, 'connected', null]);
  assert.deepEqual(w.rows().map((item) => item.state), ['disconnected', 'connected']);
});

void test('cutting the connection while the handshake is running wins over the handshake', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a');
  let cut = null;
  // 道具の一覧を読んでいる間に、本人が切る（別の画面から）。
  server.options.before = async (body) => { if (body?.method === 'tools/list' && !cut) cut = await user.act(uuid(1), 'disconnect', 2); };
  const response = await user.connect(familyId(1), uuid(1));
  assert.deepEqual(brief(cut), [200, 'disconnected', null]);
  assert.deepEqual(brief(response), [200, 'disconnected', null], '握手の結果で、切った接続を戻さない');
  assert.deepEqual(w.rows().map((row) => [row.state, row.connected_at, row.tools_sha256, row.revision]), [['disconnected', null, null, 3]]);
});

void test('a family withdrawn after connecting blocks the connection the next time it is used', async (t) => {
  const servers = { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer() };
  const w = await world(t, servers);
  const user = w.as('owner-a');
  await user.connect(familyId(1), uuid(1));
  await user.connect(familyId(2), uuid(2));
  // 運営が、系列を取り下げる。もう 1 つは、台帳で取り下げになる。
  const detail = await w.f.store.detail(familyId(1), null, true);
  await w.f.store.moderate('withdraw', familyId(1), detail.revision);
  w.f.advance(HOUR);
  await w.sync([entry(1), entry(2, {}, 'deleted')]);
  w.clear();
  for (const id of [uuid(1), uuid(2)]) {
    assert.deepEqual(brief(await user.tools(id)), [409, null, 'この Agent は、取り下げられました。使えません。']);
    const blocked = await user.get(id);
    assert.deepEqual(brief(blocked), [200, 'blocked', 'この Agent は、取り下げられました。使えません。']);
    // 2 回目も同じ文。やり直せない。
    assert.deepEqual(brief(await user.tools(id)), [409, null, 'この Agent は、取り下げられました。使えません。']);
    assert.deepEqual(brief(await user.act(id, 'retry', blocked.body.revision)), [409, 'blocked', NOAH_CONNECT_MESSAGES.notNow]);
  }
  assert.deepEqual(w.net.hosts, [], '取り下げられた物へ、送らない');
  // 切る事はできる。戻された系列へは、つなぎ直せる。
  assert.deepEqual(brief(await user.act(uuid(1), 'disconnect', 4)), [200, 'disconnected', 'この Agent は、取り下げられました。使えません。']);
  await w.f.store.moderate('restore', familyId(1), detail.revision + 1);
  assert.deepEqual(brief(await user.connect(familyId(1), uuid(3))), [200, 'connected', null]);
});

void test('a changed endpoint is never used silently: the person disconnects and connects again', async (t) => {
  const servers = { [hostOf(1)]: mcpServer(), 'moved.example.org': mcpServer(), [hostOf(2)]: mcpServer() };
  const w = await world(t, servers, { records: [entry(1), entry(2)] });
  const user = w.as('owner-a');
  const connected = await user.connect(familyId(1), uuid(1));
  // 2 つ目は、相手が止まっていて失敗した接続。
  servers[hostOf(2)].options.status = 500;
  const failed = await user.connect(familyId(2), uuid(2));
  assert.equal(failed.body.state, 'failed');
  servers[hostOf(2)].options.status = undefined;
  // 説明だけが変わった時は、そのまま使える。
  w.f.advance(HOUR);
  await w.sync([entry(1, { description: 'A new description' }), entry(2)]);
  assert.equal((await user.tools(uuid(1))).status, 200);
  // 接続先（URL）が変わった。取り込みは握手の記録を消し、巡回が、新しい接続先を確かめ直す。
  w.f.advance(HOUR);
  await w.sync([entry(1, remote('https://moved.example.org/mcp')), entry(2, remote('https://moved.example.org/other'))]);
  await w.patrol();
  w.clear();
  // つないである接続は、黙って新しい相手へ送らない。古い相手へも送らない。
  assert.deepEqual(brief(await user.tools(uuid(1))), [409, null, 'この Agent の接続先や条件が変わりました。切って、つなぎ直してください。']);
  assert.equal((await user.get(uuid(1))).body.state, 'connected');
  // 失敗していた接続のやり直しも、同じ。
  w.f.advance(HOUR);
  await w.patrol();
  w.clear();
  assert.deepEqual(brief(await user.act(uuid(2), 'retry', failed.body.revision)), [409, 'failed', 'この Agent の接続先や条件が変わりました。切って、つなぎ直してください。']);
  assert.deepEqual(w.net.hosts, []);
  // 切って、つなぎ直すと、新しい送り先を見た上でつながる。
  await user.act(uuid(1), 'disconnect', connected.body.revision);
  const plan = (await user.plan(familyId(1))).body;
  assert.deepEqual(plan.sendsTo, { host: 'moved.example.org' });
  const again = await user.connect(familyId(1), uuid(3), plan.planSha256);
  assert.deepEqual([...brief(again), again.body.placeLabel], [200, 'connected', null, '相手のサーバー（moved.example.org）']);
  assert.deepEqual([...new Set(w.net.hosts)], ['moved.example.org']);
});

void test('closing the session never keeps the person waiting when the runtime can defer work', async (t) => {
  const server = mcpServer({ session: 'session-1' });
  const w = await world(t, { [hostOf(1)]: server });
  const deferred = [];
  // Workers の waitUntil に当たる物を渡すと、閉じる要求は、応答の後に回る。
  const user = w.as('owner-a', { waitUntil: (work) => { deferred.push(work); } });
  let closed = false;
  server.options.before = async (_body, init) => { if (init.method === 'DELETE') { await new Promise((resolve) => { setTimeout(resolve, 20); }); closed = true; } };
  const connected = await user.connect(familyId(1), uuid(1));
  assert.deepEqual([connected.body.state, deferred.length, closed], ['connected', 1, false], '応答は、閉じる要求を待たない');
  await Promise.all(deferred);
  assert.equal(closed, true);
  const tools = await user.tools(uuid(1));
  assert.deepEqual([tools.status, deferred.length], [200, 2]);
  await Promise.all(deferred);
  assert.deepEqual(rpcs(server), [...HANDSHAKE, 'DELETE', ...HANDSHAKE, 'DELETE']);
});

void test('a redirect to another host is not followed, and a provider without tools cannot be connected', async (t) => {
  const first = mcpServer(), elsewhere = mcpServer(), empty = mcpServer();
  const control = { redirect: false };
  const w = await world(t, {
    [hostOf(1)]: (url, init) => (control.redirect ? new Response(null, { status: 307, headers: { location: 'https://elsewhere.example.org/mcp' } }) : first.fetch(url, init)),
    [hostOf(2)]: empty, 'elsewhere.example.org': elsewhere,
  }, { records: [entry(1), entry(2)] });
  const user = w.as('owner-a'), checked = [w.check(1), w.check(2)];
  control.redirect = true;
  assert.deepEqual(brief(await user.connect(familyId(1), uuid(1))), [200, 'failed', 'この接続先にはつなげません。']);
  assert.equal(w.net.hosts.filter((name) => name === 'elsewhere.example.org').length, 0, '本人に見せた送り先の外へ、送らない');
  empty.state.tools = [];
  assert.deepEqual(brief(await user.connect(familyId(2), uuid(2))), [200, 'failed', 'この Agent には、今、使える道具がありません。時間をおいて試してください。']);
  assert.deepEqual([w.check(1), w.check(2)], checked);
});

void test('while the switch is closed new connections are refused; records stay and can be cut', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server, [hostOf(2)]: mcpServer() });
  const open = w.as('owner-a');
  const connected = await open.connect(familyId(1), uuid(1));
  const plan = (await open.plan(familyId(2))).body.planSha256;
  w.clear();
  // 接続と依頼の切り替え（NOAH_ASK_FORM）を閉じる。一覧は開けたまま。
  for (const env of [{ NOAH_INTAKE_PUBLIC: 'true' }, { NOAH_ASK_FORM: 'true' }, {}]) {
    const closed = w.as('owner-a', { env });
    assert.deepEqual(brief(await closed.connect(familyId(2), uuid(2), plan)), [503, null, '今は、新しい接続を受け付けていません。']);
    assert.deepEqual(brief(await closed.tools(uuid(1))), [503, null, '今は、新しい依頼を受け付けていません。']);
    assert.deepEqual(brief(await closed.act(uuid(1), 'retry', connected.body.revision)), [503, null, '今は、新しい接続を受け付けていません。']);
    // つないだ記録は残り、読める。
    assert.deepEqual((await closed.list()).body.connections.map((item) => item.id), [uuid(1)]);
    assert.equal((await closed.get(uuid(1))).body.state, 'connected');
  }
  assert.deepEqual([w.rows().length, w.net.hosts.length], [1, 0], '行ができない。相手へ送らない');
  // 審査者は、閉じていても使える（本番で、開ける前に確かめるため）。
  const reviewer = w.as('reviewer', { env: {}, reviewers: ['reviewer'] });
  assert.deepEqual(brief(await reviewer.connect(familyId(2), uuid(3))), [200, 'connected', null]);
  // 閉じていても、切れる。
  assert.deepEqual(brief(await w.as('owner-a', { env: {} }).act(uuid(1), 'disconnect', connected.body.revision)), [200, 'disconnected', null]);
});

void test('limits before connecting: live connections, per minute, per day', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server, [hostOf(2)]: mcpServer() });
  const now = w.f.time(), gone = { state: 'disconnected', disconnected_at: now };
  // 本人ごとに数える。切っていない接続が 50 件。
  for (let n = 0; n < 50; n++) seed(w, n, { owner_id: 'owner-live' });
  // 直近 60 秒に 10 件作った（切っても、数に入る）。
  for (let n = 0; n < 10; n++) seed(w, 100 + n, { owner_id: 'owner-minute', created_at: now - 30_000, updated_at: now - 20_000, ...gone });
  // 直近 24 時間に 100 件作った。
  for (let n = 0; n < 100; n++) seed(w, 200 + n, { owner_id: 'owner-day', created_at: now - 2 * HOUR, updated_at: now - HOUR, ...gone });
  const total = w.rows().length;
  const expected = { 'owner-live': [409, null, 'つながっているものが多すぎます。使っていないものを切ってください。'], 'owner-minute': [429, null, '続けてつなぎすぎています。少し待ってから試してください。'], 'owner-day': [429, null, 'この 24 時間につなげる数を使い切りました。時間をおいて、また使えます。'] };
  for (const [index, [owner, answer]] of Object.entries(expected).entries()) assert.deepEqual(brief(await w.as(owner).connect(familyId(1), uuid(index + 1))), answer, owner);
  assert.equal(w.rows().length, total, '行ができない');
  assert.deepEqual(w.net.hosts, [], '相手が受けた要求は 0 回');
  // 1 件少なければ、つながる。その後は、上限に達していても、同じ操作 ID の再送と、同じ系列への接続は、今の行を返す。
  for (const [index, owner] of ['owner-live', 'owner-minute', 'owner-day'].entries()) {
    w.f.sql.prepare('DELETE FROM noah_connections WHERE id=(SELECT id FROM noah_connections WHERE owner_id=? ORDER BY id LIMIT 1)').run(owner);
    const first = await w.as(owner).connect(familyId(1), uuid(index + 1));
    assert.deepEqual(brief(first), [200, 'connected', null], owner);
    assert.deepEqual(brief(await w.as(owner).connect(familyId(2), uuid(index + 11))).slice(0, 1), [expected[owner][0]], `${owner} は、また上限`);
    assert.deepEqual(await w.as(owner).connect(familyId(1), uuid(index + 1)).then(({ status, body }) => [status, body]), [200, first.body]);
    assert.deepEqual(await w.as(owner).connect(familyId(1), uuid(index + 21)).then(({ status, body }) => [status, body]), [200, first.body]);
  }
  // 60 秒・24 時間がたつと、また使える。
  w.f.advance(60_000);
  assert.deepEqual(brief(await w.as('owner-minute').connect(familyId(2), uuid(31))), [200, 'connected', null]);
  w.f.advance(DAY);
  assert.deepEqual(brief(await w.as('owner-day').connect(familyId(2), uuid(32))), [200, 'connected', null]);
  // 数は、切り替え（NOAH_ASK_LIMITS）で変えられる。
  const strict = w.as('owner-new', { env: { NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true', NOAH_ASK_LIMITS: '{"connectLive":1}' } });
  assert.deepEqual(brief(await strict.connect(familyId(1), uuid(41))), [200, 'connected', null]);
  assert.deepEqual(brief(await strict.connect(familyId(2), uuid(42))), [409, null, 'つながっているものが多すぎます。使っていないものを切ってください。']);
});

void test('one provider receives at most sixty user handshakes a minute, from everyone together', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server, [hostOf(2)]: mcpServer() });
  const plan = (await w.as('owner-0').plan(familyId(1))).body.planSha256;
  const states = [];
  for (let n = 0; n < 61; n++) {
    w.f.advance(500);
    states.push(brief(await w.as(`owner-${n}`).connect(familyId(1), uuid(n + 1), plan)));
  }
  assert.deepEqual(states.slice(0, 60).filter(([, state]) => state !== 'connected'), []);
  assert.deepEqual(states[60], [200, 'failed', NOAH_HOST_BUSY]);
  assert.equal(NOAH_HOST_BUSY, 'この Agent は、今こんでいます。少し待ってから試してください。');
  assert.equal(handshakes(server), 60, '相手が受けた握手は 60 回');
  // 道具の一覧も、同じ枠を使う。枠が無い間は、相手へ送らない。別の接続先の枠は別。
  assert.deepEqual(brief(await w.as('owner-0').tools(uuid(1))), [429, null, NOAH_HOST_BUSY]);
  assert.equal(handshakes(server), 60);
  assert.deepEqual(brief(await w.as('owner-60').connect(familyId(2), uuid(100))), [200, 'connected', null]);
  // 最初に枠を取った時刻から 60 秒たつと、また通る（失敗した接続は、やり直す）。
  w.f.advance(60_000 - 61 * 500 + 500);
  assert.deepEqual(brief(await w.as('owner-60').act(uuid(61), 'retry', 3)), [200, 'connected', null]);
  assert.equal(handshakes(server), 61);
  // 枠の数は、切り替え（NOAH_ASK_LIMITS の hostHandshakes）で変えられる。
  const strict = { env: { NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true', NOAH_ASK_LIMITS: '{"hostHandshakes":1}' } };
  assert.deepEqual(brief(await w.as('owner-x', strict).connect(familyId(1), uuid(200), plan)), [200, 'failed', NOAH_HOST_BUSY]);
});

void test('a provider that says it is busy is left alone until the time it named', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server });
  const first = await w.as('owner-a').connect(familyId(1), uuid(1));
  assert.equal(first.body.state, 'connected');
  w.f.advance(10_000);
  const checked = w.check(1);
  Object.assign(server.options, { status: 429, statusHeaders: { 'retry-after': '120' } });
  w.clear();
  assert.deepEqual(brief(await w.as('owner-b').connect(familyId(1), uuid(2))), [200, 'failed', '相手のサーバーが混んでいます。少し待ってから試してください。']);
  assert.equal(server.log.length, 1);
  assert.equal(w.f.sql.prepare('SELECT not_before FROM noah_probe_hosts WHERE host=?').get(hostOf(1)).not_before, w.f.time() + 120_000);
  // 失敗に数えない。一覧にも残る。
  assert.deepEqual(w.check(1), checked);
  assert.deepEqual(await w.listed(), [familyId(1)]);
  // 120 秒の間、その接続先への接続・やり直し・道具の一覧は、相手へ送らずに断る。
  Object.assign(server.options, { status: undefined, statusHeaders: undefined });
  w.f.advance(119_000);
  assert.deepEqual(brief(await w.as('owner-c').connect(familyId(1), uuid(3))), [200, 'failed', NOAH_HOST_BUSY]);
  assert.deepEqual(brief(await w.as('owner-b').act(uuid(2), 'retry', 3)), [200, 'failed', NOAH_HOST_BUSY]);
  assert.deepEqual(brief(await w.as('owner-a').tools(uuid(1))), [429, null, NOAH_HOST_BUSY]);
  assert.equal(server.log.length, 1, '相手が受けた要求は、最初の 1 回だけ');
  // 巡回も握手しない（期限が来ていても）。
  w.f.sql.prepare('UPDATE noah_intake_checks SET next_check_at=? WHERE candidate_id=?').run(w.f.time(), familyId(1));
  w.f.sql.prepare('UPDATE noah_probe_hosts SET last_probe_at=0 WHERE host=?').run(hostOf(1));
  assert.equal(await w.patrol(), 0);
  assert.equal(server.log.length, 1);
  // 時刻を過ぎると、通る。
  w.f.advance(6_000);
  assert.deepEqual(brief(await w.as('owner-c').act(uuid(3), 'retry', 3)), [200, 'connected', null]);
});

void test('pressing retry again and again does not keep sending handshakes', async (t) => {
  const server = switchable(), { control } = server;
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a');
  control.down = true;
  const failed = await user.connect(familyId(1), uuid(1));
  control.attempts = 0;
  // 失敗の直後は、やり直せない（5 秒）。
  assert.deepEqual(brief(await user.act(uuid(1), 'retry', failed.body.revision)), [429, 'failed', '少し待ってから試してください。']);
  w.f.advance(NOAH_CONNECT_LIMITS.retryAfterMs);
  const answers = [];
  let revision = failed.body.revision;
  for (let press = 0; press < 3; press++) {
    const answer = await user.act(uuid(1), 'retry', revision);
    answers.push(answer.status);
    revision = answer.body.revision ?? answer.body.connection.revision;
  }
  assert.deepEqual(answers, [200, 429, 429]);
  assert.equal(control.attempts, 1, '相手へ向かった握手は 1 回');
  assert.equal(w.rows().length, 1);
  // 5 秒後は通る。
  control.down = false;
  w.f.advance(NOAH_CONNECT_LIMITS.retryAfterMs);
  assert.deepEqual(brief(await user.act(uuid(1), 'retry', revision)), [200, 'connected', null]);
});

void test('other people, other origins and malformed requests', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a'), other = w.as('owner-b'), nobody = w.as(null);
  const connected = await user.connect(familyId(1), uuid(1));
  const plan = (await user.plan(familyId(1))).body.planSha256;
  w.clear();
  // 別の本人の ID は、無い物として扱う。
  assert.deepEqual(brief(await other.get(uuid(1))), [404, null, '接続が見つかりません。']);
  assert.deepEqual(brief(await other.act(uuid(1), 'disconnect', connected.body.revision)), [404, null, '接続が見つかりません。']);
  assert.deepEqual(brief(await other.act(uuid(1), 'retry', connected.body.revision)), [404, null, '接続が見つかりません。']);
  assert.deepEqual(brief(await other.tools(uuid(1))), [404, null, '接続が見つかりません。']);
  assert.deepEqual((await other.list()).body.connections, []);
  // 形の違う ID。
  for (const id of ['x', uuid(1).toUpperCase().replace('0', 'G'), `${uuid(1)}0`]) {
    assert.equal((await user.get(id)).status, 404);
    assert.equal((await user.tools(id)).status, 404);
  }
  // 未サインイン。
  for (const response of [await nobody.connect(familyId(1), uuid(2), plan), await nobody.list(), await nobody.get(uuid(1)), await nobody.act(uuid(1), 'disconnect', 3), await nobody.tools(uuid(1))]) assert.deepEqual(brief(response), [401, null, '保存先を開けませんでした。もう一度お試しください。']);
  // 別の Origin、違う ownerScope、JSON でない本文。
  const body = { id: uuid(2), agentId: familyId(1), planSha256: plan };
  assert.equal((await user.raw(body, { Origin: 'https://elsewhere.test' })).status, 403);
  assert.equal((await user.raw(body, { 'X-Rock-Owner-Scope': await w.as('owner-b').list().then((r) => r.body.ownerScope) })).status, 409);
  assert.equal((await user.raw(body, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await user.act(uuid(1), 'disconnect', connected.body.revision, { Origin: 'https://elsewhere.test' })).status, 403);
  assert.equal((await user.act(uuid(1), 'disconnect', connected.body.revision, { 'X-Rock-Owner-Scope': 'owner-v1:wrong' })).status, 409);
  // 形の違う本文。
  for (const bad of ['{', '[]', 'null', '{}', JSON.stringify({ ...body, extra: 1 }), JSON.stringify({ ...body, id: 'short' }), JSON.stringify({ ...body, planSha256: 'A'.repeat(64) }), JSON.stringify({ ...body, agentId: 'x' }), JSON.stringify({ ...body, agentId: `a\u0000${'b'.repeat(8)}` }), JSON.stringify({ ...body, agentId: 7 })]) {
    assert.equal((await user.raw(bad)).status, 400, bad.slice(0, 60));
  }
  assert.equal((await user.raw(JSON.stringify({ ...body, pad: 'x'.repeat(NOAH_CONNECT_LIMITS.bodyBytes) }))).status, 413);
  for (const bad of [{ action: 'resume', revision: 3 }, { action: 'disconnect', revision: 0 }, { action: 'disconnect', revision: '3' }, { action: 'disconnect' }, { action: 'disconnect', revision: 3, extra: 1 }]) {
    assert.equal((await user.send((request) => user.api.item(request, uuid(1)), 'POST', `/api/noah/connect/${uuid(1)}`, bad)).status, 400, JSON.stringify(bad));
  }
  // 対応しない操作。
  assert.equal((await user.raw(body, {}, 'PUT')).status, 405);
  assert.equal((await user.send((request) => user.api.tools(request, uuid(1)), 'POST', `/api/noah/connect/${uuid(1)}/tools`, {})).status, 405);
  // ここまでで、行は増えず、相手へも送っていない。接続は、そのまま。
  assert.deepEqual([w.rows().length, w.net.hosts.length, (await user.get(uuid(1))).body.state], [1, 0, 'connected']);
});

void test('the tool list is read from the provider each time, and never calls a tool', async (t) => {
  const tools = [
    tool('lookup', true, { description: `Looks things up.\n\n${'Detail. '.repeat(700)}`, inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', description: 'What to look for' } } } }),
    nested('configure'), tool('stats'), tool('publish', false),
  ];
  const server = mcpServer({ tools, session: 'session-1' });
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a');
  const connected = await user.connect(familyId(1), uuid(1));
  w.clear();
  const { status, body, headers } = await user.tools(uuid(1));
  assert.equal(status, 200);
  assert.equal(headers.get('cache-control'), 'no-store, private');
  assert.deepEqual([body.host, body.toolsSha256], [hostOf(1), w.rows()[0].tools_sha256]);
  // 入力欄で使える物が先。その中は、提供者が並べた順。使えない物は、理由と一緒に後ろ。
  assert.deepEqual(body.tools.map((item) => [item.name, item.usable, item.readOnly, item.required, item.needsConfirm, item.form !== null]), [
    ['lookup', true, true, 1, false, true], ['stats', true, true, 0, false, true], ['publish', true, false, 0, true, true], ['configure', false, false, 0, true, false],
  ]);
  assert.equal(body.tools[3].reason, 'complex_input');
  assert.deepEqual(body.tools[0].form.fields.map((field) => [field.name, field.kind, field.required]), [['query', 'text', true]]);
  assert.ok(body.tools[0].summary.length <= 160 && body.tools[0].summary.startsWith('Looks things up.'));
  assert.equal(body.tools[0].description, undefined, '一覧では、説明の全文を返さない');
  for (const item of body.tools) assert.match(item.sha256, HEX);
  // 握手だけ。道具は呼ばない。セッションは閉じる。
  assert.deepEqual(rpcs(server), [...HANDSHAKE, 'DELETE']);
  assert.equal(server.log[0].headers['user-agent'], 'Noah/1 (+https://avoado.si/noah/help#bot)');
  // 使った時刻だけを書く。版（revision）は変えない（切る時に、画面の持っている版が使える）。
  assert.deepEqual([w.rows()[0].last_used_at, w.rows()[0].revision, w.rows()[0].updated_at], [w.f.time(), connected.body.revision, NOW]);
  // 5 秒以内の 2 回目は、相手へ送らずに断る。
  w.f.advance(NOAH_CONNECT_LIMITS.toolsEveryMs - 1);
  assert.deepEqual(brief(await user.tools(uuid(1))), [429, null, '少し待ってから開いてください。']);
  assert.equal(handshakes(server), 1);
  // 道具 1 つを読む: 入力欄の定義と、説明の全文（4,000 文字まで。改行は保つ）。
  w.f.advance(1);
  const one = await user.tools(uuid(1), 'lookup');
  assert.deepEqual([one.status, one.body.tools.length, one.body.tools[0].name, one.body.tools[0].form.usable], [200, 1, 'lookup', true]);
  assert.equal(one.body.tools[0].description, tools[0].description.slice(0, 4_000));
  assert.ok(one.body.tools[0].description.includes('\n\n'));
  w.f.advance(NOAH_CONNECT_LIMITS.toolsEveryMs);
  assert.deepEqual(brief(await user.tools(uuid(1), 'missing_tool')), [404, null, '道具が見つかりません。']);
  assert.equal((await user.tools(uuid(1), 'bad name')).status, 404);
  assert.equal(handshakes(server), 3, '形の違う名前では、相手へ送らない');
  assert.equal(server.log.filter((request) => request.rpc === 'tools/call').length, 0);
  // 本人が確かめた道具（名前と、その時の定義の hash の組）は、確かめ直さない。定義が変われば、確かめ直す。
  const publish = body.tools.find((item) => item.name === 'publish');
  w.f.sql.prepare('UPDATE noah_connections SET confirmed_tools_json=? WHERE id=?').run(JSON.stringify([{ name: 'publish', sha256: publish.sha256 }, { name: 'configure', sha256: 'f'.repeat(64) }]), uuid(1));
  w.f.advance(NOAH_CONNECT_LIMITS.toolsEveryMs);
  assert.deepEqual((await user.tools(uuid(1))).body.tools.filter((item) => item.needsConfirm).map((item) => item.name), ['configure']);
});

void test('a provider with many tools: forms for the first hundred usable tools, the rest one at a time', async (t) => {
  const tools = [nested('first_unusable'), ...Array.from({ length: 130 }, (_, i) => tool(`tool_${String(i).padStart(3, '0')}`)), nested('last_unusable')];
  const server = mcpServer({ tools, pageSize: 50 });
  const w = await world(t, { [hostOf(1)]: server });
  const user = w.as('owner-a');
  await user.connect(familyId(1), uuid(1));
  const { body } = await user.tools(uuid(1));
  assert.equal(body.tools.length, 132);
  const usable = body.tools.filter((item) => item.usable);
  assert.deepEqual([usable.length, usable.filter((item) => item.form !== null).length, body.tools.filter((item) => !item.usable && item.form !== null).length], [130, NOAH_CONNECT_LIMITS.toolForms, 0]);
  assert.deepEqual([usable[99].form !== null, usable[100].form, usable[100].name], [true, null, 'tool_100']);
  // 101 個目は、名前を付けて読む。
  w.f.advance(NOAH_CONNECT_LIMITS.toolsEveryMs);
  const one = await user.tools(uuid(1), 'tool_100');
  assert.deepEqual([one.status, one.body.tools.map((item) => [item.name, item.form.usable])], [200, [['tool_100', true]]]);
});

void test('opening the tool list finds out that the provider changed, and says so', async (t) => {
  const servers = { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer(), [hostOf(3)]: mcpServer() };
  const w = await world(t, servers);
  const user = w.as('owner-a');
  for (const i of [1, 2, 3]) assert.equal((await user.connect(familyId(i), uuid(i))).body.state, 'connected');
  servers[hostOf(1)].options.status = 401;
  servers[hostOf(2)].options.status = 503;
  Object.assign(servers[hostOf(3)].options, { status: 429, statusHeaders: { 'retry-after': '30' } });
  assert.deepEqual(brief(await user.tools(uuid(1))), [409, null, 'この Agent は、相手の許可が要るようになりました。まだ対応していません。']);
  assert.deepEqual(brief(await user.tools(uuid(2))), [502, null, '相手のサーバーが応答しません。時間をおいて試してください。']);
  assert.deepEqual(brief(await user.tools(uuid(3))), [429, null, '相手のサーバーが混んでいます。少し待ってから試してください。']);
  // 401 だけは、その場で一覧から外す。応答しない・混んでいるでは、外さない。
  assert.deepEqual(await w.listed(), [familyId(2), familyId(3)]);
  assert.deepEqual([w.check(1).level, w.check(1).result, w.check(1).checked_at, w.check(2).level, w.check(2).failures, w.check(3).level], [0, 'auth_required', NOW, 1, 0, 1]);
  assert.equal(w.f.sql.prepare('SELECT not_before FROM noah_probe_hosts WHERE host=?').get(hostOf(3)).not_before, w.f.time() + 30_000);
  // 失敗の直後に開き直しても、相手へ送らない（5 秒）。
  const sent = handshakes(servers[hostOf(2)]);
  assert.deepEqual(brief(await user.tools(uuid(2))), [429, null, '少し待ってから開いてください。']);
  assert.equal(handshakes(servers[hostOf(2)]), sent);
});

void test('the patrol checks a family every day while someone is connected to it, every week otherwise', async (t) => {
  const servers = { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer(), [hostOf(3)]: mcpServer(), [hostOf(4)]: mcpServer() };
  const w = await world(t, servers);
  assert.deepEqual([1, 2, 3, 4].map((i) => w.check(i).next_check_at), Array(4).fill(NOW + 7 * DAY));
  // 1: つないでいる。2: つないで、切った。3: つなごうとして、失敗したまま。4: 誰もつないでいない。
  const user = w.as('owner-a');
  await user.connect(familyId(1), uuid(1));
  const second = await user.connect(familyId(2), uuid(2));
  await user.act(uuid(2), 'disconnect', second.body.revision);
  servers[hostOf(3)].options.status = 500;
  assert.equal((await user.connect(familyId(3), uuid(3))).body.state, 'failed');
  servers[hostOf(3)].options.status = undefined;
  w.f.advance(7 * DAY);
  assert.equal(await w.patrol(), 4);
  assert.deepEqual([1, 2, 3, 4].map((i) => (w.check(i).next_check_at - w.f.time()) / DAY), [1, 7, 7, 7]);
  // 系列の行の、つないでいる数の列は、書かない（数を別に持つと、ずれる）。
  assert.deepEqual([1, 2, 3, 4].map((i) => w.family(i).connections), [0, 0, 0, 0]);
});
