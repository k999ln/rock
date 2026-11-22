import { Star, Heart, Repeat2 } from 'lucide-react';
import type { NoahAgentSource } from '@/lib/noah-agent-cards';
import { NOAH_COLLECTION_LABELS } from '@/lib/noah-collection';
import styles from './noah-pins.module.css';

/** Source counts retain their meaning and are never converted into Noah crowns. */
export default function NoahAgentSourceRatings({ sources }: { sources?: NoahAgentSource[] }) {
  if (!sources?.length) return null;
  return <div className={styles.sources} aria-label="評価元の評価">
    {sources.map(source => <a key={source.sourceUrl} href={source.sourceUrl} target="_blank" rel="noopener noreferrer"
      title={`${new Date(source.observedAt).toLocaleString('ja-JP')} 確認`}>
      <span className={styles.sourceName}>{NOAH_COLLECTION_LABELS[source.source]}</span>
      {source.metrics?.stars !== undefined && <span aria-label={`スター ${source.metrics.stars.toLocaleString('ja-JP')}`}><Star size={14} aria-hidden="true" />{source.metrics.stars.toLocaleString('ja-JP')}</span>}
      {source.metrics?.likes !== undefined && <span aria-label={`いいね ${source.metrics.likes.toLocaleString('ja-JP')}`}><Heart size={14} aria-hidden="true" />{source.metrics.likes.toLocaleString('ja-JP')}</span>}
      {source.metrics?.reposts !== undefined && <span aria-label={`リポスト ${source.metrics.reposts.toLocaleString('ja-JP')}`}><Repeat2 size={14} aria-hidden="true" />{source.metrics.reposts.toLocaleString('ja-JP')}</span>}
    </a>)}
  </div>;
}
