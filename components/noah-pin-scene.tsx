/**
 * ピンの場面の絵（spec-115 の 9 章）。lib/noah-pin-scene.ts の 1 枚（型・札の言葉・部品・種類）を、幅 300 の SVG で描く。
 * 絵柄は構図100選と同じ考え: 淡い空と地面（か、壁と机）、くすんだ青の山、紺の髪と黄色い服の人、白い札。影・ぼかし・外の画像・外の字は使わない。
 * 右上（保存の押す所）には、札も大事な形も置かない。札の字は 19（幅 300 のうち）以上で、スマホの 2 列でも 11px 以上になる。
 * サーバーでも画面でも同じに描く（状態も動きも持たない）。
 */
import { useId, type ReactNode } from 'react';
import { NOAH_PIN_TEMPLATES, noahPinLabelWidth, type NoahPinScene } from '@/lib/noah-pin-scene';

const C = {
  navy: '#1f2a44', ink: '#24345a', sky1: '#d3e6f5', sky2: '#f0f6fb', ground: '#d9e8d3', m1: '#a5bbcc', m2: '#bccddc', yel: '#f2b43a', ora: '#f39a2b',
  red: '#e4603b', blue: '#2f6fb5', lblue: '#cfe0f2', face: '#f4c9a4', pants: '#2c3f73', wood: '#e6d3b3', woodEdge: '#d8c19c', green: '#5f9478',
  white: '#ffffff', gray: '#c9d3df', paper: '#fbfcfe', line: '#d6dfea', pink: '#f2a9a0', soft: '#9cb3cf', brown: '#8a5a3c', board: '#c99d6b', cream: '#fff6dc',
};
const LABEL = 19;

/** 白い札。x は真ん中（end の時は右の端）。札が絵の右の端を越える時は、左へずらして収める。 */
function Pill({ x, y, text, size = LABEL, fill = C.white, color = C.ink, end = false }: { x: number; y: number; text: string; size?: number; fill?: string; color?: string; end?: boolean }) {
  const width = noahPinLabelWidth(text) * size + 18;
  const middle = Math.max(width / 2 + 6, Math.min(300 - width / 2 - 6, end ? x - width / 2 : x));
  return <g><rect x={middle - width / 2} y={y - size * 0.95} width={width} height={size * 1.5} rx={size * 0.75} fill={fill} />
    <text x={middle} y={y + size * 0.12} fontSize={size} textAnchor="middle" fill={color} fontWeight={700}>{text}</text></g>;
}
/** 決まった幅に収まる字の大きさ（上限 max、下限 min）。 */
const fit = (text: string, width: number, max: number, min = 16) => Math.max(min, Math.min(max, width / Math.max(1, noahPinLabelWidth(text))));

function Sky({ id, h, mountains = true, ground = true }: { id: string; h: number; mountains?: boolean; ground?: boolean }) {
  const g = h - 46;
  return <g><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.sky1} /><stop offset="1" stopColor={C.sky2} /></linearGradient></defs>
    <rect width="300" height={h} fill={`url(#${id})`} />
    {mountains && <><polygon points={`-10,${g} 60,${g - 64} 130,${g}`} fill={C.m1} /><polygon points={`90,${g} 175,${g - 82} 260,${g}`} fill={C.m2} /><polygon points={`210,${g} 265,${g - 52} 320,${g}`} fill={C.m1} /></>}
    {ground && <rect y={g} width="300" height="46" fill={C.ground} />}</g>;
}
function Room({ h, desk, wall = '#edf3f9' }: { h: number; desk: number; wall?: string }) {
  return <g><rect width="300" height={h} fill={wall} /><rect y={desk} width="300" height={h - desk} fill={C.wood} /><rect y={desk} width="300" height="5" fill={C.woodEdge} /></g>;
}
function Person({ x, y, s = 1, shirt = C.yel, arm = 'down' }: { x: number; y: number; s?: number; shirt?: string; arm?: 'down' | 'up' | 'point' }) {
  return <g transform={`translate(${x},${y}) scale(${s})`}>
    {arm === 'up' ? <rect x="-22" y="-70" width="7" height="24" rx="3.5" fill={shirt} transform="rotate(-18 -18 -48)" /> : <rect x="-21" y="-46" width="7" height="22" rx="3.5" fill={shirt} />}
    {arm === 'point' ? <rect x="14" y="-48" width="26" height="7" rx="3.5" fill={shirt} /> : <rect x="14" y="-46" width="7" height="22" rx="3.5" fill={shirt} />}
    <rect x="-8" y="-24" width="7" height="24" rx="3" fill={C.pants} /><rect x="1" y="-24" width="7" height="24" rx="3" fill={C.pants} />
    <path d="M-15 -26 Q-15 -50 0 -50 Q15 -50 15 -26 Z" fill={shirt} />
    <circle cx="0" cy="-60" r="11" fill={C.face} /><path d="M-11.5 -60 A11.5 11.5 0 0 1 11.5 -60 L11.5 -64 Q0 -76 -11.5 -64 Z" fill={C.navy} />
  </g>;
}
const Lines = ({ x, y, w, n, gap = 12, color = C.gray, width = 5 }: { x: number; y: number; w: number; n: number; gap?: number; color?: string; width?: number }) =>
  <g>{Array.from({ length: n }, (_, i) => <line key={i} x1={x} y1={y + i * gap} x2={x + (i === n - 1 && n > 1 ? w * 0.62 : w)} y2={y + i * gap} stroke={color} strokeWidth={width} strokeLinecap="round" />)}</g>;
