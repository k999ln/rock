'use client';
import Link from 'next/link';
import { useNoahLocale } from './noah-locale';
import NoahWorkList from './noah-work-list';
import styles from './noah-unified.module.css';
export default function NoahWorkPage({
  results = false,
}: {
  results?: boolean;
}) {
  const { t } = useNoahLocale();
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <h1>{t(results ? '成果' : '実行中')}</h1>
      </header>
      <NoahWorkList
        ownerScope={null}
        refresh={0}
        only={results ? 'succeeded' : undefined}
        showEmpty
      />
      {results && (
        <details className={styles.meta}>
          <summary>{t('以前に保存した成果')}</summary>
          <Link href="/noah/data/saved">{t('保存した成果を開く')}</Link>
        </details>
      )}
    </main>
  );
}
