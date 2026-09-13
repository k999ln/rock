'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Eye,
  FileCheck2,
  FlaskConical,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';

type Market = {
  id: string;
  question: string;
  probability: number;
  volume: number;
  liquidity: number;
};

type Snapshot = {
  ok: boolean;
  source?: string;
  fetchedAt?: string;
  markets: Market[];
  code?: string;
};

type BacktestAssessment = {
  ok: boolean;
  assessment?: 'simulation_only' | 'insufficient_sample';
  eligibleForFundRevenue?: false;
  message?: string;
  code?: string;
  metrics?: {
    snapshots: number;
    trades: number;
    winRate: number;
    totalPnl: number;
    maxDrawdown: number;
  };
};

const compact = new Intl.NumberFormat('ja-JP', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

async function fetchSnapshot(signal?: AbortSignal) {
  const response = await fetch('/api/markets/analysis?limit=8', {
    cache: 'no-store',
    signal,
  });
  const value = (await response.json()) as Snapshot;
  if (!response.ok) throw new Error(value.code ?? 'market_unavailable');
  return value;
}

export default function PolymarketWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ ok: false, markets: [] });
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState('');
  const [assessment, setAssessment] = useState<BacktestAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);

  function refresh(signal?: AbortSignal) {
    setLoading(true);
    fetchSnapshot(signal)
      .then(setSnapshot)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSnapshot({ ok: false, markets: [], code: 'live_market_data_unavailable' });
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetchSnapshot(controller.signal)
      .then(setSnapshot)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSnapshot({ ok: false, markets: [], code: 'live_market_data_unavailable' });
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function assess(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!report.trim() || assessing) return;
    setAssessing(true);
    setAssessment(null);
    try {
      const response = await fetch('/api/markets/bot/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: report,
      });
      const value = (await response.json()) as BacktestAssessment;
      setAssessment(value);
    } catch {
      setAssessment({ ok: false, code: 'report_unavailable' });
    } finally {
      setAssessing(false);
    }
  }

  return (
    <WorkspaceShell title="Markets" contentClassName="polymarket-page">
      <section className="polymarket-shell" aria-labelledby="polymarket-title">
        <header className="polymarket-heading">
          <span className="polymarket-mark" aria-hidden="true">
            <Activity size={30} />
          </span>
          <div>
            <p>自動化ファンド / 市場分析アダプター</p>
            <h1 id="polymarket-title">RockstarOS Markets</h1>
          </div>
          <span className={`polymarket-state ${snapshot.ok ? 'is-live' : ''}`}>
            {loading ? '接続中' : snapshot.ok ? 'LIVE / 読取専用' : '取得停止'}
          </span>
        </header>

        <div className="markets-policy-strip" role="note">
          <ShieldCheck size={18} />
          <p>
            市場データは判断材料です。利回り・確定収益ではなく、ファンド収益への計上はProviderで確定した実現損益だけです。
          </p>
        </div>

        {snapshot.ok ? (
          <div className="markets-analysis-grid">
            <div className="markets-analysis-head">
              <span>POLYMARKET LIVE</span>
              <button onClick={() => refresh()} disabled={loading}>
                <RefreshCw size={14} /> 更新
              </button>
            </div>
            {snapshot.markets.map((market) => (
              <article key={market.id} className="markets-analysis-row">
                <div>
                  <h2>{market.question}</h2>
                  <span>
                    出来高 {compact.format(market.volume)} / 流動性{' '}
                    {compact.format(market.liquidity)}
                  </span>
                </div>
                <strong>{Math.round(market.probability * 100)}%</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className="polymarket-empty-state">
            <span><LockKeyhole size={27} /></span>
            <h2>{loading ? 'ライブ市場を確認中です' : 'ライブ市場を確認できません'}</h2>
            <p>サンプル値へ置き換えず、取得できるまで収益判断と取引導線を停止します。</p>
            {!loading && <button onClick={() => refresh()}><RefreshCw size={16} /> 再試行</button>}
          </div>
        )}

        <section className="markets-bot-lab" aria-labelledby="markets-bot-title">
          <div className="markets-bot-copy">
            <span><FlaskConical size={16} /> BOT STRATEGY LAB</span>
            <h2 id="markets-bot-title">固定commitを、バックテストだけで検証</h2>
            <p>
              MrFadiAi/Polymarket-botの注文系統は接続せず、clean treeで実行したoffline reportだけを読み取ります。秘密鍵、LIVE切替、Wallet操作は受け付けません。
            </p>
            <Link href="https://github.com/MrFadiAi/Polymarket-bot" target="_blank">
              原リポジトリを確認 <ArrowUpRight size={14} />
            </Link>
          </div>
          <form onSubmit={assess}>
            <label htmlFor="markets-backtest-report">RockstarOS形式のbacktest JSON</label>
            <textarea
              id="markets-backtest-report"
              value={report}
              maxLength={64_000}
              onChange={(event) => setReport(event.target.value)}
              placeholder="run-backtest.mjsが出力したJSONを貼り付け"
            />
            <button disabled={!report.trim() || assessing}>
              <FileCheck2 size={16} /> {assessing ? '検証中' : 'reportを検証'}
            </button>
          </form>
          {assessment && (
            <output className={`markets-bot-result ${assessment.ok ? '' : 'is-error'}`}>
              {assessment.ok && assessment.metrics ? (
                <>
                  <strong>
                    {assessment.assessment === 'simulation_only'
                      ? 'バックテストとして受理'
                      : '標本不足'}
                  </strong>
                  <span>
                    {assessment.metrics.snapshots.toLocaleString()} snapshots /{' '}
                    {assessment.metrics.trades.toLocaleString()} trades / 勝率{' '}
                    {(assessment.metrics.winRate * 100).toFixed(1)}% / 合成PnL ${assessment.metrics.totalPnl.toFixed(2)}
                  </span>
                  <small>{assessment.message} 8.88 USDの回収原資: 0 USD</small>
                </>
              ) : (
                <><strong>reportを受理できません</strong><span>{assessment.code}</span></>
              )}
            </output>
          )}
        </section>

        <div className="polymarket-boundaries" aria-label="市場分析の安全境界">
          <div><Eye size={19} /><span><strong>見る</strong>公開ライブ市場だけを表示</span></div>
          <div><BarChart3 size={19} /><span><strong>分析する</strong>予測値を収益へ計上しない</span></div>
          <div><Wallet size={19} /><span><strong>取引する</strong>RockstarOSからの自動注文・資金移動は無効</span></div>
        </div>

        <div className="markets-actions">
          <a href="https://rockstaros-markets.higgsfield.app" target="_blank" rel="noreferrer">
            詳細ターミナルを開く <ArrowUpRight size={16} />
          </a>
          <Link href="/fund">ファンド構成へ戻る</Link>
        </div>
      </section>
    </WorkspaceShell>
  );
}
