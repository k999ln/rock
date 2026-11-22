// 見回りを保つ（MVP L7）: 後始末（実行の途中で落ちた依頼・始まらなかった依頼・つなぐ途中で止まった接続）、つながると確かめた数、一覧の条件。
// 通信はしない。台帳も接続先も、この試験の中の関数（合成のサーバー）。相手が受けた要求を記録して、後始末が何も送らない事を確かめる。
// 仕様: docs/noah/spec-88-mass-probe.md の 9.5・9.6・9.9。
//
// 9.9 の表の行と、その試験がある所:
// - 見回りの間隔／1 回の失敗／2 回続けて失敗／混んでいる／定義が変わった（握手の表）／量産／host の間隔 … tests/noah-probe.test.mjs
// - 動いたを付ける／動かし直しても上がらない … tests/noah-ask.test.mjs
// - 並びの引き直し／取り下げ … tests/noah-intake-store.test.mjs
// - 一覧の条件／相手のエラーは数えない／定義が変わっても接続は止めない／後始末／つながると確かめた数 … この file
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNoahAskService, NOAH_ASK_RUN_LIMITS } from '../lib/noah-ask.ts';
import { NOAH_ASK_END_MESSAGES, NOAH_ASK_LEASE_GRACE_MS, NOAH_ASK_STOP_MESSAGES } from '../lib/noah-ask-store.ts';
import * as askView from '../lib/noah-ask-view.ts';
import * as botNotice from '../lib/noah-bot-notice.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import * as formLib from '../lib/noah-form.ts';
import { createIntakeTick } from '../lib/noah-intake-api.ts';
import { intakeStatement } from '../lib/noah-intake-db.ts';
import { NOAH_REGROUP_SQL } from '../lib/noah-intake-family.ts';
import { noahListing, NOAH_LISTING_REASONS, NOAH_LISTING_SQL } from '../lib/noah-intake-listing.ts';
import { noahWakeSignature } from '../lib/noah-intake-wake.ts';
import * as view from '../lib/noah-ready-view.ts';
import * as surface from '../lib/noah-surface.ts';
import { createNoahSweep, noSweep, NOAH_SWEEP_CONNECTING_MESSAGE, NOAH_SWEEP_LIMITS, NOAH_SWEEP_SQL } from '../lib/noah-sweep.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import { normalizeWorkJob } from '../lib/workflow.ts';
import { fixture } from './fixtures/noah/intake.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid } from './fixtures/noah/connect-world.mjs';
import { screen } from './fixtures/noah/screen.mjs';

const NONE = noSweep();
/** 実行の場が持つ時間（lease）と、その後に待つ時間。これを過ぎた `running` の依頼を、止まった物として片付ける。 */
const LEASE_GONE = NOAH_ASK_RUN_LIMITS.leaseMs + NOAH_ASK_LEASE_GRACE_MS;
const lookup = (extra = {}) => tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } }, ...extra });
const calls = (server) => server.log.filter((request) => request.rpc === 'tools/call');
/** 画面が、入力欄を開いた時に受け取る値（道具の名前と、その定義の hash）。 */
const form = async (definition, input) => ({ tool: definition.name, input, toolSha256: await formLib.noahToolSha256({ name: definition.name, description: definition.description ?? '', inputSchema: definition.inputSchema, readOnly: definition.annotations?.readOnlyHint === true }) });

/** 相手が、ある要求の所で、返事をしないまま止まる（実行の場が落ちた時と、同じ状態になる）。open() で、返事をする。 */
function gate() {
  let open, reached;
  const opened = new Promise((resolve) => { open = resolve; }), arrived = new Promise((resolve) => { reached = resolve; });
  return { opened, arrived, open, reached };
}
/** hold[要求の名前] に gate を置くと、その要求で止まる、合成のサーバー。外した後に来た要求は、止まらない。 */
function holding(options = {}) {
  const hold = {};
  const server = mcpServer({ ...options, before: async (body) => { const stop = hold[body?.method]; if (stop) { stop.reached(); await stop.opened; } } });
  return { server, hold };
}
/** 止めていた要求に、返事をする。 */
const release = (hold, method) => { const stop = hold[method]; delete hold[method]; stop.open(); };
/** 応答の後に続く仕事が、全部終わるのを待つ（途中で増えた分も）。 */
const settle = async (waiting) => { for (let seen = -1; seen !== waiting.length;) { seen = waiting.length; await Promise.all(waiting); } };

