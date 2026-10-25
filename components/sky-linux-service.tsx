'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { operationRequest, OperationRequestError } from '@/lib/operations-client';
import { SkyNotice } from './sky-feedback';
import WorkspaceShell from './workspace-shell';
import type {
  LinuxWorkspace,
  LinuxListing,
  LinuxTerms,
} from '@/lib/sky-linux-service';
import styles from './sky-linux-service.module.css';
type View = {
  eligibleOrders: { orderId: string; deviceRef: string; expiresAt: number }[];
  enabled: boolean;
  terms: LinuxTerms | null;
  termsDigest: string | null;
  catalog: LinuxListing[];
  workspace: { revision: number; payload: LinuxWorkspace } | null;
  access: { canRead: boolean; canExport: boolean; canExecute: boolean; reason: string | null } | null;
  currentMonthMaximumMinor: number | null;
  creatorEarnings: {
    period: string;
    state: string;
    grossMinor: number;
    commissionMinor: number;
    payableMinor: number;
    transferRef: string | null;
    recoveryRequired: boolean;
  }[];
};
type OwnerContext = { ownerId: string; workspaceId: string; orderId: string; deviceRef: string };
type Confirmation = {
  action: string; requestId?: string; owner?: OwnerContext; orderId?: string; deviceRef?: string;
  saved: boolean; revision: number | null;
};
type ReadState = 'loading' | 'ready' | 'pending' | 'unavailable' | 'signin' | 'changed';
const dollars = (minor: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'USD' }).format(
    minor / 100,
  );
