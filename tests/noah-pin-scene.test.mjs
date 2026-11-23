// ピンの図解（バージョン TAKE。spec-115 の 9 章）の試験: 形の確かめ（図の名前・札の数・図ごとの字の上限・余計な項目）・棚の 17 枚（形が通る・札はカードの文にある言葉だけ・同じ図は 2 枚まで）・
// 全部の図が描ける（札が絵に出る・数が壊れない・高さが図の通り・字が絵の外へはみ出さない）・動き（全部の図に動く部分・止まった絵が既定・軽い物だけ動く）・
// 保存のボタンの下に字が無い・Luna Max への説明・Luna Max が書く 1 枚（題・入れる物・返る物・図解）の確かめ。
// バージョン 1（場面の絵）の試験は、ブランチ claude/noah-pins-version-1 にある。図の作りが変わったので、同じ事を TAKE の図で確かめ直した（弱めた確かめは無い。はみ出しの確かめを足した）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
import { NOAH_PIN_KEEP_OUT, NOAH_PIN_LABEL_MAX, NOAH_PIN_TEMPLATES, noahPinLabelWidth, noahPinTemplateGuide, parseNoahPin, parseNoahPinScene } from '../lib/noah-pin-scene.ts';
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
const TEMPLATES = Object.entries(NOAH_PIN_TEMPLATES);
/** 短い札と、図ごとの上限いっぱいの札（全角と、英字だけの 2 通り）。 */
const shortLabels = (spec) => spec.slots.map((_, i) => `札${i + 1}`);
const longLabels = (spec) => spec.slots.map((max) => 'あ'.repeat(Math.floor(max)));
const asciiLabels = (spec) => spec.slots.map((max) => 'W'.repeat(Math.floor(max / 0.6)));
const scene = (template, labels) => ({ template, labels, parts: [], variant: null });
const decode = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
/** 描いた SVG の字の、だいたいの箱（字の幅は noahPinLabelWidth と同じ数え方。上は字の大きさの 0.9、下は 0.25）。 */
function textBoxes(svg) {
  return [...svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map(([, attrs, content]) => {
    const number = (name) => Number(new RegExp(`${name}="([^"]+)"`).exec(attrs)?.[1]);
    const x = number('x'), y = number('y'), size = number('font-size'), width = noahPinLabelWidth(decode(content)) * size;
    const anchor = /text-anchor="(\w+)"/.exec(attrs)?.[1] ?? 'start';
    const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    return { text: decode(content), left, right: left + width, top: y - size * 0.9, bottom: y + size * 0.25, size };
  });
}

void test('the scene shape is checked: diagram name, exact label count, per-diagram label limits, no parts or variants, no extra keys', () => {
  const ok = { template: 'tree', labels: ['取引の内容', '勘定科目', '仕訳の例', '税区分'] };
  assert.deepEqual(parseNoahPinScene(ok).scene, { ...ok, parts: [], variant: null });
  assert.deepEqual(parseNoahPinScene({ ...ok, parts: [], variant: null }).scene, { ...ok, parts: [], variant: null });
  const bad = [
    [{ ...ok, template: 'transform' }, 'template'],
    [{ ...ok, template: 'poster' }, 'template'],
    [{ ...ok, labels: ['取引の内容', '勘定科目', '仕訳の例'] }, 'labels_count'],
    [{ ...ok, labels: ['取引の内容です', '勘定科目', '仕訳の例', '税区分'] }, 'label_long:0'],
    [{ ...ok, labels: ['取引の内容', '勘定科目と仕訳', '仕訳の例', '税区分'] }, 'label_long:1'],
    [{ ...ok, labels: ['取引の内容', ' 勘定 ', '仕訳の例', '税区分'] }, 'label:1'],
    [{ ...ok, labels: ['取引の内容', '<b>x</b>', '仕訳の例', '税区分'] }, 'label:1'],
    [{ ...ok, labels: ['取引\nの内容', '勘定科目', '仕訳の例', '税区分'] }, 'label:0'],
    [{ ...ok, parts: ['receipt'] }, 'parts_count'],
    [{ ...ok, variant: 'ok' }, 'variant'],
    [{ ...ok, x: 10 }, 'unknown_key:x'],
    [null, 'not_object'],
    [[ok], 'not_object'],
  ];
  for (const [value, error] of bad) assert.equal(parseNoahPinScene(value).error, error, JSON.stringify(value));
  // 英字は 0.6 字で数える（comfortable は 6.6 字。カスタマージャーニーマップの下の札は 8 字まで）。
  assert.ok(parseNoahPinScene(scene('journey', ['comfortable', '強勢'])).scene);
  assert.equal(parseNoahPinScene(scene('journey', ['uncomfortableness', '強勢'])).error, 'label_long:0');
  // 図の表: 番号はチートシートの 01〜24 が 1 つずつ。どの札の上限も、全体の上限を越えない。
  assert.deepEqual(TEMPLATES.map(([, spec]) => spec.no), Array.from({ length: 24 }, (_, i) => i + 1));
  for (const [template, spec] of TEMPLATES) for (const max of spec.slots) assert.ok(max >= 1 && max <= NOAH_PIN_LABEL_MAX, template);
});

void test('the 17 shelf cards each have a valid diagram whose labels are words from the card itself', () => {
  assert.deepEqual(Object.keys(NOAH_SHELF_SCENE_SOURCE).sort(), cards.map((card) => card.id).sort());
  assert.equal(Object.keys(NOAH_SHELF_SCENES).length, cards.length);
  for (const card of cards) {
    const { scene: parsed, error } = parseNoahPinScene(NOAH_SHELF_SCENE_SOURCE[card.id]);
    assert.ok(parsed, `${card.id}: ${error}`);
    const text = [card.title, card.promise, card.give, card.get].join(' ');
    for (const label of parsed.labels) assert.ok(text.includes(label), `${card.id}: 「${label}」がカードの文に無い`);
  }
  // 17 枚で、図が偏らない（同じ図は 2 枚まで）。
  const counts = Object.values(NOAH_SHELF_SCENES).reduce((map, item) => map.set(item.template, (map.get(item.template) ?? 0) + 1), new Map());
  for (const [template, count] of counts) assert.ok(count <= 2, `${template} が ${count} 枚`);
  assert.ok(counts.size >= 14, `図が ${counts.size} 種類しかない`);
});

void test('every diagram draws: labels appear, numbers never break, the height follows the diagram, and no word leaves the picture', () => {
  for (const [template, spec] of TEMPLATES) {
    for (const labels of [shortLabels(spec), longLabels(spec), asciiLabels(spec)]) {
      assert.ok(parseNoahPinScene(scene(template, labels)).scene, `${template} の見本が形に合わない: ${labels}`);
      const svg = draw(scene(template, labels));
      assert.match(svg, new RegExp(`viewBox="0 0 300 ${spec.height}"`), template);
      assert.ok(!/NaN|undefined|Infinity/.test(svg), `${template}: 壊れた数`);
      for (const label of labels) assert.ok(svg.includes(label), `${template}: 「${label}」が描かれていない`);
      assert.match(svg, /aria-hidden="true"/);
      // 字は絵の中に収まり、字の大きさは 19（スマホの 2 列で 11px 以上）。
      for (const box of textBoxes(svg)) {
        assert.ok(box.left >= 2 && box.right <= 298 && box.top >= 2 && box.bottom <= spec.height - 2, `${template}: 「${box.text}」がはみ出す（${box.left.toFixed(0)}〜${box.right.toFixed(0)}, ${box.top.toFixed(0)}〜${box.bottom.toFixed(0)}）`);
        assert.ok(box.size >= 19, `${template}: 「${box.text}」の字が ${box.size}`);
      }
    }
  }
  for (const item of Object.values(NOAH_SHELF_SCENES)) assert.ok(!/NaN|undefined/.test(draw(item)));
});

void test('every diagram draws itself once: a moving part, a finished picture by default, and only light properties animate', () => {
  const motion = readFileSync(new URL('../components/noah-pin-scene.module.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../components/noah-pin-scene.tsx', import.meta.url), 'utf8');
  for (const [template, spec] of TEMPLATES) {
    const svg = draw(scene(template, shortLabels(spec)));
    // 動く部分が 2 つ以上ある（図が描かれていく）。
    assert.ok((svg.match(/class="m (pop|rise|slide|slideR|fall|fade|draw|grow|growY|swing)"/g) ?? []).length >= 2, `${template}: 動く部分が足りない`);
    // サーバーで描いた絵は描き終わった図（data-motion は、画面に入るのを待つ時に、画面の側で付ける）。
    assert.ok(!svg.includes('data-motion'), `${template}: 初めから動く印がある`);
    assert.match(svg, /^<svg class="art"/);
    // 線を描く動きで囲む線には、長さ 1 の印がある（無いと点線になる）。
    for (const [, inner] of svg.matchAll(/<g class="m draw"[^>]*>(<[^>]+>)/g)) assert.match(inner, /pathLength="1"/, `${template}: ${inner}`);
    // 針の回る中心が書いてある。
    for (const [, attrs] of svg.matchAll(/<g class="m swing"([^>]*)>/g)) assert.match(attrs, /--ox:\d+px;--oy:\d+px/, template);
  }
  // 使った動き方は、全部 CSS にある。キーフレームで動かすのは、形（transform）・透明度・線の描き足しだけ（重い描き直しを起こさない）。
  for (const [, kind] of source.matchAll(/k="(\w+)"/g)) assert.match(motion, new RegExp(`\\.art\\[data-motion\\] \\.${kind} \\{[^}]*animation-name: \\w+`), kind);
  const frames = [...motion.matchAll(/@keyframes \w+ \{(.*)\}\n/g)].map(([, body]) => body);
  assert.ok(frames.length >= 10);
  for (const body of frames) for (const [, property] of body.matchAll(/([a-z-]+):/g)) assert.ok(['opacity', 'transform', 'stroke-dashoffset'].includes(property), property);
  // 1 枚の動きは 1.4 秒以内に終わる（いちばん遅い始まり + いちばん長い動き）。
  const delays = [...source.matchAll(/d=\{(\d+)\}/g)].map(([, n]) => Number(n)), durations = [...motion.matchAll(/animation-duration: \.(\d+)s/g)].map(([, n]) => Number(`0.${n}`) * 1000);
  assert.ok(Math.max(...delays) + Math.max(...durations) <= 1800 && Math.max(...delays) <= 900, `${Math.max(...delays)} + ${Math.max(...durations)}`);
  // 動きを減らす設定の人には動かさない。
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\) \{ \.m \{ animation: none !important; \} \}/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});

