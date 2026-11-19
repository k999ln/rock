import {agentUsageStatement} from './sky-agent-usage-statement.ts';
import { RemoteAiTextStore } from './remote-ai-text-store.ts';
import { priceRemoteAiTextUsage } from './remote-ai-text-pricing.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { readSkyStripeConfig, skyStripe, SkyPaymentError, type StripeCheckoutSession } from './sky-stripe.ts';
import { verifyStripeSignature } from '../shared/stripe.mjs';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Runtime = Record<string, unknown>;
export type UsageStatement = {
  source: 'cloud_llm'; sourceId: string; currency: string; amountMinor: number;
  approvedCapMinor: number; digest: string; providerResponseId: string;
  items: unknown[]; collection: 'test_only';
};
type Payment = {
  id: string; owner: string; source: 'cloud_llm'|'sky_agent'; sourceId: string; digest: string; amountMinor: number;
  currency: string; mode: 'test' | 'live'; state: string; sessionId: string | null;
  intentId: string | null; refundedMinor: number; createdAt: number;
};
const columns = `id,owner_user_id AS owner,source_kind AS source,COALESCE(source_id,agent_source_id) AS sourceId,source_digest AS digest,
  amount_minor AS amountMinor,currency,mode,state,session_id AS sessionId,
  payment_intent_id AS intentId,refunded_minor AS refundedMinor,created_at AS createdAt`;
const objectId = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;

/** Source is always an owner-scoped persisted execution, never a client-submitted amount or eSIM claim. */
export async function cloudUsageStatement(db: Database, owner: string, id: string): Promise<UsageStatement> {
  const record = await new RemoteAiTextStore(db).get(owner, id);
  if (!record) throw new SkyPaymentError('利用記録が見つかりません。', 404);
  if (record.state !== 'completed' || record.price?.status !== 'priced' || !record.usage ||
    !record.providerResponseId || !record.observation)
    throw new SkyPaymentError('確定した利用量がありません。見積額は請求できません。', 409);
  const recalculated = priceRemoteAiTextUsage(record.verifiedRate, record.quote.ceiling, {
    ...record.observation, provider: 'openai', model: record.verifiedRate.card.modelId,
    reportedModel: record.observation.model, usage: record.usage,
  } as Parameters<typeof priceRemoteAiTextUsage>[2]);
  if (recalculated.status !== 'priced' || JSON.stringify(recalculated) !== JSON.stringify(record.price) ||
    recalculated.chargeMinor !== record.settledMinor || recalculated.providerResponseId !== record.providerResponseId ||
    recalculated.chargeMinor > record.quote.approvedCapMinor)
    throw new SkyPaymentError('利用量・単価・承認上限を照合できません。', 409);
  const digest = await sha256Hex(JSON.stringify({ domain: 'sky-usage-payment/1', owner,
    id: record.id, approval: record.approvalDigest, quote: record.quote.quoteDigest,
    price: recalculated, usage: record.usage }));
  return { source: 'cloud_llm', sourceId: id, currency: recalculated.currency.toLowerCase(),
    amountMinor: recalculated.chargeMinor, approvedCapMinor: record.quote.approvedCapMinor,
    digest, providerResponseId: record.providerResponseId, items: recalculated.items, collection: 'test_only' };
}

