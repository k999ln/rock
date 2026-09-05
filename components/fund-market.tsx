'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Infinity as Loop,
  Search,
  BriefcaseBusiness,
  FilePenLine,
  Layers3,
  BookOpenCheck,
  AudioLines,
  Telescope,
  TrendingUp,
  Filter,
  ArrowUpRight,
  ArrowRight,
  Play,
  Zap,
  Cable,
  SlidersHorizontal,
  Wallet,
  Check,
  Sparkles,
  Clock3,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { FundDashboard } from '@/components/fund-dashboard';
import { DeviceConnection } from '@/components/device-connection';
import { CostCalculator } from '@/components/cost-calculator';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { catalog, type Automation } from '@/lib/catalog';
import { defaultFund, fundTools, type FundSnapshot } from '@/lib/fund';
import { deviceToken } from '@/lib/device';
import { parseAccounts, walletError, type WalletProvider } from '@/lib/wallet';

type Fund = {
  id: string;
  name: string;
  english: string;
  emoji: string;
  color: string;
  category: string;
  description: string;
  tools: string[];
  weights?: number[];
  label: string;
};
const funds: Fund[] = [
  {
    id: 'coconala',
    name: 'ココナラ ワークス',
    english: 'COCONALA WORKS',
    emoji: '💼',
    color: '#c9f66f',
    category: '仕事',
    description:
      '案件チェックから納品記録の照合まで。はじめの仕事を支えるファンド。',
    tools: ['coconala', 'mr-delivery'],
    weights: [65, 0, 0, 35],
    label: '仕事の準備をおまかせ',
  },
  {
    id: 'creator',
    name: 'クリエイターズ',
    english: 'CREATORS CLUB',
    emoji: '✍️',
    color: '#c5baff',
    category: '記事',
    description:
      '原稿を無料版に仕立てて、出典も整理。書いたものを届ける準備に。',
    tools: ['mr-free-article', 'mr-citations'],
    weights: [0, 60, 40, 0],
    label: '原稿を、次のかたちへ',
  },
  {
    id: 'loop',
    name: 'よくばり Rock star',
    english: 'ALL-IN ROCK STAR',
    emoji: '🪄',
    color: '#ffc7dc',
    category: 'ミックス',
    description:
      'いま使える4つの自動化を全部まとめて。自分に合う仕事を探そう。',
    tools: [...fundTools],
    weights: [40, 25, 20, 15],
    label: 'まずはいろいろ試そう',
  },
  {
    id: 'editor',
    name: '編集ラボ',
    english: 'EDITOR LAB',
    emoji: '📚',
    color: '#9de6e3',
    category: '記事',
    description:
      '出典整理を中心に、記事の無料版も。小さな編集作業をひとまとめに。',
    tools: ['mr-citations', 'mr-free-article'],
    weights: [0, 20, 80, 0],
    label: 'こまかな編集を軽くする',
  },
  {
    id: 'voice',
    name: 'ボイス ファクトリー',
    english: 'VOICE FACTORY',
    emoji: '🎙️',
    color: '#ffd98c',
    category: '音声',
    description:
      '音声を文字や記事に変えるプラン。文字起こしツールの組み込みを準備中。',
    tools: ['faster-whisper'],
    label: '声を、使えるテキストに',
  },
  {
    id: 'scout',
    name: 'リサーチ クルー',
    english: 'RESEARCH CREW',
    emoji: '🔭',
    color: '#b7d8ff',
    category: 'リサーチ',
    description:
      '情報収集の自動化を集めるプラン。実行できるツールの組み込みを準備中。',
    tools: ['playwright', 'transformers-js'],
    label: '次の可能性を見つけよう',
  },
];
const fundIcons: Record<string, typeof Layers3> = {
  coconala: BriefcaseBusiness,
  creator: FilePenLine,
  loop: Layers3,
  editor: BookOpenCheck,
  voice: AudioLines,
  scout: Telescope,
};
const matchedFund = (s: FundSnapshot) =>
  funds.find(
    (f) => JSON.stringify(f.weights) === JSON.stringify(s.plan.weights),
  )?.id || 'loop';
