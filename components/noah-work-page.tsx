'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useNoahLocale } from './noah-locale';
import NoahWorkList from './noah-work-list';
import styles from './noah-unified.module.css';
export default function NoahWorkPage({
  results = false,
  embedded = false,
  legacyResults,
}: {
  results?: boolean;
  embedded?: boolean;
  legacyResults?: ReactNode;
}) {
  const { t } = useNoahLocale();
  const Container = embedded ? 'section' : 'main';
  return (
    <Container
      className={styles.page}
      aria-label={embedded ? t(results ? '成果' : '実行中') : undefined}
    >
      {!embedded && (
        <header className={styles.heading}>
          <h1>{t(results ? '成果' : '実行中')}</h1>
        </header>
      )}
      <NoahWorkList
        ownerScope={null}
        refresh={0}
        only={results ? 'succeeded' : undefined}
        showEmpty
      />
      {results && (
        <details className={styles.meta}>
          <summary>{t('以前に保存した成果')}</summary>
          {legacyResults ?? (
            <Link href="/noah/saved?tab=results">
              {t('保存した成果を開く')}
            </Link>
          )}
        </details>
      )}
    </Container>
  );
}
