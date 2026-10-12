'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in requires top-level navigation. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePendingSaveNavigation } from '@/components/use-pending-save-navigation';
import { pendingOwnerStatus, isDefinitivePendingSaveFailure } from '@/lib/pending-owner-intent';
import { readOwnerScope, OWNER_SCOPE_HEADER, OWNER_CHANGED, OWNER_CHECK_REQUIRED, OWNER_CHANGED_MESSAGE } from '@/lib/owner-intent';
import { OperationRequestError, OperationResponseError, readOperationResponse as json } from '@/lib/operations-client';
import { isCsvClientJob, isCsvHistory, type CsvClientJob as Job } from '@/lib/csv-job-view';
import { createCsvHistoryRequest } from '@/lib/csv-history-request';
import { CSV_TRIAL_SAMPLE } from '@/lib/csv-trial-sample';
import {
  Download,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import ZemaNavigation from '@/components/zema-navigation';
import SkyLibrarySave from '@/components/sky-library-save';
import styles from './csv-business-workspace.module.css';


type PendingQuote = { id: string; ownerScope: string; file: File; specification: string; sample: boolean; trial: boolean };

const statusLabel: Record<string, string> = {
  quoted: '見積り確認待ち',
  accepted: '受付済み',
  processing: '処理中',
  cleanup_pending: '削除待ち・再試行可能',
  completed: '検査合格・納品可能',
  quality_failed: '検査不合格・再試行待ち',
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
  const [paymentMethod, setPaymentMethod] = useState('ココナラ');
  const [paymentReference, setPaymentReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'notice'; message: string } | null>(null);
  const error = feedback?.type === 'error' ? feedback.message : '';
  const setError = useCallback((message: string) => setFeedback(message ? { type: 'error', message } : null), []);
  const [ready, setReady] = useState(false);
  const [ownerScope, setOwnerScope] = useState<string | null>(null);
  const [pendingQuote, setPendingQuote] = useState<PendingQuote | null>(null);
  const quoteIntent = useRef<PendingQuote | null>(null);
  const currentOwner = useRef<string | null>(null);
  const draftOwner = useRef<string | null>(null);
  const [draftOwnerScope, setDraftOwnerScope] = useState<string | null>(null);
  const mutationBusy = useRef(false);
  const mounted = useRef(false);
  const hasDraft = Boolean(file || rename.trim() || order.trim() || trim.trim() || dedupeKeys.trim() ||
    dedupeMode !== 'report_only' || sortColumn.trim() || sortDirection !== 'asc' || encoding !== 'utf8-bom' ||
    !spreadsheetSafe || paymentMethod !== 'ココナラ' || paymentReference.trim());
  const draftMatchesOwner = draftOwnerScope !== null && draftOwnerScope === ownerScope;
  const hideDraft = hasDraft && draftOwnerScope !== null && !draftMatchesOwner;
  const inputLocked = busy || !ready || hideDraft;
  usePendingSaveNavigation(Boolean(pendingQuote) || hasDraft);
  const [needsSignin, setNeedsSignin] = useState(false);
  const [paymentReturn, setPaymentReturn] = useState<{ jobId: string; canceled: boolean } | null>(null);
  const historyRequest = useRef(createCsvHistoryRequest());
  const restoredPaymentJob = useRef<string | null>(null);
  const [trialPayment, setTrialPayment] = useState<{
    available: boolean;
    mode: string | null;
  }>({ available: false, mode: null });
  const loseOwner = useCallback((signin = false) => {
    currentOwner.current = null;
    setReady(false);
    setOwnerScope(null);
    setJobs([]);
    setNeedsSignin(signin);
    setTrialPayment({ available: false, mode: null });
  }, []);
  const reportError = useCallback((reason: unknown, fallback: string) => {
    if (reason instanceof OperationRequestError && (reason.status === 401 || reason.code === OWNER_CHANGED))
      loseOwner(reason.status === 401);
    if (reason instanceof OperationResponseError) loseOwner();
    setError(reason instanceof OperationRequestError && reason.code === OWNER_CHANGED
      ? '保存を始めたアカウントと異なります。元のアカウントで接続し直し、同じ受付番号の結果を確認してください。'
      : reason instanceof Error ? reason.message : fallback);
  }, [loseOwner, setError]);
  function editDraft(change: () => void) {
    const owner = currentOwner.current;
    if (mutationBusy.current || !owner || owner !== ownerScope || (hasDraft && draftOwner.current && draftOwner.current !== owner)) return;
    draftOwner.current = owner;
    setDraftOwnerScope(owner);
    change();
  }
  function discardDraft() {
    if (mutationBusy.current || quoteIntent.current || !draftMatchesOwner || ownerScope !== currentOwner.current) return;
    setFile(null); setRename(''); setOrder(''); setTrim(''); setDedupeKeys(''); setDedupeMode('report_only');
    setSortColumn(''); setSortDirection('asc'); setEncoding('utf8-bom'); setSpreadsheetSafe(true);
    setPaymentMethod('ココナラ'); setPaymentReference('');
    draftOwner.current = null; setDraftOwnerScope(null);
    setFeedback({ type: 'notice', message: '入力を破棄しました。保存済みの受付と成果物は変更していません。' });
  }
  function releaseQuote() {
    if (mutationBusy.current || !pendingQuote || quoteIntent.current?.id !== pendingQuote.id ||
        pendingOwnerStatus(pendingQuote.ownerScope, currentOwner.current) !== 'matching' || ownerScope !== currentOwner.current) return;
    quoteIntent.current = null; setPendingQuote(null);
    setFeedback({ type: 'notice', message: '保留を解除しました。入力を確認してから新しく見積りを作成してください。' });
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
      if (!request.current()) return;
      if (!isCsvHistory(data)) throw new OperationResponseError('INVALID_RESPONSE');
      const scope = readOwnerScope(data.ownerScope);
      currentOwner.current = scope;
      setOwnerScope(scope);
      setJobs(data.jobs);
      setTrialPayment(data.trialPayment ?? { available: false, mode: null });
      setReady(Boolean(scope));
      setNeedsSignin(false);
      if (!preserveError) setError('');
    } catch (reason) {
      if (!request.current()) return;
      loseOwner();
      reportError(reason, '履歴を読み込めませんでした。');
    }
  }, [loseOwner, reportError, setError]);

  useEffect(() => {
    const requests = historyRequest.current;
    mounted.current = true;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => { mounted.current = false; window.clearTimeout(timer); requests.invalidate(); };
  }, [refresh]);
  useEffect(() => {
    if (
      busy || !ready || !jobs.some(
        (job) => job.status === 'processing' || job.status === 'accepted',
      )
    )
      return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [jobs, refresh, busy, ready]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const jobId = query.get('paymentJob');
    if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) return;
    const timer = window.setTimeout(() => {
      setPaymentReturn({ jobId, canceled: query.get('canceled') === '1' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const returnedJob = paymentReturn
    ? jobs.find((job) => job.id === paymentReturn.jobId)
    : undefined;
  useEffect(() => {
    if (!ready || !returnedJob || restoredPaymentJob.current === returnedJob.id) return;
    const element = document.getElementById(`csv-job-${returnedJob.id}`);
    if (!element) return;
    element.scrollIntoView({ block: 'start' });
    element.focus({ preventScroll: true });
    restoredPaymentJob.current = returnedJob.id;
  }, [ready, returnedJob]);

  function beginMutation() {
    if (mutationBusy.current) return null;
    mutationBusy.current = true;
    const releaseHistory = historyRequest.current.mutate();
    setBusy(true);
    setError('');
    let finished = false;
    return {
      finish() {
        if (finished) return;
        finished = true;
        releaseHistory();
        mutationBusy.current = false;
        if (mounted.current) setBusy(false);
      },
      async refresh() {
        releaseHistory();
        await refresh(true);
      },
    };
  }

  async function quote(selected: File, sample: boolean, trial = false) {
    if (!quoteIntent.current && (!ready || !ownerScope || ownerScope !== currentOwner.current ||
        (hasDraft && draftOwner.current !== null && draftOwner.current !== currentOwner.current))) return;
    const mutation = beginMutation();
    if (!mutation) return;
    const operation = quoteIntent.current ?? {
      id: crypto.randomUUID(), ownerScope: ownerScope!, file: selected,
      specification: JSON.stringify(specification), sample, trial,
    };
    quoteIntent.current = operation;
    setPendingQuote(operation);
    let quoteDispatched = false;
    try {
      const identity = await json<unknown>(await fetch('/api/csv-jobs', {
        cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10000),
      }));
      if (!mounted.current) return;
      if (!isCsvHistory(identity)) throw new OperationResponseError('INVALID_RESPONSE');
      const scope = readOwnerScope(identity.ownerScope);
      setJobs(identity.jobs);
      setTrialPayment(identity.trialPayment ?? { available: false, mode: null });
      currentOwner.current = scope;
      setOwnerScope(scope);
      setReady(Boolean(scope));
      setNeedsSignin(false);
      const owner = pendingOwnerStatus(operation.ownerScope, scope);
      if (owner === 'unknown') { loseOwner(); throw new Error(OWNER_CHECK_REQUIRED); }
      if (owner === 'changed') throw new OperationRequestError(OWNER_CHANGED_MESSAGE, 409, OWNER_CHANGED);
      const form = new FormData();
      form.set('id', operation.id);
      form.set('file', operation.file);
      form.set('sample', String(operation.sample));
      form.set('trial', String(operation.trial));
      form.set('specification', operation.specification);
      quoteDispatched = true;
      const { job } = await json<{ job: Job }>(
        await fetch('/api/csv-jobs', {
          method: 'POST', body: form, redirect: 'manual',
          headers: { [OWNER_SCOPE_HEADER]: operation.ownerScope },
          signal: AbortSignal.timeout(60000),
        }),
      );
      if (!mounted.current) return;
      if (!isCsvClientJob(job) || job.id !== operation.id)
        throw new OperationResponseError('INVALID_RESPONSE');
      setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
      quoteIntent.current = null;
      setPendingQuote(null);
      if (operation.sample) {
        // The quote is confirmed. Acceptance owns the next mutation and its
        // reconciliation; an uncertain quote is never replaced by a new ID.
        mutation.finish();
        await accept(job, true, operation.ownerScope);
      }
    } catch (reason) {
      if (!mounted.current) return;
      if (!quoteDispatched) loseOwner();
      // An owner-check GET refusal cannot disprove an earlier committed POST.
      if (quoteDispatched && reason instanceof OperationRequestError && isDefinitivePendingSaveFailure(reason.status, reason.code)) {
        quoteIntent.current = null;
        setPendingQuote(null);
      }
      reportError(reason, '見積りを作成できませんでした。');
    } finally {
      mutation.finish();
    }
  }

  async function accept(job: Job, sample = false, expectedOwner = ownerScope) {
    if (!expectedOwner || expectedOwner !== currentOwner.current ||
        (!sample && hasDraft && draftOwner.current !== currentOwner.current)) return;
    const mutation = beginMutation();
    if (!mutation) return;
    try {
      const { job: updated } = await json<{ job: Job }>(
        await fetch(`/api/csv-jobs/${job.id}`, {
          method: 'POST',
          redirect: 'manual',
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
      if (!mounted.current) return;
      if (!isCsvClientJob(updated) || updated.id !== job.id) throw new OperationResponseError('INVALID_RESPONSE');
      setJobs((items) => [
        updated,
        ...items.filter((item) => item.id !== updated.id),
      ]);
    } catch (reason) {
      if (!mounted.current) return;
      reportError(reason, '開始できませんでした。入力は保存されています。');
      await mutation.refresh();
    } finally {
      mutation.finish();
    }
  }

  async function payment(job: Job, action: 'checkout' | 'confirm') {
    if (!ready || hideDraft || ownerScope !== currentOwner.current) return;
    const mutation = beginMutation();
    if (!mutation) return;
    try {
      const data = await json<{ url?: string; job?: Job }>(
        await fetch(`/api/csv-jobs/${job.id}/payment`, {
          method: 'POST',
          redirect: 'manual',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
          signal: AbortSignal.timeout(60000),
        }),
      );
      if (!mounted.current) return;
      if ((data.job !== undefined && (!isCsvClientJob(data.job) || data.job.id !== job.id)) ||
          (action === 'confirm' && !data.job) ||
          (action === 'checkout' && (typeof data.url !== 'string' || !/^https?:\/\//.test(data.url))))
        throw new OperationResponseError('INVALID_RESPONSE');
      if (action === 'checkout' && data.url) window.location.assign(data.url);
      if (data.job)
        setJobs((items) => [
          data.job!,
          ...items.filter((item) => item.id !== data.job!.id),
        ]);
    } catch (reason) {
      if (!mounted.current) return;
      reportError(reason, '支払いを確認できませんでした。');
      await mutation.refresh();
    } finally {
      mutation.finish();
    }
  }

  async function remove(job: Job) {
    if (!ready || hideDraft || ownerScope !== currentOwner.current || mutationBusy.current) return;
    if (!window.confirm(`「${job.inputName}」と成果物を削除しますか？`)) return;
    const mutation = beginMutation();
    if (!mutation) return;
    try {
      const response = await fetch(`/api/csv-jobs/${job.id}`, {
        method: 'DELETE',
        redirect: 'manual',
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) await json(response);
      if (!mounted.current) return;
      setJobs((items) => items.filter((item) => item.id !== job.id));
    } catch (reason) {
      if (!mounted.current) return;
      reportError(reason, '削除できませんでした。');
      await mutation.refresh();
    } finally {
      mutation.finish();
    }
  }

  const sample = new File([CSV_TRIAL_SAMPLE], 'sample.csv', {
    type: 'text/csv',
  });
  return (
    <WorkspaceShell title={workspace ? 'Zema · CSV仕事' : 'Sky · CSV仕事'} hideTopActions>
      <div className={styles.page}>
        <div className={styles.toolAccess} onClickCapture={(event) => {
          if (busy && event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault();
        }}>
          {workspace ? <ZemaNavigation active="library" /> : <nav aria-label="CSVの移動先">
            <Link href="/sky">Skyへ戻る</Link>
            <Link href="/zema/library">Zemaのライブラリ</Link>
          </nav>}
          {!workspace && <SkyLibrarySave toolId="rockstar-csv-cleanup" returnTo={returnTo} disabled={busy} />}
        </div>
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

        {feedback?.type === 'notice' && <output className={styles.notice}>{feedback.message}</output>}

        {error && (
          <div className={styles.error} role="alert">
            {error}
            {needsSignin && (
              <a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_blank" rel="noopener noreferrer">
                別タブでサインイン
              </a>
            )}
            <p>CSVと入力条件は、入力したアカウントでのみ表示されます。{needsSignin ? 'サインイン後に接続を確認してください。' : '通信を確認して、履歴を再確認してください。'}確認だけでは処理を実行しません。</p><button type="button" onClick={() => void refresh()} disabled={busy}>{needsSignin ? 'サインイン後に接続を確認' : '履歴を再確認'}</button>
          </div>
        )}

        {pendingQuote && <section className={styles.error} aria-label="CSV見積りの保存結果の確認">
          <p>{pendingOwnerStatus(pendingQuote.ownerScope, ownerScope) === 'matching' ? `「${pendingQuote.file.name}」の保存結果が未確認です。` : '保存結果が未確認の見積りを保持しています。'}最初のアカウント・受付番号・入力条件で確認します。</p>
          <p>入力を変更しても保留中の内容は変わりません。確認または保留解除の後に、新しい見積りを作成できます。</p>
          {pendingOwnerStatus(pendingQuote.ownerScope, ownerScope) === 'matching' ? <p>同じ受付番号で結果を確認できます。アカウントを切り替えた場合は、元のアカウントで接続を確認してください。</p> : <>
            <p>元のアカウントで接続を確認してください。別のアカウントでは入力内容を表示・送信・保留解除できません。</p>
            <a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_blank" rel="noopener noreferrer">別タブで元のアカウントにサインイン</a>
          </>}
          <button disabled={busy} onClick={() => void refresh()}>保存先の接続を確認</button>
          <button disabled={busy || pendingOwnerStatus(pendingQuote.ownerScope, ownerScope) === 'changed'} onClick={() => void quote(pendingQuote.file, pendingQuote.sample, pendingQuote.trial)}>同じ見積りの結果を確認</button>
          <p>保留を解除しても保存済みの受付は削除されません。元のアカウントの履歴を確認してから新しく作成してください。</p>
          <button disabled={busy || pendingOwnerStatus(pendingQuote.ownerScope, ownerScope) !== 'matching'} onClick={releaseQuote}>保留を解除（入力は保持）</button>
        </section>}
        {!pendingQuote && hasDraft && <section className={hideDraft ? styles.error : styles.notice} aria-label="CSV入力の保持と破棄">
          <p>{hideDraft ? '入力したアカウントを確認できないため、CSVと入力条件を非表示にしています。元のアカウントで接続し直すと再表示できます。' : 'CSVと入力条件をこの画面に保持しています。別の画面へ移動する前に入力を破棄してください。保存済みの受付と成果物は変更しません。'}</p>
          {hideDraft ? <><a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_blank" rel="noopener noreferrer">別タブで元のアカウントにサインイン</a><button disabled={busy} onClick={() => void refresh()}>入力元の接続を確認</button></> : <button disabled={busy} onClick={discardDraft}>未保存の入力を破棄</button>}
        </section>}
        {!ready && !error && <output>{ownerScope ? '履歴を確認しています…' : OWNER_CHECK_REQUIRED}</output>}

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
              <strong>{hideDraft ? '元のアカウントでCSVを確認' : file?.name ?? 'CSVを選ぶ'}</strong>
              <span>1ファイル / 最大10MB</span>
              <input
                key={draftMatchesOwner ? draftOwnerScope : 'unconfirmed'}
                type="file"
                accept=".csv,text/csv"
                disabled={inputLocked}
                onChange={(event) => { const selected = event.target.files?.[0] ?? null; editDraft(() => setFile(selected)); }}
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
                checked={hideDraft ? true : spreadsheetSafe}
                onChange={(event) => editDraft(() => setSpreadsheetSafe(event.target.checked))}
              />
              表計算ソフト向け安全版も別ファイルで作る（原本結果は変更しません）
            </label>
            <p>サンプル操作は選択したCSVを送信せず、公開サンプルと現在の入力条件を使います。</p>
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={busy || !ready || hideDraft || !!pendingQuote || !file}
                onClick={() => file && void quote(file, false)}
              >
                {busy ? '処理中…' : '¥3,000の見積りを作る'}
              </button>
              <button disabled={busy || !ready || hideDraft || !!pendingQuote} onClick={() => void quote(sample, true)}>
                サンプルを完走
              </button>
              <button
                disabled={busy || !ready || hideDraft || !!pendingQuote || !trialPayment.available}
                onClick={() => void quote(sample, false, true)}
              >
                50円試験の見積りを作る
              </button>
            </div>
          </section>

          <aside className={styles.card}>
            <h2>50円の決済試験</h2>
            <p>
              サンプルCSVを50円で処理します。見積りの後、決済画面で金額を確認してお支払いください。
            </p>
            <p>
              Apple
              Payは対応環境で決済画面に表示されます。カードも利用できます。
            </p>
            <p>
              {trialPayment.available
                ? trialPayment.mode === 'live'
                  ? '本番決済：実際に50円を請求します。'
                  : 'テスト環境：実際の請求は発生しません。'
                : '決済の接続準備中です。無料サンプルは利用できます。'}
            </p>

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
                disabled={inputLocked}
                  value={hideDraft ? 'ココナラ' : paymentMethod}
                onChange={(event) => editDraft(() => setPaymentMethod(event.target.value))}
              >
                <option>ココナラ</option>
                <option>銀行振込</option>
                <option>その他の契約済み経路</option>
              </select>
            </label>
            <label>
              取引・入金の照合番号
              <input
                disabled={inputLocked}
                  value={hideDraft ? '' : paymentReference}
                maxLength={120}
                onChange={(event) => editDraft(() => setPaymentReference(event.target.value))}
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
              {ready ? 'まだ受付はありません。まずサンプルで全工程を確認できます。' : '接続確認後に受付を表示します。'}
            </p>
          )}
          <div className={styles.jobs}>
            {jobs.map((job) => (
              <article key={job.id} id={`csv-job-${job.id}`} tabIndex={-1} className={styles.job}>
                {returnedJob?.id === job.id && (
                  <output>
                    {job.paymentStatus === 'stripe_verified' && job.status === 'completed'
                      ? 'お支払いを確認しました。成果物を取得できます。'
                      : paymentReturn?.canceled && job.paymentStatus === 'unpaid'
                        ? '支払いを完了せず戻りました。受付は未払いです。'
                        : '支払い状況を確認中です。未確認の場合は下の確認ボタンを使ってください。'}
                  </output>
                )}
                <div className={styles.jobHead}>
                  <div>
                    <strong>{job.inputName}</strong>
                    <code>{job.id}</code>
                  </div>
                  <span data-status={job.status}>
                    {job.status === 'quality_failed' && job.errorCode !== 'QUALITY' ? '処理失敗・再試行待ち' : statusLabel[job.status] ?? job.status}
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
                {job.quoteMinor === 5000 && job.status === 'quoted' && (
                  <div className={styles.actions}>
                    <button
                      disabled={busy || !ready || hideDraft || !trialPayment.available}
                      onClick={() => void payment(job, 'checkout')}
                    >
                      {trialPayment.mode === 'test'
                        ? '50円のテスト決済へ'
                        : '50円を支払う'}
                    </button>
                    <button
                      disabled={busy || !ready || hideDraft || !trialPayment.available}
                      onClick={() => void payment(job, 'confirm')}
                    >
                      支払いを確認して開始
                    </button>
                  </div>
                )}
                {job.status === 'quoted' &&
                  job.paymentStatus !== 'sample' &&
                  job.quoteMinor !== 5000 && (
                    <button
                      className={styles.primary}
                      disabled={busy || !ready || hideDraft || paymentReference.trim().length < 4}
                      onClick={() => void accept(job)}
                    >
                      入金確認済みとして開始
                    </button>
                  )}
                {job.status === 'accepted' && (
                  <button disabled={busy || !ready || hideDraft} onClick={() => void accept(job, job.paymentStatus === 'sample')}>受付済みの処理を再開</button>
                )}
                {job.status === 'quality_failed' && (
                  <button
                    disabled={busy || !ready || hideDraft || job.attempt >= 3}
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
                  disabled={busy || !ready || hideDraft || job.status === 'processing'}
                  title={job.status === 'processing' ? '処理の完了後に削除できます。' : undefined}
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
            販売者向けの8.88
            USD料金案は、収益動線が決まるまで保留中です。現在、新たな利用料の計上・請求は行いません。
          </p>
          <Link href="/csv/terms">取引条件・プライバシー・返金</Link>
        </footer>
      </div>
    </WorkspaceShell>
  );
}
