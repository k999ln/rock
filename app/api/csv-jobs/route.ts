import { limitCsvRequest } from '@/lib/csv-request-limit';
import { env } from 'cloudflare:workers';
import { csvTrialPayments } from '@/lib/csv-trial-payment';
import { requestUser } from '@/lib/request-auth';
import {
  createCsvJob,
  acceptCsvJob,
  csvApiError,
  CsvJobError,
  listCsvJobs,
} from '@/lib/csv-job-store';
import { CSV_LIMITS } from '@/lib/csv-transform';

export const GET = async (request: Request) => {
  try {
    const user = await requestUser(request);
    return Response.json(
      {
        jobs: await listCsvJobs(user),
        retentionDays: 7,
        trialPayment: csvTrialPayments(env, acceptCsvJob).availability(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return csvApiError(error);
  }
};

export const POST = async (request: Request) => {
  try {
    const user = await requestUser(request);
    await limitCsvRequest(
      (env as unknown as { DB: D1Database }).DB,
      user,
      'quote',
    );
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > CSV_LIMITS.bytes + 64 * 1024)
      throw new CsvJobError(413, 'TOO_LARGE', 'CSVは10MB以下にしてください。');
    const form = await request.formData();
    const file = form.get('file');
    const rawId = form.get('id');
    const id = typeof rawId === 'string' ? rawId : '';
    const trial = form.get('trial') === 'true';
    const sample = form.get('sample') === 'true';
    const rawSpecification = form.get('specification');
    const specification =
      typeof rawSpecification === 'string' ? rawSpecification : '';
    if (!(file instanceof File))
      throw new CsvJobError(400, 'FILE', 'CSVファイルを選んでください。');
    if (file.size > CSV_LIMITS.bytes)
      throw new CsvJobError(413, 'TOO_LARGE', 'CSVは10MB以下にしてください。');
    if (!/\.csv$/i.test(file.name))
      throw new CsvJobError(
        400,
        'FILE',
        '拡張子が.csvのファイルを選んでください。',
      );
    const job = await createCsvJob(user, {
      id,
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      specification,
      sample,
      trial,
    });
    return Response.json(
      { job },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return csvApiError(error);
  }
};
