import { requestUser } from './request-auth.ts';
import { marketplaceCommissionMinor } from './sky-marketplace-policy.ts';
import { skyCommerceStore, type CommerceOrder, type CommerceStatus } from './sky-commerce-store.ts';
import { readSkyStripeConfig, skyStripe, SkyPaymentError, type SkyStripeConfig, type StripeAccount, type StripeCheckoutSession, type StripePaymentIntent } from './sky-stripe.ts';
import { verifyStripeSignature } from '../services/sky-billing/src/stripe-signature.ts';
import type { SkyToolPackage } from './sky-tool-package.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Runtime = Record<string, unknown>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const string = (value: unknown, max = 256) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new SkyPaymentError('入力内容を確認してください。', 400);
  return value.trim();
};
function secureUrl(value: unknown) {
  const raw = string(value, 1000);
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new SkyPaymentError('販売条件のURLはHTTPSで入力してください。', 400); }
}
function safeReceipt(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'pay.stripe.com' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function ready(account: StripeAccount) {
  return account.charges_enabled === true && account.payouts_enabled === true && account.details_submitted === true && account.capabilities?.transfers === 'active';
}
function objectId(value: string | { id: string } | null | undefined) { return typeof value === 'string' ? value : value?.id; }
async function body(request: Request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 16_384) throw new SkyPaymentError('入力が長すぎます。', 413);
  const value = JSON.parse(text) as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SkyPaymentError('入力形式を確認してください。', 400);
  return value;
}

