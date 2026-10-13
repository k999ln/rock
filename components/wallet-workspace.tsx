'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway route. */

import {
  useWalletLedger,
  WalletLedgerRecovery,
} from '@/components/use-wallet-ledger';
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

export default function WalletWorkspace() {
  const ledger = useWalletLedger();
  const {
    snapshot,
    loading,
    saving,
    needsSignin,
    message,
    locked,
    formOpen,
    setFormOpen,
    kind,
    source,
    setSource,
    amount,
    setAmount,
    occurredOn,
    setOccurredOn,
    refresh,
    save,
    reverse,
    openForm,
  } = ledger;

  return (
    <WorkspaceShell title="Wallet" hideTopActions>
      <div className="wallet-app">
        <RockSettlementWallet />
        <WalletLedgerRecovery ledger={ledger} />
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
            <a
              href="/signin-with-chatgpt?return_to=/wallet"
              target="_blank"
              rel="noreferrer"
            >
              別タブでサインイン
            </a>
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
                <button disabled={locked} onClick={() => openForm('revenue')}>
                  <ArrowDownLeft size={18} />
                  売上を記録
                </button>
                <button disabled={locked} onClick={() => openForm('expense')}>
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
                    disabled={locked}
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
                        disabled={locked}
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                      />
                    </div>
                  </label>
                  <label>
                    <span>記録元</span>
                    <select
                      disabled={locked}
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
                      disabled={locked}
                      value={occurredOn}
                      onChange={(event) => setOccurredOn(event.target.value)}
                    />
                  </label>
                </div>
                <button className="wallet-save" disabled={locked} type="submit">
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
                            disabled={locked}
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
