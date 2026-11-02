'use client';

import { useEffect, type ReactNode, type MouseEventHandler } from 'react';
import Link from 'next/link';
import OSHeader from './os-header';
import WorkspaceFlowNavigation from './workspace-flow-navigation';
import OsAccountAccess from './os-account-access';
import { ArrowUpRight, Cable, CircleHelp } from 'lucide-react';
import { monitorDevice } from '@/lib/device';
import { PRODUCT_RELEASE_NAME } from '@/lib/product-identity';
import skyStyles from '@/components/sky-surface.module.css';
import OsAppNavigation from './os-app-navigation';

export default function WorkspaceShell({
  children,
  title,
  contentClassName,
  onClickCapture,
  onConnect,
  running = false,
  hideTopActions = false,
  hideAccountAccess = false,
  hideFlowNavigation = false,
  standaloneSky = false,
  standaloneHomeHref = '/sky',
  tone,
}: {
  children: ReactNode;
  title: string;
  contentClassName?: string;
  onClickCapture?: MouseEventHandler<HTMLDivElement>;
  onConnect?: () => void;
  running?: boolean;
  hideTopActions?: boolean;
  hideAccountAccess?: boolean;
  hideFlowNavigation?: boolean;
  standaloneSky?: boolean;
  standaloneHomeHref?: string;
  tone?: 'sky';
}) {
  useEffect(() => {
    void navigator.serviceWorker?.register('/sw.js').catch(() => {});
    return monitorDevice();
  }, []);
  useEffect(() => {
    if (!running) return;
    const leaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', leaving);
    return () => window.removeEventListener('beforeunload', leaving);
  }, [running]);
  return (
    <div
      onClickCapture={(event) => {
        onClickCapture?.(event);
        const link = event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
        // Keep the shell's own landmark reachable during a job. All route
        // changes (including other fragments) still use the existing guard.
        if (running && link && link.getAttribute('href') !== '#workspace-main')
          event.preventDefault();
      }}
      data-os-frame
      className={`rock-workspace${tone === 'sky' ? ` ${skyStyles.sky}` : ''}`}
      data-os-bottom-navigation-host="workspace"
      data-running={running ? 'true' : 'false'}
      aria-busy={running}
    >
      <a className="rock-skip" href="#workspace-main">
        メインコンテンツへ
      </a>
      <div className="rock-main-column rock-main-column-full">
        {standaloneSky ? <header className={skyStyles.standaloneHeader}>
          <Link href={standaloneHomeHref} className={skyStyles.standaloneBrand} aria-label="Noah home">avocado <span>/ Noah</span></Link>
          <Link href="/sky/help" className={skyStyles.standaloneHelp}>使い方と対応環境 <ArrowUpRight size={14} /></Link>
        </header> : <OSHeader title={title} running={running}>
          {!hideTopActions && (
            <div className="rock-topbar-actions">
              {running && (
                <output className="rock-executing">
                  処理中 · 完了まで画面を開いてください
                </output>
              )}
              <span className="rock-web-label">WEB / PC</span>
              {onConnect ? (
                <button
                  className="rock-button rock-button-subtle"
                  disabled={running}
                  onClick={onConnect}
                >
                  <Cable size={17} />
                  PCを接続
                </button>
              ) : (
                <Link
                  className="rock-button rock-button-subtle"
                  href={tone === 'sky' ? '/sky/help' : '/rockstaros/guide'}
                  aria-label="使い方を見る"
                  aria-disabled={running || undefined}
                >
                  <CircleHelp size={17} /> 使い方を見る
                </Link>
              )}
            </div>
          )}
        </OSHeader>}
        {!standaloneSky && !hideFlowNavigation && <WorkspaceFlowNavigation running={running} />}
        {!standaloneSky && !hideAccountAccess && title === 'Eve' && <OsAccountAccess />}
        <main
          id="workspace-main"
          className={`rock-main ${contentClassName ?? ''}`}
          tabIndex={-1}
        >
          {children}
        </main>
        <div className="rock-bottom-note">
          <span>{tone === 'sky' ? 'Noah' : PRODUCT_RELEASE_NAME}</span>
          <Link
            href={
              tone === 'sky' ? '/sky/help#limits' : '/rockstaros/guide#limits'
            }
            aria-disabled={running || undefined}
          >
            対応環境と既知の制限 <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
      {standaloneSky && <OsAppNavigation running={running} />}
    </div>
  );
}
