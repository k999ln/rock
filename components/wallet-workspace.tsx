'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway route. */

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  LoaderCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import RockSettlementWallet from '@/components/rock-settlement-wallet';

type WalletRecord = {
  id: string;
  kind: 'revenue' | 'expense';
  amount: number;
  source: string;
  occurredOn: string;
  reversesId: string | null;
  createdAt: number;
  reversed: number;
};

type WalletSnapshot = {
  currency: 'JPY';
  balance: number;
  revenue: number;
  expense: number;
  records: WalletRecord[];
  persistence: 'd1';
  transfers: 'not-connected';
};

const sources: Record<string, string> = {
  coconala: 'ココナラ',
  note: 'note',
  api: 'API費用',
  electricity: '電気代',
  network: '通信費',
  other: 'その他',
};

function yen(value: number) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value);
}

async function requestWallet(input?: unknown) {
  const response = await fetch('/api/wallet', {
    method: input ? 'POST' : 'GET',
    headers: input ? { 'Content-Type': 'application/json' } : undefined,
    body: input ? JSON.stringify(input) : undefined,
    cache: 'no-store',
  });
  const result = (await response.json()) as WalletSnapshot & { error?: string };
  if (!response.ok) {
    const error = new Error(result.error ?? 'Walletを読み込めませんでした.');
    Object.assign(error, { status: response.status });
    throw error;
  }
  return result;
}

