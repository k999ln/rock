// 「すぐ使える」の画面（一覧 /noah/ready・詳細 /noah/ready/agent）と、接続のボタン・その場のサインイン・道具の一覧・探す画面の入口。
// 画面の部品を、ブラウザなしで動かす（tests/fixtures/noah/screen.mjs）。画面が送る要求は、本物の入口（一覧・計画・接続）と、試験用の表・合成の接続先へ通す。
// 見た目（CSS・幅 390 で、はみ出さない事）は、ここでは確かめない（実ブラウザで確かめた。docs/noah/spec-74-one-click-connect.md の 11.9）。
// 仕様: docs/noah/spec-74-one-click-connect.md の 5.2・6.3・11.4・11.5・11.6、spec-96-connect-plan.md の 6 章。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as askView from '../lib/noah-ask-view.ts';
import * as botNotice from '../lib/noah-bot-notice.ts';
import * as formLib from '../lib/noah-form.ts';
import * as view from '../lib/noah-ready-view.ts';
import * as surface from '../lib/noah-surface.ts';
import { entry, NOW } from './fixtures/noah/intake.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, rpcs, handshakes } from './fixtures/noah/connect-world.mjs';
import { screen } from './fixtures/noah/screen.mjs';

const MODULES = { '@/lib/owner-intent': ownerIntent, '@/lib/noah-ready-view': view, '@/lib/noah-ask-view': askView, '@/lib/noah-bot-notice': botNotice, '@/lib/noah-form': formLib, '@/lib/noah-surface': surface, 'next/image': { default: 'img' }, 'next/navigation': { usePathname: () => '/noah/ready' } };
const LIST = 'components/noah-ready.tsx', DETAIL = 'components/noah-ready-detail.tsx';
const nested = (name) => tool(name, false, { inputSchema: { type: 'object', required: ['o'], properties: { o: { type: 'object' } } } });
const markRan = (w, i) => {
  w.f.sql.prepare('UPDATE noah_intake_checks SET level=2,l2_at=? WHERE candidate_id=?').run(w.f.time(), familyId(i));
  w.f.sql.prepare("UPDATE noah_intake_families SET level=2,l2_at=?,badge_hint='one_click' WHERE id=?").run(w.f.time(), familyId(i));
};
/** 試験用の世界と、その上の画面。session.user を変えると、サインインした後になる。画面の時計は、表の時計と同じ所から始める。 */
function browser(w, user, extra = {}) {
  const session = { user };
  const ui = screen({ fetch: w.browser(session, extra.config), modules: MODULES, now: w.f.time(), ...(extra.storage ? { storage: extra.storage } : {}) });
  return { session, ui };
}
const posts = (ui) => ui.calls.filter((call) => call.method === 'POST');
const cards = (page) => page.find('article');
/** 道具を選ぶ行（押せる）を除いた、画面のボタンの文。 */
const actions = (page) => page.find('button').filter((node) => node.props.className !== 'toolButton').map((node) => page.text(node));
const buttonsIn = (page, node) => page.nodes(node).filter((child) => child.type === 'button' || (child.type === 'a' && child.props.className === 'primary'));

void test('the list: sections, one main button per card, badges in words, where the input goes, and where the list comes from', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer(), [hostOf(3)]: mcpServer({ tools: [tool('lookup', true, { inputSchema: { type: 'object', required: ['q'], properties: { q: { type: 'string' } } } })] }) });
  markRan(w, 2);
  const { ui } = browser(w, null);
  const page = ui.mount(LIST);
  assert.match(page.text(), /読み込んでいます/);
  await page.flush();
  const text = page.text();
  assert.match(text, /すぐ使える Agent/);
  assert.match(text, /スマホだけで使えます。あなたの端末では何も動きません。/);
  // 段: 動いた（人が動かした物）が先、握手だけの物が後。件数も出る。
  assert.ok(text.indexOf('人が動かして、成果が返った物です。') < text.indexOf('Noah が、応答する事だけを確かめた物です。'));
  assert.deepEqual(page.find('h2').map((node) => page.text(node)), ['動いた1 件', 'まだ誰も動かしていない2 件']);
  assert.deepEqual(cards(page).map((card) => page.text(page.nodes(card).find((node) => node.type === 'h3'))), ['Agent 2', 'Agent 1', 'Agent 3'].filter((name) => text.includes(name)).sort((a, b) => text.indexOf(a) - text.indexOf(b)));
  assert.equal(cards(page).length, 3);
  for (const card of cards(page)) {
    // カードの主ボタンは 1 つ。
    assert.deepEqual(buttonsIn(page, card).map((node) => page.text(node)), ['接続']);
    const facts = page.nodes(card).filter((node) => node.type === 'li').map((node) => page.text(node));
    // 印・動く所・料金は、必ず文字で出る。
    assert.match(facts[0], /^(あと 1 タップ（サインイン）|まだ誰も動かしていない)$/);
    assert.match(facts[1], /^相手のサーバー（agent-\d\.example\.com）$/);
    assert.equal(facts[2], '無料');
    assert.match(page.text(card), /提供: test\.provider/);
  }
  const of = (name) => cards(page).find((card) => page.text(card).includes(name));
  assert.match(page.text(of('Agent 2')), /あと 1 タップ（サインイン）/, '動いた物を、未サインインの人が見た時');
  assert.match(page.text(of('Agent 1')), /押すだけで試せる.*道具 2 個/);
  assert.doesNotMatch(page.text(of('Agent 3')), /押すだけで試せる/);
  // 出どころと、申し出の窓口、Mac で動かす Agent への道。
  assert.match(text, /出どころ: Official MCP Registry。Noah が作った物ではありません。説明は、提供者が書いた文のままです。/);
  // 申し出の窓口への道（行き先は /noah/help#bot の節。宛先は本人が決めた物: docs/noah/mvp-launch.md の D8）。宛先が無い間は出さない事は、次の試験で見る。
  assert.notEqual(botNotice.NOAH_REPORT_CONTACT, null, '宛先は、本人が決めた物（2026-11-21）');
  assert.deepEqual(page.find('a', '報告・取り下げの申し出').map((node) => node.props.href), ['/noah/help#bot']);
  assert.deepEqual(page.find('a', '自分の Mac で動かす Agent').map((node) => node.props.href), ['/noah/explore']);
  // 名前を押すと、詳細へ。系列の ID は query で渡す。
  assert.equal(page.nodes(of('Agent 1')).find((node) => node.type === 'a').props.href, `/noah/ready/agent?id=${encodeURIComponent(familyId(1))}`);
  // 未サインインの間は、本人の接続を読まない。相手へも送らない。
  assert.deepEqual(ui.calls.map((call) => call.url), ['/api/noah/intake?']);
  assert.deepEqual(w.net.hosts, []);
});

