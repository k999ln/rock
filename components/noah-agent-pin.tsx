'use client';
import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { noahPinShape, noahPinTopic, type NoahPinTopic } from '@/lib/noah-pins';
import { NoahPinMotion, type NoahCoverView, type NoahPinDiagramView } from './noah-art-motion';
import type { NoahPinVideo } from '@/lib/noah-pin-video';
import pins from './noah-pins.module.css';
import styles from './noah-agent-pin.module.css';
import { NOAH_DETAIL_PREVIEW_KEY, noahDetailPreviewRecord, noahDetailTarget } from '@/lib/noah-detail-preview';
import { NoahDetailNavigation } from './noah-detail-navigation';

export function NoahAgentPinGrid({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const list = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const grid = list.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    // Each grid item spans four-pixel rows. Measure its article at natural height,
    // including the independent save buttons, ratings and any expanded actions.
    const resize = (article: Element, height: number) => {
      const item = article.parentElement;
      const span = `span ${Math.max(1, Math.ceil(height / 4))}`;
      if (item && item.style.gridRowEnd !== span) item.style.gridRowEnd = span;
    };
    const pending = new Map<Element, number>();
    let frame = 0;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) pending.set(entry.target, entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height);
      // Writing grid spans inside the observer can trigger another layout in the
      // same delivery cycle. Coalesce writes into the next frame instead.
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        for (const [article, height] of pending) resize(article, height);
        pending.clear();
      });
    });
    const articles = Array.from(grid.children, item => item.firstElementChild).filter((article): article is Element => article !== null);
    const heights = articles.map(article => article.getBoundingClientRect().height);
    articles.forEach((article, index) => {
      resize(article, heights[index]);
      observer.observe(article, { box: 'border-box' });
    });
    grid.dataset.measured = 'true';
    return () => { observer.disconnect(); cancelAnimationFrame(frame); pending.clear(); };
  }, [children]);
  return <ul className={styles.grid} data-agent-pin-grid={compact ? 'compact' : 'list'} ref={list}>{children}</ul>;
}

type PinFaceProps = {
  id: string; name: string; href?: string; prefetch?: false; topic?: NoahPinTopic; shape?: 0 | 1 | 2;
  summary?: string; cover?: NoahCoverView; diagram?: NoahPinDiagramView; video?: NoahPinVideo; onSelect?: () => void; disabled?: boolean; pressed?: boolean;
  /** 題名だけのカード（本人の指示 2026-11-25「文章いらない、題名だけ」）。説明の字を出さない（summary は絵を選ぶためだけに使う）。 */
  plain?: boolean;
};

export function NoahAgentPinFace({ id, name, href, prefetch, topic, shape, summary, cover, diagram, video, onSelect, disabled, pressed, plain }: PinFaceProps) {
  const openDetail = useContext(NoahDetailNavigation);
  const category = topic ?? noahPinTopic(name, summary ?? '');
  const attributes = { className: `${styles.face} ${pins.tone}`, 'data-shape': shape ?? noahPinShape(id), 'data-topic': category };
  const videoTitle = Boolean(video || cover?.type.startsWith('video/'));
  const contents = <>
    <span className={`${pins.panel} ${videoTitle ? styles.videoPanel : ''}`}>
      <NoahPinMotion id={id} name={name} summary={summary} cover={cover} diagram={diagram} video={video} />
      {videoTitle && <span className={styles.videoTitle}><strong>{name}</strong>{summary && <span>{summary}</span>}</span>}
    </span>
    {!videoTitle && <strong className={styles.name}>{name}</strong>}
    {summary && !plain && !videoTitle && <span className={styles.summary}>{summary}</span>}
  </>;
  if (href) return <Link {...attributes} href={href} prefetch={noahDetailTarget(href) ? false : prefetch} onClick={event => {
    const preview = { id, name, summary: summary ?? '' };
    const record = noahDetailPreviewRecord(href, preview);
    if (record) try { window.sessionStorage.setItem(NOAH_DETAIL_PREVIEW_KEY, record); } catch { /* Browsing still works without storage. */ }
    if (record && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) openDetail(href, preview);
  }}>{contents}</Link>;
  if (onSelect) return <button {...attributes} type="button" onClick={onSelect} disabled={disabled} aria-pressed={pressed}>{contents}</button>;
  return <div {...attributes}>{contents}</div>;
}

export function NoahAgentPin({ meta, actions, ...face }: PinFaceProps & { meta?: ReactNode; actions?: ReactNode }) {
  const topic = face.topic ?? noahPinTopic(face.name, face.summary ?? '');
  const shape = face.shape ?? noahPinShape(face.id);
  // 題名だけのカードでは、保存と「その他」を、PC はマウスを乗せた時だけ絵の上に、スマホは題名の右に小さく出す（本人の決定 2026-11-25「乗せた時だけ出す」）。
  return <li data-agent-pin-id={face.id} data-topic={topic} data-shape={shape}>
    <article className={styles.card} aria-label={face.name} data-plain={face.plain ? '' : undefined}>
      <NoahAgentPinFace {...face} topic={topic} shape={shape} />
      {meta && <div className={styles.meta}>{meta}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </article>
  </li>;
}
