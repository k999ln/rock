// 頼む（入力欄から、つないだ相手の道具を 1 回呼ぶ）: 受け付け・実行・読む・止める。成果は Work に入る。
// 通信はしない。台帳も接続先も、この試験の中の関数（合成のサーバー）。相手が受けた要求を全部記録して、何を何回送ったかを確かめる。
// 仕様: docs/noah/spec-87-tool-agent.md の 4 章・11.3・11.4・11.6、spec-88-mass-probe.md の 9.2、spec-74-one-click-connect.md の 11.3（切る）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NoahAgentError } from '../lib/noah-agent-upload.ts';
import { createNoahAskService, NOAH_ASK_MESSAGES } from '../lib/noah-ask.ts';
import { NOAH_ASK_STOP_MESSAGES } from '../lib/noah-ask-store.ts';
import { NOAH_HOST_BUSY, noahToolSha256 } from '../lib/noah-form.ts';
import { NOAH_REMOTE_TEMPLATE } from '../lib/noah-remote-work.ts';
import { applyWorkCommand, normalizeWorkJob } from '../lib/workflow.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { createIntakeApi } from '../lib/noah-intake-api.ts';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid, rpcs, handshakes } from './fixtures/noah/connect-world.mjs';

const HANDSHAKE = ['initialize', 'notifications/initialized', 'tools/list'];
/** 読み取りだけで、入力が 1 つ要る道具／読み取りだけと宣言していない道具／入力の要らない道具。 */
const lookup = (extra = {}) => tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', maxLength: 200 }, limit: { type: 'integer' } } }, ...extra });
const publish = (extra = {}) => tool('publish', null, { description: 'Publishes a note.', inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } }, ...extra });
const stats = () => tool('stats');
const calls = (server) => server.log.filter((request) => request.rpc === 'tools/call');
/** 口へ渡す道具の定義（握手が読んだ形）にして、hash を出す。画面が、入力欄を開いた時に受け取る値と同じ。 */
const shaOf = (definition) => noahToolSha256({ name: definition.name, description: definition.description ?? '', inputSchema: definition.inputSchema, readOnly: definition.annotations?.readOnlyHint === true });
const brief = ({ status, body }) => [status, body.state ?? body.ask?.state ?? null, body.error ?? null];

/** つないだ世界を作る。owner-a が、Agent 1 へつないである。 */
async function connected(t, server, options = {}) {
  const w = await world(t, { [hostOf(1)]: server, ...options.servers }, options);
  const a = w.as('owner-a', options.config ?? {});
  const made = await a.connect(familyId(1), uuid(1));
  assert.equal(made.body.state, 'connected');
  w.clear();
  return { w, a, connectionId: uuid(1) };
}
const form = async (definition, input, extra = {}) => ({ tool: definition.name, toolSha256: await shaOf(definition), input, ...extra });