void test('the way to the report desk appears on the list and the detail screen only while there is a contact', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer() });
  const contact = (value) => ({ ...MODULES, '@/lib/noah-bot-notice': { ...botNotice, NOAH_REPORT_CONTACT: value } });
  const hrefs = (page) => page.find('a', '報告・取り下げの申し出').map((node) => node.props.href);
  const mail = (page) => page.nodes().filter((node) => node.type === 'a' && String(node.props.href).startsWith('mailto:'));
  // 宛先が無い時（null）・本人が決めた宛先（そのまま）・別の形の宛先。
  for (const [modules, expected] of [[contact(null), []], [MODULES, ['/noah/help#bot']], [contact({ label: 'example.org の窓口', href: 'https://example.org/report' }), ['/noah/help#bot']]]) {
    const ui = screen({ fetch: w.browser({ user: null }), modules, now: w.f.time() });
    const list = ui.mount(LIST);
    await list.flush();
    assert.match(list.text(), /出どころ: Official MCP Registry/);
    assert.deepEqual(hrefs(list), expected);
    const detail = ui.mount(DETAIL, { id: familyId(1) });
    await detail.flush();
    assert.match(detail.text(), /出どころ: Official MCP Registry/);
    assert.deepEqual(hrefs(detail), expected);
    // 宛先そのもの（メールや URL）は、一覧・詳細には出さない。出すのは、/noah/help の節だけ。
    assert.deepEqual([mail(list), mail(detail)], [[], []]);
  }
  assert.deepEqual(w.net.hosts, []);
});

void test('the list: closed, empty, unavailable', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer({ status: 401 }) });
  // 切り替えが閉じている間、審査者でない人には「まだ公開していません。」だけ。
  const closed = browser(w, 'owner-a', { config: { env: {} } }).ui.mount(LIST);
  await closed.flush();
  assert.match(closed.text(), /まだ公開していません。/);
  assert.equal(closed.find('input').length, 0);
  assert.doesNotMatch(closed.text(), /出どころ/);
  // 載せている物が無い（握手が通った物が、まだ無い）。
  const empty = browser(w, null).ui.mount(LIST);
  await empty.flush();
  assert.match(empty.text(), /今、並べられる物がありません。少し後で開いてください。/);
  // 読めなかった時は、読み直せる。
  let down = true;
  const session = { user: null }, real = w.browser(session);
  const ui = screen({ fetch: async (request) => (down ? { status: 503, body: { error: '台帳を確認できません。' } } : real(request)), modules: MODULES });
  const page = ui.mount(LIST);
  await page.flush();
  assert.match(page.text(), /一覧を読めませんでした。接続を確かめて、もう一度試してください。/);
  down = false;
  await page.click('読み直す');
  assert.match(page.text(), /今、並べられる物がありません/);
});

void test('the list: search waits for the typing to stop, filters, and reads on', async (t) => {
  const servers = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [hostOf(i + 1), i < 4 ? mcpServer({ tools: [nested('configure'), tool('publish', false)] }) : mcpServer()]));
  const records = Object.keys(servers).map((_, i) => entry(i + 1, i === 6 ? { title: 'Weather lookup', description: '天気を調べる' } : {}));
  const w = await world(t, servers, { records });
  const { ui } = browser(w, null);
  const page = ui.mount(LIST);
  await page.flush();
  assert.equal(cards(page).length, 20);
  assert.match(page.text(), /まだ誰も動かしていない24 件/);
  // 続きを読む（重ならない）。
  await page.click('続きを読む');
  assert.equal(cards(page).length, 24);
  assert.equal(new Set(cards(page).map((card) => page.text(page.nodes(card).find((node) => node.type === 'h3')))).size, 24);
  assert.equal(page.find('button', '続きを読む').length, 0);
  // 押すだけで試せる物だけ。
  await page.click('押すだけで試せる');
  assert.equal(cards(page).length, 20);
  assert.ok(ui.calls.at(-1).url.includes('oneTap=1'));
  for (const card of cards(page)) assert.match(page.text(card), /押すだけで試せる/);
  await page.click('すべて');
  // 語で探す: 打っている間は読まない。300 ミリ秒してから、1 回だけ読む。1 文字では探さない。
  const before = ui.calls.length;
  await page.type('W');
  await page.tick(300);
  assert.equal(ui.calls.length, before);
  await page.type('We');
  await page.type('Weather');
  await page.tick(299);
  assert.equal(ui.calls.length, before);
  await page.tick(1);
  assert.deepEqual(ui.calls.slice(before).map((call) => call.url), ['/api/noah/intake?q=Weather']);
  assert.deepEqual([page.find('h2').map((node) => page.text(node)), cards(page).map((card) => page.text(page.nodes(card).find((node) => node.type === 'h3')))], [['探した結果'], ['Weather lookup']]);
  assert.equal(page.find('button', '押すだけで試せる').length, 0, '探している間は、絞り込みを出さない');
  await page.type('zzzz-not-there');
  await page.tick(300);
  assert.match(page.text(), /見つかりませんでした。別の語で探してください。/);
  await page.type('');
  await page.tick(300);
  assert.equal(cards(page).length, 20);
});

