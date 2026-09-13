'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Check,
  CircleDollarSign,
  Layers3,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { catalog } from '@/lib/catalog';
import { fundCandidatesFromCatalog } from '@/lib/automation-fund-catalog';
import type {
  AutomationFundPlan,
  AutomationFundStrategy,
} from '@/lib/automation-fund';

type Snapshot = {
  funds: AutomationFundPlan[];
  membership: {
    fundId: string;
    revision: number;
    joinedAt: string;
    updatedAt: string;
  } | null;
};

const strategyLabels: Record<AutomationFundStrategy, string> = {
  balanced: 'バランス',
  commerce: '販売・運営',
  'creator-services': '制作・受託',
};

const toolNames = new Map(catalog.map((tool) => [tool.id, tool.name]));
const readyToolCount = fundCandidatesFromCatalog(catalog).filter(
  (tool) => tool.ready,
).length;

function requestId() {
  return `form:${crypto.randomUUID()}`;
}

async function readJson(response: Response) {
  const value = (await response.json()) as Snapshot & {
    fund?: AutomationFundPlan;
    error?: string;
  };
  if (!response.ok)
    throw new Error(value.error || 'ファンドを更新できませんでした。');
  return value;
}

export default function AutonomousFundMarket() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    funds: [],
    membership: null,
  });
  const [strategy, setStrategy] =
    useState<AutomationFundStrategy>('balanced');
  const [targetToolCount, setTargetToolCount] = useState(5);
  const [name, setName] = useState('');
  const [pendingKey, setPendingKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const value = await readJson(
        await fetch('/api/automation-funds', { cache: 'no-store' }),
      );
      setSnapshot({ funds: value.funds, membership: value.membership });
      setError('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '読み込めませんでした。',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/automation-funds', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(readJson)
      .then((value) => {
        setSnapshot({ funds: value.funds, membership: value.membership });
        setError('');
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError')
          return;
        setError(
          caught instanceof Error ? caught.message : '読み込めませんでした。',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const active = useMemo(
    () =>
      snapshot.funds.find(
        (fund) => fund.id === snapshot.membership?.fundId,
      ) ?? null,
    [snapshot],
  );

  async function formFund() {
    if (busy) return;
    const key = pendingKey || requestId();
    setPendingKey(key);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const fallbackName = `自動化ファンド ${snapshot.funds.length + 1}`;
      const value = await readJson(
        await fetch('/api/automation-funds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'form',
            idempotencyKey: key,
            name: name.trim() || fallbackName,
            strategy,
            targetToolCount,
          }),
        }),
      );
      if (!value.fund) throw new Error('作成結果を確認できませんでした。');
      setSnapshot((current) => ({
        ...current,
        funds: [
          value.fund!,
          ...current.funds.filter((fund) => fund.id !== value.fund!.id),
        ],
      }));
      setName('');
      setPendingKey('');
      setNotice(
        `${value.fund.name}を形成しました。中身を確認して参加できます。`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '形成できませんでした。',
      );
    } finally {
      setBusy(false);
    }
  }

  async function joinFund(fundId: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await readJson(
        await fetch('/api/automation-funds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'join', fundId }),
        }),
      );
      setSnapshot({ funds: value.funds, membership: value.membership });
      const joined = value.funds.find((fund) => fund.id === fundId);
      setNotice(`${joined?.name ?? 'ファンド'}に参加しました。`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '参加を保存できませんでした。',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="autofund-page">
      <header className="autofund-header">
        <div>
          <span>AUTONOMOUS AUTOMATION FUNDS</span>
          <h1>自動化を束ねて、収益をユーザーへ。</h1>
          <p>
            ファンド数は固定しません。自律システムが利用可能なツールを組成し、
            検証済みの実績だけで配分を見直します。
          </p>
        </div>
        <div className="autofund-contract" aria-label="収益の配給ルール">
          <small>SKY REVENUE CONTRACT</small>
          <strong>月最大 $8.88</strong>
          <p>外部実費とSky利用料を除く残額は、すべてユーザーのものです。</p>
        </div>
      </header>

      <section className="autofund-flow" aria-label="収益フロー">
        <div>
          <Bot size={19} />
          <span>複数の自動化</span>
        </div>
        <ArrowRight size={18} />
        <div>
          <ShieldCheck size={19} />
          <span>売上・実費を検証</span>
        </div>
        <ArrowRight size={18} />
        <div>
          <CircleDollarSign size={19} />
          <span>$8.88だけ回収</span>
        </div>
        <ArrowRight size={18} />
        <div>
          <Check size={19} />
          <span>残額をユーザーへ</span>
        </div>
      </section>

      <section className="autofund-builder" aria-labelledby="form-fund-heading">
        <div>
          <span className="autofund-eyebrow">FORM A FUND</span>
          <h2 id="form-fund-heading">新しいファンドを形成</h2>
          <p>
            5ツールは初期値です。今後ツールが増えても、ファンド数と構成数を固定せず追加できます。
          </p>
        </div>
        <div className="autofund-fields">
          <label>
            名前
            <input
              value={name}
              maxLength={60}
              placeholder={`自動化ファンド ${snapshot.funds.length + 1}`}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            方針
            <select
              value={strategy}
              onChange={(event) =>
                setStrategy(event.target.value as AutomationFundStrategy)
              }
            >
              {Object.entries(strategyLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            組み込むツール数
            <input
              type="number"
              min={1}
              max={readyToolCount}
              value={targetToolCount}
              onChange={(event) => setTargetToolCount(Number(event.target.value))}
            />
          </label>
          <button disabled={busy || loading} onClick={() => void formFund()}>
            <Layers3 size={18} />
            {busy ? '処理中…' : '自律形成する'}
          </button>
        </div>
      </section>

      {(error || notice) && (
        <div
          className={`autofund-message ${error ? 'is-error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          <span>{error || notice}</span>
          {error && (
            <button onClick={() => void refresh()}>
              <RefreshCw size={15} /> 再読込
            </button>
          )}
        </div>
      )}

      <section className="autofund-list" aria-labelledby="fund-list-heading">
        <div className="autofund-list-heading">
          <div>
            <span className="autofund-eyebrow">YOUR FUNDS</span>
            <h2 id="fund-list-heading">形成済みファンド</h2>
          </div>
          <strong>{loading ? '—' : snapshot.funds.length}</strong>
        </div>

        {active && (
          <article className="autofund-active">
            <span>参加中</span>
            <h3>{active.name}</h3>
            <p>
              {active.tools.length}ツール · {strategyLabels[active.strategy]} ·
              実収益はProvider照合後にだけ計上
            </p>
          </article>
        )}

        {!loading && snapshot.funds.length === 0 ? (
          <div className="autofund-empty">
            <Layers3 size={30} />
            <h3>まだファンドはありません</h3>
            <p>上の「自律形成する」から最初のツール群を作れます。</p>
          </div>
        ) : (
          <div className="autofund-grid">
            {snapshot.funds.map((fund) => {
              const joined = fund.id === snapshot.membership?.fundId;
              return (
                <article key={fund.id} className="autofund-card">
                  <div className="autofund-card-top">
                    <div>
                      <span>{strategyLabels[fund.strategy]}</span>
                      <h3>{fund.name}</h3>
                    </div>
                    <b>{fund.tools.length} tools</b>
                  </div>
                  <div className="autofund-allocation">
                    {fund.tools.map((tool) => (
                      <div key={tool.toolId}>
                        <span>
                          {toolNames.get(tool.toolId) ?? tool.toolId}
                        </span>
                        <i>{(tool.allocationBps / 100).toFixed(0)}%</i>
                      </div>
                    ))}
                  </div>
                  <p className="autofund-basis">
                    {fund.formationBasis === 'verified_net_revenue'
                      ? '検証済み純収益を基準に配分'
                      : '収益実績前のため、役割の重複を避けて均等配分'}
                  </p>
                  <button
                    disabled={busy || joined}
                    onClick={() => void joinFund(fund.id)}
                  >
                    {joined ? (
                      <>
                        <Check size={16} /> 参加中
                      </>
                    ) : (
                      <>
                        このファンドに入る <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="autofund-footer">
        <p>
          利回りは保証・予測表示しません。検証済み売上と実費が蓄積した後だけ実績値を表示し、自動配分の根拠を残します。
        </p>
        <Link href="/fund/legacy">以前の共同分配試算を見る</Link>
      </footer>
    </main>
  );
}
