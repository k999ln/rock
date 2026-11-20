// 出すための運用（MVP L8）: 切り替え・巡回を起こす合図・窓口の文・上限の上書き・見張る数・戻し方・合図の記録・本番へ適用する物の形。
// 通信はしない。台帳も接続先も、この試験の中の関数（合成のサーバー）。相手が受けた要求を記録して、閉じた後に何も送らない事を確かめる。
// 仕様: docs/noah/spec-97-launch-ops.md の 9 章（表の行と、同じ順に並べてある）。
//
// 9 章の表の行と、この file の試験:
// - 切り替え（移す） … 「switches: …」の 4 本（docs/design-validation/noah/noah-flags.test.mjs の 4 群を、lib/noah-flags.ts へ向けて移した）
// - 合図（移す） … 「wake: …」と「the wake worker: …」
// - 窓口の文 … 「the notice for providers: …」
// - 上限の上書き … 「overriding the limits: …」
// - 見張る数 … 「the watched numbers: …」の 4 本
// - 戻し方 … 「closing the switches: …」と「stopping one provider only: …」
// - 記録 … 「the wake's log line: …」
// - 8 章（本番へ適用する物） … 「what is applied to production: …」
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { NOAH_ASK_MESSAGES } from '../lib/noah-ask.ts';
import * as botNotice from '../lib/noah-bot-notice.ts';
import { NOAH_CONNECT_MESSAGES } from '../lib/noah-connect.ts';
import { noahAllowed, parseNoahFlags } from '../lib/noah-flags.ts';
import { NOAH_HOST_BUSY, noahToolSha256 } from '../lib/noah-form.ts';
import { createIntakeApi, createIntakeTick } from '../lib/noah-intake-api.ts';
import { NOAH_REGISTRY } from '../lib/noah-intake-draft.ts';
import * as wakeLib from '../lib/noah-intake-wake.ts';
import { createNoahLaunchStatus, NOAH_LAUNCH_STATUS } from '../lib/noah-launch-status.ts';
import { NOAH_ASK_LIMITS } from '../lib/noah-limits.ts';
import { NOAH_PROBE } from '../lib/noah-probe.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { normalizeWorkJob } from '../lib/workflow.ts';
import { fixture, entry, page } from './fixtures/noah/intake.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid, handshakes, OPEN, ORIGIN, REGISTRY } from './fixtures/noah/connect-world.mjs';
import { screen } from './fixtures/noah/screen.mjs';

const { NOAH_PATROL_BUDGET, NOAH_WAKE, noahWakeSignature, verifyNoahWake } = wakeLib;
const MINUTE = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
/** 試験だけの、合図の鍵（32 文字以上）。本物の鍵ではない。 */
const KEY = 'synthetic-wake-test-only-'.repeat(2);
const SWITCHES = ['NOAH_PATROL_ENABLED', 'NOAH_INTAKE_PUBLIC', 'NOAH_ASK_FORM', 'NOAH_PROBE_L2'];
const brief = ({ status, body }) => [status, body.state ?? body.ask?.state ?? null, body.error ?? null];
const lookup = () => tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } });
const calls = (server) => server.log.filter((request) => request.rpc === 'tools/call');
/** 画面が、入力欄を開いた時に受け取る値（道具の名前と、その定義の hash）。 */
const form = async (definition, input) => ({ tool: definition.name, input, toolSha256: await noahToolSha256({ name: definition.name, description: definition.description ?? '', inputSchema: definition.inputSchema, readOnly: definition.annotations?.readOnlyHint === true }) });
/** 相手が、ある要求の所で、返事をしないまま止まる。open() で、返事をする。 */
function gate() {
  let open, reached;
  const opened = new Promise((resolve) => { open = resolve; }), arrived = new Promise((resolve) => { reached = resolve; });
  return { opened, arrived, open, reached };
}
/** 応答の後に続く仕事が、全部終わるのを待つ（途中で増えた分も）。 */
const settle = async (waiting) => { for (let seen = -1; seen !== waiting.length;) { seen = waiting.length; await Promise.all(waiting); } };
/** 巡回の合図の入口（Web の本体の側）を作る時の、足りない物。 */
const tickDeps = (f, env = {}, config = {}) => ({ ...f.deps, authenticate: async () => { throw Error('UNAUTHORIZED'); }, reviewers: [], flags: parseNoahFlags(env), wakeKey: KEY, ...config });
/** 署名の付いた合図を 1 回送る。 */
async function wake(f, tick) {
  const timestamp = String(f.time());
  return tick(new Request(`${ORIGIN}${NOAH_WAKE.path}`, { method: 'POST', body: '{}', headers: { 'x-noah-time': timestamp, 'x-noah-signature': await noahWakeSignature(KEY, timestamp) } }));
}

// ---------------------------------------------------------------------------
// 切り替え（7 章の表）。値の形が違う時に、開いた側へ倒れない事。
// ---------------------------------------------------------------------------

void test('switches: with nothing set, everything is closed and the numbers are the defaults', () => {
  assert.deepEqual(parseNoahFlags({}), {
    patrol: false, intakePublic: false, askForm: false, probeL2: false, modelRelay: 'off',
    askLimits: NOAH_ASK_LIMITS, patrolBudget: NOAH_PATROL_BUDGET, warnings: [],
  });
  // 既定の数は、仕様書（97 の 3 章・7 章）に書いてある数と同じ。変える時は、仕様書と、提供者への文（lib/noah-bot-notice.ts）も直す。
  assert.deepEqual(NOAH_ASK_LIMITS, { open: 8, perMinute: 10, perDay: 200, hostPerMinute: 30, connectLive: 50, connectPerMinute: 10, connectPerDay: 100, hostHandshakes: 60 });
  assert.deepEqual(NOAH_PATROL_BUDGET, { pages: 10, probes: 8, concurrent: 4, seconds: 25 });
  // 空の値は、置いていないのと同じ（知らせも出さない）。
  assert.deepEqual(parseNoahFlags(Object.fromEntries([...SWITCHES, 'NOAH_MODEL_RELAY', 'NOAH_ASK_LIMITS', 'NOAH_PATROL_BUDGET'].map((name) => [name, '']))), parseNoahFlags({}));
});

void test('switches: only the exact value true opens; any other shape stays closed and is reported to the operator', () => {
  const flags = parseNoahFlags({ NOAH_PATROL_ENABLED: 'true', NOAH_INTAKE_PUBLIC: 'TRUE', NOAH_ASK_FORM: '1', NOAH_PROBE_L2: 'false', NOAH_MODEL_RELAY: 'gpt' });
  assert.deepEqual([flags.patrol, flags.intakePublic, flags.askForm, flags.probeL2, flags.modelRelay], [true, false, false, false, 'off']);
  assert.deepEqual(flags.warnings, [
    'NOAH_INTAKE_PUBLIC は true か false です。閉じた物として扱います。', 'NOAH_ASK_FORM は true か false です。閉じた物として扱います。',
    'NOAH_MODEL_RELAY は off か test です。off として扱います。',
  ]);
  assert.equal(parseNoahFlags({ NOAH_MODEL_RELAY: 'test' }).modelRelay, 'test');
  // 4 つの切り替えのどれも、true と 1 字でも違えば閉じたまま。知らせは 1 つ。
  for (const name of SWITCHES) {
    for (const value of [' true', 'true ', 'True', 'yes', 'on', '1', 'enabled', 'true\n', '"true"']) {
      const parsed = parseNoahFlags({ [name]: value });
      assert.deepEqual([parsed.patrol, parsed.intakePublic, parsed.askForm, parsed.probeL2], [false, false, false, false], `${name}=${JSON.stringify(value)}`);
      assert.deepEqual(parsed.warnings, [`${name} は true か false です。閉じた物として扱います。`]);
    }
    // false は、閉じる（知らせは出さない）。true は、その 1 つだけを開ける。
    assert.deepEqual(parseNoahFlags({ [name]: 'false' }), parseNoahFlags({}));
    const opened = parseNoahFlags({ [name]: 'true' });
    assert.deepEqual([opened.patrol, opened.intakePublic, opened.askForm, opened.probeL2], SWITCHES.map((other) => other === name));
    assert.deepEqual(opened.warnings, []);
  }
});

