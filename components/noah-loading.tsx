import Image from 'next/image';
import styles from './noah-loading.module.css';

/** Only the company flower is visible; assistive technology still receives a status. */
export default function NoahLoading({ label = '読み込み中', compact = false }: { label?: string; compact?: boolean }) {
  return <output aria-live="polite" className={compact ? styles.compact : styles.loading}>
    <Image src="/company-mark.png" width={compact ? 24 : 48} height={compact ? 24 : 48} alt="" aria-hidden="true" unoptimized className={styles.flower} />
    <span className={styles.srOnly}>{label}</span>
  </output>;
}
