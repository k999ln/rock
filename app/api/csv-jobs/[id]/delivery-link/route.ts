import { requestUser } from '@/lib/request-auth';
import {
  createCsvDeliveryLink,
  csvApiError,
  revokeCsvDeliveryLinks,
} from '@/lib/csv-job-store';

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  try {
    const user = await requestUser(request);
    const { id } = await context.params;
    const input = (await request.json().catch(() => ({}))) as {
      action?: string;
    };
    const result =
      input.action === 'revoke'
        ? await revokeCsvDeliveryLinks(user, id)
        : await createCsvDeliveryLink(user, id);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return csvApiError(error);
  }
};