void test('switches: number overrides take only known items, as whole numbers within the range', () => {
  const flags = parseNoahFlags({ NOAH_ASK_LIMITS: '{"perDay":50,"hostPerMinute":0,"speed":9}', NOAH_PATROL_BUDGET: '{"probes":16}' });
  assert.deepEqual(flags.askLimits, { ...NOAH_ASK_LIMITS, perDay: 50 });
  assert.deepEqual(flags.patrolBudget, { ...NOAH_PATROL_BUDGET, probes: 16 });
  assert.equal(flags.warnings.length, 2);
  assert.deepEqual(parseNoahFlags({ NOAH_ASK_LIMITS: '{こわれた' }).askLimits, NOAH_ASK_LIMITS);
  assert.deepEqual(parseNoahFlags({ NOAH_ASK_LIMITS: '[1,2]' }).askLimits, NOAH_ASK_LIMITS);
  assert.deepEqual(parseNoahFlags({ NOAH_ASK_LIMITS: 'null' }).askLimits, NOAH_ASK_LIMITS);
  assert.deepEqual(parseNoahFlags({ NOAH_ASK_LIMITS: '{"perDay":"50"}' }).askLimits, NOAH_ASK_LIMITS, '文字の数は採らない');
  assert.deepEqual(parseNoahFlags({ NOAH_ASK_LIMITS: '{"perDay":1.5,"open":-1,"perMinute":100001}' }).askLimits, NOAH_ASK_LIMITS, '小数・負の数・大きすぎる数は採らない');
  assert.deepEqual(parseNoahFlags({ NOAH_ASK_LIMITS: '{"perDay":100000,"open":1}' }).askLimits, { ...NOAH_ASK_LIMITS, perDay: 100_000, open: 1 }, '範囲の端は採る');
  assert.notEqual(parseNoahFlags({}).askLimits, NOAH_ASK_LIMITS, '既定の object そのものを返さない（書き換えが漏れない）');
  assert.notEqual(parseNoahFlags({}).patrolBudget, NOAH_PATROL_BUDGET);
  // 仕様書に書いてある例（97 の 3 章・7 章）は、知らせ無しで読める。
  for (const [name, example] of [['NOAH_ASK_LIMITS', '{"perDay":50}'], ['NOAH_ASK_LIMITS', '{"connectPerMinute":2,"hostHandshakes":5}'], ['NOAH_PATROL_BUDGET', '{"probes":16}'], ['NOAH_PATROL_BUDGET', '{"pages":10,"probes":8,"concurrent":4,"seconds":25}']])
    assert.deepEqual(parseNoahFlags({ [name]: example }).warnings, [], example);
});

void test('switches: reviewers can use what is closed; asking needs the list to be open too', () => {
  const closed = parseNoahFlags({});
  assert.deepEqual([noahAllowed(closed, 'list', false), noahAllowed(closed, 'ask', false), noahAllowed(closed, 'list', true), noahAllowed(closed, 'ask', true)], [false, false, true, true]);
  const listOnly = parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true' });
  assert.deepEqual([noahAllowed(listOnly, 'list', false), noahAllowed(listOnly, 'ask', false)], [true, false], '見せるだけ（頼むのは止めてある）');
  const askOnly = parseNoahFlags({ NOAH_ASK_FORM: 'true' });
  assert.deepEqual([noahAllowed(askOnly, 'list', false), noahAllowed(askOnly, 'ask', false)], [false, false], '一覧を閉じたまま、頼むことだけを開けない');
  const open = parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true' });
  assert.deepEqual([noahAllowed(open, 'list', false), noahAllowed(open, 'ask', false)], [true, true]);
  // 巡回の切り替えは、見せる・使わせるに関わらない（外への定期の通信だけを決める）。
  const patrolOnly = parseNoahFlags({ NOAH_PATROL_ENABLED: 'true' });
  assert.deepEqual([noahAllowed(patrolOnly, 'list', false), noahAllowed(patrolOnly, 'ask', false)], [false, false]);
});

// ---------------------------------------------------------------------------
// 巡回を起こす合図（4 章）。
// ---------------------------------------------------------------------------

void test('wake: signature, time, body and path', async () => {
  const now = 1_795_170_000_000, stamp = String(now);
  const signature = await noahWakeSignature(KEY, stamp);
  assert.equal(signature, createHmac('sha256', KEY).update(`${stamp}\nPOST\n/api/noah/intake/tick\n{}`).digest('hex'), '既存の合図（verifyWake）と同じ作り');
  const ok = { key: KEY, timestamp: stamp, signature, body: '{}', now };
  assert.equal(await verifyNoahWake(ok), true);
  assert.equal(await verifyNoahWake({ ...ok, now: now + NOAH_WAKE.maxSkewMs }), true);
  assert.equal(await verifyNoahWake({ ...ok, now: now + NOAH_WAKE.maxSkewMs + 1 }), false, '2 分より古い合図');
  assert.equal(await verifyNoahWake({ ...ok, now: now - NOAH_WAKE.maxSkewMs - 1 }), false, '2 分より先の時刻');
  assert.equal(await verifyNoahWake({ ...ok, body: '{"source":"mcp-registry"}' }), false, '合図に中身を持たせない');
  assert.equal(await verifyNoahWake({ ...ok, body: '{ }' }), false);
  assert.equal(await verifyNoahWake({ ...ok, path: '/api/noah/ask' }), false, '別の入口には使えない');
  assert.equal(await verifyNoahWake({ ...ok, signature: signature.replace(/^./, (c) => (c === '0' ? '1' : '0')) }), false);
  const short = KEY.slice(0, NOAH_WAKE.minKeyChars - 1);
  assert.equal(await verifyNoahWake({ ...ok, key: short, signature: await noahWakeSignature(short, stamp) }), false, '短い鍵は使わない');
  assert.equal(await verifyNoahWake({ ...ok, key: undefined }), false, '鍵を置いていなければ、誰の合図も通さない');
  assert.equal(await verifyNoahWake({ ...ok, timestamp: null }), false);
  assert.equal(await verifyNoahWake({ ...ok, timestamp: stamp.slice(0, 10) }), false, '秒の時刻は受けない');
  assert.equal(await verifyNoahWake({ ...ok, signature: 'zz' }), false);
  assert.deepEqual(NOAH_WAKE, { path: '/api/noah/intake/tick', maxSkewMs: 2 * MINUTE, minKeyChars: 32 });
});

/**
 * 専用の Worker（services/noah-patrol-wake/worker.ts）を、手元で動かす。
 * その file の import は拡張子を持たない（配備の道具が束ねる）ので、TypeScript を JS に直して読み、合図の作りは本物（lib/noah-intake-wake.ts）を渡す。
 */
