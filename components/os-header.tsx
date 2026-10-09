'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Asterisk,
  House,
  Cloud,
  MessageCircle,
  WalletCards,
  ChartNoAxesCombined,
  Settings2,
} from 'lucide-react';

const apps = [
  { href: '/', label: 'ホーム', Icon: House },
  { href: '/sky', label: 'Sky', Icon: Cloud },
  { href: '/chat', label: 'Zema', Icon: MessageCircle },
  { href: '/wallet', label: 'Wallet', Icon: WalletCards },
  { href: '/market', label: 'Market', Icon: ChartNoAxesCombined },
  { href: '/settings', label: '設定', Icon: Settings2 },
];

/** Shared application chrome. Running work keeps every navigation link inert. */
export default function OSHeader({
  title,
  children,
  running = false,
}: {
  title: string;
  children?: ReactNode;
  running?: boolean;
}) {
  const pathname = usePathname();
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
            href="/"
            className="os-brand"
            aria-label="RockstarOS ホーム"
            aria-disabled={running || undefined}
          >
            <Asterisk size={23} strokeWidth={1.7} />
            <span>RockstarOS</span>
          </Link>
          <span className="os-current-app">{title}</span>
          <div className="os-header-actions">
            <Link href="/test" aria-disabled={running || undefined}>
              出力テスト
            </Link>
            {children}
          </div>
        </div>
        <nav
          className="os-app-navigation"
          aria-label="RockstarOSの主要サービス"
        >
          {apps.map(({ href, label, Icon }) => {
            const active =
              href === '/'
                ? pathname === '/'
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={href === '/' ? 'ホームへ戻る' : undefined}
                aria-disabled={running || undefined}
              >
                <Icon size={17} strokeWidth={1.7} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        {running && (
          <output className="os-running">
            処理中 · 完了まで画面を開いてください
          </output>
        )}
      </div>
    </header>
  );
}