export default function WalletWorkspace() {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsSignin, setNeedsSignin] = useState(false);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<'revenue' | 'expense'>('revenue');
  const [source, setSource] = useState('coconala');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await requestWallet());
      setNeedsSignin(false);
      setMessage('');
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      setNeedsSignin(status === 401);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Walletを読み込めませんでした。',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  async function save(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      setSnapshot(
        await requestWallet({
          id: crypto.randomUUID(),
          kind,
          source,
          amount: Number(amount),
          occurredOn,
        }),
      );
      setAmount('');
      setFormOpen(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '記録を保存できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }

  async function reverse(id: string) {
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      setSnapshot(
        await requestWallet({ id: crypto.randomUUID(), reversesId: id }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '記録を取り消せませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }

  function openForm(nextKind: 'revenue' | 'expense') {
    setKind(nextKind);
    setSource(nextKind === 'revenue' ? 'coconala' : 'api');
    setFormOpen(true);
  }

  return (
    <WorkspaceShell title="Wallet" hideTopActions>
      <div className="wallet-app">
        <RockSettlementWallet />
        {loading && !snapshot ? (
          <output className="wallet-loading">
            <LoaderCircle className="sky-billing-spin" size={20} />
            Walletを開いています
          </output>
        ) : needsSignin ? (
          <section
            className="wallet-signin"
            aria-labelledby="wallet-signin-title"
          >
            <span>
              <WalletCards size={28} />
            </span>
            <div>
              <p>RockstarOS Wallet</p>
              <h1 id="wallet-signin-title">自分のWalletを開く</h1>
              <p>残高と入出金記録は、あなたのアカウントだけに保存されます。</p>
            </div>
            <a href="/signin-with-chatgpt?return_to=/wallet" target="_top">サインイン</a>
          </section>
        ) : snapshot ? (
          <>
            <section
              className="wallet-balance"
              aria-labelledby="wallet-balance-title"
            >
              <div>
                <span id="wallet-balance-title">記録残高</span>
                <strong className={snapshot.balance < 0 ? 'is-negative' : ''}>
                  {yen(snapshot.balance)}
                </strong>
                <small>
                  <ShieldCheck size={14} />
                  このアカウントの記録だけを集計
                </small>
              </div>
              <div className="wallet-balance-actions">
                <button onClick={() => openForm('revenue')}>
                  <ArrowDownLeft size={18} />
                  売上を記録
                </button>
                <button onClick={() => openForm('expense')}>
                  <ArrowUpRight size={18} />
                  経費を記録
                </button>
              </div>
            </section>

            <dl className="wallet-totals">
              <div>
                <dt>売上</dt>
                <dd>{yen(snapshot.revenue)}</dd>
              </div>
              <div>
                <dt>経費</dt>
                <dd>{yen(snapshot.expense)}</dd>
              </div>
            </dl>

            {formOpen && (
              <form className="wallet-record-form" onSubmit={save}>
                <header>
                  <div>
                    <span>{kind === 'revenue' ? '売上' : '経費'}</span>
                    <h2>{kind === 'revenue' ? '売上を記録' : '経費を記録'}</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="閉じる"
                    onClick={() => setFormOpen(false)}
                  >
                    <X size={19} />
                  </button>
                </header>
                <div className="wallet-record-fields">
                  <label>
                    <span>金額</span>
                    <div className="wallet-amount-input">
                      <b>¥</b>
                      <input
                        required
                        inputMode="numeric"
                        type="number"
                        min="1"
                        max="100000000"
                        step="1"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                      />
                    </div>
                  </label>
                  <label>
                    <span>記録元</span>
                    <select
                      value={source}
                      onChange={(event) => setSource(event.target.value)}
                    >
                      {Object.entries(sources).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>日付</span>
                    <input
                      required
                      type="date"
                      min="2000-01-01"
                      max={new Date().toISOString().slice(0, 10)}
                      value={occurredOn}
                      onChange={(event) => setOccurredOn(event.target.value)}
                    />
                  </label>
                </div>
                <button className="wallet-save" disabled={saving} type="submit">
                  <Plus size={18} />
                  {saving ? '保存中…' : 'Walletに追加'}
                </button>
              </form>
            )}

            {message && (
              <p className="wallet-inline-error" role="alert">
                {message}
              </p>
            )}

            <section
              className="wallet-transactions"
              aria-labelledby="wallet-history-title"
            >
              <header>
                <h2 id="wallet-history-title">入出金</h2>
                <span>{snapshot.records.length}件</span>
              </header>
              {snapshot.records.length ? (
                <div className="wallet-transaction-list">
                  {snapshot.records.map((record) => {
                    const signedAmount =
                      record.kind === 'revenue'
                        ? record.amount
                        : -record.amount;
                    const isReversal = Boolean(record.reversesId);
                    return (
                      <article key={record.id}>
                        <span
                          className={signedAmount >= 0 ? 'credit' : 'debit'}
                        >
                          {signedAmount >= 0 ? (
                            <ArrowDownLeft size={18} />
                          ) : (
                            <ArrowUpRight size={18} />
                          )}
                        </span>
                        <div>
                          <strong>
                            {isReversal
                              ? '取消'
                              : (sources[record.source] ?? record.source)}
                          </strong>
                          <small>
                            {record.occurredOn}
                            {record.reversed ? ' · 取消済み' : ''}
                          </small>
                        </div>
                        <b className={signedAmount >= 0 ? 'credit' : 'debit'}>
                          {signedAmount > 0 ? '+' : ''}
                          {yen(signedAmount)}
                        </b>
                        {!isReversal && !record.reversed && (
                          <button
                            disabled={saving}
                            onClick={() => void reverse(record.id)}
                          >
                            <RotateCcw size={14} />
                            取消
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="wallet-empty-ledger">
                  <WalletCards size={25} />
                  <strong>まだ記録はありません</strong>
                  <p>最初の売上か経費を追加すると、ここに履歴が残ります。</p>
                </div>
              )}
            </section>

            <p className="wallet-backend-note">
              記録はアカウント別に保存されます。銀行口座との入金・送金連携は準備中です。
            </p>
          </>
        ) : (
          <section className="wallet-error" role="alert">
            <div>
              <strong>Walletを開けませんでした</strong>
              <p>{message}</p>
            </div>
            <button onClick={() => void refresh()}>再試行</button>
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}