function wakeWorker({ fetch, now }) {
  const source = readFileSync(new URL('../services/noah-patrol-wake/worker.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const unit = { exports: {} };
  const context = createContext({ fetch, AbortSignal, Error, String, RegExp, Date: class extends Date { static now() { return now(); } } });
  const require = (id) => { if (id === '../../lib/noah-intake-wake') return wakeLib; throw Error(`専用の Worker が、知らない物を読み込んでいます: ${id}`); };
  runInContext(`(function (exports, require, module) {${code}\n})`, context)(unit.exports, require, unit);
  return unit.exports.default;
}

void test('the wake worker: one signed, empty POST to the fixed path, accepted by the web side; a refusal fails the run', async (t) => {
  const agent = mcpServer();
  let registry = () => page([entry(1)]);
  const f = fixture(t, async (url, init) => (new URL(String(url)).hostname === REGISTRY ? registry() : agent.fetch(url, init)));
  const sent = [];
  // 専用の Worker が送った要求を、そのまま、Web の本体の入口へ渡す。
  const through = (tick) => async (url, init) => {
    sent.push({ url: String(url), init });
    return tick(new Request(url, { method: init.method, body: init.body, headers: init.headers }));
  };
  const run = (env, tickEnv = {}, config = {}) => wakeWorker({ now: () => f.time(), fetch: through(createIntakeTick(tickDeps(f, tickEnv, config))) }).scheduled({}, { NOAH_ORIGIN: 'noah.test', NOAH_PATROL_WAKE_KEY: KEY, ...env });

  // HTTP の入口が無い（定期に動く口だけ）。
  assert.deepEqual(Object.keys(wakeWorker({ now: () => f.time(), fetch: async () => new Response('{}') })), ['scheduled']);

  // 巡回が閉じている間: 合図は届き、署名も通るが、何もしない（台帳も、表も、相手も、触らない）。実行は成功。
  await run({});
  assert.equal(sent.length, 1);
  const [{ url, init }] = sent;
  assert.equal(url, 'https://noah.test/api/noah/intake/tick');
  assert.deepEqual([init.method, init.body, init.redirect], ['POST', '{}', 'manual']);
  // 合図が持つのは、時刻と署名と、空の本文だけ。
  assert.deepEqual(Object.keys(init.headers).sort((a, b) => a.localeCompare(b)), ['Content-Type', 'x-noah-signature', 'x-noah-time']);
  assert.equal(init.headers['x-noah-time'], String(f.time()));
  assert.match(init.headers['x-noah-signature'], /^[a-f0-9]{64}$/);
  assert.deepEqual([f.queries.length, agent.log.length], [0, 0]);

  // 巡回を開けると、同じ合図で、台帳を読み、握手する（握手と、道具の一覧の読み取りだけ。道具は呼ばない）。
  await run({}, { NOAH_PATROL_ENABLED: 'true' });
  assert.deepEqual(agent.log.map((request) => request.rpc), ['initialize', 'notifications/initialized', 'tools/list']);
  assert.equal(f.check(1).result, 'ok');

  // 鍵が合わない・時刻が 2 分より離れている: 401。専用の Worker の実行は、失敗として残る。
  await assert.rejects(run({ NOAH_PATROL_WAKE_KEY: KEY.replace('wake', 'woke') }, { NOAH_PATROL_ENABLED: 'true' }), /Noah wake HTTP 401/);
  await assert.rejects(wakeWorker({ now: () => f.time() - NOAH_WAKE.maxSkewMs - 1, fetch: through(createIntakeTick(tickDeps(f, { NOAH_PATROL_ENABLED: 'true' }))) }).scheduled({}, { NOAH_ORIGIN: 'noah.test', NOAH_PATROL_WAKE_KEY: KEY }), /Noah wake HTTP 401/);
  // Web の本体に鍵を置いていない: 401。
  await assert.rejects(run({}, { NOAH_PATROL_ENABLED: 'true' }, { wakeKey: undefined }), /Noah wake HTTP 401/);
  // 台帳を読めなかった合図は 500。実行は、失敗として残る（監視で、成功に見せない）。
  f.advance(2 * HOUR);
  registry = () => new Response('', { status: 503 });
  await assert.rejects(run({}, { NOAH_PATROL_ENABLED: 'true' }), /Noah wake HTTP 500/);

  // 形の違う設定では、送らない（行き先を、host の名前だけに限る。鍵は 32 文字以上）。
  const before = sent.length;
  // 鍵（secret）を置く前に配備した時も、同じ（送らずに、設定が違うと分かる失敗にする）。
  for (const env of [{ NOAH_ORIGIN: 'https://noah.test' }, { NOAH_ORIGIN: 'noah.test/api' }, { NOAH_ORIGIN: 'noah.test:8443' }, { NOAH_ORIGIN: 'localhost' }, { NOAH_ORIGIN: '' }, { NOAH_ORIGIN: undefined }, { NOAH_PATROL_WAKE_KEY: KEY.slice(0, 31) }, { NOAH_PATROL_WAKE_KEY: undefined }])
    await assert.rejects(run(env), /Invalid Noah wake configuration/, JSON.stringify(Object.keys(env)));
  assert.equal(sent.length, before);

  // 配備の設定: 毎分の cron が 1 つ。HTTP の入口・preview の URL を持たない。鍵は、設定の file に書かない（secret で置く）。
  const config = ts.parseConfigFileTextToJson('wrangler.jsonc', readFileSync(new URL('../services/noah-patrol-wake/wrangler.jsonc', import.meta.url), 'utf8')).config;
  assert.deepEqual(config.triggers, { crons: ['* * * * *'] });
  assert.deepEqual([config.workers_dev, config.preview_urls, 'routes' in config, 'route' in config], [false, false, false, false]);
  assert.deepEqual(Object.keys(config.vars), ['NOAH_ORIGIN']);
  assert.match(config.vars.NOAH_ORIGIN, /^[a-z0-9.-]+$/);
});

// ---------------------------------------------------------------------------
// 取り下げ・報告の窓口（5 章）。
// ---------------------------------------------------------------------------

void test('the notice for providers: in the help page as #bot, hidden until a contact is decided; its numbers are the ones the code uses', async (t) => {
  // 使い方の頁（/noah/help）の部品を、そのまま描く。外枠と、接続状態の読み取りは、この試験に関わらないので、空の物に替える。
  const stubs = { './workspace-shell': { default: (props) => ({ type: 'main', props: { children: props.children }, key: null }) }, '@/lib/use-sky-service-status': { useSkyServiceStatus: () => undefined } };
  const open = (notice) => screen({ fetch: async () => ({ status: 404, body: {} }), modules: { ...stubs, '@/lib/noah-bot-notice': notice } }).mount('components/sky-service-help.tsx');
  const section = (helpPage) => helpPage.nodes().filter((node) => node.type === 'section' && node.props.id === 'bot');

  // 宛先が決まるまで: 節は、木の中にあるが、出さない（hidden）。宛先の文は、無い。
  assert.equal(botNotice.NOAH_REPORT_CONTACT, null, '宛先は、本人が決める（docs/noah/mvp-launch.md の D8）。決まるまで null');
  const undecided = open(botNotice);
  assert.equal(section(undecided).length, 1);
  const [hiddenSection] = section(undecided);
  assert.equal(hiddenSection.props.hidden, true);
  const text = undecided.text(hiddenSection);
  for (const phrase of ['外の道具・Agent を提供している方へ', 'NoahBot/1', '1 時間に 1 回まで', '1 分に 60 回まで', '提携や公認の関係はありません', 'Official MCP Registry', 'initialize', 'tools/list', 'Noah/1', '道具を自動で呼ぶ事はしません', '利用者の名前・アカウントは送りません', '429', 'Retry-After', '401', '別の host への転送には従いません'])
    assert.ok(text.includes(phrase), phrase);
  assert.doesNotMatch(text, /知らせてください/);
  assert.deepEqual(undecided.nodes(hiddenSection).filter((node) => node.type === 'a'), []);

  // 文の中の数は、作りの数と同じ。既定を変えた時は、文（NOAH_BOT_NOTICE_NUMBERS）も直す。
  const numbers = botNotice.NOAH_BOT_NOTICE_NUMBERS;
  assert.equal(numbers.userHandshakesPerMinute, NOAH_ASK_LIMITS.hostHandshakes);
  assert.equal(numbers.patrolHostEveryHours * HOUR, NOAH_PROBE.hostEveryMs);
  assert.equal(numbers.registryEveryHours * HOUR, NOAH_REGISTRY.everyMs);
  const notice = botNotice.noahBotNotice();
  assert.ok(notice.paragraphs[0].includes(`${numbers.registryEveryHours} 時間に 1 回ほど読み`));
  assert.ok(notice.paragraphs[0].includes(`同じ接続先へは、${numbers.patrolHostEveryHours} 時間に 1 回までです`));
  assert.ok(notice.paragraphs[1].includes(`全員を合わせて 1 分に ${numbers.userHandshakesPerMinute} 回までです`));
  assert.deepEqual([notice.shown, notice.report], [false, null]);

  // 文に書いた名乗りは、実際に送る名乗りと同じ（巡回は NoahBot/1、利用者の操作からは Noah/1。どちらも、この節の URL を持つ）。
  const agent = mcpServer();
  const w = await world(t, { [hostOf(1)]: agent }, { patrol: false });
  const registryCalls = [];
  w.net.routes[REGISTRY] = async (url, init) => { registryCalls.push(new Headers(init.headers).get('user-agent')); return page([entry(1)]); };
  w.f.advance(2 * HOUR);
  await w.sync();
  await w.patrol();
  assert.deepEqual([...new Set([...registryCalls, ...agent.log.map((request) => request.headers['user-agent'])])], ['NoahBot/1 (+https://avoado.si/noah/help#bot)']);
  agent.log.length = 0;
  assert.equal((await w.as('owner-a').connect(familyId(1), uuid(1))).body.state, 'connected');
  assert.deepEqual([...new Set(agent.log.map((request) => request.headers['user-agent']))], ['Noah/1 (+https://avoado.si/noah/help#bot)']);

  // 宛先が決まった後: 節が出て、宛先への道が、文の中に 1 つある。
  for (const contact of [{ label: 'example.org の窓口', href: 'https://example.org/report' }, { label: 'report@example.org', href: 'mailto:report@example.org' }]) {
    const decided = open({ ...botNotice, noahBotNotice: () => botNotice.noahBotNotice(contact) });
    const [shown] = section(decided);
    assert.equal(shown.props.hidden, false);
    assert.ok(decided.text(shown).includes(`一覧から外してほしい時、説明が違う時、迷惑な内容を見つけた時は、${contact.label} へ知らせてください。台帳の記録を外した物・非推奨にした物は、1 時間以内に、Noah の一覧からも外れます。`));
    const links = decided.nodes(shown).filter((node) => node.type === 'a');
    assert.deepEqual(links.map((node) => [node.props.href, decided.text(node)]), [[contact.href, contact.label]]);
    // 外の頁は、別の tab で開く（開いた頁から、元の頁を操作させない）。メールは、そのまま。
    assert.deepEqual([links[0].props.target, links[0].props.rel], contact.href.startsWith('https://') ? ['_blank', 'noopener noreferrer'] : [undefined, undefined]);
    // 節の順: 題 → 巡回 → 利用者の操作 → 守る事 → 窓口 → 出どころ。
    const order = ['外の道具・Agent を提供している方へ', 'NoahBot/1', '名乗り Noah/1', 'Retry-After', '知らせてください', '出どころ: Official MCP Registry'].map((phrase) => decided.text(shown).indexOf(phrase));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.ok(order.every((index) => index >= 0));
  }
});

// ---------------------------------------------------------------------------
// 上限の上書き（7 章の NOAH_ASK_LIMITS）。
// ---------------------------------------------------------------------------

void test('overriding the limits: the third connection within a minute is refused; the sixth handshake to one provider within a minute is not sent', async (t) => {
  const definition = lookup();
  const servers = { [hostOf(1)]: mcpServer({ tools: [definition] }), [hostOf(2)]: mcpServer(), [hostOf(3)]: mcpServer(), [hostOf(4)]: mcpServer() };
  const w = await world(t, servers);
  const env = { ...OPEN, NOAH_ASK_LIMITS: '{"connectPerMinute":2,"hostHandshakes":5}' };
  assert.deepEqual(parseNoahFlags(env).warnings, []);

  // 同じ本人の、直近 60 秒の 3 件目の接続は 429。行はできず、相手へも送らない。
  const a = w.as('owner-a', { env });
  assert.deepEqual(brief(await a.connect(familyId(2), uuid(1))), [200, 'connected', null]);
  w.f.advance(1_000);
  assert.deepEqual(brief(await a.connect(familyId(3), uuid(2))), [200, 'connected', null]);
  w.f.advance(1_000);
  assert.deepEqual(brief(await a.connect(familyId(4), uuid(3))), [429, null, '続けてつなぎすぎています。少し待ってから試してください。']);
  assert.equal(handshakes(servers[hostOf(4)]), 0);
  assert.equal(w.rows('owner_id=?', 'owner-a').length, 2);
  // 60 秒たつと、また通る。
  w.f.advance(MINUTE);
  assert.deepEqual(brief(await a.connect(familyId(4), uuid(3))), [200, 'connected', null]);

  // 1 つの接続先へ、利用者の操作から始める握手は、全員を合わせて 60 秒に 5 回まで。6 回目は、相手へ送らない。
  const plan = (await w.as('owner-0', { env }).plan(familyId(1))).body.planSha256;
  const states = [];
  for (let n = 0; n < 6; n++) {
    w.f.advance(500);
    states.push(brief(await w.as(`owner-${n}`, { env }).connect(familyId(1), uuid(10 + n), plan)));
  }
  assert.deepEqual(states, [...Array.from({ length: 5 }, () => [200, 'connected', null]), [200, 'failed', NOAH_HOST_BUSY]]);
  assert.equal(handshakes(servers[hostOf(1)]), 5, '相手が受けた握手は 5 回');
  // 道具の一覧も、依頼も、同じ枠を使う。枠が無い間は、相手へ送らない。
  assert.deepEqual(brief(await w.as('owner-0', { env }).tools(uuid(10))), [429, null, NOAH_HOST_BUSY]);
  assert.deepEqual(brief(await w.as('owner-0', { env }).ask({ id: uuid(100), connectionId: uuid(10), form: await form(definition, { query: 'q' }) })), [429, null, NOAH_HOST_BUSY]);
  assert.deepEqual([handshakes(servers[hostOf(1)]), calls(servers[hostOf(1)]).length, w.asked().length], [5, 0, 0]);
  // 別の接続先の枠は別。
  assert.deepEqual(brief(await w.as('owner-9', { env }).connect(familyId(2), uuid(20))), [200, 'connected', null]);
  // 既定の数（60 回）のままなら、同じ時に、通る（別の人の接続で確かめる。同じ接続の道具の一覧は、5 秒あけないと開けない）。
  const usual = await w.as('owner-1').tools(uuid(11));
  assert.deepEqual([usual.status, usual.body.tools.map((item) => item.name)], [200, ['lookup']]);
  assert.equal(handshakes(servers[hostOf(1)]), 6);
});

// ---------------------------------------------------------------------------
// 見張る数（6 章）。
// ---------------------------------------------------------------------------

/** 表へ、行を直に置く（数える試験のため。握手・接続・依頼の作りは、通さない）。 */
const insert = (w, table, row) => { w.f.sql.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row)); };
/** 本人の ID・道具の名前は、応答に出てはいけない物として、見分けられる字を入れておく。 */
const person = (n) => `person-secret-${n}`;
const TOOL = 'tool-secret-name';
const QUIET = 'agent-9.example.com';

