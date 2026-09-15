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
export default function Workbench() {
  const [jobs, setJobs] = useState<WorkJob[]>([]),
    [selectedId, setSelectedId] = useState('');
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
      setSelectedId(data.job.id);
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
  return (
    <WorkspaceShell
      running={running}
      title="Sky · 仕事・履歴"
      onConnect={() => setDeviceOpen(true)}
    >
      <div className="work-shell">
        <div className="work-body">
          <nav className="rock-view-nav" aria-label="Skyの仕事と履歴">
            <Link href="/work" aria-current="page">
              手順のある仕事
            </Link>
            <Link href="/csv">CSV仕事</Link>
            <Link href="/activity">ツールの実行履歴</Link>
          </nav>
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
                      setSelectedId(job.id);
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
    </WorkspaceShell>
  );
}