void test('signed in: one press on the card connects, and the button becomes 頼む', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server, [hostOf(2)]: mcpServer() });
  const { ui } = browser(w, 'owner-a');
  const page = ui.mount(LIST);
  await page.flush();
  // サインイン済みなら、本人の接続も読む。まだ無い。
  assert.deepEqual(ui.calls.map((call) => call.url), ['/api/noah/intake?', '/api/noah/connect']);
  assert.doesNotMatch(page.text(), /つながっているもの/);
  const card = () => cards(page).find((node) => page.text(node).includes('Agent 1'));
  const [connect] = buttonsIn(page, card());
  connect.props.onClick();
  page.render();
  // 押してから応答までは「準備しています…」（押せない）。
  assert.deepEqual(buttonsIn(page, card()).map((node) => [page.text(node), node.props.disabled]), [['準備しています…', true]]);
  await page.flush();
  // 計画を読んでから、つなぐ。始めた時と同じ account の印（ownerScope）を付けて送る。
  const sent = ui.calls.slice(2);
  assert.deepEqual(sent.map((call) => [call.method, call.url.split('?')[0]]), [['GET', '/api/noah/connect-plan'], ['POST', '/api/noah/connect']]);
  assert.deepEqual(Object.keys(sent[1].body).sort((a, b) => a.localeCompare(b)), ['agentId', 'id', 'planSha256']);
  assert.match(sent[1].headers['X-Rock-Owner-Scope'], /^owner-v1:[a-f0-9]{64}$/);
  assert.equal(sent[1].body.agentId, familyId(1));
  // 「頼む」に変わる（詳細へ移る）。動く所を 3 秒だけ出す。
  assert.deepEqual(buttonsIn(page, card()).map((node) => [page.text(node), node.props.href]), [['頼む', `/noah/ready/agent?id=${encodeURIComponent(familyId(1))}`]]);
  assert.match(page.text(card()), new RegExp(`相手のサーバー（${hostOf(1)}）につなぎました`));
  await page.tick(3000);
  assert.doesNotMatch(page.text(card()), /につなぎました/);
  // 上の段に出る。行は 1 件。相手が受けたのは握手だけ。
  assert.match(page.text(), /つながっているもの/);
  assert.deepEqual(page.find('li', 'Agent 1').filter((node) => page.text(node).includes('頼む')).length, 1);
  assert.deepEqual([w.rows().length, w.rows()[0].state, w.rows()[0].id, rpcs(server)], [1, 'connected', sent[1].body.id, ['initialize', 'notifications/initialized', 'tools/list']]);
  // 開き直しても、つながっている物は「頼む」。
  const again = browser(w, 'owner-a').ui.mount(LIST);
  await again.flush();
  assert.deepEqual(buttonsIn(again, cards(again).find((node) => again.text(node).includes('Agent 1'))).map((node) => again.text(node)), ['頼む']);
  assert.deepEqual(buttonsIn(again, cards(again).find((node) => again.text(node).includes('Agent 2'))).map((node) => again.text(node)), ['接続']);
});

void test('a connection the provider refused is listed as not connected, with its reason on the card', async (t) => {
  // 手元の実物で、実在の相手が接続を断った時に見つけた: 失敗した接続が「つながっているもの」の下に並んでいた。
  const refusing = mcpServer();
  // 巡回の握手は通す（一覧に載る）。その後で、相手が断るようになる。
  const w = await world(t, { [hostOf(1)]: mcpServer(), [hostOf(2)]: refusing });
  const { ui } = browser(w, 'owner-a');
  const page = ui.mount(LIST);
  await page.flush();
  const card = (name) => cards(page).find((node) => page.text(node).includes(name));
  const section = (heading) => page.find('section').find((node) => page.text(page.nodes(node).find((child) => child.type === 'h2')) === heading);
  buttonsIn(page, card('Agent 1'))[0].props.onClick();
  page.render();
  await page.flush();
  refusing.options.status = 403;
  buttonsIn(page, card('Agent 2'))[0].props.onClick();
  page.render();
  await page.flush();
  assert.deepEqual(w.rows().map((row) => row.state).sort((a, b) => a.localeCompare(b)), ['connected', 'failed']);
  // カード: 断られた方は「もう一度」と、その理由。つながった方は「頼む」。
  assert.deepEqual(buttonsIn(page, card('Agent 2')).map((node) => page.text(node)), ['もう一度']);
  assert.match(page.text(card('Agent 2')), /相手のサーバーが、Noah からの接続を断りました。/);
  assert.deepEqual(buttonsIn(page, card('Agent 1')).map((node) => page.text(node)), ['頼む']);
  // 上の段: つながっている物と、そうでない物を、分けて出す。見出しと中身が、合っている。
  assert.match(page.text(section('つながっているもの')), /^つながっているものAgent 1相手のサーバー（[^）]+）頼む$/);
  assert.match(page.text(section('つながっていないもの')), /^つながっていないものAgent 2つながっていません。開く$/);
  // つながっている物が無くなれば、その見出しは出ない。
  const only = browser(w, 'owner-a');
  w.f.sql.prepare("UPDATE noah_connections SET state='disconnected',disconnected_at=?,revision=revision+1 WHERE state='connected'").run(w.f.time());
  const reopened = only.ui.mount(LIST);
  await reopened.flush();
  assert.deepEqual(reopened.find('h2').map((node) => reopened.text(node)).filter((text) => text.startsWith('つなが')), ['つながっていないもの']);
});

