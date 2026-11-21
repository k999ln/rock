'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useNoahLocale } from './noah-locale';
import NoahWorkList from './noah-work-list';
import styles from './noah-unified.module.css';
export default function NoahWorkPage({
  results = false, embedded = false, legacyResults,
}: {
  results?: boolean; embedded?:boolean; legacyResults?:ReactNode;
}) {
  const { t } = useNoahLocale();
  const Heading=embedded?'h2':'h1';
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <Heading>{t(results ? '成果' : '実行中')}</Heading>
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
          {legacyResults ?? <Link href="/noah/saved?tab=results">{t('保存した成果を開く')}</Link>}
        </details>
      )}
    </main>
  );
}
