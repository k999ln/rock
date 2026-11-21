// 頼む画面（道具を選ぶ・入力欄・確かめ・仕事の一覧と成果）。詳細の画面（/noah/ready/agent）の、つないだ後。
// 画面の部品を、ブラウザなしで動かす（tests/fixtures/noah/screen.mjs）。画面が送る要求は、本物の入口（接続・道具の一覧・依頼）と、試験用の表・合成の接続先へ通す。
// 見た目（CSS・幅 390 で、はみ出さない事）は、ここでは確かめない（実ブラウザで確かめる）。
// 仕様: docs/noah/spec-87-tool-agent.md の 11.5・11.6。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as askView from '../lib/noah-ask-view.ts';
import * as botNotice from '../lib/noah-bot-notice.ts';
import * as formLib from '../lib/noah-form.ts';
import * as view from '../lib/noah-ready-view.ts';
import * as resultData from '../lib/noah-result-data-contract.ts';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid } from './fixtures/noah/connect-world.mjs';
import * as profileContract from '../lib/noah-profile-contract.ts';
import { screen } from './fixtures/noah/screen.mjs';

const MODULES = { '@/lib/noah-profile-contract':profileContract, '@/lib/owner-intent': ownerIntent, '@/lib/noah-ready-view': view, '@/lib/noah-ask-view': askView, '@/lib/noah-bot-notice': botNotice, '@/lib/noah-form': formLib };
const DETAIL = 'components/noah-ready-detail.tsx';
const LIST = 'components/noah-work-list.tsx';
const lookup = tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: {
  query: { type: 'string', title: 'Player', description: 'A player id or name.', maxLength: 200 }, limit: { type: 'integer', default: 5 },
  order: { type: 'string', enum: ['new', 'old'] }, exact: { type: 'boolean' }, extra: { type: 'object' },
} } });
const publish = tool('publish', null, { description: 'Publishes a note.', inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } });
const stats = tool('stats');
const nested = tool('configure', true, { inputSchema: { type: 'object', required: ['o'], properties: { o: { type: 'object' } } } });
const calls = (server) => server.log.filter((request) => request.rpc === 'tools/call');
const asksSent = (ui) => ui.calls.filter((call) => call.method === 'POST' && call.url === '/api/noah/ask');

/** owner-a が Agent 1 へつないだ後の、詳細の画面。 */
async function opened(t, server, options = {}) {
  const w = await world(t, { [hostOf(1)]: server });
  const waiting = [];
  const config = options.background ? { waitUntil: (work) => { waiting.push(work); } } : {};
  await w.as('owner-a').connect(familyId(1), uuid(1));
  w.clear();
  const session = { user: 'owner-a' };
  const browser = w.browser(session, config);
  let profile={...profileContract.emptyNoahProfile(),available:true,ownerScope:await ownerIntent.ownerScopeFor('owner-a')};
  const fetch=async request=>{if(request.url==='/api/noah/profile'){if(request.method==='POST'){const body=request.body;profile={...profile,revision:profile.revision+1,...(body.action==='grant'?{grants:[body.grant]}:{})};}return {body:profile};}return browser(request);};
  const ui = screen({ document:{hidden:false,addEventListener(){},removeEventListener(){}}, fetch: options.fetch ? options.fetch(fetch) : fetch, modules: MODULES, now: w.f.time() });
  const page = ui.mount(DETAIL, { id: familyId(1) });
  await page.flush();
  const toolButton = (name) => page.find('button').find((node) => node.props.className === 'toolButton' && page.text(page.nodes(node).find((child) => child.type === 'strong')) === name);
  const field = (label) => {
    const holder = page.nodes().find((node) => node.props.className === 'field' && page.text(page.nodes(node).find((child) => child.type === 'label' || child.type === 'legend')).startsWith(label));
    return holder ? page.nodes(holder).find((child) => ['textarea', 'input', 'select'].includes(child.type)) ?? holder : null;
  };
  const form = () => page.find('form')[0];
  const rows = () => page.find('ul').filter((node) => node.props.className === 'work').flatMap((node) => page.nodes(node).filter((child) => child.type === 'li').map((child) => page.text(child)));
  return { w, ui, page, waiting, toolButton, field, form, rows };
}

