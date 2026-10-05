'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway route. */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type SubmitEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Copy, CreditCard, ExternalLink, Package, RefreshCw, ShoppingBag, Smartphone, Store } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import { EsimPurchaseSetup } from '@/components/esim-purchase-setup';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { marketplaceCommissionMinor } from '@/lib/sky-marketplace-policy';
import styles from '@/components/sky-commerce.module.css';

export type CommerceOffer = {
  packageKey: string;
  revision: number;
  amountMinor: number;
  currency: string;
  active?: boolean;
  termsUrl: string;
  refundPolicy: string;
};

type Purchase = {
  id: string;
  packageKey: string;
  name: string;
  amountMinor: number;
  currency: string;
  commissionMinor: number;
  refundedMinor: number;
  status: string;
  createdAt: number;
  receiptUrl: string | null;
  checkoutUrl: string | null;
  termsUrl: string;
  refundPolicy: string;
  access: boolean;
  endpointUrl: string | null;
};

type CommerceStatus = { configured: boolean; mode: 'test' | 'live' | null };
type PublicOffers = CommerceStatus & { offers: CommerceOffer[] };
export type Purchases = CommerceStatus & { purchases: Purchase[] };
type Seller = CommerceStatus & {
  seller: { connected: boolean; ready: boolean } | null;
  packages: { packageKey: string; name: string; installable: boolean; pricingModel: string }[];
  offers: CommerceOffer[];
  sales: Purchase[];
};

class CommerceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function commerceRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/sky/commerce/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new CommerceError(data.error || '読み込めませんでした。もう一度お試しください。', response.status);
  return data;
}

export function useCommerceResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);
  const read = useCallback((signal?: AbortSignal) => {
    const sequence = ++requestSequence.current;
    return commerceRequest<T>(path, undefined, signal).then((next) => {
      if (sequence === requestSequence.current && !signal?.aborted) setData(next);
    }).catch((cause: unknown) => {
      if (sequence === requestSequence.current && !signal?.aborted) {
        setData(null);
        setError(cause instanceof Error ? cause : new Error('読み込めませんでした。'));
      }
    }).finally(() => {
      if (sequence === requestSequence.current && !signal?.aborted) setLoading(false);
    });
  }, [path]);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await read();
  }, [read]);
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal);
    return () => controller.abort();
  }, [read]);
  return { data, error, loading, refresh };
}

export function usePublicCommerceOffers() {
  return useCommerceResource<PublicOffers>('offers');
}

export function commerceAmount(amountMinor: number, currency: string) {
  const code = currency.toUpperCase();
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: code }).format(
    code === 'JPY' ? amountMinor : amountMinor / 100,
  );
}

