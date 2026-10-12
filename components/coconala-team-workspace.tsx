'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { pendingOwnerStatus, isDefinitivePendingSaveFailure } from '@/lib/pending-owner-intent';
import { readOwnerScope, OWNER_SCOPE_HEADER, OWNER_CHANGED, OWNER_CHECK_REQUIRED, OWNER_CHANGED_MESSAGE } from '@/lib/owner-intent';
import { operationRequest, OperationRequestError } from '@/lib/operations-client';
import { ArrowLeft, ArrowRight, CircleCheck, ExternalLink, Plus, RefreshCw } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import { usePendingSaveNavigation } from '@/components/use-pending-save-navigation';
import ZemaNavigation from '@/components/zema-navigation';
import SkyLibrarySave from '@/components/sky-library-save';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { ToolIcon } from '@/components/tool-icon';
import SkyToolOverview from '@/components/sky-tool-overview';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { catalog } from '@/lib/catalog';
import { skyToolUiState } from '@/lib/sky-tool-ui';
import {
  teamMoney, parseTeamTerms, teamId, type TeamCase, type TeamTerms,
} from '@/lib/coconala-team';
import styles from './coconala-team-workspace.module.css';

const blank: TeamTerms = {
  title: '', orderReference: '', clientLabel: '', workerName: '', scope: '',
  deliveryDate: '', deliveryPlace: '', inspectionDate: '', revisionScope: '',
  rights: '', grossYen: 10000, estimatedPlatformFeePercent: 22,
  workerFeeYen: 7566, workerPaymentDate: '', platformRulesReference: '',
  customerDisclosureReference: '', workerTermsReference: '',
};

const yen = (value: number) => new Intl.NumberFormat('ja-JP', {
  style: 'currency', currency: 'JPY', maximumFractionDigits: 0,
}).format(value);

const statusNames: Record<TeamCase['status'], string> = {
  draft: '発注前', assigned: '担当中', delivered: '納品確認中', accepted: '顧客検収済み',
};
const coconalaTool = catalog.find((tool) => tool.id === 'coconala');

async function request<T>(method = 'GET', value?: unknown, ownerScope?: string): Promise<T> {
  return operationRequest<T>('/api/coconala-team', method, value, ownerScope ? { [OWNER_SCOPE_HEADER]: ownerScope } : undefined);
}

type PendingSave = {
  ownerScope: string;
  method: 'POST' | 'PATCH';
  value: { id: string; terms: TeamTerms } | {
    caseId: string; revision: number; command: Record<string, unknown>;
  };
  fromForm: boolean;
  notice: string;
};

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
function readCase(value: unknown): TeamCase {
  if (!object(value) || teamId(value.id) !== value.id || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      typeof value.status !== 'string' || !Object.hasOwn(statusNames, value.status) || !validDate(value.createdAt) || !validDate(value.updatedAt))
    throw new Error('案件の保存状態を確認できません。再読込してください。');
  const terms = parseTeamTerms(value.terms);
  for (const key of ['customerReceipts', 'customerRefunds', 'workerPayments']) {
    const entries = value[key];
    if (!Array.isArray(entries) || !entries.every(entry => object(entry) && typeof entry.id === 'string' &&
      Number.isSafeInteger(entry.amountYen) && (entry.amountYen as number) > 0 && typeof entry.reference === 'string' && validDate(entry.at)))
      throw new Error('入出金の記録を確認できません。同じ操作IDを保持して再確認してください。');
  }
  if (!Array.isArray(value.events) || !value.events.every(event => object(event) &&
    ['id', 'action', 'note'].every(key => typeof event[key] === 'string') && validDate(event.at) &&
    (event.command === undefined || typeof event.command === 'string')))
    throw new Error('案件の変更履歴を確認できません。同じ操作IDを保持して再確認してください。');
  return { ...value, terms, ...(value.creationTerms === undefined ? {} : { creationTerms: parseTeamTerms(value.creationTerms) }) } as TeamCase;
}
function readSnapshot(value: unknown) {
  if (!object(value) || !Array.isArray(value.cases)) throw new Error('案件一覧を確認できません。再読込してください。');
  return { cases: value.cases.map(readCase), ownerScope: readOwnerScope(value.ownerScope) };
}
type PrivateWorkspace = {
  owner: string | null; form: TeamTerms; formBase: TeamTerms; editingId: string; editingRevision: number | null; formOpen: boolean; deleteCaseId: string;
  selectedId: string; note: string; moneyKind: 'record_customer_receipt' | 'record_refund' | 'record_worker_payment';
  moneyAmount: string; moneyReference: string; pendingSave: PendingSave | null;
};
const emptyWorkspace = (owner: string | null): PrivateWorkspace => ({ owner, form: { ...blank }, formBase: { ...blank },
  editingId: '', editingRevision: null, formOpen: false, deleteCaseId: '', selectedId: '', note: '', moneyKind: 'record_customer_receipt',
  moneyAmount: '', moneyReference: '', pendingSave: null });
