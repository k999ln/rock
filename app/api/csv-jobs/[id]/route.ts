import { requestUser } from '@/lib/request-auth';
import {
  acceptCsvJob,
  actOnCsvDelivery,
  applyCsvRevision,
  csvApiError,
  CsvJobError,
  deleteCsvJob,
  retryCsvJob,
} from '@/lib/csv-job-store';

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  try {
    const user = await requestUser(request);
    const { id } = await context.params;
    const input = (await request.json()) as {
      action?: string;
      revision?: number;
      specification?: unknown;
      reason?: unknown;
    };
    let job;
    switch (input.action ?? 'accept') {
      case 'accept':
        job = await acceptCsvJob(user, id, {
          revision: Number(input.revision),
        });
        break;
      case 'retry':
        job = await retryCsvJob(user, id, Number(input.revision));
        break;
      case 'apply_revision':
        job = await applyCsvRevision(user, id, {
          revision: Number(input.revision),
          specification: input.specification,
        });
        break;
      case 'cancel':
        job = await actOnCsvDelivery(user, id, {
          action: 'cancel',
          revision: Number(input.revision),
          reason: input.reason,
        });
        break;
      default:
        throw new CsvJobError(400, 'JOB_ACTION', '受付操作が不正です。');
    }
    return Response.json({ job }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return csvApiError(error);
  }
};

export const DELETE = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  try {
    const user = await requestUser(request);
    const { id } = await context.params;
    await deleteCsvJob(user, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return csvApiError(error);
  }
};
