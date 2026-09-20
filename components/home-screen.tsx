'use client';

import {
  ChartNoAxesCombined,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  MessageCircle,
  RotateCcw,
  Settings2,
  ShieldCheck,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import styles from './home-screen.module.css';

type Wallpaper = 'aurora' | 'sky' | 'night' | 'ember';
type IconSize = 'small' | 'medium' | 'large';
type Preferences = {
  wallpaper: Wallpaper;
  iconSize: IconSize;
  showLabels: boolean;
  accent: string;
  appOrder: string[];
};
type HomeApp = {
  id: string;
  name: string;
  description: string;
  href: string;
  Icon: LucideIcon;
  color: string;
};

const STORAGE_KEY = 'rockstaros.home.preferences.v1';
const apps: HomeApp[] = [
  {
    id: 'sky',
    name: 'Sky',
    description: '自動化アプリを探して接続',
    href: '/sky',
    Icon: Cloud,
    color: 'sky',
  },
  {
    id: 'chat',
    name: 'Zema',
    description: 'ツールを選ぶ・頼む・結果を確認',
    href: '/chat',
    Icon: MessageCircle,
    color: 'chat',
  },
  {
    id: 'wallet',
    name: 'Wallet',
    description: '収支と資金を管理',
    href: '/wallet',
    Icon: WalletCards,
    color: 'wallet',
  },
  {
    id: 'market',
    name: 'Market',
    description: 'あらゆる価値をPAPER取引',
    href: '/market',
    Icon: ChartNoAxesCombined,
    color: 'market',
  },
  {
    id: 'settings',
    name: '設定',
    description: '接続・権限・更新・外観',
    href: '/settings',
    Icon: Settings2,
    color: 'settings',
  },
];
const appIds = apps.map(({ id }) => id);
const defaults: Preferences = {
  wallpaper: 'aurora',
  iconSize: 'medium',
  showLabels: true,
  accent: '#c8ff2e',
  appOrder: appIds,
};
const wallpaperOptions: { id: Wallpaper; label: string }[] = [
  { id: 'aurora', label: 'オーロラ' },
  { id: 'sky', label: 'スカイ' },
  { id: 'night', label: 'ナイト' },
  { id: 'ember', label: 'サンセット' },
];
const sizeOptions: { id: IconSize; label: string }[] = [
  { id: 'small', label: '小' },
  { id: 'medium', label: '標準' },
  { id: 'large', label: '大' },
];

function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Partial<Preferences>;
  const order = Array.isArray(candidate.appOrder)
    ? candidate.appOrder.filter((id) => appIds.includes(id))
    : [];
  for (const id of appIds) if (!order.includes(id)) order.push(id);
  return {
    wallpaper: wallpaperOptions.some(({ id }) => id === candidate.wallpaper)
      ? (candidate.wallpaper as Wallpaper)
      : defaults.wallpaper,
    iconSize: sizeOptions.some(({ id }) => id === candidate.iconSize)
      ? (candidate.iconSize as IconSize)
      : defaults.iconSize,
    showLabels:
      typeof candidate.showLabels === 'boolean'
        ? candidate.showLabels
        : defaults.showLabels,
    accent:
      typeof candidate.accent === 'string' &&
      /^#[0-9a-f]{6}$/i.test(candidate.accent)
        ? candidate.accent
        : defaults.accent,
    appOrder: order,
  };
}