void test('choosing a tool: usable ones can be pressed; the form shows required fields first, the rest folded, and where the input goes', async (t) => {
  const server = mcpServer({ tools: [lookup, nested, stats, publish] });
  const { page, toolButton, field, form } = await opened(t, server);
  // 使える道具は、押せる行。使えない道具は、押せない（印は文字）。
  assert.deepEqual(page.find('button').filter((node) => node.props.className === 'toolButton').map((node) => page.text(node)), ['lookup読み取りだけLooks up a player.', 'stats読み取りだけ押すだけstats の説明', 'publish送る前に確かめますPublishes a note.']);
  assert.match(page.text(), /configure入力欄ではまだ使えません/);
  assert.equal(page.find('form').length, 0);
  await page.press(toolButton('lookup'));
  assert.equal(toolButton('lookup').props['aria-pressed'], true);
  // 必須の欄を先に。任意の欄は「細かい設定（n）」の中。入力欄にできない設定は、数だけ。
  const text = page.text(form());
  assert.ok(text.startsWith('lookupPlayer *A player id or name.細かい設定（3）limit'), text);
  assert.match(text, /ほかに 1 個の設定があります（入力欄では使えません）。/);
  // 既定の値は、欄に入れて見せる。整数の欄は、数の鍵盤。選択肢は、押して選ぶ。
  assert.deepEqual([field('limit').props.value, field('limit').props.inputMode, field('Player').props.maxLength], ['5', 'numeric', 200]);
  assert.deepEqual(page.nodes(field('order')).filter((node) => node.type === 'button').map((node) => [page.text(node), node.props['aria-pressed']]), [['new', false], ['old', false]]);
  assert.deepEqual(page.nodes(field('exact')).filter((node) => node.type === 'button').map((node) => page.text(node)), ['はい', 'いいえ', '指定しない']);
  // 「頼む」の上に、送り先。主ボタンは 1 つ。
  assert.ok(text.indexOf(`入力は ${hostOf(1)} へ送られます。`) < text.lastIndexOf('頼む'));
  assert.deepEqual(page.nodes(form()).filter((node) => node.type === 'button' && node.props.className === 'primary').map((node) => [page.text(node), node.props.type]), [['頼む', 'submit']]);
  // もう一度押すと、閉じる。別の道具を選ぶと、その入力欄に替わる。
  await page.press(toolButton('lookup'));
  assert.equal(page.find('form').length, 0);
  await page.press(toolButton('stats'));
  assert.ok(page.text(form()).startsWith('stats'));
  assert.ok(page.text(form()).endsWith(`入力は ${hostOf(1)} へ送られます。頼む`));
  assert.equal(calls(server).length, 0);
});

void test('one usable tool: the form is shown without a list; many tools: a filter appears', async (t) => {
  const single = await opened(t, mcpServer({ tools: [lookup, nested] }));
  assert.equal(single.page.find('button').filter((node) => node.props.className === 'toolButton').length, 0);
  assert.ok(single.page.text(single.form()).startsWith('Player *'));
  assert.deepEqual(single.page.find('h2').map((node) => single.page.text(node)).slice(0, 1), ['lookup']);
  const many = await opened(t, mcpServer({ tools: [lookup, ...Array.from({ length: 13 }, (_, n) => tool(`tool_${n}`))] }));
  const filter = many.page.find('input').find((node) => node.props.type === 'search');
  assert.equal(filter.props.placeholder, '語で絞る（名前・説明）');
  await many.page.change(filter, 'PLAYER');
  assert.deepEqual(many.page.find('button').filter((node) => node.props.className === 'toolButton').map((node) => many.page.text(many.page.nodes(node).find((child) => child.type === 'strong'))), ['lookup']);
  await many.page.change(many.page.find('input').find((node) => node.props.type === 'search'), 'zzzz');
  assert.match(many.page.text(), /合う道具が、ありません。/);
  // 12 個までは、絞る欄を出さない。
  const few = await opened(t, mcpServer({ tools: [lookup, stats] }));
  assert.equal(few.page.find('input').filter((node) => node.props.type === 'search').length, 0);
});