export default function FundMarket() {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('all'),
    [fundOpen, setFundOpen] = useState(false);
  const [selected, setSelected] = useState('coconala'),
    [filter, setFilter] = useState('all'),
    [snapshot, setSnapshot] = useState<FundSnapshot | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<Automation | null>(null),
    [panel, setPanel] = useState<'settings' | 'device' | 'wallet' | null>(null),
    [connected, setConnected] = useState(false),
    [runState, setRunState] = useState(''),
    [address, setAddress] = useState(''),
    [walletBusy, setWalletBusy] = useState(false),
    [walletMessage, setWalletMessage] = useState('');
  const provider = useRef<WalletProvider | undefined>(undefined);
  const refresh = useCallback(async (initial = false) => {
    try {
      const r = await fetch('/api/fund');
      const data = (await r.json()) as FundSnapshot & { error?: string };
      if (!r.ok) throw new Error(data.error);
      setSnapshot(data);
      if (initial && data.plan.joined) setSelected(matchedFund(data));
      setError('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '保存したプランを読み込めませんでした。',
      );
    }
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Server state is set only after the initial fetch.
    void refresh(true);
    const update = () => void refresh();
    const connection = () => setConnected(!!deviceToken());
    connection();
    const running = (e: Event) =>
      setRunState((e as CustomEvent<string>).detail);
    window.addEventListener('loop-fund-refresh', update);
    window.addEventListener('loop-device', connection);
    window.addEventListener('loop-run-state', running);
    return () => {
      window.removeEventListener('loop-fund-refresh', update);
      window.removeEventListener('loop-device', connection);
      window.removeEventListener('loop-run-state', running);
    };
  }, [refresh]);
  useEffect(() => {
    const eth = (window as Window & { ethereum?: WalletProvider }).ethereum;
    provider.current = eth;
    const accounts = (v: unknown) =>
      setAddress((current) => (current ? parseAccounts(v)[0] || '' : ''));
    const disconnect = () => setAddress('');
    eth?.on?.('accountsChanged', accounts);
    eth?.on?.('disconnect', disconnect);
    return () => {
      eth?.removeListener?.('accountsChanged', accounts);
      eth?.removeListener?.('disconnect', disconnect);
    };
  }, []);
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const ctx = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    const exposed = [
      {
        name: 'list_funds',
        description:
          'ファンドの中身と利用可能状態を取得。収益実績ではありません。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute(input: unknown) {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw new Error('空のオブジェクトが必要です。');
          return funds.map((f) => ({
            id: f.id,
            name: f.name,
            available: !!f.weights,
            tools: f.tools,
          }));
        },
      },
      {
        name: 'select_fund',
        description:
          '指定したファンドの中身を画面に表示。参加・実行・課金はしません。',
        inputSchema: {
          type: 'object',
          properties: {
            fundId: { type: 'string', enum: funds.map((f) => f.id) },
          },
          required: ['fundId'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute(input: unknown) {
          if (
            !input ||
            typeof input !== 'object' ||
            Object.keys(input).some((k) => k !== 'fundId')
          )
            throw new Error('fundIdを指定してください。');
          const f = funds.find(
            (f) => f.id === (input as { fundId?: unknown }).fundId,
          );
          if (!f) throw new Error('ファンドがありません。');
          setSelected(f.id);
          setFundOpen(true);
          setFilter('all');
          return new Promise((resolve) =>
            requestAnimationFrame(() =>
              resolve({ selected: f.id, available: !!f.weights }),
            ),
          );
        },
      },
    ];
    for (const t of exposed) {
      try {
        void Promise.resolve(
          ctx.registerTool(t, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
  const active = funds.find((f) => f.id === selected)!,
    available = !!active.weights,
    joined = !!snapshot?.plan.joined && matchedFund(snapshot) === selected;
  const visible = funds.filter(
    (f) =>
      (category === 'all' || f.category === category) &&
      (filter === 'all' ||
        (filter === 'mine'
          ? !!snapshot?.plan.joined && matchedFund(snapshot) === f.id
          : filter === 'ready'
            ? !!f.weights
            : !f.weights)) &&
      `${f.name} ${f.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const ActiveIcon = fundIcons[active.id];
  const readyTools = active.tools
    .map((id) => catalog.find((t) => t.id === id)!)
    .filter((t) => t.status === 'ready');
  const selectedPlan = snapshot?.plan || defaultFund;
  function openTool(t: Automation) {
    setFundOpen(false);
    setPanel(null);
    setTool(t);
  }
  async function join(fund: Fund = active) {
    if (!fund.weights || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const r = await fetch('/api/fund', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selectedPlan,
          joined: true,
          weights: fund.weights,
        }),
      });
      const data = (await r.json()) as FundSnapshot & { error?: string };
      if (!r.ok) throw new Error(data.error);
      setSnapshot(data);
      setMessage(
        fund.name + 'をマイファンドにしました。中のツールを使ってみよう。',
      );
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '参加設定を保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }
  async function connectWallet() {
    setWalletBusy(true);
    setWalletMessage('');
    try {
      const eth = provider.current;
      if (!eth)
        throw new Error('Ethereum対応ウォレットを開いてからお試しください。');
      const accounts = parseAccounts(
        await eth.request({ method: 'eth_requestAccounts' }),
      );
      if (!accounts[0]) throw new Error('アドレスを取得できませんでした。');
      setAddress(accounts[0]);
      setWalletMessage('アドレスを接続しました。署名や送金は行っていません。');
    } catch (e) {
      setWalletMessage(
        provider.current
          ? walletError(e)
          : e instanceof Error
            ? e.message
            : '接続できませんでした。',
      );
    } finally {
      setWalletBusy(false);
    }
  }
  function openFund(f: Fund) {
    setSelected(f.id);
    setFundOpen(true);
  }
  function openPanel(value: 'settings' | 'device' | 'wallet') {
    setFundOpen(false);
    setPanel(value);
  }
  return (
    <div className="market-shell">
      <header className="market-header">
        <div className="market-header-inner">
          <Link href="/" className="market-logo">
            <Loop size={32} strokeWidth={2.8} />
            <span>Rock star</span>
          </Link>
          <label className="market-search">
            <Search size={18} />
            <input
              type="search"
              aria-label="ファンドを検索"
              placeholder="ファンド・自動化を検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>/</kbd>
          </label>
          <div className="market-header-actions">
            <Link href="/work" className="market-text-button">仕事を進める</Link>
            <button
              className="market-text-button"
              onClick={() => openPanel('settings')}
            >
              使い方
            </button>
            <button
              className="market-text-button"
              onClick={() => openPanel('device')}
            >
              <Cable size={16} />
              {connected ? 'PC接続中' : 'MCP接続'}
            </button>
            <button
              className="market-primary"
              onClick={() => openPanel('wallet')}
            >
              {address
                ? `${address.slice(0, 6)}…${address.slice(-4)}`
                : 'ウォレットを接続'}
            </button>
          </div>
        </div>
      </header>
      <nav className="market-category-nav" aria-label="ファンドのカテゴリ">
        <div>
          <button
            className={category === 'all' ? 'active' : ''}
            onClick={() => setCategory('all')}
          >
            <TrendingUp size={17} />
            注目
          </button>
          <span className="nav-divider" />
          {['仕事', '記事', 'ミックス', '音声', 'リサーチ'].map((c) => (
            <button
              key={c}
              className={category === c ? 'active' : ''}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
          <button
            className="market-nav-right"
            onClick={() => {
              setCategory('all');
              setFilter('mine');
            }}
          >
            マイファンド <ChevronRight size={14} />
          </button>
        </div>
      </nav>
      <main className="market-main">
        <Link href="/work" className="market-mobile-work">
          <BriefcaseBusiness size={18} /> 仕事を進める
          <ArrowRight size={16} />
        </Link>
        <div className="market-toolbar">
          <div className="market-filter-tabs">
            {[
              ['all', 'すべて'],
              ['ready', '利用可能'],
              ['soon', '準備中'],
              ['mine', 'マイファンド'],
            ].map(([id, name]) => (
              <button
                key={id}
                className={filter === id ? 'active' : ''}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="market-sort">
            <Filter size={14} />
            {visible.length} ファンド{' '}
            <button onClick={() => openPanel('settings')}>
              配分・ブースト <SlidersHorizontal size={14} />
            </button>
          </div>
        </div>
        {(error || message) && (
          <output className={'market-notice ' + (error ? 'error' : '')}>
            {error || message}
            {error && (
              <button onClick={() => void refresh()}>再読み込み</button>
            )}
            {error.startsWith('サインイン') && (
              <button
                onClick={() =>
                  window.location.assign('/signin-with-chatgpt?return_to=/')
                }
              >
                サインイン
              </button>
            )}
          </output>
        )}
        <div className="market-grid">
          {visible.map((f) => {
            const mine =
              !!snapshot?.plan.joined && matchedFund(snapshot) === f.id;
            const Icon = fundIcons[f.id];
            const items = f.tools.map((id) =>
              catalog.find((t) => t.id === id)!,
            );
            return (
              <article key={f.id} className="market-card">
                <div className="market-card-heading">
                  <button
                    className={'market-fund-image image-' + f.id}
                    onClick={() => openFund(f)}
                    aria-label={f.name + 'の詳細'}
                  >
                    <Icon size={28} strokeWidth={1.8} />
                  </button>
                  <button
                    className="market-card-title"
                    onClick={() => openFund(f)}
                  >
                    <h2>{f.name}</h2>
                    <span>{f.category}ファンド</span>
                  </button>
                  {mine && (
                    <span className="market-owned">
                      <Check size={13} />
                    </span>
                  )}
                </div>
                <div className="market-card-summary">
                  <p>{f.description}</p>
                  <div className="market-tool-count">
                    <strong>{f.weights ? f.tools.length : '—'}</strong>
                    <span>{f.weights ? 'ツール' : '準備中'}</span>
                  </div>
                </div>
                <div className="market-outcomes">
                  {items.slice(0, 2).map((t) => (
                    <div className="market-outcome" key={t.id}>
                      <span>{t.name}</span>
                      {f.weights ? (
                        <button
                          onClick={() => {
                            setSelected(f.id);
                            openTool(t);
                          }}
                        >
                          使う <ArrowUpRight size={12} />
                        </button>
                      ) : (
                        <span className="market-pending">準備中</span>
                      )}
                    </div>
                  ))}
                  {items.length > 2 && (
                    <button className="market-more" onClick={() => openFund(f)}>
                      ほか {items.length - 2} ツール <ChevronRight size={12} />
                    </button>
                  )}
                </div>
                <div className="market-card-actions">
                  <button
                    className={'market-yes ' + (mine ? 'joined' : '')}
                    disabled={!f.weights || mine || saving || !snapshot}
                    onClick={() => {
                      setSelected(f.id);
                      void join(f);
                    }}
                  >
                    {mine ? '参加中' : f.weights ? '無料で参加' : '近日公開'}
                  </button>
                  <button className="market-no" onClick={() => openFund(f)}>
                    詳細を見る
                  </button>
                </div>
                <div className="market-card-meta">
                  <span>
                    <i className={f.weights ? 'available' : 'pending'} />
                    {f.weights ? '利用可能' : '準備中'}
                  </span>
                  <span>{f.weights ? 'ツール無料' : 'ソース確認中'}</span>
                  <button
                    onClick={() => openFund(f)}
                    aria-label={f.name + 'の運用状況'}
                  >
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {visible.length === 0 && (
          <section className="market-empty">
            <Search size={25} />
            <h2>該当するファンドがありません</h2>
            <p>カテゴリや検索条件を変えてお試しください。</p>
            <button
              className="market-primary"
              onClick={() => {
                setCategory('all');
                setFilter('all');
                setQuery('');
              }}
            >
              すべて表示
            </button>
          </section>
        )}
        <section className="market-overview">
          <div>
            <span>マイファンド</span>
            <strong>
              {snapshot?.plan.joined
                ? funds.find((f) => f.id === matchedFund(snapshot))?.name
                : '未参加'}
            </strong>
          </div>
          <div>
            <span>あなたの実行記録</span>
            <strong>
              {snapshot ? snapshot.totalRuns : '—'} <small>回</small>
            </strong>
          </div>
          <div>
            <span>最新の状態</span>
            <strong>
              {runState
                ? '実行中'
                : snapshot?.runs[0]
                  ? snapshot.runs[0].status === 'completed'
                    ? '処理完了'
                    : '要確認'
                  : '待機中'}
            </strong>
          </div>
          <div>
            <span>収益・入出金</span>
            <strong>未接続</strong>
          </div>
          <button onClick={() => openPanel('settings')}>
            運用の詳細 <ChevronRight size={15} />
          </button>
        </section>
        <p className="market-footnote">
          4つの利用可能な運用プランと、2つの準備中プラン。ツールの利用は無料です。支援・分配は試算段階で、売上・入金・送金は連携していません。
        </p>
      </main>
      <footer className="market-footer">
        <span>
          <Loop size={17} />
          Rock star
        </span>
        <button onClick={() => openPanel('device')}>MCP接続</button>
        <button onClick={() => openPanel('settings')}>ファンドのしくみ</button>
        <span className="market-copyright">Automation, together.</span>
      </footer>
      <Dialog open={fundOpen} onOpenChange={setFundOpen}>
        <DialogContent className="market-detail-dialog">
          <DialogTitle className="sr-only">{active.name}</DialogTitle>
          <DialogDescription className="sr-only">
            ファンドのツール・参加状態・配分案を確認できます。
          </DialogDescription>
          <aside
            id="fund-console"
            className="fund-console"
            style={{ '--active-color': active.color } as CSSProperties}
          >
            <div className="console-top">
              <span>YOUR FUND / 選んだファンド</span>
              <span className="console-dots">
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="console-selected">
              <span className="console-emoji" aria-hidden="true">
                <ActiveIcon size={29} />
              </span>
              <div>
                <span>{active.english}</span>
                <h2>{active.name}</h2>
                <span className="console-tag">
                  {joined
                    ? 'マイファンド'
                    : available
                      ? 'いま使える'
                      : '準備中'}
                </span>
              </div>
            </div>
            <p className="console-description">{active.description}</p>
            <div className="console-monitor">
              <div className="monitor-status">
                <span className={runState ? 'live-dot' : 'idle-dot'} />
                {runState
                  ? 'ツールを実行中'
                  : available
                    ? 'いつでもスタートできます'
                    : '新しいツールを準備しています'}
              </div>
              <div className="monitor-metrics">
                <div>
                  <span>あなたの実行記録</span>
                  <strong>
                    {snapshot ? snapshot.totalRuns : '—'}
                    <i>回</i>
                  </strong>
                </div>
                <div>
                  <span>収益データ</span>
                  <strong className="not-connected">未接続</strong>
                </div>
              </div>
              <div className="monitor-connection">
                <Cable size={13} />
                {connected
                  ? 'PCのMCPツールを利用できます'
                  : '文章ツールは接続なしでも使えます'}
              </div>
            </div>
            {available ? (
              <>
                <button
                  className="fund-start"
                  disabled={saving || joined || !snapshot}
                  onClick={() => void join()}
                >
                  {joined ? <Check size={18} /> : <Sparkles size={18} />}
                  <span>
                    {saving
                      ? '保存しています…'
                      : joined
                        ? 'このファンドに参加中'
                        : snapshot?.plan.joined
                          ? 'このファンドに切り替える'
                          : 'このファンドで始める'}
                    <small>
                      {joined
                        ? '中のツールから、すぐに実行できます'
                        : '参加 ¥0 / 入金は不要'}
                    </small>
                  </span>
                  <ArrowRight size={19} />
                </button>
                <div className="console-tool-list">
                  <div className="console-section-title">
                    入っている自動化 <span>{readyTools.length} TOOLS</span>
                  </div>
                  {readyTools.map((t) => (
                    <button
                      className="console-tool"
                      key={t.id}
                      onClick={() => openTool(t)}
                    >
                      <span>
                        <b>{t.name}</b>
                        <small>
                          {t.runner === 'delivery-local'
                            ? connected
                              ? 'PC · 接続済み'
                              : 'PC接続が必要'
                            : connected
                              ? 'PC · MCPで実行'
                              : 'ブラウザですぐ実行'}
                        </small>
                      </span>
                      <span className="play-circle">
                        <Play size={12} fill="currentColor" />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="coming-soon-panel">
                <Clock3 size={23} />
                <h3>次の仲間を準備中。</h3>
                <p>使えるようになった機能から、ここに追加します。</p>
                {active.tools.map((id) => {
                  const t = catalog.find((t) => t.id === id)!;
                  return (
                    <a
                      key={id}
                      href={t.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.name} のソース <ArrowUpRight size={13} />
                    </a>
                  );
                })}
              </div>
            )}
            <section className="mini-fund-split">
              <div className="console-section-title">
                成果の分け方 <span>分配案</span>
              </div>
              <div className="split-strip">
                <span style={{ flex: selectedPlan.basePercent || 0.01 }} />
                <span style={{ flex: selectedPlan.boostPercent || 0.01 }} />
                <span
                  style={{
                    flex:
                      100 -
                        selectedPlan.basePercent -
                        selectedPlan.boostPercent || 0.01,
                  }}
                />
              </div>
              <div className="split-labels">
                <span>
                  <b>{selectedPlan.basePercent}%</b>基本分配
                </span>
                <span>
                  <b>{selectedPlan.boostPercent}%</b>ブースト枠
                </span>
                <span>
                  <b>
                    {100 - selectedPlan.basePercent - selectedPlan.boostPercent}
                    %
                  </b>
                  共同留保
                </span>
              </div>
              <p>
                運用費と月最大 $8.88
                相当の利用料を引いた原資から。支援によるブーストも試算できます。
              </p>
              <button onClick={() => openPanel('settings')}>
                <Zap size={14} />
                ブースト・配分を試す <ChevronRight size={15} />
              </button>
            </section>
          </aside>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!tool}
        onOpenChange={(v) => {
          if (!v) setTool(null);
        }}
      >
        <DialogContent className="tool-dialog market-dialog">
          {tool && (
            <>
              <div className="dialog-kicker">{active.name} / AUTOMATION</div>
              <DialogTitle className="dialog-title">{tool.name}</DialogTitle>
              <DialogDescription>{tool.description}</DialogDescription>
              {tool.runner && <MrToolRunner key={tool.id} tool={tool.runner} />}
              <a
                className="text-link"
                href={tool.source}
                target="_blank"
                rel="noreferrer"
              >
                元のツール / MIT <ArrowUpRight size={15} />
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!panel}
        onOpenChange={(v) => {
          if (!v) {
            setPanel(null);
            void refresh();
          }
        }}
      >
        <DialogContent
          className={
            'market-dialog ' +
            (panel === 'wallet' ? 'wallet-dialog' : 'market-wide-dialog')
          }
        >
          <DialogTitle className="sr-only">
            {panel === 'settings'
              ? 'ファンドの配分とブースト'
              : panel === 'device'
                ? 'PC・MCP接続'
                : 'ウォレット接続'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            必要な設定をここで確認できます。
          </DialogDescription>
          {panel === 'settings' ? (
            <>
              <FundDashboard
                openTool={openTool}
                openConnection={() => openPanel('device')}
              />
              <details className="personal-cost-detail">
                <summary>自分の端末の電気代・通信費を試算</summary>
                <CostCalculator />
              </details>
            </>
          ) : panel === 'device' ? (
            <DeviceConnection />
          ) : panel === 'wallet' ? (
            <div className="market-wallet-panel">
              <Wallet size={31} />
              <h2>ウォレットでつながる。</h2>
              <p>
                Ethereum対応ウォレットのアドレスを接続します。署名・本人確認・送金はまだ行いません。
              </p>
              {address ? (
                <>
                  <code>{address}</code>
                  <button
                    className="secondary-button"
                    onClick={() => setAddress('')}
                  >
                    この画面の接続を解除
                  </button>
                </>
              ) : (
                <button
                  className="black-button"
                  disabled={walletBusy}
                  onClick={() => void connectWallet()}
                >
                  {walletBusy ? '接続を確認中…' : 'ウォレットを接続'}
                </button>
              )}
              {walletMessage && <output>{walletMessage}</output>}
              <small>ウォレットなしでもファンドとツールを使えます。</small>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
