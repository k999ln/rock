'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import {
  operationRequest,
  OperationRequestError,
  OperationResponseError,
} from '@/lib/operations-client';
import {
  OWNER_CHANGED,
  OWNER_CHECK_REQUIRED,
  OWNER_SCOPE_HEADER,
  readOwnerScope,
} from '@/lib/owner-intent';
import {
  isDefinitivePendingSaveFailure,
  pendingOwnerStatus,
} from '@/lib/pending-owner-intent';
import { isWalletSnapshot, type WalletSnapshot } from '@/lib/wallet-snapshot';
import { usePendingSaveNavigation } from '@/components/use-pending-save-navigation';

export type { WalletSnapshot } from '@/lib/wallet-snapshot';
const walletOwnerChangedMessage =
  '保存を始めたアカウントと異なります。元のアカウントで接続し直して、同じ保存内容の結果を確認してください。';
const walletDraftOwnerChangedMessage =
  '入力したアカウントと異なるため、下書きを非表示にしています。元のアカウントで接続し直すと入力を再表示できます。';
type Entry = {
  id: string;
  kind: 'revenue' | 'expense';
  source: string;
  amount: number;
  occurredOn: string;
};
type PendingSave = {
  ownerScope: string;
  input: Entry | { id: string; reversesId: string };
};