void test('not signed in: pressing 接続 goes to sign-in, and the detail screen continues with the same ID without pressing again', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server, [hostOf(2)]: mcpServer() });
  const detailPath = `/noah/ready/agent?id=${encodeURIComponent(familyId(1))}`;
  const { session, ui } = browser(w, null);
  const page = ui.mount(LIST);
  await page.flush();
  const [connect] = buttonsIn(page, cards(page).find((node) => page.text(node).includes('Agent 1')));
  connect.props.onClick();
  await page.flush();
  // サインインの画面へ移る。戻る先は、その Agent の詳細。置くのは、操作 ID と Agent の ID と時刻だけ。何も送らない。
  assert.deepEqual(ui.visits, [`/account?returnTo=${encodeURIComponent(detailPath)}`]);
  const handoff = JSON.parse(ui.storage.get('noah-connect-handoff'));
  assert.deepEqual(Object.keys(handoff).sort((a, b) => a.localeCompare(b)), ['agentId', 'at', 'id']);
  assert.deepEqual([handoff.agentId, handoff.at], [familyId(1), ui.time()]);
  assert.deepEqual([posts(ui).length, w.rows().length, handshakes(server)], [0, 0, 0]);

  // サインインして、詳細の画面へ戻る（同じ tab）。押し直さずに、同じ操作 ID で続く。
  session.user = 'owner-a';
  const calls = ui.calls.length;
  const detail = ui.mount(DETAIL, { id: familyId(1) });
  await detail.flush();
  // 仕事の一覧（この Agent への、前の依頼と成果）は、つなぐ前から読む（サインイン済みの人だけ）。つないだ後に、読み直さない。
  assert.deepEqual(ui.calls.slice(calls).map((call) => [call.method, call.url.split('?')[0]]), [['GET', '/api/noah/intake'], ['GET', '/api/noah/connect-plan'], ['GET', '/api/noah/ask'], ['POST', '/api/noah/connect'], ['GET', `/api/noah/connect/${handoff.id}/tools`]]);
  assert.equal(posts(ui)[0].body.id, handoff.id);
  assert.deepEqual([w.rows().length, w.rows()[0].id, w.rows()[0].state, w.rows()[0].owner_id], [1, handoff.id, 'connected', 'owner-a']);
  assert.match(detail.text(), /道具を選ぶ/);
  assert.equal(ui.storage.has('noah-connect-handoff'), false, '続きは、1 回しか使わない');
  // もう一度開いても、つなぎ直さない。
  const reopened = ui.mount(DETAIL, { id: familyId(1) });
  await reopened.flush();
  assert.equal(posts(ui).length, 1);
});

void test('a handoff is used only for its own agent, only once, and only for ten minutes', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer() });
  const id = '00000000-0000-4000-8000-00000000abcd';
  const stored = (change = {}) => ({ 'noah-connect-handoff': JSON.stringify({ agentId: familyId(1), id, at: w.f.time(), ...change }) });
  // 10 分を越えた続きは、使わない（「接続」が出たまま）。消す。
  const old = browser(w, 'owner-a', { storage: stored({ at: w.f.time() - 600_001 }) });
  const expired = old.ui.mount(DETAIL, { id: familyId(1) });
  await expired.flush();
  assert.deepEqual([posts(old.ui).length, expired.find('button', '接続').length, old.ui.storage.has('noah-connect-handoff')], [0, 1, false]);
  // 別の Agent の続きは、使わない。消さない（その Agent の詳細を開いた時に使う）。
  const other = browser(w, 'owner-a', { storage: stored() });
  const elsewhere = other.ui.mount(DETAIL, { id: familyId(2) });
  await elsewhere.flush();
  assert.deepEqual([posts(other.ui).length, other.ui.storage.has('noah-connect-handoff')], [0, true]);
  // 形の違う続き（操作 ID が UUID でない・先の時刻）は、使わない。
  for (const change of [{ id: 'not-a-uuid' }, { at: w.f.time() + 3_600_000 }, { at: 'now' }]) {
    const bad = browser(w, 'owner-a', { storage: stored(change) });
    const page = bad.ui.mount(DETAIL, { id: familyId(1) });
    await page.flush();
    assert.deepEqual([posts(bad.ui).length, bad.ui.storage.has('noah-connect-handoff')], [0, false], JSON.stringify(change));
  }
  // 未サインインのまま戻った時は、続けない（続きは残す。サインインした後に使える）。
  const anonymous = browser(w, null, { storage: stored() });
  const page = anonymous.ui.mount(DETAIL, { id: familyId(1) });
  await page.flush();
  assert.deepEqual([posts(anonymous.ui).length, anonymous.ui.storage.has('noah-connect-handoff'), w.rows().length], [0, true, 0]);
  // 戻る先に渡すのは、/noah/ready で始まるパスだけ。
  assert.equal(view.noahReadyAccountHref('/noah/ready/agent?id=x'), '/account?returnTo=%2Fnoah%2Fready%2Fagent%3Fid%3Dx');
  for (const path of ['https://evil.example/noah/ready', '//evil.example', '/noah/readymade', '/account', '/noah/ready\r\n/x']) assert.equal(view.noahReadyAccountHref(path), '/account?returnTo=%2Fnoah%2Fready', path);
});

