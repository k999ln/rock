import Link from 'next/link';
import { Star, Heart, Repeat2 } from 'lucide-react';
import type { NoahAgentSource } from '@/lib/noah-agent-cards';
import { NOAH_COLLECTION_LABELS, NOAH_COLLECTION_METRIC_LABELS } from '@/lib/noah-collection';
import styles from './noah-pins.module.css';

/** Source counts retain their meaning and are never converted into Noah crowns. */
export default function NoahAgentSourceRatings({ sources, detailHref }: { sources?: NoahAgentSource[]; detailHref?: string }) {
  if (!sources?.length) return null;
  return <div className={styles.sources} aria-label="評価元の評価">
    {sources.map(source => { const content = <>
      <span className={styles.sourceName}>{NOAH_COLLECTION_LABELS[source.source]}</span>
      {Object.entries(source.metrics ?? {}).map(([metric,count])=>count === undefined ? null : <span key={metric} aria-label={`${NOAH_COLLECTION_METRIC_LABELS[metric] ?? metric} ${count.toLocaleString('ja-JP')}`}>
        {metric==='stars'?<Star size={14} aria-hidden="true"/>:metric==='likes'?<Heart size={14} aria-hidden="true"/>:metric==='reposts'?<Repeat2 size={14} aria-hidden="true"/>:<span aria-hidden="true">{NOAH_COLLECTION_METRIC_LABELS[metric] ?? metric}</span>}{count.toLocaleString('ja-JP')}
      </span>)}
    </>; const title = `${new Date(source.observedAt).toLocaleString('ja-JP')} 確認`;
      return detailHref ? <Link key={source.sourceUrl} href={detailHref} title={title}>{content}</Link> : <span key={source.sourceUrl} className={styles.sourceBadge} title={title}>{content}</span>;
    })}
  </div>;
}
