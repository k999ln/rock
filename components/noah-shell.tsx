'use client';
/* oxlint-disable next/no-html-link-for-pages -- Hash destinations work in the local OS as well. */
import { useEffect, useState, useId, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Activity, Bot, Home, PenLine, Compass, FolderOpen, UserRound, Search, MoreHorizontal, Menu, ChevronUp, ChevronRight, X } from 'lucide-react';
import { noahLegacyHref, type NoahSurfaceMode } from '@/lib/noah-surface';
import styles from './noah-service-shell.module.css';
import NoahServiceCatalog from './noah-service-catalog';
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
  const timeline = `${base}#timeline`;
  const isTimeline = pathname === base || pathname === '/' || pathname === '/os';
  const primary = [
    { href: timeline, label: 'タイムライン', description: 'みんなの投稿とAgentを見る', Icon: Home, selected: pathname === base || pathname === '/' || pathname === '/os' },
    { href: `${base}/explore`, label: 'Agentを探す', description: '頼みたい仕事に合うAgentを見つける', Icon: Compass, selected: pathname.endsWith('/explore') },
    { href: `${base}/activity`, label: '実行中', description: 'Agentの動きと届いた成果を見る', Icon: Activity, selected: pathname.endsWith('/activity') },
    { href: `${base}/data`, label: '成果データ', description: '受け取った結果を確認・保存する', Icon: FolderOpen, selected: pathname.endsWith('/data') || pathname.endsWith('/outputs') },
  ];
  const currentPage = primary.find(item => item.selected)?.label ?? 'その他の画面';
  const secondary = [
    { href: `${base}/registration`, label: '登録サポート', Icon: Bot, selected: pathname.endsWith('/registration') },
  ];
  return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}>
    <div className={styles.shell} data-noah-surface={effectiveMode} data-noah-standalone>
      <a href="#noah-content" className={styles.skip}>メインコンテンツへ</a>
      <header className={styles.mobileHeader}><Link href={base} className={styles.brand}><Image className={styles.mark} src="/company-mark.png" width={48} height={48} alt="" unoptimized /><strong>Noah</strong></Link><Link href={`/account?returnTo=${encodeURIComponent(pathname)}`} aria-label="アカウント・保存・引き継ぎ"><UserRound size={22} /></Link></header>
      <div className={styles.body} data-wide={!isTimeline || undefined}>
        <aside className={styles.rail}>
          <div className={styles.railInner}>
            <Link href={base} className={styles.brand} aria-label="Noah ホーム"><Image className={styles.mark} src="/company-mark.png" width={48} height={48} alt="" unoptimized /><strong>Noah</strong></Link>
            <nav className={styles.desktopNav} aria-label="Noahの主要メニュー">{primary.map(({ href, label, Icon, selected }) => <a key={label} href={href} aria-label={label} aria-current={selected ? 'page' : undefined}><Icon size={20} strokeWidth={1.7} /><span>{label}</span></a>)}</nav>
            <div className={styles.mobileMenu}>
              <button className={styles.menuTrigger} popoverTarget={menuId}><Menu size={24} /><strong>メニュー</strong><span>{currentPage}</span><ChevronUp size={18} /></button>
              <div ref={menu} id={menuId} popover="auto" className={styles.menuPanel}>
                <div className={styles.menuHeading}><strong>メニュー</strong><button popoverTarget={menuId} popoverTargetAction="hide" aria-label="メニューを閉じる"><X size={20} /></button></div>
                <nav aria-label="画面を選ぶ">{primary.map(({ href, label, description, Icon, selected }) => <a key={label} href={href} aria-current={selected ? 'page' : undefined} onClick={() => menu.current?.hidePopover()}><span className={styles.menuIcon}><Icon size={23} /></span><span className={styles.menuText}><strong>{label}</strong><small>{description}</small></span>{selected ? <span className={styles.currentBadge}>表示中</span> : <ChevronRight size={17} />}</a>)}</nav>
              </div>
            </div>
            <div className={styles.secondary}><nav aria-label="Noahのその他の機能">{secondary.map(({ href, label, Icon, selected }) => <Link key={label} href={href} aria-label={label} aria-current={selected ? 'page' : undefined}><Icon size={19} strokeWidth={1.6} /><span>{label}</span></Link>)}</nav></div>
            <Link href={`${base}/social#compose`} className={styles.post} aria-label="ポストする"><PenLine size={22} /><span>ポストする</span></Link>
            <Link href={`/account?returnTo=${encodeURIComponent(pathname)}`} className={styles.account} aria-label="アカウント・保存・引き継ぎ"><span className={styles.avatar}><UserRound size={23} /></span><span><strong>アカウント</strong><small>保存・引き継ぎ</small></span><MoreHorizontal size={20} /></Link>
          </div>
        </aside>
        <div className={styles.content} id="noah-content" tabIndex={-1}>{children}</div>
        {isTimeline && <aside className={styles.support} aria-label="検索とおすすめ">
          <div className={styles.supportInner}>
            <search><form action={`${base}/explore`} className={styles.search}><Search size={20} /><input aria-label="Agentを探す" name="q" maxLength={120} placeholder="検索" type="search" /></form></search>
            <section className={styles.supportCard}><h2>Agentと、できることを。</h2><p>気になるAgentを見つけて、あなたの仕事を頼んでみよう。</p><Link href={`${base}/explore`} className={styles.pill}>Agentを探す</Link></section>
            <section className={styles.supportCard}><h2>使えるAgent</h2><NoahServiceCatalog compact /></section>
            <section className={styles.supportCard}><h2>外部Agentの登録</h2><p>アカウントが必要なAgentは、必要な情報を入力して登録Agentに依頼できます。</p><Link href={`${base}/registration`} className={styles.textLink}>登録を依頼する →</Link></section>
            <footer className={styles.supportFooter}><span>Noah · by avokado</span></footer>
          </div>
        </aside>}
      </div>
    </div>
  </NoahSurfaceContext.Provider>;
}
