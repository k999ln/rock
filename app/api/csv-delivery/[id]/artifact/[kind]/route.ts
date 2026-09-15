import { csvApiError, csvBuyerArtifact, CsvJobError } from '@/lib/csv-job-store';

function token(request: Request) {
  const value = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match)
    throw new CsvJobError(404, 'DELIVERY_LINK', '共有リンクが無効か期限切れです。');
  return match[1];
}

export const GET = async (
  request: Request,
  context: { params: Promise<{ id: string; kind: string }> },
) => {
  try {
    const { id, kind } = await context.params;
    const artifact = await csvBuyerArtifact(id, token(request), kind);
    return new Response(artifact.object.body, {
      headers: {
        'Content-Type': artifact.type,
        'Content-Disposition': `attachment; filename="${artifact.name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    return csvApiError(error);
  }
};