const Paper = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => <rect x={x} y={y} width={w} height={h} rx="6" fill={C.paper} stroke={C.line} strokeWidth="2" />;
const Magnifier = ({ x, y, r = 24 }: { x: number; y: number; r?: number }) => <g><circle cx={x} cy={y} r={r} fill="#ffffff66" stroke={C.navy} strokeWidth="6" />
  <line x1={x + r * 0.72} y1={y + r * 0.72} x2={x + r * 1.55} y2={y + r * 1.55} stroke={C.navy} strokeWidth="9" strokeLinecap="round" /></g>;
const Check = ({ x, y, r = 18 }: { x: number; y: number; r?: number }) => <g><circle cx={x} cy={y} r={r} fill={C.green} />
  <path d={`M${x - r * 0.45} ${y} L${x - r * 0.1} ${y + r * 0.38} L${x + r * 0.5} ${y - r * 0.35}`} fill="none" stroke="#fff" strokeWidth={r * 0.28} strokeLinecap="round" strokeLinejoin="round" /></g>;
const Warn = ({ x, y }: { x: number; y: number }) => <g><polygon points={`${x},${y - 24} ${x + 26},${y + 20} ${x - 26},${y + 20}`} fill={C.ora} />
  <text x={x} y={y + 15} fontSize="26" textAnchor="middle" fill="#fff" fontWeight={800}>!</text></g>;
const Arrow = ({ x1, y, x2, color = C.blue }: { x1: number; y: number; x2: number; color?: string }) => <g>
  <line x1={x1} y1={y} x2={x2 - 8} y2={y} stroke={color} strokeWidth="4" strokeLinecap="round" /><path d={`M${x2 - 12} ${y - 9} L${x2} ${y} L${x2 - 12} ${y + 9} Z`} fill={color} /></g>;
const Pin = ({ x, y }: { x: number; y: number }) => <g><path d={`M${x - 20} ${y} a20 20 0 0 1 40 0 q0 18 -20 40 q-20 -22 -20 -40 Z`} fill={C.red} /><circle cx={x} cy={y} r="8" fill="#fff" /></g>;
const Coin = ({ x, y, r = 17 }: { x: number; y: number; r?: number }) => <g><circle cx={x} cy={y} r={r} fill={C.yel} /><text x={x} y={y + r * 0.4} fontSize={r * 1.1} textAnchor="middle" fill={C.navy} fontWeight={800}>¥</text></g>;
function Tree({ x, y, s = 1, kind }: { x: number; y: number; s?: number; kind: string }) {
  const [a, b] = kind === 'autumn' ? [C.red, C.ora] : kind === 'spring' ? ['#f4b6c6', '#f8d3dc'] : [C.green, '#8fbf9f'];
  return <g transform={`translate(${x},${y}) scale(${s})`}><rect x="-3" y="-18" width="6" height="18" fill={C.brown} />
    <circle cx="0" cy="-34" r="18" fill={a} /><circle cx="-14" cy="-24" r="11" fill={b} /><circle cx="13" cy="-24" r="12" fill={a} /><circle cx="4" cy="-46" r="10" fill={b} /></g>;
}

