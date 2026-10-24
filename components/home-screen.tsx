'use client';
import { useEffect, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Radio,
  Search,
  MessageCircle,
  Layers2,
  Users,
  Bookmark,
  Settings2,
  Plus,
  ArrowUpRight,
  WalletCards,
  ChartNoAxesCombined,
  Newspaper,
  GraduationCap,
  MoreHorizontal,
  Cable,
  type LucideIcon,
} from 'lucide-react';
import SkySocialTimeline from './sky-social-timeline';
import SkyDiscoveryFeed from './sky-discovery-feed';
import SkyXAccountTimeline, { SkyXAccountConnection } from './sky-x-account';
import SkyPublicXTimeline from './sky-public-x-timeline';
import {
  useTimelineConnector,
  SkyTimelineConnector,
  SkyMcpTimeline,
} from './sky-timeline-connector';
import { SkyNewsConnections } from './sky-information-market';
import { useSkyFeatures } from '@/lib/use-sky-features';
import type { WorkJob } from '@/lib/workflow';
import styles from './home-screen.module.css';
import OsAppNavigation from './os-app-navigation';

type View = 'home' | 'discover' | 'sources' | 'bookmarks' | 'communities';
const apps: { href: string; name: string; Icon: LucideIcon; view?: View }[] = [
  { href: '/#timeline', name: 'Sky', Icon: Radio, view: 'home' },
  { href: '/#catalog', name: '見つける', Icon: Search, view: 'discover' },
  { href: '/chat', name: 'Eve', Icon: MessageCircle },
  { href: '/sky/agents', name: '自分のSky', Icon: Layers2 },
  {
    href: '/#communities',
    name: 'コミュニティー',
    Icon: Users,
    view: 'communities',
  },
  {
    href: '/#bookmarks',
    name: 'ブックマーク',
    Icon: Bookmark,
    view: 'bookmarks',
  },
  { href: '/wallet', name: 'Wallet', Icon: WalletCards },
  { href: '/market', name: 'Market', Icon: ChartNoAxesCombined },
  { href: '/campus', name: 'Campus', Icon: GraduationCap },
  { href: '/settings', name: '設定', Icon: Settings2 },
];
function viewForHash(fragment: string): View {
  const hash = fragment.replace(/^#/, '');
  return hash === 'catalog' || hash === 'optional-features'
    ? 'discover'
    : hash === 'news-plugins' || hash === 'external-sources'
      ? 'sources'
      : hash === 'bookmarks' || hash === 'communities'
        ? hash
        : 'home';
}
export default function HomeScreen() {
  const timelineReceiver = useTimelineConnector();
  const [view, setView] = useState<View>('home');
  const [navigationHash, setNavigationHash] = useState('');
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [featureOnly, setFeatureOnly] = useState(false);
  const [jobs, setJobs] = useState<WorkJob[]>([]);
  const { enabled } = useSkyFeatures();
  useEffect(() => {
    const sync = () => {
      setView(viewForHash(window.location.hash));
      setNavigationHash(window.location.hash);
      setFeatureOnly(window.location.hash === '#optional-features');
    };
    const frame = requestAnimationFrame(sync);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        window.location.hash = 'catalog';
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
    const controller = new AbortController();
    void fetch('/api/work-jobs', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) =>
        r.ok ? ((await r.json()) as { jobs: WorkJob[] }) : null,
      )
      .then((v) => {
        if (!controller.signal.aborted && Array.isArray(v?.jobs))
          setJobs(
            v.jobs
              .slice()
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 3),
          );
      })
      .catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  function search(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchQuery(query.trim());
    window.location.hash = 'catalog';
    setView('discover');
  }
  const visibleApps = apps.filter(
    (app) =>
      (app.href !== '/wallet' && app.href !== '/market') ||
      enabled(app.href === '/wallet' ? 'wallet' : 'market'),
  );
  return (
    <div
      className={styles.home}
      data-sky-home
      data-os-bottom-navigation-host="home"
      data-timeline-skin="x"
      onClickCapture={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const anchor = (event.target as Element).closest('a[href]');
        if (!anchor || (anchor.getAttribute('target') && anchor.getAttribute('target') !== '_self')) return;
        const target = new URL(
          anchor.getAttribute('href')!,
          window.location.href,
        );
        if (
          target.origin === window.location.origin &&
          target.pathname === '/' &&
          target.hash
        ) {
          setView(viewForHash(target.hash));
          setNavigationHash(target.hash);
          setFeatureOnly(target.hash === '#optional-features');
        }
      }}
    >
      <a className={styles.skip} href="#home-content">
        ホームの内容へ
      </a>
      <div className={styles.layout}>
        <aside className={styles.navigation} aria-label="RockstarOS">
          <div className={styles.navInner}>
            <Link
              className={styles.brand}
              href="/#timeline"
              aria-label="RockstarOS ホーム"
            >
              <Image
                src="/company-mark.png"
                alt=""
                width={32}
                height={32}
                unoptimized
              />
              <span>RockstarOS</span>
            </Link>
            <nav aria-label="主要メニュー">
              {visibleApps.map(({ href, name, Icon, view: target }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={target === view ? 'page' : undefined}
                  aria-label={name}
                >
                  <Icon size={26} strokeWidth={target === view ? 2.5 : 1.7} />
                  <span>{name}</span>
                </Link>
              ))}
            </nav>
            <button
              className={styles.postButton}
              onClick={() => {
                window.location.hash = 'timeline';
                window.setTimeout(() => {
                  document.getElementById('sky-post')?.focus();
                }, 0);
              }}
            >
              <Plus size={22} />
              <span>ポストする</span>
            </button>
            <Link className={styles.access} href="/connect">
              <Cable size={21} />
              <span>利用環境をつなぐ</span>
            </Link>
            <span className={styles.preview}>DEVELOPER PREVIEW</span>
          </div>
        </aside>
        <main className={styles.main} id="home-content">
          <h1 className={styles.srOnly}>Sky ホーム</h1>
          <header className={styles.mobileHeader}>
            <Link href="/#timeline" aria-label="RockstarOS ホーム">
              <Image
                src="/company-mark.png"
                alt=""
                width={25}
                height={25}
                unoptimized
              />
              <strong>Sky</strong>
            </Link>
            <div className={styles.mobileActions}>
              <Link href="/chat">
                Eve <MessageCircle size={20} />
              </Link>
              <details>
                <summary aria-label="その他のメニュー">
                  <MoreHorizontal size={22} />
                </summary>
                <nav aria-label="追加メニュー">
                  <Link href="/#catalog">見つける</Link>
                  <Link href="/sky/agents">自分のSky</Link>
                  <Link href="/#bookmarks">ブックマーク</Link>
                  <Link href="/#news-plugins">ニュースの配信元</Link>
                  <Link href="/#optional-features">機能を追加</Link>
                  <Link href="/campus">Campus</Link>
                  <Link href="/connect">利用環境をつなぐ</Link>
                  <Link href="/settings">設定</Link>
                  {enabled('wallet') && <Link href="/wallet">Wallet</Link>}
                  {enabled('market') && <Link href="/market">Market</Link>}
                </nav>
              </details>
            </div>
          </header>
          {view === 'discover' ? (
            <SkyDiscoveryFeed
              key={`${featureOnly ? 'features' : 'discover'}:${searchQuery}`}
              query={searchQuery}
              initialFilter={featureOnly ? 'features' : 'all'}
              standalone
            />
          ) : view === 'sources' ? (
            <section className={styles.sources}>
              <header className={styles.pageTitle}>
                <h1>配信元をつなぐ</h1>
                <Link href="/#timeline">ホームへ</Link>
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
              key={view}
              fullHome
              initialView={view}
              discovery={<SkyDiscoveryFeed />}
              externalFeed={
                <>
                  <SkyMcpTimeline receiver={timelineReceiver} />
                  <SkyXAccountTimeline />
                  <SkyPublicXTimeline />
                </>
              }
            />
          )}
        </main>
        <aside className={styles.explore} aria-label="発見と自分の仕事">
          <div className={styles.exploreInner}>
            <form className={styles.search} onSubmit={search}>
              <Search size={20} />
              <input
                aria-label="Skyを検索"
                placeholder="Skyを検索"
                maxLength={80}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" aria-label="検索する">
                <ArrowUpRight size={18} />
              </button>
            </form>
            <section className={styles.sideSection}>
              <h2>今日、何をつくる？</h2>
              <p>見つけた力を追加して、Eveと形に。</p>
              <Link href="/chat" className={styles.eveLink}>
                Eveに依頼する <ArrowUpRight size={17} />
              </Link>
            </section>
            <section className={styles.sideSection}>
              <h2>自分のSky</h2>
              <Link href="/sky/agents">
                <Layers2 size={20} />
                <span>
                  <strong>AgentとLLM</strong>
                  <small>追加した担当・モデル・設定</small>
                </span>
              </Link>
              <Link href="/#news-plugins">
                <Newspaper size={20} />
                <span>
                  <strong>ニュースの配信元</strong>
                  <small>好きな情報をつなぐ</small>
                </span>
              </Link>
              <Link href="/#optional-features">
                <Plus size={20} />
                <span>
                  <strong>機能を追加</strong>
                  <small>Wallet・Marketを自分のOSへ</small>
                </span>
              </Link>
            </section>
            <section className={styles.sideSection}>
              <h2>仕事と成果</h2>
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/chat?view=work&workJob=${encodeURIComponent(job.id)}`}
                >
                  <span>
                    <strong>{job.title}</strong>
                    <small>
                      {
                        (
                          {
                            active: '進行中',
                            review: '確認待ち',
                            completed: '完了',
                            cancelled: '取消済み',
                          } as const
                        )[job.status]
                      }
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
              <Link href="/chat?view=work">
                {jobs.length
                  ? 'すべての仕事をEveで見る'
                  : 'Eveで進捗と成果を見る'}{' '}
                <ArrowUpRight size={16} />
              </Link>
            </section>
            <footer className={styles.footer}>
              <Link href="/campus">Campus</Link>
              <Link href="/connect">利用環境</Link>
              <Link href="/settings">設定</Link>
              <span>RockstarOS 1.0 · Developer Preview</span>
            </footer>
          </div>
        </aside>
      </div>
      <OsAppNavigation activeHash={navigationHash} />
    </div>
  );
}