/** Both Wallet views use the same owner-bound, idempotent bookkeeping flow. */
export function useWalletLedger(preview?: WalletSnapshot) {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [ownerScope, setOwnerScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsSignin, setNeedsSignin] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draftOwnerScope, setDraftOwnerScope] = useState<string | null>(null);
  const [kind, setKind] = useState<'revenue' | 'expense'>('revenue');
  const [source, setSource] = useState('coconala');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [draftDefaultDate, setDraftDefaultDate] = useState(occurredOn);
  const pending = useRef<PendingSave | null>(null);
  const currentOwner = useRef<string | null>(null);
  const draftOwner = useRef<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);

  const acceptSnapshot = useCallback((result: WalletSnapshot) => {
    currentOwner.current = readOwnerScope(result.ownerScope);
    setOwnerScope(currentOwner.current);
    setSnapshot(result);
    setNeedsSignin(false);
  }, []);
  const loseOwner = useCallback((signin: boolean) => {
    currentOwner.current = null;
    setOwnerScope(null);
    setSnapshot(null);
    setNeedsSignin(signin);
  }, []);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const version = ++generation.current;
    setLoading(true);
    try {
      const result = await operationRequest<unknown>('/api/wallet');
      if (!mounted.current || version !== generation.current) return;
      if (!isWalletSnapshot(result)) {
        // A malformed read cannot confirm whose private snapshot is current.
        loseOwner(false);
        throw new OperationResponseError('INVALID_RESPONSE');
      }
      acceptSnapshot(result);
      setMessage('');
    } catch (error) {
      if (!mounted.current || version !== generation.current) return;
      if (error instanceof OperationRequestError && error.status === 401)
        loseOwner(true);
      else if (
        preview &&
        process.env.NODE_ENV === 'development' &&
        error instanceof OperationRequestError &&
        error.status === 503
      ) {
        acceptSnapshot(preview);
      }
      setMessage(
        error instanceof Error
          ? error.message
          : 'Walletを読み込めませんでした。',
      );
    } finally {
      if (mounted.current && version === generation.current) setLoading(false);
    }
  }, [acceptSnapshot, loseOwner, preview]);
  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => {
      mounted.current = false;
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- Numeric request sequence, not a rendered DOM ref: invalidate reads across remounts.
      generation.current++;
      window.clearTimeout(timer);
    };
  }, [refresh]);

  async function attemptSave(operation: PendingSave) {
    if (inFlight.current) return;
    if (
      pendingOwnerStatus(operation.ownerScope, currentOwner.current) !==
      'matching'
    ) {
      setMessage(
        currentOwner.current ? walletOwnerChangedMessage : OWNER_CHECK_REQUIRED,
      );
      return;
    }
    inFlight.current = true;
    generation.current++;
    setLoading(false);
    pending.current = operation;
    setPendingSave(operation);
    setSaving(true);
    setMessage('');
    try {
      const result = await operationRequest<unknown>(
        '/api/wallet',
        'POST',
        operation.input,
        { [OWNER_SCOPE_HEADER]: operation.ownerScope },
      );
      if (!mounted.current) return;
      const receivedOwner = readOwnerScope(result && typeof result === 'object' && 'ownerScope' in result ? result.ownerScope : undefined);
      if (receivedOwner !== operation.ownerScope) {
        loseOwner(false);
        throw new Error(OWNER_CHECK_REQUIRED);
      }
      if (!isWalletSnapshot(result)) throw new OperationResponseError('INVALID_RESPONSE');
      acceptSnapshot(result);
      pending.current = null;
      setPendingSave(null);
      if ('amount' in operation.input) {
        setAmount('');
        setFormOpen(false);
        draftOwner.current = null;
        setDraftOwnerScope(null);
      }
      setMessage(
        'amount' in operation.input
          ? '記録を保存しました。'
          : '取消を記録しました。',
      );
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof OperationRequestError) {
        if (error.status === 401 || error.code === OWNER_CHANGED)
          loseOwner(error.status === 401);
        if (isDefinitivePendingSaveFailure(error.status, error.code)) {
          pending.current = null;
          setPendingSave(null);
        }
      }
      setMessage(
        error instanceof OperationRequestError && error.code === OWNER_CHANGED
          ? walletOwnerChangedMessage
          : error instanceof Error
            ? error.message
            : '保存結果を確認できませんでした。',
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  const draftMatchesOwner = draftOwnerScope !== null &&
    pendingOwnerStatus(draftOwnerScope, ownerScope) === 'matching';
  const hasDraft = draftOwnerScope !== null && (amount.trim().length > 0 ||
    source !== (kind === 'revenue' ? 'coconala' : 'api') || occurredOn !== draftDefaultDate);
  const hasHiddenDraft = hasDraft && !draftMatchesOwner;
  usePendingSaveNavigation(pendingSave !== null || hasDraft);
  const locked = saving || pendingSave !== null || !ownerScope || hasHiddenDraft;
  const ownsDraft = () => draftOwnerScope !== null && draftOwnerScope === draftOwner.current &&
    draftOwner.current === currentOwner.current;
  const canEditDraft = () => ownsDraft() && !inFlight.current && !pending.current;
  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || pending.current) return;
    if (!currentOwner.current) {
      setMessage(OWNER_CHECK_REQUIRED);
      return;
    }
    if (!ownsDraft()) {
      setMessage(walletDraftOwnerChangedMessage);
      return;
    }
    await attemptSave({
      ownerScope: currentOwner.current,
      input: {
        id: crypto.randomUUID(),
        kind,
        source,
        amount: Number(amount),
        occurredOn,
      },
    });
  }
  async function reverse(id: string) {
    if (inFlight.current || pending.current || ownerScope !== currentOwner.current) return;
    if (!currentOwner.current) {
      setMessage(OWNER_CHECK_REQUIRED);
      return;
    }
    if (hasDraft && !ownsDraft()) {
      setMessage(walletDraftOwnerChangedMessage);
      return;
    }
    await attemptSave({
      ownerScope: currentOwner.current,
      input: { id: crypto.randomUUID(), reversesId: id },
    });
  }
  function openForm(nextKind: 'revenue' | 'expense') {
    if (locked || inFlight.current || pending.current || ownerScope !== currentOwner.current) return;
    const owner = currentOwner.current;
    if (!owner || (hasDraft && draftOwner.current !== owner)) return;
    if (!draftOwner.current || draftOwner.current !== owner) {
      const date = new Date().toISOString().slice(0, 10);
      setAmount('');
      setOccurredOn(date);
      setDraftDefaultDate(date);
      setSource(nextKind === 'revenue' ? 'coconala' : 'api');
    } else if (kind !== nextKind) {
      setSource(nextKind === 'revenue' ? 'coconala' : 'api');
    }
    draftOwner.current = owner;
    setDraftOwnerScope(owner);
    setKind(nextKind);
    setFormOpen(true);
  }
  function discardDraft() {
    if (!ownsDraft() || inFlight.current || pending.current) return;
    setAmount('');
    setFormOpen(false);
    draftOwner.current = null;
    setDraftOwnerScope(null);
    setMessage('未保存の入力を破棄しました。保存済みの記録は変更していません。');
  }
  return {
    snapshot,
    ownerScope,
    loading,
    saving,
    needsSignin,
    message,
    // Recovery controls need the binding, never the retained private payload.
    pendingSave: pendingSave ? { ownerScope: pendingSave.ownerScope } : null,
    locked,
    hasHiddenDraft,
    hasDraft,
    discardDraft,
    // Keep the retained draft out of both views until its author is confirmed.
    formOpen: formOpen && draftMatchesOwner,
    setFormOpen: (open: boolean) => {
      if (canEditDraft()) setFormOpen(open);
    },
    kind: draftMatchesOwner ? kind : 'revenue',
    source: draftMatchesOwner ? source : '',
    setSource: (value: string) => { if (canEditDraft()) setSource(value); },
    amount: draftMatchesOwner ? amount : '',
    setAmount: (value: string) => { if (canEditDraft()) setAmount(value); },
    occurredOn: draftMatchesOwner ? occurredOn : '',
    setOccurredOn: (value: string) => { if (canEditDraft()) setOccurredOn(value); },
    refresh,
    save,
    reverse,
    openForm,
    retry: () =>
      pending.current ? attemptSave(pending.current) : Promise.resolve(),
  };
}

