'use client';
/**
 * ピンの絵（バージョン TAKE。spec-115 の 9 章）。lib/noah-pin-scene.ts の 1 枚（図の名前と札の言葉）を、
 * lib/noah-pin-diagram.ts（しょうへいさんの Motion Prompt の図解パックの書き写し。MIT License (c) 2026 Shohei Ohtaki）で、539:208 の canvas に描く。
 * 動き（本人の決定 2026-11-24「画面に入った時に1回」と、指示「もっと可愛いアニメーション」「cuteじゃなくて可愛い」）: 画面に入った時に 1 回だけ、元と同じ順番で、
 * 部品が可愛い動き「ぽよん」（lib/noah-pin-diagram.ts。本人が 3 つから選んだ）で出て組み上がり、組み上がった形で止まる（元のように消えて繰り返さない）。
 * 色は、色の組 tone（App Store の Today のカードのように 1 枚ずつ違う深い色。lib/noah-pin-diagram.ts の NOAH_PIN_TONES。本人の指示「色味がダサい」「こんな感じにして」）。
 * 動きを減らす設定の人・見えたかを確かめられない端末には、初めから組み上がった形を出す。サーバーで描いた時は、同じ色の組の空の面（字も形も無い）。
 * 字は canvas の中なので、読み上げには出さない（aria-hidden。カードの題と説明の字が読まれる）。
 * 見張り（IntersectionObserver）・時計（requestAnimationFrame）・大きさ（ResizeObserver）は、ページ全体で 1 つずつ（絵ごとには作らない）。
 */
import { useEffect, useRef } from 'react';
import { drawNoahPinDiagram, NOAH_PIN_ART, noahPinColors, noahPinHold } from '@/lib/noah-pin-diagram';
import type { NoahPinScene } from '@/lib/noah-pin-scene';
import css from './noah-pin-scene.module.css';

/** 描いている 1 枚。u は今の時刻（秒）、start は動き始めた時の時計（動いていない時は null）。 */
type Art = { canvas: HTMLCanvasElement; scene: NoahPinScene; tone: number; u: number; start: number | null; onPlay: () => void };

/** 今の u の形を、canvas の今の幅（端末の画素の 2 倍まで）で描く。 */
function paint(art: Art) {
  const { canvas } = art, width = canvas.clientWidth;
  if (!width) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1), w = Math.round(width * ratio), h = Math.round(w * NOAH_PIN_ART.height / NOAH_PIN_ART.width);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const k = canvas.getContext('2d');
  if (!k) return;
  k.setTransform(w / NOAH_PIN_ART.width, 0, 0, h / NOAH_PIN_ART.height, 0, 0);
  drawNoahPinDiagram(k, art.scene, art.u, art.tone);
}

// 時計: 動いている絵だけを、1 つの requestAnimationFrame でまとめて描く。組み上がったら外す。
const playing = new Set<Art>();
let clock = 0;
function tick(now: number) {
  clock = 0;
  for (const art of playing) {
    const hold = noahPinHold(art.scene.template);
    art.start ??= now;
    art.u = Math.min(hold, (now - art.start) / 1000);
    paint(art);
    if (art.u >= hold) playing.delete(art);
  }
  if (playing.size) clock = requestAnimationFrame(tick);
}

// 見張り: 4 割が画面に入ったら、1 回だけ動かす。
let seen: IntersectionObserver | null = null;
const waiting = new Map<Element, Art>();
function watch(art: Art) {
  seen ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const found = entry.isIntersecting ? waiting.get(entry.target) : undefined;
      if (!found) continue;
      waiting.delete(entry.target);
      seen?.unobserve(entry.target);
      found.onPlay();
      found.u = 0; found.start = null;
      playing.add(found);
      if (!clock) clock = requestAnimationFrame(tick);
    }
  }, { threshold: 0.4 });
  waiting.set(art.canvas, art);
  seen.observe(art.canvas);
}

// 大きさ: 列の幅が変わったら、止まっている絵を今の形のまま描き直す（動いている絵は、時計が描く）。
let sized: ResizeObserver | null = null;
const shown = new Map<Element, Art>();
function follow(art: Art) {
  shown.set(art.canvas, art);
  if (typeof ResizeObserver === 'undefined') return;
  sized ??= new ResizeObserver((entries) => {
    for (const entry of entries) { const found = shown.get(entry.target); if (found && !playing.has(found)) paint(found); }
  });
  sized.observe(art.canvas);
}
function forget(art: Art) {
  playing.delete(art);
  waiting.delete(art.canvas); seen?.unobserve(art.canvas);
  shown.delete(art.canvas); sized?.unobserve(art.canvas);
}

/**
 * 1 枚の図解。ready は、置き場所が決まったか（グリッドは、置く前のカードを左上に重ねて隠すので、置き終わるまで見張りを始めない）。棚のように初めから置いてある所では省く。
 * 1 度動いた絵は、置き直し（列の幅が変わった時など）でもう一度動かさない（組み上がった形のまま）。tone は色の組の番号（noahPinTone(カードの id) で決める）。
 */
export default function NoahPinSceneArt({ scene, className, ready = true, tone = 0 }: { scene: NoahPinScene; className?: string; ready?: boolean; tone?: number }) {
  const frame = useRef<HTMLCanvasElement>(null), played = useRef(false);
  useEffect(() => {
    const canvas = frame.current;
    if (!canvas) return;
    const still = played.current || typeof IntersectionObserver === 'undefined' || typeof requestAnimationFrame === 'undefined'
      || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const art: Art = { canvas, scene, tone, u: still ? noahPinHold(scene.template) : 0, start: null, onPlay: () => { played.current = true; } };
    follow(art);
    paint(art);
    if (!still && ready) watch(art);
    return () => forget(art);
  }, [scene, ready, tone]);
  const colors = noahPinColors(tone);
  return <canvas ref={frame} className={`${css.art}${className ? ` ${className}` : ''}`} width={NOAH_PIN_ART.width} height={NOAH_PIN_ART.height}
    style={{ background: `linear-gradient(135deg, ${colors.bg1}, ${colors.bg2})` }} data-template={scene.template} aria-hidden="true" />;
}