/** 入れる → 返る、の型の部品。(cx, cy) を中心に、だいたい 76 × 76 に収める。 */
function Part({ part, cx, cy }: { part: string; cx: number; cy: number }) {
  const x = cx - 38, y = cy - 38;
  switch (part) {
    case 'receipt': return <g><path d={`M${x + 10} ${y} h56 v76 l-7 -6 -7 6 -7 -6 -7 6 -7 -6 -7 6 -7 -6 -7 6 Z`} fill={C.paper} stroke={C.line} strokeWidth="2" /><Lines x={x + 20} y={y + 16} w={36} n={4} gap={13} /></g>;
    case 'ledger': return <g><path d={`M${x} ${y + 8} q32 -8 38 2 v66 q-8 -8 -38 -2 Z`} fill={C.paper} stroke={C.line} strokeWidth="2" /><path d={`M${x + 38} ${y + 10} q8 -10 38 -2 v66 q-30 -6 -38 2 Z`} fill={C.paper} stroke={C.line} strokeWidth="2" />
      <Lines x={x + 8} y={y + 26} w={24} n={3} gap={13} color={C.soft} /><Lines x={x + 46} y={y + 26} w={24} n={3} gap={13} color={C.soft} /></g>;
    case 'document': return <g><Paper x={x + 8} y={y} w={60} h={76} /><Lines x={x + 18} y={y + 16} w={40} n={4} gap={13} /></g>;
    case 'chart': return <g><rect x={x} y={y + 4} width={76} height={70} rx="8" fill={C.white} />{[30, 48, 22, 58].map((v, i) => <rect key={i} x={x + 10 + i * 16} y={y + 66 - v} width="11" height={v} rx="2" fill={i === 3 ? C.blue : C.soft} />)}</g>;
    case 'mail': return <g><rect x={x} y={y + 14} width={76} height={50} rx="6" fill={C.white} stroke={C.line} strokeWidth="2" /><path d={`M${x} ${y + 16} l38 26 l38 -26`} fill="none" stroke={C.soft} strokeWidth="3" /></g>;
    case 'calendar': return <g><rect x={x + 4} y={y + 6} width={68} height={64} rx="8" fill={C.white} stroke={C.line} strokeWidth="2" /><rect x={x + 4} y={y + 6} width={68} height={16} rx="8" fill={C.red} />
      {Array.from({ length: 9 }, (_, i) => <rect key={i} x={x + 14 + (i % 3) * 18} y={y + 30 + Math.floor(i / 3) * 12} width="12" height="8" rx="2" fill={i === 4 ? C.yel : C.lblue} />)}</g>;
    case 'photo': return <g><rect x={x} y={y + 8} width={76} height={60} rx="6" fill={C.white} /><rect x={x + 6} y={y + 14} width={64} height={48} rx="3" fill={C.sky1} />
      <polygon points={`${x + 6},${y + 62} ${x + 30},${y + 34} ${x + 52},${y + 62}`} fill={C.m1} /><circle cx={x + 56} cy={y + 26} r="6" fill={C.yel} /></g>;
    case 'code': return <g><rect x={x} y={y + 8} width={76} height={60} rx="8" fill={C.ink} /><text x={cx} y={cy + 9} fontSize="24" textAnchor="middle" fill="#ffe08a" fontWeight={800}>{'</>'}</text></g>;
    case 'database': return <g><path d={`M${x + 10} ${y + 12} v52 a28 9 0 0 0 56 0 v-52`} fill={C.lblue} /><ellipse cx={cx} cy={y + 12} rx="28" ry="9" fill={C.soft} />
      <path d={`M${x + 10} ${y + 30} a28 9 0 0 0 56 0 M${x + 10} ${y + 48} a28 9 0 0 0 56 0`} fill="none" stroke={C.soft} strokeWidth="3" /></g>;
    case 'chat': return <g><path d={`M${x} ${y + 10} h76 v42 h-48 l-14 12 v-12 h-14 Z`} fill={C.white} /><Lines x={x + 10} y={y + 25} w={56} n={2} gap={13} color={C.soft} /></g>;
    case 'phone': return <g><rect x={cx - 20} y={y} width="40" height="76" rx="8" fill={C.ink} /><rect x={cx - 15} y={y + 8} width="30" height="54" rx="3" fill={C.lblue} /><circle cx={cx} cy={y + 69} r="3" fill={C.lblue} /></g>;
    case 'map': return <g><path d={`M${x} ${y + 14} l24 -8 l26 8 l26 -8 v58 l-26 8 l-26 -8 l-24 8 Z`} fill="#e7f0e2" stroke={C.line} strokeWidth="2" /><Pin x={cx} y={cy - 6} /></g>;
    case 'cup': return <g><ellipse cx={cx} cy={y + 70} rx="34" ry="7" fill="#d5bd96" /><path d={`M${x + 14} ${y + 26} h46 v28 a23 23 0 0 1 -46 0 Z`} fill={C.white} /><rect x={x + 17} y={y + 29} width="40" height="9" rx="3" fill={C.brown} />
      <path d={`M${x + 60} ${y + 34} q16 2 0 18`} fill="none" stroke={C.white} strokeWidth="6" /></g>;
    case 'book': return <g><rect x={x + 12} y={y + 4} width="52" height="70" rx="4" fill={C.blue} /><rect x={x + 18} y={y + 10} width="40" height="58" rx="2" fill="#2a5f9e" /><Lines x={x + 26} y={y + 26} w={24} n={2} gap={11} color="#ffe08a" width={4} /></g>;
    case 'music': return <g><circle cx={x + 22} cy={y + 60} r="11" fill={C.ink} /><circle cx={x + 58} cy={y + 52} r="11" fill={C.ink} /><path d={`M${x + 31} ${y + 60} V${y + 12} L${x + 67} ${y + 4} V${y + 52}`} fill="none" stroke={C.ink} strokeWidth="6" /></g>;
    case 'video': return <g><rect x={x} y={y + 12} width={76} height={52} rx="10" fill={C.red} /><path d={`M${cx - 9} ${cy - 13} l24 13 l-24 13 Z`} fill="#fff" /></g>;
    case 'gift': return <g><rect x={x + 6} y={y + 26} width={64} height={50} rx="5" fill={C.red} /><rect x={x} y={y + 14} width={76} height={18} rx="4" fill="#ef7a57" /><rect x={cx - 5} y={y + 14} width="10" height="62" fill="#ffe08a" />
      <path d={`M${cx} ${y + 14} q-18 -20 -25 -6 q5 8 25 6 q18 -20 25 -6 q-5 8 -25 6`} fill="#ffe08a" /></g>;
    case 'coin': return <g><Coin x={cx - 12} y={cy + 10} r={20} /><Coin x={cx + 14} y={cy - 6} r={20} /></g>;
    case 'list': return <g><Paper x={x + 6} y={y} w={64} h={76} />{[0, 1, 2].map((i) => <g key={i}><rect x={x + 16} y={y + 14 + i * 20} width="12" height="12" rx="3" fill={i < 2 ? C.green : C.lblue} />
      <line x1={x + 34} y1={y + 20 + i * 20} x2={x + 60} y2={y + 20 + i * 20} stroke={C.gray} strokeWidth="5" strokeLinecap="round" /></g>)}</g>;
    case 'idea': return <g><circle cx={cx} cy={cy - 8} r="26" fill="#ffe08a" /><rect x={cx - 11} y={cy + 16} width="22" height="16" rx="4" fill={C.soft} /><path d={`M${cx - 8} ${cy - 8} l8 10 l8 -10`} fill="none" stroke={C.ora} strokeWidth="4" /></g>;
    default: return null;
  }
}

