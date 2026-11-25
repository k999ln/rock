/**
 * ピンの図解を描く（Canvas 2D。バージョン TAKE）。
 *
 * しょうへい（大滝昇平 / Shohei Ohtaki, @showheyohtaki）さんの Motion Prompt の「資料で使う図解・グラフの名前」パック
 * （#217〜240。https://github.com/showheyohtaki/motion-prompt の packs/diagram/pack.js、commit 683ecca）を書き写した物。
 * MIT License (c) 2026 Shohei Ohtaki。許諾の全文は vendor/motion-prompt/LICENSE。
 *
 * 書き写したまま: 539×208 の面・図の色の役割（強い差し色・中・弱い・灰色 3 段・字の色）・字の書体・図の形と大きさ・出てくる順（各コマは時刻 u の純関数）。
 * Noah で変えた所（理由は、札に、その Agent の言葉を入れるため・説明に無い数を描かないため・本人が可愛い動きを望んだため）:
 * - 図の中の仮の字（A・B・?・テーマ・結果・TAM など）を、札の言葉（scene.labels）にした。札が長い時は、字を少し小さくする（それでも長い時は、幅に詰める）。
 * - 作り話の数（72%・30%・10人中3人・ファネルの 100/58/27/9・帯の %・4月〜12月）は描かない。順番の数字（1, 2, 3…）と「?」だけ残した。
 * - 札を置くために、形を少し動かした: ロジックツリーは 1→3→6、サイクル図の丸は 45° 回した、フローチャートは 8 下へ、フィッシュボーン図の骨は少し短く、
 *   ヒートマップは 4 行と見出し・濃さの見本、スイムレーン図の名前の列は 80、ガントチャートの行の名前は灰色の棒にして「日」の縦線を足した、
 *   マトリクスの点を 1 つ動かした、マインドマップの札のある枝は箱を広げた。
 * - 部品の出方を、可愛い動き「ぽよん」に変えた（本人の指示 2026-11-24「もっと可愛いアニメーション」「cuteじゃなくて可愛い」。
 *   ぽよん・ぴょこっ・ふわっ の 3 つを動画で見比べて、本人がぽよんを選んだ）。同じ作者の Motion Prompt の動きの数から作った:
 *   #001 ポップイン（ばね 1 − e^(−6.5t)·cos(15t)）＋ #011 スクワッシュ＆ストレッチ（縦横を逆に伸び縮み・体積を保つ）。
 *   線を引く動き（矢印・枝）と、出てくる順番は元のまま。
 * - 色を、1 枚ずつ違う色にした（本人の指示 2026-11-24「色味がダサい」「こんな感じにして」「こんな感じの色味にして　今のやつじゃ飽きるから黄金比を活用して」「黄金比カラーになってない」）。
 *   元の面 #F1F0EE と青 #2F6BEB の代わりに、配色の黄金比「ベース 70%・メイン 25%・アクセント 5%」の 3 色（noahPinColors。ポップな 8 組からカードごとに選ぶ。
 *   本人の指示 2026-11-25「全体的に紫っぽい」「もっとポップに」）。
 *   塗りの面積が 70:25:5 に近くなるように、各図の形の大きさ・太さ・塗る所を変えた（各図の「配色の黄金比」の行）。
 * - 元の 1 周（4.7 秒）の代わりに、組み上がった形を少し長く見せてから消える 1 周 約 7 秒で繰り返す（本人の決定 2026-11-25「見えている間は繰り返す」と指示「説明動画５〜8秒とか」。
 *   その前は 2026-11-24「画面に入った時に1回」で、組み上げて止めていた）。組み上がる時刻は noahPinHold、1 周の時刻は noahPinLoopFrame。
 *
 * 通信も保存もしない。乱数（種のある表を除く）と時計は使わない（同じ u なら、いつも同じ絵）。
 * 仕様: docs/noah/spec-115-pin-grid.md の 9 章。札の数と字の上限は lib/noah-pin-scene.ts の NOAH_PIN_TEMPLATES。
 */
import type { NoahPinScene, NoahPinTemplate } from './noah-pin-scene.ts';

type K = CanvasRenderingContext2D;
type Pt = [number, number];
type Cell = (k: K, w: number, h: number, u: number, L: readonly string[]) => void;

/** 絵の大きさ（元のカードと同じ 539×208）と、元の 1 周の長さ（秒）。 */
export const NOAH_PIN_ART = { width: 539, height: 208, cycle: 4.7 } as const;

// @kit（元の packs/diagram/pack.js の共通部分。色は下の「色」の 3 色で、カードごとに変える）
const CW = NOAH_PIN_ART.width, CH = NOAH_PIN_ART.height;
const FONT = '"Hiragino Sans", "Helvetica Neue", "PingFang SC", "Noto Sans", "Noto Sans CJK JP", system-ui, sans-serif';
const TAU = Math.PI * 2;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
const P = (t: number, a: number, b: number) => clamp((t - a) / (b - a));                     // 0..1 progress of t between a and b
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);   // cubic-bezier(0.65,0,0.35,1)
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);                                            // cubic-bezier(0.33,1,0.68,1)
function rand(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; } // seeded random
/** 角の丸い四角（roundRect の無い古いブラウザでは、arcTo で同じ形を描く）。 */
function rr(k: K, x: number, y: number, w: number, h: number, r: number) {
  k.beginPath();
  if (typeof k.roundRect === 'function') { k.roundRect(x, y, w, h, r); return; }
  const q = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  k.moveTo(x + q, y); k.arcTo(x + w, y, x + w, y + h, q); k.arcTo(x + w, y + h, x, y + h, q); k.arcTo(x, y + h, x, y, q); k.arcTo(x, y, x + w, y, q); k.closePath();
}
function txt(k: K, s: string, x: number, y: number, font: string, col: string, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'alphabetic') {
  k.font = font; k.fillStyle = col; k.textAlign = align; k.textBaseline = base; k.fillText(s, x, y);
}
/**
 * 面: ベースの色 1 つの濃淡（同じ色相で、左上が少し深く右下が少し明るい）と、上からの柔らかい光。
 * 絵の下の字は、カードの白い地に置く（Mac の App Store のカードと同じ。絵に帯は付けない）。
 */
function bg(k: K, w: number, h: number) {
  const g = k.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2);
  k.fillStyle = g; k.fillRect(0, 0, w, h);
  const glow = k.createRadialGradient(w * 0.62, -h * 0.38, 0, w * 0.62, -h * 0.38, w * 0.62);
  glow.addColorStop(0, rgba('#FFFFFF', C.dark ? 0.14 : 0.45)); glow.addColorStop(1, rgba('#FFFFFF', 0));
  k.fillStyle = glow; k.fillRect(0, 0, w, h);
}
function fade(u: number) { return 1 - easeInOut(P(u, 4.1, 4.5)); }              // the whole figure fades out at the end of the cycle

// 色（Noah で足した部分。本人の指示 2026-11-24「こんな感じの色味にして　今のやつじゃ飽きるから黄金比を活用して」「黄金比カラーになってない」と、
// 2026-11-25「ちょっと全体的に紫っぽいから」「もっとポップにポケモンセンターみたいな感じにして」）。
// 配色の黄金比「ベース 70%・メイン 25%・アクセント 5%」（面積の割合）で、1 枚の絵を 3 つの色だけで描く（本人の決定 2026-11-24「1 枚の絵の中」「カードごとに変える」）。
// - ベース（約 70%）: 面と、同じ色相の淡い・濃い色（図の骨組み・空のマス・札の地。役割 g2・g3・g4・card）。
// - メイン（約 25%）: 図の形（役割 blueM と、その淡い色 blueL）。
// - アクセント（約 5%）: いちばん大事な所だけ（役割 blue）。
// 3 色は、ポップな 8 組（POP_SETS）から選ぶ: 赤・黄・青・白を中心に、空色・橙・緑。紫・赤紫は使わない（本人「紫っぽい」）。
// おもちゃ屋・子ども向けの店のような、明るい原色の組み合わせ（特定の店の色や絵柄は写さない）。
// 面積の割合は、24 種類の図を描いて画素を数えて確かめる（spec-115 の 9 章に表。試験 tests/noah-pin-scene.test.mjs）。
// カードごとの組は、並びの n 枚目ごとに黄金比の並び（n × φ の小数部分）で選ぶ（4 枚以内の隣は必ず違う組で、8 組が偏らずに出る）。
// 色は OKLCH（人の目に揃った明るさ）で作り、字が読める明るさ（WCAG 4.5 以上）まで、明るさだけを動かす。字の濃さと形の見分けは試験が確かめる。
/** 黄金比 φ。 */
export const PHI = (1 + Math.sqrt(5)) / 2;
/** 配色の黄金比（ベース・メイン・アクセントの面積の割合）。 */
export const NOAH_PIN_COLOR_RATIO = { base: 0.7, main: 0.25, accent: 0.05 } as const;
type Kind = 'vivid' | 'pale';
/** 色相（OKLCH の度）: 赤・橙・黄・黄緑・緑・空色・青。 */
const HUE = { red: 28, orange: 55, yellow: 95, lime: 125, green: 148, sky: 232, blue: 262 } as const;
type Hue = keyof typeof HUE;
/**
 * ポップな 8 組。base = ベースの色（淡い = 明るい面に黒い字、鮮やか = 濃い面に白い字）、main = メイン、accent = アクセント。
 * 並びは、黄金比の並びで隣同士に来やすい組が、似ないように置いた。
 */
export const NOAH_PIN_POP_SETS: readonly { name: string; kind: Kind; base: Hue | 'cream'; main: Hue | 'cream'; accent: Hue }[] = [
  { name: '黄と青', kind: 'pale', base: 'yellow', main: 'blue', accent: 'red' },
  { name: '空色と赤', kind: 'pale', base: 'sky', main: 'red', accent: 'blue' },
  { name: '白と赤', kind: 'pale', base: 'cream', main: 'red', accent: 'blue' },
  { name: '橙と赤', kind: 'pale', base: 'orange', main: 'red', accent: 'blue' },
  { name: '緑と青', kind: 'pale', base: 'green', main: 'blue', accent: 'red' },
  { name: '赤と白', kind: 'vivid', base: 'red', main: 'cream', accent: 'yellow' },
  { name: '青と空色', kind: 'vivid', base: 'blue', main: 'sky', accent: 'yellow' },
  { name: '黄緑と緑', kind: 'pale', base: 'lime', main: 'green', accent: 'red' },
];
/**
 * 1 枚の、図の役割ごとの色。ベース = bg1・bg2・stage・g2・g3・g4・card、メイン = blueM・blueL、アクセント = blue。
 * 字の色 = mark（地の上）・sub（薄い字）・accentText（地の上のアクセントの字）・onBlue・onM・onL（アクセント・メイン・淡いメインの上）・chip（形の上の小さな印）。
 * set = 8 組の何番目か、hues = ベース・メイン・アクセントの色相（cream は、ほぼ白の暖かい色）。
 */
