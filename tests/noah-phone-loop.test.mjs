// 手元だけの一周（MVP L9）: 取り込む → 見つける → 計画 → つなぐ → 道具 → 頼む 3 種 → 同時 → 動いた → 受け取る → 切る。
// 呼ぶのは、画面が呼ぶのと同じ入口（と、巡回の合図）だけ。表を直に書かない。確かめる時にだけ、表を読む。
// 相手は、この試験の中の合成の接続先。通信はしない。相手が受けた要求を全部記録して、何を何回送ったかを数える。
// 仕様: docs/noah/spec-90-phone-only-loop.md の 3 章（下の「段 n」は、その表の # と同じ）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOAH_ASK_MESSAGES } from '../lib/noah-ask.ts';
import { NOAH_CONNECT_MESSAGES } from '../lib/noah-connect.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { noahToolSha256 } from '../lib/noah-form.ts';
import { createIntakeApi, createIntakeTick } from '../lib/noah-intake-api.ts';
import { NOAH_WAKE, noahWakeSignature } from '../lib/noah-intake-wake.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { normalizeWorkJob } from '../lib/workflow.ts';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid, OPEN, ORIGIN, REGISTRY } from './fixtures/noah/connect-world.mjs';

/** 試験だけの、合図の鍵（32 文字以上）。本物の鍵ではない。 */
const KEY = 'synthetic-wake-test-only-'.repeat(2);
const HANDSHAKE = ['initialize', 'notifications/initialized', 'tools/list'];
/** 道具は 3 つ: 読み取りだけで入力なし／読み取りだけで入力 1 つ／読み取りだけの宣言なし。 */
const stats = tool('stats', true, { description: '件数を返す' });
const lookup = tool('lookup', true, { description: '名前で調べる', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 50 } } } });
const sendNote = tool('send_note', null, { description: 'メモを送る', inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } });
const TOOLS = [stats, lookup, sendNote];
const answer = (params) => (params.name === 'stats' ? { structuredContent: { total: 560 }, content: [{ type: 'text', text: '{"total":560}' }] }
  : params.name === 'lookup' ? { content: [{ type: 'text', text: `${params.arguments.query} は 3 件` }] }
  : { content: [{ type: 'text', text: '送りました' }] });
const rpcs = (server) => server.log.map((request) => request.rpc ?? request.method);
const calls = (server) => server.log.filter((request) => request.rpc === 'tools/call');
/** 画面が、入力欄を開いた時に受け取る値（道具の名前と、その定義の hash）と、本人が打った入力。 */
const form = async (definition, input, extra = {}) => ({ tool: definition.name, input, ...extra, toolSha256: await noahToolSha256({ name: definition.name, description: definition.description ?? '', inputSchema: definition.inputSchema, readOnly: definition.annotations?.readOnlyHint === true }) });
/** 応答の後に続く仕事が、全部終わるのを待つ（途中で増えた分も）。 */
const settle = async (waiting) => { for (let seen = -1; seen !== waiting.length;) { seen = waiting.length; await Promise.all(waiting); } };
/** 一覧（GET /api/noah/intake）を、その人として読む。 */
const list = async (person, query = '') => { const response = await createIntakeApi(person.deps)(new Request(`${ORIGIN}/api/noah/intake${query}`)); return { status: response.status, body: await response.json() }; };
/** 署名の付いた合図を 1 回送る（巡回を起こす専用の Worker が送る物と、同じ形）。 */
async function wake(w, env) {
  const tick = createIntakeTick({ ...w.f.deps, authenticate: async () => { throw Error('UNAUTHORIZED'); }, reviewers: [], flags: parseNoahFlags(env), wakeKey: KEY });
  const timestamp = String(w.f.time());
  const response = await tick(new Request(`${ORIGIN}${NOAH_WAKE.path}`, { method: 'POST', body: '{}', headers: { 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(KEY, timestamp) } }));
  return { status: response.status, body: await response.json() };
}
/** 本人の端末の表（家の端末・その命令・端末に入れた Agent）。スマホだけの一周では、読みも書きもしない。 */
const DEVICE_TABLES = ['noah_runner_devices', 'noah_runner_commands', 'noah_instances'];

