'use client';
/* oxlint-disable next/no-html-link-for-pages -- Hash destinations work in the local OS as well. */
import { useEffect, useState, useId, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Activity, ShieldCheck, Bot, Home, PenLine, Compass, FolderOpen, UserRound, MoreHorizontal, Menu, ChevronUp, ChevronRight, X } from 'lucide-react';
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
  if (pathname === '/noah/account') return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}><div className={styles.shell} data-noah-surface={effectiveMode} data-noah-standalone>{children}</div></NoahSurfaceContext.Provider>;
  const timeline = `${base}#timeline`;
  const isTimeline = pathname === base || pathname === '/' || pathname === '/os';
  const primary = [
    { href: timeline, label: 'タイムライン', description: 'みんなの投稿とAgentを見る', Icon: Home, selected: pathname === base || pathname === '/' || pathname === '/os' },
    { href: `${base}/explore`, label: 'Agentを探す', description: '頼みたい仕事に合うAgentを見つける', Icon: Compass, selected: pathname.endsWith('/explore') || pathname.startsWith('/noah/ready') },
    { href: `${base}/activity`, label: '実行中', description: 'Agentの動きと届いた成果を見る', Icon: Activity, selected: pathname.endsWith('/activity') },
    { href: `${base}/data`, label: '成果データ', description: '受け取った結果を確認・保存する', Icon: FolderOpen, selected: pathname.endsWith('/data') || pathname.endsWith('/outputs') },
  ];
  const currentPage = primary.find(item => item.selected)?.label ?? (pathname.endsWith('/profile')?'登録情報と任せる範囲':'その他の画面');
  const secondary = [
    { href: `${base}/profile`, label: '登録情報と任せる範囲', Icon: ShieldCheck, selected: pathname.endsWith('/profile') },
    { href: `${base}/registration`, label: '登録サポート', Icon: Bot, selected: pathname.endsWith('/registration') },
  ];
  return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}>
    <div className={styles.shell} data-noah-surface={effectiveMode} data-noah-standalone>
      <a href="#noah-content" className={styles.skip}>メインコンテンツへ</a>
      <header className={styles.mobileHeader}><Link href={base} className={styles.brand}><Image className={styles.mark} src="/company-mark.png" width={48} height={48} alt="" unoptimized /><strong>Noah</strong></Link><Link href={`/noah/account?returnTo=${encodeURIComponent(pathname)}`} aria-label="アカウント・保存・引き継ぎ"><UserRound size={22} /></Link></header>
      <div className={styles.body} data-wide data-noah-home={isTimeline||undefined}>
        <aside className={styles.rail}>
          <div className={styles.railInner}>
            <Link href={base} className={styles.brand} aria-label="Noah ホーム"><Image className={styles.mark} src="/company-mark.png" width={48} height={48} alt="" unoptimized /><strong>Noah</strong></Link>
            <nav className={styles.desktopNav} aria-label="Noahの主要メニュー">{primary.map(({ href, label, Icon, selected }) => <a key={label} href={href} aria-label={label} aria-current={selected ? 'page' : undefined}><Icon size={20} strokeWidth={1.7} /><span>{label}</span></a>)}</nav>
            <div className={styles.mobileMenu}>
              <button className={styles.menuTrigger} popoverTarget={menuId}><Menu size={24} /><strong>メニュー</strong><span>{currentPage}</span><ChevronUp size={18} /></button>
              <div ref={menu} id={menuId} popover="auto" className={styles.menuPanel}>
                <div className={styles.menuHeading}><strong>メニュー</strong><button popoverTarget={menuId} popoverTargetAction="hide" aria-label="メニューを閉じる"><X size={20} /></button></div>
                <nav aria-label="画面を選ぶ">{primary.map(({ href, label, description, Icon, selected }) => <a key={label} href={href} aria-current={selected ? 'page' : undefined} onClick={() => menu.current?.hidePopover()}><span className={styles.menuIcon}><Icon size={23} /></span><span className={styles.menuText}><strong>{label}</strong><small>{description}</small></span>{selected ? <span className={styles.currentBadge}>表示中</span> : <ChevronRight size={17} />}</a>)}<Link href={`${base}/profile`} onClick={()=>menu.current?.hidePopover()}><span className={styles.menuIcon}><ShieldCheck size={23}/></span><span className={styles.menuText}><strong>登録情報と任せる範囲</strong><small>一度の入力を、次のAgentにも</small></span><ChevronRight size={17}/></Link></nav>
              </div>
            </div>
            <div className={styles.secondary}><nav aria-label="Noahのその他の機能">{secondary.map(({ href, label, Icon, selected }) => <Link key={label} href={href} aria-label={label} aria-current={selected ? 'page' : undefined}><Icon size={19} strokeWidth={1.6} /><span>{label}</span></Link>)}</nav></div>
            <Link href={`${base}/social#compose`} className={styles.post} aria-label="ポストする"><PenLine size={22} /><span>ポストする</span></Link>
            <Link href={`/noah/account?returnTo=${encodeURIComponent(pathname)}`} className={styles.account} aria-label="アカウント・保存・引き継ぎ"><span className={styles.avatar}><UserRound size={23} /></span><span><strong>アカウント</strong><small>保存・引き継ぎ</small></span><MoreHorizontal size={20} /></Link>
          </div>
        </aside>
        <div className={styles.content} id="noah-content" tabIndex={-1}>{children}</div>

      </div>
    </div>
  </NoahSurfaceContext.Provider>;
}
