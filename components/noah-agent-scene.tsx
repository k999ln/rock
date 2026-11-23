'use client';
import { useEffect, useRef } from 'react';
import type { resolveNoahAgentArt } from '@/lib/noah-agent-art';
import { drawNoahCardVideoFrame, noahSceneGround } from '@/lib/noah-card-video-paint';
import styles from './noah-agent-scene.module.css';

type Art = ReturnType<typeof resolveNoahAgentArt>;

/** The pin and the author's exported video use the same original, deterministic frames. */
export function NoahAgentScene({ art, name = '', summary = '' }: { art: Art; name?: string; summary?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { scene, seed, signature } = art;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const entrance = canvas.closest<HTMLElement>('[data-noah-motion]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const identity = { scene, seed, signature };
    let frame = 0;
    let progress = 1;
    let finished = false;
    let lastPaint = 0;
    let began = 0;
    function draw() {
      if (canvas && ctx) {
        drawNoahCardVideoFrame(ctx, identity, progress, name, summary);
        if (!canvas.dataset.painted) canvas.dataset.painted = 'true';
      }
    }
    function resize() {
      if (!canvas) return;
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      // Tiny grid pins get retina resolution. Bound hero backing stores on very wide screens.
      const scale = Math.min(window.devicePixelRatio || 1, 2, 960 / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      draw();
    }
    function complete() {
      if (!canvas) return;
      cancelAnimationFrame(frame);
      frame = 0; finished = true; progress = 1;
      canvas.dataset.sceneFrame = 'complete';
      draw();
    }
    function animate(now: number) {
      if (!canvas) return;
      if (!began) began = now;
      progress = Math.min(1, (now - began) / 1950);
      if (progress >= 1) { complete(); return; }
      if (now - lastPaint >= 1000 / 30) { lastPaint = now; draw(); }
      frame = requestAnimationFrame(animate);
    }
    function enter() {
      if (!canvas || finished || frame) return;
      if (reduced.matches || !entrance) { complete(); return; }
      if (!entrance.hasAttribute('data-entered')) return;
      progress = 0; canvas.dataset.sceneFrame = 'playing';
      draw(); frame = requestAnimationFrame(animate);
    }
    canvas.dataset.sceneFrame = 'rest';
    resize();
    const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    size?.observe(canvas);
    const entry = typeof MutationObserver === 'undefined' || !entrance ? null : new MutationObserver(() => {
      if (entrance.hasAttribute('data-entered')) { entry?.disconnect(); enter(); }
    });
    if (entry && entrance && !entrance.hasAttribute('data-entered')) entry.observe(entrance, { attributes: true, attributeFilter: ['data-entered'] });
    enter();
    const motionChange = () => { if (reduced.matches) complete(); };
    const visibility = () => { if (document.hidden && frame) complete(); };
    reduced.addEventListener('change', motionChange);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame); size?.disconnect(); entry?.disconnect();
      reduced.removeEventListener('change', motionChange);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [scene, seed, signature, name, summary]);
  return <span className={styles.scene} data-agent-art={scene} data-artwork={signature} aria-hidden="true" style={{ backgroundColor: noahSceneGround(art) }}>
    <canvas ref={canvasRef} className={styles.frame} data-scene-frame="rest" />
    {name && <span className={styles.still}>{name}</span>}
  </span>;
}
export default NoahAgentScene;