void test('the table: the migration is the contract, and the pairs the columns must keep', async (t) => {
  const contract = readFileSync(new URL('../docs/contracts/noah-v1.sql', import.meta.url), 'utf8'), migration = readFileSync(new URL('../drizzle/0048_noah_asks.sql', import.meta.url), 'utf8');
  const statements = (sql) => sql.split('--> statement-breakpoint').map((part) => part.replace(/^--[^\n]*\n/gm, '').trim()).filter((part) => /noah_asks/.test(part) && /^CREATE (TABLE|INDEX)/.test(part));
  // 型契約の、依頼の表と索引 4 つを、そのまま移してある。
  assert.deepEqual(statements(migration), statements(contract).filter((part) => part.startsWith('CREATE TABLE IF NOT EXISTS noah_asks (') || part.includes(' ON noah_asks(')));
  assert.equal(statements(migration).length, 5);
  assert.equal(migration, readFileSync(new URL('../drizzle-main/0048_noah_asks.sql', import.meta.url), 'utf8'));

  const { w, connectionId } = await connected(t, mcpServer());
  const insert = (change = {}) => {
    const row = { id: uuid(900), owner_id: 'owner-a', connection_id: connectionId, work_id: uuid(901), request_sha256: 'a'.repeat(64), mode: 'form', host: hostOf(1), tool: 'lookup', tool_sha256: 'b'.repeat(64),
      state: 'queued', revision: 1, created_at: w.f.time(), updated_at: w.f.time(), ...change };
    w.f.sql.prepare(`INSERT INTO noah_asks(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  };
  insert();
  // 入力欄の依頼は、道具・その定義の hash・送り先を、必ず持つ。終わった状態は、終わった時刻と組。「あなたの番」は、確かめている中身と組。
  for (const change of [{ tool: null }, { tool_sha256: null }, { host: null }, { state: 'succeeded' }, { finished_at: 1 }, { state: 'your_turn' }, { pending_json: '{}' },
    { mode: 'prompt' }, { screen: 'tablet' }, { state: 'done' }, { stop_requested: 2 }, { revision: 0 }, { request_sha256: 'short' }, { id: 'short' }, { connection_id: uuid(999) }, { error: 'x'.repeat(301) }])
    assert.throws(() => insert({ id: uuid(902), ...change }), /constraint failed/, JSON.stringify(change));
});

void test('round trip: 202 right away; the result reaches Work without anyone reading it; one tool call; the agent becomes one that ran', async (t) => {
  const definition = lookup();
  const server = mcpServer({ tools: [definition, stats()], call: (params) => ({ content: [{ type: 'text', text: `found ${params.arguments.query}` }, { type: 'image', data: 'AAAA', mimeType: 'image/png' }] }) });
  const waiting = [];
  const { w, a, connectionId } = await connected(t, server, { config: { waitUntil: (work) => { waiting.push(work); } } });
  assert.equal(w.family(1).level, 1);
  const revision = w.rows()[0].revision;

  const accepted = await a.ask({ id: uuid(10), connectionId, form: await form(definition, { query: 'cobalt' }), screen: 'narrow' });
  assert.deepEqual([accepted.status, accepted.body.state, accepted.body.mode, accepted.body.id, accepted.headers.get('cache-control')], [202, 'queued', 'form', uuid(10), 'no-store, private']);
  assert.match(accepted.body.workId, /^[0-9a-f-]{36}$/);
  assert.notEqual(accepted.body.workId, uuid(10));
  // 応答の後に続く仕事が、終わるのを待つ（GET は、1 回も呼ばない）。
  await Promise.all(waiting);
  const [row] = w.asked();
  assert.deepEqual([row.state, row.mode, row.host, row.tool, row.screen, row.tool_calls, row.error, row.stop_requested, row.lease_until, row.finished_at !== null], ['succeeded', 'form', hostOf(1), 'lookup', 'narrow', 1, null, 0, 0, true]);
  // 相手が受けたのは、握手と、道具の呼び出し 1 回。送ったのは、道具の名前と入力だけ。
  assert.deepEqual(rpcs(server), [...HANDSHAKE, 'tools/call']);
  assert.deepEqual(calls(server)[0].body.params, { name: 'lookup', arguments: { query: 'cobalt' } });
  // 成果の正本は Work。相手が返した内容を、Noah は確かめていない: review のまま・step は通していない・費用 0。
  const job = normalizeWorkJob(w.work(row.work_id));
  assert.deepEqual([job.templateId, job.status, job.steps.map((step) => step.passed), job.noahRemote.state, job.noahRemote.verification, job.noahRemote.chargeMinor], [NOAH_REMOTE_TEMPLATE, 'review', [false], 'returned', 'relay_observed_unverified', 0]);
  assert.deepEqual(job.noahRemote.result, { text: 'found cobalt\n（画像 1 件）', truncated: false, attachments: 1 });
  assert.deepEqual([job.noahRemote.note, job.noahRemote.used, job.noahRemote.toolCalls, job.noahRemote.connectionId, job.noahRemote.familyKey, job.noahRemote.host, job.noahRemote.tool],
    [`${hostOf(1)} の lookup が返した内容です。費用 0。`, ['lookup'], 1, connectionId, familyId(1), hostOf(1), 'lookup']);
  assert.equal(job.noahRemote.prompt, 'lookup {"query":"cobalt"}');
  // 今ある Work の操作（完了にする等）からは、動かせない。
  for (const command of [{ id: uuid(77), action: 'complete', note: '確かめました' }, { id: uuid(78), action: 'cancel' }]) assert.throws(() => applyWorkCommand(job, command, job.revision), /Noahの専用実行画面から操作してください。/);
  // 読む: 1 件の方にだけ、成果の文が付く。一覧は、行だけ。
  const one = await a.askGet(uuid(10));
  assert.deepEqual([one.status, one.body.state, one.body.result, one.body.note, one.body.tool, one.body.host, one.body.stopRequested], [200, 'succeeded', job.noahRemote.result, job.noahRemote.note, 'lookup', hostOf(1), false]);
  for (const hidden of ['owner_id', 'ownerId', 'request_sha256', 'requestSha256']) assert.equal(hidden in one.body, false);
  const listed = await a.asks(connectionId);
  assert.deepEqual([listed.status, listed.body.asks.map((ask) => [ask.id, ask.state, 'result' in ask])], [200, [[uuid(10), 'succeeded', false]]]);
  // 動かした系列は「動いた」になる。接続は、使った時刻だけが変わる（版は変えない: 画面が持っている版で、切れる）。
  assert.deepEqual([w.family(1).level, w.family(1).badge_hint, w.check(1).level, w.check(1).l2_at], [2, 'one_click', 2, w.f.time()]);
  assert.deepEqual([w.rows()[0].revision, w.rows()[0].last_used_at], [revision, w.f.time()]);
  assert.deepEqual((await w.f.store.list(null, new URLSearchParams())).items.map((item) => [item.id, item.section]), [[familyId(1), 'ran']]);
  // もう一度動かしても、「動いた」になった時刻は進めない（何度も動かして、上に居続けられない）。
  const first = w.check(1).l2_at;
  w.f.advance(10_000);
  await a.ask({ id: uuid(11), connectionId, form: await form(definition, { query: 'again' }) });
  await Promise.all(waiting);
  assert.deepEqual([w.asked().map((ask) => ask.state), w.check(1).l2_at], [['succeeded', 'succeeded'], first]);
});

void test('the same operation ID: one row, one call, the same answer; different content is refused', async (t) => {
  const definition = lookup(), server = mcpServer({ tools: [definition] });
  const { w, a, connectionId } = await connected(t, server);
  const body = { id: uuid(10), connectionId, form: await form(definition, { query: 'one' }) };
  const replies = [await a.ask(body), await a.ask(body), await a.ask(body)];
  assert.deepEqual(replies.map((reply) => [reply.status, reply.body.id, reply.body.workId === replies[0].body.workId]), [[202, uuid(10), true], [200, uuid(10), true], [200, uuid(10), true]]);
  // 2 回目からは、今の状態（成果つき）が返る。行は 1 件。呼び出しは 1 回。Work も 1 件。
  assert.deepEqual([replies[1].body.state, replies[1].body.result.text, w.asked().length, calls(server).length, w.f.sql.prepare('SELECT COUNT(*) n FROM work_jobs').get().n], ['succeeded', 'lookup ok', 1, 1, 1]);
  // 同じ ID で、入力・道具・接続のどれかが違えば、断る。確かめの印（confirm）と画面の幅は、同じ操作かどうかに入れない。
  assert.deepEqual(brief(await a.ask({ ...body, form: await form(definition, { query: 'two' }) })), [409, null, NOAH_ASK_MESSAGES.changedRequest]);
  assert.deepEqual(brief(await a.ask({ ...body, form: { ...body.form, toolSha256: 'c'.repeat(64) } })), [409, null, NOAH_ASK_MESSAGES.changedRequest]);
  assert.equal((await a.ask({ ...body, form: { ...body.form, confirm: true }, screen: 'wide' })).status, 200);
  // 別の本人が同じ ID を使っても、その人の行は返さない。
  const b = w.as('owner-b');
  await b.connect(familyId(1), uuid(2));
  assert.deepEqual(brief(await b.ask({ id: uuid(10), connectionId: uuid(2), form: body.form })), [409, null, NOAH_ASK_MESSAGES.changedRequest]);
  assert.deepEqual([w.asked().length, calls(server).length], [1, 1]);
  // 切り替えが閉じた後・接続を切った後でも、同じ ID の再送は、今の状態を返す。
  await a.act(connectionId, 'disconnect', w.rows('owner_id=?', 'owner-a')[0].revision);
  assert.deepEqual(brief(await w.as('owner-a', { env: {} }).ask(body)), [200, 'succeeded', null]);
});

void test('the definition the person saw: a changed tool is not called; a change to another tool does not matter', async (t) => {
  const definition = lookup(), server = mcpServer({ tools: [definition, stats()] });
  const { w, a, connectionId } = await connected(t, server);
  const seen = await form(definition, { query: 'x' });
  // 入力欄を開いた後に、その道具の説明が変わった。
  server.state.tools = [lookup({ description: 'Looks up a player. Also deletes it.' }), stats()];
  assert.deepEqual(brief(await a.ask({ id: uuid(10), connectionId, form: seen })), [202, 'queued', null]);
  assert.deepEqual([w.asked()[0].state, w.asked()[0].error, calls(server).length, w.work(w.asked()[0].work_id).noahRemote.state], ['failed', NOAH_ASK_MESSAGES.toolChanged, 0, 'failed']);
  // 道具が無くなった時も、同じ。
  w.f.advance(1000);
  server.state.tools = [stats()];
  await a.ask({ id: uuid(11), connectionId, form: seen });
  assert.deepEqual([w.asked()[1].state, w.asked()[1].error, calls(server).length], ['failed', NOAH_ASK_MESSAGES.toolChanged, 0]);
  // 関係の無い道具の説明が変わっただけでは、止めない。
  w.f.advance(1000);
  server.state.tools = [definition, tool('stats', true, { description: 'changed' })];
  await a.ask({ id: uuid(12), connectionId, form: seen });
  assert.deepEqual([w.asked()[2].state, calls(server).length], ['succeeded', 1]);
  // 失敗した依頼は、「動いた」に数えない所から始まり、成功で「動いた」になる。
  assert.equal(w.family(1).level, 2);
});

void test('tools that may change something: confirmed on screen the first time, remembered with the definition, asked again when it changes', async (t) => {
  const definition = publish(), server = mcpServer({ tools: [definition, lookup()] });
  const { w, a, connectionId } = await connected(t, server);
  const revision = w.rows()[0].revision;
  // 確かめずに頼むと、呼ばない。
  await a.ask({ id: uuid(10), connectionId, form: await form(definition, { text: 'hello' }) });
  assert.deepEqual([w.asked()[0].state, w.asked()[0].error, calls(server).length, w.rows()[0].confirmed_tools_json], ['failed', NOAH_ASK_MESSAGES.needsConfirm, 0, '[]']);
  // 画面で確かめて頼む。記録は、名前と、その時の定義の hash の組。接続の版は進めない。
  w.f.advance(1000);
  await a.ask({ id: uuid(11), connectionId, form: await form(definition, { text: 'hello' }, { confirm: true }) });
  assert.deepEqual([w.asked()[1].state, calls(server).length, JSON.parse(w.rows()[0].confirmed_tools_json), w.rows()[0].revision], ['succeeded', 1, [{ name: 'publish', sha256: await shaOf(definition) }], revision]);
  // 2 回目は、確かめなくてよい。
  w.f.advance(1000);
  await a.ask({ id: uuid(12), connectionId, form: await form(definition, { text: 'again' }) });
  assert.deepEqual([w.asked()[2].state, calls(server).length, JSON.parse(w.rows()[0].confirmed_tools_json).length], ['succeeded', 2, 1]);
  // 道具の一覧も、確かめ済みと出す（並びは、相手が返した順）。
  w.f.advance(6000);
  assert.deepEqual((await a.tools(connectionId)).body.tools.map((item) => [item.name, item.needsConfirm]), [['publish', false], ['lookup', false]]);
  // 確かめた後に、その道具の定義が変わったら、確かめ直す（新しい定義を見た入力欄から頼んでも）。
  const changed = publish({ description: 'Publishes a note to everyone.' });
  server.state.tools = [changed, lookup()];
  w.f.advance(1000);
  await a.ask({ id: uuid(13), connectionId, form: await form(changed, { text: 'x' }) });
  assert.deepEqual([w.asked()[3].state, w.asked()[3].error, calls(server).length], ['failed', NOAH_ASK_MESSAGES.needsConfirm, 2]);
  w.f.advance(1000);
  await a.ask({ id: uuid(14), connectionId, form: await form(changed, { text: 'x' }, { confirm: true }) });
  // 同じ名前の古い組は、置き換える。
  assert.deepEqual([w.asked()[4].state, JSON.parse(w.rows()[0].confirmed_tools_json)], ['succeeded', [{ name: 'publish', sha256: await shaOf(changed) }]]);
  // 読み取りだけの道具に confirm を付けても、記録は増えない。
  w.f.advance(1000);
  await a.ask({ id: uuid(15), connectionId, form: await form(lookup(), { query: 'q' }, { confirm: true }) });
  assert.deepEqual([w.asked()[5].state, JSON.parse(w.rows()[0].confirmed_tools_json).length], ['succeeded', 1]);
});

void test('input: only what the form has is passed on; values are checked before anything is sent', async (t) => {
  const nested = tool('configure', true, { inputSchema: { type: 'object', required: ['o'], properties: { o: { type: 'object' } } } });
  const definition = lookup(), server = mcpServer({ tools: [definition, nested] });
  const { w, a, connectionId } = await connected(t, server);
  const cases = [
    [{ query: 'x', admin: true }, '入力欄に無い項目です。'],
    [{}, 'query を入れてください。'],
    [{ query: 'x'.repeat(201) }, 'query は 200 文字までです。'],
    [{ query: 'x', limit: 'many' }, null],
  ];
  for (const [index, [input, message]] of cases.entries()) {
    w.f.advance(1000);
    await a.ask({ id: uuid(20 + index), connectionId, form: await form(definition, input) });
    const row = w.asked().at(-1);
    assert.equal(row.state, 'failed', JSON.stringify(input));
    if (message) assert.equal(row.error, message); else assert.match(row.error, /limit/);
  }
  // 入力欄にできない道具は、頼めない。
  w.f.advance(1000);
  await a.ask({ id: uuid(30), connectionId, form: await form(nested, { o: {} }) });
  assert.deepEqual([w.asked().at(-1).state, w.asked().at(-1).error], ['failed', NOAH_ASK_MESSAGES.toolUnusable]);
  // どれも、道具は呼んでいない。数は、数として渡す。
  assert.equal(calls(server).length, 0);
  w.f.advance(1000);
  await a.ask({ id: uuid(31), connectionId, form: await form(definition, { query: ' padded ', limit: '５' }) });
  assert.deepEqual([w.asked().at(-1).state, calls(server)[0].body.params.arguments], ['succeeded', { query: ' padded ', limit: 5 }]);
});

void test('what the provider answers to the call decides the outcome; nothing is ever called twice', async (t) => {
  const definition = lookup();
  const other = mcpServer();
  let mode = 'error';
  const server = mcpServer({
    tools: [definition],
    call: () => (mode === 'error' ? { isError: true, content: [{ type: 'text', text: `Player not found. ${'x'.repeat(400)}` }] } : mode === 'structured' ? { structuredContent: { players: [{ id: 1, name: 'A' }] }, content: [] } : mode === 'empty' ? { content: [] } : { content: [{ type: 'text', text: 'y'.repeat(140_000) }] }),
    before: (body) => { if (body?.method === 'tools/call' && mode === 'timeout') throw new DOMException('The operation timed out.', 'TimeoutError'); },
    status: (body) => (body?.method !== 'tools/call' ? undefined : mode === '403' ? 403 : mode === '500' ? 500 : mode === '400' ? 400 : mode === '307' ? 307 : undefined),
    statusHeaders: { location: `https://${hostOf(9)}/mcp` },
  });
  const { w, a, connectionId } = await connected(t, server, { servers: { [hostOf(9)]: other }, records: undefined });
  const expectations = [
    // 道具が「できなかった」と返した: 失敗。理由は、相手の文の先頭 240 文字。
    ['error', 'failed', (error) => error.length === 240 && error.startsWith('Player not found. x')],
    // 応答が無い（時間切れ）・相手が 5xx: 送った後なので、実行されたかが分からない。
    ['timeout', 'unknown', (error) => error === NOAH_ASK_MESSAGES.unknown],
    ['500', 'unknown', (error) => error === NOAH_ASK_MESSAGES.unknown],
    ['400', 'unknown', (error) => error === NOAH_ASK_MESSAGES.unknown],
    ['403', 'failed', (error) => error === NOAH_ASK_MESSAGES.refusedCall],
    // 別の host への転送には、従わない。
    ['307', 'failed', (error) => error === 'この接続先にはつなげません。'],
    ['structured', 'succeeded', (error) => error === null],
    ['empty', 'succeeded', (error) => error === null],
    ['large', 'succeeded', (error) => error === null],
  ];
  for (const [index, [next, state, check]] of expectations.entries()) {
    mode = next;
    w.f.advance(7000);
    const before = calls(server).length;
    await a.ask({ id: uuid(40 + index), connectionId, form: await form(definition, { query: 'q' }) });
    const row = w.asked().at(-1), job = w.work(row.work_id);
    assert.deepEqual([row.state, check(row.error)], [state, true], `${String(next)}: ${String(row.error)}`);
    // 呼んだのは 1 回だけ（失敗しても、呼び直さない）。Work の状態も、同じ終わり。
    assert.equal(calls(server).length, before + 1, next);
    assert.equal(job.noahRemote.state, state === 'succeeded' ? 'returned' : state, next);
    assert.equal(job.status, 'review', next);
    if (state !== 'succeeded') assert.equal(job.noahRemote.result, undefined, next);
  }
  // 転送先が受けた要求は 0 回。
  assert.equal(other.log.length, 0);
  // 構造のある成果は、整えた JSON の文。空の成果・長い成果。
  const texts = w.asked().slice(-3).map((row) => w.work(row.work_id).noahRemote.result);
  assert.deepEqual(JSON.parse(texts[0].text), { players: [{ id: 1, name: 'A' }] });
  assert.deepEqual(texts[1], { text: '（結果は空でした）', truncated: false, attachments: 0 });
  assert.deepEqual([texts[2].truncated, texts[2].text.endsWith('（長いので切りました）'), new TextEncoder().encode(texts[2].text).byteLength <= 131_072], [true, true, true]);
  // 相手が、決まった形のエラーで返した: 入力を受け付けなかった。相手の文は、先頭だけを添える。
  const strict = mcpServer({ tools: [definition] });
  const second = await connected(t, strict);
  strict.fetch = undefined;
  const original = second.w.net.routes[hostOf(1)];
  second.w.net.routes[hostOf(1)] = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    if (body?.method === 'tools/call') { strict.log.push({ rpc: 'tools/call' }); return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: `query must be a UUID ${'z'.repeat(300)}` } }); }
    return original(url, init);
  };
  await second.a.ask({ id: uuid(60), connectionId: second.connectionId, form: await form(definition, { query: 'q' }) });
  const refused = second.w.asked()[0];
  assert.equal(refused.state, 'failed');
  assert.ok(refused.error.startsWith(`${NOAH_ASK_MESSAGES.rejectedInput} query must be a UUID z`));
  assert.ok(Array.from(refused.error).length <= NOAH_ASK_MESSAGES.rejectedInput.length + 1 + 200);
});

