'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Download, PauseCircle, PlayCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import styles from './csv-business-workspace.module.css';

type OpsJob = {
  id: string; ownerHash: string; status: string; paymentStatus: string;
  sellerId: string; channel: string; inputBytes: number; inputSha256: string;
  outputSha256: string | null; attempt: number; deliveryRevision: number;
  errorCode: string | null; quoteMinor: number; currency: string;
  expiresAt: number; createdAt: number; updatedAt: number; revision: number;
  dueAt: number | null; completedAt: number | null; ownerControlId: string;
  interventions: Array<{ action: string; noteDigest: string | null; createdAt: number }>;
  directCosts: Array<{ category: string; amountMinor: number; currency: string; evidenceDigest: string; actorHash: string; createdAt: number }>;
};
type PaymentEvent = {
  jobId: string; ownerHash: string; sellerId: string; provider: string;
  providerEventId: string; relatedProviderEventId: string | null;
  relatedEventType: string | null; type: string;
  amountMinor: number; currency: string; occurredAt: number;
  evidenceDigest: string; source: string;
};
type IntakeControl = {
  scopeType: 'owner' | 'seller'; scopeId: string; acceptingNew: boolean;
  pausedReason: string | null; revision: number; updatedAt: number;
};
type Snapshot = {
  intake: { acceptingNew: boolean; pausedReason: string | null; revision: number };
  jobs: OpsJob[]; paymentEvents: PaymentEvent[];
  fees: Array<Record<string, unknown>>;
  scopedIntakeControls: IntakeControl[];
  directCosts: Array<{ jobId: string; category: string; amountMinor: number; currency: string; evidenceDigest: string; actorHash: string; createdAt: number }>;
};

async function json<T>(response: Response) {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '操作できませんでした。');
  return data;
}

function currentJstMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  return (parts.find((part) => part.type === 'year')?.value ?? '') +
    '-' + (parts.find((part) => part.type === 'month')?.value ?? '');
}

