import Link from 'next/link';
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Layers3,
  LoaderCircle,
  Radio,
} from 'lucide-react';
import { catalog } from '@/lib/catalog';
import type {
  AutomationFundAnalytics,
  AutomationFundPlan,
} from '@/lib/automation-fund';
import type { Job } from '@/lib/operations';

type Props = {
  jobs: Job[];
  csvJobs: CsvJob[];
  selectedTool: { id: string; name: string } | null;
  fund: AutomationFundPlan | null;
  fundAnalytics: (AutomationFundAnalytics & { fundId: string }) | null;
  fundRefreshing: boolean;
};

export type CsvJob = {
  id: string;
  status: string;
  inputName: string;
  inputBytes: number;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
  acceptedAt: number | null;
  completedAt: number | null;
};

const toolNames = new Map(catalog.map((tool) => [tool.id, tool.name]));

function time(value: number | string | null) {
  if (value == null) return '';
  return new Date(value).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function jobLabel(job: Job) {
  if (job.status === 'completed') return '完了・保存済み';
  if (job.status === 'failed' || job.status === 'interrupted')
    return '確認が必要';
  if (job.status === 'cancelled') return '停止済み';
  if (job.status === 'running') return '実行中';
  return '受付済み';
}

function activityIcon(state: 'done' | 'current' | 'attention' | 'waiting') {
  if (state === 'done') return <CheckCircle2 size={17} />;
  if (state === 'current')
    return <LoaderCircle className="sky-chat-spin" size={17} />;
  if (state === 'attention') return <CircleAlert size={17} />;
  return <Clock3 size={17} />;
}

function ToolProgress({ job, name }: { job: Job; name: string }) {
  const failed = job.status === 'failed' || job.status === 'interrupted';
  const stopped = job.status === 'cancelled';
  const finished = job.status === 'completed' || failed || stopped;
  const steps: Array<{
    label: string;
    detail: string;
    at: number | null;
    state: 'done' | 'current' | 'attention' | 'waiting';
  }> = [
    {
      label: '依頼を受け付けました',
      detail: '実行記録を作成',
      at: job.createdAt,
      state: 'done',
    },
    {
      label: job.startedAt ? 'Toolが処理を開始' : '開始を待っています',
      detail: job.deviceId ? '接続端末で実行' : '実行先を確認中',
      at: job.startedAt,
      state: job.startedAt ? 'done' : finished ? 'waiting' : 'current',
    },
    {
      label: failed
        ? '処理を確認してください'
        : stopped
          ? '処理を停止しました'
          : job.status === 'completed'
            ? '処理が完了しました'
            : job.status === 'running'
              ? 'Toolが処理しています'
              : '実行開始後に進捗を表示',
      detail: failed
        ? job.errorCode || '再実行前に状態確認が必要です'
        : stopped
          ? '新しい指示から再開できます'
          : job.status === 'completed'
            ? job.outputBytes == null
              ? '結果を保存済み'
              : `${job.outputBytes} bytesの結果`
            : job.status === 'running'
              ? '状態を自動更新しています'
              : '開始待ちです',
      at: job.finishedAt,
      state:
        failed || stopped
          ? 'attention'
          : finished
            ? 'done'
            : job.status === 'running'
              ? 'current'
              : 'waiting',
    },
    {
      label: job.status === 'completed' ? '結果を履歴へ保存' : '結果を保存',
      detail:
        job.status === 'completed'
          ? 'Zemaの仕事管理から確認できます'
          : '完了後に保存されます',
      at: job.status === 'completed' ? job.finishedAt : null,
      state: job.status === 'completed' ? 'done' : 'waiting',
    },
  ];

  return (
    <section className="sky-chat-live-task" aria-label={`${name}の進捗`}>
      <header>
        <div>
          <small>SELECTED TOOL</small>
          <h3>{name}</h3>
        </div>
        <span className={`is-${job.status}`}>{jobLabel(job)}</span>
      </header>
      <ol>
        {steps.map((step, index) => (
          <li className={`is-${step.state}`} key={`${job.id}-${index}`}>
            <span>{activityIcon(step.state)}</span>
            <div>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
            {step.at && <time>{time(step.at)}</time>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CsvProgress({ job }: { job: CsvJob }) {
  const accepted = job.acceptedAt != null;
  const processing = job.status === 'accepted' || job.status === 'processing';
  const completed = job.status === 'completed';
  const failed = job.status === 'quality_failed';
  const label = completed
    ? '検査合格・保存済み'
    : failed
      ? '検査結果の確認が必要'
      : processing
        ? '処理中'
        : '開始確認待ち';
  const steps: Array<{
    label: string;
    detail: string;
    at: number | null;
    state: 'done' | 'current' | 'attention' | 'waiting';
  }> = [
    {
      label: 'CSVと条件を受け付けました',
      detail: `${job.inputName} · ${(job.inputBytes / 1024).toFixed(1)} KB`,
      at: job.createdAt,
      state: 'done',
    },
    {
      label: accepted ? '開始条件を確認しました' : '開始確認を待っています',
      detail: accepted ? '受付内容に紐付け済み' : 'CSV Toolで確認できます',
      at: job.acceptedAt,
      state: accepted ? 'done' : 'current',
    },
    {
      label: failed
        ? '独立検査に合格しませんでした'
        : completed
          ? '変換と独立検査が完了'
          : processing
            ? '変換と独立検査を実行中'
            : '変換と独立検査',
      detail: failed
        ? job.errorCode || 'CSV Toolから安全に再試行できます'
        : processing
          ? '状態を自動更新しています'
          : completed
            ? '検査済み成果物を生成'
            : '開始後に実行します',
      at: completed ? job.completedAt : processing || failed ? job.updatedAt : null,
      state: failed
        ? 'attention'
        : completed
          ? 'done'
          : processing
            ? 'current'
            : 'waiting',
    },
    {
      label: completed ? '成果物を履歴へ保存' : '成果物を保存',
      detail: completed ? 'CSV Toolから取得できます' : '検査合格後に保存されます',
      at: job.completedAt,
      state: completed ? 'done' : 'waiting',
    },
  ];

  return (
    <section className="sky-chat-live-task" aria-label="CSV自動化役の進捗">
      <header>
        <div>
          <small>SELECTED TOOL</small>
          <h3>CSV整形・検査・納品</h3>
        </div>
        <span className={`is-${job.status}`}>{label}</span>
      </header>
      <ol>
        {steps.map((step, index) => (
          <li className={`is-${step.state}`} key={`${job.id}-${index}`}>
            <span>{activityIcon(step.state)}</span>
            <div>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
            {step.at && <time>{time(step.at)}</time>}
          </li>
        ))}
      </ol>
      <Link className="sky-chat-live-tool-link" href="/csv">
        CSV Toolを開く
      </Link>
    </section>
  );
}

function FundProgress({
  fund,
  analytics,
  jobs,
}: {
  fund: AutomationFundPlan;
  analytics: (AutomationFundAnalytics & { fundId: string }) | null;
  jobs: Job[];
}) {
  return (
    <section className="sky-chat-live-fund" aria-label={`${fund.name}の進捗`}>
      <header>
        <div>
          <small>SELECTED FUND</small>
          <h3>{fund.name}</h3>
        </div>
        <span>
          <Layers3 size={14} /> {fund.tools.length} Tools
        </span>
      </header>
      <div className="sky-chat-fund-tools">
        {fund.tools.map((tool) => {
          const latest = jobs.find((job) => job.tool === tool.toolId);
          const live =
            latest?.status === 'running' || latest?.status === 'queued';
          return (
            <div key={tool.toolId}>
              <span className={live ? 'is-live' : ''} aria-hidden="true" />
              <div>
                <strong>{toolNames.get(tool.toolId) ?? tool.role}</strong>
                <small>
                  {latest
                    ? jobLabel(latest)
                    : tool.completedReceipts > 0
                      ? `検証済み実績 ${tool.completedReceipts}件`
                      : '実行待ち'}
                </small>
              </div>
              <b>{(tool.allocationBps / 100).toFixed(0)}%</b>
            </div>
          );
        })}
      </div>
      <footer>
        <span>
          検証済み実績 {analytics?.completedReceipts ?? 0}件 ·{' '}
          {analytics?.observedReturnBps == null
            ? '利回りは算定待ち'
            : `観測利回り ${(analytics.observedReturnBps / 100).toFixed(2)}%`}
        </span>
        <time>
          {analytics ? `${time(analytics.evaluatedAt)} 更新` : '実績を確認中'}
        </time>
      </footer>
    </section>
  );
}

export default function ChatLiveProgress({
  jobs,
  csvJobs,
  selectedTool,
  fund,
  fundAnalytics,
  fundRefreshing,
}: Props) {
  const selectedJob = selectedTool
    ? jobs.find((job) => job.tool === selectedTool.id)
    : jobs.find((job) => job.status === 'running' || job.status === 'queued');
  const selectedCsvJob =
    selectedTool?.id === 'rockstar-csv-cleanup'
      ? csvJobs[0]
      : csvJobs.find(
          (job) => job.status === 'accepted' || job.status === 'processing',
        );
  const selectedJobName =
    selectedTool?.name ??
    (selectedJob ? toolNames.get(selectedJob.tool) : null) ??
    'Sky Tool';

  if (!selectedJob && !selectedCsvJob && !fund) return null;
  const busy =
    fundRefreshing ||
    selectedJob?.status === 'running' ||
    selectedJob?.status === 'queued' ||
    selectedCsvJob?.status === 'accepted' ||
    selectedCsvJob?.status === 'processing';

  return (
    <section
      className="sky-chat-live-progress"
      aria-labelledby="sky-chat-live-title"
      aria-live="polite"
      aria-busy={busy}
    >
      <header>
        <div>
          <span className={busy ? 'is-live' : ''}>
            <Radio size={15} />
          </span>
          <div>
            <small>LIVE ACTIVITY</small>
            <h2 id="sky-chat-live-title">いま動いている内容</h2>
          </div>
        </div>
        <Link href="/chat?view=work">履歴と操作</Link>
      </header>
      {selectedJob && <ToolProgress job={selectedJob} name={selectedJobName} />}
      {selectedCsvJob && <CsvProgress job={selectedCsvJob} />}
      {fund && (
        <FundProgress fund={fund} analytics={fundAnalytics} jobs={jobs} />
      )}
      <p className="sky-chat-live-note">
        実行記録と検証済み受領記録だけを表示します。内部思考や未確認の収益は表示しません。
      </p>
    </section>
  );
}
