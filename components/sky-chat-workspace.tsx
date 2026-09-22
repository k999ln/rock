'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
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
import { routeSkyRequest, skyRoles, type SkyRole } from '@/lib/sky-routing';
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
import ToolCharacterDetails, { ToolCharacter } from '@/components/tool-character';
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
  readZemaChatSessions,
  saveZemaChatSession,
  type ZemaChatSession,
} from '@/lib/zema-chat-session';
import { skyToolLabelFor } from '@/lib/sky-tool-labels';

type ChatEntry = {
  id: string;
  side: 'me' | 'sky';
  text: string;
  tool?: string;
  suggestedTool?: string;
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
};

const providerRoutingFields: Array<{
  id: string;
  label: string;
  capability: SkyProviderCapability;
}> = [
  { id: 'imageGeneration', label: '画像', capability: 'image_generation' },
  { id: 'videoGeneration', label: '動画', capability: 'video_generation' },
  { id: 'textGeneration', label: '文章・LLM', capability: 'text_generation' },
  { id: 'workflow', label: 'ワークフロー', capability: 'workflow' },
  { id: 'socialPublish', label: 'SNS公開', capability: 'social_publish' },
  { id: 'gameDelivery', label: 'ゲーム導入', capability: 'game_delivery' },
];

function roleFor(tool: Automation) {
  return (
    skyRoles.find((role) => role.toolId === tool.id)?.label ??
    skyToolLabelFor(tool.id)?.role ??
    'Skyアプリ'
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
    if (latest?.status === 'failed' || latest?.status === 'interrupted')
      return '下書き要確認・本体未接続';
    if (latest?.status === 'running') return '下書き作成中・本体未接続';
    if (latest?.status === 'completed') return '下書き完了・本体未接続';
    return '本体未接続';
  }
  if (tool.runner === 'jev-evaluation' && !latest)
    return '外部AIの接続確認が必要';
  return latest ? jobMessage(latest) : 'Sky登録済み';
}

