'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Automation } from '@/lib/catalog';
import type { SkyToolUiState } from '@/lib/sky-tool-ui';
import { ToolIcon } from '@/components/tool-icon';
import styles from './sky-tool-card.module.css';

export default function SkyToolCard({
  tool, state, expanded = false, onInspect, actionLabel, onAction, href, hostMismatch,
}: {
  tool: Automation;
  state: SkyToolUiState;
  expanded?: boolean;
  onInspect: () => void;
  actionLabel: string;
  onAction?: () => void;
  href?: string;
  hostMismatch?: string | null;
}) {
  return (
    <article className={styles.card} data-sky-tool-card={tool.id}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.icon}
          aria-label={`${tool.name}の機能と利用方法を見る`}
          aria-haspopup="dialog"
          aria-expanded={expanded}
          onClick={onInspect}
        >
          <ToolIcon id={tool.id} size={25} />
        </button>
        <div className={styles.identity}>
          <span className={styles.category}>{tool.category}</span>
          <h3>{tool.name}</h3>
        </div>
      </header>
      <span className={styles.status} data-state={state.className}>
        <i aria-hidden="true" />{state.label}
      </span>
      <p className={styles.description}>{tool.description}</p>
      {hostMismatch ? <p className={styles.mismatch}>{hostMismatch}</p> : null}
      <footer className={styles.footer}>
        <button type="button" className={styles.details} onClick={onInspect} aria-expanded={expanded} aria-haspopup="dialog">
          機能・利用条件
        </button>
        {href ? (
          <Link className={styles.action} href={href}>{actionLabel}<ArrowRight size={15} /></Link>
        ) : (
          <button type="button" className={styles.action} onClick={onAction}>{actionLabel}<ArrowRight size={15} /></button>
        )}
      </footer>
    </article>
  );
}
