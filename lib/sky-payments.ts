import { requestUser } from './request-auth.ts';
import { readSkyStripeConfig, SkyPaymentError } from './sky-stripe.ts';
import { skyCommerce } from './sky-commerce.ts';
import { cloudUsageStatement, skyUsagePayments } from './sky-usage-payment.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function boundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new SkyPaymentError('入力がありません。', 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > limit) { await reader.cancel(); throw new SkyPaymentError('入力が長すぎます。', 413); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** One account-facing payment surface; product and usage ledgers keep their original authority. */
export async function handleSkyPayments(request: Request, action: string, db: Database,
  runtime: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  try {
    if (action === 'webhook' && request.method === 'POST')
      return json(await skyUsagePayments(db, runtime, fetcher).webhook(await boundedBody(request, 65536), request.headers.get('stripe-signature')));
    if (!['GET','POST'].includes(request.method)) return json({ error: 'この操作には対応していません。' }, 405);
    const origin = new URL(request.url).origin;
    if (typeof runtime.SKY_PAYMENT_ORIGIN !== 'string')
      throw new SkyPaymentError('この環境の決済接続は準備中です。', 503);
    if (origin !== runtime.SKY_PAYMENT_ORIGIN)
      throw new Error('ORIGIN');
    if (runtime.SKY_PAYMENTS_MODE === 'live' && (!new URL(request.url).hostname.endsWith('.chatgpt.site') ||
      !request.headers.get('x-dispatched-app')?.startsWith('site---'))) throw new Error('UNAUTHORIZED');
    const owner = await requestUser(request);
    if (request.method === 'GET' && action === 'summary') {
      const config = readSkyStripeConfig(runtime);
      const purchases = await skyCommerce(db, config, fetcher).purchases(owner);
      const [cloud, csv, a2a, collections] = await Promise.all([
        db.prepare(`SELECT id,state,currency,settled_minor AS amountMinor,created_at AS createdAt
          FROM remote_ai_text_executions WHERE owner_user_id=? ORDER BY created_at DESC LIMIT 100`).bind(owner).all(),
        db.prepare(`SELECT id,payment_status AS status,quote_minor AS quoteHundredthsOfYen,currency,created_at AS createdAt
          FROM csv_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 100`).bind(owner).all(),
        db.prepare(`SELECT delegation_id AS id,currency,amount_minor AS amountMinor,received_at AS createdAt
          FROM a2a_usage_receipts WHERE owner_user_id=? ORDER BY received_at DESC LIMIT 100`).bind(owner).all(),
        db.prepare(`SELECT id,source_id AS sourceId,state AS status,amount_minor AS amountMinor,currency,
          refunded_minor AS refundedMinor,mode FROM sky_usage_payments WHERE owner_user_id=? AND mode=? ORDER BY created_at DESC LIMIT 100`)
          .bind(owner, config.mode).all(),
      ]);
      return json({ mode: config.mode, purchases, csv: csv.results ?? [], cloud: cloud.results ?? [],
        agentUsage: a2a.results ?? [], collections: collections.results ?? [],
        cloudCheckoutEnabled: config.mode === 'test' && runtime.SKY_USAGE_PAYMENTS_TEST_ENABLED === 'true' &&
          typeof runtime.SKY_USAGE_STRIPE_WEBHOOK_SECRET === 'string',
        agentCollection: 'existing_wallet_only',
        notice: 'クラウド利用額の計算と入金は別です。eSIM・Web・アプリでも同じ実行への請求は一回だけです。' });
    }
    if (request.method !== 'POST') return json({ error: '操作が見つかりません。' }, 404);
    const input: unknown = JSON.parse(await boundedBody(request, 4096));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SkyPaymentError('入力形式を確認してください。', 400);
    const value = input as Record<string, unknown>;
    const allowed = action === 'checkout' ? ['sourceId','digest','amountMinor','currency'] : action === 'statement' ? ['sourceId'] : ['id'];
    const reference = value.sourceId ?? value.id;
    if (Object.keys(value).some(key => !allowed.includes(key)) ||
      typeof reference !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(reference))
      throw new SkyPaymentError('入力内容を確認してください。', 400);
    if (action === 'statement') return json(await cloudUsageStatement(db, owner, reference));
    const payments = skyUsagePayments(db, runtime, fetcher);
    if (action === 'checkout') {
      if (typeof value.sourceId !== 'string' || typeof value.digest !== 'string' ||
        typeof value.currency !== 'string' || typeof value.amountMinor !== 'number')
        throw new SkyPaymentError('明細を確認してから支払いを承認してください。', 400);
      return json(await payments.start(owner, value as { sourceId: string; digest: string; amountMinor: number; currency: string }));
    }
    if (action === 'confirm') return json(await payments.confirm(owner, reference));
    return json({ error: '操作が見つかりません。' }, 404);
  } catch (error) {
    if (error instanceof SkyPaymentError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'STRIPE_SIGNATURE_INVALID'))
      return json({ error: '入力または通知の署名を確認できません。' }, 400);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'Skyの画面から操作してください。' }, 403);
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: '支払いには本人のサインインが必要です。' }, 401);
    return json({ error: '決済状況を確認できません。時間をおいて再確認してください。' }, 503);
  }
}