export type NoahPinColors = {
  kind: Kind; dark: boolean; set: number; name: string; hues: { base: number; main: number; accent: number };
  bg1: string; bg2: string; stage: string; blue: string; blueM: string; blueL: string; g2: string; g3: string; g4: string;
  mark: string; sub: string; onBlue: string; onM: string; onL: string; card: string; chip: string;
  /** アクセントの色相の字（面の上で 4.5 以上で読める）。鮮やかな面では、白に近い色（形のアクセントより明るい）。 */
  accentText: string;
};
/** 明るさ（WCAG の相対輝度）と、2 色の比。 */
function luminance(hex: string) { return hexRGB(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(a: string, b: string) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
const readable = (ground: string, ...inks: string[]) => inks.reduce((best, ink) => (contrast(ink, ground) > contrast(best, ground) ? ink : best));
/** OKLCH（明るさ L 0〜1・鮮やかさ c・色相 h 度）を #RRGGBB に。画面で出せない鮮やかさの時は、色相と明るさを保って鮮やかさを下げる。 */
function oklch(L: number, c: number, h: number) {
  const a = Math.cos((h * Math.PI) / 180), b = Math.sin((h * Math.PI) / 180);
  const rgb = (cc: number) => {
    const l = (L + 0.3963377774 * cc * a + 0.2158037573 * cc * b) ** 3, m = (L - 0.1055613458 * cc * a - 0.0638541728 * cc * b) ** 3, s = (L - 0.0894841775 * cc * a - 1.291485548 * cc * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  };
  let lo = 0, hi = c;
  if (rgb(c).some((v) => v < -1e-4 || v > 1 + 1e-4)) { for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (rgb(mid).some((v) => v < -1e-4 || v > 1 + 1e-4)) hi = mid; else lo = mid; } } else lo = c;
  return '#' + rgb(lo).map((v) => { const x = clamp(v); return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)).toString(16).padStart(2, '0'); }).join('').toUpperCase();
}
/** 明るさ L から step ずつ動かして、ok を満たす最初の色（色相と鮮やかさはそのまま）。80 歩で見つからなければ、最後の色。 */
function seek(L: number, c: number, h: number, step: number, ok: (hex: string) => boolean) {
  let hex = oklch(L, c, h);
  for (let i = 1; i <= 80 && !ok(hex); i++) hex = oklch(clamp(L + step * i), c, h);
  return hex;
}
const WHITE = '#FFFFFF', INK = '#1C1C1E';
/** n 枚目が使う組の番号（0〜7）。黄金比の並び: n × φ の小数部分を 8 等分する（4 枚以内の隣は必ず違う組。どの組も同じくらい出る）。 */
export function noahPinPopSet(n: number) {
  const k = NOAH_PIN_POP_SETS.length, f = ((Math.trunc(n) * PHI + 0.05) % 1 + 1) % 1;
  return Math.min(k - 1, Math.floor(f * k));
}
/** n 枚目（0 から。負の数も可）の 3 色。 */
function colorsAt(n: number): NoahPinColors {
  const set = noahPinPopSet(n), pop = NOAH_PIN_POP_SETS[set], kind = pop.kind, dark = kind === 'vivid';
  const hueOf = (x: Hue | 'cream') => (x === 'cream' ? 85 : HUE[x]);
  const hb = hueOf(pop.base), hm = hueOf(pop.main), ha = HUE[pop.accent];
  const mark = dark ? WHITE : INK, light = dark ? WHITE : '#000000';
  // ベース: 面の 2 色（同じ色相の、明るさだけ違う 2 色）。字（mark）が読める。淡い面は明るく軽く、鮮やかな面は原色に近く。
  let bg1: string, bg2: string;
  if (dark) { const ok = (x: string) => contrast(WHITE, x) >= 4.6; bg1 = seek(0.6, 0.21, hb, -0.01, ok); bg2 = seek(0.66, 0.2, hb, -0.01, ok); }
  else if (pop.base === 'cream') { bg1 = oklch(0.985, 0.012, hb); bg2 = oklch(0.955, 0.03, hb); }
  else { const c = pop.base === 'yellow' ? 0.14 : pop.base === 'lime' ? 0.11 : 0.075; bg1 = oklch(0.955, c * 0.6, hb); bg2 = seek(0.905, c, hb, 0.005, (x) => contrast(INK, x) >= 11); }
  const stage = mix(bg1, bg2, 0.5);
  const inks = [mark, INK, WHITE];
  const onAny = (x: string) => contrast(readable(x, ...inks), x) >= 4.6;
  // ベースの淡い・濃い色（同じ色相）: 字を置く g2・g3・card は字が読め、形として面から見分けられる。
  const bc = pop.base === 'cream' ? 0.015 : dark ? 0.18 : 0.05;
  const tintOf = (L: number, c: number, step: number, see: number, text: boolean) => seek(L, c, hb, step, (x) => contrast(x, stage) >= see && (!text || contrast(mark, x) >= 4.6));
  const g2 = dark ? tintOf(0.54, bc, -0.01, 1.15, true) : tintOf(0.995, 0.01, -0.005, 1.1, true);
  const g3 = dark ? tintOf(0.5, bc, -0.01, 1.3, true) : tintOf(0.86, bc, -0.01, 1.3, true);
  const g4 = dark ? tintOf(0.82, bc * 0.5, 0.01, 1.9, false) : tintOf(0.68, bc, -0.01, 1.9, false);
  const card = dark ? tintOf(0.52, bc, -0.01, 1.2, true) : tintOf(0.998, 0.006, -0.005, 1.08, true);
  // メイン: 図の形。面から見分けられ（1.7 以上）、上の字が 4.5 以上。淡いメイン（blueL）は、メインとも見分けられる。
  const mc = pop.main === 'cream' ? 0.03 : 0.2;
  const blueM = dark ? seek(pop.main === 'cream' ? 0.97 : 0.86, pop.main === 'cream' ? 0.03 : 0.1, hm, 0.01, (x) => contrast(x, stage) >= 1.7 && onAny(x))
    : seek(0.6, mc, hm, -0.01, (x) => contrast(x, stage) >= 1.7 && onAny(x));
  const blueL = dark ? seek(pop.main === 'cream' ? 0.86 : 0.76, pop.main === 'cream' ? 0.06 : 0.1, pop.main === 'cream' ? HUE.orange : hm, 0.01, (x) => contrast(x, stage) >= 1.3 && contrast(x, blueM) >= 1.15 && onAny(x))
    : seek(0.82, 0.09, hm, -0.01, (x) => contrast(x, stage) >= 1.3 && contrast(x, blueM) >= 1.3 && onAny(x));
  // アクセント: 形として面からはっきり見え（2 以上）、上に字を置ける（4.5 以上）。淡い面では、そのまま面の上の字にもなる（左上 4.5・右下 3.5 以上）。
  // 鮮やかな面の上で 4.5 以上の字は白に近い色しか無いので、字だけ別の明るい色（accentText）にして、形は色のあるアクセントにする。
  const onBg = (x: string) => contrast(x, bg1) >= 4.6 && contrast(x, bg2) >= 3.6;
  const blue = dark ? seek(0.9, 0.18, ha, 0.01, (x) => contrast(x, stage) >= 2.2 && onAny(x))
    : seek(ha === HUE.orange ? 0.62 : 0.56, 0.21, ha, -0.01, (x) => onBg(x) && onAny(x) && contrast(x, blueM) >= 1.2);
  const accentText = dark ? seek(0.96, 0.08, ha, 0.01, onBg) : blue;
  return {
    kind, dark, set, name: pop.name, hues: { base: hb, main: hm, accent: ha }, bg1, bg2, stage, blue, blueM, blueL, g2, g3, g4,
    mark, sub: mix(stage, light, dark ? 0.72 : 0.6), accentText, onBlue: readable(blue, ...inks), onM: readable(blueM, ...inks), onL: readable(blueL, ...inks), card,
    chip: readable(blueM, WHITE, INK) === WHITE ? mix(blueM, WHITE, 0.7) : mix(blueM, INK, 0.45),
  };
}
const COLORS = new Map<number, NoahPinColors>();
/** n 枚目（並びの順。0 から）の色。同じ n は、いつも同じ色。 */
export function noahPinColors(n: number): NoahPinColors {
  const key = Math.trunc(n) || 0;
  let colors = COLORS.get(key);
  if (!colors) { if (COLORS.size > 512) COLORS.clear(); colors = colorsAt(key); COLORS.set(key, colors); }
  return colors;
}
/** 描く間の色（drawNoahPinDiagram が、描く前に決め、描き終わったら元に戻す）。 */
let C: NoahPinColors = noahPinColors(0);
function rgba(hex: string, a: number) { const [r, g, b] = hexRGB(hex); return `rgba(${r},${g},${b},${a})`; }

// 部品の出方「ぽよん」（Noah で足した部分。本人が 3 つの型から選んだ）。
/** 1 つの部品の、その時の形: a = 透明度、sx・sy = 横と縦の拡大率。 */
type Pose = { a: number; sx: number; sy: number };
const STILL: Pose = { a: 1, sx: 1, sy: 1 };
const GONE: Pose = { a: 0, sx: 0, sy: 0 };
/**
 * 部品が、時刻 t0 から出てくる時の形。#001 のばね（約 1.26 倍まで行き過ぎる）で大きくなり、#011 のように縦横を逆に伸び縮みする（体積を保つ）。
 * 速く伸びる時は縦長、行き過ぎて戻る時は横につぶれる。出始めてから約 0.8 秒で止まる。
 */
function pose(u: number, t0: number): Pose {
  const t = u - t0;
  if (t <= 0) return GONE;
  const s = 1 - Math.exp(-6.5 * t) * Math.cos(15 * t), f = 1 + 0.16 * Math.exp(-6 * t) * Math.sin(15 * t);
  return { a: clamp(t / 0.06), sx: s / f, sy: s * f };
}
/** 着いた後の反応（滑って寄った物・伸びて止まった物）: #121 の着地の揺れ（縦横を逆に、0.13·e^(−7t)·sin(17t)）。 */
function wob(u: number, t0: number): Pose {
  const t = u - t0;
  if (t <= 0) return STILL;
  const f = 1 + 0.13 * Math.exp(-7 * t) * Math.sin(17 * t);
  return { a: 1, sx: f, sy: 1 / f };
}
/** 長さ・位置が 0 → 1 へ進む割合（a から、元の長さ d で）。行き過ぎて（約 1.15）ぷるんと戻って止まるばね。d の約 1.6 倍で止まる。 */
function ease(u: number, a: number, d: number) {
  const x = (u - a) / d;
  return x <= 0 ? 0 : 1 - Math.exp(-3.2 * x) * Math.cos(5.2 * x);
}
/** ease が初めて 1 に届く時刻（着いた時。wob を始める時）。 */
function landed(a: number, d: number) { return a + d * 0.3; }
/**
 * 部品を、その時の形で描く。(x, y) は部品の真ん中、hh は高さの半分（伸び縮みは、部品の下の端を基準にする。床に着いたまま、ぷにっとつぶれる）。
 * draw は、絵の座標のまま描く（ここで、基準の点のまわりに伸び縮みさせる）。
 */
function put(k: K, x: number, y: number, p: Pose, draw: () => void, hh = 0) {
  if (p.a <= 0 || Math.abs(p.sx) < 1e-3 || Math.abs(p.sy) < 1e-3) return;
  k.save();
  k.globalAlpha *= clamp(p.a);
  k.translate(x, y + hh);
  k.scale(p.sx, p.sy);
  k.translate(-x, -(y + hh));
  draw();
  k.restore();
}
/** 時刻 t0 から出てくる、角の丸い四角（inner は、その上に描く物。札など。絵の座標で描く）。 */
function pbox(k: K, u: number, t0: number, cx: number, cy: number, bw: number, bh: number, r: number, col: string, inner?: () => void) {
  put(k, cx, cy, pose(u, t0), () => { k.fillStyle = col; rr(k, cx - bw / 2, cy - bh / 2, bw, bh, r); k.fill(); inner?.(); }, bh / 2);
}

// 札（Noah で足した部分）: 字の大きさを size から 1 ずつ下げて幅 max に収める。min でも収まらない時は、fillText の幅の指定で詰める（言葉は切らない）。
type Fit = { size: number; min: number; max: number; weight?: number };
type Say = Fit & { color: string; align?: CanvasTextAlign };
function fit(k: K, s: string, o: Fit) {
  let px = o.size;
  for (;;) {
    k.font = `${o.weight ?? 700} ${px}px ${FONT}`;
    const width = k.measureText(s).width;
    if (width <= o.max || px <= o.min) return { px, width: Math.min(width, o.max) };
    px -= 1;
  }
}
/** 札の言葉を 1 つ描く。y は字の真ん中。 */
function label(k: K, s: string | undefined, x: number, y: number, o: Say) {
  if (!s) return;
  fit(k, s, o);
  k.fillStyle = o.color; k.textAlign = o.align ?? 'center'; k.textBaseline = 'middle';
  k.fillText(s, x, y, o.max);
}
/** 札を、時刻 t0 から、ぽよんと出す（字の真ん中の下を基準に伸び縮み）。 */
function say(k: K, u: number, t0: number, s: string | undefined, x: number, y: number, o: Say) {
  if (!s) return;
  const p = pose(u, t0);
  if (p.a <= 0) return;
  const width = fit(k, s, o).width, cx = o.align === 'left' ? x + width / 2 : o.align === 'right' ? x - width / 2 : x;
  put(k, cx, y, p, () => label(k, s, x, y, o), o.size / 2);
}

// @shared
// 01〜08（整理する図）の部品: 線を途中まで引く、矢じり
function pen(k: K, col: string, lw: number) { k.strokeStyle = col; k.lineWidth = lw; k.lineCap = 'round'; k.lineJoin = 'round'; }
// point at distance d along a polyline: {x, y, a (direction), i (segment end index)}
function along(pts: readonly Pt[], d: number) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], s = Math.hypot(x1 - x0, y1 - y0);
    if (d <= s || i === pts.length - 1) { const f = s ? clamp(d / s) : 0; return { x: lerp(x0, x1, f), y: lerp(y0, y1, f), a: Math.atan2(y1 - y0, x1 - x0), i }; }
    d -= s;
  }
  return { x: pts[0][0], y: pts[0][1], a: 0, i: 1 };
}
function pathLen(pts: readonly Pt[]) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
// stroke the first fraction t of a polyline. arrow: arrowhead size at the moving tip (0 = none)
function trace(k: K, pts: readonly Pt[], t: number, arrow = 0, col: string | null = null) {
  if (t <= 0) return;
  const L = pathLen(pts), d = t * L, tip = along(pts, d), end = along(pts, Math.max(0, d - arrow * 0.7));
  k.beginPath(); k.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < end.i; i++) k.lineTo(pts[i][0], pts[i][1]);
  k.lineTo(end.x, end.y); k.stroke();
  if (arrow && d > arrow * 0.8) arrowAt(k, tip.x, tip.y, tip.a, arrow, col ?? (typeof k.strokeStyle === 'string' ? k.strokeStyle : C.mark));
}
function arrowAt(k: K, x: number, y: number, a: number, s: number, col: string) {
  k.save(); k.translate(x, y); k.rotate(a); k.fillStyle = col;
  k.beginPath(); k.moveTo(1, 0); k.lineTo(-s, -s * 0.62); k.lineTo(-s, s * 0.62); k.closePath(); k.fill();
  k.restore();
}
function bezPts(p0: Pt, c0: Pt, c1: Pt, p3: Pt, n = 28): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, m = 1 - t;
    out.push([m * m * m * p0[0] + 3 * m * m * t * c0[0] + 3 * m * t * t * c1[0] + t * t * t * p3[0],
      m * m * m * p0[1] + 3 * m * m * t * c0[1] + 3 * m * t * t * c1[1] + t * t * t * p3[1]]);
  }
  return out;
}

