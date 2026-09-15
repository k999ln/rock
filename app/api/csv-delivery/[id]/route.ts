import {
  actOnCsvBuyerDelivery,
  csvApiError,
  csvBuyerDelivery,
  CsvJobError,
} from '@/lib/csv-job-store';

function token(request: Request) {
  const value = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match)
    throw new CsvJobError(404, 'DELIVERY_LINK', '共有リンクが無効か期限切れです。');
  return match[1];
}

function sameOrigin(request: Request) {
  if (request.method === 'GET') return;
  if (request.headers.get('origin') !== new URL(request.url).origin)
    throw new CsvJobError(403, 'ORIGIN', 'このサイトから操作してください。');
}

export const GET = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await context.params;
    return Response.json(
      await csvBuyerDelivery(id, token(request)),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return csvApiError(error);
  }
};

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  try {
    sameOrigin(request);
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 16 * 1024)
      throw new CsvJobError(413, 'TOO_LARGE', '依頼内容が大きすぎます。');
    const { id } = await context.params;
    const input = (await request.json()) as {
      action?: string;
      revision?: number;
      reason?: unknown;
    };
    if (input.action !== 'approve' && input.action !== 'revision')
      throw new CsvJobError(400, 'DELIVERY_ACTION', '操作内容が不正です。');
    const job = await actOnCsvBuyerDelivery(id, token(request), {
      action: input.action,
      revision: Number(input.revision),
      reason: input.reason,
    });
    return Response.json({ job }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return csvApiError(error);
  }
};