export default function HomeScreen() {
  const [now, setNow] = useState<Date | null>(null);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preferences, setPreferences] = useState(defaults);
  const closeEditorButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      setNow(new Date());
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) setPreferences(normalizePreferences(JSON.parse(stored)));
      } catch {
        // Broken or unavailable device-local settings fall back to defaults.
      }
      if (new URLSearchParams(window.location.search).get('edit') === '1')
        setEditing(true);
      setLoaded(true);
    }, 0);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    void navigator.serviceWorker?.register('/sw.js').catch(() => {});
    return () => {
      window.clearTimeout(initialize);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Private browsing and locked-down devices can reject local writes.
    }
  }, [loaded, preferences]);

  useEffect(() => {
    if (!editing) return;
    closeEditorButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditing(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [editing]);

  const orderedApps = useMemo(
    () =>
      preferences.appOrder
        .map((id) => apps.find((app) => app.id === id))
        .filter((app): app is HomeApp => Boolean(app)),
    [preferences.appOrder],
  );

  function moveApp(id: string, direction: -1 | 1) {
    setPreferences((current) => {
      const order = [...current.appOrder];
      const from = order.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= order.length) return current;
      [order[from], order[to]] = [order[to], order[from]];
      return { ...current, appOrder: order };
    });
  }

  const time = now
    ? new Intl.DateTimeFormat('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now)
    : '--:--';
  const date = now
    ? new Intl.DateTimeFormat('ja-JP', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      }).format(now)
    : 'avocadoOS';

  return (
    <main
      className={styles.home}
      data-wallpaper={preferences.wallpaper}
      data-icon-size={preferences.iconSize}
      data-editing={editing ? 'true' : 'false'}
      style={{ '--home-accent': preferences.accent } as CSSProperties}
    >
      <div className={styles.noise} aria-hidden="true" />
      <header className={styles.statusBar}>
        <strong>{time}</strong>
        <span className={styles.statusName}>avocadoOS</span>
        <span className={styles.statusIcons} aria-label="Web版・端末内設定">
          <ShieldCheck size={15} />
          <span>WEB / LOCAL</span>
        </span>
      </header>

      <section className={styles.desktop} aria-label="avocadoOSホーム">
        <div className={styles.homeHeading}>
          <div>
            <p>{date}</p>
            <h1>{time}</h1>
          </div>
          <button
            className={styles.editButton}
            onClick={() => setEditing(true)}
            aria-label="ホーム画面を編集"
          >
            <Settings2 size={17} />
            編集
          </button>
        </div>

        <Link href="/sky" className={styles.skyWidget}>
          <span className={styles.widgetMark} aria-hidden="true">
            <ShieldCheck size={22} />
          </span>
          <span className={styles.widgetCopy}>
            <small>SKY AUTO</small>
            <strong>どのアプリを使う？</strong>
            <span>Skyからツールを選び、専用画面で入力・実行できます</span>
          </span>
          <span className={styles.widgetAction}>Skyを開く</span>
        </Link>

        <div className={styles.appGrid} aria-label="ホームアプリ">
          {orderedApps.map(({ id, name, description, href, Icon, color }) => (
            <div className={styles.appSlot} key={id}>
              <Link
                className={styles.appLink}
                href={href}
                aria-label={`${name} — ${description}`}
                onClick={(event) => {
                  if (editing) event.preventDefault();
                }}
              >
                <span className={`${styles.appIcon} ${styles[color]}`}>
                  <Icon size={34} strokeWidth={1.7} />
                </span>
                {preferences.showLabels && <span>{name}</span>}
              </Link>
              {editing && (
                <div
                  className={styles.orderControls}
                  aria-label={`${name}の並び順`}
                >
                  <button
                    onClick={() => moveApp(id, -1)}
                    disabled={preferences.appOrder[0] === id}
                    aria-label={`${name}を前へ`}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    onClick={() => moveApp(id, 1)}
                    disabled={preferences.appOrder.at(-1) === id}
                    aria-label={`${name}を後ろへ`}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.pageDots} aria-label="ホーム画面 1ページ目">
          <span />
          <i />
        </div>
      </section>

      <footer className={styles.homeIndicator} aria-hidden="true">
        <span />
      </footer>

      {editing && (
        <div
          className={styles.editorBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(false);
          }}
        >
          <dialog
            open
            className={styles.editor}
            aria-labelledby="home-editor-title"
            aria-modal="true"
          >
            <header>
              <div>
                <small>この端末だけに保存</small>
                <h2 id="home-editor-title">ホーム画面を編集</h2>
              </div>
              <button
                ref={closeEditorButton}
                onClick={() => setEditing(false)}
                aria-label="編集を閉じる"
              >
                <X size={20} />
              </button>
            </header>

            <div className={styles.editorSection}>
              <strong>壁紙</strong>
              <div className={styles.wallpaperChoices}>
                {wallpaperOptions.map(({ id, label }) => (
                  <button
                    key={id}
                    data-choice={id}
                    aria-pressed={preferences.wallpaper === id}
                    onClick={() =>
                      setPreferences((current) => ({
                        ...current,
                        wallpaper: id,
                      }))
                    }
                  >
                    <span>
                      {preferences.wallpaper === id && <Check size={17} />}
                    </span>
                    <small>{label}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.editorRow}>
              <span>
                <strong>アイコン</strong>
                <small>大きさ</small>
              </span>
              <div className={styles.segmented}>
                {sizeOptions.map(({ id, label }) => (
                  <button
                    key={id}
                    aria-pressed={preferences.iconSize === id}
                    onClick={() =>
                      setPreferences((current) => ({
                        ...current,
                        iconSize: id,
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label
              className={styles.editorRow}
              htmlFor="show-app-labels"
              aria-label="アプリ名の表示"
            >
              <span>
                <strong>アプリ名</strong>
                <small>アイコンの下に表示</small>
              </span>
              <input
                id="show-app-labels"
                className={styles.switch}
                type="checkbox"
                checked={preferences.showLabels}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    showLabels: event.target.checked,
                  }))
                }
              />
            </label>

            <label className={styles.editorRow} htmlFor="home-accent-color">
              <span>
                <strong>アクセント</strong>
                <small>ボタンと選択色</small>
              </span>
              <input
                id="home-accent-color"
                className={styles.colorInput}
                type="color"
                value={preferences.accent}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    accent: event.target.value,
                  }))
                }
                aria-label="アクセントカラー"
              />
            </label>

            <p className={styles.reorderHint}>
              ホーム上の矢印で、アプリの順番も変更できます。
            </p>
            <div className={styles.editorActions}>
              <button onClick={() => setPreferences(defaults)}>
                <RotateCcw size={16} />
                初期状態に戻す
              </button>
              <button onClick={() => setEditing(false)}>
                完了
                <Check size={17} />
              </button>
            </div>
          </dialog>
        </div>
      )}
    </main>
  );
}
