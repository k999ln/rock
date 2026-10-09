/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway. */
'use client';

import {
  Download,
  ArrowUpRight,
  ArrowRight,
  ArrowUp,
  Asterisk,
  Check,
  Command,
  Search,
  X,
  Plus,
  SlidersHorizontal,
  Cloud,
  MessageCircle,
  WalletCards,
  ChartNoAxesCombined,
  Settings2,
  RefreshCw,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import type { WorkJob } from '@/lib/workflow';
import { writeHomeIntent, HOME_INTENT_MAX_LENGTH } from '@/lib/home-intent';
import styles from './home-screen.module.css';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type App = {
  name: string;
  description: string;
  href: string;
  Icon: LucideIcon;
};
const apps: App[] = [
  {
    name: 'Sky',
    description: '必要なエージェントと道具を見つける',
    href: '/sky',
    Icon: Cloud,
  },
  {
    name: 'Zema',
    description: '依頼を伝える・一緒に進める',
    href: '/chat',
    Icon: MessageCircle,
  },
  {
    name: 'Wallet',
    description: '費用と資金を確認する',
    href: '/wallet',
    Icon: WalletCards,
  },
  {
    name: 'Market',
    description: '価値を探索する · PAPER',
    href: '/market',
    Icon: ChartNoAxesCombined,
  },
  {
    name: '設定',
    description: '接続・権限・自分の環境',
    href: '/settings',
    Icon: Settings2,
  },
];
const intentions = [
  {
    label: 'つくる',
    example: '伝えたいアイデアを、読みやすい記事にしたい',
    placeholder: '作りたいものや、伝えたい内容を入力',
  },
  {
    label: '調べる',
    example: 'このアイデアに関連する特許を調べたい',
    placeholder: '調べたいテーマや条件を入力',
  },
  {
    label: '整える',
    example: '記事の出典を整理して、確かめたい',
    placeholder: '整理したい内容や目的を入力',
  },
];
const filters = [
  { id: 'all', label: 'すべて' },
  { id: 'active', label: '進行中' },
  { id: 'review', label: '確認待ち' },
  { id: 'completed', label: '完了' },
] as const;
const statusNames: Record<WorkJob['status'], string> = {
  active: '進行中',
  review: '確認待ち',
  completed: '完了',
  cancelled: '取消済み',
};
type LoadState = 'loading' | 'ready' | 'signin' | 'error';

export default function HomeScreen() {
  const router = useRouter();
  const [nfcEntry, setNfcEntry] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );
  const [installDismissed, setInstallDismissed] = useState(false);
  const [intent, setIntent] = useState('');
  const [mode, setMode] = useState(0);
  const [focus, setFocus] = useState(false);
  const [intentError, setIntentError] = useState('');
  const [jobs, setJobs] = useState<WorkJob[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const loadController = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoadState('loading');
    setJobs([]);
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/work-jobs', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (controller !== loadController.current) return;
      if (response.status === 401) {
        setLoadState('signin');
        return;
      }
      if (!response.ok) throw new Error('unavailable');
      const data = (await response.json()) as { jobs: WorkJob[] };
      if (!Array.isArray(data.jobs)) throw new Error('invalid');
      if (controller !== loadController.current || controller.signal.aborted)
        return;
      setJobs(
        data.jobs
          .slice()
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      setLoadState('ready');
    } catch {
      if (controller === loadController.current) {
        setJobs([]);
        setLoadState('error');
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      void refresh();
      setNfcEntry(
        new URLSearchParams(window.location.search).get('nfc') === '1',
      );
      setInstalled(
        window.matchMedia('(display-mode: standalone)').matches ||
          ('standalone' in navigator &&
            (navigator as Navigator & { standalone?: boolean }).standalone ===
              true),
      );
      setDate(
        new Intl.DateTimeFormat('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
          .format(new Date())
          .toUpperCase(),
      );
      try {
        setFocus(
          new URLSearchParams(window.location.search).get('focus') === '1' ||
            window.localStorage.getItem('rockstaros.home.focus.v1') === '1',
        );
      } catch {
        /* Optional display preference. */
      }
    }, 0);
    void navigator.serviceWorker?.register('/sw.js').catch(() => {});
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(initialize);
      const controller = loadController.current;
      loadController.current = null;
      controller?.abort();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    if (paletteOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [paletteOpen]);

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      if (new URLSearchParams(window.location.search).get('nfc') !== '1')
        return;
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    }
    function onInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function requestInstall() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {
      // The browser may withdraw the prompt; the manual steps remain available.
    } finally {
      setInstallPrompt(null);
    }
  }

  const visibleJobs = useMemo(
    () =>
      jobs
        .filter((job) => filter === 'all' || job.status === filter)
        .slice(0, 4),
    [jobs, filter],
  );
  const foundApps = apps.filter((app) =>
    `${app.name} ${app.description}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      writeHomeIntent(window.sessionStorage, intent);
      setIntentError('');
      router.push('/chat');
    } catch {
      setIntentError(
        '依頼を引き継げませんでした。入力は残っています。コピーしてZemaを開いてください。',
      );
    }
  }
  function toggleFocus() {
    const value = !focus;
    setFocus(value);
    try {
      window.localStorage.setItem(
        'rockstaros.home.focus.v1',
        value ? '1' : '0',
      );
    } catch {
      /* Still works in this session. */
    }
  }
  return (
    <main className={styles.home} data-focus={focus}>
      <a href="#home-intent" className={styles.skip}>
        依頼を入力する
      </a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="RockstarOS ホーム">
          <Asterisk size={29} strokeWidth={1.7} />
          <span>
            Rockstar<span className={styles.brandOs}>OS</span>
          </span>
          <span className={styles.version}>1.0</span>
        </Link>
        <div className={styles.headerCenter}>ホーム</div>
        <button
          className={styles.launcher}
          onClick={() => {
            setSearch('');
            setPaletteOpen(true);
          }}
          aria-haspopup="dialog"
        >
          <span>すべてのツール</span>
          <kbd>
            <Command size={11} /> K
          </kbd>
        </button>
      </header>

      {nfcEntry && !installed && !installDismissed && (
        <aside
          className={styles.nfcInstall}
          aria-labelledby="nfc-install-title"
        >
          <button
            className={styles.nfcClose}
            onClick={() => setInstallDismissed(true)}
            aria-label="追加案内を閉じる"
          >
            <X size={18} />
          </button>
          <span className={styles.nfcEyebrow}>NFCから開きました</span>
          <h2 id="nfc-install-title">RockstarOSをホームに置く</h2>
          <p>
            このままSky・Zema・Walletを使えます。次回からアプリのように開くなら、端末のホーム画面にも追加できます。
          </p>
          {installPrompt ? (
            <button
              className={styles.nfcInstallButton}
              onClick={() => void requestInstall()}
            >
              <Download size={17} /> アプリとして追加
            </button>
          ) : (
            <p className={styles.nfcSteps}>
              iPhone: Safariの共有 →「ホーム画面に追加」
              <br />
              Android: Chromeのメニュー →「アプリをインストール」
            </p>
          )}
          <Link className={styles.nfcDownloadLink} href="/rockstaros#start">
            実OS版の配布状況を見る <span aria-hidden="true">↗</span>
          </Link>
          <p className={styles.nfcBoundary}>
            追加されるのはWeb版です。NFCタグやこの操作でスマホ本体のOSは書き換わりません。
          </p>
        </aside>
      )}

      <nav className={styles.dock} aria-label="RockstarOSのツール">
        {apps.map(({ name, href, Icon }) => (
          <Link key={href} href={href}>
            <Icon size={21} strokeWidth={1.6} />
            <span>{name}</span>
          </Link>
        ))}
      </nav>

      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Zemaに依頼</p>
          <h1 id="home-title">何を進めますか。</h1>
          <p className={styles.intro}>
            作成・調査・整理したいことを、Zemaに伝えられます。
          </p>
          <div className={styles.intentModes} aria-label="依頼のヒント">
            {intentions.map((item, index) => (
              <button
                key={item.label}
                aria-pressed={mode === index}
                onClick={() => setMode(index)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {item.label}
                {mode === index && <span className={styles.modeDot} />}
              </button>
            ))}
          </div>
          <form className={styles.composer} onSubmit={submit}>
            <label htmlFor="home-intent" className={styles.composerLabel}>
              いま、何をしたい？
            </label>
            <textarea
              id="home-intent"
              ref={input}
              value={intent}
              onChange={(e) => {
                setIntent(e.target.value);
                setIntentError('');
              }}
              placeholder={intentions[mode].placeholder}
              maxLength={HOME_INTENT_MAX_LENGTH}
              rows={2}
              onKeyDown={(event) => {
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.key === 'Enter' &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className={styles.composerBottom}>
              <span>
                <span className={styles.tinyStar}>✳</span> Zemaと始める{' '}
                <span className={styles.composerNote}>
                  送信前に確認できます
                </span>
              </span>
              <button
                type="submit"
                disabled={!intent.trim()}
                aria-label="依頼をZemaへ引き継ぐ"
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </form>
          {intentError && (
            <p className={styles.intentError} role="alert">
              {intentError} <Link href="/chat">Zemaを開く</Link>
            </p>
          )}
          <button
            className={styles.example}
            onClick={() => {
              setIntent(intentions[mode].example);
              input.current?.focus();
            }}
          >
            <Plus size={13} /> たとえば、{intentions[mode].example}
            <ArrowUpRight size={13} />
          </button>
        </div>
        <button
          className={styles.focusToggle}
          aria-pressed={focus}
          onClick={toggleFocus}
        >
          <SlidersHorizontal size={13} />
          {focus ? '通常表示に戻す' : '入力に集中'}
        </button>
      </section>

      <section className={styles.activity} aria-labelledby="activity-title">
        <div className={styles.activityHeading}>
          <div>
            <h2 id="activity-title">最近の仕事</h2>
          </div>
          <button
            className={styles.refresh}
            aria-label="仕事を再読み込み"
            disabled={loadState === 'loading'}
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <div className={styles.activityBar}>
          <div className={styles.filters} aria-label="仕事を絞り込む">
            {filters.map((item) => (
              <button
                key={item.id}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                {loadState === 'ready' && (
                  <span>
                    {
                      jobs.filter(
                        (job) => item.id === 'all' || job.status === item.id,
                      ).length
                    }
                  </span>
                )}
              </button>
            ))}
          </div>
          <Link href="/work" className={styles.allWork}>
            仕事を開く <ArrowUpRight size={14} />
          </Link>
        </div>
        <div aria-live="polite" aria-busy={loadState === 'loading'}>
          {loadState === 'loading' && (
            <div className={styles.empty}>
              <span className={styles.emptyMark}>
                <span className={styles.loadingDot} />
              </span>
              <div>
                <strong>あなたの仕事を読み込んでいます</strong>
                <p>保存済みの進捗を取得しています。</p>
              </div>
            </div>
          )}
          {loadState === 'signin' && (
            <div className={styles.empty}>
              <span className={styles.emptyMark}>
                <Asterisk size={28} strokeWidth={1} />
              </span>
              <div>
                <strong>保存した仕事を確認</strong>
                <p>
                  サインインすると、保存した仕事をひとつの場所で確認できます。
                </p>
              </div>
              <a
                className={styles.emptyAction}
                href="/signin-with-chatgpt?return_to=%2F"
                target="_top"
              >
                サインイン <ArrowRight size={16} />
              </a>
            </div>
          )}
          {loadState === 'error' && (
            <div className={styles.empty}>
              <span className={styles.emptyMark}>
                <RefreshCw size={22} strokeWidth={1} />
              </span>
              <div>
                <strong>仕事を読み込めませんでした</strong>
                <p>接続を確認して、もう一度お試しください。</p>
              </div>
              <button
                className={styles.emptyAction}
                onClick={() => void refresh()}
              >
                再読み込み <ArrowRight size={16} />
              </button>
            </div>
          )}
          {loadState === 'ready' && !visibleJobs.length && (
            <div className={styles.empty}>
              <span className={styles.emptyMark}>
                <Plus size={24} strokeWidth={1} />
              </span>
              <div>
                <strong>
                  {filter === 'all'
                    ? 'まだ仕事はありません。'
                    : `${filters.find((item) => item.id === filter)?.label}の仕事はまだありません。`}
                </strong>
                <p>上の入力欄から依頼すると、Zemaへ引き継げます。</p>
              </div>
              <button
                className={styles.emptyAction}
                onClick={() => input.current?.focus()}
              >
                依頼を書く <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          {loadState === 'ready' &&
            visibleJobs.map((job, index) => (
              <Link
                key={job.id}
                href={`/work?workJob=${encodeURIComponent(job.id)}`}
                className={styles.job}
              >
                <span className={styles.jobIndex}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className={styles.jobTitle}>
                  <strong>{job.title}</strong>
                  <span>
                    {job.steps.filter((step) => step.passed).length} /{' '}
                    {job.steps.length} ステップ
                  </span>
                </div>
                <span className={styles.jobStatus} data-status={job.status}>
                  {job.status === 'completed' ? <Check size={13} /> : <span />}
                  {statusNames[job.status]}
                </span>
                <ArrowUpRight size={17} />
              </Link>
            ))}
        </div>
      </section>
      <footer className={styles.footer}>
        <span>
          ROCKSTAROS <span className={styles.footerDivider}>/</span> DEVELOPER
          PREVIEW
        </span>
        <span>
          {date} <span className={styles.footerDivider}>/</span> WEB
        </span>
      </footer>

      <dialog
        ref={dialog}
        className={styles.palette}
        onClose={() => setPaletteOpen(false)}
        aria-labelledby="palette-title"
      >
        <div className={styles.paletteInner}>
          <header>
            <h2 id="palette-title">アプリを開く</h2>
            <button
              onClick={() => setPaletteOpen(false)}
              aria-label="ツール一覧を閉じる"
            >
              <X size={19} />
            </button>
          </header>
          <label className={styles.paletteSearch}>
            <Search size={18} />
            <input
              placeholder="ツールを探す"
              aria-label="ツールを検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className={styles.paletteResults}>
            {foundApps.map(({ name, description, href, Icon }) => (
              <Link
                href={href}
                key={href}
                onClick={() => setPaletteOpen(false)}
              >
                <Icon size={22} />
                <span>
                  <strong>{name}</strong>
                  <small>{description}</small>
                </span>
                <CornerDownLeft size={16} />
              </Link>
            ))}
            {!foundApps.length && <p>一致するツールがありません。</p>}
          </div>
          <footer>
            <kbd>esc</kbd> 閉じる <span>ROCKSTAROS / TOOLS</span>
          </footer>
        </div>
      </dialog>
    </main>
  );
}
