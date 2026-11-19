'use client';
import { useEffect, useState, type SubmitEvent, type ReactNode } from 'react';
import type { ResaleWork, ResaleItem } from '@/lib/noah-resale';
import Link from 'next/link';
import styles from './noah-resale.module.css';
type View = {
  job: ResaleWork;
  ownerScope: string;
  totals: {
    reserved: number;
    spent: number;
    remaining: number;
    inventoryCost: number;
    reportedProfit: number;
  };
  ready: {
    search: boolean;
    purchase: boolean;
    publish: boolean;
    sandbox: boolean;
    liveEnabled: boolean;
  };
  approvals: Record<string, { purchase: string; publish: string }>;
};
const names = {
  street: 'ストリート',
  archive: 'アーカイブ',
  objects: 'オブジェ',
};
const states = {
  candidate: '候補',
  purchasing: '注文処理中',
  purchase_unknown: '購入結果を要照合',
  purchased: '発注済み・未検品',
  received: '検品済み',
  publishing: '出品処理中',
  listing_unknown: '出品結果を要照合',
  listed: '出品済み',
  sold: '売上記録あり',
};
const moneyKeys = [
  'budget',
  'perItemCap',
  'price',
  'resalePrice',
  'costs',
  'floorProfit',
  'total',
  'gross',
  'fees',
  'shipping',
  'other',
  'refunds',
];
export default function NoahResale() {
  const [data, setData] = useState<View | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(''),
    [role, setRole] = useState('street');
  async function load() {
    try {
      const r = await fetch('/api/noah/resale', { cache: 'no-store' }),
        v = (await r.json()) as View & { error?: string };
      if (!r.ok) throw Error(v.error || '処理を確認してください。');
      setData(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込めません。');
    }
  }
  useEffect(() => {
    const pending = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(pending);
  }, []);
  const scale = data?.job.resale.currency === 'JPY' ? 1 : 100;
  const money = (n: number) =>
    new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: data?.job.resale.currency || 'USD',
    }).format(n / scale);
  async function act(action: string, fields: Record<string, unknown> = {}) {
    if (!data || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/noah/resale', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-noah-resale-owner': data.ownerScope,
          },
          body: JSON.stringify({
            action,
            revision: data.job.revision,
            ...fields,
          }),
        }),
        v = (await r.json()) as View & { error?: string };
      if (!r.ok) throw Error(v.error || '処理を確認してください。');
      setData(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : '処理を確認してください。');
    } finally {
      setBusy(false);
    }
  }
  function submit(action: string, extra: Record<string, unknown> = {}) {
    return (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fields: Record<string, unknown> = Object.fromEntries(
        new FormData(e.currentTarget),
      );
      const units =
        action === 'configure' ? (fields.currency === 'JPY' ? 1 : 100) : scale;
      for (const key of moneyKeys)
        if (key in fields) {
          const raw = String(fields[key]);
          if (
            !/^\d+(?:\.\d{1,2})?$/.test(raw) ||
            (units === 1 && !Number.isInteger(Number(raw)))
          ) {
            setError('通貨に合う金額を入力してください。');
            return;
          }
          fields[key] = Math.round(Number(raw) * units);
        }
      if (typeof fields.images === 'string')
        fields.images = fields.images
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean);
      void act(action, { ...fields, ...extra });
    };
  }
  const i = data?.job.resale.items.find((x) => x.id === selected);
  function priceField(label: string, name: string, value?: number) {
    return (
      <label>
        {label}
        <input
          name={name}
          type="number"
          min="0"
          step={scale === 1 ? '1' : '0.01'}
          required
          defaultValue={value === undefined ? '' : value / scale}
        />
      </label>
    );
  }
  function form(
    action: string,
    children: ReactNode,
    button: string,
    extra: Record<string, unknown> = {},
  ) {
    return (
      <form
        key={`${action}:${i?.id || ''}`}
        onSubmit={submit(action, { itemId: i?.id, ...extra })}
      >
        <fieldset disabled={busy}>
          {children}
          <button>{button}</button>
        </fieldset>
      </form>
    );
  }
  function transact(action: 'purchase' | 'publish', x: ResaleItem) {
    return (
      <button
        disabled={busy || data?.job.resale.paused || !data?.ready[action]}
        onClick={() => {
          if (
            window.confirm(
              action === 'purchase'
                ? `${x.title}を${money(x.checkout!.total)}で1点購入します。表示の配送先・条件を確認しましたか？`
                : `${x.title}を${money(x.listing!.price)}で外部サイトへ出品しますか？`,
            )
          )
            void act(action, {
              itemId: x.id,
              operationId: crypto.randomUUID(),
              confirm: true,
              digest: data!.approvals[x.id][action],
            });
        }}
      >
        {action === 'purchase'
          ? '確認した条件で1点購入'
          : '原稿を確認してeBayに出品'}
      </button>
    );
  }
  return (
    <main className={styles.page}>
      <nav>
        <Link href="/noah">← Noah</Link>
        <span>SELECT / RESALE</span>
      </nav>
      <header>
        <p>THREE BUYERS, ONE INVENTORY</p>
        <h1>
          良いものを見つけ、
          <br />
          次の持ち主へ。
        </h1>
        <p>
          選品から仕入れ、検品、出品、収支まで。3担当で同じ予算と在庫を使います。
        </p>
      </header>
      <output className={styles.notice}>
        {data
          ? `${data.ready.sandbox ? 'eBay Sandbox接続モード' : 'eBay本番接続モード'} · 商品検索 ${data.ready.search ? '設定あり' : '未接続'} / 購入 ${data.ready.purchase ? '設定あり' : '未接続'} / 出品 ${data.ready.publish ? '設定あり' : '未接続'}`
          : '保存先を読み込んでいます…'}
        <br />
        接続・承認がそろった操作だけを実行します。入金記録は本人入力で、Walletの検証済み残高には加算しません。
      </output>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {data && (
        <>
          <section className={styles.stats}>
            {[
              ['予算残額', data.totals.remaining],
              ['予約中', data.totals.reserved],
              ['仕入累計', data.totals.spent],
              ['在庫原価', data.totals.inventoryCost],
              ['記録上の利益', data.totals.reportedProfit],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <small>{k}</small>
                <strong>{money(Number(v))}</strong>
              </div>
            ))}
          </section>
          <div className={styles.toolbar}>
            <button
              disabled={busy}
              onClick={() =>
                void act(data.job.resale.paused ? 'resume' : 'pause')
              }
            >
              {data.job.resale.paused
                ? '新規操作を再開'
                : '新規の購入・出品を停止'}
            </button>
            <button disabled={busy} onClick={() => void load()}>
              再読み込み
            </button>
          </div>
          <details>
            <summary>3担当の探索条件</summary>
            {form(
              'searches',
              <>
                {Object.entries(names).map(([key, name]) => (
                  <label key={key}>
                    {name}
                    <input
                      name={key}
                      required
                      maxLength={120}
                      defaultValue={
                        data.job.resale.searches?.[key as keyof typeof names] ||
                        ''
                      }
                    />
                  </label>
                ))}
                <p>
                  保存した条件で3担当が順に商品を検索し、重複を除いて同じ候補一覧へ保存します。
                </p>
              </>,
              '探索条件を保存',
            )}
          </details>
          <button
            disabled={
              busy ||
              data.job.resale.paused ||
              !data.job.resale.searches ||
              !data.ready.search
            }
            onClick={() => void act('scout')}
          >
            3担当で商品を探す
          </button>
          {data.job.resale.scan && (
            <p>
              前回探索 {data.job.resale.scan.at}：
              {data.job.resale.scan.results
                .map((r) => `${names[r.role]} ${r.error || `${r.count}件`}`)
                .join(' / ')}
            </p>
          )}
          <details>
            <summary>共有予算を設定</summary>
            {form(
              'configure',
              <>
                <label>
                  通貨
                  <select
                    name="currency"
                    defaultValue={data.job.resale.currency}
                  >
                    <option>USD</option>
                    <option>JPY</option>
                  </select>
                </label>
                {priceField('累計仕入予算', 'budget', data.job.resale.budget)}
                {priceField(
                  '1点の購入上限',
                  'perItemCap',
                  data.job.resale.perItemCap,
                )}
                <p>
                  売上で予算を自動増額しません。購入操作には別途、商品ごとの確認が必要です。
                </p>
              </>,
              'この予算を保存',
              { confirm: true },
            )}
          </details>
          <section className={styles.columns}>
            <div>
              <h2>01 / 商品を探す</h2>
              <div className={styles.roles}>
                {Object.entries(names).map(([id, n]) => (
                  <button
                    key={id}
                    aria-pressed={role === id}
                    onClick={() => setRole(id)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {form(
                'search',
                <>
                  <label>
                    探すもの
                    <input
                      name="query"
                      required
                      maxLength={120}
                      placeholder={
                        role === 'street'
                          ? 'Manhattan zip hoodie'
                          : role === 'archive'
                            ? 'designer archive jacket'
                            : 'limited edition design object'
                      }
                    />
                  </label>
                  <p>
                    eBay
                    API接続が必要です。価格は販売中価格で、限定数や成約相場を証明しません。
                  </p>
                </>,
                'eBayの商品を検索',
                { role },
              )}
              <details>
                <summary>見つけた商品をURLから登録</summary>
                {form(
                  'import',
                  <>
                    <label>
                      商品名
                      <input name="title" maxLength={80} required />
                    </label>
                    <label>
                      商品URL
                      <input name="url" type="url" required />
                    </label>
                    {priceField('商品価格', 'price')}
                  </>,
                  '候補に保存',
                  { role, currency: data.job.resale.currency },
                )}
              </details>
              <h2>02 / 候補・在庫</h2>
              {data.job.resale.items.length === 0 && (
                <p>
                  まだ商品はありません。検索するか、商品URLを登録してください。
                </p>
              )}
              <div className={styles.items}>
                {data.job.resale.items.map((x) => (
                  <button
                    key={x.id}
                    aria-pressed={selected === x.id}
                    onClick={() => setSelected(x.id)}
                  >
                    <small>
                      {names[x.role]} · {states[x.status]}
                    </small>
                    <strong>{x.title}</strong>
                    <span>{money(x.price)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              {i ? (
                <>
                  <h2>{i.title}</h2>
                  <p>
                    {states[i.status]} ·{' '}
                    <a href={i.url} target="_blank" rel="noreferrer">
                      商品ページ ↗
                    </a>
                  </p>
                  <p>記録日時：{i.observedAt}</p>
                  <details open>
                    <summary>採算と根拠</summary>
                    {form(
                      'assess',
                      <>
                        {priceField(
                          '保守的な販売見込額',
                          'resalePrice',
                          i.assessment?.resalePrice,
                        )}
                        {priceField(
                          '送料・販売手数料・手入れ等の全追加費用',
                          'costs',
                          i.assessment?.costs,
                        )}
                        {priceField(
                          '必要な最低利益',
                          'floorProfit',
                          i.assessment?.floorProfit,
                        )}
                        <label>
                          成約比較・希少性・真贋の根拠
                          <textarea
                            name="evidence"
                            required
                            maxLength={2000}
                            defaultValue={i.assessment?.evidence}
                            placeholder="成約URLと日付、同じサイズ/状態か、限定数の一次根拠。不明点も記入。"
                          />
                        </label>
                      </>,
                      '採算評価を保存',
                    )}{' '}
                    {i.assessment && (
                      <p>
                        記録した価格による見込差額：
                        {money(
                          i.assessment.resalePrice -
                            (i.checkout?.total ??
                              i.purchase?.total ??
                              i.price) -
                            i.assessment.costs,
                        )}
                        （未確定の送料・税は別途確認）
                      </p>
                    )}
                  </details>
                  {i.status === 'candidate' && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act('remove_candidate', { itemId: i.id })
                        }
                      >
                        候補から削除
                      </button>
                      <h3>03 / 仕入れ</h3>
                      {i.provider === 'ebay' && (
                        <button
                          disabled={busy || !data.ready.purchase}
                          onClick={() =>
                            void act('quote', { itemId: i.id, confirm: true })
                          }
                        >
                          配送・税込みの購入見積を取得
                        </button>
                      )}
                      {i.checkout && (
                        <div className={styles.notice}>
                          <strong>購入総額 {money(i.checkout.total)}</strong>
                          <pre>{i.checkout.summary}</pre>
                          {transact('purchase', i)}
                        </div>
                      )}
                      <details>
                        <summary>公式サイトで購入した結果を記録</summary>
                        {form(
                          'record_purchase',
                          <>
                            <label>
                              注文番号・領収書参照
                              <input name="reference" required />
                            </label>
                            {priceField('送料・税を含む実購入額', 'total')}
                          </>,
                          '購入済みの記録を保存',
                          { confirm: true },
                        )}
                      </details>
                    </>
                  )}
                  {i.status === 'purchased' && (
                    <>
                      <h3>04 / 検品・価値を高める</h3>
                      <p>
                        タグ・実寸・真贋資料・付属品・傷を確認し、適した手入れと実物撮影を行ってください。
                      </p>
                      {form(
                        'receive',
                        <>
                          <label>
                            検品した状態
                            <input name="condition" required maxLength={200} />
                          </label>
                          <label>
                            実寸・来歴・付属品・手入れ結果・欠点
                            <textarea name="notes" required maxLength={1200} />
                          </label>
                        </>,
                        '受取・真贋・状態を確認して保存',
                        { confirm: true },
                      )}
                    </>
                  )}
                  {i.status === 'received' && (
                    <>
                      <h3>05 / 出品</h3>
                      {form(
                        'draft',
                        <>
                          {priceField('販売価格', 'price', i.listing?.price)}
                          <label>
                            検品した状態区分
                            <select
                              name="conditionCode"
                              defaultValue={i.listing?.conditionCode || ''}
                              required
                            >
                              <option value="">選択してください</option>
                              <option value="NEW">新品</option>
                              <option value="USED_EXCELLENT">
                                中古・非常に良い
                              </option>
                              <option value="USED_GOOD">中古・良い</option>
                              <option value="USED_ACCEPTABLE">
                                中古・使用感あり
                              </option>
                            </select>
                          </label>
                          <label>
                            eBayカテゴリID（自動出品時）
                            <input
                              name="categoryId"
                              defaultValue={i.listing?.categoryId}
                            />
                          </label>
                          <label>
                            本人が使用できる実物写真URL（1行1枚）
                            <textarea
                              name="images"
                              defaultValue={i.listing?.images.join('\n')}
                            />
                          </label>
                        </>,
                        '販売原稿を作成',
                      )}
                      {i.listing && (
                        <>
                          <pre>{i.listing.description}</pre>
                          {transact('publish', i)}
                          <details>
                            <summary>
                              本人が公式サイトで出品した結果を記録
                            </summary>
                            {form(
                              'record_listing',
                              <label>
                                出品URL・ID
                                <input name="reference" required />
                              </label>,
                              '出品記録を保存',
                              { confirm: true },
                            )}
                          </details>
                        </>
                      )}
                    </>
                  )}
                  {(i.status === 'listed' || i.status === 'sold') && (
                    <>
                      <h3>06 / 売上・利益・返品</h3>
                      {form(
                        'settlement',
                        <>
                          <p>
                            金額を取引明細と照合して入力してください。再保存すると最新額へ訂正します。
                          </p>
                          <label>
                            売上取引番号
                            <input
                              name="reference"
                              required
                              defaultValue={i.settlement?.reference}
                            />
                          </label>
                          {priceField('売上額', 'gross', i.settlement?.gross)}
                          {priceField(
                            '販売・決済手数料',
                            'fees',
                            i.settlement?.fees,
                          )}
                          {priceField(
                            '発送送料',
                            'shipping',
                            i.settlement?.shipping,
                          )}
                          {priceField(
                            '手入れ・梱包・その他実費',
                            'other',
                            i.settlement?.other,
                          )}
                          {priceField(
                            '返金額',
                            'refunds',
                            i.settlement?.refunds,
                          )}
                        </>,
                        '取引明細の金額を保存',
                      )}
                    </>
                  )}
                  {data.job.resale.operations
                    .filter(
                      (o) =>
                        o.itemId === i.id && o.resolution === 'not_dispatched',
                    )
                    .slice(-1)
                    .map((o) => (
                      <p className={styles.notice} key={o.id}>
                        発注・公開前に停止しました。{o.error}{' '}
                        予約額は解除済みです。
                      </p>
                    ))}
                  {data.job.resale.operations
                    .filter((o) => o.itemId === i.id && o.state !== 'done')
                    .map((o) => (
                      <div className={styles.notice} key={o.id}>
                        <h3>処理結果を照合</h3>
                        <p>
                          結果不明の間は再購入・再出品しません。購入の予約額も保持します。
                        </p>
                        {form(
                          'reconcile',
                          <label>
                            eBay購入注文番号（出品照合は空欄可）
                            <input name="reference" />
                          </label>,
                          'eBayで結果を照合',
                          { operationId: o.id },
                        )}
                      </div>
                    ))}
                </>
              ) : (
                <div className={styles.empty}>
                  <h2>商品を選んで、次の工程へ。</h2>
                  <p>
                    仕入れ前の根拠から、売れた後の利益まで同じ記録で追えます。
                  </p>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