function stripeUrl(value: string | null | undefined, kind: 'checkout' | 'onboarding' | 'receipt') {
  if (!value) return null;
  try {
    const url = new URL(value);
    const allowed = kind === 'checkout' ? ['checkout.stripe.com'] : kind === 'onboarding'
      ? ['connect.stripe.com'] : ['pay.stripe.com', 'invoice.stripe.com', 'receipts.stripe.com'];
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && allowed.includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function httpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function SignIn({ returnTo }: { returnTo: string }) {
  return <a className={styles.primary} href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_top">サインインして続ける <ArrowRight size={16} /></a>;
}

function ErrorNotice({ error, returnTo }: { error: Error | null; returnTo: string }) {
  if (!error) return null;
  return <div className={styles.error} role="alert"><p>{error instanceof CommerceError && error.status === 401 ? '購入・販売の管理にはサインインが必要です。' : error.message}</p>{error instanceof CommerceError && error.status === 401 && <SignIn returnTo={returnTo} />}</div>;
}

export function CommerceNavigation() {
  return <nav className={styles.navigation} aria-label="マーケットの管理"><Link href="/sky/esim"><Smartphone size={16} /> eSIMプラン</Link><Link href="/sky/purchases"><ShoppingBag size={16} /> 購入したツール</Link><Link href="/sky/sell"><Store size={16} /> 販売する</Link></nav>;
}

function TestMode({ mode }: { mode: CommerceStatus['mode'] }) {
  return mode === 'test' ? <p className={styles.notice}>テストモード · 実際のお金は動きません。</p> : null;
}

export function MarketplacePurchase({ offer, mode, compatible = true, onOfferChanged }: { offer: CommerceOffer; mode: CommerceStatus['mode']; compatible?: boolean; onOfferChanged: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const submitting = useRef(false);
  async function checkout() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await commerceRequest<{ url?: string; orderId: string; owned?: boolean }>('checkout', { packageKey: offer.packageKey, offerRevision: offer.revision });
      if (result.owned) {
        window.location.assign(`/sky/purchases?order=${encodeURIComponent(result.orderId)}`);
        return;
      }
      const url = stripeUrl(result.url, 'checkout');
      if (!url) throw new Error('決済ページを開けませんでした。購入履歴を確認してから再度お試しください。');
      window.location.assign(url);
    } catch (cause) {
      if (cause instanceof CommerceError && cause.status === 409) await onOfferChanged();
      setError(cause instanceof Error ? cause : new Error('決済を開始できませんでした。'));
      submitting.current = false;
      setPending(false);
    }
  }
  return <section className={styles.purchaseBox} aria-label="購入条件">
    <div className={styles.price}><strong>{commerceAmount(offer.amountMinor, offer.currency)}</strong><span>買い切り</span></div>
    <TestMode mode={mode} />
    <a href={offer.termsUrl} target="_blank" rel="noreferrer" className={styles.textLink}>利用・販売条件 <ExternalLink size={13} /></a>
    <p className={styles.refundPolicy}>返金条件：{offer.refundPolicy}</p>
    <p className={styles.subtle}>次のStripe画面で金額を確認して支払います。購入後は購入履歴から接続情報を確認できます。</p>
    {compatible ? <button type="button" className={styles.primary} disabled={pending} onClick={() => void checkout()}><CreditCard size={17} />{pending ? '決済ページを準備中…' : '購入して使う'}</button> : <p className={styles.notice}>この端末に対応した環境から購入してください。</p>}
    <ErrorNotice error={error} returnTo="/sky/marketplace" />
  </section>;
}

function CommercePage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <WorkspaceShell title="Sky Market" tone="sky" hideTopActions contentClassName={styles.shell}>
    <div className={styles.page}>
      <Link href="/sky/marketplace" className={styles.back}><ArrowLeft size={15} /> マーケットへ</Link>
      <header className={styles.header}><div><span className={styles.eyebrow}>SKY MARKET</span><h1>{title}</h1><p>{description}</p></div><CommerceNavigation /></header>
      {children}
    </div>
  </WorkspaceShell>;
}

function NotConfigured() {
  return <section className={styles.empty}><CreditCard size={28} /><h2>決済サービスの接続待ち</h2><p>Skyの決済設定が完了すると、購入・販売が使えるようになります。</p><Link href="/sky/marketplace" className={styles.secondary}>ツールを探す <ArrowRight size={16} /></Link></section>;
}

const statusLabels: Record<string, string> = {
  pending: '支払い待ち', paid: '購入済み', refunded: '返金済み', partially_refunded: '一部返金済み', disputed: '支払い確認中',
  expired: '決済の期限切れ', failed: '支払い未完了', refund_pending: '返金手続き中',
};

