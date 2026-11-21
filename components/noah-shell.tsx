'use client';
/* oxlint-disable next/no-html-link-for-pages -- Hash destinations work in the local OS as well. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Bot, Home, UserRound, Settings2, RefreshCw, Layers, ArrowLeft, Plus, Globe, LayoutGrid, Menu, Search } from 'lucide-react';
import { noahLegacyHref, type NoahSurfaceMode } from '@/lib/noah-surface';
import { useNoahLocale } from './noah-locale';
import styles from './noah-service-shell.module.css';
import { NoahSurfaceContext } from './noah-surface-context';

export default function NoahShell({ children, mode = 'local' }: { children: ReactNode; mode?: NoahSurfaceMode }) {
  const pathname = usePathname();
  const { t } = useNoahLocale();
  const preview = pathname.startsWith('/noah/public');
  const effectiveMode = preview ? 'public' : mode, base = preview ? '/noah/public' : '/noah';
  const [hash, setHash] = useState('');
  const gridMenuId = useId(), gridMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const currentHash = window.location.hash;
      if(currentHash==='#noah-content')return;
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
  const gridHome = isTimeline && !['#timeline','#following','#agents'].includes(hash);
  const primary = [
    { href: timeline, label: 'タイムライン', Icon: Home, selected: isTimeline },
    { href: `${base}/explore`, label: 'Agent', Icon: Bot, selected: pathname.endsWith('/explore') || pathname === `${base}/ready` },
    { href: `${base}/activity`, label: '実行中', Icon: RefreshCw, selected: pathname.endsWith('/activity') },
    { href: `${base}/data`, label: '成果', Icon: Layers, selected: pathname.endsWith('/data') || pathname.endsWith('/outputs') },
  ];
  const isMain = primary.some(item=>item.selected);
  const secondary = [
    { href: `${base}/profile`, label: '登録情報', Icon: ShieldCheck },
    { href: `${base}/profile#permissions`, label: '任せる範囲', Icon: Settings2 },
    { href: `${base}/preferences`, label: '操作の設定', Icon: Globe },
  ];
  const gridItems = [
    { href: base, label: 'ホーム', Icon: Home },
    { href: `${base}/boards`, label: 'ボード', Icon: LayoutGrid },
    ...primary,
    { href: `${base}/registration`, label: '登録サポート', Icon: Bot },
    ...secondary,
  ];
  const nav = (mobile=false) => <nav className={mobile?styles.bottomNav:styles.desktopNav} aria-label={t('メインメニュー')}>{primary.map(({ href, label, Icon, selected }) => <a key={href} href={href} aria-label={t(label)} aria-current={selected ? 'page' : undefined}><Icon size={22} strokeWidth={1.7}/><span>{t(label)}</span></a>)}</nav>;
  if (gridHome) return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}>
    <div className={styles.shell} data-noah-surface={effectiveMode} data-noah-standalone>
      <a href="#noah-content" className={styles.skip}>{t('メインコンテンツへ')}</a>
      <header className={styles.gridTopbar}>
        <a href={base} className={styles.gridBrand} aria-label="Noah"><Image className={styles.mark} src="/company-mark.png" width={40} height={40} alt="" unoptimized/><strong>Noah</strong></a>
        <search className={styles.gridSearchSlot}><form action={base} className={styles.gridSearch}>
          <Search size={18} aria-hidden="true" /><input aria-label={t('Agentを探す')} name="q" maxLength={80} placeholder={t('Agentを探す')} type="search" />
        </form></search>
        <button type="button" className={styles.gridMenuButton} popoverTarget={gridMenuId} aria-label={t('メニュー')}><Menu size={22} /><span>{t('メニュー')}</span></button>
        <div ref={gridMenu} id={gridMenuId} popover="auto" className={styles.gridMenuPanel}>
          <nav aria-label={t('メインメニュー')}>{gridItems.map(({ href, label, Icon }) => <a key={href} href={href} onClick={() => gridMenu.current?.hidePopover()}><Icon size={19}/><span>{t(label)}</span></a>)}</nav>
          <Link href={`${base}/social#compose`} onClick={() => gridMenu.current?.hidePopover()}><Plus size={19}/>{t('投稿')}</Link>
        </div>
        <Link href={`/noah/account?returnTo=${encodeURIComponent(pathname)}`} className={styles.gridAccount} aria-label={t('アカウント')}><UserRound size={22}/></Link>
      </header>
      <div className={styles.gridBody} id="noah-content" tabIndex={-1}>{children}</div>
    </div>
  </NoahSurfaceContext.Provider>;
  return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}>
    <div className={styles.shell} data-noah-surface={effectiveMode} data-noah-standalone>
      <a href="#noah-content" className={styles.skip}>{t('メインコンテンツへ')}</a>
      <header className={styles.mobileHeader}>
        {!isMain&&<Link href={`${base}/explore`} className={styles.back} aria-label={t('戻る')}><ArrowLeft size={22}/></Link>}
        <a href={base} className={styles.brand}><Image className={styles.mark} src="/company-mark.png" width={40} height={40} alt="" unoptimized/><strong>Noah</strong></a>
        <div className={styles.headerActions}>{isTimeline&&<Link href={`${base}/social#compose`} className={styles.compose}><Plus size={16}/>{t('投稿')}</Link>}<Link href={`${base}/profile`} className={styles.profileLink} aria-label={t('登録情報を見る')}><UserRound size={20}/></Link></div>
      </header>
      <div className={styles.body} data-wide data-noah-home={isTimeline||undefined}>
        <aside className={styles.rail}><div className={styles.railInner}>
          <a href={base} className={styles.brand}><Image className={styles.mark} src="/company-mark.png" width={44} height={44} alt="" unoptimized/><strong>Noah</strong></a>
          {nav()}
          <div className={styles.secondary}><nav aria-label={t('操作の設定')}>{secondary.map(({href,label,Icon})=><a key={href} href={href}><Icon size={20}/><span>{t(label)}</span></a>)}</nav></div>
          {isTimeline&&<Link href={`${base}/social#compose`} className={styles.post}><Plus size={20}/><span>{t('投稿')}</span></Link>}
          <Link href={`/noah/account?returnTo=${encodeURIComponent(pathname)}`} className={styles.account}><UserRound size={22}/><span>{t('アカウント')}</span></Link>
        </div></aside>
        <div className={styles.content} id="noah-content" tabIndex={-1} data-main-page={isMain||undefined}>{children}</div>
      </div>
      {isMain&&nav(true)}
    </div>
  </NoahSurfaceContext.Provider>;
}