void test('when the provider stops answering between connecting and asking, nothing is called', async (t) => {
  const definition = lookup();
  let mode = 'ok';
  const server = mcpServer({ tools: [definition], status: (body) => (mode === '503' && body?.method === 'initialize' ? 503 : mode === '401' ? 401 : mode === '429' ? 429 : undefined), statusHeaders: { 'retry-after': '120' } });
  const { w, a, connectionId } = await connected(t, server);
  const ask = async (n) => { w.f.advance(1000); await a.ask({ id: uuid(n), connectionId, form: await form(definition, { query: 'q' }) }); return w.asked().at(-1); };
  mode = '503';
  assert.deepEqual([(await ask(10)).state, w.asked().at(-1).error], ['failed', '相手のサーバーが応答しません。時間をおいて試してください。']);
  // 相手が「混んでいる」: 言った時刻まで、依頼も道具の一覧も、相手へ送らずに断る。
  mode = '429';
  assert.deepEqual([(await ask(11)).state, w.asked().at(-1).error], ['failed', '相手のサーバーが混んでいます。少し待ってから試してください。']);
  mode = 'ok';
  w.clear();
  w.f.advance(60_000);
  assert.deepEqual(brief(await a.ask({ id: uuid(12), connectionId, form: await form(definition, { query: 'q' }) })), [429, null, NOAH_HOST_BUSY]);
  assert.deepEqual(brief(await a.tools(connectionId)), [429, null, NOAH_HOST_BUSY]);
  assert.deepEqual([w.net.hosts, w.asked().length], [[], 2]);
  w.f.advance(61_000);
  assert.equal((await ask(13)).state, 'succeeded');
  // 相手の許可が要るようになった: 失敗にして、一覧から外す。
  mode = '401';
  assert.deepEqual([(await ask(14)).state, w.asked().at(-1).error, await w.listed()], ['failed', 'この Agent は、相手の許可が要るようになりました。まだ対応していません。', []]);
  assert.equal(calls(server).length, 1);
});

