'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
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
  teamMoney, type TeamCase, type TeamTerms,
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

async function request<T>(method = 'GET', value?: unknown): Promise<T> {
  return operationRequest<T>('/api/coconala-team', method, value);
}

type PendingSave = {
  method: 'POST' | 'PATCH';
  value: { id: string; terms: TeamTerms } | {
    caseId: string; revision: number; command: Record<string, unknown>;
  };
  fromForm: boolean;
  notice: string;
};

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
  const [cases, setCases] = useState<TeamCase[]>([]);
  const [form, setForm] = useState<TeamTerms>(blank);
  const [editingId, setEditingId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [deleteCaseId, setDeleteCaseId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [note, setNote] = useState('');
  const [moneyKind, setMoneyKind] = useState<'record_customer_receipt' | 'record_refund' | 'record_worker_payment'>('record_customer_receipt');
  const [moneyAmount, setMoneyAmount] = useState('');
  const [moneyReference, setMoneyReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsSignin, setNeedsSignin] = useState(false);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const saveInFlight = useRef(false);
  const listGeneration = useRef(0);
  const locked = busy || pendingSave !== null;

  usePendingSaveNavigation(pendingSave !== null);

  const refresh = useCallback(async () => {
    if (saveInFlight.current) return;
    const version = ++listGeneration.current;
    setLoading(true);
    try {
      const result = await request<{ cases: TeamCase[] }>();
      if (version !== listGeneration.current) return;
      setCases(result.cases);
      setNeedsSignin(false);
      setError('');
    } catch (caught) {
      if (version !== listGeneration.current) return;
      if (caught instanceof OperationRequestError && caught.status === 401) {
        setNeedsSignin(true); setCases([]);
      }
      setError(caught instanceof Error ? caught.message : '案件を読み込めませんでした。');
    } finally { if (version === listGeneration.current) setLoading(false); }
  }, []);

  useEffect(() => {
    const generation = listGeneration;
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => { window.clearTimeout(timeout); generation.current++; };
  }, [refresh]);

  const selected = cases.find((item) => item.id === selectedId) ?? cases[0] ?? null;
  const deleteTarget = cases.find((item) => item.id === deleteCaseId);
  const estimate = useMemo(() => {
    const fee = Math.round(form.grossYen * form.estimatedPlatformFeePercent / 100);
    return { net: form.grossYen - fee, margin: form.grossYen - fee - form.workerFeeYen };
  }, [form]);

  function updateCase(next: TeamCase) {
    setCases((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    setSelectedId(next.id);
  }

  async function attemptSave(operation: PendingSave) {
    if (saveInFlight.current || busy) return;
    saveInFlight.current = true;
    // Earlier list snapshots must not replace a confirmed mutation or undo 401.
    listGeneration.current++; setLoading(false);
    setPendingSave(operation);
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ caseFile: TeamCase }>(operation.method, operation.value);
      const expectedId = 'id' in operation.value ? operation.value.id : operation.value.caseId;
      if (!result.caseFile || result.caseFile.id !== expectedId ||
          !Number.isSafeInteger(result.caseFile.revision) || !result.caseFile.terms ||
          !Array.isArray(result.caseFile.events))
        throw new Error('保存結果を確認できません。同じ内容でもう一度確認してください。');
      updateCase(result.caseFile);
      setNeedsSignin(false);
      setPendingSave(null);
      setNotice(operation.notice);
      if (operation.fromForm) {
        setFormOpen(false); setEditingId(''); setForm(blank);
      } else {
        setNote(''); setMoneyAmount(''); setMoneyReference('');
      }
    } catch (caught) {
      if (caught instanceof OperationRequestError) {
        if (caught.status === 401) { setNeedsSignin(true); setCases([]); }
        // Validation/conflict responses are definitive. Network/server failures
        // retain the exact operation, including its original revision and ID.
        if ([400, 404, 409, 413, 415].includes(caught.status)) setPendingSave(null);
      }
      setError(caught instanceof Error ? caught.message : '保存できませんでした。');
    } finally { saveInFlight.current = false; setBusy(false); }
  }

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    const current = cases.find((item) => item.id === editingId);
    if (editingId && !current) { setError('下書きを再読込してください。'); return; }
    await attemptSave(current ? {
      method: 'PATCH', fromForm: true,
      value: { caseId: current.id, revision: current.revision,
        command: { id: crypto.randomUUID(), action: 'update_terms', terms: { ...form } } },
      notice: '発注前の条件を更新しました。',
    } : {
      method: 'POST', fromForm: true,
      value: { id: crypto.randomUUID(), terms: { ...form } },
      notice: '案件を下書き保存しました。内容と証拠を確認してから担当開始を記録してください。',
    });
  }

  async function act(action: string, payload: Record<string, unknown> = {}) {
    if (!selected || locked) return;
    await attemptSave({
      method: 'PATCH', fromForm: false,
      value: { caseId: selected.id, revision: selected.revision,
        command: { id: crypto.randomUUID(), action, ...payload } },
      notice: '記録を保存しました。外部サイトへの送信・銀行振込は行っていません。',
    });
  }

  async function deleteDraft() {
    if (!deleteTarget || locked || needsSignin) return;
    listGeneration.current++; setLoading(false);
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ deletedCaseId: string }>('DELETE', {
        caseId: deleteTarget.id, revision: deleteTarget.revision,
      });
      if (result.deletedCaseId !== deleteTarget.id) throw new Error('削除結果を確認できませんでした。案件を再読込してください。');
      setCases((current) => current.filter((item) => item.id !== result.deletedCaseId));
      setSelectedId((current) => current === result.deletedCaseId ? '' : current);
      setDeleteCaseId('');
      setNotice('下書きを削除しました。');
    } catch (caught) {
      if (caught instanceof OperationRequestError && caught.status === 401) setNeedsSignin(true);
      setError(caught instanceof Error ? caught.message : '削除できませんでした。案件を再読込してください。');
    } finally { setBusy(false); }
  }

  const signinRecovery = <section className={styles.empty} aria-label="サインインの復帰">
    <h2>サインインして案件を管理</h2>
    <p>入力はこの画面に残ります。別タブでサインイン後、接続を確認してください。案件と報酬の記録はあなたのアカウントだけに保存されます。</p>
    <Link href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_blank" rel="noopener noreferrer">別タブでサインイン <ArrowRight size={15} /></Link>
    <button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => void refresh()}>{loading ? '確認中…' : 'サインイン後に接続を確認'}</button>
  </section>;

  const saveRecovery = pendingSave && <section className={styles.empty} aria-label="保存結果の確認">
    <p>保存結果の確認中です。この画面を開いたまま、同じ内容で確認してください。案件や金額を二重に記録しません。</p>
    <button type="button" className={styles.secondary} disabled={busy || needsSignin}
      onClick={() => void attemptSave(pendingSave)}>{busy ? '確認中…' : '同じ保存内容で結果を確認'}</button>
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
        <button className={styles.primary} disabled={locked} onClick={() => { setForm(blank); setEditingId(''); setFormOpen(true); }}><Plus size={17} />案件を作る</button>
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
                <button className={styles.secondary} disabled={locked} onClick={() => { setForm(selected.terms); setEditingId(selected.id); setFormOpen(true); }}>条件を編集</button>
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

      <Dialog open={formOpen} onOpenChange={(open) => { if (!locked) { setFormOpen(open); if (!open) setEditingId(''); } }}>
      <DialogContent className={styles.modal} showCloseButton={false}><div className={styles.modalHead}><DialogTitle>{editingId ? '発注前の条件を編集' : '受託案件を登録'}</DialogTitle><button disabled={locked} onClick={() => { setFormOpen(false); setEditingId(''); }}>閉じる</button></div>
        <DialogDescription>この画面は案件管理の下書きです。ココナラでの契約、顧客・担当者への連絡、実送金は行いません。</DialogDescription>
        <form onSubmit={(event) => void save(event)}><div className={styles.formGrid}>{fields.map((field) => <label key={field.key}><span>{field.label}</span>{field.kind === 'textarea' ? <textarea required disabled={locked} value={String(form[field.key])} onChange={(e) => setForm((current) => ({ ...current, [field.key]: e.target.value }))} /> : <input required disabled={locked} type={field.kind ?? 'text'} min={field.kind === 'number' ? '0' : undefined} max={field.key === 'estimatedPlatformFeePercent' ? '100' : undefined} step={field.key === 'estimatedPlatformFeePercent' ? '0.01' : field.kind === 'number' ? '1' : undefined} value={form[field.key]} onChange={(e) => setForm((current) => ({ ...current, [field.key]: field.kind === 'number' ? Number(e.target.value) : e.target.value }))} />}{field.help && <small>{field.help}</small>}</label>)}</div>
          <div className={styles.formEstimate}><span>手数料後見込 <b>{yen(estimate.net)}</b></span><span>運営の見込差額 <b>{yen(estimate.margin)}</b></span><button type="button" disabled={locked} onClick={() => setForm((current) => { const net = current.grossYen - Math.round(current.grossYen * current.estimatedPlatformFeePercent / 100); return { ...current, workerFeeYen: Math.max(0, net - Math.round(net * .03)) }; })}>参考: 見込手取りの3%を残す</button></div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {saveRecovery}
          {needsSignin && signinRecovery}
          <button className={styles.primary} disabled={locked || needsSignin}>{busy ? '保存中…' : '下書きとして保存'}</button></form>
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
