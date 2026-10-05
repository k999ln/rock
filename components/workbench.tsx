'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in requires top-level navigation. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Play, Plus, RefreshCw } from 'lucide-react';
import {
  workflowTemplates,
  type WorkJob,
  type WorkCommand,
  type WorkPlan,
} from '@/lib/workflow';
import { type RunRecorder } from '@/lib/device';
import { matchesA2ADelegationRecovery } from '@/lib/a2a-delegation-recovery';
import type { A2AParentControllerSnapshot } from '@/lib/a2a-parent-controller';
import type { A2APriceQuote } from '@/lib/a2a-price-quote';
import type { SkyPackageRuntimeBinding } from '@/lib/sky-package-runtime-binding';
import { formatCurrencyInputFromMinor, formatCurrencyMinor, formatCurrencyRatePerMillionTokens, parseCurrencyInputToMinor } from '@/lib/currency-format';
import { remoteAiTextRequestDigest } from '@/lib/remote-ai-text-request';
import { remoteAiTextRequest, RemoteAiTextClientError } from '@/lib/remote-ai-text-client';
import { MrToolRunner, type MrRunner } from '@/components/mr-tool-runner';
import { DeviceConnection } from '@/components/device-connection';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import WorkspaceShell from '@/components/workspace-shell';
import { includedRockstarServicePackageKeys } from '@/lib/rockstar-service-package-access';
import { rockstarPackageHandoffMessage, type RockstarPackageHandoff } from '@/lib/rockstar-package-handoff';
import { buildA2AResultHandoffPrompt } from '@/lib/a2a-result-handoff';
import { compatibleLocalPackageRuntimes } from '@/lib/sky-package-runtime';
import type { SkyToolPackage } from '@/lib/sky-tool-package';
import type { McpConnection } from '@/lib/mcp-hub';
import { McpBotRunner } from '@/components/mcp-bot-runner';

