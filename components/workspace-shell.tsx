'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import OSHeader from './os-header';
import { ArrowUpRight, Cable, CircleHelp } from 'lucide-react';
import { monitorDevice } from '@/lib/device';
import { PRODUCT_RELEASE_NAME } from '@/lib/product-identity';
import skyStyles from '@/components/sky-surface.module.css';

export default function WorkspaceShell({
  children,
  title,
  contentClassName,
  onConnect,
  running = false,
  hideTopActions = false,
  standaloneSky = false,
  standaloneHomeHref = '/sky',
  tone,
}: {
  children: ReactNode;
  title: string;
  contentClassName?: string;
  onConnect?: () => void;
  running?: boolean;
  hideTopActions?: boolean;
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
        if (
          running &&
          event.target instanceof Element &&
          event.target.closest('a[href]')
        )
          event.preventDefault();
      }}
      className={`rock-workspace${tone === 'sky' ? ` ${skyStyles.sky}` : ''}`}
      data-running={running ? 'true' : 'false'}
      aria-busy={running}
    >
      <a className="rock-skip" href="#workspace-main">
        メインコンテンツへ
      </a>
      <div className="rock-main-column rock-main-column-full">
        {standaloneSky ? <header className={skyStyles.standaloneHeader}>
          <Link href={standaloneHomeHref} className={skyStyles.standaloneBrand} aria-label="Sky home">avocado <span>/ Sky</span></Link>
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
        <main
          id="workspace-main"
          className={`rock-main ${contentClassName ?? ''}`}
          tabIndex={-1}
        >
          {children}
        </main>
        <div className="rock-bottom-note">
          <span>{tone === 'sky' ? 'Sky' : PRODUCT_RELEASE_NAME}</span>
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
    </div>
  );
}