/** owner-a が、Agent 1 へつないである世界。応答の後に続く仕事は、waiting に預かる（待たずに、応答が返る）。 */
async function connected(t, server, servers = {}) {
  const w = await world(t, { [hostOf(1)]: server, ...servers });
  const waiting = [], a = w.as('owner-a', { waitUntil: (work) => { waiting.push(work); } });
  const made = await a.connect(familyId(1), uuid(1));
  assert.equal(made.body.state, 'connected');
  await settle(waiting);
  w.clear();
  const ask = async (n, definition) => {
    w.f.advance(7_000);
    const reply = await a.ask({ id: uuid(n), connectionId: uuid(1), form: await form(definition, { query: 'q' }) });
    assert.equal(reply.status, 202, JSON.stringify(reply.body));
    return reply;
  };
  const row = (n) => w.asked('id=?', uuid(n))[0];
  const job = (n) => normalizeWorkJob(w.work(row(n).work_id));
  return { w, a, waiting, ask, row, job, connectionId: uuid(1), sweep: createNoahSweep(w.f.deps) };
}

void test('cleanup: a run that died before sending is failed (nothing was sent; ask again), one that died after sending is unknown, and a late run changes nothing', async (t) => {
  const definition = lookup(), { server, hold } = holding({ tools: [definition] });
  const { w, waiting, ask, row, job, sweep } = await connected(t, server);

  // 握手の途中で、実行の場が落ちた（道具の呼び出しは、送っていない）。
  hold['tools/list'] = gate();
  await ask(10, definition);
  await hold['tools/list'].arrived;
  assert.deepEqual([row(10).state, row(10).tool_calls, row(10).lease_until], ['running', 0, w.f.time() + NOAH_ASK_RUN_LIMITS.leaseMs]);
  // lease を過ぎても、少しの間は待つ（終わり際に書かれる成果を、先に片付けない）。
  w.f.advance(LEASE_GONE - 1_000);
  assert.deepEqual(await sweep(), NONE);
  assert.equal(row(10).state, 'running');
  w.f.advance(2_000);
  const received = server.log.length;
  assert.deepEqual(await sweep(), { ...NONE, asksFailed: 1 });
  assert.deepEqual([row(10).state, row(10).error, row(10).tool_calls, row(10).lease_until, row(10).finished_at], ['failed', NOAH_ASK_END_MESSAGES.interrupted, 0, 0, w.f.time()]);
  assert.deepEqual([job(10).status, job(10).noahRemote.state, job(10).noahRemote.error, job(10).noahRemote.toolCalls, job(10).noahRemote.result], ['review', 'failed', NOAH_ASK_END_MESSAGES.interrupted, 0, undefined]);
  // 後始末は、相手へ何も送らない。もう一度呼んでも、何も変えない。
  assert.equal(server.log.length, received);
  assert.deepEqual(await sweep(), NONE);
  // 遅れて動いた実行の場は、道具を呼ばない（「送っていません」と出した後に、送られる事が無い）。
  release(hold, 'tools/list');
  await settle(waiting);
  assert.deepEqual([calls(server).length, row(10).state, row(10).error, row(10).tool_calls], [0, 'failed', NOAH_ASK_END_MESSAGES.interrupted, 0]);

  // 相手へ送った後に、実行の場が落ちた: 実行されたかどうかが、分からない。
  hold['tools/call'] = gate();
  await ask(11, definition);
  await hold['tools/call'].arrived;
  assert.deepEqual([row(11).state, row(11).tool_calls], ['running', 1]);
  w.f.advance(LEASE_GONE + 1_000);
  assert.deepEqual(await sweep(), { ...NONE, asksUnknown: 1 });
  assert.deepEqual([row(11).state, row(11).error, row(11).tool_calls, row(11).lease_until], ['unknown', NOAH_ASK_END_MESSAGES.unknown, 1, 0]);
  assert.deepEqual([job(11).status, job(11).noahRemote.state, job(11).noahRemote.used, job(11).noahRemote.toolCalls, job(11).noahRemote.result], ['review', 'unknown', ['lookup'], 1, undefined]);
  // 遅れて届いた成果は、採らない。呼び直しもしない。
  release(hold, 'tools/call');
  await settle(waiting);
  assert.deepEqual([calls(server).length, row(11).state, job(11).noahRemote.result], [1, 'unknown', undefined]);
  // 失敗・結果不明で終わった依頼は、「動いた」に数えない。
  assert.equal(w.family(1).level, 1);
  // 片付けた後は、また頼める（終わっていない依頼の上限に、残らない）。
  await ask(12, definition);
  await settle(waiting);
  assert.deepEqual([row(12).state, calls(server).length, w.family(1).level], ['succeeded', 2, 2]);
});

