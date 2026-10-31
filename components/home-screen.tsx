'use client';
import { lazy, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import OSHeader from './os-header';
import OsAppNavigation from './os-app-navigation';
import { osRouteHref, skyHomePanelForHash } from '@/lib/os-navigation';
import {
  MessageCircle,
  Plus,
  MoreHorizontal,
  ArrowUpRight,
  Layers,
  Cable,
  FolderOpen,
} from 'lucide-react';
import SkySocialTimeline from './sky-social-timeline';

import SmisAddedPosts from './smis-added-posts';
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

const SkyDiscoveryFeed = lazy(() => import('./sky-discovery-feed'));
const SkyAgentLibrary = lazy(() => import('./sky-agent-library'));
type View =
  | 'home'
  | 'discover'
  | 'manage'
  | 'sources'
  | 'bookmarks'
  | 'communities';
function viewForHash(fragment: string): View {
  const hash = fragment.replace(/^#/, '');
  return (
    skyHomePanelForHash('#' + hash) ??
    (hash === 'news-plugins' || hash === 'external-sources'
      ? 'sources'
      : hash === 'bookmarks' ||
          hash === 'communities' ||
          hash.startsWith('community=')
        ? hash === 'bookmarks'
          ? 'bookmarks'
          : 'communities'
        : 'home')
  );
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
        const menu = anchor.closest<HTMLDetailsElement>('details[data-home-menu]');
        if (menu) menu.open = false;
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
          <span className={styles.srOnly}>RockstarOS ホーム</span>
          <div className={styles.mobileHeader}>
            <OSHeader title="Noah" hideNavigation={view !== 'communities'}>
              {view !== 'communities' && <div className={styles.mobileActions}>
                <Link href="/os/eve">
                  Eve <MessageCircle size={20} />
                </Link>
                <Link href={route('/#sky')} aria-label="追加・管理">
                  <Plus size={21} />
                </Link>
                <details data-home-menu>
                  <summary aria-label="その他のメニュー">
                    <MoreHorizontal size={22} />
                  </summary>
                  <nav aria-label="追加メニュー">
                    <Link href="/os/eve?view=build">
                      Eveでエージェントを作る
                    </Link>
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
              </div>}
            </OSHeader>
      {view !== 'communities' && <OsAppNavigation
        className={`${styles.mobileNav} os-home-navigation`}
        aria-label="RockstarOSの主要サービス"
        active="stream"
      />}
          </div>
          {view === 'home' && (
            <section
              className={styles.workEntry}
              aria-labelledby="os-home-title"
            >
              <div className={styles.entryIntro}>
                <h1 id="os-home-title">Eve</h1>
                <p>何を進めますか？</p>
              </div>
              <nav className={styles.entryActions} aria-label="仕事の主な操作">
                <Link className={styles.primaryEntry} href="/os/eve">
                  <MessageCircle size={25} />
                  <strong>Eveに依頼する</strong>
                  <ArrowUpRight size={20} />
                </Link>
                <Link href="/os/eve#eve-work-results">
                  <FolderOpen size={24} />
                  <strong>仕事と成果を開く</strong>
                  <ArrowUpRight size={20} />
                </Link>
                <Link href="/connect/service">
                  <Cable size={24} />
                  <strong>利用環境をつなぐ</strong>
                  <ArrowUpRight size={20} />
                </Link>
              </nav>
            </section>
          )}
          <SkyDiscoveryDialog
            open={view === 'discover' || view === 'manage'}
            mode={view === 'manage' ? 'manage' : 'discover'}
            onModeChange={(mode) => {
              window.location.hash = mode === 'manage' ? 'sky-manage' : 'sky';
            }}
            onClose={() => {
              window.location.hash = 'timeline';
              setView('home');
            }}
          >
            {panelVisited && (
              <>
                <section
                  id="sky-add-panel"
                  role="tabpanel"
                  aria-labelledby="sky-add-tab"
                  hidden={view !== 'discover'}
                >
                  <Suspense fallback={<output>能力を読み込んでいます…</output>}>
                    <SkyDiscoveryFeed
                      key={featureOnly ? 'features' : 'discover'}
                      initialFilter={featureOnly ? 'features' : 'agent'}
                      standalone
                      embedded
                    />
                  </Suspense>
                </section>
                <section
                  id="sky-manage-panel"
                  role="tabpanel"
                  aria-labelledby="sky-manage-tab"
                  hidden={view !== 'manage'}
                >
                  <Suspense
                    fallback={
                      <output>担当とLLMの設定を読み込んでいます…</output>
                    }
                  >
                    <SkyAgentLibrary embedded />
                  </Suspense>
                </section>
              </>
            )}
          </SkyDiscoveryDialog>
          <div className={styles.workspaceGrid} data-os-home-view={view}>
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
                key={view === 'communities' ? 'communities' : 'timeline'}
                fullHome
                personalFeed={<SmisAddedPosts />}
                initialView={
                  view === 'discover' || view === 'manage' ? 'home' : view
                }
                externalFeed={
                  <>
                    <SkyMcpTimeline receiver={timelineReceiver} />
                    <SkyXAccountTimeline />
                  </>
                }
              />
            )}
            {view === 'home' && (
              <aside className={styles.workspaceAside} aria-label="自分の環境">
                <section>
                  <Layers size={23} />
                  <h2>使える能力を、増やす。</h2>
                  <p>Agent・モデル・Toolを選んで、自分の仕事へ。</p>
                  <Link href={route('/#sky')}>
                    能力を探す <ArrowUpRight size={17} />
                  </Link>
                  <Link href={route('/#sky-manage')}>
                    追加した能力を管理 <ArrowUpRight size={17} />
                  </Link>
                </section>
                <section>
                  <h2>自分の環境</h2>
                  <Link href="/account">
                    アカウント <ArrowUpRight size={17} />
                  </Link>
                  <Link href="/connect/service">
                    端末・サービス接続 <ArrowUpRight size={17} />
                  </Link>
                  <Link href={route('/settings')}>
                    設定 <ArrowUpRight size={17} />
                  </Link>
                </section>
                <p className={styles.entryNote}>
                  実行前に、担当・権限・費用上限をEveで確認できます。
                </p>
              </aside>
            )}
          </div>
        </main>
      </div>

    </div>
  );
}
