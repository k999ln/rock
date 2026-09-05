'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Layers3,
  Play,
  Users,
  Zap,
  CircleDollarSign,
  Save,
} from 'lucide-react';
import { catalog, type Automation } from '@/lib/catalog';
import {
  defaultFund,
  distributeFund,
  fundTools,
  type FundPlan,
  type FundSnapshot,
} from '@/lib/fund';

const yen = (n: number) =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(n);
export function FundDashboard({
  openTool,
  openConnection,
}: {
  openTool: (tool: Automation) => void;
  openConnection: () => void;
}) {
  const [draft, setDraft] = useState<FundPlan>(defaultFund),
    [saved, setSaved] = useState<FundSnapshot | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const refresh = useCallback(async (replace = false) => {
    try {
      const r = await fetch('/api/fund');
      const data = (await r.json()) as FundSnapshot & { error?: string };
      if (!r.ok) throw new Error(data.error);
      setSaved(data);
      if (replace) setDraft(data.plan);
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '保存内容を読み込めませんでした。',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Initial load awaits fetch before setting server state.
    void refresh(true);
    const update = () => {
      void refresh();
    };
    window.addEventListener('loop-fund-refresh', update);
    return () => window.removeEventListener('loop-fund-refresh', update);
  }, [refresh]);
  let calculation: ReturnType<typeof distributeFund> | null = null,
    invalid = '';
  try {
    calculation = distributeFund(draft);
  } catch (e) {
    invalid = e instanceof Error ? e.message : '入力を確認してください。';
  }
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved?.plan || defaultFund);
  function change(
    key: keyof Omit<FundPlan, 'joined' | 'weights'>,
    value: string,
  ) {
    setDraft((d) => ({ ...d, [key]: value === '' ? NaN : Number(value) }));
    setNotice('');
  }
  async function save(joined = draft.joined) {
    if (!calculation) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/fund', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, joined }),
      });
      const data = (await r.json()) as FundSnapshot & { error?: string };
      if (!r.ok) throw new Error(data.error);
      setSaved(data);
      setDraft(data.plan);
      setNotice(
        joined && !saved?.plan.joined
          ? 'ファンドへの参加を保存しました。自動化を選んで実行できます。'
          : '配分と試算条件を保存しました。',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  const fields: {
    key: keyof Omit<FundPlan, 'joined' | 'weights'>;
    label: string;
    unit: string;
    max: number;
  }[] = [
    {
      key: 'revenue',
      label: '月の共通収益（販売先手数料控除後）',
      unit: '円',
      max: 1e8,
    },
    {
      key: 'commonCost',
      label: 'ファンドが負担する運用費',
      unit: '円',
      max: 1e8,
    },
    { key: 'fx', label: '試算のドル円レート', unit: '円 / USD', max: 10000 },
    {
      key: 'members',
      label: '同じ基本持分で参加する人数',
      unit: '人',
      max: 100000,
    },
    { key: 'myBoost', label: 'あなたの支援予定額', unit: '円', max: 1e8 },
    {
      key: 'otherBoost',
      label: '他の参加者の支援予定額（合計）',
      unit: '円',
      max: 1e8,
    },
  ];
  return (
    <fieldset disabled={loading || busy} className="fund-dashboard">
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOOP COMMUNITY FUND / 01</div>
          <h1>
            自動化を束ねて、
            <br className="mobile-break" />
            成果を分け合う。
          </h1>
          <p>参加する。自動化を動かす。費用と分配を、みんなに見える形に。</p>
        </div>
        <button className="secondary-button" onClick={openConnection}>
          <Zap size={16} /> PC・MCP接続 <ArrowUpRight size={16} />
        </button>
      </div>
      <section className="fund-hero">
        <div className="fund-hero-copy">
          <span className="dark-label">
            <Layers3 size={14} /> AUTOMATION FUND
          </span>
          <h2>LOOP ファンド</h2>
          <p>
            ココナラ案件支援と記事制作から始める、
            <br />
            4つの自動化をまとめた共同運用プラン。
          </p>
          <div className="fund-hero-actions">
            <button
              className="lime-button"
              disabled={busy || loading || !calculation || !saved}
              onClick={() => void save(!saved?.plan.joined)}
            >
              {saved?.plan.joined ? (
                <>
                  <Check size={17} />
                  参加中 · 参加を解除
                </>
              ) : (
                <>
                  <Users size={17} />
                  無料でファンドに参加
                </>
              )}
            </button>
            <span>参加設定の保存 / 入金は不要</span>
          </div>
        </div>
        <div className="fund-ring">
          <svg
            viewBox="0 0 180 180"
            aria-label="分配枠の試算: 基本分配・ブースト・共同留保"
          >
            <circle
              cx="90"
              cy="90"
              r="72"
              fill="none"
              stroke="#45533f"
              strokeWidth="14"
            />
            <circle
              cx="90"
              cy="90"
              r="72"
              fill="none"
              stroke="#ddff79"
              strokeWidth="14"
              strokeDasharray={`${Number.isFinite(draft.basePercent) ? Math.min(100, draft.basePercent) * 4.5239 : 0} 452.39`}
              transform="rotate(-90 90 90)"
            />
          </svg>
          <div>
            <small>基本分配枠 · 試算</small>
            <strong>
              {Number.isFinite(draft.basePercent) ? draft.basePercent : '—'}
              <i>%</i>
            </strong>
            <span>みんなで育てる運用原資</span>
          </div>
        </div>
      </section>
      <div className="fund-stats">
        <article>
          <span>共同資金の残高</span>
          <strong>未接続</strong>
          <small>入金・出金の受付前</small>
        </article>
        <article>
          <span>分配済みの収益</span>
          <strong>未接続</strong>
          <small>売上・送金サービスの連携前</small>
        </article>
        <article>
          <span>あなたの実行記録</span>
          <strong>
            {saved ? saved.totalRuns : '—'}
            <em>回</em>
          </strong>
          <small>ツールの処理記録 / 収益実績とは別</small>
        </article>
        <article>
          <span>あなたの参加状態</span>
          <strong className="participation-value">
            {loading ? '読込中' : saved?.plan.joined ? '参加中' : '未参加'}
          </strong>
          <small>参加・配分はアカウントに保存</small>
        </article>
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}{' '}
          <button className="text-link" onClick={() => void refresh(!dirty)}>
            再読込
          </button>
        </div>
      )}
      <div className="fund-columns">
        <section className="panel allocation-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PORTFOLIO</span>
              <h2>ファンドの自動化</h2>
            </div>
            <span className="outline-tag">
              配分計画 {draft.weights.reduce((a, b) => a + b, 0)}%
            </span>
          </div>
          <p className="subnote">
            共同運用予算をどの自動化に使うかの計画です。保存しても課金や定期実行は始まりません。
          </p>
          <div className="allocation-bar" aria-hidden="true">
            {draft.weights.map((w, i) => (
              <span
                key={i}
                className={'allocation-color color-' + i}
                style={{ flex: Math.max(0, w) || 0.01 }}
              />
            ))}
          </div>
          {fundTools.map((id, i) => {
            const tool = catalog.find((t) => t.id === id)!;
            return (
              <div className="allocation-row" key={id}>
                <span className={'allocation-dot color-' + i} />
                <div className="allocation-title">
                  <h3>{tool.name}</h3>
                  <small>
                    {tool.runner === 'delivery-local'
                      ? 'PC接続で実行'
                      : 'ブラウザ / 接続したPCで実行'}
                  </small>
                </div>
                <label className="weight-input">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.weights[i]}
                    aria-label={tool.name + 'の配分（%）'}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setDraft((d) => ({
                        ...d,
                        weights: d.weights.map((w, j) => (j === i ? n : w)),
                      }));
                      setNotice('');
                    }}
                  />
                  %
                </label>
                <button
                  className="run-small"
                  onClick={() => openTool(tool)}
                  aria-label={tool.name + 'を使う'}
                >
                  <Play size={13} />
                  使う
                </button>
              </div>
            );
          })}
          <div className="allocation-footer">
            <button
              className="black-button"
              disabled={busy || loading || !!invalid || !saved || !dirty}
              onClick={() => void save()}
            >
              <Save size={16} />
              {busy ? '保存中…' : '配分・試算条件を保存'}
            </button>
            <span className="subnote">
              {dirty
                ? '未保存の変更あり'
                : saved?.updatedAt
                  ? '保存済み'
                  : '初期プラン'}
            </span>
          </div>
        </section>
        <section className="panel fund-ledger">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ACTIVITY</span>
              <h2>ファンドの運用記録</h2>
            </div>
            <span className="outline-tag">あなたの記録</span>
          </div>
          {saved?.runs.length ? (
            <div className="activity-list">
              {saved.runs.slice(0, 5).map((run) => (
                <article key={run.id}>
                  <span
                    className={
                      'activity-mark ' +
                      (run.status === 'failed' ? 'failed' : '')
                    }
                  >
                    <Check size={15} />
                  </span>
                  <div>
                    <h3>
                      {catalog.find((t) => t.id === run.tool)?.name || run.tool}
                    </h3>
                    <small>
                      {run.sample ? 'サンプル · ' : ''}
                      {run.transport === 'local-mcp'
                        ? 'PC · MCP'
                        : 'ブラウザ'}{' '}
                      · {run.status === 'completed' ? '処理完了' : '処理失敗'} ·{' '}
                      {(run.durationMs / 1000).toFixed(1)}秒
                    </small>
                    <time>
                      {new Date(run.createdAt).toLocaleString('ja-JP')}
                    </time>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ledger-empty">
              <Layers3 size={30} />
              <h3>最初の実行を、ここに。</h3>
              <p>
                左の自動化を使うと処理の記録が残ります。
                <br />
                原稿や成果物の中身は保存しません。
              </p>
              <button
                className="text-link"
                onClick={() => openTool(catalog[0])}
              >
                ココナラ案件チェックを使う <ArrowRight size={16} />
              </button>
            </div>
          )}
          <p className="subnote">
            これはサイトから報告された実行履歴です。売上証明・収益の保証・電力の実測ではありません。
          </p>
        </section>
      </div>
      <section className="distribution-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SHARED UPSIDE</span>
            <h2>費用を引いて、成果を分ける。</h2>
          </div>
          <span className="outline-tag">すべて試算 / 入金・送金なし</span>
        </div>
        <p className="subnote">
          運用費を先に回収し、月最大 $8.88
          相当のLOOP利用料をファンド全体で1回だけ控除。残りを基本分配・ブースト・共同留保へ分ける案です。
        </p>
        <div className="distribution-grid">
          <div className="panel scenario-panel">
            <h3>このファンドの試算条件</h3>
            <div className="field-grid">
              {fields.map((f) => (
                <label className="field" key={f.key}>
                  <span>{f.label}</span>
                  <div className="number-input">
                    <input
                      type="number"
                      min={f.key === 'fx' ? 0.01 : f.key === 'members' ? 1 : 0}
                      max={f.max}
                      step={f.key === 'fx' ? 'any' : 1}
                      value={Number.isNaN(draft[f.key]) ? '' : draft[f.key]}
                      onChange={(e) => change(f.key, e.target.value)}
                    />
                    <span>{f.unit}</span>
                  </div>
                </label>
              ))}
              <label className="field">
                <span>基本分配枠</span>
                <div className="number-input">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={
                      Number.isNaN(draft.basePercent) ? '' : draft.basePercent
                    }
                    onChange={(e) => change('basePercent', e.target.value)}
                  />
                  <span>%</span>
                </div>
              </label>
              <label className="field">
                <span>ブースト分配枠</span>
                <div className="number-input">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={
                      Number.isNaN(draft.boostPercent) ? '' : draft.boostPercent
                    }
                    onChange={(e) => change('boostPercent', e.target.value)}
                  />
                  <span>%</span>
                </div>
              </label>
            </div>
            <p className="subnote">
              人数・支援額・分配率・為替はあなたの仮定です。収益予測ではありません。基本分配は全員同じ持分。残りは共同留保に回します。
            </p>
          </div>
          <div className="distribution-results" aria-live="polite">
            {calculation ? (
              <>
                <div className="money-flow">
                  <div>
                    <span>共通収益</span>
                    <strong>{yen(calculation.revenue)}</strong>
                  </div>
                  <span>−</span>
                  <div>
                    <span>回収する運用費</span>
                    <strong>{yen(calculation.recovered)}</strong>
                  </div>
                  <span>−</span>
                  <div>
                    <span>LOOP利用料</span>
                    <strong>{yen(calculation.fee)}</strong>
                  </div>
                </div>
                <div className="distributable">
                  <span>みんなの分配原資</span>
                  <strong>{yen(calculation.distributable)}</strong>
                  <small>支援金はこの収益に加算しません</small>
                </div>
                <div className="distribution-bars">
                  <div>
                    <span>あなたの分配試算</span>
                    <strong>{yen(calculation.mine)}</strong>
                  </div>
                  <div>
                    <span>他の参加者への分配</span>
                    <strong>{yen(calculation.others)}</strong>
                  </div>
                  <div>
                    <span>次の自動化に使う共同留保</span>
                    <strong>{yen(calculation.reserve)}</strong>
                  </div>
                </div>
                <div className="boost-result">
                  <Zap size={22} />
                  <div>
                    <h3>あなたのブースト分</h3>
                    <strong>+{yen(calculation.mineBoost)}</strong>
                    <p>
                      基本分配 {yen(calculation.mineBase)}{' '}
                      に加算。全支援予定額の中で、あなたが支える割合に応じて分配枠を配ります。
                    </p>
                  </div>
                </div>
                {calculation.unrecovered > 0 && (
                  <p className="notice">
                    運用費の未回収分 {yen(calculation.unrecovered)}
                    。分配・LOOP利用料は0円です。
                  </p>
                )}
                <p className="subnote">
                  共通収益がなければ分配も0円。支援者がいないブースト枠と1円未満の端数は共同留保へ。端末の電気代・通信費・税金は、この分配の外で本人が負担します。
                </p>
              </>
            ) : (
              <p className="notice" role="alert">
                {invalid}
              </p>
            )}
          </div>
        </div>
        <div className="support-plan">
          <CircleDollarSign size={24} />
          <div>
            <h3>共同運用を支える資金の計画</h3>
            <p>
              あなた {yen(Number.isFinite(draft.myBoost) ? draft.myBoost : 0)}{' '}
              ＋ 他の参加者{' '}
              {yen(Number.isFinite(draft.otherBoost) ? draft.otherBoost : 0)}
              。支援は運用原資として扱う案で、購入済み口数・出金可能残高ではありません。
            </p>
          </div>
          <span className="outline-tag">支援受付前</span>
        </div>
        <div className="allocation-footer">
          <button
            className="black-button"
            disabled={busy || loading || !!invalid || !saved || !dirty}
            onClick={() => void save()}
          >
            <Save size={16} />
            この試算条件を保存
          </button>
          {notice && <output className="saved-notice">{notice}</output>}
        </div>
      </section>
    </fieldset>
  );
}
