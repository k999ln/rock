'use client';

import Link from 'next/link';
import {
  noahMyHref,
  noahMySelection,
  type NoahMyView,
} from '@/lib/noah-my-routes';
import type { NoahPageParams } from '@/lib/noah-page-routes';
import { useNoahLocale } from './noah-locale';
import NoahLibrary from './noah-library';
import NoahWorkPage from './noah-work-page';
import NoahSaved from './noah-saved';
import styles from './noah-my.module.css';

const views: readonly [NoahMyView, string][] = [
  ['agents', '自分のAgent'],
  ['activity', '実行中'],
  ['saved', '保存したもの'],
];

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
    <div className={styles.hub}>
      <h1>{t('マイAgent')}</h1>
      <nav className={styles.segments} aria-label={t('マイAgent')}>
        {views.map(([key, label]) => (
          <Link
            key={key}
            href={noahMyHref(key, saved, params)}
            aria-current={key === view ? 'page' : undefined}
          >
            {t(label)}
          </Link>
        ))}
      </nav>
      {view === 'agents' ? (
        <NoahLibrary embedded />
      ) : view === 'activity' ? (
        <NoahWorkPage embedded />
      ) : (
        <NoahSaved params={{ ...params, tab: saved }} />
      )}
    </div>
  );
}
