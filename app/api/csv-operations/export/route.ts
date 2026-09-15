import { requestUser } from '@/lib/request-auth';
import { csvApiError } from '@/lib/csv-job-store';
import { csvOperationsExport } from '@/lib/csv-operations-store';

export const GET = async (request: Request) => {
  try {
    const user = await requestUser(request);
    const data = await csvOperationsExport(user);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="csv-operations-export.json"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return csvApiError(error);
  }
};
