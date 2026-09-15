'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  BriefcaseBusiness,
  CheckCircle2,
  EyeOff,
  FileCheck2,
  FilePenLine,
  Lightbulb,
  Link2,
  LoaderCircle,
  MessageCircle,
  Network,
  PackagePlus,
  Scale,
  Search,
  Send,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Table2,
  WalletCards,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { catalog, type Automation } from '@/lib/catalog';
import { deviceToken } from '@/lib/device';
import { fashionMcpConnected } from '@/lib/fashion-mcp-client';
import { routeSkyRequest, skyRoles } from '@/lib/sky-routing';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { DeviceConnection } from '@/components/device-connection';
import { FashionBrandOpsRunner } from '@/components/fashion-brand-ops-runner';
import SkyMcpCenter from '@/components/sky-mcp-center';
import SkyPublisherForm from '@/components/sky-publisher-form';
import WorkspaceShell from '@/components/workspace-shell';
import {
  ExecutionSignin,
  useExecutionAccess,
} from '@/components/execution-access';
import {
  operationRequest,
  OperationRequestError,
} from '@/lib/operations-client';
import type { SkyConnection } from '@/lib/operations';

type FeedFilter = 'おすすめ' | '今使える' | '導入候補';

const feedFilters: FeedFilter[] = ['おすすめ', '今使える', '導入候補'];
const icons: Record<string, LucideIcon> = {
  'rockstar-csv-cleanup': Table2,
  'mercari-revenue': ShoppingBag,
  'fashion-brand-ops': Shirt,
  coconala: BriefcaseBusiness,
  'mr-free-article': FilePenLine,
  'mr-citations': BookOpenCheck,
  'mr-delivery': FileCheck2,
  'rockstar-ledger': WalletCards,
  'rockstar-legal-intake': Scale,
  'rockstar-patent-assistant': Lightbulb,
};
const providers: Record<
  string,
  { name: string; handle: string; initial: string }
> = {
  'rockstar-csv-cleanup': {
    name: 'Sky CSV自動化役',
    handle: '@sky_csv',
    initial: '表',
  },
  'mercari-revenue': {
    name: 'Sky 販売収益化役',
    handle: '@sky_income',
    initial: '売',
  },
  'fashion-brand-ops': {
    name: 'Sky ブランド運営役',
    handle: '@sky_brand',
    initial: '服',
  },
  coconala: { name: 'Sky 案件判断役', handle: '@sky_case', initial: '案' },
  'mr-free-article': {
    name: 'Sky 記事編集役',
    handle: '@sky_editor',
    initial: '編',
  },
  'mr-citations': {
    name: 'Sky 出典整理役',
    handle: '@sky_sources',
    initial: '出',
  },
  'mr-delivery': {
    name: 'Sky 納品確認役',
    handle: '@sky_delivery',
    initial: '納',
  },
  'rockstar-ledger': {
    name: 'Sky サブスク顧問',
    handle: '@sky_subscriptions',
    initial: '顧',
  },
  'rockstar-legal-intake': {
    name: 'Sky 法務受付',
    handle: '@sky_legal',
    initial: '法',
  },
  'rockstar-patent-assistant': {
    name: 'Sky 特許出願担当',
    handle: '@sky_patent',
    initial: '特',
  },
  'faster-whisper': { name: 'SYSTRAN', handle: '@systran', initial: 'S' },
  'transformers-js': {
    name: 'Hugging Face',
    handle: '@huggingface',
    initial: 'H',
  },
  playwright: { name: 'Microsoft', handle: '@microsoft', initial: 'M' },
};
function providerFor(tool: Automation) {
  return (
    providers[tool.id] ?? {
      name: 'Sky ツール案内',
      handle: '@sky_tools',
      initial: 'M',
    }
  );
}
function statusFor(tool: Automation, fashionConnected = false) {
  if (tool.status === 'candidate')
    return {
      label: '導入候補',
      detail: 'Skyからの実行は未対応',
      className: 'is-candidate',
    };
  if (tool.runner === 'delivery-local')
    return {
      label: 'PC接続後',
      detail: '利用者のPCで実行',
      className: 'is-connect',
    };
  if (tool.integration === 'fashion-brand-ops')
    return {
      label: fashionConnected ? '接続済み' : 'PCなしのブラウザ簡易版',
      detail: fashionConnected ? '41操作を利用可能' : '必要ならPCのMCPへ接続',
      className: fashionConnected ? 'is-ready' : 'is-connect',
    };
  if (tool.runner === 'subscription-ledger')
    return {
      label: 'PC / MCP',
      detail: 'SkyからPC上の専用システムへ接続',
      className: 'is-connect',
    };
  if (tool.id === 'rockstar-csv-cleanup')
    return {
      label: '今使える',
      detail: 'Skyの自動化Toolとして実行',
      className: 'is-ready',
    };
  return {
    label: '今使える',
    detail: 'ブラウザ内で実行',
    className: 'is-ready',
  };
}

