'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in requires top-level navigation. */

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
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
import { useExecutionAccess } from '@/components/execution-access';
import { operationRequest, OperationRequestError } from '@/lib/operations-client';
import type { MercariRevenuePlan } from '@/lib/mercari-revenue';

type Response = {
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

function number(form: FormData, key: string) {
  return Number(form.get(key));
}

export default function MercariRevenueStarter() {
  const [plans, setPlans] = useState<MercariRevenuePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const { needsSignin, setNeedsSignin } = useExecutionAccess();
  const active = useMemo(
    () => plans.filter((plan) => plan.status !== 'cancelled'),
    [plans],
  );

  async function refresh() {
    try {
      const response = await operationRequest<Response>('/api/revenue/mercari');
      setPlans(response.plans);
      setError('');
    } catch (cause) {
      if (cause instanceof OperationRequestError && cause.status === 401)
        setNeedsSignin(true);
      else
        setError(cause instanceof Error ? cause.message : '読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let current = true;
    void operationRequest<Response>('/api/revenue/mercari')
      .then((response) => {
        if (current) setPlans(response.plans);
      })
      .catch((cause) => {
        if (!current) return;
        if (cause instanceof OperationRequestError && cause.status === 401)
          setNeedsSignin(true);
        else
          setError(
            cause instanceof Error ? cause.message : '読み込めませんでした。',
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [setNeedsSignin]);

  async function create(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const plan = await operationRequest<MercariRevenuePlan>(
        '/api/revenue/mercari',
        'POST',
        {
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
        },
      );
      setPlans((current) => [plan, ...current]);
      formElement.reset();
    } catch (cause) {
      if (cause instanceof OperationRequestError && cause.status === 401)
        setNeedsSignin(true);
      setError(cause instanceof Error ? cause.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function transition(
    plan: MercariRevenuePlan,
    action: 'approve' | 'mark_listed' | 'report_sale' | 'cancel',
  ) {
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
    setBusy(true);
    setError('');
    try {
      const updated = await operationRequest<MercariRevenuePlan>(
        '/api/revenue/mercari',
        'PATCH',
        payload,
      );
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

        {needsSignin ? (
          <div className="rock-service-notice">
            <strong>サインインして収益フローを保存してください。</strong>
            <p>
              商品情報と進捗は本人別に保存されます。メルカリのパスワードやCookieは保存しません。
            </p>
            <a
              className="rock-button rock-button-dark"
              href="/signin-with-chatgpt?return_to=%2Fincome%2Fmercari"
              target="_top"
            >
              サインインして使う
            </a>
          </div>
        ) : (
          <div className="mercari-grid">
            <section className="mercari-panel">
              <div className="mercari-panel-title">
                <BadgeJapaneseYen size={21} />
                <div><h2>売るものを登録</h2><p>手数料は推測せず、現在の実額を入力してください。</p></div>
              </div>
              <form className="mercari-form" onSubmit={create}>
                <label>販売経路<select name="channel" defaultValue="consumer_assisted"><option value="consumer_assisted">個人メルカリ（出品支援）</option><option value="shops_connector">メルカリShops（Connector準備）</option></select></label>
                <label>商品名<input name="title" required maxLength={80} placeholder="例：使用済みワイヤレスキーボード" /></label>
                <label>状態<input name="condition" required maxLength={80} placeholder="傷・動作・付属品を具体的に" /></label>
                <label>商品の事実<textarea name="facts" required maxLength={1200} rows={5} placeholder="型番、購入時期、動作、傷、付属品、保管状況など" /></label>
                <div className="mercari-money-grid">
                  <label>販売価格<input name="priceJPY" required type="number" min="300" step="1" /></label>
                  <label>販売手数料<input name="marketplaceFeeJPY" required type="number" min="0" step="1" /></label>
                  <label>送料<input name="shippingJPY" required type="number" min="0" step="1" /></label>
                  <label>仕入原価<input name="itemCostJPY" required type="number" min="0" step="1" defaultValue="0" /></label>
                  <label>その他実費<input name="otherCostJPY" required type="number" min="0" step="1" defaultValue="0" /></label>
                </div>
                <fieldset className="mercari-checks">
                  <label><input type="checkbox" name="ownsStock" /> 自分が保有し、今発送できる在庫です</label>
                  <label><input type="checkbox" name="accurate" /> 写真・状態・説明を正確に確認しました</label>
                  <label><input type="checkbox" name="prohibitedChecked" /> 禁止されている出品物・行為に該当しないことを確認しました</label>
                </fieldset>
                <button className="mercari-primary" disabled={busy}>
                  {busy ? <LoaderCircle className="mercari-spin" size={18} /> : <PackageCheck size={18} />}
                  出品原稿と利益計画を作る
                </button>
              </form>
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
                        {plan.status === 'review' && <button className="primary" disabled={busy} onClick={() => void transition(plan, 'approve')}><CheckCircle2 size={15} />内容を承認</button>}
                        {plan.status === 'approved' && <><a href="https://jp.mercari.com/" target="_blank" rel="noreferrer">公式画面を開く<ExternalLink size={14} /></a><button className="primary" disabled={busy} onClick={() => void transition(plan, 'mark_listed')}>出品済みにする</button></>}
                        {plan.status === 'listed' && <button className="primary" disabled={busy} onClick={() => void transition(plan, 'report_sale')}>取引完了を報告</button>}
                        {plan.status === 'awaiting_provider_verification' && <Link href="/wallet">Walletで確認<ArrowRight size={14} /></Link>}
                        {!['cancelled', 'awaiting_provider_verification'].includes(plan.status) && <button disabled={busy} onClick={() => void transition(plan, 'cancel')}>終了</button>}
                      </div>
                      {plan.status === 'awaiting_provider_verification' && <p className="mercari-proof-note"><ShieldCheck size={15} />自己申告として保存済み。まだ精算対象ではありません。公式Providerの取引完了・金額照合が必要です。</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        <footer className="mercari-footer">
          <p>このツールは売上・販売速度・利益を保証しません。認証情報、購入、メッセージ、発送、出金を代行しません。</p>
          <a href="https://help.jp.mercari.com/guide/articles/258/" target="_blank" rel="noreferrer">禁止されている行為を確認<ExternalLink size={13} /></a>
          <a href="https://api.mercari-shops.com/docs/index.html" target="_blank" rel="noreferrer">Mercari Shops公式API<ExternalLink size={13} /></a>
        </footer>
      </div>
    </WorkspaceShell>
  );
}
