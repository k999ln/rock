'use client';

import { useState } from 'react';
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
  const [mode, setMode] = useState<SpendMode>('SIMULATION');
  const [amount, setAmount] = useState('25');
  const [side, setSide] = useState<'YES' | 'NO'>('YES');
  const [proposalState, setProposalState] =
    useState<ProposalState>('draft');
  const [emergencyStopped, setEmergencyStopped] = useState(false);
  const numericAmount = Number(amount);
  const amountIsValid =
    Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= 250;
  const projectedExposure = amountIsValid
    ? (numericAmount + 125).toFixed(2)
    : '—';

  return (
    <div className="spend-workspace">
      <section className="spend-command" aria-labelledby="spend-command-title">
        <div className="spend-command-copy">
          <p className="rock-eyebrow">VALUE ROUTER · SAFE SPEND</p>
          <h2 id="spend-command-title">使う前に、守る。</h2>
          <p>
            Walletから外へ出る価値は、すべて提案・Risk Guard・承認・隔離署名・照合を通ります。
          </p>
          <div className="spend-command-status">
            <span><ShieldCheck size={15} /> Risk Guard 稼働</span>
            <span><KeyRound size={15} /> 秘密鍵はAdapterへ渡さない</span>
          </div>
        </div>
        <div className="spend-mode-control" aria-label="支出モード">
          <span>OS MODE</span>
          <div>
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
          <small>LIVEはOSレベルで無効</small>
        </div>
      </section>

      <section className="spend-assets" aria-label="資産レジストリの概要">
        <article className="is-primary">
          <div><CircleDollarSign size={18} /><span>テスト用残高</span></div>
          <strong>10,000.00 <small>USDC</small></strong>
          <p>Polygon · {mode}専用</p>
        </article>
        <article>
          <div><WalletCards size={18} /><span>外部資産</span></div>
          <strong>未接続</strong>
          <p>送出・取引は開始していません</p>
        </article>
        <article>
          <div><Gamepad2 size={18} /><span>ゲーム内資産</span></div>
          <strong>別管理</strong>
          <p>譲渡・換金・外部送出の条件を個別判定</p>
        </article>
      </section>

      <div className="spend-main-grid">
        <section className="spend-proposal" aria-labelledby="proposal-title">
          <div className="spend-section-heading">
            <div>
              <p className="rock-eyebrow">SPEND PROPOSAL</p>
              <h2 id="proposal-title">Polymarketへ支出を提案</h2>
            </div>
            <span className="spend-adapter-badge"><Sparkles size={13} /> DRY-RUN ADAPTER</span>
          </div>
          <div className="spend-market-field">
            対象マーケット
            <span className="spend-readonly-field">BTC above $100k by year end?</span>
          </div>
          <div className="spend-form-row">
            <label>
              金額
              <span className="spend-amount-field">
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
              <div className="spend-side-control">
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
          <div className="spend-proposal-meta">
            <span>最大スリッページ <strong>1.0%</strong></span>
            <span>手数料上限 <strong>0.50 USDC</strong></span>
            <span>有効期限 <strong>5分</strong></span>
          </div>
          {!amountIsValid && amount !== '' && (
            <p className="spend-inline-error" role="alert">
              <OctagonAlert size={14} /> 1回の上限250 USDC以内で入力してください。
            </p>
          )}
          {proposalState === 'review' && amountIsValid && (
            <output className="spend-review-card">
              <span><Check size={15} /> 提案プレビューを作成しました</span>
              <strong>{numericAmount.toFixed(2)} USDC · {side}</strong>
              <p>実行はしていません。次は本人承認と署名境界への接続です。</p>
            </output>
          )}
          <button
            className="spend-propose-button"
            disabled={!amountIsValid || emergencyStopped}
            onClick={() => setProposalState('review')}
          >
            {emergencyStopped
              ? '緊急停止中'
              : proposalState === 'review'
                ? '提案内容を更新'
                : '支出提案を確認'}
            <ArrowRight size={17} />
          </button>
          <p id="amount-rule" className="spend-fixture-note">
            UIプレビュー · 実資金、外部API、秘密鍵には接続していません
          </p>
        </section>

        <aside className="spend-risk" aria-labelledby="risk-title">
          <div className="spend-section-heading">
            <div>
              <p className="rock-eyebrow">POLICY / RISK GUARD</p>
              <h2 id="risk-title">実行前の4つの防波堤</h2>
            </div>
            <span className={emergencyStopped ? 'spend-safe-dot is-stopped' : 'spend-safe-dot'}>
              {emergencyStopped ? 'STOPPED' : 'SAFE'}
            </span>
          </div>
          <ul>
            <li><span><Check size={13} /></span><div><strong>1回の支出上限</strong><small>{amountIsValid ? `${numericAmount.toFixed(2)} / 250 USDC` : '入力を確認'}</small></div></li>
            <li><span><Check size={13} /></span><div><strong>合計Exposure</strong><small>{projectedExposure} / 1,000 USDC</small></div></li>
            <li><span><Check size={13} /></span><div><strong>1日の損失上限</strong><small>0.00 / 100 USDC</small></div></li>
            <li><span><Ban size={13} /></span><div><strong>Smart Money live</strong><small>上流未完成のため無効</small></div></li>
          </ul>
          <button
            className="spend-stop"
            type="button"
            aria-pressed={emergencyStopped}
            onClick={() => {
              setEmergencyStopped((stopped) => !stopped);
              setProposalState('draft');
            }}
          >
            <OctagonAlert size={16} />
            {emergencyStopped ? '停止を解除（プレビュー）' : '緊急停止'}
          </button>
          <p>{emergencyStopped ? '新しい提案を停止しています。' : '停止すると新しい提案・承認・Adapter実行を拒否します。'}</p>
        </aside>
      </div>

      <section className="spend-flow" aria-labelledby="spend-flow-title">
        <div className="spend-section-heading">
          <div>
            <p className="rock-eyebrow">CONTROLLED EXECUTION</p>
            <h2 id="spend-flow-title">Walletから外へ出る、唯一の経路。</h2>
          </div>
          <span>Sky / MCPから同じ記録を参照</span>
        </div>
        <ol>
          {flow.map(([number, label, event], index) => (
            <li key={event}>
              <span>{number}</span>
              <strong>{label}</strong>
              <small>{event}</small>
              {index < flow.length - 1 && <ChevronRight aria-hidden="true" size={15} />}
            </li>
          ))}
        </ol>
        <div className="spend-receipt-row">
          <span><ReceiptText size={16} /> receipt / reconciliation</span>
          <p>結果不明は自動再送せず、資金予約を保持して照合待ちにします。</p>
          <strong>APPEND-ONLY</strong>
        </div>
      </section>
    </div>
  );
}