void test('cleanup: asks that were asked to stop end as stopped; an ask that never started fails after a minute; stopping an ask whose run is gone ends it at once', async (t) => {
  const definition = lookup(), { server, hold } = holding({ tools: [definition] });
  const { w, a, waiting, ask, row, job, connectionId, sweep } = await connected(t, server);

  // 送った後に、実行の場が落ちた。本人は、その前に「止める」を押していた。
  hold['tools/call'] = gate();
  await ask(10, definition);
  await hold['tools/call'].arrived;
  const requested = await a.askStop(uuid(10), row(10).revision);
  assert.deepEqual([requested.status, requested.body.state, requested.body.stopRequested], [200, 'running', true]);
  w.f.advance(LEASE_GONE + 1_000);
  assert.deepEqual(await sweep(), { ...NONE, asksStopped: 1 });
  assert.deepEqual([row(10).state, row(10).error, row(10).tool_calls, job(10).status, job(10).noahRemote.state], ['stopped', NOAH_ASK_STOP_MESSAGES.stoppedAfterCall, 1, 'cancelled', 'cancelled']);
  release(hold, 'tools/call');
  await settle(waiting);
  assert.deepEqual([row(10).state, job(10).noahRemote.result], ['stopped', undefined]);

  // 送る前に落ちていて、「止める」が押されていた: 「止めました。」（理由は空）。
  hold['tools/list'] = gate();
  await ask(11, definition);
  await hold['tools/list'].arrived;
  await a.askStop(uuid(11), row(11).revision);
  w.f.advance(LEASE_GONE + 1_000);
  assert.deepEqual(await sweep(), { ...NONE, asksStopped: 1 });
  assert.deepEqual([row(11).state, row(11).error, row(11).tool_calls, job(11).noahRemote.error], ['stopped', null, 0, NOAH_ASK_STOP_MESSAGES.stopped]);
  release(hold, 'tools/list');
  await settle(waiting);
  assert.equal(calls(server).length, 1);

  // 実行の場が無くなった依頼を「止める」: 止める事を頼むだけで終わらせず、その場で止める（巡回の合図を待たない）。
  hold['tools/list'] = gate();
  await ask(12, definition);
  await hold['tools/list'].arrived;
  w.f.advance(LEASE_GONE + 1_000);
  const stopped = await a.askStop(uuid(12), row(12).revision);
  assert.deepEqual([stopped.status, stopped.body.state, stopped.body.stopRequested, stopped.body.error], [200, 'stopped', false, undefined]);
  assert.deepEqual([job(12).status, job(12).noahRemote.state], ['cancelled', 'cancelled']);
  assert.deepEqual(await sweep(), NONE);
  release(hold, 'tools/list');
  await settle(waiting);
  assert.equal(calls(server).length, 1);

  // 受け付けた後、実行が始まらなかった依頼（応答の後の仕事が、動かなかった）。相手へは送っていないので、「失敗」。
  w.f.advance(7_000);
  const accepted = await createNoahAskService(a.deps).ask('owner-a', false, { id: uuid(13), connectionId, ...(await form(definition, { query: 'q' })), confirm: false, screen: null });
  assert.equal(accepted.status, 202);
  w.f.advance(NOAH_SWEEP_LIMITS.queuedMs - 1_000);
  assert.deepEqual(await sweep(), NONE);
  w.f.advance(2_000);
  const received = server.log.length;
  assert.deepEqual(await sweep(), { ...NONE, asksFailed: 1 });
  assert.deepEqual([row(13).state, row(13).error, row(13).tool_calls, job(13).status, job(13).noahRemote.state], ['failed', NOAH_ASK_END_MESSAGES.notStarted, 0, 'review', 'failed']);
  // その後で、実行の場が動いても、何も送らない。
  await accepted.run();
  await settle(waiting);
  assert.equal(server.log.length, received);
});

