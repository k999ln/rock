// Agent の詳細の、見ただけでやる事がわかる部分（lib/noah-detail-plain.ts・components/noah-detail-plain.tsx）。
// 本人 2026-11-28「ちゃんとした大手のサイトみたいに見ただけで特に説明なくともやることがわかるような UIUX にして」。
// 上から: 名前と「接続」→ 押すと何が起きるか → 札 → 詳細 → こんな事を頼めます → 使い方 → 安全のために → 操作の流れと道具 → Agentの詳細。
import test from 'node:test';
import assert from 'node:assert/strict';
import { noahDetailActionNote, noahPlainNeeds, noahPlainToolName, noahPlainUses } from '../lib/noah-detail-plain.ts';
import { renderNoahExplanationFixture } from './fixtures/noah/explanation-markup.mjs';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

void test('要る情報は型を外し、任意の物だけ「（任意）」を残す。道具の名前は読める形に。日本語の札はそのまま', () => {
  assert.deepEqual(noahPlainNeeds(['zip（文字）', 'service（文字・任意）', 'window（数）', 'type（任意）', 'flag']), ['zip', 'service（任意）', 'window', 'type（任意）', 'flag']);
  assert.deepEqual(noahPlainNeeds(), []);
  assert.equal(noahPlainToolName('find_pros'), 'find pros');
  assert.equal(noahPlainToolName('get-market.summary'), 'get market summary');
  assert.equal(noahPlainToolName('近くの業者を探す'), '近くの業者を探す');
});

void test('並べるのは道具の工程だけ。道具が無い時は空（説明は上の「詳細」にあるので繰り返さない）', () => {
  const steps = [
    { id: 'connect:open', kind: 'tap', label: '接続' },
    { id: 'tool:0', kind: 'auto', label: 'find_pros', note: 'Find pros.', flow: { inputs: ['zip（文字）'] } },
    { id: 'tool:1', kind: 'auto', label: 'book_visit' },
  ];
  assert.deepEqual(noahPlainUses(steps), [
    { key: 'tool:0', name: 'find pros', text: 'Find pros.', needs: ['zip'] },
    { key: 'tool:1', name: 'book visit', text: '', needs: [] },
  ]);
  assert.deepEqual(noahPlainUses([{ id: 'connect:open', kind: 'tap', label: '接続' }]), []);
  assert.deepEqual(noahPlainUses(), []);
});

void test('「接続」を押すと何が起きるかの 1 行', () => {
  const note = (over) => noahDetailActionNote({ signedIn: true, connected: false, typed: 0, need: null, ...over });
  assert.equal(note({ connected: true }), 'つながっています。やる事を選んで頼めます。');
  assert.equal(note({ signedIn: false }), '押すと、利用開始の画面に進みます。パスキーで始められます。');
  assert.equal(note({ typed: 1 }), '押すと、つなぐ前に要る入力の欄が開きます。');
  assert.equal(note({ need: '許可' }), '押すと、相手の許可の画面に進みます。');
  assert.equal(note({ need: 'サインイン' }), '押すと、すぐにつながります。');
  assert.equal(note(), '押すと、すぐにつながります。');
});

void test('画面: 道具のある Agent は、接続 → 押した後の事 → 札 → こんな事を頼めます → 使い方 → 安全 → 操作の流れと道具 の順', async () => {
  const body = text(await renderNoahExplanationFixture('chain'));
  const at = (needle) => { const index = body.indexOf(needle); assert.ok(index >= 0, needle); return index; };
  // 道具の並びは工程の段の順（clean → check と、並行の summarize）。ここでは「こんな事を頼めます」と「使い方」の間にある事だけを見る。
  for (const tool of ['check csv', 'clean csv', 'summarize notes']) assert.ok(at(tool) > at('こんな事を頼めます') && at(tool) < at('使い方'), tool);
  const order = ['接続', '押すと、すぐにつながります。', '詳細', 'こんな事を頼めます', '使い方', '「接続」を押す', 'すぐにつながります。', '安全のために',
    '入力は agent.example.test へ送られます。Noah が送るのは、あなたが入力した内容だけです。', 'Noah が作った物ではありません（提供: UI fixture）。', 'つないだ後も、いつでもやめられます。', 'この Agent でできる事', 'Agentの詳細'];
  // 前の物より後ろで、順に見つかる事（同じ文が先に出ていても、その後ろから探す）。
  order.reduce((previous, needle) => { const index = body.indexOf(needle, previous + 1); assert.ok(index > previous, `${needle} の位置`); return index; }, -1);
  assert.doesNotMatch(body, /「切る」/, '接続の前に「切る」の文は出さない');
});

void test('画面: サインインしていない人には、利用開始とパスキーを先に伝える。道具の工程が無い Agent には「こんな事を頼めます」を出さない', async () => {
  const single = text(await renderNoahExplanationFixture('single'));
  assert.match(single, /押すと、利用開始の画面に進みます。パスキーで始められます。/);
  assert.match(single, /初めての時は、パスキーで登録します。/);
  const absent = text(await renderNoahExplanationFixture('single', { noLabels: true }));
  assert.doesNotMatch(absent, /こんな事を頼めます/);
  assert.match(absent, /使い方.*安全のために/);
});

void test('画面: 英語でも同じ並び（訳がある）', async () => {
  const english = text(await renderNoahExplanationFixture('chain', { locale: 'en' }));
  assert.match(english, /Pressing it connects right away\..*What you can ask for.*How to use it.*Your safety.*Not made by Noah \(provided by UI fixture\)\./);
});
