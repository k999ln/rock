// ピンの図解（バージョン TAKE。spec-115 の 9 章）の試験: 形の確かめ（図の名前・札の数・図ごとの字の上限・余計な項目）・棚の 17 枚（形が通る・札はカードの文にある言葉だけ・同じ図は 2 枚まで）・
// 全部の図が描ける（札が 1 回ずつ絵に出る・絵の外へはみ出さない・字が小さすぎない・作り話の数が無い・壊れた数が無い）・
// 動き「ぽよん」（時刻 u の純関数・初めは札が無い・途中が動く・止める時には揺れが収まっている）・
// しょうへいさんの図解パックの許諾の表示・Luna Max への説明・Luna Max が書く 1 枚（題・入れる物・返る物・図解）の確かめ。
// 絵は canvas に描くので、node の中では、描く命令を書き留める小さな代わり（recorder）で確かめる。字の幅は noahPinLabelWidth と同じ数え方（英字 0.6・他 1）。
// 本物のブラウザでの見た目（390px と 1280px・動き）は、作った人が画面で確かめた（docs/noah/spec-115-pin-grid.md の 9 章）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
import { NOAH_PIN_LABEL_MAX, NOAH_PIN_TEMPLATES, noahPinLabelWidth, noahPinTemplateGuide, parseNoahPin, parseNoahPinScene } from '../lib/noah-pin-scene.ts';
import { NOAH_SHELF_SCENE_SOURCE, NOAH_SHELF_SCENES } from '../lib/noah-pin-scenes-shelf.ts';
import * as diagram from '../lib/noah-pin-diagram.ts';

const { drawNoahPinDiagram, noahPinHold, NOAH_PIN_ART } = diagram;
const require = createRequire(import.meta.url);
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const cards = JSON.parse(readFileSync(new URL('../data/noah-shelf-first-cards.json', import.meta.url), 'utf8'));
const TEMPLATES = Object.entries(NOAH_PIN_TEMPLATES);
/** 短い札と、図ごとの上限いっぱいの札（全角と、英字だけの 2 通り）。 */
const shortLabels = (spec) => spec.slots.map((_, i) => `札${i + 1}`);
const longLabels = (spec) => spec.slots.map((max) => 'あ'.repeat(Math.floor(max)));
const asciiLabels = (spec) => spec.slots.map((max) => 'W'.repeat(Math.floor(max / 0.6)));
const scene = (template, labels) => ({ template, labels, parts: [], variant: null });

/**
 * CanvasRenderingContext2D の代わり。描く命令を書き留め（log）、字は、置いた所を絵の座標の箱にして集める（texts）。
 * 数が壊れていたら（NaN・Infinity）、その場で投げる。変換（translate・scale・rotate）と save・restore は本物と同じに積む。
 */
function recorder() {
  const log = [], texts = [], stack = [];
  let m = [1, 0, 0, 1, 0, 0];
  const state = { font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1 };
  const px = () => Number(/(\d+(?:\.\d+)?)px/.exec(state.font)[1]);
  const note = (name, args) => {
    for (const value of args) if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${name} に壊れた数 ${value}`);
    log.push(`${name}(${args.map((value) => (typeof value === 'number' ? value.toFixed(2) : String(value))).join(',')})`);
  };
  const point = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const methods = {
    save() { stack.push([m, { ...state }]); log.push('save'); },
    restore() { const [saved, kept] = stack.pop(); m = saved; Object.assign(state, kept); log.push('restore'); },
    translate(x, y) { note('translate', [x, y]); m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    scale(x, y) { note('scale', [x, y]); m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]]; },
    rotate(a) { note('rotate', [a]); const c = Math.cos(a), s = Math.sin(a); m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, m[2] * c - m[0] * s, m[3] * c - m[1] * s, m[4], m[5]]; },
    measureText(text) { return { width: noahPinLabelWidth(text) * px() }; },
    fillText(text, x, y, max) {
      note('fillText', [text, x, y, max ?? '']);
      const size = px(), width = Math.min(noahPinLabelWidth(text) * size, max ?? Infinity);
      const left = state.textAlign === 'center' ? x - width / 2 : state.textAlign === 'right' || state.textAlign === 'end' ? x - width : x;
      const top = state.textBaseline === 'middle' ? y - size / 2 : y - size * 0.8, bottom = top + size;
      const corners = [point(left, top), point(left + width, top), point(left, bottom), point(left + width, bottom)];
      const xs = corners.map(([cx]) => cx), ys = corners.map(([, cy]) => cy);
      texts.push({ text, left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), size: size * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])), alpha: state.globalAlpha });
    },
  };
  for (const name of ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'roundRect', 'rect', 'bezierCurveTo', 'fill', 'stroke', 'clip', 'fillRect', 'clearRect', 'setLineDash']) {
    methods[name] = (...args) => note(name, args.map((value) => (Array.isArray(value) ? value.join('/') : value)));
  }
  const k = new Proxy(state, {
    get: (target, name) => methods[name] ?? target[name],
    set: (target, name, value) => { if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${String(name)} に壊れた数 ${value}`); target[name] = value; log.push(`${String(name)}=${value}`); return true; },
  });
  return { k, log, texts };
}
const drawAt = (item, u) => { const r = recorder(); drawNoahPinDiagram(r.k, item, u); return r; };

