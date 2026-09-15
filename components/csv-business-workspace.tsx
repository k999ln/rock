'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Clipboard,
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
  approvedAt: number | null;
  deliveryRevision: number;
  revisionReason: string | null;
  specification: unknown;
  artifacts: string[];
};
type BillingAccount = {
  status: string;
  cancelAtMonth: string | null;
  monthlyFeeEnabled: boolean;
};

const statusLabel: Record<string, string> = {
  quoted: '見積り確認待ち',
  accepted: '受付済み',
  processing: '処理中',
  delivered: '検査合格・納品済み',
  approved: '顧客検収済み',
  revision_requested: '顧客の修正依頼・販売者確認待ち',
  canceled: '取り消し',
  quality_failed: '検査不合格・再試行待ち',
};
const paymentLabels: Record<string, string> = {
  sample: 'サンプル',
  unpaid: '運営者照合待ち',
  payment_failed: '支払い失敗',
  paid_by_buyer: 'Provider確認済み・購入者支払',
  available: 'Provider確認済み・利用可能',
  payout_pending: 'Provider確認済み・払出し待ち',
  paid_to_owner: 'Provider確認済み・本人向け払出し',
  manual_verified: '運営者照合済み（Provider収益には不算入）',
  payout_failed: '払出し失敗',
  partially_refunded: '一部返金',
  refunded: '返金済み',
  disputed: '異議申立て',
  canceled: '支払い取消',
};
const processingPaymentStatuses = new Set([
  'paid_by_buyer',
  'available',
  'payout_pending',
  'paid_to_owner',
  'manual_verified',
]);
const formatMoney = (minorUnits: number, currency: string) => {
  const digits = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minorUnits / 10 ** digits);
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
  const [revisionSpecs, setRevisionSpecs] = useState<Record<string, string>>({});
  const [shareLinks, setShareLinks] = useState<
    Record<string, { url: string; expiresAt: number }>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [billing, setBilling] = useState<BillingAccount | null>(null);
  const [billingError, setBillingError] = useState('');

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

  const refreshBilling = useCallback(async () => {
    try {
      setBilling(await json<BillingAccount>(await fetch('/api/csv-account', { cache: 'no-store' })));
      setBillingError('');
    } catch (cause) {
      setBillingError(cause instanceof Error ? cause.message : 'アカウント状態を読み込めませんでした。');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refreshBilling(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshBilling]);
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

  async function quote(selected: File) {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('id', crypto.randomUUID());
      form.set('file', selected);
      form.set('specification', JSON.stringify(specification));
      const { job } = await json<{ job: Job }>(
        await fetch('/api/csv-jobs', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(60000),
        }),
      );
      setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
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

  async function sample() {
    setBusy(true);
    setError('');
    try {
      const { job } = await json<{ job: Job }>(
        await fetch('/api/csv-jobs/sample', {
          method: 'POST',
          signal: AbortSignal.timeout(60000),
        }),
      );
      setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'サンプルを実行できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function accept(job: Job) {
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
          }),
        }),
      );
      setJobs((items) => [
        updated,
        ...items.filter((item) => item.id !== updated.id),
      ]);
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

  async function share(job: Job, action: 'create' | 'revoke') {
    setBusy(true);
    setError('');
    try {
      const result = await json<{ url?: string; expiresAt?: number; revoked?: number }>(
        await fetch('/api/csv-jobs/' + job.id + '/delivery-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: action === 'revoke' ? 'revoke' : 'create' }),
        }),
      );
      if (result.url && Number.isSafeInteger(result.expiresAt)) {
        const url = new URL(result.url, window.location.origin).toString();
        setShareLinks((current) => ({
          ...current,
          [job.id]: { url, expiresAt: result.expiresAt as number },
        }));
        await navigator.clipboard.writeText(url);
      } else {
        setShareLinks((current) => {
          const next = { ...current };
          delete next[job.id];
          return next;
        });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '共有リンクを更新できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function applyRevision(job: Job) {
    setBusy(true);
    setError('');
    try {
      const raw = revisionSpecs[job.id] ?? JSON.stringify(job.specification, null, 2);
      let revisedSpecification: unknown;
      try {
        revisedSpecification = JSON.parse(raw);
      } catch {
        throw new Error('修正条件は有効なJSONにしてください。');
      }
      const { job: updated } = await json<{ job: Job }>(
        await fetch('/api/csv-jobs/' + job.id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(60000),
          body: JSON.stringify({
            action: 'apply_revision',
            revision: job.revision,
            specification: revisedSpecification,
          }),
        }),
      );
      setJobs((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '修正を開始できませんでした。');
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

  async function cancel(job: Job) {
    const reason = window.prompt('取り消し理由を4文字以上で入力してください。');
    if (reason === null) return;
    if (reason.trim().length < 4) {
      setError('取り消し理由を4文字以上で入力してください。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { job: updated } = await json<{ job: Job }>(
        await fetch(`/api/csv-jobs/${job.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cancel',
            revision: job.revision,
            reason,
          }),
        }),
      );
      setJobs((items) => [updated, ...items.filter((item) => item.id !== updated.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取り消せませんでした。');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancelBilling() {
    if (!window.confirm('月額利用料の新規判定と、翌JST月以降の新規受付を停止します。現在の受付済み案件は続行できます。')) return;
    setBusy(true);
    setBillingError('');
    try {
      const { result } = await json<{ result: BillingAccount }>(await fetch('/api/csv-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_next_month', idempotencyKey: crypto.randomUUID() }),
      }));
      setBilling(result);
    } catch (cause) {
      setBillingError(cause instanceof Error ? cause.message : '翌月停止を保存できませんでした。');
      await refreshBilling();
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceShell title="CSV仕事" hideTopActions>
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
              <Link href="/signin-with-chatgpt?return_to=/csv" target="_top">
                サインイン
              </Link>
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
                onClick={() => file && void quote(file)}
              >
                {busy ? '処理中…' : '¥3,000の見積りを作る'}
              </button>
              <button disabled={busy} onClick={() => void sample()}>
                サンプルを完走
              </button>
            </div>
          </section>

          <aside className={styles.card}>
            <div className={styles.step}>
              <span>2</span>
              <div>
                <h2>Providerまたは運営者の照合後に開始</h2>
                <p>
                  利用者が自己申告しただけでは開始できません。Provider eventまたは運営者による照合が必要です。手動照合は月額収益のProvider証拠には数えません。
                </p>
              </div>
            </div>
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
                        ? formatMoney(job.quoteMinor, job.currency)
                        : 'サンプル ¥0'}
                    </dd>
                  </div>
                  <div>
                    <dt>保管期限</dt>
                    <dd>
                      {new Date(job.expiresAt).toLocaleDateString('ja-JP')}
                    </dd>
                  </div>
                  <div>
                    <dt>入金状態</dt>
                    <dd>{paymentLabels[job.paymentStatus] ?? job.paymentStatus}</dd>
                  </div>
                </dl>
                {job.status === 'quoted' &&
                  job.paymentStatus !== 'sample' &&
                  processingPaymentStatuses.has(job.paymentStatus) && (
                  <button
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => void accept(job)}
                  >
                    照合済みの入金で作業を開始
                  </button>
                )}
                {job.status === 'quality_failed' && (
                  <button
                    disabled={busy || job.attempt >= 3 || (job.paymentStatus !== 'sample' && !processingPaymentStatuses.has(job.paymentStatus))}
                    onClick={() => void accept(job)}
                  >
                    安全に再試行（{job.attempt}/3）
                  </button>
                )}
                {['quoted', 'quality_failed'].includes(job.status) &&
                  ['sample', 'unpaid', 'payment_failed', 'refunded', 'canceled'].includes(job.paymentStatus) && (
                    <button disabled={busy} onClick={() => void cancel(job)}>
                      この受付を取り消す
                    </button>
                  )}
                {job.status === 'revision_requested' && (
                  <div className={styles.scope}>
                    <h3>顧客の修正依頼</h3>
                    <p>{job.revisionReason ?? '理由は記録されていません。'}</p>
                    <label>
                      条件内修正の仕様
                      <textarea
                        rows={9}
                        value={revisionSpecs[job.id] ?? JSON.stringify(job.specification, null, 2)}
                        onChange={(event) => setRevisionSpecs((current) => ({ ...current, [job.id]: event.target.value }))}
                      />
                    </label>
                    <button className={styles.primary} disabled={busy} onClick={() => void applyRevision(job)}>
                      内容を確認して修正版を作成
                    </button>
                  </div>
                )}
                {['delivered', 'approved'].includes(job.status) && (
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
                {['delivered', 'approved'].includes(job.status) && (
                  <div className={styles.scope}>
                    <h3>顧客へ納品・検収依頼</h3>
                    <p>共有リンクを別の連絡手段で渡してください。自動送信はしません。市場経由の注文では市場規約と公式納品方法を優先してください。</p>
                    <div className={styles.actions}>
                      <button disabled={busy} onClick={() => void share(job, 'create')}>
                        <Clipboard size={15} /> 期限付きリンクを作成・コピー
                      </button>
                      <button disabled={busy} onClick={() => void share(job, 'revoke')}>共有リンクを無効化</button>
                    </div>
                    {shareLinks[job.id] && <small>有効期限: {new Date(shareLinks[job.id].expiresAt).toLocaleString('ja-JP')} · 新しいリンクを作ると以前のリンクは無効になります。</small>}
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

        <section className={styles.card}>
          <h2>アカウント管理</h2>
          <p>
            {billing?.cancelAtMonth
              ? `月額利用料の新規判定・受付停止予定: ${billing.cancelAtMonth}（JST）。受付済み案件は続行できます。`
              : '月額利用料の請求は現在無効です。停止を設定すると翌JST月から新規受付を停止します。受付済み案件は続行できます。'}
          </p>
          {billingError && <p role="alert">{billingError}</p>}
          {!billing?.cancelAtMonth && <button disabled={busy || !billing} onClick={() => void cancelBilling()}>翌JST月から停止を予約</button>}
          <Link href="/api/csv-account/export">自分の仕事・入出金・履歴データをJSON出力</Link>
          <p>保存済みファイル本体は出力JSON内の本人認証付きリンクから取得できます。保管期限切れ後の内容は含まれません。</p>
        </section>

        <footer className={styles.footer}>
          <p>
            月額利用料は未請求です。試験判定はJST月のProvider確認済み本人向け払出しから紐づく返金を差し引き、30
            USD相当以上なら8.88 USD、未達は0です。実Providerの費用・為替対応と請求経路を確認するまで有効化しません。
          </p>
          <Link href="/csv/terms">取引条件・プライバシー・返金</Link>
          <Link href="/csv/operations">運営者画面</Link>
        </footer>
      </div>
    </WorkspaceShell>
  );
}
