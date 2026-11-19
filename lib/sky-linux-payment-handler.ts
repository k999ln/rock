import {
  linuxServiceStore,
  type LinuxServiceConfig,
} from './sky-linux-service-store.ts';
import { linuxStripeBilling } from './sky-linux-billing.ts';
import { readSkyStripeConfig, SkyPaymentError } from './sky-stripe.ts';
import { skyCommerceStore } from './sky-commerce-store.ts';
import {
  LinuxServiceError,
  type LinuxInvoice,
  type LinuxEvent,
} from './sky-linux-service.ts';
import { verifyStripeSignature } from '../services/sky-billing/src/stripe-signature.ts';
type Database = Pick<D1Database, 'prepare' | 'batch'>;
export function linuxPaymentHandler(
  db: Database,
  runtime: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
) {
  if (runtime.SKY_LINUX_BILLING_ENABLED !== 'true')
    throw new LinuxServiceError('月次決済はまだ準備中です。', 503);
  const config = readSkyStripeConfig(runtime),
    store = linuxServiceStore(db, runtime as LinuxServiceConfig);
  const customerJson = runtime.SKY_LINUX_CUSTOMERS_JSON ?? '{}';
  if (typeof customerJson !== 'string')
    throw new LinuxServiceError('支払い先の設定を確認できません。', 503);
  let customers: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(customerJson);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((value) => typeof value !== 'string')
    )
      throw new Error();
    customers = parsed as Record<string, string>;
  } catch {
    throw new LinuxServiceError('支払い先の設定を確認できません。', 503);
  }
  function billing(owner: string) {
    const customer = customers[owner];
    if (!/^cus_[A-Za-z0-9]+$/.test(customer ?? ''))
      throw new LinuxServiceError(
        '支払い方法と本人の結合を確認してください。',
        503,
      );
    return linuxStripeBilling(
      { secretKey: config.secretKey, mode: config.mode, customerId: customer },
      fetcher,
    );
  }
  async function current(owner: string, id: string) {
    const doc = await store.get(owner);
    const invoice = doc?.payload.invoices.find((i) => i.id === id);
    if (!doc || !invoice)
      throw new LinuxServiceError('請求書が見つかりません。', 404);
    return { w: doc.payload, i: invoice };
  }
  async function apply(event: LinuxEvent) {
    return store.event(event);
  }
  async function reconcile(owner: string, id: string, payouts: boolean) {
    let { w, i } = await current(owner, id);
    const adapter = billing(owner),
      paid = await adapter.reconcile(w, i);
    if (paid) {
      await apply(paid);
      ({ w, i } = await current(owner, id));
    }
    if (!payouts) return { workspace: w, invoice: i };
    for (const allocation of i.allocations) {
      if (i.state === 'reversed' && allocation.recoveryRequired) {
        await apply(await adapter.reverse(w, i, allocation.creatorId));
        continue;
      }
      if (
        i.state !== 'paid' ||
        allocation.transferRef ||
        !allocation.payableMinor
      )
        continue;
      const seller = await skyCommerceStore(db).seller(
        allocation.creatorId,
        config.mode,
      );
      if (!seller?.accountId) continue;
      const reserved: LinuxEvent = {
        schema: 'sky.linux-event/1',
        id: crypto.randomUUID(),
        workspaceId: w.id,
        kind: 'transfer',
        issuedAt: Date.now(),
        payload: {
          state: 'requested',
          invoiceId: i.id,
          creatorId: allocation.creatorId,
          amountMinor: allocation.payableMinor,
          currency: 'USD',
          paymentRef: i.paymentRef,
        },
      };
      await apply(reserved);
      ({ w, i } = await current(owner, id));
      await apply(
        await adapter.transfer(w, i, allocation.creatorId, seller.accountId),
      );
      ({ w, i } = await current(owner, id));
    }
    return current(owner, id);
  }
  return {
    async collect(owner: string, id: string) {
      let { w, i } = await current(owner, id);
      const adapter = billing(owner);
      if (!i.providerInvoiceId) {
        await apply({
          schema: 'sky.linux-event/1',
          id: crypto.randomUUID(),
          workspaceId: w.id,
          issuedAt: Date.now(),
          kind: 'collection',
          payload: {
            state: 'requested',
            invoiceId: i.id,
            amountMinor: i.amountMinor,
            currency: 'USD',
          },
        });
        ({ w, i } = await current(owner, id));
      }
      await apply(await adapter.prepare(w, i));
      ({ w, i } = await current(owner, id));
      await apply(await adapter.finalize(w, i));
      ({ w, i } = await current(owner, id));
      return { url: i.collectionUrl, invoice: i };
    },
    reconcile,
    async webhook(raw: string, signature: string | null) {
      await verifyStripeSignature(raw, signature, config.webhookSecret);
      const event = JSON.parse(raw);
      if (event.livemode !== (config.mode === 'live'))
        throw new SkyPaymentError('決済環境が一致しません。', 400);
      const object = event.data?.object;
      let providerInvoiceId: string | null = null,
        chargeId: string | null = null;
      if (
        [
          'invoice.paid',
          'invoice.payment_failed',
          'invoice.updated',
          'invoice.voided',
        ].includes(event.type)
      )
        providerInvoiceId = object?.id;
      else if (
        [
          'charge.refunded',
          'charge.dispute.created',
          'charge.dispute.closed',
        ].includes(event.type)
      )
        chargeId =
          typeof object?.charge === 'string' ? object.charge : object?.id;
      else return { received: true, ignored: true };
      if (providerInvoiceId && !/^in_[A-Za-z0-9]+$/.test(providerInvoiceId))
        return { received: true, ignored: true };
      if (chargeId && !/^ch_[A-Za-z0-9]+$/.test(chargeId))
        return { received: true, ignored: true };
      const row = await db
        .prepare(`SELECT d.owner_user_id AS ownerId,j.value AS invoice FROM sky_linux_service_documents d,json_each(d.payload,'$.invoices') j
        WHERE d.kind='workspace' AND (json_extract(j.value,'$.providerInvoiceId')=? OR json_extract(j.value,'$.paymentRef')=?) LIMIT 1`)
        .bind(providerInvoiceId, chargeId)
        .first<{ ownerId: string; invoice: string }>();
      if (row)
        await reconcile(
          row.ownerId,
          (JSON.parse(row.invoice) as LinuxInvoice).id,
          true,
        );
      return { received: true };
    },
  };
}