/**
 * 数える試験の世界。now は、数える時刻（2026-11-21 10:00 UTC）。返す launch() は、審査者として GET /api/noah/intake?state=1 を呼ぶ。
 * 置く物は、下の試験が、手で数えた値と比べる（この関数の中の表が、その数え方の元）。
 */
async function counted(t) {
  // 握手の結果が違う相手: 1・2 は通る。3 は、認証を求める（401）。4 は、応答しない。
  const servers = { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer(), [hostOf(3)]: mcpServer({ status: 401 }), [hostOf(4)]: async () => { throw new TypeError('fetch failed'); } };
  const w = await world(t, servers, { reviewers: ['reviewer'] });
  // 1 日たってから、台帳に 7 件が増えた（名寄せが動いて、系列の行ができる）。握手は、まだ。
  const secret = { type: 'streamable-http', url: `https://${hostOf(8)}/mcp`, headers: [{ name: 'Authorization', isRequired: true, isSecret: true }] };
  const sameHost = (i, host) => entry(i, { remotes: [{ type: 'streamable-http', url: `https://${host}/other-${i}` }] });
  w.f.advance(DAY);
  await w.sync([1, 2, 3, 4, 5, 6, 7].map((i) => entry(i)).concat([entry(8, { remotes: [secret] }), entry(9), sameHost(10, hostOf(1)), sameHost(11, hostOf(2))]));
  const now = w.f.time(), sql = w.f.sql;
  assert.equal(new Date(now).toISOString(), '2026-11-21T10:00:00.000Z');

  // --- 握手の表 ---
  // 5: まだ握手していない（握手する物）。6: 量産の系列。7: 取り下げた系列。8: 鍵が要る。9: 台帳から消えた候補。
  sql.prepare("UPDATE noah_intake_candidates SET family_id='bulk:test.provider' WHERE id=?").run(familyId(6));
  await w.f.store.moderate('withdraw', familyId(7), w.family(7).revision);
  sql.prepare("UPDATE noah_intake_candidates SET state='withdrawn' WHERE id=?").run(familyId(9));
  // 10・11: 接続先を、1・2 と分け合う候補。1 と 10 は、50 分前と 10 分前に握手した（1 時間に 2 回）。2 と 11 は、59 分 30 秒前と 5 分前（窓の外）。
  for (const [i, result, ago] of [[1, null, 50 * MINUTE], [10, 'rate_limited', 10 * MINUTE], [2, null, 59 * MINUTE + 30_000], [11, 'forbidden', 5 * MINUTE]])
    sql.prepare('UPDATE noah_intake_checks SET checked_at=?,result=COALESCE(?,result) WHERE candidate_id=?').run(now - ago, result, familyId(i));

  // --- 接続先の表 ---
  // 1: 直近 60 秒の枠（60 回）を使い切った。2: 59 回（残りがある）。3: 使い切ったが、61 秒前の枠。4: 相手が「混んでいる」と返して、60 秒先まで待っている。
  for (const [i, windowAt, count, notBefore] of [[1, now - 30_000, 60, now - 1], [2, now - 30_000, 59, 0], [3, now - 61_000, 60, 0], [4, 0, 0, now + MINUTE]])
    sql.prepare('INSERT INTO noah_probe_hosts(host,last_probe_at,not_before,user_window_at,user_count) VALUES(?,?,?,?,?) ON CONFLICT(host) DO UPDATE SET not_before=excluded.not_before,user_window_at=excluded.user_window_at,user_count=excluded.user_count').run(hostOf(i), now - DAY, notBefore, windowAt, count);

  // --- 接続の表 ---（[番号, 本人, 状態, 作った時（時間前）, つながった時（時間前。無ければ null）, 握手の時間]）
  const connections = [
    [1, 1, 'connected', 1, 1, 400], [2, 2, 'connected', 2, 2, 600], [3, 2, 'failed', 3, null, null], [4, 3, 'disconnected', 30, 30, 1000],
    [5, 4, 'connected', 8 * 24, 8 * 24, 5000], [7, 1, 'planned', 0.2, null, null], [8, 6, 'connected', 26, 23, 800],
  ];
  const connection = (n, owner, state, created, connectedAt, probeMs, extra = {}) => insert(w, 'noah_connections', {
    id: uuid(1000 + n), owner_id: person(owner), family_key: `seed-${n}`, agent_id: `seed-${n}`, digest: 'd'.repeat(64), request_sha256: 'e'.repeat(64),
    connect_json: '{}', connect_sha256: 'f'.repeat(64), plan_sha256: 'f'.repeat(64), place: 'provider', state, consent_json: '{}', price_json: '{}', cost_taps: 0, cost_typed: 0, revision: 1,
    created_at: now - created * HOUR, updated_at: now - created * HOUR, connected_at: connectedAt === null ? null : now - connectedAt * HOUR, probe_ms: probeMs,
    disconnected_at: state === 'disconnected' ? now - HOUR : null, ...extra,
  });
  for (const row of connections) connection(...row);
  // 本人の端末へつないだ接続は、数えない（相手のサーバーへの接続だけを数える）。
  insert(w, 'noah_runner_devices', { id: 'device-1', owner_id: person(9), credential_sha256: 'c'.repeat(64), boot_id: 'boot', name: 'Mac', platform: 'darwin', created_at: now - DAY, last_seen_at: now });
  connection(9, 9, 'connected', 1, 1, 50, { place: 'home', device_id: 'device-1' });

  // --- 依頼の表 ---（[本人, 接続先, 状態, 頼んだ時（時間前）, 画面の幅]）
  const A = hostOf(1), B = hostOf(2), C = hostOf(3);
  const asks = [
    // A: 直近 7 日に 8 件（失敗 3・結果不明 1）。8 日前の失敗は、数えない。
    [1, A, 'succeeded', 1, 'narrow'], [1, A, 'succeeded', 25, 'narrow'], [2, A, 'failed', 2, 'wide'], [2, A, 'failed', 3, 'wide'], [3, A, 'failed', 50, null], [3, A, 'unknown', 4, 'narrow'],
    [4, A, 'failed', 8 * 24, 'narrow'], [1, A, 'running', 1 / 60, 'narrow'], [3, A, 'stopped', 20, 'wide'],
    // B: 直近 7 日に 6 件（失敗 1）。
    [2, B, 'succeeded', 5, 'narrow'], [2, B, 'succeeded', 6, 'narrow'], [4, B, 'succeeded', 30, 'wide'], [5, B, 'succeeded', 100, 'narrow'], [5, B, 'failed', 101, 'narrow'], [2, B, 'queued', 1 / 60, null],
    // C: 4 件とも失敗。5 件未満なので、名前を出さない。
    [6, C, 'failed', 7, 'wide'], [6, C, 'failed', 8, 'wide'], [6, C, 'failed', 9, 'wide'], [6, C, 'failed', 11, 'wide'],
    // 失敗の無い接続先（5 件）。名前を出さない。9 日前の成果は、期間の数には入らないが、「戻ってきた人」には入る。
    [7, QUIET, 'succeeded', 12, 'narrow'], [7, QUIET, 'succeeded', 13, 'narrow'], [7, QUIET, 'succeeded', 14, 'narrow'], [7, QUIET, 'succeeded', 15, 'narrow'], [7, QUIET, 'succeeded', 16, 'narrow'],
    [4, QUIET, 'succeeded', 9 * 24, 'narrow'],
  ];
  for (const [index, [owner, host, state, hours, width]] of asks.entries()) {
    const at = now - Math.round(hours * HOUR), open = state === 'running' || state === 'queued';
    insert(w, 'noah_asks', { id: uuid(2000 + index), owner_id: person(owner), connection_id: uuid(1001), work_id: uuid(3000 + index), request_sha256: 'a'.repeat(64), mode: 'form', host, tool: TOOL, tool_sha256: 'b'.repeat(64),
      screen: width, state, revision: 1, created_at: at, updated_at: at, finished_at: open ? null : at });
  }

  const reviewer = (env = {}) => createIntakeApi({ ...w.f.deps, flags: parseNoahFlags(env), reviewers: ['reviewer'], authenticate: async () => 'reviewer' });
  const read = async (env) => { const response = await reviewer(env)(new Request(`${ORIGIN}/api/noah/intake?state=1`)); return { status: response.status, body: await response.json() }; };
  return { w, now, read, A, B, C, launch: async (env) => (await read(env)).body.launch };
}

