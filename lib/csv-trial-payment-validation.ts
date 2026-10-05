import { SkyPaymentError, type StripeCheckoutSession } from './sky-stripe.ts';

/** A return URL or a browser's paid flag is never payment evidence. */
export function verifyCsvTrialPayment(
  session: StripeCheckoutSession,
  expected: {
    jobId: string;
    sessionId: string;
    mode: 'test' | 'live';
  },
): void {
  const live = expected.mode === 'live';
  const intent = session.payment_intent;
  if (
    session.id !== expected.sessionId ||
    session.client_reference_id !== expected.jobId ||
    session.metadata?.csv_job_id !== expected.jobId ||
    session.metadata?.purpose !== 'csv_trial_50' ||
    session.mode !== 'payment' ||
    session.status !== 'complete' ||
    session.payment_status !== 'paid' ||
    session.livemode !== live ||
    session.currency !== 'jpy' ||
    session.amount_total !== 50 ||
    !intent ||
    typeof intent === 'string' ||
    intent.status !== 'succeeded' ||
    intent.amount !== 50 ||
    intent.amount_received !== 50 ||
    intent.currency !== 'jpy' ||
    intent.livemode !== live ||
    intent.metadata?.csv_job_id !== expected.jobId ||
    intent.metadata?.purpose !== 'csv_trial_50' ||
    intent.transfer_data ||
    intent.application_fee_amount
  ) {
    throw new SkyPaymentError(
      '50円の支払い完了を確認できません。決済画面か支払い状況をご確認ください。',
      409,
    );
  }
  const charge = intent.latest_charge;
  if (
    !charge ||
    typeof charge === 'string' ||
    !charge.paid ||
    charge.currency !== 'jpy' ||
    charge.amount !== 50 ||
    charge.livemode !== live ||
    charge.refunded ||
    charge.disputed ||
    charge.amount_refunded !== 0 ||
    charge.application_fee ||
    charge.transfer ||
    (typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id) !== intent.id
  ) {
    throw new SkyPaymentError(
      '支払いの明細を確認できません。返金・紛争中の支払いでは開始できません。',
      409,
    );
  }
}
