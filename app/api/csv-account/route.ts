import { ownerScopeFor, rejectChangedOwner } from '@/lib/owner-intent';
import { requestUser } from '@/lib/request-auth';
import { csvApiError, CsvJobError } from '@/lib/csv-job-store';
import {
  cancelCsvBillingAccount,
  csvBillingAccountSnapshot,
} from '@/lib/csv-operations-store';

export const GET = async (request: Request) => {
  try {
    const user = await requestUser(request);
    return Response.json({ ...await csvBillingAccountSnapshot(user), ownerScope: await ownerScopeFor(user) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return csvApiError(error);
  }
};

export const POST = async (request: Request) => {
  try {
    const user = await requestUser(request);
    const mismatch = await rejectChangedOwner(request, user);
    if (mismatch) return mismatch;
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 4 * 1024)
      throw new CsvJobError(413, 'TOO_LARGE', '操作内容が大きすぎます。');
    const input = (await request.json()) as Record<string, unknown>;
    if (input.action !== 'cancel_next_month')
      throw new CsvJobError(400, 'ACCOUNT_ACTION', 'アカウント操作が不正です。');
    const result = await cancelCsvBillingAccount(user, input.idempotencyKey);
    return Response.json({ result, ownerScope: await ownerScopeFor(user) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return csvApiError(error);
  }
};
