'use client';
/* oxlint-disable react/react-compiler -- Synchronize owner-scoped asynchronous API state and clear it when the owner changes. */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  noahRemoteFetch,
  NoahRemoteClientError,
} from '@/lib/noah-remote-client';
import NoahWorkList from './noah-work-list';
import styles from './noah-ready.module.css';

export default function NoahRemoteHub({
  fallback,
  results = false,
}: {
  fallback: ReactNode;
  results?: boolean;
}) {
  const params=useSearchParams();
  const [macOpen,setMacOpen]=useState(false);
  const [state, setState] = useState<{
      enabled: boolean;
      scope: string | null;
    } | null>(null),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void noahRemoteFetch<{ ownerScope: string | null }>(
      '/api/noah/intake?limit=0',
      { signal: controller.signal },
    )
      .then((data) => setState({ enabled: true, scope: data.ownerScope }))
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (e instanceof NoahRemoteClientError && e.status === 404)
          setState({ enabled: false, scope: null });
        else setError(e.message);
      });
    return () => controller.abort();
  }, [reload]);
  if (state?.enabled === false || params.has('agent')) return fallback;
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span className={styles.eyebrow}>NOAH</span>
        <h1>{results ? '届いた成果' : '実行中のAgent'}</h1>
      </header>
      {error && (
        <div role="alert" className={styles.notice}>
          {error}
          <button onClick={() => setReload((n) => n + 1)}>再読み込み</button>
        </div>
      )}
      {!state && !error && <output>読み込んでいます…</output>}
      {state?.enabled && (
        <>
          <Link href="/noah/ready" className={styles.primary}>
            Agentを探す
          </Link>
          {state.scope ? (
            <NoahWorkList
              key={state.scope}
              ownerScope={state.scope}
              refresh={reload}
            />
          ) : (
            <p className={styles.notice}>
              保存した仕事を開くには、
              <Link
                href={
                  '/account?returnTo=' +
                  encodeURIComponent(results ? '/noah/data' : '/noah/activity')
                }
              >
                サインイン
              </Link>
              してください。
            </p>
          )}
          <details className={styles.footer} onToggle={e=>setMacOpen(e.currentTarget.open)}>
            <summary>Macで動かした仕事</summary>
            {macOpen&&fallback}
          </details>
        </>
      )}
    </main>
  );
}