void test('the detail screen: where the input goes is shown before connecting; then the tools; then cutting', async (t) => {
  const tools = [tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } }), nested('configure'), tool('stats'), tool('publish', false)];
  const server = mcpServer({ tools });
  const w = await world(t, { [hostOf(1)]: server }, { records: [entry(1, { title: 'Mizan', description: 'Looks up game bans. Second line.', websiteUrl: 'https://mizan.example.com/about' })] });
  const { ui } = browser(w, 'owner-a');
  const page = ui.mount(DETAIL, { id: familyId(1) });
  await page.flush();
  const text = page.text();
  // 名前・提供者・説明（提供者の文のまま）・動く所・料金・道具の数・最後に確かめた日。
  assert.deepEqual(page.find('h1').map((node) => page.text(node)), ['Mizan']);
  assert.match(text, /提供: test\.provider/);
  assert.match(text, /Looks up game bans\. Second line\./);
  assert.deepEqual(page.find('li').slice(0, 4).map((node) => page.text(node)), ['まだ誰も動かしていない', `相手のサーバー（${hostOf(1)}）`, '無料', '道具 4 個']);
  assert.match(text, new RegExp(`最後に確かめた日 ${new Date(NOW).getMonth() + 1}/${new Date(NOW).getDate()}`));
  // 送り先は、接続の前に出ている。
  assert.match(text, new RegExp(`入力は ${hostOf(1).replaceAll('.', '\\.')} へ送られます。Noah が送るのは、あなたが入力した内容だけです。`));
  assert.deepEqual(page.find('button').map((node) => page.text(node)), ['接続']);
  assert.doesNotMatch(text, /切る/);
  // 提供者のページは、別の tab で開く。行き先の host を出す。
  assert.deepEqual(page.find('a', '提供者のページ').map((node) => [page.text(node), node.props.href, node.props.target, node.props.rel]), [['提供者のページ（mizan.example.com）', 'https://mizan.example.com/about', '_blank', 'noopener noreferrer nofollow']]);
  assert.match(text, /出どころ: Official MCP Registry。Noah が作った物ではありません。/);
  assert.equal(handshakes(server), 0, '開いただけでは、相手へ送らない');

  // 「接続」1 回で、道具の一覧まで出る。
  await page.click('接続');
  assert.equal(w.rows()[0].state, 'connected');
  assert.match(page.text(), /道具を選ぶ4 個/);
  const rows = page.find('ul').at(-1);
  assert.deepEqual(page.nodes(rows).filter((node) => node.type === 'li').map((node) => page.text(node)), [
    'lookup読み取りだけLooks up a player.', 'stats読み取りだけ押すだけstats の説明', 'publish送る前に確かめますpublish の説明', 'configure入力欄ではまだ使えませんconfigure の説明',
  ]);
  assert.equal(server.log.filter((request) => request.rpc === 'tools/call').length, 0, '道具は呼ばない');
  // つないだ後は、主ボタンを出さない（すぐ下に道具がある）。「切る」と、今の状態（文字）が出る。使える道具の行は、押せる。
  assert.deepEqual(actions(page), ['切る']);
  assert.deepEqual(page.find('button').filter((node) => node.props.className === 'toolButton').map((node) => page.text(page.nodes(node).find((child) => child.type === 'strong'))), ['lookup', 'stats', 'publish']);
  assert.match(page.text(page.find('section').at(-1)), /^つながっています。切る切っても、受け取った成果は残ります。$/);
  // 「つなぎました」は 3 秒で消える。消えた後は、接続の欄（区切りの線）ごと出さない。
  assert.equal(page.find('output', 'につなぎました').length, 1);
  await page.tick(3000);
  assert.equal(page.find('output').length, 0);
  assert.equal(page.find('div').filter((node) => node.props.className === 'connect').length, 0);
  // 開き直しても、5 分の間は、道具の一覧を読み直さない（相手へ握手を送らない）。
  const shakes = handshakes(server);
  const reopened = ui.mount(DETAIL, { id: familyId(1) });
  await reopened.flush();
  assert.match(reopened.text(), /道具を選ぶ4 個/);
  assert.equal(handshakes(server), shakes);

  // 切る。「接続」に戻る。道具の一覧は消える。記録は残る。
  await page.click('切る');
  assert.deepEqual([w.rows().length, w.rows()[0].state], [1, 'disconnected']);
  assert.deepEqual(actions(page), ['接続']);
  assert.doesNotMatch(page.text(), /読み取りだけ/);
  assert.equal([...ui.storage.keys()].filter((key) => key.startsWith('noah-tools:')).length, 0);
  // もう一度つなげる（新しい操作 ID）。
  await page.click('接続');
  assert.deepEqual(w.rows().map((row) => row.state), ['disconnected', 'connected']);
});

void test('the detail screen: a failure shows its reason and もう一度; pressing again too soon is refused without contacting the provider', async (t) => {
  const server = mcpServer();
  const w = await world(t, { [hostOf(1)]: server });
  const { ui } = browser(w, 'owner-a');
  const page = ui.mount(DETAIL, { id: familyId(1) });
  await page.flush();
  server.options.status = 503;
  await page.click('接続');
  assert.match(page.text(), /相手のサーバーが応答しません。時間をおいて試してください。/);
  assert.deepEqual(page.find('button').map((node) => page.text(node)), ['もう一度', '切る']);
  assert.match(page.text(page.find('section').at(-1)), /^つながっていません。切る/);
  assert.doesNotMatch(page.text(), /読み取りだけ/);
  // 続けて押しても、相手へ握手を送り続けない。
  const shakes = handshakes(server);
  await page.click('もう一度');
  assert.match(page.text(), /少し待ってから試してください。/);
  assert.equal(handshakes(server), shakes);
  // 相手が戻った後。
  server.options.status = undefined;
  w.f.advance(5000);
  await page.click('もう一度');
  assert.equal(w.rows()[0].state, 'connected');
  assert.deepEqual([w.rows().length, actions(page)], [1, ['切る']]);
  assert.match(page.text(), /道具を選ぶ2 個/);
});

