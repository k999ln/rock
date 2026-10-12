'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in requires top-level navigation. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { RefreshCw } from 'lucide-react';
import type { WorkJob } from '@/lib/workflow';
import { formatCurrencyMinor, formatCurrencyRatePerMillionTokens, parseCurrencyInputToMinor } from '@/lib/currency-format';
import { remoteAiTextRequestDigest } from '@/lib/remote-ai-text-request';
import { remoteAiTextRequest, RemoteAiTextClientError, readRemoteTextEstimate, readRemoteTextExecution, readRemoteTextList, type RemoteTextExecution } from '@/lib/remote-ai-text-client';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type CloudTextOptions = {
  selected: WorkJob | undefined;
  selectedId: string;
  selectedIdRef: RefObject<string>;
  ownerScope: string | null;
  refreshOwnerScope: () => Promise<string | null>;
  cloudDraft?: { prompt: string; currency: string; maximumBudgetInput: string; model?: string } | null;
  // Currency also follows the shared A2A budget readback in Workbench.
  remoteTextCurrency: string;
  setRemoteTextCurrency: (currency: string) => void;
  delegationBudgetPool: { currency: string; budgetLimitMinor: number; reservedMinor: number; settledMinor: number } | null;
  refreshDelegations: (parentJobId: string) => Promise<void>;
};