void test('stopping: before it starts, nothing is sent; after it was sent, a late result is not kept', async (t) => {
  const definition = lookup();
  let onCall = null;
  const server = mcpServer({ tools: [definition], before: async (body) => { if (body?.method === 'tools/call') await onCall?.(); } });
  const { w, a, connectionId } = await connected(t, server);
  // まだ始まっていない依頼（受け付けた直後）を止める。
  const service = createNoahAskService(a.deps);
  const accepted = await service.ask('owner-a', false, { id: uuid(10), connectionId, ...(await form(definition, { query: 'q' })), confirm: false, screen: null });
  assert.equal(accepted.status, 202);
  w.clear();
  assert.deepEqual(brief(await a.askStop(uuid(10), 2)), [409, 'queued', NOAH_ASK_MESSAGES.stale]);
  const stopped = await a.askStop(uuid(10), 1);
  assert.deepEqual([stopped.status, stopped.body.state, stopped.body.error, stopped.body.stopRequested], [200, 'stopped', undefined, false]);
  assert.deepEqual([w.work(w.asked()[0].work_id).status, w.work(w.asked()[0].work_id).noahRemote.state, w.work(w.asked()[0].work_id).noahRemote.error], ['cancelled', 'cancelled', NOAH_ASK_STOP_MESSAGES.stopped]);
  // 止めた後で、実行の場が動いても、何も送らない。
  await accepted.run();
  assert.deepEqual([w.net.hosts, w.asked()[0].state], [[], 'stopped']);
  assert.deepEqual(brief(await a.askStop(uuid(10), stopped.body.revision)), [409, 'stopped', NOAH_ASK_MESSAGES.finished]);

  // 相手へ送った後に止める: 止める事を頼む（まだ「止めました」ではない）。届いた成果は、採らない。
  w.f.advance(1000);
  let during = null;
  onCall = async () => { during = await a.askStop(uuid(11), w.asked()[1].revision); };
  await a.ask({ id: uuid(11), connectionId, form: await form(definition, { query: 'q' }) });
  assert.deepEqual([during.status, during.body.state, during.body.stopRequested], [200, 'running', true]);
  const late = w.asked()[1], job = w.work(late.work_id);
  assert.deepEqual([late.state, late.error, late.tool_calls, calls(server).length], ['stopped', NOAH_ASK_STOP_MESSAGES.stoppedAfterCall, 1, 1]);
  assert.deepEqual([job.status, job.noahRemote.state, job.noahRemote.result, job.noahRemote.used], ['cancelled', 'cancelled', undefined, ['lookup']]);
  // 止めた依頼は、「動いた」に数えない。
  assert.equal(w.family(1).level, 1);
  // 握手の間に止めた時は、道具を呼ばない。
  w.f.advance(1000);
  onCall = null;
  server.options.before = async (body) => { if (body?.method === 'tools/list') await a.askStop(uuid(12), w.asked()[2].revision); };
  await a.ask({ id: uuid(12), connectionId, form: await form(definition, { query: 'q' }) });
  assert.deepEqual([w.asked()[2].state, w.asked()[2].error, calls(server).length], ['stopped', null, 1]);
});

