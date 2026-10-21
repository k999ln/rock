'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import OsAppNavigation from './os-app-navigation';
import { osRouteHref } from '@/lib/os-navigation';

/** Shared application chrome. Running work keeps every navigation link inert. */
export default function OSHeader({
  title,
  children,
  running = false,
  hideNavigation = false,
}: {
  title: string;
  children?: ReactNode;
  running?: boolean;
  hideNavigation?: boolean;
}) {
  const pathname = usePathname();
  const homeHref = osRouteHref(pathname, '/', process.env.NODE_ENV === 'development');
  return (
    <header
      className="os-header"
      data-running={running || undefined}
      onClickCapture={(event) => {
        if (
          running &&
          event.target instanceof Element &&
          event.target.closest('a[href]')
        )
          event.preventDefault();
      }}
    >
      <div className="os-header-inner">
        <div className="os-header-row">
          <Link
            href={homeHref}
            className="os-brand"
            aria-label="RockstarOS ホーム"
            aria-disabled={running || undefined}
          >
            <Image src="/company-mark.png" alt="" width={30} height={30} unoptimized />
            <span className="os-brand-product">RockstarOS</span><span className="os-brand-context">{title}</span>
          </Link>
          <span className="os-current-app">{title}</span>
          <div className="os-header-actions">
            <Link href="/test" aria-disabled={running || undefined}>
              出力テスト
            </Link>
            {children}
          </div>
        </div>
        {!hideNavigation && <OsAppNavigation running={running} aria-label="RockstarOSの主要サービス" />}
        {running && (
          <output className="os-running">
            処理中 · 完了まで画面を開いてください
          </output>
        )}
      </div>
    </header>
  );
}
