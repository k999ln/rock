// 長いので切られた成果（truncated）でも、最後まで届いた項目は一覧で見せる。途中で切れた項目は作らない。
// 本番（2026-11-22、公開 200）で、Tipline の「一覧を見る」は 429 件・130,952 文字の JSON を返し、保存の上限で切られた。
// 切られた JSON は読めないため、成果の画面は「成果の一部を表示しています」だけになり、項目が 1 つも出なかった。
import test from 'node:test';
import assert from 'node:assert/strict';
import { noahResultText } from '../lib/noah-form.ts';
import { noahPartialJsonList, noahResultPresentation } from '../lib/noah-result-presentation.ts';
import * as askView from '../lib/noah-ask-view.ts';
import { screen } from './fixtures/noah/screen.mjs';

const clipped = (text) => ({ text, truncated: true, attachments: 0 });
const entry = (i) => ({ id: `e${i}`, type: 'activity', title: `Entry ${i}`, summary: `Summary ${i} with "quotes", [brackets] and {braces}.`, spoiler: false, url: `https://example.com/gta-6/${i}` });

void test('a provider list clipped by the size limit shows every whole entry, unchanged and in order', () => {
  const entries = Array.from({ length: 429 }, (_, i) => entry(i));
  const result = noahResultText({ content: null, blocks: [{ type: 'text', text: JSON.stringify({ count: 429, entries }) }] }, 4096);
  assert.equal(result.truncated, true);
  assert.match(result.text, /（長いので切りました）$/);
  const view = noahResultPresentation(result);
  assert.equal(view.kind, 'list');
  assert.ok(view.count > 0 && view.count < 429, `recovered ${view.count}`);
  assert.deepEqual(noahPartialJsonList(result.text), entries.slice(0, view.count));
  assert.deepEqual(view.cards[0], { title: 'Entry 0', text: 'Summary 0 with "quotes", [brackets] and {braces}.', href: 'https://example.com/gta-6/0' });
  assert.equal(view.cards.at(-1).title, `Entry ${view.count - 1}`);
});

void test('the entry that was cut in the middle is dropped, never completed', () => {
  assert.deepEqual(noahPartialJsonList('{"entries":[{"title":"A"},{"title":"B"},{"title":"Cu'), [{ title: 'A' }, { title: 'B' }]);
  assert.deepEqual(noahPartialJsonList('[{"title":"A"},{"title":"B"},{"tit'), [{ title: 'A' }, { title: 'B' }]);
  assert.equal(noahPartialJsonList('{"entries":[{"title":"Cut'), null);
});

void test('a number or word at the cut point is not trusted, because "3" may have been "35"', () => {
  assert.deepEqual(noahPartialJsonList('[1, 2, 3'), [1, 2]);
  assert.deepEqual(noahPartialJsonList('[1, 2, 3\n（長いので切りました）'), [1, 2]);
  assert.deepEqual(noahPartialJsonList('[true, false, nul'), [true, false]);
});

void test('quotes, brackets and escapes inside strings do not end an entry early', () => {
  const text = '{"entries":[{"title":"a \\"]}\\" b"},{"title":"c\\\\"},{"ti';
  assert.deepEqual(noahPartialJsonList(text), [{ title: 'a "]}" b' }, { title: 'c\\' }]);
});

void test('the known list key wins over other arrays; otherwise the array the text ran out in is used', () => {
  assert.deepEqual(noahPartialJsonList('{"tags":["x","y"],"entries":[{"title":"A"},{"t'), [{ title: 'A' }]);
  assert.deepEqual(noahPartialJsonList('{"tags":["x"],"guide":[{"title":"A"},{"title":"B"},{"t'), [{ title: 'A' }, { title: 'B' }]);
  assert.deepEqual(noahPartialJsonList('{"note":"no list here","more":"cut'), null);
});

void test('only clipped results are recovered; a broken reply that was not clipped stays raw data', () => {
  const broken = noahResultPresentation({ text: '{"entries":[{"title":"A"},', truncated: false, attachments: 0 });
  assert.equal(broken.kind, 'data');
  assert.equal(broken.summary, '詳細を開いて内容を確認できます');
  const cut = noahResultPresentation(clipped('{"entries":[{"title":"A"},'));
  assert.equal(cut.kind, 'list');
  assert.deepEqual(cut.cards.map((c) => c.title), ['A']);
});

void test('the result screen lists the whole entries, says it is partial, and still offers the original data', async () => {
  const result = clipped('{"count":429,"entries":[{"title":"Airboating","summary":"Water","url":"https://example.com/a"},{"title":"Basketball","summary":"Hoops"},{"title":"Cu');
  const page = screen({ modules: { '@/lib/noah-ask-view': askView } }).mount('components/noah-result-content.tsx', { id: 'r', result });
  await page.flush();
  const text = page.text();
  assert.match(text, /届いた一覧/);
  const items = page.find('li').map((li) => page.text(li));
  assert.equal(items.length, 2);
  assert.match(items[0], /Airboating/);
  assert.match(items[1], /Basketball/);
  assert.match(text, /成果の一部を表示しています/);
  assert.match(page.text(page.find('pre')[0]), /"count":429/);
});