void test('cutting a connection stops its unfinished asks; a cut or withdrawn connection takes no new ones', async (t) => {
  const definition = lookup(), server = mcpServer({ tools: [definition] });
  const { w, a, connectionId } = await connected(t, server);
  const service = createNoahAskService(a.deps);
  const queued = await service.ask('owner-a', false, { id: uuid(10), connectionId, ...(await form(definition, { query: 'q' })), confirm: false, screen: null });
  // 進んでいる依頼は、握手の途中で接続が切られる。
  w.f.advance(1000);
  server.options.before = async (body) => { if (body?.method === 'tools/list' && w.rows()[0].state === 'connected') await a.act(connectionId, 'disconnect', w.rows()[0].revision); };
  await a.ask({ id: uuid(11), connectionId, form: await form(definition, { query: 'q' }) });
  assert.equal(w.rows()[0].state, 'disconnected');
  // まだ始まっていなかった依頼は、その場で止まる（理由つき）。進んでいた依頼は、道具を呼ばずに終わる。
  assert.deepEqual(w.asked().map((row) => [row.state, row.error]), [['stopped', NOAH_ASK_STOP_MESSAGES.cut], ['stopped', null]]);
  assert.deepEqual([w.work(w.asked()[0].work_id).status, calls(server).length], ['cancelled', 0]);
  await queued.run();
  assert.equal(calls(server).length, 0);
  // 切った接続では、頼めない。
  server.options.before = undefined;
  w.clear();
  assert.deepEqual(brief(await a.ask({ id: uuid(12), connectionId, form: await form(definition, { query: 'q' }) })), [409, null, '接続を確かめてください。']);
  // つなぎ直して、運営が取り下げた後も、頼めない（握手もしない）。接続は、使えない物になる。
  w.f.advance(7000);
  await a.connect(familyId(1), uuid(2));
  w.clear();
  const detail = await w.f.store.detail(familyId(1), null, true);
  await w.f.store.moderate('withdraw', familyId(1), detail.revision);
  assert.deepEqual(brief(await a.ask({ id: uuid(13), connectionId: uuid(2), form: await form(definition, { query: 'q' }) })), [409, null, 'この Agent は、取り下げられました。使えません。']);
  assert.deepEqual([w.net.hosts, w.rows().at(-1).state, w.asked().length, w.f.sql.prepare('SELECT COUNT(*) n FROM work_jobs').get().n], [[], 'blocked', 2, 2]);
});