// Keep this controller mounted with Workbench: changing jobs resets results,
// but the draft, user-entered caps and stable request fingerprint survive.
export function useWorkbenchCloudText({ selected, selectedId, selectedIdRef, ownerScope, refreshOwnerScope, cloudDraft,
  remoteTextCurrency, setRemoteTextCurrency, delegationBudgetPool, refreshDelegations }: CloudTextOptions) {
  const [remoteTextPrompt, setRemoteTextPrompt] = useState(cloudDraft?.prompt ?? '');
  const [remoteTextModel, setRemoteTextModel] = useState(cloudDraft?.model ?? '');
  const [remoteTextCurrencyOptions, setRemoteTextCurrencyOptions] = useState<string[]>([]);
  const [remoteTextCapMinor, setRemoteTextCapMinor] = useState(cloudDraft?.maximumBudgetInput ?? '');
  const [remoteTextParentCapMinor, setRemoteTextParentCapMinor] = useState('');
  const [remoteTextSaveResult, setRemoteTextSaveResult] = useState(false);
  const [remoteTextEstimate, setRemoteTextEstimate] = useState<ReturnType<typeof readRemoteTextEstimate> | null>(null);
  const [remoteTextExecutions, setRemoteTextExecutions] = useState<RemoteTextExecution[]>([]);
  const [remoteTextExecutionAvailable, setRemoteTextExecutionAvailable] = useState(false);
  const [remoteTextError, setRemoteTextError] = useState('');
  const [remoteTextNeedsSignin, setRemoteTextNeedsSignin] = useState(false);
  const [remoteTextBusy, setRemoteTextBusy] = useState(false);
  const [remoteTextResult, setRemoteTextResult] = useState<{ executionId: string; text: string } | null>(null);
  const [remoteTextDeleteId, setRemoteTextDeleteId] = useState<string | null>(null);
  const remoteTextSubmission = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const confirmedOwner = useRef(ownerScope);
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  const observedOwner = useRef<string | null | undefined>(undefined);
  const drafts = useRef(new Map<string, { prompt: string; model: string; currency: string; cap: string; parentCap: string; saveResult: boolean; submission: typeof remoteTextSubmission.current }>());
  const authenticated = useRef(!remoteTextNeedsSignin);
  useLayoutEffect(() => {
    confirmedOwner.current = ownerScope;
    authenticated.current = !remoteTextNeedsSignin;
  }, [ownerScope, remoteTextNeedsSignin]);
  const ownerAvailable = Boolean(ownerScope && draftOwner === ownerScope && !remoteTextNeedsSignin);
  const readGeneration = useRef(0);
  const readAbort = useRef<AbortController | null>(null);
  const selectionGeneration = useRef(0);
  const mutationInFlight = useRef(false);
  const mounted = useRef(false);
  const invalidateRead = useCallback(() => {
    readGeneration.current++;
    readAbort.current?.abort();
    readAbort.current = null;
  }, []);
  useEffect(() => {
    const generation = selectionGeneration;
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      invalidateRead();
    };
  }, [invalidateRead]);
  useLayoutEffect(() => {
    if (observedOwner.current === ownerScope) return;
    observedOwner.current = ownerScope;
    selectionGeneration.current++;
    invalidateRead();
    setRemoteTextExecutions([]); setRemoteTextResult(null); setRemoteTextEstimate(null);
    setRemoteTextExecutionAvailable(false); setRemoteTextDeleteId(null); setRemoteTextError('');
    setRemoteTextNeedsSignin(false);
    if (!ownerScope) return;
    if (draftOwner && draftOwner !== ownerScope) {
      drafts.current.set(draftOwner, { prompt: remoteTextPrompt, model: remoteTextModel,
        currency: remoteTextCurrency, cap: remoteTextCapMinor, parentCap: remoteTextParentCapMinor,
        saveResult: remoteTextSaveResult, submission: remoteTextSubmission.current });
      const draft = drafts.current.get(ownerScope);
      setRemoteTextPrompt(draft?.prompt ?? ''); setRemoteTextModel(draft?.model ?? '');
      setRemoteTextCurrency(draft?.currency ?? 'USD'); setRemoteTextCapMinor(draft?.cap ?? '');
      setRemoteTextParentCapMinor(draft?.parentCap ?? ''); setRemoteTextSaveResult(draft?.saveResult ?? false);
      remoteTextSubmission.current = draft?.submission ?? null;
    }
    setDraftOwner(ownerScope);
  }, [ownerScope, draftOwner, invalidateRead, remoteTextPrompt, remoteTextModel, remoteTextCurrency, remoteTextCapMinor,
    remoteTextParentCapMinor, remoteTextSaveResult, setRemoteTextCurrency]);
  function currentOwner() {
    return Boolean(ownerScope && authenticated.current && confirmedOwner.current === ownerScope && draftOwner === ownerScope);
  }
  function beginMutation() {
    if (mutationInFlight.current || !mounted.current || !currentOwner()) return null;
    mutationInFlight.current = true;
    invalidateRead();
    setRemoteTextBusy(true);
    return selectionGeneration.current;
  }
  function currentMutation(generation: number, parentJobId: string) {
    return currentOwner() && mounted.current && generation === selectionGeneration.current && selectedIdRef.current === parentJobId;
  }
  function finishMutation() {
    mutationInFlight.current = false;
    if (mounted.current) setRemoteTextBusy(false);
  }

  const remoteTextFailure = useCallback((cause: unknown, parentJobId: string) => {
    if (!ownerScope || confirmedOwner.current !== ownerScope || draftOwner !== ownerScope || selectedIdRef.current !== parentJobId) return;
    setRemoteTextExecutionAvailable(false);
    setRemoteTextError(cause instanceof Error ? cause.message : '保存済みの状態を確認できませんでした。');
    if (cause instanceof RemoteAiTextClientError && cause.status === 401) {
      authenticated.current = false;
      setRemoteTextNeedsSignin(true);
      setRemoteTextExecutions([]);
      setRemoteTextResult(null);
    }
  }, [draftOwner, ownerScope, selectedIdRef]);
  const refreshRemoteText = useCallback(async (parentJobId: string) => {
    if (!ownerScope || confirmedOwner.current !== ownerScope || draftOwner !== ownerScope || !parentJobId || !mounted.current || selectedIdRef.current !== parentJobId) return;
    invalidateRead();
    const generation = readGeneration.current;
    const controller = new AbortController();
    readAbort.current = controller;
    const current = () => confirmedOwner.current === ownerScope && draftOwner === ownerScope && mounted.current && generation === readGeneration.current &&
      !controller.signal.aborted && selectedIdRef.current === parentJobId;
    try {
      // A successful cloud list after reauthentication does not prove that the
      // original owner returned. Reconfirm through Workbench's owned job read.
      if (!authenticated.current && (await refreshOwnerScope() !== ownerScope || !current())) return;
      const response = await remoteAiTextRequest<unknown>(
        `/api/llm/quotes?parentJobId=${encodeURIComponent(parentJobId)}`, 'GET', undefined, 15_000,
        (path, options) => fetch(path, { ...options, signal: options?.signal
          ? AbortSignal.any([options.signal, controller.signal]) : controller.signal }));
      if (!current()) return;
      const data = readRemoteTextList(response, parentJobId);
      setRemoteTextExecutions(data.executions);
      setRemoteTextExecutionAvailable(data.executionAvailable === true);
      setRemoteTextNeedsSignin(false);
    } catch (cause) {
      if (current()) remoteTextFailure(cause, parentJobId);
    } finally {
      if (readAbort.current === controller) readAbort.current = null;
    }
  }, [draftOwner, invalidateRead, ownerScope, refreshOwnerScope, remoteTextFailure, selectedIdRef]);
  useEffect(() => {
    if (!ownerScope || !selectedId || remoteTextNeedsSignin) return;
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        await refreshRemoteText(selectedId);
        if (active) await refreshDelegations(selectedId);
      } finally { inFlight = false; }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 10000);
    return () => { active = false; window.clearInterval(timer); invalidateRead(); };
  }, [ownerScope, selectedId, remoteTextNeedsSignin, refreshRemoteText, refreshDelegations, invalidateRead]);
  async function createRemoteTextQuote(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!currentOwner() || !selected || selected.status !== 'active') return;
    const currency = remoteTextCurrency.trim().toUpperCase();
    const capMinor = parseCurrencyInputToMinor(remoteTextCapMinor, currency);
    const pendingAnchor = remoteTextExecutions.find((item) => ['quoted', 'reserved', 'sending', 'unreconciled', 'completed'].includes(item.state));
    const anchoredCurrency = delegationBudgetPool?.currency ?? pendingAnchor?.quote.ceiling.currency ?? null;
    const anchoredParentCap = delegationBudgetPool?.budgetLimitMinor ?? pendingAnchor?.parentBudgetLimitMinor ?? null;
    const poolCurrencyMismatch = anchoredCurrency !== null && anchoredCurrency !== currency;
    const poolCap = anchoredCurrency === currency ? anchoredParentCap : null;
    const typedParentCap = parseCurrencyInputToMinor(remoteTextParentCapMinor, currency);
    const parentCap = poolCap ?? typedParentCap;
    const availableParent = poolCap === null
      ? parentCap
      : poolCap - (delegationBudgetPool?.reservedMinor ?? 0) - (delegationBudgetPool?.settledMinor ?? 0);
    if (poolCurrencyMismatch || !remoteTextPrompt.trim() || remoteTextPrompt.length > 24_000 ||
      capMinor === null || capMinor === 0 || parentCap === null || parentCap === 0 || availableParent === null ||
      !Number.isSafeInteger(availableParent) || capMinor > availableParent || capMinor > parentCap) {
      setRemoteTextError(poolCurrencyMismatch
        ? `この仕事の共通予算は${anchoredCurrency}です。通貨を合わせてください。`
        : '依頼文、通貨、依頼別上限を確認してください。上限は同じ親jobの残り予算以下にしてください。');
      return;
    }
    const generation = beginMutation();
    if (generation === null) return;
    const parentJobId = selected.id;
    const fingerprint = JSON.stringify({ parentJobId: selected.id, prompt: remoteTextPrompt.trim(), currency, capMinor, parentCap, saveResult: remoteTextSaveResult });
    if (remoteTextSubmission.current?.fingerprint !== fingerprint)
      remoteTextSubmission.current = { fingerprint, requestId: crypto.randomUUID() };
    const requestId = remoteTextSubmission.current.requestId;
    setRemoteTextError('');
    setRemoteTextResult(null);
    try {
      const estimateResponse = await remoteAiTextRequest<unknown>('/api/llm/estimate', 'POST', {
        provider: 'openai', model: remoteTextModel || undefined, prompt: remoteTextPrompt.trim(), maxOutputTokens: 1200, currency, maximumBudgetMinor: capMinor,
      });
      if (!currentMutation(generation, parentJobId)) return;
      const estimateData = readRemoteTextEstimate(estimateResponse, { currency, model: remoteTextModel || undefined, outputTokenLimit: 1200, maximumBudgetMinor: capMinor });
      setRemoteTextEstimate(estimateData);
      const requestDigest = await remoteAiTextRequestDigest({ model: estimateData.estimate.modelId, prompt: remoteTextPrompt.trim(), maxOutputTokens: 1200 });
      if (!currentMutation(generation, parentJobId)) return;
      const quoteData = await remoteAiTextRequest<{ execution?: unknown; executionAvailable?: unknown }>(
        '/api/llm/quotes', 'POST', { requestId, parentJobId, parentBudgetLimitMinor: parentCap,
          model: estimateData.estimate.modelId, prompt: remoteTextPrompt.trim(), maxOutputTokens: 1200,
          currency: estimateData.estimate.currency, maximumBudgetMinor: capMinor, saveResult: remoteTextSaveResult });
      if (!currentMutation(generation, parentJobId)) return;
      const saved = readRemoteTextExecution(quoteData.execution, { parentJobId, requestId, requestDigest });
      if (typeof quoteData.executionAvailable !== 'boolean' || saved.parentBudgetLimitMinor !== parentCap ||
        saved.quote.approvedCapMinor !== capMinor || saved.saveResult !== remoteTextSaveResult ||
        Object.entries(estimateData.estimate).some(([key, value]) => saved.quote.ceiling[key as keyof typeof saved.quote.ceiling] !== value))
        throw new RemoteAiTextClientError(200, 'INVALID_RESPONSE');
      invalidateRead();
      setRemoteTextExecutionAvailable(quoteData.executionAvailable === true);
      setRemoteTextExecutions((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setRemoteTextCurrency(estimateData.estimate.currency);
      setRemoteTextCurrencyOptions([]);
      setRemoteTextError(quoteData.executionAvailable
        ? '見積を保存しました。内容と最大費用を確認し、明示承認してから実行してください。'
        : '見積を保存しました。外部Provider実行gateは未受入のため、送信していません。');
    } catch (cause) {
      if (!currentMutation(generation, parentJobId)) return;
      if (cause instanceof RemoteAiTextClientError &&
        cause.code === 'RATE_CARD_CURRENCY_REQUIRED') setRemoteTextCurrencyOptions(cause.currencies);
      remoteTextFailure(cause, parentJobId);
    } finally { finishMutation(); }
  }
  async function runRemoteText(execution: RemoteTextExecution) {
    const parentJobId = execution.parentJobId;
    if (!remoteTextExecutionAvailable || selectedIdRef.current !== parentJobId || execution.state !== 'quoted') return;
    const generation = beginMutation();
    if (generation === null) return;
    const prompt = remoteTextPrompt.trim();
    setRemoteTextError('');
    setRemoteTextResult(null);
    try {
      const requestHash = await remoteAiTextRequestDigest({
        model: execution.quote.ceiling.modelId, prompt, maxOutputTokens: execution.quote.ceiling.outputTokenLimit,
      });
      if (!prompt || requestHash !== execution.quote.requestDigest)
        throw new Error('見積時の依頼文と一致しません。元の依頼文を貼り付けてから承認してください。');
      if (!currentMutation(generation, parentJobId)) return;
      const approval = await remoteAiTextRequest<{ execution?: unknown }>(
        `/api/llm/quotes/${encodeURIComponent(execution.id)}`, 'POST',
        { action: 'approve', approvalDigest: execution.approvalDigest, consent: true });
      if (!currentMutation(generation, parentJobId)) return;
      const approved = readRemoteTextExecution(approval.execution, { parentJobId, previous: execution });
      if (!['reserved', 'sending', 'completed', 'unreconciled'].includes(approved.state))
        throw new RemoteAiTextClientError(200, 'INVALID_RESPONSE');
      invalidateRead();
      setRemoteTextExecutions((items) => items.map((item) => item.id === execution.id ? approved : item));
      const result = await remoteAiTextRequest<{ text?: unknown; execution?: unknown }>(
        '/api/llm/text', 'POST', { provider: 'openai', model: execution.quote.ceiling.modelId,
          prompt, maxOutputTokens: execution.quote.ceiling.outputTokenLimit,
          quoteId: execution.id, approvalDigest: execution.approvalDigest, consent: true }, 120000);
      if (!currentMutation(generation, parentJobId)) return;
      const accepted = readRemoteTextExecution(result.execution, { parentJobId, previous: execution });
      if (!['reserved', 'sending', 'completed', 'unreconciled'].includes(accepted.state) ||
        (result.text !== undefined && (typeof result.text !== 'string' || accepted.state !== 'completed')))
        throw new RemoteAiTextClientError(200, 'INVALID_RESPONSE');
      invalidateRead();
      setRemoteTextExecutions((items) => items.map((item) => item.id === execution.id ? accepted : item));
      if (typeof result.text === 'string' && result.text) setRemoteTextResult({ executionId: execution.id, text: result.text });
      await refreshRemoteText(parentJobId);
      await refreshDelegations(parentJobId);
    } catch (cause) {
      if (!currentMutation(generation, parentJobId)) return;
      remoteTextFailure(cause, parentJobId);
      if (!(cause instanceof RemoteAiTextClientError && cause.status === 401)) {
        await refreshRemoteText(parentJobId);
        await refreshDelegations(parentJobId);
      }
    } finally { finishMutation(); }
  }
  async function cancelRemoteTextQuote(execution: RemoteTextExecution) {
    if (selectedIdRef.current !== execution.parentJobId || execution.state !== 'quoted') return;
    const generation = beginMutation();
    if (generation === null) return;
    setRemoteTextError('');
    try {
      const data = await remoteAiTextRequest<{ execution?: unknown }>(
        `/api/llm/quotes/${encodeURIComponent(execution.id)}`, 'POST',
        { action: 'cancel', approvalDigest: execution.approvalDigest, consent: true });
      if (!currentMutation(generation, execution.parentJobId)) return;
      const cancelled = readRemoteTextExecution(data.execution, { parentJobId: execution.parentJobId, previous: execution });
      if (cancelled.state !== 'cancelled') throw new RemoteAiTextClientError(200, 'INVALID_RESPONSE');
      invalidateRead();
      setRemoteTextExecutions((items) => items.map((item) => item.id === execution.id ? cancelled : item));
      await refreshDelegations(execution.parentJobId);
    } catch (cause) {
      if (!currentMutation(generation, execution.parentJobId)) return;
      remoteTextFailure(cause, execution.parentJobId);
      if (!(cause instanceof RemoteAiTextClientError && cause.status === 401))
        await refreshRemoteText(execution.parentJobId);
    } finally { finishMutation(); }
  }
  function downloadRemoteText(text: string, executionId: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sky-ai-${executionId.replace(/[^A-Za-z0-9._-]/g, '-')}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function deleteRemoteTextResult(execution: RemoteTextExecution) {
    const parentJobId = execution.parentJobId;
    if (selectedIdRef.current !== parentJobId || execution.state !== 'completed') return;
    const generation = beginMutation();
    if (generation === null) return;
    setRemoteTextError('');
    try {
      const data = await remoteAiTextRequest<{ execution?: unknown; resultDeleted?: unknown }>(
        `/api/llm/quotes/${encodeURIComponent(execution.id)}`, 'DELETE');
      if (!currentMutation(generation, parentJobId)) return;
      const deleted = readRemoteTextExecution(data.execution, { parentJobId, previous: execution });
      if (data.resultDeleted !== true || deleted.state !== 'completed' || deleted.resultText !== null)
        throw new RemoteAiTextClientError(200, 'INVALID_RESPONSE');
      invalidateRead();
      setRemoteTextExecutions((items) => items.map((item) => item.id === execution.id ? deleted : item));
      setRemoteTextResult((current) => current?.executionId === execution.id ? null : current);
    } catch (cause) {
      if (!currentMutation(generation, parentJobId)) return;
      remoteTextFailure(cause, parentJobId);
      // GET reconciliation only; do not repeat an uncertain DELETE.
      if (!(cause instanceof RemoteAiTextClientError && cause.status === 401))
        await refreshRemoteText(parentJobId);
    } finally { finishMutation(); if (currentMutation(generation, parentJobId)) setRemoteTextDeleteId(null); }
  }
  const pendingRemoteTextAnchor = remoteTextExecutions.find((item) => ['quoted', 'reserved', 'sending', 'unreconciled', 'completed'].includes(item.state));
  const remoteTextBudgetCurrency = delegationBudgetPool?.currency ?? pendingRemoteTextAnchor?.quote.ceiling.currency ?? null;
  const remoteTextBudgetLimit = delegationBudgetPool?.budgetLimitMinor ?? pendingRemoteTextAnchor?.parentBudgetLimitMinor ?? null;
  const remoteTextDeleteTarget = remoteTextExecutions.find((item) => item.id === remoteTextDeleteId && item.parentJobId === selectedId && item.state === 'completed' && item.resultText !== null);
  function resetForJob(id: string) {
    selectionGeneration.current++;
    invalidateRead();
    setRemoteTextExecutionAvailable(false);
    setRemoteTextNeedsSignin(false);
    setRemoteTextDeleteId(null);
    setRemoteTextExecutions([]);
    setRemoteTextResult(null);
    setRemoteTextError('');
    setRemoteTextEstimate(null);
    void refreshRemoteText(id);
  }
  return {
    remoteTextOwnerAvailable: ownerAvailable,
    remoteTextPrompt: ownerAvailable ? remoteTextPrompt : '', setRemoteTextPrompt,
    remoteTextModel: ownerAvailable ? remoteTextModel : '', remoteTextCurrency: ownerAvailable ? remoteTextCurrency : 'USD', setRemoteTextCurrency,
    remoteTextCurrencyOptions: ownerAvailable ? remoteTextCurrencyOptions : [], remoteTextCapMinor: ownerAvailable ? remoteTextCapMinor : '', setRemoteTextCapMinor,
    remoteTextParentCapMinor: ownerAvailable ? remoteTextParentCapMinor : '', setRemoteTextParentCapMinor,
    remoteTextSaveResult: ownerAvailable && remoteTextSaveResult, setRemoteTextSaveResult,
    remoteTextEstimate: ownerAvailable ? remoteTextEstimate : null, setRemoteTextEstimate,
    remoteTextExecutions: ownerAvailable ? remoteTextExecutions : [], remoteTextExecutionAvailable: ownerAvailable && remoteTextExecutionAvailable,
    remoteTextError: ownerAvailable ? remoteTextError : '', remoteTextNeedsSignin, remoteTextBusy,
    remoteTextResult: ownerAvailable ? remoteTextResult : null, remoteTextDeleteTarget: ownerAvailable ? remoteTextDeleteTarget : undefined, setRemoteTextDeleteId,
    refreshRemoteText, createRemoteTextQuote, runRemoteText, cancelRemoteTextQuote, downloadRemoteText, deleteRemoteTextResult,
    remoteTextBudgetCurrency, remoteTextBudgetLimit, resetForJob,
  };
}

type CloudTextController = ReturnType<typeof useWorkbenchCloudText>;

export function WorkbenchCloudText({ controller, selected, delegationBudgetPool }: { controller: CloudTextController; selected: WorkJob; delegationBudgetPool: CloudTextOptions['delegationBudgetPool'] }) {
  const {
    remoteTextOwnerAvailable, remoteTextPrompt, setRemoteTextPrompt, remoteTextModel, remoteTextCurrency, setRemoteTextCurrency, remoteTextCurrencyOptions, remoteTextCapMinor, setRemoteTextCapMinor, remoteTextParentCapMinor, setRemoteTextParentCapMinor,
    remoteTextSaveResult, setRemoteTextSaveResult, remoteTextEstimate, setRemoteTextEstimate,
    remoteTextExecutions, remoteTextExecutionAvailable, remoteTextError, remoteTextNeedsSignin, remoteTextBusy, remoteTextResult, setRemoteTextDeleteId,
    refreshRemoteText, createRemoteTextQuote, runRemoteText, cancelRemoteTextQuote, downloadRemoteText, remoteTextBudgetCurrency, remoteTextBudgetLimit,
  } = controller;
  return (
    <section className="work-delegations" aria-labelledby="work-cloud-text-title">
      <div className="work-delegations-heading">
        <div>
          <h3 id="work-cloud-text-title">クラウドAIへ依頼</h3>
          <p>OpenAI{remoteTextModel ? ` · ${remoteTextModel}` : ''}。見積もりと上限を確認し、実行前に承認します。</p>
        </div>
        <button type="button" disabled={remoteTextBusy || !selected.id} onClick={() => void refreshRemoteText(selected.id)}>
          <RefreshCw size={14} /> 状態を更新
        </button>
      </div>
      {selected.status === 'active' && remoteTextOwnerAvailable ? <form className="work-delegation-create" onSubmit={(event) => void createRemoteTextQuote(event)}>
        <label htmlFor="work-cloud-text-prompt">
          AIへの依頼
          <Textarea id="work-cloud-text-prompt" value={remoteTextPrompt} onChange={(event) => { setRemoteTextPrompt(event.target.value); setRemoteTextEstimate(null); }} rows={5} maxLength={24000} placeholder="依頼を具体的に入力してください" />
        </label>
        <div className="work-delegation-fields">
          <label>見積通貨
            {remoteTextCurrencyOptions.length > 1 ? <select value={remoteTextCurrency} disabled={remoteTextBudgetCurrency !== null} onChange={(event) => { setRemoteTextCurrency(event.target.value); setRemoteTextEstimate(null); }}>
              {remoteTextCurrencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select> : <input value={remoteTextCurrency} maxLength={3} disabled={remoteTextBudgetCurrency !== null} onChange={(event) => { setRemoteTextCurrency(event.target.value.toUpperCase()); setRemoteTextEstimate(null); }} />}
          </label>
          <label>この依頼の最大額（{remoteTextCurrency}）
            <input type="number" min="0.01" step={remoteTextCurrency === 'JPY' || remoteTextCurrency === 'KRW' ? '1' : '0.01'} value={remoteTextCapMinor} onChange={(event) => { setRemoteTextCapMinor(event.target.value); setRemoteTextEstimate(null); }} />
          </label>
          {remoteTextBudgetCurrency === remoteTextCurrency && remoteTextBudgetLimit !== null ? <p>
            親job共通上限 {formatCurrencyMinor(remoteTextBudgetLimit, remoteTextCurrency)} · 予約 {formatCurrencyMinor(delegationBudgetPool?.reservedMinor ?? 0, remoteTextCurrency)} · 確定記録 {formatCurrencyMinor(delegationBudgetPool?.settledMinor ?? 0, remoteTextCurrency)}
          </p> : <label>親job全体の上限（{remoteTextCurrency}）
            <input type="number" min="0.01" step={remoteTextCurrency === 'JPY' || remoteTextCurrency === 'KRW' ? '1' : '0.01'} value={remoteTextParentCapMinor} onChange={(event) => setRemoteTextParentCapMinor(event.target.value)} />
          </label>}
        </div>
        <label className="work-delegation-consent work-cloud-text-consent">
          <input type="checkbox" checked={remoteTextSaveResult} onChange={(event) => setRemoteTextSaveResult(event.target.checked)} />
          完了後の回答をCloudのjob履歴へ保存する（初期設定は保存しない）
        </label>
        <button className="work-primary" type="submit" disabled={remoteTextBusy || remoteTextNeedsSignin || !remoteTextPrompt.trim() || selected.status !== 'active'}>
          {remoteTextBusy ? '料金を確認中…' : '料金見積を確認して保存'}
        </button>
        <p>見積と保存だけではProviderへ依頼文を送信しません。支出上限はこの親jobの残り予算内に設定してください。Cloud taskとして実行する許可は別の操作です。</p>
      </form> : <p>{remoteTextOwnerAvailable ? 'Cloud AI依頼は作業中の親jobから追加できます。完了・取消済みのjobには追加できません。' : 'アカウントを確認しています。確認できるまで依頼文と回答を表示・送信しません。'}</p>}
      {remoteTextEstimate && <dl>
        <div><dt>最大見積</dt><dd>{formatCurrencyMinor(remoteTextEstimate.estimate.maximumChargeMinor, remoteTextEstimate.estimate.currency)}</dd></div>
        <div><dt>モデル / 価格版</dt><dd>{remoteTextEstimate.estimate.modelId} · {remoteTextEstimate.estimate.pricingVersion}</dd></div>
        {remoteTextEstimate.unitRates.map((rate) => <div key={rate.category}>
          <dt>{{ 'ordinary-input': '通常入力', 'cached-input': 'キャッシュ入力', 'cache-write': 'キャッシュ書込', output: '出力' }[rate.category]} 単価</dt>
          <dd>{formatCurrencyRatePerMillionTokens(rate.rateMinorMicrosPerMillionTokens, remoteTextEstimate.estimate.currency)}</dd>
        </div>)}
        <div><dt>入力 / 出力上限</dt><dd>{remoteTextEstimate.estimate.inputTokenUpperBound.toLocaleString('ja-JP')} / {remoteTextEstimate.estimate.outputTokenLimit.toLocaleString('ja-JP')} tokens</dd></div>
        <div><dt>料金表</dt><dd><a href={remoteTextEstimate.rateSource} target="_blank" rel="noreferrer">{remoteTextEstimate.cardId}</a></dd></div>
      </dl>}
      {remoteTextError && <p className="work-delegation-error" role="alert">{remoteTextError}</p>}
      {remoteTextNeedsSignin && <a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(typeof window === 'undefined' ? '/work' : window.location.pathname + window.location.search)}`} target="_top">サインインして続ける</a>}
      {!remoteTextExecutionAvailable && <p className="work-delegation-gate">クラウドAIの実行は準備中です。見積もりを保存しても、AIへの送信や課金は始まりません。</p>}
      {remoteTextExecutions.length > 0 && <div className="work-delegation-list" aria-label="Cloud LLM依頼履歴">
        {remoteTextExecutions.map((execution) => <article className="work-delegation" key={execution.id}>
          <div className="work-delegation-title"><strong>{execution.state === 'quoted' ? '見積・承認待ち' : execution.state === 'reserved' ? '上限を予約済み' : execution.state === 'sending' ? 'Cloud AI実行中' : execution.state === 'completed' ? '処理完了' : execution.state === 'unreconciled' ? '利用量照合待ち' : execution.state === 'cancelled' ? '取消済み' : '期限切れ'}</strong><small>{new Date(execution.createdAt).toLocaleString('ja-JP')}</small></div>
          <p>最大額 {formatCurrencyMinor(execution.quote.ceiling.maximumChargeMinor, execution.quote.ceiling.currency)} · {execution.quote.ceiling.modelId} · 期限 {new Date(execution.quote.expiresAt).toLocaleString('ja-JP')}</p>
          {execution.state === 'reserved' || execution.state === 'sending' ? <p>
            {execution.spending?.providerMeter === 'stream_estimate' && typeof execution.spending.currentEstimateMinor === 'number'
              ? <>実行中の暫定見積 {formatCurrencyMinor(execution.spending.currentEstimateMinor, execution.spending.currency)}（依頼入力上限＋受信済み出力UTF-8 byte÷3の概算。Provider確定meterではありません） · </>
              : '実行中のProvider使用額はまだ表示できません · '}
            予約上限 {formatCurrencyMinor(execution.spending?.reservedMaximumMinor ?? execution.quote.ceiling.maximumChargeMinor, execution.quote.ceiling.currency)}を保持中。
          </p> : null}
          {execution.state === 'unreconciled' && <p>利用量が確定できず上限予約を保持しています。自動再送は行いません。照合後に状態を更新してください。{execution.errorCode ? ` (${execution.errorCode})` : ''}</p>}
          {execution.price && execution.price.status !== 'unreconciled' && <section className="work-delegation-usage" aria-label="Cloud LLM利用明細">
            <h4>計算済み利用明細（Provider invoice照合前）</h4>
            <p>利用量から計算した金額: {formatCurrencyMinor(execution.price.chargeMinor, execution.price.currency)} · 価格版 {execution.price.pricingVersion}</p>
            <ul>{execution.price.items.map((item) => <li key={item.category}>{item.category}: {item.tokens.toLocaleString('ja-JP')} tokens · {item.rateMinorMicrosPerMillionTokens.toLocaleString('ja-JP')} minor-unit micro / 1M tokens</li>)}</ul>
            <small>これはProvider利用量に基づく計算記録であり、請求書・決済照合済みを意味しません。</small>
          </section>}
          {execution.resultText && <>
            <details><summary>保存した回答を表示</summary><pre>{execution.resultText}</pre></details>
            <div className="work-delegation-actions">
              <a href={`/api/llm/quotes/${encodeURIComponent(execution.id)}?download=1`} download>回答をダウンロード</a>
              {execution.state === 'completed' && <button type="button" disabled={remoteTextBusy || remoteTextNeedsSignin} onClick={() => setRemoteTextDeleteId(execution.id)}>保存した回答を削除</button>}
            </div>
          </>}
          {execution.state === 'quoted' && <div className="work-delegation-actions">
            {remoteTextExecutionAvailable && <button type="button" disabled={remoteTextBusy || !remoteTextPrompt.trim()} onClick={() => void runRemoteText(execution)}>この上限で承認して実行</button>}
            <button type="button" disabled={remoteTextBusy} onClick={() => void cancelRemoteTextQuote(execution)}>見積を取り消す</button>
          </div>}
          {execution.state === 'quoted' && !remoteTextPrompt.trim() && <small>再接続後に実行する場合は、見積時と同じ依頼文を入力してください。内容が一致しない場合は実行しません。</small>}
        </article>)}
      </div>}
      {remoteTextResult && <section className="work-delegation-artifact" aria-label="クラウドAIの回答"><strong>クラウドAIの回答</strong><pre>{remoteTextResult.text}</pre>
        <button type="button" onClick={() => downloadRemoteText(remoteTextResult.text, remoteTextResult.executionId)}>回答をダウンロード</button>
      </section>}
    </section>
  );
}

export function WorkbenchCloudTextDeleteDialog({ controller }: { controller: CloudTextController }) {
  const { remoteTextDeleteTarget, remoteTextBusy, setRemoteTextDeleteId, deleteRemoteTextResult } = controller;
  return (
    <Dialog open={Boolean(remoteTextDeleteTarget)} onOpenChange={(open) => { if (!open && !remoteTextBusy) setRemoteTextDeleteId(null); }}>
      <DialogContent>
        <DialogTitle>保存した回答を削除しますか？</DialogTitle>
        <DialogDescription>回答本文だけを削除します。元に戻せません。実行状態と利用明細は残ります。必要な回答は先にダウンロードしてください。</DialogDescription>
        {remoteTextDeleteTarget && <>
          <p>{remoteTextDeleteTarget.quote.ceiling.modelId} · {new Date(remoteTextDeleteTarget.createdAt).toLocaleString('ja-JP')} · {remoteTextDeleteTarget.id.slice(0, 8)}</p>
          <div className="work-delegation-actions">
            <button type="button" disabled={remoteTextBusy} onClick={() => setRemoteTextDeleteId(null)}>戻る</button>
            <button type="button" className="work-primary" disabled={remoteTextBusy} onClick={() => void deleteRemoteTextResult(remoteTextDeleteTarget)}>{remoteTextBusy ? '削除を確認中…' : '回答本文を削除する'}</button>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
