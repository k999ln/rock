import {saveAgentMonthlyStatement,readAgentMonthlyStatement} from './sky-agent-monthly-statement.ts';
import { agentUsageStatement } from './sky-agent-usage-statement.ts';
import { requestUser } from './request-auth.ts';
import { readSkyStripeConfig, SkyPaymentError } from './sky-stripe.ts';
import { skyCommerce } from './sky-commerce.ts';
import { cloudUsageStatement, skyUsagePayments, prepareAgentUsagePayment } from './sky-usage-payment.ts';

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
    if (request.method === 'GET' && action === 'agent-summary') {
      const params = new URL(request.url).searchParams;
      const jobId = params.get('job');
      if (!jobId || !/^[A-Za-z0-9._:-]{1,128}$/.test(jobId) || [...params.keys()].some(key => key !== 'job') || params.getAll('job').length !== 1)
        throw new SkyPaymentError('表示する仕事を確認してください。', 400);
      const mode = runtime.SKY_PAYMENTS_MODE==='test' || runtime.SKY_PAYMENTS_MODE==='live' ? runtime.SKY_PAYMENTS_MODE : 'unconfigured';
      const [usage, payments] = await Promise.all([
        db.prepare(`SELECT delegation_id AS id,currency,amount_minor AS amountMinor,received_at AS createdAt
          FROM a2a_usage_receipts WHERE owner_user_id=? AND parent_job_id=? ORDER BY received_at DESC LIMIT 101`).bind(owner,jobId).all(),
        db.prepare(`SELECT p.id,p.source_kind AS source,p.agent_source_id AS sourceId,p.state AS status,p.amount_minor AS amountMinor,p.currency
          FROM sky_usage_payments p JOIN agent_delegations d ON d.id=p.agent_source_id AND d.owner_user_id=p.owner_user_id
          WHERE p.owner_user_id=? AND p.mode=? AND p.source_kind='sky_agent' AND d.parent_job_id=? ORDER BY p.created_at DESC LIMIT 101`).bind(owner,mode,jobId).all(),
      ]);
      if ((usage.results?.length ?? 0)>100 || (payments.results?.length ?? 0)>100)
        throw new SkyPaymentError('この仕事の利用記録が表示上限を超えたため、全件を表示できません。保存済みの仕事と利用記録は保持されています。',409);
      return json({mode,purchases:[],csv:[],cloud:[],agentUsage:usage.results??[],collections:payments.results??[],cloudCheckoutEnabled:false,
        agentInvoicePreparationEnabled:mode==='test' && runtime.SKY_USAGE_AGENT_INVOICE_PREPARATION_ENABLED==='true',
        notice:'この仕事の利用記録です。請求・入金の確定は別です。'});
    }
    if (request.method === 'GET' && action === 'monthly-list') {
      const rows=await db.prepare("SELECT id,revision,period,currency,json_extract(payload,'$.amountMinor') AS amountMinor,json_array_length(payload,'$.items') AS itemCount FROM sky_linux_service_documents WHERE owner_user_id=? AND kind='agent_monthly_statement' ORDER BY period DESC,updated_at DESC LIMIT 100").bind(owner).all();
      return json({statements:rows.results??[]});
    }
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
        db.prepare(`SELECT id,source_kind AS source,COALESCE(source_id,agent_source_id) AS sourceId,state AS status,amount_minor AS amountMinor,currency,
          refunded_minor AS refundedMinor,mode FROM sky_usage_payments WHERE owner_user_id=? AND mode=? ORDER BY created_at DESC LIMIT 100`)
          .bind(owner, config.mode).all(),
      ]);
      return json({ mode: config.mode, purchases, csv: csv.results ?? [], cloud: cloud.results ?? [],
        agentUsage: a2a.results ?? [], collections: collections.results ?? [],
        cloudCheckoutEnabled: config.mode === 'test' && runtime.SKY_USAGE_PAYMENTS_TEST_ENABLED === 'true' &&
          typeof runtime.SKY_USAGE_STRIPE_WEBHOOK_SECRET === 'string',
        agentCollection: 'existing_wallet_only',
        agentInvoicePreparationEnabled: config.mode==='test' && runtime.SKY_USAGE_AGENT_INVOICE_PREPARATION_ENABLED==='true',
        notice: 'クラウド利用額の計算と入金は別です。eSIM・Web・アプリでも同じ実行への請求は一回だけです。' });
    }
    if (request.method !== 'POST') return json({ error: '操作が見つかりません。' }, 404);
    const input: unknown = JSON.parse(await boundedBody(request, 4096));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SkyPaymentError('入力形式を確認してください。', 400);
    const value = input as Record<string, unknown>;
    if (action==='monthly-save') {
      if(Object.keys(value).some(key=>!['period','currency'].includes(key)) || typeof value.period!=='string' || typeof value.currency!=='string')throw new SkyPaymentError('月と元の通貨を確認してください。');
      return json(await saveAgentMonthlyStatement(db,owner,runtime,value.period,value.currency));
    }
    const allowed = ['checkout','prepare-agent-invoice'].includes(action) ? ['sourceId','digest','amountMinor','currency'] : action === 'statement' ? ['sourceId','source'] : ['id'];
    const reference = value.sourceId ?? value.id;
    if (Object.keys(value).some(key => !allowed.includes(key)) ||
      typeof reference !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(reference))
      throw new SkyPaymentError('入力内容を確認してください。', 400);
    if (action === 'statement') {
      if(value.source!==undefined && (typeof value.source!=='string' || !['cloud_llm','sky_agent'].includes(value.source)))throw new SkyPaymentError('利用元の種類を確認してください。',400);
      return json(value.source==='sky_agent'
        ? await agentUsageStatement(db,owner,reference,typeof runtime.SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS==='string'?runtime.SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS:undefined)
        : await cloudUsageStatement(db, owner, reference));
    }
    if(action==='prepare-agent-invoice') {
      if(typeof value.digest!=='string' || typeof value.amountMinor!=='number' || typeof value.currency!=='string')throw new SkyPaymentError('保存する明細と金額を確認してください。',400);
      return json(await prepareAgentUsagePayment(db,owner,runtime,value as {sourceId:string;digest:string;amountMinor:number;currency:string}));
    }
    if(action==='monthly-read')return json(await readAgentMonthlyStatement(db,owner,reference));
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
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'Smithの画面から操作してください。' }, 403);
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: '支払いには本人のサインインが必要です。' }, 401);
    return json({ error: '決済状況を確認できません。時間をおいて再確認してください。' }, 503);
  }
}