void test('asking: checked before sending; the request carries the tool the person saw; the result appears below; the values stay', async (t) => {
  const server = mcpServer({ tools: [lookup, stats], call: (params) => ({ content: [{ type: 'text', text: `1. ${params.arguments.query}\n2. second\n3. third\n4. fourth https://example.org/players/7.` }] }) });
  const { w, ui, page, toolButton, field, form, rows } = await opened(t, server);
  await page.press(toolButton('lookup'));
  // 必須の欄が空のまま「頼む」: 送らない。誤りは、その欄の下。
  await page.submit(form());
  assert.match(page.text(form()), /Player を入れてください。/);
  assert.equal(field('Player').props['aria-invalid'], true);
  assert.equal(asksSent(ui).length, 0);
  // 細かい設定の中の誤りは、開いて見せる。
  await page.change(field('Player'), 'cobalt');
  await page.change(field('limit'), 'many');
  await page.submit(form());
  assert.match(page.text(form()), /limit は整数で入れてください。/);
  assert.equal(page.nodes(form()).find((node) => node.type === 'details').props.open, true);
  assert.equal(asksSent(ui).length, 0);
  // 直して頼む。
  await page.change(field('limit'), '3');
  await page.press(page.nodes(field('order')).find((node) => node.type === 'button' && page.text(node) === 'old'));
  await page.submit(form());
  const [sent] = asksSent(ui);
  assert.deepEqual(Object.keys(sent.body).sort((a, b) => a.localeCompare(b)), ['connectionId', 'form', 'id', 'screen']);
  assert.deepEqual([sent.body.connectionId, sent.body.screen, sent.body.form.tool, sent.body.form.input, 'confirm' in sent.body.form], [uuid(1), 'narrow', 'lookup', { query: 'cobalt', limit: '3', order: 'old' }, false]);
  assert.match(sent.body.form.toolSha256, /^[a-f0-9]{64}$/);
  assert.match(sent.headers['X-Rock-Owner-Scope'], /^owner-v1:[a-f0-9]{64}$/);
  // 相手が受けたのは、道具の名前と、型の付いた入力だけ。
  assert.deepEqual(calls(server)[0].body.params, { name: 'lookup', arguments: { query: 'cobalt', limit: 3, order: 'old' } });
  // 下の「仕事」に、成果の先頭 3 行が出る。「開く」で全文。https:// で始まる所だけが、行き先の host つきのリンク。
  assert.match(page.text(), /受け付けました。/);
  assert.equal(page.find('a','進捗と成果を見る')[0].props.href,'#noah-agent-work');
  assert.ok(page.nodes().some(node=>node.props.id==='noah-agent-work' && node.props.tabIndex===-1));
  assert.deepEqual(rows(), [`結果を受け取りましたlookup — ${hostOf(1)} の lookup が返した内容です。費用 0。1. cobalt\n2. second\n3. third開く`]);
  await page.click('開く');
  assert.match(rows()[0], /4\. fourth https:\/\/example\.org\/players\/7（example\.org）\.閉じる$/);
  assert.deepEqual(page.find('a').filter((node) => node.props.target === '_blank' && new URL(node.props.href).hostname === 'example.org').map((node) => [node.props.href, node.props.rel]), [['https://example.org/players/7', 'noopener noreferrer nofollow']]);
  // 欄の値は残る。もう一度頼むと、新しい操作 ID。
  assert.deepEqual([field('Player').props.value, field('limit').props.value], ['cobalt', '3']);
  w.f.advance(1000);
  await page.submit(form());
  assert.equal(asksSent(ui).length, 2);
  assert.notEqual(asksSent(ui)[1].body.id, sent.body.id);
  assert.equal(rows().length, 2);
  assert.deepEqual(w.asked().map((row) => [row.state, row.screen]), [['succeeded', 'narrow'], ['succeeded', 'narrow']]);
});

