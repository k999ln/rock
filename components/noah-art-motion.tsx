'use client';
import { useEffect, useRef, useState } from 'react';
import { resolveNoahAgentArt } from '@/lib/noah-agent-art';
import type { NoahPinScene } from '@/lib/noah-pin-scene';
import type { NoahPinVideo } from '@/lib/noah-pin-video';
import { NoahAgentScene } from './noah-agent-scene';
import NoahPinSceneArt from './noah-pin-scene';
import styles from './noah-art-motion.module.css';

// The poster is present on first paint. Each illustration plays once when it comes into view.
let entranceObserver: IntersectionObserver | undefined;
export function useArtEntrance() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const art = ref.current;
    if (!art || typeof IntersectionObserver === 'undefined') return;
    entranceObserver ??= new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof HTMLElement) {
          entry.target.dataset.entered = 'true';
          entranceObserver?.unobserve(entry.target);
        }
      }
    }, { threshold: 0.15 });
    entranceObserver.observe(art);
    return () => entranceObserver?.unobserve(art);
  }, []);
  return ref;
}

export type NoahCoverView = { type: string; url: string };

function AuthorVideo({ cover, onError }: { cover: NoahCoverView; onError: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let finished = false;
    let visible = false;
    let pending = false;
    const sync = () => {
      if (visible && !video.getAttribute('src')) video.src = cover.url;
      if (!visible || document.hidden || reduced.matches || finished) {
        video.pause();
        if (reduced.matches && video.readyState >= 1) video.currentTime = 0;
      } else if (!pending) {
        pending = true;
        void video.play().catch(() => {}).finally(() => { pending = false; });
      }
    };
    const limit = () => { if (video.currentTime >= 5 || video.ended) { finished = true; video.pause(); } };
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; sync();
    }, { threshold: .15 }) : null;
    if (observer) observer.observe(video);
    else { visible = true; sync(); }
    reduced.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    video.addEventListener('timeupdate', limit);
    video.addEventListener('ended', limit);
    return () => {
      observer?.disconnect(); reduced.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync);
      video.removeEventListener('timeupdate', limit); video.removeEventListener('ended', limit);
      video.pause(); video.removeAttribute('src'); video.load();
    };
  }, [cover.url]);
  return <video ref={ref} className={styles.coverMedia} muted playsInline preload="metadata" onError={onError} aria-hidden="true" />;
}

/**
 * ピンの動画（spec-115 の 10 章）。GIF と同じ見た目の、音なしの短いループ。本人の決定（2026-11-25）「見えている間は繰り返す」。
 * 画面に見えている間だけ読み込んで繰り返し、外に出たら止める。動きを減らす設定の人には、最初の絵（poster）だけを出す（動画は読まない）。
 */
function PinLoopVideo({ video, onError }: { video: NoahPinVideo; onError: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let pending = false;
    const sync = () => {
      if (visible && !reduced.matches && !element.getAttribute('src')) element.src = video.url;
      if (!visible || document.hidden || reduced.matches) {
        element.pause();
        // Release decoded video buffers as cards leave the feed viewport.
        if ((!visible || reduced.matches) && element.getAttribute('src')) {
          element.removeAttribute('src'); element.load();
        }
      } else if (!pending) {
        pending = true;
        void element.play().catch(() => {}).finally(() => { pending = false; });
      }
    };
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; sync();
    }, { threshold: .15 }) : null;
    if (observer) observer.observe(element);
    else { visible = true; sync(); }
    reduced.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer?.disconnect(); reduced.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync);
      element.pause(); element.removeAttribute('src'); element.load();
    };
  }, [video.url]);
  return <video ref={ref} className={styles.coverMedia} muted loop playsInline preload="none" poster={video.poster} onError={onError} aria-hidden="true" />;
}

/** 資料の図解（spec-115 の 9 章）。scene は Luna Max が書いて確かめた 1 枚、tone は並びの何枚目か（色を回す）。 */
export type NoahPinDiagramView = { scene: NoahPinScene; tone: number };

// 絵の順: 作者が選んだ表紙 → ピンの動画（本人の指示 2026-11-25「こういう動画をgifにしてピン画像にする」）→ 図解 → 場面の絵。
// 前の物が無いか読めない時に、次の物を出す（本人の決定 2026-11-25「作者の表紙→図解→場面」に、動画を図解の前に足した）。
// 場面の絵は、元の説明（summary）で選び、絵の中に書く字は caption（日本語の 1 行など）があればそれにする。
// 一覧のカードと詳細の頭で、同じ Agent が同じ絵になる（どちらも元の説明で選ぶ）。
export function NoahPinMotion({ id, name, summary, caption, cover, diagram, video }: { id: string; name: string; summary?: string; caption?: string; cover?: NoahCoverView; diagram?: NoahPinDiagramView; video?: NoahPinVideo }) {
  const ref = useArtEntrance();
  const [failed, setFailed] = useState<string[]>([]);
  const fail = (url: string) => setFailed((old) => (old.includes(url) ? old : [...old, url]));
  const source = cover && !failed.includes(cover.url) ? cover : undefined;
  const loop = !source && video && !failed.includes(video.url) ? video : undefined;
  const drawn = !source && !loop && diagram ? diagram : undefined;
  return <span ref={ref} className={styles.pinArt} data-noah-motion="pin" data-noah-pin-video={loop ? '' : undefined} data-noah-pin-diagram={drawn ? '' : undefined} aria-hidden="true">
    {source ? source.type.startsWith('video/') ?
      <AuthorVideo key={source.url} cover={source} onError={() => fail(source.url)} /> :
      /* oxlint-disable-next-line next/no-img-element -- Private author covers use their authenticated, same-origin URL. */
      <img className={styles.coverMedia} src={source.url} alt="" loading="lazy" onError={() => fail(source.url)} /> :
      loop ? <PinLoopVideo key={loop.url} video={loop} onError={() => fail(loop.url)} /> :
      drawn ? <NoahPinSceneArt scene={drawn.scene} tone={drawn.tone} /> :
      <NoahAgentScene art={resolveNoahAgentArt(id,name,summary)} name={name} summary={caption || summary} />}
  </span>;
}
