'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway route. */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CircleDollarSign,
  Landmark,
  LoaderCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  fund: {
    joined: boolean;
    status: 'simulation';
    commonRevenue: number;
    distributable: number;
    projectedShare: number;
    updatedAt: string | null;
  };
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

const previewWallet: WalletSnapshot = {
  currency: 'JPY',
  balance: 0,
  revenue: 0,
  expense: 0,
  records: [],
  persistence: 'd1',
  transfers: 'not-connected',
  fund: {
    joined: false,
    status: 'simulation',
    commonRevenue: 0,
    distributable: 0,
    projectedShare: 0,
    updatedAt: null,
  },
};

async function requestWallet(input?: unknown) {
  const response = await fetch('/api/wallet', {
    method: input ? 'POST' : 'GET',
    headers: input ? { 'Content-Type': 'application/json' } : undefined,
    body: input ? JSON.stringify(input) : undefined,
    cache: 'no-store',
  });
  const result = (await response.json()) as WalletSnapshot & { error?: string };
  if (
    !response.ok &&
    response.status === 503 &&
    process.env.NODE_ENV === 'development' &&
    !input
  )
    return previewWallet;
  if (!response.ok) {
    const error = new Error(result.error ?? 'Walletを読み込めませんでした。');
    Object.assign(error, { status: response.status });
    throw error;
  }
  return result;
}

