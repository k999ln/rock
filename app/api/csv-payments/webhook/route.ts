import { env } from 'cloudflare:workers';
import {
  csvApiError,
  CsvJobError,
  recordProviderCsvPayment,
} from '@/lib/csv-job-store';
import { sha256 } from '@/lib/csv-transform';
import { verifyCsvPaymentWebhook } from '@/lib/csv-money';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export const POST = async (request: Request) => {
  try {
    const bindings = env as unknown as {
      CSV_PAYMENT_WEBHOOK_SECRET?: string;
      CSV_PAYMENT_PROVIDER?: string;
    };
    const secret = bindings.CSV_PAYMENT_WEBHOOK_SECRET ?? '';
    const expectedProvider = bindings.CSV_PAYMENT_PROVIDER ?? '';
    if (!secret || !expectedProvider)
      throw new CsvJobError(
        503,
        'PAYMENT_WEBHOOK_NOT_CONFIGURED',
        '入金ProviderのWebhook設定がありません。',
      );
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 32 * 1024)
      throw new CsvJobError(413, 'TOO_LARGE', 'Webhookイベントが大きすぎます。');
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 32 * 1024)
      throw new CsvJobError(413, 'TOO_LARGE', 'Webhookイベントが大きすぎます。');
    const valid = await verifyCsvPaymentWebhook(
      secret,
      request.headers.get('x-csv-signature'),
      body,
    );
    if (!valid)
      throw new CsvJobError(401, 'PAYMENT_SIGNATURE', 'Webhook署名を確認できません。');
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('object expected');
      payload = parsed as Record<string, unknown>;
    } catch {
      throw new CsvJobError(400, 'PAYMENT_EVENT', 'Webhook JSONが不正です。');
    }
    const allowed = new Set([
      'provider',
      'providerEventId',
      'relatedProviderEventId',
      'relatedEventType',
      'jobId',
      'type',
      'amountMinor',
      'currency',
      'occurredAt',
    ]);
    if (Object.keys(payload).some((key) => !allowed.has(key)))
      throw new CsvJobError(
        400,
        'PAYMENT_EVENT_FIELDS',
        'Webhookに許可されない項目があります。',
      );
    if (payload.provider !== expectedProvider)
      throw new CsvJobError(
        400,
        'PAYMENT_PROVIDER',
        'WebhookのProviderが一致しません。',
      );
    if (
      payload.relatedEventType !== undefined &&
      payload.relatedEventType !== 'buyer_paid' &&
      payload.relatedEventType !== 'paid_to_owner'
    )
      throw new CsvJobError(
        400,
        'PAYMENT_EVENT_REQUIRES_ORIGINAL_TYPE',
        '関連イベント種別が不正です。',
      );
    const event = await recordProviderCsvPayment({
      provider: expectedProvider,
      providerEventId: text(payload.providerEventId),
      relatedProviderEventId:
        typeof payload.relatedProviderEventId === 'string'
          ? payload.relatedProviderEventId
          : undefined,
      relatedEventType:
        payload.relatedEventType === 'buyer_paid' ||
        payload.relatedEventType === 'paid_to_owner'
          ? payload.relatedEventType
          : undefined,
      jobId: text(payload.jobId),
      type: payload.type as never,
      amountMinor: Number(payload.amountMinor),
      currency: text(payload.currency),
      occurredAt: Number(payload.occurredAt),
      evidenceDigest: await sha256(new TextEncoder().encode(body)),
      source: 'provider',
    });
    return Response.json(
      { accepted: true, duplicate: event.duplicate },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return csvApiError(error);
  }
};
