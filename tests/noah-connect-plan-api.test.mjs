// 接続計画の API（GET /api/noah/connect-plan?agent=<系列の ID>）。ローンチで出る印・未サインイン・無い系列・載せていない系列・切り替え・書き込まない事。
// 通信はしない。台帳も接続先も、この試験の中の関数（合成のサーバー）。
// 仕様: docs/noah/spec-96-connect-plan.md の 5.1・9.2・9.3・9.4・9.5。
import test from 'node:test';
import assert from 'node:assert/strict';
import { entry } from './fixtures/noah/intake.mjs';
import { mcpServer } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid, handshakes } from './fixtures/noah/connect-world.mjs';

/** 人が動かして成果が返った物（「動いた」）にする。L6 が入るまでは、表を直に書く。 */
const markRan = (w, i) => {
  w.f.sql.prepare('UPDATE noah_intake_checks SET level=2,l2_at=? WHERE candidate_id=?').run(w.f.time(), familyId(i));
  w.f.sql.prepare("UPDATE noah_intake_families SET level=2,l2_at=?,badge_hint='one_click' WHERE id=?").run(w.f.time(), familyId(i));
};
const counts = (w) => Object.fromEntries(['noah_connections', 'noah_intake_candidates', 'noah_intake_checks', 'noah_intake_families', 'noah_probe_hosts', 'noah_runner_commands']
  .map((table) => [table, w.f.sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));

void test('the four badges of the launch: signed in or not, ran or only handshaken', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer() });
  markRan(w, 2);
  const pick = ({ status, body }) => [status, body.badge, body.cost, body.need, body.place, body.placeLabel];
  // 握手まで（L1）: 「まだ誰も動かしていない」。押せる。サインイン済みなら、タップ 0。
  assert.deepEqual(pick(await w.as('owner-a').plan(familyId(1))), [200, 'unverified', { taps: 0, typed: 0 }, null, 'provider', `相手のサーバー（${hostOf(1)}）`]);
  assert.deepEqual(pick(await w.as(null).plan(familyId(1))), [200, 'unverified', { taps: 1, typed: 0 }, 'サインイン', 'provider', `相手のサーバー（${hostOf(1)}）`]);
  // 動いた（L2）: サインイン済みは「1 クリック」。未サインインは「あと 1 タップ（サインイン）」。
  assert.deepEqual(pick(await w.as('owner-a').plan(familyId(2))), [200, 'one_click', { taps: 0, typed: 0 }, null, 'provider', `相手のサーバー（${hostOf(2)}）`]);
  assert.deepEqual(pick(await w.as(null).plan(familyId(2))), [200, 'taps', { taps: 1, typed: 0 }, 'サインイン', 'provider', `相手のサーバー（${hostOf(2)}）`]);
});

void test('the response carries what the screen shows before connecting, and nothing is written', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer() });
  const before = counts(w), batches = w.f.batches.length;
  w.f.queries.length = 0;
  const { status, body, headers } = await w.as('owner-a').plan(familyId(1));
  assert.equal(status, 200);
  assert.equal(headers.get('cache-control'), 'no-store, private');
  assert.deepEqual(Object.keys(body).sort((a, b) => a.localeCompare(b)), ['agentId', 'badge', 'connectSha256', 'cost', 'deviceId', 'digest', 'need', 'note', 'ownerScope', 'place', 'placeLabel', 'planSha256', 'price', 'sendsTo', 'steps']);
  assert.deepEqual([body.agentId, body.digest, body.connectSha256, body.deviceId, body.note], [familyId(1), w.f.candidate(1).record_sha256, w.check(1).connect_sha256, null, null]);
  // 送り先（入力が送られる host）と料金は、つなぐ前に出す。
  assert.deepEqual([body.sendsTo, body.price], [{ host: hostOf(1) }, { model: 'free' }]);
  assert.match(body.planSha256, /^[a-f0-9]{64}$/);
  assert.match(body.ownerScope, /^owner-v1:[a-f0-9]{64}$/);
  assert.deepEqual(body.steps.map((step) => [step.kind, step.state]), [['account', 'satisfied'], ['entitlement', 'satisfied'], ['place', 'satisfied'], ['runtime', 'satisfied'], ['model', 'satisfied'], ['services', 'satisfied'], ['secrets', 'satisfied'], ['consent', 'satisfied']]);
  // 未サインインの計画は、足りない物（サインイン）が違うので、hash も違う。本人を表す値は返さない。
  const anonymous = await w.as(null).plan(familyId(1));
  assert.equal(anonymous.body.ownerScope, null);
  assert.notEqual(anonymous.body.planSha256, body.planSha256);
  assert.deepEqual(anonymous.body.steps[0], { kind: 'account', fill: 'tap', state: 'needed', label: 'サインイン' });
  // 読むだけ。表の行数は変わらず、書く文は 1 つも出ていない。相手へも送っていない。
  assert.deepEqual(counts(w), before);
  assert.equal(w.f.batches.length, batches);
  assert.ok(w.f.queries.length > 0 && w.f.queries.every((query) => /^\s*SELECT\b/.test(query)), w.f.queries.join('\n'));
  assert.deepEqual(w.net.hosts, []);
});