export default function RevenueWalletWorkspace() {
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
      <div className="revenue-wallet">
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
              <p>Rock Wallet</p>
              <h1 id="wallet-signin-title">収益口座を開く</h1>
              <p>収益・費用・分配は、あなたのアカウントだけに保存されます。</p>
            </div>
            <a href="/signin-with-chatgpt?return_to=/wallet" target="_top">サインイン</a>
          </section>
        ) : snapshot ? (
          <>
            <section
              className="revenue-wallet-hero"
              aria-labelledby="wallet-balance-title"
            >
              <div className="revenue-wallet-hero-copy">
                <p>ROCK WALLET</p>
                <span id="wallet-balance-title">受取可能額</span>
                <strong>—</strong>
                <small>
                  <span />
                  実収益の受取経路は未接続
                </small>
              </div>
              <div className="revenue-wallet-hero-side">
                <p>
                  検証済みのSky収益とファンド分配だけが、ここへ確定されます。
                </p>
                <div>
                  <Link href="/sky">
                    <Sparkles size={17} />
                    Skyを開く
                  </Link>
                  <Link href="/fund">
                    ファンド
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </section>

            <Tabs defaultValue="overview" className="revenue-wallet-tabs">
              <TabsList variant="line" aria-label="Wallet表示">
                <TabsTrigger value="overview">収益口座</TabsTrigger>
                <TabsTrigger value="ledger">手入力台帳</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <section className="revenue-wallet-stats" aria-label="収益状態">
                  <article>
                    <span>
                      <Bot size={19} />
                    </span>
                    <div>
                      <p>Sky収益</p>
                      <strong>接続待ち</strong>
                      <small>Providerで入金確認後に反映</small>
                    </div>
                  </article>
                  <article>
                    <span>
                      <CircleDollarSign size={19} />
                    </span>
                    <div>
                      <p>ファンド分配</p>
                      <strong>
                        {snapshot.fund.joined
                          ? yen(snapshot.fund.projectedShare)
                          : '未参加'}
                      </strong>
                      <small>
                        {snapshot.fund.joined
                          ? '現在は試算・未送金'
                          : '参加設定はファンドで管理'}
                      </small>
                    </div>
                  </article>
                  <article>
                    <span>
                      <Landmark size={19} />
                    </span>
                    <div>
                      <p>払出し</p>
                      <strong>未接続</strong>
                      <small>銀行・暗号資産・ATMは準備中</small>
                    </div>
                  </article>
                </section>

                <section
                  className="revenue-wallet-flow"
                  aria-labelledby="wallet-flow-title"
                >
                  <header>
                    <div>
                      <p>SETTLEMENT FLOW</p>
                      <h2 id="wallet-flow-title">収益がWalletに入るまで</h2>
                    </div>
                    <ShieldCheck size={21} />
                  </header>
                  <ol>
                    <li>
                      <span>1</span>
                      <div>
                        <strong>仕事・販売</strong>
                        <small>Skyまたはファンドで収益が発生</small>
                      </div>
                    </li>
                    <li>
                      <span>2</span>
                      <div>
                        <strong>入金確認</strong>
                        <small>外部Providerの記録と照合</small>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <strong>精算・分配</strong>
                        <small>費用、返金、受取人を確定</small>
                      </div>
                    </li>
                    <li>
                      <span>4</span>
                      <div>
                        <strong>受取可能</strong>
                        <small>払出し先を選んで受け取る</small>
                      </div>
                    </li>
                  </ol>
                </section>

                <section className="revenue-wallet-fund">
                  <div>
                    <span>
                      <CircleDollarSign size={21} />
                    </span>
                    <div>
                      <p>ファンド</p>
                      <h2>
                        {snapshot.fund.joined
                          ? '分配試算を接続済み'
                          : 'ファンドはまだ未参加'}
                      </h2>
                      <small>
                        試算額は実際の入金ではありません。収益確認と分配確定後にWalletへ入ります。
                      </small>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>共通収益の試算</dt>
                      <dd>{yen(snapshot.fund.commonRevenue)}</dd>
                    </div>
                    <div>
                      <dt>分配原資の試算</dt>
                      <dd>{yen(snapshot.fund.distributable)}</dd>
                    </div>
                    <div>
                      <dt>自分の分配試算</dt>
                      <dd>{yen(snapshot.fund.projectedShare)}</dd>
                    </div>
                  </dl>
                  <Link href="/fund">
                    ファンド設定を確認
                    <ArrowRight size={16} />
                  </Link>
                </section>
              </TabsContent>

              <TabsContent value="ledger">
                <section className="revenue-wallet-ledger-summary">
                  <div>
                    <p>未照合の記録残高</p>
                    <strong>{yen(snapshot.balance)}</strong>
                    <small>手入力は受取可能額には加算されません</small>
                  </div>
                  <dl>
                    <div>
                      <dt>売上記録</dt>
                      <dd>{yen(snapshot.revenue)}</dd>
                    </div>
                    <div>
                      <dt>経費記録</dt>
                      <dd>{yen(snapshot.expense)}</dd>
                    </div>
                  </dl>
                  <div className="revenue-wallet-ledger-actions">
                    <button onClick={() => openForm('revenue')}>
                      <ArrowDownLeft size={17} />
                      売上を記録
                    </button>
                    <button onClick={() => openForm('expense')}>
                      <ArrowUpRight size={17} />
                      経費を記録
                    </button>
                  </div>
                </section>

                {formOpen && (
                  <form className="wallet-record-form" onSubmit={save}>
                    <header>
                      <div>
                        <span>{kind === 'revenue' ? '売上' : '経費'}</span>
                        <h2>
                          {kind === 'revenue' ? '売上を記録' : '経費を記録'}
                        </h2>
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
                          onChange={(event) =>
                            setOccurredOn(event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="wallet-save"
                      disabled={saving}
                      type="submit"
                    >
                      <Plus size={18} />
                      {saving ? '保存中…' : '台帳に追加'}
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
                    <h2 id="wallet-history-title">手入力の履歴</h2>
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
                            <b
                              className={signedAmount >= 0 ? 'credit' : 'debit'}
                            >
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
                      <strong>手入力の記録はありません</strong>
                      <p>
                        確認できていない収益や費用だけを補助的に記録します。
                      </p>
                    </div>
                  )}
                </section>
              </TabsContent>
            </Tabs>

            <p className="revenue-wallet-footnote">
              Rock
              Walletは収益の確認・精算・払出しを管理します。外部Provider接続前に実資金を保管・送金しません。
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
