import { requestUser } from '@/lib/request-auth';
import { csvApiError, CsvJobError } from '@/lib/csv-job-store';
import {
  csvOperationsSnapshot,
  recordCsvDirectCost,
  reconcileCsvMonth,
  recordCsvIntervention,
  recordCsvPaymentAsOperator,
  retryCsvJobAsOperator,
  setCsvIntake,
  setCsvScopedIntake,
} from '@/lib/csv-operations-store';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export const GET = async (request: Request) => {
  try {
    const user = await requestUser(request);
    return Response.json(await csvOperationsSnapshot(user), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return csvApiError(error);
  }
};

export const POST = async (request: Request) => {
  try {
    const user = await requestUser(request);
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 32 * 1024)
      throw new CsvJobError(413, 'TOO_LARGE', '運営操作の内容が大きすぎます。');
    const input = (await request.json()) as Record<string, unknown>;
    let result: unknown;
    switch (input.action) {
      case 'pause_intake':
      case 'resume_intake':
        result = await setCsvIntake(user, {
          acceptingNew: input.action === 'resume_intake',
          reason: input.reason,
          revision: input.revision,
          idempotencyKey: input.idempotencyKey,
        });
        break;
      case 'pause_scope':
      case 'resume_scope':
        result = await setCsvScopedIntake(user, {
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          acceptingNew: input.action === 'resume_scope',
          reason: input.reason,
          revision: input.revision,
          idempotencyKey: input.idempotencyKey,
        });
        break;
      case 'manual_payment':
        if (
          input.relatedEventType !== undefined &&
          input.relatedEventType !== 'buyer_paid' &&
          input.relatedEventType !== 'paid_to_owner'
        )
          throw new CsvJobError(400, 'PAYMENT_EVENT_REQUIRES_ORIGINAL_TYPE', '関連イベント種別が不正です。');
        result = await recordCsvPaymentAsOperator(user, {
          jobId: text(input.jobId),
          provider: text(input.provider),
          type: input.type as never,
          amountMinor: Number(input.amountMinor),
          currency: text(input.currency),
          occurredAt:
            input.occurredAt === undefined
              ? undefined
              : Number(input.occurredAt),
          relatedProviderEventId:
            typeof input.relatedProviderEventId === 'string'
              ? input.relatedProviderEventId
              : undefined,
          relatedEventType:
            input.relatedEventType === 'buyer_paid' ||
            input.relatedEventType === 'paid_to_owner'
              ? input.relatedEventType
              : undefined,
          evidenceReference: text(input.evidenceReference),
          idempotencyKey: text(input.idempotencyKey),
        });
        break;
      case 'direct_cost':
        result = await recordCsvDirectCost(user, {
          jobId: text(input.jobId),
          category: input.category,
          amountMinor: Number(input.amountMinor),
          currency: text(input.currency),
          evidenceReference: input.evidenceReference,
          idempotencyKey: input.idempotencyKey,
        });
        break;
      case 'intervene':
        result = await recordCsvIntervention(user, {
          jobId: text(input.jobId),
          action: input.intervention,
          note: input.note,
          idempotencyKey: input.idempotencyKey,
        });
        break;
      case 'retry':
        result = await retryCsvJobAsOperator(user, {
          jobId: text(input.jobId),
          revision: Number(input.revision),
          idempotencyKey: text(input.idempotencyKey),
        });
        break;
      case 'reconcile_month':
        result = await reconcileCsvMonth(user, input.monthJst, input.idempotencyKey);
        break;
      default:
        throw new CsvJobError(400, 'OPERATOR_ACTION', '運営操作が不正です。');
    }
    return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return csvApiError(error);
  }
};
