'use client';
import SkyUsageDetails from '@/components/sky-usage-details';
import type { SkyUsageObservation } from '@/lib/sky-usage-observation';

import { SkyNotice } from '@/components/sky-feedback';
import { EveHistoryClient, eveMemoryPrompt } from '@/lib/eve-history-client';
import type { EveMemorySource } from '@/lib/eve-history';
import { skyAgentSystem, type SkyLibraryAgent } from '@/lib/sky-agent-library';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
import { takeHomeIntent } from '@/lib/home-intent';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Grid2X2,
  House,
  ListChecks,
  MessageCircle,
  PanelLeft,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
} from 'lucide-react';
import { catalog, type Automation } from '@/lib/catalog';
import { fashionMcpConnected } from '@/lib/fashion-mcp-client';
import { eveDispatchMode, routeSkyRequest, skyRoles, type SkyRole } from '@/lib/sky-routing';
import {
  adaptersForCapability,
  type SkyProviderCapability,
} from '@/lib/sky-connections';
import {
  isTextModelProvider,
  localModelPresets,
  textModelProviderDefinition,
  textModelProviders,
  type TextModelProviderId,
} from '@/lib/llm-providers';
import WorkspaceShell from '@/components/workspace-shell';
import ToolCharacterDetails from '@/components/tool-character';
import characterStyles from '@/components/tool-character.module.css';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { SkyCandidateRunner } from '@/components/sky-candidate-runner';
import { FashionBrandOpsRunner } from '@/components/fashion-brand-ops-runner';
import { McpBotRunner } from '@/components/mcp-bot-runner';
import {
  ExecutionSignin,
  useExecutionAccess,
} from '@/components/execution-access';
import {
  operationRequest,
  OperationRequestError,
} from '@/lib/operations-client';
import type {
  Job,
  JobTool,
  SkyConnection,
  SkyProviderConnection,
} from '@/lib/operations';
import { deviceToken } from '@/lib/device';
import { listMcpConnections, type McpConnection } from '@/lib/mcp-hub';
import type {
  AutomationFundAnalytics,
  AutomationFundPlan,
} from '@/lib/automation-fund';
import ChatLiveProgress from '@/components/chat-live-progress';
import type { CsvJob } from '@/components/chat-live-progress';
import {
  consumeSkyZemaHandoff,
  SKY_ZEMA_JOB_EVENT,
} from '@/lib/sky-zema-handoff';
import {
  type ZemaChatSession,
} from '@/lib/zema-chat-session';
import { skyToolLabelFor } from '@/lib/sky-tool-labels';
import { formatCurrencyMinor, parseCurrencyInputToMinor } from '@/lib/currency-format';
import { remoteAiTextRequest, RemoteAiTextClientError } from '@/lib/remote-ai-text-client';
import { CAMPUSES, type CampusId } from '@/lib/campus';

type ChatEntry = {
  id: string;
  side: 'me' | 'sky';
  text: string;
  tool?: string;
  suggestedTool?: string;
};

type RemoteAiEstimateResult = {
  currencies?: string[];
  estimate: {
    providerId: string;
    modelId: string;
    pricingVersion: string;
    currency: string;
    inputTokenUpperBound: number;
    outputTokenLimit: number;
    maximumChargeMinor: number;
    rateCardDigest: string;
    expiresAt: number;
  };
  withinUserCap: boolean;
  userCapMinor: number | null;
  rateSource: string;
  cardId: string;
  estimateOnly: true;
  providerSubmission: 'not_performed';
  executionAuthorized: false;
};

type ActiveRequest = {
  id: string;
  text: string;
  toolId: string;
  executionProvider: 'local-model';
  plannerProvider: TextModelProviderId;
  plannerModel: string;
};

type WorkflowStatus = 'ready' | 'running' | 'completed' | 'failed';

type FundSnapshot = {
  funds: AutomationFundPlan[];
  membership: { fundId: string } | null;
  analytics: Array<AutomationFundAnalytics & { fundId: string }>;
};

const AUTO_MODE = 'sky-auto';
const MCP_PREFIX = 'mcp:';
function currentTimestamp() { return Date.now(); }
const Workbench = dynamic(() => import('@/components/workbench'), {
  loading: () => (
    <div className="sky-chat-centered">仕事を読み込んでいます…</div>
  ),
});
const quickRequests = [
  '案件を見て',
  '記事を整えて',
  '法律の相談',
  '特許を調べて',
];

const providerRoutingDefaults: Record<string, string> = {
  imageGeneration: 'higgsfield',
  videoGeneration: 'higgsfield',
  textGeneration: 'local-model',
  textGenerationModel: 'Qwen3-0.6B-Q8_0-GGUF',
  localLlmBaseUrl: 'http://127.0.0.1:4317/v1',
  workflow: 'make',
  socialPublish: 'make',
  gameDelivery: 'roblox',
  realtimeVoice: '',
  telephony: '',
};

const providerRoutingFields: Array<{
  id: string;
  label: string;
  capability: SkyProviderCapability;
}> = [
  { id: 'imageGeneration', label: '画像', capability: 'image_generation' },
  { id: 'videoGeneration', label: '動画', capability: 'video_generation' },
  { id: 'textGeneration', label: "文章・AIモデル", capability: 'text_generation' },
  { id: 'workflow', label: 'ワークフロー', capability: 'workflow' },
  { id: 'socialPublish', label: 'SNS公開', capability: 'social_publish' },
  { id: 'gameDelivery', label: 'ゲーム導入', capability: 'game_delivery' },
  { id: 'realtimeVoice', label: 'IPの音声会話', capability: 'realtime_voice' },
  { id: 'telephony', label: 'IPの電話連携', capability: 'telephony' },
];

function roleFor(tool: Automation) {
  return (
    skyRoles.find((role) => role.toolId === tool.id)?.label ??
    skyToolLabelFor(tool.id)?.role ??
    'Smithアプリ'
  );
}

function mcpMode(serverId: string) {
  return `${MCP_PREFIX}${serverId}`;
}

function jobMessage(job: Job) {
  if (job.status === 'completed') return '完了';
  if (job.status === 'failed' || job.status === 'interrupted')
    return '確認が必要';
  if (job.status === 'cancelled') return '停止';
  if (job.status === 'running') return '処理中';
  return '受付済み';
}

function jobStateClass(job: Job) {
  if (job.status === 'completed') return 'is-completed';
  if (job.status === 'failed' || job.status === 'interrupted')
    return 'is-attention';
  if (job.status === 'cancelled') return 'is-cancelled';
  if (job.status === 'running') return 'is-running';
  return 'is-queued';
}

function botStateLabel(tool: Automation, latest: Job | undefined) {
  if (tool.status === 'candidate') {
    if (tool.launchPath) return '専用アプリ要起動・実行未確認';
    if (!latest) return tool.origin === 'mr' ? 'ローカル下書き可・本体未接続' : '接続条件のみ・本体未接続';
    if (latest?.status === 'failed' || latest?.status === 'interrupted')
      return '確認が必要・本体未接続';
    if (latest?.status === 'running') return 'ローカル処理中・本体未接続';
    if (latest?.status === 'completed') return tool.origin === 'mr' ? '下書き完了・本体未接続' : '接続条件を整理済み・本体未接続';
    return '本体未接続';
  }
  if (tool.runner === 'jev-evaluation' && !latest)
    return '外部AIの接続確認が必要';
  return latest ? jobMessage(latest) : 'Smith登録済み';
}

function responseFor(
  tool: Automation | null,
  routedRole: SkyRole | null,
) {
  if (tool?.status === 'candidate' && tool.runner !== 'candidate-local')
    return `${roleFor(tool)}はSmithに登録済みですが、実行器の接続待ちです。下のカードから接続方法を確認できます。`;
  if (tool?.status === 'candidate' && tool.runner === 'candidate-local')
    return tool.origin === 'mr'
      ? `${roleFor(tool)}でローカル下書きを作れます。元サービス、端末、送信先には接続しません。`
      : `${roleFor(tool)}の実行器を接続するための条件を整理できます。ツール本体、外部サービス、端末は実行しません。`;
  if (tool)
    return `${roleFor(tool)}で進めます。下の処理カードで必要な入力を確認できます。`;
  if (routedRole)
    return `${routedRole.label}はまだ接続されていません。Smithで接続すると、次からはここで頼めます。`;
  return '担当を選べませんでした。Smithで接続状態を確認してください。';
}