void test('cleanup: a connection that stopped half-way is cut after thirty seconds; the person can connect again; a late handshake does not bring it back', async (t) => {
  const { server, hold } = holding({ tools: [lookup()] }), refusing = mcpServer();
  const w = await world(t, { [hostOf(1)]: server, [hostOf(2)]: refusing });
  const waiting = [], a = w.as('owner-a', { waitUntil: (work) => { waiting.push(work); } }), sweep = createNoahSweep(w.f.deps);
  // 握手の途中で、つなぐ要求が止まる（応答が返らない）。
  hold.initialize = gate();
  const hung = a.connect(familyId(1), uuid(1));
  await hold.initialize.arrived;
  assert.deepEqual(w.rows().map((row) => [row.state, row.revision]), [['probing', 2]]);
  w.f.advance(NOAH_SWEEP_LIMITS.connectingMs - 1_000);
  assert.deepEqual(await sweep(), NONE);
  w.f.advance(2_000);
  const received = server.log.length;
  assert.deepEqual(await sweep(), { ...NONE, connections: 1 });
  assert.deepEqual(w.rows().map((row) => [row.state, row.error, row.revision, row.disconnected_at]), [['disconnected', NOAH_SWEEP_CONNECTING_MESSAGE, 3, w.f.time()]]);
  assert.equal(server.log.length, received);
  // 本人は、もう一度つなげる（新しい操作）。
  const stuck = hold.initialize;
  delete hold.initialize;
  w.f.advance(7_000);
  assert.equal((await a.connect(familyId(1), uuid(2))).body.state, 'connected');
  // 遅れて返った握手は、切った行を戻さない。その要求の応答は、今の行（切れている。理由つき）。
  stuck.open();
  const answer = await hung;
  assert.deepEqual([answer.status, answer.body.state, answer.body.error], [200, 'disconnected', NOAH_SWEEP_CONNECTING_MESSAGE]);
  await settle(waiting);
  assert.deepEqual(w.rows().map((row) => row.state), ['disconnected', 'connected']);

  // 後始末が触らない物: つながっている接続・失敗した接続・切った接続。どれだけ時間がたっても、変えない。
  refusing.options.status = 503;
  w.f.advance(7_000);
  assert.equal((await a.connect(familyId(2), uuid(3))).body.state, 'failed');
  const before = w.rows().map((row) => [row.id, row.state, row.revision]);
  w.f.advance(86_400_000);
  assert.deepEqual(await sweep(), NONE);
  assert.deepEqual(w.rows().map((row) => [row.id, row.state, row.revision]), before);
});

void test('cleanup: at most fifty of each kind per wake, the oldest first; it stops when its time is used and goes on at the next wake', async (t) => {
  const { w, connectionId, sweep } = await connected(t, mcpServer({ tools: [lookup()] }));
  // 始まらなかった依頼を、表に直に置く（頼む前の上限は、ここでは通さない）。
  const insert = w.f.sql.prepare("INSERT INTO noah_asks(id,owner_id,connection_id,work_id,request_sha256,mode,host,tool,tool_sha256,state,revision,created_at,updated_at) VALUES(?,'owner-a',?,?,?,'form',?,'lookup',?,'queued',1,?,?)");
  const place = (from, count) => { for (let n = 0; n < count; n++) insert.run(uuid(from + n), connectionId, uuid(from + 5000 + n), 'a'.repeat(64), hostOf(1), 'b'.repeat(64), w.f.time() + n, w.f.time() + n); };
  place(1000, 55);
  w.f.advance(NOAH_SWEEP_LIMITS.queuedMs + 1_000);
  assert.deepEqual(await sweep(), { ...NONE, asksFailed: 50 });
  // 古い物から。残りは、次の合図で。
  assert.deepEqual(w.asked("state='queued'").map((row) => row.id), Array.from({ length: 5 }, (_, n) => uuid(1050 + n)));
  assert.deepEqual(await sweep(), { ...NONE, asksFailed: 5 });
  assert.deepEqual(await sweep(), NONE);

  // 使う時間の上限: 越えたら、途中で止めて、残りは次の合図で。
  place(3000, 10);
  w.f.advance(NOAH_SWEEP_LIMITS.queuedMs + 1_000);
  let reads = 0;
  const slow = createNoahSweep({ ...w.f.deps, now: () => w.f.time() + (reads++) * 3_000 });   // 時計を読むたびに、3 秒進む
  const first = await slow();
  assert.ok(first.asksFailed >= 1 && first.asksFailed < 10, JSON.stringify(first));
  assert.deepEqual(await sweep(), { ...NONE, asksFailed: 10 - first.asksFailed });
});

