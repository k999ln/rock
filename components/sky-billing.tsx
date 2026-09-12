'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway route. */

import { useCallback, useEffect, useState } from 'react';
import {
  CircleDollarSign,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

type BillingGateway = {
  serviceOrigin: string;
  token: string;
};

type SettlementSnapshot = {
  policy: {
    mode: 'verified_earnings_only';
    currency: 'usd';
    monthlyFeeCapMinor: number;
    upfrontCharge: false;
    debtCarry: false;
    tobFeeMinor: 0;
  };
  period: string;
  settlement: {
    grossMinor: number;
    operatingCostMinor: number;
    skyFeeMinor: number;
    distributableMinor: number;
    remainingFeeCapMinor: number;
    receiptCount: number;
  };
  receipts: Array<{
    receiptId: string;
    sourceProvider: string;
    grossMinor: number;
    skyFeeMinor: number;
    distributableMinor: number;
    payoutStatus: string | null;
  }>;
};

class BillingError extends Error {
  constructor(
    message: string,
    readonly status: number,
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
      body.error ?? '収益精算を確認できませんでした。',
      response.status,
    );
  return body as BillingGateway;
}

async function settlementStatus(signal?: AbortSignal) {
  const access = await gateway(signal);
  const response = await fetch(`${access.serviceOrigin}/v1/status`, {
    headers: { Authorization: `Bearer ${access.token}` },
    cache: 'no-store',
    signal,
  });
  const body = (await response.json()) as Partial<SettlementSnapshot> & {
    error?: string;
  };
  if (!response.ok || !body.policy || !body.settlement)
    throw new BillingError(
      body.error ?? '収益精算サービスと通信できませんでした。',
      response.status,
    );
  return body as SettlementSnapshot;
}

function usd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value / 100);
}

export function SkyBilling() {
  const [snapshot, setSnapshot] = useState<SettlementSnapshot | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [needsSignin, setNeedsSignin] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      setSnapshot(await settlementStatus(signal));
      setNeedsSignin(false);
      setMessage('');
    } catch (error) {
      if (signal?.aborted) return;
      setSnapshot(null);
      setNeedsSignin(error instanceof BillingError && error.status === 401);
      setMessage(
        error instanceof Error
          ? error.message
          : '収益精算を確認できませんでした。',
      );
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [refresh]);

  const settlement = snapshot?.settlement;
  const percent = settlement
    ? Math.min(
        100,
        Math.round(
          (settlement.skyFeeMinor / snapshot.policy.monthlyFeeCapMinor) * 100,
        ),
      )
    : 0;

  return (
    <section className="sky-billing-panel" aria-labelledby="sky-billing-title">
      <div className="sky-billing-heading">
        <span>
          <CircleDollarSign size={25} />
        </span>
        <div>
          <p className="rock-eyebrow">EARN FIRST · SETTLE AFTER</p>
          <h2 id="sky-billing-title">自動化収益からだけ精算</h2>
          <p>
            Providerで入金確認済みのEarning
            Receiptだけを対象に、実費の後から最大$8.88を回収します。
          </p>
        </div>
        <strong>
          $8.88<small>monthly cap</small>
        </strong>
      </div>

      {busy && !snapshot ? (
        <output className="sky-billing-message">
          <LoaderCircle className="sky-billing-spin" size={18} />
          今月の確定収益を確認中
        </output>
      ) : settlement ? (
        <div className="sky-settlement-body">
          <div className="sky-settlement-progress">
            <div>
              <span>Sky回収済み</span>
              <strong>{usd(settlement.skyFeeMinor)}</strong>
              <small>
                残り上限 {usd(settlement.remainingFeeCapMinor)} ·{' '}
                {snapshot.period}
              </small>
            </div>
            <progress max={100} value={percent} aria-label="今月の回収進捗" />
          </div>
          <dl className="sky-settlement-metrics">
            <div>
              <dt>確定売上</dt>
              <dd>{usd(settlement.grossMinor)}</dd>
            </div>
            <div>
              <dt>実費</dt>
              <dd>{usd(settlement.operatingCostMinor)}</dd>
            </div>
            <div>
              <dt>利用者へ</dt>
              <dd>{usd(settlement.distributableMinor)}</dd>
            </div>
            <div>
              <dt>検証Receipt</dt>
              <dd>{settlement.receiptCount}件</dd>
            </div>
          </dl>
          <div className="sky-settlement-rule">
            <ShieldCheck size={18} />
            <p>
              先払い・カード請求・未達分の借金・翌月繰越はありません。ToBのSky手数料は0です。
            </p>
          </div>
        </div>
      ) : null}

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
        ツールの実行成功だけでは売上にしません。外部Providerの入金参照と実行証明が一致した後にだけ台帳へ反映します。
      </p>
    </section>
  );
}