void test('the detail screen: a withdrawn agent says so, offers no button to use it, and can be cut', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer() });
  const { ui } = browser(w, 'owner-a');
  const first = ui.mount(DETAIL, { id: familyId(1) });
  await first.flush();
  await first.click('接続');
  // 運営が取り下げる。別の tab で開く（道具の一覧の控えは無い）。
  const detail = await w.f.store.detail(familyId(1), null, true);
  await w.f.store.moderate('withdraw', familyId(1), detail.revision);
  w.clear();
  const other = browser(w, 'owner-a');
  const page = other.ui.mount(DETAIL, { id: familyId(1) });
  await page.flush();
  // 一覧から外れた物でも、つないでいる本人は詳細を読める。理由が出る。相手へは送らない。
  assert.match(page.text(), /この Agent は、取り下げられました。使えません。/);
  assert.equal(w.rows()[0].state, 'blocked');
  assert.deepEqual(page.find('button').map((node) => page.text(node)), ['切る']);
  assert.match(page.text(page.find('section').at(-1)), /^使えません。切る/);
  assert.deepEqual(w.net.hosts, []);
  await page.click('切る');
  assert.equal(w.rows()[0].state, 'disconnected');
  // 切った後は、つなげない物として出る（載せていないので、「接続」は出ない）。他の人には、無い物。
  const after = browser(w, 'owner-a').ui.mount(DETAIL, { id: familyId(1) });
  await after.flush();
  assert.match(after.text(), /この Agent は、見つかりませんでした。/);
});

void test('the detail screen: unknown agents, malformed IDs, unlisted agents seen by a reviewer', async (t) => {
  const keyed = entry(2, { remotes: [{ type: 'streamable-http', url: `https://${hostOf(2)}/mcp`, headers: [{ name: 'X-Api-Key', isRequired: true, isSecret: true }] }] });
  const w = await world(t, { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer() }, { records: [entry(1), keyed] });
  for (const id of [familyId(99), familyId(2)]) {
    const { ui } = browser(w, 'owner-a');
    const page = ui.mount(DETAIL, { id });
    await page.flush();
    assert.match(page.text(), /この Agent は、見つかりませんでした。/, id);
    assert.equal(page.find('button').length, 0);
    assert.deepEqual(page.find('a', 'すぐ使える Agent').map((node) => node.props.href), ['/noah/ready']);
  }
  // 形の違う ID は、問い合わせない。
  const malformed = browser(w, 'owner-a');
  const page = malformed.ui.mount(DETAIL, { id: 'x' });
  await page.flush();
  assert.match(page.text(), /見つかりませんでした/);
  assert.equal(malformed.ui.calls.length, 0);
  // 審査者は、載せていない物の詳細も見られる。ただし、つなぐボタンは出ない。
  const reviewer = browser(w, 'reviewer', { config: { reviewers: ['reviewer'] } });
  const unlisted = reviewer.ui.mount(DETAIL, { id: familyId(2) });
  await unlisted.flush();
  assert.match(unlisted.text(), /この Agent は、今はつなげません。/);
  assert.equal(unlisted.find('button').length, 0);
});

void test('what the button shows for every state of a connection', () => {
  const show = (state, extra = {}) => view.noahConnectButtonView({ connection: state ? { id: 'x', state, revision: 1, error: extra.error ?? null } : null, busy: extra.busy ?? false, listed: extra.listed ?? true });
  assert.deepEqual(show(null), { label: '接続', disabled: false, action: 'connect', note: null });
  assert.deepEqual(show('disconnected'), { label: '接続', disabled: false, action: 'connect', note: null });
  assert.deepEqual(show(null, { busy: true }), { label: '準備しています…', disabled: true, action: null, note: null });
  for (const state of ['planned', 'entitling', 'preparing', 'probing']) assert.deepEqual(show(state), { label: '準備しています…', disabled: true, action: null, note: null }, state);
  assert.deepEqual(show('connected'), { label: '頼む', disabled: false, action: 'ask', note: null });
  assert.deepEqual(show('failed', { error: '相手のサーバーが応答しません。時間をおいて試してください。' }), { label: 'もう一度', disabled: false, action: 'retry', note: '相手のサーバーが応答しません。時間をおいて試してください。' });
  // 取り下げられた物・載せていない物は、ボタンを出さない。理由だけを出す。
  assert.deepEqual(show('blocked', { error: 'この Agent は、取り下げられました。使えません。' }), { label: null, disabled: true, action: null, note: 'この Agent は、取り下げられました。使えません。' });
  assert.deepEqual(show(null, { listed: false }), { label: null, disabled: true, action: null, note: 'この Agent は、今はつなげません。' });
  // 印は、必ず文字。
  assert.deepEqual(['one_click', 'taps', 'setup', 'unverified', 'blocked'].map((badge) => view.noahBadgeText({ badge, taps: 1, need: 'サインイン' })), ['1 クリック', 'あと 1 タップ（サインイン）', '準備が必要（サインイン）', 'まだ誰も動かしていない', 'つなげません']);
  assert.deepEqual([view.noahPriceText({ model: 'free' }), view.noahPriceText({ model: 'one_time', amountMinor: 3000 })], ['無料', '¥3,000']);
});