void test('the watched numbers: each one equals a hand count', async (t) => {
  const { w, now, read, A, B } = await counted(t);
  const batches = w.f.batches.length;
  const { status, body } = await read({ NOAH_PATROL_ENABLED: 'true', NOAH_INTAKE_PUBLIC: 'true' });
  assert.equal(status, 200);
  // 見張る数は、D1 へ 1 往復（16 文の batch）。
  const launchBatches = w.f.batches.slice(batches).filter((batch) => batch.some((query) => query.includes('noah_asks')));
  assert.deepEqual(launchBatches.map((batch) => batch.length), [16]);

  const source = w.f.source();
  assert.deepEqual(body.launch, {
    at: now,
    flags: { patrol: true, intakePublic: true, askForm: false, probeL2: false },
    // 台帳は、今読み終えた所（2 回目の巡回。1 日ぶりなので、全件ではなく、更新された物だけ）。見た記録は 11 件。
    registry: { lastSuccessAt: now, nextRunAt: now + HOUR, checkpointAt: now, lastFullAt: now - DAY, sweeping: false, errorCode: null, failureCount: 0, observed: 11, stalled: false },
    // まだ握手していないのは、5 だけ（6 は量産、7 は取り下げ、8 は鍵が要る、9 は台帳から消えた。10・11 は、握手の結果がある）。
    unchecked: 1,
    // 握手の結果（鍵の要らない、相手のサーバーの候補の全部）: 通った 1・2／認証 3／応答しない 4／握手していない 5・6・7・9／混んでいる 10／断られた 11。8（鍵が要る）は数えない。
    handshakes: { ok: 2, auth_required: 1, unreachable: 1, unchecked: 4, rate_limited: 1, forbidden: 1 },
    // 1 と 10（同じ接続先）が、50 分前と 10 分前。2 と 11 は、59 分 30 秒前と 5 分前で、窓（59 分）の外。
    hostsProbedTwice: 1,
    // 枠を使い切ったのは 1 だけ（2 は 59 回、3 は前の枠）。待っているのは 4 だけ（1 の待ちは、もう過ぎた）。
    hosts: { full: 1, waiting: 1 },
    day: {
      // 作ったのが 24 時間以内: 1・2（つながった。握手 400・600 → 平均 500）、3（失敗）、7（途中）。26 時間前の 8、30 時間前の 4、端末への 9 は入らない。
      connections: { connected: { count: 2, probeMs: 500 }, failed: { count: 1, probeMs: null }, planned: { count: 1, probeMs: null } },
      probeMs: 500,
      asks: { succeeded: 8, failed: 6, unknown: 1, running: 1, queued: 1, stopped: 1 },
      screens: { narrow: 10, wide: 7, unknown: 1 },
      // つながったのが 24 時間以内の人: 1・2・6（6 は、26 時間前に作り、23 時間前につながった）。成果が出た人: 1・2・7。
      people: { connected: 3, succeeded: 3 },
    },
    week: {
      // 7 日以内: 上に、8（つながった。800 → 平均 600）と、4（切った。1000）が足される。8 日前の 5 は入らない。
      // 握手が通った物の全部の平均は、(400 + 600 + 800 + 1000) / 4 = 700（状態ごとの平均 600 と 1000 の、ただの平均 800 ではない）。
      connections: { connected: { count: 3, probeMs: 600 }, failed: { count: 1, probeMs: null }, planned: { count: 1, probeMs: null }, disconnected: { count: 1, probeMs: 1000 } },
      probeMs: 700,
      asks: { succeeded: 11, failed: 8, unknown: 1, running: 1, queued: 1, stopped: 1 },
      screens: { narrow: 13, wide: 8, unknown: 2 },
      people: { connected: 4, succeeded: 5 },
    },
    // 成果が、2 日以上にある人: 1（11/21 と 11/20）と、4（11/20 と 11/12）。2・7 は、同じ日に 2 件以上あるだけ。5 は 1 件。
    returned: 2,
    // 依頼が 5 件以上あり、失敗か結果不明がある接続先だけ。割合の高い順（A は 4/8、B は 1/6）。C（4 件）と、失敗の無い接続先は、出ない。
    failingHosts: [{ host: A, failed: 3, unknown: 1, total: 8 }, { host: B, failed: 1, unknown: 0, total: 6 }],
  });
  // 表の値からも、確かめる（台帳の巡回の行は、表のその列そのまま）。
  assert.deepEqual([body.launch.registry.lastSuccessAt, body.launch.registry.nextRunAt, body.launch.registry.lastFullAt, body.launch.registry.observed], [source.last_success_at, source.next_run_at, source.last_full_at, source.observed]);
  assert.deepEqual([w.f.check(8).setup, w.f.check(5).result, w.family(7).withdrawn_at !== null], [1, 'unchecked', true]);
});

void test('the watched numbers: only numbers leave; no person, no ask content, and no provider with few asks is named', async (t) => {
  const { w, read, A, B, C } = await counted(t);
  const { body } = await read({});
  const launch = JSON.stringify(body.launch), whole = JSON.stringify(body);
  // 本人の ID・接続や依頼や Work の ID・道具の名前・接続先の URL は、応答のどこにも無い。
  for (const secret of ['person-secret', TOOL, '00000000-', 'device-1', 'https://', 'seed-']) {
    assert.equal(launch.includes(secret), false, secret);
    assert.equal(whole.includes(secret), false, secret);
  }
  // 見張る数に出る文字の値は、「失敗の多い接続先」の 2 つの名前だけ。残りは、数と真偽と null。
  // 依頼が 4 件の接続先（C）と、失敗の無い接続先（QUIET）は、値にも、項目の名前にも、出ない。
  const strings = [], keys = new Set();
  JSON.parse(launch, (key, value) => { keys.add(key); if (typeof value === 'string') strings.push(value); return value; });
  assert.deepEqual(strings, [A, B]);
  assert.deepEqual(body.launch.failingHosts.map((row) => row.host), [A, B]);
  assert.deepEqual([strings.indexOf(C), strings.indexOf(QUIET), keys.has(C), keys.has(QUIET)], [-1, -1, false, false]);
  // 項目の名前は、決まった語だけ（接続先の名前や ID を、項目の名前にしていない）。
  assert.deepEqual([...keys].filter((key) => !/^(?:[a-zA-Z_][a-zA-Z0-9_]*|\d*)$/.test(key)), []);

  // 審査者でない人・サインインしていない人には、切り替えを開けていても、見せない。
  for (const user of ['someone', null]) {
    const api = createIntakeApi({ ...w.f.deps, flags: parseNoahFlags(OPEN), reviewers: ['reviewer'], authenticate: async () => { if (!user) throw Error('UNAUTHORIZED'); return user; } });
    const response = await api(new Request(`${ORIGIN}/api/noah/intake?state=1`));
    assert.deepEqual([response.status, await response.json()], [404, { error: '見つかりません。' }]);
  }
});