void test('the wake runs the cleanup at its end and reports only counts; with the patrol switched off, nothing is touched', async (t) => {
  const key = 'synthetic-wake-test-only-'.repeat(2);
  const definition = lookup(), { server, hold } = holding({ tools: [definition] });
  const { w, waiting, ask, row, connectionId } = await connected(t, server);
  const lines = [];
  t.mock.method(console, 'info', (line) => lines.push(JSON.parse(line)));
  const wake = async (env) => {
    const tick = createIntakeTick({ ...w.f.deps, authenticate: async () => { throw Error('UNAUTHORIZED'); }, reviewers: [], flags: parseNoahFlags(env), wakeKey: key });
    const timestamp = String(w.f.time());
    const response = await tick(new Request('https://noah.test/api/noah/intake/tick', { method: 'POST', body: '{}', headers: { 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(key, timestamp) } }));
    return [response.status, await response.json()];
  };
  hold['tools/list'] = gate();
  await ask(10, definition);
  await hold['tools/list'].arrived;
  const stuck = hold['tools/list'];
  delete hold['tools/list'];
  w.f.advance(LEASE_GONE + 1_000);
  // 巡回を閉じている間は、合図は何もしない（後始末も）。
  assert.deepEqual(await wake({}), [200, { disabled: true }]);
  assert.deepEqual([row(10).state, lines.length], ['running', 0]);
  // 開いている時: 合図の終わりに片付ける。応答と記録に出るのは、数だけ（誰の物か・どの接続先かは、出ない）。
  const [status, body] = await wake({ NOAH_PATROL_ENABLED: 'true' });
  assert.deepEqual([status, body.swept, row(10).state], [200, { ...NONE, asksFailed: 1 }, 'failed']);
  const line = lines.pop();
  assert.deepEqual([line.event, line.swept, line.error], ['noah-patrol', 1, null]);
  for (const leak of ['owner-a', uuid(10), connectionId, row(10).work_id, hostOf(1)]) assert.equal(JSON.stringify([body, line]).includes(leak), false, leak);
  // 片付ける物が無い合図は、応答に swept を足さない。記録は 0。
  w.f.advance(60_000);
  const [, quiet] = await wake({ NOAH_PATROL_ENABLED: 'true' });
  assert.deepEqual(['swept' in quiet, lines.pop().swept], [false, 0]);
  stuck.open();
  await settle(waiting);
});

void test('the cleanup statements read only what is unfinished, through small indexes; the new index is the contract statement', (t) => {
  const f = fixture(t);
  const plan = (sql) => f.sql.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(1, 50).map((step) => step.detail).join(' | ');
  assert.match(plan(NOAH_SWEEP_SQL.expired), /SEARCH noah_asks USING INDEX noah_asks_open/);
  assert.match(plan(NOAH_SWEEP_SQL.notStarted), /SEARCH noah_asks USING INDEX noah_asks_open/);
  assert.match(plan(NOAH_SWEEP_SQL.connecting), /SEARCH noah_connections USING INDEX noah_connections_connecting/);
  // 表を端から読む文が無い。
  for (const sql of Object.values(NOAH_SWEEP_SQL)) assert.doesNotMatch(plan(sql), /SCAN/, sql);
  // 拾う文は、索引の式と同じに書く。IN の並びが違うだけで、その索引は使われなくなる。
  assert.doesNotMatch(plan(NOAH_SWEEP_SQL.connecting.replace("('planned','entitling','preparing','probing')", "('probing','planned','entitling','preparing')")), /noah_connections_connecting/);
  // 索引を足す migration は、型契約の文と同じ（drizzle と drizzle-main も同じ）。
  const migration = readFileSync(new URL('../drizzle/0049_noah_connections_connecting.sql', import.meta.url), 'utf8');
  assert.equal(migration, readFileSync(new URL('../drizzle-main/0049_noah_connections_connecting.sql', import.meta.url), 'utf8'));
  const index = (sql) => sql.split('--> statement-breakpoint').map((part) => part.replace(/^--[^\n]*\n/gm, '').trim()).filter((part) => part.startsWith('CREATE INDEX IF NOT EXISTS noah_connections_connecting '));
  assert.deepEqual(index(migration), index(readFileSync(new URL('../docs/contracts/noah-v1.sql', import.meta.url), 'utf8')));
  assert.equal(index(migration).length, 1);
});