function OrderCard({ order, seller = false, busy = false, onRefresh, onRefund }: {
  order: Purchase; seller?: boolean; busy?: boolean; onRefresh?: () => void; onRefund?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const receipt = stripeUrl(order.receiptUrl, 'receipt');
  const checkout = stripeUrl(order.checkoutUrl, 'checkout');
  const terms = httpsUrl(order.termsUrl);
  async function copyEndpoint() {
    if (!order.endpointUrl) return;
    try {
      await navigator.clipboard.writeText(order.endpointUrl);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return <article className={styles.order}>
    <div className={styles.orderHeading}><div className={styles.orderIcon}><Package size={23} /></div><div className={styles.orderName}><h3>{order.name}</h3><p>{new Date(order.createdAt).toLocaleDateString('ja-JP')} · 注文 {order.id.slice(0, 8)}</p></div><span className={styles.status} data-status={order.status}>{statusLabels[order.status] || '確認中'}</span></div>
    <div className={styles.orderAmount}><strong>{commerceAmount(order.amountMinor, order.currency)}</strong>{seller && order.status === 'paid' && <span>受取分 {commerceAmount(order.amountMinor - order.commissionMinor, order.currency)} · 手数料10%</span>}{order.refundedMinor > 0 && <span>返金済み {commerceAmount(order.refundedMinor, order.currency)}</span>}</div>
    <div className={styles.actions}>
      {!seller && order.access && order.endpointUrl && <><button className={styles.primary} type="button" onClick={() => void copyEndpoint()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'コピーしました' : 'MCP接続先をコピー'}</button><Link href="/sky/network" className={styles.secondary}>AIと接続する <ArrowRight size={16} /></Link></>}
      {!seller && order.status === 'pending' && checkout && <a href={checkout} className={styles.primary}>支払いを続ける <ArrowRight size={16} /></a>}
      {receipt && <a href={receipt} target="_blank" rel="noreferrer" className={styles.textLink}>領収書 <ExternalLink size={14} /></a>}
      {!seller && onRefresh && <button className={styles.textButton} type="button" disabled={busy} onClick={onRefresh}><RefreshCw size={14} />{busy ? '確認中…' : '支払い状況を確認'}</button>}
      {seller && ['paid', 'partially_refunded', 'refund_pending'].includes(order.status) && onRefund && <button className={styles.textButton} type="button" disabled={busy} onClick={onRefund}>{order.status === 'refund_pending' ? '返金手続きを再確認' : order.status === 'partially_refunded' ? '残額を返金する' : '返金する'}</button>}
    </div>
    {copyError && <p className={styles.error} role="alert">コピーできませんでした。接続先：<span className={styles.endpoint}>{order.endpointUrl}</span></p>}
    {!seller && order.status === 'paid' && !order.access && <p className={styles.notice}>購入済みですが、現在このツールの提供状況を確認しています。</p>}
    {!seller && order.access && <p className={styles.subtle}>{order.endpointUrl ? '購入済みです。対応環境と提供元の案内を確認して、AIとの接続設定へ進んでください。' : '購入済みです。導入方法は提供元の利用条件・案内をご確認ください。'}</p>}
    {!seller && order.status === 'paid' && <EsimPurchaseSetup orderId={order.id} />}
    {!seller && <details className={styles.purchaseConditions}>
      <summary>購入時の販売・返金条件</summary>
      {terms && <a href={terms} target="_blank" rel="noreferrer" className={styles.textLink}>利用・販売条件を開く <ExternalLink size={13} /></a>}
      <p className={styles.refundPolicy}>返金条件：{order.refundPolicy}</p>
    </details>}
  </article>;
}

const subscribeLocation = () => () => {};
const currentQuery = () => window.location.search;
const serverQuery = () => '';

export function SkyPurchases() {
  const { data, error, loading, refresh } = useCommerceResource<Purchases>('purchases');
  const [actionError, setActionError] = useState<Error | null>(null);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const queryString = useSyncExternalStore(subscribeLocation, currentQuery, serverQuery);
  const query = new URLSearchParams(queryString);
  const canceled = query.has('canceled') || query.get('status') === 'canceled';
  const orderId = query.get('order');
  const busy = useRef(false);
  const returnedOrder = useRef<string | null>(null);
  const reconcile = useCallback(async (orderId: string) => {
    if (busy.current) return;
    busy.current = true;
    setBusyOrder(orderId);
    setActionError(null);
    try {
      await commerceRequest('reconcile', { orderId });
      await refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause : new Error('支払い状況を確認できませんでした。'));
    } finally {
      busy.current = false;
      setBusyOrder(null);
    }
  }, [refresh]);
  useEffect(() => {
    if (orderId && !canceled && returnedOrder.current !== orderId) {
      returnedOrder.current = orderId;
      busy.current = true;
      void commerceRequest('reconcile', { orderId })
        .then(() => refresh())
        .catch((cause: unknown) => setActionError(cause instanceof Error ? cause : new Error('支払い状況を確認できませんでした。')))
        .finally(() => { busy.current = false; });
    }
  }, [orderId, canceled, refresh]);
  return <CommercePage title="購入したツール" description="支払い状況と、AIへの接続先をここに。">
    {canceled && <output className={styles.notice}>決済を途中で閉じました。支払いが必要な場合は、購入履歴から再開できます。</output>}
    <ErrorNotice error={error || actionError} returnTo="/sky/purchases" />
    {loading && !data && <output className={styles.loading}>購入履歴を読み込んでいます…</output>}
    {data && <><TestMode mode={data.mode} />{!data.configured && <NotConfigured />}{data.purchases.length > 0 ? <div className={styles.orderList}>{data.purchases.map((order) => <OrderCard key={order.id} order={order} busy={busyOrder !== null} onRefresh={() => void reconcile(order.id)} />)}</div> : data.configured && <section className={styles.empty}><ShoppingBag size={28} /><h2>購入したツールはまだありません</h2><p>気になるツールを選び、料金と利用条件を確認できます。</p><Link className={styles.primary} href="/sky/marketplace">マーケットを見る <ArrowRight size={16} /></Link></section>}</>}
    {error && !(error instanceof CommerceError && error.status === 401) && <button className={styles.secondary} disabled={loading} onClick={() => void refresh()} type="button">もう一度読み込む</button>}
  </CommercePage>;
}

function OfferEditor({ item, offer, ready, onSave }: { item: Seller['packages'][number]; offer?: CommerceOffer; ready: boolean; onSave: () => Promise<void> }) {
  const [price, setPrice] = useState(offer ? String(offer.amountMinor) : '');
  const [termsUrl, setTermsUrl] = useState(offer?.termsUrl || '');
  const [refundPolicy, setRefundPolicy] = useState(offer?.refundPolicy || '');
  const [active, setActive] = useState(offer?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const submitting = useRef(false);
  const amountMinor = Number(price);
  const validPrice = Number.isSafeInteger(amountMinor) && amountMinor >= 50;
  const commission = validPrice ? marketplaceCommissionMinor(amountMinor) : 0;
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !validPrice || !ready || !item.installable) return;
    submitting.current = true;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await commerceRequest('offers', { packageKey: item.packageKey, amountMinor, currency: 'jpy', active, termsUrl, refundPolicy });
      await onSave();
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('販売条件を保存できませんでした。'));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  return <form className={styles.offerForm} onSubmit={submit} onChange={() => setSaved(false)}>
    <label>販売価格（円・買い切り）<input type="number" min="50" max="99999999" step="1" required inputMode="numeric" placeholder="例：1,000" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
    {validPrice && <div className={styles.feeBreakdown}><div><span>あなたの受取分</span><strong>{commerceAmount(amountMinor - commission, 'jpy')}</strong></div><div><span>Sky手数料 10%</span><span>{commerceAmount(commission, 'jpy')}</span></div></div>}
    <p className={styles.subtle}>決済処理の費用はSkyの手数料から負担します。</p>
    <label>利用・販売条件のURL<input type="url" pattern="https://.*" required placeholder="https://…" value={termsUrl} onChange={(event) => setTermsUrl(event.target.value)} /></label>
    <label>返金条件<textarea required minLength={1} maxLength={2000} rows={3} placeholder="返金できる条件と、問い合わせ方法" value={refundPolicy} onChange={(event) => setRefundPolicy(event.target.value)} /></label>
    <label className={styles.checkbox}><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />マーケットで販売する</label>
    {!item.installable && <p className={styles.notice}>ツールの公開・接続確認が完了すると販売できます。</p>}
    {!ready && <p className={styles.notice}>先に売上の受取先を登録してください。</p>}
    <button className={styles.primary} type="submit" disabled={saving || !ready || !item.installable}>{saving ? '保存中…' : '販売条件を保存'} <ArrowRight size={16} /></button>
    {saved && <output className={styles.success}><Check size={16} />販売条件を保存しました。</output>}
    <ErrorNotice error={error} returnTo="/sky/sell" />
  </form>;
}

export function SkySeller() {
  const { data, error, loading, refresh } = useCommerceResource<Seller>('seller');
  const [actionError, setActionError] = useState<Error | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [refundOrder, setRefundOrder] = useState<Purchase | null>(null);
  const busy = useRef(false);
  const salePackages = data?.packages.filter((item) => item.installable && item.pricingModel === 'external_contract') || [];
  const selected = salePackages.find((item) => item.packageKey === selectedKey) || salePackages[0];
  const selectedOffer = data?.offers.find((item) => item.packageKey === selected?.packageKey);
  const refundRemainingMinor = refundOrder ? refundOrder.amountMinor - refundOrder.refundedMinor : 0;
  async function onboard() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setActionError(null);
    try {
      const result = await commerceRequest<{ url: string }>('seller', { action: 'onboard' });
      const url = stripeUrl(result.url, 'onboarding');
      if (!url) throw new Error('受取先の登録画面を開けませんでした。再度お試しください。');
      window.location.assign(url);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause : new Error('受取先の登録を開始できませんでした。'));
      busy.current = false;
      setPending(false);
    }
  }
  async function refund() {
    if (!refundOrder || busy.current) return;
    busy.current = true;
    setPending(true);
    setActionError(null);
    try {
      await commerceRequest('refund', { orderId: refundOrder.id });
      setRefundOrder(null);
      await refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause : new Error('返金を開始できませんでした。'));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return <CommercePage title="ツールを販売する" description="受取先を登録して、販売価格を設定。売上の90%を受け取れます。">
    <ErrorNotice error={error || (!refundOrder ? actionError : null)} returnTo="/sky/sell" />
    {loading && !data && <output className={styles.loading}>販売設定を読み込んでいます…</output>}
    {data && <><TestMode mode={data.mode} />{!data.configured ? <NotConfigured /> : <>
      <section className={styles.panel} aria-labelledby="seller-account"><div className={styles.panelHeading}><div><h2 id="seller-account">売上の受取先</h2><p>{data.seller?.ready ? '登録済みです。ツールの販売を始められます。' : data.seller?.connected ? 'Stripeで登録を完了すると、売上を受け取れます。' : 'Stripeで本人情報と銀行口座を一度だけ登録します。'}</p></div>{data.seller?.ready && <span className={styles.status} data-status="paid"><Check size={13} /> 登録済み</span>}</div>
        <div className={styles.actions}>{!data.seller?.ready && <button type="button" className={styles.primary} disabled={pending} onClick={() => void onboard()}>{pending ? '準備中…' : data.seller?.connected ? '受取先の登録を続ける' : '売上の受取先を登録'} <ArrowRight size={16} /></button>}<button type="button" className={styles.secondary} disabled={loading || pending} onClick={() => void refresh()}><RefreshCw size={15} />{loading ? '確認中…' : '接続を確認'}</button></div>
      </section>
      <section className={styles.panel} aria-labelledby="seller-offers"><div className={styles.panelHeading}><div><h2 id="seller-offers">買い切り販売</h2><p>あなたが登録した審査済みツール・LLMを販売できます。</p></div><span className={styles.feeBadge}>手数料 10%</span></div>
        {selected ? <><label className={styles.selectLabel}>ツールを選択<select value={selected.packageKey} onChange={(event) => setSelectedKey(event.target.value)}>{salePackages.map((item) => <option key={item.packageKey} value={item.packageKey}>{item.name}</option>)}</select></label>{selectedOffer && selectedOffer.currency.toLowerCase() !== 'jpy' ? <p className={styles.notice}>この商品の価格は{commerceAmount(selectedOffer.amountMinor, selectedOffer.currency)}です。この画面での価格設定は現在、日本円の販売に対応しています。</p> : <OfferEditor key={selected.packageKey} item={selected} offer={selectedOffer} ready={data.seller?.ready === true} onSave={refresh} />}</> : <div className={styles.noTools}><p>買い切り条件で登録した、審査済みのツールがここに表示されます。定額・従量プランは現在準備中です。</p><Link href="/sky/register" className={styles.secondary}>ツールを登録 <ArrowRight size={16} /></Link></div>}
      </section>
    </>}
    {data.sales.length > 0 && <section aria-labelledby="seller-sales"><h2 id="seller-sales" className={styles.sectionTitle}>売上と返金</h2><div className={styles.orderList}>{data.sales.map((order) => <OrderCard key={order.id} order={order} seller busy={pending} onRefund={() => { setActionError(null); setRefundOrder(order); }} />)}</div></section>}
    </>}
    {error && !(error instanceof CommerceError && error.status === 401) && <button className={styles.secondary} disabled={loading} onClick={() => void refresh()} type="button">もう一度読み込む</button>}
    <Dialog open={Boolean(refundOrder)} onOpenChange={(open) => { if (!open && !pending) setRefundOrder(null); }}>
      {refundOrder && <DialogContent className={styles.refundDialog}><DialogTitle>{refundOrder.status === 'refund_pending' ? '返金手続きを再確認' : '購入者へ返金する'}</DialogTitle><DialogDescription>{refundOrder.name} · 注文 {refundOrder.id.slice(0, 8)} の{refundOrder.refundedMinor > 0 ? '未返金額' : '購入代金'} {commerceAmount(refundRemainingMinor, refundOrder.currency)} を返金します。{refundOrder.status === 'refund_pending' ? '開始済みの返金を確認し、未完了なら同じ手続きを再開します。' : '返金すると、この注文の利用権も終了します。'}</DialogDescription><ErrorNotice error={actionError} returnTo="/sky/sell" /><div className={styles.actions}><button className={styles.secondary} type="button" disabled={pending} onClick={() => setRefundOrder(null)}>戻る</button><button className={styles.danger} type="button" disabled={pending} onClick={() => void refund()}>{pending ? '返金手続き中…' : refundOrder.status === 'refund_pending' ? '返金状況を確認して続ける' : `${commerceAmount(refundRemainingMinor, refundOrder.currency)}を返金する`}</button></div></DialogContent>}
    </Dialog>
  </CommercePage>;
}

// The library may be shown beside unsaved Tool input. Keep that tab in place.
export function CommerceSignIn({ returnTo }: { returnTo: string }) {
  return <a className={styles.primary} href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_blank" rel="noopener noreferrer">別タブでサインイン <ArrowRight size={16} /></a>;
}
