'use client';

import Link from 'next/link';
import {
  noahMyHref,
  noahMySelection,
  noahMyTitles,
} from '@/lib/noah-my-routes';
import type { NoahPageParams } from '@/lib/noah-page-routes';
import { useNoahLocale } from './noah-locale';
import NoahLibrary from './noah-library';
import NoahWorkPage from './noah-work-page';
import NoahSaved from './noah-saved';
import NoahTheater from './noah-theater';
import styles from './noah-my.module.css';

const utilityViews = ['agents', 'activity', 'saved'] as const;

export default function NoahMy({
  params,
  legacy,
}: {
  params: NoahPageParams;
  legacy?: 'activity' | 'saved';
}) {
  const { t } = useNoahLocale();
  const { view, saved } = noahMySelection(params, legacy);
  return (
    <div className={styles.hub} data-theater={view === 'theater' || undefined}>
      <header className={styles.hubHeader}>
        <h1>{t(noahMyTitles[view])}</h1>
        <nav className={styles.segments} aria-label={t('Agentと仕事')}>
          {utilityViews.map(key => (
            <Link
              key={key}
              href={noahMyHref(key, saved, params)}
              aria-current={key === view ? 'page' : undefined}
            >
              {t(noahMyTitles[key])}
            </Link>
          ))}
        </nav>
      </header>
      {view === 'theater' ? (
        <NoahTheater />
      ) : view === 'agents' ? (
        <NoahLibrary embedded />
      ) : view === 'activity' ? (
        <NoahWorkPage embedded />
      ) : (
        <NoahSaved params={{ ...params, tab: saved }} />
      )}
    </div>
  );
}
