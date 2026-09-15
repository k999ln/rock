import { requestUser } from '@/lib/request-auth';
import {
  acceptCsvJob,
  csvApiError,
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
      paymentMethod?: string;
      paymentReference?: string;
    };
    const job =
      input.action === 'retry'
        ? await retryCsvJob(user, id, Number(input.revision))
        : await acceptCsvJob(user, id, {
            revision: Number(input.revision),
            paymentMethod: input.paymentMethod,
            paymentReference: input.paymentReference,
          });
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
