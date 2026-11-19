'use client';
import { skyToolDescription, skyToolEnvironment } from '@/lib/sky-tool-ui';

import { useRef, type ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { skySystemWords } from '@/lib/sky-presentation';
import type { Automation } from '@/lib/catalog';
import type { SkyToolUiState } from '@/lib/sky-tool-ui';
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ToolIcon } from '@/components/tool-icon';
import styles from '@/components/sky-tool-overview.module.css';

export default function SkyToolOverview({
  tool,
  state,
  hostMismatch,
  children,
  className = '',
  wide = false,
  initialFocus,
}: {
  tool: Automation;
  state: SkyToolUiState;
  hostMismatch?: string | null;
  children?: ReactNode;
  className?: string;
  wide?: boolean;
  initialFocus?: boolean;
}) {
  const headingRef = useRef<HTMLDivElement>(null);
  return (
    <DialogContent
      initialFocus={initialFocus === false ? false : headingRef}
      className={`${styles.dialog} ${wide ? styles.wide : ''} ${className}`}
    >
      <div ref={headingRef} tabIndex={-1} className={styles.heading}>
        <span className={`${styles.icon} rock-icon-${tool.color}`} aria-hidden="true">
          <ToolIcon id={tool.id} size={28} />
        </span>
        <div>
          <span className={styles.category}>{tool.category}</span>
          <DialogTitle className={styles.title}>{tool.name}</DialogTitle>
        </div>
      </div>
      <DialogDescription className={styles.description}>{skyToolDescription(tool)}</DialogDescription>
      <dl className={styles.facts}>
        <div><dt>現在の状態</dt><dd>{state.label}</dd></div>
        <div><dt>利用環境</dt><dd>{skyToolEnvironment(tool)}</dd></div>
        <div><dt>料金・実費</dt><dd>{skySystemWords(tool.cost)}</dd></div>
      </dl>
      {hostMismatch && <p className={styles.mismatch}>この端末では対象外 · {hostMismatch}</p>}
      <details><summary>詳しい動作環境と元の説明</summary><p>{tool.environment}</p><p>{tool.description}</p></details>
      {children}
      {/^https?:\/\//.test(tool.source) ? (
        <a className={styles.source} href={tool.source} target="_blank" rel="noopener noreferrer">
          提供元の情報 <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      ) : (
        <span className={styles.source}>提供元：{tool.source}</span>
      )}
    </DialogContent>
  );
}