void test('the badge on a list item is the badge of the plan', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer() });
  markRan(w, 2);
  for (const user of [null, 'owner-a']) {
    const items = (await w.f.store.list(user, new URLSearchParams())).items;
    assert.equal(items.length, 2);
    for (const item of items) {
      const { body } = await w.as(user).plan(item.id);
      assert.deepEqual([item.connect.badge, item.connect.taps, item.connect.typed, item.connect.place, item.connect.placeLabel, item.connect.need], [body.badge, body.cost.taps, body.cost.typed, body.place, body.placeLabel, body.need], `${item.id} ${user}`);
    }
  }
});

void test('unknown families are 404; families that are not listed are 422 and are never contacted', async (t) => {
  const keyed = entry(2, { remotes: [{ type: 'streamable-http', url: `https://${hostOf(2)}/mcp`, headers: [{ name: 'X-Api-Key', isRequired: true, isSecret: true }] }] });
  const bulk = Array.from({ length: 20 }, (_, i) => entry(100 + i, { remotes: [{ type: 'streamable-http', url: `https://shared.example.com/mcp/${i}` }] }));
  const servers = { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer(), [hostOf(3)]: mcpServer({ status: 401 }), [hostOf(4)]: mcpServer(), [hostOf(5)]: mcpServer(), 'shared.example.com': mcpServer() };
  const records = [entry(1), keyed, ...bulk, entry(3), entry(4)];
  const w = await world(t, servers, { records: [...records, entry(5)] });
  // 運営が取り下げた系列。
  const detail = await w.f.store.detail(familyId(4), null, true);
  await w.f.store.moderate('withdraw', familyId(4), detail.revision);
  // 載っていた物が、台帳で取り下げになる（次の、毎時の巡回で分かる）。
  assert.equal((await w.as('owner-a').plan(familyId(5))).status, 200);
  w.f.advance(3_600_000);
  await w.sync([...records, entry(5, {}, 'deleted')]);
  w.clear();
  const user = w.as('owner-a');
  assert.equal((await user.plan(familyId(1))).status, 200);
  for (const agent of [familyId(99), 'research-8782e21ebeda898af4b7', 'x', '', 'a'.repeat(401)]) {
    const { status, body } = await user.plan(agent);
    assert.deepEqual([status, body.error], [404, 'Agentが見つかりません。'], agent);
  }
  // 鍵の要る物・量産・相手の許可が要る物・取り下げた系列・台帳で取り下げになった記録。
  const bulkFamily = w.f.sql.prepare("SELECT id FROM noah_intake_families WHERE id LIKE 'bulk:%'").get().id;
  for (const agent of [familyId(2), bulkFamily, familyId(3), familyId(4), familyId(5)]) {
    const { status, body } = await user.plan(agent);
    assert.deepEqual([status, body], [422, { error: 'この Agent は、今はつなげません。' }], agent);
  }
  assert.deepEqual(w.net.hosts, [], '計画を読むだけでは、相手へ送らない');
  assert.equal(handshakes(servers[hostOf(1)]), 0);
});

void test('while the list is closed the plan is hidden from everyone but reviewers', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer() }, { env: {} });
  for (const user of [null, 'owner-a']) assert.deepEqual(await w.as(user).plan(familyId(1)).then(({ status, body }) => [status, body]), [404, { error: '見つかりません。' }]);
  assert.equal((await w.as('reviewer', { reviewers: ['reviewer'] }).plan(familyId(1))).status, 200);
  // 一覧だけを開けた時（接続と依頼は閉）: 計画は読める。つなぐ方が 503 を返す。
  const listOnly = w.as('owner-a', { env: { NOAH_INTAKE_PUBLIC: 'true' } });
  assert.equal((await listOnly.plan(familyId(1))).status, 200);
  assert.equal((await listOnly.connect(familyId(1), uuid(1))).status, 503);
});

void test('only GET is accepted, and what the owner consented to before is read from the live connection', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer() });
  const user = w.as('owner-a');
  const posted = await user.send(user.planApi, 'POST', `/api/noah/connect-plan?agent=${encodeURIComponent(familyId(1))}`, {});
  assert.equal(posted.status, 405);
  // つないだ後も、同じ計画が読める（同じ系列の切っていない接続の、同意した接続要件を照らす）。
  const first = await user.plan(familyId(1));
  const connected = await user.connect(familyId(1), uuid(1));
  assert.deepEqual([connected.status, connected.body.state], [200, 'connected']);
  const after = await user.plan(familyId(1));
  assert.deepEqual([after.status, after.body.planSha256, after.body.badge], [200, first.body.planSha256, 'unverified']);
});
