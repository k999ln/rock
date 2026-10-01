import { verifyStripeSignature } from '../services/sky-billing/src/stripe-signature.ts';
import {
  readSkyStripeConfig,
  skyStripe,
  SkyPaymentError,
} from './sky-stripe.ts';
import { verifyCsvTrialPayment } from './csv-trial-payment-validation.ts';

type TrialJob = {
  id: string;
  user_id: string;
  status: string;
  payment_status: string;
  quote_minor: number;
  currency: string;
  expires_at: number;
  revision: number;
};
type Payment = { id: string; session_id: string | null; created_at: number };
export function csvTrialPayments(
  runtime: object,
  fulfill: (
    user: string,
    id: string,
    input: { revision: number },
  ) => Promise<unknown>,
  fetcher: typeof fetch = fetch,
) {
  function resources() {
    const values = runtime as Record<string, unknown> & { DB?: D1Database };
    const config = readSkyStripeConfig({
      ...values,
      SKY_STRIPE_WEBHOOK_SECRET: values.SKY_CSV_STRIPE_WEBHOOK_SECRET,
    });
    if (!values.DB)
      throw new SkyPaymentError('決済記録の保存設定が完了していません。', 503);
    return { db: values.DB, config, stripe: skyStripe(config, fetcher) };
  }
  async function jobFor(db: D1Database, user: string, id: string) {
    const job = await db
      .prepare('SELECT * FROM csv_jobs WHERE id = ? AND user_id = ?')
      .bind(id, user)
      .first<TrialJob>();
    if (!job) throw new SkyPaymentError('受付が見つかりません。', 404);
    if (job.expires_at <= Date.now())
      throw new SkyPaymentError(
        '保管期限が切れています。決済を開始できません。',
        410,
      );
    // Historical CSV quotes use hundredths of a yen internally. Only this trial is sold here.
    if (
      job.quote_minor !== 5000 ||
      job.currency !== 'JPY' ||
      job.payment_status === 'sample'
    )
      throw new SkyPaymentError('この決済は50円試験の受付専用です。', 409);
    return job;
  }
  function availability() {
    try {
      return { available: true, mode: resources().config.mode, amountYen: 50 };
    } catch {
      return { available: false, mode: null, amountYen: 50 };
    }
  }
  async function start(user: string, id: string) {
    const { db, config, stripe } = resources();
    const job = await jobFor(db, user, id);
    if (job.status !== 'quoted' || job.payment_status !== 'unpaid')
      throw new SkyPaymentError('この受付は決済を開始できません。', 409);
    const paymentId = `csv-trial:${config.mode}:${id}`;
    await db
      .prepare(
        'INSERT OR IGNORE INTO csv_trial_payments (id, job_id, mode, created_at) VALUES (?, ?, ?, ?)',
      )
      .bind(paymentId, id, config.mode, Date.now())
      .run();
    const payment = await db
      .prepare('SELECT * FROM csv_trial_payments WHERE id = ?')
      .bind(paymentId)
      .first<Payment>();
    if (!payment)
      throw new SkyPaymentError('決済を記録できませんでした。', 503);
    // Do not recreate an uncertain charge after Stripe's idempotency retention window.
    if (
      !payment.session_id &&
      Date.now() - payment.created_at > 20 * 60 * 60 * 1000
    )
      throw new SkyPaymentError(
        '以前の決済の状態確認が必要です。新しい受付から支払い直さないでください。',
        409,
      );
    const session = payment.session_id
      ? await stripe.retrieveCheckout(payment.session_id)
      : await stripe.createCsvTrialCheckout(id, paymentId);
    if (session.status === 'expired')
      throw new SkyPaymentError(
        '決済画面の期限が切れています。支払い状況を確認してください。',
        409,
      );
    if (session.payment_status === 'paid')
      throw new SkyPaymentError(
        '支払い済みです。「支払いを確認して開始」を選んでください。',
        409,
      );
    await db
      .prepare(
        'UPDATE csv_trial_payments SET session_id = ? WHERE id = ? AND (session_id IS NULL OR session_id = ?)',
      )
      .bind(session.id, paymentId, session.id)
      .run();
    if (!session.url)
      throw new SkyPaymentError('決済画面を開けませんでした。', 502);
    return { url: session.url, mode: config.mode, amountYen: 50 };
  }
  async function confirm(user: string, id: string) {
    const { db, config, stripe } = resources();
    let job = await jobFor(db, user, id);
    const payment = await db
      .prepare('SELECT * FROM csv_trial_payments WHERE id = ?')
      .bind(`csv-trial:${config.mode}:${id}`)
      .first<Payment>();
    if (!payment?.session_id)
      throw new SkyPaymentError('この受付の決済記録がありません。', 409);
    const session = await stripe.retrieveCheckout(payment.session_id);
    verifyCsvTrialPayment(session, {
      jobId: id,
      sessionId: payment.session_id,
      mode: config.mode,
    });
    await db
      .prepare(
        "UPDATE csv_jobs SET payment_status = 'stripe_verified', payment_method = 'Stripe', payment_reference = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'quoted' AND payment_status = 'unpaid' AND expires_at > ?",
      )
      .bind(session.id, Date.now(), id, user, Date.now())
      .run();
    job = await jobFor(db, user, id);
    return fulfill(user, id, { revision: job.revision });
  }

  async function webhook(raw: string, signature: string | null) {
    const { db, config } = resources();
    await verifyStripeSignature(raw, signature, config.webhookSecret);
    const event = JSON.parse(raw) as {
      id?: string;
      type?: string;
      livemode?: boolean;
      data?: {
        object?: {
          id?: string;
          metadata?: { purpose?: string; csv_job_id?: string };
        };
      };
    };
    if (!event.id || event.livemode !== (config.mode === 'live'))
      throw new SkyPaymentError('決済通知の環境が一致しません。', 400);
    if (
      ![
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
      ].includes(event.type ?? '')
    )
      return { received: true, ignored: true };
    const object = event.data?.object;
    if (
      object?.metadata?.purpose !== 'csv_trial_50' ||
      !object.metadata.csv_job_id
    )
      return { received: true, ignored: true };
    const payment = await db
      .prepare(
        'SELECT job_id FROM csv_trial_payments WHERE session_id = ? AND mode = ?',
      )
      .bind(object.id, config.mode)
      .first<{ job_id: string }>();
    if (!payment || payment.job_id !== object.metadata.csv_job_id)
      throw new SkyPaymentError('決済通知の受付が一致しません。', 409);
    const job = await db
      .prepare('SELECT user_id FROM csv_jobs WHERE id = ?')
      .bind(payment.job_id)
      .first<{ user_id: string }>();
    if (!job)
      throw new SkyPaymentError('支払いの受付を確認してください。', 409);
    await confirm(job.user_id, payment.job_id);
    return { received: true };
  }
  return { availability, start, confirm, webhook };
}
