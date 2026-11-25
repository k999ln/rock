// ピンの図解の、配色の黄金比（ベース 70%・メイン 25%・アクセント 5%）を node の中で確かめるための、小さな canvas の代わり。
// 図の描く命令（面・四角・角の丸い四角・円・楕円・線・曲線・切り抜き）を、539×208 の 1 画素ずつの「どの色の仲間が塗ったか」の表に塗る。
// 字は数えない（字は、どの仲間でもない）。線の点線は、つながった線として塗る。透けた塗り（不透明さ 0.5 未満）は数えない。
// 本物のブラウザで画素を数えた値（2026-11-24。spec-115 の 9 章の表）と、1 枚あたり 1% 以内で合う。
const W = 539, H = 208;
const FAMILY = { none: 0, base: 1, main: 2, accent: 3, ink: 4 };

function hexRGB(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function oklab([r, g, b]) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363015264 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** 色の仲間の見分け方: 役割の色はそのまま、混ぜた色（ヒートマップの段・動きの途中）は、いちばん近い役割の色の仲間。 */
export function colorFamilies(c) {
  const roles = [
    ...['bg1', 'bg2', 'stage', 'g2', 'g3', 'g4', 'card'].map((r) => [c[r], 'base']),
    ...['blueM', 'blueL'].map((r) => [c[r], 'main']),
    ...[0.25, 0.5, 0.75].map((t) => { const A = hexRGB(c.blueL), B = hexRGB(c.blueM); return ['#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''), 'main']; }),
    [c.blue, 'accent'],
    ...['mark', 'sub', 'onBlue', 'onM', 'onL', 'chip', 'accentText'].map((r) => [c[r], 'ink']),
  ];
  const exact = new Map(), refs = roles.map(([hex, f]) => [oklab(hexRGB(hex)), f]);
  for (const [hex, f] of roles) if (!exact.has(hex.toUpperCase())) exact.set(hex.toUpperCase(), f);
  return (style) => {
    if (typeof style !== 'string') return 'base';                       // 濃淡（面）は、ベース
    let rgb, alpha = 1;
    if (style.startsWith('#')) { const hit = exact.get(style.toUpperCase()); if (hit) return hit; rgb = hexRGB(style); }
    else { const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(style); if (!m) return 'none'; rgb = [+m[1], +m[2], +m[3]]; alpha = +m[4]; }
    if (alpha < 0.5) return 'none';
    const p = oklab(rgb); let best = Infinity, fam = 'none';
    for (const [q, f] of refs) { const e = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (e < best) { best = e; fam = f; } }
    return fam;
  };
}

/** 塗る代わり。classify は色の文字 → 仲間。shares() で、字を除いた塗りの中の、ベース・メイン・アクセントの割合。 */
export function rasterContext(classify, measure) {
  const grid = new Uint8Array(W * H);
  let clip = null;                                      // null = 切り抜きなし。Uint8Array = 塗ってよい画素
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic' };
  let subpaths = [], cur = null;
  const T = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const scaleOf = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const start = (x, y) => { cur = { pts: [T(x, y)], closed: false }; subpaths.push(cur); };
  const add = (x, y) => { if (!cur) start(x, y); else cur.pts.push(T(x, y)); };
  const arcPts = (x, y, rx, ry, rot, a0, a1, ccw) => {
    let d = a1 - a0;
    if (!ccw && d < 0) d = d % (2 * Math.PI) + 2 * Math.PI; if (ccw && d > 0) d = d % (2 * Math.PI) - 2 * Math.PI;
    if (Math.abs(a1 - a0) >= 2 * Math.PI) d = ccw ? -2 * Math.PI : 2 * Math.PI;
    const n = Math.max(8, Math.ceil(Math.abs(d) / (Math.PI / 32))), c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i <= n; i++) { const a = a0 + (d * i) / n, px = Math.cos(a) * rx, py = Math.sin(a) * ry; add(x + px * c - py * s, y + px * s + py * c); }
  };
  // 多角形を、画素の真ん中で、0 でない巻き数の規則で塗る。
  function rasterPolys(polys, paint) {
    let y0 = H, y1 = 0;
    for (const p of polys) for (const [, y] of p) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
    for (let py = y0; py <= y1; py++) {
      const yc = py + 0.5, xs = [];
      for (const p of polys) for (let i = 0; i < p.length; i++) {
        const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push([ax + ((yc - ay) / (by - ay)) * (bx - ax), by > ay ? 1 : -1]);
      }
      xs.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i][1];
        if (wind === 0) continue;
        const xa = Math.max(0, Math.ceil(xs[i][0] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[i + 1][0] - 0.5));
        for (let px = xa; px <= xb; px++) paint(py * W + px);
      }
    }
  }
  function paintPolys(polys, style) {
    if (state.globalAlpha < 0.5) return;
    const fam = classify(style);
    if (fam === 'none') return;
    const code = FAMILY[fam];
    rasterPolys(polys, (i) => { if (!clip || clip[i]) grid[i] = code; });
  }
  const circle = (x, y, r) => Array.from({ length: 24 }, (_, i) => [x + Math.cos((i / 24) * 2 * Math.PI) * r, y + Math.sin((i / 24) * 2 * Math.PI) * r]);
  function strokePolys() {
    const hw = (state.lineWidth * scaleOf()) / 2, out = [];
    for (const sp of subpaths) {
      const pts = sp.closed ? [...sp.pts, sp.pts[0]] : sp.pts;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay);
        if (len < 1e-6) continue;
        const nx = (-(by - ay) / len) * hw, ny = ((bx - ax) / len) * hw;
        out.push([[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]);
      }
      const round = state.lineJoin === 'round';
      for (let i = 0; i < pts.length; i++) {
        const end = !sp.closed && (i === 0 || i === pts.length - 1);
        if (end ? state.lineCap === 'round' : round) out.push(circle(pts[i][0], pts[i][1], hw));
      }
    }
    return out;
  }
  const gradient = () => ({ addColorStop() {} });
  const k = {
    canvas: { width: W, height: H },
    save() { stack.push([m, { ...state }, clip]); },
    restore() { const [a, b, c] = stack.pop(); m = a; Object.assign(state, b); clip = c; },
    setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    translate(x, y) { m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    scale(x, y) { m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]]; },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, m[2] * c - m[0] * s, m[3] * c - m[1] * s, m[4], m[5]]; },
    beginPath() { subpaths = []; cur = null; },
    moveTo(x, y) { start(x, y); },
    lineTo(x, y) { add(x, y); },
    closePath() { if (cur) { cur.closed = true; const [x, y] = cur.pts[0]; cur = { pts: [[x, y]], closed: false }; subpaths.push(cur); } },
    bezierCurveTo(c0x, c0y, c1x, c1y, x, y) {
      const inv = (() => { const det = m[0] * m[3] - m[1] * m[2]; return ([px, py]) => { const dx = px - m[4], dy = py - m[5]; return [(m[3] * dx - m[2] * dy) / det, (-m[1] * dx + m[0] * dy) / det]; }; })();
      const [p0x, p0y] = cur ? inv(cur.pts[cur.pts.length - 1]) : [c0x, c0y];
      for (let i = 1; i <= 24; i++) { const t = i / 24, u = 1 - t; add(u * u * u * p0x + 3 * u * u * t * c0x + 3 * u * t * t * c1x + t * t * t * x, u * u * u * p0y + 3 * u * u * t * c0y + 3 * u * t * t * c1y + t * t * t * y); }
    },
    arc(x, y, r, a0, a1, ccw = false) { arcPts(x, y, r, r, 0, a0, a1, ccw); },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) { arcPts(x, y, rx, ry, rot, a0, a1, ccw); },
    rect(x, y, w, h) { start(x, y); add(x + w, y); add(x + w, y + h); add(x, y + h); cur.closed = true; cur = null; },
    roundRect(x, y, w, h, r) {
      if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
      const q = Math.max(0, Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2));
      cur = null;
      arcPts(x + w - q, y + q, q, q, 0, -Math.PI / 2, 0, false); arcPts(x + w - q, y + h - q, q, q, 0, 0, Math.PI / 2, false);
      arcPts(x + q, y + h - q, q, q, 0, Math.PI / 2, Math.PI, false); arcPts(x + q, y + q, q, q, 0, Math.PI, Math.PI * 1.5, false);
      if (cur) { cur.closed = true; cur = null; }
    },
    fill() { paintPolys(subpaths.map((sp) => sp.pts).filter((p) => p.length > 2), state.fillStyle); },
    stroke() { paintPolys([], state.strokeStyle); for (const poly of strokePolys()) paintPolys([poly], state.strokeStyle); },
    fillRect(x, y, w, h) { paintPolys([[T(x, y), T(x + w, y), T(x + w, y + h), T(x, y + h)]], state.fillStyle); },
    clip() {
      const mask = new Uint8Array(W * H);
      rasterPolys(subpaths.map((sp) => sp.pts).filter((p) => p.length > 2), (i) => { if (!clip || clip[i]) mask[i] = 1; });
      clip = mask;
    },
    setLineDash() {}, fillText() {}, measureText: (text) => ({ width: measure(text) * Number(/(\d+(?:\.\d+)?)px/.exec(state.font)[1]) }),
    createLinearGradient: gradient, createRadialGradient: gradient,
  };
  for (const key of Object.keys(state)) Object.defineProperty(k, key, { get: () => state[key], set: (v) => { state[key] = v; }, enumerable: true });
  return {
    k,
    shares() {
      const n = [0, 0, 0, 0, 0];
      for (const v of grid) n[v]++;
      const colored = n[1] + n[2] + n[3];
      return { base: n[1] / colored, main: n[2] / colored, accent: n[3] / colored };
    },
  };
}