void test('limits before asking: unfinished asks, per minute, per provider, and the handshake slots of one provider', async (t) => {
  const definition = lookup(), server = mcpServer({ tools: [definition] });
  const { w, a, connectionId } = await connected(t, server);
  const service = createNoahAskService(a.deps);
  const queue = async (n) => service.ask('owner-a', false, { id: uuid(n), connectionId, ...(await form(definition, { query: 'q' })), confirm: false, screen: null });
  // 終わっていない依頼が 8 件あれば、9 件目は受けない（Work も行も作らない。相手へも送らない）。
  const held = [];
  for (let n = 0; n < 8; n++) { held.push(await queue(100 + n)); assert.equal(held[n].status, 202); }
  assert.deepEqual(brief(await a.ask({ id: uuid(200), connectionId, form: await form(definition, { query: 'q' }) })), [409, null, '進んでいる依頼が多すぎます。終わるまで待ってください。']);
  assert.deepEqual([w.asked().length, w.f.sql.prepare('SELECT COUNT(*) n FROM work_jobs').get().n, w.net.hosts], [8, 8, []]);
  for (const accepted of held) await accepted.run();
  assert.deepEqual([...new Set(w.asked().map((row) => row.state))], ['succeeded']);
  // 直近 60 秒に 10 回まで。
  for (let n = 8; n < 10; n++) assert.equal((await a.ask({ id: uuid(100 + n), connectionId, form: await form(definition, { query: 'q' }) })).status, 202);
  assert.deepEqual(brief(await a.ask({ id: uuid(201), connectionId, form: await form(definition, { query: 'q' }) })), [429, null, '続けて頼みすぎています。少し待ってから試してください。']);
  assert.equal(w.asked().length, 10);
  // 1 つの接続先へは、全員合わせて、直近 60 秒に 30 回まで（別の本人が、同じ相手へ頼む）。
  for (const [index, owner] of ['owner-b', 'owner-c'].entries()) {
    const other = w.as(owner);
    await other.connect(familyId(1), uuid(3 + index));
    for (let n = 0; n < 10; n++) assert.equal((await other.ask({ id: uuid(300 + index * 20 + n), connectionId: uuid(3 + index), form: await form(definition, { query: 'q' }) })).status, 202);
  }
  const d = w.as('owner-d');
  await d.connect(familyId(1), uuid(5));
  const rows = w.asked().length, jobs = w.f.sql.prepare('SELECT COUNT(*) n FROM work_jobs').get().n, received = server.log.length;
  assert.deepEqual(brief(await d.ask({ id: uuid(400), connectionId: uuid(5), form: await form(definition, { query: 'q' }) })), [429, null, NOAH_HOST_BUSY]);
  assert.deepEqual([w.asked().length, w.f.sql.prepare('SELECT COUNT(*) n FROM work_jobs').get().n, server.log.length], [rows, jobs, received]);
  // 60 秒たてば、また頼める。
  w.f.advance(61_000);
  assert.equal((await d.ask({ id: uuid(401), connectionId: uuid(5), form: await form(definition, { query: 'q' }) })).status, 202);

  // 接続先の枠（接続・道具の一覧・依頼の握手を合わせて数える）。枠が無い時は、Work も行も増えず、相手へも送らない。
  const second = mcpServer({ tools: [definition] });
  const tight = await connected(t, second, { config: { env: { NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true', NOAH_ASK_LIMITS: JSON.stringify({ hostHandshakes: 4 }) } } });
  assert.equal((await tight.a.tools(tight.connectionId)).status, 200);
  for (let n = 0; n < 2; n++) assert.equal((await tight.a.ask({ id: uuid(500 + n), connectionId: tight.connectionId, form: await form(definition, { query: 'q' }) })).status, 202);
  const shakes = handshakes(second);
  assert.deepEqual(brief(await tight.a.ask({ id: uuid(502), connectionId: tight.connectionId, form: await form(definition, { query: 'q' }) })), [429, null, NOAH_HOST_BUSY]);
  // 握手は、接続 1・道具の一覧 1・依頼 2 の 4 回（依頼 1 件が取る枠は 1 つ）。
  assert.deepEqual([shakes, handshakes(second), tight.w.asked().length], [3, 3, 2]);
});

void test('who may ask: signed in, same origin, same account, own connections only; closed while the switch is off', async (t) => {
  const definition = lookup(), server = mcpServer({ tools: [definition] });
  const { w, a, connectionId } = await connected(t, server);
  const good = { id: uuid(10), connectionId, form: await form(definition, { query: 'q' }) };
  // 形の違う本文。
  const bad = [
    {}, { ...good, id: 'x' }, { ...good, connectionId: 'x' }, { ...good, form: null }, { ...good, form: [] }, { ...good, extra: 1 },
    { ...good, form: { ...good.form, tool: 'has space' } }, { ...good, form: { ...good.form, toolSha256: 'short' } }, { ...good, form: { ...good.form, input: [] } }, { ...good, form: { ...good.form, input: 'text' } },
    { ...good, form: { ...good.form, confirm: false } }, { ...good, form: { ...good.form, confirm: 'yes' } }, { ...good, form: { ...good.form, more: 1 } },
  ];
  for (const body of bad) assert.equal((await a.ask(body)).status, 400, JSON.stringify(body).slice(0, 80));
  assert.equal((await a.ask('{not json')).status, 400);
  // 1 文で頼む（prompt）は、まだ受けない。
  assert.deepEqual(brief(await a.ask({ id: uuid(10), connectionId, prompt: '調べて' })), [422, null, NOAH_ASK_MESSAGES.promptOnly]);
  assert.equal((await a.ask({ ...good, form: { ...good.form, input: { query: 'x'.repeat(17_000) } } })).status, 413);
  // 別の Origin・別の account の印・JSON でない・未サインイン・対応しない操作。
  assert.equal((await a.ask(good, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await a.ask(good, { 'X-Rock-Owner-Scope': 'owner-v1:' + '0'.repeat(64) })).status, 409);
  assert.equal((await a.ask(good, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await w.as(null).ask(good)).status, 401);
  assert.equal((await w.as(null).asks()).status, 401);
  assert.equal((await a.ask(good, {}, 'PUT')).status, 405);
  assert.deepEqual([w.asked().length, w.net.hosts], [0, []]);
  // 知らない画面の幅は、入れない（断らない）。
  assert.equal((await a.ask({ ...good, screen: 'tablet' })).status, 202);
  assert.equal(w.asked()[0].screen, null);

  // 他人の接続では頼めない。他人の依頼は、読めない・止められない・一覧に出ない。
  const b = w.as('owner-b');
  assert.deepEqual(brief(await b.ask({ ...good, id: uuid(11) })), [404, null, '接続が見つかりません。']);
  assert.deepEqual(brief(await b.askGet(uuid(10))), [404, null, NOAH_ASK_MESSAGES.missing]);
  assert.deepEqual(brief(await b.askStop(uuid(10), 1)), [404, null, NOAH_ASK_MESSAGES.missing]);
  assert.deepEqual((await b.asks()).body.asks, []);
  assert.deepEqual((await b.asks(connectionId)).body.asks, []);
  assert.deepEqual(brief(await a.askGet('not-a-uuid')), [404, null, NOAH_ASK_MESSAGES.missing]);
  assert.deepEqual((await a.asks('not-a-uuid')).body.asks, []);
  assert.deepEqual(brief(await a.askStop(uuid(10), 0)), [400, null, '操作と版を確認してください。']);

  // 切り替えが閉じている間: 審査者でない人は 503（相手へ送らない）。審査者は頼める。読む・止めるは、閉じていてもできる。
  w.clear();
  w.f.advance(1000);
  const closed = w.as('owner-a', { env: { NOAH_INTAKE_PUBLIC: 'true' } });
  assert.deepEqual(brief(await closed.ask({ ...good, id: uuid(12) })), [503, null, NOAH_ASK_MESSAGES.closed]);
  assert.deepEqual([w.net.hosts, (await closed.askGet(uuid(10))).status, (await closed.asks()).body.asks.length], [[], 200, 1]);
  const reviewer = w.as('owner-a', { env: {}, reviewers: ['owner-a'] });
  assert.equal((await reviewer.ask({ ...good, id: uuid(13) })).status, 202);
});

void test('what is sent to the provider: the tool name and the input, and nothing about the person', async (t) => {
  const definition = lookup(), server = mcpServer({ tools: [definition], session: 'session-1' });
  const waiting = [];
  const { w, a, connectionId } = await connected(t, server, { config: { waitUntil: (work) => { waiting.push(work); } } });
  await Promise.all(waiting);
  w.clear();
  await a.ask({ id: uuid(10), connectionId, form: await form(definition, { query: 'secret-free' }), screen: 'narrow' });
  await Promise.all(waiting);
  assert.equal(w.asked()[0].state, 'succeeded');
  // 握手 3 回・呼び出し 1 回・閉じる 1 回（セッションを使う相手だけ）。
  assert.deepEqual(rpcs(server), [...HANDSHAKE, 'tools/call', 'DELETE']);
  const scope = (await a.list()).body.ownerScope;
  const sent = JSON.stringify(server.log);
  for (const leak of ['owner-a', scope, scope.split(':')[1], uuid(10), connectionId, w.asked()[0].work_id, 'cookie', 'Cookie', 'x-rock-owner-scope', 'narrow', 'authorization'])
    assert.equal(sent.includes(leak), false, leak);
  // 名乗りは、人の操作から始まった要求の物。送り先は、接続の時に見せた host だけ。
  assert.deepEqual([...new Set(server.log.map((request) => request.headers['user-agent']))], ['Noah/1 (+https://avoado.si/noah/help#bot)']);
  assert.deepEqual([...new Set(w.net.hosts)], [hostOf(1)]);
  assert.deepEqual(Object.keys(calls(server)[0].body.params).sort((x, y) => x.localeCompare(y)), ['arguments', 'name']);
});

void test('the work of one agent: asks of cut connections stay listed with the new ones; nobody else\'s, no other agent\'s', async (t) => {
  // 詳細の画面の「仕事」が読む入口（GET /api/noah/ask?agent=）。切っても、受け取った成果は残る（spec-90 の 5 章の 10）。
  const definition = lookup();
  const server = mcpServer({ tools: [definition], call: (params) => ({ content: [{ type: 'text', text: `found ${params.arguments.query}` }] }) });
  const other = mcpServer({ tools: [definition], call: () => ({ content: [{ type: 'text', text: 'other agent' }] }) });
  const { w, a, connectionId } = await connected(t, server, { servers: { [hostOf(2)]: other } });
  const ask = async (who, n, connection, query) => { w.f.advance(1_000); assert.equal((await who.ask({ id: uuid(n), connectionId: connection, form: await form(definition, { query }) })).status, 202); };
  // owner-a: Agent 1 へ 2 件頼んで、切る。つなぎ直して、もう 1 件。Agent 2 へも 1 件。owner-b: Agent 1 へ 1 件。
  await ask(a, 10, connectionId, 'first');
  await ask(a, 11, connectionId, 'second');
  assert.equal((await a.act(connectionId, 'disconnect', (await a.get(connectionId)).body.revision)).status, 200);
  w.f.advance(1_000);
  assert.equal((await a.connect(familyId(1), uuid(2))).body.state, 'connected');
  await ask(a, 12, uuid(2), 'third');
  assert.equal((await a.connect(familyId(2), uuid(3))).body.state, 'connected');
  await ask(a, 13, uuid(3), 'elsewhere');
  const b = w.as('owner-b');
  assert.equal((await b.connect(familyId(1), uuid(4))).body.state, 'connected');
  await ask(b, 14, uuid(4), 'someone else');

  // その Agent への依頼が、切った接続の分も含めて、新しい順に出る。成果の文は、一覧には持たない。
  const queries = w.f.queries.length;
  const mine = await a.asksOf(familyId(1));
  assert.equal(w.f.queries.length - queries, 1, 'D1 への往復は 1');
  assert.deepEqual([mine.status, mine.body.asks.map((item) => [item.id, item.connectionId, item.state, 'result' in item])],
    [200, [[uuid(12), uuid(2), 'succeeded', false], [uuid(11), connectionId, 'succeeded', false], [uuid(10), connectionId, 'succeeded', false]]]);
  // 切った接続の成果も、1 件ずつ読める。
  assert.equal((await a.askGet(uuid(10))).body.result.text, 'found first');
  // 別の Agent の依頼・別の人の依頼は、混ざらない。
  assert.deepEqual((await a.asksOf(familyId(2))).body.asks.map((item) => item.id), [uuid(13)]);
  assert.deepEqual((await b.asksOf(familyId(1))).body.asks.map((item) => item.id), [uuid(14)]);
  assert.deepEqual((await w.as('owner-c').asksOf(familyId(1))).body.asks, []);
  // 接続で絞る読み方は、前のまま（その接続の依頼だけ）。両方を渡した時は、接続が先。
  assert.deepEqual((await a.asks(connectionId)).body.asks.map((item) => item.id), [uuid(11), uuid(10)]);
  assert.deepEqual((await a.send(a.askApi.collection, 'GET', `/api/noah/ask?connection=${uuid(2)}&agent=${encodeURIComponent(familyId(2))}`)).body.asks.map((item) => item.id), [uuid(12)]);
  // 知らない Agent・形の違う ID は、何も無い物として答える（誤りにしない）。未サインインは 401。
  for (const agent of ['mcp-registry:test.provider/unknown', 'x', 'y'.repeat(401), '']) assert.deepEqual((await a.asksOf(agent)).body.asks, [], agent.slice(0, 20));
  assert.equal((await w.as(null).asksOf(familyId(1))).status, 401);
  // 切り替えを閉じていても、本人の記録は読める。
  assert.equal((await w.as('owner-a', { env: {} }).asksOf(familyId(1))).body.asks.length, 3);
});

void test('the number of people who used an agent: one per person whose ask returned a result, cut connections included; failures and other agents do not count', async (t) => {
  // 本人の決め（2026-11-21）: スマホの Agent の一覧と詳細に、利用人数を出す。数えるのは、接続して頼み、成果が出た人（1 人 1 回）。
  const definition = lookup();
  let fail = false;
  const server = mcpServer({ tools: [definition], call: () => (fail ? { isError: true, content: [{ type: 'text', text: 'No data yet.' }] } : { content: [{ type: 'text', text: 'one' }] }) });
  const other = mcpServer({ tools: [definition], call: () => ({ content: [{ type: 'text', text: 'two' }] }) });
  const { w, a, connectionId } = await connected(t, server, { servers: { [hostOf(2)]: other } });
  const intake = (who, query = '') => who.send(createIntakeApi(who.deps), 'GET', `/api/noah/intake?${query}`);
  const usersOf = async (who) => Object.fromEntries((await intake(who)).body.items.map((item) => [item.id, item.users]));
  const ask = async (who, n, connection) => { w.f.advance(1_000); assert.equal((await who.ask({ id: uuid(n), connectionId: connection, form: await form(definition, { query: 'q' }) })).status, 202); };
  assert.deepEqual(await usersOf(a), { [familyId(1)]: 0, [familyId(2)]: 0 });

  // owner-a: Agent 1 へ 2 回（成果）。切って、つなぎ直して、もう 1 回（成果）。→ 1 人のまま。
  await ask(a, 10, connectionId);
  await ask(a, 11, connectionId);
  assert.equal((await a.act(connectionId, 'disconnect', (await a.get(connectionId)).body.revision)).status, 200);
  w.f.advance(1_000);
  assert.equal((await a.connect(familyId(1), uuid(2))).body.state, 'connected');
  await ask(a, 12, uuid(2));
  // owner-b: Agent 1 へ頼んだが、できなかった。→ 数えない。
  const b = w.as('owner-b');
  assert.equal((await b.connect(familyId(1), uuid(3))).body.state, 'connected');
  fail = true;
  await ask(b, 13, uuid(3));
  fail = false;
  assert.equal(w.asked('id=?', uuid(13))[0].state, 'failed');
  // owner-c: Agent 1 へ（成果）、Agent 2 へも（成果）。owner-d: つないだだけ（頼んでいない）。
  const c = w.as('owner-c'), d = w.as('owner-d');
  assert.equal((await c.connect(familyId(1), uuid(4))).body.state, 'connected');
  await ask(c, 14, uuid(4));
  assert.equal((await c.connect(familyId(2), uuid(5))).body.state, 'connected');
  await ask(c, 15, uuid(5));
  assert.equal((await d.connect(familyId(2), uuid(6))).body.state, 'connected');
  // owner-c は、Agent 2 との接続を切る。成果が出た後に切った人も、数えたまま。
  assert.equal((await c.act(uuid(5), 'disconnect', (await c.get(uuid(5))).body.revision)).status, 200);

  // 一覧（未サインインの人にも、同じ数が出る）と、詳細。
  for (const who of [a, w.as(null)]) assert.deepEqual(await usersOf(who), { [familyId(1)]: 2, [familyId(2)]: 1 });
  assert.equal((await intake(a, `id=${encodeURIComponent(familyId(1))}`)).body.users, 2);
  assert.equal((await intake(w.as(null), `id=${encodeURIComponent(familyId(2))}`)).body.users, 1);
  // 一覧は、行と利用人数を 1 回の batch で読む（D1 への往復を増やさない: batch の外の問い合わせは、前と同じ 3 つ。並べる順の 2 つと、件数）。
  const batches = w.f.batches.length, queries = w.f.queries.length;
  await intake(a);
  const batch = w.f.batches.at(-1);
  assert.deepEqual([w.f.batches.length - batches, batch.length, batch[1].includes('COUNT(DISTINCT c.owner_id)'), w.f.queries.length - queries - batch.length], [1, 2, true, 3]);
});

void test('every list of asks names the agent of each ask; all of one person\'s asks across agents come in one D1 round trip', async (t) => {
  // 「実行中」「成果データ」の画面が読む入口（GET /api/noah/ask）。Agent をまたいで並べるので、行から、その Agent の詳細へ戻れるように、系列の ID を添える。
  const definition = lookup();
  const server = mcpServer({ tools: [definition], call: () => ({ content: [{ type: 'text', text: 'one' }] }) });
  const other = mcpServer({ tools: [definition], call: () => ({ content: [{ type: 'text', text: 'two' }] }) });
  const { w, a, connectionId } = await connected(t, server, { servers: { [hostOf(2)]: other } });
  const ask = async (who, n, connection) => { w.f.advance(1_000); assert.equal((await who.ask({ id: uuid(n), connectionId: connection, form: await form(definition, { query: 'q' }) })).status, 202); };
  await ask(a, 10, connectionId);
  assert.equal((await a.connect(familyId(2), uuid(2))).body.state, 'connected');
  await ask(a, 11, uuid(2));
  // 切った接続の依頼も、どの Agent への物か分かる。
  assert.equal((await a.act(connectionId, 'disconnect', (await a.get(connectionId)).body.revision)).status, 200);
  const b = w.as('owner-b');
  assert.equal((await b.connect(familyId(1), uuid(3))).body.state, 'connected');
  await ask(b, 12, uuid(3));

  const queries = w.f.queries.length;
  const all = await a.asks();
  assert.equal(w.f.queries.length - queries, 1, 'D1 への往復は 1');
  assert.deepEqual([all.status, all.body.asks.map((item) => [item.id, item.agentId, item.state])], [200, [[uuid(11), familyId(2), 'succeeded'], [uuid(10), familyId(1), 'succeeded']]]);
  assert.equal(all.body.ownerScope, await ownerScopeFor('owner-a'), '止める時に添える本人の印も、一覧と一緒に返る');
  // Agent で絞った時・接続で絞った時も、同じく添える。1 件を読む時は、添えない（読む側が、もう知っている）。
  assert.deepEqual((await a.asksOf(familyId(1))).body.asks.map((item) => item.agentId), [familyId(1)]);
  assert.deepEqual((await a.asks(uuid(2))).body.asks.map((item) => item.agentId), [familyId(2)]);
  assert.equal('agentId' in (await a.askGet(uuid(10))).body, false);
  // 別の人の依頼は、混ざらない。
  assert.deepEqual((await b.asks()).body.asks.map((item) => [item.id, item.agentId]), [[uuid(12), familyId(1)]]);
  assert.equal((await w.as(null).asks()).status, 401);
});

void test('delegation gate rejects acceptance and rechecks revocation immediately before dispatch',async t=>{
  const definition=lookup(),server=mcpServer({tools:[definition]});
  const {w,a,connectionId}=await connected(t,server);
  let denied=true,checks=0;
  a.deps.authorizeAction=async(owner,target,action,digest,_confirmed)=>{checks++;assert.equal(owner,'owner-a');assert.equal(target,familyId(1));assert.equal(action,'lookup');assert.equal(digest,await shaOf(definition));if(denied)throw new NoahAgentError('任せない',403);};
  const service=createNoahAskService(a.deps);
  const input={id:uuid(901),connectionId,tool:'lookup',toolSha256:await shaOf(definition),input:{query:'synthetic'},confirm:false,screen:'narrow'};
  await assert.rejects(()=>service.ask('owner-a',false,input),{status:403});assert.equal(w.asked().length,0);assert.equal(calls(server).length,0);
  denied=false;const accepted=await service.ask('owner-a',false,input);assert.equal(accepted.status,202);
  denied=true;await accepted.run();assert.equal(calls(server).length,0);assert.equal(w.asked()[0].state,'failed');assert.match(w.asked()[0].error,/任せない/);assert.equal(checks,3);
});

void test('image result bytes persist through MCP, Work and owner-only detail without entering the list', async (t) => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1kAAAAASUVORK5CYII=';
  const definition = stats(), waiting = [];
  const server = mcpServer({tools:[definition],call:()=>({content:[{type:'image',mimeType:'image/png',data:png}]})});
  const {w,a,connectionId}=await connected(t,server,{config:{waitUntil:work=>waiting.push(work)}});
  await a.ask({id:uuid(810),connectionId,form:await form(definition,{})});await Promise.all(waiting);
  const one=await a.askGet(uuid(810));assert.equal(one.status,200);assert.equal(one.body.result.images[0].data,png);assert.equal(one.body.result.images[0].mimeType,'image/png');
  assert.equal((await w.as('owner-b').askGet(uuid(810))).status,404);
  assert.equal('result' in (await a.asks(connectionId)).body.asks[0],false);
});
