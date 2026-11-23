/**
 * ピンの図解を描く（Canvas 2D。バージョン TAKE）。
 *
 * しょうへい（大滝昇平 / Shohei Ohtaki, @showheyohtaki）さんの Motion Prompt の「資料で使う図解・グラフの名前」パック
 * （#217〜240。https://github.com/showheyohtaki/motion-prompt の packs/diagram/pack.js、commit 683ecca）を書き写した物。
 * MIT License (c) 2026 Shohei Ohtaki。許諾の全文は vendor/motion-prompt/LICENSE。
 *
 * 書き写したまま: 539×208 の面・色（面 #F1F0EE・青 3 段・灰色 3 段・濃い灰色）・字の書体・図の形と大きさ・出てくる順（各コマは時刻 u の純関数）。
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
 * - 1 周（4.7 秒）で消えて繰り返す代わりに、画面に入った時に 1 回だけ組み上げて、止める（本人の決定 2026-11-24「画面に入った時に1回」）。
 *   止める時刻は noahPinHold。繰り返しは components/noah-pin-scene.tsx がしない（ここの式は、元と同じく 0〜4.7 秒のどこでも描ける）。
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

// @kit（元の packs/diagram/pack.js の共通部分）
const CW = NOAH_PIN_ART.width, CH = NOAH_PIN_ART.height;
const C = {
  stage: '#F1F0EE', sub: '#8E8E93', mark: '#3A3A3E',
  blue: '#2F6BEB', blueM: '#9DB8F6', blueL: '#C9D8FB', g2: '#E2E1DE', g3: '#CFCECB', g4: '#A9A8A5',
};
const WHITE = '#FFFFFF';
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
function bg(k: K, w: number, h: number) { k.fillStyle = C.stage; k.fillRect(0, 0, w, h); }
function fade(u: number) { return 1 - easeInOut(P(u, 4.1, 4.5)); }              // the whole figure fades out at the end of the cycle

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
// Noah: 札は円の外側に（左 = 青・右 = 濃い灰色。元の A・B の代わり）。円は寄りすぎてぷるんと戻り、寄り終わったら 2 つの円が一緒に揺れる。
function venn(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const app = easeOut(P(u, 0.3, 0.7)), m = ease(u, 0.5, 1.1);
  if (app <= 0) return;
  const r = 78, cy = h / 2, d = lerp(150, 44, m), ax = w / 2 - d, bx = w / 2 + d;
  k.save(); k.globalAlpha = fade(u) * app;
  put(k, w / 2, cy, wob(u, landed(0.5, 1.1)), () => {
    k.fillStyle = C.blueL; k.beginPath(); k.arc(ax, cy, r, 0, TAU); k.fill();
    k.fillStyle = C.g2; k.beginPath(); k.arc(bx, cy, r, 0, TAU); k.fill();
    // shared part: B inside A
    k.save(); k.beginPath(); k.arc(ax, cy, r, 0, TAU); k.clip();
    k.fillStyle = C.blue; k.beginPath(); k.arc(bx, cy, r, 0, TAU); k.fill(); k.restore();
    pen(k, C.blueM, 3); k.beginPath(); k.arc(ax, cy, r, 0, TAU); k.stroke();
    pen(k, C.g4, 3); k.beginPath(); k.arc(bx, cy, r, 0, TAU); k.stroke();
  }, r);
  const edge = w / 2 - 44 - r - 14;   // the left circle's settled outer edge, minus a gap
  say(k, u, 1.35, L[0], edge, cy + 1, { size: 26, min: 18, max: edge - 12, color: C.blue, align: 'right' });
  say(k, u, 1.45, L[1], w - edge, cy + 1, { size: 26, min: 18, max: edge - 12, color: C.mark, align: 'left' });
  k.restore();
}

// @element 02
// 02 4象限マトリクス: two axes cross in the middle, four areas appear, items are placed; top-right is the target
// Noah: 札 = [横の軸（矢印の先の右）, 縦の軸（矢印の先の左）, 青い点（点の下）]。青い点の下を空けるため、灰色の点を 1 つ上へ動かした。
const MDOTS: readonly [number, number, number][] = [[0.55, -0.62, 1], [0.18, -0.78, 0], [-0.5, -0.45, 0], [-0.3, 0.5, 0], [-0.62, 0.22, 0], [0.45, 0.4, 0], [0.7, 0.62, 0]];
function matrix(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const cx = w / 2, cy = h / 2, hw = 168, hh = 86, gap = 8, qw = hw - 14, qh = hh - 8;
  // four areas
  ([[1, -1], [-1, -1], [-1, 1], [1, 1]] as const).forEach(([sx, sy], i) => {
    const x = sx > 0 ? cx + gap : cx - gap - qw, y = sy > 0 ? cy + gap : cy - gap - qh;
    pbox(k, u, 1.0 + i * 0.08, x + qw / 2, y + qh / 2, qw, qh, 10, i === 0 ? C.blueL : C.g2);
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
    const x = cx + dx * (hw - 20), y = cy + dy * (hh - 6), r = hot ? 12 : 8;
    put(k, x, y, pose(u, 1.45 + i * 0.1), () => { k.fillStyle = hot ? C.blue : C.g4; k.beginPath(); k.arc(x, y, r, 0, TAU); k.fill(); }, r);
  });
  say(k, u, 1.0, L[0], cx + hw + 16, cy + 1, { size: 18, min: 15, max: w - 10 - (cx + hw + 16), color: C.mark, align: 'left' });
  say(k, u, 1.08, L[1], cx - 14, cy - hh + 14, { size: 18, min: 15, max: 140, color: C.mark, align: 'right' });
  say(k, u, 2.2, L[2], cx + MDOTS[0][0] * (hw - 20), cy + MDOTS[0][1] * (hh - 6) + 28, { size: 18, min: 15, max: 136, color: C.blue });
  k.globalAlpha = 1;
}

// @element 03
// 03 ロジックツリー: one box on the left branches to the right, with elbow lines
// Noah: 元の 1 → 2 → 4 を、1 → 3 → 6 にした（札 = [根, 枝 1, 枝 2, 枝 3]）。根と枝の箱は、札の幅に合わせて広げる。根の「?」は根の札にした。
function tree(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const ROOT: Fit = { size: 20, min: 16, max: 112 }, BRANCH: Fit = { size: 18, min: 15, max: 124 };
  const RW = Math.max(66, fit(k, L[0] ?? '', ROOT).width + 28), RH = 50, R: Pt = [14 + RW / 2, h / 2];
  const W2 = [1, 2, 3].map((i) => Math.max(76, fit(k, L[i] ?? '', BRANCH).width + 24)), H2 = 36;
  const L2: Pt[] = [40, 104, 168].map((y, i) => [236 + W2[i] / 2, y]);
  const L3: Pt[] = L2.flatMap(([, y]): Pt[] => [[484, y - 15], [484, y + 15]]);
  const W3 = 64, H3 = 22;
  const elbow = (p: Pt, c: Pt, pw: number, cw: number): Pt[] => { const x0 = p[0] + pw / 2, x1 = c[0] - cw / 2, xm = (x0 + x1) / 2; return [[x0, p[1]], [xm, p[1]], [xm, c[1]], [x1, c[1]]]; };
  pen(k, C.g4, 3);
  L2.forEach((c, i) => trace(k, elbow(R, c, RW, W2[i]), easeInOut(P(u, 0.75, 1.15))));
  L3.forEach((c, i) => trace(k, elbow(L2[i >> 1], c, W2[i >> 1], W3), easeInOut(P(u, 1.35 + i * 0.06, 1.75 + i * 0.06))));
  pbox(k, u, 0.4, R[0], R[1], RW, RH, 10, C.blue, () => label(k, L[0], R[0], R[1] + 1, { ...ROOT, color: WHITE }));
  L2.forEach((c, i) => pbox(k, u, 1.05 + i * 0.08, c[0], c[1], W2[i], H2, 9, C.blueM, () => label(k, L[i + 1], c[0], c[1] + 1, { ...BRANCH, color: C.mark })));
  L3.forEach((c, i) => pbox(k, u, 1.65 + i * 0.08, c[0], c[1], W3, H3, 8, C.blueL));
  k.globalAlpha = 1;
}

// @element 04
// 04 ピラミッド図: a triangle in four layers, stacked from the bottom up; the top layer is blue
// Noah: 札 = [青い段（右に、短い線を引いて）, 段の名前（下から 2 段目の左）]。段は、元の「上から落ちる」の代わりに、下から順にぽよんと出る。
function pyramid(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const top = 16, base = 192, hwB = 168, n = 4, gp = 6, cx = w / 2;
  const th = (base - top - gp * (n - 1)) / n, half = (y: number) => hwB * (y - top) / (base - top);
  const cols = [C.g3, C.blueL, C.blueM, C.blue];
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
    pen(k, C.g4, 2); k.beginPath(); k.moveTo(cx + half(ty) + 10, ty); k.lineTo(tx - 8, ty); k.stroke();
    k.restore();
  }
  say(k, u, 1.5, L[0], tx, ty + 1, { size: 22, min: 16, max: w - 12 - tx, color: C.blue, align: 'left' });
  const y1 = base - (th + gp) - th / 2, x1 = cx - half(y1) - 24;
  say(k, u, 0.9, L[1], x1, y1 + 1, { size: 20, min: 16, max: x1 - 12, color: C.mark, align: 'right' });
  k.globalAlpha = 1;
}

// @element 05
// 05 マインドマップ: a center word, curved branches out to both sides, then smaller twigs
// Noah: 札 = [真ん中, 右上の枝, 右下の枝, 左上の枝, 左下の枝]。札のある枝の箱は、札の幅に合わせて広げる（真ん中の 2 本は、元の通り字の無い小さな箱）。
const MM: readonly [number, number, number, string, readonly Pt[]][] = [
  // [side, end dx, end dy, color, twigs [dx, dy]]
  [1, 128, -52, C.blueM, [[204, -72], [204, -32]]],
  [1, 142, 8, C.g4, []],
  [1, 124, 56, C.blueM, [[204, 76]]],
  [-1, 128, -52, C.g4, [[204, -70]]],
  [-1, 140, 10, C.blueM, []],
  [-1, 124, 56, C.g4, [[204, 36], [204, 76]]],
];
const MM_LABEL = [1, -1, 2, 3, -1, 4];          // branch → label index (-1 = no label)
function mindmap(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const cx = w / 2, cy = h / 2, BRANCH: Fit = { size: 17, min: 15, max: 85 }, CENTER: Fit = { size: 19, min: 16, max: 184 };
  MM.forEach(([sd, ex, ey, col, twigs], i) => {
    const text = MM_LABEL[i] < 0 ? '' : L[MM_LABEL[i]] ?? '';
    const pw = text ? Math.max(54, fit(k, text, BRANCH).width + 22) : 54, ph = text ? 28 : 24;
    const x0 = cx + sd * 40, x1 = cx + sd * ex, y1 = cy + ey;
    const pts = bezPts([x0, cy], [cx + sd * 78, cy], [cx + sd * (ex - 50), y1], [x1 - sd * 26, y1]);
    pen(k, col, 3); trace(k, pts, easeInOut(P(u, 0.7 + i * 0.09, 1.2 + i * 0.09)));
    twigs.forEach(([tx, ty], j) => {
      const a: Pt = [x1 + sd * Math.max(26, pw / 2), y1], b: Pt = [cx + sd * tx - sd * 20, cy + ty], t0 = 1.45 + i * 0.07 + j * 0.05;
      const tp = bezPts(a, [a[0] + sd * 22, a[1]], [b[0] - sd * 26, b[1]], b, 16);
      pen(k, col, 2.5); trace(k, tp, easeInOut(P(u, t0, t0 + 0.35)));
      pbox(k, u, t0 + 0.3, cx + sd * tx, cy + ty, 40, 18, 9, col === C.g4 ? C.g3 : C.blueL);
    });
    pbox(k, u, 1.15 + i * 0.09, x1, y1, pw, ph, ph / 2, col === C.g4 ? C.g4 : C.blueM, text ? () => label(k, text, x1, y1 + 1, { ...BRANCH, color: C.mark }) : undefined);
  });
  const cw = Math.max(100, fit(k, L[0] ?? '', CENTER).width + 36);
  pbox(k, u, 0.4, cx, cy, cw, 44, 22, C.blue, () => label(k, L[0], cx, cy + 1, { ...CENTER, color: WHITE }));
  k.globalAlpha = 1;
}

// @element 06
// 06 フローチャート: start -> step -> decision (diamond) -> step -> end, with a "No" loop back;
// then a marker walks the path once (loops back once, then goes on to the end)
// Noah: 図を 8 下げ、札 = [始め, ひし形（確かめる事）, 次の箱, 終わり]（次の箱だけ下、他は上。最初の箱は、元の通り字なし）。ひし形の「?」は残す。
function flow(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const y = 88, S: Pt = [64, y], A: Pt = [158, y], D: Pt = [262, y], B: Pt = [364, y], E: Pt = [460, y], LY = 176;
  const dw = 46, dh = 36;                                   // diamond half sizes
  const arrows: Pt[][] = [
    [[S[0] + 34, y], [A[0] - 36, y]],
    [[A[0] + 36, y], [D[0] - dw, y]],
    [[D[0] + dw, y], [B[0] - 36, y]],
    [[B[0] + 36, y], [E[0] - 34, y]],
  ];
  const loop: Pt[] = [[D[0], y + dh], [D[0], LY], [A[0], LY], [A[0], y + 20]];
  const tA = [0.6, 1.0, 1.4, 1.75];
  pen(k, C.g4, 3);
  arrows.forEach((pts, i) => trace(k, pts, easeInOut(P(u, tA[i], tA[i] + 0.22)), 10, C.g4));
  trace(k, loop, easeInOut(P(u, 2.0, 2.45)), 10, C.g4);
  // shapes
  pbox(k, u, 0.4, S[0], S[1], 66, 36, 18, C.g3);
  pbox(k, u, 0.8, A[0], A[1], 72, 40, 6, C.blueL);
  put(k, D[0], D[1], pose(u, 1.2), () => {
    k.fillStyle = C.blue;
    k.beginPath(); k.moveTo(D[0], D[1] - dh); k.lineTo(D[0] + dw, D[1]); k.lineTo(D[0], D[1] + dh); k.lineTo(D[0] - dw, D[1]); k.closePath(); k.fill();
    txt(k, '?', D[0], D[1] + 2, `700 26px ${FONT}`, WHITE, 'center', 'middle');
  }, dh);
  pbox(k, u, 1.6, B[0], B[1], 72, 40, 6, C.blueL);
  pbox(k, u, 1.95, E[0], E[1], 66, 36, 18, C.g3);
  // labels: above the start, the diamond and the end; below the next step (so that neighbours never touch)
  ([[S, 0.4, C.mark, 36], [D, 1.2, C.blue, 36], [B, 1.6, C.mark, y + 38], [E, 1.95, C.mark, 36]] as const).forEach(([p, t, col, ly], i) => {
    say(k, u, t + 0.2, L[i], p[0], ly, { size: 18, min: 15, max: 108, color: col });
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
function cycle(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  k.globalAlpha = fade(u);
  const cx = w / 2, cy = h / 2, RX = 128, RY = 70, nr = 26, n = 4;
  const ang = (i: number) => -Math.PI / 4 + i * TAU / n, pos = (a: number): Pt => [cx + Math.cos(a) * RX, cy + Math.sin(a) * RY];
  for (let i = 0; i < n; i++) {
    const t = easeInOut(P(u, 0.7 + i * 0.32, 0.98 + i * 0.32));
    if (t <= 0) continue;
    const A = pos(ang(i)), B = pos(ang(i + 1)), pts: Pt[] = [];
    for (let j = 0; j <= 60; j++) {
      const q = pos(lerp(ang(i), ang(i + 1), j / 60));
      if (Math.hypot(q[0] - A[0], q[1] - A[1]) > nr + 10 && Math.hypot(q[0] - B[0], q[1] - B[1]) > nr + 8) pts.push(q);
    }
    pen(k, C.blueM, 3); trace(k, pts, t, 13, C.blueM);
  }
  // highlight going round: 2.2s -> 3.8s, 0.4s per step, soft edges
  const hp = P(u, 2.2, 3.8) * n;
  for (let i = 0; i < n; i++) {
    const dd = hp - i;
    const on = (u > 2.15 && u < 4.0 && dd > -0.25 && dd < 1.25) ? clamp(Math.min(dd + 0.25, 1.25 - dd) * 2.5) : 0;
    const [x, y] = pos(ang(i));
    put(k, x, y, pose(u, 0.4 + i * 0.32), () => {
      k.fillStyle = C.blueL; k.beginPath(); k.arc(x, y, nr, 0, TAU); k.fill();
      if (on > 0) { k.save(); k.globalAlpha *= on; k.fillStyle = C.blue; k.beginPath(); k.arc(x, y, nr, 0, TAU); k.fill(); k.restore(); }
      txt(k, String(i + 1), x, y + 1, `700 22px ${FONT}`, on > 0.5 ? WHITE : C.blue, 'center', 'middle');
    }, nr);
    const right = x > cx;
    say(k, u, 0.6 + i * 0.32, L[i], right ? x + nr + 14 : x - nr - 14, y + 1, { size: 20, min: 16, max: 127, color: C.mark, align: right ? 'left' : 'right' });
  }
  k.globalAlpha = 1;
}

// @element 08
// 08 フィッシュボーン図: a spine runs right to the head (the result); slanted bones join it from above
// and below, each with small side bones (the causes)
// Noah: 札 = [頭（元の「結果」）, 上の骨の先, 下の骨の先]。骨の先の上下に札を置くため、骨を 80 から 72 に短くした。
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
  pbox(k, u, 0.95, hx + 8, y, 92, 56, 12, C.blue, () => label(k, L[0], hx + 8, y + 1, { size: 20, min: 15, max: 76, color: WHITE }));
  // big bones: root on the spine at bx, tip up-left / down-left
  const bones = [[150, -1], [258, -1], [366, -1], [150, 1], [258, 1], [366, 1]] as const;
  bones.forEach(([bx, sd], i) => {
    const a = 1.1 + (i % 3) * 0.14 + (sd > 0 ? 0.07 : 0);
    const t = easeInOut(P(u, a, a + 0.35));
    if (t <= 0) return;
    const tip: Pt = [bx - BX, y + sd * BL];
    pen(k, C.blueM, 3); trace(k, [[bx, y], tip], t);
    // small bones (horizontal, pointing left) at 1/3 and 2/3 of the bone
    [0.36, 0.68].forEach((f, j) => {
      const st = ease(u, a + 0.38 + j * 0.08, 0.22);
      if (st <= 0) return;
      const px = lerp(tip[0], bx, f), py = lerp(tip[1], y, f);
      pen(k, C.g4, 2.5); k.beginPath(); k.moveTo(px, py); k.lineTo(px - 26 * st, py); k.stroke();
    });
  });
  say(k, u, 1.6, L[1], 150 - BX, y - BL - 18, { size: 18, min: 15, max: 150, color: C.mark });
  say(k, u, 1.7, L[2], 150 - BX, y + BL + 18, { size: 18, min: 15, max: 150, color: C.mark });
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
  const tl = easeInOut(P(u, 1.85, 2.5));
  if (tl > 0) {
    const xa = X(0.02), ya = Y(0.11), xb = X(0.98), yb = Y(0.83);
    seg(k, xa, ya, lerp(xa, xb, tl), lerp(ya, yb, tl), C.g4, 2.5, [7, 8]);
  }
  for (const p of SCPTS) {
    const x = X(p.x), y = Y(p.y);
    put(k, x, y, pose(u, 0.4 + p.x * 1.25), () => dot(k, x, y, 5, C.blue), 5);
  }
  k.restore();
}

// @element 10
// 10 バブルチャート: a few semi-transparent circles of different sizes grow on the axes
// Noah: 札 = [いちばん大きい円（青。円の中）, 横の軸]。
const BB: readonly [number, number, number, number][] = [   // x, y (0..1 in the plot), radius px, emphasized
  [0.16, 0.30, 18, 0], [0.34, 0.64, 34, 0], [0.53, 0.34, 25, 0], [0.67, 0.6, 44, 1], [0.89, 0.30, 14, 0],
];
function bubble(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const A = SC; axes(k, A.x0, A.y0, A.x1, A.y1);
  axisLabels(k, u, L[1], undefined);
  const fo = dataFade(u);
  const X = (x: number) => lerp(A.x0 + 10, A.x1 - 8, x), Y = (y: number) => lerp(A.y1 - 8, A.y0 + 6, y);
  BB.forEach(([bx, by, br, em], i) => {
    const x = X(bx), y = Y(by), col = em ? C.blue : C.blueM;
    k.save(); k.globalAlpha = fo;
    put(k, x, y, pose(u, 0.45 + i * 0.24), () => {
      k.save(); k.globalAlpha *= em ? 0.42 : 0.5; dot(k, x, y, br, col); k.restore();
      k.strokeStyle = col; k.lineWidth = 2.5; k.beginPath(); k.arc(x, y, br, 0, Math.PI * 2); k.stroke();
    }, br);
    if (em) say(k, u, 1.6, L[0], x, y + 1, { size: 18, min: 14, max: 76, color: C.mark });
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
const HMCOL = [mix(C.stage, C.blueL, 0.55), C.blueL, C.blueM, mix(C.blueM, C.blue, 0.55), C.blue];
function heatmap(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const { cols, rows, v, hot } = HM;
  const cw = 30, ch = 28, g = 4, gx = 96, gy = 44, gw = cols * (cw + g) - g, gh = rows * (ch + g) - g;
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
  say(k, u, 1.75, L[1], clamp(x, 102, w - 102), gy + gh + 24, { size: 17, min: 14, max: 180, color: C.blue });
  k.restore();
}

// @element 12
// 12 レーダーチャート: a spider-web scale; a gray polygon, then the blue polygon spreads out from the center
// Noah: 札 = [左上, 右上, 右下, 左下 の軸の名前]（上と下の軸は、字を置く所が無いので札なし）。形は広がりすぎてぷるんと戻り、青い形の角の点はぽよんと出る。
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
  const cx = w / 2, cy = h / 2 + 2, R = 86, n = 6;
  k.lineJoin = 'round';
  for (let ring = 1; ring <= 4; ring++) {
    radarPath(k, cx, cy, R, Array.from({ length: n }, () => ring / 4), 1);
    k.strokeStyle = ring === 4 ? C.g4 : C.g3; k.lineWidth = 2; k.stroke();
  }
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i / n * Math.PI * 2;
    seg(k, cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R, C.g3, 2);
    dot(k, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 4, C.g4);
  }
  RL.forEach(([i, align], j) => {
    const a = -Math.PI / 2 + i / n * Math.PI * 2;
    say(k, u, 0.3 + j * 0.06, L[j], cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * R + 1, { size: 18, min: 15, max: 160, color: C.mark, align });
  });
  const fo = dataFade(u);
  const sb = ease(u, 0.4, 0.7);
  if (sb > 0.01) {
    k.save(); k.globalAlpha = fo;
    radarPath(k, cx, cy, R, RB, sb);
    k.fillStyle = 'rgba(169,168,165,0.22)'; k.fill();
    k.strokeStyle = C.g4; k.lineWidth = 2.5; k.stroke();
    k.restore();
  }
  const sa = ease(u, 0.95, 0.9);
  if (sa > 0.01) {
    k.save(); k.globalAlpha = fo;
    radarPath(k, cx, cy, R, RA, sa);
    k.fillStyle = 'rgba(47,107,235,0.28)'; k.fill();
    k.strokeStyle = C.blue; k.lineWidth = 3; k.stroke();
    RA.forEach((v, i) => {
      const a = -Math.PI / 2 + i / n * Math.PI * 2, r = R * v * sa, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      put(k, x, y, pose(u, 1.2 + i * 0.06), () => dot(k, x, y, 4.5, C.blue), 4.5);
    });
    k.restore();
  }
}

// @element 13
// 13 ゲージチャート: a half-circle meter; the needle swings past and settles
// Noah: 下の「72%」の数の代わりに札 1（測る物）。札 2 は、目盛りの右の端（いっぱいの所）の名前。針の位置は形だけ（数は描かない）。
// 針は、元（cos(7.5t)）より細かく、ぷるぷる揺れて止まる。
function needle(u: number) {
  const t = u - 0.5;
  return t <= 0 ? 0 : 1 - Math.exp(-3.2 * t) * Math.cos(11 * t);
}
function gauge(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const cx = w / 2, cy = 152, R = 120, T = 30, V = 0.72;
  const f = V * needle(u) * (1 - easeInOut(P(u, 4.1, 4.5)));
  k.lineCap = 'butt';
  k.strokeStyle = C.g2; k.lineWidth = T;
  k.beginPath(); k.arc(cx, cy, R - T / 2, Math.PI, Math.PI * 2); k.stroke();
  if (f > 0.002) {
    k.strokeStyle = C.blue; k.lineWidth = T;
    k.beginPath(); k.arc(cx, cy, R - T / 2, Math.PI, Math.PI + Math.PI * f); k.stroke();
  }
  for (let i = 0; i <= 10; i++) {   // ticks every 10%
    const a = Math.PI + Math.PI * i / 10, r0 = R - T - 12, r1 = R - T - (i % 5 === 0 ? 24 : 18);
    seg(k, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, C.g4, 2.5);
  }
  const a = Math.PI + Math.PI * f, Ln = R - 22, bw = 7;
  const ca = Math.cos(a), sa = Math.sin(a);
  k.fillStyle = C.mark; k.beginPath();
  k.moveTo(cx + ca * Ln, cy + sa * Ln);
  k.lineTo(cx - sa * bw, cy + ca * bw);
  k.lineTo(cx - ca * 12, cy - sa * 12);
  k.lineTo(cx + sa * bw, cy - ca * bw);
  k.closePath(); k.fill();
  dot(k, cx, cy, 13, C.mark);
  dot(k, cx, cy, 5, C.stage);
  k.save(); k.globalAlpha = fade(u);
  say(k, u, 0.3, L[1], cx + R + 14, cy - 2, { size: 18, min: 15, max: w - 12 - (cx + R + 14), color: C.sub, align: 'left' });
  say(k, u, 0.9, L[0], cx, cy + 36, { size: 24, min: 17, max: 300, color: C.mark });
  k.restore();
}

// @element 14
// 14 複合グラフ（棒＋折れ線）: bars on the left scale (gray ticks), a dotted line on the right scale (blue ticks)
// Noah: 左上に凡例（札 1 = 棒・札 2 = 折れ線）。棒は伸びすぎてぷるんと戻り、点はぽよんと出る。
const CB = [42, 55, 50, 66, 74, 88];       // bars (left scale, % of height)
const CL = [26, 34, 52, 46, 64, 80];       // line (right scale, % of height)
function combo(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const floor = 186, top = 24, sc = (floor - top) / 100, x0 = 86, x1 = 452, slot = (x1 - x0) / CB.length, bw = 36;
  for (let i = 1; i <= 3; i++) { const y = lerp(floor, top, i / 3.4); seg(k, x0 + 4, y, x1 - 4, y, C.g2, 2); }
  seg(k, x0, top, x0, floor, C.g4, 2.5);
  seg(k, x1, top, x1, floor, C.blue, 2.5);
  seg(k, x0, floor, x1, floor, C.g4, 2.5);
  for (let i = 0; i <= 4; i++) {   // two different scales: gray ticks on the left, blue ticks on the right
    const y = lerp(floor, top, i / 4);
    seg(k, x0 - 10, y, x0, y, C.g4, 2.5);
    seg(k, x1, y, x1 + 10, y, C.blue, 2.5);
  }
  put(k, 112, 56, pose(u, 0.3), () => { rr(k, 104, 48, 16, 16, 3); k.fillStyle = C.blueL; k.fill(); }, 8);
  say(k, u, 0.34, L[0], 130, 56, { size: 17, min: 14, max: 140, color: C.mark, align: 'left' });
  put(k, 112, 80, pose(u, 0.4), () => { seg(k, 102, 80, 122, 80, C.blue, 3.5); dot(k, 112, 80, 6, C.blue); dot(k, 112, 80, 2.5, C.stage); }, 6);
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
    k.strokeStyle = C.blue; k.lineWidth = 3.5; k.lineJoin = 'round'; k.lineCap = 'round';
    k.beginPath(); k.moveTo(pts[0][0], pts[0][1]);
    const n = Math.floor(pl);
    for (let i = 1; i <= n; i++) k.lineTo(pts[i][0], pts[i][1]);
    if (n < pts.length - 1) { const f = pl - n; k.lineTo(lerp(pts[n][0], pts[n + 1][0], f), lerp(pts[n][1], pts[n + 1][1], f)); }
    k.stroke();
  }
  pts.forEach(([x, y], i) => put(k, x, y, pose(u, 1.25 + i * 0.18), () => { dot(k, x, y, 7, C.blue); dot(k, x, y, 3, C.stage); }, 7));
  k.restore();
}

// @element 15
// 15 絵グラフ（ピクトグラム）: 10 people in one row pop in gray, then 3 of them turn blue
// Noah: 「30%」と「10人中3人」の代わりに、札 1（大きく青）と札 2（小さく灰色）。人は、足元を基準に 1 人ずつぽよんと出る。
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
  const fo = dataFade(u), n = 10, xs = 214, sp = 32, foot = 158, ph = 80, HI = 3;
  k.save(); k.globalAlpha = fo;
  for (let i = 0; i < n; i++) {
    let col = C.g3;
    if (i < HI) { const pc = easeInOut(P(u, 1.25 + i * 0.22, 1.5 + i * 0.22)); col = mix(C.g3, C.blue, pc); }
    const x = xs + i * sp;
    put(k, x, foot - ph / 2, pose(u, 0.35 + i * 0.06), () => person(k, x, foot, ph, { col }), ph / 2);
  }
  say(k, u, 1.25, L[0], 164, 112, { size: 40, min: 24, max: 152, color: C.blue, align: 'right', weight: 800 });
  say(k, u, 1.35, L[1], 164, 148, { size: 16, min: 14, max: 152, color: C.sub, align: 'right', weight: 600 });
  seg(k, xs - 22, foot + 6, xs + (n - 1) * sp + 18, foot + 6, C.g3, 2);
  k.restore();
}

// @element 16
// 16 帯グラフ（100%積み上げ）: 4 bands of the same length fill from left to right; dashed lines join the borders
// Noah: いちばん上の帯の、はじめの 3 つの区切りに札 = [1 つ目（白）, 2 つ目, 3 つ目]（元の各帯の % の数の代わり。他の帯には字を置かない）。
// 帯は左から塗られ、塗り終わったら帯ごとぷるんと揺れる。
const BD = [[38, 27, 22, 13], [30, 34, 20, 16], [46, 24, 18, 12], [25, 31, 28, 16]];
function band(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const COL = [C.blue, C.blueM, C.blueL, C.g3];
  const x0 = 100, bwid = 390, bh = 28, gap = 16, y0 = (h - (4 * bh + 3 * gap)) / 2;
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
        k.fillStyle = COL[s]; k.fillRect(a, y, ww, bh);
        if (s) { k.fillStyle = C.stage; k.fillRect(a - 1, y, 2, bh); }
        a += ww;
      });
      k.restore();
    }, bh / 2);
    if (j === 0) {
      let left = x0;
      row.slice(0, 3).forEach((v, s) => {
        const ww = bwid * v / 100;
        say(k, u, t0 + 0.75 + s * 0.08, L[s], left + ww / 2, y + bh / 2 + 1, { size: 16, min: 14, max: ww - 14, color: s === 0 ? WHITE : C.mark });
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
function gantt(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const x0 = 84, cols = 8, cw = 52, yAxis = 44, f = fade(u);
  // skeleton: date scale + grid (always visible)
  for (let i = 0; i < cols; i++) txt(k, String(i + 1), x0 + cw * i + cw / 2, 34, `500 18px ${FONT}`, C.sub, 'center');
  k.strokeStyle = C.g2; k.lineWidth = 2;
  for (let i = 0; i <= cols; i++) { k.beginPath(); k.moveTo(x0 + cw * i, yAxis); k.lineTo(x0 + cw * i, 186); k.stroke(); }
  k.strokeStyle = C.g4; k.lineWidth = 2.5; k.lineCap = 'round';
  k.beginPath(); k.moveTo(x0, yAxis); k.lineTo(x0 + cw * cols, yAxis); k.stroke();
  for (let i = 0; i <= cols; i++) { k.beginPath(); k.moveTo(x0 + cw * i, yAxis - 6); k.lineTo(x0 + cw * i, yAxis); k.stroke(); }
  const T = [[0, 2], [1.5, 2], [3, 1.5], [3.5, 3], [6, 2]];
  T.forEach(([s, len], i) => {
    const y = 62 + i * 27, t0 = 0.4 + i * 0.3, p = ease(u, t0, 0.5);
    rr(k, 36, y - 4, 36, 8, 4); k.fillStyle = C.g3; k.fill();
    if (p <= 0.001) return;
    const bx = x0 + cw * s + 3, full = cw * len - 6;
    k.save(); k.globalAlpha = Math.min(1, p * 3) * f;
    put(k, bx + full / 2, y, wob(u, landed(t0, 0.5)), () => { k.fillStyle = i === 3 ? C.blue : C.blueM; rr(k, bx, y - 10, Math.max(6, full * p), 20, 6); k.fill(); }, 10);
    k.restore();
  });
  k.save(); k.globalAlpha = f;
  say(k, u, 1.7, L[0], x0 + cw * 3.5 - 8, 62 + 3 * 27 + 1, { size: 17, min: 14, max: 165, color: C.blue, align: 'right' });
  const mx = x0 + cw * 5.5, ml = Math.min(1, ease(u, 2.0, 0.4));
  if (ml > 0) seg(k, mx, yAxis, mx, lerp(yAxis, 184, ml), C.mark, 2.5);
  put(k, mx, yAxis, pose(u, 2.0), () => dot(k, mx, yAxis, 4.5, C.mark), 4.5);
  say(k, u, 2.3, L[1], mx, 197, { size: 16, min: 14, max: 120, color: C.mark });
  k.restore();
}

// @element 18
// 18 タイムライン: one line drawn left to right; dots and short marks appear in order, alternating up/down
// Noah: 月の名前（作り話の日付）の代わりに、上の 3 枚に札 = [左, 真ん中, 右（青）]。下の 2 枚は、字の代わりの灰色の棒。札の札は、字の幅に合わせて広げる。
// 点と札はぽよんと出る（札は、軸から伸びた線の先で）。
const TL_LABEL = [0, -1, 1, -1, 2];
function timeline(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const y = 106, xa = 36, xb = 503, f = fade(u), CARD: Fit = { size: 18, min: 15, max: 126 };
  const pl = easeInOut(P(u, 0.4, 2.0));
  const tip = lerp(xa, xb, pl);
  k.globalAlpha = f;
  if (pl > 0) {
    k.strokeStyle = C.mark; k.lineWidth = 3; k.lineCap = 'round';
    k.beginPath(); k.moveTo(xa, y); k.lineTo(tip, y); k.stroke();
    if (pl > 0.97) arrowTo(k, xb + 6, y, 1, 0, 11, C.mark);
  }
  const XS = [78, 166, 254, 342, 430];
  XS.forEach((x, i) => {
    const t0 = 0.4 + 1.6 * tipT(i, XS, xa, xb);
    if (u <= t0) return;
    const up = i % 2 === 0, last = i === XS.length - 1, r = last ? 10 : 7;
    // short stem + small card
    const ps = clamp(ease(u, t0 + 0.1, 0.3));
    const dir = up ? -1 : 1, y1 = y + dir * (r + 4), y2 = y + dir * (r + 4 + 22 * ps);
    k.strokeStyle = last ? C.blue : C.g4; k.lineWidth = 2.5;
    k.beginPath(); k.moveTo(x, y1); k.lineTo(x, y2); k.stroke();
    const text = TL_LABEL[i] < 0 ? '' : L[TL_LABEL[i]] ?? '';
    const cwid = text ? Math.max(64, fit(k, text, CARD).width + 24) : 64, chh = 32, cy = up ? y - r - 26 - chh / 2 : y + r + 26 + chh / 2;
    const left = clamp(x - cwid / 2, 8, w - 8 - cwid);
    put(k, left + cwid / 2, cy, pose(u, t0 + 0.15), () => {
      k.fillStyle = last ? C.blue : WHITE; k.strokeStyle = last ? C.blue : C.g3; k.lineWidth = 2;
      rr(k, left, cy - chh / 2, cwid, chh, 8); k.fill(); k.stroke();
      if (text) label(k, text, left + cwid / 2, cy + 1, { ...CARD, color: last ? WHITE : C.mark });
      else { rr(k, x - 20, cy - 6, 40, 5, 2.5); k.fillStyle = C.g3; k.fill(); rr(k, x - 20, cy + 2, 28, 5, 2.5); k.fillStyle = C.g2; k.fill(); }
    }, chh / 2);
    put(k, x, y, pose(u, t0), () => {
      k.fillStyle = last ? C.blue : C.blueM;
      k.beginPath(); k.arc(x, y, r, 0, 7); k.fill();
      k.strokeStyle = C.stage; k.lineWidth = 2; k.stroke();
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
  const cx0 = w / 2, bh = 34, gap = 10, y0 = 21, f = fade(u);
  const WD = [470, 350, 236, 132];
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
    if (li >= 0) say(k, u, t0 + 0.3, L[li], cx0, y + bh / 2 + 1, { size: 20, min: 15, max: wd - 20, color: i === 3 ? WHITE : C.mark });
    else put(k, cx0, y + bh / 2, pose(u, t0 + 0.3), () => { rr(k, cx0 - 22, y + bh / 2 - 3, 44, 6, 3); k.fillStyle = WHITE; k.fill(); }, 3);
  });
  k.globalAlpha = 1;
}

// @element 20
// 20 カスタマージャーニーマップ: stage headers as plain boxes (columns), an action card under each,
// then the feeling line goes up and down across the stages, with a smile / frown mark on each point
// Noah: 札 = [いちばん高い点（上に青で）, いちばん低い点（下に灰色で）]。見出し・行動の札・顔は、ぽよんと出る。
const JV = [0.35, 0.7, -0.6, 0.15, 0.85];     // feeling per stage (+ up = good)
function face(k: K, x: number, y: number, r: number, good: boolean, col: string) {
  k.fillStyle = col; k.beginPath(); k.arc(x, y, r, 0, Math.PI * 2); k.fill();
  k.fillStyle = WHITE;
  k.beginPath(); k.arc(x - r * 0.36, y - r * 0.22, r * 0.13, 0, 7); k.fill();
  k.beginPath(); k.arc(x + r * 0.36, y - r * 0.22, r * 0.13, 0, 7); k.fill();
  k.strokeStyle = WHITE; k.lineWidth = Math.max(1.6, r * 0.15); k.lineCap = 'round';
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
    pbox(k, u, 0.35 + i * 0.1, cx(i), 27, cw - 12, 26, 7, i === 2 ? C.g3 : C.blueM, () => { rr(k, cx(i) - 22, 25, 44, 5, 2.5); k.fillStyle = WHITE; k.fill(); });
  }
  // action cards (what the customer does at each stage)
  for (let i = 0; i < n; i++) {
    const y = 50;
    put(k, cx(i), y + 19, pose(u, 0.6 + i * 0.1), () => {
      rr(k, cx(i) - cw / 2 + 10, y, cw - 20, 38, 6); k.fillStyle = WHITE; k.fill();
      k.strokeStyle = C.g3; k.lineWidth = 1.5; k.stroke();
      rr(k, cx(i) - cw / 2 + 18, y + 10, cw - 46, 6, 3); k.fillStyle = C.g3; k.fill();
      rr(k, cx(i) - cw / 2 + 18, y + 22, cw - 60, 6, 3); k.fillStyle = C.g2; k.fill();
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
    k.strokeStyle = C.blue; k.lineWidth = 3.5; k.lineJoin = 'round'; k.lineCap = 'round';
    k.beginPath(); k.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], mx = (x0 + x1) / 2;
      k.bezierCurveTo(mx, y0, mx, y1, x1, y1);
    }
    k.stroke(); k.restore();
  }
  pts.forEach(([x, y], i) => {
    const good = JV[i] >= 0;
    put(k, x, y, pose(u, 1.2 + (i / (n - 1)) * 1.0), () => face(k, x, y, 12, good, good ? C.blue : C.g4), 12);
  });
  const hi = JV.indexOf(Math.max(...JV)), lo = JV.indexOf(Math.min(...JV));
  say(k, u, 2.3, L[0], pts[hi][0], pts[hi][1] - 22, { size: 16, min: 14, max: cw - 8, color: C.blue });
  say(k, u, 2.35, L[1], pts[lo][0], pts[lo][1] + 24, { size: 16, min: 14, max: cw - 8, color: C.sub });
  k.globalAlpha = 1;
}

// @element 21
// 21 ツリーマップ: one outer rectangle gets filled by rectangles of different sizes, biggest first
// Noah: 札 = [いちばん大きい四角（青。元の A）, 2 番目（元の B）]。C・D の字は描かない。四角は、札ごとぽよんと出る。
function treemap(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const f = fade(u);
  const X0 = 50, Y0 = 18, X1 = 489, Y1 = 190;
  k.strokeStyle = C.g3; k.lineWidth = 2; k.setLineDash([6, 6]);
  rr(k, X0, Y0, X1 - X0, Y1 - Y0, 6); k.stroke(); k.setLineDash([]);
  const RS: readonly [number, number, number, number, string, number][] = [                                  // x, y, w, h, color, label index
    [50, 18, 206, 172, C.blue, 0],
    [260, 18, 140, 96, C.blueM, 1],
    [404, 18, 85, 96, C.blueL, -1],
    [260, 118, 98, 72, C.blueL, -1],
    [362, 118, 70, 72, C.g3, -1],
    [436, 118, 53, 34, C.g3, -1],
    [436, 156, 53, 34, C.g4, -1],
  ];
  k.globalAlpha = f;
  RS.forEach(([x, y, ww, hh, col, li], i) => {
    pbox(k, u, 0.4 + i * 0.22, x + ww / 2, y + hh / 2, ww, hh, 5, col, li >= 0
      ? () => label(k, L[li], x + 12, y + 21, { size: li === 0 ? 24 : 20, min: li === 0 ? 18 : 15, max: ww - 24, color: li === 0 ? WHITE : C.mark, align: 'left' })
      : undefined);
  });
  k.globalAlpha = 1;
}

// @element 22
// 22 スイムレーン図: lane names on the left; boxes and arrows move across the lanes step by step
// Noah: レーンの名前（顧客・営業・制作）を札 = [上, 真ん中, 下 のレーン] に。名前の列を 62 から 80 に広げた。手順の箱はぽよんと出る。
function swimlane(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const f = fade(u), X0 = 22, X1 = 517, HW = 80, Y0 = 13, LH = 60, NL = 3;
  // skeleton: lanes
  for (let i = 0; i < NL; i++) {
    const y = Y0 + i * LH;
    k.fillStyle = WHITE; k.fillRect(X0 + HW, y, X1 - X0 - HW, LH);
    k.fillStyle = C.g2; k.fillRect(X0, y, HW, LH);
    label(k, L[i], X0 + HW / 2, y + LH / 2 + 1, { size: 18, min: 15, max: HW - 12, color: C.mark });
  }
  k.strokeStyle = C.g3; k.lineWidth = 2;
  for (let i = 1; i < NL; i++) { k.beginPath(); k.moveTo(X0, Y0 + i * LH); k.lineTo(X1, Y0 + i * LH); k.stroke(); }
  k.beginPath(); k.moveTo(X0 + HW, Y0); k.lineTo(X0 + HW, Y0 + NL * LH); k.stroke();
  rr(k, X0, Y0, X1 - X0, NL * LH, 6); k.stroke();
  // steps
  const BX = [138, 224, 310, 396, 474], BLN = [0, 1, 2, 1, 0], bw = 56, bh = 30;
  const cyOf = (l: number) => Y0 + l * LH + LH / 2;
  k.globalAlpha = f;
  for (let i = 0; i < BX.length; i++) {
    const t0 = 0.4 + i * 0.38;
    // arrow from previous box: right, then down/up into this box
    if (i > 0) {
      const pa = easeInOut(P(u, t0 - 0.24, t0 + 0.02));
      if (pa > 0) {
        const xs = BX[i - 1] + bw / 2, ys = cyOf(BLN[i - 1]), xe = BX[i], ye0 = cyOf(BLN[i]);
        const down = ye0 > ys, ye = ye0 + (down ? -bh / 2 - 3 : bh / 2 + 3);
        const l1 = xe - xs, l2 = Math.abs(ye - ys), tot = l1 + l2, d = pa * tot;
        k.strokeStyle = C.mark; k.lineWidth = 2.5; k.lineCap = 'round'; k.lineJoin = 'round';
        k.beginPath(); k.moveTo(xs, ys);
        if (d <= l1) k.lineTo(xs + d, ys);
        else { k.lineTo(xe, ys); k.lineTo(xe, ys + (down ? 1 : -1) * (d - l1)); }
        k.stroke();
        if (pa > 0.98) arrowTo(k, xe, ye, 0, down ? 1 : -1, 9, C.mark);
      }
    }
    const last = i === BX.length - 1, cx = BX[i], cy = cyOf(BLN[i]);
    put(k, cx, cy, pose(u, t0), () => {
      k.fillStyle = last ? C.blue : C.blueL; k.strokeStyle = last ? C.blue : C.blueM; k.lineWidth = 2;
      rr(k, cx - bw / 2, cy - bh / 2, bw, bh, 7); k.fill(); k.stroke();
      k.fillStyle = last ? WHITE : C.g4;
      rr(k, cx - 16, cy - 3, 32, 6, 3); k.fill();
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
      txt(k, String(i + 1), tx + 4, ym + 1, `700 24px ${FONT}`, i === n - 1 ? WHITE : C.mark, 'center', 'middle');
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
// Noah: TAM・SAM・SOM の代わりに、札 = [真ん中の円の中（白）, 外の円の右]。円は、下の端を基準にぽよんと出る（中の円ほど後）。
function concentric(k: K, w: number, h: number, u: number, L: readonly string[]) {
  bg(k, w, h);
  const f = fade(u), cx0 = w / 2, cy0 = h / 2 + 2;
  const RR = [91, 61, 31], COL = [C.blueL, C.blueM, C.blue];
  // skeleton: faint outer ring guide
  k.strokeStyle = C.g2; k.lineWidth = 2; k.beginPath(); k.arc(cx0, cy0, RR[0], 0, 7); k.stroke();
  k.globalAlpha = f;
  RR.forEach((r, i) => put(k, cx0, cy0, pose(u, 0.4 + i * 0.45), () => { k.fillStyle = COL[i]; k.beginPath(); k.arc(cx0, cy0, r, 0, 7); k.fill(); }, r));
  say(k, u, 1.85, L[0], cx0, cy0 + 1, { size: 18, min: 14, max: 54, color: WHITE });
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

/** 1 枚の図解を、時刻 u（秒）の形で描く。k は、539×208 の座標で描けるように縮めた（setTransform 済みの）面。前の絵は、ここで塗りつぶす。 */
export function drawNoahPinDiagram(k: CanvasRenderingContext2D, scene: Pick<NoahPinScene, 'template' | 'labels'>, u: number): void {
  k.save();
  CELLS[scene.template](k, CW, CH, u, scene.labels);
  k.restore();
}
