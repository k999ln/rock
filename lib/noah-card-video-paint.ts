import { resolveNoahAgentArt, type NoahAgentArtScene } from './noah-agent-art.ts';

type Art = ReturnType<typeof resolveNoahAgentArt>;
type Brush = CanvasRenderingContext2D;
type Palette = readonly [ground: string, ink: string, accent: string, muted: string, rule: string];
type Page = { ctx: Brush; theme: Palette; t: number; name: string; summary: string; seed: number };
type Point = readonly [number, number];

const stock = {
  cream: ['#f6efe2', '#2b2722', '#d54b1d', '#716758', '#c8beaa'],
  blue: ['#273772', '#fff7eb', '#dffa81', '#bacbec', '#6778a8'],
  mint: ['#d7e5d3', '#203d3b', '#a53e28', '#496b5d', '#9eb4a0'],
  dark: ['#172f36', '#eff5dc', '#f9bf50', '#a4c5be', '#406168'],
  wine: ['#3e222f', '#fff0dd', '#ff965c', '#ddb7b7', '#8c6270'],
  gold: ['#f1c85d', '#262d31', '#8f3627', '#645a3d', '#bea04f'],
  paper: ['#e6e7ea', '#1e2a39', '#275ab9', '#657184', '#b4bdc8'],
  blush: ['#f3c9bb', '#382635', '#953455', '#7c5768', '#c6a0a1'],
} as const satisfies Record<string, Palette>;

const paperByScene = {
  intake: 'cream', manual: 'blue', verify: 'mint', ledger: 'dark', memory: 'wine',
  'car-search': 'gold', photo: 'blue', evidence: 'paper', capital: 'dark', journey: 'blush',
  files: 'blue', clock: 'gold', reasoning: 'cream', campaign: 'blush', status: 'dark',
  call: 'wine', site: 'paper', api: 'mint', film: 'wine', translate: 'gold',
} as const satisfies Record<Exclude<NoahAgentArtScene, 'signature'>, keyof typeof stock>;

const alternatePaper: Record<keyof typeof stock, readonly [keyof typeof stock, keyof typeof stock]> = {
  cream: ['paper', 'gold'], blue: ['dark', 'wine'], mint: ['paper', 'cream'], dark: ['blue', 'wine'],
  wine: ['dark', 'blue'], gold: ['cream', 'blush'], paper: ['mint', 'cream'], blush: ['cream', 'gold'],
};
const coverEditions = new Set(['法人のsi導入準備', 'Cerebrium Docs', 'CertifiKit COI tools', 'CFO+', 'memory',
  'Carfinity car marketplace', 'Capital Company', 'Capxule', 'filesystem', 'time'].map(name => resolveNoahAgentArt('', name).seed));

function palette(art: Art, variation = 0): Palette {
  const keys = Object.keys(stock) as (keyof typeof stock)[];
  const paper = art.scene === 'signature' ? keys[art.seed % keys.length] : paperByScene[art.scene];
  const edition = coverEditions.has(art.seed) || art.scene === 'signature' ? 0 : (art.seed >>> 5) % 3;
  const variant = (edition + (Number.isFinite(variation) ? Math.abs(Math.trunc(variation)) : 0)) % 3;
  return stock[variant === 0 ? paper : alternatePaper[paper][variant - 1]];
}
const sans = 'Arial, "Hiragino Sans", "Yu Gothic", sans-serif';
const serif = 'Georgia, "Hiragino Mincho ProN", "Yu Mincho", serif';
const mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
function fit(t: number, start = 0, end = 1) {
  const x = Math.max(0, Math.min(1, (t - start) / (end - start)));
  return 1 - (1 - x) ** 3;
}
function box(c: Brush, x: number, y: number, w: number, h: number, fill: string) {
  c.fillStyle = fill; c.fillRect(x, y, w, h);
}
function line(c: Brush, x: number, y: number, x2: number, y2: number, color: string, width = 1) {
  c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function text(c: Brush, value: string, x: number, y: number, size: number, ink: string, face = sans, weight = 500, maxWidth = 288) {
  c.font = `${weight} ${size}px ${face}`; c.fillStyle = ink;
  // Elide instead of squeezing arbitrary names into visibly distorted letters.
  if (c.measureText(value).width > maxWidth) {
    let s = '';
    for (const char of value) {
      if (c.measureText(s + char + '…').width > maxWidth) break;
      s += char;
    }
    value = s + '…';
  }
  c.fillText(value, x, y);
}
function type(value: string, amount: number) { return Array.from(value).slice(0, Math.ceil(Array.from(value).length * amount)).join(''); }
function round(c: Brush, x: number, y: number, r: number, ink: string) {
  c.fillStyle = ink; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}
function trace(c: Brush, points: Point[], progress: number, color: string, width: number) {
  c.beginPath();
  c.moveTo(...points[0]);
  const segment = progress * (points.length - 1);
  for (let i = 1; i < points.length; i++) {
    const k = Math.max(0, Math.min(1, segment - i + 1));
    if (!k) break;
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    c.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k);
  }
  c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.stroke();
}
function rule(p: Page, y: number, x = 23, right = 297) { line(p.ctx, x, y, right, y, p.theme[4]); }
function sample(p: Page, label: string, y = 29) {
  const name = p.name.trim();
  const useName = !coverEditions.has(p.seed) && name && name.toLowerCase() !== label.toLowerCase();
  text(p.ctx, useName ? name : label, 23, y, 13, p.theme[3], mono, 650, 275);
}
function check(p: Page, x: number, y: number, amount: number) {
  trace(p.ctx, [[x, y], [x + 4, y + 4], [x + 12, y - 6]], amount, p.theme[2], 2.2);
}