// @element 01
// 01 ベン図: two circles slide in from the sides and overlap; only the shared part turns blue
// Noah: 札は円の外側に（左 = アクセントの字・右 = 字の色。元の A・B の代わり）。円は寄りすぎてぷるんと戻り、寄り終わったら 2 つの円が一緒に揺れる。
// 配色の黄金比: 2 つの円 = メイン（左は淡いメイン）、重なり = アクセント（約 5%）、面 = ベース（約 70%）。
function venn(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const app = easeOut(P(u, 0.3, 0.7)), m = ease(u, 0.5, 1.1);
  if (app <= 0) return;
  const r = 78, cy = h / 2, d = lerp(150, 44, m), ax = w / 2 - d, bx = w / 2 + d;
  k.save(); k.globalAlpha = fade(u) * app;
  put(k, w / 2, cy, wob(u, landed(0.5, 1.1)), () => {
    k.fillStyle = C.blueL; k.beginPath(); k.arc(ax, cy, r, 0, TAU); k.fill();
    k.fillStyle = C.blueM; k.beginPath(); k.arc(bx, cy, r, 0, TAU); k.fill();
    // shared part: B inside A
    k.save(); k.beginPath(); k.arc(ax, cy, r, 0, TAU); k.clip();
    k.fillStyle = C.blue; k.beginPath(); k.arc(bx, cy, r, 0, TAU); k.fill(); k.restore();
    pen(k, C.blueM, 3); k.beginPath(); k.arc(ax, cy, r, 0, TAU); k.stroke();
  }, r);
  const edge = w / 2 - 44 - r - 14;   // the left circle's settled outer edge, minus a gap
  say(k, u, 1.35, L[0], edge, cy + 1, { size: 26, min: 18, max: edge - 12, color: C.accentText, align: 'right' });
  say(k, u, 1.45, L[1], w - edge, cy + 1, { size: 26, min: 18, max: edge - 12, color: C.mark, align: 'left' });
  k.restore();
}

// @element 02
// 02 4象限マトリクス: two axes cross in the middle, four areas appear, items are placed; top-right is the target
// Noah: 札 = [横の軸（矢印の先の右）, 縦の軸（矢印の先の左）, 狙いの点（アクセントの札の中）]。札を置くため、灰色の点を 1 つ上へ動かした。
// 配色の黄金比: 右上（狙い）= メイン、左上・右下 = 淡いメイン、左下 = ベースの淡い色、狙いの点 = アクセントの札（約 5%）。
const MDOTS: readonly [number, number, number][] = [[0.55, -0.62, 1], [0.18, -0.78, 0], [-0.5, -0.45, 0], [-0.3, 0.5, 0], [-0.62, 0.22, 0], [0.45, 0.4, 0], [0.7, 0.62, 0]];
function matrix(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const cx = w / 2, cy = h / 2, hw = 168, hh = 86, gap = 8, qw = hw - 14, qh = hh - 8;
  // four areas
  ([[1, -1], [-1, -1], [-1, 1], [1, 1]] as const).forEach(([sx, sy], i) => {
    const x = sx > 0 ? cx + gap : cx - gap - qw, y = sy > 0 ? cy + gap : cy - gap - qh;
    pbox(k, u, 1.0 + i * 0.08, x + qw / 2, y + qh / 2, qw, qh, 10, i === 0 ? C.blueM : i === 2 ? C.g2 : C.blueL);
  });
  // axes grow from the center out
  const g = ease(u, 0.4, 0.6);
  if (g > 0) {
    pen(k, C.mark, 3);
    k.beginPath(); k.moveTo(cx - hw * g, cy); k.lineTo(cx + (hw - 6) * g, cy); k.stroke();
    k.beginPath(); k.moveTo(cx, cy + hh * g); k.lineTo(cx, cy - (hh - 6) * g); k.stroke();
    const hs = 11 * clamp((g - 0.15) * 3);
    if (hs > 1) { arrowAt(k, cx + hw * g + 2, cy, 0, hs, C.mark); arrowAt(k, cx, cy - hh * g - 2, -Math.PI / 2, hs, C.mark); }
  }
  // items
  MDOTS.forEach(([dx, dy, hot], i) => {
    if (hot) return;
    const x = cx + dx * (hw - 20), y = cy + dy * (hh - 6), r = 8;
    put(k, x, y, pose(u, 1.45 + i * 0.1), () => { k.fillStyle = C.g4; k.beginPath(); k.arc(x, y, r, 0, TAU); k.fill(); }, r);
  });
  // 狙いの点: アクセントの札（字は札 3）。右上の区画の中に収める。
  const TAG: Fit = { size: 18, min: 15, max: qw - 34 }, tw = Math.max(104, fit(k, L[2] ?? '', TAG).width + 34), th = 46;
  const tx = clamp(cx + MDOTS[0][0] * (hw - 20), cx + gap + 8 + tw / 2, cx + gap + qw - 8 - tw / 2), ty = cy - gap - qh / 2;
  pbox(k, u, 1.45, tx, ty, tw, th, th / 2, C.blue, () => label(k, L[2], tx, ty + 1, { ...TAG, color: C.onBlue }));
  say(k, u, 1.0, L[0], cx + hw + 16, cy + 1, { size: 18, min: 15, max: w - 10 - (cx + hw + 16), color: C.mark, align: 'left' });
  say(k, u, 1.08, L[1], cx - 14, cy - hh + 14, { size: 18, min: 15, max: 140, color: C.mark, align: 'right' });
  k.globalAlpha = 1;
}

// @element 03
// 03 ロジックツリー: one box on the left branches to the right, with elbow lines
// Noah: 元の 1 → 2 → 4 を、1 → 3 → 6 にした（札 = [根, 枝 1, 枝 2, 枝 3]）。根と枝の箱は、札の幅に合わせて広げる。根の「?」は根の札にした。
// 配色の黄金比: 根 = アクセント（約 5%）、枝・葉・線 = メイン（約 25%。そのため枝と葉の箱を大きく、線を太くした）、面 = ベース。
function tree(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const ROOT: Fit = { size: 20, min: 16, max: 112 }, BRANCH: Fit = { size: 18, min: 15, max: 124 };
  const RW = Math.max(66, fit(k, L[0] ?? '', ROOT).width + 28), RH = 50, R: Pt = [14 + RW / 2, h / 2];
  const W2 = [1, 2, 3].map((i) => Math.max(84, fit(k, L[i] ?? '', BRANCH).width + 28)), H2 = 44;
  const L2: Pt[] = [40, 104, 168].map((y, i) => [228 + W2[i] / 2, y]);
  const L3: Pt[] = L2.flatMap(([, y]): Pt[] => [[478, y - 15], [478, y + 15]]);
  const W3 = 84, H3 = 27;
  const elbow = (p: Pt, c: Pt, pw: number, cw: number): Pt[] => { const x0 = p[0] + pw / 2, x1 = c[0] - cw / 2, xm = (x0 + x1) / 2; return [[x0, p[1]], [xm, p[1]], [xm, c[1]], [x1, c[1]]]; };
  pen(k, C.blueL, 5);
  L2.forEach((c, i) => trace(k, elbow(R, c, RW, W2[i]), easeInOut(P(u, 0.75, 1.15))));
  L3.forEach((c, i) => trace(k, elbow(L2[i >> 1], c, W2[i >> 1], W3), easeInOut(P(u, 1.35 + i * 0.06, 1.75 + i * 0.06))));
  pbox(k, u, 0.4, R[0], R[1], RW, RH, 10, C.blue, () => label(k, L[0], R[0], R[1] + 1, { ...ROOT, color: C.onBlue }));
  L2.forEach((c, i) => pbox(k, u, 1.05 + i * 0.08, c[0], c[1], W2[i], H2, 9, C.blueM, () => label(k, L[i + 1], c[0], c[1] + 1, { ...BRANCH, color: C.onM })));
  L3.forEach((c, i) => pbox(k, u, 1.65 + i * 0.08, c[0], c[1], W3, H3, 8, C.blueL));
  k.globalAlpha = 1;
}

// @element 04
// 04 ピラミッド図: a triangle in four layers, stacked from the bottom up; the top layer is blue
// Noah: 札 = [いちばん上の段（右に、短い線を引いた先のアクセントの札の中）, 段の名前（下から 2 段目の中）]。段は、元の「上から落ちる」の代わりに、下から順にぽよんと出る。
// 配色の黄金比: 下の 3 段 = メイン（約 25%。そのため幅を 168 から 196 に）、いちばん上の段と札 = アクセント（約 5%）、面 = ベース。
function pyramid(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const top = 16, base = 192, hwB = 196, n = 4, gp = 6, cx = 232;
  const th = (base - top - gp * (n - 1)) / n, half = (y: number) => hwB * (y - top) / (base - top);
  const cols = [C.blueL, C.blueL, C.blueM, C.blue];
  for (let i = 0; i < n; i++) {                       // i = 0 bottom
    const yb = base - i * (th + gp), yt = yb - th;
    put(k, cx, (yt + yb) / 2, pose(u, 0.4 + i * 0.32), () => {
      k.fillStyle = cols[i]; k.beginPath();
      if (i === n - 1) { k.moveTo(cx, top); }
      else { k.moveTo(cx - half(yt), yt); k.lineTo(cx + half(yt), yt); }
      k.lineTo(cx + half(yb), yb); k.lineTo(cx - half(yb), yb); k.closePath(); k.fill();
    }, th / 2);
  }
  const ty = top + th / 2, tx = cx + half(top + th) + 26;
  const pa = clamp(pose(u, 1.5).a);
  if (pa > 0) {
    k.save(); k.globalAlpha *= pa;
    pen(k, C.blue, 3); k.beginPath(); k.moveTo(cx + half(ty) + 10, ty); k.lineTo(tx - 2, ty); k.stroke();
    k.restore();
  }
  const TAG: Fit = { size: 20, min: 15, max: w - 12 - tx - 28 }, tw = Math.max(84, fit(k, L[0] ?? '', TAG).width + 32), tagH = 44;
  pbox(k, u, 1.5, tx + tw / 2, ty, tw, tagH, tagH / 2, C.blue, () => label(k, L[0], tx + tw / 2, ty + 1, { ...TAG, color: C.onBlue }));
  // 段の名前は、下から 2 段目の中に（左に広げた分、外の左には字を置く幅が無いため）。
  const y1 = base - (th + gp) - th / 2;
  say(k, u, 0.9, L[1], cx, y1 + 1, { size: 20, min: 16, max: 2 * half(y1 - th / 2) - 28, color: C.onL });
  k.globalAlpha = 1;
}

// @element 05
// 05 マインドマップ: a center word, curved branches out to both sides, then smaller twigs
// Noah: 札 = [真ん中, 右上の枝, 右下の枝, 左上の枝, 左下の枝]。札のある枝の箱は、札の幅に合わせて広げる（真ん中の 2 本は、元の通り字の無い小さな箱）。
// 配色の黄金比: 真ん中 = アクセント（約 5%）、枝・小枝・線 = メイン（約 25%。札のある枝はメイン、他は淡いメイン。そのため箱を大きく、線を太くした）、面 = ベース。
const MM: readonly [number, number, number, 'blueM' | 'blueL', readonly Pt[]][] = [
  // [side, end dx, end dy, color role, twigs [dx, dy]]
  [1, 128, -52, 'blueM', [[214, -72], [214, -32]]],
  [1, 142, 8, 'blueL', []],
  [1, 124, 56, 'blueM', [[214, 76]]],
  [-1, 128, -52, 'blueM', [[214, -70]]],
  [-1, 140, 10, 'blueL', []],
  [-1, 124, 56, 'blueM', [[208, 36], [214, 76]]],
];
const MM_LABEL = [1, -1, 2, 3, -1, 4];          // branch → label index (-1 = no label)
function mindmap(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const cx = w / 2, cy = h / 2, BRANCH: Fit = { size: 17, min: 15, max: 76 }, CENTER: Fit = { size: 19, min: 16, max: 184 };
  MM.forEach(([sd, ex, ey, role, twigs], i) => {
    const col = C[role];
    const text = MM_LABEL[i] < 0 ? '' : L[MM_LABEL[i]] ?? '';
    const pw = text ? Math.max(64, fit(k, text, BRANCH).width + 28) : 72, ph = text ? 40 : 32;
    const x0 = cx + sd * 40, x1 = cx + sd * ex, y1 = cy + ey;
    const pts = bezPts([x0, cy], [cx + sd * 78, cy], [cx + sd * (ex - 50), y1], [x1 - sd * 26, y1]);
    pen(k, col, 5); trace(k, pts, easeInOut(P(u, 0.7 + i * 0.09, 1.2 + i * 0.09)));
    twigs.forEach(([tx, ty], j) => {
      const a: Pt = [x1 + sd * Math.max(26, pw / 2), y1], b: Pt = [cx + sd * tx - sd * 30, cy + ty], t0 = 1.45 + i * 0.07 + j * 0.05;
      const tp = bezPts(a, [a[0] + sd * 22, a[1]], [b[0] - sd * 26, b[1]], b, 16);
      pen(k, C.blueL, 4); trace(k, tp, easeInOut(P(u, t0, t0 + 0.35)));
      pbox(k, u, t0 + 0.3, cx + sd * tx, cy + ty, 60, 28, 14, C.blueL);
    });
    pbox(k, u, 1.15 + i * 0.09, x1, y1, pw, ph, ph / 2, col, text ? () => label(k, text, x1, y1 + 1, { ...BRANCH, color: role === 'blueM' ? C.onM : C.onL }) : undefined);
  });
  const cw = Math.max(100, fit(k, L[0] ?? '', CENTER).width + 36);
  pbox(k, u, 0.4, cx, cy, cw, 48, 24, C.blue, () => label(k, L[0], cx, cy + 1, { ...CENTER, color: C.onBlue }));
  k.globalAlpha = 1;
}