const dirtyWorkspace = (value: PrivateWorkspace) => JSON.stringify(value.form) !== JSON.stringify(value.formBase) ||
  !!value.note.trim() || !!value.moneyAmount.trim() || !!value.moneyReference.trim();

type Field = { key: keyof TeamTerms; label: string; kind?: 'date' | 'number' | 'textarea'; help?: string };
const fields: Field[] = [
  { key: 'title', label: '案件名' },
  { key: 'orderReference', label: 'ココナラ案件番号・参照' },
  { key: 'clientLabel', label: '顧客の表示名' },
  { key: 'workerName', label: '制作担当者名' },
  { key: 'scope', label: '委託する作業・成果物', kind: 'textarea' },
  { key: 'deliveryDate', label: '納品予定日', kind: 'date' },
  { key: 'deliveryPlace', label: '納品先・方法' },
  { key: 'inspectionDate', label: '検査完了予定日', kind: 'date' },
  { key: 'revisionScope', label: '修正対応の範囲' },
  { key: 'rights', label: '成果物の権利・利用条件' },
  { key: 'grossYen', label: '顧客の受注額（円）', kind: 'number' },
  { key: 'estimatedPlatformFeePercent', label: '販売手数料の見込率（%）', kind: 'number', help: '通常サービス22%を初期値にしています。実際の取引条件で確認してください。' },
  { key: 'workerFeeYen', label: '担当者と事前合意する固定報酬（円）', kind: 'number' },
  { key: 'workerPaymentDate', label: '担当者への支払期日', kind: 'date', help: '「顧客から入金されたら」ではなく日付を決めます。' },
  { key: 'platformRulesReference', label: '規約・再委託条件の確認記録', help: '確認したページと日付など。許可されたと自動判定しません。' },
  { key: 'customerDisclosureReference', label: '顧客へチーム制作を伝えた記録', help: 'ココナラ内のメッセージ日時など。' },
  { key: 'workerTermsReference', label: '担当者へ発注条件を明示した記録', help: '送付した発注書・メッセージの参照など。' },
];