void test('the phone-only loop: find, connect with one press, ask three kinds of tools, receive, cut — without a device, a second screen, or a re-read', async (t) => {
  // 相手の、ある道具の呼び出しを、返事をしないまま止められる（段 9 で使う）。
  const hold = {};
  const server = mcpServer({ tools: TOOLS, call: answer, before: async (body) => { const stop = body?.method === 'tools/call' ? hold[body.params.name] : null; if (stop) { stop.reached(); await stop.opened; } } });
  const w = await world(t, { [hostOf(1)]: server }, { sync: false });
  // 端末に入れた Agent の表（別の機能の表）も、同じ DB に置く。一周の間、行が増えない事を見るため。
  w.f.sql.exec(readFileSync(new URL('../drizzle/0038_noah_instances.sql', import.meta.url), 'utf8'));
  const waiting = [], config = { env: { ...OPEN, NOAH_PATROL_ENABLED: 'true' }, waitUntil: (work) => { waiting.push(work); } };
  const visitor = w.as(null, config), a = w.as('owner-a', config);
  const rowsOf = () => Object.fromEntries(DEVICE_TABLES.map((name) => [name, w.f.sql.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n]));
  const before = rowsOf();
  const agent = familyId(1);

  // --- 段 1: 取り込む（署名の付いた合図）。1 回目で、候補が入り、握手も通る。2 回目は、する事が無い。 ---
  assert.deepEqual((await list(visitor)).body.items, []);
  const first = await wake(w, config.env);
  assert.deepEqual([first.status, first.body.seen, first.body.changed, first.body.probe], [200, 1, 1, { probes: 1, ok: 1, authRequired: 0, unreachable: 0, rateLimited: 0, skippedHost: 0, toolsChanged: 0 }]);
  const second = await wake(w, config.env);
  assert.deepEqual([second.status, 'probe' in second.body], [200, false]);
  // 巡回が相手へ送ったのは、握手と、道具の一覧の読み取りだけ（1 回）。外へ出た通信の行き先は、台帳と、その接続先だけ。
  assert.deepEqual(rpcs(server), HANDSHAKE);
  assert.deepEqual([...new Set(w.net.hosts)].sort((x, y) => x.localeCompare(y)), [hostOf(1), REGISTRY].sort((x, y) => x.localeCompare(y)));
  const patrolHandshakes = server.log.filter((request) => request.rpc === 'initialize').length;
  assert.equal(patrolHandshakes, 1);

  // --- 段 2: 見つける（未サインイン）。その系列が 1 件、「まだ誰も動かしていない」の段に出る。 ---
  const found = await list(visitor);
  assert.equal(found.status, 200);
  assert.deepEqual(found.body.items.map((item) => [item.id, item.section, item.oneTap, item.tools, item.host]), [[agent, 'new', true, 3, hostOf(1)]]);
  // 印は「まだ誰も動かしていない」（握手まで）。未サインインの人には、サインインの 1 タップが残る。サインイン済みの人は、タップ 0。
  assert.deepEqual([found.body.items[0].connect.badge, found.body.items[0].connect.taps, found.body.items[0].connect.typed], ['unverified', 1, 0]);
  const mine = (await list(a)).body.items[0].connect;
  assert.deepEqual([mine.badge, mine.taps, mine.typed, mine.place], ['unverified', 0, 0, 'provider']);

  // --- 段 3: 計画。未サインインは「サインイン」の 1 タップ。サインイン済みは、タップ 0・入力 0。 ---
  const todo = (body) => body.steps.filter((step) => step.state !== 'satisfied' || step.fill !== 'auto').map((step) => [step.kind, step.fill, step.label]);
  const visitorPlan = await visitor.plan(agent);
  assert.deepEqual([visitorPlan.status, visitorPlan.body.cost, visitorPlan.body.need, todo(visitorPlan.body)], [200, { taps: 1, typed: 0 }, 'サインイン', [['account', 'tap', 'サインイン']]]);
  const plan = await a.plan(agent);
  assert.deepEqual([plan.status, plan.body.cost, plan.body.need, todo(plan.body), plan.body.sendsTo, plan.body.price], [200, { taps: 0, typed: 0 }, null, [], { host: hostOf(1) }, { model: 'free' }]);
  // 本人が何もしない段だけ（鍵・端末・モデル・外のサービス・追加の同意を、求めない）。
  assert.deepEqual(plan.body.steps.map((step) => step.kind), ['account', 'entitlement', 'place', 'runtime', 'model', 'services', 'secrets', 'consent']);

  // --- 段 4: つなぐ。1 回の要求で connected。相手への要求は、握手だけ（道具は呼ばない）。 ---
  w.clear();
  const connected = await a.connect(agent, uuid(1), plan.body.planSha256);
  assert.deepEqual([connected.status, connected.body.state, connected.body.place], [200, 'connected', 'provider']);
  assert.deepEqual(rpcs(server), HANDSHAKE);
  const connectionId = uuid(1);

  // --- 段 5: 道具。3 つ。stats は必須の入力が 0、send_note は、最初の 1 回の確かめが要る。 ---
  const menu = await a.tools(connectionId);
  assert.equal(menu.status, 200);
  assert.deepEqual(menu.body.tools.map((item) => [item.name, item.usable, item.readOnly, item.required, item.needsConfirm]),
    [['stats', true, true, 0, false], ['lookup', true, true, 1, false], ['send_note', true, false, 1, true]]);
  assert.equal(calls(server).length, 0);

  // --- 段 6: 頼む（押すだけ）。202。この後、読み直しを 1 回も呼ばずに、Work に成果が入る（閉じても進む）。 ---
  const pressed = await a.ask({ id: uuid(10), connectionId, form: await form(stats, {}), screen: 'narrow' });
  assert.deepEqual([pressed.status, pressed.body.state], [202, 'queued']);
  await settle(waiting);
  const job = (n) => normalizeWorkJob(w.work(w.asked('id=?', uuid(n))[0].work_id));
  assert.deepEqual([w.asked('id=?', uuid(10))[0].state, job(10).noahRemote.state, job(10).noahRemote.result.text], ['succeeded', 'returned', '{"total":560}']);

  // --- 段 7: 頼む（入力あり）。成果に、送った値が返っている。相手が受けた物に、本人の ID が無い。 ---
  await a.ask({ id: uuid(11), connectionId, form: await form(lookup, { query: 'コバルト' }), screen: 'narrow' });
  await settle(waiting);
  assert.deepEqual([w.asked('id=?', uuid(11))[0].state, job(11).noahRemote.result.text], ['succeeded', 'コバルト は 3 件']);
  assert.deepEqual(calls(server).at(-1).body.params, { name: 'lookup', arguments: { query: 'コバルト' } });

  // --- 段 8: 頼む（確かめ）。確かめ無しは「失敗」で、相手を呼ばない。確かめ有りは、成果。 ---
  const callsBefore = calls(server).length;
  await a.ask({ id: uuid(12), connectionId, form: await form(sendNote, { text: 'こんにちは' }), screen: 'narrow' });
  await settle(waiting);
  assert.deepEqual([w.asked('id=?', uuid(12))[0].state, w.asked('id=?', uuid(12))[0].error, calls(server).length], ['failed', NOAH_ASK_MESSAGES.needsConfirm, callsBefore]);
  await a.ask({ id: uuid(13), connectionId, form: await form(sendNote, { text: 'こんにちは' }, { confirm: true }), screen: 'narrow' });
  await settle(waiting);
  assert.deepEqual([w.asked('id=?', uuid(13))[0].state, job(13).noahRemote.result.text, calls(server).length], ['succeeded', '送りました', callsBefore + 1]);

  // --- 段 9: 同時。2 件を、待たずに続けて送る。1 件が、もう 1 件を待たせない（先の 1 件を、相手の所で止めておく）。 ---
  let open, reached;
  hold.stats = { opened: new Promise((resolve) => { open = resolve; }), arrived: new Promise((resolve) => { reached = resolve; }), reached: () => reached() };
  const [slow, quick] = await Promise.all([
    a.ask({ id: uuid(14), connectionId, form: await form(stats, {}), screen: 'narrow' }),
    a.ask({ id: uuid(15), connectionId, form: await form(lookup, { query: '二つ目' }), screen: 'narrow' }),
  ]);
  assert.deepEqual([slow.status, quick.status], [202, 202]);
  await hold.stats.arrived;
  // 後から頼んだ方が、先に終わる（先の 1 件は、まだ相手の所）。
  for (let turn = 0; turn < 200 && w.asked('id=?', uuid(15))[0].state !== 'succeeded'; turn++) await new Promise((resolve) => { setImmediate(resolve); });
  assert.deepEqual([w.asked('id=?', uuid(14))[0].state, w.asked('id=?', uuid(15))[0].state], ['running', 'succeeded']);
  delete hold.stats;
  open();
  await settle(waiting);
  assert.deepEqual([w.asked('id=?', uuid(14))[0].state, w.asked('id=?', uuid(15))[0].state], ['succeeded', 'succeeded']);

  // --- 段 10: 動いた。同じ系列が、「動いた」の段に出る。印は「1 クリック」。 ---
  const ran = (await list(a)).body.items;
  assert.deepEqual(ran.map((item) => [item.id, item.section, item.connect.badge, item.connect.level]), [[agent, 'ran', 'one_click', 2]]);

  // --- 段 11: 受け取る。読んだ成果が、Work に入った成果と同じ。Work は確認待ちで、通った step が無い。 ---
  const received = await a.askGet(uuid(11));
  assert.deepEqual([received.status, received.body.state, received.body.result, received.body.note], [200, 'succeeded', job(11).noahRemote.result, `${hostOf(1)} の lookup が返した内容です。費用 0。`]);
  assert.deepEqual([job(11).status, job(11).steps.map((step) => step.passed), job(11).noahRemote.verification, job(11).noahRemote.chargeMinor], ['review', [false], 'relay_observed_unverified', 0]);
  const history = await a.asks(connectionId);
  assert.deepEqual(history.body.asks.map((ask) => ask.state).sort((x, y) => x.localeCompare(y)), ['failed', 'succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded']);

  // --- 段 15: 送った数（切る前に数える。試験の時計は、止めたまま）。 ---
  // 利用者の操作から始めた握手は、接続 1・道具の一覧 1・依頼 6 の 8 回。相手が受けた握手は、巡回の 1 回を足した 9 回。
  const host = w.f.sql.prepare('SELECT user_count, not_before FROM noah_probe_hosts WHERE host=?').get(hostOf(1));
  assert.deepEqual([host.user_count, host.not_before], [8, 0]);
  assert.equal(patrolHandshakes + server.log.filter((request) => request.rpc === 'initialize').length, 9);
  // 道具を呼んだのは、成果が返った依頼の数と同じ 5 回（確かめ無しの 1 件は、呼んでいない）。
  assert.deepEqual(calls(server).map((request) => request.body.params.name).sort((x, y) => x.localeCompare(y)), ['lookup', 'lookup', 'send_note', 'stats', 'stats']);

  // --- 段 14: 手数。接続は、タップ 0・入力 0（計画のとおり）。頼む時に相手へ送ったのは、道具の項目だけ。 ---
  const sent = calls(server).map((request) => JSON.stringify(request.body.params.arguments)).sort((x, y) => x.localeCompare(y));
  assert.deepEqual(sent, [{}, {}, { query: 'コバルト' }, { query: '二つ目' }, { text: 'こんにちは' }].map((value) => JSON.stringify(value)).sort((x, y) => x.localeCompare(y)));
  for (const request of calls(server)) assert.deepEqual(Object.keys(request.body.params), ['name', 'arguments']);
  // 相手が受けたどの要求にも、本人の ID・本人の範囲の印・操作の ID が無い。
  const scope = await ownerScopeFor('owner-a');
  for (const request of server.log) for (const secret of ['owner-a', scope, uuid(1), uuid(10)]) assert.equal(JSON.stringify([request.url, request.headers, request.body]).includes(secret), false, secret);

  // --- 段 12: 切る。「つながっているもの」が空になる。Work は残る。新しい依頼は、受け付けない。 ---
  const works = w.f.sql.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n;
  assert.equal(works, 6);
  const cut = await a.act(connectionId, 'disconnect', (await a.get(connectionId)).body.revision);
  assert.deepEqual([cut.status, cut.body.state], [200, 'disconnected']);
  assert.deepEqual((await a.list()).body.connections, []);
  assert.equal(w.f.sql.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, works);
  const late = await a.ask({ id: uuid(16), connectionId, form: await form(stats, {}), screen: 'narrow' });
  assert.deepEqual([late.status, late.body.error], [409, NOAH_CONNECT_MESSAGES.notConnected]);
  // 切った後も、成果は読める。その Agent の「仕事」（GET /api/noah/ask?agent=）には、切った接続の依頼が、全部残っている。
  assert.equal((await a.askGet(uuid(10))).body.result.text, '{"total":560}');
  const kept = await a.asksOf(agent);
  assert.deepEqual([kept.status, kept.body.asks.length, kept.body.asks.filter((ask) => ask.state === 'succeeded').length], [200, 6, 5]);
  // 未サインインの人には、何も返さない（401）。別の人には、その人の依頼だけ（ここでは 0 件）。
  assert.deepEqual([(await visitor.asksOf(agent)).status, (await w.as('owner-b', config).asksOf(agent)).body.asks], [401, []]);

  // --- 段 13: 端末の表。一周の前と後で、行の数が変わらない。一周の間、その表を読みも書きもしていない。 ---
  assert.deepEqual(rowsOf(), before);
  assert.deepEqual(before, { noah_runner_devices: 0, noah_runner_commands: 0, noah_instances: 0 });
  assert.deepEqual(w.f.queries.filter((query) => /noah_runner_|noah_instances/.test(query)), []);
  // つないだ後の通信の行き先は、その接続先だけ（台帳は、巡回の合図の時だけ）。
  assert.deepEqual([...new Set(w.net.hosts)], [hostOf(1)]);
});