void test('no word is drawn under the save button (top right), even with the longest labels', () => {
  for (const [template, spec] of TEMPLATES) {
    for (const labels of [shortLabels(spec), longLabels(spec), asciiLabels(spec)]) {
      for (const box of textBoxes(draw(scene(template, labels)))) {
        assert.ok(!(box.right > NOAH_PIN_KEEP_OUT.x && box.top < NOAH_PIN_KEEP_OUT.y), `${template}: 「${box.text}」が保存のボタンの下（右 ${box.right.toFixed(0)}・上 ${box.top.toFixed(0)}）`);
      }
    }
  }
});

void test('the guide for Luna Max lists every diagram with its number, name and label limits', () => {
  const guide = noahPinTemplateGuide();
  for (const [template, spec] of TEMPLATES) {
    assert.ok(guide.includes(`- ${template}（${String(spec.no).padStart(2, '0')} ${spec.name} / ${spec.en}）:`), template);
    assert.ok(guide.includes(`札の字の上限 = [${spec.slots.join(', ')}]`), template);
  }
  assert.equal(guide.split('\n').length, 24);
});

void test('one pin written by Luna Max is checked: title, give, get and the diagram', () => {
  const pin = { title: '経費の勘定科目と仕訳を決める', give: '取引の内容', get: '勘定科目と仕訳の例', scene: NOAH_SHELF_SCENE_SOURCE['pkg:keihi-kamoku'] };
  assert.equal(parseNoahPin(pin).error, null);
  assert.equal(parseNoahPin({ ...pin, title: '' }).error, 'title');
  assert.equal(parseNoahPin({ ...pin, title: 'あ'.repeat(21) }).error, 'title_long');
  assert.equal(parseNoahPin({ ...pin, get: 'い'.repeat(31) }).error, 'get_long');
  assert.equal(parseNoahPin({ ...pin, scene: { template: 'poster' } }).error, 'scene:template');
  assert.equal(parseNoahPin({ ...pin, score: 1 }).error, 'unknown_key:score');
});