void test('the entry on the explore screen appears only for people who may see the list, and the answer is kept for ten minutes', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer(), [hostOf(2)]: mcpServer() });
  const ENTRY = 'components/noah-ready-entry.tsx';
  const links = (page) => page.find('a').map((node) => [node.props.href, page.text(node)]);
  const probes = (ui) => ui.calls.filter((call) => call.url === '/api/noah/intake?limit=0').length;
  // 開いている時。未サインインでも出る。最初の表示には、出さない（サーバーが出した HTML と同じにする）。
  const open = browser(w, null);
  const first = open.ui.mount(ENTRY);
  assert.deepEqual(links(first), []);
  await first.flush();
  // 行き先は一覧。今、並んでいる数を出す。
  assert.deepEqual(links(first), [['/noah/ready', 'すぐ使える Agentスマホだけで使えます。2 件 →']]);
  assert.equal(probes(open.ui), 1);
  // 同じ tab で開き直しても、10 分の間は、問い合わせない。
  const again = open.ui.mount(ENTRY);
  await again.tick(0);
  assert.equal(links(again).length, 1);
  assert.equal(probes(open.ui), 1);
  await again.tick(600_000);
  const later = open.ui.mount(ENTRY);
  await later.flush();
  assert.equal(probes(open.ui), 2);
  // 閉じている間、審査者でない人には、出ない（何も出さない）。審査者には、出る。
  const closed = browser(w, 'owner-a', { config: { env: {} } });
  const hidden = closed.ui.mount(ENTRY);
  await hidden.flush();
  assert.deepEqual([links(hidden), hidden.text()], [[], '']);
  const reviewer = browser(w, 'reviewer', { config: { env: {}, reviewers: ['reviewer'] } });
  const shown = reviewer.ui.mount(ENTRY);
  await shown.flush();
  assert.equal(links(shown).length, 1);
  // 開いていても、並んでいる物が無い時は、出さない（押した先が、空の一覧にならない）。
  const empty = await world(t, {});
  const nothing = browser(empty, null);
  const blank = nothing.ui.mount(ENTRY);
  await blank.flush();
  assert.deepEqual([links(blank), probes(nothing.ui)], [[], 1]);
  // 読めない控え・形の違う控えは、使わずに、問い合わせ直す。
  const broken = browser(w, null, { storage: { 'noah-ready-open': '{"at":"now","open":"yes"}' } });
  const retried = broken.ui.mount(ENTRY);
  await retried.flush();
  assert.deepEqual([links(retried).length, probes(broken.ui)], [1, 1]);
  // 外枠の menu（Codex の file）は、変えていない: 行は 4 つのまま。
  const shell = open.ui.mount('components/noah-shell.tsx', { mode: 'public', children: null });
  await shell.flush();
  assert.deepEqual(shell.find('nav').slice(0, 1).flatMap((nav) => shell.nodes(nav).filter((node) => node.type === 'a').map((node) => node.props['aria-label'])), ['タイムライン', 'Agentを探す', '実行中', '成果データ']);
});

// ---------------------------------------------------------------------------
// 画面の決まり（docs/noah/spec-90-phone-only-loop.md の 4 章）。一周の、どの段の画面でも守られている事。
//
// 4 章の表の行と、その試験がある所:
// - 1 枚のカードに、主ボタンは 1 つ／印・動く所・料金が、文字で出る／出どころが出る … この file の最初の試験（the list: …）
// - 送り先が、接続の前と、頼む欄に出る … この file の「the detail screen: where the input goes …」と、tests/noah-ask-ui.test.mjs の「choosing a tool: …」
// - 確かめ（最初の「頼む」が、送らない） … tests/noah-ask-ui.test.mjs の「a tool that may change something …」
// - 読み直し（終わっていない依頼がある間だけ） … tests/noah-ask-ui.test.mjs の「the work list: …」。画面が裏の間は読まない事は、下の試験
// - 進行で画面を塞がない／提供者の文を、HTML として出さない／画面に出さない言葉／「提携」「公認」の語が無い … 下の試験（一周の、全部の段で見る）
// ---------------------------------------------------------------------------

