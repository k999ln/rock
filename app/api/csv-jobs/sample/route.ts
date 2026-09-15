import { requestUser } from '@/lib/request-auth';
import { createCsvSampleJob, csvApiError } from '@/lib/csv-job-store';

export const POST = async (request: Request) => {
  try {
    const user = await requestUser(request);
    const job = await createCsvSampleJob(user);
    return Response.json(
      { job },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return csvApiError(error);
  }
};
