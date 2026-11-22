'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { startNoahBrowser } from '@/lib/noah-browser-start';
import { useNoahLocale } from './noah-locale';
import NoahLoading from './noah-loading';
import styles from './noah-unified.module.css';

export default function NoahBrowserAccess({ children }: { children: ReactNode }) {
  const { t } = useNoahLocale();
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { setFailed(true); controller.abort(); }, 15_000);
    void startNoahBrowser(fetch, controller.signal).then(() => {
      if (!controller.signal.aborted) setReady(true);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); }).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [attempt]);
  if (ready) return children;
  return <main className={styles.page}>
    {failed ? <div role="alert"><p>{t('保存先を開けませんでした。もう一度お試しください。')}</p>
      <button type="button" onClick={() => { setFailed(false); retry(n => n + 1); }}>{t('再試行')}</button>
    </div> : <NoahLoading label={t('保存先を準備しています…')} variant="page" />}
  </main>;
}
