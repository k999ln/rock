'use client';
import { lazy, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import OSHeader from './os-header';
import OsAppNavigation from './os-app-navigation';
import { osRouteHref, skyHomePanelForHash } from '@/lib/os-navigation';
import { MessageCircle, Plus, MoreHorizontal } from 'lucide-react';
import SkySocialTimeline from './sky-social-timeline';
import SkyDiscoveryFeed from './sky-discovery-feed';
import SkyDiscoveryDialog from './sky-discovery-dialog';
import SkyXAccountTimeline, { SkyXAccountConnection } from './sky-x-account';
import {
  useTimelineConnector,
  SkyTimelineConnector,
  SkyMcpTimeline,
} from './sky-timeline-connector';
import { SkyNewsConnections } from './sky-information-market';
import { useSkyFeatures } from '@/lib/use-sky-features';
import styles from './home-screen.module.css';

const SkyAgentLibrary = lazy(() => import('./sky-agent-library'));
type View = 'home' | 'discover' | 'manage' | 'sources' | 'bookmarks' | 'communities';
function viewForHash(fragment: string): View {
  const hash = fragment.replace(/^#/, '');
  return skyHomePanelForHash('#' + hash)
    ?? (hash === 'news-plugins' || hash === 'external-sources'
      ? 'sources'
      : hash === 'bookmarks' || hash === 'communities' || hash.startsWith('community=')
        ? hash === 'bookmarks' ? 'bookmarks' : 'communities'
        : 'home');

}
export default function HomeScreen() {
  const pathname = usePathname();
  const route = (href: string) =>
    osRouteHref(pathname, href, process.env.NODE_ENV === 'development');
  const homePath = route('/');
  const timelineReceiver = useTimelineConnector();
  const [view, setView] = useState<View>('home');
  const [panelVisited, setPanelVisited] = useState(false);
  const [featureOnly, setFeatureOnly] = useState(false);
  const { enabled } = useSkyFeatures();
  useEffect(() => {
    const sync = () => {
      const next = viewForHash(window.location.hash);
      setView(next);
      if (next === 'discover' || next === 'manage') setPanelVisited(true);
      setFeatureOnly(window.location.hash === '#optional-features');
    };
    const frame = requestAnimationFrame(sync);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        window.location.hash = 'sky';
      }
      if (
        event.key === 'Escape' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (event.target as HTMLElement)?.tagName,
        )
      )
        window.location.hash = 'timeline';
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    window.addEventListener('keydown', onKey);
    void navigator.serviceWorker?.register('/sw.js').catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <div
      className={styles.home}
      data-sky-home
      data-os-frame
      data-timeline-skin="x"
      onClickCapture={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const anchor = (event.target as Element).closest('a[href]');
        if (!anchor) return;
        const target = new URL(
          anchor.getAttribute('href')!,
          window.location.href,
        );
        if (
          target.origin === window.location.origin &&
          target.pathname === homePath &&
          target.hash
        ) {
          const next = viewForHash(target.hash);
          setView(next);
          if (next === 'discover' || next === 'manage') setPanelVisited(true);
          setFeatureOnly(target.hash === '#optional-features');
        }
      }}
    >
      <a className={styles.skip} href="#home-content">
        ホームの内容へ
      </a>
      <div className={styles.layout}>

        <main className={styles.main} id="home-content">
          <h1 className={styles.srOnly}>smis ホーム</h1>
          <div className={styles.mobileHeader}>
            <OSHeader title="smis" hideNavigation>
              <div className={styles.mobileActions}>
                <Link href={route('/chat')}>
                  Eve <MessageCircle size={20} />
                </Link>
                <Link href={route('/#sky')} aria-label="追加・管理"><Plus size={21} /></Link>
                <details>
                  <summary aria-label="その他のメニュー">
                    <MoreHorizontal size={22} />
                  </summary>
                  <nav aria-label="追加メニュー">
                    <Link href={route('/#sky-manage')}>担当とLLMを管理</Link>
                    <Link href="/account">アカウント</Link>
                    <span className={styles.preview}>DEVELOPER PREVIEW</span>
                    <Link href={route('/#bookmarks')}>ブックマーク</Link>
                    <Link href={route('/#news-plugins')}>ニュースの配信元</Link>
                    <Link href={route('/#optional-features')}>機能を追加</Link>
                    <Link href={route('/campus')}>Campus</Link>
                    <Link href={route('/connect')}>利用環境をつなぐ</Link>
                    <Link href={route('/settings')}>設定</Link>
                    {enabled('wallet') && (
                      <Link href={route('/wallet')}>Wallet</Link>
                    )}
                    {enabled('market') && (
                      <Link href={route('/market')}>Market</Link>
                    )}
                  </nav>
                </details>
              </div>
            </OSHeader>
          </div>
          <SkyDiscoveryDialog open={view==='discover'||view==='manage'} mode={view==='manage'?'manage':'discover'} onModeChange={mode=>{window.location.hash=mode==='manage'?'sky-manage':'sky';}} onClose={()=>{window.location.hash='timeline';setView('home');}}>
            {panelVisited && <>
              <section id="sky-add-panel" role="tabpanel" aria-labelledby="sky-add-tab" hidden={view!=='discover'}>
                <SkyDiscoveryFeed key={featureOnly?'features':'discover'} initialFilter={featureOnly?'features':'all'} standalone />
              </section>
              <section id="sky-manage-panel" role="tabpanel" aria-labelledby="sky-manage-tab" hidden={view!=='manage'}>
                <Suspense fallback={<output>担当とLLMの設定を読み込んでいます…</output>}><SkyAgentLibrary embedded /></Suspense>
              </section>
            </>}
          </SkyDiscoveryDialog>
          {view === 'sources' ? (
            <section className={styles.sources}>
              <header className={styles.pageTitle}>
                <h1>配信元をつなぐ</h1>
                <Link href={route('/#timeline')}>ホームへ</Link>
              </header>
              <SkyTimelineConnector receiver={timelineReceiver} />
              <details className={styles.providerSettings}>
                <summary>個別APIの接続設定（任意）</summary>
                <SkyXAccountConnection />
              </details>
              <SkyNewsConnections />
            </section>
          ) : (
            <SkySocialTimeline
              key={view==='discover'||view==='manage'?'home':view}
              fullHome
              initialView={view==='discover'||view==='manage'?'home':view}
              externalFeed={
                <>
                  <SkyMcpTimeline receiver={timelineReceiver} />
                  <SkyXAccountTimeline />
                </>
              }
            />
          )}
        </main>

      </div>
      <OsAppNavigation
        className={`${styles.mobileNav} os-home-navigation`}
        aria-label="RockstarOSの主要サービス"
        active={
          view === 'communities' ? 'communities' : 'stream'
        }
      />
    </div>
  );
}
