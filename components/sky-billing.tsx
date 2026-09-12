'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway route. */

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

type BillingGateway = {
  serviceOrigin: string;
  token: string;
};

type BillingSnapshot = {
  price: { amountMinor: number; currency: string; interval: string };
  subscription: null | {
    id: string;
    status: string;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: number;
  };
  invoice: null | {
    id: string;
    status: string;
    amountPaid: number;
    currency: string;
    paidAt: number | null;
  };
};

class BillingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = '',
  ) {
    super(message);
  }
}

async function gateway(signal?: AbortSignal) {
  const response = await fetch('/api/billing/token', {
    method: 'POST',
    cache: 'no-store',
    signal,
  });
  const body = (await response.json()) as Partial<BillingGateway> & {
    error?: string;
  };
  if (!response.ok || !body.serviceOrigin || !body.token)
    throw new BillingError(
      body.error ?? '月額プランを開けませんでした。',
      response.status,
    );
  return body as BillingGateway;
}

async function billingRequest(
  path: '/v1/status' | '/v1/checkout' | '/v1/portal',
  method: 'GET' | 'POST',
  signal?: AbortSignal,
) {
  const access = await gateway(signal);
  const response = await fetch(`${access.serviceOrigin}${path}`, {
    method,
    headers: { Authorization: `Bearer ${access.token}` },
    cache: 'no-store',
    signal,
  });
  const body = (await response.json()) as {
    error?: string;
    code?: string;
    url?: string;
  };
  if (!response.ok)
    throw new BillingError(
      body.error ?? '決済サービスと通信できませんでした。',
      response.status,
      body.code,
    );
  return body;
}

function redirect(value: string | undefined, expectedHost: string) {
  if (!value) throw new BillingError('決済画面のURLを確認できません。', 502);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== expectedHost)
    throw new BillingError('安全な決済画面を確認できません。', 502);
  window.location.assign(url.href);
}

const labels: Record<string, string> = {
  active: '利用中',
  trialing: 'トライアル中',
  past_due: '支払い確認が必要',
  unpaid: '未払い',
  incomplete: '申込み未完了',
  checkout_completed: '決済確認中',
  canceled: '解約済み',
  incomplete_expired: '申込み期限切れ',
};

export function SkyBilling() {
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [needsSignin, setNeedsSignin] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    try {
      const result = await billingRequest('/v1/status', 'GET', signal);
      setSnapshot(result as unknown as BillingSnapshot);
      if (!new URLSearchParams(window.location.search).get('billing'))
        setMessage('');
      setNeedsSignin(false);
    } catch (error) {
      if (signal?.aborted) return;
      setSnapshot(null);
      setNeedsSignin(error instanceof BillingError && error.status === 401);
      setMessage(
        error instanceof Error
          ? error.message
          : '月額プランを確認できませんでした。',
      );
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(window.location.search).get('billing');
    const timeout = window.setTimeout(() => {
      void refresh(controller.signal).then(() => {
        if (controller.signal.aborted) return;
        if (query === 'success')
          setMessage('決済を受け付けました。入金確認を反映しています。');
        if (query === 'cancelled')
          setMessage(
            '申込みはキャンセルされました。請求は開始されていません。',
          );
      });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [refresh]);

  async function open(path: '/v1/checkout' | '/v1/portal') {
    setBusy(true);
    setMessage('');
    try {
      const result = await billingRequest(path, 'POST');
      redirect(
        result.url,
        path === '/v1/checkout' ? 'checkout.stripe.com' : 'billing.stripe.com',
      );
    } catch (error) {
      if (error instanceof BillingError && error.code === 'ALREADY_SUBSCRIBED')
        await refresh();
      setMessage(
        error instanceof Error ? error.message : '決済画面を開けませんでした。',
      );
      setBusy(false);
    }
  }

  const subscription = snapshot?.subscription;
  const active =
    subscription &&
    [
      'active',
      'trialing',
      'past_due',
      'unpaid',
      'incomplete',
      'checkout_completed',
    ].includes(subscription.status);
  return (
    <section className="sky-billing-panel" aria-labelledby="sky-billing-title">
      <div className="sky-billing-heading">
        <span>
          <CircleDollarSign size={25} />
        </span>
        <div>
          <p className="rock-eyebrow">SKY MONTHLY PLAN</p>
          <h2 id="sky-billing-title">月$8.88の利用料</h2>
          <p>
            Stripeの安全な画面で申込み、毎月の成功・失敗・解約をSkyへ反映します。
          </p>
        </div>
        <strong>
          $8.88<small>/ month</small>
        </strong>
      </div>
      {busy && !snapshot ? (
        <output className="sky-billing-message">
          <LoaderCircle className="sky-billing-spin" size={18} />
          契約状況を確認中
        </output>
      ) : active ? (
        <div className="sky-billing-status">
          <div>
            {subscription.status === 'active' ||
            subscription.status === 'trialing' ? (
              <CheckCircle2 size={19} />
            ) : (
              <TriangleAlert size={19} />
            )}
            <span>
              <strong>
                {labels[subscription.status] ?? subscription.status}
              </strong>
              {subscription.currentPeriodEnd ? (
                <small>
                  {subscription.cancelAtPeriodEnd ? '終了予定' : '次回更新'}:{' '}
                  {new Date(
                    subscription.currentPeriodEnd * 1000,
                  ).toLocaleDateString('ja-JP')}
                </small>
              ) : (
                <small>Stripeからの確定情報を待っています</small>
              )}
            </span>
          </div>
          <button disabled={busy} onClick={() => void open('/v1/portal')}>
            支払い・解約を管理
            <ExternalLink size={15} />
          </button>
        </div>
      ) : (
        <div className="sky-billing-enroll">
          <label>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>
              月額8.88 USDが解約まで毎月請求されることを確認しました。
            </span>
          </label>
          <button
            disabled={busy || !accepted}
            onClick={() => void open('/v1/checkout')}
          >
            {busy ? '準備中…' : 'Stripeで申し込む'}
            <ExternalLink size={15} />
          </button>
        </div>
      )}
      {message && (
        <output className="sky-billing-message">
          {needsSignin ? (
            <ShieldCheck size={18} />
          ) : (
            <TriangleAlert size={18} />
          )}
          <span>{message}</span>
          {needsSignin && (
            <a href="/signin-with-chatgpt?return_to=/wallet">サインイン</a>
          )}
        </output>
      )}
      <p className="sky-billing-footnote">
        カード情報はSkyに保存しません。$8.88は税や値引前の基本料金で、受取額は手数料・税・返金により異なります。
      </p>
    </section>
  );
}