void test('a tool that may change something is not sent on the first press: the inputs are shown, then confirmed', async (t) => {
  const server = mcpServer({ tools: [publish, stats] });
  const { w, ui, page, toolButton, field, form } = await opened(t, server);
  await page.press(toolButton('publish'));
  await page.change(field('text'), 'hello world');
  await page.submit(form());
  // 送らずに、確かめを出す。
  assert.equal(asksSent(ui).length, 0);
  const box = page.find('fieldset').find((node) => node.props.className === 'confirmBox');
  assert.match(page.text(box), /publish を使います。この道具は「読み取りだけ」と宣言されていません。相手のサーバーで、何かを変えたり送ったりするかもしれません。texthello world入力は agent-1\.example\.com へ送られます。やめる確かめて頼む$/);
  // 「やめる」は、送らずに閉じる。値を変えた時も、確かめ直す。
  await page.click('やめる');
  assert.equal(page.find('fieldset').filter((node) => node.props.className === 'confirmBox').length, 0);
  await page.submit(form());
  await page.change(field('text'), 'hello again');
  assert.equal(page.find('fieldset').filter((node) => node.props.className === 'confirmBox').length, 0);
  await page.submit(form());
  await page.click('確かめて頼む');
  assert.deepEqual(asksSent(ui).map((call) => [call.body.form.input, call.body.form.confirm]), [[{ text: 'hello again' }, true]]);
  assert.deepEqual([w.asked()[0].state, calls(server).length, JSON.parse(w.rows()[0].confirmed_tools_json).map((item) => item.name)], ['succeeded', 1, ['publish']]);
  // 同じ道具を続けて頼む時は、確かめ直さない。
  w.f.advance(1000);
  await page.submit(form());
  assert.deepEqual([asksSent(ui).length, w.asked().map((row) => row.state), calls(server).length], [2, ['succeeded', 'succeeded'], 2]);
});

void test('the work list: progress is read while something is unfinished; stopping is asked for, not announced; failures say why', async (t) => {
  let release = null, fail = false;
  const server = mcpServer({
    tools: [lookup, stats],
    before: async (body) => { if (body?.method === 'tools/call' && body.params.name === 'lookup') await new Promise((resolve) => { release = resolve; }); },
    call: (params) => (params.name === 'stats' && fail ? { isError: true, content: [{ type: 'text', text: 'No data yet.' }] } : { structuredContent: { players: [{ id: 7, name: 'Cobalt', url: 'https://example.org/p/7' }] }, content: [] }),
  });
  const { w, ui, page, waiting, toolButton, field, form, rows } = await opened(t, server, { background: true });
  await page.press(toolButton('lookup'));
  await page.change(field('Player'), 'cobalt');
  await page.submit(form());
  // 受け付けた直後。相手のサーバーは、まだ返していない。
  assert.match(rows()[0], /^進んでいます（0 秒）止めるlookup$/);
  const reads = () => ui.calls.filter((call) => call.method === 'GET' && call.url.startsWith('/api/noah/ask?')).length;
  const before = reads();
  w.f.advance(3000);
  await page.tick(3000);
  assert.ok(reads() >= before + 3, '終わっていない間は、1 秒ごとに読む');
  assert.match(rows()[0], /^進んでいます（3 秒）/);
  // 「止める」: 止める事を頼む。まだ「止めました」とは出さない。
  await page.click('止める');
  assert.match(rows()[0], /^止めています…（相手のサーバーで始まっていれば、止められません）lookup$/);
  assert.equal(page.find('button', '止める').length, 0);
  // 相手が返した後: 止めた依頼の成果は、採らない。
  release();
  await Promise.all(waiting);
  await page.tick(1000);
  assert.deepEqual([rows(), w.asked()[0].state], [['止めました。相手のサーバーで実行されたかは分かりません。lookup'], 'stopped']);
  // 終わった後は、読み続けない。
  const settled = reads();
  await page.tick(10_000);
  assert.equal(reads(), settled);

  // 全体が JSON の成果は、項目ごとの行。「元の形で見る」で、文のまま。
  w.f.advance(1000);
  await page.press(toolButton('stats'));
  await page.submit(form());
  await Promise.all(waiting);
  await page.tick(1000);
  assert.match(rows()[0], /^結果を受け取りましたstats — /);
  await page.click('開く');
  const outline = page.find('dl').find((node) => node.props.className === 'outline');
  assert.deepEqual(page.nodes(outline).filter((node) => node.type === 'div').map((node) => [node.props['data-depth'], page.text(node)]), [[0, 'players'], [1, '1'], [2, 'id7'], [2, 'nameCobalt'], [2, 'urlhttps://example.org/p/7（example.org）']]);
  await page.click('元の形で見る');
  assert.match(rows()[0], /"name": "Cobalt"/);
  // 道具が「できなかった」と返した時は、理由を出す。
  fail = true;
  w.f.advance(1000);
  await page.submit(form());
  await Promise.all(waiting);
  await page.tick(1000);
  assert.match(rows()[0], /^できませんでした。No data yet\.stats$/);
});

