'use client';
/**
 * ピンの絵（バージョン TAKE。spec-115 の 9 章）。lib/noah-pin-scene.ts の 1 枚（図の名前と札の言葉）を、
 * lib/noah-pin-diagram.ts（しょうへいさんの Motion Prompt の図解パックの書き写し。MIT License (c) 2026 Shohei Ohtaki）で、539:208 の canvas に描く。
 * 動き（本人の決定 2026-11-25「見えている間は繰り返す」。前の決定 2026-11-24「画面に入った時に1回」から変わった。指示「もっと可愛いアニメーション」「cuteじゃなくて可愛い」）:
 * 画面に見えている間、元と同じ順番で、部品が可愛い動き「ぽよん」で出て組み上がり、組み上がった形を見せてから消え、また組み上がる（1 周 5〜8 秒。noahPinLoopFrame）。
 * 画面の外に出たら止め、また見えたら続きから動く。
 * 色は、配色の黄金比「ベース 70%・メイン 25%・アクセント 5%」の 3 色（明るい面と鮮やかな面。lib/noah-pin-diagram.ts の noahPinColors。
 * 3 色は、並びの n 枚目 tone ごとに、ポップな 8 組（赤・黄・青・白が中心）から黄金比の並びで選ぶ。本人の指示「黄金比カラーになってない」「もっとポップに」）。
 * 動きを減らす設定の人・見えたかを確かめられない端末には、初めから組み上がった形を出す（noahPinHold の形）。サーバーで描いた時は、同じ色の空の面（字も形も無い）。
 * 字は canvas の中なので、読み上げには出さない（aria-hidden。カードの題の字が読まれる）。
 * 見張り（IntersectionObserver）・時計（requestAnimationFrame）・大きさ（ResizeObserver）は、ページ全体で 1 つずつ（絵ごとには作らない）。
 */
import { useEffect, useRef } from 'react';
import { drawNoahPinDiagram, NOAH_PIN_ART, noahPinColors, noahPinHold, noahPinLoopFrame } from '@/lib/noah-pin-diagram';
import type { NoahPinScene } from '@/lib/noah-pin-scene';
import css from './noah-pin-scene.module.css';

/** 描いている 1 枚。u は描く時刻（秒）、fade は消え具合（0〜1）、spent は動いた長さの合計（秒）、start は今回動き始めた時の時計（止まっている時は null）。 */
type Art = { canvas: HTMLCanvasElement; scene: NoahPinScene; tone: number; u: number; fade: number; spent: number; start: number | null };

/** 今の u と fade の形を、canvas の今の幅（端末の画素の 2 倍まで）で描く。消える途中は、薄く描いて、下の同じ色の面を透かす。 */
function paint(art: Art) {
  const { canvas } = art, width = canvas.clientWidth;
  if (!width) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1), w = Math.round(width * ratio), h = Math.round(w * NOAH_PIN_ART.height / NOAH_PIN_ART.width);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const k = canvas.getContext('2d');
  if (!k) return;
  k.setTransform(w / NOAH_PIN_ART.width, 0, 0, h / NOAH_PIN_ART.height, 0, 0);
  k.clearRect(0, 0, NOAH_PIN_ART.width, NOAH_PIN_ART.height);
  k.globalAlpha = 1 - art.fade;
  drawNoahPinDiagram(k, art.scene, art.u, art.tone);
  k.globalAlpha = 1;
}

// 時計: 見えている絵だけを、1 つの requestAnimationFrame でまとめて描く。
const playing = new Set<Art>();
let clock = 0;
function tick(now: number) {
  clock = 0;
  for (const art of playing) {
    art.start ??= now - art.spent * 1000;
    const frame = noahPinLoopFrame(art.scene.template, (now - art.start) / 1000);
    art.spent = (now - art.start) / 1000; art.u = frame.u; art.fade = frame.fade;
    paint(art);
  }
  if (playing.size) clock = requestAnimationFrame(tick);
}
function stop(art: Art) {
  playing.delete(art);
  art.start = null;
}

// 見張り: 4 割が画面に入ったら動かし、出たら止める（止めた所の形のまま。また入ったら続きから）。
let seen: IntersectionObserver | null = null;
const watched = new Map<Element, Art>();
function watch(art: Art) {
  seen ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const found = watched.get(entry.target);
      if (!found) continue;
      if (!entry.isIntersecting) { stop(found); continue; }
      playing.add(found);
      if (!clock) clock = requestAnimationFrame(tick);
    }
  }, { threshold: 0.4 });
  watched.set(art.canvas, art);
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
  stop(art);
  watched.delete(art.canvas); seen?.unobserve(art.canvas);
  shown.delete(art.canvas); sized?.unobserve(art.canvas);
}

/**
 * 1 枚の図解。ready は、置き場所が決まったか（グリッドは、置く前のカードを左上に重ねて隠すので、置き終わるまで見張りを始めない）。棚のように初めから置いてある所では省く。
 * tone は、並びの何枚目か（0 から。ポップな 8 組から黄金比の並びで色の組を選ぶ）。
 */
export default function NoahPinSceneArt({ scene, className, ready = true, tone = 0 }: { scene: NoahPinScene; className?: string; ready?: boolean; tone?: number }) {
  const frame = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = frame.current;
    if (!canvas) return;
    const still = typeof IntersectionObserver === 'undefined' || typeof requestAnimationFrame === 'undefined'
      || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const art: Art = { canvas, scene, tone, u: still ? noahPinHold(scene.template) : 0, fade: 0, spent: 0, start: null };
    follow(art);
    paint(art);
    if (!still && ready) watch(art);
    return () => forget(art);
  }, [scene, ready, tone]);
  const colors = noahPinColors(tone);
  return <canvas ref={frame} className={`${css.art}${className ? ` ${className}` : ''}`} width={NOAH_PIN_ART.width} height={NOAH_PIN_ART.height}
    style={{ background: `linear-gradient(135deg, ${colors.bg1}, ${colors.bg2})` }} data-template={scene.template} aria-hidden="true" />;
}