void test('a tool error does not count as ran; a changed definition does not stop connections; marking ran writes nothing about the person; the confirmed counts', async (t) => {
  const definition = lookup();
  let broken = true;
  const server = mcpServer({ tools: [definition, tool('stats')], call: () => (broken ? { isError: true, content: [{ type: 'text', text: 'not found' }] } : { content: [{ type: 'text', text: 'ok' }] }) });
  const w = await world(t, { [hostOf(1)]: server, [hostOf(2)]: mcpServer(), [hostOf(3)]: mcpServer() });
  const a = w.as('owner-a');
  assert.equal((await a.connect(familyId(1), uuid(1))).body.state, 'connected');
  const confirmed = async () => (await w.f.store.status()).confirmed;
  // つながると確かめた数: 動いた・握手まで（どちらも、載せている物だけ）・台帳とは別の、固定の物。
  assert.deepEqual(await confirmed(), { ran: 0, handshake: 3, fixed: 13 });
  // 道具が「できなかった」と返した依頼は、「動いた」に数えない。
  w.f.advance(7_000);
  await a.ask({ id: uuid(10), connectionId: uuid(1), form: await form(definition, { query: 'q' }) });
  assert.deepEqual([w.asked()[0].state, w.family(1).level, w.check(1).level], ['failed', 1, 1]);
  // 巡回が、道具の定義が変わったのを見ても、接続は止めない（頼むたびに、その道具 1 つの定義を確かめるので）。
  const seen = w.check(1).tools_sha256;
  server.state.tools = [definition, tool('stats', true, { description: 'changed' })];
  w.f.advance(7 * 86_400_000 + 3_600_000);   // 握手が通った系列を、次に確かめるのは 7 日後
  assert.ok((await w.patrol()) >= 1);
  assert.notEqual(w.check(1).tools_sha256, seen);
  assert.deepEqual([w.rows()[0].state, w.family(1).level, w.family(1).listed], ['connected', 1, 1]);
  broken = false;
  await a.ask({ id: uuid(11), connectionId: uuid(1), form: await form(definition, { query: 'q' }) });
  assert.deepEqual([w.asked()[1].state, w.family(1).level], ['succeeded', 2]);
  // 「動いた」を付ける時、誰の実行かは、どこにも書かない。
  const stored = JSON.stringify(['noah_intake_checks', 'noah_intake_families', 'noah_intake_candidates', 'noah_probe_hosts'].map((name) => w.f.sql.prepare(`SELECT * FROM ${name}`).all()));
  for (const leak of ['owner-a', uuid(1), uuid(11), w.asked()[1].work_id]) assert.equal(stored.includes(leak), false, leak);
  assert.deepEqual(await confirmed(), { ran: 1, handshake: 2, fixed: 13 });
  // 取り下げた系列は、数えない。
  const detail = await w.f.store.detail(familyId(2), null, true);
  await w.f.store.moderate('withdraw', familyId(2), detail.revision);
  assert.deepEqual(await confirmed(), { ran: 1, handshake: 1, fixed: 13 });
});

