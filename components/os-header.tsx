'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import OsAppNavigation from './os-app-navigation';
import { osRouteHref, type OsNavigationId } from '@/lib/os-navigation';

/** Shared application chrome. Running work keeps every navigation link inert. */
export default function OSHeader({
  title,
  children,
  running = false,
  hideNavigation = false,
  activeNavigation,
}: {
  title: string;
  children?: ReactNode;
  running?: boolean;
  hideNavigation?: boolean;
  activeNavigation?: OsNavigationId;
}) {
  useEffect(() => {
    // Load decoration only after React has hydrated the header. It never gates children.
    const script = window.document.createElement('script');
    script.src = '/brand/rainbow-boot.js';
    script.async = true;
    window.document.body.appendChild(script);
    return () => { script.remove(); };
  }, []);
  const pathname = usePathname();
  const homeHref = osRouteHref(pathname, '/os/eve', process.env.NODE_ENV === 'development');
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
            <Image src="/brand/rainbow-logo-96.png" alt="" width={30} height={30} unoptimized />
            <span className="os-brand-product">RockstarOS</span><span className="os-brand-context">{title}</span>
          </Link>
          <span className="os-current-app">{title}</span>
          <div className="os-header-actions">
            {children}
          </div>
        </div>
        {!hideNavigation && <OsAppNavigation active={activeNavigation} running={running} aria-label="RockstarOSの主要サービス" />}
        {running && (
          <output className="os-running">
            処理中 · 完了まで画面を開いてください
          </output>
        )}
      </div>
    </header>
  );
}