// @element 06
// 06 フローチャート: start -> step -> decision (diamond) -> step -> end, with a "No" loop back;
// then a marker walks the path once (loops back once, then goes on to the end)
// Noah: 図を下げ、札 = [始め, ひし形（確かめる事）, 次の箱, 終わり]（次の箱だけ下、他は上。最初の箱は、元の通り字なし）。ひし形の「?」は残す。
// 配色の黄金比: ひし形 = アクセント（約 5%）、始め・終わり・箱・矢印 = メイン（約 25%。そのため形を大きく、矢印を太くした）、面 = ベース。
function flow(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const y = 96, S: Pt = [47, y], A: Pt = [150.75, y], D: Pt = [269.5, y], B: Pt = [388.25, y], E: Pt = [492, y], LY = 178;
  const dw = 50, dh = 44, sw = 35, aw = 46, ah = 38;           // half sizes: diamond, start/end, step boxes
  const arrows: Pt[][] = [
    [[S[0] + sw, y], [A[0] - aw - 2, y]],
    [[A[0] + aw, y], [D[0] - dw - 2, y]],
    [[D[0] + dw, y], [B[0] - aw - 2, y]],
    [[B[0] + aw, y], [E[0] - sw - 2, y]],
  ];
  const loop: Pt[] = [[D[0], y + dh], [D[0], LY], [A[0], LY], [A[0], y + ah + 2]];
  const tA = [0.6, 1.0, 1.4, 1.75];
  pen(k, C.blueM, 5);
  arrows.forEach((pts, i) => trace(k, pts, easeInOut(P(u, tA[i], tA[i] + 0.22)), 10, C.blueM));
  trace(k, loop, easeInOut(P(u, 2.0, 2.45)), 10, C.blueM);
  // shapes
  pbox(k, u, 0.4, S[0], S[1], sw * 2, 64, 30, C.blueL);
  pbox(k, u, 0.8, A[0], A[1], aw * 2, ah * 2, 8, C.blueM);
  put(k, D[0], D[1], pose(u, 1.2), () => {
    k.fillStyle = C.blue;
    k.beginPath(); k.moveTo(D[0], D[1] - dh); k.lineTo(D[0] + dw, D[1]); k.lineTo(D[0], D[1] + dh); k.lineTo(D[0] - dw, D[1]); k.closePath(); k.fill();
    txt(k, '?', D[0], D[1] + 2, `700 26px ${FONT}`, C.onBlue, 'center', 'middle');
  }, dh);
  pbox(k, u, 1.6, B[0], B[1], aw * 2, ah * 2, 8, C.blueM);
  pbox(k, u, 1.95, E[0], E[1], sw * 2, 64, 30, C.blueL);
  // labels: above the start, the diamond and the end; below the next step (so that neighbours never touch)
  ([[S, 0.4, C.mark, 36, 88], [D, 1.2, C.accentText, 36, 108], [B, 1.6, C.mark, y + ah + 18, 108], [E, 1.95, C.mark, 36, 88]] as const).forEach(([p, t, col, ly, max], i) => {
    say(k, u, t + 0.2, L[i], clamp(p[0], 2 + max / 2, w - 2 - max / 2), ly, { size: 18, min: 15, max, color: col });
  });
  // marker: start -> A -> D -> (No) loop -> A -> D -> (Yes) -> B -> E
  const path: Pt[] = [S, A, D, [D[0], LY], [A[0], LY], A, D, B, E];
  const m = P(u, 2.6, 3.8);
  const a = Math.min(P(u, 2.5, 2.65), 1 - P(u, 3.8, 4.0));
  if (a > 0) {
    const q = along(path, easeInOut(m) * pathLen(path));
    k.save(); k.globalAlpha *= a; k.fillStyle = C.mark; k.beginPath(); k.arc(q.x, q.y, 8, 0, TAU); k.fill(); k.restore();
  }
  k.globalAlpha = 1;
}

// @element 07
// 07 サイクル図: four steps on a ring; arrows draw one after another until the ring closes,
// then the highlight goes round the ring once
// Noah: 丸を 45° 回して（右上から時計回り）、札 = [1, 2, 3, 4 の丸の札] を丸の外の左右に置く。丸の中の順番の数字は残す。
// 配色の黄金比: 輪の内側の面・輪・丸 = メイン（約 25%。内側を淡いメインで塗り、丸を大きく、輪を太くした）、
// 光が 1 周して最後に止まる 4 番目の丸 = アクセント（約 5%）、面 = ベース。
function cycle(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const cx = w / 2, cy = h / 2, RX = 128, RY = 70, nr = 38, n = 4;
  const ang = (i: number) => -Math.PI / 4 + i * TAU / n, pos = (a: number): Pt => [cx + Math.cos(a) * RX, cy + Math.sin(a) * RY];
  // 輪の内側の面（淡いメイン）。輪と一緒に、真ん中からぽよんと出る。
  put(k, cx, cy, pose(u, 0.3), () => { k.fillStyle = C.blueL; k.beginPath(); k.ellipse(cx, cy, RX - 22, RY - 14, 0, 0, TAU); k.fill(); }, RY - 14);
  for (let i = 0; i < n; i++) {
    const t = easeInOut(P(u, 0.7 + i * 0.32, 0.98 + i * 0.32));
    if (t <= 0) continue;
    const A = pos(ang(i)), B = pos(ang(i + 1)), pts: Pt[] = [];
    for (let j = 0; j <= 60; j++) {
      const q = pos(lerp(ang(i), ang(i + 1), j / 60));
      if (Math.hypot(q[0] - A[0], q[1] - A[1]) > nr + 6 && Math.hypot(q[0] - B[0], q[1] - B[1]) > nr + 8) pts.push(q);
    }
    pen(k, C.blueM, 6); trace(k, pts, t, 14, C.blueM);
  }
  // highlight going round: 2.2s -> 3.8s, 0.4s per step, soft edges
  const hp = P(u, 2.2, 3.8) * n;
  for (let i = 0; i < n; i++) {
    const dd = hp - i;
    const on = (u > 2.15 && u < 4.0 && dd > -0.25 && dd < 1.25) ? clamp(Math.min(dd + 0.25, 1.25 - dd) * 2.5) : 0;
    const [x, y] = pos(ang(i));
    // 4 番目の丸は、光が 1 周して止まった所なので、アクセントのまま残る。
    const stay = i === n - 1 ? clamp((u - 3.7) / 0.3) : 0, lit = Math.max(on, stay);
    put(k, x, y, pose(u, 0.4 + i * 0.32), () => {
      k.fillStyle = C.blueM; k.beginPath(); k.arc(x, y, nr, 0, TAU); k.fill();
      if (lit > 0) { k.save(); k.globalAlpha *= lit; k.fillStyle = C.blue; k.beginPath(); k.arc(x, y, nr, 0, TAU); k.fill(); k.restore(); }
      txt(k, String(i + 1), x, y + 1, `700 26px ${FONT}`, lit > 0.5 ? C.onBlue : C.onM, 'center', 'middle');
    }, nr);
    const right = x > cx, lx = right ? x + nr + 12 : x - nr - 12;
    say(k, u, 0.6 + i * 0.32, L[i], lx, y + 1, { size: 20, min: 16, max: right ? w - 4 - lx : lx - 4, color: C.mark, align: right ? 'left' : 'right' });
  }
  k.globalAlpha = 1;
}

// @element 08
// 08 フィッシュボーン図: a spine runs right to the head (the result); slanted bones join it from above
// and below, each with small side bones (the causes)
// Noah: 札 = [頭（元の「結果」）, 左上の骨の先の箱, 左下の骨の先の箱]。骨の先に、原因の分類の箱を置いた（石川図の作り）。骨を 80 から 72 に短くした。
// 配色の黄金比: 頭 = アクセント（約 5%）、骨・小骨・分類の箱 = メイン（約 25%。札のある箱はメイン、他は淡いメイン）、背骨と尾 = 字の色、面 = ベース。
function fishbone(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const y = h / 2, x0 = 52, x1 = 404, hx = 452, BL = 72, BX = 56;
  // tail
  const ta = easeOut(P(u, 0.35, 0.6));
  if (ta > 0) {
    k.save(); k.globalAlpha *= ta; pen(k, C.mark, 3);
    k.beginPath(); k.moveTo(x0 - 26, y - 22); k.lineTo(x0, y); k.lineTo(x0 - 26, y + 22); k.stroke(); k.restore();
  }
  // spine
  const sp = easeInOut(P(u, 0.45, 1.0));
  if (sp > 0) { pen(k, C.mark, 3); trace(k, [[x0, y], [x1, y]], sp, 14, C.mark); }
  // head
  pbox(k, u, 0.95, hx + 8, y, 92, 56, 12, C.blue, () => label(k, L[0], hx + 8, y + 1, { size: 20, min: 15, max: 76, color: C.onBlue }));
  // big bones: root on the spine at bx, tip up-left / down-left
  const bones = [[150, -1], [258, -1], [366, -1], [150, 1], [258, 1], [366, 1]] as const;
  bones.forEach(([bx, sd], i) => {
    const a = 1.1 + (i % 3) * 0.14 + (sd > 0 ? 0.07 : 0);
    const t = easeInOut(P(u, a, a + 0.35));
    if (t <= 0) return;
    const tip: Pt = [bx - BX, y + sd * BL];
    pen(k, C.blueM, 7); trace(k, [[bx, y], tip], t);
    // small bones (horizontal, pointing left) at 1/3 and 2/3 of the bone
    [0.36, 0.68].forEach((f, j) => {
      const st = ease(u, a + 0.38 + j * 0.08, 0.22);
      if (st <= 0) return;
      const px = lerp(tip[0], bx, f), py = lerp(tip[1], y, f);
      pen(k, C.blueL, 5); k.beginPath(); k.moveTo(px, py); k.lineTo(px - 30 * st, py); k.stroke();
    });
  });
  // 骨の先の分類の箱（左の 2 つに札 1・2。箱は、隣の箱と重ならないように、骨の先から左へ寄せる）。
  const BOX: Fit = { size: 18, min: 15, max: 112 };
  bones.forEach(([bx, sd], i) => {
    const li = i === 0 ? 1 : i === 3 ? 2 : -1, text = li > 0 ? L[li] ?? '' : '';
    const bw = text ? clamp(fit(k, text, BOX).width + 26, 92, 138) : 92, bh = 40, tipx = bx - BX, by = y + sd * (BL - 6);
    const x = clamp(tipx, 8 + bw / 2, tipx + 46 - bw / 2), a = 1.25 + (i % 3) * 0.14 + (sd > 0 ? 0.07 : 0);
    pbox(k, u, a + 0.3, x, by, bw, bh, 9, text ? C.blueM : C.blueL, text ? () => label(k, text, x, by + 1, { ...BOX, color: C.onM }) : () => { rr(k, x - 24, by - 3, 48, 6, 3); k.fillStyle = C.chip; k.fill(); });
  });
  k.globalAlpha = 1;
}

// @shared
// 09〜16（数字を見せるグラフ）の部品: 色を混ぜる、直線、L字の軸と目盛り線、点。軸は1周ずっと出したまま、データだけ 4.15〜4.55秒で消える
function hexRGB(c: string) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a: string, b: string, t: number) {   // hex in, hex out
  const A = hexRGB(a), B = hexRGB(b);
  return '#' + [0, 1, 2].map((i) => Math.round(lerp(A[i], B[i], clamp(t))).toString(16).padStart(2, '0')).join('');
}
const dataFade = (u: number, a = 4.15, b = 4.55) => 1 - easeInOut(P(u, a, b));
function seg(k: K, x0: number, y0: number, x1: number, y1: number, col: string, lw = 2.5, dash?: number[]) {
  k.strokeStyle = col; k.lineWidth = lw; k.lineCap = 'round'; k.lineJoin = 'round';
  if (dash) k.setLineDash(dash);
  k.beginPath(); k.moveTo(x0, y0); k.lineTo(x1, y1); k.stroke();
  if (dash) k.setLineDash([]);
}
// L-shaped axes with a few light grid lines
function axes(k: K, x0: number, y0: number, x1: number, y1: number, grid = 3) {
  for (let i = 1; i <= grid; i++) { const y = lerp(y1, y0, i / (grid + 0.4)); seg(k, x0 + 4, y, x1, y, C.g2, 2); }
  seg(k, x0, y0, x0, y1, C.g4, 2.5);
  seg(k, x0, y1, x1, y1, C.g4, 2.5);
}
function dot(k: K, x: number, y: number, r: number, col: string) { if (r <= 0.05) return; k.fillStyle = col; k.beginPath(); k.arc(x, y, r, 0, Math.PI * 2); k.fill(); }
const SC = { x0: 96, x1: 448, y0: 24, y1: 184 };   // plot area shared by 09 scatter and 10 bubble
// Noah: 軸の札（横の軸 = 軸の右端の下・縦の軸 = 軸の上の左）。軸と一緒に出す。
function axisLabels(k: K, u: number, x: string | undefined, y: string | undefined) {
  say(k, u, 0.3, x, SC.x1, SC.y1 + 13, { size: 16, min: 14, max: 300, color: C.sub, align: 'right' });
  say(k, u, 0.35, y, SC.x0 - 6, SC.y0 - 12, { size: 16, min: 14, max: 320, color: C.sub, align: 'left' });
}

