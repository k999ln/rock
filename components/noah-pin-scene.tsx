'use client';
/**
 * ピンの絵（バージョン TAKE。spec-115 の 9 章）。lib/noah-pin-scene.ts の 1 枚（図の名前と札の言葉）を、幅 300 の SVG の「資料の図解」で描く。
 * 見た目は、しょうへい（@showheyohtaki）さんの「資料で使う図解・グラフの名前」のチートシートと同じ考え: 薄い灰色の面に、青 1 色（濃い青・薄い青）と灰色。
 * 影・ぼかし・外の画像・外の字は使わない。数は描かない（札に、説明に無い数を書かない決まりのため。棒や点の長さ・位置は形だけ）。
 * 右上（保存の押す所）には、札の字を置かない。スマホの 2 列（カードの幅 約 160px〜）では、保存のボタンが絵の x 195 より右・y 100 より上を覆う
 * （lib/noah-pin-scene.ts の NOAH_PIN_KEEP_OUT。試験が、いちばん長い札で確かめる）。札の字は 19（幅 300 のうち。スマホの 2 列で 11px 以上）。
 * 動き（本人の決定 2026-11-24「画面に入った時に1回」）: 画面に入った時に 1 回だけ、図が描かれていく（線が伸びる・箱が順に出る・棒が伸びる・針が振れる）。
 * 動く部分は <M> で囲む。動き方は noah-pin-scene.module.css。サーバーで描いた絵・動きを減らす設定の人・見えたかを確かめられない端末には、描き終わった図を出す。
 */
import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { NOAH_PIN_TEMPLATES, noahPinLabelWidth, type NoahPinScene } from '@/lib/noah-pin-scene';
import css from './noah-pin-scene.module.css';

/** 色（チートシートの絵から読み取った値）。青 #326ce6・薄い青 #ccd8f8・面 #f2f3f5・字 #181818。 */
const C = {
  blue: '#326ce6', light: '#ccd8f8', pale: '#e6ecfc', mid: '#8fabef', gray: '#d5d8de', gray2: '#e7e9ed', line: '#a3a9b3',
  ink: '#1b1d22', navy: '#1e2b4a', tile: '#f2f3f5', white: '#ffffff',
};
const LABEL = 19;

/** 動き方（noah-pin-scene.module.css の同じ名前）。 */
type Move = 'pop' | 'rise' | 'slide' | 'slideR' | 'fall' | 'fade' | 'draw' | 'grow' | 'growY' | 'swing';
/** 動く部分。k は動き方、d は動き始めるまでの間（ミリ秒）、o は swing の回る中心（絵の座標）。draw で囲む線には pathLength={1} を付ける。 */
function M({ k, d = 0, o, children }: { k: Move; d?: number; o?: [number, number]; children: ReactNode }) {
  const style: Record<string, string> = {};
  if (d) style['--d'] = `${d}ms`;
  if (o) { style['--ox'] = `${o[0]}px`; style['--oy'] = `${o[1]}px`; }
  return <g className={`${css.m} ${css[k]}`} style={Object.keys(style).length ? (style as CSSProperties) : undefined}>{children}</g>;
}

// 画面に入ったかを見る仕組みは、ページ全体で 1 つだけ（絵ごとには作らない）。
let watcher: IntersectionObserver | null = null;
const waiting = new Map<Element, () => void>();
function watch(element: Element, onSeen: () => void) {
  watcher ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      waiting.get(entry.target)?.();
      waiting.delete(entry.target);
      watcher?.unobserve(entry.target);
    }
  }, { threshold: 0.4 });
  waiting.set(element, onSeen);
  watcher.observe(element);
  return () => { waiting.delete(element); watcher?.unobserve(element); };
}

