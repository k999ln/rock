// ピンの場面の絵（spec-115 の 9 章）の試験: 形の確かめ（型・札・部品・種類・余計な項目）・棚の 17 枚の絵（形が通る・札はカードの文にある言葉だけ）・
// 全部の型が描ける（札が絵に出る・数が壊れない・高さが型の通り）・Luna Max が書く 1 枚（題・入れる物・返る物・絵）の確かめ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
import { NOAH_PIN_PARTS, NOAH_PIN_TEMPLATES, noahPinTemplateGuide, parseNoahPin, parseNoahPinScene } from '../lib/noah-pin-scene.ts';
import { NOAH_SHELF_SCENE_SOURCE, NOAH_SHELF_SCENES } from '../lib/noah-pin-scenes-shelf.ts';
import * as sceneLib from '../lib/noah-pin-scene.ts';

const require = createRequire(import.meta.url);
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
/** components/noah-pin-scene.tsx を、本物の React で描けるように読み込む（画面の試験の台と同じく、TypeScript を CommonJS に直す）。 */
function loadArt() {
  const code = ts.transpileModule(readFileSync(new URL('../components/noah-pin-scene.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const unit = { exports: {} };
  const local = (id) => (id === '@/lib/noah-pin-scene' ? sceneLib : require(id));
  runInThisContext(`(function (exports, require, module) {${code}\n})`)(unit.exports, local, unit);
  return unit.exports.default;
}
const Art = loadArt();
const draw = (scene) => renderToStaticMarkup(React.createElement(Art, { scene }));
const cards = JSON.parse(readFileSync(new URL('../data/noah-shelf-first-cards.json', import.meta.url), 'utf8'));

void test('the scene shape is checked: template, exact label count, short labels, parts, variants, no extra keys', () => {
  const ok = { template: 'transform', parts: ['receipt', 'ledger'], labels: ['カフェ代', '勘定科目'] };
  assert.deepEqual(parseNoahPinScene(ok).scene, { ...ok, variant: null });
  const bad = [
    [{ ...ok, template: 'poster' }, 'template'],
    [{ ...ok, labels: ['カフェ代'] }, 'labels_count'],
    [{ ...ok, labels: ['カフェ代', 'とても長い札の言葉です'] }, 'label_long:1'],
    [{ ...ok, labels: ['カフェ代', ' 勘定 '] }, 'label:1'],
    [{ ...ok, labels: ['カフェ代', '<b>x</b>'] }, 'label:1'],
    [{ ...ok, labels: ['カフェ\n代', '勘定科目'] }, 'label:0'],
    [{ ...ok, parts: ['receipt', 'rocket'] }, 'part:1'],
    [{ ...ok, parts: ['receipt'] }, 'parts_count'],
    [{ ...ok, variant: 'ok' }, 'variant'],
    [{ template: 'inspect', parts: ['document'], labels: ['請求書', '番号', '結果'] }, 'variant'],
    [{ ...ok, x: 10 }, 'unknown_key:x'],
    [null, 'not_object'],
    [[ok], 'not_object'],
  ];
  for (const [value, error] of bad) assert.equal(parseNoahPinScene(value).error, error, JSON.stringify(value));
  // 吹き出しと単語の言葉だけ、少し長くてよい。
  assert.ok(parseNoahPinScene({ template: 'speak', labels: ['comfortable', '音節と強勢'] }).scene);
  assert.equal(parseNoahPinScene({ template: 'speak', labels: ['音節と強勢', 'comfortable!!!!'] }).error, 'label_long:1');
});

void test('the 17 shelf cards each have a valid scene whose labels are words from the card itself', () => {
  assert.deepEqual(Object.keys(NOAH_SHELF_SCENE_SOURCE).sort(), cards.map((card) => card.id).sort());
  assert.equal(Object.keys(NOAH_SHELF_SCENES).length, cards.length);
  for (const card of cards) {
    const { scene, error } = parseNoahPinScene(NOAH_SHELF_SCENE_SOURCE[card.id]);
    assert.ok(scene, `${card.id}: ${error}`);
    const text = [card.title, card.promise, card.give, card.get].join(' ');
    for (const label of scene.labels) assert.ok(text.includes(label), `${card.id}: 「${label}」がカードの文に無い`);
  }
  // 17 枚で、型が偏らない（同じ型は 2 枚まで）。
  const counts = Object.values(NOAH_SHELF_SCENES).reduce((map, scene) => map.set(scene.template, (map.get(scene.template) ?? 0) + 1), new Map());
  for (const [template, count] of counts) assert.ok(count <= 2, `${template} が ${count} 枚`);
});

void test('every template draws: labels appear, numbers never break, and the height follows the template', () => {
  const sample = (template, spec) => ({ template, labels: Array.from({ length: spec.labels }, (_, i) => `札${i + 1}`), parts: (spec.parts ?? []).map((choices) => choices[0]), variant: spec.variants?.[0] ?? null });
  for (const [template, spec] of Object.entries(NOAH_PIN_TEMPLATES)) {
    for (const variant of spec.variants ?? [null]) {
      for (const pick of [0, -1]) {
        const scene = { ...sample(template, spec), variant, parts: (spec.parts ?? []).map((choices) => choices.at(pick)) };
        assert.ok(parseNoahPinScene(scene).scene, `${template} の見本が形に合わない`);
        const svg = draw(scene);
        assert.match(svg, new RegExp(`viewBox="0 0 300 ${spec.height}"`), template);
        assert.ok(!/NaN|undefined|Infinity/.test(svg), `${template}/${variant}: 壊れた数`);
        for (const label of scene.labels) assert.ok(svg.includes(label), `${template}/${variant}: 「${label}」が描かれていない`);
        assert.match(svg, /aria-hidden="true"/);
      }
    }
  }
  // 入れる → 返る の部品は、全部が何かを描く（部屋・矢印・札の 9 個の形に、部品 1 つにつき 2 個以上の形が足される）。
  for (const part of NOAH_PIN_PARTS) {
    const svg = draw({ template: 'transform', labels: ['入れる', '返る'], parts: [part, part], variant: null });
    assert.ok((svg.match(/<(rect|path|circle|ellipse|polygon|line|text)\b/g) ?? []).length >= 9 + 2 * 2, `${part} が描かれていない`);
  }
  for (const scene of Object.values(NOAH_SHELF_SCENES)) assert.ok(!/NaN|undefined/.test(draw(scene)));
});

void test('the guide for Luna Max lists every template with its parts and variants', () => {
  const guide = noahPinTemplateGuide();
  for (const [template, spec] of Object.entries(NOAH_PIN_TEMPLATES)) {
    assert.ok(guide.includes(`- ${template}:`), template);
    for (const variant of spec.variants ?? []) assert.ok(guide.includes(variant), `${template}/${variant}`);
  }
});

void test('one pin written by Luna Max is checked: title, give, get and the scene', () => {
  const pin = { title: '経費の勘定科目と仕訳を決める', give: '取引の内容', get: '勘定科目と仕訳の例', scene: NOAH_SHELF_SCENE_SOURCE['pkg:keihi-kamoku'] };
  assert.equal(parseNoahPin(pin).error, null);
  assert.equal(parseNoahPin({ ...pin, title: '' }).error, 'title');
  assert.equal(parseNoahPin({ ...pin, title: 'あ'.repeat(21) }).error, 'title_long');
  assert.equal(parseNoahPin({ ...pin, get: 'い'.repeat(31) }).error, 'get_long');
  assert.equal(parseNoahPin({ ...pin, scene: { template: 'poster' } }).error, 'scene:template');
  assert.equal(parseNoahPin({ ...pin, score: 1 }).error, 'unknown_key:score');
});