void test('a request that did not get through is sent again with the same ID; refusals are shown where the button is', async (t) => {
  let drop = 1;
  const server = mcpServer({ tools: [stats, lookup] });
  const { w, ui, page, toolButton, form } = await opened(t, server, {
    fetch: (inner) => async (request) => { if (request.method === 'POST' && request.url === '/api/noah/ask' && drop-- > 0) { await inner(request); throw new TypeError('network'); } return inner(request); },
  });
  await page.press(toolButton('stats'));
  await page.submit(form());
  // 応答が届かなかった（依頼は、受け付けられていた）。
  assert.match(page.text(form()), /通信できませんでした。もう一度試してください。/);
  await page.submit(form());
  const sent = asksSent(ui);
  assert.deepEqual([sent.length, sent[0].body.id === sent[1].body.id, w.asked().length, calls(server).length], [2, true, 1, 1]);
  assert.match(page.text(form()), /受け付けました。/);
  // 断られた時（切り替えが閉じた・上限など）は、その文を出す。
  const closed = await opened(t, mcpServer({ tools: [stats, lookup] }));
  await closed.page.press(closed.toolButton('stats'));
  closed.w.f.sql.prepare("UPDATE noah_connections SET state='disconnected',disconnected_at=?,revision=revision+1").run(closed.w.f.time());
  await closed.page.submit(closed.form());
  assert.match(closed.page.text(closed.form()), /接続を確かめてください。/);
  assert.equal(closed.w.asked().length, 0);
});

