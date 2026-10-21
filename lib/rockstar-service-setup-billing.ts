import { stripeRequest } from '../shared/stripe.mjs';
import { readSkyStripeConfig, SKY_STRIPE_API_VERSION } from './sky-stripe.ts';
import {
  ServiceSetupError,
  type ServiceSetup,
} from './rockstar-service-setup.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';

/** Registers a method for the existing month-end invoices; this adapter never collects money. */
export function serviceSetupBilling(
  runtime: Record<string, unknown>,
  owner: string,
  fetcher: typeof fetch = fetch,
) {
  const config = readSkyStripeConfig(runtime);
  let customer: string;
  try {
    const raw = runtime.SKY_LINUX_CUSTOMERS_JSON ?? '{}';
    if (typeof raw !== 'string') throw new Error();
    const mapping = JSON.parse(raw);
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping))
      throw new Error();
    customer = mapping[owner];
    if (!/^cus_[A-Za-z0-9]+$/.test(customer)) throw new Error();
  } catch {
    throw new ServiceSetupError(
      '本人と支払い先の設定を確認してください。',
      503,
    );
  }
  const call = (
    path: string,
    method: 'GET' | 'POST',
    parameters: Record<string, unknown> = {},
    idempotencyKey?: string,
  ) =>
    stripeRequest({
      path,
      method,
      parameters,
      idempotencyKey,
      secretKey: config.secretKey,
      apiVersion: SKY_STRIPE_API_VERSION,
      fetchImpl: fetcher,
    });
  function metadata(setup: ServiceSetup) {
    return {
      rockstar_service_setup: setup.id,
      agreement_digest: setup.agreementDigest!,
    };
  }
  function checkObject(v: Record<string, unknown>, setup: ServiceSetup) {
    const m = v.metadata as Record<string, unknown> | undefined;
    if (
      v.customer !== customer ||
      v.livemode !== (config.mode === 'live') ||
      m?.rockstar_service_setup !== setup.id ||
      m?.agreement_digest !== setup.agreementDigest
    )
      throw new ServiceSetupError(
        '支払い方法の本人・契約・環境が一致しません。',
        403,
      );
  }
  return {
    async start(setup: ServiceSetup, now = Date.now()) {
      if (!setup.agreementDigest || setup.billing.requestedAt === null)
        throw new ServiceSetupError(
          '契約同意と支払い準備の保存を先に完了してください。',
        );
      if (now - setup.billing.requestedAt >= 20 * 3600000)
        throw new ServiceSetupError(
          '支払い準備の結果を提供元で照合してください。新しく請求し直しません。',
        );
      const key = await sha256Hex(
        `service-setup:${config.mode}:${setup.id}:${setup.agreementDigest}`,
      );
      const value = await call(
        '/v1/checkout/sessions',
        'POST',
        {
          mode: 'setup',
          customer,
          currency: 'usd',
          integration_identifier: `rockstar_setup_${key.slice(0, 8).replace(/[0-9]/g, 'a')}`,
          client_reference_id: setup.id,
          metadata: metadata(setup),
          setup_intent_data: { metadata: metadata(setup) },
          success_url: `${config.origin}/connect/service`,
          cancel_url: `${config.origin}/connect/service`,
        },
        `rockstar-setup:${key}`,
      );
      checkObject(value, setup);
      if (
        value.mode !== 'setup' ||
        value.client_reference_id !== setup.id ||
        typeof value.id !== 'string' ||
        !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(value.id) ||
        typeof value.url !== 'string'
      )
        throw new ServiceSetupError('支払い準備の結果を確認できません。');
      const url = new URL(value.url);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'checkout.stripe.com' ||
        url.username ||
        url.password
      )
        throw new ServiceSetupError('支払い画面の接続先を確認できません。');
      return { sessionId: value.id, url: value.url };
    },
    async reconcile(setup: ServiceSetup) {
      const id = setup.billing.sessionId;
      if (!id || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(id))
        throw new ServiceSetupError('保存済みの支払い準備を確認してください。');
      const session = await call(`/v1/checkout/sessions/${id}`, 'GET');
      checkObject(session, setup);
      if (
        session.id !== id ||
        session.mode !== 'setup' ||
        session.client_reference_id !== setup.id
      )
        throw new ServiceSetupError('支払い準備の対象が一致しません。', 403);
      if (session.status !== 'complete') return null;
      const intentId = session.setup_intent;
      if (typeof intentId !== 'string' || !/^seti_[A-Za-z0-9]+$/.test(intentId))
        throw new ServiceSetupError('支払い方法の登録証拠を確認できません。');
      const intent = await call(`/v1/setup_intents/${intentId}`, 'GET');
      checkObject(intent, setup);
      if (
        intent.id !== intentId ||
        intent.status !== 'succeeded' ||
        intent.usage !== 'off_session' ||
        typeof intent.payment_method !== 'string' ||
        !/^pm_[A-Za-z0-9]+$/.test(intent.payment_method)
      )
        throw new ServiceSetupError(
          '月末請求に使える支払い方法の確認待ちです。',
        );
      const method = await call(
        `/v1/payment_methods/${intent.payment_method}`,
        'GET',
      );
      if (
        method.id !== intent.payment_method ||
        method.customer !== customer ||
        method.livemode !== (config.mode === 'live')
      )
        throw new ServiceSetupError(
          '支払い方法と本人の結合が一致しません。',
          403,
        );
      // Setup-mode Checkout attaches the method, but does not make it the invoice default.
      const key = await sha256Hex(
        `service-invoice-method:${setup.id}:${intentId}`,
      );
      await call(
        `/v1/customers/${customer}`,
        'POST',
        {
          invoice_settings: { default_payment_method: intent.payment_method },
        },
        `rockstar-invoice-method:${key}`,
      );
      const readback = await call(`/v1/customers/${customer}`, 'GET');
      if (
        readback.id !== customer ||
        (readback.invoice_settings as Record<string, unknown> | undefined)
          ?.default_payment_method !== intent.payment_method
      )
        throw new ServiceSetupError('月末請求の設定を読み戻せませんでした。');
      return {
        setupIntentId: intentId,
        paymentMethodId: intent.payment_method,
      };
    },
  };
}
