// ピンの場面の絵（spec-115 の 9 章）の試験: 形の確かめ（型・札・部品・種類・余計な項目）・棚の 17 枚の絵（形が通る・札はカードの文にある言葉だけ）・
// 全部の型が描ける（札が絵に出る・数が壊れない・高さが型の通り）・Luna Max が書く 1 枚（題・入れる物・返る物・絵）の確かめ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
import { NOAH_PIN_KEEP_OUT, NOAH_PIN_LABEL_MAX, NOAH_PIN_PARTS, NOAH_PIN_TEMPLATES, NOAH_PIN_WORD_MAX, noahPinLabelWidth, noahPinTemplateGuide, parseNoahPin, parseNoahPinScene } from '../lib/noah-pin-scene.ts';
import { NOAH_SHELF_SCENE_SOURCE, NOAH_SHELF_SCENES } from '../lib/noah-pin-scenes-shelf.ts';
import * as sceneLib from '../lib/noah-pin-scene.ts';

const require = createRequire(import.meta.url);
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
/** components/noah-pin-scene.tsx を、本物の React で描けるように読み込む（画面の試験の台と同じく、TypeScript を CommonJS に直す）。 */
function loadArt() {
  const code = ts.transpileModule(readFileSync(new URL('../components/noah-pin-scene.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const unit = { exports: {} };
  // CSS の部品は、画面の試験の台と同じく、組の名前をそのまま返す（className に「m pop」のように出る）。
  const local = (id) => (id === '@/lib/noah-pin-scene' ? sceneLib : id.endsWith('.module.css') ? { default: new Proxy({}, { get: (_, name) => String(name) }) } : require(id));
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

void test('every template acts out its job once: a moving part, a still picture by default, and only light properties animate', () => {
  const motion = readFileSync(new URL('../components/noah-pin-scene.module.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../components/noah-pin-scene.tsx', import.meta.url), 'utf8');
  const sample = (template, spec, variant) => ({ template, labels: Array.from({ length: spec.labels }, (_, i) => `札${i + 1}`), parts: (spec.parts ?? []).map((choices) => choices[0]), variant });
  for (const [template, spec] of Object.entries(NOAH_PIN_TEMPLATES)) {
    for (const variant of spec.variants ?? [null]) {
      const svg = draw(sample(template, spec, variant));
      // 動く部分が 1 つ以上ある（その型の仕事を演じる）。
      assert.match(svg, /class="m (pop|rise|slide|draw|grow|drop|scan|arc|pull)"/, `${template}/${variant}: 動く部分が無い`);
      // サーバーで描いた絵は止まった絵（data-motion は、画面に入るのを待つ時に、画面の側で付ける）。
      assert.ok(!svg.includes('data-motion'), `${template}/${variant}: 初めから動く印がある`);
      assert.match(svg, /^<svg class="art"/);
    }
  }
  // 線を描く動きで囲む線には、長さ 1 の印がある（無いと点線になる）。
  for (const svg of Object.entries(NOAH_PIN_TEMPLATES).map(([template, spec]) => draw(sample(template, spec, spec.variants?.[0] ?? null)))) {
    for (const [, inner] of svg.matchAll(/<g class="m draw"[^>]*>(<[^>]+>)/g)) assert.match(inner, /pathLength="1"/, inner);
  }
  // 使った動き方は、全部 CSS にある。キーフレームで動かすのは、形（transform）・透明度・線の描き足しだけ（重い描き直しを起こさない）。
  for (const [, kind] of source.matchAll(/k="(\w+)"/g)) assert.match(motion, new RegExp(`\\.art\\[data-motion\\] \\.${kind} \\{[^}]*animation-name: \\w+`), kind);
  const frames = [...motion.matchAll(/@keyframes \w+ \{(.*)\}\n/g)].map(([, body]) => body);
  assert.ok(frames.length >= 9);
  for (const body of frames) for (const [, property] of body.matchAll(/([a-z-]+):/g)) assert.ok(['opacity', 'transform', 'stroke-dashoffset'].includes(property), property);
  // 動きを減らす設定の人には動かさない。
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\) \{ \.m \{ animation: none !important; \} \}/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});

void test('no word is drawn under the save button (top right), even with the longest labels', () => {
  const decode = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
  const longest = (template, index) => 'あ'.repeat((template === 'speak' || template === 'word') && index === 0 ? NOAH_PIN_WORD_MAX : NOAH_PIN_LABEL_MAX);
  for (const [template, spec] of Object.entries(NOAH_PIN_TEMPLATES)) {
    for (const variant of spec.variants ?? [null]) {
      for (const labels of [Array.from({ length: spec.labels }, (_, i) => `札${i + 1}`), Array.from({ length: spec.labels }, (_, i) => longest(template, i))]) {
        const svg = draw({ template, labels, parts: (spec.parts ?? []).map((choices) => choices[0]), variant });
        for (const [, attrs, content] of svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)) {
          const number = (name) => Number(new RegExp(`${name}="([^"]+)"`).exec(attrs)?.[1]);
          const x = number('x'), y = number('y'), size = number('font-size'), width = noahPinLabelWidth(decode(content)) * size;
          const right = /text-anchor="middle"/.test(attrs) ? x + width / 2 : x + width, top = y - size * 0.9;
          assert.ok(!(right > NOAH_PIN_KEEP_OUT.x && top < NOAH_PIN_KEEP_OUT.y), `${template}/${variant}: 「${decode(content)}」が保存のボタンの下（右 ${right.toFixed(0)}・上 ${top.toFixed(0)}）`);
        }
      }
    }
  }
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
