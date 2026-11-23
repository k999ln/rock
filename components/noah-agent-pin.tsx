'use client';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { NOAH_PIN_TOPIC_LABELS, noahPinInitials, noahPinShape, noahPinTopic, type NoahPinTopic } from '@/lib/noah-pins';
import { useNoahLocale } from './noah-locale';
import { NoahPinMotion } from './noah-art-motion';
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
  summary?: string; onSelect?: () => void; disabled?: boolean; pressed?: boolean;
};

export function NoahAgentPinFace({ id, name, href, prefetch, topic, shape, summary, onSelect, disabled, pressed }: PinFaceProps) {
  const { t } = useNoahLocale();
  const category = topic ?? noahPinTopic(name, summary ?? '');
  const attributes = { className: `${styles.face} ${pins.tone}`, 'data-shape': shape ?? noahPinShape(id), 'data-topic': category };
  const contents = <>
    <span className={pins.panel} aria-hidden="true">
      <NoahPinMotion topic={category} />
      <span className={pins.initials}>{noahPinInitials(name)}</span>
      <span className={pins.topicLabel}>{t(NOAH_PIN_TOPIC_LABELS[category])}</span>
    </span>
    <strong className={styles.name}>{name}</strong>
    {summary && <span className={styles.summary}>{summary}</span>}
  </>;
  if (href) return <Link {...attributes} href={href} prefetch={prefetch}>{contents}</Link>;
  if (onSelect) return <button {...attributes} type="button" onClick={onSelect} disabled={disabled} aria-pressed={pressed}>{contents}</button>;
  return <div {...attributes}>{contents}</div>;
}

export function NoahAgentPin({ meta, actions, ...face }: PinFaceProps & { meta?: ReactNode; actions?: ReactNode }) {
  const topic = face.topic ?? noahPinTopic(face.name, face.summary ?? '');
  const shape = face.shape ?? noahPinShape(face.id);
  return <li data-agent-pin-id={face.id} data-topic={topic} data-shape={shape}>
    <article className={styles.card} aria-label={face.name}>
      <NoahAgentPinFace {...face} topic={topic} shape={shape} />
      {meta && <div className={styles.meta}>{meta}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </article>
  </li>;
}