export default function SkyLinuxService() {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [orderId, setOrder] = useState(''),
    [deviceRef, setDevice] = useState(''),
    [agreed, setAgreed] = useState(false);
  const [query, setQuery] = useState(''),
    [selected, setSelected] = useState(''),
    [input, setInput] = useState(''),
    [max, setMax] = useState('1.00');
  const [listingJson, setListingJson] = useState(''),
    [rights, setRights] = useState(false);
  const [runAgreed, setRunAgreed] = useState(false);
  const [readState, setReadState] = useState<ReadState>('loading');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const live = useRef(true), generation = useRef(0), readVersion = useRef(0), mutationLock = useRef(false);
  const currentView = useRef<View | null>(null), currentState = useRef<ReadState>('loading');
  const owner = useRef<OwnerContext | null>(null), pending = useRef<Confirmation | null>(null);
  const visible = () => typeof document !== 'undefined' && document.visibilityState === 'visible';
  const active = (version: number) => live.current && visible() && version === generation.current;
  function status(value: ReadState) { currentState.current = value; setReadState(value); }
  function show(value: View | null) { currentView.current = value; setView(value); }
  function confirm(value: Confirmation | null) { pending.current = value; setConfirmation(value); }
  function clearPrivate() {
    show(null); setOrder(''); setDevice(''); setAgreed(false); setSelected('');
    setInput(''); setRunAgreed(false); setListingJson(''); setRights(false);
  }
  function restrict(reason: 'signin' | 'changed' | 'unavailable') {
    generation.current++; readVersion.current++; mutationLock.current = false;
    if (reason === 'unavailable') show(null);
    else clearPrivate();
    setBusy(false); setError(''); status(reason);
  }
  const canMutate = () => live.current && visible() && currentState.current === 'ready' &&
    !!view && view === currentView.current && !mutationLock.current && !pending.current;
  function matches(context: OwnerContext, workspace: LinuxWorkspace) {
    return context.ownerId === workspace.ownerId && context.workspaceId === workspace.id &&
      context.orderId === workspace.orderId && context.deviceRef === workspace.deviceRef;
  }
  async function refresh(message = '') {
    if (!live.current || !visible() || mutationLock.current) return;
    const version = generation.current, read = ++readVersion.current;
    show(null); status(pending.current ? 'pending' : 'loading');
    try {
      const data = await operationRequest<View>('/api/sky/linux');
      if (!active(version) || read !== readVersion.current) return;
      if (!data || !Array.isArray(data.catalog) || !Array.isArray(data.eligibleOrders) ||
        !Array.isArray(data.creatorEarnings) || (data.workspace !== null &&
          (!data.workspace || !Number.isSafeInteger(data.workspace.revision) || data.workspace.revision < 0 ||
            !data.workspace.payload || data.access?.canRead !== true))) throw Error('invalid current view');
      const workspace = data.workspace?.payload;
      if (workspace && ![workspace.id, workspace.ownerId, workspace.orderId, workspace.deviceRef]
        .every(value => typeof value === 'string' && value.length > 0)) throw Error('invalid owner context');
      if (workspace && owner.current && !matches(owner.current, workspace)) { restrict('changed'); return; }
      const expected = pending.current;
      if (expected) {
        if (workspace && ((expected.owner && !matches(expected.owner, workspace)) ||
          (!expected.owner && (expected.orderId !== workspace.orderId || expected.deviceRef !== workspace.deviceRef)))) {
          restrict('changed'); return;
        }
        if (!workspace || !expected.saved || expected.revision === null ||
          data.workspace!.revision < expected.revision ||
          (expected.action === 'run' && !workspace.jobs?.some(job => job.id === expected.requestId))) {
          status('pending'); setError(''); return;
        }
        confirm(null);
      } else if (!workspace && owner.current) {
        // A missing private body is not proof the previous contract disappeared.
        status('unavailable'); setError('保存データの現在の表示を確認できません。状態を更新してください。'); return;
      }
      if (workspace) owner.current = { ownerId: workspace.ownerId, workspaceId: workspace.id,
        orderId: workspace.orderId, deviceRef: workspace.deviceRef };
      show(data); status('ready'); setError(message);
    } catch (error) {
      if (!active(version) || read !== readVersion.current) return;
      if (error instanceof OperationRequestError && [401, 403].includes(error.status)) { restrict('signin'); return; }
      show(null); status('unavailable'); setError('現在の表示を確認できません。自動再送せず、状態を更新してください。');
    }
  }
  useEffect(() => {
    live.current = true;
    const liveRef = live, generationRef = generation, readRef = readVersion;
    void refresh();
    // Existing connection-check event and browser lifecycle invalidate old replies.
    // HttpOnly account changes are observable here only at these boundaries or a new server view.
    const hide = () => restrict('unavailable');
    const recheck = () => { restrict('unavailable'); void refresh(); };
    const visibilityChanged = () => {
      if (visible()) recheck();
      else {
        restrict('unavailable');
        clearPrivate();
      }
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('blur', hide);
    window.addEventListener('focus', recheck);
    window.addEventListener('pageshow', recheck);
    window.addEventListener('sky-execution-access-check', recheck);
    return () => {
      liveRef.current = false; generationRef.current++; readRef.current++;
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('blur', hide);
      window.removeEventListener('focus', recheck);
      window.removeEventListener('pageshow', recheck);
      window.removeEventListener('sky-execution-access-check', recheck);
    };
  }, []);
  async function act(value: Record<string, unknown>) {
    if (!canMutate()) return;
    const before = currentView.current!, version = generation.current;
    if (value.action === 'accept' && !before.eligibleOrders.some(choice =>
      choice.orderId === value.orderId && choice.deviceRef === value.deviceRef)) return;
    const expected: Confirmation = { action: typeof value.action === 'string' ? value.action : '', saved: false, revision: null,
      ...(owner.current ? { owner: owner.current } : { orderId: typeof value.orderId === 'string' ? value.orderId : '', deviceRef: typeof value.deviceRef === 'string' ? value.deviceRef : '' }),
      ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}) };
    mutationLock.current = true; readVersion.current++;
    confirm(expected); show(null); status('pending'); setBusy(true); setError('');
    let readBack = false, validationMessage = '';
    try {
      const data = await operationRequest<{ accepted?: boolean; revision?: number; listing?: unknown }>(
        '/api/sky/linux', 'POST', { ...value, revision: before.workspace?.revision });
      if (!active(version)) return;
      if (value.action === 'register' && data.listing) confirm(null);
      else if (data.accepted === true && Number.isSafeInteger(data.revision) &&
        (data.revision as number) >= (before.workspace?.revision ?? 0))
        confirm({ ...expected, saved: true, revision: data.revision! });
      readBack = true;
    } catch (error) {
      if (!active(version)) return;
      if (error instanceof OperationRequestError && error.status >= 400 && error.status < 500) {
        confirm(null);
        if ([401, 403].includes(error.status)) restrict('signin');
        else if (error.code === 'OWNER_CHANGED') restrict('changed');
        else { validationMessage = error.message; readBack = true; }
      } else {
        status('unavailable'); setError('操作の保存結果が不明です。再送せず、元のアカウントで状態を確認してください。');
      }
    } finally {
      if (active(version)) { mutationLock.current = false; setBusy(false); }
    }
    if (readBack && active(version)) await refresh(validationMessage);
  }
  function download(name: string, value: unknown) {
    if (!canMutate()) return;
    const url = URL.createObjectURL(
      new Blob(
        [typeof value === 'string' ? value : JSON.stringify(value, null, 2)],
        { type: 'text/plain;charset=utf-8' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function payment(invoiceId: string, action: 'collect' | 'reconcile') {
    if (!canMutate()) return;
    const version = generation.current;
    mutationLock.current = true; readVersion.current++; setBusy(true); setError('');
    try {
      const data = await operationRequest<{ url?: string }>('/api/sky/linux/payments', 'POST', { invoiceId, action });
      if (!active(version)) return;
      if (data.url) {
        const url = new URL(data.url);
        if (url.protocol !== 'https:' || url.hostname !== 'invoice.stripe.com') throw Error('請求書URLを確認できません。');
        window.location.assign(url.href);
      } else {
        mutationLock.current = false;
        await refresh();
      }
    } catch (error) {
      if (!active(version)) return;
      if (error instanceof OperationRequestError && [401, 403].includes(error.status)) restrict('signin');
      else { show(null); status('unavailable'); setError('支払いの状態を確認できません。再送せず状態を更新してください。'); }
    } finally { if (active(version)) { mutationLock.current = false; setBusy(false); } }
  }
  const workspace = view?.workspace?.payload,
    terms = workspace?.terms ?? view?.terms;
  const catalog =
    view?.catalog.filter((l) =>
      `${l.agent.name} ${l.agent.instructions} ${l.model.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) ?? [];
  return (
    <WorkspaceShell title="Skyの専用Linux" tone="sky">
      <div className={styles.page}>
        <Link href="/sky/marketplace">← Sky Market</Link>
        <header>
          <p>LLM・Agentを選んで、自分の仕事に追加</p>
          <h1>Sky Linux 16</h1>
          <p className={styles.price}>
            月額 $16 <span>SI・Linuxの利用枠付き</span>
          </p>
          <p>
            含まれる利用枠を超えた分だけ、事前単価と承認した上限で計算します。枠の量と超過単価は準備中です。支払いが止まると新しい実行を制限し、設定と成果を保持します。
          </p>
        </header>
        {confirmation && <output>
          {confirmation.saved ? `操作を保存しました（保存版 ${confirmation.revision}）。現在の表示を再確認しています。`
            : '操作の保存結果を確認中です。自動再送しません。'}
          <p>この表示だけでは、閲覧権限・契約の利用開始・入金・仕事の完了は確認できません。</p>
        </output>}
        {readState === 'signin' && <p role="alert">現在の閲覧権限を確認できません。サインインを確認してから状態を更新してください。</p>}
        {readState === 'changed' && <p role="alert">アカウントまたは契約の表示先が変わりました。元のアカウントで本人を再確認してください。</p>}
        {error && <SkyNotice message={error} className={styles.notice} />}
        {readState !== 'ready' && <p>保存データと現在の費用は再確認待ちです。新しい契約・依頼・請求操作は開始しません。</p>}
        <button
          disabled={busy}
          onClick={() => void refresh()}
        >
          状態を更新
        </button>
        {readState === 'ready' && visible() && <>
        {!view?.enabled && (
          <p className={styles.notice}>
            この環境は契約・実行先・決済の受入準備中です。まだ契約や請求を開始しません。
          </p>
        )}
        {terms && (
          <section>
            <h2>料金と契約</h2>
            <p>
              基本料金 {dollars(terms.baseMinor)} / 月。CPUの実使用{' '}
              {terms.cpuUnitMs / 1000} 秒ごとに {dollars(terms.cpuUnitMinor)}
              。月内の対象使用量を合算して端数を切り上げます。
            </p>
            <p>
              月額に含まれるCPU利用枠 {terms.includedCpuMs / 1000}{' '}
              秒。Agent利用料は各商品の表示額です。月間上限{' '}
              {dollars(terms.monthlyCapMinor)}。支払期限は翌月開始から{' '}
              {terms.graceDays} 日。保持期間は契約上 {terms.retentionDays}{' '}
              日です。
            </p>
            <a href={terms.termsUrl} target="_blank" rel="noreferrer">
              契約条件を読む
            </a>
            {workspace ? (
              <>
                <p>
                  契約ID {workspace.id} / 料金版 {terms.version}
                </p>
                <p>
                  {view?.access?.canExecute
                    ? '専用LinuxはAdd済みです。'
                    : '専用LinuxのAddを停止中です。設定と成果を回収できます。'}
                </p>
                <button
                  onClick={() =>
                    download('Skyの電子契約.json', {
                      schema: 'sky.private-agreement-export/1',
                      agreement: {
                        schema: 'sky.linux-agreement/1',
                        id: workspace.id,
                        ownerId: workspace.ownerId,
                        deviceRef: workspace.deviceRef,
                        orderId: workspace.orderId,
                        mode: workspace.mode,
                        terms: workspace.terms,
                        acceptedAt: workspace.acceptedAt,
                      },
                      contractDigest: workspace.contractDigest,
                      proofSalt: workspace.proofSalt,
                      proofCommitment: workspace.proofCommitment,
                      chainStatus: 'not_published',
                    })
                  }
                >
                  電子契約と証明を保存
                </button>
                <button onClick={() => download('Skyのデータ.json', workspace)}>
                  設定・仕事・成果を持ち出す
                </button>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!canMutate()) return;
                  void act({
                    action: 'accept',
                    orderId,
                    deviceRef,
                    termsDigest: view?.termsDigest,
                    accepted: agreed,
                  });
                }}
              >
                <label>
                  確認済みのサービス利用権
                  <select
                    required
                    value={orderId}
                    onChange={(e) => {
                      const choice = view?.eligibleOrders.find(
                        (c) => c.orderId === e.target.value,
                      );
                      setOrder(choice?.orderId ?? '');
                      setDevice(choice?.deviceRef ?? '');
                      setAgreed(false);
                    }}
                  >
                    <option value="">選択してください</option>
                    {view?.eligibleOrders.map((choice, index) => (
                      <option key={choice.orderId} value={choice.orderId}>
                        購入済みサービス {index + 1} / 導入確認済み
                      </option>
                    ))}
                  </select>
                </label>
                {!view?.eligibleOrders.length && (
                  <p>
                    <Link href="/sky/purchases">
                      購入履歴からeSIMの導入を確認してください。
                    </Link>
                  </p>
                )}
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  月額・従量単価・上限・停止と保持条件に同意します
                </label>
                <button disabled={busy || !agreed || !view?.enabled}>
                  eSIMの利用権を確認して契約する
                </button>
              </form>
            )}
          </section>
        )}
        <section>
          <h2>モデル・Agentを探す</h2>
          <input
            aria-label="モデルとAgentを検索"
            placeholder="用途・AI名で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={styles.cards}>
            {catalog.map((l) => (
              <article key={l.id}>
                <h3>{l.agent.name}</h3>
                <p>{l.agent.instructions}</p>
                <p>
                  {l.model.name} / {l.model.license} / 約
                  {Math.ceil(l.model.bytes / 1024 ** 2)} MB
                </p>
                <p>
                  Agent利用料 {dollars(l.authorFeeMinor)} / 成功した実行 ＋
                  Linuxの使用料
                </p>
                <a href={l.model.source} target="_blank" rel="noreferrer">
                  モデルの配布元
                </a>
                <button
                  disabled={busy || !view?.access?.canExecute}
                  onClick={() => void act({ action: 'add', listingId: l.id })}
                >
                  {workspace?.attachments.includes(l.id)
                    ? 'Add済み'
                    : '自分のLinuxへAdd'}
                </button>
              </article>
            ))}
          </div>
          {!catalog.length && (
            <p>
              現在利用できる登録はありません。審査済みのPackageと実行先を確認してから掲載します。
            </p>
          )}
        </section>
        {workspace && (
          <section>
            <h2>依頼する</h2>
            <p>
              今月の基本料金・確定使用分・実行中の予約上限：
              {view?.currentMonthMaximumMinor == null ? '現在の費用は未確認' : dollars(view.currentMonthMaximumMinor)}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!canMutate()) return;
                if (!/^\d{1,6}(\.\d{1,2})?$/.test(max)) {
                  setError('今回の上限額をセント単位で入力してください。');
                  return;
                }
                const [whole, fraction = ''] = max.split('.');
                const cents =
                  Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
                void act({
                  action: 'run',
                  listingId: selected,
                  requestId: crypto.randomUUID(),
                  input,
                  maximumMinor: cents,
                  cpuLimitMs: 170000,
                  accepted: runAgreed,
                });
                setRunAgreed(false);
              }}
            >
              <label>
                担当
                <select
                  required
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setRunAgreed(false);
                  }}
                >
                  <option value="">選択してください</option>
                  {view?.catalog
                    .filter((l) => workspace.attachments.includes(l.id))
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.agent.name} / {l.model.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                依頼
                <textarea
                  required
                  maxLength={4000}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setRunAgreed(false);
                  }}
                />
              </label>
              <label>
                今回の追加料金の上限（米ドル）
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={max}
                  onChange={(e) => {
                    setMax(e.target.value);
                    setRunAgreed(false);
                  }}
                />
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={runAgreed}
                  onChange={(e) => setRunAgreed(e.target.checked)}
                />
                料金・保存・実行内容を確認しました
              </label>
              <button
                disabled={busy || !view?.access?.canExecute || !runAgreed}
              >
                この担当に依頼する
              </button>
            </form>
          </section>
        )}
        {workspace && (
          <section>
            <h2>仕事と成果</h2>
            {workspace.jobs.map((j) => (
              <article key={j.id}>
                <h3>{j.listing.agent.name}</h3>
                <p>
                  {j.state === 'review'
                    ? '下書きの確認待ち'
                    : j.state === 'queued'
                      ? '実行待ち'
                      : j.state === 'running'
                        ? '実行中'
                        : j.state === 'cancel_requested'
                          ? '停止の確認中'
                          : j.state === 'cancelled'
                            ? '停止済み'
                            : j.state === 'completed'
                              ? '確認済み'
                              : '結果を照合中'}
                </p>
                <p>
                  実行予約上限 {dollars(j.reservedMinor)} / 確定使用分{' '}
                  {dollars(j.computeMinor + j.authorMinor)}
                </p>
                {j.run.text && (
                  <>
                    <pre>{j.run.text}</pre>
                    <button
                      onClick={() => download('Skyの成果.txt', j.run.text!)}
                    >
                      文章で保存
                    </button>
                  </>
                )}
                {j.state === 'review' && (
                  <button
                    disabled={busy}
                    onClick={() => void act({ action: 'confirm', jobId: j.id })}
                  >
                    内容を確認した
                  </button>
                )}
                {['queued', 'running', 'cancel_requested'].includes(
                  j.state,
                ) && (
                  <button
                    disabled={busy}
                    onClick={() => void act({ action: 'cancel', jobId: j.id })}
                  >
                    仕事を停止する
                  </button>
                )}
              </article>
            ))}
          </section>
        )}
        {workspace && (
          <section>
            <h2>月ごとの請求と作者への配分</h2>
            {workspace.invoices.map((i) => (
              <article key={i.id}>
                <h3>
                  {i.period}：{dollars(i.amountMinor)}
                </h3>
                <p>
                  基本 {dollars(i.baseMinor)} / Linux {dollars(i.computeMinor)}{' '}
                  / Agent {dollars(i.authorMinor)} /{' '}
                  {i.state === 'paid'
                    ? '入金確認済み'
                    : i.state === 'reversed'
                      ? '返金・異議の照合中'
                      : '未入金'}
                </p>
                <p>
                  作者への精算対象{' '}
                  {dollars(
                    i.allocations.reduce((s, a) => s + a.payableMinor, 0),
                  )}
                  。実際の送金は入金と提供元の記録を照合して確定します。
                </p>
                {i.state === 'open' && (
                  <button
                    disabled={busy}
                    onClick={() => void payment(i.id, 'collect')}
                  >
                    支払い方法・請求書を開く
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => void payment(i.id, 'reconcile')}
                >
                  入金状態を確認
                </button>
              </article>
            ))}
            <Link href="/sky/payments">支払いと明細</Link>
          </section>
        )}
        {!!view?.creatorEarnings.length && (
          <section>
            <h2>自分のAgentの収益</h2>
            {view.creatorEarnings.map((e, index) => (
              <article key={index}>
                <p>
                  {e.period} / 利用料 {dollars(e.grossMinor)} / Sky手数料{' '}
                  {dollars(e.commissionMinor)} / 作者分{' '}
                  {dollars(e.payableMinor)}
                </p>
                <p>
                  {e.recoveryRequired
                    ? '返金に伴う送金の取消確認中'
                    : e.transferRef
                      ? '送金確認済み'
                      : e.state === 'paid'
                        ? '入金済み・精算待ち'
                        : '利用料の入金待ち'}
                </p>
              </article>
            ))}
          </section>
        )}
        <details>
          <summary>作者としてLLM・Agentを登録する</summary>
          <p>
            <Link href="/studio">Studio</Link>
            の審査済みPackageに、対応モデル・担当設定・Agent利用料を結びます。既存版は上書きしません。
          </p>
          <label>
            登録定義JSON
            <textarea
              aria-label="登録定義JSON"
              value={listingJson}
              onChange={(e) => setListingJson(e.target.value)}
              placeholder="Package ID、版のhash、対応AIと担当の設定"
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
            />
            配布と商用利用の権利・利用料を確認しました
          </label>
          <button
            disabled={busy || !rights}
            onClick={() => {
              try {
                void act({
                  action: 'register',
                  listing: JSON.parse(listingJson),
                  rightsAccepted: rights,
                });
              } catch {
                setError('登録定義のJSON形式を確認してください。');
              }
            }}
          >
            登録する
          </button>
        </details>
        </>}
      </div>
    </WorkspaceShell>
  );
}
