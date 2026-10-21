'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in requires top-level navigation. */

import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { pendingOwnerStatus, isDefinitivePendingSaveFailure } from '@/lib/pending-owner-intent';
import { readOwnerScope, OWNER_SCOPE_HEADER, OWNER_CHANGED, OWNER_CHECK_REQUIRED, OWNER_CHANGED_MESSAGE } from '@/lib/owner-intent';
import {
  ArrowRight,
  BadgeJapaneseYen,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  LoaderCircle,
  PackageCheck,
  ShieldCheck,
  Store,
  WalletCards,
} from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import { usePendingSaveNavigation } from '@/components/use-pending-save-navigation';
import { ExecutionSignin, useExecutionAccess } from '@/components/execution-access';
import { operationRequest, OperationRequestError } from '@/lib/operations-client';
import type { MercariRevenuePlan } from '@/lib/mercari-revenue';

type PendingCreate = { ownerScope: string; payload: Record<string, unknown> };
type Response = {
  ownerScope?: string;
  plans: MercariRevenuePlan[];
  readiness: {
    consumerAssisted: 'ready';
    shopsApi: string;
    verifiedSettlement: string;
    directSiteApiCall: false;
  };
};

const yen = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const statusLabel: Record<MercariRevenuePlan['status'], string> = {
  review: '原稿確認待ち',
  approved: '出品承認済み',
  listed: '出品済み',
  awaiting_provider_verification: '取引完了・公式確認待ち',
  cancelled: '終了',
};

const emptyDraft = {
  channel: 'consumer_assisted', title: '', condition: '', facts: '', priceJPY: '',
  marketplaceFeeJPY: '', shippingJPY: '', itemCostJPY: '0', otherCostJPY: '0',
  ownsStock: '', accurate: '', prohibitedChecked: '',
};
type Draft = typeof emptyDraft;
function draftFromForm(form: FormData): Draft {
  return Object.fromEntries(Object.keys(emptyDraft).map((key) => { const value = form.get(key); return [key, typeof value === 'string' ? value : '']; })) as Draft;
}
function dirtyDraft(draft: Draft) {
  return (Object.keys(emptyDraft) as Array<keyof Draft>).some((key) => draft[key].trim() !== emptyDraft[key]);
}
function isPlan(value: unknown): value is MercariRevenuePlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  return ['id', 'title', 'condition', 'facts', 'listingDraft', 'createdAt', 'updatedAt'].every((key) => typeof plan[key] === 'string') &&
    ['consumer_assisted', 'shops_connector'].includes(String(plan.channel)) &&
    typeof plan.status === 'string' && Object.hasOwn(statusLabel, plan.status) &&
    ['revision', 'priceJPY', 'marketplaceFeeJPY', 'shippingJPY', 'itemCostJPY', 'otherCostJPY', 'expectedNetJPY'].every((key) => Number.isSafeInteger(plan[key])) &&
    ['listingReference', 'saleReference'].every((key) => plan[key] === null || typeof plan[key] === 'string') &&
    (plan.reportedNetJPY === null || Number.isSafeInteger(plan.reportedNetJPY)) &&
    ['not_applicable', 'provider_required'].includes(String(plan.verification));
}
function readSnapshot(value: unknown): Response {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('保存一覧を確認できません。接続を確認してください。');
  const snapshot = value as Response;
  if (!Array.isArray(snapshot.plans) || !snapshot.plans.every(isPlan) ||
      (snapshot.ownerScope !== undefined && readOwnerScope(snapshot.ownerScope) === null))
    throw new Error('保存一覧を確認できません。接続を確認してください。');
  return snapshot;
}

function number(form: FormData, key: string) {
  return Number(form.get(key));
}

