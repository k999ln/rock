'use client';
import { useEffect, useRef } from 'react';
import { AudioLines, BookOpen, BriefcaseBusiness, ChartNoAxesCombined, Compass, Database, FilePenLine, Leaf, ScanSearch, Terminal } from 'lucide-react';
import type { NoahPinTopic } from '@/lib/noah-pins';
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

const emblems = { work: BriefcaseBusiness, money: ChartNoAxesCombined, dev: Terminal, research: ScanSearch, learn: BookOpen, life: Leaf, data: Database, media: AudioLines, words: FilePenLine, other: Compass };
export function NoahPinMotion({ topic }: { topic: NoahPinTopic }) {
  const ref = useArtEntrance();
  const Icon = emblems[topic] ?? Compass;
  return <span ref={ref} className={styles.pinArt} data-noah-motion="pin" aria-hidden="true">
    <span className={styles.orbit} /><Icon className={styles.emblem} strokeWidth={1.25} />
  </span>;
}

export function NoahFeatureMotion() {
  const ref = useArtEntrance();
  return <span ref={ref} className={styles.poster} data-noah-motion="feature" aria-hidden="true" />;
}
