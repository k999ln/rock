'use client';
/* oxlint-disable next/no-html-link-for-pages -- Hash destinations work in the local OS as well. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { Bot, Home, UserRound, RefreshCw, ArrowLeft, Globe, Bookmark, Menu, MoreHorizontal, Search, SquareTerminal } from 'lucide-react';
import { noahLegacyHref, type NoahSurfaceMode } from '@/lib/noah-surface';
import { NOAH_PROFILE_PATH, noahShortPageDestination } from '../services/sky-web/noah-page-routes.mjs';
import { useNoahLocale } from './noah-locale';
import styles from './noah-service-shell.module.css';
import { NoahRevenuePackMenuItem } from './noah-revenue-pack';
import { NoahSurfaceContext } from './noah-surface-context';

export default function NoahShell({ children, mode = 'local' }: { children: ReactNode; mode?: NoahSurfaceMode }) {
  const browserPath = usePathname();
  const pathname = noahShortPageDestination(browserPath)?.split('?')[0] ?? browserPath;
  const searchParams = useSearchParams();
  const { t } = useNoahLocale();
  const preview = pathname.startsWith('/noah/public');
  const effectiveMode = preview ? 'public' : mode, base = preview ? '/noah/public' : '/noah';
  const [hash, setHash] = useState('');
  const storeSearchId = useId(), gridMenuId = useId(), gridMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const currentHash = window.location.hash;
      if(currentHash==='#noah-content')return;
      const legacy = noahLegacyHref(currentHash, effectiveMode, base);
      if (currentHash === '#communities' || currentHash.startsWith('#community=') || currentHash === '#social') {
        window.location.replace(`${base}#timeline`);
      } else if (legacy) { window.location.replace(legacy); }
      else setHash(currentHash);
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, [pathname, effectiveMode, base]);
  if (pathname === '/noah/account') return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}><div className={styles.shell} data-noah-surface={effectiveMode} data-noah-standalone>{children}</div></NoahSurfaceContext.Provider>;
  const isTimeline = pathname === base || pathname === '/' || pathname === '/os';
  const gridHome = isTimeline;
  const publicStore = effectiveMode === 'public';
  const profileHref = publicStore && !preview ? NOAH_PROFILE_PATH : `${base}/profile`;
  const localPath = pathname.startsWith(base + '/') ? pathname.slice(base.length + 1) : '';
  const localPrimary = [
    { href: base, label: 'ホーム', Icon: Home, selected: isTimeline },
    { href: `${base}/activity`, label: '実行中', Icon: RefreshCw, selected: pathname.endsWith('/activity') },
    { href: `${base}/saved`, label: '保存', Icon: Bookmark, selected: pathname.endsWith('/saved') },
  ];
  const isMain = isTimeline || ['explore','my','activity','saved'].includes(localPath);
  const secondary = [
    ...(publicStore ? [
      ...(!gridHome ? [{ href: '/noah/engineering', label: 'Agentエンジニアリング', Icon: SquareTerminal }] : []),
      { href: `${base}/my?view=agents`, label: '自分のAgent', Icon: Bot },
      { href: `${base}/activity`, label: '実行中', Icon: RefreshCw },
      { href: `${base}/saved?tab=results`, label: '保存した成果を見る', Icon: Bookmark },
    ] : []),
    { href: `${base}/preferences`, label: '操作の設定', Icon: Globe },
  ];
  const gridItems = [
    ...(publicStore ? [{ href: base, label: 'ホーム', Icon: Home }] : localPrimary),
    ...(!publicStore ? [{ href: `${base}/registration`, label: '登録サポート', Icon: Bot }] : []),
    ...secondary,
  ];
  const localNav = (mobile=false) => <nav className={mobile?styles.bottomNav:styles.desktopNav} aria-label={t('メインメニュー')}>{localPrimary.map(({ href, label, Icon, selected }) => <a key={href} href={href} aria-label={t(label)} aria-current={selected ? 'page' : undefined}><Icon size={22} strokeWidth={1.7}/><span>{t(label)}</span></a>)}</nav>;
  const menu = <>
    <button type="button" className={styles.gridMenuButton} popoverTarget={gridMenuId} aria-label={t('メニュー')}>{publicStore ? <MoreHorizontal size={22}/> : <Menu size={22}/>}<span>{t('メニュー')}</span></button>
    <div ref={gridMenu} id={gridMenuId} popover="auto" className={styles.gridMenuPanel}>
      <nav aria-label={t('メインメニュー')}><NoahRevenuePackMenuItem onClick={() => gridMenu.current?.hidePopover()}/>{gridItems.map(({ href, label, Icon }) => <a key={href} href={href} onClick={() => gridMenu.current?.hidePopover()}><Icon size={19}/><span>{t(label)}</span></a>)}</nav>
    </div>
  </>;
  const searchForm = <form action={base} className={styles.gridSearch} onSubmit={event=>{
          event.preventDefault();
          const params=new URLSearchParams(window.location.search),data=new FormData(event.currentTarget);
          const word=data.get('q');
          const next=new URLSearchParams({q:typeof word==='string'?word:'',collectionSource:params.get('collectionSource')??(params.get('tab')==='catalog'?'':'noah')});
          const topic=params.get('collectionTopic'); if(topic) next.set('collectionTopic',topic);
          window.location.assign(`${base}?${next}#noah-collection`);
        }}>
          <Search size={18} aria-hidden="true" /><input aria-label={t('Agentを探す')} name="q" key={searchParams.get('q') ?? searchParams.get('collectionQuery') ?? ''} defaultValue={searchParams.get('q') ?? searchParams.get('collectionQuery') ?? ''} maxLength={200} placeholder={t('Agentを探す')} type="search" />
        </form>;
  if (gridHome) return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}>
    <div className={styles.shell} data-noah-surface={effectiveMode} data-noah-standalone>
      <a href="#noah-content" className={styles.skip}>{t('メインコンテンツへ')}</a>
      <header className={styles.gridTopbar} data-store-header={publicStore || undefined}>
        <a href={base} className={styles.gridBrand} aria-label="Noah"><Image className={styles.mark} src="/brand/noah-icon-v2.png" width={40} height={40} alt="" unoptimized/><strong>Noah</strong></a>
        <search className={styles.gridSearchSlot}>{searchForm}</search>
        {publicStore && <>
          <button type="button" className={styles.mobileStoreSearch} aria-label={t('Agentを探す')} popoverTarget={storeSearchId}><Search size={21}/></button>
          <search popover="auto" id={storeSearchId} className={styles.storeSearchPanel}>{searchForm}</search>
        </>}
        {menu}
        <Link href={profileHref} className={styles.gridAccount} aria-label={t('登録情報を見る')} title={t('登録情報')}><UserRound size={22}/></Link>
      </header>
      <div className={styles.gridBody} id="noah-content" tabIndex={-1}>{children}</div>
    </div>
  </NoahSurfaceContext.Provider>;
  return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}>
    <div className={styles.shell} data-noah-surface={effectiveMode} data-noah-standalone>
      <a href="#noah-content" className={styles.skip}>{t('メインコンテンツへ')}</a>
      <header className={styles.mobileHeader}>
        {!isMain&&<Link href={base} className={styles.back} aria-label={t('戻る')}><ArrowLeft size={22}/></Link>}
        <a href={base} className={styles.brand}><Image className={styles.mark} src="/brand/noah-icon-v2.png" width={40} height={40} alt="" unoptimized/><strong>Noah</strong></a>
        <div className={styles.headerActions}>{publicStore && menu}<Link href={profileHref} className={styles.profileLink} aria-label={t('登録情報を見る')} title={t('登録情報')}><UserRound size={20}/></Link></div>
      </header>
      <div className={styles.body} data-wide data-noah-home={isTimeline||undefined}>
        <aside className={styles.rail}><div className={styles.railInner}>
          <a href={base} className={styles.brand}><Image className={styles.mark} src="/brand/noah-icon-v2.png" width={44} height={44} alt="" unoptimized/><strong>Noah</strong></a>
          {!publicStore && localNav()}
          <div className={styles.secondary}><nav aria-label={t(publicStore ? 'メインメニュー' : '操作の設定')}><NoahRevenuePackMenuItem/>{secondary.map(({href,label,Icon})=><a key={href} href={href} aria-label={t(label)}><Icon size={20}/><span>{t(label)}</span></a>)}</nav></div>
          <Link href={profileHref} className={styles.account}><UserRound size={22}/><span>{t('登録情報')}</span></Link>
        </div></aside>
        <div className={styles.content} id="noah-content" tabIndex={-1} data-main-page={(!publicStore && isMain)||undefined}>{children}</div>
      </div>
      {!publicStore && isMain && localNav(true)}
    </div>
  </NoahSurfaceContext.Provider>;
}
