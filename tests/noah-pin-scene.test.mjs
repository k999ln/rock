// ピンの図解（バージョン TAKE。spec-115 の 9 章）の試験: 形の確かめ（図の名前・札の数・図ごとの字の上限・余計な項目）・棚の 17 枚（形が通る・札はカードの文にある言葉だけ・同じ図は 2 枚まで）・
// 全部の図が描ける（札が 1 回ずつ絵に出る・絵の外へはみ出さない・字が小さすぎない・作り話の数が無い・壊れた数が無い）・
// 動き「ぽよん」（時刻 u の純関数・初めは札が無い・途中が動く・止める時には揺れが収まっている）・
// 色（配色の黄金比 ベース 70%・メイン 25%・アクセント 5% の 3 色。カードごとに黄金角ずつ回す。何枚目でも字が読め、隣は違う色）・全部の図の面積の割合・しょうへいさんの図解パックの許諾の表示・Luna Max への説明・Luna Max が書く 1 枚（題・入れる物・返る物・図解）の確かめ。
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
import { colorFamilies, rasterContext } from './fixtures/noah/pin-raster.mjs';

const { drawNoahPinDiagram, noahPinHold, NOAH_PIN_ART, noahPinColors, PHI, GOLDEN_ANGLE, NOAH_PIN_COLOR_RATIO } = diagram;
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
  // 濃淡（グラデーション）: 色の段を書き留める物を返す。
  const gradient = (name) => (...args) => { note(name, args); return { addColorStop: (at, color) => { note('addColorStop', [at, color]); if (!/^(#[0-9A-F]{6}|rgba\(\d+,\d+,\d+,[\d.]+\))$/i.test(color)) throw new Error(`色の形が違う: ${color}`); } }; };
  methods.createLinearGradient = gradient('createLinearGradient');
  methods.createRadialGradient = gradient('createRadialGradient');
  for (const name of ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'roundRect', 'rect', 'bezierCurveTo', 'fill', 'stroke', 'clip', 'fillRect', 'clearRect', 'setLineDash']) {
    methods[name] = (...args) => note(name, args.map((value) => (Array.isArray(value) ? value.join('/') : value)));
  }
  const k = new Proxy(state, {
    get: (target, name) => methods[name] ?? target[name],
    set: (target, name, value) => { if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${String(name)} に壊れた数 ${value}`); target[name] = value; log.push(`${String(name)}=${value}`); return true; },
  });
  return { k, log, texts };
}
const drawAt = (item, u, tone = 0) => { const r = recorder(); drawNoahPinDiagram(r.k, item, u, tone); return r; };

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
  // 色は、深い・鮮やか・淡いの 3 種類が出るように、続いた 3 枚の色で描く（n 枚目から）。
  for (const [n, item] of all.entries()) for (const tone of [n, n + 1, n + 2]) {
    assert.ok(parseNoahPinScene(item).scene, `${item.template} の見本が形に合わない: ${item.labels}`);
    const { texts } = drawAt(item, noahPinHold(item.template), tone);
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
  const tone = noahPinColors(3);
  const html2 = renderToStaticMarkup(React.createElement(unit.exports.default, { scene: NOAH_SHELF_SCENES['pkg:keihi-kamoku'], tone: 3 }));
  assert.equal(html, `<canvas class="art" width="539" height="208" style="background:linear-gradient(135deg, ${noahPinColors(0).bg1}, ${noahPinColors(0).bg2})" data-template="tree" aria-hidden="true"></canvas>`);
  assert.match(html2, new RegExp(`linear-gradient\\(135deg, ${tone.bg1}, ${tone.bg2}\\)`));
});

void test('every card has a base, a main and an accent color, keeps every word readable, and turns by the golden angle so neighbours differ', () => {
  // WCAG の比（明るい方 + 0.05）÷（暗い方 + 0.05）。
  const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // 黄金比 φ と黄金角（360° ÷ φ²）。
  assert.ok(Math.abs(PHI - 1.6180339887) < 1e-9);
  assert.ok(Math.abs(GOLDEN_ANGLE - 137.5077640500) < 1e-9);
  const kinds = new Set();
  for (let n = -30; n < 400; n++) {
    const c = noahPinColors(n);
    assert.deepEqual(noahPinColors(n), c, `${n} 枚目: 同じ番号で色が違う`);
    for (const value of [c.bg1, c.bg2, c.stage, c.blue, c.blueM, c.blueL, c.g2, c.g3, c.g4, c.mark, c.sub, c.accentText, c.onBlue, c.onM, c.onL, c.card, c.chip]) assert.match(value, /^#[0-9A-F]{6}$/i, `${n} 枚目: 色の形 ${value}`);
    kinds.add(c.kind);
    const name = `${n} 枚目（${c.kind} ${c.hue.toFixed(1)}°）`;
    // 3 色の色相: メインはベースの隣（±28°）、アクセントはベースの反対（補色。180°）。
    const apart = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
    assert.ok(Math.abs(apart(c.hues.main, c.hues.base) - 28) < 1e-6, `${name}: メインの色相 ${c.hues.main}`);
    assert.ok(Math.abs(apart(c.hues.accent, c.hues.base) - 180) < 1e-6, `${name}: アクセントの色相 ${c.hues.accent}`);
    for (const [what, text, ground, need] of [
      ['字 / 面の左上', c.mark, c.bg1, 4.5], ['字 / 面の右下', c.mark, c.bg2, 4.5], ['アクセントの字 / 面の左上', c.accentText, c.bg1, 4.5], ['アクセントの字 / 面の右下', c.accentText, c.bg2, 3.5],
      ['アクセントの上の字', c.onBlue, c.blue, 4.5], ['メインの上の字', c.onM, c.blueM, 4.5], ['淡いメインの上の字', c.onL, c.blueL, 4.5],
      ['ベースの濃い色の上の字', c.mark, c.g3, 4.5], ['ベースの淡い色の上の字', c.mark, c.g2, 4.5], ['札の上の字', c.mark, c.card, 4.5], ['薄い字 / 面', c.sub, c.stage, 3],
    ]) assert.ok(contrast(text, ground) >= need, `${name}: ${what} が ${contrast(text, ground).toFixed(2)}（${need} 以上が要る）`);
    // 形の色は、面から見分けられる（元の図の弱い差し色 #C9D8FB と面 #F1F0EE の比 約 1.26 を下回らない）。メインと淡いメインも見分けられる。
    for (const [what, shape, ground, need] of [['アクセント', c.blue, c.stage, 2], ['メイン', c.blueM, c.stage, 1.6], ['淡いメイン', c.blueL, c.stage, 1.25], ['淡いメインとメイン', c.blueL, c.blueM, 1.25],
      ['ベースの淡い色', c.g2, c.stage, 1.1], ['ベースの濃い色', c.g3, c.stage, 1.25], ['ベースのいちばん濃い色', c.g4, c.stage, 1.8]]) {
      assert.ok(contrast(shape, ground) >= need, `${name}: ${what}が面に溶ける（${contrast(shape, ground).toFixed(2)}）`);
    }
    // 面の色相は、n 枚目ごとに黄金角ずつ回る。グリッドで隣や上下に並ぶ（4 枚以内の）カードは、色相が 50° 以上離れる。
    const step = ((noahPinColors(n + 1).hue - c.hue) % 360 + 360) % 360;
    assert.ok(Math.abs(step - GOLDEN_ANGLE) < 1e-6, `${name}: 次の枚との色相の差が ${step}`);
    for (let k = 1; k <= 4; k++) { const d = Math.abs(noahPinColors(n + k).hue - c.hue) % 360; assert.ok(Math.min(d, 360 - d) >= 50, `${name}: ${k} 枚先と色相が ${Math.min(d, 360 - d).toFixed(1)}° しか離れない`); }
  }
  // 深い・鮮やか・淡いの 3 種類が、どれも出る。1000 枚並べても、同じ色相に戻らない（φ は無理数）。
  assert.deepEqual([...kinds].sort((a, b) => a.localeCompare(b)), ['deep', 'pale', 'vivid']);
  const hues = Array.from({ length: 1000 }, (_, n) => noahPinColors(n).hue.toFixed(2));
  assert.equal(new Set(hues).size, 1000, '同じ色相に戻った');
  // 範囲の外・小数の番号も描ける（整数にして使う）。
  assert.deepEqual(noahPinColors(2.7), noahPinColors(2));
  assert.deepEqual(noahPinColors(Number.NaN), noahPinColors(0));
});

void test('every diagram paints about 70% base, 25% main and 5% accent (the golden ratio of colors), on every kind of card', () => {
  // 配色の黄金比。字を除いた塗りの面積を、1 画素ずつ数える（tests/fixtures/noah/pin-raster.mjs。本物のブラウザで数えた値と 1 枚あたり 1% 以内で合う）。
  assert.deepEqual(NOAH_PIN_COLOR_RATIO, { base: 0.7, main: 0.25, accent: 0.05 });
  const scenes = [...Object.values(NOAH_SHELF_SCENES), ...TEMPLATES.filter(([template]) => !Object.values(NOAH_SHELF_SCENES).some((item) => item.template === template)).map(([template, spec]) => scene(template, shortLabels(spec)))];
  assert.equal(new Set(scenes.map((item) => item.template)).size, TEMPLATES.length);
  const sum = { base: 0, main: 0, accent: 0 };
  let count = 0;
  // 深い（0・8）・鮮やか（1・3）・淡い（2・4）の 3 種類の面で。
  for (const item of scenes) for (const n of [0, 1, 2, 3, 4, 8]) {
    const raster = rasterContext(colorFamilies(noahPinColors(n)), noahPinLabelWidth);
    drawNoahPinDiagram(raster.k, item, noahPinHold(item.template), n);
    const share = raster.shares(), name = `${item.template}（${n} 枚目 ${noahPinColors(n).kind}）`, pct = (v) => `${(v * 100).toFixed(1)}%`;
    assert.ok(share.base >= 0.64 && share.base <= 0.77, `${name}: ベースが ${pct(share.base)}（64〜77%）`);
    assert.ok(share.main >= 0.2 && share.main <= 0.3, `${name}: メインが ${pct(share.main)}（20〜30%）`);
    assert.ok(share.accent >= 0.03 && share.accent <= 0.07, `${name}: アクセントが ${pct(share.accent)}（3〜7%）`);
    for (const key of Object.keys(sum)) sum[key] += share[key];
    count++;
  }
  // 全部の図をならすと、70:25:5 から 3 ポイント以内。
  for (const key of Object.keys(sum)) assert.ok(Math.abs(sum[key] / count - NOAH_PIN_COLOR_RATIO[key]) <= 0.03, `${key} のならした割合が ${(sum[key] / count * 100).toFixed(1)}%`);
});

void test('the drawing keeps the MIT notice of the Motion Prompt diagram pack it was copied from', () => {
  const source = readFileSync(new URL('../lib/noah-pin-diagram.ts', import.meta.url), 'utf8');
  assert.match(source.slice(0, 600), /MIT License \(c\) 2026 Shohei Ohtaki/);
  assert.ok(source.slice(0, 600).includes('https://github.com/showheyohtaki/motion-prompt'), '冒頭に元のリポジトリの URL');
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
