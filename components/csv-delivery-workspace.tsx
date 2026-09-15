'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Download, FileCheck2, RefreshCw, RotateCcw } from 'lucide-react';
import styles from './csv-business-workspace.module.css';

type BuyerJob = {
  id: string;
  status: string;
  revision: number;
  deliveryRevision: number;
  expiresAt: number;
  approvedAt: number | null;
};
type Delivery = {
  specification: unknown;
  outputSha256: string;
  validation: { passed?: boolean };
  status: string;
  deliveredAt: number;
  artifacts: string[];
};
type PageData = { job: BuyerJob; delivery: Delivery };

const labels: Record<string, string> = {
  delivered: '内容をご確認ください',
  approved: '検収済み',
  revision_requested: '修正依頼を受け付けました',
  accepted: '修正版を準備しています',
  processing: '修正版を準備しています',
  quality_failed: '修正処理を確認中です',
};
const artifactLabels: Record<string, string> = {
  result: '結果CSV',
  'spreadsheet-safe': '表計算向け安全版',
  'report-json': '検査JSON',
  'report-html': '作業報告HTML',
};

async function json<T>(response: Response) {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '処理できませんでした。');
  return data;
}

export default function CsvDeliveryWorkspace() {
  const [token, setToken] = useState('');
  const [page, setPage] = useState<PageData | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (value) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
    const timer = window.setTimeout(() => {
      if (value) setToken(value);
      else {
        setError('共有リンクに認証情報がありません。販売者へ新しいリンクをご依頼ください。');
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const id = window.location.pathname.split('/').at(-1) ?? '';
    try {
      const data = await json<PageData>(
        await fetch('/api/csv-delivery/' + encodeURIComponent(id), {
          headers: { Authorization: 'Bearer ' + token },
          cache: 'no-store',
        }),
      );
      setPage(data);
      setError('');
      setReady(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '納品を読み込めませんでした。');
      setReady(true);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, token]);
  useEffect(() => {
    if (!page || !['revision_requested', 'accepted', 'processing', 'quality_failed'].includes(page.job.status))
      return;
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [page, refresh]);

  async function act(action: 'approve' | 'revision') {
    if (!page || !token) return;
    if (action === 'revision' && reason.trim().length < 4) {
      setError('修正箇所と理由を4文字以上で入力してください。');
      return;
    }
    if (action === 'approve' && !window.confirm('納品内容を確認し、検収済みにしますか？'))
      return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/csv-delivery/' + encodeURIComponent(page.job.id), {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          revision: page.job.revision,
          ...(action === 'revision' ? { reason } : {}),
        }),
      });
      await json<{ job: BuyerJob }>(response);
      setReason('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作を保存できませんでした。');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function download(kind: string) {
    if (!page || !token) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        '/api/csv-delivery/' +
          encodeURIComponent(page.job.id) +
          '/artifact/' +
          encodeURIComponent(kind),
        { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' },
      );
      if (!response.ok) await json(response);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download =
        ({
          result: 'result.csv',
          'spreadsheet-safe': 'spreadsheet-safe.csv',
          'report-json': 'report.json',
          'report-html': 'report.html',
        } as Record<string, string>)[kind] ?? 'download';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ダウンロードできませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>CSV納品ページ</p>
          <h1>納品内容をご確認ください</h1>
          <p>期限付きbearer capability URLです。URLを持つ人は取得・操作できますが、買主の本人確認やidentity bindingは行いません。転送せず、本人確認が必要なら市場の公式納品経路を使ってください。</p>
        </div>
        <div className={styles.price}>
          <strong><FileCheck2 size={28} /></strong>
          <span>納品・検査記録</span>
          <small>第三者への転送にご注意ください</small>
        </div>
      </header>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {!ready && !error && <p>納品内容を確認しています…</p>}
      {page && (
        <section className={styles.card}>
          <div className={styles.jobHead}>
            <div>
              <h2>受付 {page.job.id}</h2>
              <p>納品版 v{page.job.deliveryRevision} · 期限 {new Date(page.job.expiresAt).toLocaleDateString('ja-JP')}</p>
            </div>
            <span data-status={page.job.status}>{labels[page.job.status] ?? page.job.status}</span>
          </div>
          <div className={styles.trust}>
            <span><Check size={18} /> 独立検査 {page.delivery.validation?.passed ? '合格' : '要確認'}</span>
            <span>出力 SHA-256: {page.delivery.outputSha256.slice(0, 16)}…</span>
          </div>
          <div className={styles.downloads}>
            {page.delivery.artifacts.map((kind) => (
              <button key={kind} disabled={busy} onClick={() => void download(kind)}>
                <Download size={15} />
                {artifactLabels[kind] ?? kind}
              </button>
            ))}
          </div>
          {page.job.status === 'delivered' && (
            <div className={styles.scope}>
              <h3>確認後に選択してください</h3>
              <p>納品物と変更報告をご確認ください。検収前の条件内修正は1回まで依頼できます。</p>
              {page.job.deliveryRevision < 2 && (
                <label>
                  修正箇所・理由 <small>4〜1,000文字。販売者が内容を確認してから修正版を作成します。</small>
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
                </label>
              )}
              <div className={styles.actions}>
                {page.job.deliveryRevision < 2 && (
                  <button disabled={busy || reason.trim().length < 4} onClick={() => void act('revision')}>
                    <RotateCcw size={16} /> 修正を依頼
                  </button>
                )}
                <button className={styles.primary} disabled={busy} onClick={() => void act('approve')}>
                  <Check size={16} /> 確認して検収
                </button>
              </div>
            </div>
          )}
          {page.job.status === 'revision_requested' && <p>修正依頼を販売者へ記録しました。内容確認後に修正版が届きます。</p>}
          {page.job.status === 'approved' && <p>検収を記録しました。ありがとうございました。</p>}
          {['accepted', 'processing', 'quality_failed'].includes(page.job.status) && (
            <button onClick={() => void refresh()} disabled={busy}>
              <RefreshCw size={16} /> 状態を再読込
            </button>
          )}
        </section>
      )}
      <footer className={styles.footer}>
        <p>URL保有者がアクセスできます。共有URLは買主本人の認証ではありません。第三者へ転送せず、保管期限を過ぎたファイルは取得できません。</p>
      </footer>
    </main>
  );
}