function roleFor(tool: Automation) {
  return (
    skyRoles.find((role) => role.toolId === tool.id)?.label ?? 'ツール案内役'
  );
}

export default function SkyWorkspace({
  initialMcpOpen = false,
  initialPublishOpen = false,
}: {
  initialMcpOpen?: boolean;
  initialPublishOpen?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FeedFilter>('おすすめ');
  const [selected, setSelected] = useState<Automation | null>(null);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(initialMcpOpen);
  const [publishOpen, setPublishOpen] = useState(initialPublishOpen);
  const [connected, setConnected] = useState(false);
  const [fashionConnected, setFashionConnected] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [lastRequest, setLastRequest] = useState('');
  const [routedTool, setRoutedTool] = useState<Automation | null>(null);
  const [routeMessage, setRouteMessage] = useState('');
  const [connectedTools, setConnectedTools] = useState<string[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const { needsSignin, setNeedsSignin } = useExecutionAccess();
  const router = useRouter();
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updateConnection = () => setConnected(Boolean(deviceToken()));
    updateConnection();
    window.addEventListener('loop-device', updateConnection);
    return () => window.removeEventListener('loop-device', updateConnection);
  }, []);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const update = () => setFashionConnected(fashionMcpConnected());
    update();
    window.addEventListener('sky-fashion-mcp', update);
    return () => window.removeEventListener('sky-fashion-mcp', update);
  }, []);

  useEffect(() => {
    let active = true;
    void operationRequest<SkyConnection[]>('/api/sky/connections')
      .then((connections) => {
        if (active) setConnectedTools(connections.map(({ tool }) => tool));
      })
      .catch((error) => {
        if (
          active &&
          error instanceof OperationRequestError &&
          error.status === 401
        )
          setNeedsSignin(true);
      })
      .finally(() => {
        if (active) setConnectionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [setNeedsSignin]);

  const visibleTools = catalog.filter((tool) => {
    const matchesFilter =
      filter === 'おすすめ' ||
      (filter === '今使える' && tool.status === 'ready') ||
      (filter === '導入候補' && tool.status === 'candidate');
    const provider = providerFor(tool);
    const text =
      tool.name +
      ' ' +
      tool.description +
      ' ' +
      tool.category +
      ' ' +
      provider.name;
    return (
      matchesFilter && text.toLowerCase().includes(query.trim().toLowerCase())
    );
  });

  function openConnectedTool(tool: Automation) {
    setSelected(null);
    router.push(tool.launchPath ?? `/chat?tool=${encodeURIComponent(tool.id)}`);
  }

  function primaryAction(tool: Automation) {
    if (tool.status === 'candidate') {
      setSelected(tool);
      return;
    }
    if (tool.runner === 'delivery-local') {
      setDeviceOpen(true);
      return;
    }
    if (tool.launchPath) {
      openConnectedTool(tool);
      return;
    }
    if (connectedTools.includes(tool.id)) {
      openConnectedTool(tool);
      return;
    }
    setConnectionError('');
    setSelected(tool);
  }

  async function connectSelected() {
    if (!selected?.runner || connectionBusy) return;
    setConnectionBusy(true);
    setConnectionError('');
    try {
      const connection = await operationRequest<SkyConnection>(
        '/api/sky/connections',
        'PUT',
        { tool: selected.id },
      );
      setConnectedTools((current) =>
        current.includes(connection.tool)
          ? current
          : [...current, connection.tool],
      );
    } catch (error) {
      if (error instanceof OperationRequestError && error.status === 401)
        setNeedsSignin(true);
      else
        setConnectionError(
          error instanceof Error ? error.message : '接続できませんでした。',
        );
    } finally {
      setConnectionBusy(false);
    }
  }

  function chooseRole(tool: Automation, request = '') {
    setLastRequest(request);
    setRoutedTool(tool);
    setRouteMessage(
      `${roleFor(tool)}が進めます。内容を確認してツールを開いてください。`,
    );
  }

  function openRole(tool: Automation, request = '') {
    chooseRole(tool, request);
    primaryAction(tool);
  }

  function submitRequest(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = requestText.trim();
    if (!request) return;
    const role = routeSkyRequest(request);
    setRequestText('');
    setLastRequest(request);
    if (role) {
      const tool = catalog.find((item) => item.id === role.toolId);
      if (tool) chooseRole(tool, request);
      return;
    }
    setRoutedTool(null);
    setRouteMessage(
      '近い役割を選んでください。選ぶと、その担当につながります。',
    );
  }

  return (
    <WorkspaceShell
      running={running}
      title="Sky"
      contentClassName="sky-main-feed"
      onConnect={() => setDeviceOpen(true)}
    >
      <div className="sky-feed-layout">
        <section className="sky-feed-column" aria-labelledby="sky-feed-title">
          <SkyMcpCenter
            open={mcpOpen}
            connected={connected}
            onOpenChange={setMcpOpen}
            onOpenDevice={() => setDeviceOpen(true)}
          />
          <section
            className="sky-assistant"
            aria-labelledby="sky-assistant-title"
          >
            <div className="sky-assistant-avatar" aria-hidden="true">
              <span>S</span>
            </div>
            <div className="sky-assistant-body">
              <h2 id="sky-assistant-title" className="sr-only">
                Skyに頼む
              </h2>
              <form className="sky-assistant-composer" onSubmit={submitRequest}>
                <input
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  placeholder="何をしてほしい？"
                  aria-label="Skyへの依頼"
                />
                <button
                  disabled={!requestText.trim()}
                  aria-label="Skyへ依頼を送る"
                >
                  <Send size={18} />
                  <span>送信</span>
                </button>
              </form>
              <div className="sky-role-list" aria-label="Skyの役割">
                {skyRoles.map((role) => {
                  const tool = catalog.find((item) => item.id === role.toolId)!;
                  return (
                    <button
                      key={role.toolId}
                      onClick={() => openRole(tool, role.label)}
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>
              {routeMessage && (
                <output className="sky-route-reply">
                  <div className="sky-route-conversation">
                    {lastRequest && (
                      <p className="sky-route-request">{lastRequest}</p>
                    )}
                    <p className="sky-route-answer">{routeMessage}</p>
                  </div>
                  {routedTool && (
                    <button onClick={() => primaryAction(routedTool)}>
                      {routedTool.runner === 'delivery-local'
                        ? 'PC接続へ'
                        : 'ツールを開く'}
                      <ArrowRight size={15} />
                    </button>
                  )}
                </output>
              )}
            </div>
          </section>

          <header className="sky-feed-header">
            <div className="sky-store-title">
              <span>Sky</span>
              <h1 id="sky-feed-title">アプリ</h1>
            </div>
            <Tabs
              value={filter}
              onValueChange={(value) => setFilter(value as FeedFilter)}
            >
              <TabsList
                className="sky-feed-tabs"
                aria-label="Sky Timelineの表示"
              >
                {feedFilters.map((item) => (
                  <TabsTrigger key={item} value={item}>
                    {item}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="sky-feed-header-actions">
              <Link
                href="/chat"
                aria-label="Zemaを開く"
                className="sky-header-action"
              >
                <MessageCircle size={19} />
              </Link>
              <button
                className="sky-header-action"
                aria-label="MCP接続・管理"
                onClick={() => setMcpOpen(true)}
              >
                <Network size={19} />
                <span>MCP</span>
              </button>
              <button
                className="sky-header-action"
                aria-label="MCP接続・管理"
                onClick={() => setMcpOpen(true)}
              >
                <Network size={19} />
                <span>MCP</span>
              </button>
              <button
                className="sky-header-action"
                aria-label={searchOpen ? '検索を閉じる' : 'ツールを検索'}
                aria-expanded={searchOpen}
                onClick={() => {
                  setSearchOpen((open) => !open);
                  if (searchOpen) setQuery('');
                }}
              >
                {searchOpen ? <X size={19} /> : <Search size={19} />}
                <span>{searchOpen ? '閉じる' : '検索'}</span>
              </button>
              <button
                aria-label="Skyにツールを掲載"
                className="sky-header-action"
                onClick={() => setPublishOpen(true)}
              >
                <PackagePlus size={19} />
                <span>掲載</span>
              </button>
            </div>
          </header>

          {(searchOpen || query) && (
            <div className="sky-feed-search">
              <Search size={18} />
              <input
                type="search"
                aria-label="Skyを検索"
                placeholder="ツール名・できることで検索"
                value={query}
                ref={searchInput}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button aria-label="検索をクリア" onClick={() => setQuery('')}>
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          <div className="sky-feed" aria-live="polite">
            {visibleTools.map((tool, index) => {
              const Icon = icons[tool.id] ?? Link2;
              const provider = providerFor(tool);
              const status = statusFor(tool, fashionConnected);
              return (
                <article
                  className={'sky-feed-post ' + status.className}
                  key={tool.id}
                  style={{ '--sky-index': index } as CSSProperties}
                >
                  <div className="sky-timeline-node" aria-hidden="true">
                    <span
                      className={'sky-provider-avatar rock-icon-' + tool.color}
                    >
                      {provider.initial}
                    </span>
                  </div>
                  <div className="sky-post-body">
                    <div className="sky-post-meta-row">
                      <div className="sky-post-author">
                        <strong>{provider.name}</strong>
                        {tool.status === 'ready' && (
                          <BadgeCheck
                            className="sky-role-verified"
                            size={16}
                            aria-label="Skyで利用可能"
                          />
                        )}
                        <span>{provider.handle}</span>
                      </div>
                      <span className={'sky-post-state ' + status.className}>
                        <i aria-hidden="true" />
                        {status.label}
                      </span>
                    </div>
                    <div className="sky-post-open">
                      <span
                        className={'rock-tool-icon rock-icon-' + tool.color}
                      >
                        <Icon size={22} strokeWidth={1.7} />
                      </span>
                      <span>
                        <small>{roleFor(tool)}</small>
                        <strong>{tool.name}</strong>
                      </span>
                    </div>
                    <p className="sky-post-description">{tool.description}</p>
                    <p className="sky-post-place">{status.detail}</p>
                    <div className="sky-post-actions">
                      <button
                        className="sky-post-primary"
                        onClick={() => primaryAction(tool)}
                      >
                        {tool.status === 'ready' &&
                          tool.runner !== 'delivery-local' &&
                          connectedTools.includes(tool.id) && (
                            <Zap size={16} fill="currentColor" />
                          )}
                        {tool.status === 'candidate'
                          ? '詳細'
                          : tool.launchPath
                            ? '使う'
                            : tool.runner === 'delivery-local'
                              ? 'PC接続'
                              : connectedTools.includes(tool.id)
                                ? '頼む'
                                : '接続'}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {visibleTools.length === 0 && (
              <div className="sky-feed-empty">
                <Search size={25} />
                <strong>見つかりませんでした</strong>
                <p>検索を消すか、別のタブを選んでください。</p>
                <button
                  onClick={() => {
                    setQuery('');
                    setFilter('おすすめ');
                  }}
                >
                  すべて表示
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !running) setSelected(null);
        }}
      >
        <DialogContent
          initialFocus={
            selected?.runner === 'legal-intake' ||
            selected?.runner === 'patent-assistant'
              ? false
              : undefined
          }
          className={`rock-tool-dialog sky-tool-dialog sky-connect-dialog ${
            selected?.runner === 'legal-intake' ||
            selected?.runner === 'patent-assistant'
              ? 'sky-tool-dialog-wide'
              : ''
          }`}
        >
          {selected && (
            <>
              <div className="sky-connect-title-row">
                <span
                  className={'rock-tool-icon rock-icon-' + selected.color}
                  aria-hidden="true"
                >
                  {(() => {
                    const Icon = icons[selected.id] ?? Link2;
                    return <Icon size={22} strokeWidth={1.8} />;
                  })()}
                </span>
                <div>
                  <p className="rock-eyebrow">{roleFor(selected)}</p>
                  <DialogTitle className="rock-dialog-title">
                    {selected.name}
                  </DialogTitle>
                </div>
              </div>

              {selected.status === 'candidate' ? (
                <>
                  <DialogDescription className="rock-dialog-description">
                    {selected.description}
                  </DialogDescription>
                  <div className="sky-candidate-state">
                    まだSkyからは接続できません。導入確認中です。
                  </div>
                </>
              ) : selected.integration === 'fashion-brand-ops' ? (
                <>
                  <DialogDescription className="rock-dialog-description">
                    PCの接続アプリへ1クリックで接続し、41操作をSkyから利用できます。
                  </DialogDescription>
                  <FashionBrandOpsRunner />
                </>
              ) : (
                <>
                  <DialogDescription className="rock-dialog-description">
                    接続後はフォームを開かず、Zemaから頼めます。
                  </DialogDescription>

                  <div className="sky-id-connection" aria-label="接続内容">
                    <div className="sky-id-node">
                      <ShieldCheck size={20} />
                      <span>
                        <strong>Rock ID</strong>
                        <small>サインイン中の本人</small>
                      </span>
                    </div>
                    <ArrowRight size={17} aria-hidden="true" />
                    <div className="sky-id-node">
                      <span className="sky-mini-mark">S</span>
                      <span>
                        <strong>{roleFor(selected)}</strong>
                        <small>利用許可だけを保存</small>
                      </span>
                    </div>
                  </div>

                  <div className="sky-privacy-summary">
                    <p>
                      <CheckCircle2 size={17} />
                      渡す：このツールを使う許可
                    </p>
                    <p>
                      <EyeOff size={17} />
                      渡さない：個人番号・住所・生年月日
                    </p>
                  </div>

                  {needsSignin ? (
                    <ExecutionSignin />
                  ) : connectedTools.includes(selected.id) ? (
                    <div className="sky-connect-complete">
                      <CheckCircle2 size={22} />
                      <div>
                        <strong>接続済み</strong>
                        <span>次からはZemaでアプリを選ぶだけです。</span>
                      </div>
                      <button onClick={() => openConnectedTool(selected)}>
                        {selected.launchPath
                          ? '収益フローを開く'
                          : 'Zemaで使う'}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="sky-one-tap-connect"
                      disabled={connectionBusy || connectionsLoading}
                      onClick={() => void connectSelected()}
                    >
                      {connectionBusy || connectionsLoading ? (
                        <LoaderCircle className="sky-spin" size={18} />
                      ) : (
                        <Link2 size={18} />
                      )}
                      {connectionsLoading
                        ? '確認中…'
                        : connectionBusy
                          ? '接続中…'
                          : '1タップでSkyに接続'}
                    </button>
                  )}

                  {connectionError && (
                    <p className="bench-error" role="alert">
                      {connectionError}
                    </p>
                  )}
                </>
              )}

              <details className="rock-tool-details sky-tool-about">
                <summary>このツールについて</summary>
                <p>{selected.description}</p>
                <div className="rock-tool-facts">
                  <div>
                    <span>使う場所</span>
                    <strong>{selected.environment}</strong>
                  </div>
                  <div>
                    <span>費用・通信</span>
                    <p>{selected.cost}</p>
                  </div>
                </div>
                <ol>
                  {selected.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p>{selected.note}</p>
                <div>
                  <a href={selected.source} target="_blank" rel="noreferrer">
                    提供元のコード
                    <ArrowUpRight size={14} />
                  </a>
                  <a
                    href={selected.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selected.license}ライセンス
                    <ArrowUpRight size={14} />
                  </a>
                </div>
              </details>

              {selected.status === 'ready' &&
                selected.runner &&
                connectedTools.includes(selected.id) && (
                  <details className="sky-manual-runner">
                    <summary>手動入力で使う</summary>
                    {running && (
                      <output className="rock-running-notice">
                        実行中です。結果が表示されるまで、この画面を開いたままにしてください。
                      </output>
                    )}
                    <MrToolRunner
                      key={selected.id}
                      tool={selected.runner}
                      onRunningChange={setRunning}
                    />
                  </details>
                )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}>
        <DialogContent className="rock-tool-dialog sky-tool-dialog">
          <DialogTitle className="rock-dialog-title">PCを接続する</DialogTitle>
          <DialogDescription>
            接続アプリを起動すると、このPCでツールを実行できます。
          </DialogDescription>
          <DeviceConnection />
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="sky-publish-dialog">
          <DialogTitle className="sr-only">Skyにツールを掲載</DialogTitle>
          <DialogDescription className="sr-only">
            自動化ツールの接続、権限、料金、提供元を申請します。
          </DialogDescription>
          <SkyPublisherForm embedded />
        </DialogContent>
      </Dialog>
    </WorkspaceShell>
  );
}