void test('the work list across agents (the activity and data screens): newest first, each row leads back to its agent; only results on the data screen; the stop carries the list\'s owner mark; nothing for visitors', async (t) => {
  // owner-a: Agent 1 へ 2 件（成果が出た・できなかった）、Agent 2 へ 1 件（相手が、まだ返していない）。owner-b: Agent 1 へ 1 件。
  let release = null;
  const one = mcpServer({ tools: [lookup, stats], call: (params) => (params.name === 'stats' ? { isError: true, content: [{ type: 'text', text: 'No data yet.' }] } : { content: [{ type: 'text', text: `found ${params.arguments.query}` }] }) });
  const two = mcpServer({ tools: [lookup], before: async (body) => { if (body?.method === 'tools/call') await new Promise((resolve) => { release = resolve; }); } });
  const w = await world(t, { [hostOf(1)]: one, [hostOf(2)]: two });
  const waiting = [], background = { waitUntil: (work) => { waiting.push(work); } };
  const sha = (definition) => formLib.noahToolSha256({ name: definition.name, description: definition.description ?? '', inputSchema: definition.inputSchema, readOnly: definition.annotations?.readOnlyHint === true });
  const ask = async (who, n, connectionId, definition, input) => {
    w.f.advance(1_000);
    assert.equal((await who.ask({ id: uuid(n), connectionId, form: { tool: definition.name, toolSha256: await sha(definition), input } })).status, 202);
  };
  const a = w.as('owner-a', background), b = w.as('owner-b', background), d = w.as('owner-d', background);
  assert.equal((await a.connect(familyId(1), uuid(1))).body.state, 'connected');
  assert.equal((await a.connect(familyId(2), uuid(2))).body.state, 'connected');
  assert.equal((await b.connect(familyId(1), uuid(3))).body.state, 'connected');
  await ask(a, 10, uuid(1), lookup, { query: 'cobalt' });
  await ask(a, 11, uuid(1), stats, {});
  await ask(b, 13, uuid(3), lookup, { query: 'someone else' });
  // owner-d: できなかった依頼だけ。
  assert.equal((await d.connect(familyId(1), uuid(4))).body.state, 'connected');
  await ask(d, 14, uuid(4), stats, {});
  await Promise.all(waiting.splice(0));
  await ask(a, 12, uuid(2), lookup, { query: 'slow' });
  const slow = waiting.splice(0);

  const open = (user, props) => {
    const ui = screen({ fetch: w.browser({ user }, background), modules: MODULES, now: w.f.time() });
    return { ui, page: ui.mount(LIST, props) };
  };
  const rowsOf = (page) => page.find('ul').filter((node) => node.props.className === 'work').flatMap((node) => page.nodes(node).filter((child) => child.type === 'li'));
  const back = (page) => page.find('a', 'この Agent を開く').map((node) => node.props.href);
  const detail = (i) => `/noah/ready/agent?id=${encodeURIComponent(familyId(i))}`;

  // 「実行中」: 本人の依頼を、新しい順に、全部。行ごとに、その Agent の詳細への道。別の人の依頼は、出ない。
  const { ui, page } = open('owner-a', { ownerScope: null, refresh: 0, heading: '接続したAgentの仕事' });
  await page.flush();
  assert.equal(page.text(page.find('h2')[0]), '接続したAgentの仕事進んでいます');
  const rows = rowsOf(page).map((row) => page.text(row));
  assert.equal(rows.length, 3);
  assert.match(rows[0], /^進んでいます（\d+ 秒）止めるlookupこの Agent を開く →$/);
  assert.match(rows[1], /^できませんでした。No data yet\.statsこの Agent を開く →$/);
  assert.match(rows[2], /^結果を受け取りましたlookup — /);
  assert.ok(rows[2].includes('found cobalt'));
  assert.deepEqual(back(page), [detail(2), detail(1), detail(1)]);
  assert.equal(rows.some((row) => row.includes('someone else')), false);
  // 「止める」は、一覧の応答が返した本人の印を添えて送る（受け付けられて、止めている所になる）。
  await page.click('止める');
  const stop = ui.calls.filter((call) => call.method === 'POST' && call.url === `/api/noah/ask/${uuid(12)}`);
  assert.equal(stop.length, 1);
  assert.equal(stop[0].headers[ownerIntent.OWNER_SCOPE_HEADER], await ownerIntent.ownerScopeFor('owner-a'));
  assert.match(page.text(rowsOf(page)[0]), /^止めています…/);
  assert.equal(w.asked('id=?', uuid(12))[0].stop_requested, 1);
  release();
  await Promise.all(slow);
  await page.tick(1000);
  assert.match(page.text(rowsOf(page)[0]), /^止めました。相手のサーバーで実行されたかは分かりません。lookup/);

  // 「成果データ」: 成果が出た依頼だけ。
  const data = open('owner-a', { ownerScope: null, refresh: 0, only: 'succeeded', heading: '接続したAgentの成果' }).page;
  await data.flush();
  assert.equal(data.text(data.find('h2')[0]), '接続したAgentの成果');
  assert.deepEqual(rowsOf(data).map((row) => data.text(row).startsWith('結果を受け取りましたlookup — ')), [true]);
  assert.deepEqual(back(data), [detail(1)]);

  // 成果が出た依頼が無い人の「成果データ」には、何も出さない（できなかった依頼は、「実行中」の側にだけ出る）。
  const failedOnly = open('owner-d', { ownerScope: null, refresh: 0, only: 'succeeded', heading: '接続したAgentの成果' }).page;
  await failedOnly.flush();
  assert.equal(failedOnly.text(), '');
  const failedRows = open('owner-d', { ownerScope: null, refresh: 0, heading: '接続したAgentの仕事' }).page;
  await failedRows.flush();
  assert.deepEqual(rowsOf(failedRows).map((row) => failedRows.text(row)), ['できませんでした。No data yet.statsこの Agent を開く →']);
  // 未サインインの人・依頼が無い人には、何も出さない（見出しも出さない）。
  for (const user of [null, 'owner-c']) {
    const nobody = open(user, { ownerScope: null, refresh: 0, heading: '接続したAgentの仕事' });
    await nobody.page.flush();
    assert.deepEqual([nobody.page.text(), nobody.ui.calls.map((call) => call.url)], ['', ['/api/noah/ask']], String(user));
  }
  // Agent の詳細の画面（その Agent への依頼だけ）では、詳細へ戻る道は出さない（もう、そこに居る）。
  const own = open('owner-a', { agentId: familyId(1), ownerScope: await ownerIntent.ownerScopeFor('owner-a'), refresh: 0 }).page;
  await own.flush();
  assert.deepEqual([rowsOf(own).length, back(own)], [2, []]);
});

