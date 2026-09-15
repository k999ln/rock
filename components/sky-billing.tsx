'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway route. */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowRight,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
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
      body.error ?? '収益を確認できませんでした。',
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
      body.error ?? '収益サービスと通信できませんでした。',
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

function receiptStatus(value: string | null) {
  if (!value) return '確認済み';
  const status = value.toLowerCase();
  if (status.includes('paid') || status.includes('complete')) return '受取済み';
  if (status.includes('fail') || status.includes('reject')) return '要確認';
  if (status.includes('pending') || status.includes('hold')) return '処理中';
  return '確認済み';
}

export function SkyBilling() {
  const [snapshot, setSnapshot] = useState<SettlementSnapshot | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [needsSignin, setNeedsSignin] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    try {
      setSnapshot(await settlementStatus(signal));
      setNeedsSignin(false);
      setMessage('');
    } catch (error) {
      if (signal?.aborted) return;
      setSnapshot(null);
      setNeedsSignin(error instanceof BillingError && error.status === 401);
      setMessage(
        error instanceof Error ? error.message : '収益を確認できませんでした。',
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
  const amount = (value?: number) => (value === undefined ? '—' : usd(value));

  if (needsSignin) {
    return (
      <div className="wallet-simple">
        <section className="wallet-entry" aria-labelledby="wallet-entry-title">
          <div className="wallet-entry-main">
            <span className="wallet-entry-icon">
              <WalletCards size={26} />
            </span>
            <p>avocadoOS Wallet</p>
            <h1 id="wallet-entry-title">
              自動化の売上を、
              <br />
              受け取れる金額まで。
            </h1>
            <span>売上、実費、受取予定をひとつの画面で確認できます。</span>
            <a
              className="wallet-entry-action"
              href="/signin-with-chatgpt?return_to=/wallet"
            >
              サインインして開く
              <ArrowRight size={18} />
            </a>
          </div>

          <ol className="wallet-entry-flow" aria-label="Walletの流れ">
            <li>
              <span>1</span>
              <div>
                <strong>Skyで自動化を使う</strong>
                <small>仕事と実行結果を記録</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>売上を照合する</strong>
                <small>入金確認済みの売上だけを反映</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>受取額を確認する</strong>
                <small>売上から実費と利用料を自動計算</small>
              </div>
            </li>
          </ol>

          <div className="wallet-entry-trust">
            <ShieldCheck size={17} />
            先払いなし。売上がない月の請求もありません。
          </div>
        </section>
        <p className="wallet-simple-note">
          Developer Preview · 現在は実際の入金・送金には接続していません。
        </p>
      </div>
    );
  }

  if (busy && !snapshot) {
    return (
      <div className="wallet-simple">
        <output className="wallet-loading">
          <LoaderCircle className="sky-billing-spin" size={20} />
          Walletを開いています
        </output>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="wallet-simple">
        <section className="wallet-error" role="alert">
          <TriangleAlert size={22} />
          <div>
            <strong>Walletを開けませんでした</strong>
            <p>{message}</p>
          </div>
          <button disabled={busy} onClick={() => void refresh()}>
            再試行
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="wallet-simple">
      <section className="wallet-simple-balance" aria-labelledby="wallet-total">
        <div className="wallet-simple-title-row">
          <div>
            <span>今月の受取予定</span>
            <strong id="wallet-total">
              {amount(settlement?.distributableMinor)}
            </strong>
          </div>
          <div className="wallet-simple-actions">
            <a href="#wallet-records">売上・経費を記録</a>
            <button disabled={busy} onClick={() => void refresh()}>
              <RefreshCw className={busy ? 'sky-billing-spin' : ''} size={16} />
              <span className="wallet-refresh-label">更新</span>
            </button>
          </div>
        </div>
        <p>
          {settlement?.receiptCount
            ? `${settlement.receiptCount}件の確認済み売上を反映しています。`
            : '確認済みの売上はまだありません。'}
        </p>

        <dl className="wallet-simple-breakdown">
          <div>
            <dt>売上</dt>
            <dd>{amount(settlement?.grossMinor)}</dd>
          </div>
          <div>
            <dt>実費</dt>
            <dd>{amount(settlement?.operatingCostMinor)}</dd>
          </div>
          <div>
            <dt>Sky利用料</dt>
            <dd>{amount(settlement?.skyFeeMinor)}</dd>
          </div>
        </dl>

        <div className="wallet-simple-policy">
          <ShieldCheck size={17} />
          <span>
            Sky利用料は収益が出た月だけ、最大$8.88。先払いや未払い請求はありません。
          </span>
        </div>
      </section>

      {message && (
        <output className="wallet-simple-message">
          {busy ? (
            <LoaderCircle className="sky-billing-spin" size={18} />
          ) : (
            <TriangleAlert size={18} />
          )}
          <span>{message}</span>
          <button disabled={busy} onClick={() => void refresh()}>
            再試行
          </button>
        </output>
      )}

      <section
        className="wallet-simple-history"
        aria-labelledby="wallet-history"
      >
        <div className="wallet-simple-section-title">
          <h2 id="wallet-history">入金履歴</h2>
          <span>{snapshot?.period ?? '今月'}</span>
        </div>

        {snapshot?.receipts.length ? (
          <div className="wallet-simple-receipts">
            {snapshot.receipts.slice(0, 6).map((receipt) => (
              <article key={receipt.receiptId}>
                <span className="wallet-simple-receipt-icon">
                  <ArrowDownLeft size={18} />
                </span>
                <div>
                  <strong>{receipt.sourceProvider}</strong>
                  <small>
                    {receipt.receiptId.slice(0, 8)} ·{' '}
                    {receiptStatus(receipt.payoutStatus)}
                  </small>
                </div>
                <strong>+{usd(receipt.distributableMinor)}</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className="wallet-simple-empty">
            <span>
              <CircleCheck size={18} />
            </span>
            <div>
              <strong>次は、Skyで自動化を選ぶ</strong>
              <p>確認済みの売上が発生すると、ここに入金履歴が残ります。</p>
            </div>
            <Link href="/">
              Skyを開く
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </section>

      <p className="wallet-simple-note">
        Developer Preview · 現在は実際の入金・送金には接続していません。
      </p>
    </div>
  );
}