// @element 09
// 09 散布図: many small dots pop in from left to right, rising to the right; a dashed trend line follows
// Noah: 札 = [横の軸, 縦の軸]。点は、左から 1 つずつぽよんと出る。
// 配色の黄金比: 傾きの帯（点が集まる幅。淡いメイン）と点 = メイン（約 25%）、傾きの線と右上の 10 の点 = アクセント（約 5%）、面・軸 = ベース。
const SCPTS = (() => {
  const r = rand(907), pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 52; i++) {
    const x = 0.04 + r() * 0.92;
    const y = clamp(0.1 + 0.74 * x + (r() + r() - 1) * 0.2, 0.05, 0.95);
    pts.push({ x, y });
  }
  return pts.sort((a, b) => a.x - b.x);
})();
function scatter(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const A = SC; axes(k, A.x0, A.y0, A.x1, A.y1);
  axisLabels(k, u, L[0], L[1]);
  const fo = dataFade(u);
  k.save(); k.globalAlpha = fo;
  const X = (x: number) => lerp(A.x0 + 10, A.x1 - 8, x), Y = (y: number) => lerp(A.y1 - 8, A.y0 + 6, y);
  // trend line (drawn after the dots)
  const xa = X(0.02), ya = Y(0.11), xb = X(0.98), yb = Y(0.83), band = 48;
  // 傾きの帯: 点より先に、左から右へ塗られる。
  const bp = easeInOut(P(u, 0.3, 1.6));
  if (bp > 0) {
    const xe = lerp(xa, xb, bp), ye = lerp(ya, yb, bp);
    k.save(); k.beginPath(); k.rect(A.x0 + 3, A.y0, A.x1 - A.x0 - 3, A.y1 - A.y0 - 3); k.clip();
    k.fillStyle = C.blueL; k.beginPath(); k.moveTo(xa, ya - band); k.lineTo(xe, ye - band); k.lineTo(xe, ye + band); k.lineTo(xa, ya + band); k.closePath(); k.fill();
    k.restore();
  }
  const hot = SCPTS.slice(-10);
  for (const p of SCPTS) {
    const x = X(p.x), y = Y(p.y), top = hot.includes(p);
    put(k, x, y, pose(u, 0.4 + p.x * 1.25), () => dot(k, x, y, top ? 10 : 6, top ? C.blue : C.blueM), top ? 10 : 6);
  }
  const tl = easeInOut(P(u, 1.85, 2.5));
  if (tl > 0) seg(k, xa, ya, lerp(xa, xb, tl), lerp(ya, yb, tl), C.blue, 6);
  k.restore();
}

// @element 10
// 10 バブルチャート: a few semi-transparent circles of different sizes grow on the axes
// Noah: 札 = [いちばん大きい円（アクセント。円の中）, 横の軸]。
// 配色の黄金比: 円 = メイン（約 25%。透けない円にして、数と大きさを増やした）、いちばん大きい円 = アクセント（約 5%）、面・軸 = ベース。
const BB: readonly [number, number, number, number][] = [   // x, y (0..1 in the plot), radius px, emphasized
  [0.12, 0.30, 36, 0], [0.3, 0.66, 48, 0], [0.47, 0.26, 38, 0], [0.25, 0.12, 22, 0], [0.5, 0.78, 26, 0], [0.86, 0.72, 28, 0], [0.9, 0.24, 32, 0], [0.68, 0.56, 44, 1],
];
function bubble(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const A = SC; axes(k, A.x0, A.y0, A.x1, A.y1);
  axisLabels(k, u, L[1], undefined);
  const fo = dataFade(u);
  const X = (x: number) => lerp(A.x0 + 10, A.x1 - 8, x), Y = (y: number) => lerp(A.y1 - 8, A.y0 + 6, y);
  BB.forEach(([bx, by, br, em], i) => {
    const x = X(bx), y = Y(by), col = em ? C.blue : i % 2 ? C.blueM : C.blueL;
    k.save(); k.globalAlpha = fo;
    put(k, x, y, pose(u, 0.45 + i * 0.17), () => {
      dot(k, x, y, br, col);
      k.strokeStyle = C.stage; k.lineWidth = 2; k.beginPath(); k.arc(x, y, br, 0, Math.PI * 2); k.stroke();
    }, br);
    if (em) say(k, u, 1.75, L[0], x, y + 1, { size: 18, min: 14, max: 2 * br - 12, color: C.onBlue });
    k.restore();
  });
}

// @element 11
// 11 ヒートマップ: a table of cells; shades of blue sweep across it like a wave
// Noah: 行を 5 から 4 にして、上に見出し（札 1 = 表の名前・札 3 = 濃さの名前と、5 段の濃さの見本）。札 2 は、いちばん濃い列の下の青い札。
// マスは、灰色の下地の上に、色のマスが 1 つずつぽよんと出る（波のように）。
const HM = (() => {
  const r = rand(1103), cols = 12, rows = 4, v: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const base = 0.5 + 0.42 * Math.sin(i * 0.62 - 0.4) * Math.cos(j * 0.85 - 1.1) + (r() - 0.5) * 0.28;
    v.push(clamp(Math.floor(clamp(base, 0, 0.999) * 5), 0, 4));
  }
  let hot = 0, best = -1;
  for (let i = 0; i < cols; i++) { let sum = 0; for (let j = 0; j < rows; j++) sum += v[j * cols + i]; if (sum > best) { best = sum; hot = i; } }
  return { cols, rows, v, hot };
})();
/**
 * ヒートマップの 5 段の濃さ: 淡いメイン → その間の 2 段 → メイン → アクセント（いちばん濃い段だけがアクセント）。
 * 配色の黄金比: マスの 4 段 = メイン（約 25%。そのためマスを 30×28 から 27×26 に小さく）、いちばん濃い段 = アクセント（約 5%）、面・行の名前 = ベース。
 */
const hmcol = () => [C.blueL, mix(C.blueL, C.blueM, 0.33), mix(C.blueL, C.blueM, 0.67), C.blueM, C.blue];
function heatmap(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const { cols, rows, v, hot } = HM, HMCOL = hmcol();
  const cw = 27, ch = 26, g = 4, gx = 104, gy = 44, gw = cols * (cw + g) - g, gh = rows * (ch + g) - g;
  // row labels (short gray bars) so it reads as a table
  for (let j = 0; j < rows; j++) { rr(k, 46, gy + j * (ch + g) + ch / 2 - 4, 36, 8, 4); k.fillStyle = C.g3; k.fill(); }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = gx + i * (cw + g), y = gy + j * (ch + g);
    rr(k, x, y, cw, ch, 4); k.fillStyle = C.g2; k.fill();
    const tin = 0.4 + i * 0.075 + j * 0.06, tout = 3.95 + i * 0.025 + j * 0.02, out = 1 - easeInOut(P(u, tout, tout + 0.22));
    if (out <= 0) continue;
    k.save(); k.globalAlpha *= out;
    put(k, x + cw / 2, y + ch / 2, pose(u, tin), () => { rr(k, x, y, cw, ch, 4); k.fillStyle = HMCOL[v[j * cols + i]]; k.fill(); }, ch / 2);
    k.restore();
  }
  k.save(); k.globalAlpha = fade(u);
  say(k, u, 0.3, L[0], 46, 22, { size: 18, min: 15, max: 200, color: C.mark, align: 'left' });
  const rx = gx + gw - (5 * 14 + 4 * 3);
  HMCOL.forEach((col, i) => put(k, rx + i * 17 + 7, 22, pose(u, 0.35 + i * 0.06), () => { rr(k, rx + i * 17, 15, 14, 14, 3); k.fillStyle = col; k.fill(); }, 7));
  say(k, u, 0.4, L[2], rx - 10, 22, { size: 16, min: 14, max: 120, color: C.sub, align: 'right' });
  const x = gx + hot * (cw + g) + cw / 2;
  put(k, x, gy + gh + 8, pose(u, 1.7), () => arrowAt(k, x, gy + gh + 5, -Math.PI / 2, 7, C.blue), 4);
  say(k, u, 1.75, L[1], clamp(x, 102, w - 102), gy + gh + 24, { size: 17, min: 14, max: 180, color: C.accentText });
  k.restore();
}

// @element 12
// 12 レーダーチャート: a spider-web scale; a gray polygon, then the blue polygon spreads out from the center
// Noah: 札 = [左上, 右上, 右下, 左下 の軸の名前]（上と下の軸は、字を置く所が無いので札なし）。形は広がりすぎてぷるんと戻り、前に出る形の角の点はぽよんと出る。
// 配色の黄金比: 目盛りの六角形の面（淡いメイン）・前に出る形・軸の名前の札 = メイン（約 25%。そのため半径を 86 から 94 に）、その形の縁と角の点 = アクセント（約 5%）、
// 比べる形（点線）・目盛りの線・面 = ベース。
const RA = [0.92, 0.58, 0.84, 0.4, 0.76, 0.52];
const RB = [0.55, 0.74, 0.46, 0.72, 0.5, 0.66];
const RL: readonly [number, CanvasTextAlign][] = [[5, 'right'], [1, 'left'], [2, 'left'], [4, 'right']];
function radarPath(k: K, cx: number, cy: number, R: number, vals: readonly number[], s: number) {
  k.beginPath();
  vals.forEach((v, i) => {
    const a = -Math.PI / 2 + i / vals.length * Math.PI * 2, r = R * v * s;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) k.lineTo(x, y); else k.moveTo(x, y);
  });
  k.closePath();
}
function radar(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const cx = w / 2, cy = h / 2 + 2, R = 94, n = 6;
  k.lineJoin = 'round';
  radarPath(k, cx, cy, R, Array.from({ length: n }, () => 1), 1);
  k.fillStyle = C.blueL; k.fill();
  for (let ring = 1; ring <= 4; ring++) {
    radarPath(k, cx, cy, R, Array.from({ length: n }, () => ring / 4), 1);
    k.strokeStyle = C.stage; k.lineWidth = 2; k.stroke();
  }
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i / n * Math.PI * 2;
    seg(k, cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R, C.stage, 2);
  }
  // 軸の名前は、淡いメインの札に入れる（札も、図の形の一部としてメインの色に数える）。
  const LAB: Fit = { size: 17, min: 14, max: 136 };
  RL.forEach(([i, align], j) => {
    const text = L[j];
    if (!text) return;
    const a = -Math.PI / 2 + i / n * Math.PI * 2, ax = cx + Math.cos(a) * (R + 12), ay = cy + Math.sin(a) * R;
    const pw = fit(k, text, LAB).width + 22, px = align === 'right' ? ax - pw / 2 : ax + pw / 2;
    pbox(k, u, 0.3 + j * 0.06, px, ay, pw, 30, 15, C.blueL, () => label(k, text, px, ay + 1, { ...LAB, color: C.onL }));
  });
  const fo = dataFade(u);
  const sb = ease(u, 0.4, 0.7);
  if (sb > 0.01) {
    k.save(); k.globalAlpha = fo;
    radarPath(k, cx, cy, R, RB, sb);
    k.setLineDash([6, 5]); k.strokeStyle = C.g4; k.lineWidth = 2.5; k.stroke(); k.setLineDash([]);
    k.restore();
  }
  const sa = ease(u, 0.95, 0.9);
  if (sa > 0.01) {
    k.save(); k.globalAlpha = fo;
    radarPath(k, cx, cy, R, RA, sa);
    k.fillStyle = C.blueM; k.fill();
    k.strokeStyle = C.blue; k.lineWidth = 7; k.stroke();
    RA.forEach((v, i) => {
      const a = -Math.PI / 2 + i / n * Math.PI * 2, r = R * v * sa, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      put(k, x, y, pose(u, 1.2 + i * 0.06), () => dot(k, x, y, 9.5, C.blue), 9.5);
    });
    k.restore();
  }
}