/** 字。y は字の真ん中の高さ（基線は、そこから字の大きさの 0.35 下）。 */
function T({ x, y, text, color = C.ink, anchor = 'middle', size = LABEL }: { x: number; y: number; text: string; color?: string; anchor?: 'middle' | 'start' | 'end'; size?: number }) {
  return <text x={x} y={Math.round((y + size * 0.35) * 10) / 10} fontSize={size} textAnchor={anchor} fill={color} fontWeight={700}>{text}</text>;
}
/** 箱と、その真ん中の字。 */
function Box({ cx, cy, w, h, fill, text, color = C.ink, r = 8 }: { cx: number; cy: number; w: number; h: number; fill: string; text?: string; color?: string; r?: number }) {
  return <g><rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={r} fill={fill} />{text && <T x={cx} y={cy} text={text} color={color} />}</g>;
}
/** 白い札。x は真ん中。札が絵の左右の端を越える時は、内へずらして収める。 */
function Pill({ x, y, text, fill = C.white, color = C.ink }: { x: number; y: number; text: string; fill?: string; color?: string }) {
  const width = noahPinLabelWidth(text) * LABEL + 18;
  const middle = Math.max(width / 2 + 6, Math.min(300 - width / 2 - 6, x));
  return <g><rect x={middle - width / 2} y={y - 14} width={width} height={28} rx={14} fill={fill} /><T x={middle} y={y} text={text} color={color} /></g>;
}
/** 札の左の端を x に揃えた時の真ん中。 */
const leftAt = (x: number, text: string) => x + (noahPinLabelWidth(text) * LABEL + 18) / 2;
/** 線（draw で描き足せるように、長さを 1 として描く）。 */
const Line = ({ d, color = C.line, width = 2.5, dash }: { d: string; color?: string; width?: number; dash?: string }) =>
  <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} pathLength={dash ? undefined : 1} />;
/** 矢印の先（tip に向けて、向き (dx, dy)）。 */
function Head({ x, y, dx, dy, color = C.line, size = 8 }: { x: number; y: number; dx: number; dy: number; color?: string; size?: number }) {
  const n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n, bx = x - ux * size, by = y - uy * size;
  const pts = [[x, y], [bx - uy * size * 0.7, by + ux * size * 0.7], [bx + uy * size * 0.7, by - ux * size * 0.7]].map((p) => p.map((v) => Math.round(v * 10) / 10).join(',')).join(' ');
  return <polygon points={pts} fill={color} />;
}
/** 人の印（絵グラフ）。(x, y) は足元の真ん中。 */
const Icon = ({ x, y, fill }: { x: number; y: number; fill: string }) => <g><circle cx={x} cy={y - 30} r={7} fill={fill} /><rect x={x - 9} y={y - 20} width={18} height={20} rx={7} fill={fill} /></g>;
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * 1 枚の図解。aria-hidden（カードの題と説明の字が読まれる）。
 * ready は、置き場所が決まったか（グリッドは、置く前のカードを左上に重ねて隠すので、置き終わるまで見張りを始めない）。棚のように初めから置いてある所では省く。
 */