void test('the scene shape is checked: diagram name, exact label count, per-diagram label limits, no parts or variants, no extra keys', () => {
  const ok = { template: 'tree', labels: ['取引の内容', '勘定科目', '仕訳の例', '税区分'] };
  assert.deepEqual(parseNoahPinScene(ok).scene, { ...ok, parts: [], variant: null });
  assert.deepEqual(parseNoahPinScene({ ...ok, parts: [], variant: null }).scene, { ...ok, parts: [], variant: null });
  const bad = [
    [{ ...ok, template: 'transform' }, 'template'],
    [{ ...ok, template: 'poster' }, 'template'],
    [{ ...ok, labels: ['取引の内容', '勘定科目', '仕訳の例'] }, 'labels_count'],
    [{ ...ok, labels: ['取引の内容ですよね', '勘定科目', '仕訳の例', '税区分'] }, 'label_long:0'],
    [{ ...ok, labels: ['取引の内容', '勘定科目と仕訳の例です', '仕訳の例', '税区分'] }, 'label_long:1'],
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
  // 英字は 0.6 字で数える（comfortable は 6.6 字。マインドマップの真ん中は 8 字まで）。
  assert.ok(parseNoahPinScene(scene('mindmap', ['comfortable', '発音記号', '音節', '強勢', 'こつ'])).scene);
  assert.equal(parseNoahPinScene(scene('mindmap', ['uncomfortableness', '発音記号', '音節', '強勢', 'こつ'])).error, 'label_long:0');
  // 図の表: 番号は元のパックの 01〜24 が 1 つずつ。どの札の上限も、全体の上限を越えない。
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

void test('every finished diagram shows each label once, inside the picture, at a readable size, with no made-up numbers', () => {
  const { width: W, height: H } = NOAH_PIN_ART;
  const sets = (spec) => [shortLabels(spec), longLabels(spec), asciiLabels(spec)];
  const all = [...TEMPLATES.flatMap(([template, spec]) => sets(spec).map((labels) => scene(template, labels))), ...Object.values(NOAH_SHELF_SCENES)];
  for (const item of all) {
    assert.ok(parseNoahPinScene(item).scene, `${item.template} の見本が形に合わない: ${item.labels}`);
    const { texts } = drawAt(item, noahPinHold(item.template));
    const shown = texts.filter((box) => box.alpha > 0.001);
    // 札は、どれも 1 回ずつ、はっきり（透けずに）描かれている。
    for (const label of new Set(item.labels)) {
      const found = shown.filter((box) => box.text === label);
      assert.equal(found.length, item.labels.filter((other) => other === label).length, `${item.template}: 「${label}」が ${found.length} 回`);
      for (const box of found) assert.ok(box.alpha > 0.99, `${item.template}: 「${label}」が透けている（${box.alpha}）`);
    }
    for (const box of shown) {
      // 字は絵（539×208）の中に収まり、字の大きさは 14 以上（絵の幅 539 のうち。元の図のいちばん小さい字は 16）。
      assert.ok(box.left >= 2 && box.right <= W - 2 && box.top >= 2 && box.bottom <= H - 2, `${item.template}: 「${box.text}」がはみ出す（${box.left.toFixed(0)}〜${box.right.toFixed(0)}, ${box.top.toFixed(0)}〜${box.bottom.toFixed(0)}）`);
      assert.ok(box.size >= 14 - 1e-6, `${item.template}: 「${box.text}」の字が ${box.size}`);
      // 札でない字は、順番の数字（1〜8）と、フローチャートのひし形の「?」だけ（72%・30%・10人中3人・100 のような作り話の数は描かない）。
      if (!item.labels.includes(box.text)) assert.match(box.text, /^([1-8]|\?)$/, `${item.template}: 札でない字「${box.text}」`);
    }
  }
});

void test('every diagram builds itself with the poyon motion as a pure function of time: blank labels first, moving parts, then a settled picture that holds', () => {
  const source = readFileSync(new URL('../lib/noah-pin-diagram.ts', import.meta.url), 'utf8');
  // 時刻の純関数（乱数・時計を使わない）。同じ u なら、同じ絵。
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\.|new Date/);
  for (const [template, spec] of TEMPLATES) {
    const item = scene(template, shortLabels(spec)), hold = noahPinHold(template), name = template;
    assert.ok(hold > 3 && hold <= 4, `${name}: 止める時刻 ${hold}`);
    assert.deepEqual(drawAt(item, 1.3).log, drawAt(item, 1.3).log, `${name}: 同じ時刻で絵が違う`);
    // 初め（u = 0）は札が見えない（スイムレーン図のレーンの名前だけは、元の図と同じく骨組み）。描く命令も、止めた時より少ない。
    const first = drawAt(item, 0), last = drawAt(item, hold);
    const early = first.texts.filter((box) => box.alpha > 0.001 && item.labels.includes(box.text)).map((box) => box.text);
    assert.deepEqual(early, template === 'swimlane' ? item.labels : [], `${name}: 初めから札が見える`);
    assert.ok(first.log.length < last.log.length, `${name}: 初めの絵が、止めた時より多い`);
    // 途中が動く（0〜止める時刻の間に、違う絵が 4 枚以上ある）。
    const frames = new Set([0, 0.5, 1, 1.5, 2, 2.5, 3, hold].map((u) => drawAt(item, u).log.join('|')));
    assert.ok(frames.size >= 4, `${name}: 動く途中が ${frames.size} 枚`);
    // 止める時には、もう揺れていない（止める 0.15 秒前と、札の位置・大きさ・濃さが 0.5 以内で同じ。揺れの途中で急に止まらない）。
    const before = drawAt(item, hold - 0.15).texts.filter((box) => box.alpha > 0.001);
    const after = last.texts.filter((box) => box.alpha > 0.001);
    assert.equal(before.length, after.length, `${name}: 止める前後で字の数が違う`);
    for (const [i, box] of after.entries()) {
      const was = before[i];
      for (const key of ['left', 'right', 'top', 'bottom', 'size']) assert.ok(Math.abs(box[key] - was[key]) < 0.5, `${name}: 「${box.text}」が止める直前まで動いている（${key} ${was[key].toFixed(1)} → ${box[key].toFixed(1)}）`);
      assert.ok(Math.abs(box.alpha - was.alpha) < 0.01, `${name}: 「${box.text}」の濃さが止める直前まで変わる`);
    }
  }
  // ぽよん: 箱は、出始めてすぐ縦に伸び、行き過ぎた所で横につぶれ（縦横が逆に伸び縮みする）、最後は元の形（#001 のばね＋#011 の伸び縮み）。
  const tree = scene('tree', shortLabels(NOAH_PIN_TEMPLATES.tree)), root = (u) => drawAt(tree, u).texts.find((box) => box.text === '札1');
  const ratio = (box) => (box.right - box.left) / (box.bottom - box.top), still = ratio(root(4));
  assert.ok(ratio(root(0.4 + 0.08)) < still * 0.95, '伸びる時に縦長になっていない');
  assert.ok(ratio(root(0.4 + 0.3)) > still * 1.05, '戻る時に横につぶれていない');
  assert.ok(Math.max(...[0.15, 0.2, 0.25].map((t) => root(0.4 + t).size)) > root(4).size * 1.1, '行き過ぎて大きくならない');
  // 部品: canvas 1 つ。サーバーで描いた時は空の面（字は無い）。読み上げには出さない。画面に入った時に 1 回動き、動きを減らす設定の人には組み上がった形を出す。
  const component = readFileSync(new URL('../components/noah-pin-scene.tsx', import.meta.url), 'utf8');
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /IntersectionObserver/);
  assert.match(component, /noahPinHold/);
  const code = ts.transpileModule(component, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const unit = { exports: {} };
  const local = (id) => (id === '@/lib/noah-pin-diagram' ? diagram : id.endsWith('.module.css') ? { default: new Proxy({}, { get: (_, name) => String(name) }) } : require(id));
  runInThisContext(`(function (exports, require, module) {${code}\n})`)(unit.exports, local, unit);
  const html = renderToStaticMarkup(React.createElement(unit.exports.default, { scene: NOAH_SHELF_SCENES['pkg:keihi-kamoku'] }));
  assert.equal(html, '<canvas class="art" width="539" height="208" data-template="tree" aria-hidden="true"></canvas>');
});

void test('the drawing keeps the MIT notice of the Motion Prompt diagram pack it was copied from', () => {
  const source = readFileSync(new URL('../lib/noah-pin-diagram.ts', import.meta.url), 'utf8');
  assert.match(source.slice(0, 600), /MIT License \(c\) 2026 Shohei Ohtaki/);
  assert.match(source.slice(0, 600), /github\.com\/showheyohtaki\/motion-prompt/);
  const license = readFileSync(new URL('../vendor/motion-prompt/LICENSE', import.meta.url), 'utf8');
  assert.match(license, /^MIT License\n\nCopyright \(c\) 2026 Shohei Ohtaki\n/);
  assert.match(license, /The above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software\./);
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