void test('the watched numbers: counted once every five minutes; the switches are always current; a failure hides only these rows', async (t) => {
  const { w, now, read } = await counted(t);
  const launchBatches = () => w.f.batches.filter((batch) => batch.some((query) => query.includes('noah_asks'))).length;
  const first = (await read({})).body.launch;
  assert.deepEqual([first.at, launchBatches()], [now, 1]);
  // 5 分の間は、数え直さない（数えた時刻も同じ）。切り替えだけは、今の値を返す。
  insert(w, 'noah_probe_hosts', { host: 'agent-20.example.com', last_probe_at: now, not_before: now + HOUR });
  w.f.advance(NOAH_LAUNCH_STATUS.cacheMs - 1);
  const again = (await read({ NOAH_PATROL_ENABLED: 'true', NOAH_ASK_FORM: 'true' })).body.launch;
  assert.deepEqual([again.at, launchBatches(), again.hosts.waiting], [now, 1, 1]);
  assert.deepEqual([first.flags, again.flags], [{ patrol: false, intakePublic: false, askForm: false, probeL2: false }, { patrol: true, intakePublic: false, askForm: true, probeL2: false }]);
  assert.deepEqual({ ...again, flags: first.flags }, first);
  // 5 分たつと、数え直す。
  w.f.advance(1);
  const later = (await read({})).body.launch;
  assert.deepEqual([later.at, launchBatches(), later.hosts.waiting], [now + NOAH_LAUNCH_STATUS.cacheMs, 2, 1]);
  assert.equal(later.hosts.full, 0, '5 分前の枠は、もう数えない');

  // 「枠を使い切った」の境は、今の上限（NOAH_ASK_LIMITS の hostHandshakes）。
  const f = fixture(t);
  for (const [n, count] of [[1, 5], [2, 4], [3, 60]]) f.sql.prepare('INSERT INTO noah_probe_hosts(host,last_probe_at,user_window_at,user_count) VALUES(?,?,?,?)').run(hostOf(n), f.time(), f.time() - 1_000, count);
  assert.equal((await createNoahLaunchStatus(f.deps)(parseNoahFlags({ NOAH_ASK_LIMITS: '{"hostHandshakes":5}' }))).hosts.full, 2);
  const g = fixture(t);
  for (const [n, count] of [[1, 5], [2, 4], [3, 60]]) g.sql.prepare('INSERT INTO noah_probe_hosts(host,last_probe_at,user_window_at,user_count) VALUES(?,?,?,?)').run(hostOf(n), g.time(), g.time() - 1_000, count);
  assert.equal((await createNoahLaunchStatus(g.deps)(parseNoahFlags({}))).hosts.full, 1);

  // 数えられない時（表を読めない）は、見張る数だけが null。取り込みの節の、他の行は出る。次に読めた時は、数える。
  w.f.advance(NOAH_LAUNCH_STATUS.cacheMs);
  w.f.hooks.fail = (query) => query.includes('noah_asks');
  const broken = await read({});
  assert.deepEqual([broken.status, broken.body.launch, typeof broken.body.listed, Array.isArray(broken.body.families)], [200, null, 'number', true]);
  delete w.f.hooks.fail;
  assert.equal((await read({})).body.launch.at, w.f.time());
});

void test('the watched numbers: the registry patrol is called stopped only after two hours without a success or a start', async (t) => {
  const f = fixture(t), launch = createNoahLaunchStatus(f.deps), flags = parseNoahFlags({});
  // まだ 1 回も動いていない。
  assert.equal((await launch(flags)).registry, null);
  f.sql.prepare("INSERT INTO noah_intake_sources(id) VALUES('mcp-registry')").run();
  const cases = [
    // [最後の成功（分前。無ければ null）, 進行中の巡回を始めた時（分前。無ければ null）, 止まっているか, 理由]
    [null, 10, false, '最初の全件の読み取りの途中（約 70 分掛かる）'],
    [null, 121, true, '最初の読み取りが、2 時間たっても終わらない'],
    [null, null, true, '1 回も成功していず、読み取りも進んでいない（続けて失敗して、始め直しを待っている）'],
    [60, null, false, '1 時間前に成功した'],
    [120, null, false, 'ちょうど 2 時間前'],
    [121, null, true, '2 時間を過ぎた'],
    [130, 70, false, '7 日ごとの全件の読み直しの途中（成功の時刻は古いが、読み取りを始めたのは新しい）'],
    [500, 121, true, '読み取りが、2 時間たっても終わらない'],
  ];
  for (const [success, sweep, stalled, why] of cases) {
    // 数え直すように、5 分進める。
    f.advance(NOAH_LAUNCH_STATUS.cacheMs);
    const at = f.time();
    f.sql.prepare("UPDATE noah_intake_sources SET last_success_at=?,sweep_started_at=?,failure_count=?,error_code=? WHERE id='mcp-registry'").run(success === null ? null : at - success * MINUTE, sweep === null ? null : at - sweep * MINUTE, stalled ? 3 : 0, stalled ? 'unavailable' : null);
    const { registry } = await launch(flags);
    assert.deepEqual([registry.stalled, registry.sweeping, registry.lastSuccessAt, registry.failureCount, registry.errorCode], [stalled, sweep !== null, success === null ? null : at - success * MINUTE, stalled ? 3 : 0, stalled ? 'unavailable' : null], why);
  }
  assert.equal(NOAH_LAUNCH_STATUS.stalledMs, 2 * HOUR);
});

void test('the watched numbers: on the review screen, as sentences (no wide table)', async (t) => {
  const { w, A, B, C } = await counted(t);
  const ownerScope = await ownerScopeFor('reviewer');
  const ui = screen({ fetch: w.browser({ user: 'reviewer' }, { env: { NOAH_PATROL_ENABLED: 'true' }, reviewers: ['reviewer'] }), modules: {}, now: w.f.time() });
  const review = ui.mount('components/noah-intake-review.tsx', { ownerScope });
  await review.flush();
  const text = review.text();
  for (const row of [
    '切り替え：巡回 開 ／ 一覧 閉 ／ 接続と依頼 閉 ／ 自動の見本 閉',
    'まだ握手していない数（0 になったら、最初の 1 巡が終わっています）：1',
    '握手の結果：通った 2 ／ 相手の許可が要る 1 ／ 断られた 1 ／ 混んでいる 1 ／ 応答しない 1 ／ 握手していない（握手しない物を含む） 4',
    '同じ接続先へ、1 時間に 2 回以上握手した数：1',
    '混んでいる接続先：直近 60 秒の枠を使い切った 1 ／ 待つ時刻まで送らない 1',
    '戻ってきた人（成果が、2 日以上にある人）：2',
    `失敗の多い接続先（直近 7 日。依頼が 5 件以上あり、失敗か結果不明がある接続先だけ）：${A} 失敗 3・結果不明 1／8 ／ ${B} 失敗 1・結果不明 0／6`,
    '（5 分ごとに数え直します）',
  ]) assert.ok(text.includes(row), `${row}\n${text}`);
  assert.match(text, /台帳の巡回：最後の成功 .+ ／ 見た記録 11/);
  assert.doesNotMatch(text, /止まっています/);
  assert.equal(text.includes(C), false);
  // 期間ごとの数: 直近 24 時間と、直近 7 日。1 行ずつの文（スマホの幅で、横にはみ出す表にしない）。状態の並びは、いつも同じ順（数の多い順や、表から返った順にしない）。
  const periods = review.find('h4').map((heading) => review.text(heading));
  assert.deepEqual(periods, ['直近 24 時間', '直近 7 日']);
  const blocks = review.find('div').filter((node) => review.nodes(node).some((child) => child.type === 'h4')).map((node) => review.nodes(node).filter((child) => child.type === 'p').map((child) => review.text(child)));
  assert.deepEqual(blocks, [
    ['接続：つながった 2 ／ 失敗 1 ／ 途中 1', '握手の時間（握手が通った接続の平均）：500 ミリ秒', '依頼：成果 8 ／ 失敗 6 ／ 結果不明 1 ／ 止めた 1 ／ 進んでいる 1 ／ 待っている 1', 'つないだ人：3 ／ 成果が出た人：3', '頼んだ画面の幅：狭い 10 ／ 広い 7 ／ 不明 1'],
    ['接続：つながった 3 ／ 失敗 1 ／ 切った 1 ／ 途中 1', '握手の時間（握手が通った接続の平均）：700 ミリ秒', '依頼：成果 11 ／ 失敗 8 ／ 結果不明 1 ／ 止めた 1 ／ 進んでいる 1 ／ 待っている 1', 'つないだ人：4 ／ 成果が出た人：5', '頼んだ画面の幅：狭い 13 ／ 広い 8 ／ 不明 2'],
  ]);
  // 取り込みの節の表は、前からある 1 つ（動く場所ごとの候補の数。4 列）だけ。
  assert.equal(review.find('table').length, 1);

  // 数えられない時は、その事だけを出す（取り込みの節の、他の行は出る）。
  w.f.advance(NOAH_LAUNCH_STATUS.cacheMs);
  w.f.hooks.fail = (query) => query.includes('noah_asks');
  const broken = screen({ fetch: w.browser({ user: 'reviewer' }, { reviewers: ['reviewer'] }), modules: {}, now: w.f.time() }).mount('components/noah-intake-review.tsx', { ownerScope });
  await broken.flush();
  assert.match(broken.text(), /見張る数は、今は数えられません。/);
  assert.match(broken.text(), /一覧に載せている数：/);
  assert.doesNotMatch(broken.text(), /まだ握手していない数/);
});

