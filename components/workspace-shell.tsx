'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Cable } from 'lucide-react';
import { monitorDevice } from '@/lib/device';
import OSHeader from './os-header';

export default function WorkspaceShell({
  children,
  title,
  contentClassName,
  onConnect,
  running = false,
  hideTopActions = false,
}: {
  children: ReactNode;
  title: string;
  contentClassName?: string;
  onConnect?: () => void;
  running?: boolean;
  showSidebar?: boolean;
  hideTopActions?: boolean;
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
      className="rock-workspace"
      data-running={running ? 'true' : 'false'}
      aria-busy={running}
      onClickCapture={(event) => {
        if (
          running &&
          event.target instanceof Element &&
          event.target.closest('a[href]')
        )
          event.preventDefault();
      }}
    >
      <a className="rock-skip" href="#workspace-main">
        メインコンテンツへ
      </a>
      <div className="rock-main-column rock-main-column-full">
        <OSHeader title={title} running={running}>
          {!hideTopActions &&
            (onConnect ? (
              <button
                className="rock-button rock-button-subtle"
                disabled={running}
                onClick={onConnect}
              >
                <Cable size={17} /> PCを接続
              </button>
            ) : (
              <Link
                className="rock-button rock-button-subtle"
                href="/rockstaros/guide"
                aria-disabled={running || undefined}
              >
                使い方を見る
              </Link>
            ))}
        </OSHeader>
        <main
          id="workspace-main"
          className={`rock-main ${contentClassName ?? ''}`}
          tabIndex={-1}
        >
          {children}
        </main>
        <div className="rock-bottom-note">
          <span>RockstarOS 1.0</span>
          <Link
            href="/rockstaros/guide#limits"
            aria-disabled={running || undefined}
          >
            対応環境と既知の制限 <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
