'use client';
import { useEffect, useRef, useState } from 'react';
import { resolveNoahAgentArt } from '@/lib/noah-agent-art';
import { NoahAgentScene } from './noah-agent-scene';
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

export function NoahPinMotion({ id, name, summary, cover }: { id: string; name: string; summary?: string; cover?: NoahCoverView }) {
  const ref = useArtEntrance();
  const [failed, setFailed] = useState('');
  const source = cover && failed !== cover.url ? cover : undefined;
  return <span ref={ref} className={styles.pinArt} data-noah-motion="pin" aria-hidden="true">
    {source ? source.type.startsWith('video/') ?
      <AuthorVideo key={source.url} cover={source} onError={() => setFailed(source.url)} /> :
      /* oxlint-disable-next-line next/no-img-element -- Private author covers use their authenticated, same-origin URL. */
      <img className={styles.coverMedia} src={source.url} alt="" loading="lazy" onError={() => setFailed(source.url)} /> :
      <NoahAgentScene art={resolveNoahAgentArt(id,name,summary)} name={name} summary={summary} />}
  </span>;
}