/** The same merchant adapter as CSV and Sky. Customer tariffs/funding and live acceptance are still pending. */
export function skyUsagePayments(db: Database, runtime: Runtime, fetcher: typeof fetch = fetch) {
  const config = readSkyStripeConfig({ ...runtime,
    SKY_STRIPE_WEBHOOK_SECRET: runtime.SKY_USAGE_STRIPE_WEBHOOK_SECRET });
  const stripe = skyStripe(config, fetcher);
  const get = (owner: string, id: string) => db.prepare(`SELECT ${columns} FROM sky_usage_payments WHERE owner_user_id=? AND id=?`)
    .bind(owner, id).first<Payment>();
  const publicPayment = (row: Payment) => ({ id: row.id, source: row.source, sourceId: row.sourceId,
    amountMinor: row.amountMinor, currency: row.currency, status: row.state,
    refundedMinor: row.refundedMinor, mode: row.mode, createdAt: row.createdAt });

  function bindSession(row: Payment, session: StripeCheckoutSession) {
    if (row.source !== 'cloud_llm') throw new SkyPaymentError('Agentの請求準備は入金未照合です。',409);
    if (session.mode !== 'payment' || session.livemode !== (row.mode === 'live') ||
      session.client_reference_id !== row.id || session.metadata?.purpose !== 'sky_cloud_usage' ||
      session.metadata?.usage_payment_id !== row.id || session.metadata?.source_digest !== row.digest ||
      session.amount_total !== row.amountMinor || session.currency !== row.currency ||
      (row.sessionId && row.sessionId !== session.id))
      throw new SkyPaymentError('支払い情報が利用明細と一致しません。', 409);
  }
  async function sync(row: Payment, provided?: StripeCheckoutSession) {
    if(row.source!=='cloud_llm')throw new SkyPaymentError('Agentの請求準備は入金未照合です。',409);
    if (!row.sessionId && !provided) throw new SkyPaymentError('決済受付を確認してください。', 409);
    const session = provided ?? await stripe.retrieveCheckout(row.sessionId!);
    bindSession(row, session);
    let state = session.status === 'expired' ? 'expired' : 'pending';
    let refunded = 0;
    const intentId = objectId(session.payment_intent);
    if (intentId) {
      const intent = await stripe.retrievePaymentIntent(intentId);
      if (intent.id !== intentId || (row.intentId && row.intentId !== intent.id) || intent.livemode !== (row.mode === 'live') ||
        intent.metadata?.usage_payment_id !== row.id || intent.metadata?.source_digest !== row.digest ||
        intent.metadata?.purpose !== 'sky_cloud_usage' || intent.amount !== row.amountMinor ||
        intent.currency !== row.currency || intent.transfer_data != null ||
        (intent.application_fee_amount != null && intent.application_fee_amount !== 0))
        throw new SkyPaymentError('決済先または金額が一致しません。', 409);
      if (intent.status === 'succeeded') {
        const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
        if (intent.amount_received !== row.amountMinor || !charge || charge.paid !== true ||
          charge.livemode !== (row.mode === 'live') || objectId(charge.payment_intent) !== intent.id ||
          charge.amount !== row.amountMinor || charge.currency !== row.currency ||
          !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded! < 0 || charge.amount_refunded! > row.amountMinor)
          throw new SkyPaymentError('入金または返金を照合できません。', 409);
        refunded = charge.amount_refunded!;
        state = charge.disputed ? 'disputed' : refunded === row.amountMinor ? 'refunded' :
          refunded > 0 ? 'partially_refunded' : session.payment_status === 'paid' ? 'paid' : 'pending';
      }
    }
    // Refund/dispute observations never regress on a delayed success response.
    await db.prepare(`UPDATE sky_usage_payments SET session_id=?,payment_intent_id=COALESCE(payment_intent_id,?),
      state=CASE WHEN state='disputed' OR ?='disputed' THEN 'disputed'
        WHEN state='refunded' OR ?='refunded' THEN 'refunded'
        WHEN state='partially_refunded' OR ?='partially_refunded' THEN 'partially_refunded'
        WHEN state='paid' AND ? IN ('pending','expired') THEN 'paid' ELSE ? END,
      refunded_minor=MAX(refunded_minor,?),updated_at=?
      WHERE id=? AND owner_user_id=? AND (session_id IS NULL OR session_id=?)
        AND (payment_intent_id IS NULL OR payment_intent_id IS ?)`)
      .bind(session.id, intentId ?? null, state, state, state, state, state, refunded, Date.now(),
        row.id, row.owner, session.id, intentId ?? null).run();
    const updated = await get(row.owner, row.id);
    if (!updated || updated.sessionId !== session.id || (intentId && updated.intentId !== intentId))
      throw new SkyPaymentError('決済記録が競合しています。', 409);
    return publicPayment(updated);
  }
  return {
    async list(owner: string) {
      const rows = await db.prepare(`SELECT ${columns} FROM sky_usage_payments WHERE owner_user_id=? AND mode=? ORDER BY created_at DESC LIMIT 100`)
        .bind(owner, config.mode).all<Payment>();
      return (rows.results ?? []).map(publicPayment);
    },
    async start(owner: string, input: { sourceId: string; digest: string; amountMinor: number; currency: string }) {
      // No environment variable can silently promote synthetic metering or pending retail tariffs to a live charge.
      if (config.mode !== 'test' || runtime.SKY_USAGE_PAYMENTS_TEST_ENABLED !== 'true')
        throw new SkyPaymentError('クラウド利用料の本番決済は、料金・資金・請求照合の受入待ちです。', 503);
      const statement = await cloudUsageStatement(db, owner, input.sourceId);
      if (input.digest !== statement.digest || input.amountMinor !== statement.amountMinor || input.currency !== statement.currency)
        throw new SkyPaymentError('最新の利用明細と金額を確認してから承認してください。', 409);
      if (!['jpy','usd'].includes(statement.currency) || statement.amountMinor < 50 || statement.amountMinor > 99_999_999)
        throw new SkyPaymentError('この通貨・金額は単独決済できません。最低料金への切り上げは行いません。', 409);
      const now = Date.now();
      await db.prepare(`INSERT INTO sky_usage_payments (id,owner_user_id,source_id,source_digest,amount_minor,currency,mode,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,mode) DO NOTHING`)
        .bind(crypto.randomUUID(), owner, statement.sourceId, statement.digest, statement.amountMinor, statement.currency, config.mode, now, now).run();
      const row = await db.prepare(`SELECT ${columns} FROM sky_usage_payments WHERE source_id=? AND mode=? AND owner_user_id=?`)
        .bind(statement.sourceId, config.mode, owner).first<Payment>();
      if (!row || row.digest !== statement.digest || row.amountMinor !== statement.amountMinor || row.currency !== statement.currency || row.state !== 'pending')
        throw new SkyPaymentError('既存の決済状況を確認してください。再請求は行いません。', 409);
      if (!row.sessionId && now - row.createdAt > 20 * 60 * 60 * 1000)
        throw new SkyPaymentError('結果不明の決済をStripeで照合してください。再作成できません。', 409);
      const session = row.sessionId ? await stripe.retrieveCheckout(row.sessionId) :
        await stripe.createUsageCheckout(row, `sky-usage:${config.mode}:${row.id}`);
      bindSession(row, session);
      const payment = await sync(row, session);
      if (payment.status !== 'pending' || session.payment_status === 'paid' || !session.url)
        return { payment, url: null };
      return { payment, url: session.url };
    },
    async confirm(owner: string, id: string) {
      const row = await get(owner, id);
      if (!row || row.mode !== config.mode) throw new SkyPaymentError('決済記録が見つかりません。', 404);
      return sync(row);
    },
    async webhook(raw: string, signature: string | null) {
      await verifyStripeSignature(raw, signature, config.webhookSecret);
      const event = JSON.parse(raw);
      if (!event.id || event.livemode !== (config.mode === 'live')) throw new SkyPaymentError('通知の環境が一致しません。', 400);
      const object = event.data?.object;
      let row: Payment | null = null;
      if (['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'].includes(event.type)) {
        if (object?.metadata?.purpose !== 'sky_cloud_usage') return { received: true, ignored: true };
        row = await db.prepare(`SELECT ${columns} FROM sky_usage_payments WHERE id=? AND mode=?`)
          .bind(object.metadata.usage_payment_id, config.mode).first<Payment>();
        if (!row) throw new SkyPaymentError('通知の決済記録を確認できません。', 409);
        // Also recovers an accepted checkout whose HTTP response was lost before attachment.
        const session = await stripe.retrieveCheckout(object.id);
        await sync(row, session);
      } else if (['charge.refunded','charge.dispute.created','charge.dispute.closed'].includes(event.type)) {
        const intentId = objectId(object?.payment_intent);
        if (intentId) row = await db.prepare(`SELECT ${columns} FROM sky_usage_payments WHERE payment_intent_id=? AND mode=?`)
          .bind(intentId, config.mode).first<Payment>();
        if (row) await sync(row);
      }
      return { received: true, ignored: !row };
    },
  };
}

