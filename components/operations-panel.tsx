'use client';
import { useRef, useState } from 'react';
import { Check, Clock3, RotateCcw, Cable } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import type { OperationsSnapshot, JobState } from '@/lib/operations';
import type { RunRecord } from '@/lib/fund';
import { catalog } from '@/lib/catalog';
import { operationRequest } from '@/lib/operations-client';
import { deviceId, disconnectDevice } from '@/lib/device';
export const jobLabels: Record<JobState, string> = {
  queued: '開始待ち',
  running: '実行中',
  completed: '完了',
  failed: '失敗',
  interrupted: '中断',
  cancelled: '取消',
};
const name = (id: string) => catalog.find((t) => t.id === id)?.name || id;
const money = (amount: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(
    amount,
  );
const sources: Record<string, string> = {
  coconala: 'ココナラ',
  note: 'note',
  api: 'API費用',
  electricity: '電気代',
  network: '通信費',
  other: 'その他',
};
type SharedProps = {
  data: OperationsSnapshot | null;
  refresh: () => Promise<void>;
};

export function JobHistory({
  data,
  legacy = [],
  refresh,
  openTool,
}: SharedProps & { legacy?: RunRecord[]; openTool: (id: string) => void }) {
  const [error, setError] = useState('');
  const jobs = data?.jobs || [];
  const old = legacy.filter((run) => !jobs.some((job) => job.id === run.id));
  async function cancel(id: string) {
    try {
      await operationRequest(`/api/jobs/${id}`, 'PATCH', { action: 'cancel' });
      setError('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '取り消せませんでした。');
    }
  }
  return (
    <div className="ops-history">
      {error && (
        <p className="app-inline-message" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p>実行状態を確認しています…</p>
      ) : !jobs.length && !old.length ? (
        <div className="app-empty">
          <Clock3 size={26} />
          <h2>まだ実行はありません</h2>
          <p>ホームからツールを選ぶと、ここに状態が残ります。</p>
        </div>
      ) : null}
      {jobs.map((job) => (
        <article className="ops-job" key={job.id}>
          <span className={`app-history-icon ${job.status}`}>
            {job.status === 'completed' ? (
              <Check size={18} />
            ) : (
              <Clock3 size={18} />
            )}
          </span>
          <div>
            <b>{name(job.tool)}</b>
            <small>
              {job.sample ? 'サンプル · ' : ''}
              {job.transport === 'browser' ? 'この端末' : 'PC・MCP'} ·{' '}
              {new Date(job.createdAt).toLocaleString('ja-JP')}
            </small>
            {job.status === 'interrupted' && (
              <small>接続または完了報告を確認できませんでした。</small>
            )}
          </div>
          <div className="ops-job-actions">
            <span className={`ops-state state-${job.status}`}>
              {jobLabels[job.status]}
            </span>
            {job.status === 'queued' && (
              <button onClick={() => void cancel(job.id)}>
                開始を取り消す
              </button>
            )}
            {['failed', 'interrupted', 'cancelled'].includes(job.status) && (
              <button onClick={() => openTool(job.tool)}>
                <RotateCcw size={14} />
                入力して再実行
              </button>
            )}
          </div>
        </article>
      ))}
      {old.length > 0 && (
        <details className="ops-legacy">
          <summary>以前の実行記録（{old.length}件）</summary>
          {old.map((run) => (
            <p key={run.id}>
              {name(run.tool)} · {run.status === 'completed' ? '完了' : '失敗'}{' '}
              · {new Date(run.createdAt).toLocaleString('ja-JP')}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}

export function OperationsPanel({ data, refresh }: SharedProps) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [kind, setKind] = useState('revenue'),
    [source, setSource] = useState('coconala');
  const [amount, setAmount] = useState(''),
    [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const pending = useRef<{ signature: string; id: string } | null>(null);
  async function action(
    path: string,
    method: string,
    value: unknown,
    success: string,
  ) {
    if (busy) return false;
    setBusy(true);
    setMessage('');
    try {
      await operationRequest(path, method, value);
      await refresh();
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '保存できませんでした。',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function record(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = { kind, source, amount: Number(amount), occurredOn: date };
    const signature = JSON.stringify(value);
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: crypto.randomUUID() };
    if (
      await action(
        '/api/book',
        'POST',
        { id: pending.current.id, ...value },
        '手入力の記録を保存しました。',
      )
    ) {
      pending.current = null;
      setAmount('');
    }
  }
  if (!data) return <p>運用状態を確認しています…</p>;
  return (
    <div className="ops-panel">
      {message && (
        <output className="app-inline-message" aria-live="polite">
          {message}
        </output>
      )}
      <section>
        <h2>ツールの利用設定</h2>
        <p>停止すると新しい実行を受け付けなくなります。</p>
        <div className="ops-tools">
          {data.tools.map((t) => (
            <label key={t.tool}>
              <span>
                {name(t.tool)}
                <small>{t.enabled ? '利用可能' : '停止中'}</small>
              </span>
              <Switch
                checked={t.enabled}
                disabled={busy}
                aria-label={`${name(t.tool)}の利用`}
                onCheckedChange={(enabled) =>
                  void action(
                    '/api/tool-controls',
                    'PUT',
                    { tool: t.tool, enabled },
                    enabled
                      ? '利用を再開しました。'
                      : '新しい実行を停止しました。',
                  )
                }
              />
            </label>
          ))}
        </div>
      </section>
      <section>
        <h2>PCの接続記録</h2>
        <p>アプリから最後に応答を確認した状態です。</p>
        {data.devices.length ? (
          data.devices.map((d) => (
            <div className="ops-device" key={d.id}>
              <Cable size={20} />
              <div>
                <b>{d.name}</b>
                <small>
                  {d.online
                    ? '接続中'
                    : d.status === 'revoked'
                      ? '解除済み'
                      : '未接続'}{' '}
                  · 最終確認 {new Date(d.lastSeenAt).toLocaleString('ja-JP')}
                </small>
              </div>
              {d.status !== 'revoked' && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await action(
                        '/api/devices',
                        'POST',
                        { id: d.id, action: 'revoke' },
                        'PC接続を解除しました。',
                      )
                    ) {
                      if (deviceId() === d.id) disconnectDevice();
                    }
                  }}
                >
                  解除
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="ops-muted">PCの接続記録はまだありません。</p>
        )}
      </section>
      <section>
        <h2>過去30日の利用記録</h2>
        <div className="ops-metrics">
          <div>
            <span>実行開始</span>
            <b>{data.usage.executions}回</b>
          </div>
          <div>
            <span>処理データ量</span>
            <b>{(data.usage.processedBytes / 1024).toFixed(1)} KB</b>
          </div>
          <div>
            <span>処理時間</span>
            <b>{(data.usage.durationMs / 1000).toFixed(1)}秒</b>
          </div>
        </div>
        <p>
          サンプルを含む端末からの報告値です。処理データ量は通信量の実測ではありません。電力量・API費用は未計測です。
        </p>
      </section>
      <section>
        <h2>売上・経費の記録</h2>
        <p>手入力・照合前の記録です。売上連携、入金、払出は未接続です。</p>
        <div className="ops-metrics">
          <div>
            <span>記録した売上</span>
            <b>{money(data.book.revenue)}</b>
          </div>
          <div>
            <span>記録した経費</span>
            <b>{money(data.book.expense)}</b>
          </div>
          <div>
            <span>記録上の差額</span>
            <b>{money(data.book.revenue - data.book.expense)}</b>
          </div>
        </div>
        <form
          className="ops-book-form"
          onSubmit={(event) => void record(event)}
        >
          <fieldset disabled={busy}>
            <div className="ops-form-grid">
              <label htmlFor="book-kind">
                <span>種類</span>
                <Select value={kind} onValueChange={(v) => v && setKind(v)}>
                  <SelectTrigger id="book-kind" aria-label="記録の種類">
                    <SelectValue>
                      {kind === 'revenue' ? '売上' : '経費'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">売上</SelectItem>
                    <SelectItem value="expense">経費</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label htmlFor="book-source">
                <span>記録元</span>
                <Select value={source} onValueChange={(v) => v && setSource(v)}>
                  <SelectTrigger id="book-source" aria-label="記録元">
                    <SelectValue>{sources[source]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(sources).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label>
                <span>金額（円）</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="100000000"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                <span>記録日</span>
                <input
                  required
                  type="date"
                  min="2000-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>
            <button className="app-primary-button" type="submit">
              {busy ? '保存中…' : '記録を追加'}
            </button>
          </fieldset>
        </form>
        <div className="ops-book-list">
          {data.book.records.length ? (
            data.book.records.map((r) => (
              <div key={r.id}>
                <div>
                  <b>
                    {r.reversesId
                      ? '取消記録'
                      : r.kind === 'revenue'
                        ? '売上'
                        : '経費'}{' '}
                    · {sources[r.source]}
                  </b>
                  <small>
                    {r.occurredOn} · 手入力{r.reversed ? ' · 取消済み' : ''}
                  </small>
                </div>
                <strong>{money(r.amount)}</strong>
                {!r.reversesId && !r.reversed && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(
                        '/api/book',
                        'POST',
                        { id: crypto.randomUUID(), reversesId: r.id },
                        '取消記録を追加しました。',
                      )
                    }
                  >
                    取消
                  </button>
                )}
              </div>
            ))
          ) : (
            <p>まだ記録はありません。</p>
          )}
        </div>
      </section>
    </div>
  );
}
