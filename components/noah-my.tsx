'use client';

import {
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