/** Persists only a test preparation in the existing payment store. SQL forbids
 * Agent payment-state promotion; Provider invoices and actual collection remain gated. */
export async function prepareAgentUsagePayment(db:Database,owner:string,runtime:Runtime,input:{sourceId:string;digest:string;amountMinor:number;currency:string}) {
 if(runtime.SKY_PAYMENTS_MODE!=='test' || runtime.SKY_USAGE_AGENT_INVOICE_PREPARATION_ENABLED!=='true')throw new SkyPaymentError('Agentの請求準備保存は検証環境でのみ有効です。',503);
 const statement=await agentUsageStatement(db,owner,input.sourceId,typeof runtime.SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS==='string'?runtime.SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS:undefined),plan=statement.collectionPlan;
 if(!plan || plan.mode!=='platform_invoice' || statement.customerConsent!=='recorded_pending_invoice_reconciliation' || !statement.collectionConsent || input.digest!==statement.digest || input.amountMinor!==plan.platformInvoiceCandidateMinor || input.currency!==statement.currency)throw new SkyPaymentError('同じ明細の確認記録・金額・通貨を照合してください。',409);
 const currency=statement.currency.toLowerCase();
 if(!['usd','jpy'].includes(currency) || !Number.isSafeInteger(input.amountMinor) || input.amountMinor<1 || input.amountMinor>99999999)throw new SkyPaymentError('この通貨・金額は請求準備に対応していません。',409);
 const now=Date.now();
 try {await db.prepare(`INSERT INTO sky_usage_payments(id,owner_user_id,source_kind,agent_source_id,confirmation_id,source_digest,amount_minor,currency,mode,state,created_at,updated_at) VALUES (?,?,'sky_agent',?,?,?,?,?,'test','prepared',?,?) ON CONFLICT(agent_source_id,mode) DO NOTHING`)
  .bind(crypto.randomUUID(),owner,statement.sourceId,statement.collectionConsent.id,statement.digest,input.amountMinor,currency,now,now).run();}
 catch {throw new SkyPaymentError('保存前に元明細または契約が変わりました。同じ明細を読み直してください。',409);}
 const row=await db.prepare(`SELECT ${columns},confirmation_id AS confirmationId FROM sky_usage_payments WHERE owner_user_id=? AND agent_source_id=? AND mode='test'`).bind(owner,input.sourceId).first<Payment & {confirmationId:string}>();
 if(!row || row.digest!==statement.digest || row.amountMinor!==input.amountMinor || row.currency!==currency || row.confirmationId!==statement.collectionConsent.id || row.source!=='sky_agent' || row.state!=='prepared')throw new SkyPaymentError('保存した請求準備が異なります。再請求せず照合してください。',409);
 return {id:row.id,source:row.source,sourceId:row.sourceId,status:row.state,amountMinor:row.amountMinor,currency:row.currency,confirmationId:row.confirmationId,mode:row.mode,invoice:'not_created' as const,customerPayment:'unconfirmed' as const};
}