void test('the same loop with the switches closed: the list is not there, and connecting and asking are refused before the provider is contacted', async (t) => {
  const server = mcpServer({ tools: TOOLS, call: answer });
  const w = await world(t, { [hostOf(1)]: server }, { sync: false });
  const waiting = [], waitUntil = (work) => { waiting.push(work); };
  const opened = { env: { ...OPEN, NOAH_PATROL_ENABLED: 'true' }, waitUntil };
  assert.equal((await wake(w, opened.env)).status, 200);
  const a = w.as('owner-a', opened), agent = familyId(1);
  const plan = (await a.plan(agent)).body.planSha256;
  assert.equal((await a.connect(agent, uuid(1), plan)).body.state, 'connected');
  w.clear();

  // 一覧を閉じる（NOAH_INTAKE_PUBLIC）: 段 2 が 404。計画も 404。
  const hidden = { env: { NOAH_ASK_FORM: 'true' }, waitUntil };
  assert.deepEqual([(await list(w.as(null, hidden))).status, (await list(w.as('owner-b', hidden))).status, (await w.as('owner-b', hidden).plan(agent)).status], [404, 404, 404]);
  // 接続と依頼を閉じる（NOAH_ASK_FORM）: 段 4 と段 6 が 503。一覧は、見える。
  const closed = { env: { NOAH_INTAKE_PUBLIC: 'true' }, waitUntil };
  assert.equal((await list(w.as(null, closed))).status, 200);
  const refusedConnect = await w.as('owner-b', closed).connect(agent, uuid(2), plan);
  assert.deepEqual([refusedConnect.status, refusedConnect.body.error], [503, NOAH_CONNECT_MESSAGES.closed]);
  const refusedAsk = await w.as('owner-a', closed).ask({ id: uuid(10), connectionId: uuid(1), form: await form(stats, {}), screen: 'narrow' });
  assert.deepEqual([refusedAsk.status, refusedAsk.body.error], [503, NOAH_ASK_MESSAGES.closed]);
  // どちらも、行ができず、相手へも送っていない。巡回を閉じた合図は、何もしない。
  await settle(waiting);
  assert.deepEqual([w.rows().length, w.asked().length, server.log.length, w.net.hosts], [1, 0, 0, []]);
  assert.deepEqual(await wake(w, closed.env), { status: 200, body: { disabled: true } });
  assert.deepEqual(w.net.hosts.filter((name) => name !== REGISTRY), []);
});
