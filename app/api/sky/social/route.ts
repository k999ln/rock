import { communityKeysHeader } from '@/lib/community-access';
import { database, requestUser } from '@/lib/fund-store';
import { body, json } from '@/lib/operations-api';
import { OperationError } from '@/lib/operations';
import { SkySocialError } from '@/lib/sky-social';
import { skySocialStore } from '@/lib/sky-social-store';
function failure(error: unknown) {
  if (error instanceof SkySocialError || error instanceof OperationError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'アカウントでサインインしてください。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'この画面から操作してください。' }, 403);
  return json(
    {
      error: 'コミュニティーを読み込めません。時間を置いて再試行してください。',
    },
    503,
  );
}
export async function GET(request: Request) {
  try {
    const user = await requestUser(request),
      url = new URL(request.url);
    return json(
      await skySocialStore(
        database(),
        user,
        communityKeysHeader(request),
      ).state(
        url.searchParams.get('mode') ?? 'recommended',
        url.searchParams.get('community') ?? '',
        url.searchParams.get('cursor') ?? '',
        url.searchParams.get('thread') ?? '',
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      throw new Error('ORIGIN');
    const user = await requestUser(request);
    return json(
      await skySocialStore(
        database(),
        user,
        communityKeysHeader(request),
      ).mutate(await body(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