export function skyCommerce(db: Database, config: SkyStripeConfig, fetcher: typeof fetch = fetch) {
  const store = skyCommerceStore(db);
  const stripe = skyStripe(config, fetcher);

  async function validPackage(packageKey: string) {
    const item = await store.package(packageKey);
    if (!item?.installable) throw new SkyPaymentError('このツールは現在販売されていません。', 409);
    return { ...item, definition: JSON.parse(item.manifest) as SkyToolPackage };
  }
  async function purchaseView(order: CommerceOrder, seller = false) {
    const manifest = await store.access(order);
    return {
      id: order.id, packageKey: order.packageKey, name: order.name, amountMinor: order.amountMinor,
      commissionMinor: order.commissionMinor, currency: order.currency, status: order.status,
      refundedMinor: order.refundedMinor,
      createdAt: order.createdAt, receiptUrl: order.receiptUrl,
      checkoutUrl: !seller && order.status === 'pending' ? order.checkoutUrl : null,
      termsUrl: order.termsUrl, refundPolicy: order.refundPolicy,
      access: Boolean(manifest) && !seller, endpointUrl: !seller && manifest ? manifest.adapter.endpointUrl : null,
    };
  }
  async function verifyIntent(order: CommerceOrder, intent: StripePaymentIntent) {
    if (intent.livemode !== (config.mode === 'live') || intent.metadata?.order_id !== order.id ||
      intent.amount !== order.amountMinor || intent.currency !== order.currency ||
      intent.application_fee_amount !== order.commissionMinor ||
      objectId(intent.transfer_data?.destination) !== order.accountId ||
      intent.transfer_data?.amount != null ||
      (order.paymentIntentId && intent.id !== order.paymentIntentId))
      throw new SkyPaymentError('支払い情報が注文と一致しません。', 409);
    if (intent.status !== 'succeeded' || intent.amount_received !== order.amountMinor) return null;
    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    if (!charge || charge.paid !== true || charge.amount !== order.amountMinor || charge.currency !== order.currency ||
      !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded! < 0 || charge.amount_refunded! > order.amountMinor ||
      charge.livemode !== (config.mode === 'live') || objectId(charge.payment_intent) !== intent.id)
      throw new SkyPaymentError('入金の確認がまだ完了していません。時間をおいて確認してください。', 409);
    return charge;
  }
  async function sync(order: CommerceOrder, eventId = `check:${crypto.randomUUID()}`, providedSession?: StripeCheckoutSession) {
    if (!providedSession && !order.sessionId) return order;
    const session = providedSession ?? await stripe.retrieveCheckout(order.sessionId!);
    if (session.mode !== 'payment' || session.livemode !== (config.mode === 'live') ||
      session.client_reference_id !== order.id || session.metadata?.order_id !== order.id ||
      session.amount_total !== order.amountMinor || session.currency !== order.currency ||
      (order.sessionId && session.id !== order.sessionId))
      throw new SkyPaymentError('支払い情報が注文と一致しません。', 409);
    await store.attachSession(order.id, session.id, session.url ?? null);
    const intentId = objectId(session.payment_intent);
    const intent = intentId ? await stripe.retrievePaymentIntent(intentId) : null;
    let next: CommerceStatus = 'pending';
    let receipt: string | null = null;
    let refundedMinor = order.refundedMinor;
    if (intent) {
      const charge = await verifyIntent(order, intent);
      if (charge) {
        receipt = safeReceipt(charge.receipt_url);
        refundedMinor = charge.amount_refunded!;
        if (charge.refunded || charge.amount_refunded === order.amountMinor) next = 'refunded';
        else if (charge.disputed) next = 'disputed';
        else if ((charge.amount_refunded ?? 0) > 0) next = 'partially_refunded';
        else if (session.payment_status === 'paid') next = 'paid';
      }
    }
    if (next === 'pending' && session.status === 'expired') next = 'expired';
    return store.record(order, next, eventId, intent?.id ?? null, receipt, refundedMinor);
  }
  return {
    async offers() {
      const offers = await store.offers(config.mode);
      const visible = await Promise.all(offers.map(async (offer) => {
        const item = await store.package(offer.packageKey);
        if (!item?.installable || item.manifestSha256 !== offer.manifestSha256) return null;
        return { packageKey: offer.packageKey, amountMinor: offer.amountMinor, currency: offer.currency,
          revision: offer.revision, termsUrl: offer.termsUrl, refundPolicy: offer.refundPolicy };
      }));
      return visible.filter(Boolean);
    },
    async seller(userId: string) {
      const [seller, packages, offers, sales] = await Promise.all([
        store.seller(userId, config.mode), store.packages(userId), store.offers(config.mode, userId), store.orders(userId, config.mode, true),
      ]);
      const account = seller?.accountId ? await stripe.retrieveAccount(seller.accountId) : null;
      return {
        seller: { connected: Boolean(account), ready: Boolean(account && ready(account)) },
        packages: packages.map((item) => { const definition = JSON.parse(item.manifest) as SkyToolPackage;
          return { packageKey: item.packageKey, name: definition.name, installable: Boolean(item.installable), pricingModel: definition.pricing.model }; }),
        offers, sales: await Promise.all(sales.map((order) => purchaseView(order, true))),
      };
    },
    async onboard(userId: string) {
      const seller = await store.reserveSeller(userId, config.mode);
      if (!seller.accountId) {
        if (Date.now() - seller.createdAt > 20 * 60 * 60 * 1000)
          throw new SkyPaymentError('受取先の登録結果をStripeで確認してください。新しい口座は作成しません。', 409);
        const account = await stripe.createAccount(`sky-seller:${seller.id}`);
        await store.attachAccount(seller.id, account.id);
      }
      const attached = (await store.seller(userId, config.mode))!;
      return stripe.createAccountLink(attached.accountId!);
    },
    async saveOffer(userId: string, input: Record<string, unknown>) {
      const packageKey = string(input.packageKey);
      const item = await validPackage(packageKey);
      if (item.userId !== userId) throw new SkyPaymentError('自分のツールだけ販売設定できます。', 403);
      if (item.definition.pricing.model !== 'external_contract')
        throw new SkyPaymentError('買い切り販売は外部契約のPackageで登録してください。定額・従量商品には対応していません。', 409);
      if (typeof input.active !== 'boolean' || !Number.isSafeInteger(input.amountMinor) ||
        (input.amountMinor as number) < 50 || (input.amountMinor as number) > 99_999_999 || input.currency !== 'jpy')
        throw new SkyPaymentError('価格は50〜99,999,999円で入力してください。', 400);
      const termsUrl = secureUrl(input.termsUrl);
      const refundPolicy = string(input.refundPolicy, 2000);
      const seller = await store.seller(userId, config.mode);
      if (!seller?.accountId || !ready(await stripe.retrieveAccount(seller.accountId)))
        throw new SkyPaymentError('先に売上の受取先登録を完了してください。', 409);
      return store.saveOffer({ packageKey, sellerUserId: userId, mode: config.mode, manifestSha256: item.manifestSha256,
        amountMinor: input.amountMinor as number, currency: 'jpy', active: input.active ? 1 : 0, termsUrl, refundPolicy });
    },
    async checkout(userId: string, input: Record<string, unknown>) {
      const packageKey = string(input.packageKey);
      const item = await validPackage(packageKey);
      const offer = await store.offer(packageKey, config.mode);
      if (!offer?.active || offer.manifestSha256 !== item.manifestSha256 || offer.sellerUserId !== item.userId)
        throw new SkyPaymentError('このツールの販売は停止中です。', 409);
      if (input.offerRevision !== offer.revision)
        throw new SkyPaymentError('価格または販売条件が更新されました。画面を更新して確認してください。', 409);
      if (item.userId === userId) throw new SkyPaymentError('自分の出品は購入できません。', 409);
      const seller = await store.seller(item.userId, config.mode);
      if (!seller?.accountId || !ready(await stripe.retrieveAccount(seller.accountId)))
        throw new SkyPaymentError('提供者の決済準備がまだ完了していません。', 409);
      let order = await store.activeOrder(userId, packageKey, config.mode);
      if (order?.sessionId) order = await sync(order);
      if (order && ['expired','failed','refunded'].includes(order.status)) order = null;
      if (!order) {
        const now = Date.now();
        order = await store.reserveOrder({ id: crypto.randomUUID(), buyerUserId: userId, sellerUserId: item.userId, mode: config.mode,
          packageKey, manifestSha256: item.manifestSha256, name: item.definition.name, amountMinor: offer.amountMinor,
          commissionMinor: marketplaceCommissionMinor(offer.amountMinor), currency: offer.currency,
          refundedMinor: 0,
          accountId: seller.accountId, offerRevision: offer.revision, termsUrl: offer.termsUrl, refundPolicy: offer.refundPolicy,
          status: 'pending', createdAt: now, updatedAt: now });
      }
      if (order.status === 'paid') return { owned: true, orderId: order.id };
      if (order.status !== 'pending') throw new SkyPaymentError('この購入は確認中です。購入履歴を確認してください。', 409);
      if (order.offerRevision !== offer.revision || order.accountId !== seller.accountId)
        throw new SkyPaymentError('以前の支払いが残っています。購入履歴から状況を確認してください。', 409);
      if (order.sessionId && order.checkoutUrl) return { url: order.checkoutUrl, orderId: order.id };
      if (Date.now() - order.createdAt > 20 * 60 * 60 * 1000)
        throw new SkyPaymentError('この注文の決済結果を確認できません。提供者へ注文番号を伝えてください。', 409);
      const session = await stripe.createCheckout({ id: order.id, packageKey, name: order.name, amountMinor: order.amountMinor,
        currency: order.currency, commissionMinor: order.commissionMinor, accountId: order.accountId }, `sky-checkout:${order.id}`);
      await store.attachSession(order.id, session.id, session.url ?? null);
      if (!session.url) throw new SkyPaymentError('支払い画面を取得できませんでした。購入履歴から確認してください。', 503);
      return { url: session.url, orderId: order.id };
    },
    async purchases(userId: string) {
      return Promise.all((await store.orders(userId, config.mode)).map((order) => purchaseView(order)));
    },
    async reconcile(userId: string, orderId: string) {
      const order = await store.order(orderId);
      if (!order || order.mode !== config.mode || order.buyerUserId !== userId)
        throw new SkyPaymentError('購入が見つかりません。', 404);
      return purchaseView(await sync(order));
    },
    async refund(userId: string, orderId: string) {
      let order = await store.order(orderId);
      if (!order || order.mode !== config.mode || order.sellerUserId !== userId)
        throw new SkyPaymentError('売上が見つかりません。', 404);
      order = await sync(order);
      if (order.status === 'refunded') return purchaseView(order, true);
      if (!order.paymentIntentId || !['paid','partially_refunded','refund_pending'].includes(order.status))
        throw new SkyPaymentError('この支払いは返金できません。現在の状態を確認してください。', 409);
      const refundRequest = await store.refundRequestedAt(order.id);
      if (order.status === 'refund_pending' && (!refundRequest || Date.now() - refundRequest.createdAt > 20 * 60 * 60 * 1000))
        throw new SkyPaymentError('返金の結果をStripeで確認してください。自動で再送しません。', 409);
      if (order.status !== 'refund_pending') order = await store.record(order, 'refund_pending', `refund-request:${order.id}`, order.paymentIntentId, order.receiptUrl);
      if (order.status !== 'refund_pending') throw new SkyPaymentError('支払い状態が変わりました。売上を再確認してください。', 409);
      const result = await stripe.refund(order.paymentIntentId!, `sky-refund:${order.id}`);
      if (result.status === 'failed' || result.status === 'canceled')
        throw new SkyPaymentError('返金が完了していません。Stripeで確認してください。', 409);
      return purchaseView(await sync(order), true);
    },
    async webhook(raw: string, signature: string | null) {
      await verifyStripeSignature(raw, signature, config.webhookSecret);
      const event = JSON.parse(raw) as { id: string; type: string; livemode: boolean; data: { object: Record<string, unknown> } };
      if (typeof event.id !== 'string' || event.livemode !== (config.mode === 'live'))
        throw new SkyPaymentError('決済通知の環境が一致しません。', 400);
      const object = event.data?.object;
      if (!object) throw new SkyPaymentError('決済通知を確認できません。', 400);
      let session: StripeCheckoutSession | undefined;
      let payment: StripePaymentIntent | undefined;
      let orderId: string | undefined;
      if (['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type)) {
        session = await stripe.retrieveCheckout(string(object.id));
        orderId = session.metadata?.order_id;
      } else if (event.type === 'charge.refunded' || event.type.startsWith('charge.dispute.')) {
        const chargeId = event.type === 'charge.refunded' ? string(object.id) : string(object.charge);
        const charge = await stripe.retrieveCharge(chargeId);
        const intentId = objectId(charge.payment_intent);
        if (intentId) {
          payment = await stripe.retrievePaymentIntent(intentId);
          orderId = payment.metadata?.order_id;
        }
      } else return { received: true };
      if (!orderId) return { received: true };
      const order = await store.order(orderId);
      if (!order || order.mode !== config.mode) return { received: true };
      if (payment) {
        // Refund/dispute notifications may arrive before Checkout is linked to the order.
        const charge = await verifyIntent(order, payment);
        if (charge && (charge.refunded || (charge.amount_refunded ?? 0) > 0 || charge.disputed)) {
          const status = charge.refunded || charge.amount_refunded === order.amountMinor ? 'refunded'
            : charge.disputed ? 'disputed' : 'partially_refunded';
          await store.record(order, status,
            event.id, payment.id, safeReceipt(charge.receipt_url), charge.amount_refunded!);
        }
        return { received: true };
      }
      await sync(order, event.id, session);
      return { received: true };
    },
  };
}

export async function handleSkyCommerce(request: Request, action: string, db: Database, runtime: Runtime, fetcher: typeof fetch = fetch) {
  try {
    let config: SkyStripeConfig;
    try { config = readSkyStripeConfig(runtime); }
    catch (error) {
      if (request.method === 'GET' && ['offers','seller','purchases'].includes(action))
        return json({ configured: false, mode: null, offers: [], packages: [], seller: null, sales: [], purchases: [] });
      throw error;
    }
    const commerce = skyCommerce(db, config, fetcher);
    if (action === 'webhook' && request.method === 'POST') {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 262_144) throw new SkyPaymentError('通知が長すぎます。', 413);
      return json(await commerce.webhook(raw, request.headers.get('stripe-signature')));
    }
    if (request.method === 'GET' && action === 'offers')
      return json({ configured: true, mode: config.mode, offers: await commerce.offers() });
    if (new URL(request.url).origin !== config.origin) throw new Error('ORIGIN');
    // Live commerce uses the existing trusted Sites gateway; do not expose a direct untrusted Worker origin.
    if (config.mode === 'live' && (!new URL(request.url).hostname.endsWith('.chatgpt.site') ||
      !request.headers.get('x-dispatched-app')?.startsWith('site---'))) throw new Error('UNAUTHORIZED');
    const userId = await requestUser(request);
    if (request.method === 'GET' && action === 'seller') return json({ configured: true, mode: config.mode, ...await commerce.seller(userId) });
    if (request.method === 'GET' && action === 'purchases') return json({ configured: true, mode: config.mode, purchases: await commerce.purchases(userId) });
    if (request.method !== 'POST') return json({ error: 'この操作には対応していません。' }, 405);
    const input = await body(request);
    if (action === 'seller' && input.action === 'onboard') return json(await commerce.onboard(userId));
    if (action === 'offers') return json({ offer: await commerce.saveOffer(userId, input) });
    if (action === 'checkout') return json(await commerce.checkout(userId, input));
    if (action === 'reconcile') return json({ purchase: await commerce.reconcile(userId, string(input.orderId)) });
    if (action === 'refund') return json({ purchase: await commerce.refund(userId, string(input.orderId)) });
    return json({ error: '操作が見つかりません。' }, 404);
  } catch (error) {
    if (error instanceof SkyPaymentError) return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインしてから利用してください。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'Skyの画面から操作してください。' }, 403);
    if (error instanceof Error && error.message === 'STRIPE_SIGNATURE_INVALID') return json({ error: '決済通知の署名を確認できません。' }, 400);
    if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
    return json({ error: '決済サービスに接続できません。時間をおいて確認してください。' }, 503);
  }
}
