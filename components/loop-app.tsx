'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  Cable,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Download,
  FilePenLine,
  Gauge,
  Home,
  Infinity as Loop,
  Layers3,
  LibraryBig,
  Play,
  Settings,
  Sparkles,
  Wallet,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { DeviceConnection } from '@/components/device-connection';
import { FundDashboard } from '@/components/fund-dashboard';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { catalog, type Automation } from '@/lib/catalog';
import { defaultFund, type FundSnapshot } from '@/lib/fund';
import { deviceToken, monitorDevice } from '@/lib/device';
import { operationRequest } from '@/lib/operations-client';
import type { OperationsSnapshot } from '@/lib/operations';
import {
  OperationsPanel,
  JobHistory,
  jobLabels,
} from '@/components/operations-panel';
import { parseAccounts, walletError, type WalletProvider } from '@/lib/wallet';

type View = 'home' | 'funds' | 'activity' | 'settings';
type Fund = {
  id: string;
  name: string;
  description: string;
  icon: typeof Layers3;
  tools: string[];
  weights?: number[];
  color: string;
};

const funds: Fund[] = [
  {
    id: 'coconala',
    name: 'ココナラ ワークス',
    description: '案件選びと納品前の確認をまとめます。',
    icon: BriefcaseBusiness,
    tools: ['coconala', 'mr-delivery'],
    weights: [65, 0, 0, 35],
    color: '#2f6fed',
  },
  {
    id: 'creator',
    name: 'クリエイターズ',
    description: '記事の無料版と出典整理をまとめます。',
    icon: FilePenLine,
    tools: ['mr-free-article', 'mr-citations'],
    weights: [0, 60, 40, 0],
    color: '#8a5cf6',
  },
  {
    id: 'loop',
    name: 'オールイン LOOP',
    description: 'いま使える4つの自動化を全部まとめます。',
    icon: Layers3,
    tools: ['coconala', 'mr-free-article', 'mr-citations', 'mr-delivery'],
    weights: [40, 25, 20, 15],
    color: '#0c9b71',
  },
  {
    id: 'editor',
    name: '編集ラボ',
    description: '出典整理を中心に記事制作を軽くします。',
    icon: BookOpenCheck,
    tools: ['mr-citations', 'mr-free-article'],
    weights: [0, 20, 80, 0],
    color: '#e87928',
  },
  {
    id: 'voice',
    name: 'ボイス ファクトリー',
    description: '音声を文字と記事へ変えるプランです。',
    icon: Activity,
    tools: ['faster-whisper'],
    color: '#65758b',
  },
];

