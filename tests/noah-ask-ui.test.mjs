import { readFileSync } from 'node:fs';
import { createNoahAgentApi } from '../lib/noah-agent-api.ts';
import { noahAgentTemplate } from '../lib/noah-agent-upload.ts';
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
import * as myRoutes from '../lib/noah-my-routes.ts';
import { noahPageTab } from '../lib/noah-page-routes.ts';
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
  const toolButton = (name) => page.find('button').find((node) => node.props.className === 'toolButton' && node.props['data-tool-name'] === name);
  const field = (label) => {
    const holder = page.nodes().find((node) => node.props.className === 'field' && node.props['data-field-name'] === (label==='Player'?'query':label));
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
  assert.deepEqual(page.find('button').filter((node) => node.props.className === 'toolButton').map((node) => page.text(node)), ['情報を検索読み取りだけ', '統計を見る読み取りだけ押すだけ', '公開する送る前に確かめます']);
  assert.match(page.text(), /設定する入力欄ではまだ使えません提供者の説明configure/);
  assert.equal(page.find('form').length, 0);
  await page.press(toolButton('lookup'));
  assert.equal(toolButton('lookup').props['aria-pressed'], true);
  const selectedRow = page.find('li').find(node => page.nodes(node).includes(toolButton('lookup')));
  assert.ok(page.nodes(selectedRow).includes(form()), 'input is immediately inside the selected operation row');
  // 必須の欄を先に。任意の欄は「細かい設定（n）」の中。入力欄にできない設定は、数だけ。
  const text = page.text(form());
  assert.match(text,/検索する内容 \*提供者の説明Player · A player id or name.細かい設定（3）件数/);
  assert.match(text, /ほかに 1 個の設定があります（入力欄では使えません）。/);
  // 既定の値は、欄に入れて見せる。整数の欄は、数の鍵盤。選択肢は、押して選ぶ。
  assert.deepEqual([field('limit').props.value, field('limit').props.inputMode, field('Player').props.maxLength], ['5', 'numeric', 200]);
  assert.deepEqual(page.nodes(field('order')).filter((node) => node.type === 'button').map((node) => [page.text(node), node.props['aria-pressed']]), [['new', false], ['old', false]]);
  assert.deepEqual(page.nodes(field('exact')).filter((node) => node.type === 'button').map((node) => page.text(node)), ['はい', 'いいえ', '指定しない']);
  // 「頼む」の上に、送り先。主ボタンは 1 つ。
  assert.ok(text.indexOf(`送信先: ${hostOf(1)}`) < text.lastIndexOf('頼む'));
  assert.deepEqual(page.nodes(form()).filter((node) => node.type === 'button' && node.props.className === 'primary').map((node) => [page.text(node), node.props.type]), [['頼む', 'submit']]);
  // もう一度押すと、閉じる。別の道具を選ぶと、その入力欄に替わる。
  await page.press(toolButton('lookup'));
  assert.equal(page.find('form').length, 0);
  await page.press(toolButton('stats'));
  assert.ok(page.text(form()).includes('提供者の説明stats'));
  assert.equal(page.find('h3',form()).length,0,'the selected operation heading is not repeated');
  assert.ok(page.text(form()).includes(`送信先: ${hostOf(1)}頼む`));
  assert.equal(calls(server).length, 0);
});