// @element 13
// 13 ゲージチャート: a half-circle meter; the needle swings past and settles
// Noah: 下の「72%」の数の代わりに札 1（測る物）。札 2 は、目盛りの右の端（いっぱいの所）の名前。針の位置は形だけ（数は描かない）。
// 針は、元（cos(7.5t)）より細かく、ぷるぷる揺れて止まる。
// 配色の黄金比: 目盛りの帯（満ちた所 = メイン・残り = 淡いメイン）と文字盤（淡いメイン）= メイン（約 25%。半径を 120 から 126 に、帯を 30 から 48 に太くした）、
// 針と札 1 の札 = アクセント（約 5%）、面 = ベース。
function needle(u: number) {
  const t = u - 0.5;
  return t <= 0 ? 0 : 1 - Math.exp(-3.2 * t) * Math.cos(11 * t);
}
function gauge(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const cx = w / 2, cy = 152, R = 126, T = 48, V = 0.72, face = R - T - 2;
  const f = V * needle(u) * (1 - easeInOut(P(u, 4.1, 4.5)));
  k.fillStyle = C.blueL; k.beginPath(); k.moveTo(cx - face, cy); k.arc(cx, cy, face, Math.PI, Math.PI * 2); k.closePath(); k.fill();
  k.lineCap = 'butt';
  k.strokeStyle = C.blueL; k.lineWidth = T;
  k.beginPath(); k.arc(cx, cy, R - T / 2, Math.PI, Math.PI * 2); k.stroke();
  if (f > 0.002) {
    k.strokeStyle = C.blueM; k.lineWidth = T;
    k.beginPath(); k.arc(cx, cy, R - T / 2, Math.PI, Math.PI + Math.PI * f); k.stroke();
  }
  for (let i = 0; i <= 10; i++) {   // ticks every 10% (on the dial face)
    const a = Math.PI + Math.PI * i / 10, r0 = face - 6, r1 = face - (i % 5 === 0 ? 18 : 12);
    seg(k, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, C.stage, 2.5);
  }
  const a = Math.PI + Math.PI * f, Ln = R - 18, bw = 11;
  const ca = Math.cos(a), sa = Math.sin(a);
  k.fillStyle = C.blue; k.beginPath();
  k.moveTo(cx + ca * Ln, cy + sa * Ln);
  k.lineTo(cx - sa * bw, cy + ca * bw);
  k.lineTo(cx - ca * 14, cy - sa * 14);
  k.lineTo(cx + sa * bw, cy - ca * bw);
  k.closePath(); k.fill();
  dot(k, cx, cy, 19, C.blue);
  dot(k, cx, cy, 7, C.stage);
  k.save(); k.globalAlpha = fade(u);
  say(k, u, 0.3, L[1], cx + R + 14, cy - 2, { size: 18, min: 15, max: w - 12 - (cx + R + 14), color: C.sub, align: 'left' });
  const TAG: Fit = { size: 22, min: 16, max: 260 }, tw = Math.max(110, fit(k, L[0] ?? '', TAG).width + 36);
  pbox(k, u, 0.9, cx, cy + 38, tw, 30, 15, C.blue, () => label(k, L[0], cx, cy + 39, { ...TAG, color: C.onBlue }));
  k.restore();
}

// @element 14
// 14 複合グラフ（棒＋折れ線）: bars on the left scale (gray ticks), a dotted line on the right scale (blue ticks)
// Noah: 左上に凡例（札 1 = 棒・札 2 = 折れ線）。棒は伸びすぎてぷるんと戻り、点はぽよんと出る。
// 配色の黄金比: 棒 = メイン（約 25%。棒の幅を 36 から 46 に）、折れ線・点・右の目盛り = アクセント（約 5%。線を太く、点を大きく）、面・左の目盛り = ベース。
const CB = [42, 55, 50, 66, 74, 88];       // bars (left scale, % of height)
const CL = [26, 34, 52, 46, 64, 80];       // line (right scale, % of height)
function combo(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const floor = 186, top = 24, sc = (floor - top) / 100, x0 = 86, x1 = 452, slot = (x1 - x0) / CB.length, bw = 46;
  for (let i = 1; i <= 3; i++) { const y = lerp(floor, top, i / 3.4); seg(k, x0 + 4, y, x1 - 4, y, C.g2, 2); }
  seg(k, x0, top, x0, floor, C.g4, 2.5);
  seg(k, x1, top, x1, floor, C.blue, 3.5);
  seg(k, x0, floor, x1, floor, C.g4, 2.5);
  for (let i = 0; i <= 4; i++) {   // two different scales: gray ticks on the left, blue ticks on the right
    const y = lerp(floor, top, i / 4);
    seg(k, x0 - 10, y, x0, y, C.g4, 2.5);
    seg(k, x1, y, x1 + 12, y, C.blue, 3.5);
  }
  put(k, 112, 56, pose(u, 0.3), () => { rr(k, 104, 48, 16, 16, 3); k.fillStyle = C.blueL; k.fill(); }, 8);
  say(k, u, 0.34, L[0], 130, 56, { size: 17, min: 14, max: 140, color: C.mark, align: 'left' });
  put(k, 112, 80, pose(u, 0.4), () => { seg(k, 100, 80, 124, 80, C.blue, 5); dot(k, 112, 80, 8, C.blue); dot(k, 112, 80, 3, C.stage); }, 8);
  say(k, u, 0.44, L[1], 130, 80, { size: 17, min: 14, max: 140, color: C.mark, align: 'left' });
  const fo = dataFade(u);
  k.save(); k.globalAlpha = fo;
  CB.forEach((v, i) => {
    const p = ease(u, 0.4 + i * 0.12, 0.36);
    if (p <= 0) return;
    const hh = v * sc * p;
    rr(k, x0 + slot * (i + 0.5) - bw / 2, floor - hh, bw, hh, 3); k.fillStyle = C.blueL; k.fill();
  });
  const pts: Pt[] = CL.map((v, i) => [x0 + slot * (i + 0.5), floor - v * sc]);
  const pl = P(u, 1.3, 2.2) * (pts.length - 1);
  if (pl > 0) {
    k.strokeStyle = C.blue; k.lineWidth = 6; k.lineJoin = 'round'; k.lineCap = 'round';
    k.beginPath(); k.moveTo(pts[0][0], pts[0][1]);
    const n = Math.floor(pl);
    for (let i = 1; i <= n; i++) k.lineTo(pts[i][0], pts[i][1]);
    if (n < pts.length - 1) { const f = pl - n; k.lineTo(lerp(pts[n][0], pts[n + 1][0], f), lerp(pts[n][1], pts[n + 1][1], f)); }
    k.stroke();
  }
  pts.forEach(([x, y], i) => put(k, x, y, pose(u, 1.25 + i * 0.18), () => { dot(k, x, y, 11, C.blue); dot(k, x, y, 4, C.stage); }, 11));
  k.restore();
}

// @element 15
// 15 絵グラフ（ピクトグラム）: 10 people in one row pop in gray, then 3 of them turn blue
// Noah: 「30%」と「10人中3人」の代わりに、札 1（大きくアクセントの字）と札 2（小さく薄い字）。人は、足元を基準に 1 人ずつぽよんと出る。
// 配色の黄金比: 7 人と床の台 = メイン（約 25%。人を 80 から 112 の高さにして、10 人から 9 人に。床を台に）、前の 2 人 = アクセント（約 5%。元の 3 人から 2 人に）、面 = ベース。
// faceless pictogram person (the same parts as the camera packs). x,y = feet, h = height in px. o.col: color
function person(k: K, x: number, y: number, h: number, o: { col?: string; lean?: number; legs?: [number, number]; arms?: [number, number] } = {}) {
  k.save(); k.translate(x, y); const s = h / 1.8; k.scale(s, -s); if (o.lean) k.rotate(o.lean);
  k.fillStyle = o.col || C.blue;
  const legs = o.legs || [0, 0], arms = o.arms || [0, 0];
  ([[-0.08, legs[0]], [0.08, legs[1]]] as const).forEach(([lx, a]) => { k.save(); k.translate(lx, 0.86); k.rotate(a); rr(k, -0.075, -0.86, 0.15, 0.88, 0.07); k.fill(); k.restore(); });
  ([[-0.25, arms[0]], [0.25, arms[1]]] as const).forEach(([ax, a]) => { k.save(); k.translate(ax, 1.38); k.rotate(a); rr(k, -0.06, -0.58, 0.12, 0.6, 0.06); k.fill(); k.restore(); });
  rr(k, -0.23, 0.82, 0.46, 0.64, 0.12); k.fill();
  k.beginPath(); k.arc(0, 1.63, 0.16, 0, 7); k.fill();
  k.restore();
}
function picto(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const fo = dataFade(u), n = 9, xs = 200, sp = 38, foot = 160, ph = 112, HI = 2;
  k.save(); k.globalAlpha = fo;
  for (let i = 0; i < n; i++) {
    let col = C.blueM;
    if (i < HI) { const pc = easeInOut(P(u, 1.25 + i * 0.22, 1.5 + i * 0.22)); col = mix(C.blueM, C.blue, pc); }
    const x = xs + i * sp;
    put(k, x, foot - ph / 2, pose(u, 0.35 + i * 0.06), () => person(k, x, foot, ph, { col }), ph / 2);
  }
  say(k, u, 1.25, L[0], 164, 112, { size: 40, min: 24, max: 152, color: C.accentText, align: 'right', weight: 800 });
  say(k, u, 1.35, L[1], 164, 148, { size: 16, min: 14, max: 152, color: C.sub, align: 'right', weight: 600 });
  // 床: 人が立つ淡いメインの台。
  rr(k, xs - 26, foot + 4, (n - 1) * sp + 52, 16, 8); k.fillStyle = C.blueL; k.fill();
  k.restore();
}

// @element 16
// 16 帯グラフ（100%積み上げ）: 4 bands of the same length fill from left to right; dashed lines join the borders
// Noah: いちばん上の帯の、はじめの 3 つの区切りに札 = [1 つ目, 2 つ目, 3 つ目]（元の各帯の % の数の代わり。他の帯には字を置かない）。
// 配色の黄金比: 区切りの 1・2 つ目 = メイン（約 25%）、札のある帯の 1 つ目だけ = アクセント（約 5%）、3・4 つ目と面 = ベース。
// 帯は左から塗られ、塗り終わったら帯ごとぷるんと揺れる。
const BD = [[38, 27, 22, 13], [30, 34, 20, 16], [46, 24, 18, 12], [25, 31, 28, 16]];
function band(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const COL = (j: number) => [j ? C.blueM : C.blue, C.blueL, C.g3, C.g2];
  const x0 = 100, bwid = 390, bh = 32, gap = 12, y0 = (h - (4 * bh + 3 * gap)) / 2;
  for (let j = 0; j < 4; j++) { rr(k, 46, y0 + j * (bh + gap) + bh / 2 - 4, 36, 8, 4); k.fillStyle = C.g3; k.fill(); }
  const fo = dataFade(u);
  k.save(); k.globalAlpha = fo;
  const edges = BD.map((r) => { let a = 0; return r.map((v) => (a += v, x0 + bwid * a / 100)); });
  // dashed lines joining the borders of neighbouring bands (the classic 帯グラフ guide lines)
  const pg = easeInOut(P(u, 1.6, 2.0));
  if (pg > 0) {
    k.save(); k.globalAlpha = fo * pg;
    for (let j = 0; j < 3; j++) for (let s = 0; s < 3; s++) {
      seg(k, edges[j][s], y0 + j * (bh + gap) + bh + 2, edges[j + 1][s], y0 + (j + 1) * (bh + gap) - 2, C.g4, 1.8, [4, 4]);
    }
    k.restore();
  }
  BD.forEach((row, j) => {
    const y = y0 + j * (bh + gap), t0 = 0.4 + j * 0.16, p = Math.min(1, ease(u, t0, 0.7));
    if (p <= 0) return;
    put(k, x0 + bwid / 2, y + bh / 2, wob(u, landed(t0, 0.7)), () => {
      k.save(); k.beginPath(); k.rect(x0, y - 2, bwid * p, bh + 4); k.clip();
      let a = x0;
      row.forEach((v, s) => {
        const ww = bwid * v / 100;
        k.fillStyle = COL(j)[s]; k.fillRect(a, y, ww, bh);
        if (s) { k.fillStyle = C.stage; k.fillRect(a - 1, y, 2, bh); }
        a += ww;
      });
      k.restore();
    }, bh / 2);
    if (j === 0) {
      let left = x0;
      row.slice(0, 3).forEach((v, s) => {
        const ww = bwid * v / 100;
        say(k, u, t0 + 0.75 + s * 0.08, L[s], left + ww / 2, y + bh / 2 + 1, { size: 16, min: 14, max: ww - 14, color: [C.onBlue, C.onL, C.mark][s] });
        left += ww;
      });
    }
  });
  k.restore();
}

// @shared
// 17〜24（流れと全体を見せる図）の部品: 向きを指定する矢じり
function arrowTo(k: K, x: number, y: number, dx: number, dy: number, s: number, col: string) {                       // filled arrow head pointing along (dx,dy)
  const Ln = Math.hypot(dx, dy) || 1, ux = dx / Ln, uy = dy / Ln;
  k.fillStyle = col; k.beginPath();
  k.moveTo(x + ux * 2, y + uy * 2);
  k.lineTo(x - ux * s - uy * s * 0.6, y - uy * s + ux * s * 0.6);
  k.lineTo(x - ux * s + uy * s * 0.6, y - uy * s - ux * s * 0.6);
  k.closePath(); k.fill();
}