void test('the listing rule: the pure function and the SQL give the same answer for every row of the table', async (t) => {
  const { cases } = JSON.parse(readFileSync(new URL('../docs/design-validation/noah/fixtures/listing-cases.json', import.meta.url), 'utf8'));
  // 純関数。載せない理由の全部に、表の行がある。
  const reasons = new Set();
  for (const c of cases) {
    const k = c.check;
    const got = noahListing({
      source: c.source, familyId: c.bulk ? 'bulk:io.maker@gateway.example' : `${c.source}:io.case/agent`, candidateState: c.state, withdrawn: c.withdrawn === true, hidden: c.hidden === true,
      check: k && { mouth: k.mouth, setup: k.setup === 1, auth: k.auth, result: k.result, level: k.level, formTools: k.formTools, oneTapTools: k.oneTapTools },
    });
    assert.deepEqual(got, c.expect, c.name);
    if (!got.listed) reasons.add(got.reason);
  }
  assert.deepEqual(NOAH_LISTING_REASONS.filter((reason) => !reasons.has(reason)), []);

  // SQL: 同じ表の行を、候補と握手の表に置き、名寄せ（系列の行に、載せる印を書く）と、一覧の文を通す。
  const f = fixture(t), H = 'a'.repeat(64), BULK = 20, ids = new Map();
  const put = (table, values) => f.sql.prepare(`INSERT INTO ${table}(${Object.keys(values).join(',')}) VALUES(${Object.keys(values).map(() => '?').join(',')})`).run(...Object.values(values));
  for (const source of ['mcp-registry', 'hf-mcp-space', 'acp-registry']) put('noah_intake_sources', { id: source });
  const add = (source, key, groupKey, host, state, check) => {
    const id = `${source}:${key}`;
    put('noah_intake_candidates', { id, source, external_key: key, family_id: id, group_key: groupKey, name: key, summary: '', host, record_sha256: H, record_json: '{}', state, reason: state === 'unsupported' ? 'bad_url' : null, source_updated_at: 5, first_seen_at: 1, changed_at: 1, seen_at: 1, revision: 1 });
    if (check) {
      const failures = check.failures ?? 0;
      put('noah_intake_checks', {
        candidate_id: id, mouth: check.mouth, surface: check.surface ?? 'none', auth: check.auth, connect_json: '{}', connect_sha256: H, setup: check.setup, level: check.level, result: check.result,
        tools_sha256: check.level ? H : null, l1_at: check.level ? 10 : null, l2_at: check.level === 2 ? 20 : null, form_tools: check.formTools ?? null, one_tap_tools: check.oneTapTools ?? null,
        failures, first_failure_at: failures ? 9 : null, next_check_at: 0,
      });
    }
    return id;
  };
  for (const [n, c] of cases.entries()) {
    const space = `io.case${n}`;
    if (c.bulk) {
      for (let i = 0; i < BULK; i++) add(c.source, `${space}/tool-${i}`, space, 'gateway.example', c.state, c.check);
      ids.set(c.name, `bulk:${space}@gateway.example`);
    } else ids.set(c.name, add(c.source, `${space}/agent`, c.source === 'mcp-registry' ? space : `agent${n}`, c.check && ['mcp-remote', 'space-mcp'].includes(c.check.mouth) ? `h${n}.example` : null, c.state, c.check));
  }
  await f.db.batch(NOAH_REGROUP_SQL.map((sql) => intakeStatement(f.db, sql, { threshold: BULK, now: 100 })));
  for (const c of cases) {
    if (c.withdrawn) f.sql.prepare('UPDATE noah_intake_families SET withdrawn_at=150 WHERE id=?').run(ids.get(c.name));
    if (c.hidden) f.sql.prepare('UPDATE noah_intake_families SET hidden_at=150 WHERE id=?').run(ids.get(c.name));
  }
  const pick = async (sql, values) => new Set((await intakeStatement(f.db, sql, values).all()).results.map((found) => found.id));
  const ran = await pick(NOAH_LISTING_SQL.ran, { before_at: Number.MAX_SAFE_INTEGER, after_id: '', limit: 500 });
  const fresh = await pick(NOAH_LISTING_SQL.new, { before: 1_000_000_000, after_id: '', one_tap: 0, limit: 500 });
  const oneTap = await pick(NOAH_LISTING_SQL.new, { before: 1_000_000_000, after_id: '', one_tap: 1, limit: 500 });
  for (const c of cases) {
    const id = ids.get(c.name), section = ran.has(id) ? 'ran' : fresh.has(id) ? 'new' : null;
    assert.equal(section, c.expect.listed ? c.expect.section : null, c.name);
    if (c.expect.listed && c.expect.section === 'new') assert.equal(oneTap.has(id), c.expect.oneTap, c.name);
  }
  assert.deepEqual([...ran].filter((id) => fresh.has(id)), []);
});

