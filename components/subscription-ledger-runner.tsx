'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

const LEDGER_ORIGIN = 'http://127.0.0.1:8765';

type LedgerAlert = {
  severity: 'critical' | 'warning' | 'info';
  subscription: string;
  message: string;
};

type LedgerSummary = {
  counts: {
    total: number;
    live: number;
    active: number;
    action_required: number;
  };
  monthly_totals: Record<string, number>;
  alerts: LedgerAlert[];
  offline: boolean;
};

type Subscription = {
  id: number;
  name: string;
  status: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  renewal_date: string | null;
};

type LedgerState = {
  summary: LedgerSummary;
  subscriptions: Subscription[];
};

const statusLabel: Record<string, string> = {
  active: '有効',
  action_required: '要対応',
  trial: '試用中',
  usage_based: '従量課金',
  free: '無料',
  expired: '終了',
  cancelled: '解約済み',
  paused: '停止中',
};

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function isLedgerState(value: unknown): value is LedgerState {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<LedgerState>;
  return (
    !!item.summary &&
    typeof item.summary === 'object' &&
    !!item.summary.counts &&
    typeof item.summary.monthly_totals === 'object' &&
    Array.isArray(item.summary.alerts) &&
    Array.isArray(item.subscriptions)
  );
}

export function SubscriptionLedgerRunner({
  onRunningChange,
  executionDisabled = false,
}: {
  onRunningChange?: (running: boolean) => void;
  executionDisabled?: boolean;
}) {
  const [state, setState] = useState<LedgerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const connect = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      onRunningChange?.(true);
      try {
        const requestSignal = signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000);
        const [summaryResponse, subscriptionsResponse] = await Promise.all([
          fetch(`${LEDGER_ORIGIN}/api/summary`, {
            cache: 'no-store',
            signal: requestSignal,
          }),
          fetch(`${LEDGER_ORIGIN}/api/subscriptions`, {
            cache: 'no-store',
            signal: requestSignal,
          }),
        ]);
        if (!summaryResponse.ok || !subscriptionsResponse.ok)
          throw new Error('ローカル台帳が応答しませんでした。');
        const next = {
          summary: await summaryResponse.json(),
          subscriptions: await subscriptionsResponse.json(),
        };
        if (!isLedgerState(next))
          throw new Error('ローカル台帳の応答形式を確認してください。');
        setState(next);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          return;
        setState(null);
        setError(
          cause instanceof Error
            ? cause.message
            : 'ローカル台帳へ接続できませんでした。',
        );
      } finally {
        setLoading(false);
        onRunningChange?.(false);
      }
    },
    [onRunningChange],
  );

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => connect(controller.signal));
    return () => controller.abort();
  }, [connect]);

  if (executionDisabled)
    return <p className="ledger-sky-notice">現在は実行が停止されています。</p>;

  if (loading)
    return (
      <output className="ledger-sky-loading">
        <RefreshCw size={18} className="ledger-sky-spin" />
        PC内の台帳へ接続しています…
      </output>
    );

  if (!state)
    return (
      <section className="ledger-sky-connect" aria-live="polite">
        <AlertTriangle size={25} />
        <div>
          <h3>Rockstar Ledgerを起動してください</h3>
          <p>{error || 'PC内のローカル台帳へ接続できません。'}</p>
          <code>python3 scripts/run_local.py</code>
          <button onClick={() => void connect()}>
            <RefreshCw size={15} /> 再接続
          </button>
        </div>
      </section>
    );

  const totals = Object.entries(state.summary.monthly_totals)
    .map(([currency, amount]) => money(amount, currency))
    .join(' ＋ ');
  const visible = state.subscriptions
    .toSorted((left, right) => {
      const weight = (status: string) =>
        status === 'action_required' ? 0 : status === 'active' ? 1 : 2;
      return weight(left.status) - weight(right.status);
    })
    .slice(0, 8);

  return (
    <section className="ledger-sky-panel">
      <div className="ledger-sky-connected">
        <span>
          <CheckCircle2 size={15} /> ローカル台帳に接続済み
        </span>
        <span>
          <ShieldCheck size={15} /> 外部送信なし
        </span>
      </div>
      <div className="ledger-sky-metrics">
        <article>
          <span>月額換算</span>
          <strong>{totals || '¥0'}</strong>
        </article>
        <article>
          <span>契約・候補</span>
          <strong>{state.summary.counts.total}</strong>
        </article>
        <article className="ledger-sky-danger">
          <span>要対応</span>
          <strong>{state.summary.counts.action_required}</strong>
        </article>
      </div>
      {state.summary.alerts.length > 0 ? (
        <div className="ledger-sky-alerts">
          {state.summary.alerts.map((alert) => (
            <article key={`${alert.subscription}-${alert.message}`}>
              <strong>{alert.subscription}</strong>
              <span>{alert.message}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="ledger-sky-notice">
          現在、支払い・更新の要対応はありません。
        </p>
      )}
      <div className="ledger-sky-list">
        {visible.map((subscription) => (
          <article key={subscription.id}>
            <div>
              <strong>{subscription.name}</strong>
              <span>
                {statusLabel[subscription.status] || subscription.status}
              </span>
            </div>
            <div>
              <strong>
                {money(subscription.amount, subscription.currency)}
              </strong>
              <span>
                {subscription.renewal_date || subscription.billing_cycle}
              </span>
            </div>
          </article>
        ))}
      </div>
      <div className="ledger-sky-actions">
        <button onClick={() => void connect()}>
          <RefreshCw size={15} /> 更新
        </button>
        <a href={LEDGER_ORIGIN} target="_blank" rel="noreferrer">
          台帳を開く <ArrowUpRight size={15} />
        </a>
      </div>
    </section>
  );
}