function responseFor(
  tool: Automation | null,
  routedRole: SkyRole | null,
) {
  if (tool?.status === 'candidate' && tool.runner !== 'candidate-local')
    return `${roleFor(tool)}はSkyに登録済みですが、実行器の接続待ちです。下のカードから接続方法を確認できます。`;
  if (tool?.status === 'candidate' && tool.runner === 'candidate-local')
    return `${roleFor(tool)}でローカル確認・下書きを進めます。外部サービス、端末、送信先には接続しません。`;
  if (tool)
    return `${roleFor(tool)}で進めます。下の処理カードで必要な入力を確認できます。`;
  if (routedRole)
    return `${routedRole.label}はまだ接続されていません。Skyで接続すると、次からはここで頼めます。`;
  return '担当を選べませんでした。Skyで接続状態を確認してください。';
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

export default function SkyChatWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preferredTool = searchParams.get('tool') ?? '';
  const requestedThreadId = searchParams.get('thread') ?? '';
  const preferredFund = searchParams.get('fund') ?? '';
  const workView = searchParams.get('view') === 'work';
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyQuery, setHistoryQuery] = useState('');
  const [allBotsOpen, setAllBotsOpen] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [remoteConsent, setRemoteConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { needsSignin, setNeedsSignin } = useExecutionAccess();
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
              : 'Zemaを読み込めませんでした。',
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
    if (workView || needsSignin) return;
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
  }, [hasActiveJob, needsSignin, workView]);

  useEffect(() => {
    if (workView || needsSignin) return;
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
  }, [hasActiveCsvJob, needsSignin, workView]);

  useEffect(() => {
    if (workView || needsSignin) return;
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
  }, [needsSignin, preferredFund, workView]);

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
  const preferredApp = useMemo(
    () => catalog.find((tool) => tool.id === preferredTool) ?? null,
    [preferredTool],
  );
  const modeApps = useMemo(
    () =>
      preferredApp &&
      !connectedApps.some((tool) => tool.id === preferredApp.id)
        ? [preferredApp, ...connectedApps]
        : connectedApps,
    [connectedApps, preferredApp],
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
  const textProvider = isTextModelProvider(providerRouting.textGeneration)
    ? providerRouting.textGeneration
    : 'local-model';
  const textProviderDefinition = textModelProviderDefinition(textProvider);
  const remoteTextProvider = textProviderDefinition.locality === 'remote';
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
    const frame = window.requestAnimationFrame(() => {
    let sessions: ZemaChatSession[] = [];
    try { sessions = readZemaChatSessions(); } catch { /* Private storage may be unavailable. */ }
    setRecentThreads(sessions);
    setSessionReady(false);
    setThreadId('');
    setThreadCreatedAt(0);
    setMessages([]);
    setActiveRequest(null);
    setRequestStartedAt(0);
    setWorkflowStatus('ready');
    setOutcome(null);
    const saved = sessions.find((item) => item.id === requestedThreadId && item.toolId === preferredTool);
    if (saved) {
      setThreadId(saved.id);
      setThreadCreatedAt(saved.createdAt);
      setSelectedToolId(saved.toolId);
      setMessages(saved.messages);
      setActiveRequest(saved.activeRequest
        ? {
            ...saved.activeRequest,
            executionProvider: saved.activeRequest.executionProvider ?? 'local-model',
            plannerProvider: saved.activeRequest.plannerProvider ?? 'local-model',
            plannerModel: saved.activeRequest.plannerModel ??
              textModelProviderDefinition(saved.activeRequest.plannerProvider ?? 'local-model').defaultModel,
          }
        : null);
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
    setSelectedToolId(tool.id);
    setThreadId(handoff.id);
    setThreadCreatedAt(handoff.createdAt);
    setMessages([
      ...(handoff.request ? [{ id: `${id}-me`, side: 'me' as const, text: handoff.request, tool: tool.id }] : []),
      { id: `${id}-sky`, side: 'sky', text: handoff.request
        ? `${roleFor(tool)}へSkyから引き継ぎました。入力を確認し、必要な承認を得てから実行します。進捗と結果はこのチャットに表示します。`
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
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, preferredTool, requestedThreadId, workView]);

  useEffect(() => {
    if (!sessionReady || !threadId || threadId !== requestedThreadId || !threadCreatedAt) return;
    try {
      const sessions = saveZemaChatSession({
        version: 1, id: threadId, toolId: preferredTool, createdAt: threadCreatedAt,
        messages, activeRequest, workflowStatus, outcome,
      });
      const frame = window.requestAnimationFrame(() => setRecentThreads(sessions));
      return () => window.cancelAnimationFrame(frame);
    } catch { /* Keep the current conversation usable without tab storage. */ }
  }, [sessionReady, threadId, requestedThreadId, threadCreatedAt, preferredTool, messages, activeRequest, workflowStatus, outcome]);

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
    const candidate = catalog.find((item) => item.id === toolId)?.status === 'candidate';
    setMessages((current) => [...current, {
      id: `result-${crypto.randomUUID()}`,
      side: 'sky',
      text: next.ok
        ? `${candidate ? '下書きができました' : '結果ができました'}\n\n${readableChatResult(next.text)}`
        : `確認が必要です\n\n${next.text}`,
      tool: toolId,
    }]);
  }

  function chooseMode(toolId: string) {
    setError('');
    if (toolId === selectedToolId) return;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatLoading(false);
    setSelectedToolId(toolId);
    setDraft('');
    setMessages([]);
    setActiveRequest(null);
    setOutcome(null);
    setWorkflowStatus('ready');
    setThreadId('');
    setThreadCreatedAt(0);
    setSessionReady(false);
    router.replace(`/chat?tool=${encodeURIComponent(toolId)}`, { scroll: false });
  }

  function startNewChat() {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatLoading(false);
    setSelectedToolId(AUTO_MODE);
    setDraft('');
    setMessages([]);
    setActiveRequest(null);
    setRequestStartedAt(0);
    setWorkflowStatus('ready');
    setOutcome(null);
    setError('');
    setRemoteConsent(false);
    setThreadId('');
    setThreadCreatedAt(0);
    setSessionReady(false);
    closeSidebarOnSmallScreen();
  }

  function changeProviderRoute(field: string, value: string) {
    const next = { ...providerRoutingRef.current, [field]: value };
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
            : 'Provider設定を保存できませんでした。',
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

  function sendMessage(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    if (chatLoading) return;
    const targetMcp = selectedMcpServer;
    const routedRole = selectedTool || targetMcp ? null : routeSkyRequest(text);
    const routedTool = routedRole
      ? (connectedApps.find((item) => item.id === routedRole.toolId) ?? null)
      : null;
    const tool = selectedTool ?? routedTool;
    const toolId = targetMcp ? mcpMode(targetMcp.id) : tool?.id;
    const suggestedToolId = routedRole?.toolId;
    const id = `chat-${crypto.randomUUID()}`;
    const nextThreadId = threadId || crypto.randomUUID();

    const conversational = !toolId && !routedRole;
    if (remoteTextProvider && !remoteConsent) {
      setError(`${textProviderDefinition.name}へ依頼を送るには、下の送信許可を確認してください。`);
      return;
    }
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
            providerRouting.textGenerationModel || textProviderDefinition.defaultModel,
        }
      : null;
    setMessages(nextMessages);
    if (conversational || toolId) {
      const controller = new AbortController();
      chatAbortRef.current?.abort();
      chatAbortRef.current = controller;
      activeChatThreadRef.current = nextThreadId;
      setChatLoading(true);
      const conversation = [...messages, { id: `${id}-me`, side: 'me' as const, text }]
        .slice(-12)
        .map((message) => `${message.side === 'me' ? 'ユーザー' : 'Zema'}: ${message.text}`)
        .join('\n\n');
      const selectedToolPrompt = tool
        ? `担当Bot: ${tool.name}\n役割: ${roleFor(tool)}\n説明: ${tool.description}\n依頼: ${text}`
        : conversation;
      void fetch('/api/llm/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: textProvider,
          model: providerRouting.textGenerationModel || undefined,
          baseUrl: textProvider === 'local-model'
            ? providerRouting.localLlmBaseUrl || undefined
            : undefined,
          system: tool
            ? `あなたはZema内の${tool.name} Botです。${roleFor(tool)}として、依頼を短く整理し、次に必要な入力・確認・実行手順を日本語で示してください。実行していない作業を完了したと主張せず、外部送信や法的判断を勝手に行わないでください。`
            : 'あなたはZemaです。日本語で自然に対話し、必要なときだけSkyのツール利用を案内してください。実行していない作業を完了したと主張しないでください。',
          prompt: selectedToolPrompt.slice(-20_000),
          consent: remoteTextProvider && remoteConsent,
        }),
        signal: controller.signal,
      }).then(async (response) => {
        const result = await response.json() as { text?: string; code?: string };
        if (!response.ok || !result.text) throw new Error(result.code || 'TEXT_GENERATION_FAILED');
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
        const detail = textProvider === 'local-model'
          ? code === 'LOCAL_LLM_BRIDGE_REQUIRED'
            ? 'Local Action Assistantの接続が未接続です。Ollama・LM Studio・llama.cppなどのローカルブリッジを起動して接続してください。Cloudへはフォールバックしません。'
            : 'Local LLMブリッジに接続できませんでした。設定したループバックURLのサーバーを起動してください。Cloudへはフォールバックしません。'
          : code === 'REMOTE_LLM_DISABLED'
            ? '外部モデルはサーバー側で無効です。Skyの接続管理とサーバー設定を確認してください。'
            : code === 'MISSING_PROVIDER_CREDENTIAL' || code === 'MISSING_PROVIDER_ENDPOINT'
              ? '文章モデルの接続設定が不足しています。Skyの接続管理を確認してください。'
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
        setRemoteConsent(false);
      });
    } else {
      setChatLoading(false);
      setRemoteConsent(false);
    }
    if (toolId) {
      setWorkflowStatus('ready');
      setActiveRequest(nextRequest);
      setRequestStartedAt(currentTimestamp());
    }
    if (!threadId) {
      const createdAt = currentTimestamp();
      const sessionToolId = toolId ?? AUTO_MODE;
      try {
        setRecentThreads(saveZemaChatSession({
          version: 1,
          id: nextThreadId,
          toolId: sessionToolId,
          createdAt,
          messages: nextMessages,
          activeRequest: nextRequest,
          workflowStatus: 'ready',
          outcome: null,
        }));
        setThreadId(nextThreadId);
        setThreadCreatedAt(createdAt);
        setSessionReady(true);
        router.replace(`/chat?tool=${encodeURIComponent(sessionToolId)}&thread=${encodeURIComponent(nextThreadId)}`, { scroll: false });
      } catch { /* Keep the conversation available in this tab if storage is blocked. */ }
    }
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
    return <ToolCharacterDetails id={id} size={size} name={tool?.name ?? server?.name ?? 'Zema'}
      description={tool?.description ?? server?.description ?? '会話しながら、やりたいことを整理して接続済みの道具につなぎます。'}
      status={current ? (workflowStatus === 'running' ? '処理中' : workflowStatus === 'completed' ? '結果があります' : workflowStatus === 'failed' ? '確認が必要です' : '入力・実行の確認待ち') : latest ? `直近の仕事：${jobMessage(latest)}` : tool?.status === 'candidate' ? '本体の接続待ち' : 'この会話ではまだ作業を始めていません'}
      result={result?.text}
      request={current ? activeRequest.text : undefined}
      next={current ? (workflowStatus === 'running' ? '結果が届くまでお待ちください。' : workflowStatus === 'completed' ? '結果を確認し、続きの依頼を伝えてください。' : '会話内の処理カードで入力と実行条件を確認してください。') : '名前を選んで、チャットから依頼できます。'} />;
  }

  return (
    <WorkspaceShell
      title="Zema"
      contentClassName="sky-chat-page"
      running={running}
    >
      <section
        className={`sky-chat-simple zema-grok-shell${sidebarOpen ? '' : ' is-sidebar-collapsed'}${!workView && displayMessages.length === 0 ? ' is-empty' : ''}`}
        aria-label="Zemaスレッド"
      >
        <aside className="zema-sidebar" aria-label="Zema Botと会話">
          <div className="zema-sidebar-top">
            <div className="zema-sidebar-identity"><span className="zema-sidebar-brand" aria-hidden="true">Z</span><strong>Zema</strong></div>
            <button type="button" className="zema-sidebar-close" aria-label="履歴を閉じる" onClick={() => setSidebarOpen(false)}><PanelLeft size={18} /></button>
          </div>
          <Link className="zema-new-chat" href="/chat" onClick={startNewChat}><Plus size={17} /> <span>新しい会話</span></Link>
          <label className="zema-history-search"><span className="sr-only">Botを検索</span><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="検索" /></label>
          <div className="zema-sidebar-section-title">BOTS</div>
          <div className="zema-character-list">
            {sidebarBotApps.map((tool) => {
              const latest = jobs.find((job) => job.tool === tool.id);
              return (
                <div className={characterStyles.row} key={`sidebar-bot-${tool.id}`}>
                {characterDetails(tool.id)}
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
              {characterDetails(mcpMode(server.id))}
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
                  <small>{server.passport?.tools.length ?? 0}機能 · MCP</small>
                </span>
                <i className="is-online" />
              </button>
              </div>
            ))}
          </div>
          {!historyQuery.trim() && visibleBotApps.length > 4 && (
            <button type="button" className="zema-bot-show-all" aria-expanded={allBotsOpen} onClick={() => setAllBotsOpen((open) => !open)}>
              {allBotsOpen ? 'Botを少なく表示' : `すべてのBotを見る (${visibleBotApps.length})`}
            </button>
          )}
          <div className="zema-sidebar-section-title">THREADS</div>
          <div className="zema-history-list">
            {visibleThreads.length === 0 ? <p className="zema-history-empty">会話はまだありません</p> : visibleThreads.map((session) => {
              const title = session.messages.find((message) => message.side === 'me')?.text || '新しい会話';
              return <Link key={session.id} className={session.id === threadId ? 'is-current' : ''} href={`/chat?tool=${encodeURIComponent(session.toolId)}&thread=${encodeURIComponent(session.id)}`} onClick={closeSidebarOnSmallScreen}><MessageCircle size={15} /><span>{title}</span></Link>;
            })}
          </div>
          <div className="zema-sidebar-bottom"><Link href="/sky"><Grid2X2 size={16} /><span>Skyでツールを追加</span></Link><Link href="/chat?view=work"><ListChecks size={16} /><span>仕事</span></Link><Link href="/"><House size={16} /><span>ホーム</span></Link></div>
        </aside>
        {sidebarOpen && <button type="button" className="zema-sidebar-scrim" aria-label="履歴を閉じる" onClick={() => setSidebarOpen(false)} />}
        <header className="sky-chat-commandbar">
          <button type="button" className="zema-sidebar-toggle" aria-label="会話履歴を開く" onClick={() => setSidebarOpen(true)}><PanelLeft size={20} /></button>
          <div className="zema-room-heading">
            {characterDetails('zema', 40)}
            <div><h1>Zema</h1><span>会話</span></div>
          </div>
          {selectedTool || selectedMcpServer ? (
            <div className="zema-active-bot" title={selectedTool?.name ?? selectedMcpServer?.name}>
              {characterDetails(selectedToolId, 40)}
              <div><small>担当Bot</small><strong>{selectedTool?.name ?? selectedMcpServer?.name}</strong></div>
            </div>
          ) : <span className="zema-auto-label">担当を自動で選択</span>}
          <nav aria-label="Zemaナビゲーション">
            <Link href="/" aria-label="ホームへ戻る">
              <House size={18} />
              <span>ホーム</span>
            </Link>
            <Link href="/sky" aria-label="Skyでアプリを見る">
              <Grid2X2 size={19} />
              <span>Sky</span>
            </Link>
            <Link
              href="/chat"
              aria-current={!workView ? 'page' : undefined}
              aria-label="Zemaの会話を開く"
            >
              <MessageCircle size={18} />
              <span>会話</span>
            </Link>
            <Link
              href="/chat?view=work"
              aria-current={workView ? 'page' : undefined}
              aria-label="Zemaで仕事を管理する"
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
                <small>ZEMA WORK CONTROL</small>
                <h2 id="chat-work-title">仕事をZemaで管理</h2>
              </div>
              <p>
                作成、手順の実行、確認、中止、結果の記録をここに集約します。
              </p>
            </header>
            <section
              className="sky-chat-job-center"
              aria-labelledby="chat-job-title"
            >
              <div className="sky-chat-job-heading">
                <div>
                  <h3 id="chat-job-title">ツールの実行</h3>
                  <p>受付、実行中、結果、停止をZema内で確認します。</p>
                </div>
                <span>{jobs.length}件</span>
              </div>
              {error && (
                <p className="sky-chat-work-error" role="alert">
                  {error}
                </p>
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
                            href={`/chat?tool=${encodeURIComponent(job.tool)}`}
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
            <Workbench embedded />
          </section>
        ) : needsSignin ? (
          <div className="sky-chat-centered">
            <ExecutionSignin />
          </div>
        ) : loading ? (
          <div className="sky-chat-centered">Zemaを読み込んでいます…</div>
        ) : (
          <>
            <div
              className="sky-chat-messages"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
              {displayMessages.length > 0 && <div className="sky-chat-day">今日</div>}
              {displayMessages.length === 0 && (
                <section className="zema-empty" aria-labelledby="zema-empty-title">
                  <ToolCharacter id={selectedTool?.id ?? 'zema'} size={96} />
                  <h2 id="zema-empty-title">今日は何を進めますか？</h2>
                  <p>
                    {selectedTool || selectedMcpServer
                      ? '依頼を書いてください。必要な入力と結果は、この会話で確認できます。'
                        : 'やりたいことをそのまま入力してください。Zemaが接続済みの道具を選びます。'}
                  </p>
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
                      {message.side === 'sky' && <small>Zema</small>}
                      <p className="zema-message-text">{message.text}</p>
                      {message.side === 'sky' && message.suggestedTool && (
                        <Link className="sky-chat-inline-action" href="/sky">
                          Skyで接続する
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
                              ? activeTool?.runner === 'candidate-local' ? '下書きあり' : '結果あり'
                          : workflowStatus === 'failed'
                            ? '要確認'
                            : '入力待ち'}
                    </span>
                  </header>
                  <p className="sky-chat-local-llm-note">
                    {activeTool?.runner === 'candidate-local'
                      ? 'この候補は外部サービスに接続しないローカル確認・下書きアダプターです。実際のサービス接続は別途実行器を追加してください。'
                      : '入力を確認して実行してください。結果はこの会話に表示されます。'}
                  </p>
                  {activeTool && (
                    <details className="sky-chat-provider-routing">
                      <summary>ツールの接続設定</summary>
                      <p>この設定はZemaの会話・案内に適用されます。候補ツールのローカル確認・下書き処理は外部Providerを呼びません。</p>
                      <div className="sky-chat-provider-grid">
                        {providerRoutingFields.map((field) => (
                          <label key={field.id}>
                            <span>{field.label}</span>
                            <select
                              value={providerRouting[field.id] ?? ''}
                              onChange={(event) => changeProviderRoute(field.id, event.target.value)}
                            >
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
                        <span>文章・LLMのモデルID</span>
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
                            Sky登録済みです。実行器をこのPCのSky SDKへ接続すると、同じ入力をZemaから実行できます。
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
                            専用画面で入力と実行条件を確認します。開始後の状態と結果はZemaへ戻って確認できます。
                          </p>
                        </div>
                        <Link href={activeTool.launchPath}>
                          Toolを開く <ArrowRight size={16} />
                        </Link>
                      </div>
                    ) : activeTool?.runner === 'candidate-local' ? (
                      <SkyCandidateRunner
                        key={activeRequest.id}
                        tool={activeTool.id as JobTool}
                        name={activeTool.name}
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
                        この担当の実行画面は準備中です。接続状態と対応環境をSkyで確認してください。
                      </p>
                    )}
                  </div>
                </section>
              )}

              <div ref={messagesEndRef} aria-hidden="true" />
            </div>

            <form className="sky-chat-composer" onSubmit={sendMessage}>
              {error && <p role="alert">{error}</p>}
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
                        : 'Zemaへの依頼'
                  }
                  placeholder={selectedTool ? `${roleFor(selectedTool)}に依頼する…` : 'Zemaに依頼する…'}
                />
                <button disabled={!draft.trim() || chatLoading} aria-label="送信">
                  <Send size={18} />
                </button>
              </div>
              {chatLoading && <output className="zema-thinking">Zemaが返答を考えています…</output>}
              {remoteTextProvider && (
                <label className="zema-remote-consent">
                  <input type="checkbox" checked={remoteConsent} onChange={(event) => setRemoteConsent(event.target.checked)} />
                  <span>会話を{textProviderDefinition.name}へ送ることを今回だけ許可する</span>
                </label>
              )}
              <details className="zema-model-settings">
                <summary>会話モデル: {textProviderDefinition.name}</summary>
                <div>
                  <label>接続先
                    <select value={textProvider} onChange={(event) => changeProviderRoute('textGeneration', event.target.value)}>
                      {textModelProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                    </select>
                  </label>
                  <label>モデルID
                    <input value={providerRouting.textGenerationModel ?? ''} onChange={(event) => changeProviderRoute('textGenerationModel', event.target.value)} list="zema-chat-model-presets" />
                    <datalist id="zema-chat-model-presets">{localModelPresets.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</datalist>
                  </label>
                </div>
                <p>{textProviderDefinition.detail}</p>
              </details>
              <div className="zema-composer-toolbar" id="sky-chat-composer-help">
                <label className="zema-tool-picker">
                  <Sparkles size={15} aria-hidden="true" />
                  <span className="sr-only">担当を選ぶ</span>
                  <select
                    aria-label="担当を選ぶ"
                    value={selectedToolId}
                    onChange={(event) => chooseMode(event.target.value)}
                  >
                    <option value={AUTO_MODE}>自動で選ぶ</option>
                    {modeApps.length > 0 && <optgroup label="Sky Tool">
                      {modeApps.map((tool) => <option key={tool.id} value={tool.id}>{roleFor(tool)} · {tool.name}</option>)}
                    </optgroup>}
                    {connectedMcpServers.length > 0 && <optgroup label="このPCのMCP">
                      {connectedMcpServers.map((server) => <option key={server.id} value={mcpMode(server.id)}>{server.name}</option>)}
                    </optgroup>}
                  </select>
                </label>
                <Link href="/sky" className="zema-add-tool" aria-label="Skyでツールを追加">
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