// @element 17
// 17 ガントチャート: date scale on top, bars start at staggered columns and grow to the right
// Noah: 行の名前（A〜E）は灰色の棒に。札 1 = 青い期間（その行の左）、札 2 = 「日」の縦線（下）。上の 1〜8 は列の番号なので残す。
// 棒は伸びすぎてぷるんと戻り、伸び終わったら揺れる。
// 配色の黄金比: 列の番号の帯と棒 = メイン（約 25%。番号を帯に入れ、棒を 20 から 24 の太さに）、札 1 の棒と「日」の縦線 = アクセント（約 5%）、面・行の名前・線 = ベース。
function gantt(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const x0 = 84, cols = 8, cw = 52, yAxis = 50, f = fade(u);
  // skeleton: date scale (in a band) + grid (always visible)
  rr(k, x0, 8, cw * cols, 36, 8); k.fillStyle = C.blueM; k.fill();
  for (let i = 0; i < cols; i++) txt(k, String(i + 1), x0 + cw * i + cw / 2, 28, `600 18px ${FONT}`, C.onM, 'center', 'middle');
  k.strokeStyle = C.g2; k.lineWidth = 2;
  for (let i = 0; i <= cols; i++) { k.beginPath(); k.moveTo(x0 + cw * i, yAxis); k.lineTo(x0 + cw * i, 186); k.stroke(); }
  k.strokeStyle = C.g4; k.lineWidth = 2.5; k.lineCap = 'round';
  k.beginPath(); k.moveTo(x0, yAxis); k.lineTo(x0 + cw * cols, yAxis); k.stroke();
  for (let i = 0; i <= cols; i++) { k.beginPath(); k.moveTo(x0 + cw * i, yAxis - 6); k.lineTo(x0 + cw * i, yAxis); k.stroke(); }
  const T = [[0, 2], [1.5, 2], [3, 1.5], [3.5, 3], [6, 2]];
  T.forEach(([s, len], i) => {
    const y = 66 + i * 27, t0 = 0.4 + i * 0.3, p = ease(u, t0, 0.5);
    rr(k, 36, y - 4, 36, 8, 4); k.fillStyle = C.g3; k.fill();
    if (p <= 0.001) return;
    const bx = x0 + cw * s + 3, full = cw * len - 6;
    k.save(); k.globalAlpha = Math.min(1, p * 3) * f;
    put(k, bx + full / 2, y, wob(u, landed(t0, 0.5)), () => { k.fillStyle = i === 3 ? C.blue : C.blueM; rr(k, bx, y - 12, Math.max(6, full * p), 24, 6); k.fill(); }, 12);
    k.restore();
  });
  k.save(); k.globalAlpha = f;
  say(k, u, 1.7, L[0], x0 + cw * 3.5 - 8, 66 + 3 * 27 + 1, { size: 17, min: 14, max: 165, color: C.accentText, align: 'right' });
  const mx = x0 + cw * 5.5, ml = Math.min(1, ease(u, 2.0, 0.4));
  if (ml > 0) seg(k, mx, yAxis, mx, lerp(yAxis, 186, ml), C.blue, 3.5);
  put(k, mx, yAxis, pose(u, 2.0), () => dot(k, mx, yAxis, 6, C.blue), 6);
  say(k, u, 2.3, L[1], mx, 197, { size: 16, min: 14, max: 120, color: C.mark });
  k.restore();
}

// @element 18
// 18 タイムライン: one line drawn left to right; dots and short marks appear in order, alternating up/down
// Noah: 月の名前（作り話の日付）の代わりに、上の 3 枚に札 = [左, 真ん中, 右（青）]。下の 2 枚は、字の代わりの灰色の棒。札の札は、字の幅に合わせて広げる。
// 点と札はぽよんと出る（札は、軸から伸びた線の先で）。
// 配色の黄金比: 時の軸（太い帯）・線・札 = メイン（約 25%。軸を太い帯に、札を大きく）、最後の点と札 = アクセント（約 5%）、面・点 = ベース。
const TL_LABEL = [0, -1, 1, -1, 2];
function timeline(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const y = 106, xa = 30, xb = 500, f = fade(u), CARD: Fit = { size: 18, min: 15, max: 126 };
  const pl = easeInOut(P(u, 0.4, 2.0));
  const tip = lerp(xa, xb, pl);
  k.globalAlpha = f;
  if (pl > 0) {
    k.strokeStyle = C.blueM; k.lineWidth = 16; k.lineCap = 'round';
    k.beginPath(); k.moveTo(xa, y); k.lineTo(tip, y); k.stroke();
    if (pl > 0.97) arrowTo(k, xb + 24, y, 1, 0, 20, C.blueM);
  }
  const XS = [78, 166, 254, 342, 430];
  XS.forEach((x, i) => {
    const t0 = 0.4 + 1.6 * tipT(i, XS, xa, xb);
    if (u <= t0) return;
    const up = i % 2 === 0, last = i === XS.length - 1, r = last ? 13 : 9;
    // short stem + card
    const ps = clamp(ease(u, t0 + 0.1, 0.3));
    const dir = up ? -1 : 1, y1 = y + dir * (r + 2), y2 = y + dir * (r + 2 + 24 * ps);
    k.strokeStyle = last ? C.blue : C.blueM; k.lineWidth = 4;
    k.beginPath(); k.moveTo(x, y1); k.lineTo(x, y2); k.stroke();
    const text = TL_LABEL[i] < 0 ? '' : L[TL_LABEL[i]] ?? '';
    const cwid = text ? Math.max(96, fit(k, text, CARD).width + 28) : 96, chh = 46, cy = up ? y - r - 26 - chh / 2 : y + r + 26 + chh / 2;
    const left = clamp(x - cwid / 2, 8, w - 8 - cwid);
    put(k, left + cwid / 2, cy, pose(u, t0 + 0.15), () => {
      k.fillStyle = last ? C.blue : C.blueL;
      rr(k, left, cy - chh / 2, cwid, chh, 10); k.fill();
      if (text) label(k, text, left + cwid / 2, cy + 1, { ...CARD, color: last ? C.onBlue : C.onL });
      else { rr(k, x - 24, cy - 7, 48, 6, 3); k.fillStyle = C.blueM; k.fill(); rr(k, x - 24, cy + 3, 32, 6, 3); k.fillStyle = C.blueM; k.fill(); }
    }, chh / 2);
    put(k, x, y, pose(u, t0), () => {
      k.fillStyle = last ? C.blue : C.stage;
      k.beginPath(); k.arc(x, y, r, 0, 7); k.fill();
      k.strokeStyle = last ? C.stage : C.blueM; k.lineWidth = 3; k.stroke();
    }, r);
  });
  k.globalAlpha = 1;
}
// time at which the line tip (easeInOut over 0.4..2.0) reaches XS[i]
function tipT(i: number, XS: readonly number[], xa: number, xb: number) {
  const target = (XS[i] - xa) / (xb - xa);
  let lo = 0, hi = 1; for (let n = 0; n < 24; n++) { const m = (lo + hi) / 2; if (easeInOut(m) < target) lo = m; else hi = m; }
  return lo;
}

// @element 19
// 19 ファネル図: separate center-aligned bars, each shorter than the one above, with light funnel joints
// Noah: 数（100・58・27・9）の代わりに、札 = [1 段目, 2 段目, いちばん下（青）]。3 段目は、字の代わりの白い棒。帯は横へ広がりすぎてぷるんと戻る。
const FUNNEL_LABEL = [0, 1, -1, 2];
function funnel(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const cx0 = w / 2, bh = 30, gap = 14, y0 = 23, f = fade(u);
  const WD = [440, 330, 224, 164];
  const COL = [C.blueL, C.blueM, C.blueM, C.blue];
  WD.forEach((wd, i) => {
    const t0 = 0.4 + i * 0.36, p = ease(u, t0, 0.45);
    if (p <= 0) return;
    const y = y0 + i * (bh + gap);
    // joint from the bar above
    if (i > 0) {
      const wa = WD[i - 1], ya = y - gap;
      k.globalAlpha = f * clamp(p) * 0.8; k.fillStyle = C.g3;
      k.beginPath(); k.moveTo(cx0 - wa / 2 + 6, ya); k.lineTo(cx0 + wa / 2 - 6, ya);
      k.lineTo(cx0 + wd / 2 - 6, y); k.lineTo(cx0 - wd / 2 + 6, y); k.closePath(); k.fill();
    }
    k.globalAlpha = f;
    const ww = wd * p;
    k.fillStyle = COL[i]; rr(k, cx0 - ww / 2, y, ww, bh, 7); k.fill();
    const li = FUNNEL_LABEL[i];
    if (li >= 0) say(k, u, t0 + 0.3, L[li], cx0, y + bh / 2 + 1, { size: 20, min: 15, max: wd - 20, color: i === 3 ? C.onBlue : i === 0 ? C.onL : C.onM });
    else put(k, cx0, y + bh / 2, pose(u, t0 + 0.3), () => { rr(k, cx0 - 22, y + bh / 2 - 3, 44, 6, 3); k.fillStyle = C.chip; k.fill(); }, 3);
  });
  k.globalAlpha = 1;
}

// @element 20
// 20 カスタマージャーニーマップ: stage headers as plain boxes (columns), an action card under each,
// then the feeling line goes up and down across the stages, with a smile / frown mark on each point
// Noah: 札 = [いちばん高い点（上にアクセントの字で）, いちばん低い点（下に薄い字で）]。見出し・行動の札・顔は、ぽよんと出る。
// 配色の黄金比: 段階の見出しと行動の札 = メイン（約 25%。行動の札を淡いメインに）、気持ちの線と良い顔 = アクセント（約 5%。線を太く、顔を大きく）、面・悪い顔 = ベース。
const JV = [0.35, 0.7, -0.6, 0.15, 0.85];     // feeling per stage (+ up = good)
function face(k: K, x: number, y: number, r: number, good: boolean, col: string) {
  k.fillStyle = col; k.beginPath(); k.arc(x, y, r, 0, Math.PI * 2); k.fill();
  k.fillStyle = C.onBlue;
  k.beginPath(); k.arc(x - r * 0.36, y - r * 0.22, r * 0.13, 0, 7); k.fill();
  k.beginPath(); k.arc(x + r * 0.36, y - r * 0.22, r * 0.13, 0, 7); k.fill();
  k.strokeStyle = C.onBlue; k.lineWidth = Math.max(1.6, r * 0.15); k.lineCap = 'round';
  k.beginPath();
  if (good) k.arc(x, y + r * 0.02, r * 0.42, Math.PI * 0.2, Math.PI * 0.8);
  else k.arc(x, y + r * 0.62, r * 0.42, Math.PI * 1.2, Math.PI * 1.8);
  k.stroke();
}
function journey(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const f = fade(u), n = 5, xl = 22, xr = w - 22, cw = (xr - xl) / n;
  const cx = (i: number) => xl + cw * (i + 0.5);
  const yMid = 150, amp = 36;
  // column separators and the neutral line stay as the frame
  for (let i = 1; i < n; i++) seg(k, xl + cw * i, 14, xl + cw * i, h - 12, C.g2, 2);
  k.globalAlpha = f;
  // stage headers: plain rounded boxes (not arrows), the stage names as short bars
  for (let i = 0; i < n; i++) {
    pbox(k, u, 0.35 + i * 0.1, cx(i), 27, cw - 12, 26, 7, C.blueM, () => { rr(k, cx(i) - 22, 25, 44, 5, 2.5); k.fillStyle = C.chip; k.fill(); });
  }
  // action cards (what the customer does at each stage)
  for (let i = 0; i < n; i++) {
    const y = 50;
    put(k, cx(i), y + 19, pose(u, 0.6 + i * 0.1), () => {
      rr(k, cx(i) - cw / 2 + 8, y, cw - 16, 38, 7); k.fillStyle = C.blueL; k.fill();
      rr(k, cx(i) - cw / 2 + 18, y + 10, cw - 46, 6, 3); k.fillStyle = C.blueM; k.fill();
      rr(k, cx(i) - cw / 2 + 18, y + 22, cw - 60, 6, 3); k.fillStyle = C.blueM; k.fill();
    }, 19);
  }
  k.globalAlpha = 1;
  seg(k, xl + 4, yMid, xr - 4, yMid, C.g3, 2, [5, 6]);
  k.globalAlpha = f;
  // feeling line (smooth through the 5 points), drawn left to right
  const pts: Pt[] = JV.map((v, i) => [cx(i), yMid - v * amp]);
  const pl = easeInOut(P(u, 1.25, 2.25));
  if (pl > 0) {
    k.save(); k.beginPath(); k.rect(0, 0, lerp(pts[0][0], pts[n - 1][0], pl) + 1, h); k.clip();
    k.strokeStyle = C.blue; k.lineWidth = 6; k.lineJoin = 'round'; k.lineCap = 'round';
    k.beginPath(); k.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], mx = (x0 + x1) / 2;
      k.bezierCurveTo(mx, y0, mx, y1, x1, y1);
    }
    k.stroke(); k.restore();
  }
  pts.forEach(([x, y], i) => {
    const good = JV[i] >= 0;
    put(k, x, y, pose(u, 1.2 + (i / (n - 1)) * 1.0), () => face(k, x, y, 14, good, good ? C.blue : C.g4), 14);
  });
  const hi = JV.indexOf(Math.max(...JV)), lo = JV.indexOf(Math.min(...JV));
  say(k, u, 2.3, L[0], pts[hi][0], pts[hi][1] - 22, { size: 16, min: 14, max: cw - 8, color: C.accentText });
  say(k, u, 2.35, L[1], pts[lo][0], pts[lo][1] + 24, { size: 16, min: 14, max: cw - 8, color: C.sub });
  k.globalAlpha = 1;
}

