'use client';
/* oxlint-disable next/no-html-link-for-pages -- Hash destinations work in the local OS as well. */
import { useEffect, useState, useId, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Activity, Bot, Home, PenLine, Compass, FolderOpen, UserRound, Search, Menu, ChevronUp, ChevronRight, X, LayoutGrid } from 'lucide-react';
import { noahLegacyHref, type NoahSurfaceMode } from '@/lib/noah-surface';
import styles from './noah-service-shell.module.css';
import { NoahSurfaceContext } from './noah-surface-context';

export default function NoahShell({ children, mode = 'local' }: { children: ReactNode; mode?: NoahSurfaceMode }) {
  const pathname = usePathname();
  const preview = pathname.startsWith('/noah/public');
  const effectiveMode = preview ? 'public' : mode, base = preview ? '/noah/public' : '/noah';
  const [hash, setHash] = useState('');
  const menuId = useId(), menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const currentHash = window.location.hash;
      const legacy = noahLegacyHref(currentHash, effectiveMode, base);
      const post = new URLSearchParams(window.location.search).get('post');
      if (!pathname.endsWith('/social') && (currentHash.startsWith('#community=') || (post && /^[a-f0-9-]{36}$/i.test(post)))) {
        window.location.replace(`${base}/social${post ? `?post=${encodeURIComponent(post)}` : ''}${currentHash}`);
      } else if (legacy) { const target = new URL(legacy, window.location.origin); target.search = window.location.search; window.location.replace(target.href); }
      else setHash(currentHash);
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, [pathname, effectiveMode, base]);
  const home = base, onHome = pathname === base || pathname === '/' || pathname === '/os';
  // 2026-11-22 の本人の決定（docs/structure/07）: ピンタレスト風。上の帯に検索とメニュー、下は全面のグリッド。スマホは下にメニュー。
  const primary = [
    { href: home, label: 'ホーム', description: 'Agent を眺めて、保存する', Icon: Home, selected: onHome },
    { href: `${base}/boards`, label: 'ボード', description: '保存した Agent と、フォロー中のボード', Icon: LayoutGrid, selected: pathname.includes('/boards') },
    { href: `${base}/explore`, label: 'Agentを探す', description: '頼みたい仕事に合うAgentを見つける', Icon: Compass, selected: pathname.endsWith('/explore') },
    { href: `${base}/activity`, label: '実行中', description: 'Agentの動きと届いた成果を見る', Icon: Activity, selected: pathname.endsWith('/activity') },
    { href: `${base}/data`, label: '成果データ', description: '受け取った結果を確認・保存する', Icon: FolderOpen, selected: pathname.endsWith('/data') || pathname.endsWith('/outputs') },
    { href: `${base}/registration`, label: '登録サポート', description: 'アカウントが要る Agent の登録を頼む', Icon: Bot, selected: pathname.endsWith('/registration') },
  ];
  const currentPage = primary.find(item => item.selected)?.label ?? 'その他の画面';
  return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}>
    <div className={styles.shell} data-noah-surface={effectiveMode} data-noah-standalone>
      <a href="#noah-content" className={styles.skip}>メインコンテンツへ</a>
      <header className={styles.topbar}>
        <Link href={home} className={styles.brand} aria-label="Noah ホーム"><Image className={styles.mark} src="/company-mark.png" width={40} height={40} alt="" unoptimized /><strong>Noah</strong></Link>
        <nav className={styles.desktopNav} aria-label="Noahの主要メニュー">{primary.map(({ href, label, selected }) => <a key={label} href={href} aria-current={selected ? 'page' : undefined}>{label}</a>)}</nav>
        <search className={styles.searchSlot}><form action={home} className={styles.search}><Search size={18} /><input aria-label="Agentを探す" name="q" maxLength={80} placeholder="Agent を探す" type="search" /></form></search>
        <Link href={`${base}/social#compose`} className={styles.post} aria-label="ポストする"><PenLine size={20} /><span>ポスト</span></Link>
        <Link href={`/account?returnTo=${encodeURIComponent(pathname)}`} className={styles.account} aria-label="アカウント・保存・引き継ぎ"><UserRound size={22} /></Link>
      </header>
      <div className={styles.body} data-home={onHome || undefined}>
        <div className={styles.content} id="noah-content" tabIndex={-1}>{children}</div>
      </div>
      <div className={styles.mobileMenu}>
        <button className={styles.menuTrigger} popoverTarget={menuId}><Menu size={24} /><strong>メニュー</strong><span>{currentPage}</span><ChevronUp size={18} /></button>
        <div ref={menu} id={menuId} popover="auto" className={styles.menuPanel}>
          <div className={styles.menuHeading}><strong>メニュー</strong><button popoverTarget={menuId} popoverTargetAction="hide" aria-label="メニューを閉じる"><X size={20} /></button></div>
          <nav aria-label="画面を選ぶ">{primary.map(({ href, label, description, Icon, selected }) => <a key={label} href={href} aria-current={selected ? 'page' : undefined} onClick={() => menu.current?.hidePopover()}><span className={styles.menuIcon}><Icon size={23} /></span><span className={styles.menuText}><strong>{label}</strong><small>{description}</small></span>{selected ? <span className={styles.currentBadge}>表示中</span> : <ChevronRight size={17} />}</a>)}</nav>
        </div>
      </div>
    </div>
  </NoahSurfaceContext.Provider>;
}
