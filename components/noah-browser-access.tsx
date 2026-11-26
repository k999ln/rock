'use client';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { startNoahBrowser } from '@/lib/noah-browser-start';
import { useNoahLocale } from './noah-locale';
import NoahLoading from './noah-loading';
import { NoahTigerOffline } from './noah-tiger-game';
import styles from './noah-unified.module.css';
import { usePathname } from 'next/navigation';
import { NoahBrowserReady } from './noah-browser-ready';

function subscribeToConnection(update: () => void) {
  window.addEventListener('offline', update);
  window.addEventListener('online', update);
  return () => {
    window.removeEventListener('offline', update);
    window.removeEventListener('online', update);
  };
}

export default function NoahBrowserAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const account = pathname === '/noah/account';
  const publicDetail = pathname === '/noah/discover/agent' || pathname === '/noah/ready/agent';
  const { t } = useNoahLocale();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useState(0);
  const offline = useSyncExternalStore(
    subscribeToConnection,
    () => navigator.onLine === false,
    () => false,
  );

  useEffect(() => {
    void navigator.serviceWorker?.register('/noah-sw.js', { scope: '/noah', updateViaCache: 'none' }).catch(() => {});
  }, []);

  useEffect(() => {
    if (account || ready || offline || navigator.onLine === false) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { setFailed(true); controller.abort(); }, 15_000);
    void startNoahBrowser(fetch, controller.signal).then(() => {
      if (!controller.signal.aborted) setReady(true);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); }).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [account, attempt, offline, ready]);

  if (account) return children;
  if (ready || offline || publicDetail) {
    return <>
      <NoahBrowserReady.Provider value={ready}>
        {(ready || publicDetail) && <div style={{ display: offline ? 'none' : 'contents' }}>{children}</div>}
      </NoahBrowserReady.Provider>
      {publicDetail && failed && <div role="alert"><p>{t('保存先を開けませんでした。もう一度お試しください。')}</p><button type="button" onClick={() => { setFailed(false); retry(n => n + 1); }}>{t('再試行')}</button></div>}
      {offline && <NoahTigerOffline />}
    </>;
  }
  return <main className={styles.page}>
    {failed ? <div role="alert"><p>{t('保存先を開けませんでした。もう一度お試しください。')}</p>
      <button type="button" onClick={() => { setFailed(false); retry(n => n + 1); }}>{t('再試行')}</button>
    </div> : <NoahLoading label={t('保存先を準備しています…')} variant="page" />}
  </main>;
}
