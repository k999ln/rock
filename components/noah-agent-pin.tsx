'use client';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { noahPinShape, noahPinTopic, type NoahPinTopic } from '@/lib/noah-pins';
import { NoahPinMotion, type NoahCoverView, type NoahPinDiagramView } from './noah-art-motion';
import type { NoahPinVideo } from '@/lib/noah-pin-video';
import pins from './noah-pins.module.css';
import styles from './noah-agent-pin.module.css';

export function NoahAgentPinGrid({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const list = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const grid = list.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    // Each grid item spans four-pixel rows. Measure its article at natural height,
    // including the independent save buttons, ratings and any expanded actions.
    const resize = (article: Element, height: number) => {
      const item = article.parentElement;
      if (item) item.style.gridRowEnd = `span ${Math.max(1, Math.ceil(height / 4))}`;
    };
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) resize(entry.target, entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height);
    });
    const articles = Array.from(grid.children, item => item.firstElementChild).filter((article): article is Element => article !== null);
    const heights = articles.map(article => article.getBoundingClientRect().height);
    articles.forEach((article, index) => {
      resize(article, heights[index]);
      observer.observe(article, { box: 'border-box' });
    });
    grid.dataset.measured = 'true';
    return () => observer.disconnect();
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
  const category = topic ?? noahPinTopic(name, summary ?? '');
  const attributes = { className: `${styles.face} ${pins.tone}`, 'data-shape': shape ?? noahPinShape(id), 'data-topic': category };
  const contents = <>
    <span className={pins.panel} aria-hidden="true">
      <NoahPinMotion id={id} name={name} summary={summary} cover={cover} diagram={diagram} video={video} />
    </span>
    <strong className={styles.name}>{name}</strong>
    {summary && !plain && <span className={styles.summary}>{summary}</span>}
  </>;
  if (href) return <Link {...attributes} href={href} prefetch={prefetch}>{contents}</Link>;
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