// ---------------------------------------------------------------------------
// 戻し方（7 章の表）。
// ---------------------------------------------------------------------------

void test('closing the switches: new connections and asks are refused, an ask in flight finishes, records stay; then the list; then the patrol', async (t) => {
  const definition = lookup();
  const hold = {};
  const server = mcpServer({ tools: [definition], before: async (body) => { const stop = hold[body?.method]; if (stop) { stop.reached(); await stop.opened; } } });
  const second = mcpServer();
  const w = await world(t, { [hostOf(1)]: server, [hostOf(2)]: second });
  const waiting = [], waitUntil = (work) => { waiting.push(work); };
  const env = (flags) => ({ env: flags, reviewers: ['reviewer'], waitUntil });

  // 開いている間に、つないで、頼む。相手は、道具の呼び出しで、返事をしないまま止まる（進んでいる依頼）。
  const open = w.as('owner-a', env(OPEN));
  const planOfSecond = (await open.plan(familyId(2))).body.planSha256;
  assert.deepEqual(brief(await open.connect(familyId(1), uuid(1))), [200, 'connected', null]);
  hold['tools/call'] = gate();
  assert.equal((await open.ask({ id: uuid(10), connectionId: uuid(1), form: await form(definition, { query: 'q' }) })).status, 202);
  await hold['tools/call'].arrived;
  assert.equal(w.asked()[0].state, 'running');
  const sentBefore = [server.log.length, second.log.length];

  // --- 依頼の道を閉じる（NOAH_ASK_FORM=false）。一覧は開いたまま ---
  const askClosed = { NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'false' };
  const a = w.as('owner-a', env(askClosed)), stranger = w.as(null, env(askClosed));
  // 新しい接続・やり直し・新しい依頼・道具の一覧（握手が要る）は 503。行はできず、相手へも送らない。
  assert.deepEqual(brief(await a.connect(familyId(2), uuid(2))), [503, null, NOAH_CONNECT_MESSAGES.closed]);
  assert.deepEqual(brief(await a.connect(familyId(2), uuid(2), planOfSecond)), [503, null, NOAH_CONNECT_MESSAGES.closed]);
  assert.deepEqual(brief(await a.ask({ id: uuid(11), connectionId: uuid(1), form: await form(definition, { query: 'again' }) })), [503, null, NOAH_ASK_MESSAGES.closed]);
  assert.deepEqual(brief(await a.tools(uuid(1))), [503, null, NOAH_CONNECT_MESSAGES.toolsClosed]);
  assert.deepEqual([NOAH_CONNECT_MESSAGES.closed, NOAH_ASK_MESSAGES.closed], ['今は、新しい接続を受け付けていません。', '今は、新しい依頼を受け付けていません。']);
  assert.deepEqual([w.rows().length, w.asked().length, server.log.length, second.log.length], [1, 1, ...sentBefore]);
  // 一覧と詳細と計画は、誰にでも見える。
  const list = createIntakeApi(stranger.deps);
  assert.equal((await list(new Request(`${ORIGIN}/api/noah/intake`))).status, 200);
  assert.equal((await list(new Request(`${ORIGIN}/api/noah/intake?id=${encodeURIComponent(familyId(1))}`))).status, 200);
  assert.equal((await stranger.plan(familyId(1))).status, 200);
  // つないだ記録と、依頼は、読める。
  assert.deepEqual((await a.list()).body.connections.map((row) => [row.id, row.state]), [[uuid(1), 'connected']]);
  assert.deepEqual(brief(await a.get(uuid(1))), [200, 'connected', null]);
  assert.deepEqual(brief(await a.askGet(uuid(10))), [200, 'running', null]);
  // 審査者は、閉じていても使える（一般に開ける前の、本番の受入のため）。
  assert.deepEqual(brief(await w.as('reviewer', env(askClosed)).connect(familyId(2), uuid(3))), [200, 'connected', null]);

  // 進んでいる依頼は、最後まで進む。成果は、Work に入る。
  const stop = hold['tools/call'];
  delete hold['tools/call'];
  stop.open();
  await settle(waiting);
  const [done] = w.asked('id=?', uuid(10));
  assert.deepEqual([done.state, done.tool_calls, calls(server).length], ['succeeded', 1, 1]);
  const job = normalizeWorkJob(w.work(done.work_id));
  assert.deepEqual([job.status, job.noahRemote.state, job.noahRemote.result.text], ['review', 'returned', 'lookup ok']);
  // 成果は、閉じた後も読める。切る事も、できる。
  const finished = await a.askGet(uuid(10));
  assert.deepEqual([finished.status, finished.body.state, finished.body.result.text], [200, 'succeeded', 'lookup ok']);
  assert.deepEqual(brief(await a.act(uuid(1), 'disconnect', (await a.get(uuid(1))).body.revision)), [200, 'disconnected', null]);
  assert.equal(w.asked().length, 1, '切っても、依頼の記録は残る');

  // --- 一覧そのものを引っ込める（NOAH_INTAKE_PUBLIC=false） ---
  const allClosed = {};
  const hidden = createIntakeApi(w.as(null, env(allClosed)).deps), signedIn = createIntakeApi(w.as('owner-a', env(allClosed)).deps);
  for (const api of [hidden, signedIn]) {
    assert.equal((await api(new Request(`${ORIGIN}/api/noah/intake`))).status, 404);
    assert.equal((await api(new Request(`${ORIGIN}/api/noah/intake?id=${encodeURIComponent(familyId(1))}`))).status, 404);
  }
  // 計画も読めない（画面は、ここで止まる）。前に読んだ計画を持っている画面が、接続を送っても、受け付けない。
  assert.equal((await w.as('owner-a', env(allClosed)).plan(familyId(2))).status, 404);
  assert.deepEqual(brief(await w.as('owner-a', env(allClosed)).connect(familyId(2), uuid(4), planOfSecond)), [503, null, NOAH_CONNECT_MESSAGES.closed]);
  // 頼む事だけを開けても、一覧を閉じている間は、使えない。
  assert.deepEqual(brief(await w.as('owner-a', env({ NOAH_ASK_FORM: 'true' })).connect(familyId(2), uuid(4), planOfSecond)), [503, null, NOAH_CONNECT_MESSAGES.closed]);
  assert.equal(w.rows('owner_id=?', 'owner-a').length, 1);
  // 審査者には、見える。本人の記録（接続・依頼）は、閉じていても、本人が読める。
  assert.equal((await createIntakeApi(w.as('reviewer', env(allClosed)).deps)(new Request(`${ORIGIN}/api/noah/intake`))).status, 200);
  assert.deepEqual(brief(await w.as('owner-a', env(allClosed)).askGet(uuid(10))).slice(0, 1), [200]);

  // --- 外への定期の通信を止める（NOAH_PATROL_ENABLED=false） ---
  w.f.advance(8 * DAY);
  w.clear();
  const queries = w.f.queries.length;
  const off = await wake(w.f, createIntakeTick(tickDeps(w.f, {})));
  assert.deepEqual([off.status, await off.json()], [200, { disabled: true }]);
  // 台帳へも、相手へも、送らない。表も、触らない。一覧は、今ある物をそのまま出す（握手の記録は残る）。
  assert.deepEqual([w.net.hosts, w.f.queries.length], [[], queries]);
  assert.deepEqual((await w.listed()), [familyId(1), familyId(2)]);
  // 開け直すと、続きから進む（期限の来た握手を、行う）。
  const on = await wake(w.f, createIntakeTick(tickDeps(w.f, { NOAH_PATROL_ENABLED: 'true' })));
  assert.equal(on.status, 200);
  assert.equal((await on.json()).probe.probes, 2);
  assert.deepEqual([...new Set(w.net.hosts)].sort((x, y) => x.localeCompare(y)), [hostOf(1), hostOf(2), REGISTRY].sort((x, y) => x.localeCompare(y)));
});