export default function MercariRevenueStarter() {
  const [plans, setPlans] = useState<MercariRevenuePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [ownerScope, setOwnerScope] = useState<string | null>(null);
  const currentOwner = useRef<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [notice, setNotice] = useState('');
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const pendingOperation = useRef<PendingCreate | null>(null);
  const createInFlight = useRef(false);
  const listGeneration = useRef(0);
  const createForm = useRef<HTMLFormElement | null>(null);
  const locked = busy || pendingCreate !== null || !ownerScope;
  const { executionBlocked, accessState, setNeedsSignin } = useExecutionAccess();
  const active = useMemo(
    () => plans.filter((plan) => plan.status !== 'cancelled'),
    [plans],
  );

  const draft = ownerScope ? drafts[ownerScope] ?? emptyDraft : emptyDraft;
  const hasDraft = dirtyDraft(draft);
  const hasRetainedDraft = Object.values(drafts).some(dirtyDraft);
  const formLocked = locked || !ownerScope || executionBlocked;
  const adoptOwner = useCallback((scope: string | null) => {
    currentOwner.current = scope; setOwnerScope(scope); setCopied('');
  }, []);
  const ownsInput = () => Boolean(ownerScope && currentOwner.current === ownerScope);
  usePendingSaveNavigation(pendingCreate !== null || hasRetainedDraft);
  function rememberDraft(event: SyntheticEvent<HTMLFormElement>) {
    if (!ownsInput() || formLocked || createInFlight.current || pendingOperation.current) return;
    const value = draftFromForm(new FormData(event.currentTarget));
    setDrafts((current) => ({ ...current, [ownerScope!]: value }));
  }
  function clearDraft(owner: string) {
    setDrafts((current) => ({ ...current, [owner]: emptyDraft }));
    setDraftGeneration((generation) => generation + 1);
  }
  function discardDraft() {
    if (!ownsInput() || busy || createInFlight.current || pendingOperation.current) return;
    clearDraft(ownerScope!); setError(''); setNotice('未保存の入力を破棄しました。保存済みの商品や進捗は変更していません。');
  }
  function setPending(operation: PendingCreate | null) {
    pendingOperation.current = operation; setPendingCreate(operation);
  }

  async function refresh() {
    if (createInFlight.current) return;
    const version = ++listGeneration.current;
    try {
      const response = readSnapshot(await operationRequest<unknown>('/api/revenue/mercari'));
      if (version !== listGeneration.current) return;
      setPlans(response.plans);
      adoptOwner(readOwnerScope(response.ownerScope));
      setError('');
    } catch (cause) {
      if (version !== listGeneration.current) return;
      adoptOwner(null); setPlans([]);
      if (cause instanceof OperationRequestError && cause.status === 401)
        setNeedsSignin(true);
      else
        setError(cause instanceof Error ? cause.message : '読み込めませんでした。');
    } finally {
      if (version === listGeneration.current) setLoading(false);
    }
  }

  useEffect(() => {
    let current = true;
    const version = ++listGeneration.current;
    const timer = window.setTimeout(() => {
      if (!current || version !== listGeneration.current) return;
      if (executionBlocked) {
        setPlans([]); adoptOwner(null);
        return;
      }
      setLoading(true);
      void operationRequest<Response>('/api/revenue/mercari')
        .then((value) => {
          const response = readSnapshot(value);
          if (current && version === listGeneration.current) { setPlans(response.plans); adoptOwner(readOwnerScope(response.ownerScope)); }
        })
        .catch((cause) => {
          if (!current || version !== listGeneration.current) return;
          adoptOwner(null); setPlans([]);
          if (cause instanceof OperationRequestError && cause.status === 401)
            setNeedsSignin(true);
          else
            setError(
              cause instanceof Error ? cause.message : '読み込めませんでした。',
            );
        })
        .finally(() => {
          if (current && version === listGeneration.current) setLoading(false);
        });
    }, 0);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [executionBlocked, setNeedsSignin, adoptOwner]);

  async function saveCreate(operation: PendingCreate) {
    const { payload } = operation;
    if (createInFlight.current || busy || pendingOperation.current !== operation) return;
    createInFlight.current = true;
    // A list captured before this save must not remove its confirmed result.
    listGeneration.current++; setLoading(false);
    setPending(operation);
    setBusy(true);
    setError(''); setNotice('');
    let dispatched = false;
    try {
      const identity = readSnapshot(await operationRequest<unknown>('/api/revenue/mercari'));
      const currentScope = readOwnerScope(identity.ownerScope);
      adoptOwner(currentScope); setPlans(identity.plans);
      const ownerStatus = pendingOwnerStatus(operation.ownerScope, currentScope);
      if (ownerStatus === 'unknown') throw new Error(OWNER_CHECK_REQUIRED);
      if (ownerStatus === 'changed') { setPlans([]); throw new OperationRequestError(OWNER_CHANGED_MESSAGE, 409, OWNER_CHANGED); }
      dispatched = true;
      const plan = await operationRequest<MercariRevenuePlan>(
        '/api/revenue/mercari',
        'POST',
        payload,
        { [OWNER_SCOPE_HEADER]: operation.ownerScope },
      );
      if (!isPlan(plan) || plan.id !== payload.id)
        throw new Error('保存結果を確認できません。同じ内容でもう一度確認してください。');
      if (currentOwner.current === operation.ownerScope) {
        setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]);
        createForm.current?.reset();
      }
      setPending(null); clearDraft(operation.ownerScope);
    } catch (cause) {
      if (cause instanceof OperationRequestError) {
        if (cause.status === 401) { setNeedsSignin(true); adoptOwner(null); setPlans([]); }
        if (cause.code === OWNER_CHANGED) { adoptOwner(null); setPlans([]); }
        if (dispatched && isDefinitivePendingSaveFailure(cause.status, cause.code)) setPending(null);
      }
      if (!dispatched || !(cause instanceof OperationRequestError)) { adoptOwner(null); setPlans([]); }
      setError(cause instanceof Error ? cause.message : '保存できませんでした。');
    } finally {
      createInFlight.current = false;
      setBusy(false);
    }
  }

  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (executionBlocked || locked || createInFlight.current || pendingOperation.current || !ownsInput()) return;
    if (!ownerScope) { setError(OWNER_CHECK_REQUIRED); return; }
    createForm.current = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const value = draftFromForm(form);
    setDrafts((current) => ({ ...current, [ownerScope]: value }));
    const operation = { ownerScope, payload: {
      id: crypto.randomUUID(),
      channel: form.get('channel'),
      title: form.get('title'),
      condition: form.get('condition'),
      facts: form.get('facts'),
      priceJPY: number(form, 'priceJPY'),
      marketplaceFeeJPY: number(form, 'marketplaceFeeJPY'),
      shippingJPY: number(form, 'shippingJPY'),
      itemCostJPY: number(form, 'itemCostJPY'),
      otherCostJPY: number(form, 'otherCostJPY'),
      ownsStock: form.get('ownsStock') === 'on',
      accurate: form.get('accurate') === 'on',
      prohibitedChecked: form.get('prohibitedChecked') === 'on',
    } };
    setPending(operation);
    await saveCreate(operation);
  }

  async function transition(
    plan: MercariRevenuePlan,
    action: 'approve' | 'mark_listed' | 'report_sale' | 'cancel',
  ) {
    if (executionBlocked || locked || createInFlight.current || !ownerScope || !ownsInput()) return;
    const payload: Record<string, unknown> = {
      id: plan.id,
      action,
      expectedRevision: plan.revision,
    };
    if (action === 'mark_listed') {
      const reference = window.prompt('出品URLまたは商品IDを入力してください。');
      if (!reference) return;
      payload.listingReference = reference;
    }
    if (action === 'report_sale') {
      const reference = window.prompt('メルカリの取引参照を入力してください。');
      if (!reference) return;
      const reported = window.prompt('送料・手数料・原価を引いた受取見込額（円）');
      if (reported === null || !/^\d+$/.test(reported)) return;
      payload.saleReference = reference;
      payload.reportedNetJPY = Number(reported);
    }
    listGeneration.current++; setLoading(false);
    setBusy(true);
    setError('');
    try {
      const updated = await operationRequest<MercariRevenuePlan>(
        '/api/revenue/mercari',
        'PATCH',
        payload,
        { [OWNER_SCOPE_HEADER]: ownerScope },
      );
      if (!isPlan(updated) || updated.id !== plan.id) throw new Error('更新結果を確認できません。保存一覧を再確認してください。');
      if (!ownsInput()) return;
      setPlans((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新できませんでした。');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copy(plan: MercariRevenuePlan) {
    if (!ownsInput()) return;
    await navigator.clipboard.writeText(plan.listingDraft);
    setCopied(plan.id);
    window.setTimeout(() => setCopied(''), 1800);
  }

  return (
    <WorkspaceShell title="メルカリ収益スターター">
      <div className="mercari-revenue">
        <header className="mercari-hero">
          <div>
            <p className="mercari-kicker">SKY REVENUE LOOP</p>
            <h1>売上の準備と確認を、一歩ずつ進める</h1>
            <p>
              手元の商品を安全に販売する準備を自動化します。売れなければSkyの回収は0。
              自己申告ではなく、公式Providerで取引完了を確認できた収益だけが精算対象です。
            </p>
          </div>
          <div className="mercari-loop-card">
            <span><PackageCheck size={17} /> 出品準備</span>
            <ArrowRight size={16} />
            <span><Store size={17} /> 販売</span>
            <ArrowRight size={16} />
            <span><ShieldCheck size={17} /> 入金確認</span>
            <ArrowRight size={16} />
            <span><WalletCards size={17} /> 精算</span>
          </div>
        </header>

        <section className="mercari-boundary" aria-label="現在の自動化範囲">
          <article>
            <CheckCircle2 size={19} />
            <div><strong>個人メルカリ</strong><span>原稿・利益計算・進捗管理まで。出品は本人が公式画面で実行。</span></div>
          </article>
          <article>
            <LoaderCircle size={19} />
            <div><strong>メルカリShops</strong><span>公式API対応。契約・日本国内固定IP Connector・Token接続後に自動化。</span></div>
          </article>
          <article>
            <ShieldCheck size={19} />
            <div><strong>収益料金は保留中</strong><span>8.88 USDの旧案は収益動線が決まるまで適用しません。新たな料金計上・請求はありません。</span></div>
          </article>
        </section>

        {executionBlocked && (
          <>
            <ExecutionSignin state={accessState} />
            <p>商品情報と進捗は本人別に保存されます。メルカリのパスワードやCookieは保存しません。</p>
          </>
        )}
          <div className="mercari-grid" hidden={executionBlocked} style={executionBlocked ? { display: 'none' } : undefined}>
            <section className="mercari-panel">
              <div className="mercari-panel-title">
                <BadgeJapaneseYen size={21} />
                <div><h2>売るものを登録</h2><p>手数料は推測せず、現在の実額を入力してください。</p></div>
              </div>
              <form key={`${ownerScope ?? 'unconfirmed'}:${draftGeneration}`} className="mercari-form" onSubmit={create} onChange={rememberDraft}>
                <label>販売経路<select disabled={formLocked} name="channel" defaultValue={draft.channel}><option value="consumer_assisted">個人メルカリ（出品支援）</option><option value="shops_connector">メルカリShops（Connector準備）</option></select></label>
                <label>商品名<input disabled={formLocked} name="title" defaultValue={draft.title} required maxLength={80} placeholder="例：使用済みワイヤレスキーボード" /></label>
                <label>状態<input disabled={formLocked} name="condition" defaultValue={draft.condition} required maxLength={80} placeholder="傷・動作・付属品を具体的に" /></label>
                <label>商品の事実<textarea disabled={formLocked} name="facts" defaultValue={draft.facts} required maxLength={1200} rows={5} placeholder="型番、購入時期、動作、傷、付属品、保管状況など" /></label>
                <div className="mercari-money-grid">
                  <label>販売価格<input disabled={formLocked} name="priceJPY" defaultValue={draft.priceJPY} required type="number" min="300" step="1" /></label>
                  <label>販売手数料<input disabled={formLocked} name="marketplaceFeeJPY" defaultValue={draft.marketplaceFeeJPY} required type="number" min="0" step="1" /></label>
                  <label>送料<input disabled={formLocked} name="shippingJPY" defaultValue={draft.shippingJPY} required type="number" min="0" step="1" /></label>
                  <label>仕入原価<input disabled={formLocked} name="itemCostJPY" defaultValue={draft.itemCostJPY} required type="number" min="0" step="1" /></label>
                  <label>その他実費<input disabled={formLocked} name="otherCostJPY" defaultValue={draft.otherCostJPY} required type="number" min="0" step="1" /></label>
                </div>
                <fieldset className="mercari-checks">
                  <label><input disabled={formLocked} type="checkbox" name="ownsStock" defaultChecked={draft.ownsStock === 'on'} /> 自分が保有し、今発送できる在庫です</label>
                  <label><input disabled={formLocked} type="checkbox" name="accurate" defaultChecked={draft.accurate === 'on'} /> 写真・状態・説明を正確に確認しました</label>
                  <label><input disabled={formLocked} type="checkbox" name="prohibitedChecked" defaultChecked={draft.prohibitedChecked === 'on'} /> 禁止されている出品物・行為に該当しないことを確認しました</label>
                </fieldset>
                <button className="mercari-primary" disabled={locked || !ownerScope}>
                  {busy ? <LoaderCircle className="mercari-spin" size={18} /> : <PackageCheck size={18} />}
                  出品原稿と利益計画を作る
                </button>
              </form>
              {hasRetainedDraft && !pendingCreate && <section aria-label="未保存の商品入力">
                <p>{hasDraft ? '未保存の商品入力をこのアカウントで保持しています。移動する前に保存するか、入力を破棄してください。' : '別のアカウントで入力した内容を非表示で保持しています。元のアカウントへ戻ると復元できます。'}</p>
                {hasDraft && <button type="button" disabled={busy} onClick={discardDraft}>未保存の入力を破棄</button>}
              </section>}
              {notice && <output>{notice}</output>}
              {pendingCreate && <section aria-label="保存結果の確認">
                <p>保存結果が確認できるまで、この画面を開いたままにしてください。最初のアカウントで同じ保存IDを確認し、別アカウントには再送しません。</p>
                <p>{pendingOwnerStatus(pendingCreate.ownerScope, ownerScope) === 'changed' ? OWNER_CHANGED_MESSAGE : ownerScope === pendingCreate.ownerScope ? '元のアカウントを確認できました。同じ保存IDで結果を確認できます。' : '元のアカウントで接続を確認してください。'}</p>
                <Link href="/signin-with-chatgpt?return_to=%2Fincome%2Fmercari" target="_blank" rel="noopener noreferrer">別タブで元のアカウントにサインイン</Link>
                <p>保留を解除しても保存済み記録は削除されません。元のアカウントで保存結果を確認してから新しく保存してください。入力本文は残ります。</p>
                <button type="button" disabled={busy || pendingCreate.ownerScope !== ownerScope} onClick={() => { if (!ownsInput() || createInFlight.current || pendingOperation.current !== pendingCreate || pendingCreate.ownerScope !== ownerScope) return; setPending(null); setError(''); setNotice('保留を解除しました。入力は元のアカウントで保持しています。'); }}>保留を解除（入力は保持）</button>
                <button type="button" className="mercari-primary" disabled={busy || (pendingOwnerStatus(pendingCreate.ownerScope, ownerScope) === 'changed')}
                  onClick={() => void saveCreate(pendingCreate)}>
                  {busy ? '確認中…' : '同じ保存内容で結果を確認'}
                </button>
              </section>}
              {(!ownerScope || pendingCreate) && <p>{!ownerScope && OWNER_CHECK_REQUIRED}<button type="button" disabled={busy} onClick={() => void refresh()}>保存先の接続を確認</button></p>}
              {error && <p className="mercari-error" role="alert">{error}</p>}
            </section>

            <section className="mercari-panel mercari-plans">
              <div className="mercari-panel-title">
                <Store size={21} />
                <div><h2>収益フロー</h2><p>{active.length}件を進行中</p></div>
              </div>
              {loading ? (
                <p className="mercari-empty"><LoaderCircle className="mercari-spin" size={18} /> 読み込み中</p>
              ) : plans.length === 0 ? (
                <p className="mercari-empty">左のフォームから最初の商品を登録してください。</p>
              ) : (
                <div className="mercari-plan-list">
                  {plans.map((plan) => (
                    <article key={plan.id} className="mercari-plan">
                      <header><div><span>{statusLabel[plan.status]}</span><h3>{plan.title}</h3></div><strong className={plan.expectedNetJPY >= 0 ? '' : 'negative'}>{yen.format(plan.expectedNetJPY)}<small>見込手取り</small></strong></header>
                      <pre>{plan.listingDraft}</pre>
                      <div className="mercari-plan-actions">
                        <button onClick={() => void copy(plan)}><Clipboard size={15} />{copied === plan.id ? 'コピー済み' : '原稿をコピー'}</button>
                        {plan.status === 'review' && <button className="primary" disabled={locked} onClick={() => void transition(plan, 'approve')}><CheckCircle2 size={15} />内容を承認</button>}
                        {plan.status === 'approved' && <><a href="https://jp.mercari.com/" target="_blank" rel="noreferrer">公式画面を開く<ExternalLink size={14} /></a><button className="primary" disabled={locked} onClick={() => void transition(plan, 'mark_listed')}>出品済みにする</button></>}
                        {plan.status === 'listed' && <button className="primary" disabled={locked} onClick={() => void transition(plan, 'report_sale')}>取引完了を報告</button>}
                        {plan.status === 'awaiting_provider_verification' && <Link href="/wallet">Walletで確認<ArrowRight size={14} /></Link>}
                        {!['cancelled', 'awaiting_provider_verification'].includes(plan.status) && <button disabled={locked} onClick={() => void transition(plan, 'cancel')}>終了</button>}
                      </div>
                      {plan.status === 'awaiting_provider_verification' && <p className="mercari-proof-note"><ShieldCheck size={15} />自己申告として保存済み。まだ精算対象ではありません。公式Providerの取引完了・金額照合が必要です。</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

        <footer className="mercari-footer">
          <p>このツールは売上・販売速度・利益を保証しません。認証情報、購入、メッセージ、発送、出金を代行しません。</p>
          <a href="https://help.jp.mercari.com/guide/articles/258/" target="_blank" rel="noreferrer">禁止されている行為を確認<ExternalLink size={13} /></a>
          <a href="https://api.mercari-shops.com/docs/index.html" target="_blank" rel="noreferrer">Mercari Shops公式API<ExternalLink size={13} /></a>
        </footer>
      </div>
    </WorkspaceShell>
  );
}