export default function CoconalaTeamWorkspace({ workspace = false }: { workspace?: boolean }) {
  const returnTo = workspace ? '/zema/tools/coconala' : '/sky/tools/coconala';
  const [view, setView] = useState<'management' | 'check'>('management');
  const [infoOpen, setInfoOpen] = useState(false);
  const [cases, setCaseState] = useState<TeamCase[]>([]);
  const currentCases = useRef<TeamCase[]>([]);
  const setCases = useCallback((value: TeamCase[] | ((previous: TeamCase[]) => TeamCase[])) => {
    const next = typeof value === 'function' ? value(currentCases.current) : value;
    currentCases.current = next; setCaseState(next);
  }, []);
  const [privateState, setPrivateState] = useState<PrivateWorkspace>(emptyWorkspace(null));
  const { form, editingId, formOpen, deleteCaseId, selectedId, note, moneyKind, moneyAmount, moneyReference, pendingSave } = privateState;
  const currentWorkspace = useRef(privateState);
  const workspaces = useRef(new Map<string | null, PrivateWorkspace>());
  const currentOwner = useRef<string | null>(null);
  const [retainedWork, setRetainedWork] = useState(false);
  const [parkedWork, setParkedWork] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsSignin, setNeedsSignin] = useState(false);
  const [ownerScope, setOwnerScope] = useState<string | null>(null);
  const saveInFlight = useRef(false);
  const listGeneration = useRef(0);
  const mutationGeneration = useRef(0);
  const mounted = useRef(true);
  const locked = busy || pendingSave !== null || !ownerScope;
  const dirty = dirtyWorkspace(privateState);
  usePendingSaveNavigation(retainedWork);

  const updateWorkspace = useCallback((patch: Partial<PrivateWorkspace>) => {
    const next = { ...currentWorkspace.current, ...patch };
    currentWorkspace.current = next; workspaces.current.set(next.owner, next); setPrivateState(next);
    const entries = Array.from(workspaces.current.values());
    setRetainedWork(entries.some(value => !!value.pendingSave || dirtyWorkspace(value)));
    setParkedWork(entries.some(value => value.owner !== next.owner && (!!value.pendingSave || dirtyWorkspace(value))));
  }, []);
  const showIdentity = useCallback((scope: string | null, savedCases: TeamCase[] = []) => {
    if (currentOwner.current !== scope) {
      workspaces.current.set(currentWorkspace.current.owner, currentWorkspace.current);
      currentOwner.current = scope;
      listGeneration.current++; mutationGeneration.current++;
      saveInFlight.current = false; setBusy(false); setLoading(false);
      currentWorkspace.current = workspaces.current.get(scope) ?? emptyWorkspace(scope);
      updateWorkspace({}); setError(''); setNotice('');
    }
    setOwnerScope(scope); setCases(scope ? savedCases : []);
  }, [updateWorkspace, setCases]);
  function ownsInput() { return mounted.current && !!ownerScope && currentOwner.current === ownerScope && currentWorkspace.current.owner === privateState.owner; }
  function editWorkspace(patch: Partial<PrivateWorkspace>) {
    if (ownsInput() && !saveInFlight.current && !currentWorkspace.current.pendingSave) updateWorkspace(patch);
  }
  function setForm(value: TeamTerms | ((current: TeamTerms) => TeamTerms)) {
    editWorkspace({ form: typeof value === 'function' ? value(currentWorkspace.current.form) : value });
  }
  function setFormOpen(value: boolean) { editWorkspace({ formOpen: value }); }
  function setDeleteCaseId(value: string) { editWorkspace({ deleteCaseId: value }); }
  function setSelectedId(value: string) { editWorkspace({ selectedId: value }); }
  function setNote(value: string) { editWorkspace({ note: value }); }
  function setMoneyKind(value: PrivateWorkspace['moneyKind']) { editWorkspace({ moneyKind: value }); }
  function setMoneyAmount(value: string) { editWorkspace({ moneyAmount: value }); }
  function setMoneyReference(value: string) { editWorkspace({ moneyReference: value }); }
  function discardDraft() {
    if (currentWorkspace.current !== privateState) return;
    if (!ownsInput() || saveInFlight.current || currentWorkspace.current.pendingSave) return;
    updateWorkspace({ form: { ...blank }, formBase: { ...blank }, editingId: '', editingRevision: null, note: '', moneyAmount: '', moneyReference: '' });
    setError('');
    setNotice('未保存の入力を破棄しました。保存済み案件と手入力の入出金記録は変更していません。');
  }
  function openForm() {
    if (!ownsInput() || saveInFlight.current || currentWorkspace.current.pendingSave) return;
    updateWorkspace({ formOpen: true });
  }
  function editTerms(item: TeamCase) {
    if (!currentCases.current.includes(item)) return;
    if (!ownsInput() || saveInFlight.current || currentWorkspace.current.pendingSave) return;
    if (dirtyWorkspace(currentWorkspace.current)) { updateWorkspace({ formOpen: true }); setError('未保存の入力が残っています。保存または明示的に破棄してから別の条件を編集してください。'); return; }
    updateWorkspace({ form: { ...item.terms }, formBase: { ...item.terms }, editingId: item.id, editingRevision: item.revision, formOpen: true });
  }
  function releasePending() {
    if (!ownsInput() || saveInFlight.current || !pendingSave || currentWorkspace.current.pendingSave !== pendingSave) return;
    updateWorkspace({ pendingSave: null }); setError('');
    setNotice('保留を解除しました。以前の保存が完了している可能性があります。案件一覧で結果を確認してから新しく保存してください。');
  }
  const refresh = useCallback(async () => {
    if (saveInFlight.current) return;
    const version = ++listGeneration.current;
    setLoading(true);
    try {
      const result = readSnapshot(await request<unknown>());
      if (version !== listGeneration.current) return;
      showIdentity(result.ownerScope, result.cases); setNeedsSignin(false); setError(''); setLoading(false);
    } catch (caught) {
      if (version !== listGeneration.current) return;
      showIdentity(null);
      if (caught instanceof OperationRequestError && caught.status === 401) setNeedsSignin(true);
      setError(caught instanceof Error ? caught.message : '案件を読み込めませんでした。'); setLoading(false);
    }
  }, [showIdentity]);

  useEffect(() => {
    mounted.current = true;
    const generation = listGeneration, mutations = mutationGeneration, mountedRef = mounted;
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => { mountedRef.current = false; window.clearTimeout(timeout); generation.current++; mutations.current++; };
  }, [refresh]);

  const selected = cases.find((item) => item.id === selectedId) ?? cases[0] ?? null;
  const deleteTarget = cases.find((item) => item.id === deleteCaseId);
  const estimate = useMemo(() => {
    const fee = Math.round(form.grossYen * form.estimatedPlatformFeePercent / 100);
    return { net: form.grossYen - fee, margin: form.grossYen - fee - form.workerFeeYen };
  }, [form]);

  async function attemptSave(operation: PendingSave, retry = false) {
    if (!ownsInput() || operation.ownerScope !== currentOwner.current || saveInFlight.current ||
      (retry ? currentWorkspace.current.pendingSave !== operation : currentWorkspace.current.pendingSave !== null)) return;
    saveInFlight.current = true;
    const version = ++mutationGeneration.current;
    const current = () => mounted.current && version === mutationGeneration.current && currentOwner.current === operation.ownerScope && currentWorkspace.current.pendingSave === operation;
    listGeneration.current++; setLoading(false);
    updateWorkspace({ pendingSave: operation }); setBusy(true); setError(''); setNotice('');
    let dispatched = false;
    try {
      const identity = readSnapshot(await request<unknown>());
      if (!current()) return;
      const ownerStatus = pendingOwnerStatus(operation.ownerScope, identity.ownerScope);
      if (ownerStatus !== 'matching') {
        showIdentity(identity.ownerScope, identity.cases);
        setError(ownerStatus === 'unknown' ? OWNER_CHECK_REQUIRED : OWNER_CHANGED_MESSAGE); return;
      }
      setCases(identity.cases);
      dispatched = true;
      const result = await request<unknown>(operation.method, operation.value, operation.ownerScope);
      if (!current()) return;
      const caseFile = readCase(object(result) ? result.caseFile : null);
      const value = operation.value;
      if (caseFile.id !== ('id' in value ? value.id : value.caseId)) throw new Error('保存した案件との対応を確認できません。同じ記録IDを保持しています。');
      if ('terms' in value) {
        if (JSON.stringify(caseFile.creationTerms ?? caseFile.terms) !== JSON.stringify(parseTeamTerms(value.terms)))
          throw new Error('保存した条件との対応を確認できません。同じ記録IDを保持しています。');
      } else {
        const command: Record<string, unknown> = { ...value.command,
          ...(value.command.terms ? { terms: parseTeamTerms(value.command.terms) } : {}),
          ...(typeof value.command.note === 'string' ? { note: value.command.note.trim() } : {}),
          ...(typeof value.command.reference === 'string' ? { reference: value.command.reference.trim() } : {}) };
        if (caseFile.revision <= value.revision || !caseFile.events.some(event => event.id === command.id && event.command === JSON.stringify(command)))
          throw new Error('操作の保存を確認できません。同じ操作IDを保持しています。');
      }
      setCases(previous => [caseFile, ...previous.filter(item => item.id !== caseFile.id)]);
      updateWorkspace({ pendingSave: null, selectedId: caseFile.id, ...(operation.fromForm ? {
        formOpen: false, editingId: '', editingRevision: null, form: { ...blank }, formBase: { ...blank },
      } : { note: '', moneyAmount: '', moneyReference: '' }) });
      setNeedsSignin(false); setNotice(operation.notice);
    } catch (caught) {
      if (!current()) return;
      if (caught instanceof OperationRequestError) {
        if (caught.status === 401) { showIdentity(null); setNeedsSignin(true); }
        if (caught.code === OWNER_CHANGED) showIdentity(null);
        // A failed preflight does not resolve an earlier unknown mutation.
        if (dispatched && isDefinitivePendingSaveFailure(caught.status, caught.code)) updateWorkspace({ pendingSave: null });
      }
      setError(caught instanceof Error ? caught.message : '保存できませんでした。');
    } finally { if (version === mutationGeneration.current) { saveInFlight.current = false; setBusy(false); } }
  }

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentWorkspace.current !== privateState) return;
    if (!ownsInput() || saveInFlight.current || currentWorkspace.current.pendingSave || locked) return;
    if (!ownerScope) { setError(OWNER_CHECK_REQUIRED); return; }
    const current = cases.find((item) => item.id === editingId);
    if (editingId && (!current || current.revision !== currentWorkspace.current.editingRevision)) {
      setError('編集中に案件が更新されました。入力は保持しています。変更内容を控え、未保存の入力を破棄して最新の条件を開き直してから確認してください。'); return;
    }
    await attemptSave(current ? {
      ownerScope, method: 'PATCH', fromForm: true,
      value: { caseId: current.id, revision: current.revision,
        command: { id: crypto.randomUUID(), action: 'update_terms', terms: { ...form } } },
      notice: '発注前の条件を更新しました。',
    } : {
      ownerScope, method: 'POST', fromForm: true,
      value: { id: crypto.randomUUID(), terms: { ...form } },
      notice: '案件を下書き保存しました。内容と証拠を確認してから担当開始を記録してください。',
    });
  }

  async function act(action: string, payload: Record<string, unknown> = {}) {
    if (currentWorkspace.current !== privateState || !selected || !currentCases.current.includes(selected)) return;
    if (!ownsInput() || saveInFlight.current || currentWorkspace.current.pendingSave || !selected || locked) return;
    if (!ownerScope) { setError(OWNER_CHECK_REQUIRED); return; }
    await attemptSave({
      ownerScope, method: 'PATCH', fromForm: false,
      value: { caseId: selected.id, revision: selected.revision,
        command: { id: crypto.randomUUID(), action, ...payload } },
      notice: '記録を保存しました。外部サイトへの送信・銀行振込は行っていません。',
    });
  }

  async function deleteDraft() {
    if (currentWorkspace.current !== privateState || !deleteTarget || !currentCases.current.includes(deleteTarget)) return;
    if (!ownsInput() || saveInFlight.current || currentWorkspace.current.pendingSave || !deleteTarget || locked || needsSignin) return;
    saveInFlight.current = true;
    const version = ++mutationGeneration.current;
    const current = () => mounted.current && version === mutationGeneration.current && currentOwner.current === ownerScope;
    listGeneration.current++; setLoading(false); setBusy(true); setError(''); setNotice('');
    try {
      const identity = readSnapshot(await request<unknown>());
      if (!current()) return;
      if (identity.ownerScope !== ownerScope) { showIdentity(identity.ownerScope, identity.cases); setError(OWNER_CHANGED_MESSAGE); return; }
      const result = await request<{ deletedCaseId: string }>('DELETE', { caseId: deleteTarget.id, revision: deleteTarget.revision }, ownerScope!);
      if (!current()) return;
      if (!result || result.deletedCaseId !== deleteTarget.id) throw new Error('削除結果を確認できませんでした。案件を再読込してください。');
      setCases(previous => previous.filter(item => item.id !== result.deletedCaseId));
      updateWorkspace({ selectedId: currentWorkspace.current.selectedId === result.deletedCaseId ? '' : currentWorkspace.current.selectedId, deleteCaseId: '' });
      setNotice('下書きを削除しました。');
    } catch (caught) {
      if (!current()) return;
      if (caught instanceof OperationRequestError && (caught.status === 401 || caught.code === OWNER_CHANGED)) {
        showIdentity(null); if (caught.status === 401) setNeedsSignin(true);
      }
      setError(caught instanceof Error ? caught.message : '削除できませんでした。案件を再読込してください。');
    } finally { if (version === mutationGeneration.current) { saveInFlight.current = false; setBusy(false); } }
  }

  const signinRecovery = <section className={styles.empty} aria-label="サインインの復帰">
    <h2>サインインして案件を管理</h2>
    <p>入力は元のアカウント用にこの画面のメモリへ保持します。元のアカウントでサインイン後、接続を確認してください。案件と報酬の記録はあなたのアカウントだけに保存されます。</p>
    <Link href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_blank" rel="noopener noreferrer">別タブでサインイン <ArrowRight size={15} /></Link>
    <button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => void refresh()}>{loading ? '確認中…' : 'サインイン後に接続を確認'}</button>
  </section>;

  const saveRecovery = pendingSave && <section className={styles.empty} aria-label="保存結果の確認">
    <p>保存結果の確認中です。最初のアカウントで同じ記録IDを確認します。別アカウントには再送しません。</p>
    <p>{pendingOwnerStatus(pendingSave.ownerScope, ownerScope) === 'changed' ? OWNER_CHANGED_MESSAGE : '元のアカウントで接続を確認してください。'}</p>
    <Link href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_blank" rel="noopener noreferrer">別タブで元のアカウントにサインイン</Link>
    <p>保留を解除しても保存済みの記録は削除されません。元のアカウントで保存結果を確認してから、新しい保存を行ってください。入力本文は残ります。</p>
    <button type="button" disabled={busy} onClick={releasePending}>保留を解除（入力は保持）</button>
    <button type="button" disabled={busy || loading} onClick={() => void refresh()}>保存先の接続を確認</button>
    <button type="button" className={styles.secondary} disabled={busy || needsSignin || (!!ownerScope && pendingSave.ownerScope !== ownerScope)}
      onClick={() => void attemptSave(pendingSave, true)}>{busy ? '確認中…' : '同じ保存内容で結果を確認'}</button>
  </section>;

  return <WorkspaceShell title="ココナラ" tone="sky" contentClassName={styles.shell} hideTopActions>
    <div className={styles.root}>
      <div className={styles.toolAccess} onClickCapture={(event) => {
        if (locked && event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault();
      }}>
        {workspace ? <ZemaNavigation active="library" /> : <SkyLibrarySave toolId="coconala" returnTo={returnTo} disabled={locked} />}
      </div>
      <nav className={styles.skyNav} aria-label="ココナラの機能">
        <Link href={workspace ? '/zema/library' : '/sky'}><ArrowLeft size={15} />{workspace ? 'ライブラリへ戻る' : 'Skyへ戻る'}</Link>
        <button type="button" disabled={locked} aria-current={view === 'management' ? 'page' : undefined} onClick={() => setView('management')}>案件管理</button>
        <button type="button" disabled={locked} aria-current={view === 'check' ? 'page' : undefined} onClick={() => setView('check')}>応募前チェック</button>
      </nav>
      {parkedWork && <section className={styles.empty}><p>別のアカウントの未保存入力・未確認の保存をこの画面に保持しています。元のアカウントでサインインし、接続を確認すると再開できます。</p><button disabled={busy || loading} onClick={() => void refresh()}>保存先の接続を確認</button></section>}
      {dirty && !pendingSave && <section className={styles.empty}><p>未保存の入力を保持しています。閉じても同じアカウントで再開できます。</p><button disabled={locked} onClick={openForm}>未保存の入力を開く</button><button disabled={locked} onClick={discardDraft}>未保存の入力を破棄</button></section>}
      {!ownerScope && !needsSignin && <output>{OWNER_CHECK_REQUIRED}<button disabled={busy || loading} onClick={() => void refresh()}>保存先の接続を確認</button></output>}
      {view === 'check' ? <section className={styles.checkPanel} aria-label="ココナラ応募前チェック">
        <span className={styles.eyebrow}>COCONALA / BEFORE APPLYING</span>
        <h1>応募前に案件を確認</h1>
        <p>依頼文と提案文の条件を確認します。チェック結果は応募や受注の保証ではなく、ココナラへの送信も行いません。</p>
        <MrToolRunner tool="coconala" onRunningChange={() => undefined} />
      </section> : <>
      <header className={styles.hero}>
        <button
          type="button"
          className={styles.heroIcon}
          aria-label="ココナラの機能と利用方法を見る"
          aria-haspopup="dialog"
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen(true)}
        >
          <ToolIcon id="coconala" size={25} />
        </button>
        <div><span className={styles.eyebrow}>COCONALA / ORDER MANAGEMENT</span>
          <h1>受注から制作・支払いまで。</h1>
          <p>顧客との取引と、制作担当者への業務委託を分けて管理します。受注・契約・納品・送金は本人が各公式画面で行います。</p>
        </div>
        <button className={styles.primary} disabled={locked} onClick={openForm}><Plus size={17} />案件を作る</button>
      </header>

      <details className={styles.guidance}>
      <summary>報酬と取引条件の確認</summary>
      <div className={styles.policy}>
        <ShieldLine />
        <p>3%は自動控除ではなく、見積りの参考値です。担当者報酬・支払日を事前に明示し、再委託可否を案件ごとに確認してください。顧客入金が遅れても担当者への合意済み支払日を自動変更しません。</p>
      </div>
      <div className={styles.sources}>
        <a href="https://coconala.com/pages/guide_sell" target="_blank" rel="noreferrer">ココナラ販売手数料 <ExternalLink size={13} /></a>
        <a href="https://coconala.com/pages/terms_user" target="_blank" rel="noreferrer">ココナラ利用規約 <ExternalLink size={13} /></a>
        <a href="https://www.jftc.go.jp/freelancelaw_2025/" target="_blank" rel="noreferrer">公取委・フリーランス法 <ExternalLink size={13} /></a>
      </div>
      </details>

      {error && !formOpen && !deleteCaseId && <p className={styles.error} role="alert">{error}</p>}
      {!formOpen && saveRecovery}
      {notice && <output className={styles.notice}>{notice}</output>}
      {needsSignin ? signinRecovery :
        <div className={styles.layout}>
          <aside className={styles.list}>
            <div className={styles.listTitle}><strong>案件</strong><button aria-label="再読込" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} /></button></div>
            {loading ? <p>読み込み中…</p> : cases.length === 0 ? <p>案件はまだありません。まず受注条件と担当者への発注条件を登録してください。</p> : cases.map((item) =>
              <button key={item.id} disabled={locked} className={`${styles.caseButton} ${selected?.id === item.id ? styles.active : ''}`} onClick={() => setSelectedId(item.id)}>
                <strong>{item.terms.title}</strong><small>{item.terms.orderReference} · {statusNames[item.status]}</small>
              </button>)}
          </aside>

          {selected && <section className={styles.detail}>
            <div className={styles.detailHead}><div><span className={styles.eyebrow}>{statusNames[selected.status]}</span><h2>{selected.terms.title}</h2><p>案件参照 {selected.terms.orderReference} · 顧客 {selected.terms.clientLabel} · 担当 {selected.terms.workerName}</p></div>
              {selected.status === 'draft' && <div className={styles.actionRow}>
                <button className={styles.secondary} disabled={locked} onClick={() => editTerms(selected)}>条件を編集</button>
                <button className={styles.secondary} disabled={locked} onClick={() => { setError(''); setDeleteCaseId(selected.id); }}>下書きを削除</button>
              </div>}
            </div>
            <div className={styles.metrics}>
              <div><small>顧客受注額</small><strong>{yen(selected.terms.grossYen)}</strong></div>
              <div><small>手数料後の見込</small><strong>{yen(teamMoney(selected).estimatedNet)}</strong></div>
              <div><small>担当者の合意報酬</small><strong>{yen(selected.terms.workerFeeYen)}</strong></div>
              <div><small>運営の見込差額</small><strong>{yen(teamMoney(selected).estimatedOperatorMargin)}</strong></div>
            </div>
            <p className={styles.muted}>見込差額は販売手数料の概算だけを控除。税金・追加費用・修正・返金リスクは含みません。実売上・確定利益ではありません。</p>
            <div className={styles.termGrid}>
              <div><small>委託内容</small><p>{selected.terms.scope}</p></div>
              <div><small>納品・検査</small><p>{selected.terms.deliveryDate} / {selected.terms.deliveryPlace}<br />検査予定 {selected.terms.inspectionDate}</p></div>
              <div><small>修正・権利</small><p>{selected.terms.revisionScope}<br />{selected.terms.rights}</p></div>
              <div><small>担当者への支払期日</small><p>{selected.terms.workerPaymentDate}</p></div>
            </div>
            <details className={styles.evidence}><summary>発注前に確認した記録</summary><p>規約・再委託条件: {selected.terms.platformRulesReference}</p><p>顧客への説明: {selected.terms.customerDisclosureReference}</p><p>担当者への条件明示: {selected.terms.workerTermsReference}</p></details>

            <div className={styles.actionCard}><h3>仕事の進行</h3>
              {selected.status === 'draft' && <><p>記録を確認し、ココナラと担当者への外部連絡を本人が終えた後に進めます。このボタンは通知や契約送信をしません。</p><button className={styles.primary} disabled={locked} onClick={() => void act('assign')}>担当開始を記録 <ArrowRight size={16} /></button></>}
              {(selected.status === 'assigned' || selected.status === 'delivered') && <div className={styles.actionRow}><input disabled={locked} value={note} onChange={(e) => setNote(e.target.value)} placeholder={selected.status === 'assigned' ? '成果物を受領した記録・検査結果' : '顧客が検収した記録・日時'} /><button className={styles.primary} disabled={locked || !note.trim()} onClick={() => void act(selected.status === 'assigned' ? 'deliver' : 'accept', { note })}>{selected.status === 'assigned' ? '納品確認を記録' : '顧客検収を記録'}</button></div>}
              {selected.status === 'accepted' && <p className={styles.success}><CircleCheck size={16} />顧客検収を記録済み。入金と担当者支払いは別々に確認してください。</p>}
            </div>

            {selected.status !== 'draft' && <div className={styles.actionCard}><h3>入金・返金・担当者支払いの記録</h3><p>ここで入力する金額は手入力の記録です。ココナラ・銀行・Walletからの自動照合ではありません。担当者への支払いは顧客入金を条件にしません。</p>
              <div className={styles.moneySummary}><span>顧客入金（手入力） <b>{yen(teamMoney(selected).manuallyRecordedCustomerNet)}</b></span><span>担当者支払済（手入力） <b>{yen(teamMoney(selected).workerPaid)}</b></span><span>担当者未払 <b>{yen(teamMoney(selected).workerRemaining)}</b></span></div>
              <div className={styles.actionRow}><select disabled={locked} value={moneyKind} onChange={(e) => setMoneyKind(e.target.value as typeof moneyKind)}><option value="record_customer_receipt">顧客からの入金</option><option value="record_refund">顧客への返金</option><option value="record_worker_payment">担当者への支払い</option></select><input disabled={locked} type="number" min="1" step="1" value={moneyAmount} onChange={(e) => setMoneyAmount(e.target.value)} placeholder="金額（円）" /><input disabled={locked} value={moneyReference} onChange={(e) => setMoneyReference(e.target.value)} placeholder="外部明細・振込参照番号" /><button className={styles.secondary} disabled={locked || !moneyAmount || !moneyReference.trim()} onClick={() => void act(moneyKind, { amountYen: Number(moneyAmount), reference: moneyReference })}>記録する</button></div>
            </div>}
            <details className={styles.evidence}><summary>変更履歴（{selected.events.length}件）</summary>{selected.events.map((event) => <p key={event.id}>{new Date(event.at).toLocaleString('ja-JP')} · {event.note}</p>)}</details>
          </section>}
        </div>}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!locked) setFormOpen(open); }}>
      <DialogContent className={styles.modal} showCloseButton={false}><div className={styles.modalHead}><DialogTitle>{editingId ? '発注前の条件を編集' : '受託案件を登録'}</DialogTitle><button disabled={locked} onClick={() => setFormOpen(false)}>閉じる</button></div>
        <DialogDescription>この画面は案件管理の下書きです。ココナラでの契約、顧客・担当者への連絡、実送金は行いません。</DialogDescription>
        <form onSubmit={(event) => void save(event)}><div className={styles.formGrid}>{fields.map((field) => <label key={field.key}><span>{field.label}</span>{field.kind === 'textarea' ? <textarea required disabled={locked} value={String(form[field.key])} onChange={(e) => setForm((current) => ({ ...current, [field.key]: e.target.value }))} /> : <input required disabled={locked} type={field.kind ?? 'text'} min={field.kind === 'number' ? '0' : undefined} max={field.key === 'estimatedPlatformFeePercent' ? '100' : undefined} step={field.key === 'estimatedPlatformFeePercent' ? '0.01' : field.kind === 'number' ? '1' : undefined} value={form[field.key]} onChange={(e) => setForm((current) => ({ ...current, [field.key]: field.kind === 'number' ? Number(e.target.value) : e.target.value }))} />}{field.help && <small>{field.help}</small>}</label>)}</div>
          <div className={styles.formEstimate}><span>手数料後見込 <b>{yen(estimate.net)}</b></span><span>運営の見込差額 <b>{yen(estimate.margin)}</b></span><button type="button" disabled={locked} onClick={() => setForm((current) => { const net = current.grossYen - Math.round(current.grossYen * current.estimatedPlatformFeePercent / 100); return { ...current, workerFeeYen: Math.max(0, net - Math.round(net * .03)) }; })}>参考: 見込手取りの3%を残す</button></div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {saveRecovery}
          {needsSignin && signinRecovery}
          <button className={styles.primary} disabled={locked || needsSignin || !ownerScope}>{busy ? '保存中…' : '下書きとして保存'}</button></form>
      </DialogContent></Dialog>
      <Dialog open={Boolean(deleteCaseId)} onOpenChange={(open) => { if (!locked && !open) setDeleteCaseId(''); }}>
        <DialogContent className={`${styles.modal} ${styles.deleteModal}`} showCloseButton={false}>
          <DialogTitle>この下書きを削除しますか？</DialogTitle>
          <DialogDescription>Skyに保存したこの下書きと変更履歴を削除します。取り消せません。ココナラの契約やメッセージは変更しません。</DialogDescription>
          <p className={styles.deleteTitle}>{deleteTarget?.terms.title ?? '案件を再読込してください。'}</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {needsSignin && signinRecovery}
          <div className={styles.actionRow}>
            <button className={styles.secondary} disabled={locked} onClick={() => setDeleteCaseId('')}>削除せず戻る</button>
            {error && <button className={styles.secondary} disabled={locked} onClick={() => { setDeleteCaseId(''); void refresh(); }}>閉じて再読込</button>}
            <button className={styles.primary} disabled={locked || needsSignin || !deleteTarget} onClick={() => void deleteDraft()}>{busy ? '削除中…' : 'この下書きを削除'}</button>
          </div>
        </DialogContent>
      </Dialog>
      </>}
    </div>
    <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
      {coconalaTool && <SkyToolOverview tool={coconalaTool} state={skyToolUiState(coconalaTool)} />}
    </Dialog>
  </WorkspaceShell>;
}

function ShieldLine() { return <span aria-hidden="true" className={styles.policyIcon}>!</span>; }
