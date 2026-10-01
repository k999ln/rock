'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ChevronRight,
  Clock3,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import {
  MARKET_CATEGORIES,
  type MarketAsset,
  type MarketCategory,
  type MarketSide,
} from '@/lib/everything-market';
import type { MarketProposal } from '@/lib/everything-market-store';

type Snapshot = {
  schema: string;
  mode: 'PAPER';
  liveEnabled: false;
  assets: MarketAsset[];
  proposals: MarketProposal[];
  paperBalanceMinor: number;
  exposedMinor: number;
  limits: { maxOrderMinor: number; maxExposureMinor: number };
};

const categoryLabels: Record<MarketCategory, string> = {
  automation: '自動化',
  digital: 'デジタル',
  service: 'サービス',
  product: '商品',
  capacity: '稼働枠',
};

const stateLabels: Record<MarketProposal['status'], string> = {
  PROPOSED: '承認待ち',
  APPROVED: '実行待ち',
  EXECUTED: '約定済み',
  REJECTED: 'リスク拒否',
};

const money = (minor: number) =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(minor / 100);

function operationId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

async function readJson<T>(response: Response) {
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(value.error || '市場を更新できませんでした。');
  return value;
}

export default function EverythingMarket() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<MarketAsset | null>(null);
  const [category, setCategory] = useState<'all' | MarketCategory>('all');
  const [query, setQuery] = useState('');
  const [side, setSide] = useState<MarketSide>('buy');
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creatorOpen, setCreatorOpen] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const value = await readJson<Snapshot>(
        await fetch('/api/market', { cache: 'no-store' }),
      );
      setSnapshot(value);
      setError('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '市場を読み込めませんでした。',
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(true), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const assets = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ja');
    return (snapshot?.assets ?? []).filter(
      (asset) =>
        (category === 'all' || asset.category === category) &&
        (!normalized ||
          `${asset.title} ${asset.description}`
            .toLocaleLowerCase('ja')
            .includes(normalized)),
    );
  }, [snapshot, category, query]);

  function choose(asset: MarketAsset, nextSide: MarketSide) {
    setSelected(asset);
    setSide(nextSide);
    setPrice(nextSide === 'buy' ? asset.askMinor : asset.bidMinor);
    setQuantity(1);
    setError('');
    setNotice('');
  }

  async function act(payload: Record<string, unknown>, label: string) {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      const result = await readJson<{ proposal: MarketProposal }>(
        await fetch('/api/market', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
      setNotice(
        result.proposal.status === 'PROPOSED'
          ? '提案を固定しました。内容とダイジェストを確認して承認してください。'
          : result.proposal.status === 'APPROVED'
            ? '本人承認を記録しました。次にPAPER実行できます。'
            : 'PAPER取引を実行し、レシートとポジションを保存しました。',
      );
      await refresh(true);
      if (result.proposal.status === 'EXECUTED') setSelected(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作に失敗しました。');
    } finally {
      setBusy('');
    }
  }

  const notional = price * quantity;
  const openProposals = snapshot?.proposals.filter(
    (proposal) =>
      proposal.status === 'PROPOSED' || proposal.status === 'APPROVED',
  );

  return (
    <WorkspaceShell title="Market" contentClassName="everything-market-page">
      <div className="everything-market">
        <header className="market-top">
          <div className="market-brand">
            <span>R</span>
            <strong>Market</strong>
          </div>
          <label className="market-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="取引対象を検索"
            />
          </label>
          <div className="market-wallet">
            <small>PAPER残高</small>
            <strong>{snapshot ? money(snapshot.paperBalanceMinor) : '—'}</strong>
          </div>
        </header>

        <nav className="market-categories" aria-label="市場カテゴリ">
          <button
            className={category === 'all' ? 'is-active' : ''}
            onClick={() => setCategory('all')}
          >
            トレンド
          </button>
          {MARKET_CATEGORIES.map((item) => (
            <button
              key={item}
              className={category === item ? 'is-active' : ''}
              onClick={() => setCategory(item)}
            >
              {categoryLabels[item]}
            </button>
          ))}
          <button className="market-create-button" onClick={() => setCreatorOpen(true)}>
            <Plus size={15} /> 取引対象を追加
          </button>
        </nav>

        <section className="market-hero">
          <div>
            <span><Sparkles size={15} /> TRADE EVERYTHING</span>
            <h1>価値あるものを、<br />取引可能な単位へ。</h1>
            <p>
              自動化、制作物、サービス、商品、稼働枠を共通の取引対象として登録。
              現在は安全なPAPERモードです。
            </p>
          </div>
          <div className="market-runtime-card">
            <ShieldCheck size={22} />
            <div>
              <strong>Value / Spend Runtime</strong>
              <span>提案 → リスク判定 → 本人承認 → 予約 → 実行 → レシート</span>
            </div>
            <b>PAPER</b>
          </div>
        </section>

        {(error || notice) && (
          <div className={`market-message ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>
            {error || notice}
          </div>
        )}

        <div className="market-layout">
          <main>
            <div className="market-section-heading">
              <div>
                <span><Activity size={15} /> REALTIME CATALOG</span>
                <h2>{category === 'all' ? '注目の取引対象' : categoryLabels[category]}</h2>
              </div>
              <small>15秒ごとに更新 · {assets.length}件</small>
            </div>
            {loading ? (
              <div className="market-loading">市場を読み込んでいます…</div>
            ) : (
              <div className="market-grid">
                {assets.map((asset, index) => (
                  <article key={asset.id} className="market-card">
                    <div className={`market-card-art tone-${index % 5}`}>
                      <span>{categoryLabels[asset.category]}</span>
                      <b>{asset.source === 'user' ? 'USER LISTED' : 'ROCK VERIFIED'}</b>
                    </div>
                    <div className="market-card-body">
                      <h3>{asset.title}</h3>
                      <p>{asset.description}</p>
                      <div className="market-card-meta">
                        <span>{asset.volume.toLocaleString()} volume</span>
                        <b className={asset.changeBps >= 0 ? 'is-up' : 'is-down'}>
                          {asset.changeBps >= 0 ? '+' : ''}{(asset.changeBps / 100).toFixed(1)}%
                        </b>
                      </div>
                      <div className="market-prices">
                        <button onClick={() => choose(asset, 'buy')}>
                          買う <strong>{money(asset.askMinor)}</strong>
                        </button>
                        <button onClick={() => choose(asset, 'sell')}>
                          売る <strong>{money(asset.bidMinor)}</strong>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </main>

          <aside className="market-activity">
            <div className="market-activity-head">
              <div>
                <span>YOUR ACTIVITY</span>
                <h2>取引フロー</h2>
              </div>
              <b>{openProposals?.length ?? 0}</b>
            </div>
            {!openProposals?.length ? (
              <div className="market-activity-empty">
                <Clock3 size={24} />
                <p>承認待ちの提案はありません。</p>
              </div>
            ) : (
              openProposals.map((proposal) => (
                <article key={proposal.id} className="market-proposal">
                  <div>
                    <span>{stateLabels[proposal.status]}</span>
                    <small>{proposal.digest.slice(0, 10)}…</small>
                  </div>
                  <strong>{money(proposal.notionalMinor)}</strong>
                  <p>{snapshot?.assets.find((asset) => asset.id === proposal.assetId)?.title ?? proposal.assetId}</p>
                  {proposal.status === 'PROPOSED' ? (
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => void act({ action: 'approve', proposalId: proposal.id, digest: proposal.digest }, proposal.id)}
                    >
                      内容を承認 <ChevronRight size={15} />
                    </button>
                  ) : (
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => void act({ action: 'execute', proposalId: proposal.id, idempotencyKey: operationId('execute') }, proposal.id)}
                    >
                      PAPER実行 <ChevronRight size={15} />
                    </button>
                  )}
                </article>
              ))
            )}
            <div className="market-safety">
              <ShieldCheck size={18} />
              <p>
                実資金・外部注文・自動送金は無効です。PAPER実績はファンドの実収益へ計上されません。
              </p>
            </div>
          </aside>
        </div>
      </div>

      {selected && (
        <div className="market-dialog-backdrop" role="presentation">
          <dialog open className="market-ticket" aria-labelledby="market-ticket-title">
            <button className="market-dialog-close" onClick={() => setSelected(null)} aria-label="閉じる"><X size={18} /></button>
            <span>{categoryLabels[selected.category]} · {selected.unit}</span>
            <h2 id="market-ticket-title">{selected.title}</h2>
            <div className="market-side-switch">
              <button className={side === 'buy' ? 'is-active' : ''} onClick={() => { setSide('buy'); setPrice(selected.askMinor); }}>買う</button>
              <button className={side === 'sell' ? 'is-active' : ''} onClick={() => { setSide('sell'); setPrice(selected.bidMinor); }}>売る</button>
            </div>
            <label>価格（USD）<input type="number" min=".01" max="100000" step=".01" value={(price / 100).toFixed(2)} onChange={(event) => setPrice(Math.round(Number(event.target.value) * 100))} /></label>
            <label>数量<input type="number" min="1" max="10000" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label>
            <div className="market-ticket-total"><span>合計</span><strong>{money(notional)}</strong></div>
            <div className="market-ticket-steps">
              <span className="is-current">1 提案</span><ArrowRight size={14} /><span>2 承認</span><ArrowRight size={14} /><span>3 実行</span>
            </div>
            <button
              className="market-ticket-submit"
              disabled={Boolean(busy) || notional <= 0}
              onClick={() => void act({
                action: 'propose',
                idempotencyKey: operationId('proposal'),
                assetId: selected.id,
                side,
                priceMinor: price,
                quantity,
                mode: 'PAPER',
                expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
              }, 'proposal')}
            >
              提案内容を固定 <ArrowRight size={17} />
            </button>
            <small>この操作ではまだ実行されません。次の画面で同一ダイジェストを本人承認します。</small>
          </dialog>
        </div>
      )}

      {creatorOpen && (
        <AssetCreator
          busy={Boolean(busy)}
          onClose={() => setCreatorOpen(false)}
          onCreated={async (payload) => {
            setBusy('asset');
            setError('');
            try {
              setSnapshot(await readJson<Snapshot>(await fetch('/api/market', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_asset', ...payload }),
              })));
              setCreatorOpen(false);
              setNotice('新しい取引対象を市場へ登録しました。');
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : '登録できませんでした。');
            } finally {
              setBusy('');
            }
          }}
        />
      )}
    </WorkspaceShell>
  );
}

function AssetCreator({
  busy,
  onClose,
  onCreated,
}: {
  busy: boolean;
  onClose: () => void;
  onCreated: (value: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MarketCategory>('automation');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  return (
    <div className="market-dialog-backdrop" role="presentation">
      <dialog
        open
        className="market-ticket market-creator"
        aria-modal="true"
        aria-labelledby="market-creator-title"
      >
      <form
        className="market-creator-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreated({
            title,
            description,
            category,
            unit,
            referencePriceMinor: Math.round(Number(price) * 100),
          });
        }}
      >
        <button type="button" className="market-dialog-close" onClick={onClose} aria-label="閉じる"><X size={18} /></button>
        <span>LIST A NEW ASSET</span>
        <h2 id="market-creator-title">取引対象を追加</h2>
        <label>名前<input required minLength={3} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>説明<textarea required minLength={10} maxLength={400} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>カテゴリ<select value={category} onChange={(event) => setCategory(event.target.value as MarketCategory)}>{MARKET_CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabels[item]}</option>)}</select></label>
        <label>取引単位<input required maxLength={30} placeholder="例: hour / item" value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
        <label>参考価格（USD）<input required type="number" min=".01" max="100000" step=".01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <button className="market-ticket-submit" disabled={busy}>
          <Plus size={17} /> 市場へ登録
        </button>
      </form>
      </dialog>
    </div>
  );
}
