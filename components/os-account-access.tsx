'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites auth endpoints require top-level gateway navigation. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { osRouteHref } from '@/lib/os-navigation';
import styles from './os-account-access.module.css';

export default function OsAccountAccess() {
  const pathname = usePathname();
  const [state, setState] = useState<'loading' | 'guest' | 'member' | 'error'>(
    'loading',
  );
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const read = async () => {
      try {
        const response = await fetch('/api/os/account', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const value = (await response.json()) as { signedIn?: boolean };
        if (controller.signal.aborted) return;
        setState(
          response.ok && value.signedIn === true
            ? 'member'
            : response.status === 401
              ? 'guest'
              : 'error',
        );
      } catch {
        if (!controller.signal.aborted) setState('error');
      }
    };
    void read();
    const refresh = () => {
      void read();
    };
    window.addEventListener('focus', refresh);
    return () => {
      controller.abort();
      window.removeEventListener('focus', refresh);
    };
  }, [retry]);
  const route = (href: string) =>
    osRouteHref(pathname, href, process.env.NODE_ENV === 'development');
  const returnTo = pathname === '/os/eve' ? '/os/eve' : '/';
  return (
    <section
      className={styles.bar}
      aria-label="RockstarOS アカウント"
      data-os-account={state}
    >
      <div>
        <strong>
          {state === 'member'
            ? 'あなたのRockstarOS'
            : '自分のSI環境を、どこからでも。'}
        </strong>
        <span>
          {state === 'member'
            ? 'アカウントに接続済み'
            : state === 'error'
              ? '接続状態を確認できません'
              : '会話・仕事・成果を、同じアカウントで。'}
        </span>
      </div>
      {state === 'member' ? (
        <div className={styles.actions}>
          <Link className={styles.primary} href={route('/chat')}>
            Eveを開く
          </Link>
          <details>
            <summary aria-label="アカウントメニュー">•••</summary>
            <nav>
              <Link href="/connect">端末をつなぐ</Link>
              <Link href="/account">アカウント・パスキー・ログアウト</Link>
            </nav>
          </details>
        </div>
      ) : state === 'error' ? (
        <button onClick={() => setRetry((value) => value + 1)}>再確認</button>
      ) : state === 'guest' ? (
        <Link
          className={styles.primary}
          href={'/account?returnTo=' + encodeURIComponent(returnTo)}
        >
          登録・ログイン
        </Link>
      ) : (
        <output className={styles.loading}>確認中…</output>
      )}
    </section>
  );
}