const stateNames = {
  active: '作業中',
  review: '最終確認',
  completed: '完了',
  cancelled: '中止',
};
type Update = { jobId: string; revision: number; command: WorkCommand };
type Delegation = {
  id: string;
  parentJobId: string;
  predecessorDelegationId: string | null;
  idempotencyKey: string;
  messageId: string;
  targetOrigin: string;
  targetAgentName: string;
  targetAgentVersion: string;
  inputSha256: string;
  authorizationSha256: string;
  state: string;
  remoteTaskId: string | null;
  remoteState: string | null;
  deadlineAt: number;
  budgetCurrency: string;
  budgetLimitMinor: number;
  parentBudgetLimitMinor: number;
  continueWhileDeviceOffline: boolean;
  artifactsCaptured: number;
  updatedAt: number;
  liveUsageSnapshot?: {
    sequence: number;
    providerId: string;
    currency: string;
    cumulativeAmountMinor: number;
    pricingVersion: string;
    issuedAt: number;
    receivedAt: number;
    snapshot: { usage?: Array<{ meter: string; quantity: number; unit: string; amountMinor: number }> } | null;
  } | null;
};
type DelegationBudgetPool = {
  currency: string;
  budgetLimitMinor: number;
  reservedMinor: number;
  settledMinor: number;
};
type DelegationBudgetReservation = {
  delegationId: string;
  currency: string;
  reservedMinor: number;
  settledMinor: number | null;
  state: 'held' | 'released' | 'settled';
};
type DelegationFinalUsageReceipt = {
  providerId: string;
  providerReference: string;
  currency: string;
  amountMinor: number;
  issuedAt: number;
  receipt: { pricingVersion?: string; usage?: Array<{ meter: string; quantity: number; unit: string; amountMinor: number }> } | null;
};
type DelegationUsageDetails = {
  usageReceipt: DelegationFinalUsageReceipt | null;
  liveUsageSnapshot: NonNullable<Delegation['liveUsageSnapshot']> | null;
};
type A2AAgentConnection = {
  id: string;
  origin: string;
  cardUrl: string;
  agentName: string;
  agentVersion: string;
  cardSha256: string;
  cardJson: string;
  discoveredAt: number;
};
type ArtifactDocument = {
  schemaVersion: 1;
  artifacts: Array<{
    name?: string;
    description?: string;
    textParts: string[];
  }>;
  omittedNonTextParts: number;
  truncated: boolean;
};
type DelegationRequest = {
  id: string;
  parentJobId: string;
  predecessorDelegationId?: string;
  idempotencyKey: string;
  messageId: string;
  targetOrigin: string;
  targetAgentName: string;
  targetAgentVersion: string;
  message: string;
  budgetCurrency: string;
  budgetLimitMinor: number;
  parentBudgetLimitMinor: number;
  continueWhileDeviceOffline: boolean;
  deadlineAt: number;
  priceQuote?: A2APriceQuote;
  packageRuntimeBindingId?: string;
  packageRuntimeBindingDigest?: string;
};
type DelegationReview = {
  request: DelegationRequest;
  delegationId: string;
  authorizationSha256: string;
};
type DelegationQuote = {
  quote: A2APriceQuote;
  quoteDigest: string;
  requestSha256: string;
  packageRuntimeBinding?: SkyPackageRuntimeBinding;
  packageRuntimeBindingId?: string;
  packageRuntimeBindingDigest?: string;
  fingerprint: string;
};
type RemoteTextExecution = {
  id: string;
  parentJobId: string;
  parentBudgetLimitMinor: number;
  requestId: string;
  approvalDigest: string;
  state: 'quoted' | 'reserved' | 'sending' | 'completed' | 'unreconciled' | 'cancelled' | 'expired';
  quote: {
    requestDigest: string;
    createdAt: number;
    expiresAt: number;
    approvedCapMinor: number;
    ceiling: {
      currency: string;
      maximumChargeMinor: number;
      inputTokenUpperBound: number;
      outputTokenLimit: number;
      modelId: string;
      pricingVersion: string;
      rateCardDigest: string;
    };
  };
  settledMinor: number | null;
  usage: { inputTokens: number; cachedInputTokens: number; cacheWriteInputTokens: number; outputTokens: number } | null;
  price: { chargeMinor: number; currency: string; pricingVersion: string; items: Array<{ category: string; tokens: number; rateMinorMicrosPerMillionTokens: number }> } | null;
  spending?: {
    status: string;
    currency: string;
    currentChargeMinor: number | null;
    currentEstimateMinor: number | null;
    estimateUpdatedAt: number | null;
    estimateBasis: string | null;
    reservedMaximumMinor: number;
    providerMeter: string;
    invoiceVerified: boolean;
  };
  resultText: string | null;
  errorCode: string | null;
  saveResult: boolean;
  createdAt: number;
  updatedAt: number;
};
type RemoteTextEstimate = {
  estimate: RemoteTextExecution['quote']['ceiling'];
  unitRates: Array<{ category: 'ordinary-input' | 'cached-input' | 'cache-write' | 'output'; rateMinorMicrosPerMillionTokens: number }>;
  rateSource: string;
  cardId: string;
  withinUserCap: boolean;
  currencies?: string[];
};
function delegationStateName(state: string) {
  const labels: Record<string, string> = {
    awaiting_approval: '本人の承認待ち',
    prepared: '受付・実行待ち',
    dispatching: '接続確認中',
    dispatch_submitting: '送信中',
    indeterminate: '相手側の状態を照合中',
    submitted: '相手が受付',
    working: '相手が実行中',
    awaiting_remote_input: '相手から追加情報待ち',
    cancel_requested: '停止要求受付',
    cancel_submitting: '停止を照会中',
    cancel_unconfirmed: '停止未確認',
    cancelled_before_dispatch: '送信前に取消',
    expired: '期限切れ',
    remote_cancelled: '相手側の取消を確認',
    remote_completed: '相手側の処理完了・成果確認待ち',
    remote_failed: '相手側で失敗',
    remote_rejected: '相手側で拒否',
  };
  return labels[state] ?? '状態を確認してください';
}
function a2aParentControllerStateName(state: A2AParentControllerSnapshot['state']) {
  const labels: Record<A2AParentControllerSnapshot['state'], string> = {
    not_started: 'Agent作業なし',
    awaiting_approval: '本人の承認待ち',
    dispatch_pending: 'クラウド配信待ち',
    running: 'クラウド実行中',
    reconciliation_required: '状態照合が必要',
    review_results: '成果の確認待ち',
    needs_attention: '要確認',
  };
  return labels[state];
}
function a2aParentControllerNextAction(action: A2AParentControllerSnapshot['nextAction']) {
  const labels: Record<A2AParentControllerSnapshot['nextAction'], string> = {
    choose_agent: 'SkyからAgentを選んで依頼を作成してください。',
    approve_each_paid_task: '各有料依頼の条件・見積・上限を確認し、実行を個別に承認してください。',
    wait_for_cloud_dispatch: '受付済みの同じ依頼の状態を待ってください。再送は不要です。',
    monitor_same_tasks: '既存の依頼IDの進捗を確認してください。新しい依頼を重複送信しないでください。',
    reconcile_before_retry: '結果または停止が未確認です。同じ仕事を別Agentへ再送せず、状態を照合してください。',
    review_result_or_prepare_sibling: '保存済み成果を確認してください。次のAgentへ渡す場合は、新しい見積と承認が必要です。',
    review_failure_or_cancellation: '失敗・取消・予算状態を確認してから、次の操作を決めてください。',
    none: 'Agent作業はありません。',
  };
  return labels[action];
}
function eventDescription(job: WorkJob, command: WorkCommand) {
  if (command.action === 'amc_event') return 'AMCのGoal記録を更新';
  if (command.action === 'edit_plan') return '依頼計画を更新';
  if (command.action === 'complete')
    return `本人が確認して完了: ${command.note}`;
  if (command.action === 'cancel') return '仕事を中止';
  if (command.action === 'amc_event') return 'AMCの記録更新（実行状態はAMCで確認）';
  const title =
    job.steps.find((step) => step.id === command.stepId)?.title ?? '実行';
  const outcome = {
    passed: '処理成功',
    needs_review: '条件の確認が必要',
    failed: '失敗',
  }[command.outcome];
  return `${title} · ${command.sample ? 'サンプル / ' : ''}${outcome} · ${command.transport === 'browser' ? 'ブラウザ' : 'PC'}`;
}
function planGateLabel(requirement: WorkPlan['approvalGates'][number]['requirement']) {
  if (requirement === 'provider_quote_wallet_reservation_and_explicit_cloud_approval')
    return '署名済み見積・Wallet上限予約・Cloud実行の本人承認が必要';
  if (requirement === 'terminal_result_captured_with_usage_receipt')
    return 'Cloudの終端状態・保存成果・利用receipt確認が必要';
  return '登録済み手順の通常確認';
}
function WorkPlanEditor({
  job,
  disabled,
  onSave,
}: {
  job: WorkJob;
  disabled: boolean;
  onSave: (objective: string) => Promise<void>;
}) {
  const [objective, setObjective] = useState(job.plan.objective);
  const [saving, setSaving] = useState(false);
  const editable = job.status === 'active' && !job.events.some((event) => event.command.action === 'record');
  return (
    <section className="work-plan" aria-label="保存済みの依頼計画">
      <h3>依頼計画 v{job.plan.schemaVersion}</h3>
      <p>目的は最初の手順を始める前まで編集できます。これはZemaに保存する仕事の目的です。Cloud Agentへ送る依頼文は別途確認します。承認条件と実行手順はシステムが固定し、計画を変えても実行承認は引き継ぎません。</p>
      <ol>
        {job.steps.map((step) => {
          const gate = job.plan.approvalGates.find((item) => item.stepId === step.id);
          return <li key={step.id}><strong>{step.title}</strong><small>{planGateLabel(gate?.requirement ?? 'none')}</small></li>;
        })}
      </ol>
      {editable ? (
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!objective.trim() || objective.trim() === job.plan.objective || saving || disabled) return;
          setSaving(true);
          void onSave(objective.trim()).catch(() => {}).finally(() => setSaving(false));
        }}>
          <label htmlFor="zema-plan-objective">この仕事で達成すること</label>
            <Textarea id="zema-plan-objective" value={objective} maxLength={1000} rows={3} disabled={disabled || saving}
              onChange={(event) => setObjective(event.target.value)} />
          <button type="submit" disabled={disabled || saving || !objective.trim() || objective.trim() === job.plan.objective}>
            {saving ? '計画を保存中…' : '計画を保存'}
          </button>
        </form>
      ) : <p>手順の記録後は計画を固定します。</p>}
    </section>
  );
}
async function request<T>(method = 'GET', value?: unknown): Promise<T> {
  const response = await fetch('/api/work-jobs', {
    method,
    signal: AbortSignal.timeout(20000),
    ...(value
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        }
      : {}),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || '仕事を読み込めませんでした。');
  return data;
}
async function delegationRequest<T>(path: string, method = 'GET', value?: unknown) {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    ...(value
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        }
      : {}),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '委任を保存できませんでした。');
  return data;
}
async function sha256Hex(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export default function Workbench({
  embedded = false,
  cloudDraft,
  initialPackageKey = '',
  packageRuntimeServers = [],
}: {
  embedded?: boolean;
  cloudDraft?: { prompt: string; currency: string; maximumBudgetInput: string; model?: string } | null;
  initialPackageKey?: string;
  packageRuntimeServers?: McpConnection[];
}) {
  const [jobs, setJobs] = useState<WorkJob[]>([]),
    [selectedId, setSelectedId] = useState('');
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [a2aParentController, setA2aParentController] = useState<A2AParentControllerSnapshot | null>(null);
  const delegationsRef = useRef(delegations);
  useEffect(() => { delegationsRef.current = delegations; }, [delegations]);
  const [delegationBudgetPool, setDelegationBudgetPool] = useState<DelegationBudgetPool | null>(null);
  const [delegationBudgetReservations, setDelegationBudgetReservations] = useState<DelegationBudgetReservation[]>([]);
  const [a2aAgents, setA2aAgents] = useState<A2AAgentConnection[]>([]);
  const [agentOrigin, setAgentOrigin] = useState('');
  const [delegationBusy, setDelegationBusy] = useState(false);
  const [delegationPredecessorId, setDelegationPredecessorId] = useState<string | null>(null);
  const [delegationError, setDelegationError] = useState('');
  const [delegationQuoteConsent, setDelegationQuoteConsent] = useState(false);
  const [delegationQuote, setDelegationQuote] = useState<DelegationQuote | null>(null);
  const [artifactDocuments, setArtifactDocuments] = useState<Record<string, ArtifactDocument[]>>({});
  const [delegationUsageDetails, setDelegationUsageDetails] = useState<Record<string, DelegationUsageDetails | null>>({});
  const [delegationForm, setDelegationForm] = useState({
    targetAgentId: '',
    targetOrigin: '',
    targetAgentName: '',
    targetAgentVersion: '',
    message: '',
    budgetCurrency: 'USD',
    budgetLimitInput: '',
    budgetLimitMinor: 0,
    parentBudgetLimitInput: '',
    parentBudgetLimitMinor: 0,
    continueWhileDeviceOffline: false,
  });
  const [delegationReview, setDelegationReview] = useState<DelegationReview | null>(null);
  const [resultReviewConfirmedForJob, setResultReviewConfirmedForJob] = useState('');
  const [handoffPackageResult, setHandoffPackageResult] = useState<{
    packageKey: string;
    state: 'ready' | 'unavailable' | 'not_included';
    package?: RockstarPackageHandoff;
    manifest?: SkyToolPackage;
  } | null>(null);
  const [selectedPackageRuntime, setSelectedPackageRuntime] = useState<{
    packageKey: string; manifestSha256: string; serverId: string; toolName: string;
  } | null>(null);
  const [localPackageTask, setLocalPackageTask] = useState('');
  const [remoteTextPrompt, setRemoteTextPrompt] = useState(cloudDraft?.prompt ?? '');
  const [remoteTextModel] = useState(cloudDraft?.model ?? '');
  const [remoteTextCurrency, setRemoteTextCurrency] = useState(cloudDraft?.currency || 'USD');
  const [remoteTextCurrencyOptions, setRemoteTextCurrencyOptions] = useState<string[]>([]);
  const [remoteTextCapMinor, setRemoteTextCapMinor] = useState(cloudDraft?.maximumBudgetInput ?? '');
  const [remoteTextParentCapMinor, setRemoteTextParentCapMinor] = useState('');
  const [remoteTextSaveResult, setRemoteTextSaveResult] = useState(false);
  const [remoteTextEstimate, setRemoteTextEstimate] = useState<RemoteTextEstimate | null>(null);
  const [remoteTextExecutions, setRemoteTextExecutions] = useState<RemoteTextExecution[]>([]);
  const [remoteTextExecutionAvailable, setRemoteTextExecutionAvailable] = useState(false);
  const [remoteTextError, setRemoteTextError] = useState('');
  const [remoteTextNeedsSignin, setRemoteTextNeedsSignin] = useState(false);
  const [remoteTextBusy, setRemoteTextBusy] = useState(false);
  const [remoteTextResult, setRemoteTextResult] = useState<{ executionId: string; text: string } | null>(null);
  const [remoteTextDeleteId, setRemoteTextDeleteId] = useState<string | null>(null);
  const remoteTextSubmission = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const delegationSubmission = useRef<{ fingerprint: string; request: DelegationRequest } | null>(null);
  const selectedIdRef = useRef('');
  const [title, setTitle] = useState(''),
    [templateId, setTemplateId] = useState('article'),
    [note, setNote] = useState('');
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false),
    [running, setRunning] = useState(false),
    [deviceOpen, setDeviceOpen] = useState(false);
  const [runnerStep, setRunnerStep] = useState<string | null>(null),
    [pending, setPending] = useState<Update | null>(null);
  const [filter, setFilter] = useState('open');
  const creation = useRef<{
    id: string;
    title: string;
    templateId: string;
  } | null>(null);
  const handoffPackage = handoffPackageResult?.packageKey === initialPackageKey
    ? handoffPackageResult.package ?? null : null;
  const handoffPackageState = !initialPackageKey ? 'none'
    : handoffPackageResult?.packageKey === initialPackageKey
      ? handoffPackageResult.state : 'loading';
  const packageRuntimeManifest = handoffPackageResult?.packageKey === initialPackageKey
    ? handoffPackageResult.manifest ?? null : null;
  const packageRuntimeCandidates = useMemo(() => packageRuntimeManifest
    ? compatibleLocalPackageRuntimes(packageRuntimeManifest, packageRuntimeServers)
    : [], [packageRuntimeManifest, packageRuntimeServers]);
  const selectedPackageRuntimeCandidate = selectedPackageRuntime && handoffPackage &&
      selectedPackageRuntime.packageKey === handoffPackage.packageKey &&
      selectedPackageRuntime.manifestSha256 === handoffPackage.manifestSha256
    ? packageRuntimeCandidates.find(({ server, tool }) =>
      server.id === selectedPackageRuntime.serverId && tool.name === selectedPackageRuntime.toolName) ?? null
    : null;
  const fullDelegationMessage = useMemo(() => {
    const task = delegationForm.message.trim();
    if (!handoffPackage || handoffPackageState !== 'ready' || !task) return task;
    try { return rockstarPackageHandoffMessage(handoffPackage, task); }
    catch { return ''; }
  }, [delegationForm.message, handoffPackage, handoffPackageState]);
  useEffect(() => {
    if (!initialPackageKey) return;
    const controller = new AbortController();
    void Promise.all([
      fetch('/api/sky/tool-registry', { cache: 'no-store', signal: controller.signal }),
      fetch('/api/rockstar/entitlements', { cache: 'no-store', signal: controller.signal }),
    ]).then(async ([registryResponse, entitlementResponse]) => {
      if (!registryResponse.ok || !entitlementResponse.ok) throw new Error('HANDOFF_LOOKUP_FAILED');
      const registry = await registryResponse.json() as { packages?: Array<{
        packageKey: string; manifest: SkyToolPackage; manifestSha256: string;
        status: string; installable: boolean;
      }> };
      const entitlements: unknown = await entitlementResponse.json();
      if (!includedRockstarServicePackageKeys(entitlements).has(initialPackageKey)) {
        setHandoffPackageResult({ packageKey: initialPackageKey, state: 'not_included' });
        return;
      }
      const item = registry.packages?.find((entry) => entry.packageKey === initialPackageKey &&
        entry.status === 'verified' && entry.installable === true &&
        typeof entry.manifest.name === 'string' && typeof entry.manifest.summary === 'string' &&
        /^[a-f0-9]{64}$/.test(entry.manifestSha256));
      if (!item) throw new Error('HANDOFF_PACKAGE_UNAVAILABLE');
      const handoff = {
        packageKey: item.packageKey,
        manifestSha256: item.manifestSha256,
        name: item.manifest.name!,
        summary: item.manifest.summary!,
      };
      setHandoffPackageResult({ packageKey: initialPackageKey, state: 'ready', package: handoff, manifest: item.manifest });
      setTitle((current) => current || `${handoff.name}のクラウドAgent依頼`);
      setTemplateId('cloud-agent');
    }).catch((cause: unknown) => {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setHandoffPackageResult({ packageKey: initialPackageKey, state: 'unavailable' });
    });
    return () => controller.abort();
  }, [initialPackageKey]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request<{ jobs: WorkJob[] }>();
      setJobs(data.jobs);
      setReady(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void request<{ jobs: WorkJob[] }>()
      .then((data) => {
        if (active) {
          setJobs(data.jobs);
          setReady(true);
          const restoreId = new URL(window.location.href).searchParams.get('workJob');
          if (restoreId && data.jobs.some((job) => job.id === restoreId)) {
            selectedIdRef.current = restoreId;
            setSelectedId(restoreId);
          }
        }
      })
      .catch((e: unknown) => {
        if (active)
          setError(e instanceof Error ? e.message : '読み込みに失敗しました。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const refreshDelegations = useCallback(async (parentJobId: string) => {
    if (!parentJobId) {
      return;
    }
    setDelegationBusy(true);
    setDelegationError('');
    try {
      const response = await fetch(
        `/api/sky/a2a-delegations?parentJobId=${encodeURIComponent(parentJobId)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(10000) },
      );
      const data = (await response.json()) as {
        delegations?: Delegation[];
        controller?: A2AParentControllerSnapshot;
        budget?: DelegationBudgetPool | null;
        reservations?: DelegationBudgetReservation[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || '委任を読み込めませんでした。');
      if (selectedIdRef.current === parentJobId) {
        setDelegations(data.delegations ?? []);
        setA2aParentController(data.controller ?? null);
        setDelegationBudgetPool(data.budget ?? null);
        setDelegationBudgetReservations(data.reservations ?? []);
        if (data.budget) {
          setDelegationForm((current) => ({
            ...current,
            budgetCurrency: data.budget!.currency,
            parentBudgetLimitInput: formatCurrencyInputFromMinor(data.budget!.budgetLimitMinor, data.budget!.currency),
            parentBudgetLimitMinor: data.budget!.budgetLimitMinor,
          }));
          setRemoteTextCurrency(data.budget.currency);
        }
      }
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : '委任を読み込めませんでした。');
    } finally {
      setDelegationBusy(false);
    }
  }, []);
  const remoteTextFailure = useCallback((cause: unknown, parentJobId: string) => {
    if (selectedIdRef.current !== parentJobId) return;
    setRemoteTextExecutionAvailable(false);
    setRemoteTextError(cause instanceof Error ? cause.message : '保存済みの状態を確認できませんでした。');
    if (cause instanceof RemoteAiTextClientError && cause.status === 401) {
      setRemoteTextNeedsSignin(true);
      setRemoteTextExecutions([]);
      setRemoteTextResult(null);
    }
  }, []);
  const refreshRemoteText = useCallback(async (parentJobId: string) => {
    if (!parentJobId) return;
    try {
      const data = await remoteAiTextRequest<{ executions?: RemoteTextExecution[]; executionAvailable?: boolean }>(
        `/api/llm/quotes?parentJobId=${encodeURIComponent(parentJobId)}`);
      if (selectedIdRef.current !== parentJobId) return;
      setRemoteTextExecutions((data.executions ?? []).filter((item) => item.parentJobId === parentJobId));
      setRemoteTextExecutionAvailable(data.executionAvailable === true);
      setRemoteTextNeedsSignin(false);
    } catch (cause) { remoteTextFailure(cause, parentJobId); }
  }, [remoteTextFailure]);
  useEffect(() => {
    if (!selectedId || remoteTextNeedsSignin) return;
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        await refreshRemoteText(selectedId);
        if (active) await refreshDelegations(selectedId);
      } finally { inFlight = false; }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedId, remoteTextNeedsSignin, refreshRemoteText, refreshDelegations]);
  async function createRemoteTextQuote(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!selected || selected.status !== 'active') return;
    const currency = remoteTextCurrency.trim().toUpperCase();
    const capMinor = parseCurrencyInputToMinor(remoteTextCapMinor, currency);
    const pendingAnchor = remoteTextExecutions.find((item) => ['quoted', 'reserved', 'sending', 'unreconciled', 'completed'].includes(item.state));
    const anchoredCurrency = delegationBudgetPool?.currency ?? pendingAnchor?.quote.ceiling.currency ?? null;
    const anchoredParentCap = delegationBudgetPool?.budgetLimitMinor ?? pendingAnchor?.parentBudgetLimitMinor ?? null;
    const poolCurrencyMismatch = anchoredCurrency !== null && anchoredCurrency !== currency;
    const poolCap = anchoredCurrency === currency ? anchoredParentCap : null;
    const typedParentCap = parseCurrencyInputToMinor(remoteTextParentCapMinor, currency);
    const parentCap = poolCap ?? typedParentCap;
    const availableParent = poolCap === null
      ? parentCap
      : poolCap - (delegationBudgetPool?.reservedMinor ?? 0) - (delegationBudgetPool?.settledMinor ?? 0);
    if (poolCurrencyMismatch || !remoteTextPrompt.trim() || remoteTextPrompt.length > 24_000 ||
      capMinor === null || capMinor === 0 || parentCap === null || parentCap === 0 || availableParent === null ||
      !Number.isSafeInteger(availableParent) || capMinor > availableParent || capMinor > parentCap) {
      setRemoteTextError(poolCurrencyMismatch
        ? `この仕事の共通予算は${anchoredCurrency}です。通貨を合わせてください。`
        : '依頼文、通貨、依頼別上限を確認してください。上限は同じ親jobの残り予算以下にしてください。');
      return;
    }
    const parentJobId = selected.id;
    const fingerprint = JSON.stringify({ parentJobId: selected.id, prompt: remoteTextPrompt.trim(), currency, capMinor, parentCap, saveResult: remoteTextSaveResult });
    if (remoteTextSubmission.current?.fingerprint !== fingerprint)
      remoteTextSubmission.current = { fingerprint, requestId: crypto.randomUUID() };
    const requestId = remoteTextSubmission.current.requestId;
    setRemoteTextBusy(true);
    setRemoteTextError('');
    setRemoteTextResult(null);
    try {
      const estimateData = await remoteAiTextRequest<RemoteTextEstimate>('/api/llm/estimate', 'POST', {
        provider: 'openai', model: remoteTextModel || undefined, prompt: remoteTextPrompt.trim(), maxOutputTokens: 1200, currency, maximumBudgetMinor: capMinor,
      });
      if (selectedIdRef.current !== parentJobId) return;
      if (!estimateData.estimate) throw new Error('クラウドAIの料金見積を確認できませんでした。');
      setRemoteTextEstimate(estimateData);
      const quoteData = await remoteAiTextRequest<{ execution?: RemoteTextExecution; executionAvailable?: boolean }>(
        '/api/llm/quotes', 'POST', { requestId, parentJobId, parentBudgetLimitMinor: parentCap,
          model: estimateData.estimate.modelId, prompt: remoteTextPrompt.trim(), maxOutputTokens: 1200,
          currency: estimateData.estimate.currency, maximumBudgetMinor: capMinor, saveResult: remoteTextSaveResult });
      if (selectedIdRef.current !== parentJobId) return;
      if (!quoteData.execution) throw new Error('見積の保存を確認できませんでした。状態を更新してください。');
      setRemoteTextExecutionAvailable(quoteData.executionAvailable === true);
      setRemoteTextExecutions((items) => [quoteData.execution!, ...items.filter((item) => item.id !== quoteData.execution!.id)]);
      setRemoteTextCurrency(estimateData.estimate.currency);
      setRemoteTextCurrencyOptions([]);
      setRemoteTextError(quoteData.executionAvailable
        ? '見積を保存しました。内容と最大費用を確認し、明示承認してから実行してください。'
        : '見積を保存しました。外部Provider実行gateは未受入のため、送信していません。');
    } catch (cause) {
      if (selectedIdRef.current === parentJobId && cause instanceof RemoteAiTextClientError &&
        cause.code === 'RATE_CARD_CURRENCY_REQUIRED') setRemoteTextCurrencyOptions(cause.currencies);
      remoteTextFailure(cause, parentJobId);
    } finally { setRemoteTextBusy(false); }
  }
  async function runRemoteText(execution: RemoteTextExecution) {
    const parentJobId = execution.parentJobId;
    if (!remoteTextExecutionAvailable || selectedIdRef.current !== parentJobId || execution.state !== 'quoted') return;
    const prompt = remoteTextPrompt.trim();
    setRemoteTextBusy(true);
    setRemoteTextError('');
    setRemoteTextResult(null);
    try {
      const requestHash = await remoteAiTextRequestDigest({
        model: execution.quote.ceiling.modelId, prompt, maxOutputTokens: execution.quote.ceiling.outputTokenLimit,
      });
      if (!prompt || requestHash !== execution.quote.requestDigest)
        throw new Error('見積時の依頼文と一致しません。元の依頼文を貼り付けてから承認してください。');
      if (selectedIdRef.current !== parentJobId) return;
      const approval = await remoteAiTextRequest<{ execution: RemoteTextExecution }>(
        `/api/llm/quotes/${encodeURIComponent(execution.id)}`, 'POST',
        { action: 'approve', approvalDigest: execution.approvalDigest, consent: true });
      if (selectedIdRef.current !== parentJobId) return;
      setRemoteTextExecutions((items) => items.map((item) => item.id === execution.id ? approval.execution : item));
      const result = await remoteAiTextRequest<{ text?: string; execution?: RemoteTextExecution }>(
        '/api/llm/text', 'POST', { provider: 'openai', model: execution.quote.ceiling.modelId,
          prompt, maxOutputTokens: execution.quote.ceiling.outputTokenLimit,
          quoteId: execution.id, approvalDigest: execution.approvalDigest, consent: true }, 120000);
      if (selectedIdRef.current !== parentJobId) return;
      if (result.execution) setRemoteTextExecutions((items) => items.map((item) => item.id === execution.id ? result.execution! : item));
      if (result.text) setRemoteTextResult({ executionId: execution.id, text: result.text });
      await refreshRemoteText(parentJobId);
      await refreshDelegations(parentJobId);
    } catch (cause) {
      remoteTextFailure(cause, parentJobId);
      if (!(cause instanceof RemoteAiTextClientError && cause.status === 401)) {
        await refreshRemoteText(parentJobId);
        await refreshDelegations(parentJobId);
      }
    } finally { setRemoteTextBusy(false); }
  }
  async function cancelRemoteTextQuote(execution: RemoteTextExecution) {
    setRemoteTextBusy(true);
    setRemoteTextError('');
    try {
      const data = await remoteAiTextRequest<{ execution: RemoteTextExecution }>(
        `/api/llm/quotes/${encodeURIComponent(execution.id)}`, 'POST',
        { action: 'cancel', approvalDigest: execution.approvalDigest, consent: true });
      if (selectedIdRef.current !== execution.parentJobId) return;
      setRemoteTextExecutions((items) => items.map((item) => item.id === execution.id ? data.execution : item));
      await refreshDelegations(execution.parentJobId);
    } catch (cause) {
      remoteTextFailure(cause, execution.parentJobId);
      if (!(cause instanceof RemoteAiTextClientError && cause.status === 401))
        await refreshRemoteText(execution.parentJobId);
    } finally { setRemoteTextBusy(false); }
  }
  function downloadRemoteText(text: string, executionId: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sky-ai-${executionId.replace(/[^A-Za-z0-9._-]/g, '-')}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function deleteRemoteTextResult(execution: RemoteTextExecution) {
    const parentJobId = execution.parentJobId;
    if (selectedIdRef.current !== parentJobId || execution.state !== 'completed') return;
    setRemoteTextBusy(true);
    setRemoteTextError('');
    try {
      const data = await remoteAiTextRequest<{ execution: RemoteTextExecution; resultDeleted: boolean }>(
        `/api/llm/quotes/${encodeURIComponent(execution.id)}`, 'DELETE');
      if (selectedIdRef.current !== parentJobId) return;
      if (!data.resultDeleted || data.execution.id !== execution.id || data.execution.parentJobId !== parentJobId || data.execution.resultText !== null)
        throw new Error('保存した回答の削除を確認できませんでした。状態を更新してください。');
      setRemoteTextExecutions((items) => items.map((item) => item.id === execution.id ? data.execution : item));
      setRemoteTextResult((current) => current?.executionId === execution.id ? null : current);
    } catch (cause) {
      remoteTextFailure(cause, parentJobId);
      // GET reconciliation only; do not repeat an uncertain DELETE.
      if (!(cause instanceof RemoteAiTextClientError && cause.status === 401))
        await refreshRemoteText(parentJobId);
    } finally { setRemoteTextBusy(false); setRemoteTextDeleteId(null); }
  }
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || !delegationsRef.current.some((item) => item.remoteTaskId &&
        !['remote_completed', 'remote_failed', 'remote_cancelled', 'remote_rejected', 'cancelled_before_dispatch', 'expired'].includes(item.state))) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/sky/a2a-delegations?parentJobId=${encodeURIComponent(selectedId)}`,
          { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        const data = await response.json() as { delegations?: Delegation[]; controller?: A2AParentControllerSnapshot; budget?: DelegationBudgetPool | null; reservations?: DelegationBudgetReservation[] };
        if (active && response.ok) {
          setDelegations(data.delegations ?? []);
          setA2aParentController(data.controller ?? null);
          setDelegationBudgetPool(data.budget ?? null);
          setDelegationBudgetReservations(data.reservations ?? []);
        }
      } catch { /* transient connectivity must not erase the last signed snapshot */ }
      finally { inFlight = false; }
    };
    const timer = window.setInterval(() => { void poll(); }, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedId]);
  const refreshA2aAgents = useCallback(async () => {
    try {
      const data = await delegationRequest<{ agents: A2AAgentConnection[] }>(
        '/api/sky/a2a-agents',
      );
      setA2aAgents(data.agents ?? []);
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : 'Agent接続を読み込めませんでした。');
    }
  }, []);
  function selectJob(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('workJob', id);
    window.history.replaceState(window.history.state, '', url);
    selectedIdRef.current = id;
    setRemoteTextExecutionAvailable(false);
    setRemoteTextNeedsSignin(false);
    setRemoteTextDeleteId(null);
    setSelectedId(id);
    setDelegationPredecessorId(null);
    setDelegationQuote(null);
    setDelegationQuoteConsent(false);
    setArtifactDocuments({});
    setA2aParentController(null);
    setDelegationBudgetPool(null);
    setDelegationBudgetReservations([]);
    void refreshDelegations(id);
    setRemoteTextExecutions([]);
    setRemoteTextResult(null);
    setRemoteTextError('');
    setRemoteTextEstimate(null);
    void refreshRemoteText(id);
    void refreshA2aAgents();
  }
  useEffect(() => {
    const update = (event: Event) =>
      setRunning(Boolean((event as CustomEvent<string>).detail));
    window.addEventListener('loop-run-state', update);
    return () => window.removeEventListener('loop-run-state', update);
  }, []);
  const selected = jobs.find((job) => job.id === selectedId);
  const pendingRemoteTextAnchor = remoteTextExecutions.find((item) => ['quoted', 'reserved', 'sending', 'unreconciled', 'completed'].includes(item.state));
  const remoteTextBudgetCurrency = delegationBudgetPool?.currency ?? pendingRemoteTextAnchor?.quote.ceiling.currency ?? null;
  const remoteTextBudgetLimit = delegationBudgetPool?.budgetLimitMinor ?? pendingRemoteTextAnchor?.parentBudgetLimitMinor ?? null;
  const remoteTextDeleteTarget = remoteTextExecutions.find((item) => item.id === remoteTextDeleteId && item.parentJobId === selectedId && item.state === 'completed' && item.resultText !== null);
  const currentStep = selected?.steps.find((step) => !step.passed);
  const openRunner = selected?.steps.find((step) => step.id === runnerStep);
  const locked = busy || running || pending !== null || loading;
  const visibleJobs = jobs.filter(
    (job) =>
      filter === 'all' ||
      (job.status !== 'completed' && job.status !== 'cancelled'),
  );
  const accept = useCallback((job: WorkJob) => {
    setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
  }, []);
  async function create() {
    setBusy(true);
    setError('');
    const input =
      creation.current?.title === title.trim() &&
      creation.current.templateId === templateId
        ? creation.current
        : { id: crypto.randomUUID(), title: title.trim(), templateId };
    creation.current = input;
    try {
      const data = await request<{ job: WorkJob }>('POST', input);
      accept(data.job);
      selectJob(data.job.id);
      setRunnerStep(null);
      setNote('');
      setTitle('');
      creation.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : '作成できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  const submit = useCallback(
    async (update: Update) => {
      setBusy(true);
      setError('');
      setPending(update);
      try {
        const data = await request<{ job: WorkJob }>('PATCH', update);
        accept(data.job);
        setPending(null);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : '記録を保存できませんでした。';
        setError(message);
        throw new Error(message);
      } finally {
        setBusy(false);
      }
    },
    [accept],
  );
  const record = useCallback<RunRecorder>(
    async (...args) => {
      const [tool, transport, status, started, sample, outcome, delegationId] = args;
      const currentJob = jobs.find((job) => job.id === selectedId);
      if (!currentJob || !runnerStep)
        throw new Error('仕事と手順を選んでください。');
      await submit({
        jobId: currentJob.id,
        revision: currentJob.revision,
        command: {
          id: crypto.randomUUID(),
          action: 'record',
          stepId: runnerStep,
          tool,
          transport,
          outcome: status === 'failed' ? 'failed' : (outcome ?? 'needs_review'),
          sample,
          durationMs: Math.min(300000, Math.round(performance.now() - started)),
          ...(delegationId ? { delegationId } : {}),
        },
      });
    },
    [jobs, selectedId, runnerStep, submit],
  );
  async function finish(action: 'complete' | 'cancel') {
    if (!selected) return;
    try {
      await submit({
        jobId: selected.id,
        revision: selected.revision,
        command:
          action === 'complete'
            ? { id: crypto.randomUUID(), action, note }
            : { id: crypto.randomUUID(), action },
      });
      setRunnerStep(null);
      setNote('');
    } catch {
      /* The pending operation can be retried without running a tool again. */
    }
  }
  async function loadArtifacts(delegationId: string) {
    setDelegationBusy(true);
    setDelegationError('');
    try {
      const response = await fetch(
        `/api/sky/a2a-delegations/${encodeURIComponent(delegationId)}/artifacts`,
        { cache: 'no-store', signal: AbortSignal.timeout(10000) },
      );
      const data = (await response.json()) as {
        artifacts?: Array<{ document: ArtifactDocument }>;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || '成果を取得できませんでした。');
      setArtifactDocuments((current) => ({
        ...current,
        [delegationId]: (data.artifacts ?? []).map(({ document }) => document),
      }));
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : '成果を取得できませんでした。');
    } finally {
      setDelegationBusy(false);
    }
  }
  function prepareResultForAnotherAgent(delegation: Delegation, document: ArtifactDocument) {
    if (!selected || selected.status !== 'active' || delegation.parentJobId !== selected.id ||
        delegation.state !== 'remote_completed' || delegation.artifactsCaptured !== 1) {
      setDelegationError('次のAgentへ渡せるのは、このZema jobで完了し、成果の取得まで確認できた委任だけです。');
      return;
    }
    try {
      const message = buildA2AResultHandoffPrompt({
        sourceAgentName: delegation.targetAgentName,
        sourceAgentVersion: delegation.targetAgentVersion,
        artifacts: document.artifacts,
        omittedNonTextParts: document.omittedNonTextParts,
        truncated: document.truncated,
      });
      setDelegationForm((current) => ({
        ...current,
        targetAgentId: '',
        targetOrigin: '',
        targetAgentName: '',
        targetAgentVersion: '',
        message,
        budgetCurrency: delegationBudgetPool?.currency ?? current.budgetCurrency,
        parentBudgetLimitInput: formatCurrencyInputFromMinor(
          delegationBudgetPool?.budgetLimitMinor ?? current.parentBudgetLimitMinor,
          delegationBudgetPool?.currency ?? current.budgetCurrency,
        ),
        parentBudgetLimitMinor: delegationBudgetPool?.budgetLimitMinor ?? current.parentBudgetLimitMinor,
      }));
      setDelegationPredecessorId(delegation.id);
      setDelegationQuote(null);
      setDelegationQuoteConsent(false);
      setDelegationReview(null);
      setDelegationError('前段Agentの成果を未検証データとして新しい依頼の下書きに入れました。別Agentの選択、依頼内容と上限の確認、改めての見積・承認が必要です。まだ送信していません。');
      requestAnimationFrame(() => window.document.getElementById('work-a2a-delegation-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : '成果を次のAgent向けに準備できませんでした。');
    }
  }
  async function loadUsageDetails(delegationId: string) {
    setDelegationBusy(true);
    setDelegationError('');
    try {
      const data = await delegationRequest<DelegationUsageDetails>(
        `/api/sky/a2a-delegations/${encodeURIComponent(delegationId)}`,
      );
      setDelegationUsageDetails((current) => ({ ...current, [delegationId]: data }));
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : '利用明細を取得できませんでした。');
    } finally {
      setDelegationBusy(false);
    }
  }
  async function requestDelegationCancel(delegationId: string) {
    if (!window.confirm('この委任先へ停止要求を送りますか？相手側で停止が確認されるまで「停止未確認」と表示します。')) return;
    setDelegationBusy(true);
    setDelegationError('');
    try {
      const response = await fetch(`/api/sky/a2a-delegations/${encodeURIComponent(delegationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
        signal: AbortSignal.timeout(10000),
      });
      const data = (await response.json()) as { delegation?: Delegation; error?: string };
      if (!response.ok) throw new Error(data.error || '停止要求を保存できませんでした。');
      await refreshDelegations(selectedId);
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : '停止要求を送れませんでした。');
    } finally {
      setDelegationBusy(false);
    }
  }
  const createDelegationDraft = useCallback(async () => {
    const selected = jobs.find((job) => job.id === selectedId);
    if (!selected) return;
    const quoteFingerprint = JSON.stringify({
      parentJobId: selected.id,
      agentId: delegationForm.targetAgentId,
      origin: delegationForm.targetOrigin.trim(),
      agentName: delegationForm.targetAgentName.trim(),
      agentVersion: delegationForm.targetAgentVersion.trim(),
      message: fullDelegationMessage,
      currency: delegationForm.budgetCurrency.trim().toUpperCase(),
      maximumBudgetMinor: delegationForm.budgetLimitMinor,
      packageKey: initialPackageKey && handoffPackage ? handoffPackage.packageKey : null,
      packageManifestSha256: initialPackageKey && handoffPackage ? handoffPackage.manifestSha256 : null,
    });
    const verifiedQuote = delegationQuote?.fingerprint === quoteFingerprint
      ? delegationQuote.quote : null;
    const packageRuntimeBindingId = delegationQuote?.packageRuntimeBindingId;
    const packageRuntimeBindingDigest = delegationQuote?.packageRuntimeBindingDigest;
    const packageRuntimeBinding = delegationQuote?.packageRuntimeBinding;
    if (!verifiedQuote) {
      setDelegationError('依頼文を見積のために共有する同意を行い、署名検証済みの見積を取得してから条件を確認してください。');
      return;
    }
    if (initialPackageKey && (!packageRuntimeBinding ||
      !packageRuntimeBindingId || !packageRuntimeBindingDigest)) {
      setDelegationError('このPackageを実行対象にするProvider署名binding付き見積が必要です。');
      return;
    }
    setDelegationBusy(true);
    setDelegationError('');
    const fingerprint = JSON.stringify({ parentJobId: selected.id, predecessorDelegationId: delegationPredecessorId,
      ...delegationForm,
      message: fullDelegationMessage, quoteId: verifiedQuote.quoteId,
      packageRuntimeBindingDigest: packageRuntimeBindingDigest ?? null });
    let request = delegationSubmission.current?.fingerprint === fingerprint
      ? delegationSubmission.current.request
      : null;
    if (!request) {
      request = {
        id: crypto.randomUUID(),
        parentJobId: selected.id,
        ...(delegationPredecessorId ? { predecessorDelegationId: delegationPredecessorId } : {}),
        idempotencyKey: `zema:${selected.id}:${crypto.randomUUID()}`,
        messageId: crypto.randomUUID(),
        targetOrigin: delegationForm.targetOrigin.trim(),
        targetAgentName: delegationForm.targetAgentName.trim(),
        targetAgentVersion: delegationForm.targetAgentVersion.trim(),
        message: fullDelegationMessage,
        budgetCurrency: delegationForm.budgetCurrency.trim().toUpperCase(),
        budgetLimitMinor: delegationForm.budgetLimitMinor,
        parentBudgetLimitMinor: delegationForm.parentBudgetLimitMinor,
        continueWhileDeviceOffline: delegationForm.continueWhileDeviceOffline,
        deadlineAt: Date.now() + 24 * 60 * 60 * 1000,
        priceQuote: verifiedQuote,
        ...(packageRuntimeBindingId && packageRuntimeBindingDigest ? {
          packageRuntimeBindingId,
          packageRuntimeBindingDigest,
        } : {}),
      };
      delegationSubmission.current = { fingerprint, request };
    }
    try {
      const data = await delegationRequest<{
        delegation: Delegation;
        approval: { digest: string; required: boolean };
      }>('/api/sky/a2a-delegations', 'POST', request);
      if (!data.approval.required)
        throw new Error('この委任はすでに承認済みか、再確認が必要です。状態を更新してください。');
      setDelegationReview({ request, delegationId: data.delegation.id, authorizationSha256: data.approval.digest });
      setDelegationPredecessorId(null);
      await refreshDelegations(selected.id);
    } catch (cause) {
      let recovered = false;
      try {
        const inputSha256 = await sha256Hex(request.message);
        const query = new URLSearchParams({
          parentJobId: request.parentJobId,
          idempotencyKey: request.idempotencyKey,
          inputSha256,
        });
        const result = await delegationRequest<{ delegation: Delegation | null }>(
          `/api/sky/a2a-delegations?${query}`,
        );
        const existing = result.delegation;
        if (matchesA2ADelegationRecovery(request, existing, inputSha256)) {
          recovered = true;
          setDelegationPredecessorId(null);
          if (existing.state === 'awaiting_approval')
            setDelegationReview({ request, delegationId: existing.id, authorizationSha256: existing.authorizationSha256 });
          await refreshDelegations(request.parentJobId);
        }
      } catch {
        // Keep the original error; the status read is a recovery check only.
      }
      setDelegationError(recovered
        ? '受付状態を照合しました。同じ依頼を再送せず、最新状態を確認してください。'
        : cause instanceof Error ? cause.message : '委任条件を保存できませんでした。');
    } finally {
      setDelegationBusy(false);
    }
  }, [jobs, selectedId, delegationForm, delegationQuote, refreshDelegations, fullDelegationMessage,
    initialPackageKey, handoffPackage, delegationPredecessorId]);
  async function requestDelegationPriceQuote() {
    const selected = jobs.find((job) => job.id === selectedId);
    const agent = a2aAgents.find((item) => item.id === delegationForm.targetAgentId);
    if (!selected || !agent || !delegationQuoteConsent || !fullDelegationMessage) return;
    setDelegationBusy(true);
    setDelegationError('');
    setDelegationQuote(null);
    const requestId = crypto.randomUUID();
    const message = fullDelegationMessage;
    const currency = delegationForm.budgetCurrency.trim().toUpperCase();
    const quoteFingerprint = JSON.stringify({
      parentJobId: selected.id,
      agentId: agent.id,
      origin: agent.origin,
      agentName: agent.agentName,
      agentVersion: agent.agentVersion,
      message,
      currency,
      maximumBudgetMinor: delegationForm.budgetLimitMinor,
      packageKey: initialPackageKey && handoffPackage ? handoffPackage.packageKey : null,
      packageManifestSha256: initialPackageKey && handoffPackage ? handoffPackage.manifestSha256 : null,
    });
    try {
      const data = await delegationRequest<{
        quote: A2APriceQuote;
        quoteDigest: string;
        requestSha256: string;
        packageRuntimeBinding?: SkyPackageRuntimeBinding;
        packageRuntimeBindingId?: string;
        packageRuntimeBindingDigest?: string;
        quoteOnly: boolean;
        executionAuthorized: boolean;
      }>('/api/sky/a2a-price-quotes', 'POST', {
        agentId: agent.id,
        quoteRequestId: requestId,
        message,
        currency,
        maximumBudgetMinor: delegationForm.budgetLimitMinor,
        expiresAt: Date.now() + 60_000,
        consentToSharePromptForQuote: true,
        ...(initialPackageKey && handoffPackage ? {
          packageKey: handoffPackage.packageKey,
          manifestSha256: handoffPackage.manifestSha256,
        } : {}),
      });
      const expectedRequestSha256 = await sha256Hex(message);
      if (data.requestSha256 !== expectedRequestSha256 || data.quoteOnly !== true || data.executionAuthorized !== false)
        throw new Error('返却された見積が依頼内容と一致しません。');
      if (initialPackageKey && (!data.packageRuntimeBinding || !data.packageRuntimeBindingId ||
        !data.packageRuntimeBindingDigest || data.packageRuntimeBinding.packageKey !== handoffPackage?.packageKey ||
        data.packageRuntimeBinding.manifestSha256 !== handoffPackage?.manifestSha256))
        throw new Error('Packageの署名済み実行bindingを見積と照合できませんでした。');
      setDelegationQuote({
        quote: data.quote,
        quoteDigest: data.quoteDigest,
        requestSha256: data.requestSha256,
        ...(data.packageRuntimeBinding ? { packageRuntimeBinding: data.packageRuntimeBinding } : {}),
        ...(data.packageRuntimeBindingId ? { packageRuntimeBindingId: data.packageRuntimeBindingId } : {}),
        ...(data.packageRuntimeBindingDigest ? { packageRuntimeBindingDigest: data.packageRuntimeBindingDigest } : {}),
        fingerprint: quoteFingerprint,
      });
      setDelegationQuoteConsent(false);
    } catch (cause) {
      setDelegationQuoteConsent(false);
      setDelegationError(cause instanceof Error ? cause.message : '見積を取得できませんでした。要求を再送せず、接続と相手側状態を確認してください。');
    } finally {
      setDelegationBusy(false);
    }
  }
  async function discoverAgent() {
    setDelegationBusy(true);
    setDelegationError('');
    try {
      const data = await delegationRequest<{
        agent: A2AAgentConnection;
        trust: string;
      }>('/api/sky/a2a-agents', 'POST', { origin: agentOrigin.trim() });
      setA2aAgents((current) => [
        data.agent,
        ...current.filter((item) => item.id !== data.agent.id),
      ]);
      setDelegationQuote(null);
      setDelegationQuoteConsent(false);
      setDelegationForm((current) => ({
        ...current,
        targetAgentId: data.agent.id,
        targetOrigin: data.agent.origin,
        targetAgentName: data.agent.agentName,
        targetAgentVersion: data.agent.agentVersion,
      }));
      setAgentOrigin('');
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : 'Agent Cardを取得できませんでした。');
    } finally {
      setDelegationBusy(false);
    }
  }
  async function forgetAgent(id: string) {
    setDelegationBusy(true);
    setDelegationError('');
    try {
      await delegationRequest(`/api/sky/a2a-agents/${encodeURIComponent(id)}`, 'DELETE');
      setA2aAgents((current) => current.filter((agent) => agent.id !== id));
      setDelegationForm((current) => current.targetAgentId === id
        ? { ...current, targetAgentId: '', targetOrigin: '', targetAgentName: '', targetAgentVersion: '' }
        : current);
      setDelegationQuote(null);
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : 'Agent接続を削除できませんでした。');
    } finally {
      setDelegationBusy(false);
    }
  }
  const activeDelegationQuoteFingerprint = selected ? JSON.stringify({
    parentJobId: selected.id,
    agentId: delegationForm.targetAgentId,
    origin: delegationForm.targetOrigin.trim(),
    agentName: delegationForm.targetAgentName.trim(),
    agentVersion: delegationForm.targetAgentVersion.trim(),
    message: fullDelegationMessage,
    currency: delegationForm.budgetCurrency.trim().toUpperCase(),
    maximumBudgetMinor: delegationForm.budgetLimitMinor,
  }) : '';
  const activeDelegationQuote = delegationQuote?.fingerprint === activeDelegationQuoteFingerprint
    ? delegationQuote.quote : null;
  const content = (
    <div className={`work-shell${embedded ? ' is-chat-managed' : ''}`}>
      <div className="work-body">
        {!embedded && (
          <nav className="rock-view-nav" aria-label="Skyの仕事と履歴">
            <Link href="/work" aria-current="page">
              手順のある仕事
            </Link>
            <Link href="/csv">CSV仕事</Link>
            <Link href="/activity">ツールの実行履歴</Link>
          </nav>
        )}
        <div className="work-title">
          <div>
            <h1>仕事を進める</h1>
            <p>選んだ自動化を順番に実行して、仕上がりを確認。</p>
          </div>
          <button disabled={loading || locked} onClick={() => void refresh()}>
            <RefreshCw size={16} /> 再読込
          </button>
        </div>
        {error && (
          <div className="work-notice" role="alert">
            {error}
            {!ready && (
              <a href="/signin-with-chatgpt?return_to=/work" target="_top">
                サインイン
              </a>
            )}
          </div>
        )}
        {pending && (
          <div className="work-notice">
            <p>記録の保存が未確認です。結果は下の欄から保存できます。</p>
            <button
              disabled={busy}
              onClick={() => void submit(pending).catch(() => {})}
            >
              記録の保存を再試行
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setPending(null);
                void refresh();
              }}
            >
              最新状態を読み直す
            </button>
          </div>
        )}
        {cloudDraft && <p className="work-notice">会話の依頼文を引き継ぎました。仕事を選ぶか作成して、見積もりを確認してください。実行はまだ始まりません。</p>}
        {initialPackageKey && (
          <section className="work-notice" aria-live="polite" aria-label="SIM/eSIM付帯Packageからの依頼">
            {handoffPackageState === 'loading' && <p>SIM/eSIM利用権と審査済みPackageを確認しています。確認前は依頼へ追加しません。</p>}
            {handoffPackageState === 'ready' && handoffPackage && <>
              <h2>SIM/eSIM付帯Packageを依頼仕様に追加</h2>
              <p><strong>{handoffPackage.name}</strong> · {handoffPackage.packageKey}</p>
              <p>{handoffPackage.summary}</p>
              <p>Package keyとmanifest hashを見積対象の依頼文へ含めます。実行先はA2A Agent候補から別途選択します。相手がこのPackageを実行できるとは限らず、送信は見積同意・上限・圏外継続設定・実行承認が揃うまで行いません。</p>
              {packageRuntimeManifest && <section className="work-package-local-runtime" aria-label="ローカルMCP runtimeへのPackage capability binding">
                <h3>このPCのMCP runtimeへ手動で結び付ける</h3>
                <p>PC向けの審査済みPackageについて、接続済みstdio MCP toolの入出力Schemaが完全一致し、双方が無料扱いの場合だけ候補に表示します。これはSchema互換の手動bindingで、Packageのsource codeをConnectorが導入・実行する意味ではありません。選んだMCP toolの説明と引数を毎回確認し、既存の1回限りの承認を行ってください。</p>
                {packageRuntimeCandidates.length > 0 ? <>
                  <label>互換runtime/toolを選択
                    <select value={selectedPackageRuntimeCandidate ? packageRuntimeCandidates.findIndex(({ server, tool }) => server.id === selectedPackageRuntimeCandidate.server.id && tool.name === selectedPackageRuntimeCandidate.tool.name).toString() : ''}
                      onChange={(event) => {
                        if (!event.target.value) { setSelectedPackageRuntime(null); return; }
                        const candidate = packageRuntimeCandidates[Number(event.target.value)];
                        if (!candidate) { setSelectedPackageRuntime(null); return; }
                        setSelectedPackageRuntime({ packageKey: handoffPackage.packageKey, manifestSha256: handoffPackage.manifestSha256, serverId: candidate.server.id, toolName: candidate.tool.name });
                      }}>
                      <option value="">利用するPC runtimeを選択</option>
                      {packageRuntimeCandidates.map(({ server, tool }, index) => <option key={`${server.id}:${tool.name}`} value={index}>{server.name} · {tool.title || tool.name}</option>)}
                    </select>
                  </label>
                  {selectedPackageRuntimeCandidate && <>
                    <label>このruntimeへ渡す依頼
                      <textarea rows={3} maxLength={4_000} value={localPackageTask} onChange={(event) => setLocalPackageTask(event.target.value)} placeholder="このPackage機能で行う具体的な依頼" />
                    </label>
                    <McpBotRunner key={`${handoffPackage.packageKey}:${handoffPackage.manifestSha256}:${selectedPackageRuntimeCandidate.server.id}:${selectedPackageRuntimeCandidate.tool.name}`}
                      server={selectedPackageRuntimeCandidate.server} request={localPackageTask} fixedToolName={selectedPackageRuntimeCandidate.tool.name} executionDisabled={!localPackageTask.trim()} />
                  </>}
                </> : <p>互換する実行先はありません。mcp_stdio・PC実行・Package/Tool双方の無料料金宣言・完全一致する入出力Schema・接続済みPC stdio runtimeが必要です。遠隔MCPや有料処理はこの経路では実行しません。</p>}
              </section>}
            </>}
            {handoffPackageState === 'not_included' && <p role="alert">このPackageを有効なSIM/eSIM利用権で確認できませんでした。利用権を確認するまで引き継ぎません。</p>}
            {handoffPackageState === 'unavailable' && <p role="alert">Packageの審査状態または利用権を確認できませんでした。再読み込みして確認してください。</p>}
          </section>
        )}
        <section className="work-create" aria-label="新しい仕事">
          <label>
            仕事の名前
            <input
              value={title}
              maxLength={120}
              disabled={locked}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 自動化についての記事"
            />
          </label>
          <label htmlFor="work-template">
            進め方
            <Select
              value={templateId}
              onValueChange={(value) => {
                if (value) setTemplateId(value);
              }}
              disabled={locked}
            >
              <SelectTrigger id="work-template">
                <SelectValue>
                  {
                    workflowTemplates.find(
                      (template) => template.id === templateId,
                    )?.name
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {workflowTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <button
            className="work-primary"
            disabled={!ready || loading || locked || !title.trim()}
            onClick={() => void create()}
          >
            <Plus size={17} /> 仕事を作成
          </button>
          <p>
            {
              workflowTemplates.find((template) => template.id === templateId)
                ?.description
            }
          </p>
        </section>
        <div className="work-layout">
          <aside className="work-list">
            <div className="work-list-heading">
              <h2>自分の仕事</h2>
              <button
                disabled={locked}
                onClick={() => setFilter(filter === 'open' ? 'all' : 'open')}
              >
                {filter === 'open' ? '完了・中止も表示' : '進行中のみ'}
              </button>
            </div>
            {loading ? (
              <output>読み込み中…</output>
            ) : visibleJobs.length ? (
              visibleJobs.map((job) => (
                <button
                  className={
                    'work-job ' + (job.id === selectedId ? 'selected' : '')
                  }
                  key={job.id}
                  disabled={locked}
                  onClick={() => {
                    selectJob(job.id);
                    setRunnerStep(null);
                    setNote('');
                  }}
                >
                  <strong>{job.title}</strong>
                  <span>
                    {stateNames[job.status]} ·{' '}
                    {job.steps.filter((step) => step.passed).length}/
                    {job.steps.length}手順
                  </span>
                </button>
              ))
            ) : (
              <p>表示する仕事はありません。</p>
            )}
            {jobs.length === 100 && <p>最新100件を表示しています。</p>}
          </aside>
          <section className="work-detail" aria-label="仕事の詳細">
            {!selected ? (
              <div className="work-empty">
                <h2>仕事を選んで開始</h2>
                <p>名前と進め方を決めると、次の手順がここに表示されます。</p>
              </div>
            ) : (
              <>
                <div className="work-detail-heading">
                  <h2>{selected.title}</h2>
                  <span>{stateNames[selected.status]}</span>
                </div>
                <ol className="work-steps">
                  {selected.steps.map((step, i) => (
                    <li key={step.id} className={step.passed ? 'passed' : ''}>
                      <span>{step.passed ? <Check size={16} /> : i + 1}</span>
                      <strong>{step.title}</strong>
                      <small>
                        {step.passed
                          ? '通過'
                          : step.id === currentStep?.id
                            ? '次の手順'
                            : '待機'}
                      </small>
                    </li>
                  ))}
                </ol>
                <WorkPlanEditor
                  key={`${selected.id}:${selected.revision}`}
                  job={selected}
                  disabled={locked}
                  onSave={(objective) => submit({
                    jobId: selected.id,
                    revision: selected.revision,
                    command: {
                      id: crypto.randomUUID(),
                      action: 'edit_plan',
                      schemaVersion: selected.plan.schemaVersion,
                      objective,
                    },
                  })}
                />
                <section className="work-delegations" aria-labelledby="work-delegations-title">
                  <h3 id="work-delegations-title">Agent委任</h3>
                  {a2aParentController && (
                    <output aria-live="polite">
                      親jobの進行管理: {a2aParentControllerStateName(a2aParentController.state)} · {a2aParentController.stepCount}/{a2aParentController.childLimit}件 · 承認待ち {a2aParentController.awaitingApprovalCount} · 実行中 {a2aParentController.runningCount} · 期限切れ {a2aParentController.expiredCount} · 成果確認可能 {a2aParentController.resultReadyCount}。 {a2aParentControllerNextAction(a2aParentController.nextAction)}
                    </output>
                  )}
                  {a2aParentController?.budget?.invariantViolation && (
                    <p role="alert">親jobの予約額と利用記録が上限を超えています。追加実行を行わず確認してください。</p>
                  )}
                  {delegationBudgetPool && (
                    <p>親jobの支出上限: {formatCurrencyMinor(delegationBudgetPool.budgetLimitMinor, delegationBudgetPool.currency)} · 予約中 {formatCurrencyMinor(delegationBudgetPool.reservedMinor, delegationBudgetPool.currency)} · 利用量確定記録（請求照合前） {formatCurrencyMinor(delegationBudgetPool.settledMinor, delegationBudgetPool.currency)}</p>
                  )}
                  {['active', 'review'].includes(selected.status) && !delegationReview && (
                    <form
                      id="work-a2a-delegation-form"
                      className="work-delegation-create"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void createDelegationDraft();
                      }}
                    >
                      <h3>別のエージェントへ委任する</h3>
                      <p>公開HTTPS originを入力してAgent Cardを取得し、Skyに自分の候補として保存できます。</p>
                      <p>親jobあたり最大8件、同時に4件までです。現在はRockstarOSから外部Agentへの一段委任のみ対応し、Agentによる自動再委任は許可しません。</p>
                      <label>
                        Agent Cardを探す
                        <input
                          type="url"
                          value={agentOrigin}
                          placeholder="https://agent.example.com"
                          onChange={(event) => setAgentOrigin(event.target.value)}
                        />
                      </label>
                      <button type="button" disabled={delegationBusy || !agentOrigin.trim()} onClick={() => void discoverAgent()}>
                        Agent Cardを取得して候補に追加
                      </button>
                      <div className="work-a2a-agent-list" aria-label="Skyに保存したエージェント候補">
                        {a2aAgents.map((agent) => {
                          let skills: Array<{ name: string }> = [];
                          try {
                            skills = (JSON.parse(agent.cardJson) as { skills?: Array<{ name: string }> }).skills ?? [];
                          } catch { /* Old or malformed snapshots remain untrusted. */ }
                          return (
                            <article className="work-a2a-agent" key={agent.id}>
                              <div>
                                <strong>{agent.agentName}</strong><span>v{agent.agentVersion}</span>
                                <small>{agent.origin} · Card {agent.cardSha256.slice(0, 12)}…</small>
                                {skills.length > 0 && <small>自己申告の能力: {skills.slice(0, 5).map((skill) => skill.name).join('、')}</small>}
                              </div>
                              <div className="work-delegation-actions">
                                <button type="button" disabled={delegationBusy} onClick={() => {
                                  setDelegationQuote(null);
                                  setDelegationQuoteConsent(false);
                                  setDelegationForm((current) => ({ ...current, targetAgentId: agent.id, targetOrigin: agent.origin, targetAgentName: agent.agentName, targetAgentVersion: agent.agentVersion }));
                                }}>このAgentを選ぶ</button>
                                <button type="button" disabled={delegationBusy} onClick={() => void forgetAgent(agent.id)}>候補から削除</button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                      <p>Card記載の能力は提供者の自己申告で、審査・安全性・本人の実行許可を意味しません。取得と保存だけでは委任を送信しません。実行gateはOFFです。</p>
                      <label>
                        選択中の接続先origin
                        <input
                          type="url"
                          required
                          value={delegationForm.targetOrigin}
                          placeholder="https://agent.example"
                          onChange={(event) => {
                            setDelegationQuote(null);
                            setDelegationQuoteConsent(false);
                            setDelegationForm((current) => ({ ...current, targetAgentId: '', targetOrigin: event.target.value }));
                          }}
                        />
                      </label>
                      <div className="work-delegation-fields">
                        <label>
                          Agent名
                          <input required maxLength={120} value={delegationForm.targetAgentName} onChange={(event) => { setDelegationQuote(null); setDelegationQuoteConsent(false); setDelegationForm((current) => ({ ...current, targetAgentId: '', targetAgentName: event.target.value })); }} />
                        </label>
                        <label>
                          Agent版
                          <input required maxLength={80} value={delegationForm.targetAgentVersion} onChange={(event) => { setDelegationQuote(null); setDelegationQuoteConsent(false); setDelegationForm((current) => ({ ...current, targetAgentId: '', targetAgentVersion: event.target.value })); }} />
                        </label>
                      </div>
                      <label>
                        依頼内容
                        <textarea required maxLength={8000} rows={4} value={delegationForm.message} onChange={(event) => { setDelegationQuote(null); setDelegationQuoteConsent(false); setDelegationForm((current) => ({ ...current, message: event.target.value })); }} />
                      </label>
                      <div className="work-delegation-fields">
                        <label>
                          上限の通貨
                          <input required maxLength={3} pattern="[A-Za-z]{3}" disabled={Boolean(delegationBudgetPool)} value={delegationForm.budgetCurrency} onChange={(event) => { const currency = event.target.value.toUpperCase(); setDelegationQuote(null); setDelegationQuoteConsent(false); setDelegationForm((current) => ({ ...current, budgetCurrency: event.target.value, budgetLimitMinor: parseCurrencyInputToMinor(current.budgetLimitInput, currency) ?? 0, parentBudgetLimitMinor: parseCurrencyInputToMinor(current.parentBudgetLimitInput, currency) ?? 0 })); }} />
                        </label>
                        <label>
                          このAgentの最大支出額（Provider見積ではありません）
                          <input required type="text" inputMode="decimal" maxLength={20} placeholder="例: 10.00" value={delegationForm.budgetLimitInput} onChange={(event) => { const value = event.target.value; setDelegationQuote(null); setDelegationQuoteConsent(false); setDelegationForm((current) => ({ ...current, budgetLimitInput: value, budgetLimitMinor: parseCurrencyInputToMinor(value, current.budgetCurrency.trim().toUpperCase()) ?? 0 })); }} />
                        </label>
                      </div>
                      <label>
                        親job全体のAgent共通上限（{delegationForm.budgetCurrency.toUpperCase()}）
                        <input required type="text" inputMode="decimal" maxLength={20} disabled={Boolean(delegationBudgetPool)} placeholder="例: 25.00" value={delegationForm.parentBudgetLimitInput} onChange={(event) => { const value = event.target.value; setDelegationForm((current) => ({ ...current, parentBudgetLimitInput: value, parentBudgetLimitMinor: parseCurrencyInputToMinor(value, current.budgetCurrency.trim().toUpperCase()) ?? 0 })); }} />
                      </label>
                      <p>通貨の通常単位で入力します（USD 10.00、JPY 1,000など）。金額は内部で通貨単位へ変換します。子Agentごとの最大額を承認時にこの共通枠から予約します。最初の委任承認で親jobの通貨と共通上限を固定します。固定後に上限を増やす操作は未実装です。見積または残額を超える実行は停止し、新しい明示承認が必要です。</p>
                      <label className="work-offline-consent">
                        <input type="checkbox" checked={delegationQuoteConsent} onChange={(event) => setDelegationQuoteConsent(event.target.checked)} />
                        <span>依頼文全体をこのAgentのProviderへ送って、実行を開始しない価格見積を取得することに同意します。Providerの保持・処理条件を確認したうえで選択してください。</span>
                      </label>
                      <button type="button" disabled={delegationBusy || !delegationQuoteConsent || !delegationForm.targetAgentId || !fullDelegationMessage || delegationForm.budgetLimitMinor < 1 || !Number.isSafeInteger(delegationForm.budgetLimitMinor)} onClick={() => void requestDelegationPriceQuote()}>
                        署名付き見積を取得
                      </button>
                      {activeDelegationQuote && (
                        <div className="work-delegation-price-note" aria-live="polite">
                          <strong>Provider署名付き価格見積</strong>
                          <p>見積額 {formatCurrencyMinor(activeDelegationQuote.estimateMinor, activeDelegationQuote.currency)} · 請求上限 {formatCurrencyMinor(activeDelegationQuote.maxAmountMinor, activeDelegationQuote.currency)}</p>
                          <p>Provider {activeDelegationQuote.providerId} · 価格版 {activeDelegationQuote.pricingVersion} · 期限 {new Date(activeDelegationQuote.expiresAt).toLocaleString('ja-JP')}</p>
                          <ul>{activeDelegationQuote.usage.map((line, index) => <li key={`${line.meter}-${index}`}>{line.meter}: {line.quantity} {line.unit} × {formatCurrencyMinor(line.unitPriceMinor, activeDelegationQuote.currency)} = {formatCurrencyMinor(line.amountMinor, activeDelegationQuote.currency)}</li>)}</ul>
                          <small>署名、Agent・依頼hash・金額をサーバーで検証済み。これは見積で、実行承認ではありません。</small>
                          <details><summary>Providerへ見積依頼として送った全文</summary><pre>{fullDelegationMessage}</pre></details>
                        </div>
                      )}
                      <p className="work-delegation-price-note">署名付き見積がない、有効期限が切れた、または条件が変わった仕事は承認へ進めません。実行中のProvider meterと最終請求照合は別の記録で確認します。</p>
                      <p>期限は作成から24時間です。発見・比較はSky側で確認済みのAgent Cardを使ってください。</p>
                      <label className="work-offline-consent">
                        <input type="checkbox" checked={delegationForm.continueWhileDeviceOffline} onChange={(event) => setDelegationForm((current) => ({ ...current, continueWhileDeviceOffline: event.target.checked }))} />
                        <span>受付・承認後、この仕事を端末が圏外またはアプリ終了中も、表示した予算と期限の範囲でクラウド上で続けることを許可します。</span>
                      </label>
                      <p>圏外中に新しい指示や停止を届けることはできません。停止要求は再接続まで未送信のままです。チェックしない場合、クラウドagentへの委任は作成できません。</p>
                      <button className="work-primary" type="submit" disabled={delegationBusy || !activeDelegationQuote || !delegationForm.continueWhileDeviceOffline || !fullDelegationMessage || delegationForm.budgetLimitMinor < 1 || !Number.isSafeInteger(delegationForm.budgetLimitMinor) || delegationForm.parentBudgetLimitMinor < delegationForm.budgetLimitMinor || !Number.isSafeInteger(delegationForm.parentBudgetLimitMinor)}>
                        条件を確認する
                      </button>
                    </form>
                  )}
                  {delegationReview && (
                    <section className="work-delegation-review" aria-label="委任条件の確認">
                      <h3>委任内容を確認</h3>
                      <p>以下の条件で確認待ちdraftを保存しました。まだProviderへの送信は行われていません。</p>
                      <dl>
                        <dt>送信先</dt><dd>{delegationReview.request.targetOrigin}</dd>
                        <dt>Agent</dt><dd>{delegationReview.request.targetAgentName} · v{delegationReview.request.targetAgentVersion}</dd>
                        <dt>Provider署名見積</dt><dd>{delegationReview.request.priceQuote ? `${formatCurrencyMinor(delegationReview.request.priceQuote.estimateMinor, delegationReview.request.priceQuote.currency)}（上限 ${formatCurrencyMinor(delegationReview.request.priceQuote.maxAmountMinor, delegationReview.request.priceQuote.currency)}） · ${delegationReview.request.priceQuote.providerId} · ${delegationReview.request.priceQuote.pricingVersion}` : '未取得'}</dd>
                        <dt>見積明細</dt><dd>{delegationReview.request.priceQuote ? <ul>{delegationReview.request.priceQuote.usage.map((line, index) => <li key={`${line.meter}-${index}`}>{line.meter}: {line.quantity} {line.unit} × {formatCurrencyMinor(line.unitPriceMinor, delegationReview.request.priceQuote!.currency)} = {formatCurrencyMinor(line.amountMinor, delegationReview.request.priceQuote!.currency)}</li>)}</ul> : '未取得'}</dd>
                        <dt>最大支出上限</dt><dd>{formatCurrencyMinor(delegationReview.request.budgetLimitMinor, delegationReview.request.budgetCurrency)}</dd>
                        <dt>親job共通上限</dt><dd>{formatCurrencyMinor(delegationReview.request.parentBudgetLimitMinor, delegationReview.request.budgetCurrency)}</dd>
                        <dt>委任の範囲</dt><dd>この親jobから1段のみ · 親jobあたり最大8件 · 同時に4件まで</dd>
                        <dt>圏外中の継続</dt><dd>{delegationReview.request.continueWhileDeviceOffline ? '許可（クラウドに永続保存された後）' : '許可しない'}</dd>
                        <dt>期限</dt><dd>{new Date(delegationReview.request.deadlineAt).toLocaleString('ja-JP')}</dd>
                        <dt>依頼文</dt><dd><pre>{delegationReview.request.message}</pre></dd>
                        <dt>条件digest</dt><dd><code>{delegationReview.authorizationSha256}</code></dd>
                      </dl>
                      <p className="work-delegation-gate">実行承認は、Brokerの権限照合とWalletの原子的な予算予約を接続し、Provider契約・認証・費用条件を検証するまで無効です。現状は開発用の確認画面です。</p>
                      <button type="button" disabled>Broker／Wallet／Provider接続待ち</button>
                      <button type="button" onClick={() => setDelegationReview(null)}>
                        確認を閉じる
                      </button>
                    </section>
                  )}
                  <div className="work-delegations-heading">
                    <div>
                      <h3 id="work-delegations-title">接続したエージェント</h3>
                      <p>相手側の完了と、RockstarOSでの成果確認は別の状態です。</p>
                    </div>
                    <button disabled={delegationBusy} onClick={() => void refreshDelegations(selected.id)}>
                      <RefreshCw size={14} /> 更新
                    </button>
                  </div>
                  {delegationError && <p className="work-delegation-error" role="alert">{delegationError}</p>}
                  {delegationBusy && delegations.length === 0 ? (
                    <p>委任状態を読み込んでいます…</p>
                  ) : delegations.length === 0 ? (
                    <p>この仕事から委任したエージェントはありません。</p>
                  ) : (
                    <div className="work-delegation-list">
                      {delegations.map((delegation) => (
                        <article className="work-delegation" key={delegation.id}>
                          <div className="work-delegation-title">
                            <strong>{delegation.targetAgentName}</strong>
                            <span>v{delegation.targetAgentVersion}</span>
                          </div>
                          <p>{delegationStateName(delegation.state)}</p>
                          {delegation.predecessorDelegationId && <small>前段成果からの続き · {delegation.predecessorDelegationId}</small>}
                          <small>
                            Agent上限 {formatCurrencyMinor(delegation.budgetLimitMinor, delegation.budgetCurrency)} · 親job上限 {formatCurrencyMinor(delegation.parentBudgetLimitMinor, delegation.budgetCurrency)} · 予約 {delegationBudgetReservations.find((item) => item.delegationId === delegation.id)?.state === 'held' ? `保持中 ${formatCurrencyMinor(delegationBudgetReservations.find((item) => item.delegationId === delegation.id)?.reservedMinor ?? 0, delegation.budgetCurrency)}` : delegationBudgetReservations.find((item) => item.delegationId === delegation.id)?.state ?? '未予約'} · 期限 {new Date(delegation.deadlineAt).toLocaleString('ja-JP')}
                          </small>
                          {delegation.liveUsageSnapshot ? (
                            <small>Provider報告の実行中暫定累計: {formatCurrencyMinor(delegation.liveUsageSnapshot.cumulativeAmountMinor, delegation.liveUsageSnapshot.currency)} · {new Date(delegation.liveUsageSnapshot.issuedAt).toLocaleTimeString('ja-JP')}時点 · 最終請求額ではありません</small>
                          ) : <small>予約額は上限を確保した額です。Provider meterの報告待ちのため、実行中費用はまだ未確認です。</small>}
                          {delegation.remoteState && <small>相手の状態: {delegation.remoteState}</small>}
                          <div className="work-delegation-actions">
                            {delegation.remoteTaskId && (
                              <button disabled={delegationBusy || delegation.artifactsCaptured !== 1} onClick={() => void loadArtifacts(delegation.id)}>
                                成果を確認
                              </button>
                            )}
                            {delegation.remoteTaskId && (
                              <button disabled={delegationBusy} onClick={() => void loadUsageDetails(delegation.id)}>
                                料金・利用明細
                              </button>
                            )}
                            {!['remote_cancelled', 'remote_completed', 'remote_failed', 'remote_rejected', 'cancelled_before_dispatch', 'expired'].includes(delegation.state) && (
                              <button disabled={delegationBusy || delegation.state.startsWith('cancel_')} onClick={() => void requestDelegationCancel(delegation.id)}>
                                停止を要求
                              </button>
                            )}
                          </div>
                          {Object.hasOwn(delegationUsageDetails, delegation.id) && (
                            <section className="work-delegation-usage" aria-label="Provider署名済み利用明細">
                              {delegationUsageDetails[delegation.id]?.liveUsageSnapshot && (
                                <>
                                  <h4>実行中のProvider報告（暫定）</h4>
                                  <p>累計: {formatCurrencyMinor(delegationUsageDetails[delegation.id]!.liveUsageSnapshot!.cumulativeAmountMinor, delegationUsageDetails[delegation.id]!.liveUsageSnapshot!.currency)} · sequence {delegationUsageDetails[delegation.id]!.liveUsageSnapshot!.sequence} · {delegationUsageDetails[delegation.id]!.liveUsageSnapshot!.pricingVersion}</p>
                                  <ul>
                                    {(delegationUsageDetails[delegation.id]!.liveUsageSnapshot!.snapshot?.usage ?? []).map((line, index) => (
                                      <li key={`live-${line.meter}-${index}`}>{line.meter}: {line.quantity.toLocaleString('ja-JP')} {line.unit} · {formatCurrencyMinor(line.amountMinor, delegationUsageDetails[delegation.id]!.liveUsageSnapshot!.currency)}</li>
                                    ))}
                                  </ul>
                                  <small>{new Date(delegationUsageDetails[delegation.id]!.liveUsageSnapshot!.issuedAt).toLocaleString('ja-JP')} · Provider署名を検証して受信。最終receiptとの照合前のため請求確定額ではありません。</small>
                                </>
                              )}
                              {delegationUsageDetails[delegation.id]?.usageReceipt ? (
                                <>
                                  <h4>照合済み利用明細</h4>
                                  <p>確定額: {formatCurrencyMinor(delegationUsageDetails[delegation.id]!.usageReceipt!.amountMinor, delegationUsageDetails[delegation.id]!.usageReceipt!.currency)} · Provider: {delegationUsageDetails[delegation.id]!.usageReceipt!.providerId} · 価格版: {delegationUsageDetails[delegation.id]!.usageReceipt!.receipt?.pricingVersion ?? '記録なし'}</p>
                                  <ul>
                                    {(delegationUsageDetails[delegation.id]!.usageReceipt!.receipt?.usage ?? []).map((line, index) => (
                                      <li key={`${line.meter}-${index}`}>{line.meter}: {line.quantity.toLocaleString('ja-JP')} {line.unit} · {formatCurrencyMinor(line.amountMinor, delegationUsageDetails[delegation.id]!.usageReceipt!.currency)}</li>
                                    ))}
                                  </ul>
                                  <small>{new Date(delegationUsageDetails[delegation.id]!.usageReceipt!.issuedAt).toLocaleString('ja-JP')} · Provider署名済みreceiptをサーバーで照合</small>
                                </>
                              ) : <p>署名済み確定receiptはまだ届いていません。暫定meterと予約上限は実際の確定請求額として扱いません。</p>}
                            </section>
                          )}
                          {delegation.artifactsCaptured !== 1 && delegation.remoteTaskId && (
                            <small>成果を相手側から照合中です。停止状態や成果の取得を完了とは扱いません。</small>
                          )}
                          {artifactDocuments[delegation.id]?.map((document, index) => (
                            <div className="work-delegation-artifact" key={`${delegation.id}-${index}`}>
                              {document.artifacts.map((artifact, artifactIndex) => (
                                <section key={`${delegation.id}-${index}-${artifactIndex}`}>
                                  {artifact.name && <strong>{artifact.name}</strong>}
                                  {artifact.description && <p>{artifact.description}</p>}
                                  {artifact.textParts.map((text, partIndex) => <pre key={partIndex}>{text}</pre>)}
                                </section>
                              ))}
                              {document.omittedNonTextParts > 0 && <small>{document.omittedNonTextParts}件のfile／data partは自動取得していません。</small>}
                              {document.truncated && <small>表示できるサイズを超えたため、成果の一部を省略しています。</small>}
                              <div className="work-delegation-actions">
                                <button type="button" disabled={selected.status !== 'active' || delegation.state !== 'remote_completed' || delegation.artifactsCaptured !== 1 || document.omittedNonTextParts > 0 || document.truncated}
                                  onClick={() => prepareResultForAnotherAgent(delegation, document)}>
                                  この成果を別Agentへの依頼案にする
                                </button>
                              </div>
                              <small>クリックしても送信されません。出力は未検証データとして区切られ、次のAgentには新しい見積・予算上限・承認が必要です。</small>
                            </div>
                          ))}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
                <section className="work-delegations" aria-labelledby="work-cloud-text-title">
                  <div className="work-delegations-heading">
                    <div>
                      <h3 id="work-cloud-text-title">クラウドAIへ依頼</h3>
                      <p>OpenAI{remoteTextModel ? ` · ${remoteTextModel}` : ''}。見積もりと上限を確認し、実行前に承認します。</p>
                    </div>
                    <button type="button" disabled={remoteTextBusy || !selected.id} onClick={() => void refreshRemoteText(selected.id)}>
                      <RefreshCw size={14} /> 状態を更新
                    </button>
                  </div>
                  {selected.status === 'active' ? <form className="work-delegation-create" onSubmit={(event) => void createRemoteTextQuote(event)}>
                    <label htmlFor="work-cloud-text-prompt">
                      AIへの依頼
                      <Textarea id="work-cloud-text-prompt" value={remoteTextPrompt} onChange={(event) => { setRemoteTextPrompt(event.target.value); setRemoteTextEstimate(null); }} rows={5} maxLength={24000} placeholder="依頼を具体的に入力してください" />
                    </label>
                    <div className="work-delegation-fields">
                      <label>見積通貨
                        {remoteTextCurrencyOptions.length > 1 ? <select value={remoteTextCurrency} disabled={remoteTextBudgetCurrency !== null} onChange={(event) => { setRemoteTextCurrency(event.target.value); setRemoteTextEstimate(null); }}>
                          {remoteTextCurrencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </select> : <input value={remoteTextCurrency} maxLength={3} disabled={remoteTextBudgetCurrency !== null} onChange={(event) => { setRemoteTextCurrency(event.target.value.toUpperCase()); setRemoteTextEstimate(null); }} />}
                      </label>
                      <label>この依頼の最大額（{remoteTextCurrency}）
                        <input type="number" min="0.01" step={remoteTextCurrency === 'JPY' || remoteTextCurrency === 'KRW' ? '1' : '0.01'} value={remoteTextCapMinor} onChange={(event) => { setRemoteTextCapMinor(event.target.value); setRemoteTextEstimate(null); }} />
                      </label>
                      {remoteTextBudgetCurrency === remoteTextCurrency && remoteTextBudgetLimit !== null ? <p>
                        親job共通上限 {formatCurrencyMinor(remoteTextBudgetLimit, remoteTextCurrency)} · 予約 {formatCurrencyMinor(delegationBudgetPool?.reservedMinor ?? 0, remoteTextCurrency)} · 確定記録 {formatCurrencyMinor(delegationBudgetPool?.settledMinor ?? 0, remoteTextCurrency)}
                      </p> : <label>親job全体の上限（{remoteTextCurrency}）
                        <input type="number" min="0.01" step={remoteTextCurrency === 'JPY' || remoteTextCurrency === 'KRW' ? '1' : '0.01'} value={remoteTextParentCapMinor} onChange={(event) => setRemoteTextParentCapMinor(event.target.value)} />
                      </label>}
                    </div>
                    <label className="work-delegation-consent work-cloud-text-consent">
                      <input type="checkbox" checked={remoteTextSaveResult} onChange={(event) => setRemoteTextSaveResult(event.target.checked)} />
                      完了後の回答をCloudのjob履歴へ保存する（初期設定は保存しない）
                    </label>
                    <button className="work-primary" type="submit" disabled={remoteTextBusy || remoteTextNeedsSignin || !remoteTextPrompt.trim() || selected.status !== 'active'}>
                      {remoteTextBusy ? '料金を確認中…' : '料金見積を確認して保存'}
                    </button>
                    <p>見積と保存だけではProviderへ依頼文を送信しません。支出上限はこの親jobの残り予算内に設定してください。Cloud taskとして実行する許可は別の操作です。</p>
                  </form> : <p>Cloud AI依頼は作業中の親jobから追加できます。完了・取消済みのjobには追加できません。</p>}
                  {remoteTextEstimate && <dl>
                    <div><dt>最大見積</dt><dd>{formatCurrencyMinor(remoteTextEstimate.estimate.maximumChargeMinor, remoteTextEstimate.estimate.currency)}</dd></div>
                    <div><dt>モデル / 価格版</dt><dd>{remoteTextEstimate.estimate.modelId} · {remoteTextEstimate.estimate.pricingVersion}</dd></div>
                    {remoteTextEstimate.unitRates.map((rate) => <div key={rate.category}>
                      <dt>{{ 'ordinary-input': '通常入力', 'cached-input': 'キャッシュ入力', 'cache-write': 'キャッシュ書込', output: '出力' }[rate.category]} 単価</dt>
                      <dd>{formatCurrencyRatePerMillionTokens(rate.rateMinorMicrosPerMillionTokens, remoteTextEstimate.estimate.currency)}</dd>
                    </div>)}
                    <div><dt>入力 / 出力上限</dt><dd>{remoteTextEstimate.estimate.inputTokenUpperBound.toLocaleString('ja-JP')} / {remoteTextEstimate.estimate.outputTokenLimit.toLocaleString('ja-JP')} tokens</dd></div>
                    <div><dt>料金表</dt><dd><a href={remoteTextEstimate.rateSource} target="_blank" rel="noreferrer">{remoteTextEstimate.cardId}</a></dd></div>
                  </dl>}
                  {remoteTextError && <p className="work-delegation-error" role="alert">{remoteTextError}</p>}
                  {remoteTextNeedsSignin && <a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(typeof window === 'undefined' ? '/work' : window.location.pathname + window.location.search)}`} target="_top">サインインして続ける</a>}
                  {!remoteTextExecutionAvailable && <p className="work-delegation-gate">クラウドAIの実行は準備中です。見積もりを保存しても、AIへの送信や課金は始まりません。</p>}
                  {remoteTextExecutions.length > 0 && <div className="work-delegation-list" aria-label="Cloud LLM依頼履歴">
                    {remoteTextExecutions.map((execution) => <article className="work-delegation" key={execution.id}>
                      <div className="work-delegation-title"><strong>{execution.state === 'quoted' ? '見積・承認待ち' : execution.state === 'reserved' ? '上限を予約済み' : execution.state === 'sending' ? 'Cloud AI実行中' : execution.state === 'completed' ? '処理完了' : execution.state === 'unreconciled' ? '利用量照合待ち' : execution.state === 'cancelled' ? '取消済み' : '期限切れ'}</strong><small>{new Date(execution.createdAt).toLocaleString('ja-JP')}</small></div>
                      <p>最大額 {formatCurrencyMinor(execution.quote.ceiling.maximumChargeMinor, execution.quote.ceiling.currency)} · {execution.quote.ceiling.modelId} · 期限 {new Date(execution.quote.expiresAt).toLocaleString('ja-JP')}</p>
                      {execution.state === 'reserved' || execution.state === 'sending' ? <p>
                        {execution.spending?.providerMeter === 'stream_estimate' && typeof execution.spending.currentEstimateMinor === 'number'
                          ? <>実行中の暫定見積 {formatCurrencyMinor(execution.spending.currentEstimateMinor, execution.spending.currency)}（依頼入力上限＋受信済み出力UTF-8 byte÷3の概算。Provider確定meterではありません） · </>
                          : '実行中のProvider使用額はまだ表示できません · '}
                        予約上限 {formatCurrencyMinor(execution.spending?.reservedMaximumMinor ?? execution.quote.ceiling.maximumChargeMinor, execution.quote.ceiling.currency)}を保持中。
                      </p> : null}
                      {execution.state === 'unreconciled' && <p>利用量が確定できず上限予約を保持しています。自動再送は行いません。照合後に状態を更新してください。{execution.errorCode ? ` (${execution.errorCode})` : ''}</p>}
                      {execution.price && <section className="work-delegation-usage" aria-label="Cloud LLM利用明細">
                        <h4>計算済み利用明細（Provider invoice照合前）</h4>
                        <p>利用量から計算した金額: {formatCurrencyMinor(execution.price.chargeMinor, execution.price.currency)} · 価格版 {execution.price.pricingVersion}</p>
                        <ul>{execution.price.items.map((item) => <li key={item.category}>{item.category}: {item.tokens.toLocaleString('ja-JP')} tokens · {item.rateMinorMicrosPerMillionTokens.toLocaleString('ja-JP')} minor-unit micro / 1M tokens</li>)}</ul>
                        <small>これはProvider利用量に基づく計算記録であり、請求書・決済照合済みを意味しません。</small>
                      </section>}
                      {execution.resultText && <>
                        <details><summary>保存した回答を表示</summary><pre>{execution.resultText}</pre></details>
                        <div className="work-delegation-actions">
                          <a href={`/api/llm/quotes/${encodeURIComponent(execution.id)}?download=1`} download>回答をダウンロード</a>
                          {execution.state === 'completed' && <button type="button" disabled={remoteTextBusy || remoteTextNeedsSignin} onClick={() => setRemoteTextDeleteId(execution.id)}>保存した回答を削除</button>}
                        </div>
                      </>}
                      {execution.state === 'quoted' && <div className="work-delegation-actions">
                        {remoteTextExecutionAvailable && <button type="button" disabled={remoteTextBusy || !remoteTextPrompt.trim()} onClick={() => void runRemoteText(execution)}>この上限で承認して実行</button>}
                        <button type="button" disabled={remoteTextBusy} onClick={() => void cancelRemoteTextQuote(execution)}>見積を取り消す</button>
                      </div>}
                      {execution.state === 'quoted' && !remoteTextPrompt.trim() && <small>再接続後に実行する場合は、見積時と同じ依頼文を入力してください。内容が一致しない場合は実行しません。</small>}
                    </article>)}
                  </div>}
                  {remoteTextResult && <section className="work-delegation-artifact" aria-label="クラウドAIの回答"><strong>クラウドAIの回答</strong><pre>{remoteTextResult.text}</pre>
                    <button type="button" onClick={() => downloadRemoteText(remoteTextResult.text, remoteTextResult.executionId)}>回答をダウンロード</button>
                  </section>}
                </section>
                {selected.status === 'active' && currentStep && (
                  <button
                    className="work-primary"
                    disabled={locked}
                    onClick={() => setRunnerStep(currentStep.id)}
                  >
                    <Play size={16} /> {currentStep.title}
                    {runnerStep && runnerStep !== currentStep.id
                      ? 'へ進む'
                      : ''}
                  </button>
                )}
                {openRunner &&
                  selected.status !== 'completed' &&
                  selected.status !== 'cancelled' && (
                    <div className="work-runner">
                      <p>
                        結果を確認・保存してから次へ進んでください。原稿の引き渡しはコピーで行えます。
                      </p>
                      {openRunner.runner === 'a2a-quote-check' ? (
                        <section aria-label="A2A委任条件の確認">
                          <p>この手順は、A2A条件とProvider署名見積を含むdraftが同じZema jobへ保存された後に通過できます。draft保存は外部実行ではありません。</p>
                          <button type="button" disabled={busy || pending !== null || openRunner.passed || delegationReview?.request.parentJobId !== selected.id || !delegationReview.request.priceQuote}
                            onClick={() => void record(openRunner.tool, 'browser', 'completed', 1, false, 'passed', delegationReview?.delegationId)}>
                            保存済みの依頼条件を確認して記録
                          </button>
                        </section>
                      ) : openRunner.runner === 'a2a-result-check' ? (() => {
                        const resultDelegation = delegations.find((item) => item.parentJobId === selected.id && item.state === 'remote_completed' && item.artifactsCaptured === 1);
                        const details = resultDelegation ? delegationUsageDetails[resultDelegation.id] : null;
                        const captured = resultDelegation ? (artifactDocuments[resultDelegation.id]?.length ?? 0) > 0 : false;
                        return <section aria-label="A2A成果・利用量の確認">
                          <p>相手側の完了、成果の取得、署名済み利用receiptを確認してから仕事を完了できます。未確定の利用額は通過条件にしません。</p>
                          {resultDelegation && <p>委任先: {resultDelegation.targetAgentName} · 成果 {captured ? '取得済み' : '未取得'} · 利用receipt {details?.usageReceipt ? '照合済み' : '未確認'}</p>}
                          <label><input type="checkbox" checked={resultReviewConfirmedForJob === selected.id} onChange={(event) => setResultReviewConfirmedForJob(event.target.checked ? selected.id : '')} />成果が依頼条件を満たすことと、明細内容を確認しました</label>
                          <button type="button" disabled={busy || pending !== null || openRunner.passed || resultReviewConfirmedForJob !== selected.id || !resultDelegation || !captured || !details?.usageReceipt}
                            onClick={() => void record(openRunner.tool, 'browser', 'completed', performance.now(), false, 'passed', resultDelegation?.id)}>
                            成果と利用receiptを確認済みとして記録
                          </button>
                          {resultDelegation && !details?.usageReceipt && <button type="button" disabled={delegationBusy} onClick={() => void loadUsageDetails(resultDelegation.id)}>Provider利用明細を取得</button>}
                          {resultDelegation && !captured && <button type="button" disabled={delegationBusy || resultDelegation.artifactsCaptured !== 1} onClick={() => void loadArtifacts(resultDelegation.id)}>委任成果を取得</button>}
                        </section>;
                      })() : (
                        <MrToolRunner
                          onRunningChange={setRunning}
                          key={selected.id + openRunner.id}
                          tool={openRunner.runner as MrRunner}
                          onRecord={record}
                          executionDisabled={busy || pending !== null || openRunner.passed}
                        />
                      )}
                    </div>
                  )}
                {selected.status === 'review' && (
                  <section className="work-review">
                    <h3>仕上がりの最終確認</h3>
                    <p>
                      原稿と条件を確認し、確認した内容を記録してください。仕事名・確認メモはアカウントに保存されます。
                    </p>
                    <label htmlFor="work-review-note">
                      確認メモ
                      <Textarea
                        id="work-review-note"
                        value={note}
                        maxLength={2000}
                        disabled={locked}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="確認した条件、修正した点など"
                      />
                    </label>
                    <button
                      className="work-primary"
                      disabled={locked || !note.trim()}
                      onClick={() => void finish('complete')}
                    >
                      <Check size={16} /> 内容を確認して完了
                    </button>
                  </section>
                )}
                <section className="work-history">
                  <h3>実行と確認の記録</h3>
                  {selected.events.length === 0 ? (
                    <p>まだ実行していません。</p>
                  ) : (
                    <ol>
                      {selected.events
                        .slice()
                        .reverse()
                        .map((event) => (
                          <li key={event.command.id}>
                            <time>
                              {new Date(event.at).toLocaleString('ja-JP')}
                            </time>
                            <span>
                              {eventDescription(selected, event.command)}
                            </span>
                          </li>
                        ))}
                    </ol>
                  )}
                </section>
                {(selected.status === 'active' ||
                  selected.status === 'review') && (
                  <button
                    className="work-cancel"
                    disabled={locked}
                    onClick={() => void finish('cancel')}
                  >
                    この仕事を中止
                  </button>
                )}
              </>
            )}
          </section>
        </div>
        <p className="work-footnote">
          原稿とファイルは端末内で処理されます。サンプルは手順を進めません。履歴は本人の端末から報告された処理結果で、売上・送信・外部納品の実績には含めません。
        </p>
      </div>
      <Dialog open={Boolean(remoteTextDeleteTarget)} onOpenChange={(open) => { if (!open && !remoteTextBusy) setRemoteTextDeleteId(null); }}>
        <DialogContent>
          <DialogTitle>保存した回答を削除しますか？</DialogTitle>
          <DialogDescription>回答本文だけを削除します。元に戻せません。実行状態と利用明細は残ります。必要な回答は先にダウンロードしてください。</DialogDescription>
          {remoteTextDeleteTarget && <>
            <p>{remoteTextDeleteTarget.quote.ceiling.modelId} · {new Date(remoteTextDeleteTarget.createdAt).toLocaleString('ja-JP')} · {remoteTextDeleteTarget.id.slice(0, 8)}</p>
            <div className="work-delegation-actions">
              <button type="button" disabled={remoteTextBusy} onClick={() => setRemoteTextDeleteId(null)}>戻る</button>
              <button type="button" className="work-primary" disabled={remoteTextBusy} onClick={() => void deleteRemoteTextResult(remoteTextDeleteTarget)}>{remoteTextBusy ? '削除を確認中…' : '回答本文を削除する'}</button>
            </div>
          </>}
        </DialogContent>
      </Dialog>
      <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}>
        <DialogContent className="market-wide-dialog">
          <DialogTitle>PC接続</DialogTitle>
          <DialogDescription>
            納品記録の照合に使うPCを接続します。
          </DialogDescription>
          <DeviceConnection />
        </DialogContent>
      </Dialog>
    </div>
  );

  if (embedded) return content;

  return (
    <WorkspaceShell
      running={running}
      title="Zema · 仕事"
      onConnect={() => setDeviceOpen(true)}
    >
      {content}
    </WorkspaceShell>
  );
}
