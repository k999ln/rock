'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useNoahLocale } from './noah-locale';
import NoahLoading from './noah-loading';
import RockstarAccount from './rockstar-account';
import { noahReturnPath } from '@/lib/noah-navigation';
import styles from './rockstar-account.module.css';

export default function NoahAccess() {
  const { t } = useNoahLocale();
  const query = useSearchParams();
  const returnTo = noahReturnPath(query.get('returnTo'));
  const legacy = query.get('method') === 'existing';
  const [state, setState] = useState<'checking' | 'missing' | 'setup' | 'error'>('checking');
  const [revision, retry] = useState(0);
  useEffect(() => {
    if (legacy) return;
    const controller = new AbortController();
    let checking = false;
    let timeout: number | undefined;
    const check = async () => {
      if (checking || controller.signal.aborted) return;
      checking = true;
      setState('checking');
      timeout = window.setTimeout(() => { setState('error'); controller.abort(); }, 15_000);
      try {
        const response = await fetch('/api/noah/session', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        const result = await response.json() as { connected?: boolean; esimConfigured?: boolean };
        if (controller.signal.aborted) return;
        if (response.ok && result.connected === true) { window.location.replace(returnTo); return; }
        setState(response.status === 401 ? result.esimConfigured ? 'missing' : 'setup' : 'error');
      } catch { if (!controller.signal.aborted) setState('error'); }
      finally { checking = false; window.clearTimeout(timeout); }
    };
    void check();
    const resume = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', resume);
    return () => { controller.abort(); window.clearTimeout(timeout); document.removeEventListener('visibilitychange', resume); };
  }, [legacy, returnTo, revision]);
  if (legacy) return <RockstarAccount service="noah" />;
  const previous = `/noah/account?${new URLSearchParams({ method: 'existing', mode: 'login', returnTo })}`;
  return <main className={styles.page}>
    <header className={styles.top}><Link href="/noah">Noah</Link><Link href={returnTo}>{t('戻る')}</Link></header>
    <section className={styles.card}>
      <h1>{t('接続して、そのまま使う')}</h1>
      <p className={styles.description}>{t('eSIMの本人確認を引き継ぎます。Noah用の新規登録は不要です。')}</p>
      {state === 'checking' ? <NoahLoading label={t('接続を確認しています…')} /> : <>
        <p className={styles.hint} role={state === 'error' ? 'alert' : 'status'}>{t(state === 'setup' ? 'eSIM連携は準備中です。' : state === 'missing' ? 'このブラウザに接続情報が届いていません。' : '接続を確認できませんでした。')}</p>
        <button className={styles.primary} onClick={() => retry(n => n + 1)}>{t('接続を再確認')}</button>
        <p><Link href="/noah/explore">{t('Agentを見てみる')}</Link></p>
      </>}
      <details className={styles.credentials}><summary>{t('以前のログインを使う')}</summary><p><Link href={previous}>{t('保存済みの成果を引き継ぐ')}</Link></p></details>
    </section>
  </main>;
}