function readableChatResult(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,})\s*$/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 — $2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function SkyChatWorkspace({ campusId }: { campusId?: CampusId } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campusHubPath = campusId ? `/sky/campus/${campusId}/hub` : '/sky';
  const zemaPath = campusId ? `/sky/campus/${campusId}/manage` : '/chat';
  const requestedAgentId = searchParams.get('agent') ?? '';
  const requestedAgentRevision = Number(searchParams.get('agentRevision') ?? -1);
  const agentQuery = requestedAgentId ? `&agent=${encodeURIComponent(requestedAgentId)}&agentRevision=${encodeURIComponent(String(requestedAgentRevision))}` : '';
  const baseChatPath = campusId ? `${zemaPath}?view=chat` : zemaPath;
  const zemaChatPath = agentQuery ? `${baseChatPath}${baseChatPath.includes('?') ? '&' : '?'}${agentQuery.slice(1)}` : baseChatPath;
  const zemaWorkPath = `${zemaPath}?view=work${agentQuery}`;
  const [libraryAgent, setLibraryAgent] = useState<SkyLibraryAgent | null>(null);
  const [lastLlmUsage, setLastLlmUsage] = useState<{threadId:string;observation:SkyUsageObservation}|null>(null);
  const [agentError, setAgentError] = useState('');
  const activeAgent = requestedAgentId && libraryAgent?.id === requestedAgentId && libraryAgent.revision === requestedAgentRevision ? libraryAgent : null;
  const agentBlocked = Boolean(requestedAgentId && (!activeAgent || !activeAgent.enabled));
  const skyOutputsPath = campusId ? `/sky/campus/${campusId}/outputs` : '/sky/outputs';
  const preferredTool = searchParams.get('tool') ?? '';
  const preferredPackage = searchParams.get('package') ?? '';
  const requestedThreadId = searchParams.get('thread') ?? '';
  const preferredFund = searchParams.get('fund') ?? '';
  const workView = searchParams.get('view') === 'work' || Boolean(campusId && searchParams.get('view') !== 'chat');
  const [connectedTools, setConnectedTools] = useState<string[]>([]);
  const [providerRouting, setProviderRouting] = useState<Record<string, string>>(
    providerRoutingDefaults,
  );
  const providerRoutingRef = useRef(providerRoutingDefaults);
  const providerSaveTimerRef = useRef<number | null>(null);
  const [fashionConnected, setFashionConnected] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpConnection[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [csvJobs, setCsvJobs] = useState<CsvJob[]>([]);
  const [fundSnapshot, setFundSnapshot] = useState<FundSnapshot | null>(null);
  const [fundRefreshing, setFundRefreshing] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState(AUTO_MODE);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const intent = takeHomeIntent(window.sessionStorage);
        if (intent) setDraft(intent);
      } catch { /* Unavailable tab storage leaves the composer editable. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(
    null,
  );
  const [requestStartedAt, setRequestStartedAt] = useState(0);
  const [running, setRunning] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>('ready');
  const [threadId, setThreadId] = useState('');
  const [threadCreatedAt, setThreadCreatedAt] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);
  const [recentThreads, setRecentThreads] = useState<ZemaChatSession[]>([]);
  const historyClient = useRef(new EveHistoryClient());
  const liveHistoryThread = useRef('');
  const [historyStatus,setHistoryStatus] = useState('履歴を確認しています…');
  const [historyCursor,setHistoryCursor] = useState<string|null>(null);
  const [historyBefore,setHistoryBefore] = useState<number|null>(null);
  const [rememberConversation,setRememberConversation] = useState(true);
  const [useHistoryMemory,setUseHistoryMemory] = useState(true);
  const [memorySources,setMemorySources] = useState<EveMemorySource[]>([]);
  const [historyReload,setHistoryReload] = useState(0);
  const [historyLoading,setHistoryLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyQuery, setHistoryQuery] = useState('');
  const [allBotsOpen, setAllBotsOpen] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [remoteEstimate, setRemoteEstimate] = useState<RemoteAiEstimateResult | null>(null);
  const [cloudWorkDraft, setCloudWorkDraft] = useState<{
    prompt: string; currency: string; maximumBudgetInput: string; model?: string;
  } | null>(null);
  const [remoteCurrency, setRemoteCurrency] = useState('');
  const [remoteCurrencyOptions, setRemoteCurrencyOptions] = useState<string[]>([]);
  const [remoteBudgetInput, setRemoteBudgetInput] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (loading || !requestedAgentId) return;
    const controller = new AbortController();
    void fetch(`/api/sky/agents?id=${encodeURIComponent(requestedAgentId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json() as { agent?: SkyLibraryAgent; error?: string };
        if (!response.ok || !result.agent) throw new Error(result.error || '担当の設定を読み込めませんでした。');
        if (result.agent.revision !== requestedAgentRevision) throw new Error('設定が更新されています。Smithで最新の内容を確認してください。');
        return result.agent;
      }).then(agent => {
        if (controller.signal.aborted) return;
        setLibraryAgent(agent); setAgentError('');
        setSelectedToolId(agent.sourceTool ?? AUTO_MODE);
      }).catch(reason => {
        if (controller.signal.aborted) return;
        setLibraryAgent(null); setAgentError(reason instanceof Error ? reason.message : '担当を確認できませんでした。');
      });
    return () => controller.abort();
  }, [loading, requestedAgentId, requestedAgentRevision]);
  const [error, setError] = useState('');
  const { executionBlocked, accessState, setNeedsSignin } = useExecutionAccess();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const activeChatThreadRef = useRef('');
  const hasActiveJob = jobs.some(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  const hasActiveCsvJob = csvJobs.some(
    (job) => job.status === 'accepted' || job.status === 'processing',
  );

  useEffect(() => {
    const smallScreen = window.matchMedia('(max-width: 767px)');
    const syncSidebar = () => setSidebarOpen(!smallScreen.matches);
    syncSidebar();
    smallScreen.addEventListener('change', syncSidebar);
    return () => smallScreen.removeEventListener('change', syncSidebar);
  }, []);

  function closeSidebarOnSmallScreen() {
    if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false);
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      operationRequest<SkyConnection[]>('/api/sky/connections'),
      operationRequest<Job[]>('/api/jobs'),
      operationRequest<SkyProviderConnection[]>('/api/sky/provider-connections'),
    ])
      .then(([connections, recentJobs, providerConnections]) => {
        if (!active) return;
        const ids = new Set<string>(connections.map(({ tool }) => tool));
        const preferred = catalog.find((tool) => tool.id === preferredTool)?.id
          ?? (preferredTool.startsWith(MCP_PREFIX) ? preferredTool : null);
        setConnectedTools([...ids]);
        setJobs(recentJobs);
        const routing = providerConnections.find((item) => item.provider === 'routing');
        const nextRouting = { ...providerRoutingDefaults, ...routing?.config };
        providerRoutingRef.current = nextRouting;
        setProviderRouting(nextRouting);
        setSelectedToolId(preferred ?? AUTO_MODE);
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof OperationRequestError && reason.status === 401)
          setNeedsSignin(true);
        else
          setError(
            reason instanceof Error
              ? reason.message
              : 'Eveを読み込めませんでした。',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [preferredTool, setNeedsSignin]);

  useEffect(() => {
    const updateJob = (event: Event) => {
      const job = (event as CustomEvent<Job>).detail;
      if (!job?.id) return;
      setJobs((current) => [job, ...current.filter(({ id }) => id !== job.id)]);
    };
    window.addEventListener(SKY_ZEMA_JOB_EVENT, updateJob);
    return () => window.removeEventListener(SKY_ZEMA_JOB_EVENT, updateJob);
  }, []);

  useEffect(() => {
    if (workView || executionBlocked) return;
    let active = true;
    const refresh = () => {
      void operationRequest<Job[]>('/api/jobs')
        .then((recentJobs) => {
          if (active) setJobs(recentJobs);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, hasActiveJob ? 3_000 : 15_000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [hasActiveJob, executionBlocked, workView]);

  useEffect(() => {
    if (workView || executionBlocked) return;
    let active = true;
    const refresh = () => {
      void fetch('/api/csv-jobs', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('csv refresh failed');
          return (await response.json()) as { jobs: CsvJob[] };
        })
        .then((value) => {
          if (active) setCsvJobs(value.jobs);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, hasActiveCsvJob ? 3_000 : 15_000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [hasActiveCsvJob, executionBlocked, workView]);

  useEffect(() => {
    if (workView || executionBlocked) return;
    let active = true;
    const refresh = () => {
      if (active) setFundRefreshing(true);
      void fetch('/api/automation-funds', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('fund refresh failed');
          return (await response.json()) as FundSnapshot;
        })
        .then((value) => {
          if (active) setFundSnapshot(value);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setFundRefreshing(false);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [executionBlocked, preferredFund, workView]);

  useEffect(() => {
    const update = () => setFashionConnected(fashionMcpConnected());
    update();
    window.addEventListener('sky-fashion-mcp', update);
    return () => window.removeEventListener('sky-fashion-mcp', update);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!deviceToken()) {
        if (active) setMcpServers([]);
        return;
      }
      void listMcpConnections()
        .then((servers) => {
          if (active) setMcpServers(servers);
        })
        .catch(() => {
          if (active) setMcpServers([]);
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('loop-device', refresh);
    window.addEventListener('sky-mcp-servers', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('loop-device', refresh);
      window.removeEventListener('sky-mcp-servers', refresh);
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    messagesEndRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [messages]);

  useEffect(() => {
    if (chatAbortRef.current && activeChatThreadRef.current !== requestedThreadId) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
      setChatLoading(false);
    }
  }, [requestedThreadId]);

  const connectedApps = useMemo(
    () =>
      catalog.filter(
        (tool) =>
          connectedTools.includes(tool.id) ||
          (tool.integration === 'fashion-brand-ops' && fashionConnected),
      ),
    [connectedTools, fashionConnected],
  );
  const selectableApps = useMemo(
    () => catalog.filter((tool) =>
      tool.status === 'candidate' ||
      connectedTools.includes(tool.id) ||
      (tool.integration === 'fashion-brand-ops' && fashionConnected),
    ),
    [connectedTools, fashionConnected],
  );
  const preferredApp = useMemo(
    () => catalog.find((tool) => tool.id === preferredTool) ?? null,
    [preferredTool],
  );
  const modeApps = useMemo(
    () =>
      preferredApp &&
      !selectableApps.some((tool) => tool.id === preferredApp.id)
        ? [preferredApp, ...selectableApps]
        : selectableApps,
    [selectableApps, preferredApp],
  );
  const connectedMcpServers = useMemo(
    () =>
      mcpServers.filter(
        (server) => server.state === 'connected' && server.passport,
      ),
    [mcpServers],
  );
  const selectedTool =
    modeApps.find((tool) => tool.id === selectedToolId) ?? null;
  const selectedMcpServer =
    connectedMcpServers.find(
      (server) => mcpMode(server.id) === selectedToolId,
    ) ?? null;
  const displayMessages = messages.filter((message) =>
    !message.id.startsWith('welcome-') && !message.id.startsWith('progress-'));
  const textProvider = activeAgent?.provider ?? (isTextModelProvider(providerRouting.textGeneration)
    ? providerRouting.textGeneration
    : 'local-model');
  const textModel = activeAgent?.model ?? providerRouting.textGenerationModel;
  const agentBinding = activeAgent ? { agentId: activeAgent.id, agentRevision: activeAgent.revision } : {};
  const textProviderDefinition = textModelProviderDefinition(textProvider);
  const remoteTextProvider = textProviderDefinition.locality === 'remote';
  const composerRoutedRole = !selectedTool && !selectedMcpServer && !activeAgent
    ? routeSkyRequest(draft)
    : null;
  const composerHasToolRoute = Boolean(
    selectedTool || selectedMcpServer ||
    (composerRoutedRole && connectedApps.some((tool) => tool.id === composerRoutedRole.toolId)),
  );
  const composerNeedsRemoteEstimate = eveDispatchMode(remoteTextProvider, composerHasToolRoute) === 'estimate';
  const activeTool = activeRequest
    ? (modeApps.find((tool) => tool.id === activeRequest.toolId) ?? null)
    : null;
  const activeMcpServer = activeRequest
    ? (connectedMcpServers.find(
        (server) => mcpMode(server.id) === activeRequest.toolId,
      ) ?? null)
    : null;
  const activeFundId = preferredFund || fundSnapshot?.membership?.fundId || '';
  const activeFund =
    fundSnapshot?.funds.find((fund) => fund.id === activeFundId) ?? null;
  const activeFundAnalytics =
    fundSnapshot?.analytics.find((item) => item.fundId === activeFundId) ??
    null;
  const progressTool =
    selectedTool ?? catalog.find((tool) => tool.id === preferredTool) ?? null;
  const relevantJobs = activeRequest && requestStartedAt
    ? jobs.filter((job) => job.tool === activeRequest.toolId && job.createdAt >= requestStartedAt - 1_000)
    : [];
  const visibleThreads = recentThreads.filter((session) => {
    const firstRequest = session.messages.find((message) => message.side === 'me')?.text ?? '';
    const query = historyQuery.trim().toLocaleLowerCase('ja-JP');
    return !query || firstRequest.toLocaleLowerCase('ja-JP').includes(query);
  });
  const visibleBotApps = modeApps.filter((tool) => {
    const query = historyQuery.trim().toLocaleLowerCase('ja-JP');
    return !query || `${roleFor(tool)} ${tool.name}`.toLocaleLowerCase('ja-JP').includes(query);
  });
  const compactBotApps = [
    ...visibleBotApps.filter((tool) => tool.status === 'ready'),
    ...visibleBotApps.filter((tool) => tool.status !== 'ready'),
  ].slice(0, 4);
  const selectedBotApp = visibleBotApps.find((tool) => tool.id === selectedToolId);
  const sidebarBotApps = historyQuery.trim() || allBotsOpen
    ? visibleBotApps
    : selectedBotApp && !compactBotApps.some((tool) => tool.id === selectedBotApp.id)
      ? [selectedBotApp, ...compactBotApps]
      : compactBotApps;
  useEffect(() => {
    if (loading || workView) return;
    let cancelled=false;
    const frame = window.requestAnimationFrame(() => {
    void(async()=>{
    setHistoryLoading(true);
    if(requestedThreadId && requestedThreadId===liveHistoryThread.current)return;
    let sessions: ZemaChatSession[] = [], saved: ZemaChatSession|undefined;
    try {
      const page=await historyClient.current.list();
      if(cancelled)return;
      sessions=page.items.map(item=>item.session);setHistoryCursor(page.cursor);
      setHistoryStatus('本人の履歴を暗号化して保存します');
      if(requestedThreadId){
        try{
          const item=await historyClient.current.get(requestedThreadId);
          if(cancelled)return;
          if(item.session.toolId===preferredTool&&(item.session.agent?.id??'')===requestedAgentId&&(!item.session.agent||item.session.agent.revision===requestedAgentRevision)){
            saved=item.session;setRememberConversation(item.remember);setHistoryBefore(item.before);
          }else{setHistoryStatus('この会話の担当とURLが異なります。履歴から開き直してください。');return;}
        }catch(reason){if((reason as {status?:number}).status!==404)throw reason;}
      }
    }catch(reason){if(cancelled)return;setHistoryStatus(reason instanceof Error?reason.message:'履歴を取得できません。');}
    if(cancelled)return;
    setRecentThreads(sessions);
    setSessionReady(false);
    setThreadId('');
    setThreadCreatedAt(0);
    setMessages([]);
    setActiveRequest(null);
    setRequestStartedAt(0);
    setWorkflowStatus('ready');
    setOutcome(null);
    setMemorySources([]);
    if (saved) {
      liveHistoryThread.current=saved.id;
      setThreadId(saved.id);
      setThreadCreatedAt(saved.createdAt);
      setSelectedToolId(saved.toolId);
      setMessages(saved.messages);
      setActiveRequest(null);
      setRequestStartedAt(saved.createdAt);
      if (saved.workflowStatus === 'running') {
        setWorkflowStatus('failed');
        setMessages((current) => [...current, {
          id: `resume-${saved.id}`,
          side: 'sky',
          text: '画面を開き直しました。直前の実行結果はここでは確認できません。履歴を確認してから再実行してください。',
          tool: saved.toolId,
        }]);
      } else setWorkflowStatus(saved.workflowStatus);
      setOutcome(saved.outcome);
      setSessionReady(true);
      return;
    }
    if (!preferredTool || !requestedThreadId) return;
    let handoff;
    try { handoff = consumeSkyZemaHandoff(preferredTool); } catch { return; }
    if (!handoff || handoff.id !== requestedThreadId) return;
    const tool = catalog.find((item) => item.id === handoff.toolId);
    if (!tool) return;
    const id = `handoff-${handoff.id}`;
    liveHistoryThread.current=handoff.id;
    setSelectedToolId(tool.id);
    setThreadId(handoff.id);
    setThreadCreatedAt(handoff.createdAt);
    setMessages([
      ...(handoff.request ? [{ id: `${id}-me`, side: 'me' as const, text: handoff.request, tool: tool.id }] : []),
      { id: `${id}-sky`, side: 'sky', text: handoff.request
        ? `${roleFor(tool)}へSmithから引き継ぎました。入力を確認し、必要な承認を得てから実行します。進捗と結果はこのチャットに表示します。`
        : `${roleFor(tool)}を開きました。下の入力欄に依頼を送ってください。`, tool: tool.id },
    ]);
    setActiveRequest(handoff.request ? {
      id,
      text: handoff.request,
      toolId: tool.id,
      executionProvider: handoff.executionProvider ?? 'local-model',
      plannerProvider: 'local-model',
      plannerModel: textModelProviderDefinition('local-model').defaultModel,
    } : null);
    setRequestStartedAt(handoff.createdAt);
    setSessionReady(true);
    })().finally(()=>{if(!cancelled)setHistoryLoading(false);});
    });
    return () => {cancelled=true;window.cancelAnimationFrame(frame);};
  }, [loading, preferredTool, requestedThreadId, workView, requestedAgentId, requestedAgentRevision,historyReload]);

  useEffect(() => {
    if (!sessionReady || !threadId || threadId !== requestedThreadId || !threadCreatedAt) return;
    let visible=true;
    void Promise.resolve().then(async()=>{
      if(visible)setHistoryStatus('履歴を保存しています…');
      await historyClient.current.save({
        version: 1, id: threadId, toolId: preferredTool, createdAt: threadCreatedAt,
        messages, activeRequest, workflowStatus, outcome,
        ...(requestedAgentId ? { agent: { id: requestedAgentId, revision: requestedAgentRevision } } : {}),
      },rememberConversation);
      const page=await historyClient.current.list();
      if(visible){setRecentThreads(page.items.map(item=>item.session));setHistoryCursor(page.cursor);setHistoryStatus('暗号化して保存済み · 同じアカウントで引継ぎ');}
    }).catch(reason=>{if(visible)setHistoryStatus(reason instanceof Error?reason.message:'未保存です。接続を確認してください。');});
    return()=>{visible=false;};
  }, [sessionReady, threadId, requestedThreadId, threadCreatedAt, preferredTool, messages, activeRequest, workflowStatus, outcome, requestedAgentId, requestedAgentRevision,rememberConversation]);

  useEffect(() => () => {
    if (providerSaveTimerRef.current !== null)
      window.clearTimeout(providerSaveTimerRef.current);
  }, []);

  function recordWorkflowStatus(status: WorkflowStatus) {
    setWorkflowStatus(status);
  }

  function recordOutcome(next: { ok: boolean; text: string }, toolId: string) {
    setOutcome(next);
    if (toolId !== 'jev-evaluation')
      setWorkflowStatus(next.ok ? 'completed' : 'failed');
    const tool = catalog.find((item) => item.id === toolId);
    const outcomeLabel = tool?.status === 'candidate'
      ? tool.origin === 'mr' ? '下書きができました' : '接続条件を整理しました'
      : '結果ができました';
    setMessages((current) => [...current, {
      id: `result-${crypto.randomUUID()}`,
      side: 'sky',
      text: next.ok
        ? `${outcomeLabel}\n\n${readableChatResult(next.text)}`
        : `確認が必要です\n\n${next.text}`,
      tool: toolId,
    }]);
  }

  function chooseMode(toolId: string) {
    if (requestedAgentId) {
      chatAbortRef.current?.abort();
      router.push(`${baseChatPath}${baseChatPath.includes('?') ? '&' : '?'}tool=${encodeURIComponent(toolId)}`);
      return;
    }
    setError('');
    if (toolId === selectedToolId) return;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatLoading(false);
    setSelectedToolId(toolId);
    setDraft('');
    setRemoteEstimate(null);
    setRemoteCurrency('');
    setRemoteCurrencyOptions([]);
    setRemoteBudgetInput('');
    setMessages([]);
    setActiveRequest(null);
    setOutcome(null);
    setWorkflowStatus('ready');
    setThreadId('');
    setThreadCreatedAt(0);
    setSessionReady(false);
    router.replace(`${zemaChatPath}${zemaChatPath.includes('?') ? '&' : '?'}tool=${encodeURIComponent(toolId)}`, { scroll: false });
  }

  function startNewChat() {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatLoading(false);
    setSelectedToolId(activeAgent?.sourceTool ?? AUTO_MODE);
    setDraft('');
    setMessages([]);
    setActiveRequest(null);
    setRequestStartedAt(0);
    setWorkflowStatus('ready');
    setOutcome(null);
    setError('');
    setRemoteEstimate(null);
    setRemoteCurrency('');
    setRemoteCurrencyOptions([]);
    setRemoteBudgetInput('');
    setThreadId('');
    setThreadCreatedAt(0);
    setSessionReady(false);
    closeSidebarOnSmallScreen();
  }

  function changeProviderRoute(field: string, value: string) {
    const next = { ...providerRoutingRef.current, [field]: value };
    setRemoteEstimate(null);
    setRemoteCurrency('');
    setRemoteBudgetInput('');
    if (field === 'textGeneration' && isTextModelProvider(value))
      next.textGenerationModel = textModelProviderDefinition(value).defaultModel;
    providerRoutingRef.current = next;
    setProviderRouting(next);
    setError('');
    if (providerSaveTimerRef.current !== null)
      window.clearTimeout(providerSaveTimerRef.current);
    providerSaveTimerRef.current = window.setTimeout(() => {
      void operationRequest('/api/sky/provider-connections', 'PUT', {
        provider: 'routing',
        status: 'ready',
        config: next,
      }).catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "提供元設定を保存できませんでした。",
        );
      });
    }, 250);
  }

  function refreshConnectedMcp() {
    if (!deviceToken()) return setMcpServers([]);
    void listMcpConnections()
      .then(setMcpServers)
      .catch(() => setMcpServers([]));
  }

  function updateDraft(value: string) {
    setDraft(value);
    setRemoteEstimate(null);
    setRemoteBudgetInput('');
    setError('');
  }

  function chooseQuickRequest(value: string) {
    updateDraft(value);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function cancelJob(id: string) {
    try {
      await operationRequest(`/api/jobs/${id}`, 'PATCH', { action: 'cancel' });
      setJobs((current) =>
        current.map((job) =>
          job.id === id ? { ...job, status: 'cancelled' } : job,
        ),
      );
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : '開始を取り消せませんでした。',
      );
    }
  }

  async function sendMessage(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    if (chatLoading || agentBlocked || historyLoading) return;
    if (activeAgent && (activeAgent.sourceTool ?? AUTO_MODE) !== selectedToolId) {
      setError('Smithで選んだ担当が変わっています。Smithから開き直してください。'); return;
    }
    const targetMcp = selectedMcpServer;
    const routedRole = selectedTool || targetMcp || activeAgent ? null : routeSkyRequest(text);
    const routedTool = routedRole
      ? (connectedApps.find((item) => item.id === routedRole.toolId) ?? null)
      : null;
    const tool = selectedTool ?? routedTool;
    const toolId = targetMcp ? mcpMode(targetMcp.id) : tool?.id;
    const dispatchMode = eveDispatchMode(remoteTextProvider, Boolean(toolId));
    const suggestedToolId = routedRole?.toolId;
    const id = `chat-${crypto.randomUUID()}`;
    const nextThreadId = threadId || crypto.randomUUID();

    const conversational = !toolId && !routedRole;
    let memoryPrefix='';
    if(!toolId && useHistoryMemory){
      setChatLoading(true);
      try{const recall=await historyClient.current.recall(text,nextThreadId);setMemorySources(recall.sources);memoryPrefix=eveMemoryPrompt(recall.sources);}
      catch(reason){setMemorySources([]);setHistoryStatus(`過去の会話を参照できなかったため、今回の内容だけで返答します。${reason instanceof Error?reason.message:''}`);}
    }else setMemorySources([]);
    // A selected Sky Tool runs through its own reviewed executor. A remote
    // conversation model's pricing gate must not turn the Tool request into
    // an estimate-only conversation before the execution card is shown.
    if (dispatchMode === 'estimate') {
      const conversation = memoryPrefix + [...messages, { id: `${id}-me`, side: 'me' as const, text }]
        .slice(-12)
        .map((message) => `${message.side === 'me' ? 'ユーザー' : 'Eve'}: ${message.text}`)
        .join('\n\n').slice(-12000);
      const estimatePrompt = tool
        ? `担当Bot: ${tool.name}\n役割: ${roleFor(tool)}\n説明: ${tool.description}\n依頼: ${text}`
        : conversation;
      const estimateSystem = activeAgent ? skyAgentSystem(activeAgent) : tool
        ? `あなたはEve内の${tool.name} Botです。${roleFor(tool)}として、依頼を短く整理し、次に必要な入力・確認・実行手順を日本語で示してください。実行していない作業を完了したと主張せず、外部送信や法的判断を勝手に行わないでください。`
        : 'あなたはEveです。日本語で自然に対話し、必要なときだけSmithのツール利用を案内してください。実行していない作業を完了したと主張しないでください。';
      setChatLoading(true);
      setError('');
      try {
        const parsedBudget = remoteBudgetInput.trim() && remoteCurrency
          ? parseCurrencyInputToMinor(remoteBudgetInput, remoteCurrency)
          : null;
        if (remoteBudgetInput.trim() && parsedBudget === null)
          throw new Error(`${remoteCurrency || '選択した通貨'}の上限額を確認してください。`);
        const result = await remoteAiTextRequest<RemoteAiEstimateResult>('/api/llm/estimate', 'POST', {
          provider: textProvider,
          model: textModel || undefined,
          ...agentBinding,
          system: estimateSystem,
          prompt: estimatePrompt.slice(-20_000),
          maxOutputTokens: 1_200,
          currency: remoteCurrency || undefined,
          maximumBudgetMinor: parsedBudget ?? undefined,
        });
        if (!result.estimate) throw new Error('料金見積を確認できませんでした。状態を更新してください。');
        setRemoteEstimate(result);
        setMessages([...messages,{id:`${id}-me`,side:'me',text},{id:`${id}-estimate`,side:'sky',text:'料金見積を確認しました。契約・実行はまだ行っていません。'}]);
        if(!threadId)startHistoryThread(nextThreadId,toolId??AUTO_MODE);
        setRemoteCurrency(result.estimate.currency);
        setRemoteCurrencyOptions([]);
        setError("料金上限を確認しました。現在は見積のみで、提供元への実行は未接続です。");
      } catch (reason) {
        setRemoteEstimate(null);
        if (reason instanceof RemoteAiTextClientError) {
          if (reason.status === 401) setNeedsSignin(true);
          if (reason.code === 'RATE_CARD_CURRENCY_REQUIRED') setRemoteCurrencyOptions(reason.currencies);
        }
        setError(reason instanceof Error ? reason.message : 'クラウドAIの料金見積を取得できませんでした。');
      } finally {
        setChatLoading(false);
      }
      return;
    }
    setRemoteEstimate(null);
    setDraft('');
    setError('');
    setOutcome(null);
    const nextMessages: ChatEntry[] = [
      ...messages,
      {
        id: `${id}-me`,
        side: 'me',
        text,
        tool: toolId,
      },
      ...(!conversational ? [{
        id: `${id}-route`,
        side: 'sky',
        text: targetMcp
          ? `${targetMcp.name}への方向を受け取りました。下の管理カードで機能と引数を確認し、1回ごとに承認して実行できます。`
          : responseFor(
              tool,
              routedRole,
            ),
        tool: toolId,
        suggestedTool: tool ? undefined : suggestedToolId,
      } as ChatEntry] : []),
    ];
    const nextRequest = toolId
      ? {
          id,
          text,
          toolId,
          executionProvider: 'local-model' as const,
          plannerProvider: textProvider,
          plannerModel:
            textModel || textProviderDefinition.defaultModel,
        }
      : null;
    setMessages(nextMessages);
    if (conversational || (dispatchMode === 'tool' && !remoteTextProvider)) {
      const controller = new AbortController();
      chatAbortRef.current?.abort();
      chatAbortRef.current = controller;
      activeChatThreadRef.current = nextThreadId;
      setChatLoading(true);
      const conversation = memoryPrefix + [...messages, { id: `${id}-me`, side: 'me' as const, text }]
        .slice(-12)
        .map((message) => `${message.side === 'me' ? 'ユーザー' : 'Eve'}: ${message.text}`)
        .join('\n\n').slice(-12000);
      const selectedToolPrompt = tool
        ? `担当Bot: ${tool.name}\n役割: ${roleFor(tool)}\n説明: ${tool.description}\n依頼: ${text}`
        : conversation;
      void fetch('/api/llm/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: textProvider,
          model: textModel || undefined,
          ...agentBinding,
          baseUrl: !activeAgent && textProvider === 'local-model'
            ? providerRouting.localLlmBaseUrl || undefined
            : undefined,
          system: activeAgent ? skyAgentSystem(activeAgent) : tool
            ? `あなたはEve内の${tool.name} Botです。${roleFor(tool)}として、依頼を短く整理し、次に必要な入力・確認・実行手順を日本語で示してください。実行していない作業を完了したと主張せず、外部送信や法的判断を勝手に行わないでください。`
            : 'あなたはEveです。日本語で自然に対話し、必要なときだけSmithのツール利用を案内してください。実行していない作業を完了したと主張しないでください。',
          prompt: selectedToolPrompt.slice(-20_000),
          consent: false,
        }),
        signal: controller.signal,
      }).then(async (response) => {
        const result = await response.json() as { text?: string; code?: string; metering?: SkyUsageObservation };
        if (!response.ok || !result.text) throw new Error(result.code || 'TEXT_GENERATION_FAILED');
        if (!controller.signal.aborted && activeChatThreadRef.current === nextThreadId && result.metering) setLastLlmUsage({threadId:nextThreadId,observation:result.metering});
        return result.text;
      }).then((answer) => {
        if (controller.signal.aborted) return;
        setMessages((current) => conversational
          ? [...current, { id: `${id}-reply`, side: 'sky', text: answer, tool: toolId }]
          : current.map((message) => message.id === `${id}-route`
            ? { ...message, text: answer }
            : message));
      }).catch((reason) => {
        if (controller.signal.aborted) return;
        const code = reason instanceof Error ? reason.message : '';
        const detail = code === 'REMOTE_AI_PRICING_GATE_UNAVAILABLE'
          ? "この接続先はクラウド扱いですが、信頼できる料金見積・予算予約・利用明細が未接続です。提供元へは送信していません。"
          : code === 'EXPLICIT_REMOTE_CONSENT_REQUIRED'
            ? "設定された接続先は外部サーバーです。料金確認と本人の明示承認が整うまで実行できません。提供元へは送信していません。"
            : textProvider === 'local-model'
          ? code === 'LOCAL_LLM_BRIDGE_REQUIRED'
            ? 'Local Action Assistantの接続が未接続です。Ollama・LM Studio・llama.cppなどのローカルブリッジを起動して接続してください。Cloudへはフォールバックしません。'
            : "Local AIモデルブリッジに接続できませんでした。設定したループバックURLのサーバーを起動してください。Cloudへはフォールバックしません。"
          : code === 'REMOTE_LLM_DISABLED'
            ? '外部モデルはサーバー側で無効です。Smithの接続管理とサーバー設定を確認してください。'
            : code === 'MISSING_PROVIDER_CREDENTIAL' || code === 'MISSING_PROVIDER_ENDPOINT'
              ? '文章モデルの接続設定が不足しています。Smithの接続管理を確認してください。'
              : '文章モデルから返答を受け取れませんでした。接続状態を確認して再送してください。';
        setMessages((current) => conversational
          ? [...current, { id: `${id}-reply`, side: 'sky', text: detail, tool: toolId }]
          : current.map((message) => message.id === `${id}-route`
            ? { ...message, text: `${message.text}\n\n会話AIは未接続です。Toolの入力と実行は下のカードから使えます。` }
            : message));
      }).finally(() => {
        if (chatAbortRef.current === controller) {
          chatAbortRef.current = null;
          setChatLoading(false);
        }
      });
    } else {
      setChatLoading(false);
    }
    if (toolId) {
      setWorkflowStatus('ready');
      setActiveRequest(nextRequest);
      setRequestStartedAt(currentTimestamp());
    }
    if (!threadId) {
      startHistoryThread(nextThreadId,toolId??AUTO_MODE);
    }
  }

  function startHistoryThread(id:string,toolId:string){
    liveHistoryThread.current=id;
    setThreadId(id);setThreadCreatedAt(currentTimestamp());setSessionReady(true);
    router.replace(`${zemaChatPath}${zemaChatPath.includes('?')?'&':'?'}tool=${encodeURIComponent(toolId)}&thread=${encodeURIComponent(id)}`,{scroll:false});
  }
  async function olderHistory(){
    try{if(!threadId||!historyBefore)return;const item=await historyClient.current.get(threadId,historyBefore,false);setMessages(current=>[...item.session.messages,...current.filter(m=>!item.session.messages.some(old=>old.id===m.id))]);setHistoryBefore(item.before);}
    catch(reason){setHistoryStatus(reason instanceof Error?reason.message:'履歴を取得できません。');}
  }
  async function moreThreads(){
    try{if(!historyCursor)return;const page=await historyClient.current.list(historyCursor);setRecentThreads(current=>[...current,...page.items.map(i=>i.session).filter(s=>!current.some(old=>old.id===s.id))]);setHistoryCursor(page.cursor);}
    catch(reason){setHistoryStatus(reason instanceof Error?reason.message:'履歴を取得できません。');}
  }
  async function exportHistory(){
    try{
      if(!threadId)return;let before=0;const all:ChatEntry[]=[];
      do{const item=await historyClient.current.get(threadId,before,false);all.unshift(...item.session.messages);before=item.before??0;}while(before);
      const url=URL.createObjectURL(new Blob([JSON.stringify({schema:'eve.history-export/1',threadId,messages:all},null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`eve-${threadId}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(reason){setHistoryStatus(reason instanceof Error?reason.message:'書き出せませんでした。');}
  }
  async function deleteHistory(){
    if(!threadId||!window.confirm('この会話と、この会話から参照する記憶を削除します。書出しが必要な場合は先に保存してください。削除しますか？'))return;
    try{await historyClient.current.remove(threadId);liveHistoryThread.current='';setSessionReady(false);setMessages([]);setThreadId('');setRecentThreads(current=>current.filter(s=>s.id!==threadId));router.replace(zemaChatPath);}
    catch(reason){setHistoryStatus(reason instanceof Error?reason.message:'削除できませんでした。');}
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function characterDetails(id: string, size = 56) {
    const tool = catalog.find((item) => item.id === id);
    const server = connectedMcpServers.find((item) => mcpMode(item.id) === id);
    const latest = [...jobs].filter((job) => job.tool === id).sort((a, b) => b.createdAt - a.createdAt)[0];
    const current = activeRequest?.toolId === id;
    const result = [...messages].reverse().find((message) => message.tool === id && message.id.startsWith('result-'));
    return <ToolCharacterDetails id={id} size={size} name={tool?.name ?? server?.name ?? 'Eve'}
      description={tool?.description ?? server?.description ?? '会話しながら、やりたいことを整理して接続済みの道具につなぎます。'}
      status={current ? (workflowStatus === 'running' ? '処理中' : workflowStatus === 'completed' ? '結果があります' : workflowStatus === 'failed' ? '確認が必要です' : '入力・実行の確認待ち') : latest ? `直近の仕事：${jobMessage(latest)}` : tool?.status === 'candidate' ? '本体の接続待ち' : 'この会話ではまだ作業を始めていません'}
      result={result?.text}
      request={current ? activeRequest.text : undefined}
      next={current ? (workflowStatus === 'running' ? '結果が届くまでお待ちください。' : workflowStatus === 'completed' ? '結果を確認し、続きの依頼を伝えてください。' : '会話内の処理カードで入力と実行条件を確認してください。') : '名前を選んで、チャットから依頼できます。'} />;
  }

  return (
    <WorkspaceShell
      title={campusId ? `${CAMPUSES[campusId].shortName} Smith` : 'Eve'}
      contentClassName="sky-chat-page"
      running={running}
      standaloneSky={Boolean(campusId)}
      standaloneHomeHref={campusHubPath}
    >
      {requestedAgentId && <aside className="sky-agent-context" aria-label="選択したエージェント">
        {agentBlocked ? <output>{agentError || (activeAgent && !activeAgent.enabled ? 'この担当は利用停止中です。Smithで設定を確認してください。' : 'Smithの設定を確認しています…')} <Link href="/#sky-manage">Smithで確認</Link></output>
          : <p><strong>{activeAgent?.name}</strong> · {activeAgent?.model} <span>接続・料金は実行前に確認します。{activeAgent?.sourceTool ? ' 選択したLLMは依頼整理に適用され、Tool本体の設定は変わりません。' : ''}</span></p>}
      </aside>}
      <section
        className={`sky-chat-simple zema-grok-shell${sidebarOpen ? '' : ' is-sidebar-collapsed'}${!workView && displayMessages.length === 0 ? ' is-empty' : ''}`}
        aria-label="Eveスレッド"
        >
        <aside className="zema-sidebar" aria-label="Eve Botと会話">
          <div className="zema-sidebar-top">
            <div className="zema-sidebar-identity"><span className="zema-sidebar-brand">avokado</span><strong>Eve <small>SI WORKSPACE</small></strong></div>
            <button type="button" className="zema-sidebar-close" aria-label="履歴を閉じる" onClick={() => setSidebarOpen(false)}><PanelLeft size={18} /></button>
          </div>
          <Link className="zema-new-chat" href={zemaChatPath} onClick={startNewChat}><Plus size={17} /> <span>新しい会話</span></Link>
          <label className="zema-history-search"><span className="sr-only">ツールと会話を検索</span><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="ツール・会話を検索" /></label>
          <div className="zema-sidebar-section-title"><span>ツール</span><span>{visibleBotApps.length}</span></div>
          <div className="zema-character-list">
            {sidebarBotApps.map((tool) => {
              const latest = jobs.find((job) => job.tool === tool.id);
              return (
                <div className={characterStyles.row} key={`sidebar-bot-${tool.id}`}>
                {characterDetails(tool.id, 34)}
                <button
                  type="button"
                  className={characterStyles.select}
                  aria-label={`${tool.name}と会話する`}
                  aria-current={selectedToolId === tool.id}
                  onClick={() => {
                    chooseMode(tool.id);
                    closeSidebarOnSmallScreen();
                  }}
                >
                  <span className="zema-bot-copy">
                    <strong>{tool.name}</strong>
                    <small>{botStateLabel(tool, latest)}</small>
                  </span>
                  <i className={latest ? jobStateClass(latest) : 'is-online'} />
                </button>
                </div>
              );
            })}
            {connectedMcpServers.map((server) => (
              <div className={characterStyles.row} key={`sidebar-mcp-${server.id}`}>
              {characterDetails(mcpMode(server.id), 34)}
              <button
                type="button"
                className={characterStyles.select}
                aria-label={`${server.name}と会話する`}
                aria-current={selectedToolId === mcpMode(server.id)}
                onClick={() => {
                  chooseMode(mcpMode(server.id));
                  closeSidebarOnSmallScreen();
                }}
              >
                <span className="zema-bot-copy">
                  <strong>{server.name}</strong>
                  <small>{server.passport?.tools.length ?? 0}機能 · 外部ツール接続</small>
                </span>
                <i className="is-online" />
              </button>
              </div>
            ))}
          </div>
          {!historyQuery.trim() && visibleBotApps.length > 4 && (
            <button type="button" className="zema-bot-show-all" aria-expanded={allBotsOpen} onClick={() => setAllBotsOpen((open) => !open)}>
              {allBotsOpen ? '一覧を閉じる' : `すべて表示（${visibleBotApps.length}）`}
            </button>
          )}
          <div className="zema-sidebar-section-title"><span>最近の会話</span></div>
          <section className="eve-history-controls" aria-label="会話の保存と記憶">
            <output>{historyStatus}</output>
            <label><input type="checkbox" checked={useHistoryMemory} onChange={event=>setUseHistoryMemory(event.target.checked)}/>過去の会話を参考にする</label>
            <small>関連する本人の発言を、選択したLLMへ参考情報として送ります。</small>
            <label><input type="checkbox" checked={rememberConversation} onChange={event=>setRememberConversation(event.target.checked)}/>この会話を今後の記憶に使う</label>
            <small>オフでも履歴は保存します。指紋・顔の認証原本は保存しません。</small>
            <div><button type="button" onClick={()=>{liveHistoryThread.current='';setHistoryReload(value=>value+1);}}>履歴を再読込</button>
            {threadId&&<><button type="button" onClick={()=>void exportHistory()}>会話を書き出す</button><button type="button" onClick={()=>void deleteHistory()}>この履歴を削除</button></>}</div>
          </section>
          <div className="zema-history-list">
            {visibleThreads.length === 0 ? <p className="zema-history-empty">会話はまだありません</p> : visibleThreads.map((session) => {
              const title = session.messages.find((message) => message.side === 'me')?.text || '新しい会話';
              return <Link key={session.id} className={session.id === threadId ? 'is-current' : ''} href={`${baseChatPath}${baseChatPath.includes('?') ? '&' : '?'}tool=${encodeURIComponent(session.toolId)}&thread=${encodeURIComponent(session.id)}${session.agent ? `&agent=${encodeURIComponent(session.agent.id)}&agentRevision=${session.agent.revision}` : ''}`} onClick={closeSidebarOnSmallScreen}><MessageCircle size={15} /><span>{title}</span></Link>;
            })}
          </div>
          {historyCursor&&<button type="button" onClick={()=>void moreThreads()}>さらに以前の会話</button>}
          <div className="zema-sidebar-bottom"><Link href={campusId ? `/sky/marketplace?campus=${campusId}` : '/sky'}><Grid2X2 size={16} /><span>Smithでツールを追加</span></Link><Link href={zemaWorkPath}><ListChecks size={16} /><span>仕事</span></Link><Link href={campusHubPath}><House size={16} /><span>{campusId ? `${CAMPUSES[campusId].shortName} Hub` : 'ホーム'}</span></Link></div>
        </aside>
        {sidebarOpen && <button type="button" className="zema-sidebar-scrim" aria-label="履歴を閉じる" onClick={() => setSidebarOpen(false)} />}
        <header className="sky-chat-commandbar">
          <button type="button" className="zema-sidebar-toggle" aria-label="会話履歴を開く" onClick={() => setSidebarOpen(true)}><PanelLeft size={20} /></button>
          <div className="zema-room-heading">
            <div><span>{campusId ? `AVOKADO / ${CAMPUSES[campusId].shortName.toUpperCase()} Smith` : 'AVOKADO / ROCKSTAROS'}</span><h1>Eve</h1></div>
          </div>
          {requestedAgentId ? <div className="zema-active-bot"><div><small>Smithから選択した担当</small><strong>{activeAgent?.name ?? '設定を確認中'}</strong></div><Link href="/#sky-manage">設定</Link></div> : selectedTool || selectedMcpServer ? (
            <div className="zema-active-bot" title={selectedTool?.name ?? selectedMcpServer?.name}>
              {characterDetails(selectedToolId, 32)}
              <div><small>選択中のツール</small><strong>{selectedTool?.name ?? selectedMcpServer?.name}</strong></div>
            </div>
          ) : <span className="zema-auto-label">ツールは依頼に合わせて選択</span>}
          <nav aria-label="Eveナビゲーション">
            <Link href={campusHubPath} aria-label={campusId ? '大学別Smithのハブへ戻る' : 'ホームへ戻る'}>
              <House size={18} />
              <span>ホーム</span>
            </Link>
            <Link href="/sky" aria-label="Smithでアプリを見る">
              <Grid2X2 size={19} />
              <span>Smith</span>
            </Link>
            <Link
              href={zemaChatPath}
              aria-current={!workView ? 'page' : undefined}
              aria-label="Eveの会話を開く"
            >
              <MessageCircle size={18} />
              <span>会話</span>
            </Link>
            <Link
              href={zemaWorkPath}
              aria-current={workView ? 'page' : undefined}
              aria-label="Eveで仕事を管理する"
            >
              <ListChecks size={18} />
              <span>仕事</span>
            </Link>
          </nav>
        </header>

        {workView ? (
          <section
            className="sky-chat-work-center"
            aria-labelledby="chat-work-title"
          >
            <header>
              <div>
                <small>EVE WORK CONTROL</small>
                <h2 id="chat-work-title">仕事をEveで管理</h2>
              </div>
              <p>
                作成、手順の実行、確認、中止、結果の記録をここに集約します。
              </p>
              <Link href={skyOutputsPath}>保存済みの成果を見る <ArrowRight size={15} /></Link>
            </header>
            <section
              className="sky-chat-job-center"
              aria-labelledby="chat-job-title"
            >
              <div className="sky-chat-job-heading">
                <div>
                  <h3 id="chat-job-title">ツールの実行</h3>
                  <p>受付、実行中、結果、停止をEve内で確認します。</p>
                </div>
                <span>{jobs.length}件</span>
              </div>
              {error && (
                <SkyNotice className="sky-chat-work-error" message={error} />
              )}
              {jobs.length === 0 ? (
                <p className="sky-chat-work-empty">
                  まだツールの実行はありません。
                </p>
              ) : (
                <div className="sky-chat-job-list">
                  {jobs.map((job) => {
                    const jobTool = catalog.find(
                      (tool) => tool.id === job.tool,
                    );
                    return (
                      <article
                        className={`sky-chat-job ${jobStateClass(job)}`}
                        key={job.id}
                      >
                        <div>
                          <strong>{jobTool?.name ?? job.tool}</strong>
                          <small>
                            {new Date(job.createdAt).toLocaleString('ja-JP')}
                          </small>
                        </div>
                        <span>{jobMessage(job)}</span>
                        {job.status === 'queued' && (
                          <button
                            type="button"
                            onClick={() => void cancelJob(job.id)}
                          >
                            開始を取り消す
                          </button>
                        )}
                        {['failed', 'interrupted', 'cancelled'].includes(
                          job.status,
                        ) && (
                          <Link
                            href={`${zemaChatPath}${zemaChatPath.includes('?') ? '&' : '?'}tool=${encodeURIComponent(job.tool)}`}
                          >
                            <RotateCcw size={14} /> もう一度指示
                          </Link>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <Workbench embedded cloudDraft={cloudWorkDraft} initialPackageKey={preferredPackage} packageRuntimeServers={mcpServers} />
          </section>
        ) : executionBlocked ? (
          <div className="sky-chat-centered">
            <ExecutionSignin state={accessState} />
          </div>
        ) : loading ? (
          <div className="sky-chat-centered">Eveを読み込んでいます…</div>
        ) : (
          <>
            <div
              className="sky-chat-messages"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
        {historyBefore&&<button type="button" className="eve-older-history" onClick={()=>void olderHistory()}>この会話の前の発言を読む</button>}
        {memorySources.length>0&&<details className="eve-memory-sources"><summary>今回参照した過去の会話（{memorySources.length}件）</summary>{memorySources.map(source=><blockquote key={`${source.threadId}:${source.messageId}`}><p>{source.text}</p><Link href={`${baseChatPath}${baseChatPath.includes("?")?"&":"?"}tool=${source.toolId}&thread=${source.threadId}${source.agent?`&agent=${source.agent.id}&agentRevision=${source.agent.revision}`:""}`}>元の会話を確認</Link></blockquote>)}</details>}
              {displayMessages.length > 0 && <div className="sky-chat-day">今日</div>}
              {displayMessages.length === 0 && (
                <section className="zema-empty" aria-labelledby="zema-empty-title">
                  <span className="zema-empty-kicker">AVOKADO / EVE</span>
                  <h2 id="zema-empty-title">{selectedTool ? 'やりたいことを、ひと言から。' : '次の一歩を、ここから。'}</h2>
                  <p className="zema-empty-lead">{selectedTool || selectedMcpServer
                    ? '依頼を整理し、使える範囲と次の手順をこの会話で確認できます。'
                    : '目的をそのまま入力してください。使えるツールを探し、進め方を一緒に整理します。'}</p>
                  {selectedTool && (
                    <div className="zema-empty-next">
                      <div className="zema-empty-tool-heading">
                        {characterDetails(selectedTool.id, 44)}
                        <div><small>選択中のツール</small><strong>{selectedTool.name}</strong></div>
                      </div>
                      <p>{selectedTool.description}</p>
                      <span className="zema-empty-status"><i aria-hidden="true" />{botStateLabel(selectedTool, jobs.find((job) => job.tool === selectedTool.id))}</span>
                      <div className="zema-empty-actions">
                        <button type="button" onClick={() => composerRef.current?.focus()}>依頼を書く <ArrowRight size={16} aria-hidden="true" /></button>
                        {selectedTool.launchPath && <Link href={selectedTool.launchPath}>
                          専用画面を開く <ArrowRight size={16} aria-hidden="true" />
                        </Link>}
                      </div>
                      {selectedTool.status === 'candidate' && <small>
                        {selectedTool.launchPath
                          ? '専用アプリはこのPCで起動が必要です。ここからの実行結果は未確認です。'
                          : selectedTool.runner === 'candidate-local'
                            ? 'この会話で下書きできます。外部サービスへの接続・実行は未対応です。'
                            : 'この会話では接続条件を整理できます。ツール本体の実行は未対応です。'}
                      </small>}
                    </div>
                  )}
                  {!selectedTool && !selectedMcpServer && <div className="zema-starters" aria-label="依頼例">
                    {quickRequests.map((request) => (
                      <button type="button" key={request} onClick={() => chooseQuickRequest(request)}>
                        <Sparkles size={15} aria-hidden="true" />
                        {request}
                      </button>
                    ))}
                  </div>}
                </section>
              )}

              {displayMessages.map((message, index) => {
                return (
                  <div
                    className={`sky-chat-bubble is-${message.side}`}
                    key={`${message.id}-${index}`}
                  >
                    {message.side === 'sky' && characterDetails(message.tool ?? 'zema', 48)}
                    <div>
                      {message.side === 'sky' && <small>Eve</small>}
                      <p className="zema-message-text">{message.text}</p>
                      {message.side === 'sky' && message.suggestedTool && (
                        <Link className="sky-chat-inline-action" href="/sky">
                          Smithで接続する
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}

              {activeRequest && relevantJobs.length > 0 && <details className="zema-activity"><summary>実行の詳細を見る</summary><ChatLiveProgress
                jobs={relevantJobs}
                csvJobs={csvJobs}
                selectedTool={
                  progressTool
                    ? {
                        id: progressTool.id,
                        name: progressTool.name,
                      }
                    : null
                }
                fund={activeFund}
                fundAnalytics={activeFundAnalytics}
                fundRefreshing={fundRefreshing}
              /></details>}

              {activeRequest && (activeTool || activeMcpServer) && (
                <section
                  className="sky-chat-workflow"
                  aria-labelledby={`workflow-${activeRequest.id}`}
                >
                  <header>
                    <span className="sky-chat-workflow-orb">
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <small>{activeTool ? roleFor(activeTool) : '接続中のBot'}</small>
                      <h2 id={`workflow-${activeRequest.id}`}>
                        {activeTool?.status === 'candidate' && activeTool.runner !== 'candidate-local'
                          ? '実行器の接続待ち'
                          : 'この依頼を進める'}
                      </h2>
                    </div>
                    <span className={`is-${workflowStatus}`}>
                      {activeTool?.status === 'candidate' && activeTool.runner !== 'candidate-local'
                        ? '実行器待ち'
                        : workflowStatus === 'running'
                          ? '処理中'
                          : activeTool?.runner === 'jev-evaluation' && outcome?.ok
                            ? '評価Receiptあり'
                            : workflowStatus === 'completed'
                              ? activeTool?.runner === 'candidate-local'
                                ? activeTool.origin === 'mr' ? '下書きあり' : '接続条件あり'
                                : '結果あり'
                          : workflowStatus === 'failed'
                            ? '要確認'
                            : '入力待ち'}
                    </span>
                  </header>
                  <p className="sky-chat-local-llm-note">
                    {activeTool?.runner === 'candidate-local'
                      ? activeTool.origin === 'mr'
                        ? 'ローカル下書きのみ利用できます。元サービスへの接続、応募、送信、予定登録は行いません。'
                        : '実行器の接続条件のみ確認できます。ツール本体や外部サービスは実行しません。'
                      : '入力を確認して実行してください。結果はこの会話に表示されます。'}
                  </p>
                  {activeTool && !requestedAgentId && (
                    <details className="sky-chat-provider-routing">
                      <summary>ツールの接続設定</summary>
                      <p>この設定はEveの会話・案内に適用されます。候補ツールのローカル確認・下書き処理は外部提供元を呼びません。</p>
                      <div className="sky-chat-provider-grid">
                        {providerRoutingFields.map((field) => (
                          <label key={field.id}>
                            <span>{field.label}</span>
                            <select
                              value={providerRouting[field.id] ?? ''}
                              onChange={(event) => changeProviderRoute(field.id, event.target.value)}
                            >
                              {(field.capability === 'realtime_voice' || field.capability === 'telephony') && <option value="">利用しない・未選択</option>}
                              {adaptersForCapability(field.capability).map((adapter) => (
                                <option key={adapter.id} value={adapter.id}>
                                  {adapter.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <label className="sky-chat-provider-model">
                        <span>文章・AIモデルのモデルID</span>
                        <input
                          value={providerRouting.textGenerationModel ?? ''}
                          list="zema-local-model-presets"
                          placeholder="例: qwen3:8b"
                          onChange={(event) => changeProviderRoute('textGenerationModel', event.target.value)}
                        />
                        <datalist id="zema-local-model-presets">
                          {localModelPresets.map((model) => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                          ))}
                        </datalist>
                      </label>
                    </details>
                  )}
                  {!(activeTool?.status === 'candidate' && activeTool.runner !== 'candidate-local') && <details className="zema-workflow-details"><summary>進行状況を見る</summary><ol
                    className="sky-chat-workflow-steps"
                    aria-label="処理の流れ"
                  >
                    <li className="is-done">
                      <CheckCircle2 size={16} />
                      担当を選択
                    </li>
                    <li
                      className={
                        workflowStatus === 'ready' ? 'is-current' : 'is-done'
                      }
                    >
                      <span>2</span>
                      入力を確認
                    </li>
                    <li
                      className={
                        workflowStatus === 'running'
                          ? 'is-current'
                          : workflowStatus === 'completed'
                            ? 'is-done'
                            : workflowStatus === 'failed'
                              ? 'is-attention'
                              : ''
                      }
                    >
                      <span>3</span>
                      実行・結果
                    </li>
                    <li
                      className={
                        workflowStatus === 'completed' ? 'is-done' : ''
                      }
                    >
                      <span>4</span>
                      {activeMcpServer ? 'この画面で結果確認' : '履歴へ保存'}
                    </li>
                  </ol></details>}
                  <div className="sky-chat-workflow-body">
                    {activeTool?.status === 'candidate' && activeTool.runner !== 'candidate-local' ? (
                      <div className="sky-chat-launch-tool">
                        <div>
                          <strong>{activeTool.name}</strong>
                          <p>
                            Smith登録済みです。実行器をこのPCのSmith SDKへ接続すると、同じ入力をEveから実行できます。
                          </p>
                        </div>
                        <Link href="/studio">
                          コードを接続 <ArrowRight size={16} />
                        </Link>
                      </div>
                    ) : activeTool?.launchPath ? (
                      <div className="sky-chat-launch-tool">
                        <div>
                          <strong>{activeTool.name}</strong>
                          <p>
                            専用画面で入力と実行条件を確認します。開始後の状態と結果はEveへ戻って確認できます。
                          </p>
                        </div>
                        <Link href={activeTool.launchPath}>
                          ツールを開く <ArrowRight size={16} />
                        </Link>
                      </div>
                    ) : activeTool?.runner === 'candidate-local' ? (
                      <SkyCandidateRunner
                        key={activeRequest.id}
                        tool={activeTool.id as JobTool}
                        name={activeTool.name}
                        initialInput={activeRequest.text}
                        onOutcome={(next) => recordOutcome(next, activeTool.id)}
                        onRunningChange={(value) => {
                          setRunning(value);
                          if (value) recordWorkflowStatus('running');
                        }}
                        onFailure={() => recordWorkflowStatus('failed')}
                        onRecord={(_tool, _transport, status) => {
                          recordWorkflowStatus(status);
                          return Promise.resolve();
                        }}
                      />
                    ) : activeTool?.runner ? (
                      <MrToolRunner
                        key={activeRequest.id}
                        tool={activeTool.runner}
                        initialText={activeRequest.text}
                        onOutcome={(next) => recordOutcome(next, activeTool.id)}
                        onRunningChange={(value) => {
                          setRunning(value);
                          if (value) recordWorkflowStatus('running');
                        }}
                        onFailure={() => recordWorkflowStatus('failed')}
                        onRecord={(_tool, _transport, status) => {
                          recordWorkflowStatus(status);
                          return Promise.resolve();
                        }}
                      />
                    ) : activeTool?.integration === 'fashion-brand-ops' ? (
                      <FashionBrandOpsRunner onOutcome={(next) => recordOutcome(next, activeTool.id)} />
                    ) : activeMcpServer ? (
                      <McpBotRunner
                        key={`${activeRequest.id}-${activeMcpServer.id}`}
                        server={activeMcpServer}
                        request={activeRequest.text}
                        onRunningChange={setRunning}
                        onStatusChange={recordWorkflowStatus}
                        onOutcome={(next) => recordOutcome(next, activeRequest.toolId)}
                        onDisconnected={() => {
                          setActiveRequest(null);
                          setSelectedToolId(AUTO_MODE);
                          refreshConnectedMcp();
                          setMessages((current) => [
                            ...current,
                            {
                              id: `chat-${crypto.randomUUID()}-sky`,
                              side: 'sky',
                              text: `${activeMcpServer.name}を停止しました。再接続するとbot一覧へ戻ります。`,
                            },
                          ]);
                        }}
                      />
                    ) : (
                      <p>
                        この担当の実行画面は準備中です。接続状態と対応環境をSmithで確認してください。
                      </p>
                    )}
                  </div>
                </section>
              )}

              <div ref={messagesEndRef} aria-hidden="true" />
            </div>

            <form className="sky-chat-composer" onSubmit={sendMessage}>
              {error && <SkyNotice message={error} />}
              <div className="sky-chat-composer-box">
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(event) => updateDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  rows={1}
                  maxLength={2000}
                  aria-describedby="sky-chat-composer-help"
                  aria-label={
                    selectedTool
                      ? `${roleFor(selectedTool)}への依頼`
                      : selectedMcpServer
                        ? `${selectedMcpServer.name}への指示`
                        : 'Eveへの依頼'
                  }
                  placeholder={selectedTool ? 'このツールでやりたいことを入力…' : '何を進めたいですか？'}
                />
                <button disabled={agentBlocked || !draft.trim() || chatLoading || Boolean(composerNeedsRemoteEstimate && remoteBudgetInput.trim() && remoteCurrency && parseCurrencyInputToMinor(remoteBudgetInput, remoteCurrency) === null)} aria-label={composerHasToolRoute ? 'ツールの内容を確認' : composerNeedsRemoteEstimate ? '料金を見積もる' : '送信'}>
                  {composerHasToolRoute ? 'ツールの内容を確認' : composerNeedsRemoteEstimate ? '料金を見積もる' : <Send size={18} />}
                </button>
              </div>
              {chatLoading && <output className="zema-thinking">Eveが返答を考えています…</output>}
              {lastLlmUsage?.threadId === threadId && <SkyUsageDetails observation={lastLlmUsage.observation} />}
              {composerHasToolRoute && remoteTextProvider && <p className="sky-chat-local-llm-note">選択したSmith Toolの状態と入力を下で確認します。クラウド会話モデルへは送信しません。</p>}
              {composerNeedsRemoteEstimate && (
                <section className="zema-remote-consent" aria-live="polite">
                  <p>クラウドAIの料金見積です。依頼文は見積計算のためRockstarOS内で処理し、AIモデル 提供元には送信しません。提供元への実行と請求は、実行前承認・Wallet予約・利用量精算の受入まで無効です。</p>
                  {remoteEstimate && (
                    <dl>
                      <div><dt>最大費用</dt><dd>{formatCurrencyMinor(remoteEstimate.estimate.maximumChargeMinor, remoteEstimate.estimate.currency)}</dd></div>
                      <div><dt>入力上限</dt><dd>{remoteEstimate.estimate.inputTokenUpperBound.toLocaleString('ja-JP')} token相当（UTF-8上限方式）</dd></div>
                      <div><dt>出力上限</dt><dd>{remoteEstimate.estimate.outputTokenLimit.toLocaleString('ja-JP')} tokens</dd></div>
                      <div><dt>料金版</dt><dd>{remoteEstimate.estimate.pricingVersion}</dd></div>
                      <div><dt>見積期限</dt><dd>{new Date(remoteEstimate.estimate.expiresAt).toLocaleString('ja-JP')}</dd></div>
                      <div><dt>上限確認</dt><dd>{remoteEstimate.userCapMinor === null ? '未設定' : remoteEstimate.withinUserCap ? '指定上限内' : '指定上限を超過'}</dd></div>
                      <div><dt>出典</dt><dd><a href={remoteEstimate.rateSource} target="_blank" rel="noreferrer">{remoteEstimate.cardId} · 料金情報</a></dd></div>
                    </dl>
                  )}
                  {remoteCurrency && (
                    <label>この依頼の支出上限（{remoteCurrency}）
                      <input
                        type="number"
                        min="0"
                        step={remoteCurrency === 'JPY' || remoteCurrency === 'KRW' ? '1' : '0.01'}
                        inputMode="decimal"
                        value={remoteBudgetInput}
                        onChange={(event) => {
                          setRemoteBudgetInput(event.target.value);
                          setRemoteEstimate(null);
                        }}
                        aria-label={`支出上限 ${remoteCurrency}`}
                      />
                    </label>
                  )}
                  {remoteCurrencyOptions.length > 1 && (
                    <label>見積通貨
                      <select value={remoteCurrency} onChange={(event) => {
                        setRemoteCurrency(event.target.value);
                        setRemoteBudgetInput('');
                        setRemoteEstimate(null);
                      }}>
                        <option value="">選択してください</option>
                        {remoteCurrencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    </label>
                  )}
                  {remoteCurrency && remoteBudgetInput &&
                    parseCurrencyInputToMinor(remoteBudgetInput, remoteCurrency) === null && (
                      <p role="alert">{remoteCurrency}の金額形式を確認してください。</p>
                    )}
                  {remoteCurrency && <p>入力した上限はこの依頼の見積判定にのみ使います。実行承認や残高予約には使われず、クラウド実行は引き続き無効です。</p>}
                  {!requestedAgentId && textProvider === 'openai' && <button type="button" disabled={chatLoading || !draft.trim()} onClick={() => {
                    setCloudWorkDraft({
                      prompt: draft.trim(), currency: remoteCurrency,
                      maximumBudgetInput: remoteBudgetInput,
                      model: providerRouting.textGenerationModel?.trim() || undefined,
                    });
                    router.push(zemaWorkPath);
                  }}>この依頼文を仕事へ引き継ぐ <ArrowRight size={16} aria-hidden="true" /></button>}
                </section>
              )}
              <details className="zema-model-settings">
                <summary>会話モデル: {textProviderDefinition.name}</summary>
                <div>
                  <label>接続先
                    <select disabled={Boolean(requestedAgentId)} value={textProvider} onChange={(event) => changeProviderRoute('textGeneration', event.target.value)}>
                      {textModelProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                    </select>
                  </label>
                  <label>モデルID
                    <input disabled={Boolean(requestedAgentId)} value={textModel ?? ''} onChange={(event) => changeProviderRoute('textGenerationModel', event.target.value)} list="zema-chat-model-presets" />
                    <datalist id="zema-chat-model-presets">{localModelPresets.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</datalist>
                  </label>
                </div>
                <p>{textProviderDefinition.detail} {requestedAgentId && <Link href="/#sky-manage">担当のLLMはSmithで変更</Link>}</p>
              </details>
              <div className="zema-composer-toolbar" id="sky-chat-composer-help">
                <label className="zema-tool-picker">
                  <Sparkles size={15} aria-hidden="true" />
                  <span className="sr-only">担当を選ぶ</span>
                  <select
                    aria-label="担当を選ぶ"
                    disabled={Boolean(requestedAgentId)}
                    value={selectedToolId}
                    onChange={(event) => chooseMode(event.target.value)}
                  >
                    <option value={AUTO_MODE}>自動で選ぶ</option>
                    {modeApps.length > 0 && <optgroup label="Smith Tool">
                      {modeApps.map((tool) => <option key={tool.id} value={tool.id}>{roleFor(tool)} · {tool.name}</option>)}
                    </optgroup>}
                    {connectedMcpServers.length > 0 && <optgroup label="このPCの外部ツール接続">
                      {connectedMcpServers.map((server) => <option key={server.id} value={mcpMode(server.id)}>{server.name}</option>)}
                    </optgroup>}
                  </select>
                </label>
                <Link href="/sky" className="zema-add-tool" aria-label="Smithでツールを追加">
                  <Plus size={15} /> <span>ツールを追加</span>
                </Link>
                <span className="zema-composer-tip">Enterで送信 · Shift+Enterで改行</span>
                <span className="zema-composer-count">{draft.length}/2000</span>
              </div>
            </form>
          </>
        )}
      </section>
    </WorkspaceShell>
  );
}