// @element 21
// 21 ツリーマップ: one outer rectangle gets filled by rectangles of different sizes, biggest first
// Noah: 札 = [いちばん大きい四角（元の A）, 見てほしい四角（元の B）]。C・D の字は描かない。四角は、札ごとぽよんと出る。
// 配色の黄金比: いちばん大きい四角 = メイン（約 25%）、見てほしい四角 = アクセント（約 5%）、他の四角（ベースの淡い・濃い色）と面 = ベース。
// そのため四角の分け方を変えた（元は A が全体の 3 割の青、B が 1 割）。四角の大きさは数を表さない（作り話の数を描かないため）。
function treemap(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const f = fade(u);
  const X0 = 50, Y0 = 18, X1 = 489, Y1 = 190;
  k.strokeStyle = C.g3; k.lineWidth = 2; k.setLineDash([6, 6]);
  rr(k, X0, Y0, X1 - X0, Y1 - Y0, 6); k.stroke(); k.setLineDash([]);
  const RS: readonly [number, number, number, number, string, number][] = [                                  // x, y, w, h, color, label index
    [50, 18, 180, 172, C.blueM, 0],
    [234, 18, 150, 42, C.blue, 1],
    [388, 18, 101, 42, C.g3, -1],
    [234, 64, 106, 126, C.g2, -1],
    [344, 64, 145, 56, C.g3, -1],
    [344, 124, 72, 66, C.g4, -1],
    [420, 124, 69, 66, C.g2, -1],
  ];
  k.globalAlpha = f;
  RS.forEach(([x, y, ww, hh, col, li], i) => {
    pbox(k, u, 0.4 + i * 0.22, x + ww / 2, y + hh / 2, ww, hh, 5, col, li >= 0
      ? () => label(k, L[li], x + 12, y + 21, { size: li === 0 ? 24 : 20, min: li === 0 ? 18 : 15, max: ww - 24, color: li === 0 ? C.onM : C.onBlue, align: 'left' })
      : undefined);
  });
  k.globalAlpha = 1;
}

// @element 22
// 22 スイムレーン図: lane names on the left; boxes and arrows move across the lanes step by step
// Noah: レーンの名前（顧客・営業・制作）を札 = [上, 真ん中, 下 のレーン] に。名前の列を 62 から 80 に広げた。手順の箱はぽよんと出る。
// 配色の黄金比: 名前の列と手順の箱 = メイン（約 25%。名前の列をメインに、箱を大きく）、最後の箱 = アクセント（約 5%）、レーンの地・線と面 = ベース。
function swimlane(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const f = fade(u), X0 = 22, X1 = 517, HW = 80, Y0 = 13, LH = 60, NL = 3;
  // skeleton: lanes
  for (let i = 0; i < NL; i++) {
    const y = Y0 + i * LH;
    k.fillStyle = C.card; k.fillRect(X0 + HW, y, X1 - X0 - HW, LH);
    k.fillStyle = C.blueM; k.fillRect(X0, y, HW, LH);
    label(k, L[i], X0 + HW / 2, y + LH / 2 + 1, { size: 18, min: 15, max: HW - 12, color: C.onM });
  }
  k.strokeStyle = C.g3; k.lineWidth = 2;
  for (let i = 1; i < NL; i++) { k.beginPath(); k.moveTo(X0, Y0 + i * LH); k.lineTo(X1, Y0 + i * LH); k.stroke(); }
  k.beginPath(); k.moveTo(X0 + HW, Y0); k.lineTo(X0 + HW, Y0 + NL * LH); k.stroke();
  rr(k, X0, Y0, X1 - X0, NL * LH, 6); k.stroke();
  // steps
  const BX = [144, 228, 312, 396, 472], BLN = [0, 1, 2, 1, 0], bwOf = (i: number) => (i === 4 ? 84 : 70), bhOf = (i: number) => (i === 4 ? 44 : 40);
  const cyOf = (l: number) => Y0 + l * LH + LH / 2;
  k.globalAlpha = f;
  for (let i = 0; i < BX.length; i++) {
    const t0 = 0.4 + i * 0.38;
    // arrow from previous box: right, then down/up into this box
    if (i > 0) {
      const pa = easeInOut(P(u, t0 - 0.24, t0 + 0.02));
      if (pa > 0) {
        const xs = BX[i - 1] + bwOf(i - 1) / 2, ys = cyOf(BLN[i - 1]), xe = BX[i], ye0 = cyOf(BLN[i]);
        const down = ye0 > ys, ye = ye0 + (down ? -bhOf(i) / 2 - 3 : bhOf(i) / 2 + 3);
        const l1 = xe - xs, l2 = Math.abs(ye - ys), tot = l1 + l2, d = pa * tot;
        k.strokeStyle = C.mark; k.lineWidth = 2.5; k.lineCap = 'round'; k.lineJoin = 'round';
        k.beginPath(); k.moveTo(xs, ys);
        if (d <= l1) k.lineTo(xs + d, ys);
        else { k.lineTo(xe, ys); k.lineTo(xe, ys + (down ? 1 : -1) * (d - l1)); }
        k.stroke();
        if (pa > 0.98) arrowTo(k, xe, ye, 0, down ? 1 : -1, 9, C.mark);
      }
    }
    const last = i === BX.length - 1, cx = BX[i], cy = cyOf(BLN[i]), bw = bwOf(i), bh = bhOf(i);
    put(k, cx, cy, pose(u, t0), () => {
      k.fillStyle = last ? C.blue : C.blueL; k.strokeStyle = last ? C.blue : C.blueM; k.lineWidth = 2.5;
      rr(k, cx - bw / 2, cy - bh / 2, bw, bh, 8); k.fill(); k.stroke();
      k.fillStyle = last ? C.onBlue : C.blueM;
      rr(k, cx - 18, cy - 3, 36, 6, 3); k.fill();
    }, bh / 2);
  }
  k.globalAlpha = 1;
}

// @element 23
// 23 矢羽根図（シェブロン）: arrow-shaped steps line up from left to right, each with short notes below
// Noah: 1・3・5 番目の下のメモ（灰色の棒）を札 = [1 番目, 3 番目, 5 番目] に。2・4 番目のメモは、元より短い灰色の棒。順番の数字は残す。
// 矢羽根は、元の「左から滑って来る」の代わりに、その場でぽよんと出る。
const CHEVRON_LABEL = [0, -1, 1, -1, 2];
function chevron(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const f = fade(u), n = 5, cw = 104, dp = 24, gp = 6, step = cw - dp + gp;
  const tot = n * step - gp + dp, x0 = (w - tot) / 2, y0 = 40, ch = 74, ym = y0 + ch / 2;
  const COL = [C.blueL, C.blueL, C.blueM, C.blueM, C.blue];
  k.globalAlpha = f;
  for (let i = 0; i < n; i++) {
    const t0 = 0.4 + i * 0.3, x = x0 + i * step;
    const tx = x + (i > 0 ? dp : 0) / 2 + (cw - dp) / 2 + (i > 0 ? 0 : -2);
    put(k, x + cw / 2, ym, pose(u, t0), () => {
      k.fillStyle = COL[i];
      k.beginPath();
      k.moveTo(x, y0); k.lineTo(x + cw - dp, y0); k.lineTo(x + cw, ym); k.lineTo(x + cw - dp, y0 + ch); k.lineTo(x, y0 + ch);
      if (i > 0) k.lineTo(x + dp, ym);
      k.closePath(); k.fill();
      txt(k, String(i + 1), tx + 4, ym + 1, `700 24px ${FONT}`, [C.onL, C.onL, C.onM, C.onM, C.onBlue][i], 'center', 'middle');
    }, ch / 2);
    // short notes under each step
    const nx = tx + 4;
    if (CHEVRON_LABEL[i] >= 0) say(k, u, t0 + 0.25, L[CHEVRON_LABEL[i]], nx, y0 + ch + 28, { size: 17, min: 14, max: 120, color: C.mark });
    else put(k, nx, y0 + ch + 28, pose(u, t0 + 0.25), () => { k.fillStyle = C.g3; rr(k, nx - 22, y0 + ch + 20, 44, 8, 4); k.fill(); rr(k, nx - 22, y0 + ch + 36, 30, 8, 4); k.fill(); }, 16);
  }
  k.globalAlpha = 1;
}

// @element 24
// 24 同心円図: circles appear one inside another around the same center
// Noah: TAM・SAM・SOM の代わりに、札 = [真ん中の円の中, 外の円の右]。円は、下の端を基準にぽよんと出る（中の円ほど後）。
// 配色の黄金比: 外と中の輪 = メイン（約 25%。外の円を 91 から 98 に）、真ん中の円 = アクセント（約 5%。31 から 38 に）、面 = ベース。
function concentric(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const f = fade(u), cx0 = w / 2, cy0 = h / 2 + 2;
  const RR = [98, 65, 38], COL = [C.blueL, C.blueM, C.blue];
  // skeleton: faint outer ring guide
  k.strokeStyle = C.g2; k.lineWidth = 2; k.beginPath(); k.arc(cx0, cy0, RR[0], 0, 7); k.stroke();
  k.globalAlpha = f;
  RR.forEach((r, i) => put(k, cx0, cy0, pose(u, 0.4 + i * 0.45), () => { k.fillStyle = COL[i]; k.beginPath(); k.arc(cx0, cy0, r, 0, 7); k.fill(); }, r));
  say(k, u, 1.85, L[0], cx0, cy0 + 1, { size: 18, min: 14, max: 2 * RR[2] - 14, color: C.onBlue });
  say(k, u, 0.95, L[1], cx0 + RR[0] + 18, cy0 + 1, { size: 18, min: 15, max: w - 12 - (cx0 + RR[0] + 18), color: C.mark, align: 'left' });
  k.globalAlpha = 1;
}

// @end
const CELLS: Record<NoahPinTemplate, Cell> = {
  venn, matrix, tree, pyramid, mindmap, flowchart: flow, cycle, fishbone,
  scatter, bubble, heatmap, radar, gauge, combo, pictogram: picto, stacked: band,
  gantt, timeline, funnel, journey, treemap, swimlane, chevron, concentric,
};

/** 組み上がって止める時刻（秒）。どの図も 4.0 秒までに揺れが収まって止まる（4.1 秒から元の消える動き）。ヒートマップだけは、3.95 秒からマスが消え始めるので 3.9。 */
export function noahPinHold(template: NoahPinTemplate): number {
  return template === 'heatmap' ? 3.9 : 4;
}

/**
 * 見えている間の繰り返し（本人の決定 2026-11-25「見えている間は繰り返す」。前の「画面に入った時に1回」から変わった）。
 * 1 周 = 組み上がる（noahPinHold）→ 組み上がった形を見せる（show 秒）→ 消える（fade 秒）。1 周は本人の指示「説明動画５〜8秒とか」の 5〜8 秒に収める。
 */
export const NOAH_PIN_LOOP = { show: 2.4, fade: 0.6, min: 5, max: 8 } as const;

/** 1 周の長さ（秒）。 */
export function noahPinLoopPeriod(template: NoahPinTemplate): number {
  return Math.min(NOAH_PIN_LOOP.max, Math.max(NOAH_PIN_LOOP.min, noahPinHold(template) + NOAH_PIN_LOOP.show + NOAH_PIN_LOOP.fade));
}

/** 動き始めてから t 秒の時の、描く時刻 u と、消え具合 fade（0 = はっきり、1 = 消えた）。時刻の純関数。 */
export function noahPinLoopFrame(template: NoahPinTemplate, t: number): { u: number; fade: number } {
  const period = noahPinLoopPeriod(template);
  let at = Number.isFinite(t) ? t % period : 0;
  if (at < 0) at += period;
  const start = period - NOAH_PIN_LOOP.fade;
  return { u: Math.min(noahPinHold(template), at), fade: at > start ? Math.min(1, (at - start) / NOAH_PIN_LOOP.fade) : 0 };
}

/** 1 枚の図解を、時刻 u（秒）の形で、並びの tone 枚目の 3 色（noahPinColors。70:25:5。ポップな 8 組から黄金比の並びで選ぶ）で描く。k は、539×208 の座標で描けるように縮めた（setTransform 済みの）面。前の絵は、ここで塗りつぶす。 */
export function drawNoahPinDiagram(k: CanvasRenderingContext2D, scene: Pick<NoahPinScene, 'template' | 'labels'>, u: number, tone = 0): void {
  const before = C;
  C = noahPinColors(tone);
  k.save();
  try { CELLS[scene.template](k, CW, CH, u, scene.labels); }
  finally { k.restore(); C = before; }
}
