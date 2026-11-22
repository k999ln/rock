'use client';
import { useNoahLocale } from './noah-locale';
import Image from 'next/image';
import styles from './noah-loading.module.css';

/** Only the company flower is visible; assistive technology still receives a status. */
export default function NoahLoading({ label = '読み込み中', compact = false, variant = 'default' }: { label?: string; compact?: boolean; variant?: 'default' | 'connection' }) {
  const {t,locale}=useNoahLocale();
  if (variant === 'connection') return <output aria-live="polite" className={styles.connection}>
    <Image src="/brand/noah-icon-transparent.svg" width={88} height={88} alt="" aria-hidden="true" unoptimized className={styles.connectionMark} />
    <span className={styles.srOnly}>{label}</span>
  </output>;
  return <output aria-live="polite" className={compact ? styles.compact : styles.loading}>
    <Image src="/company-mark.png" width={compact ? 24 : 48} height={compact ? 24 : 48} alt="" aria-hidden="true" unoptimized className={styles.flower} />
    <span className={styles.srOnly}>{locale==='ja'?label:t('読み込み中')}</span>
  </output>;
}