export function WalletLedgerRecovery({
  ledger,
}: {
  ledger: ReturnType<typeof useWalletLedger>;
}) {
  const {
    pendingSave,
    ownerScope,
    saving,
    loading,
    needsSignin,
    hasHiddenDraft,
    hasDraft,
    discardDraft,
    setFormOpen,
    refresh,
    retry,
  } = ledger;
  if (!pendingSave && !hasDraft && (ownerScope || loading)) return null;
  return (
    <section
      className="wallet-inline-error"
      aria-label="Walletの保存と接続の確認"
    >
      {pendingSave && (
        <>
          <p>
            保存結果が未確認です。入力と操作IDを保持しています。既に記録されている可能性があるため、同じ内容で確認してください。
          </p>
          <button
            type="button"
            disabled={
              saving ||
              pendingOwnerStatus(pendingSave.ownerScope, ownerScope) !==
                'matching'
            }
            onClick={() => void retry()}
          >
            同じ保存内容で結果を確認
          </button>
          {pendingOwnerStatus(pendingSave.ownerScope, ownerScope) ===
            'changed' && <p>{walletOwnerChangedMessage}</p>}
        </>
      )}
      {!pendingSave && hasDraft && (hasHiddenDraft ? <p>{walletDraftOwnerChangedMessage}</p> : <>
        <p>未保存の入力があります。入力を続けて保存するか、入力を破棄してから別の画面へ移動してください。</p>
        <button type="button" onClick={() => setFormOpen(true)}>入力を続ける</button>
        <button type="button" onClick={discardDraft}>未保存の入力を破棄</button>
      </>)}
      {!ownerScope && <p>{OWNER_CHECK_REQUIRED}</p>}
      <button
        type="button"
        disabled={saving || loading}
        onClick={() => void refresh()}
      >
        {needsSignin ? 'サインイン後に接続を確認' : '保存先の接続を確認'}
      </button>
      {pendingSave && (
        <p>
          確認が終わるまでこの画面を開いたままにしてください。強制終了後は、再入力する前に履歴を確認してください。
        </p>
      )}
    </section>
  );
}
