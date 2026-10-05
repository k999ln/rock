import { limitCsvRequest } from '@/lib/csv-request-limit';
import { requestUser } from '@/lib/request-auth';
import { env } from 'cloudflare:workers';
import { csvApiError, acceptCsvJob } from '@/lib/csv-job-store';
import { csvTrialPayments } from '@/lib/csv-trial-payment';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requestUser(request);
    await limitCsvRequest(
      (env as unknown as { DB: D1Database }).DB,
      user,
      'payment',
    );
    const { id } = await context.params;
    const input = (await request.json()) as { action?: string };
    if (input.action === 'confirm')
      return Response.json(
        { job: await csvTrialPayments(env, acceptCsvJob).confirm(user, id) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    if (input.action !== 'checkout')
      return Response.json(
        { error: '操作を確認できません。' },
        { status: 400 },
      );
    return Response.json(
      await csvTrialPayments(env, acceptCsvJob).start(user, id),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return csvApiError(error);
  }
}
