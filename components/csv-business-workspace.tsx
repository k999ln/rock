'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in requires top-level navigation. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Download,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import styles from './csv-business-workspace.module.css';

type Job = {
  id: string;
  status: string;
  paymentStatus: string;
  inputName: string;
  inputBytes: number;
  inputSha256: string;
  inputEncoding: string;
  quoteMinor: number;
  currency: string;
  outputSha256: string | null;
  validation: { passed?: boolean } | null;
  attempt: number;
  revision: number;
  errorCode: string | null;
  expiresAt: number;
  createdAt: number;
  completedAt: number | null;
  artifacts: string[];
};

const statusLabel: Record<string, string> = {
  quoted: '見積り確認待ち',
  accepted: '受付済み',
  processing: '処理中',
  completed: '検査合格・納品可能',
  quality_failed: '検査不合格・再試行待ち',
};

async function json<T>(response: Response) {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '処理できませんでした。');
  return data;
}
const columns = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export default function CsvBusinessWorkspace() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rename, setRename] = useState('');
  const [order, setOrder] = useState('');
  const [trim, setTrim] = useState('');
  const [dedupeKeys, setDedupeKeys] = useState('');
  const [dedupeMode, setDedupeMode] = useState('report_only');
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [encoding, setEncoding] = useState('utf8-bom');
  const [spreadsheetSafe, setSpreadsheetSafe] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('ココナラ');
  const [paymentReference, setPaymentReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const specification = useMemo(() => {
    const renames: Record<string, string> = {};
    rename
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const index = line.indexOf('=');
        if (index > 0)
          renames[line.slice(0, index).trim()] = line.slice(index + 1).trim();
      });
    return {
      renames,
      order: columns(order),
      trim: columns(trim),
      dedupe: { keys: columns(dedupeKeys), mode: dedupeMode },
      sort: sortColumn.trim()
        ? [{ column: sortColumn.trim(), direction: sortDirection }]
        : [],
      outputEncoding: encoding,
      spreadsheetSafe,
    };
  }, [
    rename,
    order,
    trim,
    dedupeKeys,
    dedupeMode,
    sortColumn,
    sortDirection,
    encoding,
    spreadsheetSafe,
  ]);

  const refresh = useCallback(async () => {
    try {
      const data = await json<{ jobs: Job[] }>(
        await fetch('/api/csv-jobs', { cache: 'no-store' }),
      );
      setJobs(data.jobs);
      setReady(true);
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : '履歴を読み込めませんでした。',
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (
      !jobs.some(
        (job) => job.status === 'processing' || job.status === 'accepted',
      )
    )
      return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  async function quote(selected: File, sample: boolean) {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('id', crypto.randomUUID());
      form.set('file', selected);
      form.set('sample', String(sample));
      form.set('specification', JSON.stringify(specification));
      const { job } = await json<{ job: Job }>(
        await fetch('/api/csv-jobs', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(60000),
        }),
      );
      setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
      if (sample) await accept(job, true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : '見積りを作成できませんでした。',
      );
    } finally {
      setBusy(false);
    }
  }

  async function accept(job: Job, sample = false) {
    setBusy(true);
    setError('');
    try {
      const { job: updated } = await json<{ job: Job }>(
        await fetch(`/api/csv-jobs/${job.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(60000),
          body: JSON.stringify({
            action: job.status === 'quality_failed' ? 'retry' : 'accept',
            revision: job.revision,
            paymentMethod: sample ? undefined : paymentMethod,
            paymentReference: sample ? undefined : paymentReference,
          }),
        }),
      );
      setJobs((items) => [
        updated,
        ...items.filter((item) => item.id !== updated.id),
      ]);
      router.push('/chat?tool=rockstar-csv-cleanup');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : '開始できませんでした。入力は保存されています。',
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(job: Job) {
    if (!window.confirm(`「${job.inputName}」と成果物を削除しますか？`)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/csv-jobs/${job.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) await json(response);
      setJobs((items) => items.filter((item) => item.id !== job.id));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '削除できませんでした。',
      );
    } finally {
      setBusy(false);
    }
  }

  const sample = new File(
    [
      'customer_id,name,note\r\n001, 佐藤 ,"改行\nあり"\r\n001,佐藤,重複\r\n002, 鈴木 ,=1+1\r\n',
    ],
    'sample.csv',
    { type: 'text/csv' },
  );
  return (
    <WorkspaceShell title="Sky · CSV仕事" hideTopActions>
      <div className={styles.page}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>最初の売れる仕事</p>
            <h1>CSVを、受注から納品まで</h1>
            <p>
              文字コード、列名・列順、空白、重複、並び順を指定どおりに整え、結果CSV・変更報告・独立検査をまとめます。
            </p>
          </div>
          <div className={styles.price}>
            <strong>¥3,000</strong>
            <span>税込 / 1ファイル</span>
            <small>条件・入金確認後24時間目安</small>
          </div>
        </header>

        <section className={styles.trust} aria-label="対応範囲">
          <span>
            <ShieldCheck size={18} /> 10MB・5万行・100列まで
          </span>
          <span>
            <FileCheck2 size={18} /> UTF-8 / BOM / CP932
          </span>
          <span>7日後は取得不可・順次削除</span>
        </section>

        {error && (
          <div className={styles.error} role="alert">
            {error}
            {!ready && (
              <a href="/signin-with-chatgpt?return_to=/csv" target="_top">
                サインイン
              </a>
            )}
          </div>
        )}

        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.step}>
              <span>1</span>
              <div>
                <h2>CSVと条件を入れる</h2>
                <p>
                  値の推測・補完・数値化はしません。指定した変換だけを順番に実行します。
                </p>
              </div>
            </div>
            <label className={styles.file}>
              <Upload size={22} />
              <strong>{file?.name ?? 'CSVを選ぶ'}</strong>
              <span>1ファイル / 最大10MB</span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <div className={styles.fields}>
              <label>
                列名変更 <small>1行に 元の列名=新しい列名</small>
                <textarea
                  value={rename}
                  onChange={(event) => setRename(event.target.value)}
                  placeholder={'customer_id=顧客ID\nname=氏名'}
                />
              </label>
              <label>
                列順 <small>変更後の全列をカンマ区切り</small>
                <input
                  value={order}
                  onChange={(event) => setOrder(event.target.value)}
                  placeholder="顧客ID,氏名,note"
                />
              </label>
              <label>
                前後空白を除く列 <small>カンマ区切り</small>
                <input
                  value={trim}
                  onChange={(event) => setTrim(event.target.value)}
                  placeholder="氏名,note"
                />
              </label>
              <label>
                重複キー <small>未指定なら重複処理なし</small>
                <input
                  value={dedupeKeys}
                  onChange={(event) => setDedupeKeys(event.target.value)}
                  placeholder="顧客ID"
                />
              </label>
              <label>
                重複の扱い
                <select
                  value={dedupeMode}
                  onChange={(event) => setDedupeMode(event.target.value)}
                >
                  <option value="report_only">確認だけ（既定）</option>
                  <option value="first">先頭を残す</option>
                  <option value="last">末尾を残す</option>
                </select>
              </label>
              <label>
                並び替える列
                <input
                  value={sortColumn}
                  onChange={(event) => setSortColumn(event.target.value)}
                  placeholder="顧客ID"
                />
              </label>
              <label>
                並び順
                <select
                  value={sortDirection}
                  onChange={(event) =>
                    setSortDirection(event.target.value as 'asc' | 'desc')
                  }
                >
                  <option value="asc">昇順</option>
                  <option value="desc">降順</option>
                </select>
              </label>
              <label>
                出力文字コード
                <select
                  value={encoding}
                  onChange={(event) => setEncoding(event.target.value)}
                >
                  <option value="utf8-bom">UTF-8 BOM付き</option>
                  <option value="utf8">UTF-8</option>
                  <option value="cp932">CP932</option>
                </select>
              </label>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={spreadsheetSafe}
                onChange={(event) => setSpreadsheetSafe(event.target.checked)}
              />
              表計算ソフト向け安全版も別ファイルで作る（原本結果は変更しません）
            </label>
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={busy || !file}
                onClick={() => file && void quote(file, false)}
              >
                {busy ? '処理中…' : '¥3,000の見積りを作る'}
              </button>
              <button disabled={busy} onClick={() => void quote(sample, true)}>
                サンプルを完走
              </button>
            </div>
          </section>

          <aside className={styles.card}>
            <div className={styles.step}>
              <span>2</span>
              <div>
                <h2>入金確認後に開始</h2>
                <p>
                  外部市場の取引番号を受付に結びます。未確認の売上はWallet収益に数えません。
                </p>
              </div>
            </div>
            <label>
              確認した場所
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option>ココナラ</option>
                <option>銀行振込</option>
                <option>その他の契約済み経路</option>
              </select>
            </label>
            <label>
              取引・入金の照合番号
              <input
                value={paymentReference}
                maxLength={120}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder="例: 取引管理番号"
              />
            </label>
            <div className={styles.scope}>
              <h3>この価格に含むもの</h3>
              <ul>
                <li>CSV 1ファイルの整形</li>
                <li>結果CSV、変更報告、検査結果</li>
                <li>範囲内の修正1回</li>
              </ul>
              <p>
                複数ファイル結合、値の推測・補完、分析、外部サイトへの代理投稿は別見積りです。
              </p>
            </div>
          </aside>
        </div>

        <section className={styles.history}>
          <div className={styles.historyTitle}>
            <div>
              <h2>受付と納品</h2>
              <p>再読込しても状態と成果物を復元できます。</p>
            </div>
            <button onClick={() => void refresh()} disabled={busy}>
              <RefreshCw size={16} />
              再読込
            </button>
          </div>
          {!jobs.length && (
            <p className={styles.empty}>
              まだ受付はありません。まずサンプルで全工程を確認できます。
            </p>
          )}
          <div className={styles.jobs}>
            {jobs.map((job) => (
              <article key={job.id} className={styles.job}>
                <div className={styles.jobHead}>
                  <div>
                    <strong>{job.inputName}</strong>
                    <code>{job.id}</code>
                  </div>
                  <span data-status={job.status}>
                    {statusLabel[job.status] ?? job.status}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>入力</dt>
                    <dd>
                      {(job.inputBytes / 1024).toFixed(1)}KB /{' '}
                      {job.inputEncoding}
                    </dd>
                  </div>
                  <div>
                    <dt>料金</dt>
                    <dd>
                      {job.quoteMinor
                        ? `¥${(job.quoteMinor / 100).toLocaleString('ja-JP')}`
                        : 'サンプル ¥0'}
                    </dd>
                  </div>
                  <div>
                    <dt>保管期限</dt>
                    <dd>
                      {new Date(job.expiresAt).toLocaleDateString('ja-JP')}
                    </dd>
                  </div>
                </dl>
                {job.status === 'quoted' && job.paymentStatus !== 'sample' && (
                  <button
                    className={styles.primary}
                    disabled={busy || paymentReference.trim().length < 4}
                    onClick={() => void accept(job)}
                  >
                    入金確認済みとして開始
                  </button>
                )}
                {job.status === 'quality_failed' && (
                  <button
                    disabled={busy || job.attempt >= 3}
                    onClick={() =>
                      void accept(job, job.paymentStatus === 'sample')
                    }
                  >
                    安全に再試行（{job.attempt}/3）
                  </button>
                )}
                {job.status === 'completed' && (
                  <div className={styles.downloads}>
                    {job.artifacts.map((kind) => (
                      <a
                        key={kind}
                        href={`/api/csv-jobs/${job.id}/artifact/${kind}`}
                      >
                        <Download size={15} />
                        {
                          {
                            result: '結果CSV',
                            'spreadsheet-safe': '表計算向け安全版',
                            'report-json': '検査JSON',
                            'report-html': '作業報告HTML',
                          }[kind]
                        }
                      </a>
                    ))}
                  </div>
                )}
                <button
                  className={styles.delete}
                  disabled={busy}
                  onClick={() => void remove(job)}
                >
                  <Trash2 size={15} />
                  ファイルと記録を今すぐ削除
                </button>
              </article>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <p>
            月額利用料は、JST月内のProvider確認済み純入金が30
            USD相当以上の利用者だけ8.88
            USD。未達月は0、繰越債務なし。市場手数料・税・返金は先に差し引きます。
          </p>
          <Link href="/csv/terms">取引条件・プライバシー・返金</Link>
        </footer>
      </div>
    </WorkspaceShell>
  );
}
