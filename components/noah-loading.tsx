'use client';
import { useNoahLocale } from './noah-locale';
import Image from 'next/image';
import styles from './noah-loading.module.css';

/** Decorative placeholders stay silent; one status announces the pending request. */
export default function NoahLoading({ label = '読み込み中', compact = false, variant = 'default' }: { label?: string; compact?: boolean; variant?: 'default' | 'cards' }) {
  const {t,locale}=useNoahLocale();
  const cards = !compact && variant === 'cards';
  return <output aria-live="polite" className={cards ? styles.cards : compact ? styles.compact : styles.loading}>
    <span className={styles.srOnly}>{locale==='ja'?label:t('読み込み中')}</span>
    {cards ? <span className={styles.grid} aria-hidden="true">{Array.from({length:6},(_,i)=><span key={i} className={styles.card}>
      <span className={styles.panel}/><span className={styles.title}/><span className={styles.line}/><span className={styles.shortLine}/>
    </span>)}</span> : <span className={styles.brand} aria-hidden="true">
      <Image src="/company-mark.png" width={compact ? 20 : 28} height={compact ? 20 : 28} alt="" unoptimized className={styles.mark} />
      {!compact && <span className={styles.track}><span/></span>}
    </span>}
  </output>;
}