void test('the screen: a connection the cleanup cut shows its reason and 接続 again; pressing connects as a new operation', async (t) => {
  const { server, hold } = holding({ tools: [lookup()] });
  const w = await world(t, { [hostOf(1)]: server });
  const modules = { '@/lib/owner-intent': ownerIntent, '@/lib/noah-ready-view': view, '@/lib/noah-ask-view': askView, '@/lib/noah-bot-notice': botNotice, '@/lib/noah-form': formLib, '@/lib/noah-surface': surface, 'next/image': { default: 'img' }, 'next/navigation': { usePathname: () => '/noah/ready' } };
  const ui = screen({ fetch: w.browser({ user: 'owner-a' }), modules, now: w.f.time() });
  const page = ui.mount('components/noah-ready-detail.tsx', { id: familyId(1) });
  await page.flush();
  // 握手の途中で止まる。「接続」を押した要求は、返らない。
  hold.initialize = gate();
  page.find('button', '接続')[0].props.onClick({ preventDefault() {} });
  page.render();
  await hold.initialize.arrived;
  assert.equal(w.rows()[0].state, 'probing');
  // 巡回の後始末が、切る。
  w.f.advance(NOAH_SWEEP_LIMITS.connectingMs + 1_000);
  assert.deepEqual(await createNoahSweep(w.f.deps)(), { ...NONE, connections: 1 });
  // 止まっていた要求が返ると、画面には、理由と「接続」が出る（「準備しています…」のまま残らない）。
  release(hold, 'initialize');
  await page.flush();
  assert.match(page.text(), /つなぐ途中で止まりました。もう一度試してください。/);
  // 「保存」（ボードへ。task 115）は、接続の状態にかかわらず出る。
  assert.deepEqual(page.find('button').map((node) => page.text(node)), ['接続', '共有', 'URLをコピー', '保存']);
  // もう一度押すと、新しい操作として、つながる。
  w.f.advance(7_000);
  await page.click('接続');
  assert.deepEqual(w.rows().map((found) => found.state), ['disconnected', 'connected']);
  assert.notEqual(w.rows()[0].id, w.rows()[1].id);
  assert.doesNotMatch(page.text(), /つなぐ途中で止まりました/);
});

void test('the screen: when a run is gone, 止める comes back after a while and ends the ask at once, without waiting for the patrol', async (t) => {
  const definition = lookup(), { server, hold } = holding({ tools: [definition] });
  const w = await world(t, { [hostOf(1)]: server });
  await w.as('owner-a').connect(familyId(1), uuid(1));
  w.clear();
  const waiting = [];
  const modules = { '@/lib/owner-intent': ownerIntent, '@/lib/noah-ready-view': view, '@/lib/noah-ask-view': askView, '@/lib/noah-bot-notice': botNotice, '@/lib/noah-form': formLib };
  const ui = screen({ fetch: w.browser({ user: 'owner-a' }, { waitUntil: (work) => { waiting.push(work); } }), modules, now: w.f.time() });
  const page = ui.mount('components/noah-ready-detail.tsx', { id: familyId(1) });
  await page.flush();
  const rows = () => page.find('ul').filter((node) => node.props.className === 'work').flatMap((node) => page.nodes(node).filter((child) => child.type === 'li').map((child) => page.text(child)));
  const stops = () => page.find('button', '止める').length;
  // 頼む。実行の場は、握手の途中で落ちる（この後、動かない）。
  hold['tools/list'] = gate();
  await page.change(page.nodes().find((node) => node.type === 'textarea' || (node.type === 'input' && node.props.type !== 'search')), 'cobalt');
  await page.submit(page.find('form')[0]);
  await hold['tools/list'].arrived;
  await page.tick(1_000);
  assert.match(rows()[0], /^進んでいます/);
  // 「止める」を押す: 止める事を頼んだ所で、ボタンは消える（止まった確認が返るまで、「止めました」とは出さない）。
  await page.click('止める');
  assert.deepEqual([rows()[0].startsWith('止めています…'), stops(), w.asked()[0].state, w.asked()[0].stop_requested], [true, 0, 'running', 1]);
  // 実行の場が持つ時間を過ぎても、「止めています…」のまま（巡回の合図は、来ていない）。45 秒を越えると、「止める」が、もう一度出る。
  w.f.advance(44_000);
  await page.tick(44_000);
  assert.deepEqual([rows()[0].startsWith('止めています…'), stops()], [true, 0]);
  w.f.advance(3_000);
  await page.tick(3_000);
  assert.equal(stops(), 1);
  // 押すと、その場で止まる（相手へは、道具の呼び出しを送っていない）。
  await page.click('止める');
  assert.deepEqual([rows()[0], stops(), w.asked()[0].state, w.asked()[0].error, calls(server).length], ['止めました。情報を検索', 0, 'stopped', null, 0]);
  release(hold, 'tools/list');
  await settle(waiting);
  assert.deepEqual([w.asked()[0].state, calls(server).length], ['stopped', 0]);
});