void test('standalone data shows remote work directly and legacy Mac wrappers preserve their inserted work list', async () => {
  // 頁（app/noah/activity・app/noah/data）が渡す物。部品は、こちらの一覧を読み込まない（受け取った物を置くだけ）。
  const marker = (name) => ({ type: 'aside', props: { id: name, children: name }, key: null });
  const document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const pageOf = async (file, modules) => {
    const ui = screen({ fetch: async () => ({ status: 401, body: { error: 'サインインしてください。' } }), modules });
    const page = ui.mount(file);
    await page.flush();
    return page;
  };
  const stubs = {
    '@/components/noah-launch': { default: function NoahLaunch(props) { return { type: 'main', props: { 'data-screen': 'activity', children: props.phoneWork }, key: null }; } },
    '@/components/noah-result-data': { default: function NoahResultData(props) { return { type: 'main', props: { 'data-screen': 'data', children: props.phoneResults }, key: null }; } },
    '@/components/noah-work-list': { default: function NoahWorkList(props) { return { type: 'section', props: { 'data-list': JSON.stringify(props), children: [] }, key: null }; } },
  };
  const given = (page) => page.nodes().filter((node) => node.type === 'section').map((node) => JSON.parse(node.props['data-list']));
  assert.deepEqual(given(await pageOf('app/noah/data/page.tsx', stubs)), [{ ownerScope: null, refresh: 0, only: 'succeeded', heading: '受け取った成果', showEmpty: true }]);

  // 部品の側: 受け取った物を、main の中、自分の一覧の上に置く。
  const placed = async (file, prop, modules) => {
    const ui = screen({ fetch: async () => ({ status: 401, body: { error: 'サインインしてください。' } }), modules, document });
    const page = ui.mount(file, { [prop]: marker('phone') });
    await page.flush();
    const main = page.find('main');
    assert.equal(main.length, 1, file);
    const inside = page.nodes(main[0]);
    return { page, inside, at: inside.findIndex((node) => node.props.id === 'phone') };
  };
  const query = new URLSearchParams(''), navigation = { 'next/navigation': { useSearchParams: () => query } };
  const activity = await placed('components/noah-launch.tsx', 'phoneWork', navigation);
  const work = activity.inside.findIndex((node) => node.type === 'section' && node.props.id === 'work');
  assert.ok(activity.at >= 0 && work > activity.at, '「実行中」: Mac の「仕事と成果」の上');
  const data = await placed('components/noah-result-data.tsx', 'phoneResults', { ...navigation, '@/lib/owner-intent': ownerIntent, '@/lib/noah-result-data-contract': resultData });
  const list = data.inside.findIndex((node) => node.type === 'ul');
  assert.ok(data.at >= 0 && list > data.at, '「成果データ」: Mac の成果の一覧の上');
  // 渡さない時は、前と同じ（何も足さない）。
  const plain = screen({ fetch: async () => ({ status: 401, body: {} }), modules: navigation, document }).mount('components/noah-launch.tsx');
  await plain.flush();
  assert.equal(plain.nodes().some((node) => node.props.id === 'phone'), false);
});