function intake(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted, ruled], t } = p;
  box(c, 23, 18, 30, 5, accent); text(c, '導入準備票', 21, 76, 48, ink, serif, 650);
  rule(p, 90);
  ['現在の業務', '担当する人', '研修で聞くこと'].forEach((label, i) => {
    const y = 119 + i * 34;
    c.strokeStyle = ruled; c.lineWidth = 1.2; c.strokeRect(24, y - 13, 12, 12);
    text(c, label, 49, y, 18, ink, sans, 600); line(c, 182, y - 3, 292, y - 3, ruled);
    const k = fit(t, .06 + .19 * i, .58 + .14 * i);
    line(c, 185, y - 5, 185 + (60 - i * 9) * k, y - 5, muted, 2.2);
    check(p, 26, y - 6, k);
  });
}
function manual(p: Page) {
  const { ctx: c, theme: [ground, ink, accent, muted, ruled], t } = p;
  const cerebrium = /cerebrium/i.test(p.name);
  sample(p, cerebrium ? 'Cerebrium Docs' : 'Reference index');
  const query = cerebrium ? 'deploy' : 'reference';
  text(c, type(query, fit(t, 0, .47)), 21, 85, 51, ink, mono, 650);
  const q = type(query, fit(t, 0, .47)); c.font = `650 51px ${mono}`;
  if (t < .55) box(c, 24 + c.measureText(q).width, 47, 3, 43, accent);
  line(c, 23, 98, 297, 98, ruled);
  const rows = cerebrium ? ['Deployment', 'cerebrium.toml', 'Endpoints'] : ['Reference', 'Source text', 'Page index'];
  rows.forEach((s, i) => {
    const y = 128 + i * 31;
    text(c, s, 26, y, i === 0 ? 21 : 17, i ? muted : ink, mono, i ? 450 : 700);
    if (i === 0) {
      const w = (cerebrium ? 164 : 138) * fit(t, .30, .83);
      c.save(); c.beginPath(); c.rect(21, y - 20, w, 28); c.clip();
      box(c, 21, y - 20, w, 28, accent); text(c, s, 26, y, 21, ground, mono, 700); c.restore();
    }
  });
}
function verify(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted], t } = p;
  const coi = /certifikit|coi/i.test(p.name);
  sample(p, coi ? 'Certificate of Insurance' : 'Source record');
  text(c, coi ? 'ACORD 25' : '照合票', 20, 79, coi ? 47 : 50, ink, serif, 650);
  rule(p, 92);
  const rows = coi ? ['Insured', 'Coverage', 'Policy term'] : ['Record', 'Source', 'Reference'];
  rows.forEach((s, i) => {
    const y = 119 + i * 31;
    text(c, s, 23, y, 18, ink); line(c, 123, y - 4, 185, y - 4, muted, 1);
    check(p, 199, y - 6, fit(t, .08 + .13 * i, .49 + .13 * i));
  });
  const stamp = fit(t, .48, .88); c.save();
  c.translate(234, 160 + (1 - stamp) * -16); c.rotate(-.14);
  c.globalAlpha = stamp; c.strokeStyle = accent; c.lineWidth = 3; c.strokeRect(-46, -24, 92, 47);
  c.lineWidth = 1; c.strokeRect(-41, -19, 82, 37);
  text(c, '照合', -28, 10, 29, accent, serif, 700); c.restore();
}
function ledger(p: Page, capital = false) {
  const { ctx: c, theme: [, ink, accent, muted, ruled], t } = p;
  sample(p, capital ? (/capital company/i.test(p.name) ? 'Capital Company' : 'Capital workflow') : /cfo\+/i.test(p.name) ? 'CFO+ · モデル例' : 'モデル例');
  text(c, capital ? 'Capital calls' : 'Model A', 22, 72, 43, ink, serif, 650); rule(p, 85);
  if (capital) {
    ['Fund', 'Investors', 'Capital call'].forEach((label, i) => {
      const y = 118 + 31 * i; text(c, label, 23, y, 19, ink);
      line(c, 165, y - 5, 165 + fit(t, i * .17, .48 + i * .17) * (108 - i * 19), y - 5, accent, 4);
    });
  } else {
    const table = [[14, 'A'], [23, 'B'], [19, 'C'], [32, 'D']] as const;
    table.forEach(([value, column], i) => {
      const x = 25 + 72 * i;
      text(c, column, x, 109, 13, muted, mono); text(c, type(String(value), fit(t, .06 + i * .08, .35 + i * .08)), x, 138, 26, ink, mono);
      line(c, x, 171, x + 50, 171, ruled);
    });
    const points = table.map(([value], i): Point => [29 + 74 * i, 209 - value * 1.55]);
    trace(c, points, fit(t, .32, .91), accent, 4);
    points.forEach(([x, y], i) => { if (t > .37 + i * .10) round(c, x, y, 3, accent); });
  }
}
function memory(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted], t } = p;
  sample(p, /^memory$/i.test(p.name) ? 'Memory' : 'メモの関係');
  const nodes = [
    { x: 25, y: 81, text: '打ち合わせ', sub: 'メモ' },
    { x: 172, y: 126, text: '制作チーム', sub: '担当' },
    { x: 76, y: 185, text: '企画書', sub: '成果物' },
  ];
  trace(c, [[92, 88], [120, 108], [158, 114]], fit(t, .04, .62), accent, 2);
  trace(c, [[208, 138], [179, 157], [153, 166]], fit(t, .32, .86), accent, 2);
  nodes.forEach((n, i) => {
    const k = .42 + .58 * fit(t, i * .12, .6 + i * .12);
    c.save(); c.globalAlpha = k;
    text(c, n.sub, n.x, n.y - 27, 12, muted, sans, 550);
    text(c, n.text, n.x, n.y, i === 0 ? 29 : 24, ink, serif, 650);
    line(c, n.x, n.y + 6, n.x + (i === 2 ? 82 : 113), n.y + 6, muted, 1); c.restore();
  });
}
function files(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted], t } = p;
  sample(p, /^filesystem$/i.test(p.name) ? 'filesystem' : 'ファイル一覧'); text(c, '/project', 21, 75, 39, ink, mono, 650); rule(p, 90);
  line(c, 35, 108, 35, 181, muted, 2);
  ['docs/', 'notes.md', 'assets/'].forEach((s, i) => {
    const y = 122 + i * 31;
    line(c, 35, y - 6, 56, y - 6, muted);
    text(c, type(s, fit(t, .03 + i * .15, .45 + i * .15)), 66, y, 22, i === 1 ? accent : ink, mono);
  });
}
function film(p: Page) {
  const { ctx: c, theme: [ground, ink, accent, muted, ruled], t } = p;
  sample(p, '編集タイムライン'); text(c, '00:0' + Math.round(3 * fit(t, 0, .90)), 20, 83, 56, ink, mono, 600);
  for (let i = 0; i < 12; i++) { const x = 23 + 24 * i; line(c, x, 99, x, i % 3 ? 104 : 109, muted, 1.5); }
  const firstCut = 59 + (p.seed & 31), secondCut = 67 + ((p.seed >>> 8) & 31);
  const source = [firstCut, secondCut, 259 - firstCut - secondCut];
  let x = 23;
  source.forEach((width, i) => {
    const y = 119 + (1 - fit(t, .02 + i * .13, .44 + i * .13)) * 11;
    box(c, x, y, width, 47, i === 1 ? accent : ruled);
    for (let k = 0; k < 4; k++) box(c, x + 7 + k * (width - 12) / 4, y + 7, 3, 3, ground);
    text(c, '0' + (i + 1), x + 7, y + 37, 19, i === 1 ? ground : ink, mono);
    x += width + 5;
  });
  const cursor = 27 + 246 * fit(t, .13, .92);
  line(c, cursor, 102, cursor, 184, ink, 2);
  for (let i = 0; i < 44; i++) { const amp = 2 + 8 * Math.abs(Math.sin(i * 1.12 + (p.seed & 15)) * Math.cos(i * .22)); box(c, 24 + i * 6, 185 - amp / 2, 3, amp, muted); }
}
function image(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted, ruled], t } = p;
  sample(p, '車両画像 · 背景編集');
  // The two fields meet on a moving before/after seam. The silhouette stays fixed.
  box(c, 22, 43, 276, 134, ruled);
  const x = 23 + fit(t, .02, .9) * 186;
  box(c, 22, 43, x - 22, 134, muted);
  c.beginPath(); c.moveTo(51, 130); c.quadraticCurveTo(54, 115, 76, 112);
  c.lineTo(104, 86); c.quadraticCurveTo(113, 79, 126, 79); c.lineTo(179, 79);
  c.quadraticCurveTo(190, 81, 207, 108); c.lineTo(244, 116); c.quadraticCurveTo(255, 118, 257, 136);
  c.lineTo(249, 144); c.lineTo(52, 144); c.closePath(); c.fillStyle = ink; c.fill();
  c.fillStyle = p.theme[0]; c.beginPath(); c.moveTo(96, 108); c.lineTo(114, 89); c.lineTo(146, 88); c.lineTo(146, 108); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(152, 88); c.lineTo(178, 88); c.lineTo(196, 108); c.lineTo(152, 108); c.closePath(); c.fill();
  [92, 213].forEach(wx => { round(c, wx, 141, 15, ink); round(c, wx, 141, 5, p.theme[0]); });
  line(c, x, 42, x, 178, accent, 2.5);
  text(c, 'Before', 22, 199, 15, muted, mono); text(c, 'After', 249, 199, 15, ink, mono);
}
function clock(p: Page) {
  const { ctx: c, theme: [, ink, accent], t } = p;
  sample(p, 'タイムゾーン変換');
  text(c, 'UTC', 23, 73, 18, ink, mono); text(c, '09:00', 99, 83, 48, ink, mono, 600);
  rule(p, 101);
  text(c, 'Tokyo', 23, 147, 18, ink); text(c, type('18:00', fit(t, .12, .78)), 99, 161, 48, accent, mono, 600);
  text(c, '+09:00', 100, 190, 18, ink, mono);
}
function translate(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted], t } = p;
  sample(p, 'EN → JA');
  text(c, 'Good morning.', 21, 80, 32, ink, serif, 600); rule(p, 103);
  text(c, type('おはよう。', fit(t, .14, .79)), 21, 169, 43, accent, serif, 650);
  if (t < .65) line(c, 23, 183, 131, 183, muted, 1);
}
function call(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted], t } = p;
  sample(p, '音声通話'); text(c, 'Voice', 21, 86, 56, ink, serif, 650);
  const k = fit(t, .03, .92);
  for (let i = 0; i < 46; i++) {
    const x = 23 + i * 6; const amp = 3 + 57 * Math.abs(Math.sin(i * .48) * Math.sin(.13 * i));
    line(c, x, 143 - amp / 2, x, 143 + amp / 2, i / 46 < k ? accent : muted, 3);
  }
  rule(p, 182);
}
function evidence(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted], t } = p;
  sample(p, 'Evidence graph'); text(c, '所見と出典', 21, 73, 39, ink, serif, 650); rule(p, 88);
  text(c, 'Finding', 24, 119, 20, ink, mono);
  line(c, 26, 130, 26 + 160 * fit(t, .05, .55), 130, accent, 3);
  line(c, 30, 141, 30, 170, muted); line(c, 30, 170, 54, 170, muted);
  text(c, type('Source paper', fit(t, .27, .82)), 62, 177, 25, ink, serif, 600);
}
function status(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted], t } = p;
  sample(p, '稼働状況'); text(c, 'Health check', 21, 76, 39, ink, serif, 600); rule(p, 92);
  ['Provider', 'Latency', 'Status'].forEach((label, i) => text(c, label, 23 + i * 98, 116, 13, muted, mono));
  const pts: Point[] = [[24, 166],[63, 166],[72, 153],[84, 166],[111, 166],[123, 144],[139, 177],[151, 159],[192, 159],[202, 146],[219, 166],[289, 166]];
  trace(c, pts, fit(t, .02, .9), accent, 3.4);
}
function api(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted], t } = p;
  sample(p, 'API discovery');
  text(c, 'Endpoint', 21, 78, 45, ink, serif, 600); rule(p, 94);
  text(c, 'GET', 23, 132, 25, accent, mono, 650);
  text(c, type('/resources', fit(t, .03, .58)), 88, 132, 24, ink, mono);
  text(c, type('{ … }', fit(t, .37, .87)), 25, 178, 29, muted, mono);
}
function compactList(p: Page, label: string, heading: string, rows: string[]) {
  const { ctx: c, theme: [, ink, accent, muted], t } = p;
  sample(p, label); text(c, heading, 21, 76, 42, ink, serif, 650); rule(p, 89);
  rows.forEach((s, i) => {
    const y = 118 + i * 32;
    const k = fit(t, i * .155, .57 + i * .15);
    text(c, '0' + (i + 1), 23, y, 14, muted, mono);
    text(c, type(s, k), 63, y, 20, ink, sans, 550);
    line(c, 63, y + 7, 63 + (114 - 13 * i) * k, y + 7, accent, 1.6);
  });
}
function signature(p: Page) {
  const { ctx: c, theme: [, ink, accent, muted], name, summary, seed, t } = p;
  const len = Math.max(34, Math.min(87, 36 + (seed >>> 9) % 50));
  const title = name || 'Agent';
  const fragments = title.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s/._-]+/u).filter(Boolean);
  const words = fragments.length > 1 ? fragments : [title];
  const rows: string[] = [];
  for (const word of words) {
    const last = rows.length - 1, candidate = last >= 0 ? rows[last] + ' ' + word : '';
    if (last >= 0 && candidate.length <= 14) rows[last] = candidate; else rows.push(word);
  }
  const size = rows.length > 2 ? 35 : 42;
  const start = rows.length > 2 ? 55 : 66;
  box(c, 23, 19, len * (.28 + .72 * fit(t, 0, .63)), 5, accent);
  rows.slice(0, 3).forEach((s, i) => {
    const k = fit(t, i * .10, .60 + i * .1);
    c.save(); c.translate(0, 7 * (1 - k)); c.globalAlpha = .54 + .46 * k;
    text(c, s, 20, start + i * 40, size, ink, seed % 2 ? serif : sans, 650, 284); c.restore();
  });
  const baseline = Math.min(175, start + Math.min(3, rows.length) * 40);
  rule(p, baseline);
  if (summary) text(c, summary, 23, baseline + 25, 15, muted, sans, 450, 270);
}
const paint: Record<NoahAgentArtScene, (p: Page) => void> = {
  intake, manual, memory, evidence, verify, ledger: p => ledger(p), capital: p => ledger(p, true), files, clock, status, call,
  photo: image, api, film, translate, signature,
  'car-search': p => compactList(p, '車両比較', 'Market price', ['地域', '販売価格', '市場との比較']),
  journey: p => compactList(p, 'Guided journey', 'Step by step', ['目的を決める', '次の手順', '結果を確認']),
  reasoning: p => compactList(p, 'Sequential thinking', '思考の手順', ['問い', '考え方', '見直し']),
  campaign: p => compactList(p, 'Campaign pack', '制作物', ['商品写真', '広告原稿', '提案資料']),
  site: p => compactList(p, 'Site structure', 'Sitemap', ['Home', 'Pages', 'Publish']),
};

/** Paints one deterministic local frame. Progress is clamped to 0…1; no URLs or providers are consulted. */
export function drawNoahCardVideoFrame(ctx: Brush, art: Art, progress: number, name = '', summary = '', variation = 0) {
  const { width, height } = ctx.canvas;
  if (!width || !height) return;
  const theme = palette(art, variation);
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  box(ctx, 0, 0, width, height, theme[0]);
  const scale = Math.min(width / 320, height / 215);
  ctx.translate((width - 320 * scale) / 2, (height - 215 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic'; ctx.lineCap = 'butt';
  paint[art.scene]({ ctx, theme, t, name, summary, seed: art.seed });
  ctx.restore();
}

export function noahSceneGround(art: Art) { return palette(art)[0]; }