void test('the rules of the screens hold at every step of the loop: nothing covers the screen, provider text stays text, no internal words, no claim of partnership', async (t) => {
  // 提供者の文（名前・説明・道具の説明・欄の説明・成果）に、HTML を入れておく。
  const TRAP = '<script>alert(1)</script><img src=x onerror=alert(2)><b>bold</b>';
  const lookup = tool('lookup', true, { description: `Looks up a player. ${TRAP}`, inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', description: `Name to find ${TRAP}` } } } });
  const note = tool('send_note', null, { description: `Sends a note. ${TRAP}`, inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } });
  const hold = {};
  const server = mcpServer({ tools: [lookup, tool('stats'), note], call: (params) => ({ content: [{ type: 'text', text: `found ${String(params.arguments.query ?? params.arguments.text ?? '')} ${TRAP}` }] }),
    before: async (body) => { const stop = body?.method === 'tools/call' ? hold.call : null; if (stop) { stop.reached(); await stop.opened; } } });
  const w = await world(t, { [hostOf(1)]: server }, { records: [entry(1, { title: `Agent ${TRAP}`, description: `Finds players. ${TRAP}`, websiteUrl: 'https://provider.example.org/about' })] });
  const waiting = [], doc = { hidden: false };
  const session = { user: null };
  const ui = screen({ fetch: w.browser(session, { waitUntil: (work) => { waiting.push(work); } }), modules: MODULES, now: w.f.time(), document: doc });

  // 部品の file に、HTML をそのまま差し込む書き方・画面を覆う部品が無い。
  for (const name of ['noah-ready', 'noah-ready-detail', 'noah-card', 'noah-connect-button', 'noah-ask', 'noah-work-list']) {
    const source = readFileSync(new URL(`../components/${name}.tsx`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML|<dialog|aria-modal|showModal|createPortal/, name);
  }

  const INTERNAL = ['MCP', 'OAuth', 'token', 'runner', 'lease', 'container', 'hash', 'JSON'];
  const seen = [];
  /** その時の画面が、決まりを守っている事。stage は、失敗した時に、どの段かを言うための名前。 */
  const rules = (page, stage) => {
    seen.push(stage);
    const nodes = page.nodes(), text = page.text();
    // 提供者の文は、字のまま出る（要素にならない）。
    assert.deepEqual(nodes.filter((node) => ['script', 'iframe', 'object', 'embed', 'style', 'b'].includes(node.type)).map((node) => node.type), [], stage);
    assert.equal(nodes.some((node) => node.type === 'img' && node.props.src === 'x'), false, stage);
    assert.equal(nodes.some((node) => 'dangerouslySetInnerHTML' in node.props || Object.keys(node.props).some((key) => /^on(?:error|load)$/i.test(key))), false, stage);
    // 進行で、画面を塞がない（重ねて出す部品・全画面を覆う部品が無い。進行は、ボタンの文と、一覧の行だけ）。
    assert.deepEqual(nodes.filter((node) => node.type === 'dialog' || node.props['aria-modal'] !== undefined || ['dialog', 'alertdialog'].includes(node.props.role)
      || /overlay|modal|backdrop|fullscreen|scrim|spinner/i.test(String(node.props.className ?? ''))).map((node) => [node.type, node.props.className]), [], stage);
    // 画面に出さない言葉（Noah の文に無い事。出どころの名前「Official MCP Registry」は、固有の名前なので除く。提供者の文は、この試験では、その言葉を持たない）。
    const own = text.replaceAll('Official MCP Registry', '');
    for (const word of INTERNAL) assert.doesNotMatch(own, new RegExp(`(?<![A-Za-z])${word}(?![A-Za-z])`, 'i'), `${stage}: ${word}`);
    // 台帳の運営と、関係があるように書かない。
    for (const word of ['提携', '公認', '公式パートナー', 'パートナー']) assert.equal(text.includes(word), false, `${stage}: ${word}`);
  };
  const asksRead = () => ui.calls.filter((call) => call.method === 'GET' && call.url.startsWith('/api/noah/ask?')).length;

  // --- 一覧（未サインイン）---
  const listPage = ui.mount(LIST);
  await listPage.flush();
  rules(listPage, '一覧');
  assert.ok(listPage.text().includes(`Agent ${TRAP}`), '提供者の文は、字のまま');
  assert.match(listPage.text(), /出どころ: Official MCP Registry。Noah が作った物ではありません。説明は、提供者が書いた文のままです。/);

  // --- 詳細（接続の前）---
  session.user = 'owner-a';
  const page = ui.mount(DETAIL, { id: familyId(1) });
  await page.flush();
  rules(page, '詳細（接続の前）');
  assert.ok(page.text().includes(`Finds players. ${TRAP}`));

  // --- 接続した後（道具の一覧）---
  await page.click('接続');
  rules(page, '道具の一覧');
  const toolButton = (name) => page.find('button').find((node) => node.props.className === 'toolButton' && page.text(page.nodes(node).find((child) => child.type === 'strong')) === name);
  const form = () => page.find('form')[0];
  const input = () => page.nodes(form()).find((node) => ['textarea', 'input'].includes(node.type));

  // --- 入力欄 ---
  await page.press(toolButton('lookup'));
  rules(page, '入力欄');
  assert.ok(page.text(form()).includes(`Name to find ${TRAP}`));

  // --- 頼んだ直後（相手が、まだ返していない）---
  let open, reached;
  hold.call = { opened: new Promise((resolve) => { open = resolve; }), arrived: new Promise((resolve) => { reached = resolve; }), reached: () => reached() };
  await page.change(input(), 'cobalt');
  await page.submit(form());
  await hold.call.arrived;
  await page.tick(1000);
  rules(page, '進んでいる間');
  assert.match(page.text(), /進んでいます/);
  // 進んでいる間も、他の物を押せる（別の道具を選べる。「切る」も押せる）。
  assert.equal(page.find('button').some((node) => page.text(node) === '切る' && !node.props.disabled), true);

  // 読み直し: 終わっていない依頼がある間は、読む。画面が裏の間は、読まない。戻ると、また読む。
  const visible = asksRead();
  await page.tick(3000);
  assert.ok(asksRead() > visible, '表の間は、読み直す');
  doc.hidden = true;
  const hiddenAt = asksRead();
  await page.tick(10_000);
  assert.equal(asksRead(), hiddenAt, '裏の間は、読まない');
  doc.hidden = false;
  await page.tick(3000);
  assert.ok(asksRead() > hiddenAt, '戻ると、読む');

  // --- 成果が出た後 ---
  delete hold.call;
  open();
  for (let seenWork = -1; seenWork !== waiting.length;) { seenWork = waiting.length; await Promise.all(waiting); }
  await page.tick(3000);
  rules(page, '成果');
  assert.ok(page.text().includes(`found cobalt ${TRAP}`), '成果も、字のまま');
  assert.match(page.text(), new RegExp(`${hostOf(1).replaceAll('.', '\\.')} の lookup が返した内容です。`));

  // 読み直し: 終わっていない依頼が無くなったら、定期の読み直しを置かない（1 分進めても、何も読まない）。
  const settled = ui.calls.length;
  await page.tick(60_000);
  assert.equal(ui.calls.length, settled);

  // --- 確かめ（送る前に、入力を見せる）---
  await page.press(toolButton('send_note'));
  await page.change(input(), 'hello');
  await page.submit(form());
  rules(page, '確かめ');
  assert.equal(ui.calls.filter((call) => call.method === 'POST' && call.url === '/api/noah/ask').length, 1, '確かめの前は、送らない');

  // --- 切った後 ---（受け取った成果は、「仕事」に残る。開き直しても、ある）
  await page.click('切る');
  rules(page, '切った後');
  assert.equal(w.rows()[0].state, 'disconnected');
  assert.deepEqual(page.find('button').filter((node) => page.text(node) === '接続').length, 1);
  assert.ok(page.text().includes(`found cobalt ${TRAP}`), '切っても、成果は残る');
  const reopened = ui.mount(DETAIL, { id: familyId(1) });
  await reopened.flush();
  rules(reopened, '切った後に開き直す');
  assert.ok(reopened.text().includes(`found cobalt ${TRAP}`));
  assert.match(reopened.text(), /仕事/);
  assert.deepEqual(seen, ['一覧', '詳細（接続の前）', '道具の一覧', '入力欄', '進んでいる間', '成果', '確かめ', '切った後', '切った後に開き直す']);
});
