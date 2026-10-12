import { rejectChangedOwner } from '@/lib/owner-intent';
import { requestUser } from '@/lib/request-auth';
import { createCsvSampleJob, csvApiError } from '@/lib/csv-job-store';

export const POST = async (request: Request) => {
  try {
    const user = await requestUser(request);
    const mismatch = await rejectChangedOwner(request, user);
    if (mismatch) return mismatch;
    const job = await createCsvSampleJob(user);
    return Response.json(
      { job },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return csvApiError(error);
  }
};