export default function CsvOperationsWorkspace() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [pauseReason, setPauseReason] = useState('');
  const [month, setMonth] = useState(currentJstMonth);
  const [manualJob, setManualJob] = useState('');
  const [provider, setProvider] = useState('');
  const [eventType, setEventType] = useState('buyer_paid');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('JPY');
  const [evidence, setEvidence] = useState('');
  const [relatedEvent, setRelatedEvent] = useState('');
  const [intervention, setIntervention] = useState('quality_review');
  const [scopeType, setScopeType] = useState<'owner' | 'seller'>('owner');
  const [scopeId, setScopeId] = useState('');
  const [scopeReason, setScopeReason] = useState('');
  const [costJob, setCostJob] = useState('');
  const [costCategory, setCostCategory] = useState('compute');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState('USD');
  const [costEvidence, setCostEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const verifiedEvents = useMemo(
    () => data?.paymentEvents.filter((event) => event.jobId === manualJob) ?? [],
    [data, manualJob],
  );
  const scopeOptions = useMemo(() => {
    if (!data) return [] as Array<{ id: string; label: string }>;
    if (scopeType === 'owner') {
      const owners = new Map(data.jobs.map((job) => [job.ownerControlId, job.ownerHash]));
      for (const control of data.scopedIntakeControls)
        if (control.scopeType === 'owner' && !owners.has(control.scopeId))
          owners.set(control.scopeId, control.scopeId.slice(0, 12));
      return [...owners].filter(([id]) => Boolean(id)).map(([id, label]) => ({ id, label: `利用者 ${label}` }));
    }
    const sellers = new Set(data.jobs.map((job) => job.sellerId));
    for (const control of data.scopedIntakeControls)
      if (control.scopeType === 'seller') sellers.add(control.scopeId);
    return [...sellers].map((id) => ({ id, label: `売主 ${id}` }));
  }, [data, scopeType]);
  const effectiveScopeId = scopeOptions.some((option) => option.id === scopeId)
    ? scopeId
    : scopeOptions[0]?.id ?? '';
  const selectedControl = data?.scopedIntakeControls.find(
    (control) => control.scopeType === scopeType && control.scopeId === effectiveScopeId,
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/csv-operations', { cache: 'no-store' });
      setData(await json<Snapshot>(response));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '運営画面を読み込めませんでした。');
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function action(payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await json(await fetch('/api/csv-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), ...payload }),
      }));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '運営操作を保存できませんでした。');
    } finally { setBusy(false); }
  }
  async function recordPayment(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    await action({
      action: 'manual_payment', jobId: manualJob, provider, type: eventType,
      amountMinor: Number(amount), currency,
      relatedProviderEventId: relatedEvent || undefined,
      relatedEventType: verifiedEvents.find((item) => item.providerEventId === relatedEvent)?.type,
      evidenceReference: evidence, idempotencyKey: crypto.randomUUID(),
    });
    setEvidence('');
  }
  async function recordCost(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    await action({
      action: 'direct_cost',
      jobId: costJob,
      category: costCategory,
      amountMinor: Number(costAmount),
      currency: costCurrency,
      evidenceReference: costEvidence,
    });
    setCostEvidence('');
  }

  return (
    <WorkspaceShell title="CSV運営" hideTopActions>
      <main className={styles.page}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>限定運営者画面</p>
            <h1>CSV受付・入金・介入</h1>
            <p>顧客ファイルの閲覧なしで、受付停止、照合台帳、月額判定、介入ログを扱います。</p>
          </div>
          <div className={styles.price}>
            <strong><ShieldAlert size={28} /></strong>
            <span>{data ? (data.intake.acceptingNew ? '新規受付中' : '新規受付停止中') : '認証を確認中'}</span>
            <small>認証と no-store を必須にしています</small>
          </div>
        </header>
        {error && <div className={styles.error} role="alert">{error}</div>}

        <section className={styles.card}>
          <div className={styles.historyTitle}>
            <div><h2>全体の制御</h2><p>変更は運営監査ログへ記録されます。</p></div>
            <button onClick={() => void refresh()} disabled={busy}><RefreshCw size={16} /> 再読込</button>
          </div>
          {data && (
            <>
              <p>新規受付: <strong>{data.intake.acceptingNew ? '受付中' : '停止中'}</strong> · revision {data.intake.revision}</p>
              {data.intake.pausedReason && <p>停止理由: {data.intake.pausedReason}</p>}
              <div className={styles.actions}>
                {data.intake.acceptingNew ? (
                  <button disabled={busy || pauseReason.trim().length < 4} onClick={() => void action({ action: 'pause_intake', reason: pauseReason, revision: data.intake.revision })}>
                    <PauseCircle size={16} /> 理由付きで新規受付を停止
                  </button>
                ) : (
                  <button className={styles.primary} disabled={busy} onClick={() => void action({ action: 'resume_intake', revision: data.intake.revision })}>
                    <PlayCircle size={16} /> 新規受付を再開
                  </button>
                )}
              </div>
              {data.intake.acceptingNew && <label>停止理由<input value={pauseReason} onChange={(event) => setPauseReason(event.target.value)} maxLength={240} /></label>}
            </>
          )}
        </section>

        <section className={styles.card}>
          <h2>利用者・売主ごとの新規受付停止</h2>
          <p>停止は新しいjobだけに適用します。受付済み・処理中の仕事は続行します。利用者IDは表示せず、短いハッシュで識別します。</p>
          <div className={styles.fields}>
            <label>停止範囲<select value={scopeType} onChange={(event) => { setScopeType(event.target.value as 'owner' | 'seller'); setScopeId(''); }}><option value="owner">利用者</option><option value="seller">売主</option></select></label>
            <label>対象<select value={effectiveScopeId} onChange={(event) => setScopeId(event.target.value)}><option value="">対象を選択</option>{scopeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          </div>
          <p>状態: <strong>{selectedControl?.acceptingNew === false ? '停止中' : '受付中'}</strong>{selectedControl?.pausedReason ? ` · ${selectedControl.pausedReason}` : ''} · revision {selectedControl?.revision ?? 0}</p>
          {selectedControl?.acceptingNew === false ? (
            <button disabled={busy || !effectiveScopeId} onClick={() => void action({ action: 'resume_scope', scopeType, scopeId: effectiveScopeId, revision: selectedControl.revision })}>この範囲を再開</button>
          ) : (
            <div className={styles.actions}><label>停止理由<input value={scopeReason} onChange={(event) => setScopeReason(event.target.value)} maxLength={240} /></label><button disabled={busy || !effectiveScopeId || scopeReason.trim().length < 4} onClick={() => void action({ action: 'pause_scope', scopeType, scopeId: effectiveScopeId, revision: selectedControl?.revision ?? 0, reason: scopeReason })}>この範囲を停止</button></div>
          )}
        </section>

        <section className={styles.card}>
          <h2>月次利用料判定</h2>
          <p>Provider確認済みの本人向け払出しから、紐づく返金を控除します。手動の払出し額は月額判定を増やせず、根拠を照合した手動返金だけが減額方向に反映されます。為替換算が未設定の額は要確認です。ここでは判定記録のみを作り、請求や控除は実行しません。</p>
          <div className={styles.actions}>
            <label>JST年月<input value={month} onChange={(event) => setMonth(event.target.value)} placeholder="YYYY-MM" /></label>
            <button className={styles.primary} disabled={busy} onClick={() => void action({ action: 'reconcile_month', monthJst: month })}>判定を作成・更新</button>
            <button type="button" onClick={() => window.location.assign('/api/csv-operations/export')}>
              <Download size={16} /> 運営記録をJSON出力
            </button>
          </div>
          <div className={styles.jobs}>
            {data?.fees.map((fee, index) => (
              <article key={String(fee.month_jst) + String(fee.billing_account_id) + index} className={styles.job}>
                <strong>{String(fee.month_jst)} · {String(fee.status)}</strong>
                <p>
                  純入金: {fee.verified_net_usd_minor === null ? '要確認' : '$' + (Number(fee.verified_net_usd_minor) / 100).toFixed(2)}
                  {' · 利用料: '}{fee.fee_due_usd_minor === null || fee.fee_due_usd_minor === undefined ? '要確認' : '$' + (Number(fee.fee_due_usd_minor) / 100).toFixed(2)}
                  {' · '}{String(fee.reason)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <h2>運営者による入金・返金記録</h2>
          <p>照合根拠の本文は保存せずハッシュのみ保持します。手動の払出し記録はProvider売上になりません。注文返金・取消・争議はbuyer paymentに紐づけ、payout調整の返金とは分けます。</p>
          <form className={styles.fields} onSubmit={(event) => void recordPayment(event)}>
            <label>受付ID<select required value={manualJob} onChange={(event) => setManualJob(event.target.value)}>
              <option value="">受付を選択</option>
              {data?.jobs.map((job) => <option value={job.id} key={job.id}>{job.id} · {job.status} · {job.ownerHash}</option>)}
            </select></label>
            <label>Providerまたは市場名<input required value={provider} onChange={(event) => setProvider(event.target.value)} maxLength={40} /></label>
            <label>イベント種別<select value={eventType} onChange={(event) => setEventType(event.target.value)}>
              {['buyer_paid', 'payment_failed', 'payout_available', 'payout_started', 'paid_to_owner', 'provider_fee', 'refund', 'disputed', 'payout_failed', 'canceled'].map((type) => <option key={type}>{type}</option>)}
            </select></label>
            <label>金額（最小単位）<input required type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <label>通貨<input required value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} /></label>
            {['refund', 'disputed', 'canceled'].includes(eventType) && <label>元イベントID<select required value={relatedEvent} onChange={(event) => setRelatedEvent(event.target.value)}>
              <option value="">関連イベントを選択</option>
              {verifiedEvents.filter((item) => eventType === 'refund' ? ['buyer_paid', 'paid_to_owner'].includes(item.type) : item.type === 'buyer_paid').map((item) => <option key={item.providerEventId} value={item.providerEventId}>{item.provider}:{item.providerEventId} · {item.type} · {item.amountMinor} {item.currency}</option>)}
            </select></label>}
            <label>照合根拠<input required value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={1000} placeholder="市場画面等で確認した記録。本文はハッシュ化されます" /></label>
            <button className={styles.primary} type="submit" disabled={busy || !manualJob}>運営者照合として記録</button>
          </form>
        </section>

        <section className={styles.card}>
          <h2>仕事別の直接費記録</h2>
          <p>確認根拠の本文は保存せずdigestのみ保持します。ここで記録した直接費は月額の30 USD判定からまだ控除しません。</p>
          <form className={styles.fields} onSubmit={(event) => void recordCost(event)}>
            <label>受付ID<select required value={costJob} onChange={(event) => setCostJob(event.target.value)}><option value="">受付を選択</option>{data?.jobs.map((job) => <option value={job.id} key={job.id}>{job.id} · {job.ownerHash}</option>)}</select></label>
            <label>費用区分<select value={costCategory} onChange={(event) => setCostCategory(event.target.value)}>{['manual_labor', 'compute', 'storage', 'provider_fee', 'support', 'other'].map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>金額（最小単位）<input required type="number" min="1" step="1" value={costAmount} onChange={(event) => setCostAmount(event.target.value)} /></label>
            <label>通貨<input required value={costCurrency} onChange={(event) => setCostCurrency(event.target.value.toUpperCase())} maxLength={3} /></label>
            <label>照合根拠<input required value={costEvidence} onChange={(event) => setCostEvidence(event.target.value)} maxLength={1000} /></label>
            <button className={styles.primary} type="submit" disabled={busy || !costJob}>直接費を記録</button>
          </form>
          <div className={styles.jobs}>{data?.directCosts.map((cost, index) => <article className={styles.job} key={`${cost.jobId}:${cost.createdAt}:${index}`}><strong>{cost.jobId} · {cost.category}</strong><p>{cost.amountMinor} {cost.currency} · evidence {cost.evidenceDigest.slice(0, 12)}… · {new Date(cost.createdAt).toLocaleString('ja-JP')}</p></article>)}</div>
        </section>

        <section className={styles.history}>
          <div className={styles.historyTitle}><div><h2>最近の受付</h2><p>顧客ファイルとファイル名はこの一覧に表示しません。</p></div></div>
          <div className={styles.jobs}>
            {data?.jobs.map((job) => (
              <article className={styles.job} key={job.id}>
                <div className={styles.jobHead}>
                  <div><strong>{job.id}</strong><code>owner {job.ownerHash} · {job.channel}</code></div>
                  <span data-status={job.status}>{job.status}</span>
                </div>
                <dl>
                  <div><dt>支払</dt><dd>{job.paymentStatus}</dd></div>
                  <div><dt>試行</dt><dd>{job.attempt}/3</dd></div>
                  <div><dt>版</dt><dd>{job.deliveryRevision}</dd></div>
                  <div><dt>失敗</dt><dd>{job.errorCode ?? 'なし'}</dd></div>
                  <div><dt>納期</dt><dd>{job.dueAt ? `${new Date(job.dueAt).toLocaleString('ja-JP')} · ${job.completedAt ? '完了' : '未完了'}` : '受注前'}</dd></div>
                </dl>
                {job.interventions.length > 0 && <p>最近の介入: {job.interventions.map((item) => `${item.action} (${new Date(item.createdAt).toLocaleString('ja-JP')})`).join(' · ')}</p>}
                {job.directCosts.length > 0 && <p>直接費記録: {job.directCosts.map((item) => `${item.category} ${item.amountMinor} ${item.currency}`).join(' · ')}</p>}
                <div className={styles.actions}>
                  <select aria-label="介入内容" value={intervention} onChange={(event) => setIntervention(event.target.value)}>
                    <option value="quality_review">品質確認</option>
                    <option value="customer_contacted">顧客連絡済み</option>
                    <option value="provider_followup">Provider確認</option>
                    <option value="payment_review">入金確認</option>
                    <option value="privacy_review">プライバシー確認</option>
                  </select>
                  <button disabled={busy} onClick={() => void action({ action: 'intervene', jobId: job.id, intervention })}>介入を記録</button>
                  {job.status === 'quality_failed' && <button disabled={busy || job.attempt >= 3} onClick={() => void action({ action: 'retry', jobId: job.id, revision: job.revision })}>運営再試行</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.card}>
          <h2>Providerイベント (最新100件)</h2>
          <div className={styles.jobs}>
            {data?.paymentEvents.map((event, index) => (
              <article className={styles.job} key={event.provider + event.providerEventId + index}>
                <strong>{event.provider} · {event.type} · {event.amountMinor} {event.currency}</strong>
                <p>受付 {event.jobId} · owner {event.ownerHash} · source {event.source} · event {event.providerEventId}</p>
                {event.relatedProviderEventId && <p>元イベント: {event.relatedProviderEventId}</p>}
              </article>
            ))}
          </div>
        </section>
        <p className={styles.footer}>未設定のProvider/Webhook secretでは自動照合は動作しません。運営者allowlistも初期状態では未設定です。</p>
      </main>
    </WorkspaceShell>
  );
}
