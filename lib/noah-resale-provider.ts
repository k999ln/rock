import {
  amount,
  txt,
  publicLink,
  type ResaleItem,
  type ResaleRole,
  type ResaleCurrency,
} from './noah-resale.ts';
import { WorkError } from './workflow.ts';
export class ResaleBeforeDispatchError extends WorkError {}

function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new WorkError('Providerの応答形式を確認してください。', 502);
  return v as Record<string, unknown>;
}
export type ResaleCredentials = {
  RESALE_EBAY_ENV?: string;
  RESALE_EBAY_BROWSE_TOKEN?: string;
  RESALE_EBAY_BUYER_TOKEN?: string;
  RESALE_EBAY_SELLER_TOKEN?: string;
  RESALE_EBAY_LIVE_ENABLED?: string;
  RESALE_EBAY_FULFILLMENT_POLICY?: string;
  RESALE_EBAY_PAYMENT_POLICY?: string;
  RESALE_EBAY_RETURN_POLICY?: string;
  RESALE_EBAY_LOCATION?: string;
};
export async function digest(v: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(v)),
      ),
    ),
    (x) => x.toString(16).padStart(2, '0'),
  ).join('');
}
export function minor(v: unknown, currency: ResaleCurrency): number {
  if (typeof v !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(v))
    throw new WorkError('Providerの金額を確認できません。');
  const [whole, frac = ''] = v.split('.');
  if (currency === 'JPY' && Number(frac) !== 0)
    throw new WorkError('JPYの小数金額は扱えません。');
  return amount(
    Number(whole) * (currency === 'JPY' ? 1 : 100) +
      (currency === 'JPY' ? 0 : Number(frac.padEnd(2, '0'))),
  );
}
export function ebayResaleProvider(
  env: ResaleCredentials,
  request: typeof fetch = fetch,
) {
  const sandbox = env.RESALE_EBAY_ENV !== 'production';
  const api = sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
  const order = sandbox
    ? 'https://apix.sandbox.ebay.com'
    : 'https://apix.ebay.com';
  const ready = {
    search: !!env.RESALE_EBAY_BROWSE_TOKEN,
    purchase: !!env.RESALE_EBAY_BUYER_TOKEN,
    publish:
      !!env.RESALE_EBAY_SELLER_TOKEN &&
      !!env.RESALE_EBAY_LOCATION &&
      !!env.RESALE_EBAY_FULFILLMENT_POLICY &&
      !!env.RESALE_EBAY_PAYMENT_POLICY &&
      !!env.RESALE_EBAY_RETURN_POLICY,
    sandbox,
    liveEnabled: env.RESALE_EBAY_LIVE_ENABLED === 'true',
  };
  async function call(
    base: string,
    path: string,
    token: string | undefined,
    method = 'GET',
    body?: unknown,
  ) {
    if (!token)
      throw new WorkError(
        'eBayの接続が未設定です。API資格情報はサーバー側に設定してください。',
        503,
      );
    if (method !== 'GET' && !sandbox && !ready.liveEnabled)
      throw new WorkError('本番取引接続が未受入です。', 403);
    const r = await request(base + path, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok)
      throw new WorkError(
        `eBayが処理を受け付けませんでした（HTTP ${r.status}）。取引履歴を確認してください。`,
        502,
      );
    if (r.status === 204) return {};
    const reader = r.body?.getReader();
    if (!reader) throw new WorkError('Providerから応答がありません。', 502);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 1_000_000) {
        await reader.cancel();
        throw new WorkError('Provider応答の上限です。', 502);
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    return object(JSON.parse(new TextDecoder().decode(bytes)));
  }
  function price(value: unknown, currency: ResaleCurrency) {
    const v = object(value);
    if (v.currency !== currency) throw new WorkError('通貨が一致しません。');
    return minor(v.value, currency);
  }
  function quote(raw: Record<string, unknown>, i: ResaleItem) {
    if (
      !Array.isArray(raw.lineItems) ||
      raw.lineItems.length !== 1 ||
      object(raw.lineItems[0]).itemId !== i.externalId ||
      object(raw.lineItems[0]).quantity !== 1
    )
      throw new WorkError('購入対象・数量が一致しません。');
    const total = price(object(raw.pricingSummary).total, i.currency);
    return {
      id: txt(raw.checkoutSessionId, 200),
      total,
      shipping: raw.shippingAddress,
      lineItems: raw.lineItems,
      pricing: raw.pricingSummary,
    };
  }
  return {
    ready,
    async search(
      query: string,
      role: ResaleRole,
      currency: ResaleCurrency,
    ): Promise<ResaleItem[]> {
      const r = await call(
        api,
        `/buy/browse/v1/item_summary/search?q=${encodeURIComponent(txt(query, 120))}&limit=20&filter=buyingOptions%3A%7BFIXED_PRICE%7D`,
        env.RESALE_EBAY_BROWSE_TOKEN,
      );
      return (Array.isArray(r.itemSummaries) ? r.itemSummaries : [])
        .map(object)
        .filter((x) => object(x.price).currency === currency)
        .slice(0, 20)
        .map((x) => ({
          id: crypto.randomUUID(),
          role,
          provider: 'ebay',
          externalId: txt(x.itemId, 200),
          title: txt(x.title, 80),
          url: publicLink(x.itemWebUrl),
          currency,
          price: price(x.price, currency),
          observedAt: new Date().toISOString(),
          status: 'candidate',
          condition: typeof x.condition === 'string' ? x.condition : '未検品',
          notes: '販売中価格。成約相場・限定数・真贋は未確認。',
        }));
    },
    async prepare(i: ResaleItem) {
      if (i.provider !== 'ebay')
        throw new WorkError('この仕入先の自動購入接続は未対応です。');
      const raw = await call(
        order,
        '/buy/order/v1/checkout_session/initiate',
        env.RESALE_EBAY_BUYER_TOKEN,
        'POST',
        { lineItemInputs: [{ itemId: i.externalId, quantity: 1 }] },
      );
      const q = quote(raw, i);
      return {
        id: q.id,
        total: q.total,
        digest: await digest(q),
        expiresAt: Date.now() + 300000,
        summary: JSON.stringify({
          shipping: q.shipping,
          pricing: q.pricing,
        }).slice(0, 3000),
      };
    },
    async purchase(i: ResaleItem) {
      if (!i.checkout)
        throw new ResaleBeforeDispatchError('購入見積がありません。');
      const path = `/buy/order/v1/checkout_session/${encodeURIComponent(i.checkout.id)}`;
      try {
        const latest = quote(
          await call(order, path, env.RESALE_EBAY_BUYER_TOKEN),
          i,
        );
        if ((await digest(latest)) !== i.checkout.digest)
          throw new WorkError(
            '価格・配送先・注文内容が変わりました。再確認が必要です。',
            409,
          );
      } catch (error) {
        throw new ResaleBeforeDispatchError(
          error instanceof WorkError
            ? error.message
            : '発注前の読戻しに失敗しました。見積からやり直してください。',
          409,
        );
      }
      const r = await call(
        order,
        path + '/place_order',
        env.RESALE_EBAY_BUYER_TOKEN,
        'POST',
      );
      return txt(r.purchaseOrderId, 200);
    },
    async publish(
      i: ResaleItem,
      checkpoint: (offerId: string) => Promise<void>,
    ) {
      if (!ready.publish || !i.listing)
        throw new WorkError(
          '出品接続・販売方針・保管場所を設定してください。',
          503,
        );
      const l = i.listing,
        sku = `noah-${i.id}`;
      await call(
        api,
        `/sell/inventory/v1/inventory_item/${sku}`,
        env.RESALE_EBAY_SELLER_TOKEN,
        'PUT',
        {
          availability: { shipToLocationAvailability: { quantity: 1 } },
          condition: l.conditionCode,
          conditionDescription: i.condition,
          product: {
            title: l.title,
            description: l.description,
            imageUrls: l.images,
          },
        },
      );
      const r = await call(
        api,
        '/sell/inventory/v1/offer',
        env.RESALE_EBAY_SELLER_TOKEN,
        'POST',
        {
          sku,
          marketplaceId: 'EBAY_US',
          format: 'FIXED_PRICE',
          availableQuantity: 1,
          categoryId: l.categoryId,
          merchantLocationKey: env.RESALE_EBAY_LOCATION,
          listingDescription: l.description,
          pricingSummary: {
            price: {
              currency: i.currency,
              value: (l.price / (i.currency === 'JPY' ? 1 : 100)).toFixed(
                i.currency === 'JPY' ? 0 : 2,
              ),
            },
          },
          listingPolicies: {
            fulfillmentPolicyId: env.RESALE_EBAY_FULFILLMENT_POLICY,
            paymentPolicyId: env.RESALE_EBAY_PAYMENT_POLICY,
            returnPolicyId: env.RESALE_EBAY_RETURN_POLICY,
          },
        },
      );
      const offerId = txt(r.offerId, 200);
      await checkpoint(offerId);
      const published = await call(
        api,
        `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
        env.RESALE_EBAY_SELLER_TOKEN,
        'POST',
      );
      return txt(published.listingId, 200);
    },
    async reconcile(
      i: ResaleItem,
      kind: 'purchase' | 'publish',
      reference: string,
    ) {
      if (kind === 'purchase') {
        const r = await call(
          order,
          `/buy/order/v1/purchase_order/${encodeURIComponent(txt(reference, 200))}`,
          env.RESALE_EBAY_BUYER_TOKEN,
        );
        if (
          !Array.isArray(r.lineItems) ||
          r.lineItems.length !== 1 ||
          object(r.lineItems[0]).itemId !== i.externalId ||
          object(r.lineItems[0]).quantity !== 1 ||
          price(object(r.pricingSummary).total, i.currency) !==
            i.checkout?.total
        )
          throw new WorkError('購入記録の商品・数量・総額が一致しません。');
        return txt(r.purchaseOrderId, 200);
      }
      const offerId = i.listing?.offerId;
      if (!offerId)
        throw new WorkError(
          '出品IDが不明です。eBay側のSKU履歴と照合してください。',
        );
      const r = await call(
        api,
        `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
        env.RESALE_EBAY_SELLER_TOKEN,
      );
      if (
        r.sku !== `noah-${i.id}` ||
        r.status !== 'PUBLISHED' ||
        !object(r.listing).listingId
      )
        throw new WorkError('掲載済みの同じ商品を確認できません。');
      return txt(object(r.listing).listingId, 200);
    },
  };
}
