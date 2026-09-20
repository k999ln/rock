'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
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
  Network,
  PackagePlus,
  Scale,
  Search,
  Send,
  ShieldCheck,
  Shirt,
  Sparkles,
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
import {
  connectMcp,
  listMcpConnections,
  type McpConnection,
} from '@/lib/mcp-hub';
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
import SkyActivationPanel from '@/components/sky-activation-panel';
import SkyConnectionCenter from '@/components/sky-connection-center';
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
import { providerDefinition, requiredSkyProviders } from '@/lib/sky-connections';
import { queueSkyZemaHandoff } from '@/lib/sky-zema-handoff';
import { skyToolLabelFor } from '@/lib/sky-tool-labels';

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
  'jev-evaluation': Sparkles,
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
  'rockstar-ip-studio': {
    name: 'Sky IP Studio',
    handle: '@sky_ip',
    initial: 'IP',
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
    name: 'Sky 特許アシスタント',
    handle: '@sky_patent',
    initial: '特',
  },
  'jev-evaluation': {
    name: 'Sky Jev品質評価',
    handle: '@sky_jev',
    initial: '評',
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
    providers[tool.id] ??
    skyToolLabelFor(tool.id) ?? {
      name: 'Sky ツール案内',
      handle: '@sky_tools',
      initial: 'M',
    }
  );
}
function statusFor(
  tool: Automation,
  fashionConnected = false,
  connectedTools: string[] = [],
) {
  if (
    tool.status === 'candidate' &&
    tool.runner === 'candidate-local' &&
    connectedTools.includes(tool.id)
  )
    return {
      label: 'ローカル確認器あり',
      detail: '下書き・接続確認のみ／外部サービス未接続',
      className: 'is-connect',
    };
  if (tool.status === 'candidate' && connectedTools.includes(tool.id))
    return {
      label: 'Sky登録済み',
      detail: '専用画面で接続状態と実行器を確認',
      className: 'is-connect',
    };
  if (tool.status === 'candidate')
    return {
      label: '導入候補',
      detail: 'Skyへ登録して実行器を接続できます',
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
    skyRoles.find((role) => role.toolId === tool.id)?.label ??
    skyToolLabelFor(tool.id)?.role ??
    'ツール案内役'
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
  const [connectionCenterOpen, setConnectionCenterOpen] = useState(false);
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
  const [localServers, setLocalServers] = useState<McpConnection[]>([]);
  const [localBusy, setLocalBusy] = useState('');
  const [localError, setLocalError] = useState<{ id: string; message: string } | null>(null);
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
    if (!connected) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void listMcpConnections()
        .then((servers) => {
          if (active)
            setLocalServers(
              servers.filter((server) => server.transport === 'local_http'),
            );
        })
        .catch(() => {
          if (active) setLocalServers([]);
        });
    };
    refresh();
    const interval = window.setInterval(refresh, 5_000);
    window.addEventListener('sky-mcp-servers', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('sky-mcp-servers', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [connected]);

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
  const visibleLocalServers = !connected || filter === '導入候補'
    ? []
    : localServers.filter((server) =>
        `${server.name} ${server.description}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      );

  async function connectLocalServer(server: McpConnection) {
    if (server.state === 'connected') {
      setMcpOpen(true);
      return;
    }
    if (localBusy) return;
    setLocalBusy(server.id);
    setLocalError(null);
    try {
      await connectMcp(server.id);
      const servers = await listMcpConnections();
      setLocalServers(servers.filter((item) => item.transport === 'local_http'));
      window.dispatchEvent(new Event('sky-mcp-servers'));
      setMcpOpen(true);
    } catch (error) {
      setLocalError({
        id: server.id,
        message: error instanceof Error ? error.message : '接続できませんでした。',
      });
    } finally {
      setLocalBusy('');
    }
  }

  function openConnectedTool(tool: Automation, request = '') {
    setSelected(null);
    try {
      queueSkyZemaHandoff(tool.id, request);
    } catch {
      // The selected tool still opens when private tab storage is unavailable.
    }
    if (tool.launchPath) {
      if (/^https?:\/\//.test(tool.launchPath)) {
        window.location.assign(tool.launchPath);
      } else {
        router.push(tool.launchPath);
      }
      return;
    }
    router.push(`/sky/tools/${encodeURIComponent(tool.id)}`);
  }

  function primaryAction(tool: Automation, request = '') {
    if (tool.status === 'candidate' && connectedTools.includes(tool.id)) {
      openConnectedTool(tool, request);
      return;
    }
    if (tool.status === 'candidate') {
      setSelected(tool);
      return;
    }
    if (tool.runner === 'delivery-local') {
      setDeviceOpen(true);
      return;
    }
    if (tool.launchPath) {
      openConnectedTool(tool, request);
      return;
    }
    if (connectedTools.includes(tool.id)) {
      openConnectedTool(tool, request);
      return;
    }
    setConnectionError('');
    setSelected(tool);
  }

  async function connectSelected() {
    if (!selected || connectionBusy) return;
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
      `${roleFor(tool)}が進めます。専用画面を開いて、入力・実行・結果確認を行えます。`,
    );
  }

  function openRole(tool: Automation, request = '') {
    chooseRole(tool, request);
    primaryAction(tool, request);
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
      if (tool) {
        chooseRole(tool, request);
        if (connectedTools.includes(tool.id) || Boolean(tool.launchPath))
          primaryAction(tool, request);
      }
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
          <SkyActivationPanel />
          <button
            className="sky-connection-quick-open"
            onClick={() => setConnectionCenterOpen(true)}
          >
            <Link2 size={17} />
            <span>
              <strong>サービス接続を登録</strong>
              <small>Instagram、YouTube、Higgsfield、Make、ゲーム導入先を一度だけ設定</small>
            </span>
            <ArrowRight size={16} />
          </button>
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
                  maxLength={2000}
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
                      onClick={() => openRole(tool, lastRequest || role.label)}
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
                    <button
                      onClick={() => primaryAction(routedTool, lastRequest)}
                    >
                      {routedTool.runner === 'delivery-local'
                        ? 'PC接続へ'
                        : '専用画面へ'}
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
              <button
                className="sky-header-action"
                aria-label="サービス接続を管理"
                onClick={() => setConnectionCenterOpen(true)}
              >
                <Link2 size={19} />
                <span>接続</span>
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
            {visibleLocalServers.map((server, index) => (
              <article
                className="sky-feed-post"
                key={`local-${server.id}`}
                style={{ '--sky-index': index } as CSSProperties}
              >
                <div className="sky-timeline-node" aria-hidden="true">
                  <span className="sky-provider-avatar rock-icon-blue">PC</span>
                </div>
                <div className="sky-post-body">
                  <div className="sky-post-meta-row">
                    <div className="sky-post-author">
                      <strong>このPCのツール</strong>
                      <span>@sky_local</span>
                    </div>
                    <span className="sky-post-state">
                      <i aria-hidden="true" />
                      {server.state === 'connected' ? '接続済み' : '起動中'}
                    </span>
                  </div>
                  <div className="sky-post-open">
                    <span className="rock-tool-icon rock-icon-blue">
                      <Network size={22} strokeWidth={1.7} />
                    </span>
                    <span>
                      <small>Sky SDK</small>
                      <strong>{server.name}</strong>
                    </span>
                  </div>
                  <p className="sky-post-description">{server.description}</p>
                  <p className="sky-post-place">
                    {server.state === 'connected'
                      ? `${server.passport?.tools.length ?? 0}機能を確認済み`
                      : 'このPCで実行。接続時に機能と権限を確認します。'}
                  </p>
                  <div className="sky-post-actions">
                    <button
                      className="sky-post-primary"
                      disabled={Boolean(localBusy)}
                      onClick={() => void connectLocalServer(server)}
                    >
                      {localBusy === server.id
                        ? '確認中…'
                        : server.state === 'connected'
                          ? '機能を見る'
                          : '接続'}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  {localError?.id === server.id && (
                    <p className="bench-error" role="alert">
                      {localError.message}
                    </p>
                  )}
                </div>
              </article>
            ))}
            {visibleTools.map((tool, index) => {
              const Icon = icons[tool.id] ?? Link2;
              const provider = providerFor(tool);
              const status = statusFor(tool, fashionConnected, connectedTools);
              return (
                <article
                  className={'sky-feed-post ' + status.className}
                  key={tool.id}
                  style={{ '--sky-index': index + visibleLocalServers.length } as CSSProperties}
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
                          ? connectedTools.includes(tool.id)
                            ? tool.runner === 'candidate-local'
                              ? '使う'
                              : '専用画面へ'
                            : 'Sky登録'
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
            {visibleTools.length + visibleLocalServers.length === 0 && (
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
            selected?.runner === 'patent-assistant' ||
            selected?.runner === 'jev-evaluation'
              ? false
              : undefined
          }
          className={`rock-tool-dialog sky-tool-dialog sky-connect-dialog ${
            selected?.runner === 'legal-intake' ||
            selected?.runner === 'patent-assistant' ||
            selected?.runner === 'jev-evaluation'
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
                  {requiredSkyProviders(selected.id).length > 0 && (
                    <div className="sky-candidate-state">
                      <strong>先に一度だけ接続するもの</strong>
                      <span>
                        {requiredSkyProviders(selected.id)
                          .map((provider) => providerDefinition(provider).name)
                          .join('・')}
                      </span>
                      <button
                        className="sky-candidate-link"
                        onClick={() => {
                          setSelected(null);
                          setConnectionCenterOpen(true);
                        }}
                      >
                        接続情報を管理
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                  <div className="sky-candidate-state">
                    Skyへ登録すると、このツールの専用画面を開けます。ローカル確認器対応の候補は、外部サービスに接続せず下書き・接続確認を試せます。
                  </div>
                  {needsSignin ? (
                    <ExecutionSignin />
                  ) : connectedTools.includes(selected.id) ? (
                    <div className="sky-connect-complete">
                      <CheckCircle2 size={22} />
                      <div>
                        <strong>Sky登録済み</strong>
                        <span>
                          {selected.runner === 'candidate-local'
                            ? 'Skyの共通ジョブ受付と、外部接続なしのローカル確認器が利用できます。'
                            : selected.id === 'rockstar-ip-studio'
                            ? '接続済みのIP StudioをSkyから開けます。'
                            : '専用画面で実行器の接続と状態を確認できます。'}
                        </span>
                      </div>
                      <button
                        onClick={() => openConnectedTool(selected, lastRequest)}
                      >
                        {selected.runner === 'candidate-local'
                          ? '専用画面で実行'
                          : selected.id === 'rockstar-ip-studio'
                          ? 'IP Studioを開く'
                          : '専用画面で確認'}
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
                          ? '登録中…'
                          : '1タップでSkyに登録'}
                    </button>
                  )}
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
                    接続後は専用画面から頼めます。
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
                          <span>次からはSkyでアプリを選ぶだけです。</span>
                      </div>
                      <button
                        onClick={() => openConnectedTool(selected, lastRequest)}
                      >
                        専用画面で使う
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
                selected.runner !== 'candidate-local' &&
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

      <SkyConnectionCenter
        open={connectionCenterOpen}
        onOpenChange={setConnectionCenterOpen}
      />
    </WorkspaceShell>
  );
}
