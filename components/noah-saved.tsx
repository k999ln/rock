'use client';

import Link from 'next/link';
import { useNoahLocale } from './noah-locale';
import { NoahBoardsPage, NoahBoardPage } from './noah-boards';
import SkyAgentLibrary from './sky-agent-library';
import NoahResultData from './noah-result-data';
import NoahWorkPage from './noah-work-page';
import SkyOutputCenter from './sky-output-center';
import {
  noahMyHref,
  savedViews,
  type NoahMySavedView,
} from '@/lib/noah-my-routes';
import { noahPageTab, type NoahPageParams } from '@/lib/noah-page-routes';
import styles from './noah-my.module.css';

const labels: Record<NoahMySavedView, string> = {
  results: '成果',
  boards: 'ボード',
  roles: '担当',
  files: 'ファイル',
};
export default function NoahSaved({ params }: { params: NoahPageParams }) {
  const { t } = useNoahLocale();
  const tab = noahPageTab(params.tab, savedViews, 'results');
  const board =
    typeof params.board === 'string' ? params.board.slice(0, 160) : '';
  const job =
    typeof params.job === 'string' ? params.job.slice(0, 160) : undefined;
  return (
    <section aria-label={t('保存したもの')}>
      <nav className={styles.filters} aria-label={t('保存したもの')}>
        {savedViews.map((key) => (
          <Link
            key={key}
            href={noahMyHref('saved', key, params)}
            aria-current={tab === key ? 'page' : undefined}
          >
            {t(labels[key])}
          </Link>
        ))}
      </nav>
      {tab === 'boards' ? (
        board ? (
          <NoahBoardPage key={board} id={board} />
        ) : (
          <NoahBoardsPage embedded />
        )
      ) : tab === 'roles' ? (
        <SkyAgentLibrary embedded pinView />
      ) : tab === 'files' ? (
        <SkyOutputCenter key={job} initialWorkJobId={job} embedded />
      ) : (
        <>
          <div className={styles.libraryActions}>
            <Link href="/noah/my/cloud-results">{t('専用クラウドの成果と利用明細')}</Link>
          </div>
          <NoahWorkPage
            results
            embedded
            legacyResults={<NoahResultData embedded />}
          />
        </>
      )}
    </section>
  );
}