/** 1 枚の場面の絵。aria-hidden（カードの題と説明の字が読まれる）。 */
export default function NoahPinSceneArt({ scene, className }: { scene: NoahPinScene; className?: string }) {
  const id = `sky-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`, h = NOAH_PIN_TEMPLATES[scene.template].height;
  return <svg className={className} viewBox={`0 0 300 ${h}`} width="100%" aria-hidden="true" focusable="false" style={{ display: 'block', fontFamily: 'inherit' }}>{body(scene, h, id)}</svg>;
}

function body({ template, labels: L, parts: P, variant: V }: NoahPinScene, h: number, id: string): ReactNode {
  const g = h - 46;
  switch (template) {
    case 'transform': return <>
      <Room h={h} desk={h - 58} /><Part part={P[0]} cx={80} cy={112} /><Arrow x1={126} y={112} x2={174} /><Part part={P[1]} cx={220} cy={112} />
      <Pill x={80} y={h - 26} text={L[0]} /><Pill x={220} y={h - 26} text={L[1]} fill={C.yel} color={C.navy} />
    </>;
    case 'inspect': {
      const flyer = P[0] === 'flyer';
      return <>
        <Room h={h} desk={h - 40} wall="#eef2f8" /><Paper x={30} y={30} w={150} h={168} />
        <rect x="30" y="30" width="150" height="36" rx="6" fill={flyer ? C.pink : C.lblue} />
        <text x="105" y="55" fontSize={fit(L[0], 136, 20)} textAnchor="middle" fill={flyer ? C.white : C.ink} fontWeight={800}>{L[0]}</text>
        <Lines x={46} y={84} w={118} n={1} /><rect x="42" y="100" width="126" height="34" rx="6" fill={C.cream} stroke={C.yel} strokeWidth="2" />
        <text x="105" y="124" fontSize={fit(L[1], 116, 19)} textAnchor="middle" fill={C.navy} fontWeight={800}>{L[1]}</text>
        <Lines x={46} y={154} w={118} n={2} gap={14} /><Magnifier x={164} y={160} r={22} />
        {V === 'ok' ? <Check x={244} y={92} r={20} /> : <Warn x={244} y={92} />}<Pill x={244} y={140} text={L[2]} />
      </>;
    }
    case 'steps': return <>
      <Room h={h} desk={h - 50} wall="#eef3f8" />
      {[0, 1, 2].map((i) => <g key={i}><rect x="26" y={40 + i * 44} width="78" height="34" rx="8" fill={C.white} stroke={C.line} strokeWidth="2" /><circle cx="44" cy={57 + i * 44} r="11" fill={C.blue} />
        <text x="44" y={63 + i * 44} fontSize="16" textAnchor="middle" fill="#fff" fontWeight={800}>{i + 1}</text><Lines x={60} y={57 + i * 44} w={32} n={1} /></g>)}
      <Arrow x1={112} y={106} x2={146} /><Paper x={152} y={28} w={124} h={172} />
      <rect x="186" y="42" width="56" height="22" rx="5" fill={C.lblue} /><line x1="214" y1="64" x2="214" y2="78" stroke={C.ink} strokeWidth="3" />
      <polygon points="214,78 252,100 214,122 176,100" fill="#ffe08a" /><text x="214" y="106" fontSize={fit(L[0], 52, 17, 14)} textAnchor="middle" fill={C.navy} fontWeight={800}>{L[0]}</text>
      <line x1="214" y1="122" x2="214" y2="136" stroke={C.ink} strokeWidth="3" /><rect x="186" y="136" width="56" height="22" rx="5" fill={C.lblue} /><Lines x={170} y={176} w={88} n={2} gap={12} />
      <Person x={80} y={h - 50} s={0.8} arm="point" />
    </>;
    case 'browse': return <>
      <Sky id={id} h={h} /><rect x="30" y="24" width="206" height="150" rx="10" fill={C.white} stroke={C.line} strokeWidth="2" /><rect x="30" y="24" width="206" height="22" rx="10" fill={C.lblue} />
      {[0, 1, 2].map((i) => <circle key={i} cx={44 + i * 12} cy="35" r="4" fill={C.white} />)}<rect x="44" y="56" width="178" height="22" rx="11" fill="#f2f5f9" stroke={C.gray} strokeWidth="2" />
      {[0, 1, 2].map((i) => <g key={i}><rect x="46" y={92 + i * 26} width="14" height="14" rx="3" fill={C.blue} /><Lines x={68} y={99 + i * 26} w={70} n={1} color={C.soft} />
        <Pill x={186} y={101 + i * 26} text={L[0]} size={16} fill="#eef3f8" /></g>)}
      <Magnifier x={250} y={150} r={22} />
    </>;
    case 'board': return <>
      <Sky id={id} h={h} mountains={false} /><rect x="60" y="22" width="220" height="150" rx="8" fill={C.board} /><rect x="68" y="30" width="204" height="134" rx="5" fill="#e9d2b0" />
      {[[78, 40], [146, 40], [214, 40], [78, 102], [146, 102], [214, 102]].map(([x, y], i) => <g key={i}>
        <rect x={x} y={y} width="50" height="52" rx="4" fill={C.white} stroke={i === 4 ? C.yel : '#e2e6ec'} strokeWidth={i === 4 ? 4 : 1.5} />
        {V === 'paper' ? <Lines x={x + 9} y={y + 12} w={32} n={2} gap={9} color={C.soft} width={4} /> : V === 'house'
          ? <g><rect x={x + 16} y={y + 10} width="18" height="14" fill={C.m1} /><polygon points={`${x + 12},${y + 11} ${x + 25},${y + 2} ${x + 38},${y + 11}`} fill={C.ora} /></g>
          : <g><rect x={x + 18} y={y + 4} width="14" height="20" fill={C.m1} /><rect x={x + 21} y={y + 8} width="3" height="3" fill="#fff" /><rect x={x + 26} y={y + 8} width="3" height="3" fill="#fff" /></g>}
        <Lines x={x + 8} y={y + 34} w={34} n={2} gap={9} width={4} /></g>)}
      <Check x={212} y={106} r={13} /><Pill x={196} y={194} text={L[0]} /><Person x={32} y={h - 30} s={0.9} arm="point" />
    </>;
    case 'shelf': {
      const colors = ['#3f5f8f', C.brown, C.blue, C.green, '#b5543a', '#6b7fa6', '#3f5f8f', '#a07a4c'];
      return <>
        <Room h={h} desk={h - 40} wall="#eef2f7" /><rect x="30" y="22" width="150" height={h - 62} rx="4" fill={C.board} />
        {[0, 1, 2].map((row) => <g key={row}><rect x="36" y={72 + row * 52} width="138" height="6" fill="#a87d52" />
          {Array.from({ length: 7 }, (_, i) => (row === 1 && i === 3 ? null : <rect key={i} x={40 + i * 19} y={32 + row * 52 + (i % 3) * 2} width="15" height={40 - (i % 3) * 2} rx="2" fill={colors[(i + row) % 8]} />))}</g>)}
        <g transform="rotate(-12 222 112)"><rect x="196" y="70" width="54" height="78" rx="4" fill={C.blue} /><rect x="202" y="76" width="42" height="66" rx="2" fill="#2a5f9e" />
          {V === 'law' ? <g stroke="#ffe08a" strokeWidth="3"><line x1="223" y1="88" x2="223" y2="126" /><line x1="207" y1="96" x2="239" y2="96" /><path d="M207 96 l-6 14 h12 Z M239 96 l-6 14 h12 Z" fill="#ffe08a" /></g>
            : <Lines x={210} y={96} w={26} n={3} gap={11} color="#ffe08a" width={4} />}</g>
        <Pill x={224} y={178} text={L[0]} />
      </>;
    }
    case 'speak': return <>
      <Sky id={id} h={h} /><Person x={64} y={h - 26} s={1.05} />
      <path d="M110 46 h170 a12 12 0 0 1 12 12 v58 a12 12 0 0 1 -12 12 h-140 l-20 18 v-18 h-10 a12 12 0 0 1 -12 -12 v-58 a12 12 0 0 1 12 -12 Z" fill={C.white} />
      <text x="196" y="96" fontSize={fit(L[0], 160, 26)} textAnchor="middle" fill={C.navy} fontWeight={800}>{L[0]}</text>
      {[0, 1, 2].map((i) => <path key={i} d={`M${96 + i * 9} ${h - 112} q8 -14 0 -28`} fill="none" stroke={C.blue} strokeWidth="3.5" strokeLinecap="round" opacity={1 - i * 0.25} />)}
      <Pill x={208} y={164} text={L[1]} />
    </>;
    case 'word': return <>
      <Room h={h} desk={h - 48} wall="#f3efe6" />
      <path d={`M150 ${h - 54} q-60 -20 -116 -2 v-96 q56 -18 116 2 Z`} fill={C.white} stroke={C.line} strokeWidth="2" /><path d={`M150 ${h - 54} q60 -20 116 -2 v-96 q-56 -18 -116 2 Z`} fill={C.white} stroke={C.line} strokeWidth="2" />
      <text x="92" y={h - 124} fontSize={fit(L[1], 100, 20)} textAnchor="middle" fill={C.red} fontWeight={700}>{L[1]}</text>
      <text x="92" y={h - 80} fontSize={fit(L[0], 100, 40, 20)} textAnchor="middle" fill={C.navy} fontWeight={800}>{L[0]}</text>
      <Lines x={172} y={h - 134} w={74} n={4} gap={16} color={C.soft} /><Pill x={232} y={h - 20} text={L[2]} fill={C.yel} color={C.navy} />
    </>;
    case 'play': return <>
      <Sky id={id} h={h} mountains={false} /><rect x="40" y="18" width="188" height="118" rx="10" fill={C.ink} />
      <text x="60" y="54" fontSize={fit(L[0], 96, 24)} fill="#ffe08a" fontWeight={800}>{L[0]}</text>
      <Lines x={70 + noahPinLabelWidth(L[0]) * fit(L[0], 96, 24)} y={46} w={Math.max(10, 140 - noahPinLabelWidth(L[0]) * fit(L[0], 96, 24))} n={1} color="#7f93b8" width={6} />
      {['A', 'B', 'C'].map((c, i) => <g key={c}><rect x={58 + i * 56} y="76" width="44" height="40" rx="7" fill={[C.red, C.blue, C.green][i]} />
        <text x={80 + i * 56} y="103" fontSize="20" textAnchor="middle" fill="#fff" fontWeight={800}>{c}</text></g>)}
      {[60, 118, 176, 234].map((x, i) => <Person key={x} x={x} y={h - 20} s={0.78} shirt={[C.yel, C.ora, '#8ec3e6', C.yel][i]} arm={i % 2 === 0 ? 'up' : 'down'} />)}
    </>;
    case 'print': return <>
      <Room h={h} desk={h - 70} wall="#f4f1ea" />
      <g transform="rotate(-4 120 110)"><rect x="54" y="26" width="132" height="168" rx="4" fill={C.white} stroke={C.line} strokeWidth="2" />
        {V === 'math'
          ? <g><g fill="none" stroke={C.navy} strokeWidth="3"><circle cx="96" cy="76" r="20" /><circle cx="142" cy="70" r="18" /><path d="M96 96 l4 40 M142 88 l-4 46" /></g>
            <circle cx="142" cy="70" r="15" fill={C.ora} opacity="0.55" /><rect x="76" y="136" width="88" height="40" rx="6" fill="none" stroke={C.navy} strokeWidth="3" /></g>
          : <g><Lines x={70} y={60} w={100} n={4} gap={18} color={C.soft} /><rect x="76" y="136" width="88" height="40" rx="6" fill="none" stroke={C.navy} strokeWidth="3" /></g>}
        <text x="120" y="164" fontSize={fit(L[0], 80, 20)} textAnchor="middle" fill={C.navy} fontWeight={800}>{L[0]}</text></g>
      {[C.red, C.yel, C.blue, C.green].map((c, i) => <g key={c} transform={`rotate(${-28 + i * 10} ${232 + i * 14} 150)`}><rect x={226 + i * 14} y="96" width="10" height="66" rx="3" fill={c} />
        <polygon points={`${226 + i * 14},96 ${236 + i * 14},96 ${231 + i * 14},84`} fill="#f1d9b5" /></g>)}
    </>;
    case 'gauge': return <>
      <Sky id={id} h={h} /><Part part={P[0]} cx={84} cy={112} /><Pill x={84} y={h - 58} text={L[0]} />
      <rect x="150" y="96" width="128" height="22" rx="11" fill={C.white} /><rect x="150" y="96" width="92" height="22" rx="11" fill={C.yel} />
      <line x1="242" y1="84" x2="242" y2="130" stroke={C.navy} strokeWidth="3" strokeDasharray="4 4" /><Pill x={232} y={158} text={L[1]} />
    </>;
    case 'return': return <>
      <Room h={h} desk={h - 50} wall="#eef3f8" /><rect x="30" y="60" width="124" height="80" rx="6" fill={C.white} stroke={C.line} strokeWidth="2" />
      <path d="M30 62 l62 42 l62 -42" fill="none" stroke={C.line} strokeWidth="2" /><Pill x={92} y={h - 66} text={L[0]} />
      <path d="M160 74 q46 -44 86 6" fill="none" stroke={C.green} strokeWidth="5" strokeLinecap="round" /><path d="M236 72 l12 12 l4 -16 Z" fill={C.green} /><Coin x={196} y={44} r={17} />
      <rect x="214" y="98" width="70" height="48" rx="10" fill={C.brown} /><rect x="214" y="98" width="70" height="16" rx="8" fill="#a8744f" /><circle cx="268" cy="124" r="5" fill="#ffe08a" />
      <Pill x={244} y={h - 26} text={L[1]} fill="#e6f2ea" color={C.green} />
    </>;
    case 'split': return <>
      <Sky id={id} h={h} mountains={false} /><Pill x={20 + (noahPinLabelWidth(L[0]) * LABEL + 18) / 2} y={40} text={L[0]} />
      <rect x="24" y="58" width="252" height="40" rx="8" fill={C.gray} /><path d="M150 100 v12" stroke={C.navy} strokeWidth="3" /><path d="M144 108 l6 8 l6 -8" fill="none" stroke={C.navy} strokeWidth="3" strokeLinecap="round" />
      <rect x="24" y="118" width="186" height="40" rx="8" fill={C.yel} /><rect x="214" y="118" width="22" height="40" rx="4" fill="#9fb6d6" /><rect x="240" y="118" width="16" height="40" rx="4" fill="#b8c7dd" /><rect x="260" y="118" width="16" height="40" rx="4" fill="#cfd9e8" />
      <text x="117" y="145" fontSize={fit(L[1], 170, 20)} textAnchor="middle" fill={C.navy} fontWeight={800}>{L[1]}</text>
      <Pill x={280 - (noahPinLabelWidth(L[2]) * LABEL + 18) / 2} y={186} text={L[2]} />
    </>;
    case 'place': return <>
      <Sky id={id} h={h} /><Tree x={48} y={g + 6} kind={V ?? 'green'} /><Tree x={96} y={g + 2} s={0.75} kind={V ?? 'green'} /><Tree x={252} y={g + 4} s={0.95} kind={V ?? 'green'} />
      <rect y={g + 24} width="300" height="6" fill="#8b8f99" />{Array.from({ length: 14 }, (_, i) => <rect key={i} x={8 + i * 22} y={g + 22} width="4" height="10" fill="#6b6f79" />)}
      {P[0] === 'station' && <g><rect x="132" y={g - 30} width="40" height="22" rx="4" fill={C.white} stroke={C.ink} strokeWidth="2" /><rect x="150" y={g - 8} width="4" height="14" fill={C.ink} />
        <text x="152" y={g - 13} fontSize="15" textAnchor="middle" fill={C.ink} fontWeight={800}>駅</text></g>}
      {P[0] === 'temple' && <g><rect x="130" y={g - 40} width="48" height="40" fill="#fff4e0" /><polygon points={`120,${g - 38} 154,${g - 62} 188,${g - 38}`} fill={C.red} /></g>}
      <Pin x={196} y={g - 96} /><Pill x={20 + (noahPinLabelWidth(L[0]) * LABEL + 18) / 2} y={40} text={L[0]} />
    </>;
    case 'nearby': return <>
      <Sky id={id} h={h} mountains={false} />
      {V === 'lockers'
        ? <g><rect x="20" y={g - 120} width="100" height="120" rx="4" fill="#4f78b0" />{Array.from({ length: 12 }, (_, i) => <g key={i}><rect x={28 + (i % 3) * 30} y={g - 112 + Math.floor(i / 3) * 28} width="24" height="22" rx="2" fill="#7fa3d3" />
          <circle cx={46 + (i % 3) * 30} cy={g - 101 + Math.floor(i / 3) * 28} r="2" fill="#ffe08a" /></g>)}</g>
        : <g><rect x="20" y={g - 96} width="104" height="96" fill="#fff4e0" /><path d={`M14 ${g - 96} h116 v18 q-9 10 -19 0 q-10 10 -19 0 q-10 10 -19 0 q-10 10 -19 0 q-10 10 -20 0 q-10 10 -20 0 Z`} fill={C.red} />
          <rect x="34" y={g - 56} width="34" height="56" fill={C.lblue} /><rect x="78" y={g - 56} width="34" height="30" fill={C.lblue} /></g>}
      {P[0] === 'restroom' && <g><rect x="150" y={g - 120} width="52" height="64" rx="6" fill={C.white} stroke={C.ink} strokeWidth="2" />
        <circle cx="166" cy={g - 102} r="6" fill={C.blue} /><rect x="160" y={g - 94} width="12" height="24" rx="4" fill={C.blue} /><circle cx="186" cy={g - 102} r="6" fill={C.red} /><path d={`M178 ${g - 70} l8 -24 l8 24 Z`} fill={C.red} />
        <rect x="174" y={g - 56} width="4" height="56" fill={C.ink} /></g>}
      <Pin x={252} y={g - 132} /><Pill x={252} y={g - 64} text={L[0]} />
    </>;
    case 'building': return <>
      <Sky id={id} h={h} /><circle cx="30" cy="34" r="16" fill="#ffd36b" />
      {V === 'hospital'
        ? <g><rect x="70" y={g - 110} width="120" height="110" fill={C.white} /><rect x="116" y={g - 98} width="28" height="28" rx="3" fill={C.red} /><rect x="126" y={g - 104} width="8" height="40" fill="#fff" />
          <rect x="110" y={g - 76} width="40" height="8" fill="#fff" /><rect x="114" y={g - 40} width="32" height="40" fill={C.lblue} /></g>
        : V === 'office'
          ? <g><rect x="80" y={g - 140} width="96" height="140" fill="#9fb6d6" />{Array.from({ length: 12 }, (_, i) => <rect key={i} x={92 + (i % 3) * 28} y={g - 128 + Math.floor(i / 3) * 30} width="18" height="18" fill={C.lblue} />)}</g>
          : <g><rect x="60" y={g - 86} width="140" height="86" fill="#fff4e0" /><polygon points={`48,${g - 84} 130,${g - 138} 212,${g - 84}`} fill={C.ora} />
            <rect x="76" y={g - 66} width="26" height="22" rx="3" fill={C.lblue} /><rect x="158" y={g - 66} width="26" height="22" rx="3" fill={C.lblue} /><rect x="116" y={g - 50} width="28" height="50" rx="4" fill={C.board} /></g>}
      {V === 'nursery' && <><Person x={232} y={g + 26} s={0.6} shirt="#8ec3e6" /><Person x={258} y={g + 26} s={0.55} shirt={C.pink} /></>}
      <Pill x={250} y={g - 96} text={L[0]} />
    </>;
    default: return null;
  }
}
