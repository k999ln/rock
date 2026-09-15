import { requestUser } from '@/lib/request-auth';
import { csvApiError, csvArtifact } from '@/lib/csv-job-store';

export const GET = async (
  request: Request,
  context: { params: Promise<{ id: string; kind: string }> },
) => {
  try {
    const user = await requestUser(request);
    const { id, kind } = await context.params;
    const artifact = await csvArtifact(user, id, kind);
    return new Response(artifact.object.body, {
      headers: {
        'Content-Type': artifact.type,
        'Content-Disposition': `attachment; filename="${artifact.name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    return csvApiError(error);
  }
};
