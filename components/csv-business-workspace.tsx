'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePendingSaveNavigation } from '@/components/use-pending-save-navigation';
import { pendingOwnerStatus, isDefinitivePendingSaveFailure } from '@/lib/pending-owner-intent';
import { readOwnerScope, OWNER_SCOPE_HEADER, OWNER_CHANGED, OWNER_CHECK_REQUIRED, OWNER_CHANGED_MESSAGE } from '@/lib/owner-intent';
import { OperationRequestError, OperationResponseError, readOperationResponse as json } from '@/lib/operations-client';
import { isCsvClientJob, isCsvHistory, isCsvBilling, type CsvClientJob as Job, type CsvBillingAccount as BillingAccount } from '@/lib/csv-job-view';
import { createCsvHistoryRequest } from '@/lib/csv-history-request';
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

type PendingQuote = { id: string; ownerScope: string; file: File; specification: string };

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

const columns = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export default function CsvBusinessWorkspace({ workspace = false }: { workspace?: boolean }) {
  const returnTo = workspace ? '/zema/tools/rockstar-csv-cleanup' : '/csv';
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
  const [revisionSpecs, setRevisionSpecs] = useState<Map<string, string>>(new Map());
  const [shareLinks, setShareLinks] = useState<Map<string, { url: string; expiresAt: number }>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [billing, setBilling] = useState<BillingAccount | null>(null);
  const [billingError, setBillingError] = useState('');
  const [ownerScope, setOwnerScope] = useState<string | null>(null);
  const currentOwner = useRef<string | null>(null);
  const draftOwner = useRef<string | null>(null);
  const [draftOwnerScope, setDraftOwnerScope] = useState<string | null>(null);
  const draftVersion = useRef(0);
  const [draftRevision, setDraftRevision] = useState(0);
  const [pendingQuote, setPendingQuote] = useState<PendingQuote | null>(null);
  const quoteIntent = useRef<PendingQuote | null>(null);
  const billingIntent = useRef(new Map<string, { id: string }>());
  const historyRequest = useRef(createCsvHistoryRequest());
  const mutationBusy = useRef(false);
  const mounted = useRef(false);
  const [notice, setNotice] = useState('');
  const [needsSignin, setNeedsSignin] = useState(false);
  const hasDraft = Boolean(file || rename.trim() || order.trim() || trim.trim() || dedupeKeys.trim() ||
    dedupeMode !== 'report_only' || sortColumn.trim() || sortDirection !== 'asc' || encoding !== 'utf8-bom' ||
    !spreadsheetSafe || revisionSpecs.size);
  const hideDraft = hasDraft && draftOwnerScope !== ownerScope;
  const inputLocked = busy || !ready || hideDraft;
  usePendingSaveNavigation(hasDraft || Boolean(pendingQuote) || busy);
  const loseOwner = useCallback((signin = false) => {
    currentOwner.current = null;
    setOwnerScope(null); setReady(false); setJobs([]); setBilling(null);
    setShareLinks(new Map()); setNeedsSignin(signin);
  }, []);
  const reportError = useCallback((reason: unknown, fallback: string) => {
    if (reason instanceof OperationResponseError || reason instanceof OperationRequestError &&
        (reason.status === 401 || reason.code === OWNER_CHANGED)) {
      historyRequest.current.invalidate();
      loseOwner(reason instanceof OperationRequestError && reason.status === 401);
    }
    setError(reason instanceof Error ? reason.message : fallback);
  }, [loseOwner]);
  function editDraft(change: () => void) {
    const owner = currentOwner.current;
    if (mutationBusy.current || !mounted.current || !owner || owner !== ownerScope ||
        (hasDraft && draftOwner.current !== owner)) return;
    draftOwner.current = owner; setDraftOwnerScope(owner);
    draftVersion.current++; setDraftRevision(draftVersion.current);
    change();
  }
  function discardDraft() {
    if (mutationBusy.current || quoteIntent.current || draftVersion.current !== draftRevision ||
        !ownerScope || ownerScope !== currentOwner.current || draftOwner.current !== ownerScope) return;
    setFile(null); setRename(''); setOrder(''); setTrim(''); setDedupeKeys(''); setDedupeMode('report_only');
    setSortColumn(''); setSortDirection('asc'); setEncoding('utf8-bom'); setSpreadsheetSafe(true);
    setRevisionSpecs(new Map()); draftOwner.current = null; setDraftOwnerScope(null);
    draftVersion.current++; setDraftRevision(draftVersion.current);
    setError(''); setNotice('入力を破棄しました。保存済みの受付・成果・会計記録は変更していません。');
  }
  function releaseQuote() {
    if (mutationBusy.current || !pendingQuote || quoteIntent.current !== pendingQuote ||
        !ownerScope || ownerScope !== currentOwner.current || pendingQuote.ownerScope !== ownerScope) return;
    quoteIntent.current = null; setPendingQuote(null);
    setError(''); setNotice('保留を解除しました。保存済み履歴と入力を確認してから、新しい見積りを作成してください。');
  }

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

  const refresh = useCallback(async (preserveError = false) => {
    const request = historyRequest.current.begin();
    if (!request) return;
    try {
      const data = await json<unknown>(await fetch('/api/csv-jobs', { cache: 'no-store', redirect: 'manual', signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]) }));
      if (!request.current() || !mounted.current) return;
      if (!isCsvHistory(data)) throw new OperationResponseError('INVALID_RESPONSE');
      const scope = readOwnerScope(data.ownerScope);
      if (currentOwner.current !== scope) { setBilling(null); setShareLinks(new Map()); }
      currentOwner.current = scope; setOwnerScope(scope); setJobs(data.jobs); setReady(Boolean(scope)); setNeedsSignin(false);
      if (!preserveError) setError('');
      if (!scope) return;
      try {
        const account = await json<unknown>(await fetch('/api/csv-account', { cache: 'no-store', redirect: 'manual', signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]) }));
        if (!request.current() || !mounted.current) return;
        if (!isCsvBilling(account) || account.ownerScope !== scope) throw new OperationResponseError('INVALID_RESPONSE');
        setBilling(account); setBillingError('');
        if (account.cancelAtMonth) billingIntent.current.delete(scope);
      } catch (cause) {
        if (!request.current() || !mounted.current) return;
        setBilling(null); setBillingError('アカウント状態を確認できません。再読込してください。');
        reportError(cause, 'アカウント状態を読み込めませんでした。');
      }
    } catch (reason) {
      if (!request.current() || !mounted.current) return;
      loseOwner(); reportError(reason, '履歴を読み込めませんでした。');
    }
  }, [loseOwner, reportError]);
  useEffect(() => {
    const requests = historyRequest.current; mounted.current = true;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => { mounted.current = false; window.clearTimeout(timer); requests.invalidate(); };
  }, [refresh]);
  useEffect(() => {
    if (busy || !ready || !jobs.some(job => job.status === 'processing' || job.status === 'accepted')) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [jobs, refresh, busy, ready]);
  function beginMutation(expectedOwner = ownerScope, allowUnconfirmed = false) {
    if (mutationBusy.current || !mounted.current || !expectedOwner || (expectedOwner !== currentOwner.current && !(allowUnconfirmed && currentOwner.current === null))) return null;
    mutationBusy.current = true; setBusy(true); setError(''); setNotice('');
    const releaseHistory = historyRequest.current.mutate();
    let finished = false;
    return {
      owner: expectedOwner,
      current: () => mounted.current && currentOwner.current === expectedOwner,
      finish() { if (finished) return; finished = true; releaseHistory(); mutationBusy.current = false; if (mounted.current) setBusy(false); },
      async refresh() { releaseHistory(); await refresh(true); },
    };
  }
  async function confirmOwner(expected: string) {
    const data = await json<unknown>(await fetch('/api/csv-jobs', { cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10000) }));
    if (!mounted.current) return false;
    if (!isCsvHistory(data)) throw new OperationResponseError('INVALID_RESPONSE');
    const scope = readOwnerScope(data.ownerScope);
    if (currentOwner.current !== scope) { setBilling(null); setShareLinks(new Map()); }
    currentOwner.current = scope; setOwnerScope(scope); setJobs(data.jobs); setReady(Boolean(scope));
    if (!scope) throw new OperationRequestError(OWNER_CHECK_REQUIRED, 401);
    if (scope !== expected) throw new OperationRequestError(OWNER_CHANGED_MESSAGE, 409, OWNER_CHANGED);
    setNeedsSignin(false); return true;
  }
  function acceptJob(value: unknown, expectedId?: string) {
    if (!isCsvClientJob(value) || expectedId !== undefined && value.id !== expectedId) throw new OperationResponseError('INVALID_RESPONSE');
    setJobs(items => [value, ...items.filter(item => item.id !== value.id)]);
  }
  async function quote(selected: File) {
    if (!quoteIntent.current && (inputLocked || hasDraft && draftOwner.current !== currentOwner.current)) return;
    const existing = quoteIntent.current;
    // A retained quote can be checked after a failed authentication read, but
    // never rebound to the account that happens to be signed in now.
    if (existing && currentOwner.current && currentOwner.current !== existing.ownerScope) return;
    const expectedOwner = existing?.ownerScope ?? ownerScope;
    if (!expectedOwner || mutationBusy.current || !mounted.current) return;
    const mutation = beginMutation(expectedOwner, true);
    if (!mutation) return;
    const operation = existing ?? { id: crypto.randomUUID(), ownerScope: expectedOwner, file: selected, specification: JSON.stringify(specification) };
    quoteIntent.current = operation; setPendingQuote(operation);
    let dispatched = false;
    try {
      if (!await confirmOwner(operation.ownerScope) || !mutation.current()) return;
      const form = new FormData(); form.set('id', operation.id); form.set('file', operation.file); form.set('specification', operation.specification);
      dispatched = true;
      const result = await json<{ job: unknown }>(await fetch('/api/csv-jobs', { method: 'POST', body: form, redirect: 'manual', headers: { [OWNER_SCOPE_HEADER]: operation.ownerScope }, signal: AbortSignal.timeout(60000) }));
      if (!mutation.current()) return;
      acceptJob(result.job, operation.id); quoteIntent.current = null; setPendingQuote(null);
    } catch (reason) {
      if (!mounted.current) return;
      if (!dispatched) loseOwner();
      if (dispatched && reason instanceof OperationRequestError && isDefinitivePendingSaveFailure(reason.status, reason.code)) { quoteIntent.current = null; setPendingQuote(null); }
      reportError(reason, '見積りを作成できませんでした。');
    } finally { mutation.finish(); }
  }
  async function mutate(action: (owner: string) => Promise<void>, fallback: string) {
    const mutation = beginMutation();
    if (!mutation) return;
    try { if (await confirmOwner(mutation.owner) && mutation.current()) await action(mutation.owner); }
    catch (reason) { if (mounted.current) { reportError(reason, fallback); if (!(reason instanceof OperationRequestError && reason.status === 401) && !(reason instanceof OperationResponseError)) await mutation.refresh(); } }
    finally { mutation.finish(); }
  }
  const mutationOptions = (owner: string, body?: unknown): RequestInit => ({
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(60000),
    headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: owner },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const mutationCurrent = (owner: string) => mounted.current && currentOwner.current === owner;
  async function sample() {
    await mutate(async owner => {
      const result = await json<{ job: unknown }>(await fetch('/api/csv-jobs/sample', mutationOptions(owner)));
      if (mutationCurrent(owner)) acceptJob(result.job);
    }, 'サンプルの結果を確認できません。再読込で履歴を確認してください。自動再実行はしません。');
  }
  async function accept(job: Job) {
    await mutate(async owner => {
      const result = await json<{ job: unknown }>(await fetch(`/api/csv-jobs/${job.id}`, mutationOptions(owner, { action: job.status === 'quality_failed' ? 'retry' : 'accept', revision: job.revision })));
      if (mutationCurrent(owner)) acceptJob(result.job, job.id);
    }, '開始できませんでした。入力は保存されています。');
  }
  async function share(job: Job, action: 'create' | 'revoke') {
    await mutate(async owner => {
      const result = await json<{ url?: string; expiresAt?: number; revoked?: number }>(await fetch(`/api/csv-jobs/${job.id}/delivery-link`, mutationOptions(owner, { action })));
      if (!mutationCurrent(owner)) return;
      if (action === 'create') {
        if (typeof result.url !== 'string' || !Number.isSafeInteger(result.expiresAt)) throw new OperationResponseError('INVALID_RESPONSE');
        const url = new URL(result.url, window.location.origin);
        if (url.origin !== window.location.origin) throw new OperationResponseError('INVALID_RESPONSE');
        setShareLinks(current => new Map(current).set(job.id, { url: url.toString(), expiresAt: result.expiresAt! }));
        await navigator.clipboard.writeText(url.toString());
      } else {
        if (!Number.isSafeInteger(result.revoked)) throw new OperationResponseError('INVALID_RESPONSE');
        setShareLinks(current => { const next = new Map(current); next.delete(job.id); return next; });
      }
    }, '共有リンクを更新できませんでした。');
  }
  async function applyRevision(job: Job) {
    if (hideDraft || draftOwner.current && draftOwner.current !== currentOwner.current) return;
    await mutate(async owner => {
      const raw = revisionSpecs.get(job.id) ?? JSON.stringify(job.specification, null, 2);
      let revisedSpecification: unknown;
      try { revisedSpecification = JSON.parse(raw); } catch { throw new Error('修正条件は有効なJSONにしてください。'); }
      const result = await json<{ job: unknown }>(await fetch(`/api/csv-jobs/${job.id}`, mutationOptions(owner, { action: 'apply_revision', revision: job.revision, specification: revisedSpecification })));
      if (!mutationCurrent(owner)) return;
      acceptJob(result.job, job.id);
      setRevisionSpecs(current => { const next = new Map(current); next.delete(job.id); return next; });
    }, '修正を開始できませんでした。');
  }
  async function remove(job: Job) {
    if (mutationBusy.current || !ready || ownerScope !== currentOwner.current || !window.confirm(`「${job.inputName}」と成果物を削除しますか？`)) return;
    await mutate(async owner => {
      const response = await fetch(`/api/csv-jobs/${job.id}`, { ...mutationOptions(owner), method: 'DELETE' });
      if (!response.ok) await json(response);
      if (mutationCurrent(owner)) setJobs(items => items.filter(item => item.id !== job.id));
    }, '削除できませんでした。');
  }
  async function cancel(job: Job) {
    if (mutationBusy.current || !ready || ownerScope !== currentOwner.current) return;
    const reason = window.prompt('取り消し理由を4文字以上で入力してください。');
    if (reason === null) return;
    if (reason.trim().length < 4) { setError('取り消し理由を4文字以上で入力してください。'); return; }
    await mutate(async owner => {
      const result = await json<{ job: unknown }>(await fetch(`/api/csv-jobs/${job.id}`, mutationOptions(owner, { action: 'cancel', revision: job.revision, reason })));
      if (mutationCurrent(owner)) acceptJob(result.job, job.id);
    }, '取り消せませんでした。');
  }
  async function cancelBilling() {
    if (mutationBusy.current || !ready || ownerScope !== currentOwner.current || !billing ||
        !window.confirm('月額利用料の新規判定と、翌JST月以降の新規受付を停止します。現在の受付済み案件は続行できます。')) return;
    await mutate(async owner => {
      const operation = billingIntent.current.get(owner) ?? { id: crypto.randomUUID() };
      billingIntent.current.set(owner, operation);
      const result = await json<{ result: unknown; ownerScope: unknown }>(await fetch('/api/csv-account', mutationOptions(owner, { action: 'cancel_next_month', idempotencyKey: operation.id })));
      if (!mutationCurrent(owner)) return;
      if (!isCsvBilling(result.result) || result.ownerScope !== owner) throw new OperationResponseError('INVALID_RESPONSE');
      setBilling(result.result); setBillingError(''); if (billingIntent.current.get(owner) === operation) billingIntent.current.delete(owner);
    }, '翌月停止を保存できませんでした。再読込で結果を確認してください。');
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

        {error && <div className={styles.error} role="alert"><p>{error}</p>
          {needsSignin && <Link href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_blank" rel="noopener noreferrer">別タブでサインイン</Link>}
          <button disabled={busy} onClick={() => void refresh()}>履歴を再確認</button>
        </div>}
        {notice && <output>{notice}</output>}
        {pendingQuote && <section className={styles.scope} aria-label="CSV見積りの保存結果の確認">
          <h2>見積りの保存結果を確認してください</h2>
          <p>{pendingOwnerStatus(pendingQuote.ownerScope, ownerScope) === 'matching' ? `「${pendingQuote.file.name}」の保存結果が未確認です。` : '元のアカウントの未確認の見積りを保持しています。'}同じ受付番号と入力条件で結果を確認します。</p>
          <Link href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_blank" rel="noopener noreferrer">別タブで元のアカウントにサインイン</Link>
          <button disabled={busy || pendingOwnerStatus(pendingQuote.ownerScope, ownerScope) === 'changed'} onClick={() => void quote(pendingQuote.file)}>同じ見積りの結果を確認</button>
          <p>新しく見積もる場合は保存済み履歴を確認してください。保留の解除は保存済み受付を取り消しません。</p>
          <button disabled={busy || pendingOwnerStatus(pendingQuote.ownerScope, ownerScope) !== 'matching'} onClick={releaseQuote}>保留を解除（入力は保持）</button>
        </section>}
        {hasDraft && <section className={styles.scope} aria-label="未保存のCSV入力">
          <p>{hideDraft ? '元のアカウントの未保存入力を非表示で保持しています。元のアカウントで接続を確認してください。' : '未保存の入力をこの画面で保持しています。再読込・タブ終了前に必要な内容を保存してください。'}</p>
          {hideDraft ? <button disabled={busy} onClick={() => void refresh()}>入力元の接続を確認</button> : <button disabled={busy || Boolean(pendingQuote)} onClick={discardDraft}>未保存の入力を破棄</button>}
        </section>}
        {!ready && !error && <output>本人の履歴を確認しています…</output>}

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
              <strong>{hideDraft ? '元のアカウントのファイルを保持中' : file?.name ?? 'CSVを選ぶ'}</strong>
              <span>1ファイル / 最大10MB</span>
              <input
                key={hideDraft ? 'hidden' : draftRevision}
                type="file"
                accept=".csv,text/csv"
                disabled={inputLocked}
                onChange={(event) => editDraft(() => setFile(event.target.files?.[0] ?? null))}
              />
            </label>
            <div className={styles.fields}>
              <label>
                列名変更 <small>1行に 元の列名=新しい列名</small>
                <textarea
                  disabled={inputLocked}
                  value={hideDraft ? '' : rename}
                  onChange={(event) => editDraft(() => setRename(event.target.value))}
                  placeholder={'customer_id=顧客ID\nname=氏名'}
                />
              </label>
              <label>
                列順 <small>変更後の全列をカンマ区切り</small>
                <input
                  disabled={inputLocked}
                  value={hideDraft ? '' : order}
                  onChange={(event) => editDraft(() => setOrder(event.target.value))}
                  placeholder="顧客ID,氏名,note"
                />
              </label>
              <label>
                前後空白を除く列 <small>カンマ区切り</small>
                <input
                  disabled={inputLocked}
                  value={hideDraft ? '' : trim}
                  onChange={(event) => editDraft(() => setTrim(event.target.value))}
                  placeholder="氏名,note"
                />
              </label>
              <label>
                重複キー <small>未指定なら重複処理なし</small>
                <input
                  disabled={inputLocked}
                  value={hideDraft ? '' : dedupeKeys}
                  onChange={(event) => editDraft(() => setDedupeKeys(event.target.value))}
                  placeholder="顧客ID"
                />
              </label>
              <label>
                重複の扱い
                <select
                  disabled={inputLocked}
                  value={hideDraft ? 'report_only' : dedupeMode}
                  onChange={(event) => editDraft(() => setDedupeMode(event.target.value))}
                >
                  <option value="report_only">確認だけ（既定）</option>
                  <option value="first">先頭を残す</option>
                  <option value="last">末尾を残す</option>
                </select>
              </label>
              <label>
                並び替える列
                <input
                  disabled={inputLocked}
                  value={hideDraft ? '' : sortColumn}
                  onChange={(event) => editDraft(() => setSortColumn(event.target.value))}
                  placeholder="顧客ID"
                />
              </label>
              <label>
                並び順
                <select
                  disabled={inputLocked}
                  value={hideDraft ? 'asc' : sortDirection}
                  onChange={(event) =>
                    editDraft(() => setSortDirection(event.target.value as 'asc' | 'desc'))
                  }
                >
                  <option value="asc">昇順</option>
                  <option value="desc">降順</option>
                </select>
              </label>
              <label>
                出力文字コード
                <select
                  disabled={inputLocked}
                  value={hideDraft ? 'utf8-bom' : encoding}
                  onChange={(event) => editDraft(() => setEncoding(event.target.value))}
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
                disabled={inputLocked}
                checked={hideDraft || spreadsheetSafe}
                onChange={(event) => editDraft(() => setSpreadsheetSafe(event.target.checked))}
              />
              表計算ソフト向け安全版も別ファイルで作る（原本結果は変更しません）
            </label>
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={inputLocked || !file || Boolean(pendingQuote)}
                onClick={() => file && void quote(file)}
              >
                {busy ? '処理中…' : '¥3,000の見積りを作る'}
              </button>
              <button disabled={busy || !ready} onClick={() => void sample()}>
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
          {ready && !jobs.length && (
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
                    {job.status === 'quality_failed' && job.errorCode !== 'VALIDATION' ? '処理失敗・再試行待ち' : statusLabel[job.status] ?? job.status}
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
                    disabled={busy || !ready}
                    onClick={() => void accept(job)}
                  >
                    照合済みの入金で作業を開始
                  </button>
                )}
                {job.status === 'quality_failed' && (
                  <button
                    disabled={busy || !ready || job.attempt >= 3 || (job.paymentStatus !== 'sample' && !processingPaymentStatuses.has(job.paymentStatus))}
                    onClick={() => void accept(job)}
                  >
                    安全に再試行（{job.attempt}/3）
                  </button>
                )}
                {['quoted', 'quality_failed'].includes(job.status) &&
                  ['sample', 'unpaid', 'payment_failed', 'refunded', 'canceled'].includes(job.paymentStatus) && (
                    <button disabled={busy || !ready} onClick={() => void cancel(job)}>
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
                        disabled={inputLocked}
                        value={hideDraft ? '' : revisionSpecs.get(job.id) ?? JSON.stringify(job.specification, null, 2)}
                        onChange={(event) => editDraft(() => setRevisionSpecs(current => new Map(current).set(job.id, event.target.value)))}
                      />
                    </label>
                    <button className={styles.primary} disabled={inputLocked} onClick={() => void applyRevision(job)}>
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
                      <button disabled={busy || !ready} onClick={() => void share(job, 'create')}>
                        <Clipboard size={15} /> 期限付きリンクを作成・コピー
                      </button>
                      <button disabled={busy || !ready} onClick={() => void share(job, 'revoke')}>共有リンクを無効化</button>
                    </div>
                    {shareLinks.get(job.id) && <small>有効期限: {new Date(shareLinks.get(job.id)!.expiresAt).toLocaleString('ja-JP')} · 新しいリンクを作ると以前のリンクは無効になります。</small>}
                  </div>
                )}
                <button
                  className={styles.delete}
                  disabled={busy || !ready}
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
          {!billing?.cancelAtMonth && <button disabled={busy || !ready || !billing} onClick={() => void cancelBilling()}>翌JST月から停止を予約</button>}
          {ready && <Link href="/api/csv-account/export">自分の仕事・入出金・履歴データをJSON出力</Link>}
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