void test('stopping one provider only: a wait-until time on its row stops the patrol and every user handshake to it, and nothing else', async (t) => {
  // 7 章の表の 2 行目。運営が、1 つの接続先だけを止める時は、その接続先の行の not_before を、先の時刻にする（D1 を直に書くので、本人の許可の後）。
  const definition = lookup();
  const servers = { [hostOf(1)]: mcpServer({ tools: [definition] }), [hostOf(2)]: mcpServer() };
  const w = await world(t, servers);
  const a = w.as('owner-a');
  assert.deepEqual(brief(await a.connect(familyId(1), uuid(1))), [200, 'connected', null]);
  w.f.advance(8 * DAY);
  w.clear();
  const until = w.f.time() + HOUR;
  w.f.sql.prepare('UPDATE noah_probe_hosts SET not_before=? WHERE host=?').run(until, hostOf(1));

  // 利用者の操作から始める握手（新しい接続・道具の一覧・依頼）は、相手へ送らずに断る。
  assert.deepEqual(brief(await w.as('owner-b').connect(familyId(1), uuid(2))), [200, 'failed', NOAH_HOST_BUSY]);
  assert.deepEqual(brief(await a.tools(uuid(1))), [429, null, NOAH_HOST_BUSY]);
  assert.deepEqual(brief(await a.ask({ id: uuid(10), connectionId: uuid(1), form: await form(definition, { query: 'q' }) })), [429, null, NOAH_HOST_BUSY]);
  // 巡回も、期限が来ていても、その接続先へは握手しない。別の接続先へは、握手する。
  const answer = await (await wake(w.f, createIntakeTick(tickDeps(w.f, { NOAH_PATROL_ENABLED: 'true' })))).json();
  assert.deepEqual([answer.probe.probes, answer.probe.ok], [1, 1]);
  assert.deepEqual([servers[hostOf(1)].log.length, handshakes(servers[hostOf(2)])], [0, 1]);
  // 別の接続先への接続は、通る。運営の画面の数には、待っている接続先として 1 件出る。
  assert.deepEqual(brief(await w.as('owner-b').connect(familyId(2), uuid(3))), [200, 'connected', null]);
  assert.deepEqual((await createNoahLaunchStatus(w.f.deps)(parseNoahFlags({}))).hosts, { full: 0, waiting: 1 });
  // 一覧からは、消えない（止めるのは、送る事だけ。載せるかどうかは、取り下げの操作）。
  assert.deepEqual(await w.listed(), [familyId(1), familyId(2)]);

  // その時刻を過ぎると、また通る。
  w.f.advance(HOUR + 1);
  const listed = await a.tools(uuid(1));
  assert.deepEqual([listed.status, listed.body.tools.map((item) => item.name)], [200, ['lookup']]);
  assert.equal(handshakes(servers[hostOf(1)]), 1);
});

// ---------------------------------------------------------------------------
// 記録（4 章の、合図 1 回の 1 行）。
// ---------------------------------------------------------------------------

void test("the wake's log line: counts and a reason code only — no provider, no URL, no person", async (t) => {
  const definition = lookup();
  const servers = { [hostOf(1)]: mcpServer({ tools: [definition] }), [hostOf(2)]: mcpServer({ status: 401 }), [hostOf(3)]: async () => { throw new TypeError('fetch failed'); } };
  const w = await world(t, servers, { patrol: false });
  const lines = [];
  t.mock.method(console, 'info', (line) => lines.push(line));
  const tick = createIntakeTick(tickDeps(w.f, { NOAH_PATROL_ENABLED: 'true' }));
  const KEYS = ['event', 'pages', 'seen', 'changed', 'skipped', 'probes', 'ok', 'authRequired', 'unreachable', 'rateLimited', 'skippedHost', 'toolsChanged', 'swept', 'error', 'ms'];
  const clean = (line) => {
    const parsed = JSON.parse(line);
    assert.deepEqual(Object.keys(parsed), KEYS);
    // 文字は、記録の名前と、理由の符号だけ。残りは、数。
    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'event') assert.equal(value, 'noah-patrol');
      else if (key === 'error') assert.ok(value === null || ['unavailable', 'rate_limited', 'invalid_response'].includes(value), String(value));
      else assert.equal(Number.isInteger(value) && value >= 0, true, key);
    }
    for (const secret of ['example.com', 'http', 'test.provider', 'Agent', 'owner-', 'person', 'lookup', '00000000-', 'mcp-registry']) assert.equal(line.includes(secret), false, `${secret}: ${line}`);
    return parsed;
  };

  // 握手（通る・認証を求める・応答しない）を行った合図。
  const first = await wake(w.f, tick);
  assert.equal(first.status, 200);
  assert.equal(lines.length, 1);
  const probed = clean(lines[0]);
  assert.deepEqual([probed.probes, probed.ok, probed.authRequired, probed.unreachable, probed.swept, probed.error], [3, 1, 1, 1, 0, null]);

  // つないだ人と、途中で止まった依頼がある時の合図（後始末が、1 件を片付ける）。
  const waiting = [], a = w.as('owner-a', { waitUntil: (work) => { waiting.push(work); } });
  assert.equal((await a.connect(familyId(1), uuid(1))).body.state, 'connected');
  await settle(waiting);
  const [row] = w.rows();
  w.f.sql.prepare("INSERT INTO noah_asks(id,owner_id,connection_id,work_id,request_sha256,mode,host,tool,tool_sha256,state,lease_until,revision,created_at,updated_at) VALUES(?,?,?,?,?,'form',?,?,?,'running',?,1,?,?)")
    .run(uuid(50), 'owner-a', row.id, uuid(51), 'a'.repeat(64), hostOf(1), 'lookup', 'b'.repeat(64), w.f.time() + 30_000, w.f.time(), w.f.time());
  w.f.advance(2 * HOUR);
  const second = await wake(w.f, tick);
  assert.equal(second.status, 200);
  const swept = clean(lines[1]);
  assert.equal(swept.swept, 1);
  // 応答も、数だけ（誰の物か・どの接続先かは、無い）。
  const answer = JSON.stringify(await second.json());
  for (const secret of ['example.com', 'owner-', '00000000-', 'lookup']) assert.equal(answer.includes(secret), false, secret);

  // 台帳を読めなかった合図（500）の 1 行。
  w.net.routes[REGISTRY] = async () => new Response('', { status: 503 });
  w.f.advance(2 * HOUR);
  const failed = await wake(w.f, tick);
  assert.equal(failed.status, 500);
  assert.equal(clean(lines[2]).error, 'unavailable');
  assert.equal(lines.length, 3, '合図 1 回に、1 行');
});

// ---------------------------------------------------------------------------
// 本番へ適用する物（8 章）。適用は、本人の許可の後。ここは、形だけを確かめる。
// ---------------------------------------------------------------------------

void test('what is applied to production: four migrations that only create tables and indexes; the patrol must not be opened before all four', async (t) => {
  const MIGRATIONS = ['0044_noah_intake', '0047_noah_connections', '0048_noah_asks', '0049_noah_connections_connecting'];
  const created = [];
  for (const name of MIGRATIONS) {
    const text = readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8');
    assert.equal(text, readFileSync(new URL(`../drizzle-main/${name}.sql`, import.meta.url), 'utf8'), `${name}: 2 つの置き場で同じ`);
    const statements = text.split('--> statement-breakpoint').map((part) => part.replace(/^\s*--[^\n]*$/gm, '').trim()).filter(Boolean);
    assert.ok(statements.length > 0);
    for (const statement of statements) {
      // 新しい表か、索引を作るだけ。今ある表の列を変えない。今ある行を書かない。
      const match = /^CREATE (?:TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS (noah_[a-z_]+)[ (]/.exec(statement);
      assert.ok(match, `${name}: ${statement.slice(0, 80)}`);
      if (statement.startsWith('CREATE TABLE')) created.push(match[1]);
      else assert.match(statement, /^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS noah_[a-z_]+ ON noah_[a-z_]+\(/);
      assert.equal(statement.split(';').filter((part) => part.trim()).length, 1, '1 つの文');
    }
  }
  // ローンチで作る表は、この 7 つ。鍵・相手の許可・定期の仕事・利用の記録の表は、ローンチでは作らない。
  assert.deepEqual(created, ['noah_intake_sources', 'noah_intake_candidates', 'noah_intake_checks', 'noah_intake_families', 'noah_probe_hosts', 'noah_connections', 'noah_asks']);

  // 取り込みの表だけを適用して、巡回を開けると、合図は失敗する（握手は、つないでいる人が居るかを接続の表で見る。後始末は、依頼と接続の表を読む）。
  // だから、巡回を開ける前に、4 本とも適用する。合図は、成功に見せない（専用の Worker の実行が、失敗として残る）。
  const f = fixture(t, async (url) => (new URL(String(url)).hostname === REGISTRY ? page([entry(1)]) : new Response('', { status: 500 })));
  f.sql.exec('DROP TABLE noah_asks; DROP TABLE noah_connections;');
  const lines = [];
  t.mock.method(console, 'info', (line) => lines.push(JSON.parse(line)));
  const missing = await wake(f, createIntakeTick(tickDeps(f, { NOAH_PATROL_ENABLED: 'true' })));
  assert.equal(missing.status, 503);
  assert.equal(lines[0].error, 'unavailable');
  // 閉じている間は、表が無くても、合図は何もせずに 200（段 0）。
  const closed = await wake(f, createIntakeTick(tickDeps(f, {})));
  assert.deepEqual([closed.status, await closed.json()], [200, { disabled: true }]);
});
