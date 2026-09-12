import { env } from 'cloudflare:workers';
import { createBillingToken } from '@/lib/billing-token';
import { requestUser } from '@/lib/fund-store';

type BillingEnvironment = {
  BILLING_SERVICE_URL?: string;
  BILLING_SHARED_SECRET?: string;
};

function configuredOrigin(value: string | undefined) {
  if (!value) throw new Error('BILLING_NOT_CONFIGURED');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname)
    )
  )
    throw new Error('BILLING_NOT_CONFIGURED');
  return url.origin;
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const status =
    message === 'UNAUTHORIZED'
      ? 401
      : message === 'ORIGIN'
        ? 403
        : message === 'BILLING_NOT_CONFIGURED' ||
            message === 'TOKEN_SECRET_INVALID'
          ? 503
          : 400;
  return Response.json(
    {
      error:
        status === 401
          ? 'サインインすると月額プランを管理できます。'
          : status === 403
            ? 'このSky画面から操作してください。'
            : status === 503
              ? '月額決済サービスの接続準備中です。'
              : '月額プランを開けませんでした。',
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  try {
    const userId = requestUser(request);
    const bindings = env as unknown as BillingEnvironment;
    const serviceOrigin = configuredOrigin(bindings.BILLING_SERVICE_URL);
    const token = await createBillingToken(
      userId,
      bindings.BILLING_SHARED_SECRET ?? '',
    );
    return Response.json(
      { serviceOrigin, token, expiresIn: 300 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
