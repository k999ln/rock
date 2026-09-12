'use client';

import { useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Ban,
  Check,
  ChevronRight,
  CircleDollarSign,
  Gamepad2,
  KeyRound,
  LockKeyhole,
  OctagonAlert,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';

type SpendMode = 'SIMULATION' | 'PAPER' | 'LIVE';
type ProposalState = 'draft' | 'review';
type WalletTab = '概要' | '支出' | '記録';

const walletTabs: WalletTab[] = ['概要', '支出', '記録'];
const flow = [
  ['01', '提案', 'spend.proposed'],
  ['02', 'リスク確認', 'risk.checked'],
  ['03', '本人承認', 'spend.approved'],
  ['04', '隔離署名', 'signing.requested'],
  ['05', 'Adapter', 'trade.submitted'],
  ['06', '実行記録', 'spend.executed'],
  ['07', '照合', 'settlement.reconciled'],
] as const;

export function ValueSpendPanel() {
  const [tab, setTab] = useState<WalletTab>('概要');
  const [mode, setMode] = useState<SpendMode>('SIMULATION');
  const [amount, setAmount] = useState('25');
  const [side, setSide] = useState<'YES' | 'NO'>('YES');
  const [proposalState, setProposalState] = useState<ProposalState>('draft');
  const [emergencyStopped, setEmergencyStopped] = useState(false);
  const numericAmount = Number(amount);
  const amountIsValid =
    Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= 250;
  const projectedExposure = amountIsValid
    ? (numericAmount + 125).toFixed(2)
    : '—';
  const showAssets = tab === '概要';
  const showSpend = tab !== '記録';
  const showRecords = tab !== '支出';

  return (
    <div className="sky-feed-layout wallet-feed-layout">
      <section
        className="sky-feed-column wallet-feed-column"
        aria-labelledby="wallet-feed-title"
      >
        <section
          className="sky-assistant wallet-command"
          aria-labelledby="wallet-command-title"
        >
          <div
            className="sky-assistant-avatar wallet-command-avatar"
            aria-hidden="true"
          >
            <span>W</span>
          </div>
          <div className="sky-assistant-body wallet-command-body">
            <div className="wallet-command-copy">
              <div>
                <p className="wallet-command-kicker">VALUE ROUTER · SAFE SPEND</p>
                <h1 id="wallet-command-title">Walletから、安全に使う。</h1>
              </div>
              <span className="wallet-command-state">
                <i aria-hidden="true" /> Risk Guard 稼働
              </span>
            </div>
            <p className="wallet-command-description">
              外へ出る価値は、提案・確認・承認・隔離署名・照合を必ず通ります。
            </p>
            <div className="wallet-mode-row" aria-label="支出モード">
              {(['SIMULATION', 'PAPER'] as SpendMode[]).map((item) => (
                <button
                  key={item}
                  aria-pressed={mode === item}
                  onClick={() => {
                    setMode(item);
                    setProposalState('draft');
                  }}
                >
                  {item}
                </button>
              ))}
              <button disabled title="明示許可と本番受入が必要です">
                <LockKeyhole size={12} /> LIVE
              </button>
            </div>
            <div className="wallet-command-notes">
              <span>
                <KeyRound size={14} /> 秘密鍵はAdapterへ渡さない
              </span>
              <span>
                <ShieldCheck size={14} /> LIVEはOSレベルで無効
              </span>
            </div>
          </div>
        </section>

        <header className="sky-feed-header wallet-feed-header">
          <h2 id="wallet-feed-title" className="sr-only">
            Wallet
          </h2>
          <div
            className="wallet-feed-tabs"
            role="tablist"
            aria-label="Walletの表示"
          >
            {walletTabs.map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={tab === item}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <span className="wallet-feed-mode">{mode}</span>
        </header>

        <div className="sky-feed wallet-feed" aria-live="polite">
          {showAssets && (
            <article
              className="sky-feed-post wallet-feed-post"
              style={{ '--sky-index': 0 } as CSSProperties}
            >
              <div className="sky-timeline-node" aria-hidden="true">
                <span className="sky-provider-avatar wallet-avatar wallet-avatar-value">
                  値
                </span>
              </div>
              <div className="sky-post-body">
                <div className="sky-post-meta-row">
                  <div className="sky-post-author">
                    <strong>Value Router</strong>
                    <span>@rock_wallet</span>
                  </div>
                  <span className="sky-post-state is-ready">
                    <i aria-hidden="true" />資産を分離
                  </span>
                </div>
                <div className="wallet-post-title">
                  <CircleDollarSign size={20} />
                  <div>
                    <small>テスト用残高</small>
                    <strong>10,000.00 USDC</strong>
                  </div>
                </div>
                <p className="sky-post-description">
                  Polygon · {mode}専用。外部資産やゲーム内資産とは無条件に混ぜません。
                </p>
                <div
                  className="wallet-asset-strip"
                  aria-label="資産レジストリの概要"
                >
                  <span>
                    <WalletCards size={15} />
                    <b>外部資産</b>未接続
                  </span>
                  <span>
                    <Gamepad2 size={15} />
                    <b>ゲーム内資産</b>別管理
                  </span>
                </div>
                <p className="sky-post-place">
                  ゲーム資産は譲渡・換金・外部送出の条件を個別判定
                </p>
              </div>
            </article>
          )}

          {showSpend && (
            <article
              className="sky-feed-post wallet-feed-post"
              style={{ '--sky-index': 1 } as CSSProperties}
            >
              <div className="sky-timeline-node" aria-hidden="true">
                <span className="sky-provider-avatar wallet-avatar wallet-avatar-market">
                  P
                </span>
              </div>
              <div className="sky-post-body">
                <div className="sky-post-meta-row">
                  <div className="sky-post-author">
                    <strong>Polymarket Adapter</strong>
                    <span>@dry_run</span>
                  </div>
                  <span className="sky-post-state is-connect">
                    <i aria-hidden="true" />DRY-RUN
                  </span>
                </div>
                <div className="wallet-post-title">
                  <Sparkles size={20} />
                  <div>
                    <small>SPEND PROPOSAL</small>
                    <strong>Polymarketへ支出を提案</strong>
                  </div>
                </div>
                <p className="sky-post-description">
                  BTC above $100k by year end?
                </p>
                <div className="wallet-proposal-form">
                  <label>
                    <span>金額</span>
                    <span className="wallet-input">
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => {
                          setAmount(event.target.value);
                          setProposalState('draft');
                        }}
                        aria-describedby="amount-rule"
                      />
                      <b>USDC</b>
                    </span>
                  </label>
                  <fieldset>
                    <legend>方向</legend>
                    <div>
                      {(['YES', 'NO'] as const).map((item) => (
                        <button
                          type="button"
                          key={item}
                          aria-pressed={side === item}
                          onClick={() => {
                            setSide(item);
                            setProposalState('draft');
                          }}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <div className="wallet-proposal-meta">
                  <span>
                    Slippage <b>1.0%</b>
                  </span>
                  <span>
                    Fee上限 <b>0.50 USDC</b>
                  </span>
                  <span>
                    期限 <b>5分</b>
                  </span>
                </div>
                {!amountIsValid && amount !== '' && (
                  <p className="wallet-inline-error" role="alert">
                    <OctagonAlert size={14} />
                    1回の上限250 USDC以内で入力してください。
                  </p>
                )}
                {proposalState === 'review' && amountIsValid && (
                  <output className="wallet-review-card">
                    <span>
                      <Check size={15} />提案プレビューを作成
                    </span>
                    <strong>
                      {numericAmount.toFixed(2)} USDC · {side}
                    </strong>
                    <p>まだ実行していません。次は本人承認と署名境界です。</p>
                  </output>
                )}
                <div className="sky-post-actions wallet-post-actions">
                  <span id="amount-rule">
                    実資金、外部API、秘密鍵には接続していません
                  </span>
                  <button
                    className="sky-post-primary"
                    disabled={!amountIsValid || emergencyStopped}
                    onClick={() => setProposalState('review')}
                  >
                    {emergencyStopped
                      ? '緊急停止中'
                      : proposalState === 'review'
                        ? '内容を更新'
                        : '提案を確認'}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </article>
          )}

          {showSpend && (
            <article
              className="sky-feed-post wallet-feed-post"
              style={{ '--sky-index': 2 } as CSSProperties}
            >
              <div className="sky-timeline-node" aria-hidden="true">
                <span className="sky-provider-avatar wallet-avatar wallet-avatar-risk">
                  守
                </span>
              </div>
              <div className="sky-post-body">
                <div className="sky-post-meta-row">
                  <div className="sky-post-author">
                    <strong>Risk Guard</strong>
                    <span>@rock_policy</span>
                  </div>
                  <span
                    className={
                      'sky-post-state ' +
                      (emergencyStopped ? 'is-stopped' : 'is-ready')
                    }
                  >
                    <i aria-hidden="true" />
                    {emergencyStopped ? 'STOPPED' : 'SAFE'}
                  </span>
                </div>
                <div className="wallet-post-title">
                  <ShieldCheck size={20} />
                  <div>
                    <small>POLICY / RISK</small>
                    <strong>実行前の4つの防波堤</strong>
                  </div>
                </div>
                <ul className="wallet-risk-list">
                  <li>
                    <Check size={13} />
                    <span>
                      <strong>1回の支出上限</strong>
                      <small>
                        {amountIsValid
                          ? `${numericAmount.toFixed(2)} / 250 USDC`
                          : '入力を確認'}
                      </small>
                    </span>
                  </li>
                  <li>
                    <Check size={13} />
                    <span>
                      <strong>合計Exposure</strong>
                      <small>{projectedExposure} / 1,000 USDC</small>
                    </span>
                  </li>
                  <li>
                    <Check size={13} />
                    <span>
                      <strong>1日の損失上限</strong>
                      <small>0.00 / 100 USDC</small>
                    </span>
                  </li>
                  <li>
                    <Ban size={13} />
                    <span>
                      <strong>Smart Money live</strong>
                      <small>上流未完成のため無効</small>
                    </span>
                  </li>
                </ul>
                <div className="sky-post-actions wallet-post-actions">
                  <span>
                    {emergencyStopped
                      ? '新しい提案を停止しています'
                      : '提案・承認・Adapter実行を一括停止'}
                  </span>
                  <button
                    className="wallet-stop-button"
                    type="button"
                    aria-pressed={emergencyStopped}
                    onClick={() => {
                      setEmergencyStopped((stopped) => !stopped);
                      setProposalState('draft');
                    }}
                  >
                    <OctagonAlert size={15} />
                    {emergencyStopped ? '停止を解除' : '緊急停止'}
                  </button>
                </div>
              </div>
            </article>
          )}

          {showRecords && (
            <article
              className="sky-feed-post wallet-feed-post"
              style={{ '--sky-index': 3 } as CSSProperties}
            >
              <div className="sky-timeline-node" aria-hidden="true">
                <span className="sky-provider-avatar wallet-avatar wallet-avatar-receipt">
                  記
                </span>
              </div>
              <div className="sky-post-body">
                <div className="sky-post-meta-row">
                  <div className="sky-post-author">
                    <strong>Receipt &amp; Reconciliation</strong>
                    <span>@rock_ledger</span>
                  </div>
                  <span className="sky-post-state is-ready">
                    <i aria-hidden="true" />APPEND-ONLY
                  </span>
                </div>
                <div className="wallet-post-title">
                  <ReceiptText size={20} />
                  <div>
                    <small>CONTROLLED EXECUTION</small>
                    <strong>外へ出る、唯一の経路</strong>
                  </div>
                </div>
                <ol className="wallet-flow-list">
                  {flow.map(([number, label, event], index) => (
                    <li key={event}>
                      <span>{number}</span>
                      <div>
                        <strong>{label}</strong>
                        <small>{event}</small>
                      </div>
                      {index < flow.length - 1 && (
                        <ChevronRight aria-hidden="true" size={14} />
                      )}
                    </li>
                  ))}
                </ol>
                <p className="sky-post-description">
                  結果不明は自動再送せず、資金予約を保持して照合待ちにします。
                </p>
                <p className="sky-post-place">
                  同じイベントをSky / MCPと通知基盤から参照
                </p>
              </div>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
