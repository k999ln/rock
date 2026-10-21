import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { readWorkJob } from '@/lib/work-job-view';
import { WorkError, workId } from '@/lib/workflow';

const downloadHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; sandbox",
};

function safeContentDisposition(
  nodeId: string,
  revision: number,
  kind: 'text' | 'csv',
) {
  // Only bounded validated identifiers and ASCII constants enter this header.
  // Never use customer manuscript, purpose, owner identity or a user filename.
  return `attachment; filename="zema-step-${nodeId}-r${revision}.${kind === 'csv' ? 'csv' : 'txt'}"`;
}

export async function GET(request: Request) {
  try {
    const user = await requestUser(request);
    const url = new URL(request.url);
    if (
      url.search.length > 300 ||
      [...url.searchParams.keys()].some(
        (key) => !['jobId', 'nodeId', 'revision'].includes(key),
      ) ||
      ['jobId', 'nodeId', 'revision'].some(
        (key) => url.searchParams.getAll(key).length !== 1,
      )
    )
      throw new WorkError('成果の取得先を確認してください。');
    const id = workId(url.searchParams.get('jobId'));
    const nodeId = url.searchParams.get('nodeId')!;
    const rawRevision = url.searchParams.get('revision')!;
    if (
      !/^s[0-9]{1,8}$/.test(nodeId) ||
      !/^(?:0|[1-9][0-9]{0,15})$/.test(rawRevision) ||
      !Number.isSafeInteger(Number(rawRevision))
    )
      throw new WorkError('手順と表示中の版を確認してください。');
    const revision = Number(rawRevision);
    const stored = await workStore(database()).get(user, id);
    if (
      !stored?.composition ||
      stored.composition.materialCleared ||
      !stored.composition.artifacts[nodeId]
    )
      throw new WorkError(
        '保存した成果が見つかりません。削除や接続状態を確認してください。',
        404,
      );
    const job = readWorkJob(stored);
    if (job.revision !== revision)
      throw new WorkError(
        '成果の版が更新されました。仕事を再読込してから取得してください。',
        409,
      );
    const artifact = job.composition!.artifacts[nodeId];
    // Server-normalized/read-validated artifacts contain plain text only. Download
    // both passed and needs-review output without conferring acceptance evidence.
    return new Response(new TextEncoder().encode(artifact.text), {
      headers: {
        ...downloadHeaders,
        'Content-Type':
          artifact.kind === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'text/plain; charset=utf-8',
        'Content-Disposition': safeContentDisposition(
          nodeId,
          revision,
          artifact.kind,
        ),
      },
    });
  } catch (error) {
    const status =
      error instanceof WorkError
        ? error.status
        : error instanceof Error && error.message === 'UNAUTHORIZED'
          ? 401
          : error instanceof Error && error.message === 'ORIGIN'
            ? 403
            : 503;
    const message =
      error instanceof WorkError
        ? error.message
        : status === 401
          ? 'サインインすると保存した成果を取得できます。'
          : '成果を取得できません。接続と仕事の保存状態を確認してください。';
    return Response.json(
      { error: message },
      { status, headers: downloadHeaders },
    );
  }
}
