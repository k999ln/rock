'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type SyntheticEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Link2,
  LoaderCircle,
  Network,
  PackagePlus,
  Search,
  Send,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
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
import { DeviceConnection } from '@/components/device-connection';
import SkyMcpCenter from '@/components/sky-mcp-center';
import SkyCodexBridgePanel from '@/components/sky-codex-bridge-panel';
import SkyActivationPanel from '@/components/sky-activation-panel';
import SkyConnectionCenter from '@/components/sky-connection-center';
import SkyPublisherForm from '@/components/sky-publisher-form';
import WorkspaceShell from '@/components/workspace-shell';
import SkyToolOverview from '@/components/sky-tool-overview';
import SkyToolCard from '@/components/sky-tool-card';
import styles from '@/components/sky-workspace.module.css';
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
import { skyToolUiState } from '@/lib/sky-tool-ui';
import { useSkyServiceStatus } from '@/lib/use-sky-service-status';
import { catalogHostMismatch, detectSkyHost } from '@/lib/sky-tool-compatibility';
import { CAMPUSES, type CampusId } from '@/lib/campus';
import { SKY_CAMPUS_RECOMMENDATIONS } from '@/lib/sky-campus-recommendations';
import { rankSkyFeed } from '@/lib/sky-feed-ranking';
import {
  appendSkyPhoenixEvent,
  clearSkyPhoenixHistory,
  emptySkyPhoenixState,
  readSkyPhoenixState,
  setSkyPhoenixEnabled,
  SKY_PHOENIX_VERSION,
  type SkyPhoenixEvent,
  type SkyPhoenixEventType,
  type SkyPhoenixState,
  writeSkyPhoenixState,
} from '@/lib/sky-phoenix';

const subscribeHost = () => () => undefined;
const browserHost = () => detectSkyHost(navigator.userAgent, navigator.maxTouchPoints);
const serverHost = () => null;

type FeedFilter = 'おすすめ' | 'Skyのツール' | '導入候補';
type SkyFeedHistoryResponse = {
  enabled: boolean;
  algorithmVersion: string;
  events: SkyPhoenixEvent[];
  retentionDays: number;
};

const feedFilters: FeedFilter[] = ['おすすめ', 'Skyのツール', '導入候補'];
const recommendedToolIds = new Set([
  'rockstar-csv-cleanup',
  'coconala',
  'mr-free-article',
  'mr-citations',
  'fashion-brand-ops',
]);
const quickRoleIds = new Set([
  'rockstar-csv-cleanup',
  'coconala',
  'mr-free-article',
  'mr-citations',
]);
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
function roleFor(tool: Automation) {
  return (
    skyRoles.find((role) => role.toolId === tool.id)?.label ??
    skyToolLabelFor(tool.id)?.role ??
    'ツール案内役'
  );
}

function actionLabel(
  tool: Automation,
  connectedTools: string[],
  pcConnected: boolean,
) {
  if (tool.id === 'jev-router') return '導入条件を見る';
  if (tool.status === 'candidate') {
    if (!connectedTools.includes(tool.id)) return '登録して次へ';
    return tool.runner === 'candidate-local' ? '下書きを試す' : '接続状態を見る';
  }
  if (tool.runner === 'delivery-local')
    return pcConnected ? '納品確認を開く' : 'PCを接続';
  if (tool.id === 'coconala') return 'ココナラを開く';
  return '開いて使う';
}

function browserStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function dwellBucket(duration: number) {
  if (duration >= 30_000) return 30_000;
  if (duration >= 10_000) return 10_000;
  return 1_000;
}

