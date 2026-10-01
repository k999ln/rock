'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in requires top-level navigation. */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Play, Plus, RefreshCw } from 'lucide-react';
import {
  workflowTemplates,
  type WorkJob,
  type WorkCommand,
} from '@/lib/workflow';
import { type RunRecorder } from '@/lib/device';
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

const stateNames = {
  active: '作業中',
  review: '最終確認',
  completed: '完了',
  cancelled: '中止',
};
type Update = { jobId: string; revision: number; command: WorkCommand };
type Delegation = {
  id: string;
  targetAgentName: string;
  targetAgentVersion: string;
  state: string;
  remoteTaskId: string | null;
  remoteState: string | null;
  deadlineAt: number;
  budgetCurrency: string;
  budgetLimitMinor: number;
  parentBudgetLimitMinor: number;
  artifactsCaptured: number;
  updatedAt: number;
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
  idempotencyKey: string;
  messageId: string;
  targetOrigin: string;
  targetAgentName: string;
  targetAgentVersion: string;
  message: string;
  budgetCurrency: string;
  budgetLimitMinor: number;
  parentBudgetLimitMinor: number;
  deadlineAt: number;
};
type DelegationReview = {
  request: DelegationRequest;
  authorizationSha256: string;
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
function eventDescription(job: WorkJob, command: WorkCommand) {
  if (command.action === 'complete')
    return `本人が確認して完了: ${command.note}`;
  if (command.action === 'cancel') return '仕事を中止';
  const title =
    job.steps.find((step) => step.id === command.stepId)?.title ?? '実行';
  const outcome = {
    passed: '処理成功',
    needs_review: '条件の確認が必要',
    failed: '失敗',
  }[command.outcome];
  return `${title} · ${command.sample ? 'サンプル / ' : ''}${outcome} · ${command.transport === 'browser' ? 'ブラウザ' : 'PC'}`;
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
export default function Workbench({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [jobs, setJobs] = useState<WorkJob[]>([]),
    [selectedId, setSelectedId] = useState('');
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [delegationBudgetPool, setDelegationBudgetPool] = useState<DelegationBudgetPool | null>(null);
  const [delegationBudgetReservations, setDelegationBudgetReservations] = useState<DelegationBudgetReservation[]>([]);
  const [a2aAgents, setA2aAgents] = useState<A2AAgentConnection[]>([]);
  const [agentOrigin, setAgentOrigin] = useState('');
  const [delegationBusy, setDelegationBusy] = useState(false);
  const [delegationError, setDelegationError] = useState('');
  const [artifactDocuments, setArtifactDocuments] = useState<Record<string, ArtifactDocument[]>>({});
  const [delegationForm, setDelegationForm] = useState({
    targetOrigin: '',
    targetAgentName: '',
    targetAgentVersion: '',
    message: '',
    budgetCurrency: 'USD',
    budgetLimitMinor: 0,
    parentBudgetLimitMinor: 0,
  });
  const [delegationReview, setDelegationReview] = useState<DelegationReview | null>(null);
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
        budget?: DelegationBudgetPool | null;
        reservations?: DelegationBudgetReservation[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || '委任を読み込めませんでした。');
      if (selectedIdRef.current === parentJobId) {
        setDelegations(data.delegations ?? []);
        setDelegationBudgetPool(data.budget ?? null);
        setDelegationBudgetReservations(data.reservations ?? []);
        if (data.budget) {
          setDelegationForm((current) => ({
            ...current,
            budgetCurrency: data.budget!.currency,
            parentBudgetLimitMinor: data.budget!.budgetLimitMinor,
          }));
        }
      }
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : '委任を読み込めませんでした。');
    } finally {
      setDelegationBusy(false);
    }
  }, []);
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
    selectedIdRef.current = id;
    setSelectedId(id);
    setArtifactDocuments({});
    setDelegationBudgetPool(null);
    setDelegationBudgetReservations([]);
    void refreshDelegations(id);
    void refreshA2aAgents();
  }
  useEffect(() => {
    const update = (event: Event) =>
      setRunning(Boolean((event as CustomEvent<string>).detail));
    window.addEventListener('loop-run-state', update);
    return () => window.removeEventListener('loop-run-state', update);
  }, []);
  const selected = jobs.find((job) => job.id === selectedId);
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
      const [tool, transport, status, started, sample, outcome] = args;
      if (!selected || !runnerStep)
        throw new Error('仕事と手順を選んでください。');
      await submit({
        jobId: selected.id,
        revision: selected.revision,
        command: {
          id: crypto.randomUUID(),
          action: 'record',
          stepId: runnerStep,
          tool,
          transport,
          outcome: status === 'failed' ? 'failed' : (outcome ?? 'needs_review'),
          sample,
          durationMs: Math.min(300000, Math.round(performance.now() - started)),
        },
      });
    },
    [selected, runnerStep, submit],
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
  async function createDelegationDraft() {
    if (!selected) return;
    setDelegationBusy(true);
    setDelegationError('');
    const fingerprint = JSON.stringify({ parentJobId: selected.id, ...delegationForm });
    let request = delegationSubmission.current?.fingerprint === fingerprint
      ? delegationSubmission.current.request
      : null;
    if (!request) {
      request = {
        id: crypto.randomUUID(),
        parentJobId: selected.id,
        idempotencyKey: `zema:${selected.id}:${crypto.randomUUID()}`,
        messageId: crypto.randomUUID(),
        targetOrigin: delegationForm.targetOrigin.trim(),
        targetAgentName: delegationForm.targetAgentName.trim(),
        targetAgentVersion: delegationForm.targetAgentVersion.trim(),
        message: delegationForm.message.trim(),
        budgetCurrency: delegationForm.budgetCurrency.trim().toUpperCase(),
        budgetLimitMinor: delegationForm.budgetLimitMinor,
        parentBudgetLimitMinor: delegationForm.parentBudgetLimitMinor,
        deadlineAt: Date.now() + 24 * 60 * 60 * 1000,
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
      setDelegationReview({ request, authorizationSha256: data.approval.digest });
      await refreshDelegations(selected.id);
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : '委任条件を保存できませんでした。');
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
      setDelegationForm((current) => ({
        ...current,
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
    } catch (cause) {
      setDelegationError(cause instanceof Error ? cause.message : 'Agent接続を削除できませんでした。');
    } finally {
      setDelegationBusy(false);
    }
  }
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
                <section className="work-delegations" aria-labelledby="work-delegations-title">
                  <h3 id="work-delegations-title">Agent委任</h3>
                  {delegationBudgetPool && (
                    <p>親job共通枠: {delegationBudgetPool.currency} {delegationBudgetPool.budgetLimitMinor} · 予約中 {delegationBudgetPool.reservedMinor} · 利用量照合済み {delegationBudgetPool.settledMinor}</p>
                  )}
                  {['active', 'review'].includes(selected.status) && !delegationReview && (
                    <form
                      className="work-delegation-create"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void createDelegationDraft();
                      }}
                    >
                      <h3>別のエージェントへ委任する</h3>
                      <p>公開HTTPS originを入力してAgent Cardを取得し、Skyに自分の候補として保存できます。</p>
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
                                <button type="button" disabled={delegationBusy} onClick={() => setDelegationForm((current) => ({ ...current, targetOrigin: agent.origin, targetAgentName: agent.agentName, targetAgentVersion: agent.agentVersion }))}>このAgentを選ぶ</button>
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
                          onChange={(event) => setDelegationForm((current) => ({ ...current, targetOrigin: event.target.value }))}
                        />
                      </label>
                      <div className="work-delegation-fields">
                        <label>
                          Agent名
                          <input required maxLength={120} value={delegationForm.targetAgentName} onChange={(event) => setDelegationForm((current) => ({ ...current, targetAgentName: event.target.value }))} />
                        </label>
                        <label>
                          Agent版
                          <input required maxLength={80} value={delegationForm.targetAgentVersion} onChange={(event) => setDelegationForm((current) => ({ ...current, targetAgentVersion: event.target.value }))} />
                        </label>
                      </div>
                      <label>
                        依頼内容
                        <textarea required maxLength={8000} rows={4} value={delegationForm.message} onChange={(event) => setDelegationForm((current) => ({ ...current, message: event.target.value }))} />
                      </label>
                      <div className="work-delegation-fields">
                        <label>
                          予算上限の通貨
                          <input required maxLength={3} pattern="[A-Za-z]{3}" value={delegationForm.budgetCurrency} onChange={(event) => setDelegationForm((current) => ({ ...current, budgetCurrency: event.target.value }))} />
                        </label>
                        <label>
                          予算上限（通貨最小単位）
                          <input required type="number" min={0} step={1} max={100000000} value={delegationForm.budgetLimitMinor} onChange={(event) => setDelegationForm((current) => ({ ...current, budgetLimitMinor: Number(event.target.value) }))} />
                        </label>
                      </div>
                      <label>
                        親jobのAgent共通予算上限（通貨最小単位）
                        <input required type="number" min={0} step={1} max={100000000} value={delegationForm.parentBudgetLimitMinor} onChange={(event) => setDelegationForm((current) => ({ ...current, parentBudgetLimitMinor: Number(event.target.value) }))} />
                      </label>
                      <p>子Agentごとの上限を承認時にこの共通枠から予約します。同じ親jobの全委任で、共通上限と通貨を揃えます。未使用枠は利用量receiptの照合が終わるまで保持します。</p>
                      <p>期限は作成から24時間です。発見・比較はSky側で確認済みのAgent Cardを使ってください。</p>
                      <button className="work-primary" type="submit" disabled={delegationBusy || delegationForm.message.trim().length === 0 || delegationForm.budgetLimitMinor < 0 || !Number.isSafeInteger(delegationForm.budgetLimitMinor) || delegationForm.parentBudgetLimitMinor < delegationForm.budgetLimitMinor || !Number.isSafeInteger(delegationForm.parentBudgetLimitMinor)}>
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
                        <dt>予算上限</dt><dd>{delegationReview.request.budgetCurrency} {delegationReview.request.budgetLimitMinor}（通貨最小単位）</dd>
                        <dt>親job共通上限</dt><dd>{delegationReview.request.budgetCurrency} {delegationReview.request.parentBudgetLimitMinor}（通貨最小単位）</dd>
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
                          <small>
                            子Agent上限 {delegation.budgetCurrency} {delegation.budgetLimitMinor} · 親job共通上限 {delegation.budgetCurrency} {delegation.parentBudgetLimitMinor} · 予約 {delegationBudgetReservations.find((item) => item.delegationId === delegation.id)?.state === 'held' ? `保持中 ${delegationBudgetReservations.find((item) => item.delegationId === delegation.id)?.reservedMinor}` : delegationBudgetReservations.find((item) => item.delegationId === delegation.id)?.state ?? '未予約'} · 期限 {new Date(delegation.deadlineAt).toLocaleString('ja-JP')}
                          </small>
                          {delegation.remoteState && <small>相手の状態: {delegation.remoteState}</small>}
                          <div className="work-delegation-actions">
                            {delegation.remoteTaskId && (
                              <button disabled={delegationBusy || delegation.artifactsCaptured !== 1} onClick={() => void loadArtifacts(delegation.id)}>
                                成果を確認
                              </button>
                            )}
                            {!['remote_cancelled', 'remote_completed', 'remote_failed', 'remote_rejected', 'cancelled_before_dispatch', 'expired'].includes(delegation.state) && (
                              <button disabled={delegationBusy || delegation.state.startsWith('cancel_')} onClick={() => void requestDelegationCancel(delegation.id)}>
                                停止を要求
                              </button>
                            )}
                          </div>
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
                            </div>
                          ))}
                        </article>
                      ))}
                    </div>
                  )}
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
                      <MrToolRunner
                        onRunningChange={setRunning}
                        key={selected.id + openRunner.id}
                        tool={openRunner.runner as MrRunner}
                        onRecord={record}
                        executionDisabled={
                          busy || pending !== null || openRunner.passed
                        }
                      />
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