const fundBySnapshot = (snapshot: FundSnapshot | null) => {
  if (!snapshot?.plan.joined) return funds[2];
  return (
    funds.find(
      (fund) =>
        fund.weights &&
        JSON.stringify(fund.weights) === JSON.stringify(snapshot.plan.weights),
    ) || funds[2]
  );
};

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function LoopApp() {
  const [view, setView] = useState<View>('home');
  const [snapshot, setSnapshot] = useState<FundSnapshot | null>(null);
  const [backend, setBackend] = useState<OperationsSnapshot | null>(null);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const refreshSequence = useRef(0);
  const [selectedFund, setSelectedFund] = useState<Fund | null>(null);
  const [tool, setTool] = useState<Automation | null>(null);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [runState, setRunState] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMessage, setWalletMessage] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );
  const [installHelp, setInstallHelp] = useState(false);
  const provider = useRef<WalletProvider | undefined>(undefined);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const [data, state] = await Promise.all([
        operationRequest<FundSnapshot>('/api/fund'),
        operationRequest<OperationsSnapshot>('/api/operations'),
      ]);
      if (sequence !== refreshSequence.current) return;
      setSnapshot(data);
      setBackend(state);
      setError('');
    } catch (cause) {
      if (sequence !== refreshSequence.current) return;
      setError(
        cause instanceof Error ? cause.message : '状態を読み込めませんでした。',
      );
    }
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Initial state arrives after the authenticated request.
    void refresh();
    const connection = () => setConnected(Boolean(deviceToken()));
    const running = (event: Event) =>
      setRunState((event as CustomEvent<string>).detail);
    connection();
    window.addEventListener('loop-device', connection);
    window.addEventListener('loop-fund-refresh', refresh);
    window.addEventListener('loop-run-state', running);
    const stopMonitor = monitorDevice();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15000);
    void navigator.serviceWorker?.register('/sw.js').catch(() => {});
    return () => {
      clearInterval(poll);
      stopMonitor();
      window.removeEventListener('loop-device', connection);
      window.removeEventListener('loop-fund-refresh', refresh);
      window.removeEventListener('loop-run-state', running);
    };
  }, [refresh]);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  useEffect(() => {
    const ethereum = (window as Window & { ethereum?: WalletProvider })
      .ethereum;
    provider.current = ethereum;
    const accounts = (value: unknown) =>
      setAddress((current) => (current ? parseAccounts(value)[0] || '' : ''));
    const disconnect = () => setAddress('');
    ethereum?.on?.('accountsChanged', accounts);
    ethereum?.on?.('disconnect', disconnect);
    return () => {
      ethereum?.removeListener?.('accountsChanged', accounts);
      ethereum?.removeListener?.('disconnect', disconnect);
    };
  }, []);

  useEffect(() => {
    type Context = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const webTools = [
      {
        name: 'get_loop_status',
        description: '現在のファンド、接続状態、実行回数を取得します。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute(input: unknown) {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw new Error('空のオブジェクトが必要です。');
          return {
            fund: fundBySnapshot(snapshot).name,
            connected,
            running: Boolean(runState),
            runs: snapshot?.totalRuns ?? null,
          };
        },
      },
      {
        name: 'open_loop_tool',
        description: '指定したLOOPツールの実行画面を開きます。',
        inputSchema: {
          type: 'object',
          properties: {
            toolId: {
              type: 'string',
              enum: [
                'coconala',
                'mr-free-article',
                'mr-citations',
                'mr-delivery',
              ],
            },
          },
          required: ['toolId'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute(input: unknown) {
          const id =
            input && typeof input === 'object'
              ? (input as { toolId?: unknown }).toolId
              : null;
          const candidate = catalog.find(
            (item) => item.id === id && item.runner,
          );
          if (!candidate) throw new Error('ツールが見つかりません。');
          setTool(candidate);
          return { opened: candidate.id };
        },
      },
    ];
    for (const webTool of webTools) {
      try {
        void Promise.resolve(
          context.registerTool(webTool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, [connected, runState, snapshot]);

  const activeFund = fundBySnapshot(snapshot);
  const ActiveIcon = activeFund.icon;
  const quickTools = activeFund.tools
    .map((id) => catalog.find((item) => item.id === id))
    .filter((item): item is Automation => Boolean(item?.runner));
  const allReadyTools = catalog.filter((item) => item.runner);

  async function joinFund(fund: Fund) {
    if (!fund.weights || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/fund', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(snapshot?.plan || defaultFund),
          joined: true,
          weights: fund.weights,
        }),
      });
      const data = (await response.json()) as FundSnapshot & { error?: string };
      if (!response.ok) throw new Error(data.error);
      setSnapshot(data);
      setSelectedFund(null);
      setMessage(`${fund.name}に切り替えました。`);
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }

  async function connectWallet() {
    setWalletBusy(true);
    setWalletMessage('');
    try {
      const ethereum = provider.current;
      if (!ethereum) throw new Error('対応ウォレットが見つかりません。');
      const accounts = parseAccounts(
        await ethereum.request({ method: 'eth_requestAccounts' }),
      );
      if (!accounts[0]) throw new Error('アドレスを取得できませんでした。');
      setAddress(accounts[0]);
      setWalletMessage('ウォレットを接続しました。送金は行っていません。');
    } catch (cause) {
      setWalletMessage(
        provider.current
          ? walletError(cause)
          : cause instanceof Error
            ? cause.message
            : '接続できませんでした。',
      );
    } finally {
      setWalletBusy(false);
    }
  }

  async function install() {
    if (!installPrompt) {
      setInstallHelp(true);
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function renderHome() {
    return (
      <>
        <section className="app-welcome">
          <div>
            <span>今日のLOOP</span>
            <h1>何を動かしますか？</h1>
          </div>
          <button className="app-install" onClick={() => void install()}>
            <Download size={16} /> アプリを追加
          </button>
        </section>
        <section className="app-fund-hero">
          <div className="app-fund-heading">
            <span
              className="app-fund-icon"
              style={{ background: activeFund.color }}
            >
              <ActiveIcon size={27} />
            </span>
            <div>
              <small>マイファンド</small>
              <h2>
                {snapshot?.plan.joined ? activeFund.name : 'ファンドを選ぶ'}
              </h2>
            </div>
            <button
              onClick={() => setView('funds')}
              aria-label="ファンドを変更"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="app-status-line">
            <span className={runState ? 'app-dot running' : 'app-dot'} />
            {runState ? 'ツールを実行しています' : '実行できます'}
            <span className="app-status-spacer" />
            {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
            {connected ? 'PC接続中' : 'ブラウザ実行'}
          </div>
        </section>
        <section className="app-section">
          <div className="app-section-heading">
            <h2>すぐに実行</h2>
            <button onClick={() => setView('funds')}>すべて見る</button>
          </div>
          <div className="app-actions">
            {(quickTools.length ? quickTools : allReadyTools).map((item) => (
              <button
                key={item.id}
                onClick={() => setTool(item)}
                disabled={
                  backend?.tools.find((t) => t.tool === item.id)?.enabled ===
                  false
                }
              >
                <span className={`app-action-icon action-${item.color}`}>
                  <Play size={18} fill="currentColor" />
                </span>
                <span>
                  <b>{item.name}</b>
                  <small>
                    {backend?.tools.find((t) => t.tool === item.id)?.enabled ===
                    false
                      ? '設定で停止中'
                      : item.runner === 'delivery-local'
                        ? connected
                          ? 'PCで実行'
                          : 'PC接続が必要'
                        : connected
                          ? 'PCで実行'
                          : 'この端末で実行'}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </section>
        <section className="app-glance">
          <article>
            <Gauge size={19} />
            <span>実行回数</span>
            <strong>{snapshot?.totalRuns ?? '—'}</strong>
          </article>
          <article>
            <Clock3 size={19} />
            <span>最新の状態</span>
            <strong>
              {runState
                ? '実行中'
                : backend?.jobs[0]
                  ? jobLabels[backend.jobs[0].status]
                  : snapshot?.runs[0]
                    ? snapshot.runs[0].status === 'completed'
                      ? '完了'
                      : '要確認'
                    : '待機中'}
            </strong>
          </article>
          <article>
            <Sparkles size={19} />
            <span>収益連携</span>
            <strong>未接続</strong>
          </article>
        </section>
        <button
          className="app-connection-card"
          onClick={() => setDeviceOpen(true)}
        >
          <span>
            <Cable size={21} />
          </span>
          <div>
            <b>{connected ? 'PCと接続済み' : 'PCの自動化も使う'}</b>
            <small>
              {connected
                ? 'MCP経由でワンボタン実行できます'
                : '初回だけPC接続アプリを起動します'}
            </small>
          </div>
          <ArrowRight size={18} />
        </button>
      </>
    );
  }

  function renderFunds() {
    return (
      <section className="app-page">
        <div className="app-page-heading">
          <span>FUNDS</span>
          <h1>ファンドを選ぶ</h1>
          <p>使いたい自動化をまとめて切り替えます。</p>
        </div>
        <div className="app-fund-list">
          {funds.map((fund) => {
            const Icon = fund.icon;
            const active = snapshot?.plan.joined && activeFund.id === fund.id;
            return (
              <button key={fund.id} onClick={() => setSelectedFund(fund)}>
                <span className="app-list-icon" style={{ color: fund.color }}>
                  <Icon size={24} />
                </span>
                <span className="app-list-copy">
                  <b>{fund.name}</b>
                  <small>{fund.description}</small>
                  <em>
                    {fund.weights
                      ? `${fund.tools.length}ツール · 利用可能`
                      : '準備中'}
                  </em>
                </span>
                {active ? (
                  <span className="app-active-badge">
                    <Check size={14} />
                    使用中
                  </span>
                ) : (
                  <ChevronRight size={19} />
                )}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderActivity() {
    return (
      <section className="app-page">
        <div className="app-page-heading">
          <span>ACTIVITY</span>
          <h1>実行履歴</h1>
          <p>開始待ちから完了までの状態を確認できます。</p>
        </div>
        <JobHistory
          data={backend}
          legacy={snapshot?.runs}
          refresh={refresh}
          openTool={(id) => {
            const item = catalog.find((t) => t.id === id);
            if (item) setTool(item);
          }}
        />
      </section>
    );
  }

  function renderSettings() {
    return (
      <section className="app-page">
        <div className="app-page-heading">
          <span>SETTINGS</span>
          <h1>設定</h1>
        </div>
        <div className="app-settings-list">
          <button onClick={() => setOperationsOpen(true)}>
            <span>
              <Gauge size={20} />
            </span>
            <div>
              <b>運用管理・収支記録</b>
              <small>ツール停止、接続端末、利用量、売上と経費</small>
            </div>
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setDeviceOpen(true)}>
            <span>
              <Cable size={20} />
            </span>
            <div>
              <b>PC接続</b>
              <small>{connected ? '接続中' : '未接続'}</small>
            </div>
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setWalletOpen(true)}>
            <span>
              <Wallet size={20} />
            </span>
            <div>
              <b>ウォレット</b>
              <small>{address ? `${address.slice(0, 8)}…` : '未接続'}</small>
            </div>
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setDetailsOpen(true)}>
            <span>
              <Layers3 size={20} />
            </span>
            <div>
              <b>配分・ブースト</b>
              <small>試算と運用ルール</small>
            </div>
            <ChevronRight size={18} />
          </button>
          <button onClick={() => void install()}>
            <span>
              <Download size={20} />
            </span>
            <div>
              <b>ホーム画面に追加</b>
              <small>アプリとして起動できます</small>
            </div>
            <ChevronRight size={18} />
          </button>
        </div>
        <p className="app-settings-note">
          LOOPのツールは無料です。売上・入金・送金はまだ連携していません。
        </p>
      </section>
    );
  }

  return (
    <div className="native-app">
      <aside className="app-sidebar">
        <div className="app-brand">
          <Loop size={28} />
          <b>LOOP</b>
        </div>
        <AppNavigation view={view} setView={setView} />
        <button
          className="app-side-connect"
          onClick={() => setDeviceOpen(true)}
        >
          {connected ? <Wifi size={17} /> : <WifiOff size={17} />}
          <span>
            <b>{connected ? 'PC接続中' : 'PC未接続'}</b>
            <small>MCPの状態</small>
          </span>
        </button>
      </aside>
      <div className="app-stage">
        <header className="app-topbar">
          <div className="app-brand app-brand-mobile">
            <Loop size={26} />
            <b>LOOP</b>
          </div>
          <span className="app-view-name">
            {view === 'home'
              ? 'ホーム'
              : view === 'funds'
                ? 'ファンド'
                : view === 'activity'
                  ? '履歴'
                  : '設定'}
          </span>
          <button className="app-profile" onClick={() => setWalletOpen(true)}>
            {address ? (
              <span>{address.slice(2, 4).toUpperCase()}</span>
            ) : (
              <CircleUserRound size={24} />
            )}
          </button>
        </header>
        <main className="app-content">
          {(message || error) && (
            <output className={`app-message ${error ? 'error' : ''}`}>
              {error || message}
              {error ? (
                <button onClick={() => void refresh()}>再読込</button>
              ) : null}
            </output>
          )}
          {view === 'home'
            ? renderHome()
            : view === 'funds'
              ? renderFunds()
              : view === 'activity'
                ? renderActivity()
                : renderSettings()}
        </main>
      </div>
      <nav className="app-bottom-nav" aria-label="アプリのメニュー">
        <AppNavigation view={view} setView={setView} />
      </nav>

      <Dialog
        open={Boolean(tool)}
        onOpenChange={(open) => !open && !runState && setTool(null)}
      >
        <DialogContent className="app-tool-dialog">
          {tool ? (
            <>
              <DialogTitle>{tool.name}</DialogTitle>
              <DialogDescription>{tool.description}</DialogDescription>
              {tool.runner && tool.runner !== 'candidate-local' ? (
                <MrToolRunner key={tool.id} tool={tool.runner} />
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(selectedFund)}
        onOpenChange={(open) => !open && setSelectedFund(null)}
      >
        <DialogContent className="app-sheet-dialog">
          {selectedFund ? (
            <>
              <DialogTitle>{selectedFund.name}</DialogTitle>
              <DialogDescription>{selectedFund.description}</DialogDescription>
              <div className="app-sheet-tools">
                {selectedFund.tools.map((id) => {
                  const item = catalog.find((candidate) => candidate.id === id);
                  return <span key={id}>{item?.name || id}</span>;
                })}
              </div>
              {selectedFund.weights ? (
                <button
                  className="app-primary-button"
                  disabled={saving}
                  onClick={() => void joinFund(selectedFund)}
                >
                  {saving ? '切り替え中…' : 'このファンドを使う'}{' '}
                  <ArrowRight size={17} />
                </button>
              ) : (
                <p className="app-coming-soon">
                  準備中です。利用可能になった機能から追加します。
                </p>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}>
        <DialogContent className="app-wide-dialog">
          <DialogTitle className="sr-only">PC接続</DialogTitle>
          <DialogDescription className="sr-only">
            PCとの接続を設定します。
          </DialogDescription>
          <DeviceConnection />
        </DialogContent>
      </Dialog>
      <Dialog open={operationsOpen} onOpenChange={setOperationsOpen}>
        <DialogContent className="app-wide-dialog">
          <DialogTitle>運用管理・収支記録</DialogTitle>
          <DialogDescription>
            自分のツール、端末と記録を管理します。
          </DialogDescription>
          <OperationsPanel data={backend} refresh={refresh} />
        </DialogContent>
      </Dialog>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="app-wide-dialog">
          <DialogTitle className="sr-only">配分とブースト</DialogTitle>
          <DialogDescription className="sr-only">
            ファンドの試算条件を設定します。
          </DialogDescription>
          <FundDashboard
            openTool={(item) => {
              setDetailsOpen(false);
              setTool(item);
            }}
            openConnection={() => {
              setDetailsOpen(false);
              setDeviceOpen(true);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={walletOpen} onOpenChange={setWalletOpen}>
        <DialogContent className="app-sheet-dialog">
          <DialogTitle>ウォレット</DialogTitle>
          <DialogDescription>
            アドレスの接続だけを行います。署名や送金はしません。
          </DialogDescription>
          {address ? (
            <div className="app-wallet-connected">
              <Check size={18} />
              <code>{address}</code>
              <button onClick={() => setAddress('')}>この画面から解除</button>
            </div>
          ) : (
            <button
              className="app-primary-button"
              disabled={walletBusy}
              onClick={() => void connectWallet()}
            >
              <Wallet size={17} />
              {walletBusy ? '確認中…' : 'ウォレットを接続'}
            </button>
          )}
          {walletMessage ? (
            <output className="app-inline-message">{walletMessage}</output>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={installHelp} onOpenChange={setInstallHelp}>
        <DialogContent className="app-sheet-dialog">
          <DialogTitle>LOOPをアプリに追加</DialogTitle>
          <DialogDescription>
            iPhoneは共有メニューから「ホーム画面に追加」、AndroidやPCはブラウザメニューから「アプリをインストール」を選んでください。
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AppNavigation({
  view,
  setView,
}: {
  view: View;
  setView: (view: View) => void;
}) {
  const items: { id: View; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'ホーム', icon: Home },
    { id: 'funds', label: 'ファンド', icon: LibraryBig },
    { id: 'activity', label: '履歴', icon: Activity },
    { id: 'settings', label: '設定', icon: Settings },
  ];
  return (
    <div className="app-nav-items">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={view === item.id ? 'active' : ''}
            onClick={() => setView(item.id)}
          >
            <Icon size={20} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