void test('one usable tool: the form is shown without a list; many tools: a filter appears', async (t) => {
  const single = await opened(t, mcpServer({ tools: [lookup, nested] }));
  assert.equal(single.page.find('button').filter((node) => node.props.className === 'toolButton').length, 0);
  assert.ok(single.page.text(single.form()).includes('検索する内容 *'));
  assert.deepEqual(single.page.find('h2').filter(node=>node.props.id==='noah-ask-tools').map((node) => single.page.text(node)), ['情報を検索']);
  const many = await opened(t, mcpServer({ tools: [lookup, ...Array.from({ length: 13 }, (_, n) => tool(`tool_${n}`))] }));
  const filter = many.page.find('input').find((node) => node.props.type === 'search');
  assert.equal(filter.props.placeholder, '語で絞る（名前・説明）');
  await many.page.change(filter, 'PLAYER');
  assert.deepEqual(many.page.find('button').filter((node) => node.props.className === 'toolButton').map((node) => many.page.text(many.page.nodes(node).find((child) => child.type === 'strong'))), ['情報を検索']);
  await many.page.change(filter, '情報を検索');
  assert.deepEqual(many.page.find('button').filter(node => node.props.className === 'toolButton').map(node => node.props['data-tool-name']), ['lookup']);
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
  assert.equal(page.nodes(form()).find((node) => node.type === 'details'&&node.props.className==='more').props.open, true);
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
  assert.match(rows()[0], /結果を受け取りました情報を検索/);
  assert.match(rows()[0], /届いた文章1\. cobalt/);
  assert.equal(page.find('a','詳細を開く →')[0].props.href, `/noah/tasks/${sent.body.id}`);
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
  assert.match(page.text(box), /この操作は、送信先のデータを変更・送信する可能性があります。入力内容hello world送信先: agent-1\.example\.comやめる確かめて頼む$/);
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
  assert.match(rows()[0], /^進んでいます（0 秒）止める情報を検索$/);
  const reads = () => ui.calls.filter((call) => call.method === 'GET' && call.url.startsWith('/api/noah/ask?')).length;
  const before = reads();
  w.f.advance(3000);
  await page.tick(3000);
  assert.ok(reads() >= before + 3, '終わっていない間は、1 秒ごとに読む');
  assert.match(rows()[0], /^進んでいます（3 秒）/);
  // 「止める」: 止める事を頼む。まだ「止めました」とは出さない。
  await page.click('止める');
  assert.match(rows()[0], /^止めています…（相手のサーバーで始まっていれば、止められません）情報を検索$/);
  assert.equal(page.find('button', '止める').length, 0);
  // 相手が返した後: 止めた依頼の成果は、採らない。
  release();
  await Promise.all(waiting);
  await page.tick(1000);
  assert.deepEqual([rows(), w.asked()[0].state], [['止めました。相手のサーバーで実行されたかは分かりません。情報を検索'], 'stopped']);
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
  assert.match(rows()[0], /^結果を受け取りました統計を見る提供者の説明/);
  assert.match(rows()[0], /届いた一覧1件Cobalt/);
  assert.equal(page.find('a','詳細を開く →')[0].props.href, `/noah/tasks/${asksSent(ui).at(-1).body.id}`);
  // 道具が「できなかった」と返した時は、理由を出す。
  fail = true;
  w.f.advance(1000);
  await page.submit(form());
  await Promise.all(waiting);
  await page.tick(1000);
  assert.match(rows()[0], /^できませんでした。No data yet\.統計を見る$/);
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
  assert.match(rows[0], /^進んでいます（\d+ 秒）止める情報を検索この Agent を開く →$/);
  assert.match(rows[1], /^できませんでした。No data yet\.統計を見るこの Agent を開く →$/);
  assert.match(rows[2], /^結果を受け取りました情報を検索提供者の説明/);
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
  assert.match(page.text(rowsOf(page)[0]), /^止めました。相手のサーバーで実行されたかは分かりません。情報を検索/);

  // 「成果データ」: 成果が出た依頼だけ。
  const data = open('owner-a', { ownerScope: null, refresh: 0, only: 'succeeded', heading: '接続したAgentの成果' }).page;
  await data.flush();
  assert.equal(data.text(data.find('h2')[0]), '接続したAgentの成果');
  assert.deepEqual(rowsOf(data).map((row) => data.text(row).startsWith('結果を受け取りました情報を検索提供者の説明')), [true]);
  assert.deepEqual(back(data), [detail(1)]);

  await t.test('saved results in the theater and the original saved entry show the same private remote Work', async () => {
    const unused = { default: () => null };
    const modules = {
      ...MODULES, '@/lib/noah-my-routes': myRoutes, '@/lib/noah-page-routes': { noahPageTab },
      './noah-library': unused, './noah-boards': {}, './sky-agent-library': unused, './sky-output-center': unused,
      './noah-result-data': unused, './noah-theater': unused,
    };
    const before = calls(one).length;
    for (const [path, legacy] of [['/noah/my?view=saved&tab=results', undefined], ['/noah/saved?tab=results', 'saved']]) {
      const params = Object.fromEntries(new URL(path, 'https://avoado.si').searchParams);
      const ui = screen({ modules, fetch: w.browser({ user: 'owner-a' }, background), now: w.f.time() });
      const saved = ui.mount('components/noah-my.tsx', { params, legacy });
      await saved.flush();
      const cards = saved.find('li').filter((row) => row.props.className === 'resultCard');
      assert.equal(cards.length, 1, path);
      assert.match(saved.text(cards[0]), /found cobalt/, path);
      const link = saved.nodes(cards[0]).find((node) => node.type === 'a');
      assert.equal(link.props.href, `/noah/tasks/${uuid(10)}`, path);
      const id = link.props.href.split('/').pop();
      const detailPage = ui.mount('components/noah-task-detail.tsx', { id });
      await detailPage.flush();
      assert.match(detailPage.text(), /found cobalt/, path);
      assert.match(detailPage.text(), /この仕事の利用明細/, path);
      assert.match(detailPage.text(), /提供元の料金未確定（請求情報なし）/, 'a response from the provider does not prove its bill');
      assert.doesNotMatch(detailPage.text(), /someone else/, path);
      assert.doesNotMatch(saved.text(), /No data yet|someone else/, path);
      assert.ok(ui.calls.some((req) => req.url === '/api/noah/ask'), path);
      assert.ok(ui.calls.some((req) => req.url === `/api/noah/ask/${uuid(10)}`), path);
      assert.ok(ui.calls.every((req) => req.method === 'GET'), path);
    }
    assert.equal(calls(one).length, before);
  });

  // 成果が出た依頼が無い人の「成果データ」には、何も出さない（できなかった依頼は、「実行中」の側にだけ出る）。
  const failedOnly = open('owner-d', { ownerScope: null, refresh: 0, only: 'succeeded', heading: '接続したAgentの成果' }).page;
  await failedOnly.flush();
  assert.equal(failedOnly.text(), '');
  const failedRows = open('owner-d', { ownerScope: null, refresh: 0, heading: '接続したAgentの仕事' }).page;
  await failedRows.flush();
  assert.deepEqual(rowsOf(failedRows).map((row) => failedRows.text(row)), ['できませんでした。No data yet.統計を見るこの Agent を開く →']);
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

void test('retained shared wrappers preserve their inserted work list', async () => {
  const marker = (name) => ({ type: 'aside', props: { id: name, children: name }, key: null });
  const document = { hidden: false, addEventListener() {}, removeEventListener() {} };

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
 assert.equal(asksSent(ui).length,0);assert.match(page.text(),/入力内容を送り、この操作を実行します。/);assert.doesNotMatch(page.text(),/読み取りだけ」と宣言されていません/);
 await page.click('確かめて頼む');assert.equal(asksSent(ui).length,1);assert.equal(asksSent(ui)[0].body.form.confirm,true);
 w.f.advance(1000);await page.submit(form());assert.equal(asksSent(ui).length,1);assert.match(page.text(),/頼む前の確かめ/);
 await page.click('任せない');assert.equal(page.find('button','確かめて頼む')[0].props.disabled,true);assert.equal(asksSent(ui).length,1);
});


void test('engineering tests the selected owner upload through its exact listed MCP endpoint and returns real tool output', async t => {
  const server = mcpServer({ tools: [lookup], call: params => ({ content: [{ type: 'text', text: '試した入力 ' + params.arguments.query }] }) });
  const w = await world(t, { [hostOf(1)]: server });
  for (const migration of ['0033_noah_agent_uploads', '0034_noah_upload_refactor']) {
    w.f.sql.exec(readFileSync(new URL('../drizzle/' + migration + '.sql', import.meta.url), 'utf8'));
  }
  const scope = await ownerIntent.ownerScopeFor('owner-a');
  const api = createNoahAgentApi({ db: w.f.db, authenticate: async () => 'owner-a' });
  async function save(id, path) {
    const response = await api.create(new Request('https://noah.test/api/noah/agents', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Origin:'https://noah.test', 'X-Rock-Owner-Scope':scope },
      body: JSON.stringify({ id, manifest: { ...noahAgentTemplate, name:'同じ名前', adapter:'mcp_http', endpointUrl:'https://' + hostOf(1) + path }, rightsConfirmed:true }),
    }));
    assert.equal(response.status, 201, await response.text());
  }
  const goodId = uuid(50), otherId = uuid(51);
  await save(goodId, '/mcp'); await save(otherId, '/a-different-mcp');
  const session = {user:'owner-a'}, fetch = w.browser(session);
  const lookupUrl = id => '/api/noah/intake?engineeringAgent=' + id;
  assert.equal((await fetch({ method:'GET', url:lookupUrl(otherId) })).body.match, null, 'a shared host and name do not select a different path');
  assert.equal((await w.browser({user:'owner-b'})({method:'GET', url:lookupUrl(goodId)})).status, 404);
  assert.equal((await w.browser({user:null})({method:'GET', url:lookupUrl(goodId)})).status, 401);
  const ui = screen({document:{hidden:false,addEventListener(){},removeEventListener(){}}, fetch, modules:MODULES, now:w.f.time()});
  const page = ui.mount('components/noah-engineering-mcp-trial.tsx', {id:goodId, ownerScope:scope});
  await page.flush();
  assert.equal(calls(server).length, 0);
  assert.equal(w.rows().length, 0);
  await page.click('接続');
  const button = page.find('button').find(b => b.props['data-tool-name'] === 'lookup');
  if (button && !page.find('form').length) await page.press(button);
  const field = page.nodes().find(node => node.props['data-field-name'] === 'query');
  assert.ok(field, page.text());
  await page.change(page.nodes(field).find(node => ['input','textarea'].includes(node.type)), '会議前のメモ');
  assert.equal(calls(server).length, 0);
  await page.submit(page.find('form')[0]);
  assert.equal(calls(server).length, 1);
  assert.match(page.text(), /試した入力 会議前のメモ/);
  assert.equal(w.asked()[0].state, 'succeeded');
  w.f.sql.prepare('UPDATE noah_intake_families SET withdrawn_at=? WHERE id=?').run(w.f.time(),familyId(1));
  assert.equal((await fetch({ method:'GET', url:lookupUrl(goodId) })).body.match, null);
});