export default function SkyWorkspace({
  initialMcpOpen = false,
  initialPublishOpen = false,
  campusId,
}: {
  initialMcpOpen?: boolean;
  initialPublishOpen?: boolean;
  campusId?: CampusId;
}) {
  const service = useSkyServiceStatus();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FeedFilter>('おすすめ');
  const [selected, setSelected] = useState<Automation | null>(null);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const host = useSyncExternalStore(subscribeHost, browserHost, serverHost);
  const [allRolesOpen, setAllRolesOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(initialMcpOpen);
  const [connectionCenterOpen, setConnectionCenterOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(initialPublishOpen);
  const [learningOpen, setLearningOpen] = useState(false);
  const [phoenix, setPhoenix] = useState<SkyPhoenixState>(emptySkyPhoenixState);
  const [learningSync, setLearningSync] = useState<
    'local' | 'synced' | 'saving'
  >('local');
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
  const { executionBlocked, accessState, setNeedsSignin } = useExecutionAccess();
  const router = useRouter();
  const phoenixSession = useRef('');
  const pendingPhoenixEvents = useRef<SkyPhoenixEvent[]>([]);
  const phoenixSyncTimer = useRef<number | null>(null);
  const impressedThisSession = useRef(new Set<string>());

  const flushPhoenixEvents = useCallback(() => {
    if (phoenixSyncTimer.current !== null) {
      window.clearTimeout(phoenixSyncTimer.current);
      phoenixSyncTimer.current = null;
    }
    if (!pendingPhoenixEvents.current.length) return;
    void (async () => {
      while (pendingPhoenixEvents.current.length) {
        const events = pendingPhoenixEvents.current.splice(0, 20);
        try {
          await operationRequest('/api/sky/feed-history', 'POST', { events });
          setLearningSync('synced');
        } catch {
          pendingPhoenixEvents.current.unshift(...events);
          setLearningSync('local');
          return;
        }
      }
    })();
  }, []);

  const recordPhoenix = useCallback(
    (
      toolId: string,
      type: SkyPhoenixEventType,
      detail: Pick<SkyPhoenixEvent, 'dwellMs' | 'position'> = {},
      refreshRanking = true,
    ) => {
      if (!phoenix.enabled) return;
      const storage = browserStorage();
      if (!storage) return;
      const event: SkyPhoenixEvent = {
        id: crypto.randomUUID(),
        sessionId: phoenixSession.current || crypto.randomUUID(),
        toolId,
        type,
        at: Date.now(),
        ...(detail.dwellMs === undefined ? {} : { dwellMs: detail.dwellMs }),
        ...(detail.position === undefined ? {} : { position: detail.position }),
      };
      const next = appendSkyPhoenixEvent(storage, event);
      if (refreshRanking) setPhoenix(next);
      pendingPhoenixEvents.current.push(event);
      setLearningSync('saving');
      if (phoenixSyncTimer.current === null)
        phoenixSyncTimer.current = window.setTimeout(flushPhoenixEvents, 1_200);
    },
    [flushPhoenixEvents, phoenix.enabled],
  );

  useEffect(() => {
    let active = true;
    phoenixSession.current = crypto.randomUUID();
    const storage = browserStorage();
    if (!storage) return;
    const local = readSkyPhoenixState(storage);
    queueMicrotask(() => {
      if (active) setPhoenix(local);
    });
    void operationRequest<SkyFeedHistoryResponse>('/api/sky/feed-history')
      .then((remote) => {
        if (!active || remote.algorithmVersion !== SKY_PHOENIX_VERSION) return;
        const remoteState: SkyPhoenixState = {
          version: SKY_PHOENIX_VERSION,
          enabled: remote.enabled,
          events: remote.events,
        };
        writeSkyPhoenixState(storage, remoteState);
        setPhoenix(readSkyPhoenixState(storage));
        setLearningSync('synced');
      })
      .catch(() => setLearningSync('local'));
    return () => {
      active = false;
      if (phoenixSyncTimer.current !== null)
        window.clearTimeout(phoenixSyncTimer.current);
    };
  }, []);

  useEffect(() => {
    const updateConnection = () => setConnected(Boolean(deviceToken()));
    updateConnection();
    window.addEventListener('loop-device', updateConnection);
    return () => window.removeEventListener('loop-device', updateConnection);
  }, []);


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

  const visibleTools = useMemo(() => {
    const campusRecommended = campusId
      ? new Set(SKY_CAMPUS_RECOMMENDATIONS[campusId])
      : recommendedToolIds;
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = catalog.filter((tool) => {
      if (host && catalogHostMismatch(tool, host)) return false;
      const matchesFilter =
        Boolean(normalizedQuery) ||
        (filter === 'おすすめ' &&
          (phoenix.enabled || campusRecommended.has(tool.id))) ||
        (filter === 'Skyのツール' && tool.status === 'ready') ||
        (filter === '導入候補' && tool.status === 'candidate');
      const provider = providerFor(tool);
      const text =
        `${tool.name} ${tool.description} ${tool.category} ${provider.name}`;
      return matchesFilter && text.toLowerCase().includes(normalizedQuery);
    });
    if (filter !== 'おすすめ' || normalizedQuery) return filtered;
    return rankSkyFeed(filtered, 'recommended', {
      availableToolIds: new Set(
        filtered
          .filter((tool) => tool.status === 'ready')
          .map((tool) => tool.id),
      ),
      routedToolId: routedTool?.id,
      history: phoenix.enabled ? phoenix.events : [],
    }).map(({ tool }) => tool);
  }, [campusId, filter, host, phoenix, query, routedTool?.id]);
  const visibleToolSignature = visibleTools.map((tool) => tool.id).join('|');
  const visibleLocalServers = !connected || (filter === '導入候補' && !query.trim())
    ? []
    : localServers.filter((server) =>
        `${server.name} ${server.description}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      );

  useEffect(() => {
    if (!phoenix.enabled || filter !== 'おすすめ') return;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-sky-tool-id]'),
    );
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<HTMLElement>();
    const startedAt = new Map<HTMLElement, number>();
    const commit = (node: HTMLElement, now = Date.now()) => {
      const toolId = node.dataset.skyToolId;
      const started = startedAt.get(node);
      startedAt.delete(node);
      if (!toolId || !started || impressedThisSession.current.has(toolId))
        return;
      const duration = now - started;
      if (duration < 1_000) return;
      impressedThisSession.current.add(toolId);
      recordPhoenix(
        toolId,
        'impression',
        {
          dwellMs: dwellBucket(duration),
          position: Number(node.dataset.skyPosition ?? 0),
        },
        false,
      );
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        for (const entry of entries) {
          const node = entry.target as HTMLElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            visible.add(node);
            if (document.visibilityState !== 'hidden' && !startedAt.has(node))
              startedAt.set(node, now);
          } else {
            visible.delete(node);
            commit(node, now);
          }
        }
      },
      { threshold: [0, 0.55, 1] },
    );
    const visibility = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        for (const node of visible) commit(node, now);
      } else {
        for (const node of visible) {
          if (!impressedThisSession.current.has(node.dataset.skyToolId ?? ''))
            startedAt.set(node, now);
        }
      }
    };
    for (const node of nodes) observer.observe(node);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      const now = Date.now();
      for (const node of visible) commit(node, now);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [filter, phoenix.enabled, recordPhoenix, visibleToolSignature]);

  function openLearningPanel() {
    const storage = browserStorage();
    if (storage) setPhoenix(readSkyPhoenixState(storage));
    setLearningOpen(true);
  }

  async function toggleLearning() {
    const storage = browserStorage();
    if (!storage) return;
    const enabled = !phoenix.enabled;
    const next = setSkyPhoenixEnabled(storage, enabled);
    const finalState = enabled ? next : clearSkyPhoenixHistory(storage);
    setPhoenix(finalState);
    pendingPhoenixEvents.current = [];
    setLearningSync('saving');
    try {
      await operationRequest('/api/sky/feed-history', 'PUT', { enabled });
      setLearningSync('synced');
    } catch {
      setLearningSync('local');
    }
  }

  async function clearLearning() {
    const storage = browserStorage();
    if (storage) setPhoenix(clearSkyPhoenixHistory(storage));
    pendingPhoenixEvents.current = [];
    setLearningSync('saving');
    try {
      await operationRequest('/api/sky/feed-history', 'DELETE');
      setLearningSync('synced');
    } catch {
      setLearningSync('local');
    }
  }

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
    let threadId = crypto.randomUUID();
    try {
      threadId = queueSkyZemaHandoff(tool.id, request).id;
    } catch {
      // The selected tool still opens when private tab storage is unavailable.
    }
    router.push(`/chat?tool=${encodeURIComponent(tool.id)}&thread=${encodeURIComponent(threadId)}`);
  }

  function primaryAction(tool: Automation, request = '') {
    recordPhoenix(tool.id, 'launch');
    setLastRequest(request);
    setConnectionError('');
    if (tool.id === 'jev-router') {
      setSelected(null);
      router.push('/sky/tools/jev-router');
      return;
    }
    if (tool.id === 'coconala') {
      if (request.trim()) { openConnectedTool(tool, request); return; }
      setSelected(null);
      router.push('/sky/tools/coconala');
      return;
    }
    if (tool.status === 'candidate' && connectedTools.includes(tool.id)) {
      openConnectedTool(tool, request);
      return;
    }
    if (tool.status === 'candidate') {
      setSelected(tool);
      return;
    }
    if (tool.runner === 'delivery-local') {
      if (connected) openConnectedTool(tool, request);
      else setDeviceOpen(true);
      return;
    }
    if (request.trim()) {
      openConnectedTool(tool, request);
      return;
    }
    setSelected(null);
    router.push(tool.launchPath ?? `/sky/tools/${encodeURIComponent(tool.id)}`);
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
      const connectedTool = selected;
      setConnectedTools((current) =>
        current.includes(connection.tool)
          ? current
          : [...current, connection.tool],
      );
      recordPhoenix(connection.tool, 'connect');
      // A successful Sky connection immediately creates/opens the matching Zema Bot.
      openConnectedTool(connectedTool, lastRequest);
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
    recordPhoenix(tool.id, 'route');
    setLastRequest(request);
    setRoutedTool(tool);
    setRouteMessage(
      `${roleFor(tool)}が進めます。専用画面を開いて、入力・実行・結果確認を行えます。`,
    );
  }

  function openRole(tool: Automation, request = '') {
    const mismatch = host ? catalogHostMismatch(tool, host) : null;
    if (mismatch) {
      setLastRequest(request);
      setRoutedTool(null);
      setRouteMessage(`${tool.name}: ${mismatch}。対応する端末から開いてください。`);
      return;
    }
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
        openRole(tool, request);
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
      title="Sky"
      tone="sky"
      contentClassName={styles.shell}
      onConnect={() => router.push('/sky/network')}
    >
      <div className={styles.page}>
        {campusId && <section aria-label="大学別Sky" style={{padding: '20px 24px', borderRadius: 18, background: '#153321', color: 'white', marginBottom: 20}}>
          <p style={{margin: '0 0 6px', opacity: .8, fontSize: 12, letterSpacing: '.12em'}}>SKY · {CAMPUSES[campusId].name.toUpperCase()}</p>
          <h1 style={{margin: '0 0 8px', fontSize: 'clamp(26px, 5vw, 42px)'}}>{CAMPUSES[campusId].shortName} の Sky</h1>
          <p style={{margin: '0 0 12px'}}>{CAMPUSES[campusId].description}</p>
          <nav aria-label="大学別Skyの操作" style={{display: 'flex', flexWrap: 'wrap', gap: 14}}>
            <Link href="/sky/marketplace" style={{color: 'white'}}>Agentを探す</Link>
            <Link href="/sky/purchases" style={{color: 'white'}}>購入したAgent</Link>
            <Link href="/sky/outputs" style={{color: 'white'}}>成果を見る</Link>
            <Link href="/sky/network" style={{color: 'white'}}>接続を管理</Link>
            <Link href="/chat" style={{color: 'white'}}>Zemaで仕事を管理</Link>
          </nav>
        </section>}
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>YOUR TOOLS</p>
            <h1 id="sky-feed-title">ツールを選ぶ</h1>
            <p className={styles.intro}>アイコンで機能を確認。そのまま使い始められます。</p>
          </div>
          <nav className={styles.outputNav} aria-label="Skyの主要画面">
            <Link className={styles.marketLink} href="/sky/agents/citations">
              出典整理Agentを使う <ArrowUpRight size={15} />
            </Link>
            <Link className={styles.marketLink} href="/sky/marketplace">
              <Store size={17} /> マーケット <ArrowUpRight size={15} />
            </Link>
            <Link className={styles.marketLink} href="/sky/outputs">
              Agentの成果 <ArrowUpRight size={15} />
            </Link>
          </nav>
        </header>
        <SkyCodexBridgePanel />
        <section className={styles.assistant} aria-labelledby="sky-assistant-title">
          <h2 id="sky-assistant-title">やりたいことから探す</h2>
          <form className={styles.composer} onSubmit={submitRequest}>
            <input value={requestText} onChange={(event) => setRequestText(event.target.value)} placeholder="例：CSVを整えたい" aria-label="Skyへの依頼" maxLength={2000} />
            <button disabled={!requestText.trim()} aria-label="Skyへ依頼を送る"><ArrowRight size={19} /></button>
          </form>
          <div className={styles.roles} aria-label="Skyの役割">
            {skyRoles.filter((role) => allRolesOpen || quickRoleIds.has(role.toolId)).map((role) => {
              const tool = catalog.find((item) => item.id === role.toolId)!;
              if (host && catalogHostMismatch(tool, host)) return null;
              return <button key={role.toolId} onClick={() => openRole(tool, lastRequest || role.label)}>{role.label}</button>;
            })}
            <button type="button" aria-expanded={allRolesOpen} onClick={() => setAllRolesOpen((open) => !open)}>{allRolesOpen ? '閉じる' : 'ほかの用途'}</button>
          </div>
          {routeMessage && (
            <output className={styles.routeReply}>
              {lastRequest && <p>{lastRequest}</p>}
              <p>{routeMessage}</p>
              {routedTool && <button onClick={() => primaryAction(routedTool, lastRequest)}>
                {routedTool.runner === 'delivery-local' ? 'PC接続へ' : '専用画面へ'} <ArrowRight size={15} />
              </button>}
            </output>
          )}
        </section>
        <section aria-labelledby="sky-feed-title">
          <div className={styles.toolbar}>
            {query.trim() ? <p className={styles.searchScope}>全ツールから {visibleTools.length + visibleLocalServers.length}件</p> : <Tabs value={filter} onValueChange={(value) => setFilter(value as FeedFilter)}>
              <TabsList className={styles.tabs} aria-label="ツールの表示">
                {feedFilters.map((item) => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}
              </TabsList>
            </Tabs>}
            <button
              type="button"
              aria-pressed={phoenix.enabled}
              onClick={openLearningPanel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                minHeight: 40,
                padding: '0 13px',
                borderRadius: 999,
                border: phoenix.enabled ? '1px solid #5f93ff' : '1px solid #d6dce8',
                background: phoenix.enabled ? '#edf4ff' : '#fff',
                color: '#172033',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <BrainCircuit size={16} />
              {phoenix.enabled ? 'おすすめ学習中' : 'おすすめを学習'}
            </button>
            <label className={styles.search}>
              <Search size={17} aria-hidden="true" /><span className="sr-only">ツールを検索</span>
              <input type="search" aria-label="ツールを検索" placeholder="名前・用途で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
              {query && <button type="button" aria-label="検索をクリア" onClick={() => setQuery('')}><X size={16} /></button>}
            </label>
          </div>
          <div className={styles.grid} aria-live="polite">
            {visibleLocalServers.map((server) => (
              <article className={styles.localCard} key={server.id}>
                <div className={styles.localHeading}><Network size={24} /><h3>{server.name}</h3></div>
                <p>{server.description}</p>
                <span>{server.state === 'connected' ? `${server.passport?.tools.length ?? 0}機能を接続済み` : 'このPCで起動中'}</span>
                <button disabled={Boolean(localBusy)} onClick={() => void connectLocalServer(server)}>
                  {localBusy === server.id ? '確認中…' : server.state === 'connected' ? '機能を見る' : '接続する'}<ArrowRight size={16} />
                </button>
                {localError?.id === server.id && <p className={styles.error} role="alert">{localError.message}</p>}
              </article>
            ))}
            {visibleTools.map((tool, index) => (
              <div
                key={tool.id}
                data-sky-tool-id={tool.id}
                data-sky-position={index + visibleLocalServers.length}
              >
                <SkyToolCard tool={tool}
                  state={skyToolUiState(tool, { fashionConnected, connectedTools, pcConnected: connected, service })}
                  expanded={selected?.id === tool.id}
                  onInspect={() => {
                    recordPhoenix(tool.id, 'detail');
                    setLastRequest('');
                    setConnectionError('');
                    setSelected(tool);
                  }}
                  actionLabel={actionLabel(tool, connectedTools, connected)}
                  onAction={() => primaryAction(tool)}
                />
              </div>
            ))}
          </div>
          {visibleTools.length + visibleLocalServers.length === 0 && (
            <div className={styles.empty}>
              <Search size={25} /><h2>ツールが見つかりません</h2><p>名前や用途を変えて検索してください。</p>
              <button onClick={() => { setQuery(''); setFilter('おすすめ'); }}>おすすめに戻る</button>
            </div>
          )}
        </section>
        <nav className={styles.utilities} aria-label="Skyの管理">
          <button onClick={() => setConnectionCenterOpen(true)}><Link2 size={17} /> サービス接続</button>
          <button onClick={() => setMcpOpen(true)}><Network size={17} /> PCのツール</button>
          <button onClick={() => setPublishOpen(true)}><PackagePlus size={17} /> ツールを登録</button>
        </nav>
        <SkyMcpCenter open={mcpOpen} connected={connected} onOpenChange={setMcpOpen} onOpenDevice={() => router.push('/sky/network')} />
        <details className={styles.telegram}>
          <summary><Send size={16} /> Telegramから使う</summary>
          <SkyActivationPanel />
        </details>
      </div>

      <Dialog open={learningOpen} onOpenChange={setLearningOpen}>
        <DialogContent className={styles.utilityDialog}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              aria-hidden="true"
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 42,
                height: 42,
                borderRadius: 14,
                background: '#edf4ff',
                color: '#315fae',
              }}
            >
              <BrainCircuit size={22} />
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 12, letterSpacing: '.1em' }}>
                SKY PHOENIX
              </p>
              <DialogTitle className="rock-dialog-title">
                おすすめの学習
              </DialogTitle>
            </div>
          </div>
          <DialogDescription>
            表示、詳細、起動、接続、完了・失敗から、Toolごとの行動確率を学習します。依頼文、Zemaの会話、生成結果、生のスクロール、端末IDは保存しません。
          </DialogDescription>
          <div
            aria-live="polite"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
              margin: '10px 0',
            }}
          >
            {[
              ['状態', phoenix.enabled ? '学習中' : '停止中'],
              ['履歴', `${phoenix.events.length}件・30日間`],
              [
                '保存',
                learningSync === 'saving'
                  ? '保存中'
                  : learningSync === 'synced'
                    ? 'アカウント同期'
                    : 'このタブのみ',
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{ padding: 11, borderRadius: 12, background: '#f4f6fa' }}
              >
                <span style={{ display: 'block', fontSize: 12, color: '#667085' }}>
                  {label}
                </span>
                <strong style={{ display: 'block', marginTop: 3, fontSize: 13 }}>
                  {value}
                </strong>
              </div>
            ))}
          </div>
          <p style={{ margin: 0, color: '#596273', fontSize: 13 }}>
            変わるのは表示順位だけです。Toolの実行権限、購入、決済、ZemaのJobとは分離されています。
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => void toggleLearning()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 14px',
                border: 0,
                borderRadius: 11,
                background: '#172033',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <BrainCircuit size={17} />
              {phoenix.enabled ? '学習を停止して削除' : '学習をオンにする'}
            </button>
            <button
              type="button"
              disabled={!phoenix.events.length}
              onClick={() => void clearLearning()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 14px',
                border: '1px solid #d6dce8',
                borderRadius: 11,
                background: '#fff',
                color: '#172033',
                fontWeight: 700,
                cursor: phoenix.events.length ? 'pointer' : 'not-allowed',
                opacity: phoenix.events.length ? 1 : 0.5,
              }}
            >
              <Trash2 size={16} /> 履歴をリセット
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) { setSelected(null); setConnectionError(''); }
        }}
      >
        {selected && <SkyToolOverview
          tool={selected}
          state={skyToolUiState(selected, { fashionConnected, connectedTools, pcConnected: connected, service })}
          hostMismatch={host ? catalogHostMismatch(selected, host) : null}
          className={`rock-tool-dialog sky-tool-dialog sky-connect-dialog ${
            selected.runner === 'legal-intake' ||
            selected.runner === 'patent-assistant' ||
            selected.runner === 'jev-evaluation'
              ? 'sky-tool-dialog-wide'
              : ''
          }`}
          wide={
            selected.runner === 'legal-intake' ||
            selected.runner === 'patent-assistant' ||
            selected.runner === 'jev-evaluation'
          }
        >
              {selected.id === 'jev-router' ? (
                <>
                  <div className="sky-candidate-state">
                    本体はSkyに未接続です。現状は本人のPCでCLIを導入して使う方式で、この画面から登録しても接続・実行は始まりません。
                  </div>
                  <Link
                    className="sky-one-tap-connect sky-tool-guidance-link"
                    href="/sky/tools/jev-router"
                    onClick={() => setSelected(null)}
                  >
                    導入条件を見る <ArrowRight size={17} />
                  </Link>
                </>
              ) : selected.status === 'candidate' ? (
                <>
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
                    <span>依頼はZemaへ引き継ぐ</span>
                  </div>
                  {executionBlocked ? (
                    <ExecutionSignin state={accessState} />
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
                          ? '下書き画面を開く'
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
              ) : (
                <button className="sky-one-tap-connect" onClick={() => primaryAction(selected)}>
                  {actionLabel(selected, connectedTools, connected)} <ArrowRight size={17} />
                </button>
              )}
              {connectionError && selected.status === 'candidate' && <p className="bench-error" role="alert">{connectionError}</p>}

              <details className="rock-tool-details sky-tool-about">
                <summary>手順・提供元を詳しく見る</summary>
                <ol>
                  {selected.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p>{selected.note}</p>
                <div>
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

        </SkyToolOverview>}
      </Dialog>

      <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}>
        <DialogContent className={styles.utilityDialog}>
          <DialogTitle className="rock-dialog-title">PCを接続する</DialogTitle>
          <DialogDescription>
            接続アプリを起動すると、このPCでツールを実行できます。
          </DialogDescription>
          <DeviceConnection />
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className={styles.utilityDialog}>
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
