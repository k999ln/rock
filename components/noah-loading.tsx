'use client';
import { useNoahLocale } from './noah-locale';
import styles from './noah-loading.module.css';

/** Online loading stays small. The tiger is reserved for the offline boundary. */
export default function NoahLoading({ label = '読み込み中', compact = false, variant = 'default' }: { label?: string; compact?: boolean; variant?: 'default' | 'cards' | 'connection' | 'page' }) {
  const { t, locale } = useNoahLocale();
  const status = locale === 'ja' ? label : t('読み込み中');
  if (compact) return <output aria-live="polite" className={styles.compact}>{status}</output>;
  return <output aria-live="polite" className={variant === 'page' ? styles.page : styles.loading}>
    <span className={styles.spinner} aria-hidden="true" />
    <span>{status}</span>
  </output>;
}
