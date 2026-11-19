'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { webBrandIcon } from '@/lib/web-brand';
import styles from './product-app-header.module.css';

/** App switching stays identical in Noah and Eve; community belongs inside Noah. */
export default function ProductAppHeader({
  active, noahHref = '/noah#timeline', environment = 'Web', running = false,
  hideNavigation = false, children,
}: {
  active: 'noah' | 'eve';
  noahHref?: string;
  environment?: 'Mac' | 'Web';
  running?: boolean;
  hideNavigation?: boolean;
  children?: ReactNode;
}) {
  return <header className={styles.header} data-product-app={active} data-running={running || undefined}
    onClickCapture={event => {
      if (running && event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault();
    }}>
    <div className={styles.bar}>
      <Link href={noahHref} className={styles.brand} aria-label="RockstarOS ホーム" aria-disabled={running || undefined}>
        <Image src={webBrandIcon} alt="" width={32} height={32} unoptimized /><strong>RockstarOS</strong>
      </Link>
      {!hideNavigation && <nav aria-label="OSのアプリ">
        <Link href={noahHref} aria-current={active === 'noah' ? 'page' : undefined} aria-disabled={running || undefined}>Noah</Link>
        <Link href="/chat" aria-current={active === 'eve' ? 'page' : undefined} aria-disabled={running || undefined}
          onClick={event => { if (active === 'eve') event.preventDefault(); }}>Eve</Link>
      </nav>}
      <span className={styles.environment}>{environment}</span>
    </div>
    {children && <div className={styles.actions}>{children}</div>}
    {running && <output className={styles.running}>処理中 · 完了まで画面を開いてください</output>}
  </header>;
}