void test('pure rules of the ask screens', () => {
  const { noahAskRowView, noahResultPreview, noahLinkParts, noahFieldInitial, noahFormInput, noahConfirmRows, noahScreenKind, noahFilterTools } = askView;
  const row = (change) => noahAskRowView({ state: 'queued', stopRequested: false, createdAt: 0, updatedAt: 0, ...change }, 125_000);
  assert.deepEqual([row({}).text, row({}).stoppable, row({ stopRequested: true }).stoppable], ['順番を待っています', true, false]);
  assert.equal(row({ state: 'running' }).text, '進んでいます（2 分 5 秒）');
  // 止める事を頼んだ後は、「止める」を出さない。「止めています…」が 45 秒より長く続いた時だけ、もう一度出す（実行の場が無くなった時の、出口）。
  const stopping = (updatedAt) => row({ state: 'running', stopRequested: true, updatedAt });
  assert.deepEqual([stopping(125_000 - 44_000).stoppable, stopping(125_000 - 46_000).stoppable, stopping(0).text, stopping(0).done], [false, true, '止めています…（相手のサーバーで始まっていれば、止められません）', false]);
  assert.deepEqual([row({ state: 'stopped' }).text, row({ state: 'stopped', error: '接続を切ったので、止めました。' }).text], ['止めました。', '接続を切ったので、止めました。']);
  assert.equal(row({ state: 'unknown' }).text, '結果を確かめられませんでした。相手のサーバーで実行されたかは分かりません。');
  assert.deepEqual([row({ state: 'succeeded' }).done, row({ state: 'running' }).done], [true, false]);
  assert.deepEqual(noahResultPreview('a\nb\nc\nd'), { text: 'a\nb\nc', more: true });
  assert.deepEqual(noahResultPreview('a\nb'), { text: 'a\nb', more: false });
  assert.equal(noahResultPreview('x'.repeat(900)).more, true);
  // リンクにするのは https:// だけ。文の終わりの句読点と閉じ括弧は、入れない。http:// や javascript: は、文字のまま。
  assert.deepEqual(noahLinkParts('見て（https://a.example/x?y=1）。http://b.example と javascript:alert(1) は文字。'), [
    { text: '見て（' }, { href: 'https://a.example/x?y=1', host: 'a.example' }, { text: '）。http://b.example と javascript:alert(1) は文字。' },
  ]);
  assert.deepEqual(noahLinkParts('<a href="https://c.example">x</a>'), [{ text: '<a href="' }, { href: 'https://c.example', host: 'c.example' }, { text: '">x</a>' }]);
  assert.deepEqual(noahLinkParts('https://'), [{ text: 'https://' }]);
  const fields = [
    { name: 'q', label: 'q', help: '', kind: 'text', required: true }, { name: 'n', label: 'n', help: '', kind: 'number', required: false, default: 5 },
    { name: 'tags', label: 'tags', help: '', kind: 'list', required: false, choices: ['a', 'b'], default: ['b'] }, { name: 'lines', label: 'lines', help: '', kind: 'list', required: false, default: ['x', 'y'] },
  ];
  assert.deepEqual(fields.map(noahFieldInitial), ['', '5', ['b'], 'x\ny']);
  assert.deepEqual(noahFormInput(fields, { q: ' hi ', n: '  ', tags: [], lines: 'x' }), { q: ' hi ', lines: 'x' });
  assert.deepEqual(noahConfirmRows(fields, { q: 'z'.repeat(250), tags: ['a', 'b'] }), [{ label: 'q', value: `${'z'.repeat(200)}…` }, { label: 'tags', value: 'a、b' }]);
  assert.deepEqual([noahScreenKind(599), noahScreenKind(600)], ['narrow', 'wide']);
  assert.deepEqual(noahFilterTools([{ name: 'Lookup', summary: 'finds' }, { name: 'x', summary: 'LOOK here' }, { name: 'y', summary: '' }], ' look ').map((tool) => tool.name), ['Lookup', 'x']);
});

void test('confirm delegation asks for each read-only run without describing it as a write',async t=>{
 const server=mcpServer({tools:[stats]});const {w,ui,page,form}=await opened(t,server);
 await page.click('確認して実行');await page.submit(form());
 assert.equal(asksSent(ui).length,0);assert.match(page.text(),/「確認して実行」の設定で/);assert.doesNotMatch(page.text(),/読み取りだけ」と宣言されていません/);
 await page.click('確かめて頼む');assert.equal(asksSent(ui).length,1);assert.equal(asksSent(ui)[0].body.form.confirm,true);
 w.f.advance(1000);await page.submit(form());assert.equal(asksSent(ui).length,1);assert.match(page.text(),/頼む前の確かめ/);
 await page.click('任せない');assert.equal(page.find('button','確かめて頼む')[0].props.disabled,true);assert.equal(asksSent(ui).length,1);
});
