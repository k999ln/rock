'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ArrowUpRight,
  Cable,
  Download,
  Settings2,
  CircleHelp,
  Grid2X2,
  Layers3,
  ListChecks,
  Monitor,
  Star,
  Wallet,
} from 'lucide-react';
import { monitorDevice } from '@/lib/device';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

const navigation = [
  { href: '/', label: 'Sky', Icon: Grid2X2 },
  { href: '/work', label: '仕事・履歴', Icon: ListChecks },
  { href: '/wallet', label: 'Wallet', Icon: Wallet },
  { href: '/polymarket', label: 'Polymarket', Icon: Activity },
];

export default function WorkspaceShell({
  children,
  title,
  contentClassName,
  onConnect,
  running = false,
  showSidebar = true,
}: {
  children: ReactNode;
  title: string;
  contentClassName?: string;
  onConnect?: () => void;
  running?: boolean;
  showSidebar?: boolean;
}) {
  const pathname = usePathname();
  const [installHelp, setInstallHelp] = useState(false);
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
    <SidebarProvider
      onClickCapture={(event) => {
        if (
          running &&
          event.target instanceof Element &&
          event.target.closest('a[href]')
        )
          event.preventDefault();
      }}
      className="rock-workspace"
      style={{ '--sidebar-width': '15.5rem' } as CSSProperties}
    >
      <a className="rock-skip" href="#workspace-main">
        メインコンテンツへ
      </a>
      {showSidebar && (
        <Sidebar className="rock-sidebar">
          <SidebarHeader className="rock-sidebar-header">
            <Link href="/" className="rock-logo">
              <span className="rock-mark">
                <Star size={22} fill="currentColor" strokeWidth={1.5} />
              </span>
              <span>
                Rockstar<span className="rock-logo-os">OS</span>
              </span>
            </Link>
            <span className="rock-version">
              1.0 <span>DEVELOPER PREVIEW</span>
            </span>
          </SidebarHeader>
          <SidebarContent className="rock-sidebar-content">
            <p className="rock-nav-label">ワークスペース</p>
            <nav aria-label="メインナビゲーション" className="rock-navigation">
              {navigation.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={
                    pathname === href ||
                    (href === '/work' && pathname === '/activity')
                      ? 'page'
                      : undefined
                  }
                >
                  <Icon size={19} strokeWidth={1.7} />
                  {label}
                </Link>
              ))}
            </nav>
            <nav aria-label="接続設定" className="rock-navigation">
              <Link
                href="/settings"
                aria-current={pathname === '/settings' ? 'page' : undefined}
              >
                <Settings2 size={19} strokeWidth={1.7} />
                接続・利用設定
              </Link>
            </nav>
            <div className="rock-nav-divider" />
            <p className="rock-nav-label">ROCKSTAROS 1.0</p>
            <nav aria-label="OSの導入とサポート" className="rock-navigation">
              <Link href="/rockstaros">
                <Monitor size={19} strokeWidth={1.7} />
                OSを知る
                <ArrowUpRight size={14} className="rock-nav-arrow" />
              </Link>
              <Link href="/rockstaros/guide">
                <CircleHelp size={19} strokeWidth={1.7} />
                導入・使い方
              </Link>
            </nav>
          </SidebarContent>
          <SidebarFooter className="rock-sidebar-footer">
            <button
              className="rock-install"
              onClick={() => setInstallHelp(!installHelp)}
              aria-expanded={installHelp}
            >
              <Download size={16} />
              アプリとして追加
            </button>
            {installHelp && (
              <p className="rock-install-help">
                Chromeはアドレスバーのインストール、iPhoneはSafariの共有から「ホーム画面に追加」を選びます。これはWeb版です。OSの導入とは別です。
              </p>
            )}
            <div className="rock-preview-note">
              <span>現在は開発プレビュー</span>
              <p>
                実際の請求・送金は
                <br />
                開始していません。
              </p>
            </div>
            <Link href="/fund" className="rock-legacy-link">
              <Layers3 size={16} />
              保存済みのファンド・試算
              <ArrowUpRight size={13} />
            </Link>
          </SidebarFooter>
        </Sidebar>
      )}
      <div
        className={`rock-main-column ${showSidebar ? '' : 'rock-main-column-full'}`}
      >
        <header className="rock-topbar">
          {showSidebar && (
            <SidebarTrigger
              className="rock-menu-trigger"
              aria-label="メニューを開閉"
            />
          )}
          <div className="rock-breadcrumb">
            {showSidebar && (
              <>
                ワークスペース <span>/</span>
              </>
            )}
            <strong>{title}</strong>
            {!showSidebar && <em>DEVELOPER PREVIEW</em>}
          </div>
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
                href="/rockstaros/guide"
              >
                使い方を見る
              </Link>
            )}
          </div>
        </header>
        <main
          id="workspace-main"
          className={`rock-main ${contentClassName ?? ''}`}
          tabIndex={-1}
        >
          {children}
        </main>
        <div className="rock-bottom-note">
          <span>RockstarOS 1.0</span>
          <Link href="/rockstaros/guide#limits">
            対応環境と既知の制限 <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
    </SidebarProvider>
  );
}