export default function NoahPinSceneArt({ scene, className, ready = true }: { scene: NoahPinScene; className?: string; ready?: boolean }) {
  const id = `pin-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`, h = NOAH_PIN_TEMPLATES[scene.template].height;
  const frame = useRef<SVGSVGElement>(null), played = useRef(false);
  // 動きの段（data-motion）は、React の状態にせず、要素へ直接書く（描き直しを起こさない）。描く前に armed にして、描き終わった図が一瞬見えるのを防ぐ。
  useLayoutEffect(() => {
    const element = frame.current;
    if (played.current || !ready || !element || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    element.dataset.motion = 'armed';
    const stop = watch(element, () => { played.current = true; element.dataset.motion = 'play'; });
    // 見える前に置き直し（幅が変わった時など）になったら、描き終わった図へ戻して、置き終わった後にもう一度待つ。
    return () => { stop(); if (!played.current) delete element.dataset.motion; };
  }, [ready]);
  return <svg ref={frame} className={`${css.art}${className ? ` ${className}` : ''}`} viewBox={`0 0 300 ${h}`} width="100%" aria-hidden="true" focusable="false" style={{ display: 'block', fontFamily: 'inherit' }}>
    <rect width="300" height={h} fill={C.tile} />{body(scene, h, id)}</svg>;
}

function body({ template, labels: L }: NoahPinScene, h: number, id: string): ReactNode {
  switch (template) {
    case 'venn': return <>
      <clipPath id={`${id}-a`}><circle cx="112" cy="100" r="66" /></clipPath>
      <M k="slide"><circle cx="112" cy="100" r="66" fill={C.light} /></M>
      <M k="slideR"><circle cx="188" cy="100" r="66" fill={C.gray} /></M>
      <M k="fade" d={420}><circle cx="188" cy="100" r="66" fill={C.blue} clipPath={`url(#${id}-a)`} /></M>
      <M k="rise" d={560}><Pill x={80} y={200} text={L[0]} /></M><M k="rise" d={640}><Pill x={220} y={200} text={L[1]} /></M>
    </>;
    case 'matrix': return <>
      <M k="draw"><Line d="M160 204 V30" width={3} color={C.navy} /></M><M k="draw" d={80}><Line d="M36 112 H276" width={3} color={C.navy} /></M>
      <M k="fade" d={300}><Head x={160} y={22} dx={0} dy={-1} color={C.navy} /><Head x={284} y={112} dx={1} dy={0} color={C.navy} /></M>
      {[[82, 62], [114, 84], [96, 150], [130, 176], [206, 58], [250, 78], [196, 140], [262, 134]].map(([x, y], i) => <M key={i} k="pop" d={200 + i * 45}><circle cx={x} cy={y} r={7} fill={C.gray} /></M>)}
      <M k="pop" d={620}><circle cx="230" cy="162" r="13" fill={C.blue} /></M>
      <M k="rise" d={300}><T x={152} y={36} text={L[1]} anchor="end" /></M><M k="rise" d={380}><T x={284} y={132} text={L[0]} anchor="end" /></M>
      <M k="rise" d={760}><Pill x={230} y={200} text={L[2]} /></M>
    </>;
    case 'tree': {
      const ys = [114, 160, 206];
      return <>
        <M k="pop"><Box cx={72} cy={58} w={116} h={40} fill={C.blue} text={L[0]} color={C.white} /></M>
        <M k="draw" d={220}><Line d={`M72 78 V${ys[2]} ${ys.map((y) => `M72 ${y} H158`).join(' ')}`} /></M>
        {ys.map((y, i) => <M key={y} k="slide" d={420 + i * 110}><Box cx={224} cy={y} w={132} h={36} fill={C.light} text={L[i + 1]} /></M>)}
      </>;
    }
    case 'pyramid': {
      const half = (y: number) => (120 * (y - 30)) / 180, cx = 172, cuts = [30, 75, 120, 165, 210];
      const fills = [C.gray2, C.light, C.blue, C.gray];
      return <>
        {[3, 2, 1, 0].map((i, order) => { const t = cuts[i], b = cuts[i + 1];
          return <M key={i} k="rise" d={order * 120}><polygon points={`${r1(cx - half(t))},${t + (i ? 2 : 0)} ${r1(cx + half(t))},${t + (i ? 2 : 0)} ${r1(cx + half(b))},${b - 2} ${r1(cx - half(b))},${b - 2}`} fill={fills[i]} /></M>; })}
        <M k="pop" d={500}><T x={cx} y={143} text={L[0]} color={C.white} /></M>
        <M k="fade" d={600}><Line d="M74 58 L112 130" dash="4 4" /></M>
        <M k="slide" d={680}><Pill x={leftAt(14, L[1])} y={42} text={L[1]} /></M>
      </>;
    }
    case 'mindmap': {
      const nodes: [number, number][] = [[64, 70], [62, 214], [244, 114], [238, 206]];
      return <>
        <M k="draw" d={160}><Line d={nodes.map(([x, y]) => `M150 148 Q${x} 148 ${x} ${y}`).join(' ')} width={3} color={C.mid} /></M>
        <M k="pop"><Box cx={150} cy={148} w={124} h={42} fill={C.blue} text={L[0]} color={C.white} r={21} /></M>
        {nodes.map(([x, y], i) => <M key={i} k="pop" d={380 + i * 100}><Box cx={x} cy={y} w={98} h={34} fill={C.light} text={L[i + 1]} r={17} /></M>)}
      </>;
    }
    case 'flowchart': return <>
      <M k="pop"><Box cx={80} cy={50} w={140} h={36} fill={C.light} text={L[0]} r={18} /></M>
      <M k="draw" d={150}><Line d="M80 68 V88" /></M><M k="pop" d={230}><Head x={80} y={96} dx={0} dy={1} /></M>
      <M k="pop" d={260}><polygon points="80,96 146,132 80,168 14,132" fill={C.blue} /><T x={80} y={132} text={L[1]} color={C.white} /></M>
      <M k="draw" d={420}><Line d="M146 132 H160" /></M><M k="pop" d={480}><Head x={168} y={132} dx={1} dy={0} /></M>
      <M k="pop" d={520}><Box cx={228} cy={132} w={120} h={36} fill={C.gray2} text={L[2]} /></M>
      <M k="draw" d={680}><Line d="M228 150 V170" /></M><M k="pop" d={740}><Head x={228} y={178} dx={0} dy={1} /></M>
      <M k="pop" d={780}><Box cx={228} cy={198} w={120} h={36} fill={C.blue} text={L[3]} color={C.white} /></M>
      <M k="fade" d={420}><Line d="M80 168 V200" dash="4 4" /></M><M k="fade" d={560}><rect x="52" y="200" width="56" height="20" rx="10" fill={C.gray} /></M>
    </>;
    case 'cycle': {
      const cx = 150, cy = 132, r = 80, at: [number, number][] = [[150, 50], [232, 132], [150, 214], [68, 132]];
      const heads = [-45, 45, 135, 225].map((deg) => { const a = (deg * Math.PI) / 180; return { x: r1(cx + r * Math.sin(a)), y: r1(cy - r * Math.cos(a)), dx: Math.cos(a), dy: Math.sin(a) }; });
      return <>
        <M k="draw"><circle cx={cx} cy={cy} r={r} fill="none" stroke={C.mid} strokeWidth={4} pathLength={1} /></M>
        {heads.map((p, i) => <M key={i} k="pop" d={500 + i * 60}><Head x={p.x} y={p.y} dx={p.dx} dy={p.dy} color={C.mid} size={10} /></M>)}
        {at.map(([x, y], i) => <M key={i} k="pop" d={150 + i * 110}><Box cx={x} cy={y} w={98} h={34} fill={i === 0 ? C.blue : C.light} text={L[i]} color={i === 0 ? C.white : C.ink} r={17} /></M>)}
      </>;
    }
    case 'fishbone': return <>
      <M k="draw"><Line d="M20 118 H226" width={4} color={C.navy} /></M>
      <M k="draw" d={200}><Line d="M88 118 L56 62 M158 118 L126 62 M88 118 L56 174 M158 118 L126 174" width={3} /></M>
      <M k="draw" d={360}><Line d="M66 80 H90 M136 80 H160 M66 156 H90 M136 156 H160" width={2} color={C.gray} /></M>
      <M k="pop" d={460}><polygon points="222,92 270,92 294,118 270,144 222,144" fill={C.blue} /><T x={250} y={118} text={L[0]} color={C.white} /></M>
      <M k="rise" d={620}><Pill x={leftAt(14, L[1])} y={40} text={L[1]} /></M><M k="rise" d={700}><Pill x={leftAt(14, L[2])} y={198} text={L[2]} /></M>
    </>;
    case 'scatter': {
      const dots = [[62, 170], [78, 158], [92, 172], [104, 150], [118, 160], [130, 140], [142, 148], [158, 128], [172, 138], [186, 120], [208, 124], [224, 108], [242, 114], [256, 96], [268, 84], [98, 134], [234, 138]];
      return <>
        <M k="draw"><Line d="M40 22 V188 H282" width={3} color={C.navy} /></M>
        {dots.map(([x, y], i) => <M key={i} k="pop" d={150 + i * 25}><circle cx={x} cy={y} r={5.5} fill={C.mid} /></M>)}
        {[[150, 104], [164, 94], [178, 104], [190, 90]].map(([x, y], i) => <M key={`b${i}`} k="pop" d={620 + i * 50}><circle cx={x} cy={y} r={7.5} fill={C.blue} /></M>)}
        <M k="rise" d={300}><T x={50} y={26} text={L[1]} anchor="start" /></M><M k="rise" d={380}><T x={282} y={204} text={L[0]} anchor="end" /></M>
      </>;
    }
    case 'bubble': return <>
      <M k="draw"><Line d="M40 22 V188 H282" width={3} color={C.navy} /></M>
      {([[70, 62, 14, C.gray], [196, 74, 24, C.light], [250, 66, 10, C.gray], [238, 148, 19, C.light], [178, 168, 12, C.gray]] as const).map(([x, y, r, f], i) =>
        <M key={i} k="pop" d={150 + i * 90}><circle cx={x} cy={y} r={r} fill={f} /></M>)}
      <M k="pop" d={600}><circle cx="112" cy="128" r="47" fill={C.blue} /><T x={112} y={128} text={L[0]} color={C.white} /></M>
      <M k="rise" d={300}><T x={282} y={204} text={L[1]} anchor="end" /></M>
    </>;
    case 'heatmap': {
      const v = [[0, 1, 0, 1, 0, 0, 1, 0], [1, 3, 3, 2, 1, 0, 0, 1], [0, 2, 3, 3, 1, 1, 0, 0], [1, 0, 1, 1, 0, 1, 1, 0]], fill = [C.pale, C.light, C.mid, C.blue];
      return <>
        {v.flatMap((row, y) => row.map((n, x) => <M key={`${x}-${y}`} k="fade" d={x * 55 + y * 25}><rect x={22 + x * 33} y={22 + y * 28} width={31} height={26} rx={4} fill={fill[n]} /></M>))}
        <M k="draw" d={560}><Line d="M100 134 V150" /></M>
        <M k="rise" d={620}><Pill x={100} y={164} text={L[1]} /></M><M k="rise" d={700}><Pill x={leftAt(14, L[0])} y={206} text={L[0]} /></M>
        <M k="fade" d={760}>{fill.map((f, i) => <rect key={f} x={234 + i * 14} y={198} width={12} height={16} rx={3} fill={f} />)}<T x={228} y={206} text={L[2]} anchor="end" /></M>
      </>;
    }
    case 'radar': {
      const cx = 160, cy = 112, R = 84, pt = (i: number, s: number) => { const a = (i * Math.PI) / 3; return `${r1(cx + R * s * Math.sin(a))},${r1(cy - R * s * Math.cos(a))}`; };
      const ring = (s: number) => [0, 1, 2, 3, 4, 5].map((i) => pt(i, s)).join(' '), data = [0.75, 0.55, 0.7, 0.6, 0.85, 0.8];
      return <>
        {[1, 0.66, 0.33].map((s) => <polygon key={s} points={ring(s)} fill="none" stroke={C.gray} strokeWidth={2} />)}
        {[0, 1, 2].map((i) => <line key={i} x1={pt(i, 1).split(',')[0]} y1={pt(i, 1).split(',')[1]} x2={pt(i + 3, 1).split(',')[0]} y2={pt(i + 3, 1).split(',')[1]} stroke={C.gray} strokeWidth={2} />)}
        <M k="pop" d={150}><polygon points={data.map((s, i) => pt(i, s)).join(' ')} fill={C.blue} fillOpacity={0.35} stroke={C.blue} strokeWidth={3} strokeLinejoin="round" /></M>
        <M k="rise" d={500}><T x={80} y={70} text={L[0]} anchor="end" /></M><M k="rise" d={580}><T x={80} y={154} text={L[1]} anchor="end" /></M>
        <M k="rise" d={660}><T x={160} y={214} text={L[2]} /></M>
      </>;
    }
    case 'gauge': return <>
      <path d="M50 150 A100 100 0 0 1 250 150" fill="none" stroke={C.gray2} strokeWidth={24} />
      <M k="draw"><path d="M50 150 A100 100 0 0 1 186.8 57" fill="none" stroke={C.blue} strokeWidth={24} pathLength={1} /></M>
      <line x1="231.6" y1="117" x2="253.8" y2="108" stroke={C.navy} strokeWidth={4} strokeLinecap="round" />
      <M k="swing" d={100} o={[150, 150]}><g transform="rotate(21.6 150 150)"><line x1="150" y1="150" x2="150" y2="74" stroke={C.navy} strokeWidth={5} strokeLinecap="round" /></g></M>
      <circle cx="150" cy="150" r="9" fill={C.navy} />
      <M k="fade" d={640}><Line d="M232 122 L230 180" dash="4 4" /></M>
      <M k="rise" d={700}><Pill x={84} y={196} text={L[0]} /></M><M k="rise" d={780}><Pill x={228} y={196} text={L[1]} /></M>
    </>;
    case 'combo': {
      const bars = [[70, 64, C.blue], [128, 112, C.light], [186, 92, C.light], [244, 124, C.light]] as const, line: [number, number][] = [[145, 96], [203, 72], [261, 104]];
      return <>
        <line x1="30" y1="178" x2="284" y2="178" stroke={C.navy} strokeWidth={3} />
        {bars.map(([x, y, f], i) => <M key={x} k="growY" d={i * 90}><rect x={x} y={y} width={34} height={178 - y} rx={4} fill={f} /></M>)}
        <M k="draw" d={420}><Line d={`M${line.map(([x, y]) => `${x} ${y}`).join(' L')}`} width={3} color={C.navy} /></M>
        {line.map(([x, y], i) => <M key={x} k="pop" d={560 + i * 60}><circle cx={x} cy={y} r={5} fill={C.navy} /></M>)}
        <M k="pop" d={720}><Line d="M116 64 V112 M110 64 H122 M110 112 H122" width={3} color={C.blue} /></M>
        <M k="rise" d={800}><Line d="M116 50 V60" /><Pill x={116} y={36} text={L[1]} /></M><M k="rise" d={860}><Pill x={leftAt(14, L[0])} y={204} text={L[0]} /></M>
      </>;
    }
    case 'pictogram': return <>
      {Array.from({ length: 15 }, (_, i) => <M key={i} k="pop" d={i * 35}><Icon x={30 + (i % 5) * 35} y={66 + Math.floor(i / 5) * 52} fill={i < 9 ? C.blue : C.gray} /></M>)}
      <M k="rise" d={600}><Pill x={leftAt(14, L[0])} y={196} text={L[0]} /></M>
      <M k="pop" d={680}><Pill x={286 - (noahPinLabelWidth(L[1]) * LABEL + 18) / 2} y={124} text={L[1]} fill={C.blue} color={C.white} /></M>
    </>;
    case 'stacked': return <>
      <M k="grow"><rect x="20" y="40" width="260" height="30" rx="6" fill={C.gray2} /></M>
      <M k="fade" d={200}><Line d="M150 74 V86" /><Head x={150} y={94} dx={0} dy={1} /></M>
      <M k="grow" d={260}><rect x="20" y="100" width="151" height="44" rx="6" fill={C.blue} /></M>
      <M k="grow" d={440}><rect x="173" y="100" width="65" height="44" fill={C.light} /></M>
      <M k="grow" d={560}><rect x="240" y="100" width="40" height="44" rx="6" fill={C.gray} /></M>
      <M k="fade" d={560}><T x={95.5} y={122} text={L[0]} color={C.white} /></M>
      <M k="draw" d={660}><Line d="M205 144 V158 M260 144 V184" /></M>
      <M k="rise" d={720}><Pill x={205} y={172} text={L[1]} /></M><M k="rise" d={800}><Pill x={250} y={198} text={L[2]} /></M>
    </>;
    case 'gantt': return <>
      {[40, 80, 120, 160, 200, 240, 280].map((x) => <line key={x} x1={x} y1="20" x2={x} y2="186" stroke={C.gray2} strokeWidth={2} />)}
      <M k="fall" d={640}><line x1="200" y1="20" x2="200" y2="190" stroke={C.navy} strokeWidth={3} strokeDasharray="6 5" /></M>
      {([[50, 30, 100, C.light], [90, 72, 120, C.light], [70, 156, 100, C.gray]] as const).map(([x, y, w, f], i) =>
        <M key={i} k="grow" d={i * 110}><rect x={x} y={y} width={w} height={24} rx={6} fill={f} /></M>)}
      <M k="grow" d={330}><rect x="118" y="114" width="134" height="26" rx={6} fill={C.blue} /></M>
      <M k="fade" d={600}><T x={185} y={127} text={L[0]} color={C.white} /></M>
      <M k="rise" d={760}><Pill x={200} y={204} text={L[1]} /></M>
    </>;
    case 'timeline': return <>
      <M k="draw"><Line d="M24 96 H276" width={4} color={C.gray} /></M>
      {[60, 150, 240].map((x, i) => <g key={x}>
        <M k="pop" d={150 + i * 170}><circle cx={x} cy={96} r={10} fill={i === 2 ? C.blue : C.white} stroke={i === 2 ? C.blue : C.line} strokeWidth={3} /></M>
        <M k="draw" d={220 + i * 170}><Line d={`M${x} 108 V${i === 1 ? 162 : 124}`} /></M>
        <M k="rise" d={300 + i * 170}><Pill x={x} y={i === 1 ? 178 : 140} text={L[i]} fill={i === 2 ? C.blue : C.white} color={i === 2 ? C.white : C.ink} /></M>
      </g>)}
    </>;
    case 'funnel': {
      const w = (y: number) => 236 - ((236 - 30) * (y - 20)) / 178, cx = 130, layers = [[20, 60], [66, 106], [112, 152], [158, 198]], fills = [C.gray2, C.light, C.pale, C.blue];
      return <>
        {layers.map(([t, b], i) => <M key={t} k="fall" d={i * 110}><polygon points={`${r1(cx - w(t) / 2)},${t} ${r1(cx + w(t) / 2)},${t} ${r1(cx + w(b) / 2)},${b} ${r1(cx - w(b) / 2)},${b}`} fill={fills[i]} /></M>)}
        <M k="fade" d={300}><T x={cx} y={40} text={L[0]} /></M><M k="fade" d={420}><T x={cx} y={86} text={L[1]} /></M>
        <M k="draw" d={560}><Line d="M158 178 H176" /></M><M k="rise" d={640}><Pill x={leftAt(180, L[2])} y={178} text={L[2]} /></M>
      </>;
    }
    case 'journey': {
      const pts: [number, number][] = [[50, 150], [116, 78], [182, 130], [248, 108]];
      return <>
        {[20, 86, 152, 218].map((x, i) => <M key={x} k="fade" d={i * 60}><rect x={x} y={16} width={62} height={18} rx={5} fill={C.gray2} /></M>)}
        {[83, 149, 215].map((x) => <line key={x} x1={x} y1="40" x2={x} y2="176" stroke={C.gray2} strokeWidth={2} />)}
        <M k="draw" d={200}><Line d={`M${pts.map(([x, y]) => `${x} ${y}`).join(' L')}`} width={4} color={C.blue} /></M>
        {pts.map(([x, y], i) => <M key={x} k="pop" d={300 + i * 110}><circle cx={x} cy={y} r={i === 1 ? 10 : 7} fill={i === 1 ? C.blue : C.white} stroke={C.blue} strokeWidth={3} /></M>)}
        <M k="rise" d={700}><Pill x={116} y={52} text={L[1]} fill={C.blue} color={C.white} /></M>
        <M k="rise" d={800}><Pill x={150} y={200} text={L[0]} /></M>
      </>;
    }
    case 'treemap': return <>
      <M k="pop"><rect x="16" y="16" width="148" height="188" rx="6" fill={C.blue} /></M>
      <M k="pop" d={150}><rect x="168" y="16" width="116" height="80" rx="6" fill={C.light} /></M>
      <M k="pop" d={260}><rect x="168" y="100" width="84" height="104" rx="6" fill={C.pale} /></M>
      <M k="pop" d={360}><rect x="256" y="100" width="28" height="50" rx="5" fill={C.gray} /></M>
      <M k="pop" d={430}><rect x="256" y="154" width="28" height="50" rx="5" fill={C.gray2} /></M>
      <M k="rise" d={520}><T x={90} y={110} text={L[0]} color={C.white} /></M><M k="rise" d={600}><T x={210} y={152} text={L[1]} /></M>
    </>;
    case 'swimlane': return <>
      <rect x="14" y="18" width="272" height="94" rx="8" fill="#fafbfc" stroke={C.gray} strokeWidth={2} /><rect x="14" y="118" width="272" height="94" rx="8" fill="#fafbfc" stroke={C.gray} strokeWidth={2} />
      <Box cx={47} cy={65} w={66} h={94} fill={C.gray2} text={L[0]} r={8} /><Box cx={47} cy={165} w={66} h={94} fill={C.gray2} text={L[1]} r={8} />
      <M k="pop"><Box cx={110} cy={65} w={52} h={32} fill={C.light} /></M>
      <M k="draw" d={160}><Line d="M136 65 H140" /></M><M k="pop" d={220}><Head x={148} y={65} dx={1} dy={0} /></M>
      <M k="pop" d={260}><Box cx={174} cy={65} w={52} h={32} fill={C.light} /></M>
      <M k="draw" d={420}><Line d="M174 81 V165 H198" /></M><M k="pop" d={600}><Head x={206} y={165} dx={1} dy={0} /></M>
      <M k="pop" d={640}><Box cx={248} cy={165} w={70} h={36} fill={C.blue} text={L[2]} color={C.white} /></M>
    </>;
    case 'chevron': {
      const shape = (x: number, w: number, first: boolean) => `${x},96 ${x + w - 16},96 ${x + w},124 ${x + w - 16},152 ${x},152${first ? '' : ` ${x + 16},124`}`;
      return <>
        <M k="fade"><Line d="M30 62 H270" dash="2 7" width={3} /></M>
        {[0, 1, 2].map((i) => <M key={i} k="slide" d={150 + i * 140}><polygon points={shape(14 + i * 90, 100, i === 0)} fill={i === 2 ? C.blue : C.light} />
          <T x={60 + i * 90 + (i ? 8 : 0)} y={124} text={L[i]} color={i === 2 ? C.white : C.ink} /></M>)}
      </>;
    }
    case 'concentric': return <>
      <M k="pop" d={260}><circle cx="130" cy="118" r="100" fill={C.gray2} /></M>
      <M k="pop" d={130}><circle cx="130" cy="118" r="68" fill={C.light} /></M>
      <M k="pop"><circle cx="130" cy="118" r="36" fill={C.blue} /><T x={130} y={118} text={L[0]} color={C.white} /></M>
      {[[78, 72], [190, 94], [96, 170], [176, 160], [54, 128], [130, 44], [208, 136]].map(([x, y], i) => <M key={i} k="pop" d={420 + i * 45}><circle cx={x} cy={y} r={6} fill={i < 4 ? C.navy : C.line} /></M>)}
      <M k="rise" d={760}><Pill x={232} y={206} text={L[1]} /></M>
    </>;
    default: return null;
  }
}
