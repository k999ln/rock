import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { linuxPaymentHandler } from '@/lib/sky-linux-payment-handler';
import { LinuxServiceError, linuxRequestText } from '@/lib/sky-linux-service';
export async function POST(request: Request) {
  try {
    const runtime = env as unknown as Record<string, unknown>,
      handler = linuxPaymentHandler(database(), runtime);
    if (request.headers.has('stripe-signature')) {
      const raw = await linuxRequestText(request, 1000000);
      return Response.json(
        await handler.webhook(raw, request.headers.get('stripe-signature')),
      );
    }
    const owner = await requestUser(request),
      raw = await linuxRequestText(request, 2000);
    const value = JSON.parse(raw);
    if (typeof value.invoiceId !== 'string' || value.invoiceId.length > 100)
      throw new LinuxServiceError('請求書を選んでください。', 400);
    const result =
      value.action === 'collect'
        ? await handler.collect(owner, value.invoiceId)
        : value.action === 'reconcile'
          ? await handler.reconcile(owner, value.invoiceId, false)
          : null;
    if (!result) throw new LinuxServiceError('操作を選んでください。', 400);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof LinuxServiceError
            ? error.message
            : '請求の照合を完了できませんでした。',
      },
      { status: error instanceof LinuxServiceError ? error.status : 503 },
    );
  }
}
